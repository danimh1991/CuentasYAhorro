import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_PASSWORD?: string;
  AUTH_SECRET?: string;
};

type Variables = { authenticated: boolean };
type Quote = {
  lookupKey: string;
  symbol: string;
  name: string;
  price: number;
  currency: string;
  priceEur: number;
  fxToEur: number;
  source: string;
  quotedAt: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const encoder = new TextEncoder();

app.use("/api/*", cors({ origin: (origin) => origin, credentials: true }));

const jsonError = (message: string, status = 400) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function makeSession(secret: string) {
  const payload = `${Date.now() + 1000 * 60 * 60 * 24 * 30}`;
  return `${payload}.${await hmac(payload, secret)}`;
}

async function validSession(value: string | undefined, secret: string | undefined) {
  if (!value || !secret) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return signature === (await hmac(expires, secret));
}

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health" || c.req.path.startsWith("/api/auth/")) {
    await next();
    return;
  }
  if (!c.env.APP_PASSWORD) {
    c.set("authenticated", true);
    await next();
    return;
  }
  if (!(await validSession(getCookie(c, "cya_session"), c.env.AUTH_SECRET))) {
    return c.json({ error: "No autorizado" }, 401);
  }
  c.set("authenticated", true);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, service: "cuentas-y-ahorro" }));

app.get("/api/auth/status", async (c) => {
  const protectedApp = Boolean(c.env.APP_PASSWORD);
  const authenticated = !protectedApp || (await validSession(getCookie(c, "cya_session"), c.env.AUTH_SECRET));
  return c.json({ protected: protectedApp, authenticated });
});

app.post(
  "/api/auth/login",
  zValidator("json", z.object({ password: z.string().min(1).max(256) })),
  async (c) => {
    if (!c.env.APP_PASSWORD) return c.json({ ok: true });
    const { password } = c.req.valid("json");
    if (password !== c.env.APP_PASSWORD) return c.json({ error: "Contraseña incorrecta" }, 401);
    if (!c.env.AUTH_SECRET) return c.json({ error: "Falta configurar AUTH_SECRET" }, 503);
    setCookie(c, "cya_session", await makeSession(c.env.AUTH_SECRET), {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.json({ ok: true });
  },
);

app.post("/api/auth/logout", (c) => {
  deleteCookie(c, "cya_session", { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/summary", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.month, p.status, p.notes,
      s.current_account_cents, s.savings_account_cents, s.pias_cents,
      s.liberty_cents, s.pension_cents, s.stocks_cents, s.total_cents
     FROM periods p
     LEFT JOIN summary_snapshots s ON s.period_id = p.id
     ORDER BY p.month ASC`,
  ).all();
  return c.json({ periods: results });
});

app.get("/api/history/:category", async (c) => {
  const category = c.req.param("category");
  if (category === "pension") {
    const { results } = await c.env.DB.prepare(
      `SELECT p.month, pe.current_value_cents value_cents,
        pe.cumulative_contributions_cents contributions_cents
       FROM periods p JOIN pension_entries pe ON pe.period_id = p.id
       ORDER BY p.month`,
    ).all();
    return c.json({ points: results });
  }
  if (!['liberty', 'stocks'].includes(category)) return c.json({ error: "Categoría no válida" }, 400);
  const column = category === "liberty" ? "liberty_cents" : "stocks_cents";
  const { results } = await c.env.DB.prepare(
    `SELECT p.month, s.${column} value_cents
     FROM periods p JOIN summary_snapshots s ON s.period_id = p.id
     WHERE s.${column} IS NOT NULL ORDER BY p.month`,
  ).all();
  return c.json({ points: results });
});

const periodSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  copyPrevious: z.boolean().default(true),
});

app.post("/api/periods", zValidator("json", periodSchema), async (c) => {
  const input = c.req.valid("json");
  const month = `${input.month.slice(0, 7)}-01`;
  const { copyPrevious } = input;
  const existing = await c.env.DB.prepare("SELECT id FROM periods WHERE month = ?").bind(month).first<{ id: number }>();
  if (existing) return c.json({ id: existing.id, created: false });

  const previous = copyPrevious
    ? await c.env.DB.prepare("SELECT id FROM periods WHERE month < ? ORDER BY month DESC LIMIT 1").bind(month).first<{ id: number }>()
    : null;
  const inserted = await c.env.DB.prepare("INSERT INTO periods (month) VALUES (?) RETURNING id").bind(month).first<{ id: number }>();
  if (!inserted) return c.json({ error: "No se pudo crear el mes" }, 500);

  const statements: D1PreparedStatement[] = [];
  if (previous) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO summary_snapshots
          (period_id, current_account_cents, savings_account_cents, pias_cents, liberty_cents, pension_cents, stocks_cents, total_cents)
         SELECT ?, current_account_cents, savings_account_cents, pias_cents, liberty_cents, pension_cents, stocks_cents, total_cents
         FROM summary_snapshots WHERE period_id = ?`,
      ).bind(inserted.id, previous.id),
      c.env.DB.prepare(
        `INSERT INTO holdings
          (period_id, instrument_id, units, average_cost_cents, invested_cents, withdrawn_cents, price_minor, price_scale,
           price_currency, fx_to_eur, price_eur_minor, market_value_cents, quote_source, quoted_at, is_locked)
         SELECT ?, instrument_id, units, average_cost_cents, invested_cents, withdrawn_cents, price_minor, price_scale,
           price_currency, fx_to_eur, price_eur_minor, market_value_cents, 'Copiado del mes anterior', quoted_at, 0
         FROM holdings WHERE period_id = ?`,
      ).bind(inserted.id, previous.id),
      c.env.DB.prepare(
        `INSERT INTO pension_entries (period_id, employer_cents, personal_cents, current_value_cents, cumulative_contributions_cents)
         SELECT ?, 0, 0, current_value_cents, cumulative_contributions_cents
         FROM pension_entries WHERE period_id = ?`,
      ).bind(inserted.id, previous.id),
    );
  } else {
    statements.push(c.env.DB.prepare("INSERT INTO summary_snapshots (period_id) VALUES (?)").bind(inserted.id));
  }
  await c.env.DB.batch(statements);
  return c.json({ id: inserted.id, created: true, copiedFrom: previous?.id ?? null }, 201);
});

const nullableMoney = z.number().int().nullable().optional();
app.patch(
  "/api/periods/:id/summary",
  zValidator(
    "json",
    z.object({
      currentAccountCents: nullableMoney,
      savingsAccountCents: nullableMoney,
      piasCents: nullableMoney,
      notes: z.string().max(1000).nullable().optional(),
    }),
  ),
  async (c) => {
    const id = Number(c.req.param("id"));
    const data = c.req.valid("json");
    await c.env.DB.prepare(
      `UPDATE summary_snapshots SET
        current_account_cents = COALESCE(?, current_account_cents),
        savings_account_cents = COALESCE(?, savings_account_cents),
        pias_cents = COALESCE(?, pias_cents), updated_at = CURRENT_TIMESTAMP
       WHERE period_id = ?`,
    ).bind(data.currentAccountCents ?? null, data.savingsAccountCents ?? null, data.piasCents ?? null, id).run();
    if (data.notes !== undefined) await c.env.DB.prepare("UPDATE periods SET notes = ? WHERE id = ?").bind(data.notes, id).run();
    await recomputeSummary(c.env.DB, id);
    return c.json({ ok: true });
  },
);

app.get("/api/portfolio/:category", async (c) => {
  const category = c.req.param("category");
  if (!['liberty', 'stocks', 'pension'].includes(category)) return c.json({ error: "Categoría no válida" }, 400);
  const requested = c.req.query("periodId");
  const period = requested
    ? await c.env.DB.prepare("SELECT * FROM periods WHERE id = ?").bind(Number(requested)).first()
    : await c.env.DB.prepare("SELECT * FROM periods ORDER BY month DESC LIMIT 1").first();
  if (!period) return c.json({ period: null, instruments: [] });
  const periodId = Number(period.id);
  const { results } = await c.env.DB.prepare(
    `SELECT i.*, h.units, h.average_cost_cents, h.invested_cents, h.withdrawn_cents,
      h.price_minor, h.price_scale, h.price_currency, h.fx_to_eur, h.price_eur_minor,
      h.market_value_cents, h.quote_source, h.quoted_at
     FROM instruments i
     LEFT JOIN holdings h ON h.instrument_id = i.id AND h.period_id = ?
     WHERE i.category = ? AND i.active = 1
     ORDER BY i.sort_order, i.name`,
  ).bind(periodId, category).all();
  const pension = category === "pension"
    ? await c.env.DB.prepare("SELECT * FROM pension_entries WHERE period_id = ?").bind(periodId).first()
    : null;
  return c.json({ period, instruments: results, pension });
});

app.get("/api/stocks/overview", async (c) => {
  const periodId = Number(c.req.query("periodId"));
  if (!Number.isInteger(periodId)) return c.json({ error: "Periodo no válido" }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT i.id, i.name, i.isin, i.ticker, i.reference_symbol, i.currency,
      COALESCE(h.units, 0) units, COALESCE(h.market_value_cents, 0) market_value_cents,
      h.price_eur_minor, h.quoted_at, h.is_locked,
      COALESCE(SUM(CASE WHEN t.total_cents > 0 THEN t.total_cents ELSE 0 END), 0) total_paid_cents,
      ABS(COALESCE(SUM(CASE WHEN t.total_cents < 0 THEN t.total_cents ELSE 0 END), 0)) total_withdrawn_cents,
      COALESCE(SUM(t.total_cents), 0) net_invested_cents
     FROM instruments i
     LEFT JOIN holdings h ON h.instrument_id = i.id AND h.period_id = ?
     LEFT JOIN periods selected ON selected.id = ?
     LEFT JOIN stock_transactions t ON t.instrument_id = i.id
       AND substr(t.trade_date, 1, 7) <= substr(selected.month, 1, 7)
     WHERE i.category = 'stocks' AND i.active = 1
     GROUP BY i.id, h.units, h.market_value_cents, h.price_eur_minor, h.quoted_at, h.is_locked
     ORDER BY i.sort_order, i.name`,
  ).bind(periodId, periodId).all<Record<string, unknown>>();
  return c.json({
    items: results.map((item) => {
      const marketValue = Number(item.market_value_cents || 0);
      const paid = Number(item.total_paid_cents || 0);
      const withdrawn = Number(item.total_withdrawn_cents || 0);
      const net = Number(item.net_invested_cents || 0);
      const units = Number(item.units || 0);
      const result = marketValue - paid + withdrawn;
      return {
        ...item,
        result_cents: result,
        variation: net ? result / Math.abs(net) : null,
        equilibrium_price: units ? (net / 100) / units : null,
      };
    }),
  });
});

app.get("/api/stocks/transactions", async (c) => {
  const requested = c.req.query("periodId");
  const period = requested
    ? await c.env.DB.prepare("SELECT month FROM periods WHERE id = ?").bind(Number(requested)).first<{ month: string }>()
    : null;
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.trade_date, t.kind, t.units, t.price_minor, t.price_scale, t.total_cents,
      t.currency, t.fx_to_eur, t.broker, t.source, i.id instrument_id, i.name instrument_name
     FROM stock_transactions t JOIN instruments i ON i.id = t.instrument_id
     WHERE (? IS NULL OR substr(t.trade_date, 1, 7) <= substr(?, 1, 7))
     ORDER BY t.trade_date DESC, t.id DESC`,
  ).bind(period?.month ?? null, period?.month ?? null).all();
  return c.json({ transactions: results });
});

const transactionSchema = z.object({
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instrumentId: z.number().int(),
  kind: z.enum(["A", "D", "R", "E"]),
  units: z.number().positive(),
  price: z.number().nonnegative(),
  broker: z.string().trim().max(80).nullable().optional(),
  currency: z.string().trim().toUpperCase().length(3).default("EUR"),
});

app.post("/api/stocks/transactions", zValidator("json", transactionSchema), async (c) => {
  const item = c.req.valid("json");
  const instrument = await c.env.DB.prepare("SELECT id FROM instruments WHERE id = ? AND category = 'stocks'")
    .bind(item.instrumentId).first();
  if (!instrument) return c.json({ error: "Activo no encontrado" }, 404);
  const sign = item.kind === "D" || item.kind === "E" ? -1 : 1;
  const units = Math.abs(item.units) * sign;
  const totalCents = Math.round(units * item.price * 100);
  const inserted = await c.env.DB.prepare(
    `INSERT INTO stock_transactions
      (trade_date, instrument_id, kind, units, price_minor, price_scale, total_cents, currency, broker, source)
     VALUES (?, ?, ?, ?, ?, 10000, ?, ?, ?, 'manual') RETURNING id`,
  ).bind(
    item.tradeDate, item.instrumentId, item.kind, units, Math.round(item.price * 10000),
    totalCents, item.currency, item.broker || null,
  ).first<{ id: number }>();
  return c.json(inserted, 201);
});

const instrumentSchema = z.object({
  category: z.enum(["liberty", "stocks", "pension"]),
  name: z.string().min(1).max(160),
  isin: z.string().trim().toUpperCase().max(12).nullable().optional(),
  ticker: z.string().trim().max(32).nullable().optional(),
  currency: z.string().trim().toUpperCase().length(3).default("EUR"),
});

app.post("/api/instruments", zValidator("json", instrumentSchema), async (c) => {
  const data = c.req.valid("json");
  const inserted = await c.env.DB.prepare(
    `INSERT INTO instruments (category, name, isin, ticker, currency, sort_order)
     VALUES (?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 10 FROM instruments WHERE category = ?), 10))
     RETURNING id`,
  ).bind(data.category, data.name, data.isin || null, data.ticker || null, data.currency, data.category).first();
  return c.json(inserted, 201);
});

app.patch("/api/instruments/:id", zValidator("json", instrumentSchema.partial()), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");
  const current = await c.env.DB.prepare("SELECT * FROM instruments WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!current) return c.json({ error: "Instrumento no encontrado" }, 404);
  await c.env.DB.prepare(
    "UPDATE instruments SET name = ?, isin = ?, ticker = ?, currency = ? WHERE id = ?",
  ).bind(data.name ?? current.name, data.isin ?? current.isin, data.ticker ?? current.ticker, data.currency ?? current.currency, id).run();
  return c.json({ ok: true });
});

app.post(
  "/api/quotes/preview",
  zValidator("json", z.object({ periodId: z.number().int(), category: z.enum(["liberty", "stocks"]) })),
  async (c) => {
    const { periodId, category } = c.req.valid("json");
    const { results } = await c.env.DB.prepare(
      `SELECT i.id, i.name, i.isin, i.ticker, i.currency, COALESCE(h.units, 0) units
       FROM instruments i LEFT JOIN holdings h ON h.instrument_id = i.id AND h.period_id = ?
       WHERE i.category = ? AND i.active = 1 ORDER BY i.sort_order`,
    ).bind(periodId, category).all<Record<string, unknown>>();
    const quotes = await Promise.all(results.map(async (row) => {
      try {
        return { instrumentId: row.id, units: row.units, quote: await fetchQuote(row) };
      } catch (error) {
        return { instrumentId: row.id, units: row.units, error: error instanceof Error ? error.message : "Cotización no disponible" };
      }
    }));
    return c.json({ quotes });
  },
);

const holdingSchema = z.object({
  instrumentId: z.number().int(),
  units: z.number(),
  averageCostCents: z.number().int().nullable().optional(),
  investedCents: z.number().int().nullable().optional(),
  withdrawnCents: z.number().int().default(0),
  price: z.number().nonnegative(),
  priceCurrency: z.string().length(3),
  fxToEur: z.number().positive(),
  priceEur: z.number().nonnegative(),
  quoteSource: z.string().max(80),
  quotedAt: z.string(),
});

app.put(
  "/api/periods/:id/holdings",
  zValidator("json", z.object({ category: z.enum(["liberty", "stocks"]), items: z.array(holdingSchema) })),
  async (c) => {
    const periodId = Number(c.req.param("id"));
    const { category, items } = c.req.valid("json");
    if (category === "stocks") {
      const period = await c.env.DB.prepare("SELECT status FROM periods WHERE id = ?").bind(periodId).first<{ status: string }>();
      if (!period) return c.json({ error: "Mes no encontrado" }, 404);
      if (period.status === "closed") {
        return c.json({ error: "Este cierre histórico de Bolsa ya está guardado y no puede sobrescribirse" }, 409);
      }
      const locked = await c.env.DB.prepare(
        `SELECT 1 locked FROM holdings h JOIN instruments i ON i.id = h.instrument_id
         WHERE h.period_id = ? AND i.category = 'stocks' AND h.is_locked = 1 LIMIT 1`,
      ).bind(periodId).first();
      if (locked) return c.json({ error: "Este cierre de Bolsa ya está guardado y no puede sobrescribirse" }, 409);
    }
    const allowed = await c.env.DB.prepare("SELECT id FROM instruments WHERE category = ?").bind(category).all<{ id: number }>();
    const ids = new Set(allowed.results.map((item) => item.id));
    if (items.some((item) => !ids.has(item.instrumentId))) return c.json({ error: "Instrumento fuera de categoría" }, 400);
    const statements = items.map((item) => {
      const marketValueCents = Math.round(item.units * item.priceEur * 100);
      return c.env.DB.prepare(
        `INSERT INTO holdings
          (period_id, instrument_id, units, average_cost_cents, invested_cents, withdrawn_cents,
           price_minor, price_scale, price_currency, fx_to_eur, price_eur_minor, market_value_cents, quote_source, quoted_at, is_locked)
         VALUES (?, ?, ?, ?, ?, ?, ?, 10000, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(period_id, instrument_id) DO UPDATE SET
           units=excluded.units, average_cost_cents=excluded.average_cost_cents, invested_cents=excluded.invested_cents,
           withdrawn_cents=excluded.withdrawn_cents, price_minor=excluded.price_minor, price_scale=excluded.price_scale,
           price_currency=excluded.price_currency, fx_to_eur=excluded.fx_to_eur, price_eur_minor=excluded.price_eur_minor,
           market_value_cents=excluded.market_value_cents, quote_source=excluded.quote_source, quoted_at=excluded.quoted_at,
           is_locked=excluded.is_locked,
           updated_at=CURRENT_TIMESTAMP`,
      ).bind(
        periodId, item.instrumentId, item.units, item.averageCostCents ?? null, item.investedCents ?? null,
        item.withdrawnCents, Math.round(item.price * 10000), item.priceCurrency, item.fxToEur,
        Math.round(item.priceEur * 10000), marketValueCents, item.quoteSource, item.quotedAt,
        category === "stocks" ? 1 : 0,
      );
    });
    if (statements.length) await c.env.DB.batch(statements);
    const total = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(h.market_value_cents), 0) total FROM holdings h
       JOIN instruments i ON i.id = h.instrument_id WHERE h.period_id = ? AND i.category = ?`,
    ).bind(periodId, category).first<{ total: number }>();
    const column = category === "liberty" ? "liberty_cents" : "stocks_cents";
    await c.env.DB.prepare(`UPDATE summary_snapshots SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE period_id = ?`)
      .bind(total?.total ?? 0, periodId).run();
    await recomputeSummary(c.env.DB, periodId);
    return c.json({ ok: true, totalCents: total?.total ?? 0 });
  },
);

app.put(
  "/api/periods/:id/pension",
  zValidator("json", z.object({ employerCents: z.number().int(), personalCents: z.number().int(), currentValueCents: z.number().int() })),
  async (c) => {
    const periodId = Number(c.req.param("id"));
    const item = c.req.valid("json");
    const previous = await c.env.DB.prepare(
      `SELECT pe.cumulative_contributions_cents total FROM pension_entries pe JOIN periods p ON p.id = pe.period_id
       WHERE p.month < (SELECT month FROM periods WHERE id = ?) ORDER BY p.month DESC LIMIT 1`,
    ).bind(periodId).first<{ total: number }>();
    const cumulative = (previous?.total ?? 0) + item.employerCents + item.personalCents;
    await c.env.DB.prepare(
      `INSERT INTO pension_entries (period_id, employer_cents, personal_cents, current_value_cents, cumulative_contributions_cents)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT(period_id) DO UPDATE SET employer_cents=excluded.employer_cents,
       personal_cents=excluded.personal_cents, current_value_cents=excluded.current_value_cents,
       cumulative_contributions_cents=excluded.cumulative_contributions_cents`,
    ).bind(periodId, item.employerCents, item.personalCents, item.currentValueCents, cumulative).run();
    await c.env.DB.prepare("UPDATE summary_snapshots SET pension_cents = ? WHERE period_id = ?")
      .bind(item.currentValueCents, periodId).run();
    await recomputeSummary(c.env.DB, periodId);
    return c.json({ ok: true, cumulativeContributionsCents: cumulative });
  },
);

app.post("/api/periods/:id/close", async (c) => {
  const id = Number(c.req.param("id"));
  await recomputeSummary(c.env.DB, id);
  await c.env.DB.prepare("UPDATE periods SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

async function recomputeSummary(db: D1Database, periodId: number) {
  await db.prepare(
    `UPDATE summary_snapshots SET total_cents =
      COALESCE(current_account_cents, 0) + COALESCE(savings_account_cents, 0) + COALESCE(pias_cents, 0) +
      COALESCE(liberty_cents, 0) + COALESCE(pension_cents, 0) + COALESCE(stocks_cents, 0),
      updated_at = CURRENT_TIMESTAMP WHERE period_id = ?`,
  ).bind(periodId).run();
}

async function fetchQuote(instrument: Record<string, unknown>): Promise<Quote> {
  const lookupKey = String(instrument.ticker || instrument.isin || instrument.reference_symbol || instrument.name);
  const headers = { "user-agent": "Mozilla/5.0 CuentasYAhorro/1.0", accept: "application/json" };
  let symbol = String(instrument.ticker || "");
  let resolvedName = String(instrument.name);
  type Meta = { regularMarketPrice?: number; currency?: string };
  const chart = async (candidate: string): Promise<Meta | null> => {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(candidate)}?interval=1d&range=5d`, { headers });
    if (!response.ok) return null;
    const payload = await response.json() as { chart?: { result?: Array<{ meta?: Meta }> } };
    const meta = payload.chart?.result?.[0]?.meta;
    return meta?.regularMarketPrice && meta.currency ? meta : null;
  };

  let meta = symbol ? await chart(symbol) : null;
  if (!meta) {
    const queries = [...new Set([instrument.isin, instrument.reference_symbol, instrument.name].filter(Boolean).map(String))];
    for (const query of queries) {
      const search = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`, { headers });
      if (!search.ok) continue;
      const payload = await search.json() as { quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string }> };
      for (const match of payload.quotes || []) {
        if (!match.symbol || match.quoteType === "OPTION") continue;
        const candidate = await chart(match.symbol);
        if (!candidate) continue;
        symbol = match.symbol;
        meta = candidate;
        resolvedName = match.longname || match.shortname || resolvedName;
        break;
      }
      if (meta) break;
    }
  }
  if (!meta?.regularMarketPrice || !meta.currency || !symbol) throw new Error(`Sin cotización para ${lookupKey}`);
  const currency = meta.currency.toUpperCase();
  let fxToEur = 1;
  if (currency !== "EUR") {
    const fx = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=EUR`);
    if (!fx.ok) throw new Error(`No se pudo convertir ${currency} a EUR`);
    const fxPayload = await fx.json() as { rates?: { EUR?: number } };
    if (!fxPayload.rates?.EUR) throw new Error(`Cambio ${currency}/EUR no disponible`);
    fxToEur = fxPayload.rates.EUR;
  }
  return {
    lookupKey,
    symbol,
    name: resolvedName,
    price: meta.regularMarketPrice,
    currency,
    fxToEur,
    priceEur: meta.regularMarketPrice * fxToEur,
    source: "Yahoo Finance + Frankfurter/ECB",
    quotedAt: new Date().toISOString(),
  };
}

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: error.message || "Error interno" }, 500);
});

app.get("/api/test-new", (c) => c.json({ routes: app.routes.length }));

app.notFound(() => jsonError("Ruta no encontrada", 404));

const worker: ExportedHandler<Env> = {
  async fetch(request, env, executionContext) {
    const url = new URL(request.url);
    const prefix = "/cuentasyahorro";
    if (url.pathname === prefix) {
      url.pathname = `${prefix}/`;
      return Response.redirect(url.toString(), 308);
    }
    if (url.pathname.startsWith(`${prefix}/`)) {
      url.pathname = url.pathname.slice(prefix.length) || "/";
      const rewritten = new Request(url.toString(), request);
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return app.fetch(rewritten, env, executionContext);
      }
      return env.ASSETS.fetch(rewritten);
    }
    return app.fetch(request, env, executionContext);
  },
};

export default worker;
