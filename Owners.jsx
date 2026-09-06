import React, { useState, useEffect, useMemo } from "react";
import { Plus, X, ChevronLeft, Clock, CheckCircle2, Pencil, Trash2, TrendingUp } from "lucide-react";
import { supabase } from "./supabaseClient";
import { dbRead, dbWrite } from "./offline";

export default function Owners({ establishmentId, isAdmin }) {
  const [owners, setOwners] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showPriceAdd, setShowPriceAdd] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => { load(); }, [establishmentId]);

  async function load() {
    setLoading(true);
    const [{ data: o }, { data: a }, { data: p }] = await Promise.all([
      dbRead(`owners:${establishmentId}`, () =>
        supabase.from("owners").select("*, brand_marks(*)").eq("establishment_id", establishmentId).order("full_name")
      ),
      dbRead(`animals_for_owners:${establishmentId}`, () =>
        supabase.from("animals").select("id, owner_id, species, breed_category, status").eq("establishment_id", establishmentId)
      ),
      dbRead(`market_prices:${establishmentId}`, () =>
        supabase.from("market_prices").select("*").eq("establishment_id", establishmentId).order("as_of_date", { ascending: false })
      ),
    ]);
    setOwners(o || []);
    setAnimals(a || []);
    setPrices(p || []);
    setLoading(false);
  }

  async function addOwner(form) {
    const { data: newOwner, error } = await supabase.from("owners").insert({ establishment_id: establishmentId, ...form.owner }).select().single();
    if (!error) {
      await supabase.from("brand_marks").insert({
        owner_id: newOwner.id,
        stock_brand_code: form.brand.stock_brand_code || null,
        status: form.brand.stock_brand_code ? "registered" : "pending_registration",
        pending_reference: form.brand.pending_reference || null,
      });
    }
    setShowAdd(false);
    load();
  }

  async function updateOwner(id, form) {
    await supabase.from("owners").update(form.owner).eq("id", id);
    if (form.brandId) {
      await supabase.from("brand_marks").update({
        stock_brand_code: form.brand.stock_brand_code || null,
        status: form.brand.stock_brand_code ? "registered" : "pending_registration",
        pending_reference: form.brand.pending_reference || null,
      }).eq("id", form.brandId);
    }
    setShowEdit(null);
    load();
  }

  async function deleteOwner(id) {
    if (!confirm("Delete this owner? Their animals will remain but become unassigned (shared/communal).")) return;
    await supabase.from("animals").update({ owner_id: null, brand_mark_id: null }).eq("owner_id", id);
    await supabase.from("owners").delete().eq("id", id);
    load();
  }

  async function addPrice(form) {
    await dbWrite(
      () => supabase.from("market_prices").insert({ establishment_id: establishmentId, ...form }),
      { key: "market_prices:insert", payload: form }
    );
    setShowPriceAdd(false);
    load();
  }

  async function deletePrice(id) {
    await supabase.from("market_prices").delete().eq("id", id);
    load();
  }

  const summary = useMemo(() => {
    const relevant = animals.filter((a) => a.status === "active" && (filter === "all" || a.owner_id === filter));
    const bySpecies = { cattle: 0, sheep: 0, goats: 0, pigs: 0, donkeys: 0, horses: 0, ostriches: 0, poultry: 0, other: 0 };
    relevant.forEach((a) => { bySpecies[a.species] = (bySpecies[a.species] || 0) + 1; });
    return { total: relevant.length, bySpecies };
  }, [animals, filter]);

  if (loading) return <div className="container">Loading owners…</div>;

  const selectedOwner = filter !== "all" ? owners.find((o) => o.id === filter) : null;

  if (showEdit) {
    return <EditOwnerModal owner={showEdit} onClose={() => setShowEdit(null)} onSave={(form) => updateOwner(showEdit.id, form)} />;
  }

  return (
    <div className="container">
      <div className="tabs">
        <button className={`tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All owners</button>
        {owners.map((o) => (
          <button key={o.id} className={`tab ${filter === o.id ? "active" : ""}`} onClick={() => setFilter(o.id)}>{o.full_name}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div className="field-label">{selectedOwner ? `${selectedOwner.full_name} — active herd` : "Farm-wide active herd"}</div>
          <span className="font-display" style={{ fontWeight: 700, fontSize: 20 }}>{summary.total}</span>
        </div>
        <div className="grid-2">
          {Object.entries(summary.bySpecies).filter(([, c]) => c > 0).map(([sp, c]) => (
            <div key={sp} className="row-between" style={{ fontSize: 13, padding: "4px 0" }}>
              <span style={{ textTransform: "capitalize" }}>{sp}</span><span className="font-tag" style={{ fontWeight: 600 }}>{c}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 8 }}>Slaughtered and sold animals are excluded — see Slaughter records for history.</p>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <div className="field-label" style={{ display: "flex", alignItems: "center", gap: 4 }}><TrendingUp size={13} /> Market reference prices</div>
          {isAdmin && <button onClick={() => setShowPriceAdd(true)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer" }}><Plus size={16} /></button>}
        </div>
        {prices.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No prices logged yet. Ask Claude for current Agra/WLA averages anytime, or add manually.</p>
        ) : (
          prices.slice(0, 6).map((p) => (
            <div key={p.id} className="row-between" style={{ fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
              <span>{p.category} <span style={{ color: "var(--ink-soft)" }}>({p.source}, {p.as_of_date})</span></span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="font-tag" style={{ fontWeight: 600 }}>{p.price_per_kg ? `N$ ${p.price_per_kg}/kg` : "—"}</span>
                {isAdmin && <button onClick={() => deletePrice(p.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><Trash2 size={13} /></button>}
              </span>
            </div>
          ))
        )}
      </div>

      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 12 }}>{owners.length} owner(s) on this establishment</p>

      {owners.filter((o) => filter === "all" || o.id === filter).length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, borderStyle: "dashed" }}>
          <p className="font-display" style={{ fontSize: 18 }}>No owners yet</p>
        </div>
      ) : (
        <div className="stack">
          {owners.filter((o) => filter === "all" || o.id === filter).map((o) => {
            const brand = o.brand_marks?.[0];
            return (
              <div key={o.id} className="card row-between" style={{ padding: "12px 16px" }}>
                <div>
                  <div className="font-display" style={{ fontWeight: 600, fontSize: 16 }}>{o.full_name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{o.email || o.contact_number || "no contact on file"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {brand && (
                    brand.status === "registered" ? (
                      <span className="badge" style={{ background: "var(--green-soft)", color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} /> {brand.stock_brand_code}</span>
                    ) : (
                      <span className="badge" style={{ background: "var(--gold-soft)", color: "#7A5A16", display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> pending</span>
                    )
                  )}
                  {isAdmin && (
                    <>
                      <button onClick={() => setShowEdit(o)} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><Pencil size={15} /></button>
                      <button onClick={() => deleteOwner(o.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><Trash2 size={15} /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <button className="btn btn-primary" style={{ position: "fixed", bottom: 88, right: 20, width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowAdd(true)}><Plus size={24} /></button>
      )}
      {showAdd && <AddOwnerModal onClose={() => setShowAdd(false)} onSave={addOwner} />}
      {showPriceAdd && <AddPriceModal onClose={() => setShowPriceAdd(false)} onSave={addPrice} />}
    </div>
  );
}

function AddOwnerModal({ onClose, onSave }) {
  const [owner, setOwner] = useState({ full_name: "", email: "", contact_number: "", id_number: "" });
  const [brand, setBrand] = useState({ stock_brand_code: "", pending_reference: "" });
  const setO = (k, v) => setOwner((o) => ({ ...o, [k]: v }));
  const setB = (k, v) => setBrand((b) => ({ ...b, [k]: v }));
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Add owner</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Full name</span><input className="input" value={owner.full_name} onChange={(e) => setO("full_name", e.target.value)} /></div>
          <div className="field"><span className="field-label">Email</span><input className="input" value={owner.email} onChange={(e) => setO("email", e.target.value)} /></div>
          <div className="field"><span className="field-label">Contact number</span><input className="input" value={owner.contact_number} onChange={(e) => setO("contact_number", e.target.value)} /></div>
          <div className="field"><span className="field-label">ID number</span><input className="input" value={owner.id_number} onChange={(e) => setO("id_number", e.target.value)} /></div>
          <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "6px 0" }} />
          <div className="field-label">Brand mark</div>
          <div className="field"><span className="field-label">Stock Brand Code (leave blank if pending)</span><input className="input" value={brand.stock_brand_code} onChange={(e) => setB("stock_brand_code", e.target.value)} /></div>
          {!brand.stock_brand_code && <div className="field"><span className="field-label">Your own reference while pending</span><input className="input" value={brand.pending_reference} onChange={(e) => setB("pending_reference", e.target.value)} /></div>}
          <button className="btn btn-primary" disabled={!owner.full_name} onClick={() => onSave({ owner, brand })}>Save owner</button>
        </div>
      </div>
    </div>
  );
}

function EditOwnerModal({ owner, onClose, onSave }) {
  const brand = owner.brand_marks?.[0];
  const [form, setForm] = useState({
    full_name: owner.full_name || "", email: owner.email || "", contact_number: owner.contact_number || "",
    id_number: owner.id_number || "", residential_address: owner.residential_address || "", po_box: owner.po_box || "",
    fanmeat_no: owner.fanmeat_no || "", livestock_keeper_key: owner.livestock_keeper_key || "", producer_registration_number: owner.producer_registration_number || "",
  });
  const [brandForm, setBrandForm] = useState({ stock_brand_code: brand?.stock_brand_code || "", pending_reference: brand?.pending_reference || "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setB = (k, v) => setBrandForm((b) => ({ ...b, [k]: v }));

  return (
    <div className="container">
      <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--ink-soft)", fontSize: 14, fontWeight: 500, marginBottom: 16, cursor: "pointer" }}>
        <ChevronLeft size={16} /> Back
      </button>
      <h2 className="font-display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Edit {owner.full_name}</h2>
      <div className="stack">
        {[["full_name", "Full name"], ["email", "Email"], ["contact_number", "Contact number"], ["id_number", "ID number"],
          ["residential_address", "Residential address"], ["po_box", "PO Box"], ["fanmeat_no", "Fanmeat No."],
          ["livestock_keeper_key", "Livestock Keeper Key"], ["producer_registration_number", "Producer Registration Number"]].map(([k, label]) => (
          <div className="field" key={k}><span className="field-label">{label}</span><input className="input" value={form[k]} onChange={(e) => set(k, e.target.value)} /></div>
        ))}
        <hr style={{ border: "none", borderTop: "1px solid var(--line)" }} />
        <div className="field-label">Brand mark</div>
        <div className="field"><span className="field-label">Stock Brand Code</span><input className="input" value={brandForm.stock_brand_code} onChange={(e) => setB("stock_brand_code", e.target.value)} /></div>
        <div className="field"><span className="field-label">Pending reference (used while code isn't issued)</span><input className="input" value={brandForm.pending_reference} onChange={(e) => setB("pending_reference", e.target.value)} /></div>
        <button className="btn btn-primary" onClick={() => onSave({ owner: form, brand: brandForm, brandId: brand?.id })}>Save changes</button>
      </div>
    </div>
  );
}

function AddPriceModal({ onClose, onSave }) {
  const [form, setForm] = useState({ category: "", price_per_kg: "", source: "Agra", as_of_date: new Date().toISOString().slice(0, 10), notes: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Add market price</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Category</span><input className="input" placeholder="e.g. Weaner calves" value={form.category} onChange={(e) => set("category", e.target.value)} /></div>
          <div className="grid-2">
            <div className="field"><span className="field-label">Price per kg (N$)</span><input type="number" className="input" value={form.price_per_kg} onChange={(e) => set("price_per_kg", e.target.value)} /></div>
            <div className="field"><span className="field-label">Source</span>
              <select className="input" value={form.source} onChange={(e) => set("source", e.target.value)}>
                <option>Agra</option><option>WLA</option><option>Other</option>
              </select>
            </div>
          </div>
          <div className="field"><span className="field-label">As of date</span><input type="date" className="input" value={form.as_of_date} onChange={(e) => set("as_of_date", e.target.value)} /></div>
          <button className="btn btn-primary" disabled={!form.category} onClick={() => onSave(form)}>Save price</button>
        </div>
      </div>
    </div>
  );
}
