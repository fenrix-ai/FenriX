# Gemma 4 12B (dense) — `gemma4-12b`

**Archetype:** Gemma 4 (US frontier / Google) · **Size tier:** small-fast · **Arch:** dense

| Field | Value |
|---|---|
| Total params | 12B |
| Active params | — (dense) |
| Quant | Q4_K_M |
| Est. VRAM @ 8K ctx | ~8 GB |
| 32 GB fit | clean |
| GGUF source | `unsloth/gemma-4-12b-GGUF` |

**Role in the benchmark**
- **Q1 (size):** the Gemma "smaller/faster (dumber)" entry — fast, comfortable fit; the baseline that only wins Q1 if the bigger models are prohibitively slow.
- **Q2 (provider):** Google's small entrant vs. `qwen35-9b` and `llama31-8b`.

**What to expect**
Fastest Gemma here with lots of VRAM headroom; expect more identification misses than the 26B/31B — the speed-vs-quality floor for this provider.

**Provenance / notes**
Gemma 4 12B dense. An even-smaller option (`E4B`, ~4.5B) exists if a truly tiny tier is wanted later.
