#!/usr/bin/env bash
# Launch llama-server (OpenAI-compatible API) for one model — used by the ID task.
# Reads models/registry.yaml for the GGUF path, context, port, and GPU offload.
#
# Usage:
#   scripts/serve.sh <id> [extra llama-server args...]
#   scripts/serve.sh gemma4-12b
#   scripts/serve.sh llama4-scout --ctx-size 16384      # override for the tight fit
#   scripts/serve.sh llama33-70b -ngl 48                # tune offload for the 70B
#
# The API is then at http://127.0.0.1:<port>/v1  (OpenAI-compatible).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="$(cd "$HERE/.." && pwd)"

id="${1:?usage: serve.sh <id> [extra llama-server args...]}"; shift || true
eval "$(python3 "$HERE/_registry.py" fields "$id")"

# Recursive: handles quant subfolders (e.g. scout's Q4_K_M/) and picks shard -00001 first.
gguf="$(find "$MODELS_DIR/gguf/$id" -type f -name "*${REG_quant}*.gguf" 2>/dev/null | sort | head -n1 || true)"
[ -n "$gguf" ] || {
  echo "No GGUF for '$id' in gguf/$id/ — run: scripts/download.sh $id" >&2
  exit 1
}

echo "Serving $id  (${REG_family}, ${REG_quant})  port ${REG_server_port}  ctx ${REG_context}  ngl ${REG_ngl}"
echo "  model: $gguf"
exec llama-server \
  -m "$gguf" \
  --ctx-size "${REG_context}" \
  --host 127.0.0.1 \
  --port "${REG_server_port}" \
  -ngl "${REG_ngl}" \
  "$@"
