import React, { useState } from "react";
import { ChevronLeft, RefreshCw, Copy, Check } from "lucide-react";
import { supabase } from "./supabaseClient";

const fmt = (n) => `N$ ${Number(n).toLocaleString("en-NA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function prettyDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-NA", { day: "numeric", month: "short", year: "numeric" });
}

export default function FarmUpdate({ establishmentId, establishmentName, onBack }) {
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setCopied(false);
    const from = daysAgoISO(period);
    const to = todayISO();

    const [{ data: animals }, { data: slaughters }, { data: txns }, { data: predators }, { data: thefts }, { data: diseases }] = await Promise.all([
      supabase.from("animals").select("species, status").eq("establishment_id", establishmentId).eq("status", "active"),
      supabase.from("slaughter_records").select("purpose, total_value").eq("establishment_id", establishmentId).gte("date", from).lte("date", to),
      supabase.from("transactions").select("type, amount").eq("establishment_id", establishmentId).gte("date", from).lte("date", to),
      supabase.from("predator_losses").select("number_lost").eq("establishment_id", establishmentId).gte("date", from).lte("date", to),
      supabase.from("theft_losses").select("number_stolen").eq("establishment_id", establishmentId).gte("date", from).lte("date", to),
      supabase.from("disease_records").select("no_dead").eq("establishment_id", establishmentId).gte("date", from).lte("date", to),
    ]);

    const herdBySpecies = {};
    (animals || []).forEach((a) => { herdBySpecies[a.species] = (herdBySpecies[a.species] || 0) + 1; });
    const totalHerd = (animals || []).length;

    const soldCount = (slaughters || []).filter((s) => s.purpose === "sold").length;
    const ownUseCount = (slaughters || []).filter((s) => s.purpose !== "sold").length;
    const salesValue = (slaughters || []).filter((s) => s.purpose === "sold").reduce((s, r) => s + (Number(r.total_value) || 0), 0);

    const income = (txns || []).filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = (txns || []).filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

    const predatorLoss = (predators || []).reduce((s, r) => s + (Number(r.number_lost) || 0), 0);
    const theftLoss = (thefts || []).reduce((s, r) => s + (Number(r.number_stolen) || 0), 0);
    const diseaseLoss = (diseases || []).reduce((s, r) => s + (Number(r.no_dead) || 0), 0);
    const totalLosses = predatorLoss + theftLoss + diseaseLoss;

    const speciesLines = Object.entries(herdBySpecies)
      .filter(([, c]) => c > 0)
      .map(([sp, c]) => `  • ${sp[0].toUpperCase() + sp.slice(1)}: ${c}`)
      .join("\n");

    const lines = [
      `🌾 ${establishmentName} — Farm Update`,
      `${prettyDate(from)} to ${prettyDate(to)}`,
      "",
      `Active herd: ${totalHerd}`,
      speciesLines,
      "",
      `This period:`,
      `  • ${soldCount + ownUseCount} animal(s) processed (${soldCount} sold, ${ownUseCount} own use) — ${fmt(salesValue)} in sales`,
      totalLosses > 0 ? `  • ${totalLosses} lost (${diseaseLoss} disease, ${predatorLoss} predator, ${theftLoss} theft)` : `  • No losses recorded`,
      `  • Finances: Income ${fmt(income)} · Expenses ${fmt(expense)} · Net ${fmt(income - expense)}`,
      "",
      `— Sent via Kraal Declare`,
    ].filter((l) => l !== undefined);

    setSummary(lines.join("\n"));
    setLoading(false);
  }

  function copyText() {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="container">
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--ink-soft)", fontSize: 14, fontWeight: 500, marginBottom: 12, cursor: "pointer" }}>
        <ChevronLeft size={16} /> Back
      </button>
      <h2 className="font-display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Farm Update</h2>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16 }}>
        Builds a summary from what's logged in the app — herd size, recent slaughter, losses, and finances — that you can send to the people you've given access to. This doesn't send anything automatically; you review it and share it yourself, however you like (WhatsApp, email, etc.).
      </p>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Cover period</div>
        <div className="tabs" style={{ marginBottom: 12 }}>
          {[7, 30, 90].map((d) => (
            <button key={d} className={`tab ${period === d ? "active" : ""}`} style={{ flex: 1 }} onClick={() => setPeriod(d)}>
              Last {d} days
            </button>
          ))}
        </div>
        <button className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} disabled={loading} onClick={generate}>
          <RefreshCw size={14} /> {loading ? "Generating…" : summary ? "Regenerate" : "Generate update"}
        </button>
      </div>

      {summary && (
        <div className="card" style={{ padding: 16 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <div className="field-label">Preview — copy and share</div>
            <button onClick={copyText} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13.5, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: 14, margin: 0, lineHeight: 1.6 }}>
            {summary}
          </pre>
        </div>
      )}
    </div>
  );
}
