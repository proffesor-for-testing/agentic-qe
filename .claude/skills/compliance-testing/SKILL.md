---
name: compliance-testing
description: Regulatory compliance testing for GDPR, CCPA, HIPAA, SOC2, PCI-DSS and industry-specific regulations. Use when ensuring legal compliance, preparing for audits, or handling sensitive data.
version: 1.0.0
category: specialized-testing
tags: [compliance, gdpr, ccpa, hipaa, soc2, pci-dss, regulatory, audit]
difficulty: advanced
estimated_time: 90 minutes
author: agentic-qe
---

# Compliance Testing

## Core Principle

**Non-compliance = fines, lawsuits, reputation damage.**

Compliance testing validates software meets legal and regulatory requirements. Critical for avoiding penalties and protecting users.

## GDPR Compliance Testing

**Key Requirements:**
- Right to access
- Right to erasure ("right to be forgotten")
- Data portability
- Consent management
- Breach notification

**Test data subject rights:**
```javascript
test('user can request their data', async () => {
  const userId = 'user123';

  // User requests data export
  const response = await api.post('/data-export', { userId });

  // Should receive download link
  expect(response.status).toBe(200);
  expect(response.data.downloadUrl).toBeDefined();

  // Download contains all user data
  const data = await downloadFile(response.data.downloadUrl);
  expect(data).toHaveProperty('profile');
  expect(data).toHaveProperty('orders');
  expect(data).toHaveProperty('preferences');
});

test('user can delete their account', async () => {
  const userId = 'user123';

  // User requests deletion
  await api.delete(`/users/${userId}`);

  // All personal data deleted
  expect(await db.users.findOne({ id: userId })).toBeNull();
  expect(await db.orders.find({ userId })).toHaveLength(0);

  // Audit log retained (legal requirement)
  const auditLog = await db.auditLogs.find({ userId });
  expect(auditLog).toBeDefined();
});

test('consent is tracked', async () => {
  await api.post('/consent', {
    userId: 'user123',
    type: 'marketing',
    granted: true,
    timestamp: new Date(),
    ipAddress: '192.168.1.1'
  });

  const consent = await db.consents.findOne({
    userId: 'user123',
    type: 'marketing'
  });

  expect(consent.granted).toBe(true);
  expect(consent.timestamp).toBeDefined();
  expect(consent.ipAddress).toBe('192.168.1.1');
});
```

## HIPAA Compliance (Healthcare)

**Test PHI (Protected Health Information) security:**
```javascript
test('PHI is encrypted at rest', async () => {
  const patient = await db.patients.create({
    ssn: '123-45-6789',
    medicalHistory: 'Diabetes, Hypertension'
  });

  // Verify encrypted in database
  const raw = await db.raw('SELECT * FROM patients WHERE id = ?', patient.id);
  expect(raw.ssn).not.toBe('123-45-6789'); // Should be encrypted
  expect(raw.ssn).toMatch(/^[a-f0-9]{64}$/); // Looks like hash
});

test('access to PHI is logged', async () => {
  await api.get('/patients/123', {
    headers: { 'User-Id': 'doctor456' }
  });

  const auditLog = await db.auditLogs.findOne({
    resourceType: 'patient',
    resourceId: '123',
    userId: 'doctor456'
  });

  expect(auditLog.action).toBe('read');
  expect(auditLog.timestamp).toBeDefined();
});
```

## PCI-DSS (Payment Card Industry)

**Test credit card handling:**
```javascript
test('credit card numbers not stored', async () => {
  await api.post('/payment', {
    cardNumber: '4242424242424242',
    expiry: '12/25',
    cvv: '123'
  });

  // Card number should NOT be in database
  const payment = await db.payments.findOne({ /* ... */ });
  expect(payment.cardNumber).toBeUndefined();
  expect(payment.last4).toBe('4242'); // Only last 4 digits OK
  expect(payment.tokenId).toBeDefined(); // Token from gateway
});

test('CVV never stored', async () => {
  // CVV should never touch database
  const payments = await db.raw('SELECT * FROM payments');
  const hasCV = payments.some(p =>
    JSON.stringify(p).includes('cvv') ||
    JSON.stringify(p).includes('cvc')
  );

  expect(hasCVV).toBe(false);
});
```

## Related Skills

- [security-testing](../security-testing/)
- [test-data-management](../test-data-management/)
- [accessibility-testing](../accessibility-testing/)

## Remember

**Compliance is mandatory, not optional.**

Fines:
- GDPR: Up to €20M or 4% of revenue
- HIPAA: Up to $1.5M per violation
- PCI-DSS: Up to $100k per month

**Test continuously, audit trail everything.**

**With Agents:** Agents validate compliance requirements, detect violations, and generate audit reports automatically.
