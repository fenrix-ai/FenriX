const ACCENTS = new Set(['gold', 'teal', 'coral', 'violet', 'sky', 'mint']);
const JERSEYS = new Set(['classic', 'stripe', 'chevron']);

export function isTeamIdentity(value) {
  return value !== null && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === 2
    && ACCENTS.has(value.accent)
    && JERSEYS.has(value.jersey);
}

export function isGameId(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !value.includes('/');
}
