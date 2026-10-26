import React, { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Send, Lock, Unlock, List } from "lucide-react";
import { supabase } from "./supabaseClient";
import { dbRead } from "./offline";

// Monthly budget ("Plaas Damas – Maandelikse Begroting"): shared expenses split evenly
// between contributors, petrol split only between those who share the bakkie.

const MONTHS_AF = ["Januarie", "Februarie", "Maart", "April", "Mei", "Junie", "Julie", "Augustus", "September", "Oktober", "November", "Desember"];
const CATEGORIES = ["Voer", "Veeartseny", "Lone & werkers", "Brandstof", "Onderhoud", "Dienste & admin", "Nutrition", "Ander"];
const QTYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 25, 30, 40, 50, 100];

const money = (v) => `N$ ${(Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const firstOfMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const shiftMonth = (iso, n) => { const [y, m] = iso.split("-").map(Number); return firstOfMonth(new Date(y, m - 1 + n, 1)); };
const monthLabel = (iso) => { const [y, m] = iso.split("-").map(Number); return `${MONTHS_AF[m - 1]} ${y}`; };
const lastDay = (iso) => { const [y, m] = iso.split("-").map(Number); const d = new Date(y, m, 0); return `${y}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export const lineCalc = (e) => (Number(e.qty) || 0) * (Number(e.unit_price) || 0);
export const lineAmount = (e) => (e.receipt_amount != null && e.receipt_amount !== "" ? Number(e.receipt_amount) : lineCalc(e));

export function computeBudget(expenses, contributors, petrolTotal) {
  const included = expenses.filter((e) => e.include);
  const parked = expenses.filter((e) => !e.include);
  const total = included.reduce((s, e) => s + lineAmount(e), 0);
  const parkedTotal = parked.reduce((s, e) => s + lineAmount(e), 0);
  const n = contributors.length;
  const base = n ? total / n : 0;
  const sharers = contributors.filter((c) => c.shares_petrol).length;
  const petrol = Number(petrolTotal) || 0;
  const petrolPer = sharers ? petrol / sharers : 0;
  const people = contributors.map((c) => {
    const p = c.shares_petrol ? petrolPer : 0;
    return { ...c, base, petrol: p, total: base + p };
  });
  const due = people.reduce((s, p) => s + p.total, 0);
  const paid = people.filter((p) => p.paid).reduce((s, p) => s + p.total, 0);
  const byCat = {};
  for (const e of included) { const c = e.category || "Ander"; byCat[c] = (byCat[c] || 0) + lineAmount(e); }
  return { total, parkedTotal, base, sharers, petrol, petrolPer, people, due, paid, outstanding: due - paid, surplus: due - total - petrol, byCat };
}

export default function Budget({ establishmentId, isAdmin }) {
  const [month, setMonth] = useState(firstOfMonth());
  const [row, setRow] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [contribs, setContribs] = useState([]);
  const [items, setItems] = useState([]);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editLine, setEditLine] = useState(null);   // expense being edited ({} = new)
  const [showPrices, setShowPrices] = useState(false);
  const [petrolDraft, setPetrolDraft] = useState("");

  useEffect(() => { loadLists(); }, [establishmentId]);
  useEffect(() => { loadMonth(); }, [establishmentId, month]);

  async function loadLists() {
    const [it, ow] = await Promise.all([
      dbRead(`budget_items:${establishmentId}`, () => supabase.from("budget_items").select("*").eq("establishment_id", establishmentId).order("sort").order("name")),
      dbRead(`budget_owners:${establishmentId}`, () => supabase.from("owners").select("id, full_name, nickname").eq("establishment_id", establishmentId).order("full_name")),
    ]);
    setItems((it && it.data) || []);
    setOwners((ow && ow.data) || []);
  }

  async function loadMonth() {
    setLoading(true);
    const m = await dbRead(`budget_month:${establishmentId}:${month}`, () =>
      supabase.from("budget_months").select("*").eq("establishment_id", establishmentId).eq("month", month).maybeSingle());
    const r = m && m.data;
    setRow(r || null);
    setPetrolDraft(r ? String(r.petrol_total ?? "") : "");
    if (r) {
      const [ex, co] = await Promise.all([
        dbRead(`budget_expenses:${r.id}`, () => supabase.from("budget_expenses").select("*").eq("month_id", r.id).order("sort").order("created_at")),
        dbRead(`budget_contribs:${r.id}`, () => supabase.from("budget_contributors").select("*").eq("month_id", r.id).order("sort")),
      ]);
      setExpenses((ex && ex.data) || []);
      setContribs((co && co.data) || []);
    } else { setExpenses([]); setContribs([]); }
    setLoading(false);
  }

  const ownerName = (id) => { const o = owners.find((x) => x.id === id); return o ? (o.nickname || o.full_name) : "?"; };
  const calc = useMemo(() => computeBudget(expenses, contribs, row ? row.petrol_total : 0), [expenses, contribs, row]);
  const locked = !isAdmin || (row && row.status === "final");

  async function must(p) { const { data, error } = await p; if (error) throw error; return data; }
  async function act(fn) {
    setBusy(true);
    try { await fn(); } catch (err) { alert("Could not save (this needs signal): " + (err.message || err)); }
    setBusy(false);
  }

  // Start a month: copy last month's lines (without receipts), contributors and petrol.
  function startMonth() {
    act(async () => {
      const prev = await must(supabase.from("budget_months").select("*").eq("establishment_id", establishmentId).lt("month", month).order("month", { ascending: false }).limit(1));
      const p = prev && prev[0];
      const created = await must(supabase.from("budget_months").insert({ establishment_id: establishmentId, month, petrol_total: p ? p.petrol_total : 0 }).select().single());
      if (p) {
        const [pe, pc] = await Promise.all([
          must(supabase.from("budget_expenses").select("*").eq("month_id", p.id)),
          must(supabase.from("budget_contributors").select("*").eq("month_id", p.id)),
        ]);
        if (pe.length) await must(supabase.from("budget_expenses").insert(pe.map((e) => ({
          establishment_id: establishmentId, month_id: created.id, item_id: e.item_id, item_name: e.item_name, category: e.category,
          qty: e.qty, unit_price: e.unit_price, include: e.include, note: e.note, sort: e.sort,
        }))));
        if (pc.length) await must(supabase.from("budget_contributors").insert(pc.map((c) => ({
          establishment_id: establishmentId, month_id: created.id, owner_id: c.owner_id, shares_petrol: c.shares_petrol, note: c.note, sort: c.sort,
        }))));
      } else {
        const people = owners.filter((o) => o.nickname);
        if (people.length) await must(supabase.from("budget_contributors").insert(people.map((o, i) => ({
          establishment_id: establishmentId, month_id: created.id, owner_id: o.id, sort: i,
        }))));
      }
      await loadMonth();
    });
  }

  function saveLine(form) {
    act(async () => {
      const rec = {
        item_id: form.item_id || null, item_name: form.item_name, category: form.category || "Ander",
        qty: Number(form.qty) || 0, unit_price: Number(form.unit_price) || 0, receipt_no: form.receipt_no || null,
        receipt_amount: form.receipt_amount === "" || form.receipt_amount == null ? null : Number(form.receipt_amount),
        include: !!form.include, note: form.note || null,
      };
      if (form.id) await must(supabase.from("budget_expenses").update(rec).eq("id", form.id));
      else await must(supabase.from("budget_expenses").insert({ ...rec, establishment_id: establishmentId, month_id: row.id, sort: expenses.length }));
      setEditLine(null);
      await loadMonth();
    });
  }

  function deleteLine(id) {
    if (!confirm("Delete this expense line?")) return;
    act(async () => { await must(supabase.from("budget_expenses").delete().eq("id", id)); setEditLine(null); await loadMonth(); });
  }

  function updateContrib(c, patch) {
    act(async () => {
      await must(supabase.from("budget_contributors").update(patch).eq("id", c.id));
      setContribs((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
    });
  }

  function addContrib(ownerId) {
    if (!ownerId) return;
    act(async () => {
      await must(supabase.from("budget_contributors").insert({ establishment_id: establishmentId, month_id: row.id, owner_id: ownerId, sort: contribs.length }));
      await loadMonth();
    });
  }

  function removeContrib(c) {
    if (!confirm(`Remove ${ownerName(c.owner_id)} from this month's contributions?`)) return;
    act(async () => { await must(supabase.from("budget_contributors").delete().eq("id", c.id)); await loadMonth(); });
  }

  function savePetrol() {
    const v = Number(petrolDraft) || 0;
    if (!row || v === Number(row.petrol_total)) return;
    act(async () => { await must(supabase.from("budget_months").update({ petrol_total: v }).eq("id", row.id)); setRow({ ...row, petrol_total: v }); });
  }

  const petrolDesc = () => `Begroting ${monthLabel(month)}: Petrol (bakkie)`;

  // Finalise: write the month's expenses into Finances, so the KPI costs pick them up.
  function finalise() {
    if (!confirm(`Finalise ${monthLabel(month)}? Its expenses (${money(calc.total + calc.petrol)}) will be added to Finances and the KPI costs. You can reopen it later.`)) return;
    act(async () => {
      const date = lastDay(month);
      for (const e of expenses.filter((x) => x.include && !x.transaction_id && lineAmount(x) > 0)) {
        const t = await must(supabase.from("transactions").insert({
          establishment_id: establishmentId, type: "expense", category: e.category || "Ander", amount: lineAmount(e), date,
          description: `Begroting ${monthLabel(month)}: ${e.item_name}${e.receipt_no ? ` (${e.receipt_no})` : ""}`,
        }).select("id").single());
        await must(supabase.from("budget_expenses").update({ transaction_id: t.id }).eq("id", e.id));
      }
      if (calc.petrol > 0) {
        await must(supabase.from("transactions").insert({ establishment_id: establishmentId, type: "expense", category: "Brandstof", amount: calc.petrol, date, description: petrolDesc() }));
      }
      await must(supabase.from("budget_months").update({ status: "final", finalized_at: new Date().toISOString() }).eq("id", row.id));
      await loadMonth();
    });
  }

  function reopen() {
    if (!confirm(`Reopen ${monthLabel(month)}? Its expenses are taken out of Finances until you finalise again.`)) return;
    act(async () => {
      const ids = expenses.map((e) => e.transaction_id).filter(Boolean);
      if (ids.length) {
        await must(supabase.from("budget_expenses").update({ transaction_id: null }).eq("month_id", row.id));
        await must(supabase.from("transactions").delete().in("id", ids));
      }
      await must(supabase.from("transactions").delete().eq("establishment_id", establishmentId).eq("description", petrolDesc()));
      await must(supabase.from("budget_months").update({ status: "open", finalized_at: null }).eq("id", row.id));
      await loadMonth();
    });
  }

  function shareWhatsApp() {
    const L = [];
    L.push(`*Plaas Damas – Begroting ${monthLabel(month)}*`, "");
    L.push(`*Uitgawes: ${money(calc.total)}*`);
    for (const e of expenses.filter((x) => x.include)) L.push(`• ${e.item_name}${Number(e.qty) !== 1 ? ` (${e.qty}x)` : ""}: ${money(lineAmount(e))}`);
    const parked = expenses.filter((x) => !x.include);
    if (parked.length) {
      L.push("", `_Geparkeer (nie ingesluit nie): ${money(calc.parkedTotal)}_`);
      for (const e of parked) L.push(`• ${e.item_name}${e.note ? ` – ${e.note}` : ""}`);
    }
    L.push("", `Petrol bakkie: ${money(calc.petrol)}${calc.sharers ? ` (÷ ${calc.sharers} = ${money(calc.petrolPer)} elk)` : ""}`);
    L.push(`Bydrae per persoon (sonder petrol): ${money(calc.base)}`, "", "*Bydraes:*");
    for (const p of calc.people) L.push(`${p.paid ? "✅" : "⏳"} ${ownerName(p.owner_id)}: ${money(p.total)}${p.paid ? " – betaal" : " – uitstaande"}`);
    L.push("", `Totaal: ${money(calc.due)} · Betaal: ${money(calc.paid)} · Uitstaande: ${money(calc.outstanding)}`);
    window.open(`https://wa.me/?text=${encodeURIComponent(L.join("\n"))}`, "_blank");
  }

  const card = { padding: 14, marginBottom: 12 };
  const rowGrid = (cols) => ({ display: "grid", gridTemplateColumns: cols, gap: 6, alignItems: "center" });

  return (
    <div className="container">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <button className="btn btn-secondary" style={{ padding: "6px 10px" }} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
        <div style={{ textAlign: "center" }}>
          <div className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>{monthLabel(month)}</div>
          {row && <div style={{ fontSize: 12, color: row.status === "final" ? "var(--green)" : "var(--gold)" }}>{row.status === "final" ? "Finalised" : "Open"}</div>}
        </div>
        <button className="btn btn-secondary" style={{ padding: "6px 10px" }} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>

      {loading ? <p style={{ color: "var(--ink-soft)" }}>Loading…</p> : !row ? (
        <div className="card" style={{ ...card, textAlign: "center" }}>
          <p style={{ marginBottom: 12 }}>No budget for {monthLabel(month)} yet.</p>
          {isAdmin && <button className="btn btn-primary" disabled={busy} onClick={startMonth}>Start {monthLabel(month)}</button>}
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>Copies last month's items, people and petrol. Receipts start empty.</p>
        </div>
      ) : (
        <>
          {/* 1. Expenses */}
          <div className="card" style={card}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div className="field-label">1. Expenses</div>
              {!locked && <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setEditLine({ include: true, qty: 1 })}><Plus size={14} /> Add</button>}
            </div>
            {expenses.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No expenses yet.</p>}
            {expenses.map((e) => (
              <div key={e.id} onClick={() => !locked && setEditLine({ ...e, receipt_amount: e.receipt_amount ?? "" })}
                style={{ ...rowGrid("1fr auto"), padding: "8px 0", borderBottom: "1px solid var(--line)", cursor: locked ? "default" : "pointer", opacity: e.include ? 1 : 0.55 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{e.item_name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {e.category} · {e.qty} × {money(e.unit_price)}
                    {e.receipt_amount != null && ` · receipt ${e.receipt_no || ""} ${money(e.receipt_amount)}`}
                    {!e.include && " · parked"}{e.note ? ` · ${e.note}` : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, textDecoration: e.include ? "none" : "line-through" }}>{money(lineAmount(e))}</div>
              </div>
            ))}
            <div className="row-between" style={{ paddingTop: 8, fontWeight: 700 }}><span>Total expenses</span><span>{money(calc.total)}</span></div>
            {calc.parkedTotal > 0 && <div className="row-between" style={{ fontSize: 12, color: "var(--ink-soft)" }}><span>Parked (not included)</span><span>{money(calc.parkedTotal)}</span></div>}
            <div className="row-between" style={{ fontSize: 13, marginTop: 6 }}><span>Split between {contribs.length} people</span><b>{money(calc.base)} each</b></div>
          </div>

          {/* 2. Petrol */}
          <div className="card" style={card}>
            <div className="field-label" style={{ marginBottom: 8 }}>2. Petrol for the bakkie</div>
            <div className="row-between">
              <span style={{ fontSize: 14 }}>Petrol total (N$)</span>
              <input className="input" type="number" inputMode="decimal" style={{ width: 110, textAlign: "right" }} disabled={locked}
                value={petrolDraft} onChange={(e) => setPetrolDraft(e.target.value)} onBlur={savePetrol} />
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>Shared by {calc.sharers} people · {money(calc.petrolPer)} each</div>
          </div>

          {/* 3. Contributions */}
          <div className="card" style={card}>
            <div className="field-label" style={{ marginBottom: 8 }}>3. Contribution per person</div>
            <div style={{ ...rowGrid("1.2fr 0.8fr 1fr 0.7fr"), fontSize: 11, color: "var(--ink-soft)", paddingBottom: 4, borderBottom: "1px solid var(--line)" }}>
              <span>Name</span><span style={{ textAlign: "center" }}>Petrol?</span><span style={{ textAlign: "right" }}>Total</span><span style={{ textAlign: "center" }}>Paid</span>
            </div>
            {calc.people.map((p) => (
              <div key={p.id} style={{ ...rowGrid("1.2fr 0.8fr 1fr 0.7fr"), padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 14 }}>
                <span onClick={() => !locked && removeContrib(p)} style={{ cursor: locked ? "default" : "pointer" }}>{ownerName(p.owner_id)}</span>
                <span style={{ textAlign: "center" }}>
                  <button disabled={locked || busy} onClick={() => updateContrib(p, { shares_petrol: !p.shares_petrol })}
                    style={{ border: "1px solid var(--line)", borderRadius: 99, padding: "2px 10px", fontSize: 12, background: p.shares_petrol ? "var(--green-soft)" : "var(--card)", color: "var(--ink)" }}>
                    {p.shares_petrol ? "Ja" : "Nee"}
                  </button>
                </span>
                <span style={{ textAlign: "right", fontWeight: 600 }}>{money(p.total)}</span>
                <span style={{ textAlign: "center" }}>
                  <input type="checkbox" checked={!!p.paid} disabled={!isAdmin || busy} style={{ width: 20, height: 20 }}
                    onChange={() => updateContrib(p, { paid: !p.paid, paid_date: !p.paid ? new Date().toISOString().slice(0, 10) : null })} />
                </span>
              </div>
            ))}
            {!locked && owners.some((o) => !contribs.some((c) => c.owner_id === o.id)) && (
              <select className="input" style={{ marginTop: 8 }} value="" onChange={(e) => addContrib(e.target.value)}>
                <option value="">+ Add a person…</option>
                {owners.filter((o) => !contribs.some((c) => c.owner_id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.nickname || o.full_name}</option>)}
              </select>
            )}
            <div className="row-between" style={{ paddingTop: 8, fontWeight: 700 }}><span>Total due</span><span>{money(calc.due)}</span></div>
            <div className="row-between" style={{ fontSize: 13 }}><span style={{ color: "var(--green)" }}>Paid</span><span>{money(calc.paid)}</span></div>
            <div className="row-between" style={{ fontSize: 13 }}><span style={{ color: calc.outstanding > 0.005 ? "var(--red)" : "var(--ink-soft)" }}>Outstanding</span><span>{money(calc.outstanding)}</span></div>
            {!locked && <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 6 }}>Tap a name to remove that person for this month.</p>}
          </div>

          {/* 4 & 5. Summary and categories */}
          <div className="card" style={card}>
            <div className="field-label" style={{ marginBottom: 8 }}>4. Summary</div>
            {[["Collected (without petrol)", calc.base * contribs.length], ["Collected (with petrol)", calc.due], ["Less: expenses", -calc.total], ["Less: petrol", -calc.petrol]].map(([k, v]) => (
              <div key={k} className="row-between" style={{ fontSize: 14, padding: "3px 0" }}><span>{k}</span><span>{money(v)}</span></div>
            ))}
            <div className="row-between" style={{ fontWeight: 700, paddingTop: 4, borderTop: "1px solid var(--line)" }}><span>Surplus / (shortfall)</span><span>{money(calc.surplus)}</span></div>
            <div className="field-label" style={{ margin: "14px 0 6px" }}>5. Per category</div>
            {CATEGORIES.filter((c) => calc.byCat[c]).map((c) => (
              <div key={c} className="row-between" style={{ fontSize: 14, padding: "3px 0" }}><span>{c}</span><span>{money(calc.byCat[c])}</span></div>
            ))}
          </div>

          <div className="stack" style={{ marginBottom: 24 }}>
            <button className="btn btn-primary" onClick={shareWhatsApp}><Send size={16} /> Send to WhatsApp</button>
            {isAdmin && (row.status === "final"
              ? <button className="btn btn-secondary" disabled={busy} onClick={reopen}><Unlock size={16} /> Reopen month</button>
              : <button className="btn btn-secondary" disabled={busy} onClick={finalise}><Lock size={16} /> Finalise month (adds costs to Finances)</button>)}
            {isAdmin && <button className="btn btn-secondary" onClick={() => setShowPrices(true)}><List size={16} /> Price list</button>}
          </div>
        </>
      )}

      {editLine && <LineModal line={editLine} items={items} busy={busy} onClose={() => setEditLine(null)} onSave={saveLine} onDelete={deleteLine} />}
      {showPrices && <PriceList establishmentId={establishmentId} items={items} onClose={() => setShowPrices(false)} onChanged={loadLists} />}
    </div>
  );
}

function LineModal({ line, items, busy, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ ...line, item_choice: line.item_id || (line.item_name ? "__other" : "") });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const byCat = CATEGORIES.map((c) => [c, items.filter((i) => i.category === c && i.active !== false)]).filter(([, l]) => l.length);
  const qtyOptions = QTYS.includes(Number(f.qty)) ? QTYS : [...QTYS, Number(f.qty)].sort((a, b) => a - b);

  function pickItem(id) {
    if (id === "__other") { setF((x) => ({ ...x, item_choice: id, item_id: null, item_name: "", category: "Ander", unit_price: "" })); return; }
    const it = items.find((i) => i.id === id);
    if (it) setF((x) => ({ ...x, item_choice: id, item_id: it.id, item_name: it.name, category: it.category, unit_price: it.unit_price ?? "" }));
  }

  const calc = (Number(f.qty) || 0) * (Number(f.unit_price) || 0);
  const ok = f.item_name && f.item_name.trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>{line.id ? "Edit expense" : "Add expense"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Item</span>
            <select className="input" value={f.item_choice} onChange={(e) => pickItem(e.target.value)}>
              <option value="">Choose an item…</option>
              {byCat.map(([c, list]) => <optgroup key={c} label={c}>{list.map((i) => <option key={i.id} value={i.id}>{i.name}{i.unit_price != null ? ` – N$ ${i.unit_price}` : ""}</option>)}</optgroup>)}
              <option value="__other">Other (type a name)…</option>
            </select>
          </div>
          {f.item_choice === "__other" && (
            <>
              <div className="field"><span className="field-label">Name</span><input className="input" value={f.item_name || ""} onChange={(e) => set("item_name", e.target.value)} /></div>
              <div className="field"><span className="field-label">Category</span>
                <select className="input" value={f.category || "Ander"} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="field"><span className="field-label">Quantity</span>
              <select className="input" value={f.qty} onChange={(e) => set("qty", e.target.value)}>{qtyOptions.map((q) => <option key={q} value={q}>{q}</option>)}</select>
            </div>
            <div className="field"><span className="field-label">Unit price (N$)</span>
              <input className="input" type="number" inputMode="decimal" value={f.unit_price ?? ""} onChange={(e) => set("unit_price", e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Calculated: <b style={{ color: "var(--ink)" }}>{money(calc)}</b></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="field"><span className="field-label">Receipt no.</span><input className="input" value={f.receipt_no || ""} onChange={(e) => set("receipt_no", e.target.value)} /></div>
            <div className="field"><span className="field-label">Receipt amount</span><input className="input" type="number" inputMode="decimal" placeholder="Overrides" value={f.receipt_amount ?? ""} onChange={(e) => set("receipt_amount", e.target.value)} /></div>
          </div>
          {f.receipt_amount !== "" && f.receipt_amount != null && Math.abs(Number(f.receipt_amount) - calc) > 0.005 && (
            <div style={{ fontSize: 12, color: "var(--gold)" }}>Difference vs calculated: {money(Number(f.receipt_amount) - calc)}</div>
          )}
          <div className="field"><span className="field-label">Include this month?</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`btn ${f.include ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1 }} onClick={() => set("include", true)}>Ja</button>
              <button className={`btn ${!f.include ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1 }} onClick={() => set("include", false)}>Nee (park)</button>
            </div>
          </div>
          <div className="field"><span className="field-label">Note</span><input className="input" placeholder="Geparkeer tot November" value={f.note || ""} onChange={(e) => set("note", e.target.value)} /></div>
          <button className="btn btn-primary" disabled={busy || !ok} onClick={() => onSave(f)}>{busy ? "Saving…" : "Save"}</button>
          {line.id && <button className="btn btn-secondary" style={{ color: "var(--red)" }} disabled={busy} onClick={() => onDelete(line.id)}>Delete line</button>}
        </div>
      </div>
    </div>
  );
}

function PriceList({ establishmentId, items, onClose, onChanged }) {
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const rec = { name: edit.name.trim(), category: edit.category || "Ander", unit: edit.unit || null, unit_price: edit.unit_price === "" || edit.unit_price == null ? null : Number(edit.unit_price) };
    const { error } = edit.id
      ? await supabase.from("budget_items").update(rec).eq("id", edit.id)
      : await supabase.from("budget_items").insert({ ...rec, establishment_id: establishmentId, sort: items.length });
    setBusy(false);
    if (error) { alert("Could not save (this needs signal): " + error.message); return; }
    setEdit(null);
    onChanged();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Price list</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        {edit ? (
          <div className="stack">
            <div className="field"><span className="field-label">Item</span><input className="input" value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="field"><span className="field-label">Category</span>
              <select className="input" value={edit.category || "Ander"} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="field"><span className="field-label">Unit</span><input className="input" placeholder="per sak" value={edit.unit || ""} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></div>
              <div className="field"><span className="field-label">Price (N$)</span><input className="input" type="number" inputMode="decimal" value={edit.unit_price ?? ""} onChange={(e) => setEdit({ ...edit, unit_price: e.target.value })} /></div>
            </div>
            <button className="btn btn-primary" disabled={busy || !(edit.name || "").trim()} onClick={save}>{busy ? "Saving…" : "Save"}</button>
            <button className="btn btn-secondary" onClick={() => setEdit(null)}>Back to list</button>
          </div>
        ) : (
          <>
            <button className="btn btn-secondary" style={{ width: "100%", marginBottom: 8 }} onClick={() => setEdit({ category: "Voer" })}><Plus size={14} /> New item</button>
            {CATEGORIES.map((c) => {
              const list = items.filter((i) => i.category === c);
              if (!list.length) return null;
              return (
                <div key={c} style={{ marginBottom: 10 }}>
                  <div className="field-label" style={{ marginBottom: 4 }}>{c}</div>
                  {list.map((i) => (
                    <div key={i.id} className="row-between" onClick={() => setEdit({ ...i, unit_price: i.unit_price ?? "" })} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 14, cursor: "pointer" }}>
                      <span>{i.name}<span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{i.unit ? ` · ${i.unit}` : ""}</span></span>
                      <span style={{ color: i.unit_price == null ? "var(--ink-soft)" : "var(--ink)" }}>{i.unit_price == null ? "no price" : money(i.unit_price)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
