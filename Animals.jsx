import React, { useState, useEffect, useRef, useMemo } from "react";
import { Plus, X, Search, ScanLine, Upload, Download, ChevronLeft, GitBranch, Scale, Syringe, Heart, Pencil, Trash2 } from "lucide-react";
import Papa from "papaparse";
import { supabase } from "./supabaseClient";
import { dbRead, dbWrite } from "./offline";

const SPECIES = ["cattle","sheep","goats","pigs","donkeys","horses","ostriches","poultry","other"];
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Animals({ establishmentId, isAdmin }) {
  const [animals, setAnimals] = useState([]);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState(null);
  const scanRef = useRef(null);

  useEffect(() => { load(); }, [establishmentId]);

  async function load() {
    setLoading(true);
    const [{ data: a }, { data: o }] = await Promise.all([
      dbRead(`animals:${establishmentId}`, () =>
        supabase.from("animals").select("*, owners(full_name)").eq("establishment_id", establishmentId).order("created_at", { ascending: false })
      ),
      dbRead(`owners_lite:${establishmentId}`, () =>
        supabase.from("owners").select("id, full_name, brand_marks(*)").eq("establishment_id", establishmentId)
      ),
    ]);
    setAnimals(a || []);
    setOwners(o || []);
    setLoading(false);
  }

  const activeCount = useMemo(() => animals.filter((a) => a.status === "active").length, [animals]);

  const filtered = useMemo(() => animals.filter((a) => {
    if (speciesFilter !== "all" && a.species !== speciesFilter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return a.eartag_number.toLowerCase().includes(q) || (a.owners?.full_name || "").toLowerCase().includes(q);
  }), [animals, speciesFilter, query]);

  async function addAnimal(form) {
    await dbWrite(
      () => supabase.from("animals").insert({ establishment_id: establishmentId, ...form }),
      { key: "animals:insert", payload: form }
    );
    setShowAdd(false);
    load();
  }

  function handleScanKeyDown(e) {
    if (e.key === "Enter" && e.target.value.trim()) {
      setQuery(e.target.value.trim());
      e.target.value = "";
    }
  }

  function exportCSV() {
    const header = ["owner", "eartag_number", "species", "breed_category", "sex", "dob", "status"];
    const lines = [header.join(",")];
    for (const a of animals) {
      const row = [
        a.owners?.full_name || "Farm (shared/communal)",
        a.eartag_number || "",
        a.species || "",
        a.breed_category || "",
        a.sex || "",
        a.dob || "",
        a.status || "",
      ].map((v) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(row.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `animals-export-${todayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="container">Loading animals…</div>;

  if (selected) return <AnimalDetail animal={selected} allAnimals={animals} owners={owners} isAdmin={isAdmin} establishmentId={establishmentId} onBack={() => { setSelected(null); load(); }} />;

  return (
    <div className="container">
      <div className="stat-card" style={{ marginBottom: 12 }}>
        <div className="stat-label">Active herd (current)</div>
        <div className="stat-value">{activeCount}</div>
        <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>{animals.length} total records including sold/slaughtered — see Slaughter for history.</p>
      </div>

      <div style={{ position: "relative", marginBottom: 8 }}>
        <ScanLine size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--green)" }} />
        <input ref={scanRef} className="input" style={{ paddingLeft: 36, borderColor: "var(--green)" }}
          placeholder="Scan eartag or type to search" defaultValue=""
          onKeyDown={handleScanKeyDown} />
      </div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)" }} />
        <input className="input" style={{ paddingLeft: 34 }} placeholder="Search by tag or owner" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="tabs">
        {["all", ...SPECIES].map((s) => (
          <button key={s} className={`tab ${speciesFilter === s ? "active" : ""}`} onClick={() => setSpeciesFilter(s)}>
            {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {isAdmin && (
          <button className="btn btn-secondary" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => setShowImport(true)}>
            <Upload size={14} /> Import CSV
          </button>
        )}
        <button className="btn btn-secondary" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={exportCSV}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, borderStyle: "dashed" }}>
          <p className="font-display" style={{ fontSize: 18, marginBottom: 4 }}>No animals found</p>
        </div>
      ) : (
        <div className="stack">
          {filtered.map((a) => (
            <button key={a.id} onClick={() => setSelected(a)} className="card row-between" style={{ padding: "12px 16px", cursor: "pointer", textAlign: "left" }}>
              <div>
                <div className="font-tag" style={{ fontWeight: 600, fontSize: 14 }}>{a.eartag_number}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{a.species} · {a.owners?.full_name || "shared/communal"} · {a.sex === "F" ? "Female" : "Male"}</div>
              </div>
              <span className="badge" style={{
                background: a.status === "active" ? "var(--green-soft)" : "var(--rust-soft)",
                color: a.status === "active" ? "var(--green)" : "var(--rust)",
              }}>{a.status}</span>
            </button>
          ))}
        </div>
      )}

      {isAdmin && (
        <button className="btn btn-primary" style={{ position: "fixed", bottom: 88, right: 20, width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowAdd(true)}><Plus size={24} /></button>
      )}
      {showAdd && <AddAnimalModal owners={owners} animals={animals} onClose={() => setShowAdd(false)} onSave={addAnimal} />}
      {showImport && <ImportModal establishmentId={establishmentId} owners={owners} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} />}
    </div>
  );
}

function AnimalDetail({ animal, allAnimals, owners, isAdmin, establishmentId, onBack }) {
  const dam = allAnimals.find((a) => a.id === animal.dam_id);
  const sire = allAnimals.find((a) => a.id === animal.sire_id);
  const offspring = allAnimals.filter((a) => a.dam_id === animal.id);
  const [tab, setTab] = useState("overview");
  const [weights, setWeights] = useState([]);
  const [healthEvents, setHealthEvents] = useState([]);
  const [breeding, setBreeding] = useState([]);
  const [showAddWeight, setShowAddWeight] = useState(false);
  const [showAddHealth, setShowAddHealth] = useState(false);
  const [showAddBreeding, setShowAddBreeding] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function updateAnimal(form) {
    await supabase.from("animals").update(form).eq("id", animal.id);
    setShowEdit(false);
    onBack();
  }

  async function deleteAnimal() {
    if (!confirm(`Delete animal ${animal.eartag_number}? This removes its weight, health, and breeding history too, and cannot be undone.`)) return;
    setDeleting(true);
    await supabase.from("animals").update({ dam_id: null }).eq("dam_id", animal.id);
    await supabase.from("animals").update({ sire_id: null }).eq("sire_id", animal.id);
    await supabase.from("weights").delete().eq("animal_id", animal.id);
    await supabase.from("health_events").delete().eq("animal_id", animal.id);
    await supabase.from("breeding_events").delete().eq("dam_id", animal.id);
    await supabase.from("animals").delete().eq("id", animal.id);
    setDeleting(false);
    onBack();
  }

  useEffect(() => { loadEvents(); }, [animal.id]);

  async function loadEvents() {
    const [{ data: w }, { data: h }, { data: b }] = await Promise.all([
      supabase.from("weights").select("*").eq("animal_id", animal.id).order("date", { ascending: false }),
      supabase.from("health_events").select("*").eq("animal_id", animal.id).order("date", { ascending: false }),
      supabase.from("breeding_events").select("*").eq("dam_id", animal.id).order("mated_date", { ascending: false }),
    ]);
    setWeights(w || []);
    setHealthEvents(h || []);
    setBreeding(b || []);
  }

  async function addWeight(form) {
    await supabase.from("weights").insert({ animal_id: animal.id, ...form });
    setShowAddWeight(false);
    loadEvents();
  }
  async function addHealth(form) {
    await supabase.from("health_events").insert({ establishment_id: establishmentId, animal_id: animal.id, owner_id: animal.owner_id, species: animal.species, ...form });
    setShowAddHealth(false);
    loadEvents();
  }
  async function addBreeding(form) {
    await supabase.from("breeding_events").insert({ dam_id: animal.id, ...form });
    setShowAddBreeding(false);
    loadEvents();
  }

  const femalesForSire = allAnimals.filter((a) => a.sex === "M" && a.id !== animal.id);

  return (
    <div className="container">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--ink-soft)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          <ChevronLeft size={16} /> Back
        </button>
        {isAdmin && (
          <div style={{ display: "flex", gap: 14 }}>
            <button onClick={() => setShowEdit(true)} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><Pencil size={18} /></button>
            <button onClick={deleteAnimal} disabled={deleting} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><Trash2 size={18} /></button>
          </div>
        )}
      </div>
      <div className="font-tag" style={{ fontSize: 20, fontWeight: 700 }}>{animal.eartag_number}</div>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 12 }}>{animal.species} · {animal.breed_category || "—"} · {animal.owners?.full_name || "shared/communal"}</p>
      {showEdit && <EditAnimalModal animal={animal} owners={owners} allAnimals={allAnimals} onClose={() => setShowEdit(false)} onSave={updateAnimal} />}

      <div className="tabs">
        <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
        <button className={`tab ${tab === "weight" ? "active" : ""}`} onClick={() => setTab("weight")}>Weight</button>
        <button className={`tab ${tab === "health" ? "active" : ""}`} onClick={() => setTab("health")}>Health</button>
        {animal.sex === "F" && <button className={`tab ${tab === "breeding" ? "active" : ""}`} onClick={() => setTab("breeding")}>Breeding</button>}
      </div>

      {tab === "overview" && (
        <div className="stack">
          <div className="card" style={{ padding: 16 }}>
            <div className="field-label" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><GitBranch size={13} /> Parentage</div>
            <div style={{ fontSize: 14 }}>Dam: {dam ? dam.eartag_number : "not linked"}</div>
            <div style={{ fontSize: 14 }}>Sire: {sire ? sire.eartag_number : "not linked"}</div>
          </div>
          {offspring.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>Offspring ({offspring.length})</div>
              {offspring.map((o) => <div key={o.id} style={{ fontSize: 14, padding: "4px 0" }} className="font-tag">{o.eartag_number} — {o.status}</div>)}
            </div>
          )}
          <div className="card" style={{ padding: 16 }}>
            <div className="field-label" style={{ marginBottom: 8 }}>Details</div>
            <div style={{ fontSize: 14 }}>Sex: {animal.sex === "F" ? "Female" : "Male"}</div>
            <div style={{ fontSize: 14 }}>DOB: {animal.dob || "unknown"}</div>
            <div style={{ fontSize: 14 }}>Status: {animal.status}</div>
          </div>
        </div>
      )}

      {tab === "weight" && (
        <div className="card" style={{ padding: 16 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <div className="field-label" style={{ display: "flex", alignItems: "center", gap: 4 }}><Scale size={13} /> Weight log</div>
            {isAdmin && <button onClick={() => setShowAddWeight(true)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer" }}><Plus size={16} /></button>}
          </div>
          {weights.length === 0 ? <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No weights logged</p> :
            weights.map((w) => (
              <div key={w.id} className="row-between" style={{ fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span>{w.date}</span><span className="font-tag" style={{ fontWeight: 600 }}>{w.kg} kg</span>
              </div>
            ))}
          {showAddWeight && (
            <div className="stack" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <QuickWeightForm onSave={addWeight} onCancel={() => setShowAddWeight(false)} />
            </div>
          )}
        </div>
      )}

      {tab === "health" && (
        <div className="card" style={{ padding: 16 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <div className="field-label" style={{ display: "flex", alignItems: "center", gap: 4 }}><Syringe size={13} /> Health log</div>
            {isAdmin && <button onClick={() => setShowAddHealth(true)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer" }}><Plus size={16} /></button>}
          </div>
          {healthEvents.length === 0 ? <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No health events logged</p> :
            healthEvents.map((h) => (
              <div key={h.id} style={{ fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <div className="row-between"><span style={{ fontWeight: 500 }}>{h.event_type}</span><span className="font-tag">{h.date}</span></div>
                {h.note && <div style={{ color: "var(--ink-soft)" }}>{h.note}</div>}
                {h.next_due && <div style={{ color: "var(--rust)", fontSize: 12 }}>next due {h.next_due}</div>}
              </div>
            ))}
          {showAddHealth && (
            <div className="stack" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <QuickHealthForm onSave={addHealth} onCancel={() => setShowAddHealth(false)} />
            </div>
          )}
        </div>
      )}

      {tab === "breeding" && (
        <div className="card" style={{ padding: 16 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <div className="field-label" style={{ display: "flex", alignItems: "center", gap: 4 }}><Heart size={13} /> Breeding log</div>
            {isAdmin && <button onClick={() => setShowAddBreeding(true)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer" }}><Plus size={16} /></button>}
          </div>
          {breeding.length === 0 ? <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No breeding events logged</p> :
            breeding.map((b) => {
              const s = allAnimals.find((a) => a.id === b.sire_id);
              return (
                <div key={b.id} style={{ fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <div>Mated {b.mated_date}{s ? ` with ${s.eartag_number}` : ""}</div>
                  <div style={{ color: "var(--ink-soft)" }}>{b.actual_birth ? `Born ${b.actual_birth}${b.offspring_count ? `, ${b.offspring_count} offspring` : ""}` : `Due ${b.expected_due || "—"}`}</div>
                </div>
              );
            })}
          {showAddBreeding && (
            <div className="stack" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <QuickBreedingForm sires={femalesForSire} onSave={addBreeding} onCancel={() => setShowAddBreeding(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuickWeightForm({ onSave, onCancel }) {
  const [date, setDate] = useState(todayISO());
  const [kg, setKg] = useState("");
  return (
    <div className="stack">
      <div className="grid-2">
        <div className="field"><span className="field-label">Date</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><span className="field-label">Weight (kg)</span><input type="number" className="input" value={kg} onChange={(e) => setKg(e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={!kg} onClick={() => onSave({ date, kg: parseFloat(kg) })}>Save</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function QuickHealthForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ event_type: "vaccination", date: todayISO(), note: "", next_due: "", batch_no: "", withdrawal_end: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="stack">
      <div className="field"><span className="field-label">Type</span>
        <select className="input" value={form.event_type} onChange={(e) => set("event_type", e.target.value)}>
          <option value="vaccination">Vaccination</option><option value="deworming">Deworming</option>
          <option value="treatment">Treatment</option><option value="illness">Illness</option>
          <option value="checkup">Checkup</option><option value="other">Other</option>
        </select>
      </div>
      <div className="grid-2">
        <div className="field"><span className="field-label">Date</span><input type="date" className="input" value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
        <div className="field"><span className="field-label">Next due (optional)</span><input type="date" className="input" value={form.next_due} onChange={(e) => set("next_due", e.target.value)} /></div>
      </div>
      <div className="field"><span className="field-label">Batch no. (for vet drug register)</span><input className="input" value={form.batch_no} onChange={(e) => set("batch_no", e.target.value)} /></div>
      <div className="field"><span className="field-label">Withdrawal ends (optional)</span><input type="date" className="input" value={form.withdrawal_end} onChange={(e) => set("withdrawal_end", e.target.value)} /></div>
      <div className="field"><span className="field-label">Notes</span><input className="input" value={form.note} onChange={(e) => set("note", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onSave({ ...form, next_due: form.next_due || null, withdrawal_end: form.withdrawal_end || null })}>Save</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function QuickBreedingForm({ sires, onSave, onCancel }) {
  const [form, setForm] = useState({ sire_id: "", mated_date: todayISO(), expected_due: "", actual_birth: "", offspring_count: "", notes: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="stack">
      <div className="field"><span className="field-label">Sire (optional)</span>
        <select className="input" value={form.sire_id} onChange={(e) => set("sire_id", e.target.value)}>
          <option value="">— none/unknown —</option>
          {sires.map((s) => <option key={s.id} value={s.id}>{s.eartag_number}</option>)}
        </select>
      </div>
      <div className="field"><span className="field-label">Mated date</span><input type="date" className="input" value={form.mated_date} onChange={(e) => set("mated_date", e.target.value)} /></div>
      <div className="field"><span className="field-label">Actual birth (if known)</span><input type="date" className="input" value={form.actual_birth} onChange={(e) => set("actual_birth", e.target.value)} /></div>
      <div className="field"><span className="field-label">Offspring count</span><input type="number" className="input" value={form.offspring_count} onChange={(e) => set("offspring_count", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onSave({
          sire_id: form.sire_id || null, mated_date: form.mated_date,
          actual_birth: form.actual_birth || null, offspring_count: form.offspring_count ? parseInt(form.offspring_count) : null,
        })}>Save</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AddAnimalModal({ owners, animals, onClose, onSave }) {
  const [form, setForm] = useState({ owner_id: "", brand_mark_id: "", eartag_number: "", species: "cattle", breed_category: "", sex: "F", dob: "", dam_id: "", sire_id: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const selectedOwner = owners.find((o) => o.id === form.owner_id);
  const females = animals.filter((a) => a.owner_id === form.owner_id && a.sex === "F");
  const males = animals.filter((a) => a.owner_id === form.owner_id && a.sex === "M");

  function save() {
    const payload = { ...form, owner_id: form.owner_id || null, brand_mark_id: selectedOwner?.brand_marks?.[0]?.id || null, dob: form.dob || null };
    if (!payload.dam_id) delete payload.dam_id;
    if (!payload.sire_id) delete payload.sire_id;
    onSave(payload);
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Add animal</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Owner</span>
            <select className="input" value={form.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
              <option value="">Farm (shared/communal)</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          </div>
          <div className="field"><span className="field-label">Eartag number</span><input className="input font-tag" value={form.eartag_number} onChange={(e) => set("eartag_number", e.target.value)} /></div>
          <div className="field"><span className="field-label">Species</span>
            <select className="input" value={form.species} onChange={(e) => set("species", e.target.value)}>
              {SPECIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field"><span className="field-label">Breed / category</span><input className="input" placeholder="e.g. Meatmaster Ram" value={form.breed_category} onChange={(e) => set("breed_category", e.target.value)} /></div>
          <div className="grid-2">
            <div className="field"><span className="field-label">Sex</span>
              <select className="input" value={form.sex} onChange={(e) => set("sex", e.target.value)}>
                <option value="F">Female</option><option value="M">Male</option>
              </select>
            </div>
            <div className="field"><span className="field-label">DOB</span><input type="date" className="input" value={form.dob} onChange={(e) => set("dob", e.target.value)} /></div>
          </div>
          {form.owner_id && (
            <>
              <div className="field"><span className="field-label">Dam (mother, optional)</span>
                <select className="input" value={form.dam_id} onChange={(e) => set("dam_id", e.target.value)}>
                  <option value="">— none —</option>
                  {females.map((f) => <option key={f.id} value={f.id}>{f.eartag_number}</option>)}
                </select>
              </div>
              <div className="field"><span className="field-label">Sire (father, optional)</span>
                <select className="input" value={form.sire_id} onChange={(e) => set("sire_id", e.target.value)}>
                  <option value="">— none —</option>
                  {males.map((m) => <option key={m.id} value={m.id}>{m.eartag_number}</option>)}
                </select>
              </div>
            </>
          )}
          <button className="btn btn-primary" disabled={!form.eartag_number} onClick={save}>Save animal</button>
        </div>
      </div>
    </div>
  );
}

function EditAnimalModal({ animal, owners, allAnimals, onClose, onSave }) {
  const [form, setForm] = useState({
    owner_id: animal.owner_id || "",
    eartag_number: animal.eartag_number || "",
    species: animal.species || "cattle",
    breed_category: animal.breed_category || "",
    sex: animal.sex || "F",
    dob: animal.dob || "",
    status: animal.status || "active",
    dam_id: animal.dam_id || "",
    sire_id: animal.sire_id || "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const selectedOwner = owners.find((o) => o.id === form.owner_id);
  const females = allAnimals.filter((a) => a.owner_id === form.owner_id && a.sex === "F" && a.id !== animal.id);
  const males = allAnimals.filter((a) => a.owner_id === form.owner_id && a.sex === "M" && a.id !== animal.id);

  function save() {
    const payload = {
      ...form,
      owner_id: form.owner_id || null,
      brand_mark_id: selectedOwner?.brand_marks?.[0]?.id || animal.brand_mark_id || null,
      dam_id: form.dam_id || null,
      sire_id: form.sire_id || null,
      dob: form.dob || null,
    };
    onSave(payload);
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Edit animal</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Owner</span>
            <select className="input" value={form.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
              <option value="">Farm (shared/communal)</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          </div>
          <div className="field"><span className="field-label">Eartag number</span><input className="input font-tag" value={form.eartag_number} onChange={(e) => set("eartag_number", e.target.value)} /></div>
          <div className="field"><span className="field-label">Species</span>
            <select className="input" value={form.species} onChange={(e) => set("species", e.target.value)}>
              {SPECIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field"><span className="field-label">Breed / category</span><input className="input" placeholder="e.g. Meatmaster Ram" value={form.breed_category} onChange={(e) => set("breed_category", e.target.value)} /></div>
          <div className="grid-2">
            <div className="field"><span className="field-label">Sex</span>
              <select className="input" value={form.sex} onChange={(e) => set("sex", e.target.value)}>
                <option value="F">Female</option><option value="M">Male</option>
              </select>
            </div>
            <div className="field"><span className="field-label">DOB</span><input type="date" className="input" value={form.dob} onChange={(e) => set("dob", e.target.value)} /></div>
          </div>
          <div className="field"><span className="field-label">Status</span>
            <select className="input" value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="slaughtered">Slaughtered</option>
            </select>
          </div>
          <div className="field"><span className="field-label">Dam (mother, optional)</span>
            <select className="input" value={form.dam_id} onChange={(e) => set("dam_id", e.target.value)}>
              <option value="">— none —</option>
              {females.map((f) => <option key={f.id} value={f.id}>{f.eartag_number}</option>)}
            </select>
          </div>
          <div className="field"><span className="field-label">Sire (father, optional)</span>
            <select className="input" value={form.sire_id} onChange={(e) => set("sire_id", e.target.value)}>
              <option value="">— none —</option>
              {males.map((m) => <option key={m.id} value={m.id}>{m.eartag_number}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={!form.eartag_number} onClick={save}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ establishmentId, owners, onClose, onDone }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => setRows(res.data),
      error: (err) => setError(err.message),
    });
  }

  async function runImport() {
    setImporting(true);
    setError("");
    const ownerByName = Object.fromEntries(owners.map((o) => [o.full_name.toLowerCase().trim(), o]));
    const toInsert = [];
    for (const r of rows) {
      if (!r.eartag_number) continue;
      const owner = ownerByName[(r.owner || "").toLowerCase().trim()];
      toInsert.push({
        establishment_id: establishmentId,
        owner_id: owner ? owner.id : null,
        brand_mark_id: owner?.brand_marks?.[0]?.id || null,
        eartag_number: String(r.eartag_number).trim(),
        species: (r.species || "cattle").toLowerCase().trim(),
        breed_category: r.breed_category || r.category || null,
        sex: (r.sex || "F").toUpperCase().trim(),
        dob: r.dob || null,
        status: r.status || "active",
        imported: true,
      });
    }
    if (toInsert.length === 0) {
      setError("No valid rows found. Make sure the CSV has an 'eartag_number' column.");
      setImporting(false);
      return;
    }
    const { error } = await supabase.from("animals").insert(toInsert);
    setImporting(false);
    if (error) return setError(error.message);
    onDone();
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Import animals from CSV</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
          Expected columns: <span className="font-tag">owner, eartag_number, species, breed_category, sex, dob, status</span>.
          "owner" must match an owner's full name exactly, or leave blank for shared/communal animals.
        </p>
        <input type="file" accept=".csv" onChange={handleFile} className="input" style={{ marginBottom: 12 }} />
        {rows.length > 0 && <p style={{ fontSize: 13, marginBottom: 12 }}>{rows.length} row(s) ready to import.</p>}
        {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button className="btn btn-primary" disabled={rows.length === 0 || importing} onClick={runImport}>
          {importing ? "Importing…" : `Import ${rows.length || ""} animals`}
        </button>
      </div>
    </div>
  );
}
