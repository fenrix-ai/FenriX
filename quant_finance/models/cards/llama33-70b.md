# Llama 3.3 70B (dense) — `llama33-70b`

**Archetype:** Llama (US classic / Meta) · **Size tier:** mid-dense · **Arch:** dense

| Field | Value |
|---|---|
| Total params | 70B |
| Active params | — (dense) |
| Quant | Q3_K_M |
| Est. VRAM @ 8K ctx | ~34 GB (exceeds 32 GB) |
| 32 GB fit | **offload** (partial GPU, `ngl` ≈ 42, TUNE) |
| GGUF source | `unsloth/Llama-3.3-70B-Instruct-GGUF` |

**Role in the benchmark**
- **Q1 (size):** the Llama "dense that barely fits" entry — except it *doesn't* fit. Llama 4 is MoE-only and there is no ~30B dense Llama, so the honest dense representative is 3.3 70B with CPU offload.
- **Q2 (provider):** Meta's dense entrant vs. `gemma4-31b` and `qwen35-27b`.

**What to expect**
Even at `Q3_K_M` it spills past 32 GB → partial CPU offload → **much lower tok/s** than the fully-GPU-resident models. That slowness is itself a key finding: *the classic US line has no 32 GB-native model at this tier.* Tune `-ngl` on the 5090 until it loads without OOM.

**Provenance / notes**
Llama 3.3 70B Instruct (not "Llama 4 70B" — no such model). Mixed-generation column by necessity. `ngl: 42` in the registry is a starting estimate (70B ≈ 80 layers), not a measured value.
