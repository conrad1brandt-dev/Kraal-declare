import React, { useState, useEffect } from "react";
import { Plus, X, Droplets, Trash2, Pencil, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { supabase } from "./supabaseClient";
import { dbRead, dbWrite } from "./offline";

const QUALITY_OPTS = ["poor", "medium", "good", "n/a"];
const QUALITY_SCORE = { poor: 1, medium: 2, good: 3, "n/a": null };
const WATER_SOURCES = ["pipeline", "borehole", "dam", "surface_water", "river"];
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function GrazingWater({ establishmentId, isAdmin }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState("log"); // "log" | "trend"

  useEffect(() => { load(); }, [establishmentId]);
  async function load() {
    setLoading(true);
    const { data } = await dbRead(`grazing:${establishmentId}`, () =>
      supabase.from("grazing_water_reports").select("*").eq("establishment_id", establishmentId).order("report_date", { ascending: false })
    );
    setReports(data || []);
    setLoading(false);
  }

  async function addReport(form) {
    await dbWrite(
      () => supabase.from("grazing_water_reports").insert({ establishment_id: establishmentId, ...form }),
      { key: "grazing:insert", payload: form }
    );
    setShowAdd(false);
    load();
  }

  async function updateReport(id, form) {
    await supabase.from("grazing_water_reports").update(form).eq("id", id);
    setEditing(null);
    load();
  }

  async function deleteReport(id) {
    if (!confirm("Delete this report?")) return;
    await supabase.from("grazing_water_reports").delete().eq("id", id);
    load();
  }

  if (loading) return <div className="container">Loading…</div>;

  const trendData = [...reports].reverse().map((r) => ({
    date: r.report_date.slice(5),
    grazing: QUALITY_SCORE[r.grazing_quality],
    water: QUALITY_SCORE[r.water_quality],
  }));

  return (
    <div className="container">
      <div className="tabs">
        <button className={`tab ${view === "log" ? "active" : ""}`} onClick={() => setView("log")}>Log</button>
        <button className={`tab ${view === "trend" ? "active" : ""}`} onClick={() => setView("trend")}>Trend</button>
      </div>

      {view === "trend" ? (
        <div className="card" style={{ padding: 16 }}>
          <div className="field-label" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><TrendingUp size={13} /> Quality over time (1=poor, 2=medium, 3=good)</div>
          {trendData.length < 2 ? (
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>Log at least two reports to see a trend.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 3]} ticks={[1, 2, 3]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="grazing" stroke="var(--green)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="water" stroke="var(--blue)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : (
        <>
          {reports.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 40, borderStyle: "dashed" }}>
              <p className="font-display" style={{ fontSize: 18, marginBottom: 4 }}>No reports yet</p>
            </div>
          ) : (
            <div className="stack">
              {reports.map((r) => (
                <div key={r.id} className="card" style={{ padding: 16 }}>
                  <div className="row-between" style={{ marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }} className="font-tag">{r.report_date}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Droplets size={16} color="var(--blue)" />
                      {isAdmin && (
                        <>
                          <button onClick={() => setEditing(r)} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><Pencil size={14} /></button>
                          <button onClick={() => deleteReport(r.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}><Trash2 size={14} /></button>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                    Grazing: {r.grazing_quality} quality, {r.grazing_quantity} quantity<br />
                    Water: {r.water_quality} quality, {r.water_quantity} quantity — {(r.water_sources || []).join(", ") || "no sources noted"}<br />
                    Condition: cattle {r.cattle_condition}, sheep {r.sheep_condition}, goats {r.goats_condition}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {isAdmin && (
        <button className="btn btn-primary" style={{ position: "fixed", bottom: 88, right: 20, width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowAdd(true)}><Plus size={24} /></button>
      )}
      {showAdd && <ReportModal onClose={() => setShowAdd(false)} onSave={addReport} />}
      {editing && <ReportModal initial={editing} onClose={() => setEditing(null)} onSave={(form) => updateReport(editing.id, form)} />}
    </div>
  );
}

function ReportModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || {
    report_date: todayISO(), grazing_quality: "medium", grazing_quantity: "medium",
    water_quality: "medium", water_quantity: "medium", water_sources: [],
    cattle_condition: "medium", sheep_condition: "medium", goats_condition: "medium", notes: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleSource = (s) => setForm((f) => ({
    ...f, water_sources: (f.water_sources || []).includes(s) ? f.water_sources.filter((x) => x !== s) : [...(f.water_sources || []), s],
  }));

  const qualitySelect = (key, label) => (
    <div className="field"><span className="field-label">{label}</span>
      <select className="input" value={form[key]} onChange={(e) => set(key, e.target.value)}>
        {QUALITY_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>{initial ? "Edit conditions" : "Log conditions"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div className="stack">
          <div className="field"><span className="field-label">Date</span><input type="date" className="input" value={form.report_date} onChange={(e) => set("report_date", e.target.value)} /></div>
          <div className="grid-2">
            {qualitySelect("grazing_quality", "Grazing quality")}
            {qualitySelect("grazing_quantity", "Grazing quantity")}
            {qualitySelect("water_quality", "Water quality")}
            {qualitySelect("water_quantity", "Water quantity")}
          </div>
          <div className="field">
            <span className="field-label">Water sources</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {WATER_SOURCES.map((s) => (
                <button key={s} type="button" onClick={() => toggleSource(s)}
                  style={{ fontSize: 12, padding: "6px 10px", borderRadius: 999, border: "1px solid var(--line)",
                    background: (form.water_sources || []).includes(s) ? "var(--blue)" : "#fff",
                    color: (form.water_sources || []).includes(s) ? "#fff" : "var(--ink)", cursor: "pointer" }}>
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-2">
            {qualitySelect("cattle_condition", "Cattle condition")}
            {qualitySelect("sheep_condition", "Sheep condition")}
            {qualitySelect("goats_condition", "Goats condition")}
          </div>
          <div className="field"><span className="field-label">Notes</span><input className="input" value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
          <button className="btn btn-primary" onClick={() => onSave(form)}>Save report</button>
        </div>
      </div>
    </div>
  );
}
