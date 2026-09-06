import React from "react";
import { PawPrint, Tag, FileCheck, HeartPulse, Wrench, Scale, Wallet, Droplets, ClipboardList } from "lucide-react";

const WIDGETS = [
  { key: "animals", label: "Animals", icon: PawPrint, color: "var(--green)", soft: "var(--green-soft)" },
  { key: "owners", label: "Owners & Brands", icon: Tag, color: "var(--gold)", soft: "var(--gold-soft)" },
  { key: "declarations", label: "Declaration", icon: FileCheck, color: "var(--blue)", soft: "var(--blue-soft)" },
  { key: "slaughter", label: "Slaughter", icon: Scale, color: "var(--ink)", soft: "var(--line)" },
  { key: "finances", label: "Finances", icon: Wallet, color: "var(--green)", soft: "var(--green-soft)" },
  { key: "health", label: "Losses & Health", icon: HeartPulse, color: "var(--red)", soft: "var(--red-soft)" },
  { key: "registers", label: "Registers", icon: ClipboardList, color: "var(--rust)", soft: "var(--rust-soft)" },
  { key: "grazing", label: "Grazing & Water", icon: Droplets, color: "var(--blue)", soft: "var(--blue-soft)" },
];

export default function Home({ establishment, onNavigate }) {
  return (
    <div className="container">
      <div className="grid-2">
        {WIDGETS.map((w) => {
          const Icon = w.icon;
          return (
            <div key={w.key} className="widget-card" onClick={() => onNavigate(w.key)}>
              <div className="widget-icon" style={{ background: w.soft }}>
                <Icon size={26} color={w.color} />
              </div>
              <div className="widget-label">{w.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
