#!/usr/bin/env python3
"""Identification benchmark on the real anonymized 10-K corpus.

For each model, serve it (native-GPU llama.cpp via models/scripts/serve.sh), feed
each company's extracted Business narrative (data/processed_reports/company_N.txt,
produced by extract_reports.py), and ask it to name the REAL company. Thinking is
disabled (enable_thinking=False) — see NIGHT_RUN_REPORT: thinking hurts this task.
Writes per-model JSON + a graded CSV + RESULTS to models/results/identifications_v2/.
"""
import os, json, time, subprocess, urllib.request, re, glob, csv, collections
from pathlib import Path

QF = Path(__file__).resolve().parent.parent
MODELS_DIR = QF / "models"
REPORTS = QF / "data" / "processed_reports"
OUT = MODELS_DIR / "results" / "identifications_v2"
OUT.mkdir(parents=True, exist_ok=True)
PORT, CTX, MAXTOK = 8080, 16384, 700
ENV = {**os.environ, "PATH": f"{Path.home()}/.local/bin:" + os.environ.get("PATH", "")}

MODELS = ["llama31-8b", "qwen35-9b", "gemma4-12b", "qwen35-35b-a3b",
          "gemma4-26b-a4b", "qwen35-27b", "gemma4-31b"]           # 7 (70B excluded: offload-slow)
GT = {1: "AMD", 2: "AppLovin", 3: "General Motors", 4: "Kroger",
      5: "McKesson", 6: "Netflix", 7: "Palantir", 8: "SanDisk"}
ALIAS = {"AMD": ["amd", "advanced micro"], "AppLovin": ["applovin"],
         "General Motors": ["general motors", "gm "], "Kroger": ["kroger"],
         "McKesson": ["mckesson"], "Netflix": ["netflix"], "Palantir": ["palantir"],
         "SanDisk": ["sandisk", "san disk", "western digital"]}
PROMPT = ("You are given an anonymized annual report (Form 10-K). All company, product, "
    "person, and place names have been replaced with fictional ones, and dollar figures "
    "are illustrative. Based on the business description, sector, product/segment lineup, "
    "competitive positioning, and financial profile, identify the REAL publicly-traded "
    "company this report is most likely modeled on.\n\nAnswer with:\n1) Your single best "
    "guess (one real company name).\n2) 3-5 specific clues from the text.\n\n=== REPORT ===\n{report}")

def serve(mid):
    args = ["bash", str(MODELS_DIR / "scripts" / "serve.sh"), mid, "--ctx-size", str(CTX)]
    log = open(OUT / f"_server_{mid}.log", "w")
    return subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT, env=ENV, cwd=str(MODELS_DIR)), log

def ready(t=240):
    t0 = time.time()
    while time.time() - t0 < t:
        try:
            if urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=3).status == 200:
                return True
        except Exception:
            pass
        time.sleep(2)
    return False

def ask(report):
    body = json.dumps({"messages": [{"role": "user", "content": PROMPT.format(report=report)}],
        "temperature": 0.3, "max_tokens": MAXTOK,
        "chat_template_kwargs": {"enable_thinking": False}}).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/chat/completions",
        data=body, headers={"Content-Type": "application/json"})
    t0 = time.time(); r = json.load(urllib.request.urlopen(req, timeout=600)); dt = time.time() - t0
    ch = r["choices"][0]; m = ch.get("message", {}); u = r.get("usage", {})
    return {"guess": (m.get("content") or "").strip(), "finish_reason": ch.get("finish_reason"),
            "completion_tokens": u.get("completion_tokens"), "latency_s": round(dt, 1)}

def run():
    companies = [n for n in GT if (REPORTS / f"company_{n}.txt").read_text(errors="replace").strip()]
    for mid in MODELS:
        print(f"> {mid}", flush=True)
        proc, log = serve(mid)
        try:
            if not ready():
                print(f"  server not ready for {mid}", flush=True); continue
            rows = []
            for cn in companies:
                rep = (REPORTS / f"company_{cn}.txt").read_text(encoding="utf-8", errors="replace")
                try: r = ask(rep)
                except Exception as e: r = {"guess": "", "error": str(e)}
                r.update({"model": mid, "company": cn}); rows.append(r)
                print(f"    company_{cn} ({GT[cn]}): {r.get('guess','')[:60]!r}", flush=True)
            json.dump(rows, open(OUT / f"{mid}.json", "w"), indent=2)
        finally:
            proc.terminate()
            try: proc.wait(timeout=20)
            except Exception: proc.kill()
            log.close()

def prim(g):
    g = str(g).replace("\n", " "); m = re.search(r"1[\.\)]", g)
    return (g[m.start():m.start() + 180] if m else g[:180]).lower()
def correct(cn, g): return int(any(a in prim(g) for a in ALIAS[GT[cn]]))

def grade():
    rows = []
    for f in sorted(glob.glob(str(OUT / "*.json"))): rows += json.load(open(f))
    with open(OUT / "_grading_v2.csv", "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["company", "real", "model", "correct", "guess", "completion_tokens", "latency_s"])
        for r in rows:
            cn = r["company"]
            w.writerow([cn, GT[cn], r["model"], correct(cn, r.get("guess", "")),
                        str(r.get("guess", "")).replace("\n", " ")[:140], r.get("completion_tokens"), r.get("latency_s")])
    models = sorted({r["model"] for r in rows})
    print("\n=== per-model /%d ===" % len({r["company"] for r in rows}))
    for m in sorted(models, key=lambda m: -sum(correct(r["company"], r["guess"]) for r in rows if r["model"] == m)):
        print(f"  {m:16} {sum(correct(r['company'],r['guess']) for r in rows if r['model']==m)}")
    print("=== per-company /%d ===" % len(models))
    for cn in sorted(GT):
        cs = [r for r in rows if r["company"] == cn]
        if cs: print(f"  {cn} {GT[cn]:16} {sum(correct(cn,r['guess']) for r in cs)}/{len(cs)}")

if __name__ == "__main__":
    run()
    grade()
    print("DONE", flush=True)
