---
name: test-data-management
description: Strategic test data generation, management, and privacy compliance. Use when creating test data, handling PII, ensuring GDPR/CCPA compliance, or scaling data generation for realistic testing scenarios.
version: 1.0.0
category: testing-infrastructure
tags:
  - test-data
  - data-generation
  - data-privacy
  - gdpr-compliance
  - synthetic-data
  - data-masking
  - test-fixtures
difficulty: intermediate
estimated_time: 60-90 minutes
author: agentic-qe
---

# Test Data Management

## Core Principle

**Test data is the fuel for testing. Poor data = poor tests.**

78% of QE teams cite test data as their #1 bottleneck. Good test data management enables fast, reliable, compliant testing at scale.

## What is Test Data Management?

**Test Data Management:** Strategic creation, maintenance, and lifecycle management of data needed for testing, while ensuring privacy compliance and realistic scenarios.

**Why Critical:**
- 40% of test failures caused by inadequate test data
- GDPR/CCPA fines up to $20M or 4% of revenue
- Production data contains PII (illegal to use directly)
- AI/ML systems need massive, diverse datasets
- Manual data creation doesn't scale

**Goal:** Fast, realistic, compliant, scalable test data generation.

## Test Data Strategies

### Strategy 1: Minimal vs Realistic Data

**Minimal Data (Fast Tests)**
```javascript
// Just enough to test logic
const user = {
  id: 1,
  email: 'test@example.com',
  role: 'customer'
};

// Benefits:
// - Fast test execution
// - Easy to understand
// - Deterministic
// - No cleanup needed

// Use when:
// - Unit tests
// - Logic validation
// - Fast feedback needed
```

**Realistic Data (Production-Like)**
```javascript
// Production-like complexity
const user = {
  id: '7f3a9c2e-4b1d-4e8a-9f2c-6d5e8a1b3c4d',
  email: 'sarah.johnson@techcorp.com',
  firstName: 'Sarah',
  lastName: 'Johnson',
  phone: '+1-555-0123',
  address: {
    street: '742 Evergreen Terrace',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    country: 'US'
  },
  preferences: {
    newsletter: true,
    language: 'en-US',
    timezone: 'America/Chicago'
  },
  createdAt: '2025-01-15T10:30:00Z',
  lastLogin: '2025-10-24T14:22:15Z'
};

// Benefits:
// - Catches edge cases
// - Tests real-world scenarios
// - Validates integrations
// - Performance realistic

// Use when:
// - Integration tests
// - E2E tests
// - Performance tests
// - Production validation
```

**Hybrid Approach (Best Practice)**
```javascript
// Minimal for fast tests, realistic for critical paths
describe('User Service', () => {
  // Unit test: minimal data
  test('validates email format', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });

  // Integration test: realistic data
  test('creates user with full profile', async () => {
    const user = generateRealisticUser(); // Full data
    const result = await userService.create(user);
    expect(result.profile.address.country).toBe('US');
  });
});
```

---

### Strategy 2: Shared vs Isolated Data

**Shared Data (Read-Only)**
```javascript
// Seed database once, many tests use it
beforeAll(async () => {
  await db.seed({
    users: [
      { id: 1, email: 'admin@example.com', role: 'admin' },
      { id: 2, email: 'user@example.com', role: 'customer' }
    ],
    products: [
      { id: 1, name: 'Widget', price: 9.99 },
      { id: 2, name: 'Gadget', price: 19.99 }
    ]
  });
});

// Tests can read but not modify
test('admin can list all products', async () => {
  const admin = await db.users.find({ id: 1 });
  const products = await productService.list(admin);
  expect(products.length).toBeGreaterThan(0);
});

// Benefits:
// - Fast (no setup per test)
// - Can run tests in parallel
// - Low resource usage

// Risks:
// - Tests must not modify data
// - Harder to debug (shared state)
```

**Isolated Data (Per-Test)**
```javascript
// Each test gets its own data
test('user can update profile', async () => {
  // Generate unique data for this test
  const user = await createTestUser({
    email: `test-${Date.now()}@example.com`
  });

  await userService.updateProfile(user.id, { firstName: 'Updated' });

  const updated = await db.users.find({ id: user.id });
  expect(updated.firstName).toBe('Updated');

  // Cleanup
  await db.users.delete({ id: user.id });
});

// Benefits:
// - Tests independent
// - Can modify data freely
// - Easy to debug
// - No test pollution

// Costs:
// - Slower (setup per test)
// - More resource usage
// - Cleanup needed
```

**Database Transactions (Best of Both)**
```javascript
// Use transactions for isolation without cleanup
beforeEach(async () => {
  await db.beginTransaction();
});

afterEach(async () => {
  await db.rollbackTransaction(); // Auto cleanup!
});

test('user registration', async () => {
  // Data exists only in this transaction
  const user = await userService.register({
    email: 'test@example.com'
  });

  expect(user.id).toBeDefined();
  // Automatic rollback after test
});

// Benefits:
// - Isolated (transaction boundary)
// - Fast (no manual cleanup)
// - Reliable (guaranteed cleanup)
```

---

### Strategy 3: Production Data vs Synthetic Data

**❌ Production Data (DANGER!)**
```javascript
// NEVER do this:
const prodDb = connectTo('production://...');
const users = await prodDb.users.findAll(); // ⚠️ PII exposure!

// Problems:
// - Contains real PII (GDPR/CCPA violation)
// - Can modify production data accidentally
// - Performance impact on prod
// - Security risk
// - Legal liability
```

**✅ Anonymized Production Data**
```javascript
// Mask/anonymize production data
const anonymizedUsers = prodUsers.map(user => ({
  id: user.id, // Keep ID for relationships
  email: `user-${user.id}@example.com`, // Fake email
  firstName: faker.name.firstName(), // Generated name
  lastName: faker.name.lastName(),
  phone: null, // Remove PII
  address: {
    city: user.address.city, // Keep non-PII
    state: user.address.state,
    zip: user.address.zip.substring(0, 3) + 'XX', // Partial zip
    street: '***REDACTED***'
  },
  createdAt: user.createdAt // Keep timestamps
}));

// Benefits:
// - Realistic data patterns
// - Compliant with privacy laws
// - Safe for testing
```

**✅ Synthetic Data (Best Practice)**
```javascript
import { faker } from '@faker-js/faker';

// Generate realistic but fake data
function generateUser() {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    phone: faker.phone.number(),
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      zip: faker.location.zipCode(),
      country: 'US'
    },
    age: faker.number.int({ min: 18, max: 90 }),
    createdAt: faker.date.past()
  };
}

// Benefits:
// - No PII (privacy compliant)
// - Unlimited volume
// - Controlled characteristics
// - Repeatable with seeds
```

---

## Data Generation Techniques

### Technique 1: Faker Libraries

**Basic Usage**
```javascript
import { faker } from '@faker-js/faker';

// Seed for reproducibility
faker.seed(123);

// Generate various data types
const testData = {
  // Personal
  name: faker.person.fullName(),
  email: faker.internet.email(),
  avatar: faker.image.avatar(),
  bio: faker.person.bio(),

  // Location
  address: faker.location.streetAddress(),
  city: faker.location.city(),
  country: faker.location.country(),
  coordinates: faker.location.nearbyGPSCoordinate(),

  // Financial
  accountNumber: faker.finance.accountNumber(),
  amount: faker.finance.amount(),
  currency: faker.finance.currencyCode(),
  iban: faker.finance.iban(),

  // Commerce
  product: faker.commerce.productName(),
  price: faker.commerce.price(),
  department: faker.commerce.department(),

  // Internet
  username: faker.internet.userName(),
  password: faker.internet.password(),
  url: faker.internet.url(),
  ipv4: faker.internet.ipv4(),

  // Date/Time
  pastDate: faker.date.past(),
  futureDate: faker.date.future(),
  recentDate: faker.date.recent(),

  // Random
  uuid: faker.string.uuid(),
  alphanumeric: faker.string.alphanumeric(10),
  hexadecimal: faker.string.hexadecimal(16)
};
```

**Schema-Based Generation**
```typescript
interface User {
  id: string;
  email: string;
  profile: {
    firstName: string;
    lastName: string;
    age: number;
  };
  roles: string[];
}

function generateUsers(count: number): User[] {
  return Array.from({ length: count }, () => ({
    id: faker.string.uuid(),
    email: faker.internet.email(),
    profile: {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      age: faker.number.int({ min: 18, max: 90 })
    },
    roles: faker.helpers.arrayElements(['user', 'admin', 'moderator'])
  }));
}

// Generate 1000 users
const users = generateUsers(1000);
```

---

### Technique 2: Test Data Builders

**Builder Pattern**
```typescript
class UserBuilder {
  private user: Partial<User> = {};

  withId(id: string) {
    this.user.id = id;
    return this;
  }

  withEmail(email: string) {
    this.user.email = email;
    return this;
  }

  withRole(role: string) {
    this.user.role = role;
    return this;
  }

  asAdmin() {
    this.user.role = 'admin';
    this.user.permissions = ['read', 'write', 'delete'];
    return this;
  }

  asCustomer() {
    this.user.role = 'customer';
    this.user.permissions = ['read'];
    return this;
  }

  build(): User {
    // Fill in defaults for missing fields
    return {
      id: this.user.id ?? faker.string.uuid(),
      email: this.user.email ?? faker.internet.email(),
      role: this.user.role ?? 'customer',
      permissions: this.user.permissions ?? ['read'],
      createdAt: new Date()
    } as User;
  }
}

// Usage
const admin = new UserBuilder()
  .asAdmin()
  .withEmail('admin@example.com')
  .build();

const customer = new UserBuilder()
  .asCustomer()
  .build();

// Flexible, readable, maintainable
```

---

### Technique 3: Fixtures and Factories

**Fixture Files**
```javascript
// fixtures/users.js
export const fixtures = {
  adminUser: {
    id: 1,
    email: 'admin@example.com',
    role: 'admin',
    verified: true
  },

  regularUser: {
    id: 2,
    email: 'user@example.com',
    role: 'customer',
    verified: true
  },

  unverifiedUser: {
    id: 3,
    email: 'unverified@example.com',
    role: 'customer',
    verified: false
  }
};

// Use in tests
import { fixtures } from './fixtures/users';

test('admin can delete users', async () => {
  const admin = await createUser(fixtures.adminUser);
  const user = await createUser(fixtures.regularUser);

  await userService.delete(admin, user.id);
  expect(await db.users.find(user.id)).toBeNull();
});
```

**Factory Functions**
```javascript
// factories/userFactory.js
export function createUser(overrides = {}) {
  const defaults = {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    role: 'customer',
    verified: true,
    createdAt: new Date()
  };

  return { ...defaults, ...overrides };
}

export function createAdmin(overrides = {}) {
  return createUser({
    role: 'admin',
    permissions: ['read', 'write', 'delete'],
    ...overrides
  });
}

// Use in tests
test('admin dashboard', async () => {
  const admin = createAdmin({ email: 'specific@example.com' });
  // Test with admin user
});
```

---

## Data Privacy & Compliance

### GDPR/CCPA Requirements

**What You Must Do:**
1. **Minimize PII Collection**
   - Only collect necessary data for testing
   - Use synthetic data instead of production data
   - Delete test data after use

2. **Secure Storage**
   - Encrypt sensitive test data
   - Access controls on test databases
   - Separate test from production

3. **Data Anonymization**
   - Mask/pseudonymize production data if used
   - Remove direct identifiers
   - K-anonymity for aggregate data

4. **Right to Erasure**
   - Easy deletion of test accounts
   - Automated cleanup processes
   - Audit trail of deletions

**Anonymization Techniques**
```javascript
// Data masking
function maskEmail(email) {
  const [user, domain] = email.split('@');
  return `${user[0]}***@${domain}`;
}

function maskPhone(phone) {
  return phone.replace(/\d(?=\d{4})/g, '*');
}

function maskCreditCard(cc) {
  return `****-****-****-${cc.slice(-4)}`;
}

// Pseudonymization (reversible with key)
const crypto = require('crypto');

function pseudonymize(value, key) {
  const cipher = crypto.createCipher('aes-256-cbc', key);
  return cipher.update(value, 'utf8', 'hex') + cipher.final('hex');
}

function depseudonymize(encrypted, key) {
  const decipher = crypto.createDecipher('aes-256-cbc', key);
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

// Use in tests
const user = {
  realEmail: 'john@example.com',
  maskedEmail: maskEmail('john@example.com'), // 'j***@example.com'
  pseudoEmail: pseudonymize('john@example.com', SECRET_KEY)
};
```

**Data Retention Policies**
```javascript
// Auto-delete old test data
async function cleanupOldTestData() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Delete test users older than 30 days
  await db.users.deleteMany({
    email: { $regex: /@example\.com$/ }, // Test emails
    createdAt: { $lt: thirtyDaysAgo }
  });

  console.log('Cleaned up old test data');
}

// Run daily
schedule.scheduleJob('0 2 * * *', cleanupOldTestData);
```

---

## Test Data Lifecycle

### Phase 1: Setup/Seeding

**Database Seeding**
```javascript
// seed.js
const seedData = {
  users: [
    { id: 1, email: 'admin@example.com', role: 'admin' },
    { id: 2, email: 'user@example.com', role: 'customer' }
  ],
  products: [
    { id: 1, name: 'Widget', price: 9.99, inStock: true },
    { id: 2, name: 'Gadget', price: 19.99, inStock: true }
  ]
};

async function seedDatabase() {
  await db.users.insertMany(seedData.users);
  await db.products.insertMany(seedData.products);
  console.log('Database seeded');
}

// Run before tests
beforeAll(async () => {
  await seedDatabase();
});
```

---

### Phase 2: Test Execution

**Data Isolation During Tests**
```javascript
describe('Order Service', () => {
  let testUser;
  let testProduct;

  beforeEach(async () => {
    // Create fresh data per test
    testUser = await createTestUser();
    testProduct = await createTestProduct();
  });

  afterEach(async () => {
    // Cleanup after test
    await deleteTestUser(testUser.id);
    await deleteTestProduct(testProduct.id);
  });

  test('user can place order', async () => {
    const order = await orderService.create({
      userId: testUser.id,
      productId: testProduct.id,
      quantity: 1
    });

    expect(order.total).toBe(testProduct.price);
  });
});
```

---

### Phase 3: Cleanup/Reset

**Transaction-Based Cleanup**
```javascript
// Best practice: use transactions
beforeEach(async () => {
  await db.beginTransaction();
});

afterEach(async () => {
  await db.rollbackTransaction(); // Auto cleanup
});
```

**Manual Cleanup**
```javascript
// Track created entities
const createdIds = {
  users: [],
  orders: [],
  products: []
};

afterEach(async () => {
  // Delete in reverse order (handle foreign keys)
  await db.orders.deleteMany({ id: { $in: createdIds.orders } });
  await db.products.deleteMany({ id: { $in: createdIds.products } });
  await db.users.deleteMany({ id: { $in: createdIds.users } });

  // Reset tracking
  createdIds.users = [];
  createdIds.orders = [];
  createdIds.products = [];
});
```

---

## Advanced Patterns

### Pattern 1: Relational Data Generation

**Generate Related Entities**
```javascript
async function generateOrderWithRelations() {
  // Create user
  const user = await db.users.create({
    email: faker.internet.email(),
    firstName: faker.person.firstName()
  });

  // Create products
  const products = await Promise.all([
    db.products.create({
      name: faker.commerce.productName(),
      price: faker.commerce.price()
    }),
    db.products.create({
      name: faker.commerce.productName(),
      price: faker.commerce.price()
    })
  ]);

  // Create order with line items
  const order = await db.orders.create({
    userId: user.id,
    status: 'pending',
    lineItems: products.map(p => ({
      productId: p.id,
      quantity: faker.number.int({ min: 1, max: 5 }),
      price: p.price
    }))
  });

  return { user, products, order };
}

// Use in test
test('order total calculation', async () => {
  const { order } = await generateOrderWithRelations();
  expect(order.total).toBeGreaterThan(0);
});
```

---

### Pattern 2: Edge Case Data

**Generate Boundary Values**
```javascript
function generateEdgeCaseUsers() {
  return [
    // Minimum values
    {
      email: 'a@b.c', // Shortest valid email
      age: 18, // Minimum age
      name: 'A' // Single character
    },

    // Maximum values
    {
      email: 'a'.repeat(64) + '@' + 'b'.repeat(255), // Max length
      age: 120,
      name: 'A'.repeat(255)
    },

    // Special characters
    {
      email: "test+tag@example.com",
      name: "O'Brien",
      bio: "Test <script>alert('xss')</script>"
    },

    // Unicode
    {
      email: 'user@例え.jp',
      name: '山田太郎',
      city: '北京'
    },

    // Empty/null
    {
      email: 'empty@example.com',
      middleName: null,
      phone: ''
    }
  ];
}
```

---

### Pattern 3: Volume Data Generation

**Generate Large Datasets**
```javascript
// Generate 10,000 users efficiently
async function generateLargeUserDataset(count = 10000) {
  const batchSize = 1000;
  const batches = Math.ceil(count / batchSize);

  for (let i = 0; i < batches; i++) {
    const users = Array.from({ length: batchSize }, (_, index) => ({
      id: i * batchSize + index,
      email: `user${i * batchSize + index}@example.com`,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      createdAt: faker.date.past()
    }));

    // Batch insert for performance
    await db.users.insertMany(users);

    console.log(`Inserted batch ${i + 1}/${batches}`);
  }
}

// Performance test with realistic volume
test('search performs well with 10k users', async () => {
  await generateLargeUserDataset(10000);

  const start = Date.now();
  const results = await userService.search('John');
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(100); // < 100ms
});
```

---

## Using with QE Agents

### qe-test-data-architect: High-Speed Generation

**Generate 10k+ Records per Second**
```typescript
// Agent generates realistic, schema-aware data
const testData = await agent.generateTestData({
  schema: 'users',
  count: 10000,
  realistic: true,
  constraints: {
    age: { min: 18, max: 90 },
    roles: ['customer', 'admin', 'moderator'],
    emailDomain: 'example.com'
  }
});

// Returns 10,000 fully populated user records
// With relationships, constraints, realistic patterns
```

**Edge Case Discovery**
```typescript
// Agent auto-discovers edge cases
const edgeCases = await agent.generateEdgeCases({
  field: 'email',
  patterns: [
    'special-chars',
    'unicode',
    'max-length',
    'min-length',
    'sql-injection',
    'xss-attempts'
  ]
});

// Returns comprehensive edge case dataset
// 50+ edge cases for email field
```

**GDPR-Compliant Data**
```typescript
// Agent ensures privacy compliance
const anonymizedData = await agent.anonymizeProductionData({
  source: productionSnapshot,
  piiFields: ['email', 'phone', 'ssn', 'address'],
  method: 'pseudonymization',
  retainStructure: true
});

// Returns anonymized data maintaining referential integrity
```

---

### Fleet Coordination for Complex Data Graphs

```typescript
// Multiple agents coordinate for complex data
const dataFleet = await FleetManager.coordinate({
  strategy: 'test-data-generation',
  agents: [
    'qe-test-data-architect',  // Generate base data
    'qe-test-generator',       // Generate tests using data
    'qe-test-executor'         // Execute with generated data
  ],
  topology: 'sequential'
});

await dataFleet.execute({
  scenario: 'e-commerce-checkout',
  volume: {
    users: 1000,
    products: 500,
    orders: 5000
  },
  relationships: true,
  realistic: true
});

// Generates full data graph:
// - 1000 users with profiles
// - 500 products with inventory
// - 5000 orders with line items
// - All relationships maintained
// - Tests generated and executed
```

---

## Tools & Libraries

### Data Generation
- **@faker-js/faker** - Comprehensive fake data generation
- **Mockaroo** - Online data generator (CSV, JSON, SQL)
- **Chance.js** - Random data generation
- **Casual** - Minimalist fake data
- **JSON Schema Faker** - Generate from JSON schemas

### Database Tools
- **Factory Bot** (Ruby) - Test data factories
- **FactoryGuy** (JavaScript) - Ember.js factories
- **Fishery** (TypeScript) - Type-safe factories
- **Knex.js** - SQL query builder with seeding
- **Prisma** - ORM with seeding support

### Privacy Tools
- **ARX Data Anonymization Tool** - GDPR compliance
- **sdv (Synthetic Data Vault)** - AI-generated synthetic data
- **Presidio** - PII detection and anonymization
- **Faker** - Built-in data masking

---

## Common Pitfalls

### ❌ Using Production Data Directly
```javascript
// NEVER do this
const prodUsers = await prodDb.query('SELECT * FROM users');
await testDb.insertMany(prodUsers); // ⚠️ PII violation
```

**Fix:** Anonymize first or use synthetic data

### ❌ Not Cleaning Up Test Data
```javascript
// Creates 100 users per test, never deleted
test('many tests', async () => {
  const users = await generateUsers(100);
  // ... test code
  // No cleanup! Database fills up
});
```

**Fix:** Use transactions or cleanup hooks

### ❌ Hard-Coded IDs
```javascript
// Breaks when run in parallel or multiple times
const user = await createUser({ id: 1 }); // ⚠️ Collision risk
```

**Fix:** Use generated UUIDs or auto-increment

### ❌ Shared Mutable Data
```javascript
// Tests pollute shared data
const sharedUser = createUser();

test('update email', () => {
  sharedUser.email = 'new@example.com'; // Affects other tests!
});
```

**Fix:** Create fresh data per test

---

## Best Practices Checklist

**Data Generation:**
- [ ] Use faker or similar library for realistic data
- [ ] Generate data with proper constraints
- [ ] Create both minimal and realistic datasets
- [ ] Include edge cases and boundary values
- [ ] Use builders/factories for complex entities

**Privacy & Compliance:**
- [ ] Never use production PII directly
- [ ] Anonymize/pseudonymize production data snapshots
- [ ] Use synthetic data as default
- [ ] Implement data retention policies
- [ ] Document data handling procedures

**Performance:**
- [ ] Batch insert for large datasets
- [ ] Use database transactions for isolation
- [ ] Generate data lazily when possible
- [ ] Cache commonly used fixtures
- [ ] Clean up data after tests

**Maintainability:**
- [ ] Centralize test data generation
- [ ] Version control seed data
- [ ] Document data schemas
- [ ] Use type-safe factories (TypeScript)
- [ ] Keep data generation DRY

---

## Related Skills

**Testing Infrastructure:**
- [test-automation-strategy](../test-automation-strategy/) - Automation includes data setup
- [test-environment-management](../test-environment-management/) - Environments need data
- [database-testing](../database-testing/) - Database schema and data integrity

**Testing Methodologies:**
- [regression-testing](../regression-testing/) - Regression needs stable test data
- [performance-testing](../performance-testing/) - Performance tests need volume data
- [api-testing-patterns](../api-testing-patterns/) - API tests need request data

**Quality Management:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - Agent-driven data generation
- [compliance-testing](../compliance-testing/) - GDPR/CCPA compliance validation

---

## Remember

**Test data is infrastructure, not an afterthought.**

Poor test data causes:
- 40% of test failures
- Hours wasted debugging
- Unreliable test results
- Privacy violations
- Scaling bottlenecks

**Good test data management enables:**
- Fast, reliable tests
- Realistic scenarios
- Privacy compliance
- Scalable testing
- Confident deployments

**Golden Rules:**
1. Never use production PII
2. Automate data generation
3. Clean up after tests
4. Use transactions for isolation
5. Generate edge cases systematically

**With Agents:** `qe-test-data-architect` generates 10k+ records/sec with realistic patterns, constraints, and relationships. Use agents to eliminate test data bottlenecks and ensure GDPR/CCPA compliance automatically.
