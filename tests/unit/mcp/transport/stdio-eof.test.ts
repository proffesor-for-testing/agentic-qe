/**
 * Regression tests for StdioTransport EOF handling — Issue #513.
 *
 * When the parent process exits, the server's stdin reaches EOF. The transport
 * must treat this as a TERMINAL close (fire the close handler) and must NOT
 * fire the error handler — firing the error handler triggers the protocol
 * server's reconnect path, which re-attaches readline to the already-ended
 * stdin and busy-loops at high CPU.
 */

import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { StdioTransport } from '../../../../src/mcp/transport/stdio';

/** A readable that emits nothing and ends on demand (simulates stdin EOF). */
function makeEndableInput(): Readable {
  return new Readable({ read() { /* no data; ended explicitly via push(null) */ } });
}

function makeSinkOutput(): Writable {
  return new Writable({ write(_c, _e, cb) { cb(); } });
}

/** Wait one macrotask so stream 'end'/readline 'close' events flush. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('StdioTransport EOF handling (Issue #513)', () => {
  it('should_fireCloseHandler_and_not_errorHandler_when_stdinReachesEOF', async () => {
    // Arrange
    const input = makeEndableInput();
    const transport = new StdioTransport({ inputStream: input, outputStream: makeSinkOutput() });
    let closeCalled = 0;
    let errorCalled = 0;
    transport.onClose(() => { closeCalled++; });
    transport.onError(() => { errorCalled++; });
    transport.start();

    // Act: parent goes away → stdin EOF.
    input.push(null);
    await flush();

    // Assert: terminal close, no reconnect-triggering error.
    expect(closeCalled).toBe(1);
    expect(errorCalled).toBe(0);
    expect(transport.isRunning()).toBe(false);
  });

  it('should_not_reArmReadline_when_reconnectCalledOnEndedStdin', async () => {
    // Arrange
    const input = makeEndableInput();
    const transport = new StdioTransport({ inputStream: input, outputStream: makeSinkOutput() });
    let closeCalled = 0;
    let errorCalled = 0;
    transport.onClose(() => { closeCalled++; });
    transport.onError(() => { errorCalled++; });
    transport.start();
    input.push(null);
    await flush();
    closeCalled = 0; // reset after the initial EOF close

    // Act: the reconnect path must be a no-op on an ended stream (no spin).
    transport.reconnect();
    await flush();

    // Assert: signaled terminal close again, never restarted, never errored.
    expect(transport.isRunning()).toBe(false);
    expect(errorCalled).toBe(0);
    expect(closeCalled).toBe(1);
  });

  it('should_not_signalAnything_when_stopIsExplicit', async () => {
    // Arrange
    const input = makeEndableInput();
    const transport = new StdioTransport({ inputStream: input, outputStream: makeSinkOutput() });
    let closeCalled = 0;
    let errorCalled = 0;
    transport.onClose(() => { closeCalled++; });
    transport.onError(() => { errorCalled++; });
    transport.start();

    // Act: explicit stop() is not a parent-death EOF.
    transport.stop();
    await flush();

    // Assert: neither handler fires on a deliberate shutdown.
    expect(closeCalled).toBe(0);
    expect(errorCalled).toBe(0);
    expect(transport.isRunning()).toBe(false);
  });
});
