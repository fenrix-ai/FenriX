# Salary Showdown — Scouting Package (schema v1.0)

*This folder is the student-facing pre-release. Everything in here ships to the class
~1 week before the live session. Nothing outside this folder ever ships.*

## Files

### `players.csv` — 175 players, 26 columns

Every player available this season: 150 free agents (listed `salary_per_round`, in $M)
and 25 auction-class stars (`salary_per_round` blank — their price is whatever the
bidding sets; `auction_round` 1–5 tells you which round they hit the block).

- Rosters hold a maximum of 10 players; only 8 dress for a game.
- Not every free agent is on the market every night — scout a deep board before class.

All stats are **last season, per game**. `prev_*` columns are the season before that.

| Column | Meaning |
|---|---|
| `player_id` | stable ID — join key across every file |
| `name`, `position` | position: `G`uard / `W`ing / `B`ig |
| `age`, `years_pro` | age at the start of this season |
| `hype` | fan/media buzz, 1.0–5.0 stars |
| `salary_per_round` | asking price per round, $M (blank = auction-class) |
| `auction_round` | round his auction happens (blank = free agent) |
| `personality` | scouting-report label |
| `scout_grade` | consensus scout evaluation, A+ … D |
| `social_media_followers` | total followers across platforms |
| `games_played` | of 82 last season |
| `mins_per_game`, `pts_per_game`, `fg_attempts_per_game` | volume numbers |
| `fg_pct`, `three_pt_pct`, `ft_pct` | shooting percentages |
| `rebounds/assists/steals/blocks/turnovers_per_game` | box-score rates |
| `prev_pts_per_game`, `prev_fg_pct`, `prev_mins_per_game` | two seasons ago |

### `league_history.csv` — 90 team-seasons, 16 columns

Three seasons × 30 teams from the professional league your franchise is joining.
Team-level per-game stats, final `wins`/`losses` (82 games), `total_payroll` ($M),
`avg_hype`, and each team's `playstyle` (Balanced / Run & Gun / 3PT Barrage /
Inside Attack / Lockdown — the same five you'll choose from every round).

**Note on payrolls:** the $100M hard salary cap is NEW this season. Historical
payrolls were uncapped — some franchises spent freely. Whether that spending bought
wins is, well, something you can check.

## The assignment, informally

You're a front office. Draft night is in class. Decide what actually wins basketball
games, decide who's worth what, and come in with a plan. Every column above is real
data from the same league you'll be playing in.
