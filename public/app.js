"use strict";

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
const form = $("decode-form");
const consoleSection = $("console");
const statusEl = $("status");
const progressEl = $("progress");
const results = $("results");
const player = $("player");

/* ---------- tabs ---------- */
const tabs = [$("tab-link"), $("tab-file")];
function selectTab(tab) {
  tabs.forEach((t) => {
    const active = t === tab;
    t.setAttribute("aria-selected", String(active));
    t.tabIndex = active ? 0 : -1;
    $(t.getAttribute("aria-controls")).hidden = !active;
  });
  tab.focus();
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
      ev.preventDefault();
      selectTab(tabs[(i + (ev.key === "ArrowRight" ? 1 : 1)) % 2]);
    }
  });
});

/* ---------- dropzone ---------- */
const dropzone = $("dropzone");
const fileInput = $("file");
const fileNameEl = $("file-name");
const showFileName = () => {
  const f = fileInput.files[0];
  fileNameEl.hidden = !f;
  fileNameEl.textContent = f ? `selected: ${f.name} (${(f.size / 1048576).toFixed(1)} MB)` : "";
};
fileInput.addEventListener("change", showFileName);
dropzone.addEventListener("click", (ev) => { if (ev.target !== fileInput) fileInput.click(); });
["dragover", "dragenter"].forEach((ev) => dropzone.addEventListener(ev, (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
}));
["dragleave", "drop"].forEach((ev) => dropzone.addEventListener(ev, (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (ev === "drop" && e.dataTransfer?.files?.length) {
    fileInput.files = e.dataTransfer.files;
    showFileName();
  }
}));

/* ---------- inline field errors ---------- */
function setFieldError(inputId, errorId, message) {
  const input = $(inputId);
  const err = $(errorId);
  if (message) {
    err.textContent = message;
    err.hidden = false;
    input.setAttribute("aria-invalid", "true");
  } else {
    err.hidden = true;
    input.removeAttribute("aria-invalid");
  }
}

/* ---------- staged loading feedback ---------- */
const STAGES = [
  "fetching the track…",
  "listening — decoding every frame at 22 kHz…",
  "spiking 24 neurons across the whole song…",
  "dreaming the artifacts…",
];
let stageTimer = null;
function startStages() {
  let i = 0;
  statusEl.textContent = STAGES[0];
  progressEl.hidden = false;
  consoleSection.setAttribute("aria-busy", "true");
  stageTimer = setInterval(() => {
    i = Math.min(i + 1, STAGES.length - 1);
    statusEl.textContent = STAGES[i];
  }, 4000);
}
function stopStages(message) {
  clearInterval(stageTimer);
  stageTimer = null;
  progressEl.hidden = true;
  consoleSection.setAttribute("aria-busy", "false");
  statusEl.textContent = message ?? "";
}

/* ---------- decode ---------- */
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  setFieldError("url", "url-error", "");
  setFieldError("file", "file-error", "");
  setFieldError("recall-seed", "recall-error", "");
  const seed = $("recall-seed").value.trim().toLowerCase();
  if (seed && !/^[0-9a-f]{8,32}$/.test(seed)) {
    setFieldError("recall-seed", "recall-error", "A dream seed is 8–32 hex characters — or leave it empty to dream something new.");
    return;
  }
  const file = fileInput.files[0];
  const url = $("url").value.trim();
  if (!file && !url) {
    const onLinkTab = $("tab-link").getAttribute("aria-selected") === "true";
    if (onLinkTab) setFieldError("url", "url-error", "Paste a YouTube or Spotify link, or switch to Upload.");
    else setFieldError("file", "file-error", "Choose an audio file to decode.");
    return;
  }

  $("decode").disabled = true;
  results.hidden = true;
  player.hidden = true;
  $("player-wrap").hidden = true;
  $("gate").hidden = true;
  startStages();

  try {
    let res;
    if (file) {
      const fd = new FormData();
      fd.append("file", file);
      if (seed) fd.append("dreamSeed", seed);
      res = await fetch("/api/decode", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/decode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(seed ? { url, dreamSeed: seed } : { url }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 402) {
      stopStages();
      showGate(res, data);
      return;
    }
    if (!res.ok) throw new Error(data.error ?? `decode failed (HTTP ${res.status})`);
    stopStages();
    render(data);
    loadJournal();
  } catch (e) {
    stopStages();
    const msg = e instanceof Error ? e.message : String(e);
    if (file) setFieldError("file", "file-error", msg);
    else setFieldError("url", "url-error", msg);
  } finally {
    $("decode").disabled = false;
  }
});

/* ---------- x402 payment gate ---------- */
const NET_NAMES = { "eip155:84532": "Base Sepolia (testnet)", "eip155:8453": "Base mainnet" };

function showGate(res, data) {
  let reqs = Array.isArray(data.paymentRequirements) ? data.paymentRequirements : null;
  if (!reqs) {
    const enc = res.headers.get("x-payment-required");
    if (enc) {
      try {
        const decoded = JSON.parse(atob(enc));
        reqs = Array.isArray(decoded.paymentRequirements)
          ? decoded.paymentRequirements
          : Array.isArray(decoded.paymentCapabilities) ? decoded.paymentCapabilities : null;
      } catch { /* malformed challenge — fall through */ }
    }
  }
  const req = reqs && reqs[0];
  const amount = req?.maxAmountRequired != null ? (Number(req.maxAmountRequired) / 1e6).toFixed(2) + " USDC" : "–";
  $("gate-error").textContent = data.error ?? "Payment required";
  $("gate-price").textContent = amount;
  $("gate-network").textContent = NET_NAMES[req?.network] ?? req?.network ?? "x402";
  $("gate-payto").textContent = req?.payTo ?? "–";
  $("gate").hidden = false;
  const msg = "This track needs an x402 payment first (" + amount + " on " + (NET_NAMES[req?.network] ?? req?.network ?? "x402") + ").";
  const onLinkTab = $("tab-link").getAttribute("aria-selected") === "true";
  if (onLinkTab) setFieldError("url", "url-error", msg); else setFieldError("file", "file-error", msg);
}

/* ---------- render ---------- */
function render(data) {
  const p = data.profile;
  countUp($("m-bpm"), Math.round(p.bpm) || 0, "");
  $("m-key").textContent = `${NOTE_NAMES[p.tonal.key % 12]} ${p.tonal.mode}`;
  countUp($("m-val"), p.valence, "decimal");
  countUp($("m-arou"), p.arousal, "decimal");
  countUp($("m-sync"), Math.round(data.spike.sync * 100), "%");
  $("ms-bpm").hidden = !p.bpm;

  $("a-dream").textContent = data.artifacts.dream;
  $("a-idea").textContent = data.artifacts.idea;
  $("a-script").textContent = data.artifacts.script;
  $("a-prompt").textContent = data.artifacts.prompt;
  const meta = data.artifacts.dreamMeta;
  if (meta && meta.dreamSeed && SEED_RE.test(meta.dreamSeed)) {
    $("a-seed").textContent = meta.dreamSeed;
    $("seed-wrap").hidden = false;
    history.replaceState(null, "", `/?seed=${meta.dreamSeed}`);
  } else {
    $("seed-wrap").hidden = true;
  }
  $("engine").textContent = data.artifacts.engine === "llm"
    ? "Language-model re-telling of the scene the mechanism walked — the seed and the numbers stay the machine's own. Recall this dream by its seed."
    : "Mechanism-inspired dream engine — phasic bursts, affect-weighted replay and an associative walk under reduced executive function. One song, one dream per listen; paste the seed back to recall it exactly.";
  $("sigil-sub").textContent = `${data.spike.rates.length} neurons · mean firing ${(data.spike.meanRate * 100).toFixed(1)}%`;
  const phosphene = data.artifacts.dreamMeta.phosphene;
  $("a-phosphene").textContent = phosphene;
  $("phosphene-wrap").hidden = !phosphene;

  drawWave(p.frames);
  drawSigil(data.artifacts.sigil);

  if (data.sourceKind === "upload") {
    player.src = `/audio/${data.id}`;
    $("player-wrap").hidden = false;
    player.hidden = false;
  }

  results.hidden = false;
  if (!REDUCED_MOTION) {
    [...document.querySelectorAll("#results .metric, #results .card, .wave-wrap")].forEach((el, i) => {
      el.classList.remove("reveal");
      void el.offsetWidth;
      el.style.animationDelay = `${i * 55}ms`;
      el.classList.add("reveal");
    });
  }
  results.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
}

function countUp(el, target, mode) {
  if (REDUCED_MOTION || mode === "decimal") {
    el.textContent = mode === "decimal" ? target.toFixed(2) : `${target}${mode}`;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 650);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = `${Math.round(target * eased)}${mode}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function sizeCanvas(canvas, cssHeight) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const parent = canvas.parentElement;
  const cs = getComputedStyle(parent);
  const w = Math.max(1, parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, w, h: cssHeight };
}

function drawWave(frames) {
  const { ctx, w, h } = sizeCanvas($("wave"), 150);
  ctx.clearRect(0, 0, w, h);
  const maxRms = Math.max(...frames.map((f) => f.rms), 1e-9);
  const bar = Math.max(1, Math.floor(w / frames.length));
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const x = Math.floor((i / frames.length) * w);
    const amp = Math.max(1.5, (f.rms / maxRms) * (h / 2 - 8));
    const hue = 265 - Math.min(1, f.centroid / 6000) * 190;
    const light = 55 + Math.min(1, f.flux / (maxRms * 0.6)) * 20;
    ctx.fillStyle = `hsl(${hue}, 88%, ${light}%)`;
    ctx.fillRect(x, h / 2 - amp, bar, amp * 2);
  }
  $("wave").setAttribute("aria-label", `Waveform of the decoded track, ${frames.length} analysed frames`);
}

function drawSigil(raster) {
  const timeRows = raster.split("\n").filter(Boolean);
  const neurons = timeRows.reduce((m, r) => Math.max(m, r.length), 1);
  const { ctx, w } = sizeCanvas($("sigil-canvas"), 1);
  const cell = Math.max(2, Math.min(14, Math.floor((w - 8) / timeRows.length), Math.floor(360 / neurons) - 2));
  const cssHeight = neurons * (cell + 2) + 8;
  sizeCanvas($("sigil-canvas"), cssHeight);
  const g = $("sigil-canvas").getContext("2d");
  g.clearRect(0, 0, w, cssHeight);
  for (let t = 0; t < timeRows.length; t++) {
    for (let n = 0; n < neurons; n++) {
      const x = t * (cell + 2) + 4;
      const y = n * (cell + 2) + 4;
      if (timeRows[t][n] === "▓") {
        const hue = 265 - (n / neurons) * 130;
        g.fillStyle = `hsl(${hue}, 90%, 62%)`;
        g.shadowColor = `hsl(${hue}, 90%, 62%)`;
        g.shadowBlur = 6;
        g.fillRect(x, y, cell, cell);
        g.shadowBlur = 0;
      } else {
        g.fillStyle = "rgba(255,255,255,0.09)";
        g.fillRect(x + cell * 0.35, y + cell * 0.35, Math.max(1, cell * 0.3), Math.max(1, cell * 0.3));
      }
    }
  }
}

/* ---------- copy buttons ---------- */
document.querySelectorAll(".copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = btn.id === "copy-link"
      ? `${location.origin}/?seed=${encodeURIComponent($("a-seed").textContent)}`
      : $(btn.dataset.target).textContent;
    try {
      await navigator.clipboard.writeText(text);
      toast("copied to clipboard");
    } catch {
      toast("clipboard blocked — select the text instead");
    }
  });
});

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1900);
}

/* ---------- dream journal ---------- */
const SEED_RE = /^[0-9a-f]{8,32}$/;
const journalSection = $("journal");

function relTime(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}

async function loadJournal() {
  try {
    const res = await fetch("/api/dreams?limit=12");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const dreams = await res.json();
    if (!dreams.length) {
      journalSection.hidden = true;
      return;
    }
    journalSection.hidden = false;
    const list = $("dream-list");
    list.textContent = "";
    for (const d of dreams) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dream-entry";
      btn.dataset.seed = d.seed;
      btn.innerHTML =
        `<code class="dream-seed"></code><span class="dream-title"></span><time class="dream-time"></time>`;
      btn.querySelector(".dream-seed").textContent = d.seed;
      btn.querySelector(".dream-title").textContent = d.title || "untitled";
      btn.querySelector(".dream-time").textContent = relTime(d.created_at);
      li.appendChild(btn);
      list.appendChild(li);
    }
  } catch {
    journalSection.hidden = true;
  }
}

async function openDream(seed) {
  try {
    const res = await fetch(`/dream/${seed}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    history.replaceState(null, "", `/?seed=${seed}`);
    render(data);
    toast("recalled from the journal");
  } catch (e) {
    toast(e instanceof Error ? e.message : "could not open that dream");
  }
}

$("dream-list").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-seed]");
  if (btn) openDream(btn.dataset.seed);
});

/* ---------- redraw on resize ---------- */
let lastData = null;
const origRender = render;
render = (data) => { lastData = data; origRender(data); };
addEventListener("resize", () => {
  if (!lastData || results.hidden) return;
  drawWave(lastData.profile.frames);
  drawSigil(lastData.artifacts.sigil);
});

/* ---------- boot: journal + ?seed= deep link ---------- */
loadJournal();
const bootSeed = new URLSearchParams(location.search).get("seed");
if (bootSeed && SEED_RE.test(bootSeed)) openDream(bootSeed);
