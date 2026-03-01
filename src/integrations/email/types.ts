/**
 * Agentic QE v3 - Email Provider Types
 * Types for email retrieval and field extraction.
 * Supports IMAP and MS Graph backends.
 */

export interface EmailFilter {
  to?: string;
  subject?: string;
  since?: Date;
  orderId?: string;
  maxResults?: number;
}

export interface Email {
  from: string;
  to: string;
  subject: string;
  body: string;
  date: Date;
  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface EmailProvider {
  getEmails(filter: EmailFilter): Promise<Email[]>;
  healthCheck(): Promise<boolean>;
  disconnect(): Promise<void>;
}

export interface ImapEmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls?: boolean;
  mailbox?: string;
}

export interface MsGraphEmailConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  userEmail: string;
}

export type EmailConfig =
  | { provider: 'imap'; config: ImapEmailConfig }
  | { provider: 'msgraph'; config: MsGraphEmailConfig };
