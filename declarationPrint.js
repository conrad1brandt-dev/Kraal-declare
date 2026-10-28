// Printable copy of the DVS Animal Health Declaration and Fanmeat Form: four A4 pages,
// laid out like the paper form (same numbering, wording and column placement).
import { SECTIONS, YN, PMG, valueOf } from "./declarationSpec";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const box = (on) => `<span class="cb">${on ? "✕" : ""}</span>`;
const isShort = (f) => /^(Suspected|Ticks|Meat|Poultry|Vet drugs|Antibiotics in|Anthrax|Brucellosis|Rabies|Banned|Preventative|Chemicals|Staff|Immediate|Abortions)/.test(f.label || "");
const fmtDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "");

// Which sections sit in which column, page by page, as on the paper form.
const LAYOUT = [
  { rows: [{ left: [1, 2], right: [3, 4], intro: true }] },
  { rows: [{ left: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], right: [16, 17, 18, 19, 20, 21] }] },
  { rows: [{ left: [22, 23, 24, 25, 26, 27], right: [28, 29, 30, 31] }, { full: [32] }, { left: [33, 34, 35], right: [36, 37, 38] }] },
  { rows: [{ left: [39, 40, 41, 42, 43, 44, 45, 46, 47, 48], right: [49, 50, 51, 0] }] },
];

export function printHtml(decl, answers, auto) {
  const val = (id) => valueOf(answers, auto, id);
  const byNo = Object.fromEntries(SECTIONS.map((s) => [s.no, s]));
  const opts = (options, v) => options.map(([k, l]) => `<span class="opt">${box(v === k)} ${esc(l)}</span>`).join("");
  const valBox = (v, cls = "") => `<span class="val ${cls}">${esc(v ?? "")}</span>`;

  function field(f) {
    switch (f.type) {
      case "period":
        return `<div class="line">Mark one box and complete the year</div>
          <div class="line">${opts([["jan_jun", "January to June"], ["jul_dec", "July to December"]], decl.period)} <span class="lbl">Year</span> ${valBox(decl.year, "w60")}</div>`;
      case "yn":
      case "pmg": {
        const v = val(f.id);
        const o = opts(f.options || (f.type === "pmg" ? PMG : YN), v);
        const count = f.countId ? ` <span class="lbl">${esc(f.countLabel || "Number")}</span> ${valBox(val(f.countId), "w50")}` : "";
        const spec = f.specifyId ? `<div class="line"><span class="lbl">If yes, specify</span> ${valBox(val(f.specifyId), "grow")}</div>` : "";
        const short = isShort(f);
        return `<div class="line yn">${short ? "" : `<span class="q">${esc(f.label)}</span>`}<span class="opts">${o}${count}</span></div>${spec}`;
      }
      case "num":
      case "text":
      case "date": {
        const v = f.type === "date" ? fmtDate(val(f.id)) : val(f.id);
        if (f.multiline) {
          const lines = String(v || "").split("\n");
          const n = Math.max(f.rows || 3, lines.length);
          return `${f.id === "q51" ? "" : `<div class="lbl">${esc(f.label)}</div>`}${Array.from({ length: n }, (_, i) => `<div class="ruled">${esc(lines[i] || "")}</div>`).join("")}`;
        }
        return `<div class="line"><span class="lbl fix">${esc(f.label)}</span> ${valBox(v, "grow")}</div>`;
      }
      case "numgrid": {
        const cells = f.items.map(([id, l]) => `<div class="cell"><span class="lbl">${esc(l)}</span>${valBox(val(id), "w50")}</div>`).join("");
        return `${f.label ? `<div class="sublbl">${esc(f.label)}</div>` : ""}<div class="${f.column ? "col1" : "grid"}">${cells}</div>`;
      }
      case "multi": {
        const v = val(f.id) || [];
        return `<div class="line">${f.options.map(([k, l]) => `<span class="opt">${esc(l)} ${box(v.includes(k))}</span>`).join("")}</div>`;
      }
      case "choice": {
        const v = val(f.id);
        const other = f.otherId ? ` ${valBox(v === "other" ? val(f.otherId) : "", "w100")}` : "";
        return `<div class="lbl">${esc(f.label)}</div><div class="line wrap">${opts(f.options, v)}${other}</div>`;
      }
      case "table": {
        const rows = val(f.id) || [];
        const n = Math.max(f.rows, rows.length);
        const head = `<tr>${f.cols.map((c) => `<th style="width:${c.w}%">${esc(c.label)}</th>`).join("")}</tr>`;
        const body = Array.from({ length: n }, (_, i) => `<tr>${f.cols.map((c) => `<td>${esc(rows[i] ? rows[i][c.key] : "")}</td>`).join("")}</tr>`).join("");
        return `${f.label ? `<div class="sublbl center">${esc(f.label.toUpperCase())}</div>` : ""}<table>${head}${body}</table>`;
      }
      default:
        return "";
    }
  }

  function section(no) {
    const s = byNo[no];
    if (!s) return "";
    // vaccination questions: Yes/No on the title line, then "Batch No · Date · Number" rows like the paper
    if (no === 37 || no === 38 || no === 40) {
      const [q, ...rest] = s.fields;
      const rows = [];
      for (let i = 0; i < rest.length; i += 3) rows.push(rest.slice(i, i + 3));
      const cell = (f) => `<span class="lbl">${esc(f.label.replace(/ \((dogs|cats)\)/, ""))}</span> ${valBox(f.type === "date" ? fmtDate(val(f.id)) : val(f.id), f.type === "num" ? "w50" : "grow")}`;
      return `<div class="sec"><div class="line yn top"><div class="stitle q"><b>${no}.</b> ${esc(s.title)}</div><span class="opts">${opts(YN, val(q.id))}</span></div>
        ${rows.map((r) => `<div class="line">${r.map(cell).join("")}</div>`).join("")}</div>`;
    }
    // a single Yes/No question whose title is the question: options go on the title line, as on the paper
    const only = s.fields.length === 1 ? s.fields[0] : null;
    if (only && only.type === "yn" && isShort(only) && !only.countId && !only.options) {
      const spec = only.specifyId ? `<div class="line"><span class="lbl">If yes, specify</span> ${valBox(val(only.specifyId), "grow")}</div>` : "";
      return `<div class="sec"><div class="line yn top"><div class="stitle q"><b>${no}.</b> ${esc(s.title)}</div><span class="opts">${opts(only.options || YN, val(only.id))}</span></div>${spec}</div>`;
    }
    if (no === 0) {
      return `<div class="sec sign"><div class="stitle plain">Who completed this declaration?</div>
        <div class="line wrap">Mark ${box(true)} one box</div>
        <div class="line wrap">${opts(s.fields[0].options, val("s_who"))}</div>
        <div class="small">To be signed after completing this form. Please check that you have not missed any pages or questions.<br>This form was completed to the best of my knowledge and belief</div>
        <div class="line"><span class="lbl fix">Date</span> ${valBox(fmtDate(val("s_date")), "grow")}</div>
        <table class="signtbl"><tr><th>Name</th><th>Signature</th></tr><tr><td>${esc(val("s_name") || "")}</td><td></td></tr></table>
        <div class="official"><div class="obar">For Official Use Only</div><table><tr><th>Date Received</th><th>Verification Date</th></tr><tr><td>&nbsp;</td><td></td></tr></table>
        <table><tr><th>Name of Veterinary Official</th></tr><tr><td>&nbsp;</td></tr></table><div class="sigline">Signature</div></div></div>`;
    }
    if (no === 47 || no === 48) {
      const rows = s.fields.map((f) => `<tr><td>${esc(f.label)}</td><td class="opts">${opts(YN, val(f.id))}</td><td class="num">${esc(val(f.countId) ?? "")}</td></tr>`).join("");
      return `<div class="sec"><div class="stitle"><b>${no}.</b> ${esc(s.title)}</div><table class="plain"><tr><th></th><th></th><th class="num">Number</th></tr>${rows}</table></div>`;
    }
    const body = s.fields.map(field);
    const inner = no === 32 ? `<div class="grid2">${body.map((b) => `<div>${b}</div>`).join("")}</div>` : body.join("");
    return `<div class="sec${s.game ? " game" : ""}"><div class="stitle"><b>${no}.</b> ${esc(s.title)}</div>${s.sub ? `<div class="small">${esc(s.sub)}</div>` : ""}${inner}</div>`;
  }

  const intro = `<div class="start"><div class="starthd">Start Here</div><div class="small">Before answering the declaration please READ the following instructions:</div>
    <ul>
      <li>This declaration is to be completed by the establishment owner or a person responsible for the upkeep of the livestock.</li>
      <li>It is a requirement to complete this declaration under the Animal Health Act (Act no. 1 of 2011).</li>
      <li>The declaration must be completed every six months for the January to June and the July to December periods respectively.</li>
      <li>Every question must be completed fully. If no information or data is available or it is not applicable, indicate by writing N/A.</li>
    </ul></div>`;

  const pages = LAYOUT.map((p, i) => {
    const rows = p.rows.map((r) => (r.full
      ? `<div class="full">${r.full.map(section).join("")}</div>`
      : `<div class="cols"><div class="colL">${r.intro ? intro : ""}${r.left.map(section).join("")}</div><div class="colR">${r.right.map(section).join("")}</div></div>`)).join("");
    const head = i === 0 ? `<div class="tag">This is an official animal health declaration for all livestock farmers.</div>
      <div class="title">ANIMAL HEALTH DECLARATION AND FANMEAT FORM</div>
      <div class="banner">Directorate of Veterinary Services · Ministry of Agriculture, Water and Forestry · Republic of Namibia<br>
      <span>Complete the Animal Health Declaration and help the livestock industry to get the assistance it needs from Veterinary Services – today and in the future! (For completion by farmers)</span></div>` : "";
    return `<section class="page"><div class="frame">${head}${rows}</div><div class="pno">${i + 1}/4</div></section>`;
  }).join("");

  const est = (val("q2_est_name") || "").trim();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Animal Health Declaration ${decl.period === "jan_jun" ? "Jan–Jun" : "Jul–Dec"} ${decl.year}${est ? " – " + esc(est) : ""}</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Arial Narrow", "Roboto Condensed", Arial, sans-serif; font-size: 8.2pt; color: #111; background: #ddd; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 194mm; height: 281mm; overflow: hidden; margin: 6mm auto; background: #fff; padding: 1mm 2mm; position: relative; page-break-after: always; break-after: page; display: flex; flex-direction: column; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .frame { border: 1.4px solid #333; border-radius: 9px; background: #e9e9e9; padding: 2.6mm 3mm; flex: 1; }
  .pno { text-align: center; font-size: 8pt; margin-top: 1mm; }
  .tag { text-align: center; font-style: italic; font-weight: 700; font-size: 8.5pt; }
  .title { background: #2b2b2b; color: #fff; font-weight: 800; font-size: 15pt; letter-spacing: .6px; text-align: center; padding: 2mm; margin: 1mm 0; }
  .banner { background: #4a4a4a; color: #fff; font-size: 8pt; padding: 2mm 3mm; margin-bottom: 2.5mm; font-weight: 700; }
  .banner span { font-weight: 400; font-style: italic; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .full { margin: 1mm 0 2mm; }
  .sec { margin-bottom: 1.8mm; break-inside: avoid; }
  .stitle { text-transform: uppercase; font-size: 7.9pt; margin-bottom: 1mm; line-height: 1.2; }
  .stitle b { font-size: 10pt; }
  .stitle.plain { text-transform: none; font-weight: 700; }
  .game { opacity: .8; }
  .small { font-size: 7.6pt; color: #333; margin: .5mm 0 1mm; }
  .line { display: flex; align-items: center; gap: 1.5mm; margin: .45mm 0; }
  .line.wrap { flex-wrap: wrap; }
  .line.yn { justify-content: space-between; }
  .line.top { align-items: flex-end; } .line.top .stitle { margin-bottom: 0; }
  .q { flex: 1; font-size: 8.2pt; }
  .opts { display: inline-flex; gap: 2mm; align-items: center; white-space: nowrap; }
  .opt { display: inline-flex; align-items: center; gap: .8mm; white-space: nowrap; }
  .cb { display: inline-flex; width: 3.6mm; height: 3.6mm; background: #fff; align-items: center; justify-content: center; font-weight: 700; font-size: 8pt; line-height: 1; }
  .lbl { font-size: 8.2pt; white-space: nowrap; }
  .lbl.fix { min-width: 24mm; text-align: right; }
  .sublbl { font-weight: 700; margin: 1mm 0 .5mm; }
  .sublbl.center { text-align: center; font-weight: 400; }
  .val { display: inline-block; background: #fff; min-height: 4.1mm; padding: .3mm 1.2mm; font-family: "Courier New", monospace; font-weight: 700; font-size: 8.6pt; }
  .val.grow { flex: 1; } .val.w50 { width: 13mm; text-align: center; } .val.w60 { width: 20mm; text-align: center; } .val.w100 { width: 30mm; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 4mm; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1mm 2mm; }
  .col1 { display: grid; grid-template-columns: 1fr; gap: .8mm; margin-left: 20mm; }
  .cell { display: flex; justify-content: flex-end; align-items: center; gap: 1mm; }
  table { width: 100%; border-collapse: separate; border-spacing: 0 .55mm; }
  th { font-weight: 400; text-align: left; font-size: 8pt; padding: 0 1mm; }
  td { background: #fff; height: 4.2mm; padding: .2mm 1.2mm; font-family: "Courier New", monospace; font-weight: 700; font-size: 8.4pt; }
  table.plain td { background: none; font-family: inherit; font-weight: 400; } table.plain td.opts { white-space: nowrap; } table.plain td.num { background: #fff; width: 13mm; text-align: center; font-family: "Courier New", monospace; font-weight: 700; }
  th.num { text-align: center; }
  .ruled { background: #fff; min-height: 4.2mm; margin: .7mm 0; padding: .2mm 1.2mm; font-family: "Courier New", monospace; font-weight: 700; }
  .start { margin-bottom: 2mm; } .starthd { font-size: 16pt; font-weight: 800; } .start ul { margin: 1mm 0 0 4mm; padding: 0; font-size: 7.6pt; } .start li { margin-bottom: .6mm; }
  .sign { background: #fff; border-radius: 6px; padding: 2mm; }
  .sign .cb { border: 1px solid #333; }
  .signtbl td { border-bottom: 1px solid #333; height: 7mm; } .official { margin-top: 2mm; }
  .obar { text-align: center; font-weight: 700; font-size: 8pt; margin-bottom: .5mm; }
  .official th { background: #333; color: #fff; text-align: center; font-weight: 700; padding: .6mm; }
  .official td { border: 1px solid #bbb; height: 5mm; }
  .sigline { border-top: 1px solid #333; margin-top: 5mm; text-align: center; font-size: 7.5pt; padding-top: .5mm; }
  .bar { position: sticky; top: 0; background: #1A2E1A; color: #fff; padding: 8px 12px; display: flex; gap: 8px; align-items: center; justify-content: space-between; font-family: Arial, sans-serif; font-size: 13px; z-index: 5; }
  .bar button { background: #fff; color: #1A2E1A; border: 0; border-radius: 6px; padding: 6px 12px; font-weight: 700; }
  @media print { body { background: #fff; } .page { margin: 0; height: 280mm; } .bar { display: none; } }
  @media screen and (max-width: 800px) { .page { transform-origin: top left; } }
</style></head><body>
<div class="bar"><span>Animal Health Declaration · ${decl.period === "jan_jun" ? "January to June" : "July to December"} ${decl.year}</span><button onclick="window.print()">Print / Save PDF</button></div>
${pages}
<script>
  (function () {
    function fit() {
      var w = window.innerWidth, pw = document.querySelector('.page').offsetWidth + 24;
      var s = Math.min(1, w / pw);
      document.querySelectorAll('.page').forEach(function (p) {
        p.style.zoom = s < 1 ? s : '';
      });
    }
    window.addEventListener('resize', fit); fit();
    window.addEventListener('beforeprint', function () { document.querySelectorAll('.page').forEach(function (p) { p.style.zoom = ''; }); });
    window.addEventListener('afterprint', fit);
  })();
</script>
</body></html>`;
}

export function printDeclaration(decl, answers, auto) {
  const html = printHtml(decl, answers, auto);
  const w = window.open("", "_blank");
  if (!w) {
    // pop-ups blocked: fall back to a downloadable file
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `Animal-Health-Declaration-${decl.period}-${decl.year}.html`;
    a.click();
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
