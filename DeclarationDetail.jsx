import React, { useState, useEffect } from "react";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { supabase } from "./supabaseClient";

const PERIOD_LABEL = { jan_jun: "Jan – Jun", jul_dec: "Jul – Dec" };

function periodRange(period, year) {
  return period === "jan_jun" ? { start: `${year}-01-01`, end: `${year}-06-30` } : { start: `${year}-07-01`, end: `${year}-12-31` };
}
function ageYears(dob) {
  if (!dob) return null;
  return (new Date() - new Date(dob)) / (365.25 * 24 * 3600 * 1000);
}

export default function DeclarationDetail({ declaration, isAdmin, onBack }) {
  const [tab, setTab] = useState("overview");
  return (
    <div className="container">
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--ink-soft)", fontSize: 14, fontWeight: 500, marginBottom: 12, cursor: "pointer" }}>
        <ChevronLeft size={16} /> Back
      </button>
      <h2 className="font-display" style={{ fontSize: 22, fontWeight: 700 }}>{PERIOD_LABEL[declaration.period]} {declaration.year}</h2>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>Farm-wide declaration — numbers are pulled from your records automatically, and can be adjusted before you submit.</p>

      <div className="tabs">
        <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
        <button className={`tab ${tab === "numbers" ? "active" : ""}`} onClick={() => setTab("numbers")}>Livestock Numbers</button>
        <button className={`tab ${tab === "health" ? "active" : ""}`} onClick={() => setTab("health")}>Losses & Health</button>
        <button className={`tab ${tab === "feed" ? "active" : ""}`} onClick={() => setTab("feed")}>Feed / Vaccines / Meds</button>
      </div>

      {tab === "overview" && <OverviewTab declaration={declaration} isAdmin={isAdmin} />}
      {tab === "numbers" && <NumbersTab declaration={declaration} isAdmin={isAdmin} />}
      {tab === "health" && <HealthTab declaration={declaration} isAdmin={isAdmin} />}
      {tab === "feed" && <FeedTab declaration={declaration} isAdmin={isAdmin} />}
    </div>
  );
}

function YesNoNA({ value, onChange, disabled }) {
  const opts = [{ v: true, l: "Yes" }, { v: false, l: "No" }, { v: null, l: "N/A" }];
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {opts.map((o) => (
        <button key={o.l} disabled={disabled} onClick={() => onChange(o.v)}
          style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--line)",
            background: value === o.v ? "var(--green)" : "#fff", color: value === o.v ? "#fff" : "var(--ink)", cursor: disabled ? "default" : "pointer" }}>{o.l}</button>
      ))}
    </div>
  );
}

function OverviewTab({ declaration, isAdmin }) {
  const [form, setForm] = useState({
    cattle_identified: declaration.cattle_identified, sheep_identified: declaration.sheep_identified,
    goats_identified: declaration.goats_identified, other_identified: declaration.other_identified,
    doc_livestock_register: declaration.doc_livestock_register, doc_feed_register: declaration.doc_feed_register,
    doc_vet_drug_register: declaration.doc_vet_drug_register, doc_employee_training: declaration.doc_employee_training,
    doc_departure_arrival: declaration.doc_departure_arrival, movements_up_to_date: declaration.movements_up_to_date,
    imported_animals_count: declaration.imported_animals_count || 0,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function save() { setSaving(true); await supabase.from("declarations").update(form).eq("id", declaration.id); setSaving(false); }
  const boolField = (key, label) => (
    <div className="row-between" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <span style={{ fontSize: 14 }}>{label}</span><YesNoNA value={form[key]} onChange={(v) => set(key, v)} disabled={!isAdmin} />
    </div>
  );
  return (
    <div className="stack">
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 4 }}>6. Livestock identification — marked, branded, tagged, registered?</div>
        {boolField("cattle_identified", "Cattle")}{boolField("sheep_identified", "Sheep")}{boolField("goats_identified", "Goats")}{boolField("other_identified", "Other")}
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 4 }}>7. Documentation & records up to date</div>
        {boolField("doc_livestock_register", "Livestock Register")}{boolField("doc_feed_register", "Feed Register")}
        {boolField("doc_vet_drug_register", "Veterinary Drug & Treatment Register")}{boolField("doc_employee_training", "Employee Training")}
        {boolField("doc_departure_arrival", "Departure & Arrival records")}
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 4 }}>8. Traceability</div>
        {boolField("movements_up_to_date", "Movement records reported to DVS")}
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>5. Number of imported animals</div>
        <input type="number" className="input" disabled={!isAdmin} value={form.imported_animals_count} onChange={(e) => set("imported_animals_count", parseInt(e.target.value) || 0)} />
      </div>
      {isAdmin && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save overview"}</button>}
    </div>
  );
}

const NUMBER_FIELDS = [
  ["beef_cattle", "Beef Cattle"], ["dairy_cattle", "Dairy Cattle"], ["karakul", "Karakul"], ["dorper", "Dorper"], ["other_sheep", "Other Sheep"],
  ["boerbok", "Boerbok"], ["other_goats", "Other Goats"], ["poultry", "Poultry"], ["ostriches", "Ostriches"],
  ["horses", "Horses"], ["donkeys", "Donkeys"], ["mules", "Mules"], ["pigs", "Pigs"],
];
const BREEDING_FIELDS = [
  ["bulls", "Bulls"], ["cows", "Cows"], ["heifers", "Heifers"], ["oxen", "Oxen"],
  ["calves_male_lt1", "Calves Male < 1yr"], ["calves_female_lt1", "Calves Female < 1yr"],
  ["sheep_1yr_plus", "Sheep 1yr+"], ["goats_1yr_plus", "Goats 1yr+"],
];

async function computeLivestockNumbers(establishmentId) {
  const { data: animals } = await supabase.from("animals").select("species, breed_category, sex, dob, status").eq("establishment_id", establishmentId).eq("status", "active");
  const n = Object.fromEntries([...NUMBER_FIELDS, ...BREEDING_FIELDS].map(([k]) => [k, 0]));
  (animals || []).forEach((a) => {
    const cat = (a.breed_category || "").toLowerCase();
    const age = ageYears(a.dob);
    if (a.species === "cattle") {
      n.beef_cattle++;
      if (age !== null && age < 1) { a.sex === "M" ? n.calves_male_lt1++ : n.calves_female_lt1++; }
      else if (a.sex === "F") n.cows++; else n.bulls++;
    } else if (a.species === "sheep") {
      if (cat.includes("karakul")) n.karakul++; else if (cat.includes("dorper")) n.dorper++; else n.other_sheep++;
      if (age !== null && age >= 1) n.sheep_1yr_plus++;
    } else if (a.species === "goats") {
      if (cat.includes("boerbok")) n.boerbok++; else n.other_goats++;
      if (age !== null && age >= 1) n.goats_1yr_plus++;
    } else if (n[a.species] !== undefined) n[a.species]++;
  });
  return n;
}

function NumbersTab({ declaration, isAdmin }) {
  const [numbers, setNumbers] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => { load(); }, [declaration.id]);
  async function load() {
    const { data } = await supabase.from("livestock_numbers").select("*").eq("declaration_id", declaration.id).maybeSingle();
    if (data) setNumbers(data);
    else {
      const auto = await computeLivestockNumbers(declaration.establishment_id);
      setNumbers(auto);
    }
  }
  async function recalc() {
    setRecalculating(true);
    const auto = await computeLivestockNumbers(declaration.establishment_id);
    setNumbers(auto);
    setRecalculating(false);
  }
  const set = (k, v) => setNumbers((n) => ({ ...n, [k]: parseInt(v) || 0 }));
  async function save() {
    setSaving(true);
    await supabase.from("livestock_numbers").upsert({ declaration_id: declaration.id, ...numbers }, { onConflict: "declaration_id" });
    setSaving(false);
  }
  if (!numbers) return <p>Loading…</p>;

  return (
    <div className="stack">
      {isAdmin && (
        <button className="btn btn-secondary" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={recalc} disabled={recalculating}>
          <RefreshCw size={14} /> {recalculating ? "Recalculating…" : "Recalculate from live animal data"}
        </button>
      )}
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Livestock numbers</div>
        <div className="grid-2">
          {NUMBER_FIELDS.map(([k, label]) => (
            <div className="field" key={k}><span className="field-label">{label}</span><input type="number" className="input" disabled={!isAdmin} value={numbers[k]} onChange={(e) => set(k, e.target.value)} /></div>
          ))}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Breeding (auto-estimated from age/sex — check before submitting)</div>
        <div className="grid-2">
          {BREEDING_FIELDS.map(([k, label]) => (
            <div className="field" key={k}><span className="field-label">{label}</span><input type="number" className="input" disabled={!isAdmin} value={numbers[k]} onChange={(e) => set(k, e.target.value)} /></div>
          ))}
        </div>
      </div>
      {isAdmin && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save numbers"}</button>}
    </div>
  );
}

function HealthTab({ declaration, isAdmin }) {
  const [summary, setSummary] = useState(null);
  const [flags, setFlags] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [declaration.id]);
  async function load() {
    const { start, end } = periodRange(declaration.period, declaration.year);
    const eid = declaration.establishment_id;
    const [{ data: predators }, { data: thefts }, { data: diseases }, { data: slaughters }, { data: flagRow }] = await Promise.all([
      supabase.from("predator_losses").select("*").eq("establishment_id", eid).gte("date", start).lte("date", end),
      supabase.from("theft_losses").select("*").eq("establishment_id", eid).gte("date", start).lte("date", end),
      supabase.from("disease_records").select("*").eq("establishment_id", eid).gte("date", start).lte("date", end),
      supabase.from("slaughter_records").select("*, animals(species)").eq("establishment_id", eid).gte("date", start).lte("date", end),
      supabase.from("health_flags").select("*").eq("declaration_id", declaration.id).maybeSingle(),
    ]);
    setSummary({ predators: predators || [], thefts: thefts || [], diseases: diseases || [], slaughters: slaughters || [] });
    setFlags(flagRow || { abortions_cattle: 0, abortions_sheep: 0, abortions_goats: 0, fmd_suspected: null, sheep_scab_suspected: null, ticks_cattle: null, ticks_sheep_goats: null });
  }
  const setF = (k, v) => setFlags((f) => ({ ...f, [k]: v }));
  async function save() { setSaving(true); await supabase.from("health_flags").upsert({ declaration_id: declaration.id, ...flags }, { onConflict: "declaration_id" }); setSaving(false); }
  if (!summary || !flags) return <p>Loading…</p>;

  const predatorTotal = summary.predators.reduce((s, p) => s + p.number_lost, 0);
  const theftTotal = summary.thefts.reduce((s, t) => s + t.number_stolen, 0);
  const ownUseSlaughtered = summary.slaughters.filter((s) => s.purpose === "own_consumption").length;
  const diseaseDeaths = summary.diseases.reduce((s, d) => s + (d.no_dead || 0), 0);
  const diseaseSick = summary.diseases.reduce((s, d) => s + (d.no_sick || 0), 0);

  return (
    <div className="stack">
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Auto-pulled for this period</div>
        <div className="row-between" style={{ fontSize: 14, padding: "4px 0" }}><span>Predator losses</span><span className="font-tag">{predatorTotal}</span></div>
        <div className="row-between" style={{ fontSize: 14, padding: "4px 0" }}><span>Stolen</span><span className="font-tag">{theftTotal}</span></div>
        <div className="row-between" style={{ fontSize: 14, padding: "4px 0" }}><span>Slaughtered for own use</span><span className="font-tag">{ownUseSlaughtered}</span></div>
        <div className="row-between" style={{ fontSize: 14, padding: "4px 0" }}><span>Disease — sick / dead</span><span className="font-tag">{diseaseSick} / {diseaseDeaths}</span></div>
        <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 8 }}>Log new losses or sickness anytime under Losses & Health — this updates automatically.</p>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Abortions & disease flags (entered manually)</div>
        <div className="grid-2" style={{ marginBottom: 10 }}>
          <div className="field"><span className="field-label">Abortions — cattle</span><input type="number" className="input" disabled={!isAdmin} value={flags.abortions_cattle} onChange={(e) => setF("abortions_cattle", parseInt(e.target.value) || 0)} /></div>
          <div className="field"><span className="field-label">Abortions — sheep</span><input type="number" className="input" disabled={!isAdmin} value={flags.abortions_sheep} onChange={(e) => setF("abortions_sheep", parseInt(e.target.value) || 0)} /></div>
          <div className="field"><span className="field-label">Abortions — goats</span><input type="number" className="input" disabled={!isAdmin} value={flags.abortions_goats} onChange={(e) => setF("abortions_goats", parseInt(e.target.value) || 0)} /></div>
        </div>
        <div className="row-between" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}><span style={{ fontSize: 14 }}>Suspected FMD</span><YesNoNA value={flags.fmd_suspected} onChange={(v) => setF("fmd_suspected", v)} disabled={!isAdmin} /></div>
        <div className="row-between" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}><span style={{ fontSize: 14 }}>Suspected Sheep Scab</span><YesNoNA value={flags.sheep_scab_suspected} onChange={(v) => setF("sheep_scab_suspected", v)} disabled={!isAdmin} /></div>
        <div className="row-between" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}><span style={{ fontSize: 14 }}>Ticks — cattle</span><YesNoNA value={flags.ticks_cattle} onChange={(v) => setF("ticks_cattle", v)} disabled={!isAdmin} /></div>
        <div className="row-between" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}><span style={{ fontSize: 14 }}>Ticks — sheep & goats</span><YesNoNA value={flags.ticks_sheep_goats} onChange={(v) => setF("ticks_sheep_goats", v)} disabled={!isAdmin} /></div>
        {isAdmin && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>}
      </div>
    </div>
  );
}

function FeedTab({ declaration, isAdmin }) {
  const [events, setEvents] = useState([]);
  const [feed, setFeed] = useState([]);
  const [flags, setFlags] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [declaration.id]);
  async function load() {
    const { start, end } = periodRange(declaration.period, declaration.year);
    const eid = declaration.establishment_id;
    const [{ data: ev }, { data: fd }, { data: flagRow }] = await Promise.all([
      supabase.from("health_events").select("event_type").eq("establishment_id", eid).gte("date", start).lte("date", end),
      supabase.from("feed_register").select("*").eq("establishment_id", eid).gte("date", start).lte("date", end),
      supabase.from("medicine_flags").select("*").eq("declaration_id", declaration.id).maybeSingle(),
    ]);
    setEvents(ev || []);
    setFeed(fd || []);
    setFlags(flagRow || { banned_substances_used: null, antibiotics_in_feed: null, vet_drugs_stored_correctly: null });
  }
  const setF = (k, v) => setFlags((f) => ({ ...f, [k]: v }));
  async function save() { setSaving(true); await supabase.from("medicine_flags").upsert({ declaration_id: declaration.id, ...flags }, { onConflict: "declaration_id" }); setSaving(false); }
  if (!flags) return <p>Loading…</p>;

  const counts = {};
  events.forEach((e) => { counts[e.event_type] = (counts[e.event_type] || 0) + 1; });

  return (
    <div className="stack">
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Health events this period</div>
        {Object.keys(counts).length === 0 ? <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>None recorded</p> :
          Object.entries(counts).map(([type, n]) => (
            <div key={type} className="row-between" style={{ fontSize: 14, padding: "4px 0" }}><span style={{ textTransform: "capitalize" }}>{type}</span><span className="font-tag">{n}</span></div>
          ))}
        <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 8 }}>Log via Losses & Health → Health, including CSV import for bulk deworming/vaccination.</p>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Feed register entries this period ({feed.length})</div>
        {feed.slice(0, 5).map((f) => <div key={f.id} style={{ fontSize: 13, padding: "4px 0" }}>{f.date} — {f.species} — {f.feed_ingredients}</div>)}
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Medicine & storage compliance</div>
        <div className="row-between" style={{ padding: "8px 0" }}><span style={{ fontSize: 14 }}>Vet drugs stored correctly</span><YesNoNA value={flags.vet_drugs_stored_correctly} onChange={(v) => setF("vet_drugs_stored_correctly", v)} disabled={!isAdmin} /></div>
        <div className="row-between" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}><span style={{ fontSize: 14 }}>Feed contains antibiotics</span><YesNoNA value={flags.antibiotics_in_feed} onChange={(v) => setF("antibiotics_in_feed", v)} disabled={!isAdmin} /></div>
        <div className="row-between" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}><span style={{ fontSize: 14 }}>Banned substances used</span><YesNoNA value={flags.banned_substances_used} onChange={(v) => setF("banned_substances_used", v)} disabled={!isAdmin} /></div>
        {isAdmin && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>}
      </div>
    </div>
  );
}
