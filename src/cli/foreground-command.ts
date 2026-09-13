/**
 * Tracks CLI commands that intentionally own the foreground process lifetime.
 *
 * Most AQE commands must be force-cleaned after Commander dispatch completes
 * because native handles can keep Node alive. A foreground command is the
 * inverse: the CLI must not force-exit merely because dispatch has completed.
 */
let foregroundCommandActive = false;

export function activateForegroundCommand(): () => void {
  foregroundCommandActive = true;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    foregroundCommandActive = false;
  };
}

export function isForegroundCommandActive(): boolean {
  return foregroundCommandActive;
}
