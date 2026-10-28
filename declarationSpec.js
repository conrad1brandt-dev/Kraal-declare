// The official DVS "Animal Health Declaration and Fanmeat Form" (4 pages, questions 1-51),
// described once and used by both the on-screen form and the printable copy.
// Answers live in declarations.answers as { [fieldId]: value }; tables are arrays of row objects.

export const YN = [["yes", "Yes"], ["no", "No"], ["na", "N/A"]];
export const YDNN = [["yes", "Yes"], ["dk", "Do not know"], ["no", "No"], ["na", "N/A"]];
export const PMG = [["poor", "Poor"], ["medium", "Medium"], ["good", "Good"], ["na", "N/A"]];

const yn = (id, label, extra = {}) => ({ id, type: "yn", label, ...extra });
const pmg = (id, label) => ({ id, type: "pmg", label });
const num = (id, label, extra = {}) => ({ id, type: "num", label, ...extra });
const text = (id, label, extra = {}) => ({ id, type: "text", label, ...extra });
const table = (id, label, cols, rows) => ({ id, type: "table", label, cols, rows });
const col = (key, label, type = "text", w) => ({ key, label, type, w });
const advice = (prefix) => ["State Veterinarian", "Private Veterinarian", "Animal Health Technician", "Vet Drugs Sales Rep"].flatMap((who, i) => [
  yn(`${prefix}_${i}`, who, { countId: `${prefix}_${i}_n` }),
]);

export const SECTIONS = [
  // ---------------- page 1
  { no: 1, page: 1, title: "For which period are you reporting?", fields: [
    { id: "q1_period", type: "period", label: "Period" },
  ] },
  { no: 2, page: 1, title: "Current farm details", fields: [
    text("q2_owner", "Owner Name", { wide: true }),
    text("q2_est_name", "Establishment Name", { wide: true }),
    text("q2_est_no", "Establishment No"), text("q2_district", "District"),
    text("q2_fanmeat", "Fanmeat No"), text("q2_constituency", "Constituency"),
    text("q2_postal", "Postal Address", { wide: true, multiline: true }),
    text("q2_email", "E-mail", { wide: true }),
    text("q2_tel", "Tel Number"), text("q2_fax", "Fax Number"), text("q2_mobile", "Mobile Number"),
    { id: "q2_system", type: "choice", label: "Farming System", options: [["commercial", "Commercial"], ["communal", "Communal"], ["peri_urban", "Peri-urban"], ["resettlement", "Resettlement"], ["other", "Other"]], otherId: "q2_system_other" },
  ] },
  { no: 3, page: 1, title: "Registered brand marks on establishment", fields: [
    table("q3_brands", null, [col("brand", "Stock Brand", "text", 35), col("owner", "Stock Brand Owner", "text", 65)], 12),
  ] },
  { no: 4, page: 1, title: "Livestock numbers on establishment", fields: [
    { id: "q4_grid", type: "numgrid", items: [
      ["q4_beef", "Beef Cattle"], ["q4_dairy", "Dairy Cattle"], ["q4_karakul", "Karakul"], ["q4_dorper", "Dorper"], ["q4_other_sheep", "Other Sheep"],
      ["q4_boerbok", "Boerbok"], ["q4_other_goats", "Other Goats"], ["q4_poultry", "Poultry"], ["q4_ostriches", "Ostriches"],
      ["q4_horses", "Horses"], ["q4_donkeys", "Donkeys"], ["q4_mules", "Mules"], ["q4_pigs", "Pigs"],
    ] },
    { id: "q4_breeding", type: "numgrid", label: "Breeding", items: [
      ["q4_bulls", "Bulls"], ["q4_cows", "Cows"], ["q4_heifers", "Heifers"], ["q4_oxen", "Oxen"],
      ["q4_calves_m", "Calves Male less than 1 year"], ["q4_calves_f", "Calves Female less than 1 year"],
      ["q4_sheep_1y", "Sheep - 1 year or older"], ["q4_goats_1y", "Goats - 1 year or older"],
    ], column: true },
  ] },
  // ---------------- page 2
  { no: 5, page: 2, title: "Number of imported animals", fields: [
    { id: "q5_grid", type: "numgrid", items: [["q5_cattle", "Cattle"], ["q5_sheep", "Sheep"], ["q5_goats", "Goats"], ["q5_other", "Other"]] },
  ] },
  { no: 6, page: 2, title: "Livestock identification", fields: [
    yn("q6", "Are all animals marked, branded, tagged and registered in accordance with current legislation?"),
  ] },
  { no: 7, page: 2, title: "Documentation and records", sub: "Are the following 5 documents available, eligible and up-to-date?", fields: [
    yn("q7_livestock", "Livestock Register"), yn("q7_feed", "Feed Register"), yn("q7_vet", "Veterinary Drug and Treatment Register"),
    yn("q7_training", "Employee Training"), yn("q7_movements", "Departure & Arrival records"),
  ] },
  { no: 8, page: 2, title: "Livestock traceability", fields: [
    yn("q8", "Are records of all animals movements into and from the establishment up to date and reported to DVS?"),
  ] },
  { no: 9, page: 2, title: "Number of pets", fields: [
    { id: "q9_grid", type: "numgrid", items: [["q9_dogs", "Dogs"], ["q9_cats", "Cats"]] },
  ] },
  { no: 10, page: 2, game: true, title: "Game farming", fields: [yn("q10", "Is game harvested for commercial meat or biltong?")] },
  { no: 11, page: 2, game: true, title: "Number of main game species", fields: [table("q11", null, [col("species", "Game Species", "text", 65), col("n", "Estimated Number", "num", 35)], 4)] },
  { no: 12, page: 2, game: true, title: "Main game species harvested", fields: [table("q12", null, [col("species", "Game Species", "text", 65), col("n", "Estimated Number", "num", 35)], 4)] },
  { no: 13, page: 2, game: true, title: "Wildebeest", fields: [yn("q13", "Are wildebeest kept on the establishment?"), num("q13_n", "Estimated Number")] },
  { no: 14, page: 2, game: true, title: "Game-proof fencing", fields: [yn("q14", "Are farmed game animals on establishment confined by prescribed gameproof fencing?")] },
  { no: 15, page: 2, title: "Loss of cattle to predators", fields: [table("q15", null, [col("predator", "Predator", "text", 70), col("n", "Number Lost", "num", 30)], 2)] },
  { no: 16, page: 2, title: "Loss of small stock to predators", fields: [
    table("q16_sheep", "Sheep", [col("predator", "Predator", "text", 70), col("n", "Number Lost", "num", 30)], 2),
    table("q16_goats", "Goats", [col("predator", "Predator", "text", 70), col("n", "Number Lost", "num", 30)], 2),
  ] },
  { no: 17, page: 2, title: "Give the number of animals stolen from the establishment", fields: [
    { id: "q17_grid", type: "numgrid", items: [["q17_cattle", "Cattle"], ["q17_sheep", "Sheep"], ["q17_goats", "Goats"]] },
    table("q17_other", "Other", [col("type", "Other", "text", 70), col("n", "Number Stolen", "num", 30)], 2),
  ] },
  { no: 18, page: 2, title: "Give the number of animals slaughtered on the establishment for own consumption", fields: [
    { id: "q18_grid", type: "numgrid", items: [["q18_cattle", "Cattle"], ["q18_sheep", "Sheep"], ["q18_goats", "Goats"]] },
  ] },
  { no: 19, page: 2, title: "What were the main causes of sickness and deaths of animals on the establishment?", fields: ["cattle", "sheep", "goats"].map((s) =>
    table(`q19_${s}`, s[0].toUpperCase() + s.slice(1), [col("disease", "Disease", "text", 60), col("sick", "No Sick", "num", 20), col("dead", "No Dead", "num", 20)], 3)) },
  { no: 20, page: 2, title: "What were the main causes of sickness and deaths of other animals on the establishment?", fields: [
    table("q20", null, [col("type", "Animal Type", "text", 25), col("disease", "Disease", "text", 45), col("sick", "No Sick", "num", 15), col("dead", "No Dead", "num", 15)], 3),
  ] },
  { no: 21, page: 2, title: "What were the main clinical signs of unknown causes of animals sickness and deaths on the establishment?", fields: [
    table("q21", null, [col("type", "Animal Type", "text", 25), col("signs", "Clinical Signs", "text", 45), col("sick", "No Sick", "num", 15), col("dead", "No Dead", "num", 15)], 3),
  ] },
  // ---------------- page 3
  { no: 22, page: 3, title: "Did sick cattle, sheep or goats on the establishment show any nervous signs as described in the declaration", fields: [
    table("q22", null, [col("type", "Animal Type", "text", 25), col("signs", "Clinical Signs", "text", 45), col("sick", "No Sick", "num", 15), col("dead", "No Dead", "num", 15)], 4),
  ] },
  { no: 23, page: 3, title: "Were there any abortions on the establishment?", fields: [
    { id: "q23_grid", type: "numgrid", items: [["q23_cattle", "Cattle"], ["q23_sheep", "Sheep"], ["q23_goats", "Goats"]] },
    yn("q23", "Abortions"),
  ] },
  { no: 24, page: 3, title: "Did any animals show signs that you suspected to be those of foot-and-mouth disease?", fields: [yn("q24", "Suspected FMD", { countId: "q24_n", countLabel: "No Affected" })] },
  { no: 25, page: 3, title: "Did any animals show signs that you suspected to be those of sheep scab?", fields: [yn("q25", "Suspected sheep scab", { countId: "q25_n", countLabel: "No Affected" })] },
  { no: 26, page: 3, title: "Were there tick problems in the cattle herd?", fields: [yn("q26", "Ticks in cattle")] },
  { no: 27, page: 3, title: "Are there tick problems among the sheep and goats?", fields: [yn("q27", "Ticks in sheep and goats")] },
  { no: 28, page: 3, title: "What is the condition of grazing on the establishment?", fields: [pmg("q28_quantity", "Quantity of Grazing"), pmg("q28_quality", "Quality of Grazing")] },
  { no: 29, page: 3, title: "What are the sources of water used for livestock on the establishment?", fields: [
    { id: "q29", type: "multi", options: [["pipeline", "Pipeline"], ["borehole", "Borehole"], ["dam", "Dam"], ["surface", "Surface Water"], ["river", "River"]] },
  ] },
  { no: 30, page: 3, title: "What is the water situation on the establishment?", fields: [pmg("q30_quantity", "Quantity"), pmg("q30_quality", "Quality")] },
  { no: 31, page: 3, title: "What is the general condition of animals on the establishment?", fields: [pmg("q31_cattle", "Cattle"), pmg("q31_sheep", "Sheep"), pmg("q31_goats", "Goats")] },
  { no: 32, page: 3, wide: true, title: "What are the main supplementary feeds for animals used on the establishment?", sub: "Write names of stock feeds bought or main ingredients of own mixes for each animal type.", fields:
    [["cattle", "Cattle"], ["poultry", "Poultry"], ["sheep", "Sheep"], ["pigs", "Pigs"], ["goats", "Goats"], ["game", "Game"]].map(([k, l]) =>
      table(`q32_${k}`, l, [col("feed", "Feed / Main Ingredients", "text", 100)], 3)) },
  { no: 33, page: 3, title: "Were supplementary feeds for cattle, sheep, goats or game contain meat or bone meal", fields: [yn("q33", "Meat or bone meal", { options: YDNN, specifyId: "q33_specify" })] },
  { no: 34, page: 3, title: "Did supplementary feeds or licks fed to cattle, sheep, goats or game contain poultry manure", fields: [yn("q34", "Poultry manure", { options: YDNN, specifyId: "q34_specify" })] },
  { no: 35, page: 3, title: "Are veterinary drugs stored seperately and according to manufacturer recommendations and clearly labelled?", fields: [yn("q35", "Vet drugs stored correctly")] },
  { no: 36, page: 3, title: "Does feed given to cattle, sheep or goats contain antibiotics?", fields: [yn("q36", "Antibiotics in feed", { specifyId: "q36_specify" })] },
  { no: 37, page: 3, title: "Were cattle vaccinated againts anthrax?", fields: [yn("q37", "Anthrax"), text("q37_batch", "Batch No"), text("q37_date", "Date"), num("q37_n", "Cattle")] },
  { no: 38, page: 3, title: "Were cattle vaccinated againts brucellosis?", fields: [yn("q38", "Brucellosis"), text("q38_batch", "Batch No"), text("q38_date", "Date"), num("q38_n", "Heifers")] },
  // ---------------- page 4
  { no: 39, page: 4, title: "Which other vaccines were used on the establishment?", fields: [["cattle", "Cattle"], ["sheep", "Sheep"], ["goats", "Goats"]].map(([k, l]) =>
    table(`q39_${k}`, l, [col("name", "Vaccine Name", "text", 75), col("n", l, "num", 25)], 2)) },
  { no: 40, page: 4, title: "Were dog(s) and cat(s) on the establishment vaccinated against rabies?", fields: [
    yn("q40", "Rabies"), text("q40_dog_batch", "Batch No (dogs)"), text("q40_dog_date", "Date"), num("q40_dogs", "Dogs"),
    text("q40_cat_batch", "Batch No (cats)"), text("q40_cat_date", "Date"), num("q40_cats", "Cats"),
  ] },
  { no: 41, page: 4, title: "What livestock medicines including dip chemicals used on the establishment. Give details of the names of medicines and animal type on which they were used", fields: [
    table("q41", null, [col("type", "Animal Type", "text", 30), col("name", "Name of Medicines/Dip Used", "text", 70)], 4),
  ] },
  { no: 42, page: 4, title: "Were animal medicines used on the establishment include banned substances listed in table 4 of the declaration guide", fields: [yn("q42", "Banned substances", { specifyId: "q42_specify" })] },
  { no: 43, page: 4, title: "Are antibiotics generally used as preventative measure without the prescription of a veterinarian?", fields: [yn("q43", "Preventative antibiotics")] },
  { no: 44, page: 4, title: "Are chemicals (e.g. arboricides, pesticides) stored and labelled accordingly?", fields: [yn("q44", "Chemicals stored and labelled")] },
  { no: 45, page: 4, title: "Is staff working with animals, instructed and trained for their duties?", fields: [yn("q45", "Staff trained")] },
  { no: 46, page: 4, title: "Do sick or injured animals receive immediate attention?", fields: [yn("q46", "Immediate attention")] },
  { no: 47, page: 4, title: "Did the farmer ask for any advise from any of the following people?", fields: advice("q47") },
  { no: 48, page: 4, title: "Did the establishment receive a visit from any of these people?", fields: advice("q48") },
  { no: 49, page: 4, title: "Handling of animals", fields: [
    yn("q49_1", "Are electric immobilisers used when handling animals?"),
    yn("q49_2", "Is castration of males without anesthesia done before the age of 4 weeks?"),
    yn("q49_3", "Are cattle dehorned before the age of 6 weeks?"),
    yn("q49_4", "Are the instruments used for drug administration, branding and tagging functional and kept in a clean and hygienic condition?"),
    yn("q49_5", "Are handling facilities constructed and maintained in such a way that they minimize stress and injuries?"),
  ] },
  { no: 50, page: 4, title: "Woolworth free range beef / free range lamb", fields: [
    yn("q50_1", "(i) Is an annual management plan available?"),
    { id: "q50_2", type: "choice", label: "(ii) How was the withdrawal period of medicine applied?", options: [["mfr", "Period as recommended by manufacturer"], ["2x", "2x period recommended by manufacturer"], ["unsure", "Not sure"]] },
    yn("q50_3a", "(iii) Predator management – Poisoning?"),
    yn("q50_3b", "(iii) Predator management – Gin Traps?"),
  ] },
  { no: 51, page: 4, title: "Additional comments / corrective measures", fields: [text("q51", "Comments", { wide: true, multiline: true, rows: 5 })] },
  { no: 0, page: 4, title: "Who completed this declaration?", fields: [
    { id: "s_who", type: "choice", label: "Completed by", options: [["owner", "Livestock Owner"], ["rep", "Authorised Representative"], ["aht", "AHT"]] },
    { id: "s_date", type: "date", label: "Date" },
    text("s_name", "Name"),
  ] },
];

// Answers that start fresh every half-year (period numbers, and anything the app fills in from its
// records, so an old correction never hides new data). Everything else is copied from the previous declaration.
export const FRESH = /^(q1_|q3_|q4_|q5_|q1[5-9]|q2[0-3]|q2[89]|q3[0-2]|q24_n|q25_n|q3[78]|q39_|q40_|q41|q47_|q48_|s_)/;
export const GAME_DEFAULTS = { q10: "na", q13: "na", q14: "na" };

export function allFieldIds() {
  const ids = [];
  for (const s of SECTIONS) for (const f of s.fields) {
    if (f.type === "numgrid") f.items.forEach(([id]) => ids.push(id));
    else ids.push(f.id);
    if (f.countId) ids.push(f.countId);
    if (f.specifyId) ids.push(f.specifyId);
    if (f.otherId) ids.push(f.otherId);
  }
  return ids;
}

export function carryOver(prevAnswers) {
  const out = {};
  for (const [k, v] of Object.entries(prevAnswers || {})) if (!FRESH.test(k)) out[k] = v;
  return out;
}

export function periodRange(period, year) {
  return period === "jan_jun" ? { start: `${year}-01-01`, end: `${year}-06-30` } : { start: `${year}-07-01`, end: `${year}-12-31` };
}

const lc = (s) => String(s || "").toLowerCase().trim();
const isMale = (a) => lc(a.sex).startsWith("m");
const ageYears = (dob, at) => (dob ? (new Date(at) - new Date(dob)) / (365.25 * 864e5) : null);
const SPECIES3 = ["cattle", "sheep", "goats"];
const normSpecies = (s) => { const x = lc(s); if (x.startsWith("cat") || x.startsWith("bees") || x.startsWith("cow")) return "cattle"; if (x.startsWith("sheep") || x.startsWith("skaap")) return "sheep"; if (x.startsWith("goat") || x.startsWith("bok")) return "goats"; return x; };
export const productName = (note) => String(note || "").split(/\s+[—–-]\s+/)[0].trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

// Herd numbers for question 4, from the active animal register.
export function herdNumbers(animals, at = new Date().toISOString().slice(0, 10)) {
  const n = { q4_beef: 0, q4_dairy: 0, q4_karakul: 0, q4_dorper: 0, q4_other_sheep: 0, q4_boerbok: 0, q4_other_goats: 0, q4_poultry: 0, q4_ostriches: 0, q4_horses: 0, q4_donkeys: 0, q4_mules: 0, q4_pigs: 0,
    q4_bulls: 0, q4_cows: 0, q4_heifers: 0, q4_oxen: 0, q4_calves_m: 0, q4_calves_f: 0, q4_sheep_1y: 0, q4_goats_1y: 0 };
  for (const a of animals) {
    if (a.status && a.status !== "active") continue;
    const cat = lc(a.breed_category);
    const age = ageYears(a.dob, at);
    const young = age != null ? age < 1 : /^(lam|kalf|calf|lamb|kid)/.test(cat);
    if (a.species === "cattle") {
      if (cat.includes("dairy") || cat.includes("melk")) n.q4_dairy++; else n.q4_beef++;
      if (young || cat.startsWith("kalf")) isMale(a) ? n.q4_calves_m++ : n.q4_calves_f++;
      else if (cat.startsWith("bul")) n.q4_bulls++;
      else if (cat.startsWith("groot koei") || cat.startsWith("koei") || cat.startsWith("cow")) n.q4_cows++;
      else if (cat.includes("vers") || cat.includes("heifer")) n.q4_heifers++;
      else if (cat.startsWith("tollie") || cat.startsWith("os") || cat.includes("ox")) n.q4_oxen++;
      else isMale(a) ? n.q4_bulls++ : n.q4_cows++;
    } else if (a.species === "sheep") {
      if (cat.includes("karakul")) n.q4_karakul++; else if (cat.includes("dorper")) n.q4_dorper++; else n.q4_other_sheep++;
      if (!young) n.q4_sheep_1y++;
    } else if (a.species === "goats") {
      if (cat.includes("boerbok") || cat.includes("boer goat")) n.q4_boerbok++; else n.q4_other_goats++;
      if (!young) n.q4_goats_1y++;
    } else {
      const k = { pigs: "q4_pigs", donkeys: "q4_donkeys", horses: "q4_horses", ostriches: "q4_ostriches", poultry: "q4_poultry" }[a.species];
      if (k) n[k]++;
    }
  }
  return n;
}

// Everything the app can fill in itself, keyed by field id.
// `d` holds the raw rows loaded for the declaration period.
export function computeAuto(decl, d) {
  const auto = { q1_period: decl.period, ...GAME_DEFAULTS };
  const e = d.establishment || {};
  if (e.name) auto.q2_est_name = e.name.trim();
  if (e.establishment_no) auto.q2_est_no = e.establishment_no;
  if (e.district) auto.q2_district = e.district;
  if (e.constituency) auto.q2_constituency = e.constituency;
  if (e.postal_address) auto.q2_postal = e.postal_address;
  if (e.farming_system) auto.q2_system = lc(e.farming_system).replace(/[- ]/g, "_");

  // 3. brand marks: registered first, then pending ones
  const brands = [];
  for (const o of d.owners || []) {
    const marks = Array.isArray(o.brand_marks) ? o.brand_marks : o.brand_marks ? [o.brand_marks] : [];
    for (const m of marks) brands.push({ brand: m.stock_brand_code || "Pending registration", owner: o.full_name, _reg: m.status === "registered" && m.stock_brand_code ? 0 : 1 });
  }
  brands.sort((a, b) => a._reg - b._reg || a.owner.localeCompare(b.owner));
  if (brands.length) auto.q3_brands = brands.map(({ brand, owner }) => ({ brand, owner }));

  // 4. herd
  Object.assign(auto, herdNumbers(d.animals || [], d.asAt));

  // 5. imported: left to the farmer (arrivals from other farms are not imports)
  // 15-16 predators, 17 theft
  const pred = {};
  for (const p of d.predators || []) {
    const s = normSpecies(p.species); const k = `${s}|${cap(p.predator || "Unknown")}`;
    pred[k] = (pred[k] || 0) + (Number(p.number_lost) || 0);
  }
  const predRows = (s) => Object.entries(pred).filter(([k]) => k.startsWith(s + "|")).map(([k, n]) => ({ predator: k.split("|")[1], n }));
  if (predRows("cattle").length) auto.q15 = predRows("cattle");
  if (predRows("sheep").length) auto.q16_sheep = predRows("sheep");
  if (predRows("goats").length) auto.q16_goats = predRows("goats");
  const stolen = { cattle: 0, sheep: 0, goats: 0 }; const stolenOther = {};
  for (const t of d.thefts || []) {
    const s = normSpecies(t.species);
    if (stolen[s] != null) stolen[s] += Number(t.number_stolen) || 0; else stolenOther[cap(s)] = (stolenOther[cap(s)] || 0) + (Number(t.number_stolen) || 0);
  }
  SPECIES3.forEach((s) => { auto[`q17_${s}`] = stolen[s]; });
  if (Object.keys(stolenOther).length) auto.q17_other = Object.entries(stolenOther).map(([type, n]) => ({ type, n }));

  // 18. own consumption
  const own = { cattle: 0, sheep: 0, goats: 0 };
  for (const s of d.slaughters || []) { const sp = normSpecies(s.animals?.species); if (s.purpose === "own_consumption" && own[sp] != null) own[sp]++; }
  for (const s of d.ownUse || []) { const sp = normSpecies(s.species); if (own[sp] != null) own[sp] += Number(s.number) || 0; }
  SPECIES3.forEach((s) => { auto[`q18_${s}`] = own[s]; });

  // 19-21 sickness and deaths
  const dis = {}; const other = {}; const unknown = {};
  for (const r of d.diseases || []) {
    const s = normSpecies(r.animal_type);
    if (r.record_type === "unknown_cause") {
      const k = `${cap(s)}|${(r.clinical_signs || "").trim() || "Unknown"}`;
      unknown[k] = unknown[k] || { sick: 0, dead: 0 }; unknown[k].sick += r.no_sick || 0; unknown[k].dead += r.no_dead || 0;
    } else {
      const bucket = SPECIES3.includes(s) ? dis : other;
      const k = `${s}|${(r.disease || "").trim() || "Unknown"}`;
      bucket[k] = bucket[k] || { sick: 0, dead: 0 }; bucket[k].sick += r.no_sick || 0; bucket[k].dead += r.no_dead || 0;
    }
  }
  SPECIES3.forEach((s) => {
    const rows = Object.entries(dis).filter(([k]) => k.startsWith(s + "|")).map(([k, v]) => ({ disease: k.split("|")[1], sick: v.sick, dead: v.dead }));
    if (rows.length) auto[`q19_${s}`] = rows;
  });
  const otherRows = Object.entries(other).map(([k, v]) => ({ type: cap(k.split("|")[0]), disease: k.split("|")[1], sick: v.sick, dead: v.dead }));
  if (otherRows.length) auto.q20 = otherRows;
  const unkRows = Object.entries(unknown).map(([k, v]) => ({ type: k.split("|")[0], signs: k.split("|")[1], sick: v.sick, dead: v.dead }));
  if (unkRows.length) auto.q21 = unkRows;

  // 28-31 from the latest grazing & water report
  const g = d.grazing;
  if (g) {
    const v = (x) => (["poor", "medium", "good"].includes(lc(x)) ? lc(x) : undefined);
    Object.assign(auto, Object.fromEntries(Object.entries({
      q28_quantity: v(g.grazing_quantity), q28_quality: v(g.grazing_quality), q30_quantity: v(g.water_quantity), q30_quality: v(g.water_quality),
      q31_cattle: v(g.cattle_condition), q31_sheep: v(g.sheep_condition), q31_goats: v(g.goats_condition),
    }).filter(([, x]) => x)));
    const src = (g.water_sources || []).map((s) => (lc(s).startsWith("surface") ? "surface" : lc(s)));
    if (src.length) auto.q29 = src;
  }

  // 32-34 feeds
  const feeds = {};
  for (const f of d.feed || []) {
    const s = normSpecies(f.species) || "cattle";
    for (const name of String(f.feed_ingredients || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) (feeds[s] = feeds[s] || new Set()).add(name);
  }
  if (!Object.keys(feeds).length && (d.budgetFeeds || []).length) {
    for (const s of SPECIES3) feeds[s] = new Set(d.budgetFeeds);
  }
  for (const [s, set] of Object.entries(feeds)) if (["cattle", "sheep", "goats", "poultry", "pigs", "game"].includes(s)) auto[`q32_${s}`] = [...set].slice(0, 3).map((feed) => ({ feed }));
  if ((d.feed || []).length) {
    auto.q33 = d.feed.some((f) => f.contains_meat_bone_meal) ? "yes" : "no";
    auto.q34 = d.feed.some((f) => f.contains_poultry_manure) ? "yes" : "no";
  }

  // 37-39 vaccines, 41 medicines
  const vacc = [
    ...(d.vaccinations || []).map((v) => ({ species: normSpecies(v.species), name: v.vaccine_name, batch: v.batch_no, date: v.date_given, n: Number(v.count) || 1 })),
    ...(d.healthEvents || []).filter((h) => h.event_type === "vaccination").map((h) => ({ species: normSpecies(h.species), name: productName(h.note) || "Vaccine", batch: h.batch_no, date: h.date, n: 1 })),
  ];
  const special = (re) => vacc.filter((v) => v.species === "cattle" && re.test(v.name || ""));
  for (const [q, re] of [["q37", /anthrax|miltsiek/i], ["q38", /brucell|s19|rb51/i]]) {
    const hits = special(re);
    if (hits.length) {
      auto[q] = "yes";
      auto[`${q}_batch`] = [...new Set(hits.map((h) => h.batch).filter(Boolean))].join(", ");
      auto[`${q}_date`] = [...new Set(hits.map((h) => fmtDate(h.date)))].join(", ");
      auto[`${q}_n`] = hits.reduce((s, h) => s + h.n, 0);
    }
  }
  for (const s of SPECIES3) {
    const byName = {};
    for (const v of vacc.filter((x) => x.species === s && !(s === "cattle" && /anthrax|miltsiek|brucell|s19|rb51/i.test(x.name || "")))) byName[v.name] = (byName[v.name] || 0) + v.n;
    const rows = Object.entries(byName).map(([name, n]) => ({ name, n }));
    if (rows.length) auto[`q39_${s}`] = rows;
  }
  const meds = {};
  const addMed = (s, name) => { if (!name) return; (meds[cap(s)] = meds[cap(s)] || new Set()).add(name); };
  for (const h of d.healthEvents || []) if (h.event_type !== "vaccination") addMed(normSpecies(h.species), productName(h.note));
  for (const m of d.medicines || []) addMed(normSpecies(m.animal_type), m.medicine_name + (m.is_dip ? " (dip)" : ""));
  const medRows = Object.entries(meds).map(([type, set]) => ({ type, name: [...set].join(", ") }));
  if (medRows.length) auto.q41 = medRows;

  return auto;
}

export const valueOf = (answers, auto, id) => (answers && answers[id] !== undefined ? answers[id] : auto ? auto[id] : undefined);
