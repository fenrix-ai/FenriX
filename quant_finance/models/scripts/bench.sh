#!/usr/bin/env bash
# Benchmark raw inference speed for one model with llama-bench.
# Writes results/<id>.json — prompt-processing (pp) and token-generation (tg) tok/s.
#
# Usage:
#   scripts/bench.sh <id> [extra llama-bench args...]
#   scripts/bench.sh gemma4-12b
#   scripts/bench.sh llama33-70b -ngl 48
#
# pp512 = prompt throughput (matters: reports are ~thousands of tokens).
# tg128 = generation throughput (matters: the ID answer is short).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="$(cd "$HERE/.." && pwd)"
RESULTS_DIR="$MODELS_DIR/results"

id="${1:?usage: bench.sh <id> [extra llama-bench args...]}"; shift || true
eval "$(python3 "$HERE/_registry.py" fields "$id")"

# Recursive: handles quant subfolders (e.g. scout's Q4_K_M/) and picks shard -00001 first.
gguf="$(find "$MODELS_DIR/gguf/$id" -type f -name "*${REG_quant}*.gguf" 2>/dev/null | sort | head -n1 || true)"
[ -n "$gguf" ] || {
  echo "No GGUF for '$id' in gguf/$id/ — run: scripts/download.sh $id" >&2
  exit 1
}

mkdir -p "$RESULTS_DIR"
out="$RESULTS_DIR/$id.json"
echo "Benchmarking $id  (${REG_family}, ${REG_quant})  ngl ${REG_ngl}  ->  $out"

llama-bench \
  -m "$gguf" \
  -ngl "${REG_ngl}" \
  -p 512 \
  -n 128 \
  -o json \
  "$@" > "$out"

echo "Wrote $out"
