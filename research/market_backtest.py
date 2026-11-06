import csv, json, argparse
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
import yfinance as yf

def load(path):
    signals=[]; excluded=Counter(); seen=set()
    with open(path, newline="", encoding="utf-8-sig") as f:
        for i,line in enumerate(f):
            row=next(csv.reader([line]))
            if i==0: continue
            if len(row)!=18: excluded["legacy"]+=1; continue
            try:
                d,kind,name,ticker=row[:4]
                entry,stop,target=map(float,row[12:15])
                horizon=int(row[16]); side=row[17].strip().upper()
                assert side in ("LONG","SHORT") and horizon>0
                assert stop<entry<target if side=="LONG" else target<entry<stop
                date.fromisoformat(d)
            except (ValueError,AssertionError):
                excluded["invalid"]+=1; continue
            key=(d,kind,ticker)
            if key in seen: excluded["duplicate"]+=1; continue
            seen.add(key)
            signals.append(dict(date=d,kind=kind,ticker=ticker,entry=entry,stop=stop,target=target,horizon=horizon,side=side))
    return signals,excluded

def evaluate(s,bars):
    future=[b for b in bars if b["date"]>s["date"]]
    if len(future)<s["horizon"]: return "INCOMPLETE",None
    future=future[:s["horizon"]]; e=s["entry"]; st=s["stop"]; t=s["target"]; long=s["side"]=="LONG"; risk=abs(e-st)
    active=False
    for i,b in enumerate(future):
        o,h,l,c=(b[k] for k in ("open","high","low","close"))
        if not active:
            if (long and o<=st) or (not long and o>=st): return "INVALID_GAP_BEFORE_ENTRY",None
            if (long and o>=t) or (not long and o<=t): continue
            if not l<=e<=h: continue
            if (long and l<=st) or (not long and h>=st): return "AMBIGUOUS_ENTRY_STOP",None
            if (long and h>=t) or (not long and l<=t): return "AMBIGUOUS_ENTRY_TARGET",None
            active=True
            continue
        if long:
            if o<=st: return "GAP_STOP",(o-e)/risk
            if l<=st: return "STOP",-1.0
            if h>=t: return "TARGET",(t-e)/risk
        else:
            if o>=st: return "GAP_STOP",(e-o)/risk
            if h>=st: return "STOP",-1.0
            if l<=t: return "TARGET",(e-t)/risk
    if not active: return "NO_ENTRY",None
    last=future[-1]["close"]
    return "TIME_EXIT",((last-e) if long else (e-last))/risk

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--signals",default="candidates-log.csv")
    ap.add_argument("--out",default="research_results")
    args=ap.parse_args()
    signals,excluded=load(args.signals)
    out=Path(args.out);out.mkdir(exist_ok=True,parents=True)
    by=defaultdict(list)
    for s in signals: by[s["ticker"]].append(s)
    results=[]; fetch_fail={}
    for ticker,items in sorted(by.items()):
        start=min(x["date"] for x in items)
        try:
            df=yf.download(ticker,start=start,end=(date.today()+timedelta(days=1)).isoformat(),auto_adjust=False,actions=False,progress=False,threads=False)
            if df.empty: raise ValueError("empty history")
            if getattr(df.columns,"nlevels",1)>1: df.columns=df.columns.get_level_values(0)
            bars=[]
            for dt,row in df.iterrows():
                bars.append(dict(date=dt.date().isoformat(),open=float(row["Open"]),high=float(row["High"]),low=float(row["Low"]),close=float(row["Close"])))
        except Exception as exc:
            fetch_fail[ticker]=str(exc)[:150];bars=[]
        for s in items:
            status,r=evaluate(s,bars) if bars else ("NO_PRICE_DATA",None)
            results.append({**s,"status":status,"gross_r":r})
    with (out/"trades.csv").open("w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=list(results[0]) if results else ["status"]);w.writeheader();w.writerows(results)
    by_kind={}
    for kind in sorted(set(s["kind"] for s in signals)):
        sub=[r for r in results if r["kind"]==kind]
        valid=[r["gross_r"] for r in sub if r["gross_r"] is not None]
        by_kind[kind]={"plans":len(sub),"priced_exits":len(valid),"status_counts":dict(Counter(r["status"] for r in sub)),"gross_expectancy_r_conditional":sum(valid)/len(valid) if valid else None}
    report={"label":"RESEARCH_ONLY_NOT_VALIDATED","note":"Unadjusted OHLC, no verified publication time, same-day order ambiguous, no costs or portfolio concurrency; gross expectancy is conditional and not tradable alpha.","plans":len(signals),"excluded":dict(excluded),"price_fetch_failures":fetch_fail,"categories":by_kind}
    (out/"summary.json").write_text(json.dumps(report,indent=2,ensure_ascii=False))
    print(json.dumps(report,indent=2,ensure_ascii=False))
if __name__=="__main__": main()
