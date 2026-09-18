import { parseBoxCsv, type BoxRow } from './boxfeed';

export function matchRows(csv: string, gameId: string): BoxRow[] {
  return parseBoxCsv(csv).filter((row) => row.game_id === gameId);
}
