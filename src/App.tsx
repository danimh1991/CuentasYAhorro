import { FormEvent, useCallback, useEffect, useState } from "react";

type View =
  | "summary"
  | "overview"
  | "variation"
  | "savings"
  | "liberty"
  | "pension"
  | "stocks"
  | "markets";
type Period = {
  id: number;
  month: string;
  status: "draft" | "closed";
  notes?: string | null;
  current_account_cents?: number | null;
  savings_account_cents?: number | null;
  pias_cents?: number | null;
  liberty_cents?: number | null;
  pension_cents?: number | null;
  stocks_cents?: number | null;
  total_cents?: number | null;
};
type Instrument = {
  id: number;
  category: "liberty" | "stocks" | "pension";
  name: string;
  isin?: string | null;
  ticker?: string | null;
  reference_symbol?: string | null;
  currency: string;
  units?: number | null;
  average_cost_cents?: number | null;
  invested_cents?: number | null;
  withdrawn_cents?: number | null;
  price_eur_minor?: number | null;
  market_value_cents?: number | null;
  quote_source?: string | null;
  quoted_at?: string | null;
  is_locked?: number | null;
};
type Preview = {
  instrumentId: number;
  units: number;
  quote?: {
    symbol: string;
    price: number;
    currency: string;
    priceEur: number;
    fxToEur: number;
    source: string;
    quotedAt: string;
  };
  error?: string;
};
type PensionEntry = {
  employer_cents: number;
  personal_cents: number;
  current_value_cents: number;
  cumulative_contributions_cents: number;
};
type PensionHistory = PensionEntry & {
  period_id: number;
  month: string;
  cumulative_employer_cents: number;
  cumulative_personal_cents: number;
  gain_cents: number;
  month_change_cents: number;
};
type HistoryPoint = {
  month: string;
  value_cents: number;
  contributions_cents?: number;
};
type StockOverview = Instrument & {
  total_paid_cents: number;
  total_withdrawn_cents: number;
  total_dividends_cents: number;
  net_invested_cents: number;
  result_cents: number;
  variation: number | null;
  dividend_return: number | null;
  equilibrium_price: number | null;
};
type StockTransaction = {
  id: number;
  trade_date: string;
  kind: "A" | "D" | "R" | "E";
  units: number;
  price_minor: number;
  price_scale: number;
  total_cents: number;
  currency: string;
  broker?: string | null;
  source: string;
  instrument_id: number;
  instrument_name: string;
};
type SavingsEntry = {
  period_id: number;
  month: string;
  bucket: "cash" | "deposit" | "funds" | "indexed";
  contribution_cents: number;
  current_value_cents: number;
  interest_cents: number;
  cumulative_contribution_cents: number;
  month_difference_cents: number;
  cumulative_interest_cents: number;
};
type SavingsFundTransaction = {
  id: number;
  fund_name: string;
  trade_date: string;
  units: number;
  amount_cents: number;
  price_minor: number;
  price_scale: number;
  source: string;
};
type SavingsSetting = {
  bucket: SavingsEntry["bucket"];
  label: string;
};
type SavingsFund = {
  id: number;
  name: string;
  isin?: string | null;
  ticker?: string | null;
  currency: string;
};
type Dividend = {
  id: number;
  payment_date: string;
  instrument_id: number;
  instrument_name: string;
  gross_minor: number;
  amount_scale: number;
  currency: string;
  fx_to_eur: number;
  amount_eur_cents: number;
  per_share_minor?: number | null;
  per_share_scale?: number | null;
  invested_at_payment_cents?: number | null;
  note?: string | null;
};
type MarketReference = {
  id: number;
  name: string;
  ticker?: string | null;
  reference_symbol?: string | null;
  isin?: string | null;
  currency: string;
  quoted_at?: string | null;
  price_minor?: number | null;
  price_scale?: number | null;
  price_currency?: string | null;
  price_eur_minor?: number | null;
  source?: string | null;
};

const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});
const decimal = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 6 });
const percent = new Intl.NumberFormat("es-ES", {
  style: "percent",
  maximumFractionDigits: 2,
});
const monthFormat = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  year: "numeric",
});
const cents = (value?: number | null) => euro.format((value ?? 0) / 100);
const toCents = (value: string) =>
  Math.round((Number(value.replace(",", ".")) || 0) * 100);
const fromCents = (value?: number | null) => ((value ?? 0) / 100).toFixed(2);
const labelMonth = (month: string) =>
  monthFormat.format(new Date(`${month.slice(0, 7)}-01T12:00:00`));
const apiPrefix =
  window.location.pathname === "/cuentasyahorro" ||
  window.location.pathname.startsWith("/cuentasyahorro/")
    ? "/cuentasyahorro"
    : "";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiPrefix}${url}`, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & Record<string, unknown>;
  if (!response.ok)
    throw new Error(payload.error || "No se pudo completar la operación");
  return payload as T;
}

const titles: Record<View, string> = {
  summary: "Resumen actual",
  overview: "Resumen general",
  variation: "Variación",
  savings: "Ahorro",
  liberty: "Detalle Liberty",
  pension: "Fondo de pensiones empresa",
  stocks: "Bolsa",
  markets: "Mercados",
};

function App() {
  const [auth, setAuth] = useState({
    loading: true,
    protected: false,
    authenticated: false,
  });
  const [pin, setPin] = useState("");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<View>("summary");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loadSummary = useCallback(async () => {
    const data = await api<{ periods: Period[] }>("/api/summary");
    setPeriods(data.periods);
    setSelectedId((current) => current ?? data.periods.at(-1)?.id ?? null);
  }, []);
  useEffect(() => {
    api<{ protected: boolean; authenticated: boolean }>("/api/auth/status")
      .then((result) => {
        setAuth({ loading: false, ...result });
        if (result.authenticated) return loadSummary();
      })
      .catch((cause) => setError(cause.message));
  }, [loadSummary]);
  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: pin }),
      });
      setAuth((value) => ({ ...value, authenticated: true }));
      await loadSummary();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo iniciar sesión",
      );
    } finally {
      setBusy(false);
    }
  };
  if (auth.loading) return <Splash />;
  if (!auth.authenticated)
    return (
      <Login
        pin={pin}
        setPin={setPin}
        onSubmit={login}
        busy={busy}
        error={error}
      />
    );
  const selected = periods.find((period) => period.id === selectedId) ?? null;
  const createNextMonth = async () => {
    const source = selected ?? periods.at(-1);
    const base = source
      ? new Date(`${source.month.slice(0, 7)}-01T12:00:00`)
      : new Date();
    if (source) base.setMonth(base.getMonth() + 1);
    base.setDate(1);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: number }>("/api/periods", {
        method: "POST",
        body: JSON.stringify({
          month: base.toISOString().slice(0, 10),
          copyPrevious: true,
        }),
      });
      await loadSummary();
      setSelectedId(result.id);
      setView("summary");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo crear el mes",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">C</span>
          <div>
            <strong>Cuentas</strong>
            <small>y Ahorro</small>
          </div>
        </div>
        <nav>
          <NavItem
            active={view === "summary"}
            onClick={() => setView("summary")}
            icon="⌂"
          >
            Resumen actual
          </NavItem>
          <NavItem
            active={view === "overview"}
            onClick={() => setView("overview")}
            icon="▦"
          >
            Resumen general
          </NavItem>
          <NavItem
            active={view === "variation"}
            onClick={() => setView("variation")}
            icon="±"
          >
            Variación
          </NavItem>
          <NavItem
            active={view === "savings"}
            onClick={() => setView("savings")}
            icon="◫"
          >
            Ahorro
          </NavItem>
          <NavItem
            active={view === "liberty"}
            onClick={() => setView("liberty")}
            icon="◇"
          >
            Liberty
          </NavItem>
          <NavItem
            active={view === "pension"}
            onClick={() => setView("pension")}
            icon="◎"
          >
            Fondo pensiones
          </NavItem>
          <NavItem
            active={view === "stocks"}
            onClick={() => setView("stocks")}
            icon="↗"
          >
            Bolsa
          </NavItem>
          <NavItem
            active={view === "markets"}
            onClick={() => setView("markets")}
            icon="◉"
          >
            Mercados
          </NavItem>
        </nav>
        <div className="sidebar-note">
          <span>Datos privados</span>
          <small>Persistencia en Cloudflare D1</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">Patrimonio personal</p>
            <h1>{titles[view]}</h1>
          </div>
          <div className="period-actions">
            <select
              value={selectedId ?? ""}
              onChange={(event) => setSelectedId(Number(event.target.value))}
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {labelMonth(period.month)}
                </option>
              ))}
            </select>
            <button
              className="button secondary"
              onClick={createNextMonth}
              disabled={busy}
            >
              + Nuevo mes
            </button>
          </div>
        </header>
        {error && (
          <div className="alert" onClick={() => setError("")}>
            {error}
            <span>×</span>
          </div>
        )}
        {!selected ? (
          <EmptyState onCreate={createNextMonth} />
        ) : view === "summary" ? (
          <Summary
            period={selected}
            periods={periods}
            onRefresh={loadSummary}
          />
        ) : view === "overview" ? (
          <Overview periods={periods} />
        ) : view === "variation" ? (
          <Variation periods={periods} />
        ) : view === "savings" ? (
          <Savings period={selected} onRefresh={loadSummary} />
        ) : view === "pension" ? (
          <Pension period={selected} onRefresh={loadSummary} />
        ) : view === "stocks" ? (
          <Stocks period={selected} onRefresh={loadSummary} />
        ) : view === "markets" ? (
          <Markets />
        ) : (
          <Liberty period={selected} onRefresh={loadSummary} />
        )}
      </main>
    </div>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      <span>{icon}</span>
      {children}
    </button>
  );
}
function Splash() {
  return (
    <div className="center-screen">
      <div className="loader" />
      <p>Preparando tus cuentas…</p>
    </div>
  );
}
function Login({
  pin,
  setPin,
  onSubmit,
  busy,
  error,
}: {
  pin: string;
  setPin: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  busy: boolean;
  error: string;
}) {
  return (
    <div className="login-page">
      <div className="login-copy">
        <div className="brand light">
          <span className="brand-mark">C</span>
          <div>
            <strong>Cuentas</strong>
            <small>y Ahorro</small>
          </div>
        </div>
        <h1>
          Todo tu patrimonio,
          <br />
          sin perder el detalle.
        </h1>
        <p>
          Cierres mensuales, cotizaciones y evolución histórica en un único
          lugar privado.
        </p>
      </div>
      <form className="login-card" onSubmit={onSubmit}>
        <p className="eyebrow">Acceso privado</p>
        <h2>Bienvenido de nuevo</h2>
        <label>
          PIN
          <input
            autoFocus
            inputMode="numeric"
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="Introduce tu PIN"
          />
        </label>
        {error && <p className="field-error">{error}</p>}
        <button className="button primary" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty">
      <span>＋</span>
      <h2>Crea tu primer cierre mensual</h2>
      <p>Será el punto de partida para todas las secciones.</p>
      <button className="button primary" onClick={onCreate}>
        Crear mes actual
      </button>
    </section>
  );
}

const columns = [
  ["Cuenta corriente", "current_account_cents"],
  ["Cuenta ahorro", "savings_account_cents"],
  ["PIAS", "pias_cents"],
  ["Liberty", "liberty_cents"],
  ["Fondo pensiones", "pension_cents"],
  ["Bolsa", "stocks_cents"],
  ["Total", "total_cents"],
] as const;
function Overview({ periods }: { periods: Period[] }) {
  return (
    <section className="panel table-panel overview-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Vista completa</p>
          <h3>Patrimonio por mes</h3>
        </div>
        <span>{periods.length} cierres guardados</span>
      </div>
      <div className="table-scroll">
        <table className="history-table">
          <thead>
            <tr>
              <th>Mes</th>
              {columns.map(([label]) => (
                <th className="number" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...periods].reverse().map((period) => (
              <tr key={period.id}>
                <td>
                  <strong>{labelMonth(period.month)}</strong>
                </td>
                {columns.map(([label, key]) => (
                  <td
                    className={`number ${key === "total_cents" ? "total-cell" : ""}`}
                    key={label}
                  >
                    {cents(period[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Variation({ periods }: { periods: Period[] }) {
  const rows = periods
    .slice(1)
    .map((period, index) => ({ period, previous: periods[index] }))
    .reverse();
  return (
    <section className="panel table-panel overview-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Comparación mensual</p>
          <h3>Variación frente al mes anterior</h3>
        </div>
        <span>Importe y porcentaje</span>
      </div>
      <div className="table-scroll">
        <table className="variation-table">
          <thead>
            <tr>
              <th>Periodo</th>
              {columns.map(([label]) => (
                <th colSpan={2} className="number" key={label}>
                  {label}
                </th>
              ))}
            </tr>
            <tr>
              <th />
              {columns.flatMap(([label]) => [
                <th className="number subhead" key={`${label}-eur`}>
                  €
                </th>,
                <th className="number subhead" key={`${label}-pct`}>
                  %
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ period, previous }) => (
              <tr key={period.id}>
                <td>
                  <strong>
                    {labelMonth(previous.month)} → {labelMonth(period.month)}
                  </strong>
                </td>
                {columns.flatMap(([label, key]) => {
                  const current = Number(period[key] ?? 0);
                  const before = Number(previous[key] ?? 0);
                  const delta = current - before;
                  const ratio = current ? delta / Math.abs(current) : null;
                  const tone =
                    delta > 0 ? "positive" : delta < 0 ? "negative" : "";
                  return [
                    <td className={`number ${tone}`} key={`${label}-eur`}>
                      {cents(delta)}
                    </td>,
                    <td className={`number ${tone}`} key={`${label}-pct`}>
                      {ratio === null ? "—" : percent.format(ratio)}
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Summary({
  period,
  periods,
  onRefresh,
}: {
  period: Period;
  periods: Period[];
  onRefresh: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    current: fromCents(period.current_account_cents),
    savings: fromCents(period.savings_account_cents),
    pias: fromCents(period.pias_cents),
    notes: period.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [zoomMonths, setZoomMonths] = useState(Math.min(24, periods.length));
  useEffect(
    () =>
      setForm({
        current: fromCents(period.current_account_cents),
        savings: fromCents(period.savings_account_cents),
        pias: fromCents(period.pias_cents),
        notes: period.notes || "",
      }),
    [period],
  );
  const previous =
    periods[periods.findIndex((item) => item.id === period.id) - 1];
  const change =
    (period.total_cents ?? 0) -
    (previous?.total_cents ?? period.total_cents ?? 0);
  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/periods/${period.id}/summary`, {
        method: "PATCH",
        body: JSON.stringify({
          currentAccountCents: toCents(form.current),
          savingsAccountCents: toCents(form.savings),
          piasCents: toCents(form.pias),
          notes: form.notes || null,
        }),
      });
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <section className="hero-card">
        <div>
          <p className="eyebrow">
            Patrimonio total · {labelMonth(period.month)}
          </p>
          <h2>{cents(period.total_cents)}</h2>
          <p className={change >= 0 ? "positive" : "negative"}>
            {change >= 0 ? "+" : ""}
            {cents(change)} frente al mes anterior
          </p>
        </div>
        <div className="status-pill">
          <i className={period.status} />
          Datos guardados
        </div>
      </section>
      <section className="metric-grid">
        <EditableMetric
          label="Cuenta corriente"
          value={form.current}
          onChange={(value) => setForm({ ...form, current: value })}
          tone="mint"
        />
        <EditableMetric
          label="Cuenta ahorro"
          value={form.savings}
          onChange={(value) => setForm({ ...form, savings: value })}
          tone="blue"
        />
        <EditableMetric
          label="PIAS"
          value={form.pias}
          onChange={(value) => setForm({ ...form, pias: value })}
          tone="gold"
        />
        <Metric label="Liberty" value={period.liberty_cents} tone="violet" />
        <Metric
          label="Fondo pensiones empresa"
          value={period.pension_cents}
          tone="coral"
        />
        <Metric label="Bolsa" value={period.stocks_cents} tone="green" />
      </section>
      <section className="two-column">
        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Evolución</p>
              <h3>Patrimonio total</h3>
            </div>
            <span>
              {zoomMonths >= periods.length
                ? `Todo el histórico · ${periods.length} meses`
                : `Últimos ${zoomMonths} meses`}
            </span>
          </div>
          <div className="chart-zoom">
            <label>
              Zoom temporal
              <input
                type="range"
                min={Math.min(6, periods.length)}
                max={Math.max(periods.length, 6)}
                value={zoomMonths}
                onChange={(event) => setZoomMonths(Number(event.target.value))}
              />
            </label>
            <button
              className="button secondary compact"
              onClick={() => setZoomMonths(periods.length)}
            >
              Ver todo
            </button>
          </div>
          <LineChart
            points={periods
              .slice(-zoomMonths)
              .map((item) => ({
                month: item.month,
                value_cents: item.total_cents ?? 0,
              }))}
          />
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Este mes</p>
              <h3>Notas y contexto</h3>
            </div>
          </div>
          <textarea
            value={form.notes}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value })
            }
            placeholder="Movimiento o contexto del mes…"
          />
          <button
            className="button primary full"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Guardar resumen"}
          </button>
        </div>
      </section>
    </>
  );
}
function EditableMetric({
  label,
  value,
  onChange,
  tone,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  tone: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <div className="money-input">
        <input
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <b>€</b>
      </div>
      <small>Dato manual</small>
    </div>
  );
}
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number | null;
  tone: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{cents(value)}</strong>
      <small>Calculado desde el detalle</small>
    </div>
  );
}

function LineChart({
  points,
  secondKey,
}: {
  points: HistoryPoint[];
  secondKey?: "contributions_cents";
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (points.length < 2)
    return (
      <div className="chart-empty">
        La gráfica aparecerá al guardar varios meses.
      </div>
    );
  const recent = points;
  const values = recent.flatMap((point) => [
    point.value_cents ?? 0,
    secondKey ? (point[secondKey] ?? 0) : (point.value_cents ?? 0),
  ]);
  const min = Math.min(...values) * 0.96;
  const max = Math.max(...values) * 1.04;
  const coordinates = (key: "value_cents" | "contributions_cents") =>
    recent.map((point, index) => ({
      x: (index / (recent.length - 1)) * 100,
      y:
        88 -
        (((point[key] ?? 0) - min) / Math.max(max - min, 1)) * 72,
    }));
  const makePoints = (key: "value_cents" | "contributions_cents") =>
    coordinates(key)
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
  const main = makePoints("value_cents");
  const mainCoordinates = coordinates("value_cents");
  const tickIndexes = [...new Set([0, Math.floor((recent.length - 1) / 2), recent.length - 1])];
  return (
    <div className="line-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient
            id={`fill-${secondKey || "main"}`}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop offset="0" stopColor="#62c7a5" stopOpacity=".28" />
            <stop offset="1" stopColor="#62c7a5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,92 ${main} 100,92`}
          fill={`url(#fill-${secondKey || "main"})`}
        />
        <polyline
          points={main}
          fill="none"
          stroke="#218b6d"
          strokeWidth="2.2"
          vectorEffect="non-scaling-stroke"
        />
        {secondKey && (
          <polyline
            points={makePoints(secondKey)}
            fill="none"
            stroke="#d99a43"
            strokeDasharray="4 3"
            strokeWidth="1.7"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {mainCoordinates.map((coordinate, index) => (
          <circle
            key={`${recent[index].month}-${index}`}
            cx={coordinate.x}
            cy={coordinate.y}
            r={hovered === index ? 2.2 : 1.1}
            className="chart-point"
            vectorEffect="non-scaling-stroke"
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          >
            <title>{`${labelMonth(recent[index].month)} · ${cents(recent[index].value_cents)}`}</title>
          </circle>
        ))}
      </svg>
      {hovered !== null && (
        <div
          className="chart-tooltip"
          style={{ left: `${mainCoordinates[hovered].x}%` }}
        >
          <strong>{labelMonth(recent[hovered].month)}</strong>
          <span>{cents(recent[hovered].value_cents)}</span>
        </div>
      )}
      <div className="chart-labels">
        {tickIndexes.map((index) => (
          <span key={recent[index].month}>{labelMonth(recent[index].month)}</span>
        ))}
        {secondKey && (
          <span className="chart-legend">— Valor ··· Aportaciones</span>
        )}
      </div>
    </div>
  );
}

function usePortfolio(category: "liberty" | "stocks", periodId: number) {
  const [items, setItems] = useState<Instrument[]>([]);
  const [previews, setPreviews] = useState<Record<number, Preview>>({});
  const [manual, setManual] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const data = await api<{ instruments: Instrument[] }>(
      `/api/portfolio/${category}?periodId=${periodId}`,
    );
    setItems(
      data.instruments.map((item) => ({ ...item, units: item.units ?? 0 })),
    );
    setPreviews({});
    setManual({});
  }, [category, periodId]);
  useEffect(() => {
    void load();
  }, [load]);
  const preview = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await api<{ quotes: Preview[] }>("/api/quotes/preview", {
        method: "POST",
        body: JSON.stringify({ periodId, category }),
      });
      setPreviews(
        Object.fromEntries(
          data.quotes.map((quote) => [quote.instrumentId, quote]),
        ),
      );
      const failed = data.quotes.filter((quote) => quote.error).length;
      setMessage(
        failed
          ? `Cotizaciones consultadas. No se encontraron ${failed}; puedes introducirlas manualmente.`
          : "Cotizaciones actualizadas.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudieron consultar las cotizaciones",
      );
    } finally {
      setBusy(false);
    }
  };
  return {
    items,
    setItems,
    previews,
    manual,
    setManual,
    busy,
    setBusy,
    message,
    setMessage,
    load,
    preview,
  };
}
function quoteFor(
  item: Instrument,
  previews: Record<number, Preview>,
  manual: Record<number, string>,
) {
  const live = previews[item.id]?.quote;
  const manualPrice = Number((manual[item.id] || "").replace(",", "."));
  if (live) return live;
  if (manualPrice > 0)
    return {
      symbol: item.reference_symbol || item.ticker || item.name,
      price: manualPrice,
      currency: "EUR",
      priceEur: manualPrice,
      fxToEur: 1,
      source: "Manual",
      quotedAt: new Date().toISOString(),
    };
  return null;
}
function QuoteStatus({
  preview,
  saved,
  manual,
}: {
  preview?: Preview;
  saved: boolean;
  manual: boolean;
}) {
  return preview?.quote ? (
    <span className="quote live">En vivo</span>
  ) : manual ? (
    <span className="quote saved">Manual</span>
  ) : preview?.error ? (
    <span className="quote error">Revisar</span>
  ) : saved ? (
    <span className="quote saved">Guardado</span>
  ) : (
    <span className="quote">Pendiente</span>
  );
}

function InstrumentEditor({
  items,
  onClose,
  onSaved,
}: {
  items: Instrument[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState(items.map((item) => ({ ...item })));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const update = (id: number, field: keyof Instrument, value: string) =>
    setDrafts(
      drafts.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await Promise.all(
        drafts.map((item) =>
          api(`/api/instruments/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: item.name,
              isin: item.isin || null,
              ticker: item.ticker || null,
              referenceSymbol: item.reference_symbol || null,
              currency: item.currency,
            }),
          }),
        ),
      );
      await onSaved();
      onClose();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card instrument-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Edición</p>
            <h2>Valores e identificadores</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="modal-copy">
          Puedes corregir nombre, ISIN, ticker, símbolo de referencia y divisa.
          Los cambios se usarán en la siguiente consulta de cotizaciones.
        </p>
        {message && <div className="inline-message">{message}</div>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>ISIN</th>
                <th>Ticker API</th>
                <th>Símbolo</th>
                <th>Divisa</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      value={item.name}
                      onChange={(event) =>
                        update(item.id, "name", event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={item.isin || ""}
                      onChange={(event) =>
                        update(
                          item.id,
                          "isin",
                          event.target.value.toUpperCase(),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={item.ticker || ""}
                      onChange={(event) =>
                        update(item.id, "ticker", event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={item.reference_symbol || ""}
                      onChange={(event) =>
                        update(item.id, "reference_symbol", event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="currency-field"
                      value={item.currency}
                      onChange={(event) =>
                        update(
                          item.id,
                          "currency",
                          event.target.value.toUpperCase(),
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Liberty({
  period,
  onRefresh,
}: {
  period: Period;
  onRefresh: () => Promise<void>;
}) {
  const state = usePortfolio("liberty", period.id);
  const [editing, setEditing] = useState(false);
  const [fundValues, setFundValues] = useState<Record<number, string>>({});
  const [snapshot, setSnapshot] = useState<{
    contributed_cents: number;
    gain_cents: number;
    monthly_gain_cents: number;
    return_rate: number | null;
  } | null>(null);
  useEffect(() => setFundValues({}), [period.id]);
  const unitPrice = (item: Instrument) =>
    quoteFor(item, state.previews, state.manual)?.priceEur ??
    (item.price_eur_minor ?? 0) / 10000;
  const hasValueOverride = (id: number) =>
    Object.prototype.hasOwnProperty.call(fundValues, id);
  const enteredFundValue = (item: Instrument) =>
    Number((fundValues[item.id] || "").replace(",", ".")) || 0;
  const effectiveUnits = (item: Instrument) => {
    const price = unitPrice(item);
    return hasValueOverride(item.id) && enteredFundValue(item) > 0 && price > 0
      ? enteredFundValue(item) / price
      : Number(item.units || 0);
  };
  const effectiveFundValue = (item: Instrument) => {
    if (hasValueOverride(item.id)) return enteredFundValue(item);
    const calculated = Number(item.units || 0) * unitPrice(item);
    return calculated || (item.market_value_cents ?? 0) / 100;
  };
  const total = state.items.reduce(
    (sum, item) => sum + effectiveFundValue(item),
    0,
  );
  useEffect(() => {
    api<{ snapshot: typeof snapshot }>(
      `/api/liberty/snapshot?periodId=${period.id}`,
    ).then((data) => setSnapshot(data.snapshot));
  }, [period.id]);
  const save = async () => {
    const positions = state.items.filter(
      (item) =>
        Math.abs(effectiveUnits(item)) > 0.00000001 ||
        effectiveFundValue(item) > 0,
    );
    const quoted = positions
      .map((item) => ({
        item,
        quote: quoteFor(item, state.previews, state.manual),
      }))
      .filter((row) => row.quote);
    if (quoted.length !== positions.length)
      return state.setMessage(
        "Antes de guardar debes consultar o introducir manualmente el precio unitario de todos los fondos con unidades.",
      );
    state.setBusy(true);
    state.setMessage("");
    try {
      await api(`/api/periods/${period.id}/holdings`, {
        method: "PUT",
        body: JSON.stringify({
          category: "liberty",
          items: quoted.map(({ item, quote }) => ({
            instrumentId: item.id,
            units: effectiveUnits(item),
            averageCostCents: item.average_cost_cents ?? null,
            investedCents: item.invested_cents ?? null,
            withdrawnCents: item.withdrawn_cents ?? 0,
            price: quote!.price,
            priceCurrency: quote!.currency,
            fxToEur: quote!.fxToEur,
            priceEur: quote!.priceEur,
            quoteSource: quote!.source,
            quotedAt: quote!.quotedAt,
          })),
        }),
      });
      await Promise.all([state.load(), onRefresh()]);
      state.setMessage("Liberty guardado para este mes.");
    } catch (cause) {
      state.setMessage(
        cause instanceof Error ? cause.message : "No se pudo guardar",
      );
    } finally {
      state.setBusy(false);
    }
  };
  const missing = Object.values(state.previews).filter((item) => item.error);
  return (
    <>
      <section className="detail-hero">
        <div>
          <p className="eyebrow">{labelMonth(period.month)}</p>
          <h2>{euro.format(total)}</h2>
          <p>Valor total de Liberty</p>
        </div>
        <div className="action-row">
          <button className="button secondary" onClick={() => setEditing(true)}>
            ✎ Editar fondos
          </button>
          <button
            className="button secondary"
            onClick={state.preview}
            disabled={state.busy}
          >
            ↻ Consultar cotizaciones
          </button>
          <button
            className="button primary"
            onClick={save}
            disabled={state.busy}
          >
            Guardar mes
          </button>
        </div>
      </section>
      {state.message && <div className="inline-message">{state.message}</div>}
      {missing.length > 0 && (
        <div className="quote-warning">
          <strong>No se encontraron {missing.length} cotizaciones.</strong>{" "}
          Revisa el ISIN o símbolo en “Editar fondos”, o introduce el precio
          manualmente.
        </div>
      )}
      <section className="metric-grid liberty-metrics">
        <Metric
          label="Aportado"
          value={snapshot?.contributed_cents ?? 0}
          tone="blue"
        />
        <Metric
          label="Ganancia acumulada"
          value={snapshot?.gain_cents ?? 0}
          tone="green"
        />
        <Metric
          label="Variación del mes"
          value={snapshot?.monthly_gain_cents ?? 0}
          tone="gold"
        />
        <div className="metric violet">
          <span>Rentabilidad</span>
          <strong>
            {snapshot?.return_rate == null
              ? "—"
              : percent.format(snapshot.return_rate)}
          </strong>
          <small>Respecto a las aportaciones</small>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Posiciones</p>
            <h3>Fondos Liberty</h3>
          </div>
          <span>
            Escribe unidades o valor total; con el precio unitario se calcula el
            otro dato. Consulta precios antes de guardar un mes nuevo.
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fondo</th>
                <th>ISIN / símbolo</th>
                <th className="number">Unidades</th>
                <th className="number">Precio unitario EUR</th>
                <th className="number">Valor del fondo</th>
                <th className="number">Peso en Liberty</th>
                <th>Consulta</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((item, index) => {
                const quote = quoteFor(item, state.previews, state.manual);
                const price = unitPrice(item);
                const units = effectiveUnits(item);
                const value = effectiveFundValue(item);
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.currency}</small>
                    </td>
                    <td>
                      {item.isin ||
                        item.reference_symbol ||
                        item.ticker ||
                        "Pendiente de editar"}
                    </td>
                    <td className="number">
                      <input
                        className="number-field"
                        value={Number.isFinite(units) ? units : 0}
                        onChange={(event) => {
                          setFundValues((values) => {
                            const next = { ...values };
                            delete next[item.id];
                            return next;
                          });
                          state.setItems(
                            state.items.map((entry, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...entry,
                                    units: Number(event.target.value),
                                  }
                                : entry,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td className="number">
                      {quote ? (
                        <strong>{decimal.format(quote.priceEur)} €</strong>
                      ) : (
                        <input
                          className="number-field"
                          placeholder="Manual"
                          value={state.manual[item.id] || ""}
                          onChange={(event) =>
                            state.setManual({
                              ...state.manual,
                              [item.id]: event.target.value,
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="number">
                      <input
                        className="number-field fund-value-field"
                        inputMode="decimal"
                        aria-label={`Valor total de ${item.name}`}
                        value={
                          hasValueOverride(item.id)
                            ? fundValues[item.id]
                            : value.toFixed(2)
                        }
                        onChange={(event) =>
                          setFundValues({
                            ...fundValues,
                            [item.id]: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="number">
                      {total ? percent.format(value / total) : "—"}
                    </td>
                    <td>
                      <QuoteStatus
                        preview={state.previews[item.id]}
                        saved={Boolean(item.quoted_at)}
                        manual={Boolean(state.manual[item.id])}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-total">
          <span>Total Liberty</span>
          <strong>{euro.format(total)}</strong>
        </div>
      </section>
      <HistoryPanel category="liberty" title="Evolución Liberty" />
      {editing && (
        <InstrumentEditor
          items={state.items}
          onClose={() => setEditing(false)}
          onSaved={state.load}
        />
      )}
    </>
  );
}

const savingsDefaultLabels: Record<SavingsEntry["bucket"], string> = {
  cash: "Cuenta corriente / Sabadell / Renault / Mintos",
  deposit: "Depósito Facto / Trade",
  funds: "Fondos / ETF",
  indexed: "Cartera indexada",
};
const savingsBuckets = ["cash", "deposit", "funds", "indexed"] as const;
function Savings({
  period,
  onRefresh,
}: {
  period: Period;
  onRefresh: () => Promise<void>;
}) {
  const [entries, setEntries] = useState<SavingsEntry[]>([]);
  const [funds, setFunds] = useState<SavingsFundTransaction[]>([]);
  const [settings, setSettings] = useState<SavingsSetting[]>([]);
  const [savingsFunds, setSavingsFunds] = useState<SavingsFund[]>([]);
  const [editing, setEditing] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [newFund, setNewFund] = useState({
    name: "",
    isin: "",
    ticker: "",
    currency: "EUR",
  });
  const [movement, setMovement] = useState({
    fundId: "",
    tradeDate: new Date().toISOString().slice(0, 10),
    units: "",
    amount: "",
  });
  const [current, setCurrent] = useState<
    Record<string, { contribution: string; value: string; interest: string }>
  >({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const data = await api<{
      entries: SavingsEntry[];
      fundTransactions: SavingsFundTransaction[];
      settings: SavingsSetting[];
      savingsFunds: SavingsFund[];
    }>(`/api/savings?periodId=${period.id}`);
    setEntries(data.entries);
    setFunds(data.fundTransactions);
    setSettings(data.settings);
    setSavingsFunds(data.savingsFunds);
    const selected = data.entries.filter(
      (entry) => entry.period_id === period.id,
    );
    setCurrent(
      Object.fromEntries(
        savingsBuckets.map((bucket) => {
          const entry = selected.find((item) => item.bucket === bucket);
          return [
            bucket,
            {
              contribution: fromCents(entry?.contribution_cents),
              value: fromCents(entry?.current_value_cents),
              interest: fromCents(entry?.interest_cents),
            },
          ];
        }),
      ),
    );
  }, [period.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = (
    bucket: string,
    field: "contribution" | "value" | "interest",
    value: string,
  ) =>
    setCurrent({
      ...current,
      [bucket]: {
        ...(current[bucket] || {
          contribution: "0",
          value: "0",
          interest: "0",
        }),
        [field]: value,
      },
    });
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api(`/api/periods/${period.id}/savings`, {
        method: "PUT",
        body: JSON.stringify({
          entries: savingsBuckets.map((bucket) => ({
            bucket,
            contributionCents: toCents(current[bucket]?.contribution || "0"),
            currentValueCents: toCents(current[bucket]?.value || "0"),
            interestCents: toCents(current[bucket]?.interest || "0"),
          })),
        }),
      });
      await Promise.all([load(), onRefresh()]);
      setMessage("Detalle de ahorro guardado.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };
  const total = savingsBuckets.reduce(
    (sum, bucket) => sum + toCents(current[bucket]?.value || "0"),
    0,
  );
  const contribution = savingsBuckets.reduce(
    (sum, bucket) => sum + toCents(current[bucket]?.contribution || "0"),
    0,
  );
  const months = [...new Set(entries.map((entry) => entry.month))].reverse();
  const labels = Object.fromEntries(
    savingsBuckets.map((bucket) => [
      bucket,
      settings.find((item) => item.bucket === bucket)?.label ||
        savingsDefaultLabels[bucket],
    ]),
  ) as Record<SavingsEntry["bucket"], string>;
  const updateLabel = (bucket: SavingsEntry["bucket"], label: string) =>
    setSettings([
      ...settings.filter((item) => item.bucket !== bucket),
      { bucket, label },
    ]);
  const saveSettings = async () => {
    await Promise.all([
      api("/api/savings/settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: savingsBuckets.map((bucket) => ({
            bucket,
            label: labels[bucket],
          })),
        }),
      }),
      ...savingsFunds.map((fund) =>
        api(`/api/savings/funds/${fund.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: fund.name,
            isin: fund.isin || null,
            ticker: fund.ticker || null,
            currency: fund.currency,
          }),
        }),
      ),
    ]);
    setEditing(false);
    await load();
  };
  const addFund = async (event: FormEvent) => {
    event.preventDefault();
    await api("/api/savings/funds", {
      method: "POST",
      body: JSON.stringify(newFund),
    });
    setNewFund({ name: "", isin: "", ticker: "", currency: "EUR" });
    await load();
  };
  const addFundMovement = async (event: FormEvent) => {
    event.preventDefault();
    await api("/api/savings/fund-transactions", {
      method: "POST",
      body: JSON.stringify({
        fundId: Number(movement.fundId),
        tradeDate: movement.tradeDate,
        units: Number(movement.units.replace(",", ".")),
        amount: Number(movement.amount.replace(",", ".")),
      }),
    });
    setMovement({ ...movement, units: "", amount: "" });
    setShowMovement(false);
    await load();
  };
  return (
    <>
      <section className="detail-hero">
        <div>
          <p className="eyebrow">{labelMonth(period.month)}</p>
          <h2>{cents(total)}</h2>
          <p>Ahorro total del mes</p>
        </div>
        <div className="action-row">
          <button className="button secondary" onClick={() => setEditing(true)}>
            ✎ Configurar
          </button>
          <button
            className="button secondary"
            onClick={() => setShowMovement((value) => !value)}
          >
            + Movimiento de fondo
          </button>
          <button className="button primary" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar ahorro"}
          </button>
        </div>
      </section>
      {message && <div className="inline-message">{message}</div>}
      {showMovement && (
        <form className="panel movement-form" onSubmit={addFundMovement}>
          <div>
            <p className="eyebrow">Fondos / ETF</p>
            <h3>Nuevo movimiento</h3>
          </div>
          <label>
            Fondo
            <select
              required
              value={movement.fundId}
              onChange={(event) =>
                setMovement({ ...movement, fundId: event.target.value })
              }
            >
              <option value="">Seleccionar</option>
              {savingsFunds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha
            <input
              required
              type="date"
              value={movement.tradeDate}
              onChange={(event) =>
                setMovement({ ...movement, tradeDate: event.target.value })
              }
            />
          </label>
          <label>
            Participaciones
            <input
              required
              inputMode="decimal"
              value={movement.units}
              onChange={(event) =>
                setMovement({ ...movement, units: event.target.value })
              }
            />
          </label>
          <label>
            Importe EUR
            <input
              required
              inputMode="decimal"
              value={movement.amount}
              onChange={(event) =>
                setMovement({ ...movement, amount: event.target.value })
              }
            />
          </label>
          <button className="button primary">Guardar movimiento</button>
        </form>
      )}
      <section className="metric-grid savings-editor">
        {savingsBuckets.map((bucket) => (
          <article className="panel savings-card" key={bucket}>
            <p className="eyebrow">{labels[bucket]}</p>
            <label>
              Aportación del mes
              <input
                value={current[bucket]?.contribution || "0.00"}
                onChange={(event) =>
                  update(bucket, "contribution", event.target.value)
                }
              />
            </label>
            <label>
              Valor actual
              <input
                value={current[bucket]?.value || "0.00"}
                onChange={(event) =>
                  update(bucket, "value", event.target.value)
                }
              />
            </label>
            {bucket === "deposit" && (
              <label>
                Interés del mes
                <input
                  value={current[bucket]?.interest || "0.00"}
                  onChange={(event) =>
                    update(bucket, "interest", event.target.value)
                  }
                />
              </label>
            )}
          </article>
        ))}
      </section>
      <section className="metric-grid">
        <Metric label="Aportación del mes" value={contribution} tone="blue" />
        <Metric label="Valor actual" value={total} tone="green" />
        <Metric
          label="Diferencia del mes"
          value={entries
            .filter((entry) => entry.period_id === period.id)
            .reduce((sum, entry) => sum + entry.month_difference_cents, 0)}
          tone="gold"
        />
      </section>
      <section className="panel table-panel savings-history">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Como en Detalle Ahorro</p>
            <h3>Evolución completa por bloques</h3>
          </div>
          <span>{months.length} meses</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                {savingsBuckets.map((bucket) => (
                  <th className="number" key={`${bucket}-c`}>
                    {labels[bucket]} · Aport.
                  </th>
                ))}
                {savingsBuckets.map((bucket) => (
                  <th className="number" key={`${bucket}-v`}>
                    {labels[bucket]} · Actual
                  </th>
                ))}
                <th className="number">Total actual</th>
                <th className="number">Diferencia mes</th>
                <th className="number">Dif. aportaciones</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => {
                const rows = entries.filter((entry) => entry.month === month);
                const value = rows.reduce(
                  (sum, entry) => sum + entry.current_value_cents,
                  0,
                );
                const diff = rows.reduce(
                  (sum, entry) => sum + entry.month_difference_cents,
                  0,
                );
                const gain = rows.reduce(
                  (sum, entry) =>
                    sum +
                    (entry.bucket === "deposit"
                      ? entry.cumulative_interest_cents
                      : entry.current_value_cents -
                        entry.cumulative_contribution_cents),
                  0,
                );
                return (
                  <tr key={month}>
                    <td>
                      <strong>{labelMonth(month)}</strong>
                    </td>
                    {savingsBuckets.map((bucket) => (
                      <td className="number" key={`${month}-${bucket}-c`}>
                        {cents(
                          rows.find((entry) => entry.bucket === bucket)
                            ?.contribution_cents,
                        )}
                      </td>
                    ))}
                    {savingsBuckets.map((bucket) => (
                      <td className="number" key={`${month}-${bucket}-v`}>
                        {cents(
                          rows.find((entry) => entry.bucket === bucket)
                            ?.current_value_cents,
                        )}
                      </td>
                    ))}
                    <td className="number">
                      <strong>{cents(value)}</strong>
                    </td>
                    <td
                      className={`number ${diff >= 0 ? "positive" : "negative"}`}
                    >
                      {cents(diff)}
                    </td>
                    <td
                      className={`number ${gain >= 0 ? "positive" : "negative"}`}
                    >
                      {cents(gain)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Fondos / ETF</p>
            <h3>Movimientos importados</h3>
          </div>
          <span>{funds.length} operaciones</span>
        </div>
        <div className="table-scroll ledger-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Fondo</th>
                <th className="number">Participaciones</th>
                <th className="number">Importe</th>
                <th className="number">Precio participación</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((item) => (
                <tr key={item.id}>
                  <td>
                    {new Intl.DateTimeFormat("es-ES").format(
                      new Date(`${item.trade_date}T12:00:00`),
                    )}
                  </td>
                  <td>
                    <strong>{item.fund_name}</strong>
                  </td>
                  <td className="number">{decimal.format(item.units)}</td>
                  <td
                    className={`number ${item.amount_cents < 0 ? "negative" : ""}`}
                  >
                    {cents(item.amount_cents)}
                  </td>
                  <td className="number">
                    {euro.format(item.price_minor / item.price_scale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(false)}>
          <section
            className="modal-card savings-config-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Configuración</p>
                <h2>Tarjetas y fondos de Ahorro</h2>
              </div>
              <button className="icon-button" onClick={() => setEditing(false)}>
                ×
              </button>
            </div>
            <div className="config-section">
              <h3>Nombres de tarjetas y columnas</h3>
              <div className="settings-grid">
                {savingsBuckets.map((bucket) => (
                  <label key={bucket}>
                    {bucket}
                    <input
                      value={labels[bucket]}
                      onChange={(event) => updateLabel(bucket, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="config-section">
              <h3>Fondos configurados</h3>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Nombre</th><th>ISIN</th><th>Ticker</th><th>Divisa</th></tr></thead>
                  <tbody>
                    {savingsFunds.map((fund) => (
                      <tr key={fund.id}>
                        <td><input value={fund.name} onChange={(event) => setSavingsFunds(savingsFunds.map((item) => item.id === fund.id ? { ...item, name: event.target.value } : item))} /></td>
                        <td><input value={fund.isin || ""} onChange={(event) => setSavingsFunds(savingsFunds.map((item) => item.id === fund.id ? { ...item, isin: event.target.value.toUpperCase() } : item))} /></td>
                        <td><input value={fund.ticker || ""} onChange={(event) => setSavingsFunds(savingsFunds.map((item) => item.id === fund.id ? { ...item, ticker: event.target.value } : item))} /></td>
                        <td><input className="currency-field" value={fund.currency} onChange={(event) => setSavingsFunds(savingsFunds.map((item) => item.id === fund.id ? { ...item, currency: event.target.value.toUpperCase() } : item))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <form className="fund-add-row" onSubmit={addFund}>
              <input required placeholder="Nuevo fondo" value={newFund.name} onChange={(event) => setNewFund({ ...newFund, name: event.target.value })} />
              <input placeholder="ISIN" value={newFund.isin} onChange={(event) => setNewFund({ ...newFund, isin: event.target.value.toUpperCase() })} />
              <input placeholder="Ticker" value={newFund.ticker} onChange={(event) => setNewFund({ ...newFund, ticker: event.target.value })} />
              <button className="button secondary">Añadir fondo</button>
            </form>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setEditing(false)}>Cancelar</button>
              <button className="button primary" onClick={saveSettings}>Guardar configuración</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Pension({
  period,
  onRefresh,
}: {
  period: Period;
  onRefresh: () => Promise<void>;
}) {
  const empty: PensionEntry = {
    employer_cents: 0,
    personal_cents: 0,
    current_value_cents: 0,
    cumulative_contributions_cents: 0,
  };
  const [entry, setEntry] = useState<PensionEntry>(empty);
  const [history, setHistory] = useState<PensionHistory[]>([]);
  const [form, setForm] = useState({
    employer: "0.00",
    personal: "0.00",
    current: "0.00",
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    Promise.all([
      api<{ pension: PensionEntry | null }>(
        `/api/portfolio/pension?periodId=${period.id}`,
      ),
      api<{ history: PensionHistory[] }>(
        `/api/pension/details?periodId=${period.id}`,
      ),
    ]).then(([{ pension }, details]) => {
        const value = pension || empty;
        setEntry(value);
        setHistory(details.history);
        setForm({
          employer: fromCents(value.employer_cents),
          personal: fromCents(value.personal_cents),
          current: fromCents(value.current_value_cents),
        });
      });
  }, [period.id]);
  const expected =
    entry.cumulative_contributions_cents -
    entry.employer_cents -
    entry.personal_cents +
    toCents(form.employer) +
    toCents(form.personal);
  const current = toCents(form.current);
  const benefit = current - expected;
  const selectedHistory = history.at(-1);
  const employerCumulative =
    Number(selectedHistory?.cumulative_employer_cents || 0) -
    entry.employer_cents +
    toCents(form.employer);
  const personalCumulative =
    Number(selectedHistory?.cumulative_personal_cents || 0) -
    entry.personal_cents +
    toCents(form.personal);
  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/periods/${period.id}/pension`, {
        method: "PUT",
        body: JSON.stringify({
          employerCents: toCents(form.employer),
          personalCents: toCents(form.personal),
          currentValueCents: current,
        }),
      });
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <section className="detail-hero pension-hero">
        <div>
          <p className="eyebrow">Valor actual</p>
          <h2>{cents(current)}</h2>
          <p className={benefit >= 0 ? "positive" : "negative"}>
            {benefit >= 0 ? "+" : ""}
            {cents(benefit)} sobre aportaciones
          </p>
        </div>
        <button className="button primary" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar mes"}
        </button>
      </section>
      <section className="pension-grid">
        <div className="panel form-panel">
          <p className="eyebrow">Datos del mes</p>
          <h3>Aportaciones y valor</h3>
          <label>
            Aportación empresa
            <div className="suffix-input">
              <input
                value={form.employer}
                onChange={(e) => setForm({ ...form, employer: e.target.value })}
              />
              <span>€</span>
            </div>
          </label>
          <label>
            Aportación personal
            <div className="suffix-input">
              <input
                value={form.personal}
                onChange={(e) => setForm({ ...form, personal: e.target.value })}
              />
              <span>€</span>
            </div>
          </label>
          <label>
            Valor actual
            <div className="suffix-input">
              <input
                value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })}
              />
              <span>€</span>
            </div>
          </label>
        </div>
        <div className="panel pension-summary">
          <p className="eyebrow">Cálculo automático</p>
          <h3>Resultado acumulado</h3>
          <dl>
            <div>
              <dt>Aportaciones acumuladas</dt>
              <dd>{cents(expected)}</dd>
            </div>
            <div>
              <dt>Diferencia</dt>
              <dd className={benefit >= 0 ? "positive" : "negative"}>
                {cents(benefit)}
              </dd>
            </div>
            <div>
              <dt>Rentabilidad</dt>
              <dd>{expected ? percent.format(benefit / expected) : "—"}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="metric-grid pension-metrics">
        <Metric label="Aportado por la empresa" value={employerCumulative} tone="blue" />
        <Metric label="Aportado personalmente" value={personalCumulative} tone="violet" />
        <Metric label="Aportación este mes" value={toCents(form.employer) + toCents(form.personal)} tone="gold" />
        <Metric label="Ganancia acumulada" value={benefit} tone={benefit >= 0 ? "green" : "coral"} />
      </section>
      <section className="panel table-panel pension-history-table">
        <div className="panel-heading">
          <div><p className="eyebrow">Detalle mensual</p><h3>Histórico del fondo de pensiones</h3></div>
          <span>{history.length} meses</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Mes</th><th className="number">Empresa</th><th className="number">Personal</th><th className="number">Aportado acum.</th><th className="number">Valor</th><th className="number">Ganancia</th><th className="number">Rentabilidad</th><th className="number">Variación mes</th></tr></thead>
            <tbody>{[...history].reverse().map((item) => <tr key={item.period_id}><td><strong>{labelMonth(item.month)}</strong></td><td className="number">{cents(item.employer_cents)}</td><td className="number">{cents(item.personal_cents)}</td><td className="number">{cents(item.cumulative_contributions_cents)}</td><td className="number"><strong>{cents(item.current_value_cents)}</strong></td><td className={`number ${item.gain_cents >= 0 ? "positive" : "negative"}`}>{cents(item.gain_cents)}</td><td className={`number ${item.gain_cents >= 0 ? "positive" : "negative"}`}>{item.cumulative_contributions_cents ? percent.format(item.gain_cents / item.cumulative_contributions_cents) : "—"}</td><td className={`number ${item.month_change_cents >= 0 ? "positive" : "negative"}`}>{cents(item.month_change_cents)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <HistoryPanel
        category="pension"
        title="Evolución del fondo de pensiones"
      />
    </>
  );
}
function HistoryPanel({
  category,
  title,
}: {
  category: "liberty" | "pension" | "stocks";
  title: string;
}) {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  useEffect(() => {
    api<{ points: HistoryPoint[] }>(`/api/history/${category}`).then((data) =>
      setPoints(data.points),
    );
  }, [category]);
  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Histórico</p>
          <h3>{title}</h3>
        </div>
        <span>Todo el histórico · {points.length} meses</span>
      </div>
      <LineChart
        points={points}
        secondKey={category === "pension" ? "contributions_cents" : undefined}
      />
    </section>
  );
}

function StockBreakdown({
  items,
  overview,
}: {
  items: Instrument[];
  overview: StockOverview[];
}) {
  const currentData = items
    .map((item) => {
      const info = overview.find((entry) => entry.id === item.id);
      return {
        name: item.name,
        value: item.market_value_cents || 0,
        result: info?.result_cents || 0,
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const historicalData = overview
    .map((item) => ({
      name: item.name,
      result: Number(item.result_cents || 0),
      activity:
        Number(item.total_paid_cents || 0) +
        Number(item.total_withdrawn_cents || 0) +
        Number(item.total_dividends_cents || 0),
    }))
    .filter((item) => item.activity > 0)
    .sort((a, b) => Math.abs(b.result) - Math.abs(a.result));
  const maxValue = Math.max(...currentData.map((item) => item.value), 1);
  const maxResult = Math.max(
    ...historicalData.map((item) => Math.abs(item.result)),
    1,
  );
  return (
    <section className="two-column stock-charts">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Distribución</p>
            <h3>Peso por activo</h3>
          </div>
        </div>
        <div className="bar-chart">
          {currentData.map((item) => (
            <div className="bar-row" key={item.name}>
              <span>{item.name}</span>
              <i>
                <b style={{ width: `${(item.value / maxValue) * 100}%` }} />
              </i>
              <strong>{cents(item.value)}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Resultados</p>
            <h3>Ganancia / pérdida histórica por activo</h3>
          </div>
          <span>Incluye posiciones vendidas</span>
        </div>
        <div className="bar-chart result-bars">
          {historicalData.map((item) => (
            <div className="bar-row" key={item.name}>
              <span>{item.name}</span>
              <i>
                <b
                  className={item.result >= 0 ? "positive-bar" : "negative-bar"}
                  style={{
                    width: `${(Math.abs(item.result) / maxResult) * 100}%`,
                  }}
                />
              </i>
              <strong className={item.result >= 0 ? "positive" : "negative"}>
                {cents(item.result)}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stocks({
  period,
  onRefresh,
}: {
  period: Period;
  onRefresh: () => Promise<void>;
}) {
  const state = usePortfolio("stocks", period.id);
  const [overview, setOverview] = useState<StockOverview[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showDividend, setShowDividend] = useState(false);
  const [editing, setEditing] = useState(false);
  const [movement, setMovement] = useState({
    tradeDate: new Date().toISOString().slice(0, 10),
    instrumentId: "",
    kind: "A",
    units: "",
    price: "",
    broker: "",
  });
  const [dividend, setDividend] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    instrumentId: "",
    perShare: "",
    amount: "",
    currency: "EUR",
    fxToEur: "",
    note: "",
  });
  const loadDetail = useCallback(async () => {
    const [summary, ledger, income] = await Promise.all([
      api<{ items: StockOverview[] }>(
        `/api/stocks/overview?periodId=${period.id}`,
      ),
      api<{ transactions: StockTransaction[] }>(
        `/api/stocks/transactions?periodId=${period.id}`,
      ),
      api<{ dividends: Dividend[] }>(
        `/api/stocks/dividends?periodId=${period.id}`,
      ),
    ]);
    setOverview(summary.items);
    setTransactions(ledger.transactions);
    setDividends(income.dividends);
  }, [period.id]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  const locked =
    period.status === "closed" || state.items.some((item) => item.is_locked);
  const priceForStock = (item: Instrument) => {
    const saved = (item.price_eur_minor ?? 0) / 10000;
    if (locked) return saved;
    return quoteFor(item, state.previews, state.manual)?.priceEur ?? saved;
  };
  const total = state.items.reduce(
    (sum, item) =>
      sum + Number(item.units || 0) * priceForStock(item),
    0,
  );
  const save = async () => {
    if (locked)
      return state.setMessage(
        "Este cierre de Bolsa ya está guardado y permanece bloqueado.",
      );
    const positions = state.items.filter(
      (item) => Math.abs(Number(item.units || 0)) > 0.00000001,
    );
    const quoted = positions
      .map((item) => ({
        item,
        quote: quoteFor(item, state.previews, state.manual),
      }))
      .filter((row) => row.quote);
    if (quoted.length !== positions.length)
      return state.setMessage(
        "Consulta o introduce manualmente el precio unitario de todas las posiciones antes de guardar.",
      );
    state.setBusy(true);
    try {
      await api(`/api/periods/${period.id}/holdings`, {
        method: "PUT",
        body: JSON.stringify({
          category: "stocks",
          items: quoted.map(({ item, quote }) => ({
            instrumentId: item.id,
            units: Number(item.units || 0),
            averageCostCents: item.average_cost_cents ?? null,
            investedCents: item.invested_cents ?? null,
            withdrawnCents: item.withdrawn_cents ?? 0,
            price: quote!.price,
            priceCurrency: quote!.currency,
            fxToEur: quote!.fxToEur,
            priceEur: quote!.priceEur,
            quoteSource: quote!.source,
            quotedAt: quote!.quotedAt,
          })),
        }),
      });
      await Promise.all([state.load(), loadDetail(), onRefresh()]);
      state.setMessage("Cierre de Bolsa guardado y bloqueado.");
    } catch (cause) {
      state.setMessage(
        cause instanceof Error ? cause.message : "No se pudo guardar",
      );
    } finally {
      state.setBusy(false);
    }
  };
  const addMovement = async (event: FormEvent) => {
    event.preventDefault();
    await api("/api/stocks/transactions", {
      method: "POST",
      body: JSON.stringify({
        tradeDate: movement.tradeDate,
        instrumentId: Number(movement.instrumentId),
        kind: movement.kind,
        units: Number(movement.units.replace(",", ".")),
        price: Number(movement.price.replace(",", ".")),
        broker: movement.broker || null,
        currency: "EUR",
      }),
    });
    setMovement({ ...movement, units: "", price: "" });
    setShowForm(false);
    await loadDetail();
  };
  const addDividend = async (event: FormEvent) => {
    event.preventDefault();
    await api("/api/stocks/dividends", {
      method: "POST",
      body: JSON.stringify({
        paymentDate: dividend.paymentDate,
        instrumentId: Number(dividend.instrumentId),
        perShare: dividend.perShare
          ? Number(dividend.perShare.replace(",", "."))
          : undefined,
        amount: Number(dividend.amount.replace(",", ".")),
        currency: dividend.currency,
        fxToEur: dividend.fxToEur
          ? Number(dividend.fxToEur.replace(",", "."))
          : undefined,
        note: dividend.note || null,
      }),
    });
    setDividend({ ...dividend, perShare: "", amount: "", note: "" });
    setShowDividend(false);
    await loadDetail();
  };
  const byId = new Map(overview.map((item) => [item.id, item]));
  const paidTotal = overview.reduce(
    (sum, item) => sum + Number(item.total_paid_cents || 0),
    0,
  );
  const withdrawnTotal = overview.reduce(
    (sum, item) => sum + Number(item.total_withdrawn_cents || 0),
    0,
  );
  const dividendTotal = overview.reduce(
    (sum, item) => sum + Number(item.total_dividends_cents || 0),
    0,
  );
  const resultTotal =
    Math.round(total * 100) - paidTotal + withdrawnTotal + dividendTotal;
  const totalReturn = paidTotal ? resultTotal / Math.abs(paidTotal) : null;
  const dividendReturn = paidTotal ? dividendTotal / Math.abs(paidTotal) : null;
  const missing = Object.values(state.previews).filter((item) => item.error);
  return (
    <>
      <section className="detail-hero">
        <div>
          <p className="eyebrow">{labelMonth(period.month)}</p>
          <h2>{euro.format(total)}</h2>
          <p>
            {locked
              ? "Cierre guardado: la foto mensual no se sobrescribe"
              : "Valor estimado de la cartera"}
          </p>
        </div>
        <div className="action-row">
          <button className="button secondary" onClick={() => setEditing(true)}>
            ✎ Activos
          </button>
          <button
            className="button secondary"
            onClick={() => setShowForm((value) => !value)}
          >
            + Movimiento
          </button>
          <button
            className="button secondary"
            onClick={() => setShowDividend((value) => !value)}
          >
            + Dividendo
          </button>
          <button
            className="button secondary"
            onClick={state.preview}
            disabled={state.busy}
          >
            {state.busy ? "Consultando…" : "↻ Cotizaciones"}
          </button>
          <button
            className="button primary"
            onClick={save}
            disabled={state.busy || locked}
          >
            {locked ? "Cierre guardado" : "Guardar cierre"}
          </button>
        </div>
      </section>
      {state.message && <div className="inline-message">{state.message}</div>}
      {missing.length > 0 && (
        <div className="quote-warning">
          <strong>No se encontraron {missing.length} cotizaciones.</strong>{" "}
          Revisa el ISIN o ticker en “Activos”, o introduce el precio
          manualmente.
        </div>
      )}
      <section className="metric-grid stock-kpis">
        <Metric
          label="Valor de mercado"
          value={Math.round(total * 100)}
          tone="green"
        />
        <Metric label="Total pagado" value={paidTotal} tone="blue" />
        <Metric label="Total retirado" value={withdrawnTotal} tone="gold" />
        <Metric label="Dividendos" value={dividendTotal} tone="violet" />
        <Metric
          label="Resultado total"
          value={resultTotal}
          tone={resultTotal >= 0 ? "green" : "coral"}
        />
        <div className="metric violet">
          <span>Rentabilidad total</span>
          <strong>{totalReturn == null ? "—" : percent.format(totalReturn)}</strong>
          <small>Incluye dividendos</small>
        </div>
        <div className="metric gold">
          <span>Rentabilidad dividendos</span>
          <strong>
            {dividendReturn == null ? "—" : percent.format(dividendReturn)}
          </strong>
          <small>Dividendos / total pagado</small>
        </div>
      </section>
      <StockBreakdown items={state.items} overview={overview} />
      {showForm && (
        <form className="panel movement-form" onSubmit={addMovement}>
          <div>
            <p className="eyebrow">Libro de operaciones</p>
            <h3>Nuevo movimiento</h3>
          </div>
          <label>
            Fecha
            <input
              type="date"
              required
              value={movement.tradeDate}
              onChange={(event) =>
                setMovement({ ...movement, tradeDate: event.target.value })
              }
            />
          </label>
          <label>
            Activo
            <select
              required
              value={movement.instrumentId}
              onChange={(event) =>
                setMovement({ ...movement, instrumentId: event.target.value })
              }
            >
              <option value="">Seleccionar</option>
              {state.items.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select
              value={movement.kind}
              onChange={(event) =>
                setMovement({ ...movement, kind: event.target.value })
              }
            >
              <option value="A">A · Compra</option>
              <option value="D">D · Venta total</option>
              <option value="R">R · Reinversión</option>
              <option value="E">E · Retira para reinvertir</option>
            </select>
          </label>
          <label>
            Unidades
            <input
              required
              inputMode="decimal"
              value={movement.units}
              onChange={(event) =>
                setMovement({ ...movement, units: event.target.value })
              }
            />
          </label>
          <label>
            Precio
            <input
              required
              inputMode="decimal"
              value={movement.price}
              onChange={(event) =>
                setMovement({ ...movement, price: event.target.value })
              }
            />
          </label>
          <label>
            Broker
            <input
              value={movement.broker}
              onChange={(event) =>
                setMovement({ ...movement, broker: event.target.value })
              }
            />
          </label>
          <button className="button primary">Guardar movimiento</button>
        </form>
      )}
      {showDividend && (
        <form
          className="panel movement-form dividend-form"
          onSubmit={addDividend}
        >
          <div>
            <p className="eyebrow">Rendimientos</p>
            <h3>Nuevo dividendo</h3>
          </div>
          <label>
            Fecha
            <input
              type="date"
              required
              value={dividend.paymentDate}
              onChange={(event) =>
                setDividend({ ...dividend, paymentDate: event.target.value })
              }
            />
          </label>
          <label>
            Activo
            <select
              required
              value={dividend.instrumentId}
              onChange={(event) =>
                setDividend({ ...dividend, instrumentId: event.target.value })
              }
            >
              <option value="">Seleccionar</option>
              {state.items.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dividendo por acción
            <input
              inputMode="decimal"
              value={dividend.perShare}
              onChange={(event) =>
                setDividend({ ...dividend, perShare: event.target.value })
              }
            />
          </label>
          <label>
            Importe bruto
            <input
              required
              inputMode="decimal"
              value={dividend.amount}
              onChange={(event) =>
                setDividend({ ...dividend, amount: event.target.value })
              }
            />
          </label>
          <label>
            Divisa
            <input
              maxLength={3}
              value={dividend.currency}
              onChange={(event) =>
                setDividend({
                  ...dividend,
                  currency: event.target.value.toUpperCase(),
                })
              }
            />
          </label>
          <label>
            Cambio a EUR
            <input
              inputMode="decimal"
              placeholder="Automático"
              value={dividend.fxToEur}
              onChange={(event) =>
                setDividend({ ...dividend, fxToEur: event.target.value })
              }
            />
          </label>
          <label>
            Nota
            <input
              value={dividend.note}
              onChange={(event) =>
                setDividend({ ...dividend, note: event.target.value })
              }
            />
          </label>
          <button className="button primary">Guardar dividendo</button>
        </form>
      )}
      <section className="panel table-panel stocks-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Resultados</p>
            <h3>Detalle completo de la cartera</h3>
          </div>
          <span>Equivalente al bloque principal del Excel</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Activo</th>
                <th>Símbolo</th>
                <th className="number">Precio unitario</th>
                <th className="number">Unidades</th>
                <th className="number">Valor posición</th>
                <th className="number">Peso cartera</th>
                <th className="number">Invertido neto</th>
                <th className="number">Pagado</th>
                <th className="number">Retirado</th>
                <th className="number">Dividendos</th>
                <th className="number">Resultado</th>
                <th className="number">Variación</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((item, index) => {
                const info = byId.get(item.id);
                const quote = quoteFor(item, state.previews, state.manual);
                const livePrice = state.previews[item.id]?.quote?.priceEur;
                const price = priceForStock(item);
                const value = Number(item.units || 0) * price;
                const result =
                  value * 100 -
                  Number(info?.total_paid_cents || 0) +
                  Number(info?.total_withdrawn_cents || 0) +
                  Number(info?.total_dividends_cents || 0);
                const net = Number(info?.net_invested_cents || 0);
                return (
                  <tr
                    key={item.id}
                    className={
                      !item.units && !info?.total_paid_cents ? "muted-row" : ""
                    }
                  >
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.isin || item.currency}</small>
                    </td>
                    <td>{item.reference_symbol || item.ticker || "—"}</td>
                    <td className="number">
                      {price ? (
                        <>
                          <strong>{euro.format(price)}</strong>
                          {locked && livePrice != null && (
                            <small>Cotización actual: {euro.format(livePrice)}</small>
                          )}
                        </>
                      ) : (
                        <input
                          className="number-field"
                          placeholder="Precio"
                          value={state.manual[item.id] || ""}
                          onChange={(event) =>
                            state.setManual({
                              ...state.manual,
                              [item.id]: event.target.value,
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="number">
                      <input
                        className="number-field"
                        disabled={locked}
                        value={item.units ?? 0}
                        onChange={(event) =>
                          state.setItems(
                            state.items.map((entry, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...entry,
                                    units: Number(event.target.value),
                                  }
                                : entry,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="number">
                      <strong>{euro.format(value)}</strong>
                    </td>
                    <td className="number">
                      {total ? percent.format(value / total) : "—"}
                    </td>
                    <td className="number">{cents(net)}</td>
                    <td className="number">{cents(info?.total_paid_cents)}</td>
                    <td className="number">
                      {cents(info?.total_withdrawn_cents)}
                    </td>
                    <td className="number">
                      {cents(info?.total_dividends_cents)}
                    </td>
                    <td
                      className={`number ${result >= 0 ? "positive" : "negative"}`}
                    >
                      {cents(result)}
                    </td>
                    <td
                      className={`number ${result >= 0 ? "positive" : "negative"}`}
                    >
                      {net ? percent.format(result / Math.abs(net)) : "—"}
                    </td>
                    <td>
                      <QuoteStatus
                        preview={state.previews[item.id]}
                        saved={Boolean(item.quoted_at)}
                        manual={Boolean(state.manual[item.id])}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-total">
          <span>Total Bolsa</span>
          <strong>{euro.format(total)}</strong>
        </div>
      </section>
      <section className="panel table-panel ledger-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Histórico</p>
            <h3>Movimientos A / D / R / E</h3>
          </div>
          <span>
            {transactions.length} operaciones hasta {labelMonth(period.month)}
          </span>
        </div>
        <div className="type-legend">
          <span>
            <b>A</b> Compra
          </span>
          <span>
            <b>D</b> Venta total
          </span>
          <span>
            <b>R</b> Reinversión
          </span>
          <span>
            <b>E</b> Retira para reinvertir
          </span>
        </div>
        <div className="table-scroll ledger-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Activo</th>
                <th>Tipo</th>
                <th className="number">Unidades</th>
                <th className="number">Precio</th>
                <th className="number">Total</th>
                <th>Broker</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((item) => (
                <tr key={item.id}>
                  <td>
                    {new Intl.DateTimeFormat("es-ES").format(
                      new Date(`${item.trade_date}T12:00:00`),
                    )}
                  </td>
                  <td>
                    <strong>{item.instrument_name}</strong>
                  </td>
                  <td>
                    <span
                      className={`movement-kind kind-${item.kind.toLowerCase()}`}
                    >
                      {item.kind}
                    </span>
                  </td>
                  <td className="number">{decimal.format(item.units)}</td>
                  <td className="number">
                    {euro.format(item.price_minor / item.price_scale)}
                  </td>
                  <td
                    className={`number ${item.total_cents < 0 ? "negative" : ""}`}
                  >
                    {cents(item.total_cents)}
                  </td>
                  <td>{item.broker || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel table-panel dividend-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Rendimientos</p>
            <h3>Dividendos</h3>
          </div>
          <span>{cents(dividendTotal)} acumulados</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Activo</th>
                <th className="number">Por acción</th>
                <th className="number">Importe EUR</th>
                <th className="number">Invertido al pago</th>
                <th className="number">Rentabilidad</th>
                <th>Divisa / cambio</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {dividends.length ? (
                dividends.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {new Intl.DateTimeFormat("es-ES").format(
                        new Date(`${item.payment_date}T12:00:00`),
                      )}
                    </td>
                    <td>
                      <strong>{item.instrument_name}</strong>
                    </td>
                    <td className="number">
                      {item.per_share_minor != null && item.per_share_scale
                        ? `${decimal.format(item.per_share_minor / item.per_share_scale)} ${item.currency}`
                        : "—"}
                    </td>
                    <td className="number positive">
                      {cents(item.amount_eur_cents)}
                    </td>
                    <td className="number">
                      {item.invested_at_payment_cents
                        ? cents(item.invested_at_payment_cents)
                        : "—"}
                    </td>
                    <td className="number positive">
                      {item.invested_at_payment_cents
                        ? percent.format(
                            item.amount_eur_cents /
                              Math.abs(item.invested_at_payment_cents),
                          )
                        : "—"}
                    </td>
                    <td>
                      {item.currency}
                      {item.currency !== "EUR"
                        ? ` · ${decimal.format(item.fx_to_eur)}`
                        : ""}
                    </td>
                    <td>{item.note || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="empty-table">
                    Añade el primer dividendo con el botón superior.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <HistoryPanel category="stocks" title="Evolución Bolsa" />
      {editing && (
        <InstrumentEditor
          items={state.items}
          onClose={() => setEditing(false)}
          onSaved={state.load}
        />
      )}
    </>
  );
}

function Markets() {
  const [items, setItems] = useState<MarketReference[]>([]);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<MarketReference[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    ticker: "",
    referenceSymbol: "",
    isin: "",
    currency: "EUR",
  });
  const load = useCallback(async () => {
    const data = await api<{ references: MarketReference[] }>("/api/markets");
    setItems(data.references);
    setDrafts(data.references.map((item) => ({ ...item })));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const refresh = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await api<{
        quotes: Array<{ referenceId: number; error?: string }>;
      }>("/api/markets/refresh", { method: "POST", body: "{}" });
      const failed = data.quotes.filter((quote) => quote.error);
      setMessage(
        failed.length
          ? `No se encontraron ${failed.length} cotizaciones. Revisa sus símbolos o ISIN en Editar referencias.`
          : "Cotizaciones de mercado actualizadas.",
      );
      await load();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "No se pudo actualizar",
      );
    } finally {
      setBusy(false);
    }
  };
  const updateDraft = (
    id: number,
    field: keyof MarketReference,
    value: string,
  ) =>
    setDrafts(
      drafts.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  const saveDrafts = async () => {
    setBusy(true);
    try {
      await Promise.all(
        drafts.map((item) =>
          api(`/api/markets/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: item.name,
              ticker: item.ticker || null,
              referenceSymbol: item.reference_symbol || null,
              isin: item.isin || null,
              currency: item.currency,
            }),
          }),
        ),
      );
      setEditing(false);
      await load();
    } finally {
      setBusy(false);
    }
  };
  const add = async (event: FormEvent) => {
    event.preventDefault();
    await api("/api/markets", {
      method: "POST",
      body: JSON.stringify(newItem),
    });
    setNewItem({
      name: "",
      ticker: "",
      referenceSymbol: "",
      isin: "",
      currency: "EUR",
    });
    await load();
  };
  return (
    <>
      <section className="detail-hero">
        <div>
          <p className="eyebrow">Referencias y valores vigilados</p>
          <h2>{items.length}</h2>
          <p>Índices, fondos y activos para tomar el pulso al mercado</p>
        </div>
        <div className="action-row">
          <button className="button secondary" onClick={() => setEditing(true)}>
            ✎ Editar referencias
          </button>
          <button className="button primary" onClick={refresh} disabled={busy}>
            ↻ Actualizar mercados
          </button>
        </div>
      </section>
      {message && (
        <div
          className={
            message.startsWith("No se") ? "quote-warning" : "inline-message"
          }
        >
          {message}
        </div>
      )}
      <section className="market-grid">
        {items.map((item) => {
          const price = (item.price_eur_minor ?? 0) / 10000;
          return (
            <article className="panel market-card" key={item.id}>
              <div>
                <p className="eyebrow">
                  {item.reference_symbol || item.ticker || "Referencia"}
                </p>
                <h3>{item.name}</h3>
                <small>
                  {item.isin || item.ticker || "Identificador pendiente"}
                </small>
              </div>
              <strong>
                {item.quoted_at
                  ? `${decimal.format(price)} €`
                  : "Sin cotización"}
              </strong>
              <span>
                {item.quoted_at
                  ? `Actualizado ${new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.quoted_at))}`
                  : "Edita el símbolo si no se encuentra"}
              </span>
            </article>
          );
        })}
      </section>
      <form className="panel market-add" onSubmit={add}>
        <div>
          <p className="eyebrow">Lista personal</p>
          <h3>Añadir valor de referencia</h3>
        </div>
        <input
          required
          placeholder="Nombre"
          value={newItem.name}
          onChange={(event) =>
            setNewItem({ ...newItem, name: event.target.value })
          }
        />
        <input
          placeholder="Ticker API"
          value={newItem.ticker}
          onChange={(event) =>
            setNewItem({ ...newItem, ticker: event.target.value })
          }
        />
        <input
          placeholder="Símbolo"
          value={newItem.referenceSymbol}
          onChange={(event) =>
            setNewItem({ ...newItem, referenceSymbol: event.target.value })
          }
        />
        <input
          placeholder="ISIN"
          value={newItem.isin}
          onChange={(event) =>
            setNewItem({ ...newItem, isin: event.target.value.toUpperCase() })
          }
        />
        <input
          className="currency-field"
          value={newItem.currency}
          onChange={(event) =>
            setNewItem({
              ...newItem,
              currency: event.target.value.toUpperCase(),
            })
          }
        />
        <button className="button primary">Añadir</button>
      </form>
      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(false)}>
          <section
            className="modal-card instrument-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>Editar referencias</h2>
              <button className="icon-button" onClick={() => setEditing(false)}>
                ×
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>ISIN</th>
                    <th>Ticker API</th>
                    <th>Símbolo</th>
                    <th>Divisa</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          value={item.name}
                          onChange={(event) =>
                            updateDraft(item.id, "name", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={item.isin || ""}
                          onChange={(event) =>
                            updateDraft(
                              item.id,
                              "isin",
                              event.target.value.toUpperCase(),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={item.ticker || ""}
                          onChange={(event) =>
                            updateDraft(item.id, "ticker", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={item.reference_symbol || ""}
                          onChange={(event) =>
                            updateDraft(
                              item.id,
                              "reference_symbol",
                              event.target.value,
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="currency-field"
                          value={item.currency}
                          onChange={(event) =>
                            updateDraft(
                              item.id,
                              "currency",
                              event.target.value.toUpperCase(),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </button>
              <button
                className="button primary"
                onClick={saveDrafts}
                disabled={busy}
              >
                Guardar cambios
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default App;
