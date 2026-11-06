import unittest
from research.market_backtest import evaluate

def signal(side="LONG", horizon=3):
    return dict(date="2026-10-01", entry=100., stop=95. if side=="LONG" else 105., target=110. if side=="LONG" else 90., horizon=horizon, side=side)

def bar(day, o, h, l, c):
    return dict(date=f"2026-10-{day:02d}",open=o,high=h,low=l,close=c)

class BacktestRegression(unittest.TestCase):
    def test_long_target_after_entry(self):
        self.assertEqual(evaluate(signal(),[bar(2,100,102,99,101),bar(3,103,111,102,110),bar(4,109,110,108,109)]),("TARGET",2.))
    def test_long_stop_after_entry(self):
        self.assertEqual(evaluate(signal(),[bar(2,100,102,99,101),bar(3,99,100,94,95),bar(4,95,97,93,94)]),("STOP",-1.))
    def test_gap_stop(self):
        self.assertEqual(evaluate(signal(),[bar(2,100,102,99,101),bar(3,90,94,88,90),bar(4,91,94,90,93)]),("GAP_STOP",-2.))
    def test_same_bar_entry_stop_ambiguous(self):
        self.assertEqual(evaluate(signal(),[bar(2,100,101,94,99),bar(3,100,102,99,101),bar(4,100,101,99,100)]),("AMBIGUOUS_ENTRY_STOP",None))
    def test_same_bar_entry_target_ambiguous(self):
        self.assertEqual(evaluate(signal(),[bar(2,100,111,99,108),bar(3,100,101,99,100),bar(4,100,101,99,100)]),("AMBIGUOUS_ENTRY_TARGET",None))
    def test_no_entry(self):
        self.assertEqual(evaluate(signal(),[bar(2,105,106,104,105),bar(3,105,106,104,105),bar(4,105,106,104,105)]),("NO_ENTRY",None))
    def test_short_target(self):
        self.assertEqual(evaluate(signal("SHORT"),[bar(2,100,101,99,100),bar(3,96,97,89,90),bar(4,90,92,89,91)]),("TARGET",2.))
    def test_short_stop(self):
        self.assertEqual(evaluate(signal("SHORT"),[bar(2,100,101,99,100),bar(3,103,106,102,105),bar(4,105,107,104,106)]),("STOP",-1.))
    def test_incomplete(self):
        self.assertEqual(evaluate(signal(),[bar(2,100,102,99,101)]),("INCOMPLETE",None))
    def test_no_same_day_entry(self):
        self.assertEqual(evaluate(signal(horizon=1),[bar(1,100,111,94,100),bar(2,100,102,99,101)]),("TIME_EXIT",.2))
if __name__=="__main__":
    unittest.main()
