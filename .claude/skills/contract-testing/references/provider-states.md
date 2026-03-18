# Provider States Reference

Provider states define the preconditions that must exist on the provider for a contract interaction to succeed.

## Pattern: State Setup
```javascript
// provider-states.js
const states = {
  'a user exists': async () => {
    await db.users.create({ id: 1, name: 'Test User', email: 'test@example.com' });
  },
  'no users exist': async () => {
    await db.users.deleteAll();
  },
  'user 1 has 3 orders': async () => {
    await db.users.create({ id: 1, name: 'Test User' });
    await db.orders.bulkCreate([
      { userId: 1, status: 'shipped' },
      { userId: 1, status: 'pending' },
      { userId: 1, status: 'delivered' }
    ]);
  }
};
```

## Common Mistakes
1. **State not cleaned up** — use transactions or truncate after each test
2. **Hardcoded IDs** — use factories or fixtures that generate consistent IDs
3. **Missing state** — provider test passes without state setup (no data = no error)
4. **Overly specific states** — "user John with email john@..." couples to consumer

## Pact Broker Webhook Setup
```bash
# Verify provider when consumer publishes new contract
curl -X POST ${PACT_BROKER_URL}/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{ "name": "contract_content_changed" }],
    "request": {
      "method": "POST",
      "url": "${CI_TRIGGER_URL}",
      "body": { "pact_url": "${pactbroker.pactUrl}" }
    }
  }'
```
