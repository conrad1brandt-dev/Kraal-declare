// Clean photo background: cut the animal out and put it on a plain background.
// Runs on the phone with a small open-source model (U-2-Net "u2netp", ~4.5 MB, Apache-2.0).
// Needs signal the first time (model + runtime download), then the browser keeps them cached.

const ORT_VERSION = "1.20.1";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const MODEL_URL = "/models/u2netp.onnx";
const SIZE = 320;
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

  // 3. Mask as an image (slightly sharpened edges to avoid a halo)
  const maskC = document.createElement("canvas");
  maskC.width = SIZE; maskC.height = SIZE;
  const mctx = maskC.getContext("2d");
  const md = mctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < n; i++) {
    let v = (m[i] - lo) / range;
    v = Math.min(1, Math.max(0, (v - 0.15) / 0.7));
    md.data[i * 4 + 3] = Math.round(v * 255);
  }
  mctx.putImageData(md, 0, 0);

  // 4. Animal only, at full size
  const cut = document.createElement("canvas");
  cut.width = W; cut.height = H;
  const cctx = cut.getContext("2d");
  cctx.drawImage(bmp, 0, 0, W, H);
  cctx.globalCompositeOperation = "destination-in";
  cctx.imageSmoothingQuality = "high";
  cctx.drawImage(maskC, 0, 0, W, H);

  // 5. Put it on the plain background
  const outC = document.createElement("canvas");
  outC.width = W; outC.height = H;
  const octx = outC.getContext("2d");
  octx.fillStyle = bg;
  octx.fillRect(0, 0, W, H);
  octx.drawImage(cut, 0, 0);

  return new Promise((resolve, reject) =>
    outC.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save the cleaned photo"))), "image/jpeg", 0.8)
  );
}
