/** D3 corpus fixture — validation helpers with branch density.
 *  Pure ESM, no deps; tests run under `node --test`. */

export function passwordStrength(pw) {
  if (typeof pw !== 'string') {
    throw new TypeError('password must be a string');
  }
  if (pw.length < 8) {
    return 'weak';
  }
  let classes = 0;
  if (/[a-z]/.test(pw)) classes += 1;
  if (/[A-Z]/.test(pw)) classes += 1;
  if (/[0-9]/.test(pw)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) classes += 1;

  if (classes >= 3 && pw.length >= 12) {
    return 'strong';
  }
  if (classes >= 2) {
    return 'medium';
  }
  return 'weak';
}

export function isValidUsername(name) {
  if (typeof name !== 'string') {
    return false;
  }
  if (name.length < 3 || name.length > 20) {
    return false;
  }
  if (!/^[a-zA-Z]/.test(name)) {
    return false;
  }
  return /^[a-zA-Z0-9_]+$/.test(name);
}

export function normalizeTag(tag) {
  if (typeof tag !== 'string') {
    throw new TypeError('tag must be a string');
  }
  const t = tag.trim();
  if (t.length === 0) {
    throw new RangeError('tag must not be empty');
  }
  return t.startsWith('#') ? t.slice(1).toLowerCase() : t.toLowerCase();
}
