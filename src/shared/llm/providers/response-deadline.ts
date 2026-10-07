/** A provider request deadline covers headers and the response body. */
export async function fetchWithResponseDeadline(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  timeoutError: () => Error,
): Promise<Response> {
  const abort = new AbortController();
  let expired = false;
  let expireBody: ((error: Error) => void) | undefined;
  const timer = setTimeout(() => {
    expired = true;
    const error = timeoutError();
    expireBody?.(error);
    abort.abort(error);
  }, timeoutMs);
  // A status-only caller must not keep a process alive until its deadline.
  timer.unref?.();

  try {
    const response = await fetch(url, { ...options, signal: abort.signal });
    if (!response.body) {
      clearTimeout(timer);
      return response;
    }

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
