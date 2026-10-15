ALTER TABLE stock_transactions ADD COLUMN side TEXT CHECK (side IN ('buy', 'sell'));
ALTER TABLE stock_transactions ADD COLUMN cash_scope TEXT CHECK (cash_scope IN ('external', 'internal'));

UPDATE stock_transactions
SET side = CASE WHEN kind IN ('A', 'R') THEN 'buy' ELSE 'sell' END,
    cash_scope = CASE WHEN kind IN ('A', 'D') THEN 'external' ELSE 'internal' END;

ALTER TABLE summary_snapshots ADD COLUMN stocks_cash_cents INTEGER NOT NULL DEFAULT 0;

UPDATE summary_snapshots
SET stocks_cash_cents = COALESCE((
  SELECT SUM(CASE
    WHEN t.kind = 'E' THEN ABS(t.total_cents)
    WHEN t.kind = 'R' THEN -ABS(t.total_cents)
    ELSE 0
  END)
  FROM stock_transactions t
  JOIN periods selected ON selected.id = summary_snapshots.period_id
  WHERE substr(t.trade_date, 1, 7) <= substr(selected.month, 1, 7)
), 0);

UPDATE summary_snapshots
SET stocks_cents = stocks_cash_cents + COALESCE((
  SELECT SUM(h.market_value_cents)
  FROM holdings h JOIN instruments i ON i.id = h.instrument_id
  WHERE h.period_id = summary_snapshots.period_id AND i.category = 'stocks'
), 0);

UPDATE summary_snapshots
SET total_cents =
  COALESCE(current_account_cents, 0) + COALESCE(savings_account_cents, 0) + COALESCE(pias_cents, 0) +
  COALESCE(liberty_cents, 0) + COALESCE(pension_cents, 0) + COALESCE(stocks_cents, 0);
