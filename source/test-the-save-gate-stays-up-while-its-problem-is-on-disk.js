// ⛔ #the-gate-has-one-owner — THE SAVE GATE STAYS UP WHILE THE PROBLEM IT IS UP FOR IS STILL ON DISK.
//
// B6-3 (tool campaign, CONFIRMED): after a Save that leaves a problem Save stops for, the Map Errors popup is a HARD GATE — × and the
// backdrop only flash its box, and it says "You can keep the map as it is only by typing save at the bottom." Its own buttons let the
// modder out without typing anything: 🔄 Re-check ran `close(); openMapErrorsModal(v)` with no context, so the popup came back UNGATED
// and × closed it, with the FATAL still in the mod. 🔧 Auto-fix that fixed nothing, and 🛟 Restore to a baseline that is itself broken,
// reopened it the same way, and 🔧 with edits still queued (a Save that stopped part-way) closed the gate outright.
//
// Runs the page's own openMapErrorsModal (lifted out of public/map.js by testlib-map-page) and clicks its buttons against stubbed
// answers. A popup is gated when it renders the "type save" box.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1200) : JSON.stringify(detail).slice(0, 1200)); }
}

const FATAL = { ok: true, errors: 1, warnings: 0, problems: [{ rule: "empty_state", severity: "error", message: "State 1082 has no provinces." }] };
const LOADS = { ok: true, errors: 1, warnings: 0, problems: [{ rule: "coastal_no_port", severity: "error", message: "A coastal state with no port." }] };
const CLEAN = { ok: true, errors: 0, warnings: 0, problems: [] };

/** A page with the popup on it. `disk` is what /api/map/validate answers next (a function may throw). */
function page({ disk, pending = false, queued = 0 }) {
  const st = { disk, posts: [], loads: [], confirmed: null };
  const { sb, statuses, overlays } = T.runPage(["function openMapErrorsModal(", "function baselineRestoreConfirmText(", "function baselineRestoreTitle("], {
    modPath: () => "C:/any",
    hasPendingMapEdits: () => pending,
    pendingWrites: Array.from({ length: queued }, () => ({ url: "/api/map/set-owner", body: {} })),
    load: async (line) => { st.loads.push(String(line)); },
    fetch: async (url, opts) => {
      const u = String(url).split("?")[0];
      if (opts && opts.method === "POST") st.posts.push(u);
      if (u === "/api/map/validate") { const d = typeof st.disk === "function" ? st.disk() : st.disk; return { json: async () => d }; }
      if (u === "/api/map/baseline-info") return { json: async () => ({ exists: true, savedAt: "2026-11-01T10:00:00.000Z", heldUnits: true, heldDescriptors: true }) };
      if (u === "/api/map/auto-fix") return { json: async () => ({ ok: true, fixes: {} }) };
      if (u === "/api/map/restore-baseline") return { json: async () => ({ ok: true, restored: ["map", "history/states"], movedAside: [] }) };
      return { json: async () => ({ ok: false, error: "not stubbed: " + u }) };
    },
    window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), novaConfirm: (msg, yes) => { st.confirmed = yes(); } },
  });
  const popups = () => overlays.filter((o) => /id="mapErrClose"/.test(o.innerHTML));
  const top = () => popups()[popups().length - 1];
  const isGated = (o) => !!o && /id="mapErrGateInput"/.test(o.innerHTML);
  const click = async (o, id) => { const b = o.querySelector("#" + id); if (!b || !b.listeners.click) throw new Error("the popup offers no #" + id); await b.listeners.click[0]({ target: b }); };
  return { st, sb, statuses, overlays, popups, top, isGated, click };
}

(async () => {
  try {
    // ── 1. 🔄 Re-check
    {
      const p = page({ disk: FATAL });
      p.sb.openMapErrorsModal(FATAL, "postsave");
      const gate = p.top();
      rec("CONTROL: a Save that leaves a problem Save stops for opens the gate, and says only typing save keeps the map",
        p.isGated(gate) && /only by typing <b>save<\/b>/.test(gate.innerHTML) && /Your edits were saved, but they leave 1 problem Save stops for/.test(gate.innerHTML), gate && gate.innerHTML.slice(0, 900));
      await p.click(gate, "mapErrRecheck");
      const again = p.top();
      rec("⭐⭐⭐ 🔄 Re-check with the problem still on disk reopens the popup GATED", again !== gate && gate.removed === true && p.isGated(again), again && again.innerHTML.slice(0, 600));
      rec("⭐⭐ …saying the map in the mod still has it, not that edits were just saved",
        /The map in your mod still has 1 problem Save stops for/.test(again.innerHTML) && !/Your edits were saved/.test(again.innerHTML), again.innerHTML.slice(0, 900));
      await p.click(again, "mapErrClose");
      rec("⭐⭐ …and its × does not close it", again.removed !== true, again.removed);
      await p.click(again, "mapErrRecheck");
      rec("⭐ …however many times it is re-checked", p.isGated(p.top()) && p.top() !== again, p.top().innerHTML.slice(0, 300));
      p.st.disk = LOADS;
      const last = p.top();
      await p.click(last, "mapErrRecheck");
      rec("⭐⭐ …and once the problem is gone the popup comes back ungated: the gate has done its job", !p.isGated(p.top()) && p.top() !== last, p.top().innerHTML.slice(0, 300));
      await p.click(p.top(), "mapErrClose");
      rec("…and that one closes with ×", p.top().removed === true, p.top().removed);
    }
    {
      const p = page({ disk: FATAL });
      p.sb.openMapErrorsModal(FATAL);
      await p.click(p.top(), "mapErrRecheck");
      rec("CONTROL: a popup that was never gated (opened from ⚠ Map Errors) is not gated by its Re-check", !p.isGated(p.top()) && p.popups().length === 2, p.popups().length);
    }
    {
      const p = page({ disk: { ok: false, error: "Cannot read properties of undefined (reading 'x')." } });
      p.sb.openMapErrorsModal(FATAL, "postsave");
      const gate = p.top();
      await p.click(gate, "mapErrRecheck");
      rec("⭐⭐ a Re-check that could not run leaves the gate where it is, and says so", gate.removed !== true && p.popups().length === 1 && /^Re-check failed: Cannot read properties/.test(p.statuses[p.statuses.length - 1] || ""), p.statuses.slice(-1));
    }
    // ── 2. 🔧 Auto-fix
    {
      const p = page({ disk: FATAL, pending: true, queued: 1 });
      p.sb.openMapErrorsModal(FATAL, "postsave");
      const gate = p.top();
      await p.click(gate, "mapErrFix");
      const note = gate.querySelector("#mapErrNote") || { style: { display: "none" }, textContent: "(the popup has no #mapErrNote)" };
      rec("⭐⭐⭐ 🔧 with an edit still queued (a Save that stopped part-way) no longer takes the gate down", gate.removed !== true && p.popups().length === 1 && !p.st.posts.includes("/api/map/auto-fix"), { removed: gate.removed, posts: p.st.posts });
      rec("⭐⭐ …it says why in the popup itself, and how to get back to the edit",
        note.style.display === "" && /Auto-fix waits until 1 queued edit is saved or undone/.test(note.textContent) && /type save below/.test(note.textContent) && note.textContent === p.statuses[p.statuses.length - 1], [note.style.display, note.textContent]);
    }
    {
      const p = page({ disk: FATAL, pending: true });
      p.sb.openMapErrorsModal(LOADS, "postsave");
      const popup = p.top();
      await p.click(popup, "mapErrFix");
      rec("CONTROL: an ungated popup still closes on that refusal, with its old line", popup.removed === true && /^Save or discard your pending edits first/.test(p.statuses[p.statuses.length - 1] || ""), p.statuses.slice(-1));
    }
    {
      const p = page({ disk: FATAL });
      p.sb.openMapErrorsModal(FATAL, "postsave");
      const gate = p.top();
      await p.click(gate, "mapErrFix");
      rec("⭐⭐⭐ 🔧 that leaves the problem on disk reopens the popup GATED", p.st.posts.includes("/api/map/auto-fix") && gate.removed === true && p.top() !== gate && p.isGated(p.top()), { posts: p.st.posts, gated: p.isGated(p.top()) });
    }
    {
      const p = page({ disk: CLEAN });
      p.sb.openMapErrorsModal(FATAL, "postsave");
      await p.click(p.top(), "mapErrFix");
      rec("CONTROL: 🔧 that clears it reopens an ungated popup", !p.isGated(p.top()) && p.popups().length === 2, p.top().innerHTML.slice(0, 300));
    }
    {
      const p = page({ disk: () => { throw new TypeError("Failed to fetch"); } });
      p.sb.openMapErrorsModal(FATAL, "postsave");
      await p.click(p.top(), "mapErrFix");
      const line = p.statuses[p.statuses.length - 1] || "";
      rec("⭐⭐ 🔧 whose check afterwards could not run says so, rather than leaving its line as if the map had been checked",
        p.popups().length === 1 && /\n⚠ Nova could not check the map afterwards \(Failed to fetch\)/.test(line) && /click ⚠ Map Errors to check it before you play/.test(line), line);
    }
    // ── 3. 🛟 Restore baseline
    {
      const p = page({ disk: FATAL });
      p.sb.openMapErrorsModal(FATAL, "postsave");
      const gate = p.top();
      await p.click(gate, "mapErrRestoreBaseline");
      await p.st.confirmed;
      rec("⭐⭐⭐ 🛟 Restore to a baseline that itself has the problem reopens the popup GATED",
        p.st.posts.includes("/api/map/restore-baseline") && gate.removed === true && p.top() !== gate && p.isGated(p.top()), { posts: p.st.posts, gated: p.isGated(p.top()) });
    }
    {
      const p = page({ disk: CLEAN });
      p.sb.openMapErrorsModal(FATAL, "postsave");
      await p.click(p.top(), "mapErrRestoreBaseline");
      await p.st.confirmed;
      rec("CONTROL: 🛟 Restore to a baseline that loads reopens an ungated popup", p.st.posts.includes("/api/map/restore-baseline") && !p.isGated(p.top()) && p.popups().length === 2, p.st.posts);
    }
  } catch (e) { rec("the popup runs", false, e && e.stack); }

  // ── 4. every reopen the popup makes of itself hands the gate on (read from the source, comments masked)
  const SRC = T.MASKED;
  const at = SRC.indexOf("function openMapErrorsModal(");
  const body = at < 0 ? "" : SRC.slice(at, SRC.indexOf("\n  }\n", at));
  const reopens = [...body.matchAll(/openMapErrorsModal\(([^)]*)\)/g)].slice(1).map((m) => m[1]);
  rec("⭐ every time the popup reopens itself it passes `regate`", reopens.length >= 1 && reopens.every((a) => /,\s*regate\s*$/.test(a)), reopens);
  rec("⭐ …and 🛟 Restore and 🔧 Auto-fix reopen it through the one helper that does", (body.match(/await reopenAfter\(/g) || []).length === 2, (body.match(/await reopenAfter\(/g) || []).length);
  console.log(`\n=== the save gate stays up while its problem is on disk: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
