import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    if (mode === "signup" && !data.session) {
      setError("Account created — you can sign in now.");
      setMode("signin");
      return;
    }
    onAuthed();
  }

  return (
    <div className="container" style={{ paddingTop: 80 }}>
      <h1 className="font-display" style={{ fontSize: 30, fontWeight: 700 }}>Kraal Declare</h1>
      <p style={{ color: "var(--ink-soft)", marginBottom: 24, fontSize: 14 }}>
        Livestock records and DVS declarations, in one place.
      </p>

      <form onSubmit={submit} className="stack card" style={{ padding: 20 }}>
        <div className="field">
          <span className="field-label">Email</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <span className="field-label">Password</span>
          <input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="btn btn-secondary"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
