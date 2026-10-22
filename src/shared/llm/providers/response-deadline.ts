const IDLE_READ_AHEAD_BYTES = 1024 * 1024;

/**
 * Bound headers and bodies; streaming callers may use an idle body deadline.
 * `maxDurationMs` adds an absolute cap from the start of the request, so an
 * idle deadline cannot be held open forever by a peer that trickles bytes
 * just often enough to reset it (#980 review N6).
 */
export async function fetchWithResponseDeadline(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  timeoutError: () => Error,
  bodyDeadline: 'absolute' | 'idle' = 'absolute',
  maxDurationMs?: number,
): Promise<Response> {
  const abort = new AbortController();
  let expired = false;
  let expireBody: ((error: Error) => void) | undefined;
  const expire = () => {
    expired = true;
    const error = timeoutError();
    expireBody?.(error);
    abort.abort(error);
  };
  let timer = setTimeout(expire, timeoutMs);
  const capTimer = maxDurationMs !== undefined && maxDurationMs > 0 ? setTimeout(expire, maxDurationMs) : undefined;
  capTimer?.unref?.();
  const clearTimers = () => {
    clearTimeout(timer);
    if (capTimer) clearTimeout(capTimer);
  };
  const resetIdleDeadline = () => {
    if (bodyDeadline !== 'idle') return;
    clearTimeout(timer);
    timer = setTimeout(expire, timeoutMs);
    timer.unref?.();
  };
  // A status-only caller must not keep a process alive until its deadline.
  timer.unref?.();

  try {
    const response = await fetch(url, { ...options, signal: abort.signal });
    if (!response.body) {
      clearTimers();
      return response;
    }

    resetIdleDeadline();
    const reader = response.body.getReader();
    let finished = false;
    let expiry: Error | undefined;
    const finish = () => {
      finished = true;
      clearTimers();
    };
    // Idle streams read ahead of the consumer, so the deadline measures network
    // silence rather than consumer pauses (#962). The read-ahead is bounded; a
    // consumer stalled behind a full buffer still meets the deadline.
    const highWaterMark = bodyDeadline === 'idle' ? IDLE_READ_AHEAD_BYTES : 0;
    // Bytes already received are delivered before the deadline error surfaces.
    const failWhenDrained = (controller: ReadableStreamDefaultController<Uint8Array>) => {
      if (expiry && controller.desiredSize === highWaterMark) controller.error(expiry);
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        expireBody = error => {
          if (finished) return;
          finish();
          expiry = error;
          failWhenDrained(controller);
          // Cancel also settles any pending read before releasing its lock.
          void reader.cancel(error).catch(() => {}).finally(() => reader.releaseLock());
        };
      },
      async pull(controller) {
        if (expiry) return failWhenDrained(controller);
        try {
          const result = await reader.read();
          if (finished) return;
          if (result.done) {
            finish();
            reader.releaseLock();
            controller.close();
          } else {
            resetIdleDeadline();
            controller.enqueue(result.value);
          }
        } catch (error) {
          if (finished) return;
          finish();
          reader.releaseLock();
          controller.error(error);
        }
      },
      async cancel(reason) {
        if (finished) return;
        finish();
        try {
          await reader.cancel(reason);
        } finally {
          reader.releaseLock();
        }
      },
    }, new ByteLengthQueuingStrategy({ highWaterMark }));
    const bounded = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    // Keep fetch metadata while using the bounded stream for body consumers.
    for (const key of ['url', 'redirected', 'type'] as const) {
      Object.defineProperty(bounded, key, { value: response[key] });
    }
    return bounded;
  } catch (error) {
    clearTimers();
    if (expired || (error instanceof Error && error.name === 'AbortError')) {
      throw timeoutError();
    }
    throw error;
  }
}
