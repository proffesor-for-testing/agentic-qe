---
name: refactoring-patterns
description: Apply safe refactoring patterns to improve code structure without changing behavior. Use when cleaning up code, reducing technical debt, or improving maintainability.
---

# Refactoring Patterns

## Core Philosophy

Refactoring is changing code structure without changing behavior. Tests are your safety net - refactor fearlessly when you have good tests.

**Key principle:** Small steps, frequent commits, always green tests.

## When to Refactor

### ✅ Refactor When:
- Adding new feature requires changing messy code
- Code is hard to test
- You touch code and don't understand it
- Duplication becomes obvious (third time)
- Performance is adequate but code is ugly

### ❌ Don't Refactor When:
- No tests exist (write tests first)
- Code works and you won't touch it again
- Deadline is tomorrow (technical debt note, refactor later)
- You don't understand what the code does yet
- "Just because" - refactor needs a reason

## The Refactoring Cycle

**Red → Green → Refactor**

1. **Ensure tests pass** (Green)
2. **Make small change** (Refactor)
3. **Run tests** (Still Green)
4. **Commit** (Save progress)
5. **Repeat**

**Never refactor without tests. Never.**

## Extract Method

**Problem:** Long method doing too much

**Before:**
```javascript
function processOrder(order) {
  // Validate order
  if (!order.items || order.items.length === 0) {
    throw new Error('Order has no items');
  }
  if (!order.customer || !order.customer.email) {
    throw new Error('Invalid customer');
  }
  
  // Calculate total
  let subtotal = 0;
  for (let item of order.items) {
    subtotal += item.price * item.quantity;
  }
  let tax = subtotal * 0.10;
  let total = subtotal + tax;
  
  // Save order
  const savedOrder = db.orders.create({
    ...order,
    subtotal,
    tax,
    total,
    status: 'pending'
  });
  
  // Send email
  emailService.send({
    to: order.customer.email,
    subject: 'Order Confirmation',
    body: `Your order #${savedOrder.id} has been received.`
  });
  
  return savedOrder;
}
```

**After:**
```javascript
function processOrder(order) {
  validateOrder(order);
  const pricing = calculatePricing(order);
  const savedOrder = saveOrder(order, pricing);
  sendConfirmationEmail(order.customer.email, savedOrder.id);
  return savedOrder;
}

function validateOrder(order) {
  if (!order.items || order.items.length === 0) {
    throw new Error('Order has no items');
  }
  if (!order.customer || !order.customer.email) {
    throw new Error('Invalid customer');
  }
}

function calculatePricing(order) {
  const subtotal = order.items.reduce((sum, item) => 
    sum + item.price * item.quantity, 0
  );
  const tax = subtotal * 0.10;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

function saveOrder(order, pricing) {
  return db.orders.create({
    ...order,
    ...pricing,
    status: 'pending'
  });
}

function sendConfirmationEmail(email, orderId) {
  emailService.send({
    to: email,
    subject: 'Order Confirmation',
    body: `Your order #${orderId} has been received.`
  });
}
```

**Benefits:**
- Each function has single responsibility
- Easy to test each part independently
- Clear what the code does at a glance

## Extract Class

**Problem:** Class doing too much

**Before:**
```javascript
class Order {
  constructor(items, customer) {
    this.items = items;
    this.customer = customer;
  }
  
  calculateSubtotal() {
    return this.items.reduce((sum, item) => 
      sum + item.price * item.quantity, 0
    );
  }
  
  calculateTax() {
    return this.calculateSubtotal() * 0.10;
  }
  
  calculateTotal() {
    return this.calculateSubtotal() + this.calculateTax();
  }
  
  sendConfirmationEmail() {
    emailService.send({
      to: this.customer.email,
      subject: 'Order Confirmation',
      body: `Your order has been received. Total: $${this.calculateTotal()}`
    });
  }
  
  sendShippingNotification() {
    emailService.send({
      to: this.customer.email,
      subject: 'Order Shipped',
      body: `Your order has been shipped.`
    });
  }
}
```

**After:**
```javascript
class Order {
  constructor(items, customer) {
    this.items = items;
    this.customer = customer;
    this.pricing = new OrderPricing(items);
    this.notifications = new OrderNotifications(customer.email);
  }
  
  getTotal() {
    return this.pricing.calculateTotal();
  }
  
  sendConfirmation() {
    this.notifications.sendConfirmation(this.getTotal());
  }
  
  sendShippingNotification() {
    this.notifications.sendShipping();
  }
}

class OrderPricing {
  constructor(items) {
    this.items = items;
  }
  
  calculateSubtotal() {
    return this.items.reduce((sum, item) => 
      sum + item.price * item.quantity, 0
    );
  }
  
  calculateTax() {
    return this.calculateSubtotal() * 0.10;
  }
  
  calculateTotal() {
    return this.calculateSubtotal() + this.calculateTax();
  }
}

class OrderNotifications {
  constructor(email) {
    this.email = email;
  }
  
  sendConfirmation(total) {
    emailService.send({
      to: this.email,
      subject: 'Order Confirmation',
      body: `Your order has been received. Total: $${total}`
    });
  }
  
  sendShipping() {
    emailService.send({
      to: this.email,
      subject: 'Order Shipped',
      body: `Your order has been shipped.`
    });
  }
}
```

## Replace Conditional with Polymorphism

**Problem:** Complex conditionals based on type

**Before:**
```javascript
class PaymentProcessor {
  processPayment(payment) {
    if (payment.type === 'credit_card') {
      return this.chargeCreditCard(
        payment.cardNumber,
        payment.amount
      );
    } else if (payment.type === 'paypal') {
      return this.chargePayPal(
        payment.paypalAccount,
        payment.amount
      );
    } else if (payment.type === 'crypto') {
      return this.chargeCrypto(
        payment.walletAddress,
        payment.amount
      );
    }
  }
}
```

**After:**
```javascript
class PaymentProcessor {
  processPayment(paymentMethod) {
    return paymentMethod.charge();
  }
}

class CreditCardPayment {
  constructor(cardNumber, amount) {
    this.cardNumber = cardNumber;
    this.amount = amount;
  }
  
  charge() {
    return gateway.chargeCreditCard(this.cardNumber, this.amount);
  }
}

class PayPalPayment {
  constructor(account, amount) {
    this.account = account;
    this.amount = amount;
  }
  
  charge() {
    return gateway.chargePayPal(this.account, this.amount);
  }
}

class CryptoPayment {
  constructor(walletAddress, amount) {
    this.walletAddress = walletAddress;
    this.amount = amount;
  }
  
  charge() {
    return gateway.chargeCrypto(this.walletAddress, this.amount);
  }
}
```

## Introduce Parameter Object

**Problem:** Functions with many parameters

**Before:**
```javascript
function createUser(
  firstName,
  lastName,
  email,
  phoneNumber,
  address,
  city,
  state,
  zipCode,
  country
) {
  // ...
}

createUser(
  'John',
  'Doe',
  'john@example.com',
  '555-1234',
  '123 Main St',
  'Springfield',
  'IL',
  '62701',
  'USA'
);
```

**After:**
```javascript
class UserProfile {
  constructor(firstName, lastName, contactInfo, address) {
    this.firstName = firstName;
    this.lastName = lastName;
    this.contactInfo = contactInfo;
    this.address = address;
  }
}

class ContactInfo {
  constructor(email, phoneNumber) {
    this.email = email;
    this.phoneNumber = phoneNumber;
  }
}

class Address {
  constructor(street, city, state, zipCode, country) {
    this.street = street;
    this.city = city;
    this.state = state;
    this.zipCode = zipCode;
    this.country = country;
  }
}

function createUser(profile) {
  // ...
}

createUser(new UserProfile(
  'John',
  'Doe',
  new ContactInfo('john@example.com', '555-1234'),
  new Address('123 Main St', 'Springfield', 'IL', '62701', 'USA')
));
```

## Replace Magic Numbers with Named Constants

**Before:**
```javascript
function calculateDiscount(price, customerType) {
  if (customerType === 1) {
    return price * 0.10;
  } else if (customerType === 2) {
    return price * 0.20;
  } else if (customerType === 3) {
    return price * 0.30;
  }
  return 0;
}
```

**After:**
```javascript
const CustomerType = {
  STANDARD: 1,
  PREMIUM: 2,
  VIP: 3
};

const DiscountRate = {
  [CustomerType.STANDARD]: 0.10,
  [CustomerType.PREMIUM]: 0.20,
  [CustomerType.VIP]: 0.30
};

function calculateDiscount(price, customerType) {
  const rate = DiscountRate[customerType] || 0;
  return price * rate;
}
```

## Decompose Conditional

**Problem:** Complex conditional logic

**Before:**
```javascript
if (
  order.total > 1000 &&
  order.customer.isPremium &&
  order.shippingMethod === 'express' &&
  order.items.every(item => item.inStock)
) {
  return 'ELIGIBLE_FOR_FREE_SHIPPING';
}
```

**After:**
```javascript
function isEligibleForFreeShipping(order) {
  return (
    isLargeOrder(order) &&
    isPremiumCustomer(order) &&
    isExpressShipping(order) &&
    allItemsInStock(order)
  );
}

function isLargeOrder(order) {
  return order.total > 1000;
}

function isPremiumCustomer(order) {
  return order.customer.isPremium;
}

function isExpressShipping(order) {
  return order.shippingMethod === 'express';
}

function allItemsInStock(order) {
  return order.items.every(item => item.inStock);
}

if (isEligibleForFreeShipping(order)) {
  return 'ELIGIBLE_FOR_FREE_SHIPPING';
}
```

## Replace Loop with Pipeline

**Before:**
```javascript
function getTopExpensiveProducts(products) {
  let inStock = [];
  for (let product of products) {
    if (product.inStock) {
      inStock.push(product);
    }
  }
  
  inStock.sort((a, b) => b.price - a.price);
  
  let top5 = [];
  for (let i = 0; i < 5 && i < inStock.length; i++) {
    top5.push(inStock[i]);
  }
  
  let names = [];
  for (let product of top5) {
    names.push(product.name);
  }
  
  return names;
}
```

**After:**
```javascript
function getTopExpensiveProducts(products) {
  return products
    .filter(p => p.inStock)
    .sort((a, b) => b.price - a.price)
    .slice(0, 5)
    .map(p => p.name);
}
```

## Remove Duplication

**Before:**
```javascript
function processOnlineOrder(order) {
  validateOrder(order);
  const total = calculateTotal(order);
  const savedOrder = saveOrder(order, total);
  sendEmail(order.customer.email, savedOrder.id);
  logActivity('Order processed', savedOrder.id);
  return savedOrder;
}

function processPhoneOrder(order) {
  validateOrder(order);
  const total = calculateTotal(order);
  const savedOrder = saveOrder(order, total);
  sendEmail(order.customer.email, savedOrder.id);
  logActivity('Phone order processed', savedOrder.id);
  return savedOrder;
}
```

**After:**
```javascript
function processOrder(order, source) {
  validateOrder(order);
  const total = calculateTotal(order);
  const savedOrder = saveOrder(order, total);
  sendEmail(order.customer.email, savedOrder.id);
  logActivity(`${source} order processed`, savedOrder.id);
  return savedOrder;
}

function processOnlineOrder(order) {
  return processOrder(order, 'Online');
}

function processPhoneOrder(order) {
  return processOrder(order, 'Phone');
}
```

## Refactoring Smells (When to Refactor)

### Long Method
**Smell:** Method has too many lines (>20-30)
**Refactor:** Extract Method

### Large Class
**Smell:** Class has too many responsibilities
**Refactor:** Extract Class

### Long Parameter List
**Smell:** Function has >3-4 parameters
**Refactor:** Introduce Parameter Object

### Duplicated Code
**Smell:** Same code in multiple places
**Refactor:** Extract Method/Class

### Dead Code
**Smell:** Unused code
**Refactor:** Delete it

### Comments Explaining What Code Does
**Smell:** Comment saying "This calculates discount"
**Refactor:** Extract method named `calculateDiscount()`

### Magic Numbers
**Smell:** Unexplained constants (42, 0.10, 1000)
**Refactor:** Named Constants

### Nested Conditionals
**Smell:** If inside if inside if
**Refactor:** Extract methods, early returns, guard clauses

## Safe Refactoring Workflow

### Step 1: Ensure Tests Pass
```bash
npm test
# All tests green ✅
```

### Step 2: Make Small Change
```javascript
// Extract one small method
function calculateSubtotal(items) {
  return items.reduce((sum, item) => 
    sum + item.price * item.quantity, 0
  );
}
```

### Step 3: Run Tests Again
```bash
npm test
# Still green ✅
```

### Step 4: Commit
```bash
git add .
git commit -m "refactor: extract calculateSubtotal method"
```

### Step 5: Repeat
Next small refactoring...

## IDE Refactoring Tools

### Automated Refactorings (Safe)
- **Rename** - Change variable/function/class name everywhere
- **Extract Method** - Pull code into new function
- **Extract Variable** - Give expression a name
- **Inline** - Remove unnecessary abstraction
- **Move** - Relocate code to better place

### Use These!
Modern IDEs (VS Code, IntelliJ, WebStorm) do these safely with guaranteed correctness.

## Refactoring Anti-Patterns

### ❌ Refactoring Without Tests
**Problem:** No safety net, might break things
**Solution:** Write tests first, then refactor

### ❌ Big Bang Refactoring
**Problem:** Rewrite everything at once
**Solution:** Incremental refactoring, small steps

### ❌ Refactoring for Perfection
**Problem:** Endless tweaking
**Solution:** Good enough is good enough. Move on.

### ❌ Premature Abstraction
**Problem:** Creating abstractions before patterns clear
**Solution:** Wait for duplication, then extract

### ❌ Refactoring During Feature Work
**Problem:** Mixing refactoring with new features
**Solution:** Separate commits: refactor first, then feature

## Boy Scout Rule

**"Leave the code better than you found it."**

Every time you touch code:
1. Make it slightly better
2. Don't need to make it perfect
3. Small improvements accumulate

**Example:**
```javascript
// Found this
function calc(a,b,c){return a*b+c;}

// Left it as this
function calculateTotal(price, quantity, tax) {
  return price * quantity + tax;
}
```

## Using with QE Agents

### Automated Refactoring Detection

**qe-quality-analyzer** identifies refactoring opportunities:
```typescript
// Agent detects code smells
const codeSmells = await agent.detectCodeSmells({
  scope: 'src/services/',
  patterns: [
    'long-method',
    'large-class',
    'duplicate-code',
    'feature-envy',
    'data-clumps'
  ]
});

// Suggests specific refactorings
const suggestions = await agent.suggestRefactorings({
  codeSmells,
  preserveTests: true,
  riskTolerance: 'low'
});
```

### Safe Refactoring with Test Verification

```typescript
// Agent validates refactoring didn't break behavior
const before = await git.getCurrentCommit();
await human.performRefactoring();
const after = await git.getCurrentCommit();

const validation = await qe-test-executor.verifyRefactoring({
  beforeCommit: before,
  afterCommit: after,
  expectSameBehavior: true,
  runFullSuite: true
});

// Returns: { testsPass: true, behaviorPreserved: true, coverageChange: +2% }
```

### Fleet Coordination for Large Refactorings

```typescript
// Multiple agents coordinate on large refactoring
const refactoringFleet = await FleetManager.coordinate({
  strategy: 'refactoring',
  agents: [
    'qe-quality-analyzer',     // Identify targets
    'qe-test-generator',       // Add safety tests
    'qe-test-executor',        // Verify behavior
    'qe-coverage-analyzer'     // Check coverage impact
  ],
  topology: 'sequential'
});

await refactoringFleet.execute({
  target: 'src/services/OrderService.ts',
  refactoringType: 'extract-class'
});
```

---

## Related Skills

**Core Quality:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - Agent-driven refactoring workflows

**Development:**
- [tdd-london-chicago](../tdd-london-chicago/) - Test coverage during refactoring
- [code-review-quality](../code-review-quality/) - Review refactored code
- [xp-practices](../xp-practices/) - Collective code ownership

**Testing:**
- [test-automation-strategy](../test-automation-strategy/) - Maintain test suite during refactoring

---

## Remember

Refactoring is not:
- Adding features
- Fixing bugs
- Optimizing performance
- Rewriting from scratch

Refactoring is:
- Improving code structure
- Making code easier to understand
- Reducing complexity
- Removing duplication
- **Without changing behavior**

**Always have tests. Always take small steps. Always keep tests green.**
