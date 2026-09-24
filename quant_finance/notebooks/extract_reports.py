#!/usr/bin/env python3
"""Extract one identifying 10-K Business narrative per company from the raw
anonymized SEC full-submission dumps in data/anonymized_filings_7yr/<N>/*.txt.

The raw filings interleave XBRL, financial tables, and exhibits with the 10-K
body, and the Business section is often one giant line (so naive line-filtering
drops it). Strategy per company: pick the most-recent real 10-K, strip XBRL
tokens + collapse whitespace WITHOUT dropping long lines ("char-clean"), then
anchor at the real Item 1 Business heading (the occurrence followed by overview
prose, not the table-of-contents) and take ~9k words. Companies whose 10-K has no
"Item 1. Business" heading (e.g. Netflix) fall back to a business-narrative
content anchor. Writes data/processed_reports/company_N.txt.

Ground truth (dir -> real company, from the anonymization project's entities.yaml):
  1=AMD 2=AppLovin 3=GM 4=Kroger 5=McKesson 6=Netflix 7=Palantir 8=SanDisk
"""
import re
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "anonymized_filings_7yr"
OUT  = Path(__file__).resolve().parent.parent / "data" / "processed_reports"
OUT.mkdir(exist_ok=True)

FORM = re.compile(r"form\s*(10-k|10-q|8-k)", re.I)
def is_10k(raw):
    m = FORM.search(raw[:30_000].lower())
    return bool(m) and m.group(1).lower() == "10-k"

def charclean(t):
    t = re.sub(r"\S*(us-gaap:|xbrli:|iso4217|dei:|srt:|utr:|http://|link:|xbrl|0000099)\S*", " ", t, flags=re.I)
    return re.sub(r"\s+", " ", t).strip()

BIZ_HEAD = re.compile(r"item\s*1[\.\)\s\-]{0,6}business", re.I)
OVERVIEW = ("we ", "our ", "overview", "founded", "the company", "we are", "we provide",
            "we operate", "mission", "we build", "we design", "we develop", "we generate")

def extract(raw, size=9000):
    pr = charclean(raw); low = pr.lower()
    for m in BIZ_HEAD.finditer(low):
        if "item 1a" in low[m.end():m.end() + 100]:            # a table-of-contents entry
            continue
        if any(w in low[m.start():m.start() + 1000] for w in OVERVIEW):
            return " ".join(pr[m.start():].split()[:size])
    for ph in ("we are one", "we are a", "our members", "entertainment services",
               "we generate", "we provide"):                    # no heading (content anchor)
        p = low.find(ph)
        if p > 3000:
            return " ".join(pr[p:].split()[:size])
    return None

def datekey(f):
    m = re.match(r"(\d{8})", f.stem); return m.group(1) if m else "0"

def main():
    for d in sorted(DATA.glob("*/"), key=lambda p: int(p.name)):
        files = sorted([f for f in d.glob("*.txt") if f.stat().st_size > 500_000], key=datekey, reverse=True)
        rep, chosen = None, None
        for f in files:                                          # most-recent real 10-K
            raw = f.read_text(encoding="utf-8", errors="replace")
            lo = raw.lower()
            if "item 1a" in lo and "risk factors" in lo and is_10k(raw):
                rep = extract(raw)
                if rep:
                    chosen = f; break
        (OUT / f"company_{d.name}.txt").write_text(rep or "", encoding="utf-8")
        print(f"company {d.name}: {chosen.name if chosen else 'NONE':18} words={len((rep or '').split())}")
        print("   ", (rep or "")[:200].replace("\n", " "))

if __name__ == "__main__":
    main()
