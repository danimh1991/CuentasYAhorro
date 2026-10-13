ALTER TABLE stock_dividends ADD COLUMN per_share_minor INTEGER;
ALTER TABLE stock_dividends ADD COLUMN per_share_scale INTEGER NOT NULL DEFAULT 1000000;

CREATE TABLE savings_settings (
  bucket TEXT PRIMARY KEY CHECK (bucket IN ('cash', 'deposit', 'funds', 'indexed')),
  label TEXT NOT NULL
);

INSERT INTO savings_settings (bucket, label) VALUES
  ('cash', 'Cuenta corriente / Sabadell / Renault / Mintos'),
  ('deposit', 'Depósito Facto / Trade'),
  ('funds', 'Fondos / ETF'),
  ('indexed', 'Cartera indexada');

CREATE TABLE savings_funds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  isin TEXT,
  ticker TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO savings_funds (name)
SELECT DISTINCT fund_name FROM savings_fund_transactions WHERE TRIM(fund_name) <> '';

ALTER TABLE savings_fund_transactions ADD COLUMN fund_id INTEGER;

UPDATE savings_fund_transactions
SET fund_id = (SELECT id FROM savings_funds WHERE savings_funds.name = savings_fund_transactions.fund_name);

CREATE INDEX savings_fund_transactions_fund ON savings_fund_transactions(fund_id);
