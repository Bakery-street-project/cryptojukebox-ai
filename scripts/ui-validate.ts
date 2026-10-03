/**
 * Runtime UI validation — release evidence for the webapp layer.
 * Drives the running app in headless Chromium and fails loudly on the two
 * historical blockers (cold-load hidden-panel leak, journal/decode render
 * race) plus journal paging, NDJSON export and tab keyboard semantics.
 *
 * Usage (three origin instances, URLs via env):
 *   BEFORE_URL=http://localhost:8790 UI_URL=http://localhost:8791 \
 *   EMPTY_URL=http://localhost:8792 TRACK=/tmp/testtrack.wav \
 *   bun scripts/ui-validate.ts
 * Before any browser check, each configured URL is probed via /api/dreams
 * to confirm it really is a jukebox origin (not a hijacked port).
 * Exits non-zero on any failed check; screenshots land in /tmp.
 */
import { chromium } from "playwright";

const UI = process.env.UI_URL ?? "http://localhost:8791";
const BEFORE = process.env.BEFORE_URL ?? "";
const EMPTY = process.env.EMPTY_URL ?? "";
const TRACK = process.env.TRACK ?? "/tmp/testtrack.wav";

const results: { name: string; ok: boolean; detail: string }[] = [];
const pageErrors: string[] = [];
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

/* ---- preflight: the target port must actually serve the jukebox ----
 * A real run once validated against an unrelated local app that had
 * silently taken over UI_URL's port between runs, producing confusing
 * locator failures instead of "wrong origin". /api/dreams?limit=1 must
 * answer 200 + JSON + array (an empty journal still answers []) —
 * anything else aborts before a browser is launched. */
async function probeJukeboxOrigin(base: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, "")}/api/dreams?limit=1`);
  } catch (e) {
    return `request failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (res.status !== 200) return `HTTP ${res.status}`;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("application/json")) return `content-type ${ctype || "(missing)"}`;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return "body is not valid JSON";
  }
  if (!Array.isArray(body)) return "body is not a JSON array";
  return null;
}
for (const base of [UI, BEFORE, EMPTY]) {
  if (!base) continue;
  const reason = await probeJukeboxOrigin(base);
  if (reason) {
    console.error(`FATAL: ${base} is not a cryptojukebox origin (/api/dreams probe failed: ${reason}) — wrong port or port hijacked by another app`);
    process.exit(1);
  }
}

const browser = await chromium.launch();
async function newPage(url: string, width = 1280, height = 1000) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => pageErrors.push(`${url}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) pageErrors.push(`${url} console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(300);
  return page;
}

/* ---- B1: cold load must not show the Upload panel or results ---- */
if (BEFORE) {
  const p = await newPage(`${BEFORE}/`, 360, 740);
  const panelVisible = await p.locator("#panel-file").isVisible();
  const resultsVisible = await p.locator("#results").isVisible();
  await p.screenshot({ path: "/tmp/b1-before-360.png", fullPage: true });
  check("B1-before: pre-fix cold load leaks panels (documents the bug)",
    panelVisible && resultsVisible, `panel-file:${panelVisible} results:${resultsVisible}`);
  await p.close();
}
for (const [w, h, tag] of [[1280, 1000, "desktop"], [360, 740, "mobile"]] as const) {
  const p = await newPage(`${UI}/`, w, h);
  await p.screenshot({ path: `/tmp/b1-after-${tag}.png`, fullPage: tag === "mobile" });
  check(`B1-after ${tag}: upload panel hidden on cold load`, !(await p.locator("#panel-file").isVisible()));
  check(`B1-after ${tag}: results placeholder hidden on cold load`, !(await p.locator("#results").isVisible()));
  check(`B1-after ${tag}: link panel visible`, await p.locator("#panel-link").isVisible());
  await p.close();
}

/* ---- decode through the real UI, then deep-link coherence ---- */
const main = await newPage(`${UI}/`);
await main.setInputFiles("#file", TRACK);
await main.click("#decode");
await main.waitForFunction(
  () => !document.getElementById("results")?.hidden && !document.getElementById("seed-wrap")?.hidden,
  null, { timeout: 120_000 },
);
const decodedSeed = await main.locator("#a-seed").textContent();
const decodedDream = await main.locator("#a-dream").textContent();
check("decode: results render with a seed chip", !!decodedSeed && /[0-9a-f]{8,32}/.test(decodedSeed ?? ""), `seed=${decodedSeed}`);
check("decode: dream text non-empty", !!decodedDream && decodedDream.length > 20);
await main.screenshot({ path: "/tmp/after-decode-desktop.png", fullPage: true });

/* ---- B2: click a journal entry mid-flight of a second decode ---- */
// entry 0 is the just-decoded dream (newest); pick a different one so the
// assertion proves which render actually won the screen.
const entrySeed = await main.locator(".dream-entry").nth(1).getAttribute("data-seed");
const expected = await (await fetch(`${UI}/dream/${entrySeed}`)).json();
await main.setInputFiles("#file", TRACK);
await main.click("#decode");
await main.waitForSelector("#progress:not([hidden])");
await main.locator(`.dream-entry[data-seed="${entrySeed}"]`).click();
// let the abandoned decode fully resolve — the old bug clobbered at that moment
await main.waitForFunction(
  () => document.getElementById("progress")?.hidden === true,
  null, { timeout: 120_000 },
);
await main.waitForTimeout(800);
const racedSeed = await main.locator("#a-seed").textContent();
const racedDream = await main.locator("#a-dream").textContent();
const racedUrl = main.url();
check("B2: journal click survives the in-flight decode",
  racedSeed === entrySeed && racedUrl.includes(entrySeed ?? ""),
  `expected seed=${entrySeed}, got=${racedSeed} url=${racedUrl}`);
check("B2: rendered dream belongs to the clicked journal entry",
  racedDream === expected.artifacts.dream, (racedDream ?? "").slice(0, 48));
await main.screenshot({ path: "/tmp/b2-after-race.png", fullPage: true });

/* ---- journal: paging + export ---- */
const initialCount = await main.locator(".dream-entry").count();
check("journal: first page capped at 12", initialCount === 12, `count=${initialCount}`);
await main.click("#journal-more");
await main.waitForFunction((n) => document.querySelectorAll(".dream-entry").length > n, initialCount);
const grownCount = await main.locator(".dream-entry").count();
check("journal: Load more grows the list", grownCount > initialCount, `${initialCount} -> ${grownCount}`);
check("journal: Load more hides after last page", await main.locator("#journal-more").isHidden());
const exportDl = main.waitForEvent("download");
await main.click("#export-link");
const dl = await exportDl;
const dlPath = await dl.path();
const dlText = (await Bun.file(dlPath ?? dl.suggestedFilename()).text()).split("\n").filter(Boolean);
const apiTotal = await (await fetch(`${UI}/api/dreams?limit=500`)).json();
check("export: downloads one NDJSON line per journal row",
  dlText.length === apiTotal.length && dl.suggestedFilename().startsWith("dreams-"),
  `${dlText.length} lines vs ${apiTotal.length} rows, file=${dl.suggestedFilename()}`);
check("export: every line parses as JSON", dlText.every((l) => { try { JSON.parse(l); return true; } catch { return false; } }));

/* ---- tab keyboard semantics ---- */
await main.locator("#tab-file").focus();
await main.keyboard.press("ArrowRight");
check("tabs: ArrowRight from Upload selects Link", await main.locator("#tab-link").getAttribute("aria-selected") === "true"
  && await main.locator("#panel-file").isHidden() && await main.locator("#panel-link").isVisible());
await main.keyboard.press("Home");
check("tabs: Home selects the first tab", await main.locator("#tab-link").getAttribute("aria-selected") === "true");
await main.keyboard.press("End");
check("tabs: End selects the last tab and hides its panel twin",
  await main.locator("#tab-file").getAttribute("aria-selected") === "true"
  && await main.locator("#panel-link").isHidden());
await main.locator("#tab-link").focus();
await main.keyboard.press("ArrowLeft");
check("tabs: ArrowLeft cycles (2-tab toggle)", await main.locator("#tab-file").getAttribute("aria-selected") === "true");

/* ---- deep link on a fresh page ---- */
const deep = await newPage(`${UI}/?seed=${decodedSeed}`);
check("deep link: /?seed= recalls the same dream text",
  (await deep.locator("#a-dream").textContent()) === decodedDream);
await deep.close();

/* ---- empty journal state ---- */
if (EMPTY) {
  const p = await newPage(`${EMPTY}/`);
  check("empty journal: shows empty-state copy, no actions",
    await p.locator("#journal-empty").isVisible()
    && await p.locator("#journal-more").isHidden()
    && await p.locator("#export-link").isHidden());
  await p.screenshot({ path: "/tmp/journal-empty.png", fullPage: true });
  await p.close();
}

check("no page errors during the run", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 300));

await browser.close();
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
