# Qwen3.5 27B (dense) — `qwen35-27b`

**Archetype:** Qwen3.5 (CN / Alibaba, RL-heavy post-training) · **Size tier:** mid-dense · **Arch:** dense

| Field | Value |
|---|---|
| Total params | 27B |
| Active params | — (dense) |
| Quant | Q4_K_M |
| Est. VRAM @ 8K ctx | ~16 GB |
| 32 GB fit | clean |
| GGUF source | `unsloth/Qwen3.5-27B-GGUF` |

**Role in the benchmark**
- **Q1 (size):** the Qwen "dense that barely fits" entry — dense-vs-MoE contrast against `qwen35-35b-a3b` within one lab.
- **Q2 (provider):** the Chinese dense entrant vs. `gemma4-31b` and `llama33-70b`.

**What to expect**
Largest dense Qwen3.5; all params active every token → slower than the 35B-A3B MoE but a clean fit with headroom. Good apples-to-apples for "does dense beat MoE at equal-ish total size?"

**Provenance / notes**
Qwen3.5 dense, Feb 2026. Barely-fits tier can be pushed to Q6/Q8 later to fill VRAM (a max-fit follow-on).
