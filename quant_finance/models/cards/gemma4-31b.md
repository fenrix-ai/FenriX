# Gemma 4 31B (dense) — `gemma4-31b`

**Archetype:** Gemma 4 (US frontier / Google) · **Size tier:** mid-dense · **Arch:** dense

| Field | Value |
|---|---|
| Total params | 31B |
| Active params | — (dense) |
| Quant | Q4_K_M |
| Est. VRAM @ 8K ctx | ~18 GB |
| 32 GB fit | clean |
| GGUF source | `unsloth/gemma-4-31b-GGUF` |

**Role in the benchmark**
- **Q1 (size):** the Gemma "dense that barely fits" entry — the direct dense-vs-MoE contrast against `gemma4-26b-a4b` within one lab (isolates architecture from provider).
- **Q2 (provider):** Google's dense entrant vs. `qwen35-27b` and `llama33-70b`.

**What to expect**
All 31B params active every token → slower than the 26B-A4B MoE despite similar total size, but strong quality (ranked #3 open model on Arena at release).

**Provenance / notes**
Largest dense Gemma 4. Barely-fits framing here means "biggest dense you'd run at Q4 on 32 GB with room for context."
