// Clean photo background: cut the animal out and put it on a plain background.
// Runs on the phone with a small open-source model (U-2-Net "u2netp", ~4.5 MB, Apache-2.0).
// Needs signal the first time (model + runtime download), then the browser keeps them cached.

const ORT_VERSION = "1.20.1";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const MODEL_URL = "/models/u2netp.onnx";
const SIZE = 320;
const MAX_DIM = 1000;
export const CLEAN_BG = "#F4EFE3"; // same cream as the app background

let sessionPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.ort) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the photo tool. Check your signal and try again."));
    document.head.appendChild(s);
  });
}

function getSession() {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    await loadScript(ORT_BASE + "ort.min.js");
    const ort = window.ort;
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads = 1;
    return ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
  })();
  sessionPromise.catch(() => { sessionPromise = null; });
  return sessionPromise;
}

async function toBitmap(blob) {
  try { return await createImageBitmap(blob); } catch {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read the photo"));
      img.src = URL.createObjectURL(blob);
    });
  }
}

// Takes a photo blob, returns a new JPEG blob with a plain background.
export async function cleanBackground(blob, bg = CLEAN_BG) {
  const session = await getSession();
  const ort = window.ort;
  const bmp = await toBitmap(blob);
  const W = bmp.width || bmp.naturalWidth;
  const H = bmp.height || bmp.naturalHeight;

  // 1. Model input: 320x320, normalised like ImageNet
  const small = document.createElement("canvas");
  small.width = SIZE; small.height = SIZE;
  const sctx = small.getContext("2d");
  sctx.drawImage(bmp, 0, 0, SIZE, SIZE);
  const px = sctx.getImageData(0, 0, SIZE, SIZE).data;
  let maxv = 1;
  for (let i = 0; i < px.length; i += 4) maxv = Math.max(maxv, px[i], px[i + 1], px[i + 2]);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const n = SIZE * SIZE;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) input[c * n + i] = (px[i * 4 + c] / maxv - mean[c]) / std[c];
  }

  // 2. Run the model; first output is the cut-out mask
  const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) };
  const out = await session.run(feeds);
  const m = out[session.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (m[i] < lo) lo = m[i]; if (m[i] > hi) hi = m[i]; }
  const range = hi - lo || 1;

  // 3. Stretch the small mask to photo size
  const maskC = document.createElement("canvas");
  maskC.width = SIZE; maskC.height = SIZE;
  const mctx = maskC.getContext("2d");
  const md = mctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < n; i++) md.data[i * 4 + 3] = Math.round(((m[i] - lo) / range) * 255);
  mctx.putImageData(md, 0, 0);

  const scale = Math.min(1, MAX_DIM / Math.max(W, H));
  const w = Math.round(W * scale), h = Math.round(H * scale);
  const N = w * h;
  const big = document.createElement("canvas");
  big.width = w; big.height = h;
  const bctx = big.getContext("2d");
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(maskC, 0, 0, w, h);
  const bm = bctx.getImageData(0, 0, w, h).data;
  const prior = new Float32Array(N);
  for (let i = 0; i < N; i++) prior[i] = bm[i * 4 + 3] / 255;

  // 4. Photo pixels at the same size
  bctx.clearRect(0, 0, w, h);
  bctx.drawImage(bmp, 0, 0, w, h);
  const img = bctx.getImageData(0, 0, w, h);
  const P = img.data;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), grey = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    R[i] = P[i * 4] / 255; G[i] = P[i * 4 + 1] / 255; B[i] = P[i * 4 + 2] / 255;
    grey[i] = (R[i] + G[i] + B[i]) / 3;
  }

  // 5. Refine the outline so it follows the real edges of the animal
  let alpha = guidedFilter(grey, prior, w, h, 6, 1e-3);
  for (let i = 0; i < N; i++) alpha[i] = Math.min(1, Math.max(0, (alpha[i] - 0.25) / 0.5));
  alpha = boxFilter(erode(alpha, w, h, 3), w, h, 1); // pull the edge in ~3px, soft 1px feather

  // 6. Take edge colours from inside the animal, so no veld or shadow bleeds in
  const core = new Float32Array(N);
  for (let i = 0; i < N; i++) core[i] = alpha[i] > 0.95 ? 1 : 0;
  const coreE = erode(core, w, h, 3);
  const cw = boxFilter(coreE, w, h, 6);
  const mul = (ch) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = ch[i] * coreE[i]; return boxFilter(o, w, h, 6); };
  const Rf = mul(R), Gf = mul(G), Bf = mul(B);

  // 7. Put it on the plain background
  const bgc = hexToRgb(bg);
  for (let i = 0; i < N; i++) {
    const a = alpha[i];
    let r = R[i], g = G[i], b = B[i];
    if (coreE[i] === 0 && cw[i] > 1e-3) { r = Rf[i] / cw[i]; g = Gf[i] / cw[i]; b = Bf[i] / cw[i]; }
    P[i * 4] = Math.round((r * a + bgc[0] * (1 - a)) * 255);
    P[i * 4 + 1] = Math.round((g * a + bgc[1] * (1 - a)) * 255);
    P[i * 4 + 2] = Math.round((b * a + bgc[2] * (1 - a)) * 255);
    P[i * 4 + 3] = 255;
  }
  const outC = document.createElement("canvas");
  outC.width = w; outC.height = h;
  outC.getContext("2d").putImageData(img, 0, 0);

  return new Promise((resolve, reject) =>
    outC.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save the cleaned photo"))), "image/jpeg", 0.8)
  );
}

// ---- small image helpers (all work on Float32Array, one value per pixel) ----

function hexToRgb(hex) {
  const v = parseInt(hex.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

// Mean over a (2r+1)x(2r+1) square, edges repeat the border pixel.
function boxFilter(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / k;
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / k;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

// Minimum over a (2r+1)x(2r+1) square: shrinks the cut-out inward.
function erode(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 1;
      for (let d = -r; d <= r; d++) { const v = src[row + Math.min(w - 1, Math.max(0, x + d))]; if (v < m) m = v; }
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 1;
      for (let d = -r; d <= r; d++) { const v = tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x]; if (v < m) m = v; }
      out[y * w + x] = m;
    }
  }
  return out;
}

// Guided filter (He et al.): snaps the rough mask to edges in the photo.
function guidedFilter(guide, p, w, h, r, eps) {
  const N = w * h;
  const gp = new Float32Array(N), gg = new Float32Array(N);
  for (let i = 0; i < N; i++) { gp[i] = guide[i] * p[i]; gg[i] = guide[i] * guide[i]; }
  const mg = boxFilter(guide, w, h, r), mp = boxFilter(p, w, h, r);
  const mgp = boxFilter(gp, w, h, r), mgg = boxFilter(gg, w, h, r);
  const a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const cov = mgp[i] - mg[i] * mp[i];
    const v = mgg[i] - mg[i] * mg[i];
    a[i] = cov / (v + eps);
    b[i] = mp[i] - a[i] * mg[i];
  }
  const ma = boxFilter(a, w, h, r), mb = boxFilter(b, w, h, r);
  const q = new Float32Array(N);
  for (let i = 0; i < N; i++) q[i] = ma[i] * guide[i] + mb[i];
  return q;
}
