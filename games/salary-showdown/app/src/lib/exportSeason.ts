// Season CSV export (design spec §5.7): concatenate the per-round boxCsv
// payloads into one file — the header row of the first CSV exactly once, then
// every data row from every CSV in round order. LF line endings, one trailing
// LF. The 23-column boxCsv format is FROZEN: rows pass through verbatim, no
// reformatting, no re-parsing.
export function concatBoxCsv(csvs: string[]): string {
  const nonEmpty = csvs.filter((c) => c.trim().length > 0);
  if (nonEmpty.length === 0) return '';
  const out: string[] = [];
  nonEmpty.forEach((csv, i) => {
    const lines = csv.split('\n').filter((l) => l.length > 0);
    out.push(...(i === 0 ? lines : lines.slice(1)));
  });
  return `${out.join('\n')}\n`;
}
