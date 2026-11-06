import unittest
from research.signal_trend_study import index_regimes, score_trade, summarize

class TrendStudyTests(unittest.TestCase):
    def test_historical_regime_does_not_read_future_prices(self):
        from datetime import date,timedelta
        origin=date(2024,1,1)
        history=[((origin+timedelta(days=i)).isoformat(),100+i*.3) for i in range(240)]
        target=history[-1][0]
        original=index_regimes(history,{target})[target]
        history.append(((origin+timedelta(days=240)).isoformat(),1.0))
        self.assertEqual(index_regimes(history,{target})[target],original)
        self.assertEqual(original,"BULLISH")
    def test_directional_alignment_never_approves_a_trade(self):
        row={"date":"2026-11-05","kind":"weakest","ticker":"ATCO-A.ST",
             "side":"SHORT","entry":"100","stop":"105","target":"90",
             "status":"TARGET","gross_r":"2"}
        result=score_trade(row,{"2026-11-05":"BEARISH"},20)
        self.assertEqual(result["alignment"],"WITH_TREND")
        self.assertAlmostEqual(float(result["net_proxy_r"]),1.96)
        self.assertNotIn("tradeApproved",result)
    def test_stats_keep_no_entry_and_unresolved_in_denominator(self):
        rows=[
          {"date":"2026-11-05","status":"NO_ENTRY","net_proxy_r":"","gross_r":""},
          {"date":"2026-11-05","status":"STOP","net_proxy_r":-1,"gross_r":-1},
        ]
        summary=summarize(rows)
        self.assertEqual(summary["plans"],2)
        self.assertEqual(summary["executed_with_priced_exit"],1)
        self.assertEqual(summary["coverage_pct"],50.0)
    def test_missing_index_history_reports_unknown(self):
        self.assertEqual(index_regimes([],{"2026-11-05"})["2026-11-05"],"UNKNOWN")

if __name__=="__main__":
    unittest.main()
