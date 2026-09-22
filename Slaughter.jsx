import React, { useState, useEffect, useMemo } from "react";
import { Plus, X, Scale, Trash2, Printer, AlertTriangle, Pencil } from "lucide-react";
import { supabase } from "./supabaseClient";
import { dbRead, dbWrite } from "./offline";

export default function Slaughter({ establishmentId, isAdmin }) {
  const [records, setRecords] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [view, setView] = useState("list");

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
        buyer_name: form.buyer_name || null,
        buyer_contact: form.purpose === "sold" ? form.buyer_contact || null : null,
        linked_transaction_id: linkedTxnId,
      }),
      { key: "slaughter:insert", payload: form }
    );
    setShowAdd(false);
    load();
  }

  async function updateSlaughter(record, form) {
    const totalValue = form.purpose === "sold" && form.weight_kg && form.price_per_kg
      ? Number(form.weight_kg) * Number(form.price_per_kg) : null;

    // If the animal was changed, put the old one back to active and mark the new one slaughtered
    if (form.animal_id !== record.animal_id) {
      await supabase.from("animals").update({ status: "active" }).eq("id", record.animal_id);
      await supabase.from("animals").update({ status: "slaughtered" }).eq("id", form.animal_id);
    }

    // Keep the linked Finance entry in sync with whatever changed
    let linkedTxnId = record.linked_transaction_id || null;
    if (form.purpose === "sold" && totalValue) {
      if (linkedTxnId) {
        await supabase.from("transactions").update({
          owner_id: form.owner_id, animal_id: form.animal_id, amount: totalValue, date: form.date,
          description: `Slaughter sale — ${form.buyer_name || "buyer not recorded"}`,
        }).eq("id", linkedTxnId);
      } else {
        const { data: txn } = await supabase.from("transactions").insert({
          establishment_id: establishmentId, owner_id: form.owner_id, animal_id: form.animal_id,
          type: "income", category: "Livestock sale", amount: totalValue, date: form.date,
          description: `Slaughter sale — ${form.buyer_name || "buyer not recorded"}`,
        }).select().single();
        linkedTxnId = txn?.id || null;
      }
    } else if (linkedTxnId) {
      // no longer a valid sale — remove the stale income entry
      await supabase.from("transactions").delete().eq("id", linkedTxnId);
      linkedTxnId = null;
    }

    await supabase.from("slaughter_records").update({
      animal_id: form.animal_id,
      date: form.date,
      weight_kg: form.weight_kg || null,
      purpose: form.purpose,
      price_per_kg: form.purpose === "sold" ? form.price_per_kg || null : null,
      total_value: totalValue,
      buyer_name: form.buyer_name || null,
      buyer_contact: form.purpose === "sold" ? form.buyer_contact || null : null,
      linked_transaction_id: linkedTxnId,
    }).eq("id", record.id);

    setShowEdit(null);
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

  const groups = useMemo(() => {
    const byOwner = {};
    records.forEach((r) => {
      const name = r.animals?.owners?.full_name || "Farm (shared/communal)";
      byOwner[name] = byOwner[name] || [];
      byOwner[name].push(r);
    });
    const ownerNames = Object.keys(byOwner).sort();
    const withTotals = ownerNames.map((name) => {
      const rows = byOwner[name].slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      const subtotalValue = rows.reduce((sum, r) => sum + (Number(r.total_value) || 0), 0);
      const subtotalWeight = rows.reduce((sum, r) => sum + (Number(r.weight_kg) || 0), 0);
      const missingCount = rows.filter((r) => r.purpose === "sold" && (!r.price_per_kg || !r.total_value)).length;
      return { name, rows, subtotalValue, subtotalWeight, missingCount };
    });
    const grandTotalValue = withTotals.reduce((sum, g) => sum + g.subtotalValue, 0);
    const grandTotalWeight = withTotals.reduce((sum, g) => sum + g.subtotalWeight, 0);
    const grandMissingCount = withTotals.reduce((sum, g) => sum + g.missingCount, 0);
    return { withTotals, grandTotalValue, grandTotalWeight, grandMissingCount };
  }, [records]);

  if (loading) return <div className="container">Loading slaughter records…</div>;

  return (
    <div className="container">
      <div className="row-between no-print" style={{ marginBottom: 12 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={`tab ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>List</button>
          <button className={`tab ${view === "summary" ? "active" : ""}`} onClick={() => setView("summary")}>Summary by owner</button>
        </div>
        {view === "summary" && (
          <button className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => window.print()}>
            <Printer size={14} /> Print / Save as PDF
          </button>
        )}
      </div>

      {view === "list" && <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 16 }}>{records.length} record(s)</p>}

      {view === "list" && (records.length === 0 ? (
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
                {r.purpose === "sold" ? (
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {r.buyer_name} · N$ {Number(r.price_per_kg).toFixed(2)}/kg → N$ {Number(r.total_value).toFixed(2)}
                  </div>
                ) : (
                  r.buyer_name && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{r.buyer_name}</div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge" style={{ background: r.purpose === "sold" ? "var(--green-soft)" : "var(--gold-soft)", color: r.purpose === "sold" ? "var(--green)" : "#7A5A16" }}>
                  {r.purpose === "sold" ? "sold" : "own use"}
                </span>
                {isAdmin && (
                  <>
                    <button onClick={() => setShowEdit(r)} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteRecord(r.id, r.animal_id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {view === "summary" && (
        records.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 40, borderStyle: "dashed" }}>
            <p className="font-display" style={{ fontSize: 18, marginBottom: 4 }}>No slaughter records yet</p>
          </div>
        ) : (
          <div>
            {groups.grandMissingCount > 0 && (
              <div className="card no-print" style={{ padding: "12px 16px", marginBottom: 16, background: "var(--red-soft)", display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} color="var(--red)" />
                <span style={{ fontSize: 13, color: "var(--red)" }}>
                  {groups.grandMissingCount} sold record(s) are missing a price or total value — flagged in red below.
                </span>
              </div>
            )}
            {groups.withTotals.map((g) => (
              <div key={g.name} style={{ marginBottom: 24 }}>
                <h3 className="font-display" style={{ fontSize: 17, marginBottom: 8 }}>{g.name}</h3>
                <table className="register-table">
                  <thead>
                    <tr><th>Animal</th><th>Date</th><th>Weight</th><th>Usage</th><th>Buyer / Notes</th><th>Price/kg</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const missing = r.purpose === "sold" && (!r.price_per_kg || !r.total_value);
                      return (
                        <tr key={r.id} style={missing ? { color: "var(--red)" } : undefined}>
                          <td className="font-tag">{r.animals?.eartag_number}</td>
                          <td>{r.date}</td>
                          <td>{r.weight_kg ? `${r.weight_kg}kg` : "—"}</td>
                          <td>{r.purpose === "sold" ? "Sold" : "Own use"}</td>
                          <td>{r.buyer_name || "—"}</td>
                          <td>{r.purpose === "sold" && r.price_per_kg ? `N$ ${Number(r.price_per_kg).toFixed(2)}` : "—"}</td>
                          <td>
                            {r.purpose === "sold"
                              ? (r.total_value ? `N$ ${Number(r.total_value).toFixed(2)}` : (
                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={12} /> missing</span>
                              ))
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ fontWeight: 700 }}>
                      <td colSpan={2}>Subtotal — {g.name}</td>
                      <td>{g.subtotalWeight ? `${g.subtotalWeight}kg` : "—"}</td>
                      <td colSpan={3}></td>
                      <td>N$ {g.subtotalValue.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
            <table className="register-table">
              <tbody>
                <tr style={{ fontWeight: 700, fontSize: 15 }}>
                  <td colSpan={2}>Overall total</td>
                  <td>{groups.grandTotalWeight}kg</td>
                  <td colSpan={3}></td>
                  <td>N$ {groups.grandTotalValue.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      )}

      {isAdmin && (
        <button className="btn btn-primary no-print" style={{ position: "fixed", bottom: 88, right: 20, width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowAdd(true)}><Plus size={24} /></button>
      )}
      {showAdd && <AddSlaughterModal animals={animals} onClose={() => setShowAdd(false)} onSave={addSlaughter} />}
      {showEdit && <EditSlaughterModal record={showEdit} animals={animals} onClose={() => setShowEdit(null)} onSave={(form) => updateSlaughter(showEdit, form)} />}
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
          {form.purpose === "sold" ? (
            <>
              <div className="field"><span className="field-label">Price per kg (N$)</span><input type="number" className="input" value={form.price_per_kg} onChange={(e) => set("price_per_kg", e.target.value)} /></div>
              {total && <p style={{ fontSize: 13, color: "var(--green)", fontWeight: 600 }}>Total: N$ {total}</p>}
              <div className="field"><span className="field-label">Buyer name</span><input className="input" value={form.buyer_name} onChange={(e) => set("buyer_name", e.target.value)} /></div>
              <div className="field"><span className="field-label">Buyer contact</span><input className="input" value={form.buyer_contact} onChange={(e) => set("buyer_contact", e.target.value)} /></div>
            </>
          ) : (
            <div className="field"><span className="field-label">Notes (optional)</span><input className="input" placeholder="e.g. Church donation — St. Mary's" value={form.buyer_name} onChange={(e) => set("buyer_name", e.target.value)} /></div>
          )}
          <button className="btn btn-primary" disabled={!form.animal_id} onClick={save}>Save record</button>
        </div>
      </div>
    </div>
  );
}

function EditSlaughterModal({ record, animals, onClose, onSave }) {
  const [form, setForm] = useState({
    animal_id: record.animal_id,
    date: record.date,
    weight_kg: record.weight_kg || "",
    purpose: record.purpose,
    price_per_kg: record.price_per_kg || "",
    buyer_name: record.buyer_name || "",
    buyer_contact: record.buyer_contact || "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // The record's own animal is "slaughtered" now, so it won't be in the
  // active-only list — add it back in so it still shows up, pre-selected.
  const animalOptions = animals.some((a) => a.id === record.animal_id)
    ? animals
    : [{ id: record.animal_id, eartag_number: record.animals?.eartag_number, species: record.animals?.species, owner_id: record.animals?.owner_id, owners: record.animals?.owners }, ...animals];

  const selectedAnimal = animalOptions.find((a) => a.id === form.animal_id);

  function save() {
    onSave({ ...form, owner_id: selectedAnimal?.owner_id });
  }

  const total = form.weight_kg && form.price_per_kg ? (Number(form.weight_kg) * Number(form.price_per_kg)).toFixed(2) : null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Scale size={18} /> Edit slaughter record</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Animal</span>
            <select className="input" value={form.animal_id} onChange={(e) => set("animal_id", e.target.value)}>
              {animalOptions.map((a) => <option key={a.id} value={a.id}>{a.eartag_number} — {a.species} — {a.owners?.full_name}</option>)}
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
          {form.purpose === "sold" ? (
            <>
              <div className="field"><span className="field-label">Price per kg (N$)</span><input type="number" className="input" value={form.price_per_kg} onChange={(e) => set("price_per_kg", e.target.value)} /></div>
              {total && <p style={{ fontSize: 13, color: "var(--green)", fontWeight: 600 }}>Total: N$ {total}</p>}
              <div className="field"><span className="field-label">Buyer name</span><input className="input" value={form.buyer_name} onChange={(e) => set("buyer_name", e.target.value)} /></div>
              <div className="field"><span className="field-label">Buyer contact</span><input className="input" value={form.buyer_contact} onChange={(e) => set("buyer_contact", e.target.value)} /></div>
            </>
          ) : (
            <div className="field"><span className="field-label">Notes (optional)</span><input className="input" placeholder="e.g. Church donation — St. Mary's" value={form.buyer_name} onChange={(e) => set("buyer_name", e.target.value)} /></div>
          )}
          <button className="btn btn-primary" disabled={!form.animal_id} onClick={save}>Save changes</button>
        </div>
      </div>
    </div>
  );
}
