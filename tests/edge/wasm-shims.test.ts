/**
 * WASM Shims Unit Tests
 *
 * Comprehensive tests for WebAssembly compatibility shims that enable
 * Node.js APIs to work in browser environments. Tests each shim function
 * for correct behavior and browser compatibility.
 *
 * @module tests/edge/wasm-shims.test
 */

import { createResourceCleanup } from '../helpers/cleanup';

/**
 * WASM Shims - Compatibility layer for browser environments
 * Provides browser-compatible implementations of Node.js APIs
 */

// Buffer shim for browser environments
class BufferShim {
  private data: Uint8Array;

  constructor(input: string | ArrayBuffer | Uint8Array | number[], encoding?: BufferEncoding) {
    if (typeof input === 'string') {
      this.data = new TextEncoder().encode(input);
    } else if (input instanceof ArrayBuffer) {
      this.data = new Uint8Array(input);
    } else if (input instanceof Uint8Array) {
      this.data = new Uint8Array(input);
    } else if (Array.isArray(input)) {
      this.data = new Uint8Array(input);
    } else {
      this.data = new Uint8Array(0);
    }
  }

  static from(input: string | ArrayBuffer | Uint8Array | number[], encoding?: BufferEncoding): BufferShim {
    return new BufferShim(input, encoding);
  }

  static alloc(size: number, fill?: number): BufferShim {
    const arr = new Uint8Array(size);
    if (fill !== undefined) {
      arr.fill(fill);
    }
    return new BufferShim(arr);
  }

  static allocUnsafe(size: number): BufferShim {
    return new BufferShim(new Uint8Array(size));
  }

  static concat(buffers: BufferShim[], totalLength?: number): BufferShim {
    const total = totalLength ?? buffers.reduce((sum, b) => sum + b.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const buf of buffers) {
      result.set(buf.toUint8Array(), offset);
      offset += buf.length;
    }
    return new BufferShim(result);
  }

  static isBuffer(obj: unknown): obj is BufferShim {
    return obj instanceof BufferShim;
  }

  get length(): number {
    return this.data.length;
  }

  toString(encoding?: BufferEncoding): string {
    return new TextDecoder().decode(this.data);
  }

  toJSON(): { type: 'Buffer'; data: number[] } {
    return {
      type: 'Buffer',
      data: Array.from(this.data),
    };
  }

  toUint8Array(): Uint8Array {
    return this.data;
  }

  slice(start?: number, end?: number): BufferShim {
    return new BufferShim(this.data.slice(start, end));
  }

  copy(target: BufferShim, targetStart = 0, sourceStart = 0, sourceEnd?: number): number {
    const source = this.data.slice(sourceStart, sourceEnd);
    target.data.set(source, targetStart);
    return source.length;
  }

  write(string: string, offset = 0, length?: number, encoding?: BufferEncoding): number {
    const encoded = new TextEncoder().encode(string);
    const bytesToWrite = Math.min(encoded.length, length ?? encoded.length, this.data.length - offset);
    this.data.set(encoded.slice(0, bytesToWrite), offset);
    return bytesToWrite;
  }

  readUInt8(offset: number): number {
    return this.data[offset];
  }

  writeUInt8(value: number, offset: number): number {
    this.data[offset] = value;
    return offset + 1;
  }

  readUInt32LE(offset: number): number {
    return (
      this.data[offset] |
      (this.data[offset + 1] << 8) |
      (this.data[offset + 2] << 16) |
      (this.data[offset + 3] << 24)
    ) >>> 0;
  }

  writeUInt32LE(value: number, offset: number): number {
    this.data[offset] = value & 0xff;
    this.data[offset + 1] = (value >> 8) & 0xff;
    this.data[offset + 2] = (value >> 16) & 0xff;
    this.data[offset + 3] = (value >> 24) & 0xff;
    return offset + 4;
  }

  equals(other: BufferShim): boolean {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) {
      if (this.data[i] !== other.data[i]) return false;
    }
    return true;
  }

  fill(value: number, offset = 0, end?: number): this {
    this.data.fill(value, offset, end);
    return this;
  }
}

type BufferEncoding = 'utf8' | 'utf-8' | 'hex' | 'base64' | 'ascii' | 'binary';

// Crypto shim using Web Crypto API
const cryptoShim = {
  randomBytes(size: number): BufferShim {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return BufferShim.from(bytes);
  },

  randomUUID(): string {
    return crypto.randomUUID();
  },

  async createHash(algorithm: string): Promise<HashShim> {
    return new HashShim(algorithm);
  },
};

class HashShim {
  private algorithm: string;
  private data: Uint8Array[] = [];

  constructor(algorithm: string) {
    this.algorithm = algorithm.replace('-', '').toUpperCase();
  }

  update(data: string | BufferShim): this {
    if (typeof data === 'string') {
      this.data.push(new TextEncoder().encode(data));
    } else {
      this.data.push(data.toUint8Array());
    }
    return this;
  }

  async digest(encoding?: 'hex' | 'base64'): Promise<string> {
    const combined = BufferShim.concat(this.data.map(d => BufferShim.from(d)));
    const hashBuffer = await crypto.subtle.digest(
      this.algorithm === 'SHA256' ? 'SHA-256' : this.algorithm,
      combined.toUint8Array().buffer as ArrayBuffer
    );
    const hashArray = new Uint8Array(hashBuffer);
    const hashBytes = Array.from(hashArray);

    if (encoding === 'hex') {
      return hashBytes
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } else if (encoding === 'base64') {
      return btoa(String.fromCharCode.apply(null, hashBytes));
    }

    return hashBytes
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

// Path shim for browser environments
const pathShim = {
  sep: '/',

  join(...paths: string[]): string {
    return paths
      .filter(Boolean)
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '') || '/';
  },

  resolve(...paths: string[]): string {
    let resolved = '';
    for (const path of paths.reverse()) {
      resolved = this.join(path, resolved);
      if (path.startsWith('/')) break;
    }
    return resolved.startsWith('/') ? resolved : '/' + resolved;
  },

  dirname(path: string): string {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? '/' + parts.join('/') : '/';
  },

  basename(path: string, ext?: string): string {
    const parts = path.split('/').filter(Boolean);
    let name = parts.pop() || '';
    if (ext && name.endsWith(ext)) {
      name = name.slice(0, -ext.length);
    }
    return name;
  },

  extname(path: string): string {
    const basename = this.basename(path);
    const dotIndex = basename.lastIndexOf('.');
    return dotIndex > 0 ? basename.slice(dotIndex) : '';
  },

  normalize(path: string): string {
    const parts = path.split('/');
    const result: string[] = [];

    for (const part of parts) {
      if (part === '..') {
        result.pop();
      } else if (part !== '.' && part !== '') {
        result.push(part);
      }
    }

    return (path.startsWith('/') ? '/' : '') + result.join('/');
  },

  isAbsolute(path: string): boolean {
    return path.startsWith('/');
  },

  relative(from: string, to: string): string {
    const fromParts = this.normalize(from).split('/').filter(Boolean);
    const toParts = this.normalize(to).split('/').filter(Boolean);

    let commonLength = 0;
    for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
      if (fromParts[i] === toParts[i]) {
        commonLength++;
      } else {
        break;
      }
    }

    const upCount = fromParts.length - commonLength;
    const downParts = toParts.slice(commonLength);

    return [...Array(upCount).fill('..'), ...downParts].join('/');
  },
};

// Process shim for browser environments
const processShim = {
  env: {} as Record<string, string | undefined>,
  platform: 'browser' as const,
  arch: 'wasm32' as const,
  version: 'v18.0.0',
  versions: {
    node: '18.0.0',
    v8: '10.0.0',
  },

  cwd(): string {
    return '/';
  },

  nextTick(callback: () => void): void {
    queueMicrotask(callback);
  },

  hrtime(previousTimestamp?: [number, number]): [number, number] {
    const now = performance.now();
    const seconds = Math.floor(now / 1000);
    const nanoseconds = Math.floor((now % 1000) * 1e6);

    if (previousTimestamp) {
      let diffSeconds = seconds - previousTimestamp[0];
      let diffNanos = nanoseconds - previousTimestamp[1];

      if (diffNanos < 0) {
        diffSeconds--;
        diffNanos += 1e9;
      }

      return [diffSeconds, diffNanos];
    }

    return [seconds, nanoseconds];
  },

  memoryUsage(): { heapUsed: number; heapTotal: number; external: number; rss: number } {
    const memory = (performance as any).memory;
    if (memory) {
      return {
        heapUsed: memory.usedJSHeapSize,
        heapTotal: memory.totalJSHeapSize,
        external: 0,
        rss: memory.totalJSHeapSize,
      };
    }
    return { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };
  },
};

// EventEmitter shim
class EventEmitterShim {
  private events: Map<string, Set<Function>> = new Map();
  private maxListeners: number = 10;

  on(event: string, listener: Function): this {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener);
    return this;
  }

  once(event: string, listener: Function): this {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: Function): this {
    this.events.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this.events.get(event);
    if (!listeners || listeners.size === 0) return false;

    const listenerArray = Array.from(listeners);
    for (const listener of listenerArray) {
      try {
        listener(...args);
      } catch (error) {
        console.error('EventEmitter listener error:', error);
      }
    }
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  listenerCount(event: string): number {
    return this.events.get(event)?.size ?? 0;
  }

  setMaxListeners(n: number): this {
    this.maxListeners = n;
    return this;
  }

  getMaxListeners(): number {
    return this.maxListeners;
  }
}

// Feature detection utilities
const featureDetection = {
  isWasmSupported(): boolean {
    try {
      return typeof WebAssembly === 'object' &&
        typeof WebAssembly.instantiate === 'function';
    } catch {
      return false;
    }
  },

  isSharedArrayBufferSupported(): boolean {
    try {
      return typeof SharedArrayBuffer !== 'undefined';
    } catch {
      return false;
    }
  },

  isAtomicsSupported(): boolean {
    try {
      return typeof Atomics !== 'undefined';
    } catch {
      return false;
    }
  },

  isBigIntSupported(): boolean {
    try {
      return typeof BigInt !== 'undefined';
    } catch {
      return false;
    }
  },

  isWebCryptoSupported(): boolean {
    try {
      return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
    } catch {
      return false;
    }
  },

  isIndexedDBSupported(): boolean {
    try {
      return typeof indexedDB !== 'undefined';
    } catch {
      return false;
    }
  },

  getMaxMemory(): number {
    const memory = (performance as any).memory;
    if (memory) {
      return memory.jsHeapSizeLimit;
    }
    return 2 * 1024 * 1024 * 1024; // Default 2GB
  },
};

describe('WASM Shims', () => {
  const cleanup = createResourceCleanup();

  afterEach(async () => {
    await cleanup.afterEach();
  });

  describe('BufferShim', () => {
    describe('Construction', () => {
      it('should create buffer from string', () => {
        const buf = BufferShim.from('hello');

        expect(buf.toString()).toBe('hello');
        expect(buf.length).toBe(5);
      });

      it('should create buffer from Uint8Array', () => {
        const arr = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
        const buf = BufferShim.from(arr);

        expect(buf.toString()).toBe('Hello');
      });

      it('should create buffer from number array', () => {
        const buf = BufferShim.from([65, 66, 67]); // "ABC"

        expect(buf.toString()).toBe('ABC');
      });

      it('should create buffer from ArrayBuffer', () => {
        const arrayBuffer = new Uint8Array([88, 89, 90]).buffer;
        const buf = BufferShim.from(arrayBuffer);

        expect(buf.toString()).toBe('XYZ');
      });

      it('should allocate zero-filled buffer', () => {
        const buf = BufferShim.alloc(10);

        expect(buf.length).toBe(10);
        for (let i = 0; i < 10; i++) {
          expect(buf.readUInt8(i)).toBe(0);
        }
      });

      it('should allocate filled buffer', () => {
        const buf = BufferShim.alloc(5, 42);

        expect(buf.length).toBe(5);
        for (let i = 0; i < 5; i++) {
          expect(buf.readUInt8(i)).toBe(42);
        }
      });

      it('should allocate unsafe buffer', () => {
        const buf = BufferShim.allocUnsafe(10);

        expect(buf.length).toBe(10);
      });
    });

    describe('Static Methods', () => {
      it('should concatenate multiple buffers', () => {
        const buf1 = BufferShim.from('Hello');
        const buf2 = BufferShim.from(' ');
        const buf3 = BufferShim.from('World');

        const result = BufferShim.concat([buf1, buf2, buf3]);

        expect(result.toString()).toBe('Hello World');
      });

      it('should concatenate with specified length', () => {
        const buf1 = BufferShim.from('Hello');
        const buf2 = BufferShim.from('World');

        const result = BufferShim.concat([buf1, buf2], 8);

        expect(result.length).toBe(8);
        expect(result.toString()).toBe('HelloWor');
      });

      it('should detect buffer instances', () => {
        const buf = BufferShim.from('test');
        const notBuf = new Uint8Array([1, 2, 3]);

        expect(BufferShim.isBuffer(buf)).toBe(true);
        expect(BufferShim.isBuffer(notBuf)).toBe(false);
        expect(BufferShim.isBuffer('string')).toBe(false);
      });
    });

    describe('Instance Methods', () => {
      it('should convert to JSON', () => {
        const buf = BufferShim.from([1, 2, 3, 4]);
        const json = buf.toJSON();

        expect(json).toEqual({
          type: 'Buffer',
          data: [1, 2, 3, 4],
        });
      });

      it('should slice buffer', () => {
        const buf = BufferShim.from('Hello World');
        const sliced = buf.slice(0, 5);

        expect(sliced.toString()).toBe('Hello');
      });

      it('should copy to another buffer', () => {
        const source = BufferShim.from('Hello');
        const target = BufferShim.alloc(10);

        const copied = source.copy(target);

        expect(copied).toBe(5);
        expect(target.toString().slice(0, 5)).toBe('Hello');
      });

      it('should write string to buffer', () => {
        const buf = BufferShim.alloc(10);
        const written = buf.write('Hi', 2);

        expect(written).toBe(2);
        expect(buf.readUInt8(2)).toBe(72); // 'H'
        expect(buf.readUInt8(3)).toBe(105); // 'i'
      });

      it('should read/write UInt8', () => {
        const buf = BufferShim.alloc(4);

        buf.writeUInt8(255, 0);
        buf.writeUInt8(0, 1);
        buf.writeUInt8(128, 2);

        expect(buf.readUInt8(0)).toBe(255);
        expect(buf.readUInt8(1)).toBe(0);
        expect(buf.readUInt8(2)).toBe(128);
      });

      it('should read/write UInt32LE', () => {
        const buf = BufferShim.alloc(8);

        buf.writeUInt32LE(0x12345678, 0);
        buf.writeUInt32LE(0xDEADBEEF, 4);

        expect(buf.readUInt32LE(0)).toBe(0x12345678);
        expect(buf.readUInt32LE(4)).toBe(0xDEADBEEF);
      });

      it('should compare buffers for equality', () => {
        const buf1 = BufferShim.from([1, 2, 3]);
        const buf2 = BufferShim.from([1, 2, 3]);
        const buf3 = BufferShim.from([1, 2, 4]);

        expect(buf1.equals(buf2)).toBe(true);
        expect(buf1.equals(buf3)).toBe(false);
      });

      it('should fill buffer with value', () => {
        const buf = BufferShim.alloc(5);
        buf.fill(42);

        for (let i = 0; i < 5; i++) {
          expect(buf.readUInt8(i)).toBe(42);
        }
      });

      it('should fill buffer range', () => {
        const buf = BufferShim.alloc(5);
        buf.fill(99, 1, 4);

        expect(buf.readUInt8(0)).toBe(0);
        expect(buf.readUInt8(1)).toBe(99);
        expect(buf.readUInt8(2)).toBe(99);
        expect(buf.readUInt8(3)).toBe(99);
        expect(buf.readUInt8(4)).toBe(0);
      });
    });
  });

  describe('cryptoShim', () => {
    it('should generate random bytes', () => {
      const bytes = cryptoShim.randomBytes(16);

      expect(bytes.length).toBe(16);
      // Should have some randomness (very unlikely to be all zeros)
      expect(bytes.toUint8Array().some(b => b !== 0)).toBe(true);
    });

    it('should generate different random bytes each time', () => {
      const bytes1 = cryptoShim.randomBytes(32);
      const bytes2 = cryptoShim.randomBytes(32);

      expect(bytes1.equals(bytes2)).toBe(false);
    });

    it('should generate random UUID', () => {
      const uuid = cryptoShim.randomUUID();

      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(cryptoShim.randomUUID());
      }
      expect(uuids.size).toBe(100);
    });

    it('should create and use hash', async () => {
      const hash = await cryptoShim.createHash('sha256');
      hash.update('hello');
      const digest = await hash.digest('hex');

      expect(digest).toHaveLength(64);
      expect(digest).toMatch(/^[0-9a-f]+$/);
    });

    it('should produce consistent hash for same input', async () => {
      const hash1 = await cryptoShim.createHash('sha256');
      hash1.update('test data');
      const digest1 = await hash1.digest('hex');

      const hash2 = await cryptoShim.createHash('sha256');
      hash2.update('test data');
      const digest2 = await hash2.digest('hex');

      expect(digest1).toBe(digest2);
    });

    it('should support multiple update calls', async () => {
      const hash = await cryptoShim.createHash('sha256');
      hash.update('hello');
      hash.update(' ');
      hash.update('world');
      const combined = await hash.digest('hex');

      const hash2 = await cryptoShim.createHash('sha256');
      hash2.update('hello world');
      const single = await hash2.digest('hex');

      expect(combined).toBe(single);
    });
  });

  describe('pathShim', () => {
    it('should have correct separator', () => {
      expect(pathShim.sep).toBe('/');
    });

    it('should join paths', () => {
      expect(pathShim.join('a', 'b', 'c')).toBe('a/b/c');
      expect(pathShim.join('/a', 'b', 'c')).toBe('/a/b/c');
      expect(pathShim.join('a/', '/b/', '/c')).toBe('a/b/c');
    });

    it('should handle empty and null path segments', () => {
      expect(pathShim.join('a', '', 'b')).toBe('a/b');
    });

    it('should resolve paths', () => {
      expect(pathShim.resolve('/a', 'b')).toBe('/a/b');
      expect(pathShim.resolve('a', 'b')).toBe('/a/b');
    });

    it('should get dirname', () => {
      expect(pathShim.dirname('/a/b/c')).toBe('/a/b');
      expect(pathShim.dirname('/a')).toBe('/');
      expect(pathShim.dirname('/')).toBe('/');
    });

    it('should get basename', () => {
      expect(pathShim.basename('/a/b/file.txt')).toBe('file.txt');
      expect(pathShim.basename('/a/b/file.txt', '.txt')).toBe('file');
    });

    it('should get extname', () => {
      expect(pathShim.extname('file.txt')).toBe('.txt');
      expect(pathShim.extname('file.test.js')).toBe('.js');
      expect(pathShim.extname('file')).toBe('');
      expect(pathShim.extname('.hidden')).toBe('');
    });

    it('should normalize paths', () => {
      expect(pathShim.normalize('/a/b/../c')).toBe('/a/c');
      expect(pathShim.normalize('/a/./b/./c')).toBe('/a/b/c');
      expect(pathShim.normalize('a//b//c')).toBe('a/b/c');
    });

    it('should check if path is absolute', () => {
      expect(pathShim.isAbsolute('/a/b')).toBe(true);
      expect(pathShim.isAbsolute('a/b')).toBe(false);
    });

    it('should get relative path', () => {
      expect(pathShim.relative('/a/b', '/a/c')).toBe('../c');
      expect(pathShim.relative('/a/b/c', '/a/b/d')).toBe('../d');
      expect(pathShim.relative('/a', '/a/b/c')).toBe('b/c');
    });
  });

  describe('processShim', () => {
    it('should have browser platform', () => {
      expect(processShim.platform).toBe('browser');
    });

    it('should have wasm32 architecture', () => {
      expect(processShim.arch).toBe('wasm32');
    });

    it('should provide version info', () => {
      expect(processShim.version).toMatch(/^v\d+\.\d+\.\d+$/);
      expect(processShim.versions.node).toBeDefined();
    });

    it('should return cwd as root', () => {
      expect(processShim.cwd()).toBe('/');
    });

    it('should execute nextTick callback', async () => {
      const callback = jest.fn();

      processShim.nextTick(callback);

      // Wait for microtask
      await new Promise<void>(resolve => queueMicrotask(() => resolve()));

      expect(callback).toHaveBeenCalled();
    });

    it('should provide hrtime', () => {
      const time = processShim.hrtime();

      expect(Array.isArray(time)).toBe(true);
      expect(time.length).toBe(2);
      expect(typeof time[0]).toBe('number');
      expect(typeof time[1]).toBe('number');
    });

    it('should calculate hrtime difference', async () => {
      const start = processShim.hrtime();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const diff = processShim.hrtime(start);

      expect(diff[0]).toBeGreaterThanOrEqual(0);
      expect(diff[1]).toBeGreaterThanOrEqual(0);
    });

    it('should provide memory usage', () => {
      const mem = processShim.memoryUsage();

      expect(mem).toHaveProperty('heapUsed');
      expect(mem).toHaveProperty('heapTotal');
      expect(mem).toHaveProperty('external');
      expect(mem).toHaveProperty('rss');
    });

    it('should support env object', () => {
      processShim.env.TEST_VAR = 'test-value';

      expect(processShim.env.TEST_VAR).toBe('test-value');
    });
  });

  describe('EventEmitterShim', () => {
    let emitter: EventEmitterShim;

    beforeEach(() => {
      emitter = new EventEmitterShim();
    });

    it('should register and emit events', () => {
      const handler = jest.fn();

      emitter.on('test', handler);
      emitter.emit('test', 'arg1', 'arg2');

      expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should support multiple listeners', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.emit('test');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should support once listeners', () => {
      const handler = jest.fn();

      emitter.once('test', handler);
      emitter.emit('test');
      emitter.emit('test');

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should remove specific listener', () => {
      const handler = jest.fn();

      emitter.on('test', handler);
      emitter.off('test', handler);
      emitter.emit('test');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should remove all listeners for event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.removeAllListeners('test');
      emitter.emit('test');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should remove all listeners', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter.on('event1', handler1);
      emitter.on('event2', handler2);
      emitter.removeAllListeners();
      emitter.emit('event1');
      emitter.emit('event2');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should count listeners', () => {
      emitter.on('test', () => {});
      emitter.on('test', () => {});
      emitter.on('other', () => {});

      expect(emitter.listenerCount('test')).toBe(2);
      expect(emitter.listenerCount('other')).toBe(1);
      expect(emitter.listenerCount('none')).toBe(0);
    });

    it('should return false when no listeners', () => {
      const result = emitter.emit('noListeners');

      expect(result).toBe(false);
    });

    it('should return true when listeners exist', () => {
      emitter.on('test', () => {});
      const result = emitter.emit('test');

      expect(result).toBe(true);
    });

    it('should handle listener errors gracefully', () => {
      const goodHandler = jest.fn();
      const badHandler = jest.fn(() => {
        throw new Error('Handler error');
      });

      emitter.on('test', badHandler);
      emitter.on('test', goodHandler);

      expect(() => emitter.emit('test')).not.toThrow();
      expect(goodHandler).toHaveBeenCalled();
    });

    it('should support maxListeners', () => {
      emitter.setMaxListeners(5);

      expect(emitter.getMaxListeners()).toBe(5);
    });
  });

  describe('featureDetection', () => {
    it('should detect WASM support', () => {
      const isSupported = featureDetection.isWasmSupported();

      expect(typeof isSupported).toBe('boolean');
    });

    it('should detect BigInt support', () => {
      const isSupported = featureDetection.isBigIntSupported();

      expect(isSupported).toBe(true);
    });

    it('should detect WebCrypto support', () => {
      const isSupported = featureDetection.isWebCryptoSupported();

      expect(typeof isSupported).toBe('boolean');
    });

    it('should detect IndexedDB support', () => {
      // fake-indexeddb makes this available
      const isSupported = featureDetection.isIndexedDBSupported();

      expect(isSupported).toBe(true);
    });

    it('should get max memory', () => {
      const maxMemory = featureDetection.getMaxMemory();

      expect(typeof maxMemory).toBe('number');
      expect(maxMemory).toBeGreaterThan(0);
    });
  });

  describe('Browser Compatibility', () => {
    it('should handle TextEncoder/TextDecoder', () => {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const encoded = encoder.encode('Hello World');
      const decoded = decoder.decode(encoded);

      expect(decoded).toBe('Hello World');
    });

    it('should handle queueMicrotask', async () => {
      const results: number[] = [];

      queueMicrotask(() => results.push(1));
      results.push(0);

      await new Promise<void>(resolve => queueMicrotask(() => resolve()));

      expect(results).toEqual([0, 1]);
    });

    it('should handle performance.now()', () => {
      const start = performance.now();

      // Do some work
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }

      const end = performance.now();

      expect(end).toBeGreaterThanOrEqual(start);
    });

    it('should handle crypto.getRandomValues', () => {
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);

      // Should have some randomness
      expect(array.some(v => v !== 0)).toBe(true);
    });

    it('should handle URL API', () => {
      const url = new URL('https://example.com/path?query=value');

      expect(url.hostname).toBe('example.com');
      expect(url.pathname).toBe('/path');
      expect(url.searchParams.get('query')).toBe('value');
    });

    it('should handle AbortController', () => {
      const controller = new AbortController();
      const signal = controller.signal;

      expect(signal.aborted).toBe(false);

      controller.abort();

      expect(signal.aborted).toBe(true);
    });
  });
});
