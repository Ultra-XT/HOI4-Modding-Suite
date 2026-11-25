// Verifies the Event Maker's "Duplicate" button: with an event in the form, Duplicate makes an
// editable copy — a fresh NUMERIC id in the SAME namespace and a "(copy)" title — leaving the rest
// of the form intact, so Save creates a NEW event (original untouched). Run: node e2e-event-clone.js
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 3547;
const BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

(async () => {
  console.log("=== EVENT CLONE E2E ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  // A throwaway mod, SELECTED. Without activeModPath the maker falls back to the vanilla install, which is
  // read-only, and the write-lock disables Duplicate — a live button that silently swallows the click, so
  // every assertion below fails while "button is present" passes. #vanilla-ro
  const cloneModRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nova-clone-"));
  fs.writeFileSync(path.join(cloneModRoot, "descriptor.mod"), 'name="CloneFixture"\nsupported_version="1.18.*"\n', "utf8");
  await ctx.addInitScript((mp) => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); localStorage.setItem("activeModPath", mp); } catch (_) {} }, cloneModRoot);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    await page.goto(`${BASE}/events.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#duplicateEventBtn", { timeout: 10000 });
    ok(true, "Duplicate button is present");

    // Empty/new form: Duplicate warns instead of acting.
    const warned = await page.evaluate(() => {
      window.__msg = null; window.nbAlert = (m) => { window.__msg = m; };
      document.getElementById("eventId").value = "";
      document.getElementById("duplicateEventBtn").click();
      return /load or select an event first/i.test(window.__msg || "");
    });
    ok(warned, "Duplicate on an empty form warns instead of acting");

    // Populate as if an event were loaded, then Duplicate.
    const res = await page.evaluate(() => {
      window.__msg = null; window.nbAlert = (m) => { window.__msg = m; };
      document.getElementById("eventNamespace").value = "custom_events";
      // A real event id is numeric: HOI4 requires <namespace>.<integer>. #event-numeric-id
      document.getElementById("eventId").value = "7";
      const t = document.getElementById("eventTitle"); if (t) t.value = "My Event";
      const imm = document.getElementById("eventImmediate"); if (imm) imm.value = "add_political_power = 50";
      document.getElementById("duplicateEventBtn").click();
      return {
        ns: document.getElementById("eventNamespace").value,
        id: document.getElementById("eventId").value,
        title: document.getElementById("eventTitle") ? document.getElementById("eventTitle").value : "",
        imm: document.getElementById("eventImmediate") ? document.getElementById("eventImmediate").value : "",
        msg: window.__msg || "",
      };
    });
    // NOT "<id>_copy": everything after the last dot is converted to an integer, so a _copy suffix becomes 0
    // and every such event collapses into the same event. The maker mints the next free NUMBER instead, and
    // this test used to assert the old broken form. #event-numeric-id
    ok(/^[0-9]+$/.test(res.id) && res.id !== "7", "Duplicate assigns a fresh NUMERIC id", res.id);
    ok(res.ns === "custom_events", "Duplicate keeps the namespace", res.ns);
    ok(/\(copy\)/i.test(res.title), "Duplicate marks the title with (copy)", res.title);
    ok(res.imm === "add_political_power = 50", "Duplicate leaves the rest of the form intact (immediate kept)", res.imm);
    ok(/untouched/i.test(res.msg), "Duplicate confirms the original is untouched", res.msg);

    const res2 = await page.evaluate(() => { document.getElementById("duplicateEventBtn").click(); return document.getElementById("eventId").value; });
    ok(/^[0-9]+$/.test(res2) && res2 !== res.id, "re-duplicating mints another fresh number, never a _copy suffix", res2);

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e.message || e));
  } finally {
    await browser.close();

    try { fs.rmSync(cloneModRoot, { recursive: true, force: true }); } catch (_) {}
    server.close();
  }
  if (failed) { console.error(`\ne2e-event-clone: ${failed} FAILED`); process.exit(1); }
  console.log("\ne2e-event-clone: all checks passed");
})();
