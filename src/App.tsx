import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type View = "summary" | "liberty" | "pension" | "stocks";
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
  currency: string;
  units?: number | null;
  average_cost_cents?: number | null;
  invested_cents?: number | null;
  withdrawn_cents?: number | null;
  price_minor?: number | null;
  price_scale?: number | null;
  price_currency?: string | null;
  fx_to_eur?: number | null;
  price_eur_minor?: number | null;
  market_value_cents?: number | null;
  quote_source?: string | null;
  quoted_at?: string | null;
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

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const decimal = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 6 });
const monthFormat = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });
const cents = (value?: number | null) => euro.format((value ?? 0) / 100);
const toCents = (value: string) => Math.round((Number(value.replace(",", ".")) || 0) * 100);
const fromCents = (value?: number | null) => ((value ?? 0) / 100).toFixed(2);
const labelMonth = (month: string) => monthFormat.format(new Date(`${month.slice(0, 7)}-14T12:00:00`));

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string } & Record<string, unknown>;
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la operación");
  return payload as T;
}

function App() {
  const [auth, setAuth] = useState<{ loading: boolean; protected: boolean; authenticated: boolean }>({ loading: true, protected: false, authenticated: false });
  const [password, setPassword] = useState("");
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
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
      setAuth((current) => ({ ...current, authenticated: true }));
      await loadSummary();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  };

  if (auth.loading) return <Splash />;
  if (!auth.authenticated) return <Login password={password} setPassword={setPassword} onSubmit={login} busy={busy} error={error} />;

  const selected = periods.find((period) => period.id === selectedId) ?? null;
  const createNextMonth = async () => {
    const base = selected ? new Date(`${selected.month}T12:00:00`) : new Date();
    base.setMonth(base.getMonth() + (selected ? 1 : 0));
    base.setDate(14);
    setBusy(true);
    try {
      const result = await api<{ id: number }>("/api/periods", {
        method: "POST",
        body: JSON.stringify({ month: base.toISOString().slice(0, 10), copyPrevious: true }),
      });
      await loadSummary();
      setSelectedId(result.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el mes");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">C</span><div><strong>Cuentas</strong><small>y Ahorro</small></div></div>
        <nav>
          <NavItem active={view === "summary"} onClick={() => setView("summary")} icon="⌂">Resumen actual</NavItem>
          <NavItem active={view === "liberty"} onClick={() => setView("liberty")} icon="◇">Liberty</NavItem>
          <NavItem active={view === "pension"} onClick={() => setView("pension")} icon="◎">Fondo pensiones HPE</NavItem>
          <NavItem active={view === "stocks"} onClick={() => setView("stocks")} icon="↗">Bolsa</NavItem>
        </nav>
        <div className="sidebar-note"><span>Datos privados</span><small>Los cierres se guardan en D1</small></div>
      </aside>
      <main>
        <header className="topbar">
          <div><p className="eyebrow">Patrimonio personal</p><h1>{view === "summary" ? "Resumen actual" : view === "liberty" ? "Detalle Liberty" : view === "pension" ? "Fondo de pensiones HPE" : "Bolsa"}</h1></div>
          <div className="period-actions">
            <select value={selectedId ?? ""} onChange={(event) => setSelectedId(Number(event.target.value))}>
              {periods.map((period) => <option key={period.id} value={period.id}>{labelMonth(period.month)} · {period.status === "closed" ? "cerrado" : "borrador"}</option>)}
            </select>
            <button className="button secondary" onClick={createNextMonth} disabled={busy}>+ Nuevo mes</button>
          </div>
        </header>
        {error && <div className="alert" onClick={() => setError("")}>{error}<span>×</span></div>}
        {!selected ? <EmptyState onCreate={createNextMonth} /> : view === "summary" ? (
          <Summary period={selected} periods={periods} onRefresh={loadSummary} />
        ) : view === "pension" ? (
          <Pension period={selected} onRefresh={loadSummary} />
        ) : (
          <Portfolio category={view} period={selected} onRefresh={loadSummary} />
        )}
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: React.ReactNode }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span>{children}</button>;
}

function Splash() {
  return <div className="center-screen"><div className="loader" /><p>Preparando tus cuentas…</p></div>;
}

function Login({ password, setPassword, onSubmit, busy, error }: { password: string; setPassword: (value: string) => void; onSubmit: (event: FormEvent) => void; busy: boolean; error: string }) {
  return <div className="login-page"><div className="login-copy"><div className="brand light"><span className="brand-mark">C</span><div><strong>Cuentas</strong><small>y Ahorro</small></div></div><h1>Todo tu patrimonio,<br />sin perder el detalle.</h1><p>Cierres mensuales, cotizaciones y evolución histórica en un único lugar privado.</p></div><form className="login-card" onSubmit={onSubmit}><p className="eyebrow">Acceso privado</p><h2>Bienvenido de nuevo</h2><label>Contraseña<input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tu contraseña" /></label>{error && <p className="field-error">{error}</p>}<button className="button primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button></form></div>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <section className="empty"><span>＋</span><h2>Crea tu primer cierre mensual</h2><p>Será el punto de partida para las cuentas, Liberty, pensiones y bolsa.</p><button className="button primary" onClick={onCreate}>Crear mes actual</button></section>;
}

function Summary({ period, periods, onRefresh }: { period: Period; periods: Period[]; onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState({ current: fromCents(period.current_account_cents), savings: fromCents(period.savings_account_cents), pias: fromCents(period.pias_cents), notes: period.notes || "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm({ current: fromCents(period.current_account_cents), savings: fromCents(period.savings_account_cents), pias: fromCents(period.pias_cents), notes: period.notes || "" }), [period]);
  const previous = periods[periods.findIndex((item) => item.id === period.id) - 1];
  const change = (period.total_cents ?? 0) - (previous?.total_cents ?? period.total_cents ?? 0);
  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/periods/${period.id}/summary`, { method: "PATCH", body: JSON.stringify({ currentAccountCents: toCents(form.current), savingsAccountCents: toCents(form.savings), piasCents: toCents(form.pias), notes: form.notes || null }) });
      await onRefresh();
    } finally { setSaving(false); }
  };
  return <>
    <section className="hero-card"><div><p className="eyebrow">Patrimonio total · {labelMonth(period.month)}</p><h2>{cents(period.total_cents)}</h2><p className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{cents(change)} frente al mes anterior</p></div><div className="status-pill"><i className={period.status} />{period.status === "closed" ? "Cierre guardado" : "Borrador"}</div></section>
    <section className="metric-grid">
      <EditableMetric label="Cuenta corriente" value={form.current} onChange={(value) => setForm({ ...form, current: value })} tone="mint" />
      <EditableMetric label="Cuenta ahorro" value={form.savings} onChange={(value) => setForm({ ...form, savings: value })} tone="blue" />
      <EditableMetric label="PIAS / Aportaciones" value={form.pias} onChange={(value) => setForm({ ...form, pias: value })} tone="gold" />
      <Metric label="Liberty" value={period.liberty_cents} tone="violet" />
      <Metric label="Fondo pensiones HPE" value={period.pension_cents} tone="coral" />
      <Metric label="Bolsa" value={period.stocks_cents} tone="green" />
    </section>
    <section className="two-column"><div className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">Evolución</p><h3>Patrimonio total</h3></div><span>Últimos 18 meses</span></div><LineChart periods={periods.slice(-18)} /></div><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Este cierre</p><h3>Notas y contexto</h3></div></div><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Ej. paga extra, compra relevante o movimiento puntual…" /><button className="button primary full" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar resumen"}</button></div></section>
  </>;
}

function EditableMetric({ label, value, onChange, tone }: { label: string; value: string; onChange: (value: string) => void; tone: string }) {
  return <div className={`metric ${tone}`}><span>{label}</span><div className="money-input"><input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /><b>€</b></div><small>Dato manual</small></div>;
}
function Metric({ label, value, tone }: { label: string; value?: number | null; tone: string }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{cents(value)}</strong><small>Calculado desde el detalle</small></div>;
}

function LineChart({ periods }: { periods: Period[] }) {
  if (periods.length < 2) return <div className="chart-empty">La gráfica aparecerá al guardar varios meses.</div>;
  const values = periods.map((period) => period.total_cents ?? 0);
  const min = Math.min(...values) * 0.96;
  const max = Math.max(...values) * 1.04;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${88 - ((value - min) / Math.max(max - min, 1)) * 72}`).join(" ");
  const area = `0,92 ${points} 100,92`;
  return <div className="line-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#62c7a5" stopOpacity=".35" /><stop offset="1" stopColor="#62c7a5" stopOpacity="0" /></linearGradient></defs><polygon points={area} fill="url(#chartFill)" /><polyline points={points} fill="none" stroke="#218b6d" strokeWidth="2.2" vectorEffect="non-scaling-stroke" /></svg><div className="chart-labels"><span>{labelMonth(periods[0].month).replace(" de ", " ")}</span><span>{labelMonth(periods.at(-1)!.month).replace(" de ", " ")}</span></div></div>;
}

function Portfolio({ category, period, onRefresh }: { category: "liberty" | "stocks"; period: Period; onRefresh: () => Promise<void> }) {
  const [items, setItems] = useState<Instrument[]>([]);
  const [previews, setPreviews] = useState<Record<number, Preview>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const data = await api<{ instruments: Instrument[] }>(`/api/portfolio/${category}?periodId=${period.id}`);
    setItems(data.instruments.map((item) => ({ ...item, units: item.units ?? 0 })));
    setPreviews({});
  }, [category, period.id]);
  useEffect(() => { void load(); }, [load]);
  const preview = async () => {
    setBusy(true); setMessage("");
    try {
      const data = await api<{ quotes: Preview[] }>("/api/quotes/preview", { method: "POST", body: JSON.stringify({ periodId: period.id, category }) });
      setPreviews(Object.fromEntries(data.quotes.map((quote) => [quote.instrumentId, quote])));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "No se pudieron consultar las cotizaciones"); }
    finally { setBusy(false); }
  };
  const save = async () => {
    const quoted = items.filter((item) => previews[item.id]?.quote);
    if (!quoted.length) return setMessage("Consulta primero las cotizaciones disponibles.");
    setBusy(true); setMessage("");
    try {
      await api(`/api/periods/${period.id}/holdings`, { method: "PUT", body: JSON.stringify({ category, items: quoted.map((item) => { const quote = previews[item.id].quote!; return { instrumentId: item.id, units: Number(item.units || 0), averageCostCents: item.average_cost_cents ?? null, investedCents: item.invested_cents ?? null, withdrawnCents: item.withdrawn_cents ?? 0, price: quote.price, priceCurrency: quote.currency, fxToEur: quote.fxToEur, priceEur: quote.priceEur, quoteSource: quote.source, quotedAt: quote.quotedAt }; }) }) });
      await Promise.all([load(), onRefresh()]); setMessage("Cierre guardado con las cotizaciones mostradas.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "No se pudo guardar el cierre"); }
    finally { setBusy(false); }
  };
  const total = items.reduce((sum, item) => { const quote = previews[item.id]?.quote; return sum + Number(item.units || 0) * (quote?.priceEur ?? ((item.price_eur_minor ?? 0) / 10000)); }, 0);
  return <>
    <section className="detail-hero"><div><p className="eyebrow">{labelMonth(period.month)}</p><h2>{euro.format(total)}</h2><p>Valor estimado de la cartera</p></div><div className="action-row"><button className="button secondary" onClick={preview} disabled={busy}>{busy ? "Consultando…" : "↻ Consultar cotizaciones"}</button><button className="button primary" onClick={save} disabled={busy}>Guardar cierre</button></div></section>
    {message && <div className="inline-message">{message}</div>}
    <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Posiciones</p><h3>{category === "liberty" ? "Fondos Liberty" : "Cartera de valores"}</h3></div><span>Los identificadores se copian al crear el mes siguiente</span></div><div className="table-scroll"><table><thead><tr><th>Activo</th><th>ISIN / ticker</th><th className="number">Unidades</th><th className="number">Cotización</th><th className="number">Cambio</th><th className="number">Valor</th><th>Estado</th></tr></thead><tbody>{items.map((item, index) => { const previewItem = previews[item.id]; const priceEur = previewItem?.quote?.priceEur ?? ((item.price_eur_minor ?? 0) / 10000); return <tr key={item.id}><td><strong>{item.name}</strong><small>{item.currency}</small></td><td><div className="identifier"><input value={item.isin || item.ticker || ""} placeholder="Añadir ISIN o ticker" onChange={(event) => setItems(items.map((entry, itemIndex) => itemIndex === index ? { ...entry, isin: event.target.value } : entry))} /><button onClick={async () => { await api(`/api/instruments/${item.id}`, { method: "PATCH", body: JSON.stringify({ isin: item.isin || null, ticker: item.ticker || null }) }); setMessage("Identificador actualizado."); }}>✓</button></div></td><td className="number"><input className="number-field" value={item.units ?? 0} onChange={(event) => setItems(items.map((entry, itemIndex) => itemIndex === index ? { ...entry, units: Number(event.target.value) } : entry))} /></td><td className="number">{previewItem?.quote ? <><strong>{decimal.format(previewItem.quote.price)} {previewItem.quote.currency}</strong><small>{previewItem.quote.currency !== "EUR" ? `${euro.format(previewItem.quote.priceEur)} en euros` : ""}</small></> : item.price_eur_minor ? euro.format(item.price_eur_minor / 10000) : "—"}</td><td className="number">{previewItem?.quote && item.price_eur_minor ? <span className={previewItem.quote.priceEur >= item.price_eur_minor / 10000 ? "positive" : "negative"}>{((previewItem.quote.priceEur / (item.price_eur_minor / 10000) - 1) * 100).toFixed(2)}%</span> : "—"}</td><td className="number"><strong>{euro.format(Number(item.units || 0) * priceEur)}</strong></td><td>{previewItem?.error ? <span className="quote error">Manual</span> : previewItem?.quote ? <span className="quote live">En vivo</span> : item.quoted_at ? <span className="quote saved">Guardado</span> : <span className="quote">Pendiente</span>}</td></tr>; })}</tbody></table></div><div className="table-total"><span>Total cartera</span><strong>{euro.format(total)}</strong></div></section>
    <HistoryPanel title={category === "liberty" ? "Evolución Liberty" : "Evolución Bolsa"} />
  </>;
}

function Pension({ period, onRefresh }: { period: Period; onRefresh: () => Promise<void> }) {
  const [entry, setEntry] = useState<PensionEntry>({ employer_cents: 0, personal_cents: 0, current_value_cents: 0, cumulative_contributions_cents: 0 });
  const [form, setForm] = useState({ employer: "0.00", personal: "0.00", current: "0.00" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { api<{ pension: PensionEntry | null }>(`/api/portfolio/pension?periodId=${period.id}`).then(({ pension }) => { const value = pension || entry; setEntry(value); setForm({ employer: fromCents(value.employer_cents), personal: fromCents(value.personal_cents), current: fromCents(value.current_value_cents) }); }); }, [period.id]);
  const expected = entry.cumulative_contributions_cents - entry.employer_cents - entry.personal_cents + toCents(form.employer) + toCents(form.personal);
  const current = toCents(form.current);
  const benefit = current - expected;
  const save = async () => { setSaving(true); try { await api(`/api/periods/${period.id}/pension`, { method: "PUT", body: JSON.stringify({ employerCents: toCents(form.employer), personalCents: toCents(form.personal), currentValueCents: current }) }); await onRefresh(); } finally { setSaving(false); } };
  return <><section className="detail-hero pension-hero"><div><p className="eyebrow">Valor actual</p><h2>{cents(current)}</h2><p className={benefit >= 0 ? "positive" : "negative"}>{benefit >= 0 ? "+" : ""}{cents(benefit)} sobre aportaciones</p></div><button className="button primary" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar mes"}</button></section><section className="pension-grid"><div className="panel form-panel"><p className="eyebrow">Datos del mes</p><h3>Aportaciones y valor</h3><label>Aportación HPE<div className="suffix-input"><input value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} /><span>€</span></div></label><label>Aportación personal<div className="suffix-input"><input value={form.personal} onChange={(e) => setForm({ ...form, personal: e.target.value })} /><span>€</span></div></label><label>Valor actual<div className="suffix-input"><input value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /><span>€</span></div></label></div><div className="panel pension-summary"><p className="eyebrow">Cálculo automático</p><h3>Resultado acumulado</h3><dl><div><dt>Aportaciones acumuladas</dt><dd>{cents(expected)}</dd></div><div><dt>Diferencia</dt><dd className={benefit >= 0 ? "positive" : "negative"}>{cents(benefit)}</dd></div><div><dt>Rentabilidad</dt><dd>{expected ? `${((benefit / expected) * 100).toFixed(2)}%` : "—"}</dd></div></dl></div></section><HistoryPanel title="Evolución del fondo" /></>;
}

function HistoryPanel({ title }: { title: string }) {
  return <section className="panel compact-history"><div><p className="eyebrow">Histórico</p><h3>{title}</h3><p>La serie se alimenta de cada cierre mensual guardado.</p></div><span className="history-icon">⌁</span></section>;
}

export default App;
