/**
 * Global type declarations for build-time injected constants
 */

/** CLI version injected by esbuild at build time from root package.json */
declare const __CLI_VERSION__: string;

/**
 * Ambient module declarations for optional/native dependencies
 * that lack published type definitions.
 */
declare module 'fast-json-patch' {
  export interface Operation {
    op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
    path: string;
    value?: unknown;
    from?: string;
  }
  export interface Observer<T> {
    object: T;
    patches: Operation[];
    unobserve: () => void;
  }
  export function compare(a: unknown, b: unknown): Operation[];
  export function applyPatch<T>(document: T, patch: Operation[], validateOperation?: boolean, banPrototypeModifications?: boolean): { newDocument: T };
  export function applyOperation<T>(document: T, operation: Operation, validateOperation?: boolean, banPrototypeModifications?: boolean): { newDocument: T };
  export function validate(patch: Operation[]): { name: string; message: string } | undefined;
  export function observe<T extends object>(obj: T, callback?: (patches: Operation[]) => void): Observer<T>;
  export function generate<T>(observer: Observer<T>): Operation[];
  export function unobserve<T>(obj: T, observer: Observer<T>): void;
  export function getValueByPointer(document: unknown, pointer: string): unknown;
  export function escapePathComponent(component: string): string;
  export function unescapePathComponent(component: string): string;
}

declare module 'prime-radiant-advanced-wasm' {
  const module: unknown;
  export default module;
}

declare module 'ws' {
  import { EventEmitter } from 'events';
  import type { IncomingMessage, Server as HttpServer } from 'http';
  import type { Socket } from 'net';

  export class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;
    readonly readyState: 0 | 1 | 2 | 3;
    readonly protocol: string;
    readonly url: string;
    constructor(address: string | URL, protocols?: string | string[], options?: object);
    close(code?: number, reason?: string | Buffer): void;
    ping(data?: unknown, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: unknown, mask?: boolean, cb?: (err: Error) => void): void;
    send(data: unknown, cb?: (err?: Error) => void): void;
    send(data: unknown, options: { compress?: boolean; binary?: boolean; mask?: boolean; fin?: boolean }, cb?: (err?: Error) => void): void;
    terminate(): void;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: RawData, isBinary: boolean) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: { host?: string; port?: number; server?: HttpServer; noServer?: boolean; maxPayload?: number; perMessageDeflate?: boolean | object; path?: string });
    close(cb?: (err?: Error) => void): void;
    handleUpgrade(request: IncomingMessage, socket: Socket, head: Buffer, callback: (ws: WebSocket, request: IncomingMessage) => void): void;
    clients: Set<WebSocket>;
    on(event: 'connection', listener: (ws: WebSocket, request: IncomingMessage, ...args: any[]) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export type RawData = Buffer | ArrayBuffer | Buffer[];
}
