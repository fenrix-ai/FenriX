# PRIVATE — never ships to students

This folder contains the answer key. If any file here reaches a student, the game is
compromised for the whole class.

- `hidden_attributes.csv` — every player's hidden attributes, TrueImpact, archetype,
  and trap flag. This is the finale-reveal data and the sim engine's ground truth.
- `engine_params.json` — calibrated engine constants (logistic k, style scales/constants,
  synergy thresholds, TI weights). The Cloud Functions engine must load exactly these.
- `harness_report.txt` — the validation run that green-lit this dataset build.

Regenerating: `python3 ../generate.py` (writes nothing unless all 9 harness checks pass).
Change dials in `../config.py`; bump `SEED` for a fresh league with the same guarantees.
