# Qwen3.5 9B (dense) — `qwen35-9b`

**Archetype:** Qwen3.5 (CN / Alibaba, RL-heavy post-training) · **Size tier:** small-fast · **Arch:** dense

| Field | Value |
|---|---|
| Total params | 9B |
| Active params | — (dense) |
| Quant | Q4_K_M |
| Est. VRAM @ 8K ctx | ~6 GB |
| 32 GB fit | clean |
| GGUF source | `unsloth/Qwen3.5-9B-GGUF` |

**Role in the benchmark**
- **Q1 (size):** the Qwen "smaller/faster (dumber)" entry.
- **Q2 (provider):** the Chinese small entrant vs. `gemma4-12b` and `llama31-8b` — a good test of whether RL-heavy post-training punches above its weight at small scale.

**What to expect**
Fast, comfortable fit. The interesting question is whether Qwen's post-training lets a 9B match larger rivals on identification.

**Provenance / notes**
Qwen3.5 9B dense, Mar 2026. Instruct variant.
