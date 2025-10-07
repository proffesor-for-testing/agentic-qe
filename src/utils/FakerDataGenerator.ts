/**
 * FakerDataGenerator - Advanced test data generation utilities
 *
 * Provides comprehensive, realistic test data generation using Faker.js
 * with support for relationships, edge cases, and complex data structures.
 */

import { faker, type Faker } from '@faker-js/faker';

// ============================================================================
// Data Generation Options
// ============================================================================

export interface DataGenerationOptions {
  seed?: number;
  locale?: string;
  count?: number;
  includeEdgeCases?: boolean;
  preserveRelationships?: boolean;
}

export interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  age: number;
  birthDate: Date;
  gender: string;
  avatar: string;
  address: AddressData;
  company: CompanyData;
  account: AccountData;
  metadata: Record<string, any>;
}

export interface AddressData {
  street: string;
  streetNumber: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface CompanyData {
  name: string;
  industry: string;
  jobTitle: string;
  department: string;
  email: string;
  website: string;
  ein: string;
}

export interface AccountData {
  username: string;
  password: string;
  accountNumber: string;
  iban: string;
  creditCard: {
    number: string;
    cvv: string;
    issuer: string;
    expiryDate: string;
  };
  balance: number;
  currency: string;
}

export interface ProductData {
  id: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  sku: string;
  barcode: string;
  price: number;
  currency: string;
  stock: number;
  weight: number;
  dimensions: {
    width: number;
    height: number;
    depth: number;
    unit: string;
  };
  images: string[];
  tags: string[];
  ratings: {
    average: number;
    count: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderData {
  id: string;
  orderNumber: string;
  userId: string;
  items: OrderItemData[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  paymentMethod: string;
  shippingAddress: AddressData;
  billingAddress: AddressData;
  trackingNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt?: Date;
}

export interface OrderItemData {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  discount?: number;
}

// ============================================================================
// FakerDataGenerator Class
// ============================================================================

export class FakerDataGenerator {
  private faker: any;
  private options: DataGenerationOptions;

  constructor(options: DataGenerationOptions = {}) {
    this.faker = faker;
    this.options = options;

    // Set seed for reproducible data
    if (options.seed !== undefined) {
      this.faker.seed(options.seed);
    }
  }

  // ==========================================================================
  // User Data Generation
  // ==========================================================================

  /**
   * Generate realistic user data with complete profile
   */
  generateUser(): UserData {
    const firstName = this.faker.person.firstName();
    const lastName = this.faker.person.lastName();
    const gender = this.faker.person.sex();

    return {
      id: this.faker.string.uuid(),
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email: this.faker.internet.email({ firstName, lastName }),
      phone: this.faker.phone.number(),
      age: this.faker.number.int({ min: 18, max: 80 }),
      birthDate: this.faker.date.birthdate({ min: 18, max: 80, mode: 'age' }),
      gender,
      avatar: this.faker.image.avatar(),
      address: this.generateAddress(),
      company: this.generateCompany(),
      account: this.generateAccount(firstName, lastName),
      metadata: {
        registeredAt: this.faker.date.past(),
        lastLogin: this.faker.date.recent(),
        isVerified: this.faker.datatype.boolean(),
        preferences: {
          newsletter: this.faker.datatype.boolean(),
          notifications: this.faker.datatype.boolean(),
          theme: this.faker.helpers.arrayElement(['light', 'dark', 'auto']),
        },
      },
    };
  }

  /**
   * Generate multiple users with optional relationships
   */
  generateUsers(count: number = 10): UserData[] {
    return Array.from({ length: count }, () => this.generateUser());
  }

  // ==========================================================================
  // Address Data Generation
  // ==========================================================================

  /**
   * Generate realistic address data
   */
  generateAddress(): AddressData {
    return {
      street: this.faker.location.street(),
      streetNumber: this.faker.location.buildingNumber(),
      city: this.faker.location.city(),
      state: this.faker.location.state(),
      country: this.faker.location.country(),
      zipCode: this.faker.location.zipCode(),
      latitude: parseFloat(this.faker.location.latitude()),
      longitude: parseFloat(this.faker.location.longitude()),
      timezone: this.faker.location.timeZone(),
    };
  }

  // ==========================================================================
  // Company Data Generation
  // ==========================================================================

  /**
   * Generate realistic company data
   */
  generateCompany(): CompanyData {
    const companyName = this.faker.company.name();

    return {
      name: companyName,
      industry: this.faker.company.buzzNoun(),
      jobTitle: this.faker.person.jobTitle(),
      department: this.faker.commerce.department(),
      email: this.faker.internet.email({ provider: companyName.toLowerCase().replace(/\s+/g, '') + '.com' }),
      website: this.faker.internet.url(),
      ein: this.faker.string.numeric(9),
    };
  }

  // ==========================================================================
  // Account Data Generation
  // ==========================================================================

  /**
   * Generate account and financial data
   */
  generateAccount(firstName?: string, lastName?: string): AccountData {
    const username = firstName && lastName
      ? this.faker.internet.username({ firstName, lastName })
      : this.faker.internet.username();

    return {
      username,
      password: this.faker.internet.password({ length: 16 }),
      accountNumber: this.faker.finance.accountNumber(),
      iban: this.faker.finance.iban(),
      creditCard: {
        number: this.faker.finance.creditCardNumber(),
        cvv: this.faker.finance.creditCardCVV(),
        issuer: this.faker.finance.creditCardIssuer(),
        expiryDate: this.faker.date.future().toISOString().substring(0, 7), // YYYY-MM
      },
      balance: parseFloat(this.faker.finance.amount({ min: 100, max: 100000 })),
      currency: this.faker.finance.currencyCode(),
    };
  }

  // ==========================================================================
  // Product Data Generation
  // ==========================================================================

  /**
   * Generate realistic product data
   */
  generateProduct(): ProductData {
    const price = parseFloat(this.faker.commerce.price());
    const createdAt = this.faker.date.past();

    return {
      id: this.faker.string.uuid(),
      name: this.faker.commerce.productName(),
      description: this.faker.commerce.productDescription(),
      category: this.faker.commerce.department(),
      brand: this.faker.company.name(),
      sku: this.faker.string.alphanumeric(10).toUpperCase(),
      barcode: this.faker.string.numeric(13),
      price,
      currency: this.faker.finance.currencyCode(),
      stock: this.faker.number.int({ min: 0, max: 1000 }),
      weight: this.faker.number.float({ min: 0.1, max: 50, fractionDigits: 2 }),
      dimensions: {
        width: this.faker.number.float({ min: 1, max: 100, fractionDigits: 1 }),
        height: this.faker.number.float({ min: 1, max: 100, fractionDigits: 1 }),
        depth: this.faker.number.float({ min: 1, max: 100, fractionDigits: 1 }),
        unit: 'cm',
      },
      images: Array.from({ length: this.faker.number.int({ min: 1, max: 5 }) }, () =>
        this.faker.image.url()
      ),
      tags: Array.from({ length: this.faker.number.int({ min: 2, max: 8 }) }, () =>
        this.faker.commerce.productAdjective()
      ),
      ratings: {
        average: this.faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
        count: this.faker.number.int({ min: 0, max: 10000 }),
      },
      createdAt,
      updatedAt: this.faker.date.between({ from: createdAt, to: new Date() }),
    };
  }

  /**
   * Generate multiple products
   */
  generateProducts(count: number = 50): ProductData[] {
    return Array.from({ length: count }, () => this.generateProduct());
  }

  // ==========================================================================
  // Order Data Generation
  // ==========================================================================

  /**
   * Generate realistic order data with relationships
   */
  generateOrder(userId?: string, products?: ProductData[]): OrderData {
    const itemCount = this.faker.number.int({ min: 1, max: 5 });
    const items: OrderItemData[] = [];

    // Generate order items
    for (let i = 0; i < itemCount; i++) {
      const product = products
        ? this.faker.helpers.arrayElement(products)
        : this.generateProduct();

      const quantity = this.faker.number.int({ min: 1, max: 5 });
      const unitPrice = product.price;
      const discount = this.faker.datatype.boolean(0.3) // 30% chance of discount
        ? this.faker.number.float({ min: 0, max: unitPrice * 0.3, fractionDigits: 2 })
        : undefined;

      items.push({
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice,
        total: (unitPrice - (discount || 0)) * quantity,
        discount,
      });
    }

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.1; // 10% tax
    const shipping = this.faker.number.float({ min: 5, max: 50, fractionDigits: 2 });
    const total = subtotal + tax + shipping;

    const createdAt = this.faker.date.past();
    const status = this.faker.helpers.arrayElement([
      'pending',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
    ] as const);

    const deliveredAt = status === 'delivered'
      ? this.faker.date.between({ from: createdAt, to: new Date() })
      : undefined;

    return {
      id: this.faker.string.uuid(),
      orderNumber: `ORD-${this.faker.string.alphanumeric(10).toUpperCase()}`,
      userId: userId || this.faker.string.uuid(),
      items,
      subtotal,
      tax,
      shipping,
      total,
      currency: this.faker.finance.currencyCode(),
      status,
      paymentMethod: this.faker.helpers.arrayElement(['credit_card', 'debit_card', 'paypal', 'bank_transfer']),
      shippingAddress: this.generateAddress(),
      billingAddress: this.generateAddress(),
      trackingNumber: status !== 'pending' && status !== 'cancelled'
        ? `TRK-${this.faker.string.alphanumeric(12).toUpperCase()}`
        : undefined,
      createdAt,
      updatedAt: this.faker.date.between({ from: createdAt, to: new Date() }),
      deliveredAt,
    };
  }

  /**
   * Generate multiple orders with user relationships
   */
  generateOrders(count: number = 20, users?: UserData[], products?: ProductData[]): OrderData[] {
    return Array.from({ length: count }, () => {
      const user = users ? this.faker.helpers.arrayElement(users) : undefined;
      return this.generateOrder(user?.id, products);
    });
  }

  // ==========================================================================
  // Edge Case Generation
  // ==========================================================================

  /**
   * Generate edge case values for testing
   */
  generateEdgeCases(): Record<string, any[]> {
    return {
      strings: [
        '',
        ' ',
        'a',
        'A'.repeat(255),
        'A'.repeat(1000),
        '\n\t\r',
        'Test\nNewline',
        "Test'Quote",
        'Test"DoubleQuote',
        'Test\\Backslash',
        'Ñoño',
        '中文',
        '🚀💻🎉',
        '<script>alert("XSS")</script>',
        "'; DROP TABLE users;--",
        '../../etc/passwd',
        '${7*7}',
        '{{7*7}}',
      ],
      numbers: [
        0,
        -1,
        1,
        -2147483648, // MIN_INT32
        2147483647,  // MAX_INT32
        0.1,
        -0.1,
        3.14159265359,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Infinity,
        -Infinity,
        NaN,
      ],
      dates: [
        new Date('1970-01-01'), // Unix epoch
        new Date('1900-01-01'), // Very old
        new Date('2099-12-31'), // Far future
        new Date(), // Current
        new Date('2000-02-29'), // Leap year
        new Date('2001-02-28'), // Day before non-leap year
      ],
      booleans: [true, false],
      nullish: [null, undefined],
      emails: [
        'test@example.com',
        'user+tag@example.com',
        'user@sub.domain.example.com',
        'a@b.c',
        'very.long.email.address.with.many.dots@example.com',
      ],
      phones: [
        '+1-555-555-5555',
        '555-555-5555',
        '(555) 555-5555',
        '+44 20 7946 0958',
        '+81 3-3224-5678',
      ],
      urls: [
        'http://example.com',
        'https://example.com',
        'https://example.com:8080/path?query=value',
        'https://user:pass@example.com',
        'ftp://ftp.example.com',
      ],
    };
  }

  // ==========================================================================
  // Complex Relationship Generation
  // ==========================================================================

  /**
   * Generate complete dataset with relationships preserved
   */
  generateCompleteDataset(config: {
    userCount?: number;
    productCount?: number;
    orderCount?: number;
  } = {}): {
    users: UserData[];
    products: ProductData[];
    orders: OrderData[];
  } {
    const users = this.generateUsers(config.userCount || 10);
    const products = this.generateProducts(config.productCount || 50);
    const orders = this.generateOrders(config.orderCount || 20, users, products);

    return { users, products, orders };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Reset faker seed
   */
  resetSeed(seed?: number): void {
    if (seed !== undefined) {
      this.faker.seed(seed);
      this.options.seed = seed;
    }
  }

  /**
   * Get current faker instance
   */
  getFaker(): any {
    return this.faker;
  }

  /**
   * Generate custom data using Faker API
   */
  generateCustom<T>(generator: (faker: any) => T): T {
    return generator(this.faker);
  }
}

// ============================================================================
// Export singleton instance with default options
// ============================================================================

export const defaultFakerGenerator = new FakerDataGenerator();

// ============================================================================
// Convenience functions
// ============================================================================

export const generateUser = () => defaultFakerGenerator.generateUser();
export const generateUsers = (count: number) => defaultFakerGenerator.generateUsers(count);
export const generateProduct = () => defaultFakerGenerator.generateProduct();
export const generateProducts = (count: number) => defaultFakerGenerator.generateProducts(count);
export const generateOrder = (userId?: string, products?: ProductData[]) =>
  defaultFakerGenerator.generateOrder(userId, products);
export const generateOrders = (count: number, users?: UserData[], products?: ProductData[]) =>
  defaultFakerGenerator.generateOrders(count, users, products);
export const generateCompleteDataset = (config?: {
  userCount?: number;
  productCount?: number;
  orderCount?: number;
}) => defaultFakerGenerator.generateCompleteDataset(config);
