/**
 * FakerDataGenerator Test Suite
 *
 * Tests for realistic test data generation using Faker.js
 */

import { FakerDataGenerator } from '@utils/FakerDataGenerator';

describe('FakerDataGenerator', () => {
  let generator: FakerDataGenerator;

  beforeEach(() => {
    // Initialize with seed for reproducible tests
    generator = new FakerDataGenerator({ seed: 12345 });
  });

  describe('User Data Generation', () => {
    it('should generate realistic user data', () => {
      const user = generator.generateUser();

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('firstName');
      expect(user).toHaveProperty('lastName');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('phone');
      expect(user).toHaveProperty('address');
      expect(user).toHaveProperty('company');
      expect(user).toHaveProperty('account');

      // Validate email format
      expect(user.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

      // Validate UUID format
      expect(user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Validate age range
      expect(user.age).toBeGreaterThanOrEqual(18);
      expect(user.age).toBeLessThanOrEqual(80);
    });

    it('should generate multiple users', () => {
      const users = generator.generateUsers(10);

      expect(users).toHaveLength(10);
      expect(users[0]).toHaveProperty('id');
      expect(users[9]).toHaveProperty('email');

      // Check for unique IDs
      const ids = users.map(u => u.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });

    it('should generate reproducible data with seed', () => {
      const gen1 = new FakerDataGenerator({ seed: 42 });
      const gen2 = new FakerDataGenerator({ seed: 42 });

      const user1 = gen1.generateUser();
      const user2 = gen2.generateUser();

      expect(user1.email).toBe(user2.email);
      expect(user1.firstName).toBe(user2.firstName);
      expect(user1.lastName).toBe(user2.lastName);
    });

    it('should generate valid address data', () => {
      const address = generator.generateAddress();

      expect(address).toHaveProperty('street');
      expect(address).toHaveProperty('city');
      expect(address).toHaveProperty('country');
      expect(address).toHaveProperty('zipCode');
      expect(address).toHaveProperty('latitude');
      expect(address).toHaveProperty('longitude');

      // Validate coordinates
      expect(address.latitude).toBeGreaterThanOrEqual(-90);
      expect(address.latitude).toBeLessThanOrEqual(90);
      expect(address.longitude).toBeGreaterThanOrEqual(-180);
      expect(address.longitude).toBeLessThanOrEqual(180);
    });
  });

  describe('Company Data Generation', () => {
    it('should generate realistic company data', () => {
      const company = generator.generateCompany();

      expect(company).toHaveProperty('name');
      expect(company).toHaveProperty('industry');
      expect(company).toHaveProperty('jobTitle');
      expect(company).toHaveProperty('email');
      expect(company).toHaveProperty('website');
      expect(company).toHaveProperty('ein');

      // Validate EIN format (9 digits)
      expect(company.ein).toMatch(/^\d{9}$/);

      // Validate URL format
      expect(company.website).toMatch(/^https?:\/\/.+/);
    });
  });

  describe('Account Data Generation', () => {
    it('should generate account and financial data', () => {
      const account = generator.generateAccount('John', 'Doe');

      expect(account).toHaveProperty('username');
      expect(account).toHaveProperty('password');
      expect(account).toHaveProperty('accountNumber');
      expect(account).toHaveProperty('iban');
      expect(account).toHaveProperty('creditCard');

      // Validate credit card structure
      expect(account.creditCard).toHaveProperty('number');
      expect(account.creditCard).toHaveProperty('cvv');
      expect(account.creditCard).toHaveProperty('issuer');
      expect(account.creditCard).toHaveProperty('expiryDate');

      // Validate CVV format (3-4 digits)
      expect(account.creditCard.cvv).toMatch(/^\d{3,4}$/);

      // Validate balance
      expect(account.balance).toBeGreaterThanOrEqual(100);
      expect(account.balance).toBeLessThanOrEqual(100000);
    });
  });

  describe('Product Data Generation', () => {
    it('should generate realistic product data', () => {
      const product = generator.generateProduct();

      expect(product).toHaveProperty('id');
      expect(product).toHaveProperty('name');
      expect(product).toHaveProperty('description');
      expect(product).toHaveProperty('price');
      expect(product).toHaveProperty('sku');
      expect(product).toHaveProperty('barcode');
      expect(product).toHaveProperty('dimensions');
      expect(product).toHaveProperty('images');
      expect(product).toHaveProperty('tags');
      expect(product).toHaveProperty('ratings');

      // Validate SKU format (10 alphanumeric chars)
      expect(product.sku).toMatch(/^[A-Z0-9]{10}$/);

      // Validate barcode (13 digits)
      expect(product.barcode).toMatch(/^\d{13}$/);

      // Validate price
      expect(product.price).toBeGreaterThan(0);

      // Validate stock
      expect(product.stock).toBeGreaterThanOrEqual(0);
      expect(product.stock).toBeLessThanOrEqual(1000);

      // Validate ratings
      expect(product.ratings.average).toBeGreaterThanOrEqual(1);
      expect(product.ratings.average).toBeLessThanOrEqual(5);
      expect(product.ratings.count).toBeGreaterThanOrEqual(0);
    });

    it('should generate multiple products', () => {
      const products = generator.generateProducts(50);

      expect(products).toHaveLength(50);

      // Check for unique SKUs
      const skus = products.map(p => p.sku);
      const uniqueSkus = new Set(skus);
      expect(uniqueSkus.size).toBe(50);
    });
  });

  describe('Order Data Generation', () => {
    it('should generate realistic order data', () => {
      const order = generator.generateOrder();

      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('orderNumber');
      expect(order).toHaveProperty('userId');
      expect(order).toHaveProperty('items');
      expect(order).toHaveProperty('subtotal');
      expect(order).toHaveProperty('tax');
      expect(order).toHaveProperty('shipping');
      expect(order).toHaveProperty('total');
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('shippingAddress');
      expect(order).toHaveProperty('billingAddress');

      // Validate order number format
      expect(order.orderNumber).toMatch(/^ORD-[A-Z0-9]{10}$/);

      // Validate items
      expect(order.items.length).toBeGreaterThan(0);
      expect(order.items.length).toBeLessThanOrEqual(5);

      // Validate financial calculations
      const calculatedSubtotal = order.items.reduce((sum, item) => sum + item.total, 0);
      expect(order.subtotal).toBeCloseTo(calculatedSubtotal, 2);
      expect(order.total).toBeCloseTo(order.subtotal + order.tax + order.shipping, 2);

      // Validate status
      expect(['pending', 'processing', 'shipped', 'delivered', 'cancelled']).toContain(order.status);

      // Validate tracking number based on status
      if (order.status === 'shipped' || order.status === 'delivered') {
        expect(order.trackingNumber).toBeDefined();
        expect(order.trackingNumber).toMatch(/^TRK-[A-Z0-9]{12}$/);
      }
    });

    it('should generate orders with user relationships', () => {
      const users = generator.generateUsers(5);
      const products = generator.generateProducts(10);
      const orders = generator.generateOrders(15, users, products);

      expect(orders).toHaveLength(15);

      // Verify user relationships
      const userIds = users.map(u => u.id);
      orders.forEach(order => {
        expect(userIds).toContain(order.userId);
      });

      // Verify product relationships
      const productIds = products.map(p => p.id);
      orders.forEach(order => {
        order.items.forEach(item => {
          expect(productIds).toContain(item.productId);
        });
      });
    });
  });

  describe('Complete Dataset Generation', () => {
    it('should generate complete dataset with relationships', () => {
      const dataset = generator.generateCompleteDataset({
        userCount: 10,
        productCount: 20,
        orderCount: 30,
      });

      expect(dataset.users).toHaveLength(10);
      expect(dataset.products).toHaveLength(20);
      expect(dataset.orders).toHaveLength(30);

      // Verify relationships are preserved
      const userIds = dataset.users.map(u => u.id);
      const productIds = dataset.products.map(p => p.id);

      dataset.orders.forEach(order => {
        expect(userIds).toContain(order.userId);
        order.items.forEach(item => {
          expect(productIds).toContain(item.productId);
        });
      });
    });
  });

  describe('Edge Case Generation', () => {
    it('should generate comprehensive edge cases', () => {
      const edgeCases = generator.generateEdgeCases();

      expect(edgeCases).toHaveProperty('strings');
      expect(edgeCases).toHaveProperty('numbers');
      expect(edgeCases).toHaveProperty('dates');
      expect(edgeCases).toHaveProperty('booleans');
      expect(edgeCases).toHaveProperty('nullish');
      expect(edgeCases).toHaveProperty('emails');
      expect(edgeCases).toHaveProperty('phones');
      expect(edgeCases).toHaveProperty('urls');

      // Validate string edge cases
      expect(edgeCases.strings).toContain('');
      expect(edgeCases.strings).toContain('<script>alert("XSS")</script>');
      expect(edgeCases.strings).toContain("'; DROP TABLE users;--");

      // Validate number edge cases
      expect(edgeCases.numbers).toContain(0);
      expect(edgeCases.numbers).toContain(-1);
      expect(edgeCases.numbers).toContain(2147483647);

      // Validate boolean edge cases
      expect(edgeCases.booleans).toContain(true);
      expect(edgeCases.booleans).toContain(false);

      // Validate nullish edge cases
      expect(edgeCases.nullish).toContain(null);
      expect(edgeCases.nullish).toContain(undefined);
    });
  });

  describe('Seed Management', () => {
    it('should reset seed and generate reproducible data', () => {
      const gen = new FakerDataGenerator({ seed: 100 });

      const user1 = gen.generateUser();
      gen.resetSeed(100);
      const user2 = gen.generateUser();

      expect(user1.email).toBe(user2.email);
      expect(user1.firstName).toBe(user2.firstName);
    });

    it('should generate different data without seed', () => {
      const gen1 = new FakerDataGenerator();
      const gen2 = new FakerDataGenerator();

      const user1 = gen1.generateUser();
      const user2 = gen2.generateUser();

      // High probability of different data without seed
      expect(user1.email).not.toBe(user2.email);
    });
  });

  describe('Custom Data Generation', () => {
    it('should support custom data generation with Faker API', () => {
      const customData = generator.generateCustom((faker) => ({
        customField1: faker.string.alphanumeric(20),
        customField2: faker.number.int({ min: 1000, max: 9999 }),
        customField3: faker.helpers.arrayElement(['A', 'B', 'C']),
      }));

      expect(customData).toHaveProperty('customField1');
      expect(customData).toHaveProperty('customField2');
      expect(customData).toHaveProperty('customField3');

      expect(customData.customField1).toHaveLength(20);
      expect(customData.customField2).toBeGreaterThanOrEqual(1000);
      expect(customData.customField2).toBeLessThanOrEqual(9999);
      expect(['A', 'B', 'C']).toContain(customData.customField3);
    });
  });

  describe('Performance', () => {
    it('should generate large datasets efficiently', () => {
      const startTime = Date.now();

      const dataset = generator.generateCompleteDataset({
        userCount: 100,
        productCount: 500,
        orderCount: 1000,
      });

      const duration = Date.now() - startTime;

      expect(dataset.users).toHaveLength(100);
      expect(dataset.products).toHaveLength(500);
      expect(dataset.orders).toHaveLength(1000);

      // Should complete in reasonable time (under 5 seconds)
      expect(duration).toBeLessThan(5000);

      console.log(`Generated 1600 records in ${duration}ms`);
    });
  });
});
