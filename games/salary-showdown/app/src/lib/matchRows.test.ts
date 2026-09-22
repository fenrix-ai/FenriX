import { matchRows } from './matchRows';

const CSV = [
  'round,game_id,team,opponent,team_score,opp_score,win,player_id,player_name,position,tier,mins,pts,fgm,fga,three_pm,three_pa,rebounds,assists,steals,blocks,turnovers,playstyle',
  '2,R2-G011,Tigers,Tigers,108,103,1,101,Arlo King,G,starter,34,22,8,15,3,6,4,7,2,0,2,Balanced',
  '2,R2-G011,Tigers,Tigers,103,108,0,202,Devon Miles,W,starter,33,19,7,14,2,5,8,3,1,1,3,Lockdown',
  '2,R2-G012,Tigers,Falcons,99,101,0,303,Noah Park,B,starter,32,14,6,10,0,0,11,2,0,3,1,Inside Attack',
  '2,R2-G012,Falcons,Tigers,101,99,1,404,Eli Stone,G,starter,35,25,9,16,4,8,3,6,2,0,2,3PT Barrage',
].join('\n');

test('selects the complete game by id when team names collide across the feed', () => {
  const rows = matchRows(CSV, 'R2-G011');

  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.game_id)).toEqual(['R2-G011', 'R2-G011']);
  expect(rows.map((row) => row.player_name)).toEqual(['Arlo King', 'Devon Miles']);
  expect(rows.every((row) => row.team === 'Tigers' && row.opponent === 'Tigers')).toBe(true);
});
