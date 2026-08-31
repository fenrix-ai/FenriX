# Overnight run report — 2026-06-30

Everything you asked for is **done and validated**: 8 models downloaded, llama.cpp
built **natively for the 5090 (sm_120)** with real-GPU speed confirmed, all 8
speed-benchmarked, and the identification pipeline proven end-to-end.

## 1. Models downloaded ✅
All 8 GGUFs present + verified (real files, expected sizes), **120 GB** in
`models/gguf/`. Llama 4 Scout dropped as agreed (65 GB, doesn't fit 32 GB).

## 2. llama.cpp — native sm_120 build ✅
- Installed **CUDA 12.9.1 toolkit to `~/cuda-12.9`** (user dir, **no sudo**).
- Built llama.cpp with `CMAKE_CUDA_ARCHITECTURES=120`. Binaries symlinked to
  `~/.local/bin` (on PATH): `llama-server`, `llama-bench`, `llama-cli`.
- **Validated native GPU**: `backend=CUDA`, `RTX 5090, compute capability 12.0`.
  This is real Blackwell execution — not CPU, not a generic/JIT fallback.

## 3. Speed benchmark ✅  (`llama-bench`, native sm_120, -r 3)
`pp512` = prompt-processing t/s · `tg128` = token-generation t/s. Per-model JSON in
`results/<id>.json`; table in `results/_summary.txt`.

| model | provider | tier | pp512 t/s | tg128 t/s | fit |
|---|---|---|--:|--:|---|
| llama31-8b | llama | small-fast | 15214 | **253.7** | clean |
| qwen35-35b-a3b | qwen | big-moe | 8300 | **220.3** | clean |
| gemma4-26b-a4b | gemma | big-moe | 11522 | **203.4** | clean |
| qwen35-9b | qwen | small-fast | 11770 | 202.8 | clean |
| gemma4-12b | gemma | small-fast | 9141 | 146.7 | clean |
| qwen35-27b | qwen | mid-dense | 3832 | 76.0 | clean |
| gemma4-31b | gemma | mid-dense | 3600 | 71.4 | clean |
| llama33-70b | llama | mid-dense | 359 | **3.2** | offload |

**What the speed data already says (Q1 — which size/arch):**
- **MoEs win on speed-for-size.** The big MoEs (26–35 B total, 3–4 B active)
  generate at **~200–220 t/s** — as fast as the *small* dense models — because
  only a few B params are active. Big-model capacity, small-model latency.
- **Mid dense is ~3× slower** (71–76 t/s): all params active, bandwidth-bound.
- **The 70B-offload is a non-starter: 3.2 t/s.** Exactly the "prohibitively slow"
  case — ~65× slower than the MoEs. Running the full corpus through it is hours;
  through a MoE it's minutes. The size-#3 (small/fast) tier only matters if you're
  forced onto offload models, which the MoEs let you avoid.

## 4. Identification pipeline — smoke test ✅
Served `gemma4-12b`, fed the full **Keystone Microsystems** 10-K (9,958 tokens),
asked it to identify the real company. With thinking disabled it answered in 4.2 s:

> **Zebra Technologies Corporation** — saw past the semiconductor-sounding synthetic
> name to the real business (ruggedized mobile computing, industrial printers,
> RFID/location services, logistics/warehouse focus, hardware→services pivot), and
> noted the ~$48 B revenue was scaled up from the real ~$5 B.

Whole chain works: `serve.sh` → native-GPU `llama-server` → OpenAI API → long-report
ingestion → reasoned company ID.

## 5. Findings that matter for the benchmark design (for us to decide together)
1. **These are reasoning/thinking models.** Left on, Gemma 4 12B burned **3,500+
   tokens still thinking** and never emitted a final answer (`content` empty,
   `reasoning_content` full). Two knobs: run with thinking **on** (better ID, but
   large token/time budget, read `content` after `</think>`) or **off**
   (`--reasoning-budget 0` → crisp bounded answers, 329 tokens/4 s here). Worth
   testing both as a benchmark dimension.
2. **Context 8192 is too small.** Reports are ~8–10 k tokens; the ID task needs
   **≥16384** ctx (I used 16 k). The registry `context: 8192` should bump to 16384
   before the real runs — note this raises KV-cache VRAM for the big dense models.
3. **Grading has no answer key in the dataset** — we'll need to define the
   real-company ground truth + a scoring method (exact match / sector / judged).

## 6. Issues hit & fixed (so they don't bite again)
- **The Bash tool runs under `zsh`**, so `set -e` in my scripts was ignored → now
  scripts run via explicit `bash`.
- **WSLg sets `DISPLAY=:0`** → the CUDA runfile tried to spawn an `xterm` GUI and
  died (`exec: -title: not found`) → fixed with `unset DISPLAY` before install.
- **pyenv**: `pip install cmake` isn't on PATH until `pyenv rehash` → resolve the
  real binary via `python -c "import cmake; print(cmake.CMAKE_BIN_DIR)"`.
- CUDA runfile partial download → resumable `curl -C -` + size verification.

## 7. What's ready for you
- All models + a working native-GPU llama.cpp; `scripts/{download,serve,bench}.sh`.
- Speed numbers captured (`results/`).
- Registry/README/cards reflect the 8-model grid (Scout removed).
- **Next (with you):** design the quality benchmark — ground-truth mapping, the
  identification prompt, thinking-on vs -off, scoring, and the run harness/notebook.
  I deliberately did **not** build that solo.

_Nothing was committed — all changes are in the working tree as you left it._
