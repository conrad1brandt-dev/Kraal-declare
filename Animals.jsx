import React, { useState, useEffect, useRef, useMemo } from "react";
import { Plus, X, Search, ScanLine, Upload, Download, ChevronLeft, GitBranch, Scale, Syringe, Heart, Pencil, Trash2, Camera, Baby } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Papa from "papaparse";
import { supabase } from "./supabaseClient";
import { dbRead, dbWrite, cacheGet } from "./offline";
import { useAnimalPhoto, compressImage, savePending, flushPhotos, removePhoto, deleteAnimalPhoto } from "./photos";
import { cleanBackground } from "./bgremove";

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
    // show the saved copy straight away, then refresh from the server
    const cA = cacheGet(`animals:${establishmentId}`);
    if (cA) {
      setAnimals(cA);
      const cO = cacheGet(`owners_lite:${establishmentId}`);
      if (cO) setOwners(cO);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let a = null, o = null;
    try {
    const res = await Promise.all([
      dbRead(`animals:${establishmentId}`, () =>
        supabase.from("animals").select("*, owners(full_name)").eq("establishment_id", establishmentId).order("created_at", { ascending: false })
      ),
      dbRead(`owners_lite:${establishmentId}`, () =>
        supabase.from("owners").select("id, full_name, brand_marks(*)").eq("establishment_id", establishmentId)
      ),
    ]);
    a = res[0].data; o = res[1].data;
    } catch {}
    if (a) setAnimals(a);
    if (o) setOwners(o);
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
    for (const a of filtered) {
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
    link.download = `animals-export-${speciesFilter !== "all" ? speciesFilter + "-" : ""}${todayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="container">Loading animals…</div>;

  if (selected) return <AnimalDetail animal={selected} allAnimals={animals} owners={owners} isAdmin={isAdmin} establishmentId={establishmentId} onBack={() => { setSelected(null); load(); }} onRefresh={load} />;

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
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <PhotoThumb animal={a} />
                <div>
                  <div className="font-tag" style={{ fontWeight: 600, fontSize: 14 }}>{a.eartag_number}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{a.species} · {a.breed_category || "—"} · {a.owners?.full_name || "shared/communal"}</div>
                </div>
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

const SHEEP_CATS = ["Lam", "Jong Ooie", "Groot Ooie", "Hamel/Kapater", "Ram"];
const CATTLE_CATS = ["Kalf", "Jong Vers", "Groot Koeie", "Tollie", "Bul"];

function categoryOptions(species) {
  if (species === "sheep" || species === "goats") return SHEEP_CATS;
  if (species === "cattle") return CATTLE_CATS;
  return null;
}

function suggestNext(animal) {
  const c = (animal.breed_category || "").toLowerCase();
  const female = String(animal.sex || "").toUpperCase().startsWith("F");
  if (animal.species === "cattle") {
    if (c.includes("kalf")) return female ? "Jong Vers" : "Tollie";
    if (c.includes("jong") || c.includes("vers")) return "Groot Koeie";
    return null;
  }
  if (animal.species === "sheep" || animal.species === "goats") {
    if (c.includes("jong")) return "Groot Ooie";
    if (c.includes("lam")) return female ? "Jong Ooie" : "Hamel/Kapater";
    return null;
  }
  return null;
}

function ageText(dob) {
  if (!dob) return "unknown";
  const d = new Date(dob);
  if (isNaN(d)) return "unknown";
  const n = new Date();
  let m = (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth());
  if (n.getDate() < d.getDate()) m--;
  if (m < 0) return "unknown";
  const y = Math.floor(m / 12), r = m % 12;
  return y > 0 ? `${y}y ${r}m` : `${r}m`;
}

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// Births: females in these categories can have lambs, kids or calves registered.
const BIRTH_CATS = ["groot ooie", "jong ooie", "groot koeie", "jong vers"];
export function canGiveBirth(an) {
  const female = String(an.sex || "").toUpperCase().startsWith("F");
  const c = (an.breed_category || "").toLowerCase().trim();
  return female && an.status === "active" && BIRTH_CATS.some((b) => c === b || c.startsWith(b.replace(/e$/, "")));
}
const GESTATION_DAYS = { sheep: 150, goats: 150, cattle: 283 };
const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Provisional tags follow the mother: 1234-L1, 1234-L2 (lambs/kids), 1234-K1 (calves).
// They are placeholders until the physical tags are in, and can be edited on each animal.
export function birthTags(mother, allAnimals, count) {
  const letter = mother.species === "cattle" ? "K" : "L";
  const prefix = `${mother.eartag_number}-${letter}`;
  const used = new Set(allAnimals.filter((a) => a.owner_id === mother.owner_id).map((a) => a.eartag_number));
  const out = [];
  for (let n = 1; out.length < count; n++) if (!used.has(prefix + n)) out.push(prefix + n);
  return out;
}

// Saves a birth: the newborns, plus the birth on the mother's breeding record.
// Safe to run again (offline replay): existing tags are skipped, the birth is logged once.
export async function runBirthInsert(estId, p) {
  const rows = p.young.map((y) => ({
    establishment_id: estId, owner_id: p.owner_id, brand_mark_id: p.brand_mark_id || null,
    eartag_number: y.eartag_number, species: p.species, breed_category: p.category,
    sex: y.sex, dob: p.dob, status: "active", dam_id: p.dam_id, sire_id: p.sire_id || null,
  }));
  const ins = await supabase.from("animals").upsert(rows, { onConflict: "owner_id,eartag_number", ignoreDuplicates: true });
  if (ins.error) return ins;
  const notes = `${p.young.length} born: ${p.young.map((y) => `${y.eartag_number} (${y.sex === "F" ? "F" : "M"})`).join(", ")}`;
  if (p.event_id) {
    return supabase.from("breeding_events").update({ actual_birth: p.dob, offspring_count: p.young.length, sire_id: p.sire_id || null, notes }).eq("id", p.event_id);
  }
  const dup = await supabase.from("breeding_events").select("id").eq("dam_id", p.dam_id).eq("actual_birth", p.dob).limit(1);
  if (dup.error) return dup;
  if (dup.data && dup.data.length) return { error: null };
  return supabase.from("breeding_events").insert({
    dam_id: p.dam_id, sire_id: p.sire_id || null, mated_date: addDays(p.dob, -(GESTATION_DAYS[p.species] || 150)),
    actual_birth: p.dob, offspring_count: p.young.length, notes: `${notes} · mating date estimated`,
  });
}

function PhotoThumb({ animal }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") { setVis(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVis(true); io.disconnect(); } });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const { url, pending } = useAnimalPhoto(animal, vis);
  return (
    <div ref={ref} style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", flex: "none", background: "var(--green-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)", position: "relative" }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Camera size={18} style={{ opacity: 0.45 }} />}
      {pending && <span style={{ position: "absolute", right: 3, bottom: 3, width: 9, height: 9, borderRadius: "50%", background: "#d9a21b", border: "1.5px solid #fff" }} />}
    </div>
  );
}

function AnimalDetail({ animal, allAnimals, owners, isAdmin, establishmentId, onBack, onRefresh }) {
  const [an, setAn] = useState(animal);
  const dam = allAnimals.find((a) => a.id === an.dam_id);
  const sire = allAnimals.find((a) => a.id === an.sire_id);
  const offspring = allAnimals.filter((a) => a.dam_id === an.id);
  const isFemale = String(an.sex || "").toUpperCase().startsWith("F");
  const [tab, setTab] = useState("record");
  const [weights, setWeights] = useState([]);
  const [healthEvents, setHealthEvents] = useState([]);
  const [breeding, setBreeding] = useState([]);
  const [showAddWeight, setShowAddWeight] = useState(false);
  const [showAddHealth, setShowAddHealth] = useState(false);
  const [showAddBreeding, setShowAddBreeding] = useState(false);
  const [showBirth, setShowBirth] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanPreview, setCleanPreview] = useState(null); // { blob, url }
  const camRef = useRef(null);
  const galRef = useRef(null);
  const { url: photoUrl, pending: photoPending } = useAnimalPhoto(an);
  const today = todayISO();

  async function updateAnimal(form) {
    await supabase.from("animals").update(form).eq("id", animal.id);
    setShowEdit(false);
    onBack();
  }

  async function deleteAnimal() {
    if (!confirm(`Delete animal ${an.eartag_number}? This removes its photo, weight, health, and breeding history too, and cannot be undone.`)) return;
    setDeleting(true);
    const { data: cur } = await supabase.from("animals").select("photo_path").eq("id", animal.id).maybeSingle();
    await supabase.from("animals").update({ dam_id: null }).eq("dam_id", animal.id);
    await supabase.from("animals").update({ sire_id: null }).eq("sire_id", animal.id);
    await supabase.from("weights").delete().eq("animal_id", animal.id);
    await supabase.from("health_events").delete().eq("animal_id", animal.id);
    await supabase.from("breeding_events").delete().eq("dam_id", animal.id);
    await supabase.from("animals").delete().eq("id", animal.id);
    await deleteAnimalPhoto(cur && cur.photo_path, animal.id);
    setDeleting(false);
    onBack();
  }

  useEffect(() => { loadEvents(); }, [animal.id]);

  async function loadEvents() {
    const [wr, hr, br] = await Promise.all([
      dbRead(`weights:${animal.id}`, () => supabase.from("weights").select("*").eq("animal_id", animal.id).order("date", { ascending: false })),
      dbRead(`health_events:${animal.id}`, () => supabase.from("health_events").select("*").eq("animal_id", animal.id).order("date", { ascending: false })),
      dbRead(`breeding_events:${animal.id}`, () => supabase.from("breeding_events").select("*").eq("dam_id", animal.id).order("mated_date", { ascending: false })),
    ]);
    const server = (wr && wr.data) || [];
    // keep weights saved offline that the server has not confirmed yet
    setWeights((prev) => {
      const tmps = prev.filter((x) => String(x.id).startsWith("tmp-") && !server.some((s) => s.date === x.date && Number(s.kg) === Number(x.kg)));
      return [...tmps, ...server];
    });
    setHealthEvents((hr && hr.data) || []);
    setBreeding((br && br.data) || []);
  }

  async function addWeight(form) {
    setWeights((prev) => [{ id: `tmp-${Date.now()}`, animal_id: animal.id, ...form }, ...prev]);
    setShowAddWeight(false);
    await dbWrite(
      () => supabase.from("weights").insert({ animal_id: animal.id, ...form }),
      { key: "weights:insert", payload: { animal_id: animal.id, ...form } }
    );
    loadEvents();
  }
  async function deleteWeight(w) {
    if (!confirm(`Delete the ${w.kg} kg weight from ${w.date}?`)) return;
    const { error } = await supabase.from("weights").delete().eq("id", w.id);
    if (error) { alert("Could not delete: " + error.message); return; }
    setWeights((prev) => prev.filter((x) => x.id !== w.id));
  }
  async function addHealth(form) {
    await supabase.from("health_events").insert({ establishment_id: establishmentId, animal_id: animal.id, owner_id: an.owner_id, species: an.species, ...form });
    setShowAddHealth(false);
    loadEvents();
  }
  async function addBreeding(form) {
    await supabase.from("breeding_events").insert({ dam_id: animal.id, ...form });
    setShowAddBreeding(false);
    loadEvents();
  }
  async function registerBirth(payload) {
    const res = await dbWrite(() => runBirthInsert(establishmentId, payload), { key: "birth:insert", payload });
    setShowBirth(false);
    if (res.queued) alert("No signal – the birth is saved on this phone and will upload as soon as you have signal.");
    loadEvents();
    if (onRefresh) onRefresh();
  }

  async function onPickPhoto(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusyPhoto(true);
    try {
      const blob = await compressImage(f);
      await savePending(animal.id, establishmentId, blob);
      setShowPhotoMenu(false);
      flushPhotos();
    } catch (err) {
      alert("Could not use that photo: " + (err.message || err));
    }
    setBusyPhoto(false);
  }

  async function onCleanBackground() {
    if (!photoUrl) return;
    if (!navigator.onLine) { alert("Cleaning the background needs signal the first time. Try again when you have signal."); return; }
    setCleaning(true);
    try {
      const src = await (await fetch(photoUrl)).blob();
      const out = await cleanBackground(src);
      setCleanPreview({ blob: out, url: URL.createObjectURL(out) });
      setShowPhotoMenu(false);
    } catch (err) {
      alert("Could not clean the background: " + (err.message || err));
    }
    setCleaning(false);
  }

  function closeCleanPreview() {
    if (cleanPreview) URL.revokeObjectURL(cleanPreview.url);
    setCleanPreview(null);
  }

  async function useCleanPhoto() {
    try {
      await savePending(animal.id, establishmentId, cleanPreview.blob);
      flushPhotos();
      closeCleanPreview();
    } catch (err) {
      alert("Could not save the photo: " + (err.message || err));
    }
  }

  async function onRemovePhoto() {
    if (!confirm("Remove this photo?")) return;
    try { await removePhoto(an); setShowPhotoMenu(false); } catch (err) { alert(err.message || String(err)); }
  }

  async function moveCategory(cat) {
    const { error } = await supabase.from("animals").update({ breed_category: cat }).eq("id", animal.id);
    if (error) { alert("Could not change the category (this needs signal): " + error.message); return; }
    setAn({ ...an, breed_category: cat });
    setShowMove(false);
  }

  const catOptions = categoryOptions(an.species);
  const suggestion = suggestNext(an);
  const femalesForSire = allAnimals.filter((a) => a.sex === "M" && a.id !== an.id);

  const upcoming = healthEvents.flatMap((h) => {
    const out = [];
    if (h.withdrawal_end && h.withdrawal_end >= today) out.push({ key: h.id + "w", date: h.withdrawal_end, title: `Withdrawal: ${h.event_type}${h.note ? ` – ${h.note}` : ""}`, warn: true });
    if (h.next_due && h.next_due >= today) out.push({ key: h.id + "n", date: h.next_due, title: `Due: ${h.event_type}`, warn: false });
    return out;
  }).sort((a, b) => (a.date < b.date ? -1 : 1));

  const kv = [
    ["Species", an.species],
    ["Sex", isFemale ? "Female" : "Male"],
    ["Category", an.breed_category || "—"],
    ["Born", an.dob || "unknown"],
    ["Age", ageText(an.dob)],
    ["Status", an.status],
  ];

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

      <div className="font-tag" style={{ fontSize: 24, fontWeight: 700 }}>{an.eartag_number}</div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 10 }}>Owner: {an.owners?.full_name || "shared/communal"}</p>
      {showBirth && <BirthModal mother={an} allAnimals={allAnimals} breeding={breeding} onClose={() => setShowBirth(false)} onSave={registerBirth} />}
      {showEdit && <EditAnimalModal animal={an} owners={owners} allAnimals={allAnimals} onClose={() => setShowEdit(false)} onSave={updateAnimal} />}

      <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
        <div style={{ flex: 1, fontSize: 13 }}>
          {kv.map(([k, v]) => (
            <div key={k} className="row-between" style={{ padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ color: "var(--ink-soft)" }}>{k}</span><span style={{ fontWeight: 500, textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ width: 118, height: 140, borderRadius: 12, overflow: "hidden", position: "relative", flex: "none", background: "var(--green-soft)" }}>
          {photoUrl ? (
            <img src={photoUrl} alt="" onClick={() => setViewPhoto(true)} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }} />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)" }}><Camera size={30} style={{ opacity: 0.5 }} /></div>
          )}
          {isAdmin && (
            <button onClick={() => setShowPhotoMenu(true)} style={{ position: "absolute", right: 5, bottom: 5, background: "#fff", border: "none", borderRadius: 99, padding: "4px 9px", fontSize: 11, fontWeight: 600, color: "var(--green)", cursor: "pointer", boxShadow: "0 1px 4px #0004" }}>
              {photoUrl ? "Change" : "Add photo"}
            </button>
          )}
          {photoPending && <span style={{ position: "absolute", left: 5, top: 5, background: "#f3e2b3", color: "#7a5a16", borderRadius: 99, padding: "2px 7px", fontSize: 10, fontWeight: 600 }}>Waiting to upload</span>}
        </div>
      </div>

      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPickPhoto} />
      <input ref={galRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickPhoto} />

      <div className="tabs" style={{ marginTop: 12 }}>
        <button className={`tab ${tab === "record" ? "active" : ""}`} onClick={() => setTab("record")}>Record</button>
        <button className={`tab ${tab === "health" ? "active" : ""}`} onClick={() => setTab("health")}>Health</button>
        <button className={`tab ${tab === "weight" ? "active" : ""}`} onClick={() => setTab("weight")}>Weights</button>
        {isFemale && <button className={`tab ${tab === "breeding" ? "active" : ""}`} onClick={() => setTab("breeding")}>Breeding</button>}
      </div>

      {tab === "record" && (
        <div className="stack">
          {isAdmin && canGiveBirth(an) && (
            <button className="btn btn-primary" style={{ width: "100%", fontWeight: 600 }} onClick={() => setShowBirth(true)}>
              <Baby size={16} /> Register birth ({an.species === "cattle" ? "calf" : an.species === "goats" ? "kid" : "lamb"})
            </button>
          )}
          {isAdmin && catOptions && (
            <button className="btn btn-secondary" style={{ width: "100%", fontWeight: 600 }} onClick={() => setShowMove(true)}>
              {suggestion ? `⇧ Move to ${suggestion}` : "Change category"}
            </button>
          )}
          {upcoming.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>Upcoming</div>
              {upcoming.map((u) => {
                const left = daysBetween(today, u.date);
                return (
                  <div key={u.key} className="row-between" style={{ background: u.warn ? "var(--gold-soft)" : "var(--green-soft)", borderRadius: 8, padding: "8px 10px", marginBottom: 6, fontSize: 13 }}>
                    <div><div style={{ fontWeight: 600 }}>{u.title}</div><div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{u.warn ? "Ends" : "On"} {u.date}</div></div>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{left <= 0 ? "today" : `${left} day${left === 1 ? "" : "s"}`}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="card" style={{ padding: 16 }}>
            <div className="field-label" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><GitBranch size={13} /> Parentage</div>
            <div style={{ fontSize: 14 }}>Dam: {dam ? dam.eartag_number : "not linked"}</div>
            <div style={{ fontSize: 14 }}>Sire: {sire ? sire.eartag_number : "not linked"}</div>
          </div>
          {offspring.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>Offspring ({offspring.length})</div>
              {offspring.map((o) => <div key={o.id} style={{ fontSize: 14, padding: "4px 0" }}><span className="font-tag">{o.eartag_number}</span> — {String(o.sex).toUpperCase().startsWith("F") ? "F" : "M"}{o.dob ? `, born ${o.dob}` : ""}{o.status !== "active" ? ` — ${o.status}` : ""}</div>)}
            </div>
          )}
        </div>
      )}

      {tab === "weight" && (
        <WeightsPanel weights={weights} isAdmin={isAdmin} showAdd={showAddWeight} setShowAdd={setShowAddWeight} onAdd={addWeight} onDelete={deleteWeight} />
      )}

      {tab === "health" && (
        <div className="card" style={{ padding: 16 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <div className="field-label" style={{ display: "flex", alignItems: "center", gap: 4 }}><Syringe size={13} /> Treatments & health</div>
            {isAdmin && <button onClick={() => setShowAddHealth(true)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer" }}><Plus size={16} /></button>}
          </div>
          {healthEvents.length === 0 ? <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No health events logged</p> :
            healthEvents.map((h) => {
              const inWithdrawal = h.withdrawal_end && h.withdrawal_end >= today;
              return (
                <div key={h.id} style={{ fontSize: 13, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                  <div className="row-between">
                    <span style={{ fontWeight: 600 }}>{h.event_type}</span>
                    <span className="font-tag">{h.date}</span>
                  </div>
                  {h.batch_no && <div style={{ color: "var(--ink-soft)" }}>Batch {h.batch_no}</div>}
                  {h.withdrawal_end && (
                    <div style={{ fontSize: 12, color: inWithdrawal ? "#7a5a16" : "var(--ink-soft)", fontWeight: inWithdrawal ? 600 : 400 }}>
                      {inWithdrawal ? "In withdrawal until " : "Withdrawal ended "}{h.withdrawal_end}
                    </div>
                  )}
                  {h.note && <div style={{ color: "var(--ink-soft)" }}>{h.note}</div>}
                  {h.next_due && <div style={{ color: "var(--rust)", fontSize: 12 }}>next due {h.next_due}</div>}
                </div>
              );
            })}
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

      {showPhotoMenu && (
        <div className="modal-overlay" onClick={() => setShowPhotoMenu(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Animal photo</h3>
              <button onClick={() => setShowPhotoMenu(false)} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div className="stack">
              <button className="btn btn-primary" disabled={busyPhoto} onClick={() => camRef.current && camRef.current.click()}>{busyPhoto ? "Working…" : "📷 Take a photo"}</button>
              <button className="btn btn-secondary" disabled={busyPhoto} onClick={() => galRef.current && galRef.current.click()}>🖼 Choose from gallery</button>
              {photoUrl && <button className="btn btn-secondary" disabled={cleaning || busyPhoto} onClick={onCleanBackground}>{cleaning ? "Cleaning… (first time can take a minute)" : "✨ Clean background"}</button>}
              {(photoUrl || photoPending) && <button className="btn btn-secondary" style={{ color: "var(--red)" }} onClick={onRemovePhoto}>🗑 Remove photo</button>}
              <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Works without signal. The photo is saved on this phone and uploads by itself when signal returns. Tip: side-on, with the ear tag visible.</p>
            </div>
          </div>
        </div>
      )}

      {showMove && catOptions && (
        <div className="modal-overlay" onClick={() => setShowMove(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Change category</h3>
              <button onClick={() => setShowMove(false)} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
              Now: <b>{an.breed_category || "—"}</b>. Totals in Owners & Brands, declarations and the farm update will count this animal in the new category.
            </p>
            <div className="stack">
              {catOptions.map((c) => (
                <button key={c} className={`btn ${c === suggestion ? "btn-primary" : "btn-secondary"}`} onClick={() => { if (confirm(`Move ${an.eartag_number} to ${c}?`)) moveCategory(c); }}>
                  {c}{c === suggestion ? "  (suggested)" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {cleanPreview && (
        <div className="modal-overlay" onClick={closeCleanPreview}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Clean background</h3>
              <button onClick={closeCleanPreview} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <img src={photoUrl} alt="" style={{ width: "100%", borderRadius: 8 }} />
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Before</div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <img src={cleanPreview.url} alt="" style={{ width: "100%", borderRadius: 8 }} />
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>After</div>
              </div>
            </div>
            <div className="stack">
              <button className="btn btn-primary" onClick={useCleanPhoto}>Use this photo</button>
              <button className="btn btn-secondary" onClick={closeCleanPreview}>Keep the original</button>
              <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Works best when the whole animal is in the photo, side-on, and not too far away.</p>
            </div>
          </div>
        </div>
      )}

      {viewPhoto && photoUrl && (
        <div onClick={() => setViewPhoto(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <img src={photoUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

function WeightsPanel({ weights, isAdmin, showAdd, setShowAdd, onAdd, onDelete }) {
  const sorted = [...weights].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const adg = (a, b) => {
    const d = daysBetween(a.date, b.date);
    return d > 0 ? (Number(b.kg) - Number(a.kg)) / d : null;
  };
  const lastGain = prev ? Number(last.kg) - Number(prev.kg) : null;
  const lastAdg = prev ? adg(prev, last) : null;
  const overallGain = sorted.length > 2 ? Number(last.kg) - Number(first.kg) : null;
  const overallAdg = sorted.length > 2 ? adg(first, last) : null;
  const sign = (n) => (n > 0 ? "+" : "");
  const chartData = sorted.map((w) => ({ date: w.date.slice(5), kg: Number(w.kg) }));

  return (
    <div className="stack">
      {last && (
        <div className="grid-2">
          <div className="card" style={{ padding: 14 }}>
            <div className="field-label">Current weight</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{Number(last.kg)} kg</div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{last.date}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="field-label">Since last weighing</div>
            {lastGain === null ? <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>Need 2 weights</div> : (
              <>
                <div style={{ fontSize: 22, fontWeight: 700, color: lastGain >= 0 ? "var(--green)" : "var(--red)" }}>{sign(lastGain)}{lastGain.toFixed(1)} kg</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{lastAdg !== null ? `${sign(lastAdg)}${lastAdg.toFixed(2)} kg/day` : ""} over {daysBetween(prev.date, last.date)} days</div>
              </>
            )}
          </div>
        </div>
      )}
      {overallGain !== null && (
        <div className="card" style={{ padding: 14, fontSize: 13 }}>
          Since first weighing ({first.date}): <b>{sign(overallGain)}{overallGain.toFixed(1)} kg</b>{overallAdg !== null && <> · average <b>{sign(overallAdg)}{overallAdg.toFixed(2)} kg/day</b></>}
        </div>
      )}
      {chartData.length >= 2 && (
        <div className="card" style={{ padding: "14px 6px 6px 0" }}>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ left: 0, right: 14, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#e4dfd2" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 10 }} width={34} />
              <Tooltip formatter={(v) => [`${v} kg`, "Weight"]} />
              <Line type="monotone" dataKey="kg" stroke="#2f5d3a" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="card" style={{ padding: 16 }}>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <div className="field-label" style={{ display: "flex", alignItems: "center", gap: 4 }}><Scale size={13} /> Weight log</div>
          {isAdmin && <button onClick={() => setShowAdd(true)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer" }}><Plus size={16} /></button>}
        </div>
        {sorted.length === 0 ? <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No weights logged</p> :
          [...sorted].reverse().map((w) => {
            const waiting = String(w.id).startsWith("tmp-");
            return (
              <div key={w.id} className="row-between" style={{ fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span>{w.date}{waiting && <span style={{ color: "#7a5a16", fontSize: 11 }}> · waiting to sync</span>}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="font-tag" style={{ fontWeight: 600 }}>{Number(w.kg)} kg</span>
                  {isAdmin && !waiting && <button onClick={() => onDelete(w)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", display: "flex" }}><Trash2 size={14} /></button>}
                </span>
              </div>
            );
          })}
        {showAdd && (
          <div className="stack" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
            <QuickWeightForm onSave={onAdd} onCancel={() => setShowAdd(false)} />
          </div>
        )}
      </div>
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
    const payload = { ...form, owner_id: form.owner_id || null, brand_mark_id: (Array.isArray(selectedOwner?.brand_marks) ? selectedOwner.brand_marks[0] : selectedOwner?.brand_marks)?.id || null, dob: form.dob || null };
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
      brand_mark_id: (Array.isArray(selectedOwner?.brand_marks) ? selectedOwner.brand_marks[0] : selectedOwner?.brand_marks)?.id || animal.brand_mark_id || null,
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
              <option value="deceased">Deceased</option>
              <option value="stolen">Stolen</option>
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
        brand_mark_id: (Array.isArray(owner?.brand_marks) ? owner.brand_marks[0] : owner?.brand_marks)?.id || null,
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

function BirthModal({ mother, allAnimals, breeding, onClose, onSave }) {
  const young = mother.species === "cattle" ? "calf" : mother.species === "goats" ? "kid" : "lamb";
  const open = breeding.find((b) => !b.actual_birth);
  const sires = allAnimals.filter((a) => a.species === mother.species && String(a.sex).toUpperCase().startsWith("M") && a.status === "active");
  const [dob, setDob] = useState(todayISO());
  const [count, setCount] = useState(1);
  const [sexes, setSexes] = useState(["F", "F", "F"]);
  const [sireId, setSireId] = useState((open && open.sire_id) || "");
  const [busy, setBusy] = useState(false);
  const tags = birthTags(mother, allAnimals, count);
  const category = mother.species === "cattle" ? "Kalf" : "Lam";

  async function save() {
    if (dob > todayISO()) { alert("The birth date can't be in the future."); return; }
    setBusy(true);
    await onSave({
      dam_id: mother.id, owner_id: mother.owner_id, brand_mark_id: mother.brand_mark_id || null,
      species: mother.species, category, dob, sire_id: sireId || null, event_id: open ? open.id : null,
      young: tags.map((t, i) => ({ eartag_number: t, sex: sexes[i] })),
    });
    setBusy(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 4 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Register birth</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>Mother <span className="font-tag">{mother.eartag_number}</span> · {mother.owners?.full_name || "shared"}</p>
        <div className="stack">
          <div className="field"><span className="field-label">Date of birth</span>
            <input type="date" className="input" value={dob} max={todayISO()} onChange={(e) => setDob(e.target.value)} />
          </div>
          <div className="field"><span className="field-label">How many born?</span>
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 2, 3].map((n) => (
                <button key={n} className={`btn ${count === n ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1 }} onClick={() => setCount(n)}>
                  {n === 1 ? "1" : n === 2 ? "2 (twins)" : "3"}
                </button>
              ))}
            </div>
          </div>
          {tags.map((t, i) => (
            <div key={t} className="row-between" style={{ gap: 8 }}>
              <span className="font-tag" style={{ fontWeight: 600, fontSize: 14 }}>{t}</span>
              <div style={{ display: "flex", gap: 6 }}>
                {[["F", "Ooi/Vers"], ["M", "Ram/Bul"]].map(([v]) => (
                  <button key={v} className={`btn ${sexes[i] === v ? "btn-primary" : "btn-secondary"}`} style={{ padding: "6px 14px" }}
                    onClick={() => setSexes((s) => s.map((x, j) => (j === i ? v : x)))}>
                    {v === "F" ? "Female" : "Male"}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="field"><span className="field-label">Sire (optional)</span>
            <select className="input" value={sireId} onChange={(e) => setSireId(e.target.value)}>
              <option value="">Unknown</option>
              {sires.map((s) => <option key={s.id} value={s.id}>{s.eartag_number}{s.breed_category ? ` – ${s.breed_category}` : ""}</option>)}
            </select>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Each {young} is added as <b>{category}</b> under the same owner, linked to its mother{open ? ", and her open mating record is marked as born" : ""}.
            The tags are temporary – change them on each animal once the physical tags are in.
          </p>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : `Save ${count} ${count > 1 ? (young === "calf" ? "calves" : young + "s") : young}`}</button>
        </div>
      </div>
    </div>
  );
}
