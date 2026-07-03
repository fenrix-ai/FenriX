# Identification benchmark v2 — real anonymized 10-K corpus (2026-07-02)

## Data
The **anonymized real filing corpus** (`data/anonymized_filings_7yr/`): 8 companies as
numbered dirs, each with dozens–hundreds of raw SEC full-submission dumps (XBRL +
exhibits + 10-Ks/10-Qs/8-Ks). `notebooks/extract_reports.py` pulls each company's
most-recent 10-K **Item 1 Business** narrative → `data/processed_reports/company_N.txt`
(~9k words). Then 7 models × 8 companies, nothink, native-GPU llama.cpp.

**Ground truth:** 1=AMD 2=AppLovin 3=GM 4=Kroger 5=McKesson 6=Netflix 7=Palantir 8=SanDisk

## Results

| company → real | g4-12b | g4-26b | g4-31b | llama8b | qw-27b | qw-35b | qw-9b | /7 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| AMD | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **7** |
| AppLovin | ✓ | ✓ | ✓ | · | ✓ | · | · | 4 |
| General Motors | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **7** |
| Kroger | · | · | ✓ | · | ✓ | ✓ | · | 3 |
| McKesson | · | · | · | ✓ | · | ✓ | · | **2** |
| Netflix | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **7** |
| Palantir | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **7** |
| SanDisk | ✓ | · | · | · | ✓ | · | ✓ | 3 |
| **model /8** | 6 | 5 | 6 | 5 | **7** | 6 | 5 | |

## Findings

1. **⚠️ The corpus is only *name*-anonymized, not de-identified.** Real third-party
   entities and events leak straight through — e.g. company 7 (Palantir) still names
   **"Airbus"** and **"Skywise"** (its real customer + product), and models cite GM's
   real ignition-switch recall, etc. That's why **AMD, GM, Netflix, Palantir = 7/7**
   (trivially identifiable). The regex name-swap ran; the deeper agent de-id pass
   evidently did not (or missed third parties). **v2 accuracy is an upper bound** and
   the benchmark is currently measuring "read the leaks," not real de-anonymization.

2. **Provider ranking (from v1) does not hold.** On the fabricated v1 set Gemma beat
   Qwen; here **Qwen3.5-27B leads (7/8)** and Qwen ties/edges Gemma. The earlier
   "Qwen weaker on US companies" claim was a v1-data artifact — retract it.

3. **Every miss is a near-miss (right industry, adjacent company).**
   - **McKesson → 2/7**: models said **Cardinal Health / AmerisourceBergen (Cencora)** —
     the other Big-3 US pharma distributors. Genuinely ambiguous.
   - **SanDisk → Kioxia / Solidigm / Western Digital** (NAND JV partner / competitor / parent).
   - **Kroger → Ahold / Albertsons / Walmart**; **AppLovin → Unity**.
   Exact-company scoring is harsh; a sector-match metric would score much higher.

## Caveats
N=8, single run, nothink, temp 0.3 — directional. AMD & Netflix needed a char-based
extractor (their Business section is one giant line among exhibits; see
`extract_reports.py`). Files: per-model `*.json`, full grading `_grading_v2.csv`.
