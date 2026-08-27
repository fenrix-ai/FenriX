# Llama 3.1 8B (dense) — `llama31-8b`

**Archetype:** Llama (US classic / Meta) · **Size tier:** small-fast · **Arch:** dense

| Field | Value |
|---|---|
| Total params | 8B |
| Active params | — (dense) |
| Quant | Q4_K_M |
| Est. VRAM @ 8K ctx | ~5 GB |
| 32 GB fit | clean |
| GGUF source | `unsloth/Llama-3.1-8B-Instruct-GGUF` |

**Role in the benchmark**
- **Q1 (size):** the Llama "smaller/faster (dumber)" entry — smallest, fastest, most VRAM headroom.
- **Q2 (provider):** Meta's small entrant vs. `gemma4-12b` and `qwen35-9b`; also the "how far has open source come?" anchor, being the oldest-lineage model in the fleet.

**What to expect**
Very fast, trivial fit. Expect the most identification misses — the classic baseline against which the newer small models (Gemma 4 12B, Qwen3.5 9B) are measured.

**Provenance / notes**
Llama 3.1 8B Instruct — the enduring small-dense classic. Llama 4 has no small dense model, so the small-fast Llama cell reaches back to the 3.1 line.
