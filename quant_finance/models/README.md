# models/ — local LLM fleet for the FenriX identification benchmark

Registry-driven set of **8 local open-weight LLMs** run on a single **RTX 5090
(32 GB VRAM)** via **llama.cpp**, benchmarked on the FenriX Synthetic
Identification Challenge (`../data/FenriX_Synthetic_challenge/`): read an
anonymized 10-K → **identify the real company**.

We measure **inference speed**, **quality** (correct identification), and
**model-vs-model comparisons** across two axes.

## The two comparison questions

**Q1 — Which size/architecture wins?** (rows below)
Large MoE that barely fits vs. dense that barely fits vs. smaller/faster (dumber).

**Q2 — Which provider archetype wins?** (columns below)
Gemma 4 (US frontier / Google) vs. Qwen3.5 (CN / Alibaba, RL-heavy) vs. Llama (US classic / Meta).

## The grid

| Size tier | Gemma 4 | Qwen3.5 | Llama |
|---|---|---|---|
| **big-moe** (barely fits) | `gemma4-26b-a4b` (4B act.) | `qwen35-35b-a3b` (3B act.) | — *(Scout dropped: ~65 GB, doesn't fit)* |
| **mid-dense** (barely fits) | `gemma4-31b` | `qwen35-27b` | `llama33-70b` · offload/slow |
| **small-fast** (dumber) | `gemma4-12b` | `qwen35-9b` | `llama31-8b` |

All at **`Q4_K_M`** (fair, constant ~4 bits/weight) except `llama33-70b`, too big
for 32 GB at Q4, which drops to `Q3_K_M`. Notable points — themselves findings:

- **Llama's big-MoE cell is empty by choice.** Llama 4 Scout (109B / 17B-active)
  is ~65 GB at Q4 → far past 32 GB, so it's dropped; the big-MoE trajectory is
  extrapolated from the Gemma/Qwen MoEs plus the dense size sweep.
- **Llama has no clean ~30B dense**, so its mid-dense cell is 3.3 70B with CPU
  offload (slow). The Llama column deliberately mixes generations (3.3 / 3.1).
- **MoE active-param spread:** Gemma 4B vs. Qwen 3B active — both fit cleanly, a
  direct "does more active compute help?" contrast within the big-MoE row.

See `registry.yaml` for exact repos, quants, and per-model VRAM/fit notes.

## Prerequisites (on the 5090 host)

- **llama.cpp** built with CUDA, with `llama-server` and `llama-bench` on `PATH`.
- **huggingface_hub** CLI + pyyaml:
  ```bash
  python3 -m pip install -U huggingface_hub pyyaml
  ```

## Quickstart

```bash
cd quant_finance/models

# 1. Download weights (all, or pick ids). Lands in gguf/<id>/ (gitignored).
scripts/download.sh                      # or: scripts/download.sh gemma4-12b qwen35-9b

# 2. Benchmark raw speed → results/<id>.json (prompt & generation tok/s).
scripts/bench.sh gemma4-12b

# 3. Serve for the identification task (OpenAI-compatible API on :8080).
scripts/serve.sh gemma4-12b
#    → http://127.0.0.1:8080/v1
```

The offload model (`llama33-70b`) needs `-ngl` tuning (passed straight through):
```bash
scripts/serve.sh llama33-70b -ngl 48      # tune GPU layers until it fits in 32 GB
scripts/bench.sh llama33-70b -ngl 48
```

## Layout

```
models/
├── README.md          # this file
├── registry.yaml      # SINGLE SOURCE OF TRUTH — 8 model entries (scripts + notebooks read this)
├── scripts/
│   ├── _registry.py   # tiny YAML reader used by the shell scripts
│   ├── download.sh    # hf download GGUFs → gguf/<id>/
│   ├── serve.sh <id>  # llama-server (OpenAI API) for the ID task
│   └── bench.sh <id>  # llama-bench → results/<id>.json (speed)
├── cards/<id>.md      # one card per model (provenance, arch, quant, expected behavior)
├── gguf/              # (gitignored) downloaded weights
└── results/           # (gitignored) llama-bench speed outputs
```

**Adding/removing a model** is a one-line edit in `registry.yaml`; the scripts and
the benchmarking notebooks all read from it. `id` is the stable slug used for
`gguf/<id>/`, `results/<id>.json`, and `cards/<id>.md`.

> Weights (`gguf/`) and bench outputs (`results/`) are gitignored — only the
> registry, scripts, and cards are version-controlled.
