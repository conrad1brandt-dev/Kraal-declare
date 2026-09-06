import React, { useState, useEffect } from "react";
import { Home as HomeIcon, PawPrint, Wallet, FileCheck, Menu, WifiOff, LogOut, Copy, Check, ChevronLeft, Eye } from "lucide-react";
import { supabase } from "./supabaseClient";
import { isOnline, queueLength } from "./offline";
import Auth from "./Auth";
import EstablishmentSetup from "./EstablishmentSetup";
import Home from "./Home";
import Owners from "./Owners";
import Animals from "./Animals";
import Declarations from "./Declarations";
import Slaughter from "./Slaughter";
import Finances from "./Finances";
import GrazingWater from "./GrazingWater";
import LossesHealth from "./LossesHealth";
import Registers from "./Registers";

const SCREEN_TITLES = {
  home: null, animals: "Animals", owners: "Owners & Brands", declarations: "Declaration",
  slaughter: "Slaughter", finances: "Finances", health: "Losses & Health", feed: "Feed / Vaccines / Meds",
  grazing: "Grazing & Water", registers: "Registers", more: "More", settings: "Establishment",
};

export default function App() {
  const [session, setSession] = useState(undefined);
  const [establishment, setEstablishment] = useState(undefined);
  const [role, setRole] = useState(null); // 'owner_admin' | 'member'
  const [owners, setOwners] = useState([]);
  const [screen, setScreen] = useState("home");
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(queueLength());

  const isAdmin = role === "owner_admin";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const interval = setInterval(() => setPending(queueLength()), 3000);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (session?.user) loadEstablishment();
    else setEstablishment(session === null ? null : undefined);
  }, [session]);

  async function loadEstablishment() {
    const { data } = await supabase
      .from("establishment_members")
      .select("establishment_id, role, establishments(*)")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();
    setEstablishment(data ? data.establishments : null);
    setRole(data ? data.role : null);
  }

  useEffect(() => {
    if (establishment) {
      supabase.from("owners").select("id, full_name, brand_marks(*)").eq("establishment_id", establishment.id)
        .then(({ data }) => setOwners(data || []));
    }
  }, [establishment, screen]);

  if (session === undefined) return <div className="container" style={{ paddingTop: 80 }}>Loading…</div>;
  if (!session) return <Auth onAuthed={() => {}} />;
  if (establishment === undefined) return <div className="container" style={{ paddingTop: 80 }}>Loading your establishment…</div>;
  if (!establishment) return <EstablishmentSetup user={session.user} onReady={setEstablishment} />;

  const title = SCREEN_TITLES[screen];

  return (
    <div>
      {!online && (
        <div className="offline-banner">
          <WifiOff size={13} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
          Working offline — changes will sync when you're back online{pending > 0 ? ` (${pending} pending)` : ""}
        </div>
      )}

      <div className="topbar">
        <div className="topbar-title">
          {screen !== "home" && (
            <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", color: "var(--ink)", cursor: "pointer", display: "flex" }}>
              <ChevronLeft size={20} />
            </button>
          )}
          <span>{title || establishment.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isAdmin && (
            <span className="badge" style={{ background: "var(--line)", color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 4 }}>
              <Eye size={12} /> View only
            </span>
          )}
          {online && pending > 0 && <span className="badge" style={{ background: "var(--gold-soft)", color: "#7A5A16" }}>{pending} syncing…</span>}
        </div>
      </div>

      {screen === "home" && <Home establishment={establishment} onNavigate={setScreen} />}
      {screen === "animals" && <Animals establishmentId={establishment.id} isAdmin={isAdmin} />}
      {screen === "owners" && <Owners establishmentId={establishment.id} isAdmin={isAdmin} />}
      {screen === "declarations" && <Declarations establishmentId={establishment.id} isAdmin={isAdmin} />}
      {screen === "slaughter" && <Slaughter establishmentId={establishment.id} isAdmin={isAdmin} />}
      {screen === "finances" && <Finances establishmentId={establishment.id} owners={owners} isAdmin={isAdmin} />}
      {screen === "grazing" && <GrazingWater establishmentId={establishment.id} isAdmin={isAdmin} />}
      {screen === "registers" && <Registers establishmentId={establishment.id} isAdmin={isAdmin} />}
      {screen === "health" && <LossesHealth establishmentId={establishment.id} isAdmin={isAdmin} />}
      {screen === "feed" && <LossesHealth establishmentId={establishment.id} isAdmin={isAdmin} initialTab="feed" />}
      {screen === "more" && <MoreScreen establishment={establishment} onNavigate={setScreen} />}
      {screen === "settings" && <SettingsScreen establishment={establishment} isAdmin={isAdmin} />}

      <nav className="nav-bottom">
        <button className={`nav-item ${screen === "home" ? "active" : ""}`} onClick={() => setScreen("home")}><HomeIcon size={20} /> Home</button>
        <button className={`nav-item ${screen === "animals" ? "active" : ""}`} onClick={() => setScreen("animals")}><PawPrint size={20} /> Animals</button>
        <button className={`nav-item ${screen === "finances" ? "active" : ""}`} onClick={() => setScreen("finances")}><Wallet size={20} /> Finances</button>
        <button className={`nav-item ${screen === "declarations" ? "active" : ""}`} onClick={() => setScreen("declarations")}><FileCheck size={20} /> Declaration</button>
        <button className={`nav-item ${screen === "more" ? "active" : ""}`} onClick={() => setScreen("more")}><Menu size={20} /> More</button>
      </nav>
    </div>
  );
}

function MoreScreen({ establishment, onNavigate }) {
  return (
    <div className="container">
      <div className="stack">
        <button className="card row-between" style={{ padding: 16, cursor: "pointer", textAlign: "left" }} onClick={() => onNavigate("owners")}>
          <span>Owners & Brands</span>
        </button>
        <button className="card row-between" style={{ padding: 16, cursor: "pointer", textAlign: "left" }} onClick={() => onNavigate("health")}>
          <span>Losses & Health</span>
        </button>
        <button className="card row-between" style={{ padding: 16, cursor: "pointer", textAlign: "left" }} onClick={() => onNavigate("slaughter")}>
          <span>Slaughter records</span>
        </button>
        <button className="card row-between" style={{ padding: 16, cursor: "pointer", textAlign: "left" }} onClick={() => onNavigate("grazing")}>
          <span>Grazing & Water</span>
        </button>
        <button className="card row-between" style={{ padding: 16, cursor: "pointer", textAlign: "left" }} onClick={() => onNavigate("registers")}>
          <span>Registers (for vet visits)</span>
        </button>
        <button className="card row-between" style={{ padding: 16, cursor: "pointer", textAlign: "left" }} onClick={() => onNavigate("settings")}>
          <span>Establishment settings</span>
        </button>
      </div>
    </div>
  );
}

function SettingsScreen({ establishment, isAdmin }) {
  const [copied, setCopied] = useState(false);
  function copyCode() {
    navigator.clipboard.writeText(establishment.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="container">
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>Your access</div>
        <p style={{ fontSize: 14 }}>{isAdmin ? "Full access — you can add, edit, and delete records." : "View only — you can see everything, but only the admin can make changes."}</p>
      </div>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>Invite code</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>Share this with anyone who should have access.</p>
        <div className="row-between" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px" }}>
          <span className="font-tag" style={{ fontSize: 16, fontWeight: 600 }}>{establishment.invite_code}</span>
          <button onClick={copyCode} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
          </button>
        </div>
      </div>
      <button className="btn btn-secondary" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%" }} onClick={() => supabase.auth.signOut()}>
        <LogOut size={15} /> Sign out
      </button>
    </div>
  );
}
