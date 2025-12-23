/**
 * Edge Cases Fixture for Chunking Tests
 *
 * Purpose: Test AST chunker's handling of unusual and edge case scenarios
 *
 * Includes:
 * - Empty functions
 * - Single-line functions
 * - Unicode identifiers
 * - Decorators
 * - Generic types
 * - JSX/TSX content
 * - Very long strings
 * - Nested callbacks
 * - Malformed code (commented out)
 */

// ============================================================================
// Empty and minimal functions
// ============================================================================

export function emptyFunction() {}

export const emptyArrow = () => {};

export function emptyWithReturn() {
  return;
}

// ============================================================================
// Single-line functions
// ============================================================================

export const identity = <T>(x: T): T => x;

export const add = (a: number, b: number): number => a + b;

export const isEven = (n: number): boolean => n % 2 === 0;

// ============================================================================
// Unicode identifiers and content
// ============================================================================

export function café() {
  const π = 3.14159;
  const message = "Café ☕";
  return { π, message };
}

export const 日本語関数 = () => {
  return "こんにちは";
};

export function emojiTest() {
  const rocket = "🚀";
  const computer = "💻";
  const celebration = "🎉";
  return { rocket, computer, celebration };
}

// ============================================================================
// Decorators (TypeScript)
// ============================================================================

function Injectable() {
  return function (target: any) {
    // Decorator implementation
  };
}

function Controller(route: string) {
  return function (target: any) {
    // Decorator implementation
  };
}

@Injectable()
@Controller('/api/users')
export class UserController {
  @Injectable()
  private service: any;

  async getUsers() {
    return [];
  }
}

// ============================================================================
// Generic types and constraints
// ============================================================================

export function genericIdentity<T>(arg: T): T {
  return arg;
}

export function loggingIdentity<T extends { length: number }>(arg: T): T {
  console.log(arg.length);
  return arg;
}

export class GenericRepository<T, K extends keyof T> {
  private items: Map<T[K], T> = new Map();

  add(item: T, key: K): void {
    this.items.set(item[key], item);
  }

  get(key: T[K]): T | undefined {
    return this.items.get(key);
  }
}

// ============================================================================
// JSX/TSX content
// ============================================================================

export function SimpleComponent({ title }: { title: string }) {
  return (
    <div className="container">
      <h1>{title}</h1>
      <p>This is a simple component</p>
    </div>
  );
}

export const ComplexComponent = ({ data }: { data: any[] }) => {
  return (
    <div>
      {data.map((item, index) => (
        <div key={index}>
          <span>{item.name}</span>
          <button onClick={() => console.log(item)}>
            Click me
          </button>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// Very long strings and template literals
// ============================================================================

export const longString = "This is a very long string that continues for many characters and might cause issues with token counting or chunking algorithms if not handled properly. It includes multiple sentences and goes on and on to test how the chunker handles content that exceeds typical line lengths. The quick brown fox jumps over the lazy dog, and then continues jumping for quite some time across multiple meadows and fields.";

export const longTemplate = `
  This is a multi-line template literal
  that spans many lines and includes
  various types of content including:
  - Lists
  - Code: ${1 + 1}
  - Expressions: ${'nested'.toUpperCase()}
  - More text that goes on and on

  And even more content here
  to test chunking behavior
  with template literals
`;

// ============================================================================
// Deep nesting
// ============================================================================

export function deeplyNested() {
  function level1() {
    function level2() {
      function level3() {
        function level4() {
          function level5() {
            return "Deep down";
          }
          return level5();
        }
        return level4();
      }
      return level3();
    }
    return level2();
  }
  return level1();
}

// ============================================================================
// Complex callbacks and closures
// ============================================================================

export function callbackHell() {
  setTimeout(() => {
    console.log("First");
    setTimeout(() => {
      console.log("Second");
      setTimeout(() => {
        console.log("Third");
        setTimeout(() => {
          console.log("Fourth");
        }, 100);
      }, 100);
    }, 100);
  }, 100);
}

export const higherOrderFunction = (fn: (x: number) => number) => {
  return (y: number) => {
    return (z: number) => {
      return fn(x => x + y + z);
    };
  };
};

// ============================================================================
// Unusual method signatures
// ============================================================================

export class UnusualMethods {
  // Static async method
  static async staticAsyncMethod(): Promise<void> {
    return Promise.resolve();
  }

  // Private async method
  private async privateAsyncMethod(): Promise<number> {
    return 42;
  }

  // Protected method with many parameters
  protected manyParameters(
    a: string,
    b: number,
    c: boolean,
    d: object,
    e: any[],
    f?: string,
    g?: number
  ): void {
    // Implementation
  }

  // Method with rest parameters
  spreadMethod(...args: any[]): any[] {
    return args;
  }

  // Method with destructured parameters
  destructuredParams({ a, b, c }: { a: number; b: string; c: boolean }): void {
    console.log(a, b, c);
  }
}

// ============================================================================
// Mixed visibility and modifiers
// ============================================================================

export class ModifierTest {
  public publicField = 1;
  private privateField = 2;
  protected protectedField = 3;
  readonly readonlyField = 4;
  static staticField = 5;

  public async publicAsyncMethod() {}
  private async privateAsyncMethod() {}
  protected async protectedAsyncMethod() {}
  static async staticAsyncMethod() {}
}

// ============================================================================
// Type aliases and interfaces
// ============================================================================

export type ComplexType = {
  [key: string]: {
    nested: {
      deeply: {
        value: number;
      };
    };
  };
};

export interface ComplexInterface {
  method1(): void;
  method2(arg: string): Promise<number>;
  property: {
    nested: {
      value: string;
    };
  };
}

// ============================================================================
// Enum edge cases
// ============================================================================

export enum StringEnum {
  One = "one",
  Two = "two",
  Three = "three",
}

export enum ComputedEnum {
  A = 1 << 0,
  B = 1 << 1,
  C = 1 << 2,
}

// ============================================================================
// Namespace (rare but valid)
// ============================================================================

export namespace MyNamespace {
  export function namespaceFunction() {
    return "inside namespace";
  }

  export class NamespaceClass {
    method() {}
  }
}

// ============================================================================
// Comments and documentation edge cases
// ============================================================================

/**
 * Function with extensive JSDoc
 * @param input - The input parameter
 * @returns The output value
 * @throws {Error} When input is invalid
 * @example
 * ```typescript
 * const result = withJSDoc("test");
 * ```
 */
export function withJSDoc(input: string): string {
  /* Multi-line comment
     that spans several lines
     and includes various content */
  return input;
  // Trailing comment
}

// ============================================================================
// Malformed code (commented out to not break parsing)
// ============================================================================

// function malformed() {
//   // Missing closing brace

// const incomplete =

// function unclosed() {
//   if (true) {
//     console.log("missing brace");

// ============================================================================
// Special characters in strings
// ============================================================================

export const specialChars = {
  backslash: "\\",
  quote: "\"",
  singleQuote: "'",
  newline: "\n",
  tab: "\t",
  unicode: "\u0041",
  emoji: "😀",
};

// ============================================================================
// Regex patterns
// ============================================================================

export const regexPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\//,
  complex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/,
};

// ============================================================================
// Export everything edge cases
// ============================================================================

const internal1 = 1;
const internal2 = 2;
const internal3 = 3;

export { internal1, internal2, internal3 };

export * from './other-module'; // Re-export

export { default as DefaultExport } from './another-module';
