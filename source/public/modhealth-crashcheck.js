"use strict";
// Mod Health → "Will it crash?" panel. Self-contained (own DOM, own fetches) so it doesn't touch the
// existing /api/mod/index render flow. Surfaces the map-definition problems that stop HOI4 loading the map
// or break it in-game, plus a game-version heads-up — the failures that are painful to diagnose from logs:
//   • duplicate state id, province in two states, VP not in its state (map won't load)
//   • empty/missing capital, empty state with buildings (HOI4 refuses to load the map when a game starts, or it is untested)
//   • mod targets a different HOI4 branch than the installed game: a WARNING in mod-version.js's own words (many mods
//     run fine across a branch), never counted as a crash (#a-game-version-mismatch-is-a-warning-not-a-crash)
// When duplicate state ids are present it offers a one-click conservative repair.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /**
   * ⛔ #a-refused-duplicate-is-described-by-what-it-is — WHAT "🔧 Fix duplicate states" SAYS ABOUT THE ONES IT LEFT.
   *
   * This was one inline clause: "; N ambiguous duplicate(s) left for you to resolve by hand (both files own unique
   * land)". Three things were wrong with it, and the response had the answer to all three.
   *
   * 1. THE REASON WAS OFTEN FALSE. fixDuplicateStateFiles refuses an id when no dup file's land is held by a file
   *    OUTSIDE the duplicate set — which is exactly what two copies of the same state look like. Novum Vexillum,
   *    which launches, ships the only duplicate state id in the whole installed corpus (vanilla 0 of 1,081, MD 0 of
   *    1,250, R56 0 of 1,143, OWB 0 of 1,524, RoN 0 of 1,154, NV 1 of 1,371): state 1325 in 1325-Balti.txt and
   *    1325-Northern Moldova.txt, the SAME four provinces in both, manpower 140,000 against 900,216. Neither file
   *    owns unique land. Told the land differs, a modder goes looking for geography to merge; told it is identical,
   *    the only question left is which block they meant — a much smaller job.
   * 2. IT NAMED NOTHING. The response carries { id, files } per row and this printed only a count, so "resolve by
   *    hand" came with no way to know what to open.
   * 3. "both files" assumed two. An id can be in three.
   *
   * Pure, and exposed below, so a test can RUN it on the server's real answer rather than read this file.
   */
  function duplicateFixNote(res) {
    const removed = (res && res.removed || []).length;
    const left = (res && res.unresolved || []);
    // ⛔ #a-duplicate-state-file-that-cannot-be-removed-is-said — a file the fixer could not delete is said, not counted as removed (tool campaign B3-12)
    const failed = (res && Array.isArray(res.errors) ? res.errors : []).filter((f) => f && f.file);
    const failedNote = failed.length ? ` ⛔ ${failed.length} duplicate state file(s) could not be removed (${failed.slice(0, 3).map((f) => `“${esc(f.file)}”: ${esc(f.error || "unknown")}`).join("; ")}${failed.length > 3 ? "; …" : ""}), so the duplicate is still there: close whatever holds the file open (an editor, a sync or antivirus program) and click again.` : "";
    let s = `Removed ${removed} stray duplicate block(s)`;
    if (!left.length) return s + "." + failedNote;
    s += `; ${left.length} left for you to resolve by hand.`;
    for (const u of left.slice(0, 3)) {
      const files = (u.files || []).map((f) => `“${esc(f)}”`).join(", ");
      const loads = u.loads ? `“${esc(u.loads)}”` : "the first of them in load order";
      s += ` State ${esc(u.id)} is defined in ${(u.files || []).length} files (${files}) — HOI4 loads ${loads} and ignores the rest.`;
      // `sameLand` is the server's answer, not a guess from the file names. Absent (an older answer) → say neither.
      if (u.sameLand === true) {
        s += ` They list the SAME ${u.provinces != null ? u.provinces + " " : ""}province(s), so nothing is stranded either way:`
          + ` delete the block you did not mean to keep. Nova will not choose, because the rest of the two blocks differ.`;
      } else if (u.sameLand === false) {
        s += ` They list DIFFERENT provinces, so removing either would leave land in no state — merge them into one block by hand.`;
      }
    }
    if (left.length > 3) s += ` …and ${left.length - 3} more.`;
    return s + failedNote;
  }
  try { window.__novaDuplicateFixNote = duplicateFixNote; } catch (_) {}

  function modPath() {
    const sel = $("modSelector");
    if (sel && sel.value) return sel.value;
    try { return localStorage.getItem("activeModPath") || ""; } catch (_) { return ""; }
  }
  // #modhealth-vanilla-substring — ASK WHICH ROOT IS THE GAME; DO NOT PATTERN-MATCH THE WORD.
  //
  // This was `/vanilla/i.test(mp)` — a substring test against the whole mod PATH. Nova builds a mod's
  // folder from its name (slugifyModName: "Vanilla Plus" -> vanilla_plus), and "…Vanilla" is one of the
  // commonest things a HOI4 mod is called. So creating one turned these checks OFF and told the author
  // they were "viewing the vanilla game files (read-only)": the one panel whose job is to catch a crash
  // before it ships was the thing that stopped running, and it explained itself in a way that sounded
  // deliberate. A parent folder containing the word was enough to do it too.
  //
  // The server knows which root is the game — /api/root reports it, and the scan response modhealth.js
  // reads carries the same answer as `data.isVanilla`. Ask, and compare paths. The old install-path shape
  // stays only as a fallback for when that call fails, which is the case it was really written for.
  let _gameRootCache = null;
  async function gameRoot() {
    if (_gameRootCache !== null) return _gameRootCache;
    try {
      const r = await fetch("/api/root").then((x) => x.json());
      _gameRootCache = String((r && r.hoi4GameRoot) || "");
    } catch (_) { _gameRootCache = ""; }
    return _gameRootCache;
  }
  const samePath = (a, b) => {
    const norm = (s) => String(s || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    return !!norm(a) && norm(a) === norm(b);
  };
  async function isVanilla(mp) {
    const gr = await gameRoot();
    if (gr) return samePath(mp, gr);
    return /steamapps[\\/](?:common)[\\/]Hearts of Iron IV/i.test(mp);
  }

  async function run() {
    const panel = $("mhCrashCheck");
    if (!panel) return;
    const mp = modPath();
    // Don't run the alarming "will crash" check on the vanilla game files — they're read-only and
    // obviously load fine, so reporting their inherent quirks as crashes just cries wolf.
    if (await isVanilla(mp)) {
      panel.innerHTML = card("#1f6feb", "🛫 Will it crash? — crash checks run on your mod",
        "<div style='margin-top:6px; font-size:12.5px; color:#8b949e;'>You're viewing the <b>vanilla game files</b> (read-only), which already load fine. " +
        "Pick your mod in the “Active Mod” dropdown above to run the map crash checks and the game-version check on it.</div>");
      return;
    }
    panel.innerHTML = card("#8b949e", "🛫 Will it crash? — checking…", "");
    let validate = null, version = null, loc = null;
    try { validate = await fetch("/api/map/validate?modPath=" + encodeURIComponent(mp)).then((r) => r.json()); } catch (_) {}
    try { version = await fetch("/api/modversion?modPath=" + encodeURIComponent(mp)).then((r) => r.json()); } catch (_) {}
    try { loc = await fetch("/api/modhealth/loc-check?modPath=" + encodeURIComponent(mp)).then((r) => r.json()); } catch (_) {}

    const problems = (validate && validate.ok && Array.isArray(validate.problems)) ? validate.problems : [];
    // #a-map-summary-counts-rules-not-what-they-found — this panel's verdict counts RULES, like the map editor's Save
    // gate did. On the world the owner built through Delete map → Generate land → Auto-fix it reads "1 serious
    // problem(s)" for a map whose problems name 5,049 sea provinces inside states and 2,967 drowned divisions. The
    // same clause map-rule-labels.js gives the Save gate goes into the verdict, and the rows are ordered biggest-first.
    const MLs = (typeof window !== "undefined" && window.NovaMapRuleLabels) || {};
    const bySize = typeof MLs.bySizeDescending === "function" ? MLs.bySizeDescending : ((a) => a);
    const scaleClause = typeof MLs.scaleClause === "function" ? MLs.scaleClause : (() => "");
    const mapScale = scaleClause(problems);
    const errors = bySize(problems.filter((p) => p.severity === "error"));
    const warnings = bySize(problems.filter((p) => p.severity === "warning"));
    // Localisation integrity (files HOI4 would ignore for a missing header → broken strings in-game).
    const locProblems = (loc && loc.ok && Array.isArray(loc.problems)) ? loc.problems : [];
    const locErrors = locProblems.filter((p) => p.severity === "error");
    const locWarnings = locProblems.filter((p) => p.severity === "warning");
    const versionWarn = version && version.ok && version.severity === "warning" && version.message ? version.message : "";
    const hasDup = errors.some((p) => p.rule === "duplicate_state_id");
    const hasSplit = errors.some((p) => p.rule === "state_split_strategic_regions");

    // ⛔ #a-game-version-mismatch-is-a-warning-not-a-crash — THE MISMATCH IS FILED WITH THE WARNINGS, AND THE CARD SAYS WHY IN ITS OWN WORDS.
    //
    // This row was an ERROR, first in the list, and counted as a crash: a mod made for 1.19 (supported_version="1.19.*") on a 1.20
    // install, with nothing else wrong, read "⛔ Will it crash? — fix this before launch: a game version this mod was not made for",
    // red, while the row under it said "Many mods still run fine across a branch, so this isn't necessarily a problem" — the message
    // mod-version.js writes and every banner shows. Nothing Nova has measured records a crash for a branch mismatch. Owner,
    // 2026-11-20: amber, not red. So it is one more WARNING (it counts toward the "N warning(s), but nothing that crashes the game"
    // line and never toward the crash count or the red headline), its row and its 📋 Copy report line say [WARNING], and its text is
    // the server's message as written, which carries the one thing to do about it (roll back through Steam's Betas tab if the game
    // misbehaves). A real fatal map rule still turns the card red on its own.
    // Publish for the "Copy report" button (modhealth.js) so the report also covers the map and version problems.
    try {
      window.__mhCrashReport = {
        items: [].concat(
          errors.map((p) => ({ sev: "error", label: ruleLabel(p.rule), msg: p.message })),
          locErrors.map((p) => ({ sev: "error", label: "Localisation file ignored", msg: p.message })),
          versionWarn ? [{ sev: "warning", label: "Game version", msg: versionWarn }] : [],
          warnings.map((p) => ({ sev: "warning", label: ruleLabel(p.rule), msg: p.message })),
          locWarnings.map((p) => ({ sev: "warning", label: "Localisation missing BOM", msg: p.message }))
        ),
      };
    } catch (_) { /* non-fatal */ }

    const lines = [];
    for (const p of errors) lines.push(row("error", ruleLabel(p.rule), p.message));
    for (const p of locErrors) lines.push(row("error", "Localisation file ignored (no header)", p.message));
    if (versionWarn) lines.push(row("warning", "Game version", versionWarn));
    for (const p of warnings) lines.push(row("warning", ruleLabel(p.rule), p.message));
    for (const p of locWarnings) lines.push(row("warning", "Localisation missing BOM", p.message));

    const totalBad = errors.length + locErrors.length;
    const totalWarn = warnings.length + locWarnings.length + (versionWarn ? 1 : 0);
    // Split the map "errors" into GUARANTEED-crash (the curated FATAL set — the same authority the Map
    // Save gate uses) vs serious-but-loads-past. HOI4 loads past duplicate/overlapping states (first-wins),
    // ignored-header loc files, etc. — they break the map/text in-game but don't stop loading. Telling the
    // user a mod that actually launches (e.g. Millennium Dawn) "will fail to load" is crying wolf.
    const isFatal = (rule) => !!(window.NovaMapRuleLabels && window.NovaMapRuleLabels.isFatalRule && window.NovaMapRuleLabels.isFatalRule(rule));
    const crashCount = errors.filter((p) => isFatal(p.rule)).length;
    const breakCount = errors.filter((p) => !isFatal(p.rule)).length + locErrors.length;
    // #a-map-message-claims-only-what-the-engine-shows — the "yes" line said every one of these "stop HOI4 loading or crash on Play".
    // What HOI4 does with each fatal rule is recorded beside the FATAL set (FATAL_OUTCOME); fatalVerdict words them by what one present
    // problem proves, as the Map editor's Save gate does. A game-version mismatch is not one of them (a warning, see above).
    const MLh = window.NovaMapRuleLabels || {};
    const fatalRules = errors.filter((p) => isFatal(p.rule)).map((p) => p.rule);
    const verdict = fatalRules.length && typeof MLh.fatalVerdict === "function" ? MLh.fatalVerdict(fatalRules) : null;
    let head, color;
    if (!validate || !validate.ok) { head = "🛫 Will it crash? — couldn't read the map (no mod selected, or no map files)"; color = "#8b949e"; }
    else if (totalBad === 0 && totalWarn === 0) { head = "✅ Will it crash? — no map, version or localisation problems found. Good to launch."; color = "#2ea043"; }
    else if (totalBad === 0) { head = `⚠ Will it crash? — ${totalWarn} warning(s), but nothing that crashes the game.${mapScale ? ` The map problems name ${mapScale}.` : ""}`; color = "#9e6a00"; }
    else if (crashCount > 0) {
      const clauses = [];
      if (fatalRules.length) clauses.push(`${fatalRules.length} problem${fatalRules.length === 1 ? "" : "s"} Save stops for` + (verdict && verdict.parts.length ? ` (${verdict.parts.join(", ")})` : ""));
      head = `⛔ Will it crash? — ${verdict ? verdict.headline : "fix this before launch"}: ${clauses.join(", and ")}` + (breakCount ? `, plus ${breakCount} more that load but break the map or text` : "") + `. Fix before launch.` + (mapScale ? ` The map problems name ${mapScale}.` : "");
      color = "#f85149";
    }
    else {
      // ⛔ #a-crash-card-example-from-another-map — THE ONE LINE THAT NAMES A PROBLEM NAMED ONE THAT WAS NOT THERE.
      //
      // This read "(e.g. a duplicate state id hides the real state → grey provinces)", fixed, whatever the map had.
      // It is the only concrete thing in the verdict, so it reads as the example FROM this map — and the card is
      // holding the problems, sorted biggest-first, the whole time.
      //
      // 📊 MEASURED 2026-09-17 on the world the owner built through Nova's own sequence (new mod → Delete map →
      // Generate land at 35% → Auto-fix ×2) and has installed: its two errors are state_owns_no_land (589 states) and
      // non_land_province_in_state (6,537 provinces), it carries no duplicate state id at all, and the card told him
      // "2 serious problem(s) break the map or text in-game (e.g. a duplicate state id hides the real state → grey
      // provinces)". #a-validator-must-not-cry-wolf is about the rules; this is the same rule applied to the wording.
      //
      // `errors` is already bySizeDescending, so [0] is the biggest thing this map actually has.
      const worst = errors[0] || locErrors[0] || null;
      const worstName = !worst ? "" : (errors.length ? ruleLabel(worst.rule) : "Localisation file ignored (no header)");
      head = `⚠ Will it crash? — no, it loads, but ${breakCount} serious problem(s) break the map or text in-game`
        + (worstName ? ` (the biggest is “${worstName}”)` : "")
        + `. Fix before launch.${mapScale ? ` The map problems name ${mapScale}.` : ""}`;
      color = "#d29922";
    }

    // The problem list can be enormous (Millennium Dawn has hundreds of non-fatal warnings), so it's
    // COLLAPSED to a preview by default with a Show more / Show less toggle. The action buttons sit AFTER
    // it in normal flow, so they move up/down with the list instead of being pushed off-screen.
    const ROWS_COLLAPSED_PX = 150;
    const MAX_ROWS = 300; // cap the DOM — MD can produce thousands of non-fatal warnings, and rendering
                          // every one is what made the page sluggish. The full list is always in 📋 Copy report.
    let body = "";
    if (lines.length) {
      const shown = lines.slice(0, MAX_ROWS);
      const hidden = lines.length - shown.length;
      const moreNote = hidden > 0
        // #copy-report-is-too-big-to-paste — this used to promise "the complete list" is in Copy report.
        // That stopped being true when the report was capped: it listed every problem and reached 3.05 MB
        // on Rise of Nations, well past what a GitHub issue or a Discord message accepts.
        //
        // ⚠️ And "use Show more" would be just as wrong: MAX_ROWS slices the list before it reaches the DOM,
        // so the toggle only un-collapses the 300 that ARE rendered. The rows beyond that are not anywhere
        // in this panel. Say the true thing and nothing more — the counts in the heading above are complete,
        // and the "Open Map Editor" button below leads to the tool that repairs them.
        ? `<div style="font-size:12px; color:#8b949e; padding-top:6px; border-top:1px solid #21262d; margin-top:4px;">…and <b style="color:#c9d1d9;">${hidden.toLocaleString()}</b> more, not listed here. The counts above cover all of them.</div>`
        : "";
      body += `<div id="mhCrashRows" style="margin-top:8px; position:relative; max-height:${ROWS_COLLAPSED_PX}px; overflow:hidden;">` +
        `<div style="display:flex; flex-direction:column; gap:6px;">${shown.join("")}${moreNote}</div>` +
        `<div id="mhCrashFade" style="position:absolute; left:0; right:0; bottom:0; height:36px; background:linear-gradient(transparent, #161b22); pointer-events:none;"></div>` +
        `</div>` +
        `<button id="mhCrashToggle" style="display:none; margin-top:6px; background:#21262d; border:1px solid #30363d; color:#c9d1d9; border-radius:6px; padding:4px 12px; font-size:12px; cursor:pointer;">Show more ▾</button>`;
    }
    const buttons = [];
    buttons.push(`<button id="mhCrashRecheck" class="mh-btn" style="margin-top:10px;">Re-check</button>`);
    if (hasDup) buttons.push(`<button id="mhFixDup" class="mh-btn" style="margin-top:10px; background:#9e6a00; border-color:#9e6a00; color:#fff;">🔧 Fix duplicate states</button>`);
    if (hasSplit) buttons.push(`<button id="mhFixRegions" class="mh-btn" style="margin-top:10px; background:#9e6a00; border-color:#9e6a00; color:#fff;">🔧 Fix region overlaps</button>`);
    // Most map crash classes (stranded buildings, missing states, orphaned land, broken capitals, …) are
    // repaired by the Map Editor's one-click "Auto-fix all" — send the user straight there instead of only
    // labelling the problem. (The two buttons above are the in-panel shortcuts for the commonest fixes.)
    if (errors.length || warnings.length) buttons.push(`<a class="mh-btn" href="map.html" style="margin-top:10px; text-decoration:none; display:inline-block;" title="Open the Map Editor — its “Auto-fix all” repairs the map problems that have one correct answer, and names the ones it had to leave">🗺 Open Map Editor to auto-fix</a>`);
    body += `<div style="display:flex; gap:8px; flex-wrap:wrap;">${buttons.join("")}</div>`;

    panel.innerHTML = card(color, head, body);
    // Collapse toggle: only show it when the list actually overflows the preview height. The action
    // buttons (Re-check, the auto-fix shortcuts) live AFTER the list, so collapsing/expanding moves them
    // up/down with it — they're never hidden or resized themselves.
    (function wireCrashCollapse() {
      const rows = $("mhCrashRows"), toggle = $("mhCrashToggle"), fade = $("mhCrashFade");
      if (!rows || !toggle) return;
      if (rows.scrollHeight > ROWS_COLLAPSED_PX + 8) {
        toggle.style.display = "inline-block";
        let expanded = false;
        toggle.addEventListener("click", () => {
          expanded = !expanded;
          rows.style.maxHeight = expanded ? "none" : ROWS_COLLAPSED_PX + "px";
          toggle.textContent = expanded ? "Show less ▴" : "Show more ▾";
          if (fade) fade.style.display = expanded ? "none" : "block";
        });
      } else {
        rows.style.maxHeight = "none"; // it all fits — no toggle, no fade
        if (fade) fade.style.display = "none";
      }
    })();
    const rc = $("mhCrashRecheck"); if (rc) rc.addEventListener("click", run);
    const fd = $("mhFixDup");
    if (fd) fd.addEventListener("click", async () => {
      fd.disabled = true; fd.textContent = "Fixing…";
      try {
        const res = await fetch("/api/map/fix-duplicate-states", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: mp }) }).then((r) => r.json());
        if (!res || !res.ok) { fd.textContent = "Fix failed: " + ((res && res.error) || "unknown"); fd.disabled = false; return; }
        await run();
        const note = $("mhCrashCheck");
        if (note) note.insertAdjacentHTML("beforeend",
          `<div style="margin-top:8px; font-size:12px; color:#8b949e;">${duplicateFixNote(res)}</div>` +
          snapshotHtml(res));
      } catch (e) { fd.textContent = "Fix failed: " + e.message; fd.disabled = false; }
    });
    const fr = $("mhFixRegions");
    if (fr) fr.addEventListener("click", async () => {
      fr.disabled = true; fr.textContent = "Fixing…";
      try {
        const res = await fetch("/api/map/repair-region-overlaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: mp }) }).then((r) => r.json());
        if (!res || !res.ok) { fr.textContent = "Fix failed: " + ((res && res.error) || "unknown"); fr.disabled = false; return; }
        await run();
        const note = $("mhCrashCheck");
        if (note) note.insertAdjacentHTML("beforeend",
          `<div style="margin-top:8px; font-size:12px; color:#8b949e;">Aligned ${res.statesAligned || 0} split state(s) to a single strategic region (moved ${res.provincesMoved || 0} province(s); each split state now sits wholly in the region most of its provinces were already in).`
          + (res.orphansPlaced ? ` Put ${res.orphansPlaced} province(s) that were in no strategic region into the region the rest of their state is in.` : "")
          // #a-region-repair-adds-before-it-removes — a file the repair cannot write is now REPORTED instead of
          // thrown, so it has to be said here or a refused write reads as nothing more than "Aligned 0".
          + ((res.errors || []).length ? ` ⛔ ${res.errors.length} strategic-region file(s) could not be written (${esc((res.errors[0] && res.errors[0].error) || "unknown")}) — nothing was taken out of a region for a province that could not be put into its new one.` : "")
          + ` Re-checking…</div>`
          + snapshotHtml(res));
      } catch (e) { fr.textContent = "Fix failed: " + e.message; fr.disabled = false; }
    });
  }

  // ⛔ #a-recovery-copy-nobody-is-told-about — WHERE THE TWO BUTTONS ABOVE PUT THE COPIES THEY TOOK.
  //
  // Both fixers open a backup scope of their own (map-data.js fixDuplicateStateFiles / repairRegionOverlaps,
  // #a-bulk-map-click-evicted-its-own-backups) and hand the folder back on the click's own answer. Measured
  // 2026-09-17 by clicking both here, on this page, against a real server: each answered
  // backupSnapshot { dir, files: 12, failed: 0 } and each note said only what it had counted — twelve state
  // files removed and twelve region files rewritten, with the folder holding every original named nowhere.
  //
  // The sentence is the shared one from map-rule-labels.js, which the Map editor's Auto-fix summary uses too,
  // so the two cannot drift. It is rendered pre-wrap because it puts the path on its own line, and escaped:
  // a Windows path is user data going into innerHTML.
  function snapshotHtml(res) {
    const ML = window.NovaMapRuleLabels || {};
    const note = typeof ML.backupSnapshotNote === "function" ? ML.backupSnapshotNote(res) : "";
    if (!note) return "";
    return `<div style="margin-top:4px; font-size:12px; color:#8b949e; white-space:pre-wrap;">${esc(note.trim())}</div>`;
  }

  function card(color, title, body) {
    return `<div style="border:1px solid ${color}; border-left:4px solid ${color}; border-radius:6px; padding:10px 14px; background:#161b22;">` +
      `<div style="font-size:14px; font-weight:600; color:${color};">${esc(title)}</div>${body}</div>`;
  }
  function row(sev, label, msg) {
    const c = sev === "error" ? "#f85149" : "#9e6a00";
    return `<div style="font-size:12.5px; line-height:1.45; color:#c9d1d9;"><span style="color:${c}; font-weight:600;">${esc(label)}:</span> ${esc(msg)}</div>`;
  }
  // The full rule→label map lives in map-rule-labels.js (shared with a node coverage test), so every
  // validator rule — including the buildings.txt / coastal / fractioned classes — reads as plain English.
  function ruleLabel(rule) {
    return (window.NovaMapRuleLabels && window.NovaMapRuleLabels.mapRuleLabel)
      ? window.NovaMapRuleLabels.mapRuleLabel(rule)
      : (rule || "Problem");
  }

  function init() {
    const sel = $("modSelector");
    if (sel) sel.addEventListener("change", () => setTimeout(run, 50));
    setTimeout(run, 700); // let modhealth.js populate the selector first
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
