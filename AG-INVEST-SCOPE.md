# AG Invest · OMXS30-only scope (effective 2026-11-23)

This repository is the **only primary Swedish stock-universe screener** for AG Invest's 2026-11-23 to 2030-01-01 project, and does not place orders.

- Active trade candidates: only **official OMX Stockholm 30 index members** valid for the completed market session. The 2026-11-02 Nasdaq component fact sheet is the source for this as-of list; verify subsequent changes before each rebalance.
- As announced 2026-11-23 by Nasdaq, **Sobi replaces Lifco at the December 1 opening**. A temporary SKF Vertevo spin-off addition effective November 26 is documented but blocked from automated candidate selection pending sufficient historical data and independent verification.
- Existing past CSV logs and report archives are historical, **not automatically tradeable**; do not delete or rewrite them to conform retrospectively.
- The 2026-11-23 week is a **trading halt** for new orders. Protective exits of positions opened before the halt are allowed.
- **10% net per week** is an *ambition*, not a verified model output or a forced minimum.
- Default maximum intended derivative leverage **4×**. Exposure as high as **6× and eventually 8× is only a conditional future board decision after journalled evidence**; never an automated screener setting. Planned account risk remains **max 4% NAV per position** before adverse gaps and knockouts.
- Every trade requires a pre-registered LONG/SHORT rationale, market trend, dated entry, invalidation/stop/target, latest exit time, liquidity and knockout checks, account risk after costs, board veto checks, and explicit owner's decision in ChatGPT. No automatic orders; no mobile trading.
- All derivative settings and stop orders belong to the user/board; the screener supplies **underlying equity** reference levels only.

Core policy: https://github.com/alexgianni777-tech/edgeai/blob/main/ag-invest/CORE-DOCUMENT-v2.6-2026-11-23-OMXS30-ONLY.md

Official Nasdaq sources:
- https://www.nasdaq.com/docs/global-indexes/OMXS30
- https://view.news.eu.nasdaq.com/view?id=b9f99d088ca06195b95a6c562a9649c20&lang=en&src=rss
