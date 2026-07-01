#!/usr/bin/env python3
"""Tiny reader for models/registry.yaml, used by the download/serve/bench scripts.

Commands:
  _registry.py ids                 # print every model id, one per line
  _registry.py fields <id>         # print shell-eval-able REG_<key>=<value> lines
                                   #   (defaults merged, model values win, nulls dropped)

Example:
  eval "$(python3 scripts/_registry.py fields gemma4-12b)"
  echo "$REG_hf_repo $REG_quant"
"""
import os
import sys
import shlex

try:
    import yaml
except ImportError:
    sys.exit("[registry] pyyaml not installed — run: python3 -m pip install pyyaml")

HERE = os.path.dirname(os.path.abspath(__file__))
REGISTRY = os.path.normpath(os.path.join(HERE, "..", "registry.yaml"))


def load():
    with open(REGISTRY) as f:
        return yaml.safe_load(f)


def get_model(cfg, mid):
    for m in cfg.get("models", []):
        if m.get("id") == mid:
            return m
    ids = ", ".join(m.get("id", "?") for m in cfg.get("models", []))
    sys.exit(f"[registry] unknown model id: {mid}\n  known ids: {ids}")


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: _registry.py {ids|fields <id>}")
    cmd = sys.argv[1]
    cfg = load()
    defaults = cfg.get("defaults") or {}

    if cmd == "ids":
        for m in cfg.get("models", []):
            print(m["id"])
    elif cmd == "fields":
        if len(sys.argv) < 3:
            sys.exit("usage: _registry.py fields <id>")
        m = get_model(cfg, sys.argv[2])
        merged = dict(defaults)
        merged.update({k: v for k, v in m.items() if v is not None})
        for k, v in merged.items():
            print(f"REG_{k}={shlex.quote(str(v))}")
    else:
        sys.exit(f"[registry] unknown command: {cmd}")


if __name__ == "__main__":
    main()
