/**
 * API Tester Mock — REST + SOAP gateway that validates and forwards to OMNI
 * Port: 3002
 *
 * Endpoints:
 *   GET  /api/products          — Product catalog (REST)
 *   POST /api/orders            — Create order (REST)
 *   GET  /api/wsdl              — WSDL service definition
 *   POST /api/soap/validate     — SOAP order validation endpoint
 */

import { BaseMockService } from './base-mock-service.js';

// ── WSDL Definition ──────────────────────────────────────────────────────

const WSDL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions
  xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://adidas.com/otc/order-validation"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://adidas.com/otc/order-validation"
  name="OrderValidationService">

  <!-- Types -->
  <types>
    <xsd:schema targetNamespace="http://adidas.com/otc/order-validation">
      <xsd:element name="ValidateOrderRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="customer" type="tns:CustomerType"/>
            <xsd:element name="items" type="tns:ItemListType"/>
            <xsd:element name="shippingAddress" type="xsd:string" minOccurs="0"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>

      <xsd:element name="ValidateOrderResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="valid" type="xsd:boolean"/>
            <xsd:element name="orderId" type="xsd:string" minOccurs="0"/>
            <xsd:element name="errors" type="tns:ErrorListType" minOccurs="0"/>
            <xsd:element name="validatedAt" type="xsd:dateTime"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>

      <xsd:complexType name="CustomerType">
        <xsd:sequence>
          <xsd:element name="email" type="xsd:string"/>
          <xsd:element name="name" type="xsd:string"/>
          <xsd:element name="customerId" type="xsd:string" minOccurs="0"/>
        </xsd:sequence>
      </xsd:complexType>

      <xsd:complexType name="ItemType">
        <xsd:sequence>
          <xsd:element name="productId" type="xsd:string"/>
          <xsd:element name="quantity" type="xsd:positiveInteger"/>
          <xsd:element name="unitPrice" type="xsd:decimal" minOccurs="0"/>
        </xsd:sequence>
      </xsd:complexType>

      <xsd:complexType name="ItemListType">
        <xsd:sequence>
          <xsd:element name="item" type="tns:ItemType" maxOccurs="unbounded"/>
        </xsd:sequence>
      </xsd:complexType>

      <xsd:complexType name="ErrorListType">
        <xsd:sequence>
          <xsd:element name="error" type="xsd:string" maxOccurs="unbounded"/>
        </xsd:sequence>
      </xsd:complexType>
    </xsd:schema>
  </types>

  <!-- Messages -->
  <message name="ValidateOrderInput">
    <part name="parameters" element="tns:ValidateOrderRequest"/>
  </message>
  <message name="ValidateOrderOutput">
    <part name="parameters" element="tns:ValidateOrderResponse"/>
  </message>

  <!-- Port Type -->
  <portType name="OrderValidationPortType">
    <operation name="ValidateOrder">
      <input message="tns:ValidateOrderInput"/>
      <output message="tns:ValidateOrderOutput"/>
    </operation>
  </portType>

  <!-- Binding -->
  <binding name="OrderValidationBinding" type="tns:OrderValidationPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="ValidateOrder">
      <soap:operation soapAction="http://adidas.com/otc/ValidateOrder"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <!-- Service -->
  <service name="OrderValidationService">
    <port name="OrderValidationPort" binding="tns:OrderValidationBinding">
      <soap:address location="http://localhost:3002/api/soap/validate"/>
    </port>
  </service>
</definitions>`;

// ── SOAP Helpers ─────────────────────────────────────────────────────────

function extractSoapBody(xml: string): string | null {
  // Extract content between <soap:Body> or <Body> tags
  const bodyMatch = xml.match(/<(?:soap:|soapenv:|)Body[^>]*>([\s\S]*?)<\/(?:soap:|soapenv:|)Body>/i);
  return bodyMatch ? bodyMatch[1].trim() : null;
}

function extractXmlValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<(?:[\\w:]*:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w:]*:)?${tag}>`, 'i'));
  return match ? match[1].trim() : null;
}

function extractItems(xml: string): Array<{ productId: string; quantity: number }> {
  const items: Array<{ productId: string; quantity: number }> = [];
  const itemRegex = /<(?:[\w:]*:)?item[^>]*>([\s\S]*?)<\/(?:[\w:]*:)?item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const productId = extractXmlValue(content, 'productId') || '';
    const quantity = parseInt(extractXmlValue(content, 'quantity') || '1', 10);
    items.push({ productId, quantity });
  }
  return items;
}

function buildSoapResponse(valid: boolean, orderId: string | null, errors: string[]): string {
  const errorsXml = errors.length > 0
    ? `<errors>${errors.map(e => `<error>${escapeXml(e)}</error>`).join('')}</errors>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:tns="http://adidas.com/otc/order-validation">
  <soap:Header>
    <tns:ServiceInfo>
      <tns:ServiceName>OrderValidationService</tns:ServiceName>
      <tns:Timestamp>${new Date().toISOString()}</tns:Timestamp>
    </tns:ServiceInfo>
  </soap:Header>
  <soap:Body>
    <tns:ValidateOrderResponse>
      <valid>${valid}</valid>${orderId ? `\n      <orderId>${escapeXml(orderId)}</orderId>` : ''}${errorsXml ? `\n      ${errorsXml}` : ''}
      <validatedAt>${new Date().toISOString()}</validatedAt>
    </tns:ValidateOrderResponse>
  </soap:Body>
</soap:Envelope>`;
}

function buildSoapFault(code: string, message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:${escapeXml(code)}</faultcode>
      <faultstring>${escapeXml(message)}</faultstring>
      <detail>
        <service>api-tester</service>
        <timestamp>${new Date().toISOString()}</timestamp>
      </detail>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Service Factory ──────────────────────────────────────────────────────

export function createApiTesterService(): BaseMockService {
  const service = new BaseMockService({ name: 'api-tester', port: 3002 });

  // ── REST: Product catalog ──────────────────────────────────────────
  service.route('GET', '/api/products', (_req, res) => {
    service['json'](res, {
      products: [
        { id: 'ULTRA-23', name: 'Ultraboost 23', price: 180, currency: 'EUR', category: 'Running' },
        { id: 'JERSEY-H', name: 'Home Jersey 2025', price: 90, currency: 'EUR', category: 'Football' },
        { id: 'BAG-DFL', name: 'Duffle Bag', price: 65, currency: 'EUR', category: 'Accessories' },
      ],
    });
  });

  // ── REST: Create order ─────────────────────────────────────────────
  service.route('POST', '/api/orders', async (_req, res, body) => {
    const order = body as Record<string, unknown> | null;

    if (!order?.customer || !order?.items) {
      service['json'](res, {
        error: 'Validation failed',
        details: 'customer and items are required',
      }, 400);
      return;
    }

    console.log('  [API Tester] Order validated, forwarding to OMNI...');

    try {
      const response = await fetch('http://localhost:3003/omni/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `ORD-${Date.now().toString(36)}`,
          ...order,
          validatedAt: new Date().toISOString(),
          validatedBy: 'api-tester',
        }),
      });
      const data = await response.json();
      service['json'](res, data, response.status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [API Tester] OMNI call failed: ${message}`);
      service['json'](res, {
        error: 'Orchestration service unavailable',
        service: 'omni',
        details: message,
      }, 502);
    }
  });

  // ── SOAP: WSDL definition ─────────────────────────────────────────
  service.route('GET', '/api/wsdl', (_req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(WSDL_XML);
    console.log('  [API Tester] WSDL served');
  });

  // ── SOAP: Validate Order ──────────────────────────────────────────
  service.route('POST', '/api/soap/validate', async (_req, res, body) => {
    const xml = typeof body === 'string' ? body : '';

    // Must be a SOAP envelope
    if (!xml.includes('Envelope')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(buildSoapFault('Client', 'Request must be a SOAP envelope'));
      return;
    }

    const soapBody = extractSoapBody(xml);
    if (!soapBody) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(buildSoapFault('Client', 'Missing or malformed SOAP Body'));
      return;
    }

    // Extract fields from SOAP body
    const errors: string[] = [];
    const customerBlock = extractXmlValue(soapBody, 'customer');
    const email = customerBlock ? extractXmlValue(customerBlock, 'email') : null;
    const name = customerBlock ? extractXmlValue(customerBlock, 'name') : null;
    const items = extractItems(soapBody);

    // Validate
    if (!customerBlock) errors.push('Missing <customer> element');
    if (customerBlock && !email) errors.push('Missing <email> in customer');
    if (customerBlock && !name) errors.push('Missing <name> in customer');
    if (items.length === 0) errors.push('No <item> elements found in <items>');

    const validProducts = ['ULTRA-23', 'JERSEY-H', 'BAG-DFL'];
    for (const item of items) {
      if (!validProducts.includes(item.productId)) {
        errors.push(`Unknown product: ${item.productId}`);
      }
      if (item.quantity < 1) {
        errors.push(`Invalid quantity for ${item.productId}: ${item.quantity}`);
      }
    }

    const valid = errors.length === 0;
    const orderId = valid ? `ORD-${Date.now().toString(36)}` : null;

    console.log(`  [API Tester] SOAP ValidateOrder: ${valid ? 'VALID' : 'INVALID'} (${errors.length} errors)`);

    // If valid, optionally forward to OMNI (same as REST path)
    if (valid && orderId) {
      try {
        await fetch('http://localhost:3003/omni/orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            customer: { email, name },
            items,
            validatedAt: new Date().toISOString(),
            validatedBy: 'api-tester-soap',
          }),
        });
      } catch {
        // SOAP validation still succeeds even if OMNI is down
        console.log('  [API Tester] SOAP: OMNI forwarding failed (non-blocking)');
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(buildSoapResponse(valid, orderId, errors));
  });

  return service;
}

if (process.argv[1]?.endsWith('api-tester.ts') || process.argv[1]?.endsWith('api-tester.js')) {
  createApiTesterService().start();
}
