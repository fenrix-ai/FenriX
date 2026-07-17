import { parseBoxCsv, seasonForm, teamRows } from './boxfeed';

const CSV = [
  'round,game_id,team,opponent,team_score,opp_score,win,player_id,player_name,position,tier,mins,pts,fgm,fga,three_pm,three_pa,rebounds,assists,steals,blocks,turnovers,playstyle',
  '1,R1-G001,"Alpha, LLC",Beta,101,99,1,1170,Tobias Beckett,B,starter,33,8,4,7,0,0,9,1,2,3,1,Balanced',
  '1,R1-G001,Beta,"Alpha, LLC",99,101,0,1170,Tobias Beckett,B,starter,30,6,3,6,0,0,7,1,1,2,0,Lockdown',
].join('\n');

test('parses the 23-column feed, quote-aware, numerics coerced', () => {
  const rows = parseBoxCsv(CSV);
  expect(rows).toHaveLength(2);
  expect(rows[0].team).toBe('Alpha, LLC');
  expect(rows[0].pts).toBe(8);
  expect(rows[1].playstyle).toBe('Lockdown');
});
test('seasonForm pools ALL copies of a pid (non-exclusive FA)', () => {
  const form = seasonForm(parseBoxCsv(CSV));
  expect(form.get(1170)).toEqual({ gp: 2, ppg: 7, fgPct: 7 / 13 });
});
test('teamRows filters by display name', () => {
  expect(teamRows(parseBoxCsv(CSV), 'Beta')).toHaveLength(1);
});
