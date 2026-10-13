PRAGMA foreign_keys = ON;

CREATE TABLE periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL UNIQUE CHECK (length(month) = 10),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'closed')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);

CREATE TABLE summary_snapshots (
  period_id INTEGER PRIMARY KEY REFERENCES periods(id) ON DELETE CASCADE,
  current_account_cents INTEGER,
  savings_account_cents INTEGER,
  pias_cents INTEGER,
  liberty_cents INTEGER,
  pension_cents INTEGER,
  stocks_cents INTEGER,
  total_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE instruments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (category IN ('liberty', 'stocks', 'pension')),
  name TEXT NOT NULL,
  isin TEXT,
  ticker TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX instruments_category_name ON instruments(category, name);
CREATE UNIQUE INDEX instruments_isin ON instruments(isin) WHERE isin IS NOT NULL;

CREATE TABLE holdings (
  period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  units REAL NOT NULL DEFAULT 0,
  average_cost_cents INTEGER,
  invested_cents INTEGER,
  withdrawn_cents INTEGER NOT NULL DEFAULT 0,
  price_minor INTEGER,
  price_scale INTEGER NOT NULL DEFAULT 10000,
  price_currency TEXT,
  fx_to_eur REAL NOT NULL DEFAULT 1,
  price_eur_minor INTEGER,
  market_value_cents INTEGER,
  quote_source TEXT,
  quoted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (period_id, instrument_id)
);

CREATE TABLE pension_entries (
  period_id INTEGER PRIMARY KEY REFERENCES periods(id) ON DELETE CASCADE,
  employer_cents INTEGER NOT NULL DEFAULT 0,
  personal_cents INTEGER NOT NULL DEFAULT 0,
  current_value_cents INTEGER NOT NULL DEFAULT 0,
  cumulative_contributions_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  instrument_id INTEGER REFERENCES instruments(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('pias', 'liberty', 'stocks', 'pension')),
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'contribution' CHECK (kind IN ('contribution', 'withdrawal', 'fee', 'dividend')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quote_cache (
  lookup_key TEXT PRIMARY KEY,
  symbol TEXT,
  name TEXT,
  price_minor INTEGER NOT NULL,
  price_scale INTEGER NOT NULL DEFAULT 10000,
  currency TEXT NOT NULL,
  source TEXT NOT NULL,
  quoted_at TEXT NOT NULL,
  payload TEXT
);

CREATE INDEX periods_month_desc ON periods(month DESC);
CREATE INDEX holdings_period ON holdings(period_id);
CREATE INDEX contributions_period ON contributions(period_id);

