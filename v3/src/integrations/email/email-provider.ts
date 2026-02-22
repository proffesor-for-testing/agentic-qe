/**
 * Agentic QE v3 - Email Provider
 * Retrieves and parses emails for verification checks.
 *
 * Supports two backends:
 * - IMAP (via imapflow) — for direct mailbox access
 * - MS Graph (via @microsoft/microsoft-graph-client) — for O365/Azure AD
 *
 * Both are dynamically imported (optional dependencies).
 *
 * Requires: npm install imapflow (for IMAP) or
 *           npm install @microsoft/microsoft-graph-client @azure/identity (for MS Graph)
 */

import type {
  EmailProvider,
  EmailFilter,
  Email,
  ImapEmailConfig,
  MsGraphEmailConfig,
  EmailConfig,
} from './types';

// ============================================================================
// Body Extraction Helpers
// ============================================================================

/**
 * Extract readable body text from raw RFC822 email source.
 * IMAP returns the full message source including headers, MIME boundaries,
 * and encoded parts. This decodes transfer encodings (base64, quoted-printable)
 * and strips HTML/headers down to human-readable text.
 */
function extractBodyFromRfc822(raw: string): string {
  if (!raw) return '';

  // Split headers from body at the first blank line (\r\n\r\n or \n\n)
  const crlfSplit = raw.indexOf('\r\n\r\n');
  const lfSplit = raw.indexOf('\n\n');
  const headerBodySplit = crlfSplit >= 0 ? crlfSplit : lfSplit;
  const headerEndLen = crlfSplit >= 0 ? 4 : 2;
  const bodyStart = headerBodySplit >= 0 ? headerBodySplit + headerEndLen : 0;
  const rawBody = raw.slice(bodyStart);

  // Extract MIME parts and decode each one
  const decoded = decodeMimeParts(rawBody, raw.slice(0, headerBodySplit >= 0 ? headerBodySplit : 0));

  // Strip HTML tags if present
  let body = stripHtml(decoded);

  // Decode common HTML entities
  body = decodeHtmlEntities(body);

  // Collapse whitespace
  body = body.replace(/[\r\n]{3,}/g, '\n\n').trim();

  return body;
}

/**
 * Decode MIME parts, handling Content-Transfer-Encoding (base64, quoted-printable).
 * For multipart messages, extracts and decodes each part.
 * For simple messages, decodes the single body.
 */
function decodeMimeParts(rawBody: string, headers: string): string {
  // Check if multipart — extract boundary from headers
  const boundaryMatch = headers.match(/boundary=["']?([^\s"';]+)/i);

  if (boundaryMatch) {
    // Multipart: split on boundary, decode each part
    const boundary = boundaryMatch[1];
    const parts = rawBody.split(new RegExp(`--${escapeRegex(boundary)}`));
    const textParts: string[] = [];

    for (const part of parts) {
      if (part.trim() === '--' || part.trim() === '') continue; // closing boundary or empty

      // Split part headers from part body
      const partSplit = part.indexOf('\r\n\r\n');
      const partSplitLf = part.indexOf('\n\n');
      const splitPos = partSplit >= 0 ? partSplit : partSplitLf;
      const splitLen = partSplit >= 0 ? 4 : 2;

      if (splitPos < 0) continue;

      const partHeaders = part.slice(0, splitPos);
      const partBody = part.slice(splitPos + splitLen);

      // Skip non-text parts (images, attachments)
      if (/content-type:\s*(?:image|application|audio|video)\//i.test(partHeaders)) continue;

      // Recurse for nested multipart
      const nestedBoundary = partHeaders.match(/boundary=["']?([^\s"';]+)/i);
      if (nestedBoundary) {
        textParts.push(decodeMimeParts(partBody, partHeaders));
        continue;
      }

      textParts.push(decodeTransferEncoding(partBody, partHeaders));
    }

    return textParts.join('\n\n');
  }

  // Not multipart — decode the single body using top-level headers
  return decodeTransferEncoding(rawBody, headers);
}

/** Decode a single body chunk based on its Content-Transfer-Encoding header */
function decodeTransferEncoding(body: string, headers: string): string {
  const encodingMatch = headers.match(/content-transfer-encoding:\s*(\S+)/i);
  const encoding = encodingMatch?.[1]?.toLowerCase() ?? '7bit';

  if (encoding === 'base64') {
    try {
      // Strip whitespace from base64 content and decode
      const cleaned = body.replace(/\s/g, '');
      return Buffer.from(cleaned, 'base64').toString('utf-8');
    } catch {
      return body; // If decode fails, return raw
    }
  }

  if (encoding === 'quoted-printable') {
    return decodeQuotedPrintable(body);
  }

  // 7bit, 8bit, binary — return as-is (strip MIME artifacts)
  return body.replace(/^--[\w=+/.-]+.*$/gm, '')
    .replace(/^Content-[\w-]+:.*(?:\r?\n\s+.*)*$/gm, '');
}

/** Decode quoted-printable encoding: =XX hex pairs and soft line breaks */
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, '')  // Remove soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip HTML tags and return text content */
function stripHtml(html: string): string {
  // Remove <style> and <script> blocks entirely
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Replace <br>, <p>, <div>, <tr> with newlines for readability
  text = text.replace(/<(?:br|\/p|\/div|\/tr|\/li)[^>]*>/gi, '\n');
  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '');
  return text;
}

/** Decode common HTML entities */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

// ============================================================================
// IMAP Provider
// ============================================================================

class ImapEmailProvider implements EmailProvider {
  private readonly config: ImapEmailConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  constructor(config: ImapEmailConfig) {
    this.config = config;
  }

  async getEmails(filter: EmailFilter): Promise<Email[]> {
    await this.ensureConnected();

    const mailbox = this.config.mailbox ?? 'INBOX';
    const lock = await this.client.getMailboxLock(mailbox);

    try {
      // Build IMAP search criteria — search() returns matching UIDs
      const searchCriteria: Record<string, unknown> = {};
      if (filter.since) searchCriteria.since = filter.since;
      if (filter.subject) searchCriteria.subject = filter.subject;
      if (filter.to) searchCriteria.to = filter.to;

      // Step 1: Search for matching message UIDs
      const uids = await this.client.search(searchCriteria, { uid: true });
      if (!uids || uids.length === 0) return [];

      // Step 2: Fetch messages by UID (most recent first, limited)
      const maxResults = filter.maxResults ?? 20;
      const fetchUids = uids.slice(-maxResults).reverse();
      const messages: Email[] = [];

      for await (const msg of this.client.fetch(
        fetchUids,
        { source: true, envelope: true, uid: true },
      )) {
        const rawSource = msg.source?.toString() ?? '';
        const body = extractBodyFromRfc822(rawSource);
        const email: Email = {
          from: msg.envelope?.from?.[0]?.address ?? '',
          to: msg.envelope?.to?.[0]?.address ?? '',
          subject: msg.envelope?.subject ?? '',
          body,
          date: msg.envelope?.date ? new Date(msg.envelope.date) : new Date(),
          attachments: [],
        };

        // Filter by orderId in body if specified
        if (filter.orderId && !body.includes(filter.orderId)) continue;

        messages.push(email);
      }

      return messages;
    } finally {
      lock.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureConnected();
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try { await this.client.logout(); } catch { /* already closed */ }
      this.client = null;
    }
  }

  /**
   * Ensure IMAP client is connected. Reuses existing connection if alive.
   * On connection failure, resets client state so the next call retries cleanly.
   */
  private async ensureConnected(): Promise<void> {
    if (this.client) return;

    const ImapFlow = await this.loadImapFlow();
    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.tls ?? true,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
      logger: false,
    });

    try {
      await client.connect();
      this.client = client;
    } catch (e) {
      // Connection failed — don't leak a half-open client
      try { await client.logout(); } catch { /* ignore */ }
      throw e;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadImapFlow(): Promise<any> {
    try {
      const mod = await import('imapflow');
      return mod.ImapFlow ?? (mod as { default: unknown }).default;
    } catch {
      throw new Error(
        'imapflow package not installed. Run: npm install imapflow'
      );
    }
  }
}

// ============================================================================
// MS Graph Provider (stub — structure ready, auth flow needs MS libs)
// ============================================================================

class MsGraphEmailProvider implements EmailProvider {
  private readonly config: MsGraphEmailConfig;

  constructor(config: MsGraphEmailConfig) {
    this.config = config;
  }

  async getEmails(filter: EmailFilter): Promise<Email[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let graphClient: any;
    try {
      const { Client } = await import('@microsoft/microsoft-graph-client');
      const { ClientSecretCredential } = await import('@azure/identity');
      const { TokenCredentialAuthenticationProvider } = await import(
        '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
      );

      const credential = new ClientSecretCredential(
        this.config.tenantId,
        this.config.clientId,
        this.config.clientSecret,
      );
      const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });
      graphClient = Client.initWithMiddleware({ authProvider });
    } catch {
      throw new Error(
        'MS Graph packages not installed. Run: npm install @microsoft/microsoft-graph-client @azure/identity'
      );
    }

    let query = `/users/${this.config.userEmail}/messages?$top=${filter.maxResults ?? 20}&$orderby=receivedDateTime desc`;

    const filters: string[] = [];
    if (filter.subject) {
      // Escape single quotes in OData string literals to prevent query breakage
      const safeSubject = filter.subject.replace(/'/g, "''");
      filters.push(`contains(subject,'${safeSubject}')`);
    }
    if (filter.since) filters.push(`receivedDateTime ge ${filter.since.toISOString()}`);
    if (filters.length > 0) query += `&$filter=${filters.join(' and ')}`;

    const response = await graphClient.api(query).get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emails: Email[] = (response.value ?? []).map((msg: any) => ({
      from: msg.from?.emailAddress?.address ?? '',
      to: msg.toRecipients?.[0]?.emailAddress?.address ?? '',
      subject: msg.subject ?? '',
      body: stripHtml(msg.body?.content ?? ''),
      date: new Date(msg.receivedDateTime),
      attachments: [],
    }));

    if (filter.orderId) {
      return emails.filter(e => e.body.includes(filter.orderId!) || e.subject.includes(filter.orderId!));
    }

    return emails;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getEmails({ maxResults: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    // MS Graph is stateless HTTP — no persistent connection
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createEmailProvider(emailConfig: EmailConfig): EmailProvider {
  switch (emailConfig.provider) {
    case 'imap':
      return new ImapEmailProvider(emailConfig.config);
    case 'msgraph':
      return new MsGraphEmailProvider(emailConfig.config);
    default:
      throw new Error(`Unknown email provider: ${(emailConfig as { provider: string }).provider}`);
  }
}
