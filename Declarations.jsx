import React, { useState, useEffect } from "react";
import { Plus, X, FileCheck } from "lucide-react";
import { supabase } from "./supabaseClient";
import { dbRead } from "./offline";
import DeclarationDetail from "./DeclarationDetail";

function currentPeriod() {
  const m = new Date().getMonth() + 1;
  return { period: m <= 6 ? "jan_jun" : "jul_dec", year: new Date().getFullYear() };
}

export default function Declarations({ establishmentId, isAdmin }) {
  const [declarations, setDeclarations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => { load(); }, [establishmentId]);

  async function load() {
    setLoading(true);
    const { data } = await dbRead(`declarations:${establishmentId}`, () =>
      supabase.from("declarations").select("*").eq("establishment_id", establishmentId).order("year", { ascending: false })
    );
    setDeclarations(data || []);
    setLoading(false);
  }

  async function addDeclaration(form) {
    const { data, error } = await supabase.from("declarations").insert({ establishment_id: establishmentId, ...form }).select().single();
    setShowAdd(false);
    if (!error) { await load(); setSelected(data); }
  }

  if (loading) return <div className="container">Loading declaration…</div>;

  if (selected) return <DeclarationDetail declaration={selected} isAdmin={isAdmin} onBack={() => { setSelected(null); load(); }} />;

  return (
    <div className="container">
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 16 }}>One declaration per 6-month period for the whole farm</p>

      {declarations.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, borderStyle: "dashed" }}>
          <p className="font-display" style={{ fontSize: 18, marginBottom: 4 }}>No declaration started</p>
          {isAdmin && <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>Tap + to start this period's declaration.</p>}
        </div>
      ) : (
        <div className="stack">
          {declarations.map((d) => (
            <button key={d.id} onClick={() => setSelected(d)} className="card row-between" style={{ padding: "12px 16px", cursor: "pointer", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileCheck size={18} color="var(--blue)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{d.period === "jan_jun" ? "Jan–Jun" : "Jul–Dec"} {d.year}</div>
                </div>
              </div>
              <span className="badge" style={{ background: d.status === "submitted" ? "var(--green-soft)" : "var(--gold-soft)", color: d.status === "submitted" ? "var(--green)" : "#7A5A16" }}>{d.status}</span>
            </button>
          ))}
        </div>
      )}

      {isAdmin && (
        <button className="btn btn-primary" style={{ position: "fixed", bottom: 88, right: 20, width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowAdd(true)}><Plus size={24} /></button>
      )}
      {showAdd && <AddDeclarationModal onClose={() => setShowAdd(false)} onSave={addDeclaration} />}
    </div>
  );
}

function AddDeclarationModal({ onClose, onSave }) {
  const cur = currentPeriod();
  const [form, setForm] = useState({ period: cur.period, year: cur.year });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Start declaration</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="grid-2">
            <div className="field"><span className="field-label">Period</span>
              <select className="input" value={form.period} onChange={(e) => set("period", e.target.value)}>
                <option value="jan_jun">Jan – Jun</option>
                <option value="jul_dec">Jul – Dec</option>
              </select>
            </div>
            <div className="field"><span className="field-label">Year</span><input type="number" className="input" value={form.year} onChange={(e) => set("year", parseInt(e.target.value))} /></div>
          </div>
          <button className="btn btn-primary" onClick={() => onSave(form)}>Create declaration</button>
        </div>
      </div>
    </div>
  );
}
