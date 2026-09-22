export type TeamIdentity = {
  accent: 'gold' | 'teal' | 'coral' | 'violet' | 'sky' | 'mint';
  jersey: 'classic' | 'stripe' | 'chevron';
};

const ACCENTS: TeamIdentity['accent'][] = ['gold', 'teal', 'coral', 'violet', 'sky', 'mint'];
const JERSEYS: TeamIdentity['jersey'][] = ['classic', 'stripe', 'chevron'];

function hashString(value: string): number {
  let hash = 0;
  for (const character of value) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return hash;
}

export function resolveIdentity(teamId: string, identity?: TeamIdentity): TeamIdentity {
  if (identity) return identity;

  const hash = hashString(teamId);
  return {
    accent: ACCENTS[hash % ACCENTS.length],
    jersey: JERSEYS[Math.floor(hash / ACCENTS.length) % JERSEYS.length],
  };
}

export function teamMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'SS';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
