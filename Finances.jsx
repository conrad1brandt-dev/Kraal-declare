import React, { useState, useEffect, useMemo } from "react";
import { Plus, X, ArrowUpCircle, ArrowDownCircle, Pencil, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { supabase } from "./supabaseClient";
import { dbRead, dbWrite } from "./offline";

const INCOME_CATEGORIES = ["Livestock sale", "Milk/produce", "Grant/subsidy", "Other income"];
const EXPENSE_CATEGORIES = ["Feed", "Veterinary", "Medication", "Labour", "Equipment", "Fuel/transport", "Fencing/infrastructure", "Other expense"];
const CAT_COLORS = ["#3D4B2E", "#B5822A", "#B5652E", "#6B6650", "#7A8B6B", "#D1AD5C", "#C4756A", "#9C8F6E"];
const fmt = (n) => `N$ ${Number(n).toLocaleString("en-NA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Finances({ establishmentId, owners, isAdmin }) {
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("list"); // "list" | "reports"

  useEffect(() => { load(); }, [establishmentId]);

  async function load() {
    setLoading(true);
    const { data } = await dbRead(`transactions:${establishmentId}`, () =>
      supabase.from("transactions").select("*, owners(full_name)").eq("establishment_id", establishmentId).order("date", { ascending: false })
    );
    setTxns(data || []);
    setLoading(false);
  }

  async function addTxn(form) {
    await dbWrite(
      () => supabase.from("transactions").insert({
        establishment_id: establishmentId, owner_id: form.owner_id || null, type: form.type,
        category: form.category, amount: parseFloat(form.amount), date: form.date, description: form.description || null,
      }),
      { key: "transactions:insert", payload: form }
    );
    setShowAdd(false);
    load();
  }

  async function updateTxn(id, form) {
    await supabase.from("transactions").update({
      owner_id: form.owner_id || null, type: form.type, category: form.category,
      amount: parseFloat(form.amount), date: form.date, description: form.description || null,
    }).eq("id", id);
    setEditing(null);
    load();
  }

  async function deleteTxn(id) {
    if (!confirm("Delete this transaction?")) return;
    await supabase.from("transactions").delete().eq("id", id);
    load();
  }

  const filtered = txns.filter((t) => filter === "all" || t.type === filter);
  const totals = useMemo(() => {
    const income = txns.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = txns.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense, net: income - expense };
  }, [txns]);

  if (loading) return <div className="container">Loading finances…</div>;

  return (
    <div className="container">
      <div className="grid-2" style={{ marginBottom: 10 }}>
        <div className="stat-card"><div className="stat-label">Income</div><div className="stat-value" style={{ color: "var(--green)" }}>{fmt(totals.income)}</div></div>
        <div className="stat-card"><div className="stat-label">Expenses</div><div className="stat-value" style={{ color: "var(--rust)" }}>{fmt(totals.expense)}</div></div>
      </div>
      <div className="stat-card" style={{ marginBottom: 16 }}>
        <div className="stat-label">Net</div>
        <div className="stat-value" style={{ color: totals.net >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(totals.net)}</div>
      </div>

      <div className="tabs">
        <button className={`tab ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>Transactions</button>
        <button className={`tab ${view === "reports" ? "active" : ""}`} onClick={() => setView("reports")}>Reports</button>
      </div>

      {view === "reports" ? (
        <FinanceReports txns={txns} />
      ) : (
        <>
          <div className="tabs">
            {["all", "income", "expense"].map((f) => (
              <button key={f} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "income" ? "Income" : "Expenses"}</button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 40, borderStyle: "dashed" }}>
              <p className="font-display" style={{ fontSize: 18, marginBottom: 4 }}>No transactions yet</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "hidden" }}>
              {filtered.map((t) => (
                <div key={t.id} className="list-row">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {t.type === "income" ? <ArrowUpCircle size={18} color="var(--green)" /> : <ArrowDownCircle size={18} color="var(--rust)" />}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{t.category}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t.date}{t.owners?.full_name ? ` · ${t.owners.full_name}` : ""}{t.description ? ` · ${t.description}` : ""}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="font-tag" style={{ fontSize: 14, fontWeight: 600, color: t.type === "income" ? "var(--green)" : "var(--rust)" }}>
                      {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                    </span>
                    {isAdmin && (
                      <>
                        <button onClick={() => setEditing(t)} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><Pencil size={14} /></button>
                        <button onClick={() => deleteTxn(t.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {isAdmin && view === "list" && (
        <button className="btn btn-primary" style={{ position: "fixed", bottom: 88, right: 20, width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowAdd(true)}><Plus size={24} /></button>
      )}
      {showAdd && <TxnModal owners={owners} onClose={() => setShowAdd(false)} onSave={addTxn} />}
      {editing && <TxnModal owners={owners} initial={editing} onClose={() => setEditing(null)} onSave={(form) => updateTxn(editing.id, form)} />}
    </div>
  );
}

function FinanceReports({ txns }) {
  const monthly = useMemo(() => {
    const map = {};
    txns.forEach((t) => {
      const key = t.date.slice(0, 7);
      if (!map[key]) map[key] = { month: key, income: 0, expense: 0 };
      map[key][t.type] += Number(t.amount);
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [txns]);

  const byCategory = useMemo(() => {
    const map = {};
    txns.filter((t) => t.type === "expense").forEach((t) => { map[t.category] = (map[t.category] || 0) + Number(t.amount); });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [txns]);

  if (monthly.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40, borderStyle: "dashed" }}>
        <p className="font-display" style={{ fontSize: 18, marginBottom: 4 }}>Nothing to report yet</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 10 }}>Income vs expenses by month</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthly}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => fmt(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" fill="#3D4B2E" name="Income" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" fill="#B5652E" name="Expense" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {byCategory.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="field-label" style={{ marginBottom: 10 }}>Expenses by category</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {byCategory.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function TxnModal({ owners, initial, onClose, onSave }) {
  const [type, setType] = useState(initial?.type || "expense");
  const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const [form, setForm] = useState(initial ? {
    category: initial.category, amount: initial.amount, date: initial.date, description: initial.description || "", owner_id: initial.owner_id || "",
  } : { category: EXPENSE_CATEGORIES[0], amount: "", date: todayISO(), description: "", owner_id: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  function switchType(t) { setType(t); set("category", t === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]); }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>{initial ? "Edit transaction" : "Log transaction"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={`tab ${type === "income" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => switchType("income")}>Income</button>
            <button className={`tab ${type === "expense" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => switchType("expense")}>Expense</button>
          </div>
          <div className="field"><span className="field-label">Category</span>
            <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="field"><span className="field-label">Amount (N$)</span><input className="input" type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
            <div className="field"><span className="field-label">Date</span><input className="input" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
          </div>
          <div className="field"><span className="field-label">Owner (optional)</span>
            <select className="input" value={form.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
              <option value="">— none —</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          </div>
          <div className="field"><span className="field-label">Notes</span><input className="input" value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
          <button className="btn btn-primary" disabled={!form.amount || !form.date} onClick={() => onSave({ ...form, type })}>Save transaction</button>
        </div>
      </div>
    </div>
  );
}
