CREATE TABLE savings_entries (
  period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL CHECK (bucket IN ('cash', 'deposit', 'funds', 'indexed')),
  contribution_cents INTEGER NOT NULL DEFAULT 0,
  current_value_cents INTEGER NOT NULL DEFAULT 0,
  interest_cents INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (period_id, bucket)
);

CREATE TABLE savings_fund_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT UNIQUE,
  fund_name TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  units REAL NOT NULL,
  amount_cents INTEGER NOT NULL,
  price_minor INTEGER NOT NULL,
  price_scale INTEGER NOT NULL DEFAULT 10000,
  source TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE liberty_snapshots (
  period_id INTEGER PRIMARY KEY REFERENCES periods(id) ON DELETE CASCADE,
  contributed_cents INTEGER NOT NULL DEFAULT 0,
  gain_cents INTEGER NOT NULL DEFAULT 0,
  monthly_gain_cents INTEGER NOT NULL DEFAULT 0,
  return_rate REAL,
  source TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE stock_dividends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT UNIQUE,
  payment_date TEXT NOT NULL,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
  gross_minor INTEGER NOT NULL,
  amount_scale INTEGER NOT NULL DEFAULT 100,
  currency TEXT NOT NULL DEFAULT 'EUR',
  fx_to_eur REAL NOT NULL DEFAULT 1,
  amount_eur_cents INTEGER NOT NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE market_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  ticker TEXT,
  reference_symbol TEXT,
  isin TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE market_reference_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_id INTEGER NOT NULL REFERENCES market_references(id) ON DELETE CASCADE,
  quoted_at TEXT NOT NULL,
  price_minor INTEGER NOT NULL,
  price_scale INTEGER NOT NULL DEFAULT 10000,
  price_currency TEXT NOT NULL,
  fx_to_eur REAL NOT NULL DEFAULT 1,
  price_eur_minor INTEGER NOT NULL,
  source TEXT NOT NULL,
  UNIQUE(reference_id, quoted_at)
);

CREATE INDEX savings_entries_period ON savings_entries(period_id);
CREATE INDEX savings_fund_transactions_date ON savings_fund_transactions(trade_date DESC);
CREATE INDEX stock_dividends_date ON stock_dividends(payment_date DESC);
CREATE INDEX market_reference_quotes_latest ON market_reference_quotes(reference_id, quoted_at DESC);

-- Excel can leave tiny floating-point remnants after a complete sale. Treat them as zero.
UPDATE holdings SET units = 0 WHERE ABS(units) < 0.00000001;

INSERT OR IGNORE INTO market_references (name, ticker, reference_symbol, currency, sort_order) VALUES
  ('Nasdaq 100', '^NDX', 'NDX', 'USD', 10),
  ('S&P 500', '^GSPC', 'US500', 'USD', 20),
  ('IBEX 35', '^IBEX', 'ES35', 'EUR', 30),
  ('HCL Tech', 'HCLTECH.NS', 'HCLT', 'INR', 40);

INSERT OR IGNORE INTO market_references (name, reference_symbol, isin, currency, sort_order) VALUES
  ('Vanguard US 500 Stock Index', '0P00000SUJ', 'IE0032126645', 'EUR', 50),
  ('Vanguard Global Stock Index', '0P00000WLG', 'IE00B03HD191', 'EUR', 60),
  ('Acción IBEX 35 Cotizado Armonizado FI', 'BBVAI', NULL, 'EUR', 70);
