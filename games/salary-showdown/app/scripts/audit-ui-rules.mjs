// UI-rules audit: (1) no emojis anywhere in src (glyphs ★▲▼½ are fine and not
// in these ranges); (2) never read config.timers (it does not exist on the wire);
// (3) no judgment adjectives in string literals (facts, never conclusions).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// U+2605 (★) is the sanctioned hype glyph — carved out of the 2600 block on purpose.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2606}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/u;
const JUDGMENT = /(['"`])[^'"`]*\b(underperforming|declining|washed|a steal|overpaid|overpriced|elite pick|great value)\b[^'"`]*\1/i;

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(f) && !/\.(test|itest)\./.test(f)) files.push(p);
  }
})('src');

let bad = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of [['emoji', EMOJI], ['judgment-language', JUDGMENT]]) {
      if (re.test(line)) { console.error(`${f}:${i + 1} ${name}: ${line.trim()}`); bad++; }
    }
    if (line.includes('config.timers')) {
      console.error(`${f}:${i + 1} reads config.timers (does not exist on the wire)`); bad++;
    }
  });
}
if (bad) { console.error(`\naudit:ui FAILED — ${bad} finding(s)`); process.exit(1); }
console.log(`audit:ui clean — ${files.length} files scanned`);
