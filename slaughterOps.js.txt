// One complete "log a slaughter" action: animal status + income entry (if sold) + slaughter record.
// Every step is safe to repeat, so if the signal drops halfway the app can simply replay it later.
import { supabase } from "./supabaseClient";

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

export async function runSlaughterInsert(estId, form) {
  const recId = form._rec_id || newId();
  const txnId = form._txn_id || newId();
  const totalValue = form.purpose === "sold" && form.weight_kg && form.price_per_kg
    ? Number(form.weight_kg) * Number(form.price_per_kg) : null;

  // 1. mark the animal as slaughtered
  let r = await supabase.from("animals").update({ status: "slaughtered" }).eq("id", form.animal_id);
  if (r.error) return r;

  // 2. if sold, the matching Finance income entry
  let linkedTxnId = null;
  if (form.purpose === "sold" && totalValue) {
    r = await supabase.from("transactions").upsert({
      id: txnId,
      establishment_id: estId,
      owner_id: form.owner_id || null,
      animal_id: form.animal_id,
      type: "income",
      category: "Livestock sale",
      amount: totalValue,
      date: form.date,
      description: `Slaughter sale — ${form.buyer_name || "buyer not recorded"}`,
    }, { onConflict: "id" });
    if (r.error) return r;
    linkedTxnId = txnId;
  }

  // 3. the slaughter record itself
  return supabase.from("slaughter_records").upsert({
    id: recId,
    establishment_id: estId,
    animal_id: form.animal_id,
    date: form.date,
    weight_kg: form.weight_kg || null,
    purpose: form.purpose,
    price_per_kg: form.purpose === "sold" ? form.price_per_kg || null : null,
    total_value: totalValue,
    buyer_name: form.buyer_name || null,
    buyer_contact: form.purpose === "sold" ? form.buyer_contact || null : null,
    linked_transaction_id: linkedTxnId,
  }, { onConflict: "id" });
}
