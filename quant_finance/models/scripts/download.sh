#!/usr/bin/env bash
# Download GGUF weights for one or more models into models/gguf/<id>/.
# Reads models/registry.yaml. Existing files are skipped by `hf download`.
#
# Usage:
#   scripts/download.sh                     # all 9 models
#   scripts/download.sh gemma4-12b qwen35-9b
#
# Prereqs:
#   python3 -m pip install -U huggingface_hub pyyaml   # provides the `hf` CLI
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="$(cd "$HERE/.." && pwd)"
GGUF_DIR="$MODELS_DIR/gguf"

command -v hf >/dev/null 2>&1 || {
  echo "ERROR: 'hf' CLI not found. Install with: python3 -m pip install -U huggingface_hub" >&2
  exit 1
}

ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  mapfile -t ids < <(python3 "$HERE/_registry.py" ids)
fi

for id in "${ids[@]}"; do
  eval "$(python3 "$HERE/_registry.py" fields "$id")"
  dest="$GGUF_DIR/$id"
  mkdir -p "$dest"
  echo "==> $id  (${REG_hf_repo}, ${REG_quant})"
  # Grab only GGUF shards matching this quant (also catches split *-00001-of-000NN.gguf).
  hf download "$REG_hf_repo" \
    --include "*${REG_quant}*.gguf" \
    --local-dir "$dest"
  echo "    -> $dest"
done

echo
echo "Done. Weights under: $GGUF_DIR  (gitignored)"
