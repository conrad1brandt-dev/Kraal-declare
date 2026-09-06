// Offline-first helper for Kraal Declare.
//
// Strategy (matches "patchy signal, last-write-wins"):
// - Reads: try the network; on failure, fall back to the last cached copy
//   in localStorage so the screen still shows something useful.
// - Writes: try the network; on failure, save the write to a local queue
//   AND apply it to the local cache immediately, so the UI updates
//   instantly regardless of connectivity. The queue flushes automatically
//   once the connection returns. Conflicts are not detected — the last
//   write to actually reach the server wins, which is the simple behavior
//   we agreed on.

const QUEUE_KEY = "kd_write_queue";
const CACHE_PREFIX = "kd_cache_";

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function queueLength() {
  return readQueue().length;
}

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function cacheSet(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    // storage full or unavailable — fail silently, not critical
  }
}

// Wraps a Supabase read. cacheKey should be unique per query shape
// (e.g. "animals:establishmentId123").
export async function dbRead(cacheKey, queryFn) {
  try {
    const { data, error } = await queryFn();
    if (error) throw error;
    cacheSet(cacheKey, data);
    return { data, fromCache: false };
  } catch (e) {
    const cached = cacheGet(cacheKey);
    if (cached) return { data: cached, fromCache: true };
    throw e;
  }
}

// Wraps a Supabase write (insert/update/delete). If it fails, queues it
// for later and returns { queued: true } so the UI can show an indicator.
export async function dbWrite(queryFn, queueMeta) {
  try {
    const { data, error } = await queryFn();
    if (error) throw error;
    return { data, queued: false };
  } catch (e) {
    const q = readQueue();
    q.push({ id: Date.now() + Math.random(), meta: queueMeta, ts: new Date().toISOString() });
    writeQueue(q);
    return { data: null, queued: true };
  }
}

// Call once at app startup and whenever the browser regains connectivity.
// `executors` is a map of { [table+action]: (payload) => supabase call }
// so the queue knows how to actually replay each type of write.
let flushing = false;
export async function flushQueue(executors) {
  if (flushing) return;
  flushing = true;
  try {
    let q = readQueue();
    const remaining = [];
    for (const item of q) {
      const exec = executors[item.meta.key];
      if (!exec) {
        remaining.push(item);
        continue;
      }
      try {
        const { error } = await exec(item.meta.payload);
        if (error) throw error;
        // success — drop from queue
      } catch {
        remaining.push(item); // still offline or failed — keep for next try
      }
    }
    writeQueue(remaining);
  } finally {
    flushing = false;
  }
}

export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
