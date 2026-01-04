/**
 * Message Encoder for Agent-to-Agent Protocol
 *
 * Provides binary message encoding using a MessagePack-style format with
 * compression support for large payloads and schema versioning for
 * forward/backward compatibility.
 *
 * Features:
 * - Binary serialization/deserialization
 * - Compression for payloads > 1KB
 * - Schema versioning for compatibility
 * - Message validation
 * - Efficient encoding for common types
 *
 * @module edge/p2p/protocol/MessageEncoder
 * @version 1.0.0
 */

import type {
  ProtocolEnvelope,
  ProtocolHeader,
  MessageMetadata,
  RoutingInfo,
} from './types';
import {
  ProtocolError,
  ProtocolErrorCode,
  COMPRESSION_THRESHOLD,
  MAX_MESSAGE_SIZE,
  PROTOCOL_VERSION,
  MessageType,
  MessagePriority,
  DeliverySemantics,
  RoutingMode,
} from './types';

// ============================================
// Encoder Constants
// ============================================

/**
 * Magic bytes for protocol identification
 */
const MAGIC_BYTES = new Uint8Array([0x41, 0x51, 0x45, 0x50]); // "AQEP" - Agentic QE Protocol

/**
 * Schema version for binary format
 */
const BINARY_SCHEMA_VERSION = 1;

/**
 * Type markers for binary encoding
 */
enum TypeMarker {
  NULL = 0x00,
  FALSE = 0x01,
  TRUE = 0x02,
  UINT8 = 0x03,
  UINT16 = 0x04,
  UINT32 = 0x05,
  INT8 = 0x06,
  INT16 = 0x07,
  INT32 = 0x08,
  FLOAT64 = 0x09,
  STRING8 = 0x0a, // Length fits in 1 byte
  STRING16 = 0x0b, // Length fits in 2 bytes
  STRING32 = 0x0c, // Length fits in 4 bytes
  BINARY8 = 0x0d,
  BINARY16 = 0x0e,
  BINARY32 = 0x0f,
  ARRAY8 = 0x10,
  ARRAY16 = 0x11,
  ARRAY32 = 0x12,
  MAP8 = 0x13,
  MAP16 = 0x14,
  MAP32 = 0x15,
  EXTENSION = 0x16,
}

/**
 * Compression flag in header
 */
const COMPRESSION_FLAG = 0x80;

// ============================================
// MessageEncoder Class
// ============================================

/**
 * Binary message encoder/decoder
 *
 * @example
 * ```typescript
 * const encoder = new MessageEncoder();
 *
 * // Encode envelope
 * const binary = await encoder.encode(envelope);
 *
 * // Decode envelope
 * const decoded = await encoder.decode(binary);
 * ```
 */
export class MessageEncoder {
  private textEncoder: TextEncoder;
  private textDecoder: TextDecoder;

  constructor() {
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder();
  }

  /**
   * Encode a protocol envelope to binary
   *
   * @param envelope - Protocol envelope to encode
   * @returns Binary data
   */
  async encode<T>(envelope: ProtocolEnvelope<T>): Promise<Uint8Array> {
    // Validate envelope
    this.validateEnvelope(envelope);

    // Serialize to JSON first (for payload)
    const jsonPayload = JSON.stringify(envelope.payload);
    const payloadBytes = this.textEncoder.encode(jsonPayload);

    // Check if compression is needed
    let compressedPayload: Uint8Array | null = null;
    let isCompressed = false;

    if (payloadBytes.length > COMPRESSION_THRESHOLD) {
      try {
        compressedPayload = await this.compress(payloadBytes);
        // Only use compression if it actually reduces size
        if (compressedPayload.length < payloadBytes.length * 0.9) {
          isCompressed = true;
        } else {
          compressedPayload = null;
        }
      } catch {
        // Compression failed, use uncompressed
        compressedPayload = null;
      }
    }

    const finalPayload = isCompressed ? compressedPayload! : payloadBytes;

    // Build binary message
    const parts: Uint8Array[] = [];

    // 1. Magic bytes (4 bytes)
    parts.push(MAGIC_BYTES);

    // 2. Version and flags (1 byte)
    const flags = isCompressed ? COMPRESSION_FLAG : 0;
    parts.push(new Uint8Array([BINARY_SCHEMA_VERSION | flags]));

    // 3. Header (variable length)
    const headerBytes = this.encodeHeader(envelope.header, isCompressed);
    parts.push(this.encodeLength(headerBytes.length));
    parts.push(headerBytes);

    // 4. Signature (variable length)
    const signatureBytes = this.textEncoder.encode(envelope.signature);
    parts.push(this.encodeLength(signatureBytes.length));
    parts.push(signatureBytes);

    // 5. Signer public key (variable length)
    const signerKeyBytes = this.textEncoder.encode(envelope.signerPublicKey);
    parts.push(this.encodeLength(signerKeyBytes.length));
    parts.push(signerKeyBytes);

    // 6. Routing info (optional)
    if (envelope.routing) {
      parts.push(new Uint8Array([1])); // Has routing
      const routingBytes = this.encodeRouting(envelope.routing);
      parts.push(this.encodeLength(routingBytes.length));
      parts.push(routingBytes);
    } else {
      parts.push(new Uint8Array([0])); // No routing
    }

    // 7. Metadata (optional)
    if (envelope.metadata) {
      parts.push(new Uint8Array([1])); // Has metadata
      const metadataBytes = this.encodeMetadata(envelope.metadata);
      parts.push(this.encodeLength(metadataBytes.length));
      parts.push(metadataBytes);
    } else {
      parts.push(new Uint8Array([0])); // No metadata
    }

    // 8. Payload (variable length)
    parts.push(this.encodeLength(finalPayload.length));
    parts.push(finalPayload);

    // Combine all parts
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    if (totalLength > MAX_MESSAGE_SIZE) {
      throw new ProtocolError(
        `Message size ${totalLength} exceeds maximum ${MAX_MESSAGE_SIZE}`,
        ProtocolErrorCode.MESSAGE_TOO_LARGE
      );
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }

    return result;
  }

  /**
   * Decode binary data to protocol envelope
   *
   * @param data - Binary data to decode
   * @returns Protocol envelope
   */
  async decode<T>(data: Uint8Array): Promise<ProtocolEnvelope<T>> {
    if (data.length < 6) {
      throw new ProtocolError('Message too short', ProtocolErrorCode.INVALID_MESSAGE);
    }

    let offset = 0;

    // 1. Verify magic bytes
    const magic = data.slice(0, 4);
    if (!this.arrayEquals(magic, MAGIC_BYTES)) {
      throw new ProtocolError('Invalid magic bytes', ProtocolErrorCode.INVALID_MESSAGE);
    }
    offset = 4;

    // 2. Read version and flags
    const versionAndFlags = data[offset++];
    const version = versionAndFlags & 0x7f;
    const isCompressed = (versionAndFlags & COMPRESSION_FLAG) !== 0;

    if (version > BINARY_SCHEMA_VERSION) {
      throw new ProtocolError(
        `Unsupported schema version ${version}`,
        ProtocolErrorCode.UNSUPPORTED_VERSION
      );
    }

    // 3. Read header
    const { value: headerLength, bytesRead: headerLenBytes } = this.decodeLength(
      data.slice(offset)
    );
    offset += headerLenBytes;
    const headerBytes = data.slice(offset, offset + headerLength);
    offset += headerLength;
    const header = this.decodeHeader(headerBytes, isCompressed);

    // 4. Read signature
    const { value: sigLength, bytesRead: sigLenBytes } = this.decodeLength(
      data.slice(offset)
    );
    offset += sigLenBytes;
    const signature = this.textDecoder.decode(data.slice(offset, offset + sigLength));
    offset += sigLength;

    // 5. Read signer public key
    const { value: keyLength, bytesRead: keyLenBytes } = this.decodeLength(
      data.slice(offset)
    );
    offset += keyLenBytes;
    const signerPublicKey = this.textDecoder.decode(data.slice(offset, offset + keyLength));
    offset += keyLength;

    // 6. Read routing (optional)
    const hasRouting = data[offset++] === 1;
    let routing: RoutingInfo | undefined;
    if (hasRouting) {
      const { value: routingLength, bytesRead: routingLenBytes } = this.decodeLength(
        data.slice(offset)
      );
      offset += routingLenBytes;
      const routingBytes = data.slice(offset, offset + routingLength);
      offset += routingLength;
      routing = this.decodeRouting(routingBytes);
    }

    // 7. Read metadata (optional)
    const hasMetadata = data[offset++] === 1;
    let metadata: MessageMetadata | undefined;
    if (hasMetadata) {
      const { value: metadataLength, bytesRead: metadataLenBytes } = this.decodeLength(
        data.slice(offset)
      );
      offset += metadataLenBytes;
      const metadataBytes = data.slice(offset, offset + metadataLength);
      offset += metadataLength;
      metadata = this.decodeMetadata(metadataBytes);
    }

    // 8. Read payload
    const { value: payloadLength, bytesRead: payloadLenBytes } = this.decodeLength(
      data.slice(offset)
    );
    offset += payloadLenBytes;
    let payloadBytes = data.slice(offset, offset + payloadLength);

    // Decompress if needed
    if (isCompressed) {
      payloadBytes = new Uint8Array(await this.decompress(payloadBytes));
    }

    const payloadJson = this.textDecoder.decode(payloadBytes);
    const payload = JSON.parse(payloadJson) as T;

    return {
      header,
      payload,
      signature,
      signerPublicKey,
      routing,
      metadata,
    };
  }

  /**
   * Validate envelope structure
   */
  validateEnvelope<T>(envelope: ProtocolEnvelope<T>): void {
    if (!envelope.header) {
      throw new ProtocolError('Missing header', ProtocolErrorCode.INVALID_MESSAGE);
    }

    if (!envelope.header.messageId) {
      throw new ProtocolError('Missing message ID', ProtocolErrorCode.INVALID_MESSAGE);
    }

    if (!envelope.header.version) {
      throw new ProtocolError('Missing protocol version', ProtocolErrorCode.INVALID_MESSAGE);
    }

    if (!envelope.signature) {
      throw new ProtocolError('Missing signature', ProtocolErrorCode.INVALID_MESSAGE);
    }

    if (!envelope.signerPublicKey) {
      throw new ProtocolError('Missing signer public key', ProtocolErrorCode.INVALID_MESSAGE);
    }

    // Validate message type
    if (!Object.values(MessageType).includes(envelope.header.type)) {
      throw new ProtocolError(
        `Invalid message type: ${envelope.header.type}`,
        ProtocolErrorCode.INVALID_MESSAGE
      );
    }

    // Validate priority
    if (!Object.values(MessagePriority).includes(envelope.header.priority)) {
      throw new ProtocolError(
        `Invalid priority: ${envelope.header.priority}`,
        ProtocolErrorCode.INVALID_MESSAGE
      );
    }
  }

  /**
   * Get estimated encoded size without actually encoding
   */
  estimateSize<T>(envelope: ProtocolEnvelope<T>): number {
    const jsonPayload = JSON.stringify(envelope.payload);
    const headerEstimate = 200; // Header typically ~150-200 bytes
    const signatureEstimate = 128; // Base64 signature ~88 bytes + overhead
    const routingEstimate = envelope.routing ? 100 : 0;
    const metadataEstimate = envelope.metadata ? 100 : 0;

    return (
      4 + // Magic
      1 + // Version/flags
      headerEstimate +
      signatureEstimate +
      jsonPayload.length +
      routingEstimate +
      metadataEstimate
    );
  }

  // ============================================
  // Private Encoding Methods
  // ============================================

  /**
   * Encode protocol header to binary
   */
  private encodeHeader(header: ProtocolHeader, isCompressed: boolean): Uint8Array {
    const obj = {
      v: header.version,
      id: header.messageId,
      cid: header.correlationId,
      t: this.encodeMessageType(header.type),
      p: header.priority,
      s: header.senderId,
      r: header.recipientId,
      ts: header.timestamp,
      ttl: header.ttl,
      hc: header.hopCount,
      mh: header.maxHops,
      c: isCompressed,
      d: this.encodeDeliverySemantics(header.delivery),
      rt: this.encodeRoutingMode(header.routing),
      sv: header.schemaVersion,
    };
    return this.textEncoder.encode(JSON.stringify(obj));
  }

  /**
   * Decode protocol header from binary
   */
  private decodeHeader(data: Uint8Array, isCompressed: boolean): ProtocolHeader {
    const json = this.textDecoder.decode(data);
    const obj = JSON.parse(json);

    return {
      version: obj.v || PROTOCOL_VERSION,
      messageId: obj.id,
      correlationId: obj.cid,
      type: this.decodeMessageType(obj.t),
      priority: obj.p ?? MessagePriority.NORMAL,
      senderId: obj.s,
      recipientId: obj.r,
      timestamp: obj.ts,
      ttl: obj.ttl,
      hopCount: obj.hc ?? 0,
      maxHops: obj.mh ?? 5,
      compressed: isCompressed,
      delivery: this.decodeDeliverySemantics(obj.d),
      routing: this.decodeRoutingMode(obj.rt),
      schemaVersion: obj.sv ?? 1,
    };
  }

  /**
   * Encode routing info to binary
   */
  private encodeRouting(routing: RoutingInfo): Uint8Array {
    const obj = {
      m: this.encodeRoutingMode(routing.mode),
      t: routing.targets,
      r: routing.roomId,
      p: routing.path,
      rn: routing.relayNodes,
      es: routing.excludeSender,
    };
    return this.textEncoder.encode(JSON.stringify(obj));
  }

  /**
   * Decode routing info from binary
   */
  private decodeRouting(data: Uint8Array): RoutingInfo {
    const json = this.textDecoder.decode(data);
    const obj = JSON.parse(json);

    return {
      mode: this.decodeRoutingMode(obj.m),
      targets: obj.t,
      roomId: obj.r,
      path: obj.p,
      relayNodes: obj.rn,
      excludeSender: obj.es,
    };
  }

  /**
   * Encode metadata to binary
   */
  private encodeMetadata(metadata: MessageMetadata): Uint8Array {
    const obj = {
      os: metadata.originalSize,
      cs: metadata.compressedSize,
      ch: metadata.channel,
      tid: metadata.traceId,
      sid: metadata.spanId,
      psid: metadata.parentSpanId,
      tags: metadata.tags,
      rc: metadata.retryCount,
      qt: metadata.queueTime,
    };
    return this.textEncoder.encode(JSON.stringify(obj));
  }

  /**
   * Decode metadata from binary
   */
  private decodeMetadata(data: Uint8Array): MessageMetadata {
    const json = this.textDecoder.decode(data);
    const obj = JSON.parse(json);

    return {
      originalSize: obj.os,
      compressedSize: obj.cs,
      channel: obj.ch,
      traceId: obj.tid,
      spanId: obj.sid,
      parentSpanId: obj.psid,
      tags: obj.tags,
      retryCount: obj.rc,
      queueTime: obj.qt,
    };
  }

  /**
   * Encode variable-length integer
   */
  private encodeLength(length: number): Uint8Array {
    if (length < 128) {
      return new Uint8Array([length]);
    } else if (length < 16384) {
      return new Uint8Array([0x80 | (length >> 7), length & 0x7f]);
    } else if (length < 2097152) {
      return new Uint8Array([
        0x80 | (length >> 14),
        0x80 | ((length >> 7) & 0x7f),
        length & 0x7f,
      ]);
    } else {
      return new Uint8Array([
        0x80 | (length >> 21),
        0x80 | ((length >> 14) & 0x7f),
        0x80 | ((length >> 7) & 0x7f),
        length & 0x7f,
      ]);
    }
  }

  /**
   * Decode variable-length integer
   */
  private decodeLength(data: Uint8Array): { value: number; bytesRead: number } {
    let value = 0;
    let bytesRead = 0;

    for (let i = 0; i < 4; i++) {
      const byte = data[i];
      bytesRead++;

      if (byte & 0x80) {
        value = (value << 7) | (byte & 0x7f);
      } else {
        value = (value << 7) | byte;
        break;
      }
    }

    return { value, bytesRead };
  }

  // ============================================
  // Compression Methods
  // ============================================

  /**
   * Compress data using CompressionStream API
   */
  private async compress(data: Uint8Array): Promise<Uint8Array> {
    // Check if CompressionStream is available
    if (typeof CompressionStream === 'undefined') {
      // Fallback: use simple DEFLATE-like compression
      return this.simpleCompress(data);
    }

    try {
      const stream = new CompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      // Write data - need to create a new buffer to satisfy TypeScript
      const buffer = new Uint8Array(data).buffer;
      writer.write(new Uint8Array(buffer));
      writer.close();

      // Read compressed data
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } catch {
      throw new ProtocolError('Compression failed', ProtocolErrorCode.COMPRESSION_ERROR);
    }
  }

  /**
   * Decompress data using DecompressionStream API
   */
  private async decompress(data: Uint8Array): Promise<Uint8Array> {
    // Check if DecompressionStream is available
    if (typeof DecompressionStream === 'undefined') {
      // Fallback: use simple decompression
      return this.simpleDecompress(data);
    }

    try {
      const stream = new DecompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      // Write compressed data - need to create a new buffer to satisfy TypeScript
      const buffer = new Uint8Array(data).buffer;
      writer.write(new Uint8Array(buffer));
      writer.close();

      // Read decompressed data
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } catch {
      throw new ProtocolError('Decompression failed', ProtocolErrorCode.DECOMPRESSION_ERROR);
    }
  }

  /**
   * Simple compression fallback (RLE-like)
   */
  private simpleCompress(data: Uint8Array): Uint8Array {
    // Very simple run-length encoding for repeated bytes
    const output: number[] = [];
    let i = 0;

    while (i < data.length) {
      const byte = data[i];
      let count = 1;

      // Count consecutive identical bytes (max 127)
      while (i + count < data.length && data[i + count] === byte && count < 127) {
        count++;
      }

      if (count >= 3) {
        // Encode as RLE: [0xFF, count, byte]
        output.push(0xff, count, byte);
        i += count;
      } else {
        // Literal byte (escape 0xFF with another 0xFF)
        if (byte === 0xff) {
          output.push(0xff, 0x00);
        } else {
          output.push(byte);
        }
        i++;
      }
    }

    return new Uint8Array(output);
  }

  /**
   * Simple decompression fallback
   */
  private simpleDecompress(data: Uint8Array): Uint8Array {
    const output: number[] = [];
    let i = 0;

    while (i < data.length) {
      const byte = data[i];

      if (byte === 0xff) {
        const next = data[i + 1];
        if (next === 0x00) {
          // Escaped 0xFF
          output.push(0xff);
          i += 2;
        } else if (next > 0) {
          // RLE: repeat data[i+2] for 'next' times
          const repeatByte = data[i + 2];
          for (let j = 0; j < next; j++) {
            output.push(repeatByte);
          }
          i += 3;
        } else {
          throw new ProtocolError('Invalid RLE encoding', ProtocolErrorCode.DECOMPRESSION_ERROR);
        }
      } else {
        output.push(byte);
        i++;
      }
    }

    return new Uint8Array(output);
  }

  // ============================================
  // Type Encoding Helpers
  // ============================================

  private encodeMessageType(type: MessageType): number {
    const map: Record<MessageType, number> = {
      [MessageType.REQUEST]: 0,
      [MessageType.RESPONSE]: 1,
      [MessageType.EVENT]: 2,
      [MessageType.HEARTBEAT]: 3,
      [MessageType.ERROR]: 4,
      [MessageType.ACK]: 5,
      [MessageType.NACK]: 6,
      [MessageType.HANDSHAKE]: 7,
      [MessageType.HANDSHAKE_ACK]: 8,
      [MessageType.CLOSE]: 9,
    };
    return map[type] ?? 0;
  }

  private decodeMessageType(value: number): MessageType {
    const map: Record<number, MessageType> = {
      0: MessageType.REQUEST,
      1: MessageType.RESPONSE,
      2: MessageType.EVENT,
      3: MessageType.HEARTBEAT,
      4: MessageType.ERROR,
      5: MessageType.ACK,
      6: MessageType.NACK,
      7: MessageType.HANDSHAKE,
      8: MessageType.HANDSHAKE_ACK,
      9: MessageType.CLOSE,
    };
    return map[value] ?? MessageType.REQUEST;
  }

  private encodeDeliverySemantics(delivery: DeliverySemantics): number {
    const map: Record<DeliverySemantics, number> = {
      [DeliverySemantics.AT_MOST_ONCE]: 0,
      [DeliverySemantics.AT_LEAST_ONCE]: 1,
      [DeliverySemantics.EXACTLY_ONCE]: 2,
    };
    return map[delivery] ?? 1;
  }

  private decodeDeliverySemantics(value: number): DeliverySemantics {
    const map: Record<number, DeliverySemantics> = {
      0: DeliverySemantics.AT_MOST_ONCE,
      1: DeliverySemantics.AT_LEAST_ONCE,
      2: DeliverySemantics.EXACTLY_ONCE,
    };
    return map[value] ?? DeliverySemantics.AT_LEAST_ONCE;
  }

  private encodeRoutingMode(mode: RoutingMode): number {
    const map: Record<RoutingMode, number> = {
      [RoutingMode.UNICAST]: 0,
      [RoutingMode.BROADCAST]: 1,
      [RoutingMode.MULTICAST]: 2,
      [RoutingMode.RELAY]: 3,
    };
    return map[mode] ?? 0;
  }

  private decodeRoutingMode(value: number): RoutingMode {
    const map: Record<number, RoutingMode> = {
      0: RoutingMode.UNICAST,
      1: RoutingMode.BROADCAST,
      2: RoutingMode.MULTICAST,
      3: RoutingMode.RELAY,
    };
    return map[value] ?? RoutingMode.UNICAST;
  }

  /**
   * Compare two Uint8Arrays for equality
   */
  private arrayEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

// ============================================
// JSON Encoder (Fallback)
// ============================================

/**
 * JSON-based encoder for debugging and compatibility
 */
export class JsonMessageEncoder {
  /**
   * Encode envelope to JSON string
   */
  encode<T>(envelope: ProtocolEnvelope<T>): string {
    return JSON.stringify(envelope);
  }

  /**
   * Decode JSON string to envelope
   */
  decode<T>(data: string): ProtocolEnvelope<T> {
    return JSON.parse(data) as ProtocolEnvelope<T>;
  }

  /**
   * Encode envelope to Uint8Array (UTF-8 JSON)
   */
  encodeBinary<T>(envelope: ProtocolEnvelope<T>): Uint8Array {
    const json = this.encode(envelope);
    return new TextEncoder().encode(json);
  }

  /**
   * Decode Uint8Array (UTF-8 JSON) to envelope
   */
  decodeBinary<T>(data: Uint8Array): ProtocolEnvelope<T> {
    const json = new TextDecoder().decode(data);
    return this.decode(json);
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new message encoder
 */
export function createMessageEncoder(): MessageEncoder {
  return new MessageEncoder();
}

/**
 * Create a new JSON encoder (for debugging)
 */
export function createJsonEncoder(): JsonMessageEncoder {
  return new JsonMessageEncoder();
}
