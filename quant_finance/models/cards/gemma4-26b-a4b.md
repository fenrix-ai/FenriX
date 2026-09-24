# Gemma 4 26B-A4B — `gemma4-26b-a4b`

**Archetype:** Gemma 4 (US frontier / Google) · **Size tier:** big-moe · **Arch:** Mixture-of-Experts

| Field | Value |
|---|---|
| Total params | 26B |
| Active params | 4B |
| Quant | Q4_K_M |
| Est. VRAM @ 8K ctx | ~15 GB |
| 32 GB fit | clean |
| GGUF source | `unsloth/gemma-4-26b-a4b-GGUF` |

**Role in the benchmark**
- **Q1 (size):** the Gemma "large MoE" entry — vs. `gemma4-31b` (dense) and `gemma4-12b` (small).
- **Q2 (provider):** Google's entrant in the barely-fits MoE row vs. `qwen35-35b-a3b` and `llama4-scout`.

**What to expect**
Only 4B active → generation speed closer to a small model than its 26B total suggests, while quality benefits from the larger parameter pool. Clean fit leaves VRAM headroom for context.

**Provenance / notes**
Gemma 4 released Apr 2026, Apache 2.0, multimodal, up to 256K context (we cap at 8K for the reports).
