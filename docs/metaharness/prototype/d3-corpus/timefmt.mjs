/** D3 corpus fixture — duration / time formatting with branch density.
 *  Pure ESM, no deps; tests run under `node --test`. */

export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
    throw new TypeError('seconds must be a number');
  }
  if (seconds < 0) {
    throw new RangeError('seconds must be >= 0');
  }
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const parts = [];
  if (h > 0) {
    parts.push(`${h}h`);
  }
  if (m > 0 || h > 0) {
    parts.push(`${m}m`);
  }
  parts.push(`${sec}s`);
  return parts.join(' ');
}

export function relativeBand(deltaSeconds) {
  if (typeof deltaSeconds !== 'number' || Number.isNaN(deltaSeconds)) {
    throw new TypeError('deltaSeconds must be a number');
  }
  const abs = Math.abs(deltaSeconds);
  if (abs < 60) {
    return 'just now';
  }
  if (abs < 3600) {
    return 'minutes';
  }
  if (abs < 86400) {
    return 'hours';
  }
  return 'days';
}

export function pad2(n) {
  if (typeof n !== 'number' || n < 0 || n > 99) {
    throw new RangeError('n must be in [0, 99]');
  }
  return n < 10 ? `0${n}` : `${n}`;
}
