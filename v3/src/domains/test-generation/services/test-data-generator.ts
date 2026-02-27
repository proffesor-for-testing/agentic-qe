/**
 * Agentic QE v3 - Test Data Generator Service
 * Generates realistic test data using @faker-js/faker
 *
 * Extracted from TestGeneratorService to follow Single Responsibility Principle
 */

import { Faker, faker as fakerEN, allLocales, base, en } from '@faker-js/faker';
import type { LocaleDefinition } from '@faker-js/faker';
import { TestDataRequest, TestData } from '../interfaces';
import { secureRandomInt } from '../../../shared/utils/crypto-random.js';

/**
 * Schema field definition for test data generation
 */
interface SchemaField {
  type: string;
  faker?: string;
  min?: number;
  max?: number;
  enum?: string[];
  pattern?: string;
  reference?: string;
}

/**
 * Interface for test data generation service
 * Enables dependency injection and mocking
 */
export interface ITestDataGeneratorService {
  generateTestData(request: TestDataRequest): Promise<TestData>;
}

/**
 * Test Data Generator Service
 * Generates realistic test data based on schemas with locale support
 */
export class TestDataGeneratorService implements ITestDataGeneratorService {
  private fakerCache = new Map<string, Faker>();

  /**
   * Get or create a Faker instance for the given locale.
   * Caches instances to avoid repeated construction.
   */
  private getFaker(locale: string): Faker {
    const cached = this.fakerCache.get(locale);
    if (cached) return cached;

    const localeData = (allLocales as Record<string, LocaleDefinition>)[locale];
    let instance: Faker;
    if (localeData && locale !== 'en') {
      instance = new Faker({ locale: [localeData, en, base] });
    } else {
      instance = fakerEN;
    }

    this.fakerCache.set(locale, instance);
    return instance;
  }

  /**
   * Generate test data based on schema
   */
  async generateTestData(request: TestDataRequest): Promise<TestData> {
    const { schema, count, locale = 'en', preserveRelationships = false } = request;

    const seed = Date.now();
    const f = this.getFaker(locale);
    const records: unknown[] = [];

    for (let i = 0; i < count; i++) {
      const record = this.generateRecordFromSchema(f, schema, seed + i);
      records.push(record);
    }

    if (preserveRelationships) {
      this.linkRelatedRecords(f, records, schema);
    }

    return {
      records,
      schema,
      seed,
    };
  }

  private generateRecordFromSchema(
    f: Faker,
    schema: Record<string, unknown>,
    seed: number,
  ): Record<string, unknown> {
    f.seed(seed);

    const record: Record<string, unknown> = {};
    for (const [key, fieldDef] of Object.entries(schema)) {
      record[key] = this.generateValueForField(f, key, fieldDef);
    }

    return record;
  }

  private generateValueForField(
    f: Faker,
    fieldName: string,
    fieldDef: unknown,
  ): unknown {
    if (typeof fieldDef === 'string') {
      return this.generateValueForType(f, fieldDef, fieldName);
    }

    if (typeof fieldDef === 'object' && fieldDef !== null) {
      const field = fieldDef as SchemaField;
      if (field.faker) {
        return this.callFakerMethod(f, field.faker);
      }
      return this.generateValueForType(f, field.type, fieldName, field);
    }

    return null;
  }

  private generateValueForType(
    f: Faker,
    type: string,
    fieldName: string,
    options?: SchemaField
  ): unknown {
    const normalizedType = type.toLowerCase();

    switch (normalizedType) {
      case 'string': return this.generateStringValue(f, fieldName, options);
      case 'number':
      case 'int':
      case 'integer': return this.generateNumberValue(f, options);
      case 'float':
      case 'decimal': return f.number.float({ min: options?.min ?? 0, max: options?.max ?? 1000, fractionDigits: 2 });
      case 'boolean':
      case 'bool': return f.datatype.boolean();
      case 'date':
      case 'datetime': return f.date.recent().toISOString();
      case 'email': return f.internet.email();
      case 'uuid':
      case 'id': return f.string.uuid();
      case 'url': return f.internet.url();
      case 'phone': return f.phone.number();
      case 'address': return this.generateAddress(f);
      case 'name':
      case 'fullname': return f.person.fullName();
      case 'firstname': return f.person.firstName();
      case 'lastname': return f.person.lastName();
      case 'username': return f.internet.username();
      case 'password': return f.internet.password();
      case 'company': return f.company.name();
      case 'jobtitle': return f.person.jobTitle();
      case 'text':
      case 'paragraph': return f.lorem.paragraph();
      case 'sentence': return f.lorem.sentence();
      case 'word':
      case 'words': return f.lorem.word();
      case 'avatar':
      case 'image': return f.image.avatar();
      case 'color': return f.color.rgb();
      case 'ipaddress':
      case 'ip': return f.internet.ipv4();
      case 'mac': return f.internet.mac();
      case 'latitude': return f.location.latitude();
      case 'longitude': return f.location.longitude();
      case 'country': return f.location.country();
      case 'city': return f.location.city();
      case 'zipcode':
      case 'postalcode': return f.location.zipCode();
      case 'creditcard': return f.finance.creditCardNumber();
      case 'currency': return f.finance.currencyCode();
      case 'amount':
      case 'price': return f.finance.amount();
      case 'json':
      case 'object': return { key: f.lorem.word(), value: f.lorem.sentence() };
      case 'array': return [f.lorem.word(), f.lorem.word(), f.lorem.word()];
      case 'enum':
        if (options?.enum && options.enum.length > 0) {
          return f.helpers.arrayElement(options.enum);
        }
        return f.lorem.word();
      default:
        return this.inferValueFromFieldName(f, fieldName);
    }
  }

  private generateStringValue(f: Faker, fieldName: string, options?: SchemaField): string {
    const lowerName = fieldName.toLowerCase();

    if (lowerName.includes('email')) return f.internet.email();
    if (lowerName.includes('name') && lowerName.includes('first')) return f.person.firstName();
    if (lowerName.includes('name') && lowerName.includes('last')) return f.person.lastName();
    if (lowerName.includes('name')) return f.person.fullName();
    if (lowerName.includes('phone')) return f.phone.number();
    if (lowerName.includes('address')) return f.location.streetAddress();
    if (lowerName.includes('city')) return f.location.city();
    if (lowerName.includes('country')) return f.location.country();
    if (lowerName.includes('zip') || lowerName.includes('postal')) return f.location.zipCode();
    if (lowerName.includes('url') || lowerName.includes('website')) return f.internet.url();
    if (lowerName.includes('username') || lowerName.includes('user')) return f.internet.username();
    if (lowerName.includes('password')) return f.internet.password();
    if (lowerName.includes('description') || lowerName.includes('bio')) return f.lorem.paragraph();
    if (lowerName.includes('title')) return f.lorem.sentence();
    if (lowerName.includes('company')) return f.company.name();
    if (lowerName.includes('job')) return f.person.jobTitle();
    if (lowerName.includes('avatar') || lowerName.includes('image')) return f.image.avatar();

    if (options?.pattern) {
      return f.helpers.fromRegExp(options.pattern);
    }

    return f.lorem.words(3);
  }

  private generateNumberValue(f: Faker, options?: SchemaField): number {
    const min = options?.min ?? 0;
    const max = options?.max ?? 10000;
    return f.number.int({ min, max });
  }

  private generateAddress(f: Faker): Record<string, string> {
    return {
      street: f.location.streetAddress(),
      city: f.location.city(),
      state: f.location.state(),
      zipCode: f.location.zipCode(),
      country: f.location.country(),
    };
  }

  private inferValueFromFieldName(f: Faker, fieldName: string): unknown {
    const lowerName = fieldName.toLowerCase();

    if (lowerName.includes('id')) return f.string.uuid();
    if (lowerName.includes('email')) return f.internet.email();
    if (lowerName.includes('name')) return f.person.fullName();
    if (lowerName.includes('phone')) return f.phone.number();
    if (lowerName.includes('date') || lowerName.includes('time')) return f.date.recent().toISOString();
    if (lowerName.includes('url')) return f.internet.url();
    if (lowerName.includes('count') || lowerName.includes('amount')) return f.number.int({ min: 0, max: 100 });
    if (lowerName.includes('price')) return f.finance.amount();
    if (lowerName.includes('active') || lowerName.includes('enabled') || lowerName.includes('is')) {
      return f.datatype.boolean();
    }

    return f.lorem.word();
  }

  private callFakerMethod(f: Faker, methodPath: string): unknown {
    try {
      const parts = methodPath.split('.');
      let result: unknown = f;

      for (const part of parts) {
        if (result && typeof result === 'object' && part in result) {
          const next = (result as Record<string, unknown>)[part];
          if (typeof next === 'function') {
            result = (next as () => unknown)();
          } else {
            result = next;
          }
        } else {
          return f.lorem.word();
        }
      }

      return result;
    } catch {
      return f.lorem.word();
    }
  }

  private linkRelatedRecords(
    f: Faker,
    records: unknown[],
    schema: Record<string, unknown>
  ): void {
    const referenceFields: Array<{ field: string; reference: string }> = [];

    for (const [key, fieldDef] of Object.entries(schema)) {
      if (typeof fieldDef === 'object' && fieldDef !== null) {
        const field = fieldDef as SchemaField;
        if (field.reference) {
          referenceFields.push({ field: key, reference: field.reference });
        }
      }
    }

    if (referenceFields.length > 0) {
      for (let i = 0; i < records.length; i++) {
        const record = records[i] as Record<string, unknown>;
        for (const { field, reference } of referenceFields) {
          if (i > 0 && reference === 'id') {
            const prevRecord = records[secureRandomInt(0, i)] as Record<string, unknown>;
            record[field] = prevRecord['id'] ?? f.string.uuid();
          } else {
            record[field] = f.string.uuid();
          }
        }
      }
    }
  }
}
