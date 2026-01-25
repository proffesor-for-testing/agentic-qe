/**
 * Agentic QE v3 - Test Data Generator Service
 * Generates realistic test data using @faker-js/faker
 *
 * Extracted from TestGeneratorService to follow Single Responsibility Principle
 */

import { faker } from '@faker-js/faker';
import { TestDataRequest, TestData } from '../interfaces';

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
 * Generates realistic test data based on schemas
 */
export class TestDataGeneratorService implements ITestDataGeneratorService {
  /**
   * Generate test data based on schema
   */
  async generateTestData(request: TestDataRequest): Promise<TestData> {
    const { schema, count, locale = 'en', preserveRelationships = false } = request;

    const seed = Date.now();
    const records: unknown[] = [];

    for (let i = 0; i < count; i++) {
      const record = this.generateRecordFromSchema(schema, seed + i, locale);
      records.push(record);
    }

    if (preserveRelationships) {
      this.linkRelatedRecords(records, schema);
    }

    return {
      records,
      schema,
      seed,
    };
  }

  private generateRecordFromSchema(
    schema: Record<string, unknown>,
    seed: number,
    locale: string
  ): Record<string, unknown> {
    faker.seed(seed);
    if (locale && locale !== 'en') {
      // Note: faker v8+ uses different locale handling
    }

    const record: Record<string, unknown> = {};
    for (const [key, fieldDef] of Object.entries(schema)) {
      record[key] = this.generateValueForField(key, fieldDef, seed);
    }

    return record;
  }

  private generateValueForField(
    fieldName: string,
    fieldDef: unknown,
    _seed: number
  ): unknown {
    if (typeof fieldDef === 'string') {
      return this.generateValueForType(fieldDef, fieldName);
    }

    if (typeof fieldDef === 'object' && fieldDef !== null) {
      const field = fieldDef as SchemaField;
      if (field.faker) {
        return this.callFakerMethod(field.faker);
      }
      return this.generateValueForType(field.type, fieldName, field);
    }

    return null;
  }

  private generateValueForType(
    type: string,
    fieldName: string,
    options?: SchemaField
  ): unknown {
    const normalizedType = type.toLowerCase();

    switch (normalizedType) {
      case 'string': return this.generateStringValue(fieldName, options);
      case 'number':
      case 'int':
      case 'integer': return this.generateNumberValue(options);
      case 'float':
      case 'decimal': return faker.number.float({ min: options?.min ?? 0, max: options?.max ?? 1000, fractionDigits: 2 });
      case 'boolean':
      case 'bool': return faker.datatype.boolean();
      case 'date':
      case 'datetime': return faker.date.recent().toISOString();
      case 'email': return faker.internet.email();
      case 'uuid':
      case 'id': return faker.string.uuid();
      case 'url': return faker.internet.url();
      case 'phone': return faker.phone.number();
      case 'address': return this.generateAddress();
      case 'name':
      case 'fullname': return faker.person.fullName();
      case 'firstname': return faker.person.firstName();
      case 'lastname': return faker.person.lastName();
      case 'username': return faker.internet.username();
      case 'password': return faker.internet.password();
      case 'company': return faker.company.name();
      case 'jobtitle': return faker.person.jobTitle();
      case 'text':
      case 'paragraph': return faker.lorem.paragraph();
      case 'sentence': return faker.lorem.sentence();
      case 'word':
      case 'words': return faker.lorem.word();
      case 'avatar':
      case 'image': return faker.image.avatar();
      case 'color': return faker.color.rgb();
      case 'ipaddress':
      case 'ip': return faker.internet.ipv4();
      case 'mac': return faker.internet.mac();
      case 'latitude': return faker.location.latitude();
      case 'longitude': return faker.location.longitude();
      case 'country': return faker.location.country();
      case 'city': return faker.location.city();
      case 'zipcode':
      case 'postalcode': return faker.location.zipCode();
      case 'creditcard': return faker.finance.creditCardNumber();
      case 'currency': return faker.finance.currencyCode();
      case 'amount':
      case 'price': return faker.finance.amount();
      case 'json':
      case 'object': return { key: faker.lorem.word(), value: faker.lorem.sentence() };
      case 'array': return [faker.lorem.word(), faker.lorem.word(), faker.lorem.word()];
      case 'enum':
        if (options?.enum && options.enum.length > 0) {
          return faker.helpers.arrayElement(options.enum);
        }
        return faker.lorem.word();
      default:
        return this.inferValueFromFieldName(fieldName);
    }
  }

  private generateStringValue(fieldName: string, options?: SchemaField): string {
    const lowerName = fieldName.toLowerCase();

    if (lowerName.includes('email')) return faker.internet.email();
    if (lowerName.includes('name') && lowerName.includes('first')) return faker.person.firstName();
    if (lowerName.includes('name') && lowerName.includes('last')) return faker.person.lastName();
    if (lowerName.includes('name')) return faker.person.fullName();
    if (lowerName.includes('phone')) return faker.phone.number();
    if (lowerName.includes('address')) return faker.location.streetAddress();
    if (lowerName.includes('city')) return faker.location.city();
    if (lowerName.includes('country')) return faker.location.country();
    if (lowerName.includes('zip') || lowerName.includes('postal')) return faker.location.zipCode();
    if (lowerName.includes('url') || lowerName.includes('website')) return faker.internet.url();
    if (lowerName.includes('username') || lowerName.includes('user')) return faker.internet.username();
    if (lowerName.includes('password')) return faker.internet.password();
    if (lowerName.includes('description') || lowerName.includes('bio')) return faker.lorem.paragraph();
    if (lowerName.includes('title')) return faker.lorem.sentence();
    if (lowerName.includes('company')) return faker.company.name();
    if (lowerName.includes('job')) return faker.person.jobTitle();
    if (lowerName.includes('avatar') || lowerName.includes('image')) return faker.image.avatar();

    if (options?.pattern) {
      return faker.helpers.fromRegExp(options.pattern);
    }

    return faker.lorem.words(3);
  }

  private generateNumberValue(options?: SchemaField): number {
    const min = options?.min ?? 0;
    const max = options?.max ?? 10000;
    return faker.number.int({ min, max });
  }

  private generateAddress(): Record<string, string> {
    return {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      zipCode: faker.location.zipCode(),
      country: faker.location.country(),
    };
  }

  private inferValueFromFieldName(fieldName: string): unknown {
    const lowerName = fieldName.toLowerCase();

    if (lowerName.includes('id')) return faker.string.uuid();
    if (lowerName.includes('email')) return faker.internet.email();
    if (lowerName.includes('name')) return faker.person.fullName();
    if (lowerName.includes('phone')) return faker.phone.number();
    if (lowerName.includes('date') || lowerName.includes('time')) return faker.date.recent().toISOString();
    if (lowerName.includes('url')) return faker.internet.url();
    if (lowerName.includes('count') || lowerName.includes('amount')) return faker.number.int({ min: 0, max: 100 });
    if (lowerName.includes('price')) return faker.finance.amount();
    if (lowerName.includes('active') || lowerName.includes('enabled') || lowerName.includes('is')) {
      return faker.datatype.boolean();
    }

    return faker.lorem.word();
  }

  private callFakerMethod(methodPath: string): unknown {
    try {
      const parts = methodPath.split('.');
      let result: unknown = faker;

      for (const part of parts) {
        if (result && typeof result === 'object' && part in result) {
          const next = (result as Record<string, unknown>)[part];
          if (typeof next === 'function') {
            result = (next as () => unknown)();
          } else {
            result = next;
          }
        } else {
          return faker.lorem.word();
        }
      }

      return result;
    } catch {
      return faker.lorem.word();
    }
  }

  private linkRelatedRecords(
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
            const prevRecord = records[Math.floor(Math.random() * i)] as Record<string, unknown>;
            record[field] = prevRecord['id'] ?? faker.string.uuid();
          } else {
            record[field] = faker.string.uuid();
          }
        }
      }
    }
  }
}
