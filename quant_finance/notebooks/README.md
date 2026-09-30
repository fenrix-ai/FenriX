# notebooks/ — identification benchmark pipeline

Benchmarks local LLMs (served native-GPU via `../models/`) on the task: **read an
anonymized company filing → name the real company.**

## Two generations of data

**v1 — FenriX Synthetic Challenge** (fabricated composites): one clean ~7k-word
`ANNUAL_REPORT.txt` per synthetic company.
- `01_run_identifications.ipynb` — the original interactive harness. Serves each
  model, feeds the report, records the guess. Thinking is toggled per-request via
  `chat_template_kwargs.enable_thinking` (works for both Gemma and Qwen).
- Findings: thinking *hurt* on this retrieval task; results were skewed by the
  fabricated data's uneven quality (some companies were made un-identifiable).
  See `../models/results/_archive_v1_synthetic_challenge/`.

**v2 — real anonymized filing corpus** (current): 8 real companies as numbered dirs
(`1`=AMD `2`=AppLovin `3`=GM `4`=Kroger `5`=McKesson `6`=Netflix `7`=Palantir
`8`=SanDisk), each with dozens–hundreds of **raw SEC full-submission dumps** (XBRL +
exhibits + many 10-Ks/10-Qs/8-Ks). Company/product names are swapped for synthetic
ones, but real business substance remains — so a preprocessing step is required.

### v2 pipeline (scripts, since the raw data can't drive the old notebook)
1. **`extract_reports.py`** — for each company, finds the most-recent real 10-K and
   pulls its **Item 1 Business** narrative out of the XBRL/exhibit soup →
   `../data/processed_reports/company_N.txt` (~9k words each).
2. **`run_identification.py`** — serves each model, feeds each extracted report,
   records + grades the guess against the real-company key →
   `../models/results/identifications_v2/` (`*.json`, `_grading_v2.csv`, `RESULTS_v2.md`).

```bash
python3 notebooks/extract_reports.py      # data/anonymized_filings_7yr/ -> data/processed_reports/
python3 notebooks/run_identification.py   # -> models/results/identifications_v2/
```

> `data/` (raw filings + extracted reports) and `models/gguf/` (weights) are
> gitignored — too large. The extractor regenerates the reports from the raw corpus.

## 02 — LLM trading-strategy backtest (analytics example)

`02_llm_strategy_backtest.ipynb` — an end-to-end example over the same 8 companies as a
tradable universe (real tickers via yfinance). Compares three monthly-rebalanced arms:
a **local LLM** scoring the stocks (shown **anonymized/feature-only** so it can't use
hindsight), the **same framework with a momentum rule** (no LLM), and **buy-and-hold**.
Serves `qwen35-35b-a3b` (best speed×capability from the ID benchmark) over a 7-year
window (universe grows as names list). Illustrative finding: a trivial momentum rule
won big; the LLM cut drawdown the most but *trailed even buy-and-hold* on return —
risk control, not alpha.

### Caveat surfaced in v2
The corpus is only **name-anonymized**: real third-party entities and events leak
(e.g. "Airbus"/"Skywise" for Palantir), which makes identification easier than a
proper de-identification would. Treat v2 accuracy as an upper bound.
