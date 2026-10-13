ALTER TABLE instruments ADD COLUMN reference_symbol TEXT;
ALTER TABLE holdings ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1));

CREATE TABLE stock_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT UNIQUE,
  trade_date TEXT NOT NULL,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('A', 'D', 'R', 'E')),
  units REAL NOT NULL,
  price_minor INTEGER NOT NULL DEFAULT 0,
  price_scale INTEGER NOT NULL DEFAULT 10000,
  total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  fx_to_eur REAL NOT NULL DEFAULT 1,
  broker TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX stock_transactions_date ON stock_transactions(trade_date DESC);
CREATE INDEX stock_transactions_instrument ON stock_transactions(instrument_id, trade_date);

UPDATE instruments SET name = 'Fondo de pensiones empresa' WHERE category = 'pension';

UPDATE instruments SET reference_symbol = '0P00000G7B', ticker = NULL WHERE category = 'liberty' AND name = 'DWS Top Dividende';
UPDATE instruments SET reference_symbol = '0P00000BN2', ticker = NULL WHERE category = 'liberty' AND name = 'Morgan Stanley US Growth Fund';
UPDATE instruments SET reference_symbol = '0P0001ER5F', ticker = NULL WHERE category = 'liberty' AND name = 'Threadneedle European Select Fund 1E';
UPDATE instruments SET reference_symbol = '0P0001DFEK', ticker = NULL WHERE category = 'liberty' AND name = 'M&G (Lux) Global Themes Fund';

UPDATE instruments SET ticker = 'SAN.MC', reference_symbol = 'SAN' WHERE category = 'stocks' AND name = 'Santander';
UPDATE instruments SET ticker = 'IAG.MC', reference_symbol = 'IAG' WHERE category = 'stocks' AND name = 'IAG';
UPDATE instruments SET ticker = 'VUSA.AS', reference_symbol = 'VUSA', isin = 'IE00B3XXRP09' WHERE category = 'stocks' AND name = 'SP500';
UPDATE instruments SET ticker = 'NFLX', reference_symbol = 'NFLX' WHERE category = 'stocks' AND name = 'Netflix';
UPDATE instruments SET ticker = 'ITX.MC', reference_symbol = 'ITX' WHERE category = 'stocks' AND name = 'Inditex';
UPDATE instruments SET ticker = 'TEF.MC', reference_symbol = 'TEF' WHERE category = 'stocks' AND name = 'Telefónica';
UPDATE instruments SET ticker = 'HPE', reference_symbol = 'HPE' WHERE category = 'stocks' AND name = 'HPE';
UPDATE instruments SET ticker = 'ROVI.MC', reference_symbol = 'ROVI' WHERE category = 'stocks' AND name = 'ROVI';
UPDATE instruments SET ticker = 'VVMX.DE', reference_symbol = 'VVMX', isin = 'IE0002PG6CA6' WHERE category = 'stocks' AND name = 'Rare Earth';
UPDATE instruments SET ticker = 'DFEN.DE', reference_symbol = 'DFENG', isin = 'IE000YYE6WK5' WHERE category = 'stocks' AND name = 'Defense';
UPDATE instruments SET ticker = 'EXH1.DE', reference_symbol = 'SXEPEX', isin = 'DE000A0H08M3' WHERE category = 'stocks' AND name = 'Oil & Gas';
UPDATE instruments SET ticker = 'AMEM.DE', reference_symbol = 'AMEM', isin = 'LU1681045370' WHERE category = 'stocks' AND name = 'Emerging';
UPDATE instruments SET ticker = 'IUSN.DE', reference_symbol = 'IUSN', isin = 'IE00BF4RFH31' WHERE category = 'stocks' AND name = 'Small Cap';
UPDATE instruments SET name = 'Nasdaq 100', ticker = 'SXRV.DE', reference_symbol = 'SXRV', isin = 'IE00B53SZB19' WHERE category = 'stocks' AND name = 'Nasqad 100';
UPDATE instruments SET ticker = 'BTC-EUR', reference_symbol = 'BTC/EUR' WHERE category = 'stocks' AND name = 'Bitcoin';

UPDATE holdings SET is_locked = 1
WHERE period_id IN (SELECT id FROM periods WHERE status = 'closed');
