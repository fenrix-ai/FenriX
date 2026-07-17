import { FirebaseError } from 'firebase/app';
import { fmtM } from './money';

const TABLE: Record<string, string> = {
  POSITION_LOCK: 'Signing him would leave too few open slots to field 2 G / 2 W / 1 B.',
  STAR_TAKEN: 'Another team claimed this star first.',
  ALREADY_SIGNED: 'He is already under contract with your team.',
  NOT_IN_MARKET: 'He is not signable tonight.',
  ROSTER_FULL: 'Your roster is full — 10 players is the maximum.',
  BAD_YEARS: 'That contract length is not available this round.',
  MIN_BID: 'Bid is below tonight\'s league minimum.',
  BID_STEP: 'Bids move in $0.1M steps.',
  NOT_IN_WAVE: 'That star is not on tonight\'s block.',
  BAD_RATE: 'Enter a valid salary figure.',
  BAD_PLAYSTYLE: 'Pick one of the five playstyles.',
  DUPLICATE_PLAYER: 'A player appears in two lineup spots.',
  NOT_ON_ROSTER: 'Your lineup does not match your current roster — it has been refreshed.',
  BAD_TEMPLATE: 'Starters must be exactly 2 Guards, 2 Wings, 1 Big, plus a Sixth Man.',
  BAD_SHAPE: 'The lineup did not submit cleanly — rearrange and resubmit.',
  'market is closed': 'Free agency is closed.',
  'auction is closed': 'The auction is closed.',
  'lineups are locked': 'Lineups are locked for this round.',
  'only expiring contracts re-sign here': 'Only expiring contracts can re-sign in Front Office.',
};

export function errorCopy(err: unknown): { headline: string; raw?: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const cap = msg.match(/CAP_EXCEEDED:(\d+):([\d.]+)/);
  if (cap) {
    return { headline: `Over the cap: round ${cap[1]} payroll would hit ${fmtM(Number(cap[2]))} against the ${fmtM(100)} cap.` };
  }
  for (const key of Object.keys(TABLE)) if (msg.includes(key)) return { headline: TABLE[key] };
  if (msg.startsWith('cut:')) return { headline: 'That player is not on your roster.' };
  if (err instanceof FirebaseError && err.code === 'functions/already-exists') {
    return { headline: 'That seat was just taken — pick another role.' };
  }
  return { headline: 'That did not go through — try again.', raw: msg };
}
