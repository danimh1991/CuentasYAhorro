UPDATE holdings
SET units = COALESCE((
      SELECT SUM(t.units)
      FROM stock_transactions t
      JOIN periods selected ON selected.id = holdings.period_id
      WHERE t.instrument_id = holdings.instrument_id
        AND substr(t.trade_date, 1, 7) <= substr(selected.month, 1, 7)
    ), 0),
    market_value_cents = ROUND(
      COALESCE((
        SELECT SUM(t.units)
        FROM stock_transactions t
        JOIN periods selected ON selected.id = holdings.period_id
        WHERE t.instrument_id = holdings.instrument_id
          AND substr(t.trade_date, 1, 7) <= substr(selected.month, 1, 7)
      ), 0) * COALESCE(price_eur_minor, 0) / 100.0
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE instrument_id IN (SELECT id FROM instruments WHERE category = 'stocks');

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
