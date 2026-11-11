"""Exploratory, historical signal-level study. No validated trading edge.

Input: the archived 18-column screening plans and evaluated outcomes.
Market trend is an INDEX-ONLY completed-session SMA proxy, deliberately NOT
the breadth-aware Great Defence 2.0 gate in EdgeAI. No point-in-time proof
that archived plans were published on the dates they claim.
"""
import argparse
import csv
import json
import math
import random
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

def load_index(ticker, start, end):
    import yfinance as yf
    data=yf.download(ticker,start=start,end=end,auto_adjust=False,
                     actions=False,progress=False,threads=False)
    if data.empty:
        raise ValueError("No index history")
    if getattr(data.columns,"nlevels",1)>1:
        data.columns=data.columns.get_level_values(0)
    rows=[]
    for dt,row in data.iterrows():
        close=float(row["Close"])
        if close>0 and math.isfinite(close):
            rows.append((dt.date().isoformat(),close))
    return rows

def index_regimes(history, signal_dates):
    """Point-in-time index proxy; never use dates after a signal date."""
    regimes={}
    for signal_date in signal_dates:
        past=[close for day,close in history if day<=signal_date]
        if len(past)<200 or not any(day==signal_date for day,_ in history):
            regimes[signal_date]="UNKNOWN"
            continue
        c=past[-1]
        ma20=sum(past[-20:])/20
        ma50=sum(past[-50:])/50
        ma200=sum(past[-200:])/200
        ret20=c/past[-21]-1
        if c>ma20 and c>ma50>ma200 and ret20>0:
            regimes[signal_date]="BULLISH"
        elif c<ma20 and c<ma50<ma200 and ret20<0:
            regimes[signal_date]="BEARISH"
        else:
            regimes[signal_date]="NEUTRAL"
    return regimes

def score_trade(row,regimes,cost_bps):
    direction=row["side"].upper()
    regime=regimes.get(row["date"],"UNKNOWN")
    alignment="WITH_TREND" if ((regime=="BULLISH" and direction=="LONG") or
                               (regime=="BEARISH" and direction=="SHORT")) else (
              "AGAINST_TREND" if regime in ("BULLISH","BEARISH") else regime)
    gross_raw=row.get("gross_r")
    gross=float(gross_raw) if gross_raw not in (None,"") else None
    entry=float(row["entry"])
    stop=float(row["stop"])
    risk=abs(entry-stop)
    cost_r=(cost_bps/10000)*(entry/risk) if risk>0 else None
    net=gross-cost_r if gross is not None and cost_r is not None else None
    return {**row,"market_regime":regime,"alignment":alignment,
            "cost_proxy_r":round(cost_r,5) if cost_r is not None else "",
            "net_proxy_r":round(net,5) if net is not None else ""}

def percentile(xs,p):
    v=sorted(xs)
    if not v:return None
    at=(len(v)-1)*p
    lo=int(at);hi=min(lo+1,len(v)-1);w=at-lo
    return v[lo]*(1-w)+v[hi]*w

def cluster_bootstrap(rows,seed=73,n=1200):
    """Resample SIGNAL DATES, not individual correlated ticker ideas."""
    dated=defaultdict(list)
    for row in rows:
        if row.get("net_proxy_r") not in (None,""):
            dated[row["date"]].append(float(row["net_proxy_r"]))
    days=list(dated)
    if len(days)<5:return None
    rng=random.Random(seed)
    draws=[]
    for _ in range(n):
        sample=[rng.choice(days) for _ in days]
        vals=[v for day in sample for v in dated[day]]
        draws.append(sum(vals)/len(vals))
    return {"low95":round(percentile(draws,.025),4),"high95":round(percentile(draws,.975),4),
            "resampling":"signal-date cluster, heuristic uncertainty only", "n":n}

def summarize(rows):
    states=Counter(row["status"] for row in rows)
    valid=[row for row in rows if row.get("net_proxy_r") not in (None,"")]
    gross=[float(row["gross_r"]) for row in valid]
    net=[float(row["net_proxy_r"]) for row in valid]
    gains=sum(x for x in net if x>0)
    losses=-sum(x for x in net if x<0)
    return {
        "plans":len(rows),"executed_with_priced_exit":len(valid),
        "coverage_pct":round(100*len(valid)/len(rows),1) if rows else None,
        "distinct_signal_days":len(set(row["date"] for row in rows)),
        "statuses":dict(states),
        "gross_expectancy_r_conditional":round(sum(gross)/len(gross),4) if gross else None,
        "cost_proxy_net_expectancy_r_conditional":round(sum(net)/len(net),4) if net else None,
        "cost_proxy_win_rate_pct":round(100*sum(x>0 for x in net)/len(net),1) if net else None,
        "cost_proxy_profit_factor":round(gains/losses,3) if losses>0 else None,
        "date_cluster_bootstrap_95":cluster_bootstrap(valid),
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--trades",default="research_results/trades.csv")
    parser.add_argument("--out",default="research_results")
    parser.add_argument("--asof",default="2026-11-06")
    parser.add_argument("--index",default="^OMX")
    parser.add_argument("--roundtrip-cost-bps",type=float,default=20.0)
    args=parser.parse_args()
    cutoff=date.fromisoformat(args.asof)
    with open(args.trades,newline="",encoding="utf-8") as handle:
        rows=list(csv.DictReader(handle))
    rows=[row for row in rows if date.fromisoformat(row["date"])<=cutoff]
    days=set(row["date"] for row in rows)
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    regime_source={"status":"MISSING","error":None}
    regimes={day:"UNKNOWN" for day in days}
    if days:
        start=(date.fromisoformat(min(days))-timedelta(days=440)).isoformat()
        try:
            index=load_index(args.index,start,(cutoff+timedelta(days=1)).isoformat())
            regimes=index_regimes(index,days)
            regime_source={"status":"OK","symbol":args.index,"bars":len(index),
                           "last_date":index[-1][0],
                           "method":"INDEX_ONLY_SMA20_50_200_RET20_NO_BREADTH"}
        except Exception as error:
            regime_source={"status":"MISSING","error":str(error)[:180]}
    scored=[score_trade(row,regimes,args.roundtrip_cost_bps) for row in rows]
    if scored:
        with (out/"signal_trend_results.csv").open("w",newline="",encoding="utf-8") as handle:
            writer=csv.DictWriter(handle,fieldnames=list(scored[0]));writer.writeheader();writer.writerows(scored)
    groups={}
    for field in ("kind","side","market_regime","alignment"):
        values=sorted(set(row.get(field) or "UNKNOWN" for row in scored))
        groups[field]={v:summarize([row for row in scored if (row.get(field) or "UNKNOWN")==v]) for v in values}
    main_summary=summarize(scored)
    report={
        "research_only":True,"validated_edge":False,"study_asof":args.asof,
        "interpretation":"Observational outcomes on archived plans; conditional executed-trade results, not investable P/L.",
        "market_context":regime_source,
        "basis":"Daily unadjusted Yahoo OHLC. Signals at nominal close on stated day; earliest simulated entry next completed session; no intraday ordering proof.",
        "cost_assumption":f"{args.roundtrip_cost_bps}bps of underlying entry per priced exit, converted into R by entry-stop distance. Not a turbo/mini-future execution-cost model.",
        "caveats":[
          "Signal publication timestamp is NOT independently verified; lookahead and retrospective construction cannot be ruled out.",
          "Some same-session entry/stop/target paths are excluded as ambiguous rather than assigned a favorable fill.",
          "Repeated same-ticker/daily recommendations overlap; trades are NOT independent and cannot be naively summed as portfolio returns.",
          "Index-only trend proxy differs from breadth-aware Great Defence 2.0. This does not establish the latter's profit benefit.",
          "The historical window is short and ends near 2026-11-06. Many late signals remain incomplete.",
          "Missing Yahoo histories and incomplete outcome windows reduce coverage; exclude unresolved from expectancy.",
          "No verified mini-future KO/spread/financing, FX costs, taxes, cash constraints, or commissions.",
          "An indicative 20bps underlying-cost proxy is NOT proof of actual executable net performance.",
          "Never treat the observed profit factor or bootstrap interval as a proven forward edge."
        ],
        "overall":main_summary,"grouped":groups,
        "legacy_included":False
    }
    (out/"trend_study.json").write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
    print(json.dumps(report,indent=2,ensure_ascii=False))
    # A green job must never mean market data successfully validated when it did not.
    if main_summary["executed_with_priced_exit"]<20:
        raise SystemExit("UNVERIFIED: fewer than 20 trades with priced exits")
    if regime_source["status"]!="OK":
        raise SystemExit("UNVERIFIED: cannot perform trend comparison without historical index")
    if sum(v=="UNKNOWN" for v in regimes.values())>len(regimes)*.2:
        raise SystemExit("UNVERIFIED: insufficient index regime coverage")

if __name__=="__main__":
    main()
