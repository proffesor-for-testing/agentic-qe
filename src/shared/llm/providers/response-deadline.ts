/** Bound headers and bodies; streaming callers may use an idle body deadline. */
export async function fetchWithResponseDeadline(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  timeoutError: () => Error,
  bodyDeadline: 'absolute' | 'idle' = 'absolute',
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
      clearTimeout(timer);
      return response;
    }

    resetIdleDeadline();
    const reader = response.body.getReader();
    let finished = false;
    const finish = () => {
      finished = true;
      clearTimeout(timer);
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        expireBody = error => {
          if (finished) return;
          finish();
          controller.error(error);
          // Cancel also settles any pending read before releasing its lock.
          void reader.cancel(error).catch(() => {}).finally(() => reader.releaseLock());
        };
      },
      async pull(controller) {
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
    }, { highWaterMark: 0 });
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
    clearTimeout(timer);
    if (expired || (error instanceof Error && error.name === 'AbortError')) {
      throw timeoutError();
    }
    throw error;
  }
}
