import React, { useState, useEffect, useMemo } from "react";
import { ChevronLeft, Plus, X, Tag, Trash2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { dbRead } from "./offline";

// Official DVS ear tags issued to one owner: record the numbers, then give each animal its tag.
// Assigning makes the official number the animal's eartag and keeps the temporary ID as previous_tag.

export const normTag = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();
export const showTag = (s) => { const t = normTag(s); return /^\d{8}$/.test(t) ? `${t.slice(0, 4)} ${t.slice(4)}` : t; };
const todayISO = () => new Date().toISOString().slice(0, 10);
const SPECIES = [["cattle", "Cattle"], ["sheep", "Sheep"], ["goats", "Goats"]];

// "00105047, 00105054" or "00105047-00105055" or one per line
export function parseTagList(text) {
  const out = [];
  for (const part of String(text || "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = part.replace(/\s+/g, "").match(/^(\d+)\s*(?:-|to)\s*(\d+)$/i);
    if (m && m[1].length === m[2].length && Number(m[2]) >= Number(m[1]) && Number(m[2]) - Number(m[1]) <= 500) {
      for (let n = Number(m[1]); n <= Number(m[2]); n++) out.push(String(n).padStart(m[1].length, "0"));
    } else out.push(normTag(part));
  }
  return [...new Set(out)];
}

export async function assignTag(tag, animal) {
  if (normTag(animal.eartag_number) === normTag(tag.tag_number)) return { error: null };
  const prev = animal.previous_tag || animal.eartag_number;
  const a = await supabase.from("animals").update({ eartag_number: tag.tag_number, previous_tag: prev }).eq("id", animal.id);
  if (a.error) return a;
  return supabase.from("official_tags").update({ animal_id: animal.id, assigned_at: todayISO() }).eq("id", tag.id);
}

export async function unassignTag(tag, animal) {
  if (animal) {
    const back = animal.previous_tag || `${animal.eartag_number}-OLD`;
    const a = await supabase.from("animals").update({ eartag_number: back, previous_tag: null }).eq("id", animal.id);
    if (a.error) return a;
  }
  return supabase.from("official_tags").update({ animal_id: null, assigned_at: null }).eq("id", tag.id);
}

export default function OfficialTags({ owner, establishmentId, isAdmin, onBack }) {
  const name = owner.nickname || owner.full_name;
  const [tags, setTags] = useState(null);
  const [animals, setAnimals] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { load(); }, [owner.id]);

  async function load() {
    const [t, a] = await Promise.all([
      dbRead(`official_tags:${owner.id}`, () => supabase.from("official_tags").select("*").eq("owner_id", owner.id).order("tag_number")),
      dbRead(`owner_animals:${owner.id}`, () => supabase.from("animals").select("id, eartag_number, previous_tag, species, breed_category, sex, status").eq("owner_id", owner.id).eq("status", "active").order("species").order("eartag_number")),
    ]);
    if (t && t.error && !t.data) { setError("The tag list isn't set up in the database yet."); setTags([]); }
    else setTags((t && t.data) || []);
    setAnimals((a && a.data) || []);
  }

  const byAnimal = useMemo(() => Object.fromEntries((tags || []).filter((t) => t.animal_id).map((t) => [t.animal_id, t])), [tags]);
  const spare = (tags || []).filter((t) => !t.animal_id);
  const untagged = animals.filter((a) => !byAnimal[a.id]);

  async function run(fn) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res && res.error) { alert("Could not save (this needs signal): " + res.error.message); return false; }
    await load();
    return true;
  }

  function pick(animal, tagId) {
    const tag = (tags || []).find((t) => t.id === tagId);
    if (!tag) return;
    if (tag.species && tag.species !== animal.species && !confirm(`${showTag(tag.tag_number)} is a ${tag.species} tag but ${animal.eartag_number} is ${animal.species}. Assign anyway?`)) return;
    run(() => assignTag(tag, animal));
  }

  function release(tag) {
    const animal = animals.find((a) => a.id === tag.animal_id);
    if (!confirm(`Take ${showTag(tag.tag_number)} off ${animal ? animal.previous_tag || animal.eartag_number : "this animal"}? The animal goes back to its previous ID and the tag becomes spare.`)) return;
    run(() => unassignTag(tag, animal));
  }

  function removeTag(tag) {
    if (!confirm(`Delete tag ${showTag(tag.tag_number)} from ${name}'s list?`)) return;
    run(() => supabase.from("official_tags").delete().eq("id", tag.id));
  }

  async function addTags({ list, species }) {
    const rows = list.map((tag_number) => ({ establishment_id: establishmentId, owner_id: owner.id, tag_number, species: species || null }));
    const { data: clash } = await supabase.from("official_tags").select("tag_number, owner_id").eq("establishment_id", establishmentId).in("tag_number", list);
    const taken = (clash || []).filter((c) => c.owner_id !== owner.id).map((c) => showTag(c.tag_number));
    if (taken.length) { alert(`Already recorded for another owner: ${taken.join(", ")}. Each tag can belong to one owner only.`); return; }
    const mine = new Set((clash || []).map((c) => c.tag_number));
    const fresh = rows.filter((r) => !mine.has(r.tag_number));
    if (!fresh.length) { setShowAdd(false); return; }
    if (await run(() => supabase.from("official_tags").insert(fresh))) setShowAdd(false);
  }

  const label = (a) => `${a.eartag_number}${a.breed_category ? ` – ${a.breed_category.replace(/\s*\(.*\)/, "")}` : ""}`;

  if (!tags) return <div className="container"><p style={{ color: "var(--ink-soft)" }}>Loading tags…</p></div>;

  return (
    <div className="container" style={{ paddingBottom: 40 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--ink-soft)", fontSize: 14, fontWeight: 500, cursor: "pointer", marginBottom: 10 }}>
        <ChevronLeft size={16} /> Back
      </button>
      <h2 className="font-display" style={{ fontSize: 20, fontWeight: 700 }}>Official ear tags</h2>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>{name} · {tags.length} tag{tags.length === 1 ? "" : "s"} · {tags.length - spare.length} in use · {spare.length} spare</p>
      {error && <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--gold-soft)" }}>{error}</div>}

      {/* animals waiting for a tag */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Animals still on a temporary ID ({untagged.length})</div>
        {untagged.length === 0 && <p style={{ fontSize: 13, color: "var(--green)" }}>All of {name}'s animals have an official tag.</p>}
        {untagged.map((a) => (
          <div key={a.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{label(a)}</div>
            {isAdmin && (spare.length ? (
              <select className="input" style={{ marginTop: 6 }} value="" disabled={busy} onChange={(e) => pick(a, e.target.value)}>
                <option value="">Give official tag…</option>
                {spare.filter((t) => !t.species || t.species === a.species).concat(spare.filter((t) => t.species && t.species !== a.species))
                  .map((t) => <option key={t.id} value={t.id}>{showTag(t.tag_number)}{t.species && t.species !== a.species ? ` (${t.species} tag)` : ""}</option>)}
              </select>
            ) : <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>No spare tags – add {name}'s tag numbers below.</div>)}
          </div>
        ))}
      </div>

      {/* the owner's tag list */}
      <div className="card" style={{ padding: 14 }}>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <div className="field-label">{name}'s tag numbers</div>
          {isAdmin && <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setShowAdd(true)}><Plus size={13} /> Add tags</button>}
        </div>
        {tags.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No official tags recorded yet.</p>}
        {tags.map((t) => {
          const a = animals.find((x) => x.id === t.animal_id);
          return (
            <div key={t.id} className="row-between" style={{ padding: "8px 0", borderTop: "1px solid var(--line)", gap: 8 }}>
              <div>
                <div className="font-tag" style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Tag size={13} /> {showTag(t.tag_number)}</div>
                <div style={{ fontSize: 12, color: t.animal_id ? "var(--ink)" : "var(--ink-soft)" }}>
                  {t.animal_id ? `On ${a ? `${a.previous_tag || "?"}${a.breed_category ? ` – ${a.breed_category.replace(/\s*\(.*\)/, "")}` : ""}` : "an animal no longer active"}${t.assigned_at ? ` · since ${t.assigned_at}` : ""}` : `Spare${t.species ? ` · ${t.species}` : ""}`}
                </div>
              </div>
              {isAdmin && (t.animal_id
                ? <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={() => release(t)}>Take off</button>
                : <button onClick={() => removeTag(t)} disabled={busy} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><Trash2 size={15} /></button>)}
            </div>
          );
        })}
        <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 8 }}>Spare tags are offered when you register a birth for one of {name}'s animals.</p>
      </div>

      {showAdd && <AddTagsModal ownerName={name} busy={busy} onClose={() => setShowAdd(false)} onSave={addTags} />}
    </div>
  );
}

function AddTagsModal({ ownerName, busy, onClose, onSave }) {
  const [text, setText] = useState("");
  const [species, setSpecies] = useState("cattle");
  const list = parseTagList(text);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Add tags for {ownerName}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Species</span>
            <div style={{ display: "flex", gap: 6 }}>
              {SPECIES.map(([k, l]) => <button key={k} className={`btn ${species === k ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1, padding: "6px 8px" }} onClick={() => setSpecies(k)}>{l}</button>)}
            </div>
          </div>
          <div className="field"><span className="field-label">Tag numbers</span>
            <textarea className="input" rows={4} placeholder={"0010 5047, 0010 5054\nor a range: 00105047-00105051"} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: "inherit", resize: "vertical" }} />
          </div>
          {list.length > 0 && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{list.length} tag{list.length === 1 ? "" : "s"}: {list.slice(0, 12).map(showTag).join(", ")}{list.length > 12 ? " …" : ""}</div>}
          <button className="btn btn-primary" disabled={busy || !list.length} onClick={() => onSave({ list, species })}>{busy ? "Saving…" : `Add ${list.length || ""} tag${list.length === 1 ? "" : "s"}`}</button>
        </div>
      </div>
    </div>
  );
}
