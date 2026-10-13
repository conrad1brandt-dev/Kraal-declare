// Animal photos: take offline, keep on the phone, upload when signal returns.
import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const BUCKET = "animal-photos";
const DB_NAME = "kd_photos";

function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("pending", { keyPath: "animalId" });
      d.createObjectStore("cache", { keyPath: "path" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function run(store, mode, fn) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { d.close(); resolve(req ? req.result : undefined); };
    t.onerror = () => { d.close(); reject(t.error); };
    t.onabort = () => { d.close(); reject(t.error); };
  });
}

const getPending = (animalId) => run("pending", "readonly", (s) => s.get(animalId)).catch(() => undefined);
const listPending = () => run("pending", "readonly", (s) => s.getAll()).catch(() => []);
const getCache = async (path) => { try { const r = await run("cache", "readonly", (s) => s.get(path)); return r ? r.blob : null; } catch { return null; } };
const putCache = (path, blob) => run("cache", "readwrite", (s) => s.put({ path, blob })).catch(() => {});

async function removePending(animalId, ts) {
  if (ts !== undefined) {
    const cur = await getPending(animalId);
    if (cur && cur.ts !== ts) return; // a newer photo was taken meanwhile: keep it
  }
  await run("pending", "readwrite", (s) => s.delete(animalId)).catch(() => {});
}

function notify(detail) {
  window.dispatchEvent(new CustomEvent("kd-photos-changed", { detail: detail || {} }));
}

async function refreshCount() {
  const n = (await listPending()).length;
  try { localStorage.setItem("kd_photo_pending", String(n)); } catch {}
  return n;
}
export function photoPendingCount() {
  try { return parseInt(localStorage.getItem("kd_photo_pending") || "0", 10) || 0; } catch { return 0; }
}
refreshCount();

// Shrink a camera photo to about 800px / 100 KB
export async function compressImage(file, maxDim = 800, quality = 0.72) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bmp = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bmp.width || bmp.naturalWidth;
  const h = bmp.height || bmp.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not shrink the photo"))), "image/jpeg", quality)
  );
}

export async function savePending(animalId, estId, blob) {
  await run("pending", "readwrite", (s) => s.put({ animalId, estId, blob, ts: Date.now() }));
  await refreshCount();
  notify({ animalId });
}

// Upload waiting photos. Safe to call often.
let busy = false;
const lastTry = {};
export async function flushPhotos() {
  if (busy || !navigator.onLine) return;
  busy = true;
  try {
    const items = await listPending();
    for (const it of items) {
      if (Date.now() - (lastTry[it.animalId] || 0) < 30000) continue;
      lastTry[it.animalId] = Date.now();
      const path = `${it.estId}/${it.animalId}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, it.blob, { contentType: "image/jpeg" });
      if (upErr) continue;
      const { data: old } = await supabase.from("animals").select("photo_path").eq("id", it.animalId).maybeSingle();
      const { data: updated, error: dbErr } = await supabase.from("animals").update({ photo_path: path }).eq("id", it.animalId).select("id");
      if (dbErr || !updated || updated.length === 0) {
        await supabase.storage.from(BUCKET).remove([path]);
        if (!dbErr) await removePending(it.animalId, it.ts); // animal no longer exists
        continue;
      }
      if (old && old.photo_path) await supabase.storage.from(BUCKET).remove([old.photo_path]);
      await putCache(path, it.blob);
      await removePending(it.animalId, it.ts);
      notify({ animalId: it.animalId, path });
    }
  } finally {
    busy = false;
    await refreshCount();
    notify({});
  }
}

export async function removePhoto(animal) {
  await removePending(animal.id);
  if (!navigator.onLine) {
    if (animal.photo_path) throw new Error("Removing an uploaded photo needs signal.");
    await refreshCount();
    notify({ animalId: animal.id, path: null });
    return;
  }
  const { data: cur } = await supabase.from("animals").select("photo_path").eq("id", animal.id).maybeSingle();
  if (cur && cur.photo_path) {
    const { error } = await supabase.from("animals").update({ photo_path: null }).eq("id", animal.id);
    if (error) throw error;
    await supabase.storage.from(BUCKET).remove([cur.photo_path]);
  }
  await refreshCount();
  notify({ animalId: animal.id, path: null });
}

// Used when an animal is deleted
export async function deleteAnimalPhoto(path, animalId) {
  await removePending(animalId);
  if (path) await supabase.storage.from(BUCKET).remove([path]);
  await refreshCount();
}

// React hook: local waiting photo first, then saved copy on the phone, then download once.
export function useAnimalPhoto(animal, enabled = true) {
  const [state, setState] = useState({ url: null, pending: false });
  const [override, setOverride] = useState(null); // { path }
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const f = (e) => {
      const d = (e && e.detail) || {};
      if (d.animalId === animal.id && "path" in d) setOverride({ path: d.path });
      setTick((t) => t + 1);
    };
    window.addEventListener("kd-photos-changed", f);
    return () => window.removeEventListener("kd-photos-changed", f);
  }, [animal.id]);

  const path = override ? override.path : animal.photo_path;

  useEffect(() => {
    if (!enabled) return undefined;
    let dead = false;
    let obj = null;
    (async () => {
      const p = await getPending(animal.id);
      if (p) {
        obj = URL.createObjectURL(p.blob);
        if (!dead) setState({ url: obj, pending: true });
        return;
      }
      if (!path) { if (!dead) setState({ url: null, pending: false }); return; }
      let blob = await getCache(path);
      if (!blob && navigator.onLine) {
        const { data } = await supabase.storage.from(BUCKET).download(path);
        if (data) { blob = data; await putCache(path, data); }
      }
      if (blob && !dead) {
        obj = URL.createObjectURL(blob);
        setState({ url: obj, pending: false });
      } else if (!dead) {
        setState({ url: null, pending: false });
      }
    })();
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj); };
  }, [animal.id, path, enabled, tick]);

  return state;
}
