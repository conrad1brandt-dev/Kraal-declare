import React, { useState, useEffect, useMemo, useRef } from "react";
import { ChevronLeft, Printer, RefreshCw, Plus, X, CheckCircle2, Unlock } from "lucide-react";
import { supabase } from "./supabaseClient";
import { dbRead, cacheGet, cacheSet } from "./offline";
import { SECTIONS, YN, PMG, computeAuto, periodRange, valueOf } from "./declarationSpec";
import { printDeclaration } from "./declarationPrint";

const PERIOD_TEXT = { jan_jun: "January to June", jul_dec: "July to December" };
const PAGE_NAMES = { 1: "Farm & herd", 2: "Records & losses", 3: "Health & feed", 4: "Vaccines & handling" };
const pendingKey = (id) => `decl_pending:${id}`;

// Loads every record the form can fill in by itself, for the declaration's half-year.
async function loadSources(decl) {
  const eid = decl.establishment_id;
  const { start, end } = periodRange(decl.period, decl.year);
  const today = new Date().toISOString().slice(0, 10);
  const asAt = end < today ? end : today;
  const q = (key, fn) => dbRead(`decl_src:${eid}:${decl.period}${decl.year}:${key}`, fn).then((r) => (r && r.data) || null).catch(() => null);
  const inPeriod = (t, sel = "*", dateCol = "date") => supabase.from(t).select(sel).eq("establishment_id", eid).gte(dateCol, start).lte(dateCol, end);
  const [establishment, owners, animals, predators, thefts, diseases, slaughters, ownUse, feed, healthEvents, vaccinations, medicines, grazingIn, grazingAny, months] = await Promise.all([
    q("est", () => supabase.from("establishments").select("*").eq("id", eid).maybeSingle()),
    q("owners", () => supabase.from("owners").select("id, full_name, brand_marks(stock_brand_code, status)").eq("establishment_id", eid)),
    q("animals", () => supabase.from("animals").select("species, breed_category, sex, dob, status").eq("establishment_id", eid).eq("status", "active")),
    q("pred", () => inPeriod("predator_losses")),
    q("theft", () => inPeriod("theft_losses")),
    q("dis", () => inPeriod("disease_records")),
    q("sl", () => inPeriod("slaughter_records", "purpose, date, animals(species)")),
    q("own", () => inPeriod("own_use_slaughter")),
    q("feed", () => inPeriod("feed_register")),
    q("he", () => inPeriod("health_events", "species, event_type, note, batch_no, date")),
    q("vac", () => inPeriod("vaccinations", "*", "date_given")),
    q("med", () => inPeriod("medicines_used", "*", "date_given")),
    q("gw", () => inPeriod("grazing_water_reports", "*", "report_date").order("report_date", { ascending: false }).limit(1)),
    q("gw_any", () => supabase.from("grazing_water_reports").select("*").eq("establishment_id", eid).lte("report_date", end).order("report_date", { ascending: false }).limit(1)),
    q("budget", () => supabase.from("budget_months").select("id, budget_expenses(item_name, category, include)").eq("establishment_id", eid).gte("month", start).lte("month", end)),
  ]);
  const budgetFeeds = [...new Set((months || []).flatMap((m) => m.budget_expenses || [])
    .filter((x) => x.include && (x.category === "Voer" || /salt|lek|lick/i.test(x.item_name)))
    .map((x) => x.item_name))];
  return {
    establishment, owners, animals, predators, thefts, diseases, slaughters, ownUse, feed, healthEvents, vaccinations, medicines,
    grazing: (grazingIn && grazingIn[0]) || (grazingAny && grazingAny[0]) || null, budgetFeeds, asAt,
  };
}

export default function DeclarationForm({ declaration, isAdmin, onBack }) {
  const [decl, setDecl] = useState(declaration);
  const [answers, setAnswers] = useState(() => {
    const pending = cacheGet(pendingKey(declaration.id));
    return pending || declaration.answers || {};
  });
  const [liveAuto, setLiveAuto] = useState(null);
  const [page, setPage] = useState(1);
  const [showGame, setShowGame] = useState(false);
  const [saveState, setSaveState] = useState(cacheGet(pendingKey(declaration.id)) ? "pending" : "saved");
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const latest = useRef(answers);

  const submitted = decl.status === "submitted";
  const locked = !isAdmin || submitted;
  const auto = submitted && decl.auto_snapshot ? decl.auto_snapshot : liveAuto;

  useEffect(() => { refresh(); }, [declaration.id]);
  useEffect(() => {
    const onOnline = () => { if (cacheGet(pendingKey(decl.id))) save(latest.current); };
    window.addEventListener("online", onOnline);
    if (cacheGet(pendingKey(decl.id)) && navigator.onLine) save(latest.current);
    return () => window.removeEventListener("online", onOnline);
  }, [decl.id]);

  async function refresh() {
    const src = await loadSources(decl);
    setLiveAuto(computeAuto(decl, src));
  }

  async function save(next) {
    setSaveState("saving");
    const { error } = await supabase.from("declarations").update({ answers: next, updated_at: new Date().toISOString() }).eq("id", decl.id);
    if (error) {
      cacheSet(pendingKey(decl.id), next);
      setSaveState("pending");
      return false;
    }
    if (latest.current === next) cacheSet(pendingKey(decl.id), null);
    setSaveState("saved");
    // keep the farm's own details for next time
    const est = {};
    if (next.q2_est_no !== undefined) est.establishment_no = next.q2_est_no || null;
    if (next.q2_district !== undefined) est.district = next.q2_district || null;
    if (next.q2_constituency !== undefined) est.constituency = next.q2_constituency || null;
    if (next.q2_postal !== undefined) est.postal_address = next.q2_postal || null;
    if (next.q2_system !== undefined) est.farming_system = next.q2_system || null;
    if (Object.keys(est).length) supabase.from("establishments").update(est).eq("id", decl.establishment_id).then(() => {});
    return true;
  }

  function change(updater) {
    const next = updater(latest.current);
    latest.current = next;
    setAnswers(next);
    cacheSet(pendingKey(decl.id), next);
    setSaveState("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(latest.current), 900);
  }
  const set = (id, v) => change((a) => ({ ...a, [id]: v }));
  const reset = (id) => change((a) => { const n = { ...a }; delete n[id]; return n; });
  const val = (id) => valueOf(answers, auto, id);

  // questions still without an answer, per page
  const open = useMemo(() => {
    const out = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const s of SECTIONS) for (const f of s.fields) {
      if (!["yn", "pmg", "choice"].includes(f.type)) continue;
      if (s.game) continue;
      const v = val(f.id);
      if (v === undefined || v === null || v === "") out[s.page]++;
    }
    return out;
  }, [answers, auto]);
  const totalOpen = Object.values(open).reduce((a, b) => a + b, 0);

  async function submit() {
    if (totalOpen > 0 && !confirm(`${totalOpen} question${totalOpen === 1 ? " is" : "s are"} still unanswered. The form asks that every question is completed (N/A where it doesn't apply). Mark as submitted anyway?`)) return;
    if (!val("s_name")) { alert("Fill in the name of the person who completed the declaration (bottom of page 4) first."); setPage(4); return; }
    setBusy(true);
    clearTimeout(timer.current);
    if (!(await save(latest.current))) { setBusy(false); alert("This needs signal. Try again when you're connected."); return; }
    const patch = { status: "submitted", auto_snapshot: liveAuto, signed_by: val("s_name") || null, signed_date: val("s_date") || new Date().toISOString().slice(0, 10) };
    const { error } = await supabase.from("declarations").update(patch).eq("id", decl.id);
    setBusy(false);
    if (error) { alert("Could not submit: " + error.message); return; }
    setDecl({ ...decl, ...patch });
  }

  async function reopen() {
    if (!confirm("Reopen this declaration for changes? The numbers will update from your records again.")) return;
    const patch = { status: "draft", auto_snapshot: null };
    const { error } = await supabase.from("declarations").update(patch).eq("id", decl.id);
    if (error) { alert("Could not reopen (this needs signal): " + error.message); return; }
    setDecl({ ...decl, ...patch });
    refresh();
  }

  if (!auto) return <div className="container"><p style={{ color: "var(--ink-soft)" }}>Pulling numbers from your records…</p></div>;

  const fp = { val, set, reset, answers, auto, locked };
  const sections = SECTIONS.filter((s) => s.page === page);
  const game = sections.filter((s) => s.game);

  return (
    <div className="container" style={{ paddingBottom: 40 }}>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--ink-soft)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          <ChevronLeft size={16} /> Back
        </button>
        <button onClick={() => printDeclaration(decl, answers, auto)} className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "6px 12px" }}>
          <Printer size={14} /> Print / PDF
        </button>
      </div>

      <h2 className="font-display" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Animal Health Declaration</h2>
      <div className="row-between" style={{ margin: "2px 0 10px" }}>
        <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{PERIOD_TEXT[decl.period]} {decl.year}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: submitted ? "var(--green)" : saveState === "saved" ? "var(--ink-soft)" : "#7A5A16" }}>
          {submitted ? `Submitted${decl.signed_date ? " " + decl.signed_date : ""}` : saveState === "saving" ? "Saving…" : saveState === "pending" ? "Saved on phone – uploads with signal" : "All changes saved"}
        </span>
      </div>

      <div style={{ background: "var(--green-soft)", borderRadius: 10, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
        <b style={{ color: "var(--green)" }}>From app</b> marks answers filled in from your records{submitted ? " (frozen when submitted)" : ""}. You can overwrite any of them.
        {!submitted && <button onClick={refresh} style={{ marginLeft: 6, background: "none", border: "none", color: "var(--green)", fontWeight: 600, fontSize: 12, cursor: "pointer", padding: 0 }}><RefreshCw size={11} /> Refresh</button>}
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {[1, 2, 3, 4].map((p) => (
          <button key={p} className={`tab ${page === p ? "active" : ""}`} onClick={() => setPage(p)} style={{ position: "relative" }}>
            {page === p ? `Page ${p}` : p}{open[p] > 0 && <span style={{ marginLeft: 4, fontSize: 10, background: "var(--gold-soft)", color: "#7A5A16", borderRadius: 99, padding: "1px 6px" }}>{open[p]}</span>}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "-4px 0 10px" }}>{PAGE_NAMES[page]}{open[page] ? ` · ${open[page]} unanswered` : " · all answered"}</p>

      <div className="stack">
        {sections.filter((s) => !s.game).map((s) => (
          <React.Fragment key={s.no}>
            {game.length > 0 && s.no === 15 && <GameBlock sections={game} show={showGame} setShow={setShowGame} fp={fp} />}
            <Section s={s} fp={fp} decl={decl} />
          </React.Fragment>
        ))}
      </div>

      <div className="stack" style={{ marginTop: 16 }}>
        <div className="row-between">
          <button className="btn btn-secondary" disabled={page === 1} onClick={() => { setPage(page - 1); window.scrollTo(0, 0); }}>‹ Page {page - 1 || 1}</button>
          <button className="btn btn-secondary" disabled={page === 4} onClick={() => { setPage(page + 1); window.scrollTo(0, 0); }}>Page {Math.min(page + 1, 4)} ›</button>
        </div>
        {isAdmin && page === 4 && (submitted
          ? <button className="btn btn-secondary" onClick={reopen}><Unlock size={16} /> Reopen for changes</button>
          : <button className="btn btn-primary" disabled={busy} onClick={submit}><CheckCircle2 size={16} /> {busy ? "Submitting…" : "Mark as submitted"}</button>)}
        {page === 4 && <button className="btn btn-secondary" onClick={() => printDeclaration(decl, answers, auto)}><Printer size={16} /> Print / Save as PDF</button>}
      </div>
    </div>
  );
}

function GameBlock({ sections, show, setShow, fp }) {
  return (
    <div className="card" style={{ padding: 14, borderStyle: "dashed" }}>
      <div className="row-between">
        <div>
          <div className="field-label">10 – 14. Game farming</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Not required – answered N/A</div>
        </div>
        <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
      </div>
      {show && <div className="stack" style={{ marginTop: 10 }}>{sections.map((s) => <Section key={s.no} s={s} fp={fp} />)}</div>}
    </div>
  );
}

function Section({ s, fp, decl }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.2, marginBottom: s.sub ? 2 : 8, lineHeight: 1.3 }}>
        {s.no ? `${s.no}. ` : ""}{s.title}
      </div>
      {s.sub && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>{s.sub}</div>}
      <div className="stack" style={{ gap: 10 }}>
        {s.fields.map((f) => <Field key={f.id} f={f} fp={fp} decl={decl} single={s.fields.length === 1} />)}
      </div>
    </div>
  );
}

function Origin({ id, fp }) {
  const { answers, auto, reset, locked } = fp;
  const a = answers[id], au = auto[id];
  if (au === undefined) return null;
  if (a === undefined) return <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green)", background: "var(--green-soft)", borderRadius: 99, padding: "1px 7px", marginLeft: 6, whiteSpace: "nowrap" }}>From app</span>;
  if (JSON.stringify(a) === JSON.stringify(au) || locked) return null;
  return <button onClick={() => reset(id)} style={{ fontSize: 10, fontWeight: 600, color: "#7A5A16", background: "var(--gold-soft)", border: "none", borderRadius: 99, padding: "1px 7px", marginLeft: 6, cursor: "pointer", whiteSpace: "nowrap" }}>Changed · use app value</button>;
}

function Pills({ options, value, onChange, disabled }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {options.map(([v, l]) => (
        <button key={v} disabled={disabled} onClick={() => onChange(value === v ? null : v)}
          style={{ fontSize: 12, padding: "5px 11px", borderRadius: 999, border: "1px solid var(--line)", background: value === v ? "var(--green)" : "var(--card, #fff)", color: value === v ? "#fff" : "var(--ink)", cursor: disabled ? "default" : "pointer" }}>{l}</button>
      ))}
    </div>
  );
}

const numIn = (v) => (v === "" || v === null || v === undefined ? "" : v);
const toNum = (s) => (s === "" ? null : Number(s));

function Field({ f, fp, decl, single }) {
  const { val, set, locked } = fp;
  const label = (id, text) => (
    <span className="field-label" style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>{text}<Origin id={id} fp={fp} /></span>
  );

  switch (f.type) {
    case "period":
      return <div style={{ fontSize: 14 }}><b>{PERIOD_TEXT[decl.period]}</b> · Year <b>{decl.year}</b></div>;

    case "yn":
    case "pmg": {
      const v = val(f.id);
      return (
        <div>
          {single
            ? <div style={{ marginBottom: 4 }}><Origin id={f.id} fp={fp} /></div>
            : <div style={{ fontSize: 13, marginBottom: 5, display: "flex", alignItems: "center", flexWrap: "wrap" }}>{f.label}<Origin id={f.id} fp={fp} /></div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Pills options={f.options || (f.type === "pmg" ? PMG : YN)} value={v} onChange={(x) => set(f.id, x)} disabled={locked} />
            {f.countId && !f.countLabel && (
              <input type="number" inputMode="numeric" className="input" placeholder="No." aria-label="Number" disabled={locked}
                style={{ width: 70, padding: "5px 8px", fontSize: 13 }} value={numIn(val(f.countId))} onChange={(e) => set(f.countId, toNum(e.target.value))} />
            )}
          </div>
          {f.countId && f.countLabel && (
            <div className="field" style={{ marginTop: 6, maxWidth: 160 }}>
              {label(f.countId, f.countLabel || "Number")}
              <input type="number" inputMode="numeric" className="input" disabled={locked} value={numIn(val(f.countId))} onChange={(e) => set(f.countId, toNum(e.target.value))} />
            </div>
          )}
          {f.specifyId && (v === "yes" || val(f.specifyId)) && (
            <div className="field" style={{ marginTop: 6 }}>
              {label(f.specifyId, "If yes, specify")}
              <input className="input" disabled={locked} value={val(f.specifyId) || ""} onChange={(e) => set(f.specifyId, e.target.value)} />
            </div>
          )}
        </div>
      );
    }

    case "num":
      return (
        <div className="field">{label(f.id, f.label)}
          <input type="number" inputMode="numeric" className="input" disabled={locked} value={numIn(val(f.id))} onChange={(e) => set(f.id, toNum(e.target.value))} />
        </div>
      );

    case "text":
      return (
        <div className="field">{label(f.id, f.label)}
          {f.multiline
            ? <textarea className="input" rows={f.rows || 2} disabled={locked} value={val(f.id) || ""} onChange={(e) => set(f.id, e.target.value)} style={{ resize: "vertical", fontFamily: "inherit" }} />
            : <input className="input" disabled={locked} value={val(f.id) ?? ""} onChange={(e) => set(f.id, e.target.value)} />}
        </div>
      );

    case "date":
      return (
        <div className="field">{label(f.id, f.label)}
          <input type="date" className="input" disabled={locked} value={val(f.id) || ""} onChange={(e) => set(f.id, e.target.value)} />
        </div>
      );

    case "numgrid":
      return (
        <div>
          {f.label && <div className="field-label" style={{ marginBottom: 6 }}>{f.label}</div>}
          <div className="grid-2" style={{ gap: 8 }}>
            {f.items.map(([id, l]) => (
              <div className="field" key={id}>{label(id, l)}
                <input type="number" inputMode="numeric" className="input" disabled={locked} value={numIn(val(id))} onChange={(e) => set(id, toNum(e.target.value))} />
              </div>
            ))}
          </div>
        </div>
      );

    case "multi": {
      const v = val(f.id) || [];
      return (
        <div>
          <div style={{ marginBottom: 4 }}><Origin id={f.id} fp={fp} /></div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {f.options.map(([k, l]) => {
              const on = v.includes(k);
              return <button key={k} disabled={locked} onClick={() => set(f.id, on ? v.filter((x) => x !== k) : [...v, k])}
                style={{ fontSize: 12, padding: "5px 11px", borderRadius: 999, border: "1px solid var(--line)", background: on ? "var(--blue, var(--green))" : "var(--card, #fff)", color: on ? "#fff" : "var(--ink)", cursor: locked ? "default" : "pointer" }}>{on ? "✓ " : ""}{l}</button>;
            })}
          </div>
        </div>
      );
    }

    case "choice": {
      const v = val(f.id);
      return (
        <div>
          <div style={{ fontSize: 13, marginBottom: 5, display: "flex", alignItems: "center", flexWrap: "wrap" }}>{f.label}<Origin id={f.id} fp={fp} /></div>
          <Pills options={f.options} value={v} onChange={(x) => set(f.id, x)} disabled={locked} />
          {f.otherId && v === "other" && (
            <input className="input" style={{ marginTop: 6 }} placeholder="Other – specify" disabled={locked} value={val(f.otherId) || ""} onChange={(e) => set(f.otherId, e.target.value)} />
          )}
        </div>
      );
    }

    case "table":
      return <TableField f={f} fp={fp} />;

    default:
      return null;
  }
}

function TableField({ f, fp }) {
  const { val, set, locked } = fp;
  const rows = val(f.id) || [];
  const update = (i, key, v) => set(f.id, rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const add = () => set(f.id, [...rows, {}]);
  const del = (i) => set(f.id, rows.filter((_, j) => j !== i));
  const template = f.cols.map((c) => `${c.w || 50}fr`).join(" ") + (locked ? "" : " 28px");
  return (
    <div>
      <div className="field-label" style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>{f.label || ""}<Origin id={f.id} fp={fp} /></div>
      <div style={{ display: "grid", gridTemplateColumns: template, gap: 4, fontSize: 11, color: "var(--ink-soft)", marginBottom: 2 }}>
        {f.cols.map((c) => <span key={c.key}>{c.label}</span>)}{!locked && <span />}
      </div>
      {rows.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: "4px 0" }}>None{locked ? "" : " – tap + Add if there was any"}</div>}
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: template, gap: 4, marginBottom: 4, alignItems: "center" }}>
          {f.cols.map((c) => (
            <input key={c.key} className="input" style={{ padding: "6px 8px", fontSize: 13, minWidth: 0 }} disabled={locked}
              type={c.type === "num" ? "number" : "text"} inputMode={c.type === "num" ? "numeric" : undefined}
              value={c.type === "num" ? numIn(r[c.key]) : r[c.key] || ""} onChange={(e) => update(i, c.key, c.type === "num" ? toNum(e.target.value) : e.target.value)} />
          ))}
          {!locked && <button onClick={() => del(i)} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer", padding: 0 }}><X size={16} /></button>}
        </div>
      ))}
      {!locked && <button onClick={add} style={{ background: "none", border: "none", color: "var(--green)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 0" }}><Plus size={12} /> Add</button>}
    </div>
  );
}
