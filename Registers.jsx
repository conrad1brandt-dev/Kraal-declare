import React, { useState, useEffect } from "react";
import { Printer, Plus, X, Trash2, Truck } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function Registers({ establishmentId, isAdmin }) {
  const [tab, setTab] = useState("livestock");
  return (
    <div className="container">
      <div className="tabs">
        <button className={`tab ${tab === "livestock" ? "active" : ""}`} onClick={() => setTab("livestock")}>Livestock</button>
        <button className={`tab ${tab === "feed" ? "active" : ""}`} onClick={() => setTab("feed")}>Feed</button>
        <button className={`tab ${tab === "vetdrug" ? "active" : ""}`} onClick={() => setTab("vetdrug")}>Vet Drug</button>
        <button className={`tab ${tab === "movements" ? "active" : ""}`} onClick={() => setTab("movements")}>Movements</button>
      </div>
      {tab === "livestock" && <LivestockRegister establishmentId={establishmentId} />}
      {tab === "feed" && <FeedRegister establishmentId={establishmentId} />}
      {tab === "vetdrug" && <VetDrugRegister establishmentId={establishmentId} isAdmin={isAdmin} />}
      {tab === "movements" && <MovementsRegister establishmentId={establishmentId} isAdmin={isAdmin} />}
    </div>
  );
}

function LivestockRegister({ establishmentId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("animals").select("eartag_number, species, breed_category, sex, dob, status, owners(full_name), brand_marks(stock_brand_code)")
      .eq("establishment_id", establishmentId).order("eartag_number")
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, [establishmentId]);

  if (loading) return <p>Loading…</p>;
  return (
    <div>
      <div className="row-between no-print" style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>{rows.length} animal(s) on record</p>
        <button className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => window.print()}><Printer size={14} /> Print / Save as PDF</button>
      </div>
      <h3 className="font-display" style={{ marginBottom: 8 }}>Livestock Register</h3>
      <table className="register-table">
        <thead><tr><th>Eartag</th><th>Species</th><th>Breed</th><th>Sex</th><th>DOB</th><th>Owner</th><th>Brand</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="font-tag">{r.eartag_number}</td><td>{r.species}</td><td>{r.breed_category || "—"}</td>
              <td>{r.sex}</td><td>{r.dob || "—"}</td><td>{r.owners?.full_name || "shared"}</td>
              <td>{r.brand_marks?.stock_brand_code || "—"}</td><td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeedRegister({ establishmentId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("feed_register").select("*").eq("establishment_id", establishmentId).order("date", { ascending: false })
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, [establishmentId]);

  if (loading) return <p>Loading…</p>;
  return (
    <div>
      <div className="row-between no-print" style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>{rows.length} entries</p>
        <button className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => window.print()}><Printer size={14} /> Print / Save as PDF</button>
      </div>
      <h3 className="font-display" style={{ marginBottom: 8 }}>Feed Register</h3>
      <table className="register-table">
        <thead><tr><th>Date</th><th>Species</th><th>Feed / ingredients</th><th>Meat/bone meal</th><th>Poultry manure</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="font-tag">{r.date}</td><td>{r.species}</td><td>{r.feed_ingredients}</td>
              <td>{r.contains_meat_bone_meal ? "Yes" : "No"}</td><td>{r.contains_poultry_manure ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VetDrugRegister({ establishmentId, isAdmin }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { load(); }, [establishmentId]);
  async function load() {
    setLoading(true);
    const { data } = await supabase.from("health_events").select("*, owners(full_name), animals(eartag_number)")
      .eq("establishment_id", establishmentId).in("event_type", ["vaccination", "deworming", "treatment"]).order("date", { ascending: false });
    setRows(data || []);
    setLoading(false);
  }
  async function addEntry(form) { await supabase.from("health_events").insert({ establishment_id: establishmentId, ...form }); setShowAdd(false); load(); }
  async function removeEntry(id) { await supabase.from("health_events").delete().eq("id", id); load(); }

  if (loading) return <p>Loading…</p>;
  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
        Data capture is ready — batch number and withdrawal period included. A polished printable report for this register is coming in a follow-up.
      </p>
      {isAdmin && <button className="btn btn-primary" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowAdd(true)}><Plus size={14} /> Add entry</button>}
      {rows.length === 0 ? <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No entries yet</p> : (
        <div className="card" style={{ overflow: "hidden" }}>
          {rows.map((r) => (
            <div key={r.id} className="list-row">
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{r.event_type} {r.animals?.eartag_number ? `— ${r.animals.eartag_number}` : r.species ? `— ${r.species}` : ""}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {r.date}{r.batch_no ? ` · batch ${r.batch_no}` : ""}{r.withdrawal_end ? ` · withdrawal until ${r.withdrawal_end}` : ""}{r.note ? ` · ${r.note}` : ""}
                </div>
              </div>
              {isAdmin && <button onClick={() => removeEntry(r.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      )}
      {showAdd && <VetDrugModal onClose={() => setShowAdd(false)} onSave={addEntry} />}
    </div>
  );
}

function VetDrugModal({ onClose, onSave }) {
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ event_type: "treatment", species: "", date: todayISO(), note: "", batch_no: "", withdrawal_end: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Vet drug / treatment entry</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Type</span>
            <select className="input" value={form.event_type} onChange={(e) => set("event_type", e.target.value)}>
              <option value="vaccination">Vaccination</option><option value="deworming">Deworming</option><option value="treatment">Treatment</option>
            </select>
          </div>
          <div className="field"><span className="field-label">Species</span><input className="input" value={form.species} onChange={(e) => set("species", e.target.value)} /></div>
          <div className="field"><span className="field-label">Medicine / vaccine name & batch no.</span><input className="input" placeholder="e.g. Terramycin, batch A2201" value={form.batch_no} onChange={(e) => set("batch_no", e.target.value)} /></div>
          <div className="grid-2">
            <div className="field"><span className="field-label">Date given</span><input type="date" className="input" value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
            <div className="field"><span className="field-label">Withdrawal ends</span><input type="date" className="input" value={form.withdrawal_end} onChange={(e) => set("withdrawal_end", e.target.value)} /></div>
          </div>
          <div className="field"><span className="field-label">Notes</span><input className="input" value={form.note} onChange={(e) => set("note", e.target.value)} /></div>
          <button className="btn btn-primary" onClick={() => onSave({ ...form, withdrawal_end: form.withdrawal_end || null })}>Save</button>
        </div>
      </div>
    </div>
  );
}

function MovementsRegister({ establishmentId, isAdmin }) {
  const [rows, setRows] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { load(); }, [establishmentId]);
  async function load() {
    setLoading(true);
    const [{ data: m }, { data: a }] = await Promise.all([
      supabase.from("movements").select("*, animals(eartag_number)").eq("establishment_id", establishmentId).order("date", { ascending: false }),
      supabase.from("animals").select("id, eartag_number").eq("establishment_id", establishmentId),
    ]);
    setRows(m || []);
    setAnimals(a || []);
    setLoading(false);
  }
  async function addEntry(form) { await supabase.from("movements").insert({ establishment_id: establishmentId, ...form }); setShowAdd(false); load(); }
  async function removeEntry(id) { await supabase.from("movements").delete().eq("id", id); load(); }

  if (loading) return <p>Loading…</p>;
  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
        Data capture is ready for Departure & Arrival records. A polished printable report is coming in a follow-up.
      </p>
      {isAdmin && <button className="btn btn-primary" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowAdd(true)}><Plus size={14} /> Log movement</button>}
      {rows.length === 0 ? <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No movements logged yet</p> : (
        <div className="card" style={{ overflow: "hidden" }}>
          {rows.map((r) => (
            <div key={r.id} className="list-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Truck size={16} color="var(--blue)" />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, textTransform: "capitalize" }}>{r.movement_type}{r.animals?.eartag_number ? ` — ${r.animals.eartag_number}` : ""}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{r.date}{r.from_location ? ` · from ${r.from_location}` : ""}{r.to_location ? ` · to ${r.to_location}` : ""}{r.permit_number ? ` · permit ${r.permit_number}` : ""}</div>
                </div>
              </div>
              {isAdmin && <button onClick={() => removeEntry(r.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      )}
      {showAdd && <MovementModal animals={animals} onClose={() => setShowAdd(false)} onSave={addEntry} />}
    </div>
  );
}

function MovementModal({ animals, onClose, onSave }) {
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ animal_id: "", movement_type: "arrival", date: todayISO(), from_location: "", to_location: "", permit_number: "", transported_by: "", reason: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Log movement</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Type</span>
            <select className="input" value={form.movement_type} onChange={(e) => set("movement_type", e.target.value)}>
              <option value="arrival">Arrival</option><option value="departure">Departure</option><option value="transfer">Transfer</option>
            </select>
          </div>
          <div className="field"><span className="field-label">Animal (optional)</span>
            <select className="input" value={form.animal_id} onChange={(e) => set("animal_id", e.target.value)}>
              <option value="">— not linked to a specific animal —</option>
              {animals.map((a) => <option key={a.id} value={a.id}>{a.eartag_number}</option>)}
            </select>
          </div>
          <div className="field"><span className="field-label">Date</span><input type="date" className="input" value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
          <div className="grid-2">
            <div className="field"><span className="field-label">From</span><input className="input" value={form.from_location} onChange={(e) => set("from_location", e.target.value)} /></div>
            <div className="field"><span className="field-label">To</span><input className="input" value={form.to_location} onChange={(e) => set("to_location", e.target.value)} /></div>
          </div>
          <div className="field"><span className="field-label">Permit number</span><input className="input" value={form.permit_number} onChange={(e) => set("permit_number", e.target.value)} /></div>
          <div className="field"><span className="field-label">Transported by</span><input className="input" value={form.transported_by} onChange={(e) => set("transported_by", e.target.value)} /></div>
          <button className="btn btn-primary" onClick={() => onSave({ ...form, animal_id: form.animal_id || null })}>Save</button>
        </div>
      </div>
    </div>
  );
}
