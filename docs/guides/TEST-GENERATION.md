# Test Generation Guide

Learn how to use AI-powered test generation to create comprehensive test suites automatically.

## Overview

The AQE test generator uses AI to analyze your code and create intelligent test cases. It understands:
- Code structure and dependencies
- Edge cases and boundary conditions
- Error handling scenarios
- Common testing patterns
- Framework-specific best practices

## Basic Test Generation

### Generate Tests for a Single File

```bash
aqe generate src/services/user-service.ts
```

**What happens:**
1. AI reads and analyzes your code
2. Identifies functions, methods, and classes
3. Determines test scenarios (happy path, edge cases, errors)
4. Generates test code in your preferred framework
5. Saves tests to `./tests/unit/services/user-service.test.ts`

**Example output:**
```typescript
// Generated: tests/unit/services/user-service.test.ts
import { UserService } from '../../../src/services/user-service';

describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {
      const service = new UserService();
      const user = await service.createUser({
        name: 'John Doe',
        email: 'john@example.com'
      });
      expect(user).toBeDefined();
      expect(user.email).toBe('john@example.com');
    });

    it('should throw error with invalid email', async () => {
      const service = new UserService();
      await expect(
        service.createUser({ name: 'John', email: 'invalid' })
      ).rejects.toThrow('Invalid email format');
    });
  });
});
```

### Generate Tests for a Directory

```bash
aqe generate src/services
```

This generates tests for **all files** in the directory:
- Analyzes each file independently
- Creates matching test directory structure
- Maintains naming conventions
- Shows progress for each file

## Framework Selection

### Supported Frameworks

AQE supports multiple testing frameworks:

#### Jest (Default)
```bash
aqe generate src/utils/validators.ts --framework jest
```

**Best for:** Unit tests, Node.js projects, React applications

#### Mocha
```bash
aqe generate src/api --framework mocha
```

**Best for:** Node.js projects, flexible test structure

#### Cypress
```bash
aqe generate src/features --framework cypress --type e2e
```

**Best for:** E2E testing, UI testing, browser automation

#### Playwright
```bash
aqe generate src/pages --framework playwright --type e2e
```

**Best for:** Cross-browser E2E testing, modern web apps

#### Vitest
```bash
aqe generate src/components --framework vitest
```

**Best for:** Vite projects, fast unit testing

## Test Types

### Unit Tests

Test individual functions in isolation.

```bash
aqe generate src/utils/calculator.ts --type unit
```

**Generated tests include:**
- Function behavior with valid inputs
- Boundary conditions (min/max values)
- Error handling
- Type validation

**Example:**
```typescript
describe('Calculator', () => {
  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(add(2, 3)).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(add(-5, 3)).toBe(-2);
    });

    it('should handle zero', () => {
      expect(add(0, 5)).toBe(5);
    });
  });
});
```

### Integration Tests

Test how components work together.

```bash
aqe generate src/services --type integration
```

**Generated tests include:**
- API endpoint interactions
- Database operations
- Service layer integration
- External dependency mocking

**Example:**
```typescript
describe('UserService Integration', () => {
  it('should save user to database', async () => {
    const db = await setupTestDatabase();
    const service = new UserService(db);

    const user = await service.createUser({ name: 'Jane' });
    const saved = await db.users.findOne({ id: user.id });

    expect(saved).toBeDefined();
    expect(saved.name).toBe('Jane');
  });
});
```

### E2E Tests

Test complete user workflows.

```bash
aqe generate src/features/checkout --type e2e --framework cypress
```

**Generated tests include:**
- User journey simulations
- UI interactions
- Form submissions
- Navigation flows

**Example:**
```typescript
describe('Checkout Flow', () => {
  it('should complete purchase', () => {
    cy.visit('/products');
    cy.get('[data-test="product-1"]').click();
    cy.get('[data-test="add-to-cart"]').click();
    cy.get('[data-test="checkout"]').click();
    cy.get('[data-test="payment-form"]').within(() => {
      cy.get('input[name="cardNumber"]').type('4242424242424242');
      cy.get('button[type="submit"]').click();
    });
    cy.url().should('include', '/confirmation');
  });
});
```

## Advanced Generation Options

### Property-Based Testing

Generate tests that verify properties across many inputs.

```bash
aqe generate src/utils --property-based --coverage 98
```

**What it does:**
- Uses libraries like `fast-check` (Jest) or `jsverify`
- Tests properties rather than specific values
- Generates random inputs automatically
- Finds edge cases you might miss

**Example:**
```typescript
import fc from 'fast-check';

describe('sorting', () => {
  it('should maintain array length', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted = sort(arr);
        expect(sorted.length).toBe(arr.length);
      })
    );
  });

  it('should produce sorted output', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted = sort(arr);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]).toBeGreaterThanOrEqual(sorted[i - 1]);
        }
      })
    );
  });
});
```

### API Testing from OpenAPI Spec

Generate E2E tests from your API specification.

```bash
aqe generate src/api --type e2e --swagger api-spec.yaml --framework cypress
```

**What it does:**
- Parses OpenAPI/Swagger specification
- Generates tests for each endpoint
- Includes request validation
- Checks response schemas
- Tests error scenarios (4xx, 5xx)

**Example:**
```typescript
describe('User API', () => {
  it('GET /users should return user list', () => {
    cy.request('GET', '/api/users').then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.an('array');
      expect(response.body[0]).to.have.property('id');
      expect(response.body[0]).to.have.property('name');
    });
  });

  it('POST /users should create user', () => {
    cy.request('POST', '/api/users', {
      name: 'John Doe',
      email: 'john@example.com'
    }).then((response) => {
      expect(response.status).to.eq(201);
      expect(response.body).to.have.property('id');
    });
  });
});
```

### Mutation Testing

Generate tests that verify your tests catch bugs.

```bash
aqe generate src/services --mutation --coverage 95
```

**What it does:**
- Creates mutations (small changes) in your code
- Runs tests against mutants
- Ensures tests fail when code is broken
- Improves test quality

**Example mutations:**
```typescript
// Original
if (age >= 18) return true;

// Mutations tested:
// - if (age > 18) return true;    // Boundary mutation
// - if (age >= 19) return true;   // Constant mutation
// - if (age <= 18) return true;   // Operator mutation
// - if (false) return true;       // Condition mutation
```

## Coverage Targets

### Set Coverage Goals

```bash
aqe generate src/services --coverage 95
```

**Coverage levels:**
- `80%` - Minimum acceptable
- `90%` - Good coverage
- `95%` - Excellent coverage (default)
- `98%` - Comprehensive coverage
- `100%` - Every line tested (rarely necessary)

### Coverage Types Tracked

1. **Line Coverage** - Every line executed
2. **Branch Coverage** - Every if/else path tested
3. **Function Coverage** - Every function called
4. **Statement Coverage** - Every statement executed

## Practical Examples

### Example 1: REST API Service

**Source code:**
```typescript
// src/services/payment-service.ts
export class PaymentService {
  async processPayment(amount: number, method: string): Promise<Receipt> {
    if (amount <= 0) throw new Error('Invalid amount');
    if (!['card', 'paypal'].includes(method)) {
      throw new Error('Invalid payment method');
    }

    const transaction = await this.gateway.charge(amount, method);
    return this.createReceipt(transaction);
  }
}
```

**Generate tests:**
```bash
aqe generate src/services/payment-service.ts --coverage 95
```

**Generated tests:**
```typescript
describe('PaymentService', () => {
  describe('processPayment', () => {
    it('should process valid payment', async () => {
      const service = new PaymentService();
      const receipt = await service.processPayment(100, 'card');
      expect(receipt).toBeDefined();
      expect(receipt.amount).toBe(100);
    });

    it('should reject negative amount', async () => {
      const service = new PaymentService();
      await expect(
        service.processPayment(-10, 'card')
      ).rejects.toThrow('Invalid amount');
    });

    it('should reject zero amount', async () => {
      const service = new PaymentService();
      await expect(
        service.processPayment(0, 'card')
      ).rejects.toThrow('Invalid amount');
    });

    it('should reject invalid payment method', async () => {
      const service = new PaymentService();
      await expect(
        service.processPayment(100, 'bitcoin')
      ).rejects.toThrow('Invalid payment method');
    });
  });
});
```

### Example 2: React Component

**Source code:**
```typescript
// src/components/LoginForm.tsx
export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit">Login</button>
    </form>
  );
};
```

**Generate tests:**
```bash
aqe generate src/components/LoginForm.tsx --framework jest --type unit
```

**Generated tests:**
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('should render email and password inputs', () => {
    render(<LoginForm />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('should update email on input change', () => {
    render(<LoginForm />);
    const emailInput = screen.getByRole('textbox');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    expect(emailInput).toHaveValue('test@example.com');
  });

  it('should call login on form submission', async () => {
    const mockLogin = jest.fn();
    render(<LoginForm />);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'test@example.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });
    fireEvent.click(screen.getByRole('button'));

    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
  });
});
```

## Customization Options

### Output Directory

```bash
aqe generate src/services --output ./custom-tests
```

### Dry Run (Preview)

```bash
aqe generate src/utils --dry-run
```

Shows what tests would be generated without writing files.

### Parallel Generation

```bash
aqe generate src/ --parallel
```

Generates tests for multiple files simultaneously (faster for large codebases).

## Tips and Best Practices

### 1. Start Small
Generate tests for one file first, review the output, then scale up.

### 2. Review Generated Tests
AI-generated tests are smart but not perfect. Always review and adjust.

### 3. Use Property-Based Testing for Utilities
Functions with clear mathematical properties benefit most.

### 4. Set Realistic Coverage Targets
95% is excellent. 100% is often unnecessary and time-consuming.

### 5. Combine with Manual Tests
Use AQE for boilerplate, write complex scenarios manually.

## Troubleshooting

### Generated Tests Don't Compile

**Problem:** TypeScript errors in generated tests

**Solution:**
- Check your source code compiles first
- Ensure dependencies are installed
- Review type definitions
- Re-generate with explicit framework: `--framework jest`

### Missing Test Cases

**Problem:** AI missed important scenarios

**Solution:**
- Increase coverage target: `--coverage 98`
- Add comments in source code describing edge cases
- Enable property-based testing: `--property-based`
- Manually add missing tests

### Tests Too Generic

**Problem:** Generated tests lack specificity

**Solution:**
- Use integration tests for complex logic: `--type integration`
- Add JSDoc comments to guide generation
- Review and refine generated tests

## Next Steps

- **Execute your tests** → [TEST-EXECUTION.md](./TEST-EXECUTION.md)
- **Analyze coverage** → [COVERAGE-ANALYSIS.md](./COVERAGE-ANALYSIS.md)
- **Optimize test suite** → See `aqe optimize` command

## Related Commands

```bash
aqe generate --help      # Full command reference
aqe analyze gaps         # Find missing test coverage
aqe status              # Check generator agent status
```
