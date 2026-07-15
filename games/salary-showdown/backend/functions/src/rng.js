// fnv1a string hash -> mulberry32 stream. Deterministic everywhere.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function makeRng(seedString) {
  let a = fnv1a(String(seedString)) || 1;
  let spare = null;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (mu = 0, sd = 1) => {
    if (spare !== null) { const s = spare; spare = null; return mu + sd * s; }
    let u, v, s;
    do { u = 2 * next() - 1; v = 2 * next() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * m;
    return mu + sd * u * m;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = int(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  const pick = (arr) => arr[int(0, arr.length - 1)];
  return { next, normal, int, shuffle, pick };
}
