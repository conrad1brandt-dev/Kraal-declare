import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function EstablishmentSetup({ user, onReady }) {
  const [mode, setMode] = useState("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function createEstablishment(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    const { data: est, error: estErr } = await supabase
      .from("establishments")
      .insert({ name, created_by: user.id })
      .select()
      .single();
    if (estErr) { setLoading(false); return setError(estErr.message); }

    const { error: memErr } = await supabase
      .from("establishment_members")
      .insert({ establishment_id: est.id, user_id: user.id, role: "owner_admin" });
    setLoading(false);
    if (memErr) return setError(memErr.message);
    onReady(est);
  }

  async function joinEstablishment(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    const { data: est, error: findErr } = await supabase
      .from("establishments")
      .select("*")
      .eq("invite_code", code.trim())
      .single();
    if (findErr || !est) { setLoading(false); return setError("No establishment found with that invite code."); }

    const { error: memErr } = await supabase
      .from("establishment_members")
      .insert({ establishment_id: est.id, user_id: user.id, role: "member" });
    setLoading(false);
    if (memErr) return setError(memErr.message);
    onReady(est);
  }

  return (
    <div className="container" style={{ paddingTop: 80 }}>
      <h2 className="font-display" style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        {mode === "create" ? "Set up your establishment" : "Join an establishment"}
      </h2>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 20 }}>
        {mode === "create"
          ? "Create your farm — you'll get an invite code to share with others."
          : "Ask the establishment admin for their invite code."}
      </p>

      <form onSubmit={mode === "create" ? createEstablishment : joinEstablishment} className="stack card" style={{ padding: 20 }}>
        {mode === "create" ? (
          <div className="field">
            <span className="field-label">Establishment / Farm name</span>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Farm Damas 344" />
          </div>
        ) : (
          <div className="field">
            <span className="field-label">Invite code</span>
            <input className="input font-tag" required value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        )}
        {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Please wait…" : mode === "create" ? "Create establishment" : "Join establishment"}
        </button>
        <button type="button" className="btn btn-secondary"
          onClick={() => { setMode(mode === "create" ? "join" : "create"); setError(""); }}>
          {mode === "create" ? "I have an invite code instead" : "Create a new establishment instead"}
        </button>
      </form>
    </div>
  );
}
