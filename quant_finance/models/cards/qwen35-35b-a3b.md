# Qwen3.5 35B-A3B — `qwen35-35b-a3b`

**Archetype:** Qwen3.5 (CN / Alibaba, RL-heavy post-training) · **Size tier:** big-moe · **Arch:** Mixture-of-Experts

| Field | Value |
|---|---|
| Total params | 35B |
| Active params | 3B |
| Quant | Q4_K_M |
| Est. VRAM @ 8K ctx | ~20 GB |
| 32 GB fit | clean |
| GGUF source | `unsloth/Qwen3.5-35B-A3B-GGUF` |

**Role in the benchmark**
- **Q1 (size):** the Qwen "large MoE" entry.
- **Q2 (provider):** the Chinese/RL-heavy entrant in the barely-fits MoE row vs. `gemma4-26b-a4b` and `llama4-scout`.

**What to expect**
Fewest active params in the MoE row (3B) → likely the fastest generation of the three big MoEs, testing whether heavy RL post-training closes the quality gap to models that activate more compute.

**Provenance / notes**
Qwen3.5 released Feb 2026 (Alibaba). Base + Instruct; GGUFs via Unsloth. We use the Instruct variant.
