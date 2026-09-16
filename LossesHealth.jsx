import React, { useState, useEffect } from "react";
import { Plus, X, Trash2, Upload, Pencil } from "lucide-react";
import Papa from "papaparse";
import { supabase } from "./supabaseClient";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function LossesHealth({ establishmentId, isAdmin, initialTab }) {
  const [tab, setTab] = useState(initialTab || "losses");

  return (
    <div className="container">
      <div className="tabs">
        <button className={`tab ${tab === "losses" ? "active" : ""}`} onClick={() => setTab("losses")}>Losses</button>
        <button className={`tab ${tab === "health" ? "active" : ""}`} onClick={() => setTab("health")}>Health</button>
        <button className={`tab ${tab === "feed" ? "active" : ""}`} onClick={() => setTab("feed")}>Feed</button>
      </div>
      {tab === "losses" && <LossesTab establishmentId={establishmentId} isAdmin={isAdmin} />}
      {tab === "health" && <HealthTab establishmentId={establishmentId} isAdmin={isAdmin} />}
      {tab === "feed" && <FeedTab establishmentId={establishmentId} isAdmin={isAdmin} />}
    </div>
  );
}

function LossesTab({ establishmentId, isAdmin }) {
  return (
    <div className="stack">
      <RepeatingSection title="Predator losses" table="predator_losses" establishmentId={establishmentId} isAdmin={isAdmin}
        linkedStatus="deceased"
        fields={[
          { key: "species", label: "Species", type: "select", options: ["cattle", "sheep", "goats"] },
          { key: "predator", label: "Predator", type: "text" },
          { key: "number_lost", label: "Number lost", type: "number" },
          { key: "date", label: "Date", type: "date", default: todayISO() },
        ]}
        renderRow={(r) => `${r.date} — ${r.species} — ${r.predator} — ${r.number_lost} lost`} />

      <RepeatingSection title="Theft" table="theft_losses" establishmentId={establishmentId} isAdmin={isAdmin}
        linkedStatus="stolen"
        fields={[
          { key: "species", label: "Species", type: "text" },
          { key: "number_stolen", label: "Number stolen", type: "number" },
          { key: "date", label: "Date", type: "date", default: todayISO() },
        ]}
        renderRow={(r) => `${r.date} — ${r.species} — ${r.number_stolen} stolen`} />

      <RepeatingSection title="Disease sickness / deaths" table="disease_records" establishmentId={establishmentId} isAdmin={isAdmin}
        extra={{ record_type: "disease" }} linkedStatus="deceased"
        fields={[
          { key: "animal_type", label: "Animal type", type: "select", options: ["cattle", "sheep", "goats", "other"] },
          { key: "disease", label: "Disease", type: "text" },
          { key: "no_sick", label: "No. sick", type: "number" },
          { key: "no_dead", label: "No. dead", type: "number" },
          { key: "date", label: "Date", type: "date", default: todayISO() },
        ]}
        renderRow={(r) => `${r.date} — ${r.animal_type} — ${r.disease} — sick ${r.no_sick} / dead ${r.no_dead}`} />

      <RepeatingSection title="Unknown-cause sickness / nervous signs" table="disease_records" establishmentId={establishmentId} isAdmin={isAdmin}
        extra={{ record_type: "unknown_cause" }} linkedStatus="deceased"
        fields={[
          { key: "animal_type", label: "Animal type", type: "text" },
          { key: "clinical_signs", label: "Clinical signs", type: "text" },
          { key: "no_sick", label: "No. sick", type: "number" },
          { key: "no_dead", label: "No. dead", type: "number" },
          { key: "date", label: "Date", type: "date", default: todayISO() },
        ]}
        renderRow={(r) => `${r.date} — ${r.animal_type} — ${r.clinical_signs} — sick ${r.no_sick} / dead ${r.no_dead}`} />
    </div>
  );
}

function HealthTab({ establishmentId, isAdmin }) {
  const [events, setEvents] = useState([]);
  const [owners, setOwners] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [establishmentId]);
  async function load() {
    setLoading(true);
    const [{ data: e }, { data: o }] = await Promise.all([
      supabase.from("health_events").select("*, owners(full_name), animals(eartag_number)").eq("establishment_id", establishmentId).order("date", { ascending: false }),
      supabase.from("owners").select("id, full_name").eq("establishment_id", establishmentId),
    ]);
    setEvents(e || []);
    setOwners(o || []);
    setLoading(false);
  }

  async function addEvent(form) {
    await supabase.from("health_events").insert({ establishment_id: establishmentId, ...form });
    setShowAdd(false);
    load();
  }
  async function removeEvent(id) {
    await supabase.from("health_events").delete().eq("id", id);
    load();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      {isAdmin && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className="btn btn-secondary" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => setShowImport(true)}>
            <Upload size={14} /> Import CSV
          </button>
          <button className="btn btn-primary" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add
          </button>
        </div>
      )}
      {events.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 30, borderStyle: "dashed" }}>
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>No health events logged</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {events.map((e) => (
            <div key={e.id} className="list-row">
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{e.event_type} {e.animals?.eartag_number ? `— ${e.animals.eartag_number}` : e.species ? `— ${e.species}` : ""}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{e.date}{e.owners?.full_name ? ` · ${e.owners.full_name}` : ""}{e.note ? ` · ${e.note}` : ""}{e.next_due ? ` · next due ${e.next_due}` : ""}</div>
              </div>
              {isAdmin && <button onClick={() => removeEvent(e.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      )}
      {showAdd && <AddHealthEventModal owners={owners} onClose={() => setShowAdd(false)} onSave={addEvent} />}
      {showImport && <ImportHealthModal establishmentId={establishmentId} owners={owners} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} />}
    </div>
  );
}

function AddHealthEventModal({ owners, onClose, onSave }) {
  const [form, setForm] = useState({ owner_id: "", species: "", event_type: "vaccination", date: todayISO(), note: "", next_due: "", batch_no: "", withdrawal_end: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Log health event</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Owner (optional — leave for farm-wide)</span>
            <select className="input" value={form.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
              <option value="">— farm-wide —</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          </div>
          <div className="field"><span className="field-label">Species</span><input className="input" placeholder="e.g. sheep" value={form.species} onChange={(e) => set("species", e.target.value)} /></div>
          <div className="field"><span className="field-label">Type</span>
            <select className="input" value={form.event_type} onChange={(e) => set("event_type", e.target.value)}>
              <option value="vaccination">Vaccination</option><option value="deworming">Deworming</option>
              <option value="treatment">Treatment</option><option value="illness">Illness</option>
              <option value="checkup">Checkup</option><option value="other">Other</option>
            </select>
          </div>
          <div className="grid-2">
            <div className="field"><span className="field-label">Date</span><input type="date" className="input" value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
            <div className="field"><span className="field-label">Next due</span><input type="date" className="input" value={form.next_due} onChange={(e) => set("next_due", e.target.value)} /></div>
          </div>
          <div className="field"><span className="field-label">Batch no. (for vet drug register)</span><input className="input" value={form.batch_no} onChange={(e) => set("batch_no", e.target.value)} /></div>
          <div className="field"><span className="field-label">Withdrawal ends (optional)</span><input type="date" className="input" value={form.withdrawal_end} onChange={(e) => set("withdrawal_end", e.target.value)} /></div>
          <div className="field"><span className="field-label">Notes</span><input className="input" value={form.note} onChange={(e) => set("note", e.target.value)} /></div>
          <button className="btn btn-primary" onClick={() => onSave({ ...form, owner_id: form.owner_id || null, next_due: form.next_due || null, withdrawal_end: form.withdrawal_end || null })}>Save</button>
        </div>
      </div>
    </div>
  );
}

function ImportHealthModal({ establishmentId, owners, onClose, onDone }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (res) => setRows(res.data), error: (err) => setError(err.message) });
  }

  async function runImport() {
    setImporting(true);
    setError("");
    const ownerByName = Object.fromEntries(owners.map((o) => [o.full_name.toLowerCase().trim(), o]));
    let animalByTag = {};
    if (rows.some((r) => r.eartag_number)) {
      const { data: animals } = await supabase.from("animals").select("id, eartag_number").eq("establishment_id", establishmentId);
      animalByTag = Object.fromEntries((animals || []).map((a) => [a.eartag_number.toLowerCase().trim(), a.id]));
    }
    const toInsert = rows.filter((r) => r.event_type && r.date).map((r) => ({
      establishment_id: establishmentId,
      owner_id: ownerByName[(r.owner || "").toLowerCase().trim()]?.id || null,
      animal_id: r.eartag_number ? animalByTag[String(r.eartag_number).toLowerCase().trim()] || null : null,
      species: r.species || null,
      event_type: r.event_type.toLowerCase().trim(),
      date: r.date,
      note: r.note || null,
      next_due: r.next_due || null,
      batch_no: r.batch_no || null,
      withdrawal_end: r.withdrawal_end || null,
    }));
    if (toInsert.length === 0) {
      setError("No valid rows. Need at least 'event_type' and 'date' columns.");
      setImporting(false);
      return;
    }
    const { error } = await supabase.from("health_events").insert(toInsert);
    setImporting(false);
    if (error) return setError(error.message);
    onDone();
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Import health events</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
          Columns: <span className="font-tag">owner, eartag_number, species, event_type, date, note, next_due, batch_no, withdrawal_end</span>.
          owner/eartag_number are optional — leave blank for a farm-wide or species-wide entry.
        </p>
        <input type="file" accept=".csv" onChange={handleFile} className="input" style={{ marginBottom: 12 }} />
        {rows.length > 0 && <p style={{ fontSize: 13, marginBottom: 12 }}>{rows.length} row(s) ready.</p>}
        {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button className="btn btn-primary" disabled={rows.length === 0 || importing} onClick={runImport}>{importing ? "Importing…" : `Import ${rows.length || ""} events`}</button>
      </div>
    </div>
  );
}

function FeedTab({ establishmentId, isAdmin }) {
  return (
    <RepeatingSection title="Feed register" table="feed_register" establishmentId={establishmentId} isAdmin={isAdmin}
      fields={[
        { key: "species", label: "Species", type: "text" },
        { key: "feed_ingredients", label: "Feed / ingredients", type: "text" },
        { key: "date", label: "Date", type: "date", default: todayISO() },
      ]}
      renderRow={(r) => `${r.date} — ${r.species} — ${r.feed_ingredients}`} />
  );
}

function RepeatingSection({ title, table, establishmentId, isAdmin, extra = {}, fields, renderRow, linkedStatus }) {
  const [rows, setRows] = useState([]);
  const [animals, setAnimals] = useState([]);
  const emptyForm = () => ({ ...Object.fromEntries(fields.map((f) => [f.key, f.default || ""])), animal_ids: [] });
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { load(); }, [establishmentId]);
  async function load() {
    let q = supabase.from(table).select("*").eq("establishment_id", establishmentId);
    if (extra.record_type) q = q.eq("record_type", extra.record_type);
    const { data } = await q.order("date", { ascending: false });
    setRows(data || []);
    if (linkedStatus) {
      const { data: a } = await supabase.from("animals").select("id, eartag_number, species, status")
        .eq("establishment_id", establishmentId).in("status", ["active", linkedStatus]);
      setAnimals(a || []);
    }
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(r) {
    setEditingId(r.id);
    setForm({ ...Object.fromEntries(fields.map((f) => [f.key, r[f.key] ?? (f.default || "")])), animal_ids: r.animal_ids || [] });
    setShowForm(true);
  }

  function toggleAnimal(id) {
    setForm((f) => ({ ...f, animal_ids: f.animal_ids.includes(id) ? f.animal_ids.filter((x) => x !== id) : [...f.animal_ids, id] }));
  }

  async function saveRow() {
    const payload = { ...extra, establishment_id: establishmentId };
    fields.forEach((f) => { payload[f.key] = f.type === "number" ? (parseInt(form[f.key]) || 0) : form[f.key]; });
    payload.animal_ids = form.animal_ids;

    const previousIds = editingId ? (rows.find((r) => r.id === editingId)?.animal_ids || []) : [];
    const nextIds = form.animal_ids;

    if (editingId) {
      await supabase.from(table).update(payload).eq("id", editingId);
    } else {
      await supabase.from(table).insert(payload);
    }

    if (linkedStatus) {
      const removed = previousIds.filter((id) => !nextIds.includes(id));
      const added = nextIds.filter((id) => !previousIds.includes(id));
      if (removed.length) await supabase.from("animals").update({ status: "active" }).in("id", removed);
      if (added.length) await supabase.from("animals").update({ status: linkedStatus }).in("id", added);
    }

    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
    load();
  }

  async function removeRow(r) {
    if (!confirm("Delete this record? Any linked animals will be set back to active.")) return;
    if (linkedStatus && r.animal_ids?.length) {
      await supabase.from("animals").update({ status: "active" }).in("id", r.animal_ids);
    }
    await supabase.from(table).delete().eq("id", r.id);
    load();
  }

  const eartagFor = (id) => animals.find((a) => a.id === id)?.eartag_number || "?";

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <div className="field-label">{title}</div>
        {isAdmin && <button onClick={() => (showForm && !editingId ? setShowForm(false) : openAdd())} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer" }}><Plus size={18} /></button>}
      </div>
      {rows.length === 0 && !showForm && <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>None recorded</p>}
      {rows.map((r) => (
        <div key={r.id} className="row-between" style={{ padding: "6px 0", borderTop: "1px solid var(--line)", fontSize: 13, alignItems: "flex-start" }}>
          <span>
            {renderRow(r)}
            {linkedStatus && r.animal_ids?.length > 0 && (
              <span className="font-tag" style={{ display: "block", fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
                tagged: {r.animal_ids.map(eartagFor).join(", ")}
              </span>
            )}
          </span>
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={() => openEdit(r)} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><Pencil size={13} /></button>
              <button onClick={() => removeRow(r)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><Trash2 size={13} /></button>
            </div>
          )}
        </div>
      ))}
      {showForm && (
        <div className="stack" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          {fields.map((f) => (
            <div className="field" key={f.key}>
              <span className="field-label">{f.label}</span>
              {f.type === "select" ? (
                <select className="input" value={form[f.key]} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}>
                  <option value="">—</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type} className="input" value={form[f.key]} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
              )}
            </div>
          ))}
          {linkedStatus && (
            <div className="field">
              <span className="field-label">Affected animals (optional — links specific eartags so they're removed from the active herd)</span>
              <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
                {animals.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>No active animals to select.</p>}
                {animals.filter((a) => a.status === "active" || form.animal_ids.includes(a.id)).map((a) => (
                  <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 }}>
                    <input type="checkbox" checked={form.animal_ids.includes(a.id)} onChange={() => toggleAnimal(a.id)} />
                    <span className="font-tag">{a.eartag_number}</span> <span style={{ color: "var(--ink-soft)" }}>· {a.species}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <button className="btn btn-primary" onClick={saveRow}>{editingId ? "Save changes" : "Add"}</button>
        </div>
      )}
    </div>
  );
}
