import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { dbRead } from "./offline";
import { categorize } from "./Owners";

const SPECIES = [
  { key: "sheep", label: "Sheep", young: "Lam", rate: "Lambing %", target: 100 },
  { key: "goats", label: "Goats", young: "Lam", rate: "Kidding %", target: 150 },
  { key: "cattle", label: "Cattle", young: "Kalf", rate: "Calving %", target: 85 },
];
const PERIODS = [
  { key: "12m", label: "Last 12 months", days: 365 },
  { key: "6m", label: "Last 6 months", days: 182 },
  { key: "3m", label: "Last 3 months", days: 91 },
  { key: "all", label: "All time", days: null },
];

const nad = (v) => (v == null ? "N$ —" : `${v < 0 ? "−" : ""}N$ ${Math.round(Math.abs(v)).toLocaleString("en-US")}`);
const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);

function rateColor(value, target) {
  if (value == null) return "var(--ink-soft)";
  if (value >= target) return "var(--green)";
  if (value >= target * 0.75) return "var(--gold)";
  return "var(--red)";
}

function Tile({ label, value, note, noteColor }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, margin: "2px 0" }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: noteColor || "var(--ink-soft)" }}>{note}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="field-label" style={{ marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

export default function Kpis({ establishmentId }) {
  const [animals, setAnimals] = useState([]);
  const [slaughters, setSlaughters] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [ownerId, setOwnerId] = useState("all");
  const [period, setPeriod] = useState("12m");

  useEffect(() => { load(); }, [establishmentId]);

  async function load() {
    setLoading(true);
    const [a, s, t, o] = await Promise.all([
      dbRead(`kpi_animals:${establishmentId}`, () =>
        supabase.from("animals").select("id, owner_id, species, breed_category, sex, status").eq("establishment_id", establishmentId)),
      dbRead(`kpi_slaughter:${establishmentId}`, () =>
        supabase.from("slaughter_records").select("animal_id, date, purpose, total_value").eq("establishment_id", establishmentId)),
      dbRead(`kpi_transactions:${establishmentId}`, () =>
        supabase.from("transactions").select("id, type, amount, date, animal_id, owner_id").eq("establishment_id", establishmentId)),
      dbRead(`kpi_owners:${establishmentId}`, () =>
        supabase.from("owners").select("id, full_name").eq("establishment_id", establishmentId).order("full_name")),
    ]);
    setAnimals((a && a.data) || []);
    setSlaughters((s && s.data) || []);
    setTransactions((t && t.data) || []);
    setOwners((o && o.data) || []);
    setFromCache(!!(a && a.fromCache));
    setLoading(false);
  }

  const k = useMemo(() => {
    const p = PERIODS.find((x) => x.key === period);
    const since = p.days ? new Date(Date.now() - p.days * 86400000).toISOString().slice(0, 10) : "0000";
    const inPeriod = (d) => !d || d >= since;
    const byId = Object.fromEntries(animals.map((x) => [x.id, x]));
    const mine = (x) => ownerId === "all" || x.owner_id === ownerId;
    const herd = animals.filter(mine);
    const active = herd.filter((x) => x.status === "active");

    // Breeding (current herd)
    const breeding = {};
    for (const sp of SPECIES) {
      const list = active.filter((x) => x.species === sp.key).map((x) => categorize(x.species, x.breed_category, x.sex) || "");
      const mothers = list.filter((c) => c.startsWith("Groot")).length;
      const young = list.filter((c) => c.startsWith(sp.young)).length;
      const males = list.filter((c) => c.startsWith("Ram") || c.startsWith("Bul")).length;
      breeding[sp.key] = {
        count: list.length, mothers, young, males,
        rate: mothers ? (young / mothers) * 100 : null,
        perMale: males ? mothers / males : null,
      };
    }

    // Offtake and sales (period)
    const sl = slaughters.filter((r) => inPeriod(r.date) && byId[r.animal_id] && mine(byId[r.animal_id]));
    const sold = sl.filter((r) => r.purpose === "sold");
    const own = sl.filter((r) => r.purpose !== "sold");
    const offtake = {};
    for (const sp of SPECIES) {
      const s1 = sold.filter((r) => byId[r.animal_id].species === sp.key);
      offtake[sp.key] = {
        sold: s1.length,
        own: own.filter((r) => byId[r.animal_id].species === sp.key).length,
        income: s1.reduce((t, r) => t + (Number(r.total_value) || 0), 0),
      };
    }

    // Losses (current status, not dated)
    const deceased = herd.filter((x) => x.status === "deceased").length;
    const stolen = herd.filter((x) => x.status === "stolen").length;
    const everHeld = herd.length;

    // Costs (period). Expenses tied to an animal go to its species; the rest are shared
    // and split by each species' share of the active herd.
    const ex = transactions.filter((t) => t.type === "expense" && inPeriod(t.date) &&
      (ownerId === "all" || t.owner_id === ownerId || (t.animal_id && byId[t.animal_id] && byId[t.animal_id].owner_id === ownerId)));
    const direct = { sheep: 0, goats: 0, cattle: 0 };
    let shared = 0;
    for (const t of ex) {
      const an = t.animal_id && byId[t.animal_id];
      if (an && direct[an.species] != null) direct[an.species] += Number(t.amount) || 0;
      else shared += Number(t.amount) || 0;
    }
    const money = {};
    for (const sp of SPECIES) {
      const share = active.length ? breeding[sp.key].count / active.length : 0;
      const costs = direct[sp.key] + shared * share;
      money[sp.key] = { income: offtake[sp.key].income, costs, margin: offtake[sp.key].income - costs, share };
    }
    const totalIncome = SPECIES.reduce((t, sp) => t + money[sp.key].income, 0);
    const totalCosts = SPECIES.reduce((t, sp) => t + direct[sp.key], 0) + shared;
    const females = SPECIES.reduce((t, sp) => t + breeding[sp.key].mothers, 0);
    const unownedCosts = ownerId === "all" ? 0 :
      transactions.filter((t) => t.type === "expense" && inPeriod(t.date) && !t.owner_id && !t.animal_id).reduce((s, t) => s + (Number(t.amount) || 0), 0);

    return { breeding, offtake, sold: sold.length, own: own.length, deceased, stolen, everHeld, money, totalIncome, totalCosts, shared, females, unownedCosts, activeCount: active.length };
  }, [animals, slaughters, transactions, ownerId, period]);

  if (loading) return <div className="container"><p style={{ color: "var(--ink-soft)" }}>Working out your numbers…</p></div>;

  const g = k.breeding;
  const lossRate = k.everHeld ? ((k.deceased + k.stolen) / k.everHeld) * 100 : null;
  const pill = (active) => ({
    padding: "5px 12px", borderRadius: 99, fontSize: 13, whiteSpace: "nowrap", cursor: "pointer",
    border: active ? "1px solid var(--green)" : "1px solid var(--line)",
    background: active ? "var(--green)" : "var(--card)", color: active ? "#fff" : "var(--ink)",
  });

  return (
    <div className="container">
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }}>
        <button style={pill(ownerId === "all")} onClick={() => setOwnerId("all")}>All owners</button>
        {owners.map((o) => <button key={o.id} style={pill(ownerId === o.id)} onClick={() => setOwnerId(o.id)}>{o.full_name}</button>)}
      </div>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{k.activeCount} active animals</span>
        <select className="input" style={{ width: "auto", padding: "6px 10px" }} value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      {fromCache && <p style={{ fontSize: 12, color: "var(--gold)", marginBottom: 8 }}>No signal: showing the last saved numbers.</p>}

      <Section title="Breeding (current herd)">
        <div className="grid-2">
          {SPECIES.map((sp) => (
            <Tile key={sp.key} label={`${sp.rate} (${sp.label.toLowerCase()})`} value={pct(g[sp.key].rate)}
              note={g[sp.key].mothers ? `${g[sp.key].young} young / ${g[sp.key].mothers} mothers · target ${sp.target}%` : "No mature females"}
              noteColor={rateColor(g[sp.key].rate, sp.target)} />
          ))}
          <Tile label="Females per ram" value={`${g.sheep.perMale ? Math.round(g.sheep.perMale) : "—"} / ${g.goats.perMale ? Math.round(g.goats.perMale) : "—"}`}
            note={`Sheep / goats · ${g.sheep.males + g.goats.males} rams, ${g.cattle.males} bulls`}
            noteColor={(g.goats.perMale || 0) > 50 || (g.sheep.perMale || 0) > 50 ? "var(--gold)" : "var(--green)"} />
        </div>
      </Section>

      <Section title={`Losses and offtake (${PERIODS.find((p) => p.key === period).label.toLowerCase()})`}>
        <div className="grid-2">
          <Tile label="Losses" value={pct(lossRate)} note={`${k.deceased} died, ${k.stolen} stolen (all time)`}
            noteColor={lossRate != null && lossRate > 5 ? "var(--red)" : "var(--ink-soft)"} />
          <Tile label="Sold" value={k.sold} note={SPECIES.map((sp) => `${k.offtake[sp.key].sold} ${sp.label.toLowerCase()}`).join(", ")} />
          <Tile label="Own consumption" value={k.own} note={SPECIES.map((sp) => `${k.offtake[sp.key].own} ${sp.label.toLowerCase()}`).join(", ")} />
          <Tile label="Sales income" value={nad(k.totalIncome)} note={k.sold ? `Avg ${nad(k.totalIncome / k.sold)} per animal` : "From slaughter records"} />
        </div>
      </Section>

      <Section title="Money per species">
        <div className="card" style={{ padding: 12, fontSize: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", gap: 4, fontSize: 11, color: "var(--ink-soft)", paddingBottom: 6, borderBottom: "1px solid var(--line)" }}>
            <span></span><span style={{ textAlign: "right" }}>Income</span><span style={{ textAlign: "right" }}>Costs</span><span style={{ textAlign: "right" }}>Margin</span>
          </div>
          {SPECIES.map((sp) => {
            const m = k.money[sp.key];
            return (
              <div key={sp.key} style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", gap: 4, padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                <span>{sp.label}</span>
                <span style={{ textAlign: "right" }}>{nad(m.income)}</span>
                <span style={{ textAlign: "right" }}>{nad(m.costs)}</span>
                <span style={{ textAlign: "right", fontWeight: 600, color: m.margin < 0 ? "var(--red)" : "var(--green)" }}>{nad(m.margin)}</span>
              </div>
            );
          })}
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", gap: 4, padding: "7px 0", fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ textAlign: "right" }}>{nad(k.totalIncome)}</span>
            <span style={{ textAlign: "right" }}>{nad(k.totalCosts)}</span>
            <span style={{ textAlign: "right", color: k.totalIncome - k.totalCosts < 0 ? "var(--red)" : "var(--green)" }}>{nad(k.totalIncome - k.totalCosts)}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
            Margin per breeding female: <b style={{ color: "var(--ink)" }}>{k.females ? nad((k.totalIncome - k.totalCosts) / k.females) : "N$ —"}</b>
          </div>
          <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 8 }}>
            Costs linked to an animal count for its species. Other costs ({nad(k.shared)}) are split by each species' share of the herd.
            {k.unownedCosts > 0 && ` Farm costs not linked to an owner (${nad(k.unownedCosts)}) show only under All owners.`}
          </p>
        </div>
      </Section>
    </div>
  );
}
