"""Salary Showdown dataset generator — every tuning dial in one place.

Mirrors spec §15 (docs/superpowers/specs/2026-07-14-salary-showdown-design.md).
Nothing ships unless harness.py passes all 11 checks (plus the box-arithmetic
diagnostic) against these numbers.
"""

SEED = 310  # MGSC 310. Fixed for reproducibility; bump to regenerate a fresh league.
SCHEMA_VERSION = "1.0"

# ---------------------------------------------------------------- economy
CAP = 100.0                 # $M per round, hard cap
SALARY_MIN, SALARY_MAX = 2.0, 28.0
INFLATION = 0.08            # per round, runtime (not used in generation)

# ---------------------------------------------------------------- pool shape
N_FREE_AGENTS = 150
N_AUCTION = 25              # 5 waves x 5 stars
AUCTION_WAVES = 5
POSITION_MIX = {"G": 0.36, "W": 0.34, "B": 0.30}

# Archetype counts among the 175 (FA pool + auction candidates drawn from top of relevant types)
ARCHETYPE_COUNTS = {
    "efficient_star": 10,
    "volume_trap": 7,      # spec: 6-8 empty-stats traps
    "two_way_wing": 20,
    "elite_defender": 24,  # the bargain cluster's backbone
    "floor_general": 15,
    "sharpshooter": 15,
    "rim_protector": 12,
    "aging_legend": 6,     # trap #2: the cliff
    "young_riser": 15,
    "journeyman": 51,
}

# ---------------------------------------------------------------- aging curve (spec §9.3)
# ONE schedule tells the whole aging story (honest breadcrumb, no hidden cliff):
#   young  +4.5%/yr (total remaining upside capped at +12%)
#   24-29  flat
#   30-32  -4.5%/yr
#   33+    -11%/yr, compounding season over season (level floors at 0.45 of peak)
# * yoy_growth backs out the prev_* columns  -> the published trail draws this curve.
# * age_drift is the engine's PER-SEASON multiplier on last-season (sticker) TrueImpact
#   -> a student extrapolating the prev_ trail predicts the upcoming season correctly.
# * age_level is the cumulative level vs peak; aging legends' CURRENT skill attributes are
#   generated at peak then scaled by it, so their sticker stats already show the fade and
#   the -11%/yr trail, the sticker, and the engine all agree.
def yoy_growth(age: int) -> float:
    """Per-season growth arriving at `age`: level(age) / level(age-1) - 1."""
    if age <= 24:
        return 0.045
    if age <= 29:
        return 0.0
    if age <= 32:
        return -0.045
    return -0.11

def age_drift(age: int) -> float:
    """Multiplier on TrueImpact for the UPCOMING season (sticker stats are last season).
    Same per-season schedule as yoy_growth — the trail extrapolates to this exactly."""
    if age <= 23:
        return min(1.12, 1.0 + 0.045 * (24 - age))   # remaining young upside, capped +12%
    return max(0.45, 1.0 + yoy_growth(age + 1))

def age_level(age: int) -> float:
    """Cumulative skill level vs peak (24-29 = 1.0); compounds yoy_growth, floors at 0.45."""
    lvl = 1.0
    for a in range(30, age + 1):
        lvl *= 1.0 + yoy_growth(a)
    return max(0.45, lvl)

# ---------------------------------------------------------------- TrueImpact weights (spec §8.1)
TI_BASE = 6.0
W_SCORING = 1.60      # scoring_value = fga * (pts_per_shot - PPS_LEAGUE_AVG)
W_PLAYMAKING = 0.55   # per assist
W_STEAL = 1.05        # defense weights sized so the stl/blk win-signal is RECOVERABLE from
W_BLOCK = 1.00        # 90 history rows (check 1) — defense is the underpriced treasure
W_REBOUND = 0.25
W_TURNOVER = 1.50     # the poison: ~2x what intuition prices
W_CREATION = 0.06     # small real value per shot attempt (gravity/shot-creation): volume
                      # scoring isn't worthless, it's OVERPRICED — efficiency still dominates
PPS_LEAGUE_AVG = 1.00
# Balance target (archetype mean TI): efficient stars on top (~12), elite defenders the
# value play (~10), journeymen ~7.5, volume traps ~4-6 ("mediocre starter or worse").

# ---------------------------------------------------------------- synergy (spec §8.2)
# Bars tuned so violating a bar is a SIGNAL, not a constant: harness check 10 asserts that
# 15-50% of the 90 history team-seasons violate at least one bar and that violators average
# at least 2 fewer wins than clean teams.
SHOOTER_3PT_SKILL = 42      # hidden three_pt attribute threshold to count as a "real shooter"
RIM_BLOCK_SKILL = 48        # hidden defense threshold (Bigs/Wings) to count as rim presence
SPACING_PENALTY = -3.0      # <2 shooters among starters
SPACING_BONUS = 1.5         # >=3 shooters
RIM_PENALTY = -3.0
RIM_BONUS = 2.0             # elite (>= RIM_ELITE)
RIM_ELITE = 82

# ---------------------------------------------------------------- playstyles (spec §8.2a)
PLAYSTYLES = ["Balanced", "Run & Gun", "3PT Barrage", "Inside Attack", "Lockdown"]
PACE = {"Balanced": 1.00, "Run & Gun": 1.15, "3PT Barrage": 1.03, "Inside Attack": 1.00, "Lockdown": 0.85}
# Playstyles are ZERO-MEAN DELTAS on team strength: each style's effect is a linear
# function of the team's slot-weighted component sums, plus a constant calibrated at
# generation time so the league-average roster is indifferent between all five styles.
# (Main effects zero by construction; only roster fit moves the needle — spec §9.7.)
# Each style loads dominantly on ITS moderator (not on general quality) so the best
# style for a roster tracks the roster's distinctive dimension, not just how good it is.
STYLE_DELTA = {
    "Balanced":      {},
    "Run & Gun":     dict(tov=-1.00),   # fast pays iff you handle it clean: the delta IS the
                                        # (slot-weighted) turnover burden, so the published tov
                                        # column is an almost-perfect moderator proxy and the
                                        # RGxTOV interaction is recoverable from any 90-row draw
                                        # (mixed security/tov loadings made the fitted slope
                                        # depend on each draw's usage-vs-security variance mix)
    "3PT Barrage":   dict(shooting=1.00, interior=-0.25),  # threes pay iff you can make them
                                                           # (shooting = pure 3pt skill -> tight link to 3p% column)
    "Inside Attack": dict(big_score=0.25, reb_total=1.20),  # paint pays iff you own the glass
                                                            # (reb_total dominates so the published
                                                            # rebounds column is a clean moderator)
    "Lockdown":      dict(stocks=0.90, score=-0.10),     # slow pays iff you force stops
                                                          # (stocks = steals+blocks -> tight link to stl+blk columns)
}
BARRAGE_MISFIRE = -2.0      # extra penalty if Barrage chosen with <3 real shooters in lineup
TARGET_STYLE_SD = 8.0       # every style's delta is rescaled to this SD across the history
                            # population: no style dominates by variance, and fit effects
                            # are large enough to be recoverable from 90 rows (7.5 gives the
                            # per-style interaction tests enough power that one unlucky
                            # 90-row draw doesn't sink check 9; cell-mean balance is handled
                            # by the rerandomized assignment in history.build_history)
STYLE_ASSIGN_TRIES = 300    # rerandomization draws: blocked assignments are drawn until the
                            # per-style cell-mean deltas are all ~0 (best of N kept), so flat
                            # main effects hold by construction, not by luck
HISTORY_QUALITY_TILT = dict(efficiency=9.0, ball_security=9.0, three_pt=8.5)
                            # per-team attribute tilt SDs (market blind spots only): real
                            # leagues have good and bad teams; the wider spreads power the
                            # student regressions.
DEFENSE_TILT_SD = 13.0      # defense tilt is drawn INDEPENDENTLY for perimeter (G) and
                            # interior (B) defenders (W gets the average): steals are
                            # guard-driven and blocks big-driven, so two independent team
                            # tilts make the stl and blk betas separately identifiable
                            # (one shared tilt left them collinear with arbitrary credit
                            # splits). The market only quarter-sees defense, so payroll
                            # |t| must stay < 2 (verified in check 1).

# ---------------------------------------------------------------- game model
LOGISTIC_K = 0.075          # steepness on strength gap; tuned by harness check 4
# Game-level k multiplier by pace (fewer possessions -> more upsets):
def pace_k_factor(pace_a: float, pace_b: float) -> float:
    return (pace_a + pace_b) / 2.0

TIER_WEIGHTS = {"starter": 1.0, "sixth": 0.6, "bench": 0.35}

# ---------------------------------------------------------------- market / mispricing (spec §9.1)
HYPE_W_PTS, HYPE_W_FOLLOWERS, HYPE_W_FGA, HYPE_W_AST = 0.45, 0.20, 0.15, 0.10
HYPE_W_SKILL = 0.40         # the market sees VISIBLE skill (playmaking + half-credit defense)
                            # but stays blind to the designed blind spots: efficiency,
                            # turnovers, and age. Keeps salary~TI honest for normal players
                            # while traps stay fully overpriced.
HYPE_NOISE = 0.10
SALARY_NOISE_SD = 0.18      # price dispersion: enough mispricing for a healthy bargain cluster
                            # (also keeps payroll and avg_hype from being near-duplicates in
                            # the check-1 regression — their collinearity was inflating both
                            # t-stats in opposite directions on unlucky draws)
SCOUT_GRADE_R = 0.22        # target correlation of scout grade with TI (grade-only strategy must stay mid-table)
GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D"]
PERSONALITIES = ["Leader", "Professional", "Quiet", "Diva", "Hothead"]

# ---------------------------------------------------------------- league history (spec §7.1, §9.7)
N_HISTORY_TEAMS = 30
N_HISTORY_SEASONS = 3
HISTORY_GAMES = 82
# Style assignment is RANDOMIZED with equal counts (18 team-seasons per style):
# guarantees flat main effects and full moderator spread per cell by construction.
# (Fit-based assignment was tried and creates selection bias — see harness history.)
TEAM_STAT_NOISE = 0.02      # relative noise on aggregated counting stats
PCT_NOISE = 0.003           # ADDITIVE noise on percentage columns (between-team spread is ~0.008;
                            # multiplicative noise was drowning the efficiency signal)

# ---------------------------------------------------------------- market rotation (runtime; validated in check 7)
ROUND1_POOL_SHARE = 0.75
DRAW_SHARE = 0.45
REAPPEAR_GUARANTEE = 2

# ---------------------------------------------------------------- fairness sim (spec §10.4)
FAIR_N_SEASONS = 400
FAIR_N_TEAMS = 20
FAIR_ROUNDS = 5             # each round: round robin (19 games) -> 95-game season
FAIR_TOP3_TARGET = (0.60, 0.93)     # modeler finishes top-3
FAIR_CHAMP_TARGET = (0.30, 0.62)    # modeler wins it all — high end is fine pedagogically:
                                    # "the analysis team usually wins" is the point of the class
ROSTER_SIZE = 8
LINEUP = {"G": 2, "W": 2, "B": 1}
