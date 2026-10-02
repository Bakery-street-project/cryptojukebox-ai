"use strict";

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");
let REDUCED_MOTION = reduceQuery.matches;
reduceQuery.addEventListener("change", (ev) => { REDUCED_MOTION = ev.matches; });

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
      // two tabs: ±1 mod 2 is the same move either way
      ev.preventDefault();
      selectTab(tabs[(i + 1) % 2]);
    } else if (ev.key === "Home" || ev.key === "End") {
      ev.preventDefault();
      selectTab(tabs[ev.key === "Home" ? 0 : tabs.length - 1]);
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
// A decode submit and a journal click both want to own the screen. Whoever
// took it last wins: every async completion checks its captured epoch and
// no-ops when a newer render has superseded it.
let renderEpoch = 0;
let stageTimer = null;
function startStages(epoch) {
  let i = 0;
  statusEl.textContent = STAGES[0];
  progressEl.hidden = false;
  consoleSection.setAttribute("aria-busy", "true");
  stageTimer = setInterval(() => {
    if (epoch !== renderEpoch) {
      clearInterval(stageTimer);
      stageTimer = null;
      return;
    }
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

  const epoch = ++renderEpoch;
  $("decode").disabled = true;
  results.hidden = true;
  player.hidden = true;
  $("player-wrap").hidden = true;
  $("gate").hidden = true;
  startStages(epoch);

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
    if (epoch !== renderEpoch) return;
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
    if (epoch !== renderEpoch) return;
    stopStages();
    // fetch rejects with a TypeError only when the request never completed.
    const msg = e instanceof TypeError
      ? "can't reach the jukebox — is the server running? Press Decode to retry."
      : e instanceof Error ? e.message : String(e);
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
let lastData = null;
const num = (v, decimals) =>
  typeof v === "number" && Number.isFinite(v) ? (decimals != null ? v.toFixed(decimals) : String(Math.round(v))) : "—";
const str = (v) => (typeof v === "string" && v ? v : "—");

function render(data) {
  try {
    if (!data || typeof data !== "object" || !data.profile || !data.spike || !data.artifacts) {
      throw new Error("incomplete decode payload");
    }
    lastData = data;
    doRender(data);
  } catch (e) {
    results.hidden = true;
    stopStages();
    toast(e instanceof Error ? `could not display the result — ${e.message}` : "could not display the result");
  }
}

function doRender(data) {
  const p = data.profile;
  const tonal = p.tonal;
  countUp($("m-bpm"), Number.isFinite(p.bpm) ? Math.round(p.bpm) : 0, "");
  $("m-key").textContent = tonal && Number.isFinite(tonal.key)
    ? `${NOTE_NAMES[tonal.key % 12]} ${str(tonal.mode)}`
    : "—";
  $("m-val").textContent = num(p.valence, 2);
  $("m-arou").textContent = num(p.arousal, 2);
  $("m-sync").textContent = num(data.spike.sync != null ? data.spike.sync * 100 : NaN, "%");

  const arts = data.artifacts;
  $("a-dream").textContent = str(arts.dream);
  $("a-idea").textContent = str(arts.idea);
  $("a-script").textContent = str(arts.script);
  $("a-prompt").textContent = str(arts.prompt);
  const meta = arts.dreamMeta;
  if (meta && meta.dreamSeed && SEED_RE.test(meta.dreamSeed)) {
    $("a-seed").textContent = meta.dreamSeed;
    $("seed-wrap").hidden = false;
    history.replaceState(null, "", `/?seed=${meta.dreamSeed}`);
  } else {
    $("seed-wrap").hidden = true;
  }
  $("engine").textContent = arts.engine === "llm"
    ? "Language-model re-telling of the scene the mechanism walked — the seed and the numbers stay the machine's own. Recall this dream by its seed."
    : "Mechanism-inspired dream engine — phasic bursts, affect-weighted replay and an associative walk under reduced executive function. One song, one dream per listen; paste the seed back to recall it exactly.";
  $("sigil-sub").textContent = `${data.spike.rates?.length ?? "—"} neurons · mean firing ${num(data.spike.meanRate != null ? data.spike.meanRate * 100 : NaN, 1)}%`;
  const phosphene = meta?.phosphene;
  $("a-phosphene").textContent = str(phosphene);
  $("phosphene-wrap").hidden = !phosphene;

  if (Array.isArray(p.frames) && p.frames.length) drawWave(p.frames);
  if (typeof arts.sigil === "string" && arts.sigil) drawSigil(arts.sigil);

  if (data.sourceKind === "upload" && data.id) {
    player.src = `/audio/${encodeURIComponent(data.id)}`;
    $("player-wrap").hidden = false;
    player.hidden = false;
  }

  const firstShow = results.hidden;
  results.hidden = false;
  if (firstShow) results.focus({ preventScroll: true });
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
  const canvas = $("sigil-canvas");
  // Cell from the measured scroll container; no height cap — a dense raster
  // may exceed the container and scrolls inside .sigil-scroll instead of
  // shrinking to illegibility.
  const avail = canvas.parentElement.clientWidth;
  const cell = Math.max(2, Math.min(14, Math.floor((avail - 8) / timeRows.length)));
  const cssWidth = Math.max(avail, timeRows.length * (cell + 2) + 8);
  const cssHeight = neurons * (cell + 2) + 8;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cssWidth, cssHeight);
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
const JOURNAL_PAGE = 12;
let journalOffset = 0;
let journalFailed = false;

function relTime(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}

async function fetchDreams(offset) {
  const res = await fetch(`/api/dreams?limit=${JOURNAL_PAGE}&offset=${offset}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const dreams = await res.json();
  if (!Array.isArray(dreams)) throw new Error("bad journal payload");
  return dreams;
}

function appendDreams(dreams) {
  const list = $("dream-list");
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
}

function setJournalState(dreams) {
  const empty = dreams.length === 0;
  $("journal-empty").hidden = !(empty && !journalFailed);
  $("journal-retry").hidden = !journalFailed;
  $("journal-more").hidden = empty || journalFailed || dreams.length < JOURNAL_PAGE;
  $("export-link").hidden = empty || journalFailed;
  $("journal-status").textContent = journalFailed
    ? "couldn't read the journal — the decoder still works."
    : "every dream this machine has had, kept by its seed";
}

async function loadJournal() {
  journalOffset = 0;
  journalFailed = false;
  $("dream-list").textContent = "";
  try {
    const dreams = await fetchDreams(0);
    journalOffset = dreams.length;
    appendDreams(dreams);
    setJournalState(dreams);
  } catch {
    journalFailed = true;
    setJournalState([]);
  }
}

$("journal-more").addEventListener("click", async () => {
  const btn = $("journal-more");
  btn.disabled = true;
  try {
    const more = await fetchDreams(journalOffset);
    journalOffset += more.length;
    appendDreams(more);
    btn.hidden = more.length < JOURNAL_PAGE;
  } catch {
    toast("couldn't load more dreams");
  } finally {
    btn.disabled = false;
  }
});
$("journal-retry").addEventListener("click", () => loadJournal());

async function openDream(seed) {
  const epoch = ++renderEpoch;
  stopStages();
  try {
    const res = await fetch(`/dream/${seed}`);
    const data = await res.json().catch(() => ({}));
    if (epoch !== renderEpoch) return;
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    history.replaceState(null, "", `/?seed=${seed}`);
    render(data);
    toast("recalled from the journal");
  } catch (e) {
    if (epoch !== renderEpoch) return;
    toast(e instanceof Error ? e.message : "could not open that dream");
  }
}

$("dream-list").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-seed]");
  if (btn) openDream(btn.dataset.seed);
});

/* ---------- redraw on resize ---------- */
let resizeTimer = null;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!lastData || results.hidden) return;
    if (Array.isArray(lastData.profile.frames) && lastData.profile.frames.length) drawWave(lastData.profile.frames);
    if (typeof lastData.artifacts.sigil === "string" && lastData.artifacts.sigil) drawSigil(lastData.artifacts.sigil);
  }, 150);
});

/* ---------- boot: journal + ?seed= deep link ---------- */
loadJournal();
const bootSeed = new URLSearchParams(location.search).get("seed");
if (bootSeed && SEED_RE.test(bootSeed)) openDream(bootSeed);
