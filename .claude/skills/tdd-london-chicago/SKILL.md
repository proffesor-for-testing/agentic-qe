---
name: tdd-london-chicago
description: Apply both London and Chicago school TDD approaches. Use when practicing test-driven development, understanding different TDD philosophies, or choosing the right testing style for your context.
---

# Test-Driven Development: London & Chicago Schools

## TDD Core Cycle (Both Schools)

**Red → Green → Refactor**

1. **Red:** Write a failing test for the next bit of functionality
2. **Green:** Write just enough code to make the test pass
3. **Refactor:** Improve the code without changing behavior

**Key principle:** Tests drive design, not just verify it.

## Chicago School (Detroit School / Classicist)

### Philosophy
Test observable behavior through the public API. Focus on state verification. Keep tests close to how users/consumers will interact with the code.

### Approach
- Write tests against real objects
- Minimize use of mocks/stubs  
- Tests typically involve multiple units working together
- Inside-out or outside-in (both work)

### Example: Order Processing

```javascript
// Test
describe('Order', () => {
  it('calculates total with tax', () => {
    const order = new Order();
    order.addItem(new Product('Widget', 10.00), 2);
    order.addItem(new Product('Gadget', 15.00), 1);
    
    expect(order.totalWithTax(0.10)).toBe(38.50); // (10*2 + 15) * 1.10
  });
});

// Implementation
class Order {
  constructor() {
    this.items = [];
  }
  
  addItem(product, quantity) {
    this.items.push({ product, quantity });
  }
  
  totalWithTax(taxRate) {
    const subtotal = this.items.reduce((sum, item) => 
      sum + (item.product.price * item.quantity), 0
    );
    return subtotal * (1 + taxRate);
  }
}

class Product {
  constructor(name, price) {
    this.name = name;
    this.price = price;
  }
}
```

### Characteristics
- **Real collaborators:** Order uses actual Product objects
- **State verification:** Assert on the final total
- **Integrated test:** Multiple objects work together
- **Refactoring safety:** Can change internal implementation freely

### When Chicago Shines
- Domain logic with clear state
- Algorithms and calculations
- When object interactions are simple
- When integration between units is the key concern
- Learning a new domain (seeing real objects helps understanding)

## London School (Mockist)

### Philosophy
Test each unit in isolation. Focus on interaction verification. Design emerges through defining interfaces and collaborations first.

### Approach
- Mock external dependencies
- Outside-in development (start from entry point)
- Tests focus on how objects collaborate
- Discover interfaces through testing

### Example: Order Processing

```javascript
// Test
describe('Order', () => {
  it('calculates total using tax calculator', () => {
    const taxCalculator = {
      calculateTax: jest.fn().mockReturnValue(3.50)
    };
    
    const order = new Order(taxCalculator);
    order.addItem({ price: 10 }, 2);
    order.addItem({ price: 15 }, 1);
    
    const total = order.totalWithTax();
    
    expect(taxCalculator.calculateTax).toHaveBeenCalledWith(35.00);
    expect(total).toBe(38.50);
  });
});

// Implementation
class Order {
  constructor(taxCalculator) {
    this.taxCalculator = taxCalculator;
    this.items = [];
  }
  
  addItem(product, quantity) {
    this.items.push({ product, quantity });
  }
  
  totalWithTax() {
    const subtotal = this.items.reduce((sum, item) => 
      sum + (item.product.price * item.quantity), 0
    );
    const tax = this.taxCalculator.calculateTax(subtotal);
    return subtotal + tax;
  }
}
```

### Characteristics
- **Mocked collaborators:** TaxCalculator is mocked
- **Interaction verification:** Assert that calculateTax was called correctly
- **Isolated test:** Order tested independently
- **Explicit dependencies:** Constructor reveals what Order needs

### When London Shines
- Complex object interactions
- External dependencies (databases, APIs, file systems)
- When testing would be slow without mocks
- Designing new systems (interfaces emerge naturally)
- Code with heavy I/O or side effects

## Key Differences

| Aspect | Chicago | London |
|--------|---------|--------|
| **Collaborators** | Real objects | Mocks/stubs |
| **Verification** | State (assert outcomes) | Interaction (assert method calls) |
| **Isolation** | Lower (integrated units) | Higher (unit in isolation) |
| **Refactoring** | Easier (fewer test changes) | Harder (mocks may break) |
| **Design feedback** | Emerge from use | Explicit from start |
| **Test speed** | Can be slower | Usually faster |

## Practical Guidance: Which to Use?

### Use Chicago When:
- **Pure functions and calculations**
  - `calculateDiscount(price, percentage)`
  - `formatCurrency(amount)`
  
- **Value objects**
  - `Money`, `Email`, `PhoneNumber`
  
- **Simple collaborations**
  - Few dependencies, straightforward interactions

- **Learning phase**
  - Understanding domain, exploring design

### Use London When:
- **External integrations**
  - Database access, API calls, file I/O
  
- **Command patterns**
  - Actions that change state elsewhere
  
- **Complex workflows**
  - Multiple objects coordinating
  
- **Slow operations**
  - Network calls, heavy computations

### Mix Both (Common in Practice)

```javascript
// London style for controller (external dependencies)
describe('OrderController', () => {
  it('creates order and sends confirmation', async () => {
    const orderService = { create: jest.fn().mockResolvedValue({ id: 123 }) };
    const emailService = { send: jest.fn() };
    
    const controller = new OrderController(orderService, emailService);
    await controller.placeOrder(orderData);
    
    expect(orderService.create).toHaveBeenCalledWith(orderData);
    expect(emailService.send).toHaveBeenCalled();
  });
});

// Chicago style for domain logic (calculations)
describe('OrderService', () => {
  it('applies discount when threshold met', () => {
    const service = new OrderService();
    const order = service.create({ items: [...], total: 150 });
    
    expect(order.discount).toBe(15); // 10% off orders > $100
  });
});
```

## Common Pitfalls

### Over-Mocking (London)
**Problem:** Mocking everything makes tests brittle.

```javascript
// TOO MUCH MOCKING
const product = { getName: jest.fn(), getPrice: jest.fn() };
```

**Better:** Only mock external dependencies and complex collaborators.

### Under-Testing (Chicago)
**Problem:** Integration tests miss edge cases in individual units.

**Solution:** Add unit tests for complex logic, keep integration tests for happy paths.

### Mocking Implementation Details (London)
**Problem:** Tests break when refactoring internals.

```javascript
// BAD - testing private method call
expect(order._calculateSubtotal).toHaveBeenCalled();
```

**Better:** Test public behavior, not internal methods.

### Ignoring Test Pain (Both)
**Problem:** Hard-to-test code = poorly designed code.

**Listen to tests:**
- Need many mocks? → Too many dependencies
- Hard to set up? → Constructor does too much
- Tests too long? → Method does too much
- Can't test without real database? → Coupling to infrastructure

## TDD Rhythm

### Micro-Level (Minutes)
1. Write tiny failing test
2. Write minimal code to pass
3. Quick refactor
4. Repeat

### Macro-Level (Hours)
1. Sketch out component responsibilities
2. TDD the easiest piece first
3. TDD the next piece
4. Refactor across components
5. Continue building out

### Red-Green-Refactor Discipline

**Red phase:**
- Run test, verify it fails
- Check failure message is clear
- Don't write production code yet

**Green phase:**
- Write simplest code to pass
- Don't add features not tested yet
- Don't refactor yet
- Verify test passes

**Refactor phase:**
- Improve code structure
- Keep tests passing
- Stop when code is clean enough
- Don't add new functionality

## Examples of Good TDD Flow

### Chicago Example: Shopping Cart

```javascript
// Test 1: Empty cart
test('new cart has zero items', () => {
  const cart = new Cart();
  expect(cart.itemCount()).toBe(0);
});

// Make it pass
class Cart {
  itemCount() { return 0; }
}

// Test 2: Add item
test('adding item increases count', () => {
  const cart = new Cart();
  cart.add({ id: 1, name: 'Widget' });
  expect(cart.itemCount()).toBe(1);
});

// Make it pass
class Cart {
  constructor() { this.items = []; }
  add(item) { this.items.push(item); }
  itemCount() { return this.items.length; }
}

// Refactor: Extract to method
class Cart {
  constructor() { this.items = []; }
  add(item) { this.items.push(item); }
  itemCount() { return this.items.length; }
}
// (No refactor needed yet - code is simple)

// Continue with more tests...
```

### London Example: Payment Processor

```javascript
// Test: Successful payment
test('charges card and records transaction', async () => {
  const gateway = { charge: jest.fn().mockResolvedValue({ success: true }) };
  const ledger = { record: jest.fn() };
  
  const processor = new PaymentProcessor(gateway, ledger);
  const result = await processor.process({ amount: 100, card: '1234' });
  
  expect(gateway.charge).toHaveBeenCalledWith(100, '1234');
  expect(ledger.record).toHaveBeenCalled();
  expect(result.success).toBe(true);
});

// Implementation
class PaymentProcessor {
  constructor(gateway, ledger) {
    this.gateway = gateway;
    this.ledger = ledger;
  }
  
  async process(payment) {
    const result = await this.gateway.charge(payment.amount, payment.card);
    if (result.success) {
      this.ledger.record({ amount: payment.amount, timestamp: Date.now() });
    }
    return result;
  }
}
```

## Benefits of TDD (Both Schools)

1. **Design feedback:** Tests show design problems early
2. **Living documentation:** Tests explain how code should work
3. **Regression safety:** Changes don't break existing behavior
4. **Confidence:** Refactor without fear
5. **Scope control:** Build only what's tested
6. **Debugging speed:** Failing test pinpoints issue

## When NOT to Use TDD

- **Spike/prototype code:** You're exploring, not building yet
- **Trivial code:** Getters/setters with no logic
- **UI layout:** Visual design isn't well suited to TDD
- **Performance optimization:** Measure first, optimize second
- **Learning new tech:** Get something working first, then test

## Misconceptions

**"TDD means 100% code coverage"**
No. TDD means tests drive development. Some code naturally emerges without direct tests (e.g., simple DTOs).

**"TDD is slower"**
Slower at first, faster overall. You debug less and refactor safely.

**"Tests guarantee correctness"**
No. Tests only verify what you thought to test. You can still miss requirements or have logical errors.

**"Must test private methods"**
No. Test through public API. If private method is complex enough to need tests, maybe it's actually a separate class.

## Combining with Other Practices

**TDD + Pair Programming:**
- Navigator writes test
- Driver makes it pass
- Switch roles frequently

**TDD + Continuous Integration:**
- Every commit has tests
- CI runs full suite
- Green build = deployable

**TDD + Refactoring:**
- Tests enable fearless refactoring
- Refactoring keeps tests maintainable
- Symbiotic relationship

## Resources

### Chicago School
- **Test-Driven Development by Example** by Kent Beck
- **Growing Object-Oriented Software Guided by Tests** by Freeman & Pryce (hybrid)

### London School
- **GOOS** by Freeman & Pryce (literally wrote the book)
- Martin Fowler's articles on mocks vs. stubs

### General
- **Working Effectively with Legacy Code** by Michael Feathers
- Uncle Bob's TDD screencasts

## Using with QE Agents

### Agent-Assisted TDD Workflows

**qe-test-generator** applies both schools:
```typescript
// Chicago style: Generate state-based tests
await agent.generateTests({
  style: 'chicago',
  target: 'src/domain/Order.ts',
  focus: 'state-verification'
});
// → Creates tests that verify final state

// London style: Generate interaction-based tests
await agent.generateTests({
  style: 'london',
  target: 'src/controllers/OrderController.ts',
  focus: 'collaboration-patterns'
});
// → Creates tests with mocked dependencies
```

### Red-Green-Refactor with Agent Assistance

```typescript
// Red: Human writes failing test concept
const testIdea = "Order applies 10% discount when total > $100";

// Agent generates formal test (Red)
const failingTest = await qe-test-generator.createFailingTest(testIdea);
// → Generates complete test that fails

// Human writes minimal code (Green)
// ... implementation code ...

// Agent validates green phase
await qe-test-executor.verifyGreen(failingTest);
// → Confirms test passes

// Agent suggests refactorings
const suggestions = await qe-quality-analyzer.suggestRefactorings({
  scope: 'src/domain/Order.ts',
  preserveTests: true
});
// → Provides safe refactoring options
```

### Agent-Human Pairing Patterns

**Ping-Pong TDD with Agent:**
```typescript
// Human writes test
const humanTest = `
  test('cart applies bulk discount', () => {
    const cart = new Cart();
    cart.addItems(10);
    expect(cart.discount()).toBe(15);
  });
`;

// Agent makes it pass
await qe-test-generator.implementTestLogic(humanTest);
// → Generates minimal implementation

// Agent writes next test
const agentTest = await qe-test-generator.nextTest({
  context: 'bulk-discount-edge-cases',
  style: 'chicago'
});

// Human reviews and refines
// [repeat cycle]
```

### Fleet Coordination for TDD

```typescript
// Multiple agents support TDD workflow
const tddFleet = await FleetManager.coordinate({
  workflow: 'red-green-refactor',
  agents: {
    testGenerator: 'qe-test-generator',    // Red phase
    testExecutor: 'qe-test-executor',      // Green validation
    qualityAnalyzer: 'qe-quality-analyzer' // Refactor suggestions
  },
  mode: 'sequential'
});

// Agents coordinate through TDD cycle
await tddFleet.executeCycle({
  feature: 'payment-processing',
  school: 'mixed' // Use both Chicago and London where appropriate
});
```

### Choosing TDD School with Agent Guidance

```typescript
// Agent analyzes code and recommends TDD approach
const recommendation = await qe-quality-analyzer.recommendTDDStyle({
  codeType: 'controller',
  dependencies: ['database', 'emailService', 'paymentGateway'],
  complexity: 'high'
});

// → Recommends London school (many external dependencies)
// → Suggests mock patterns for database and services
// → Provides example test structure
```

---

## Related Skills

**Core Quality Practices:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - TDD with agent coordination
- [context-driven-testing](../context-driven-testing/) - Choose TDD style based on context

**Development Practices:**
- [xp-practices](../xp-practices/) - TDD within XP workflow, ping-pong pairing
- [refactoring-patterns](../refactoring-patterns/) - Refactor phase techniques
- [code-review-quality](../code-review-quality/) - Review test quality

**Testing Approaches:**
- [test-automation-strategy](../test-automation-strategy/) - Where TDD fits in automation pyramid
- [api-testing-patterns](../api-testing-patterns/) - London school for API testing

---

## Remember

**Chicago:** Test state, use real objects, refactor freely
**London:** Test interactions, mock dependencies, design interfaces first

**Both:** Write the test first, make it pass, refactor

Neither is "right." Choose based on context. Mix as needed. The goal is well-designed, tested code, not religious adherence to one school.

**With Agents**: Agents excel at generating tests in both schools, validating green phase, and suggesting safe refactorings. Use agents to maintain TDD discipline while humans focus on design decisions.
