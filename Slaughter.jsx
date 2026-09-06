import React, { useState, useEffect } from "react";
import { Plus, X, Scale, Trash2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { dbRead, dbWrite } from "./offline";

export default function Slaughter({ establishmentId, isAdmin }) {
  const [records, setRecords] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { load(); }, [establishmentId]);

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: a }] = await Promise.all([
      dbRead(`slaughter:${establishmentId}`, () =>
        supabase.from("slaughter_records").select("*, animals(eartag_number, species, owner_id, owners(full_name))")
          .eq("establishment_id", establishmentId).order("date", { ascending: false })
      ),
      dbRead(`animals_active:${establishmentId}`, () =>
        supabase.from("animals").select("id, eartag_number, species, owner_id, owners(full_name)")
          .eq("establishment_id", establishmentId).eq("status", "active")
      ),
    ]);
    setRecords(r || []);
    setAnimals(a || []);
    setLoading(false);
  }

  async function addSlaughter(form) {
    const totalValue = form.purpose === "sold" && form.weight_kg && form.price_per_kg
      ? Number(form.weight_kg) * Number(form.price_per_kg) : null;

    // 1. mark the animal as slaughtered
    await supabase.from("animals").update({ status: "slaughtered" }).eq("id", form.animal_id);

    // 2. if sold, create the matching Finance income entry first, so we can link it
    let linkedTxnId = null;
    if (form.purpose === "sold" && totalValue) {
      const { data: txn } = await supabase.from("transactions").insert({
        establishment_id: establishmentId,
        owner_id: form.owner_id,
        animal_id: form.animal_id,
        type: "income",
        category: "Livestock sale",
        amount: totalValue,
        date: form.date,
        description: `Slaughter sale — ${form.buyer_name || "buyer not recorded"}`,
      }).select().single();
      linkedTxnId = txn?.id || null;
    }

    // 3. save the slaughter record itself
    await dbWrite(
      () => supabase.from("slaughter_records").insert({
        establishment_id: establishmentId,
        animal_id: form.animal_id,
        date: form.date,
        weight_kg: form.weight_kg || null,
        purpose: form.purpose,
        price_per_kg: form.purpose === "sold" ? form.price_per_kg || null : null,
        total_value: totalValue,
        buyer_name: form.purpose === "sold" ? form.buyer_name || null : null,
        buyer_contact: form.purpose === "sold" ? form.buyer_contact || null : null,
        linked_transaction_id: linkedTxnId,
      }),
      { key: "slaughter:insert", payload: form }
    );
    setShowAdd(false);
    load();
  }

  async function deleteRecord(id, animalId) {
    if (!confirm("Delete this slaughter record? The animal's status will revert to active, and any linked income entry will be removed.")) return;
    const { data: rec } = await supabase.from("slaughter_records").select("linked_transaction_id").eq("id", id).single();
    if (rec?.linked_transaction_id) await supabase.from("transactions").delete().eq("id", rec.linked_transaction_id);
    await supabase.from("animals").update({ status: "active" }).eq("id", animalId);
    await supabase.from("slaughter_records").delete().eq("id", id);
    load();
  }

  if (loading) return <div className="container">Loading slaughter records…</div>;

  return (
    <div className="container">
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 16 }}>{records.length} record(s)</p>

      {records.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, borderStyle: "dashed" }}>
          <p className="font-display" style={{ fontSize: 18, marginBottom: 4 }}>No slaughter records yet</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {records.map((r, i) => (
            <div key={r.id} className="list-row">
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }} className="font-tag">{r.animals?.eartag_number}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {r.date} · {r.weight_kg ? `${r.weight_kg}kg` : "no weight"} · {r.purpose === "sold" ? "Sold" : "Own consumption"}
                </div>
                {r.purpose === "sold" && (
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {r.buyer_name} · N$ {Number(r.price_per_kg).toFixed(2)}/kg → N$ {Number(r.total_value).toFixed(2)}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge" style={{ background: r.purpose === "sold" ? "var(--green-soft)" : "var(--gold-soft)", color: r.purpose === "sold" ? "var(--green)" : "#7A5A16" }}>
                  {r.purpose === "sold" ? "sold" : "own use"}
                </span>
                {isAdmin && (
                  <button onClick={() => deleteRecord(r.id, r.animal_id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <button className="btn btn-primary" style={{ position: "fixed", bottom: 88, right: 20, width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowAdd(true)}><Plus size={24} /></button>
      )}
      {showAdd && <AddSlaughterModal animals={animals} onClose={() => setShowAdd(false)} onSave={addSlaughter} />}
    </div>
  );
}

function AddSlaughterModal({ animals, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ animal_id: "", date: today, weight_kg: "", purpose: "own_consumption", price_per_kg: "", buyer_name: "", buyer_contact: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const selectedAnimal = animals.find((a) => a.id === form.animal_id);

  function save() {
    onSave({ ...form, owner_id: selectedAnimal?.owner_id });
  }

  const total = form.weight_kg && form.price_per_kg ? (Number(form.weight_kg) * Number(form.price_per_kg)).toFixed(2) : null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Scale size={18} /> Log slaughter</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Animal</span>
            <select className="input" value={form.animal_id} onChange={(e) => set("animal_id", e.target.value)}>
              <option value="">— select active animal —</option>
              {animals.map((a) => <option key={a.id} value={a.id}>{a.eartag_number} — {a.species} — {a.owners?.full_name}</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="field"><span className="field-label">Date</span><input type="date" className="input" value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
            <div className="field"><span className="field-label">Weight (kg)</span><input type="number" className="input" value={form.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} /></div>
          </div>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={`tab ${form.purpose === "own_consumption" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => set("purpose", "own_consumption")}>Own consumption</button>
            <button className={`tab ${form.purpose === "sold" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => set("purpose", "sold")}>Sold</button>
          </div>
          {form.purpose === "sold" && (
            <>
              <div className="field"><span className="field-label">Price per kg (N$)</span><input type="number" className="input" value={form.price_per_kg} onChange={(e) => set("price_per_kg", e.target.value)} /></div>
              {total && <p style={{ fontSize: 13, color: "var(--green)", fontWeight: 600 }}>Total: N$ {total}</p>}
              <div className="field"><span className="field-label">Buyer name</span><input className="input" value={form.buyer_name} onChange={(e) => set("buyer_name", e.target.value)} /></div>
              <div className="field"><span className="field-label">Buyer contact</span><input className="input" value={form.buyer_contact} onChange={(e) => set("buyer_contact", e.target.value)} /></div>
            </>
          )}
          <button className="btn btn-primary" disabled={!form.animal_id} onClick={save}>Save record</button>
        </div>
      </div>
    </div>
  );
}
