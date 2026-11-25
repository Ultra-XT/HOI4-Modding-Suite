"use strict";

/* ── #loc-display-strip — ONE canonical way to render a localisation value as readable text ────────────
 *
 * A HOI4 localisation value is frequently not plain text. Measured over vanilla's 122,583 english values:
 *   13.8% contain a [scope token]   e.g. [ROOT.GetNameDefCap], [121.owner.GetName], [GetDateText]
 *    9.9% contain a $KEY$ reference e.g. $FIN_motion_of_no_confidence_against_leader$, $RIGHT|0Y$
 *    8.5% contain a §colour code    e.g. §YGolden§!
 *    8.5% START with one of those   — which is exactly the "(root.something) name" the user reported
 *    1.0% contain a £sprite icon    e.g. £pol_power
 *    0.8% contain a [?variable|%Y0] print
 *
 * None of it can be resolved without running the game, so for DISPLAY it is all stripped. Five makers had
 * grown their own near-copy of this and they disagreed: the version Decisions used handled neither £sprite
 * codes nor the double space a mid-sentence removal leaves, and NOT ONE of the five stripped $KEY$ or the
 * [?var|fmt] form — so a name could still show up as "$FIN_motion…$ decision cost" or
 * ": More than [?ICE.communism_support_needed|%Y0] support for". Stripping a leading token also exposed the
 * punctuation behind it, leaving names that began with a stray ":" or ",".
 *
 * DISPLAY ONLY. The editable field and the saved .yml always keep the raw value, so this can never change
 * what is written to disk — the makers rely on that, and there are tests pinning it.
 */
window.novaStripLocCodes = window.novaStripLocCodes || function (value) {
  if (typeof value !== "string") return value;
  let s = value
    // §Y … §!  colour codes
    .replace(/§[A-Za-z0-9!]/g, "")
    // £sprite icons (£political_power, £GFX_…), up to the next space/token start
    .replace(/£[^\s§[$]+/g, "")
    // [ … ] scope tokens, variable prints and formatted variants. The charset has to be permissive:
    // real tokens carry digits and dots ([121.owner.GetName]), a leading ? ([?var]) and a |format
    // suffix ([?ICE.communism_support_needed|%Y0]). Non-greedy so two tokens don't merge into one match.
    .replace(/\[[^\]\n]*\]/g, "")
    // $KEY$ nested references, with or without a |format suffix ($RIGHT|0Y$)
    .replace(/\$[^$\n]*\$/g, "")
    // A marker whose payload was itself a token is left bare: `§$KEY$` and `£$ICON$£` both begin with a
    // marker followed by a `$`, which the marker patterns above deliberately don't consume, so once the
    // $KEY$ goes the § or £ remains. Vanilla really writes both (FIN_subsidized_…_tt, CAREER_PROFILE_…).
    .replace(/[§£]/g, "")
    // collapse the gap a mid-sentence removal leaves
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  // A token at the START leaves the punctuation that followed it dangling (": More than …"). Drop it, but
  // never touch an apostrophe — "'s Plan" is the author's word, not stray punctuation.
  s = s.replace(/^[:;,.–—-]+\s*/, "").trim();
  return s;
};

/* Does this value need explaining to the user? True when it carries anything the game resolves at runtime,
 * i.e. when what they typed is not what a player will read. */
window.novaLocHasDynamicCodes = window.novaLocHasDynamicCodes || function (value) {
  return typeof value === "string" && /[§£]|\[[^\]\n]*\]|\$[^$\n]*\$/.test(value);
};

/*
 * Nova loading overlay — a branded "Loading…" veil that appears whenever the app is waiting on a
 * genuinely SLOW server request, and disappears the moment things settle.
 *
 * WHY THIS EXISTS (do not rip out): the Express server runs in the Electron MAIN process, so a heavy
 * synchronous scan there (cold mod switch, first big-mod load, an uncached icon decode) briefly
 * freezes the window at the OS level. The renderer is a separate process and keeps painting, so if we
 * show this overlay BEFORE the slow fetch resolves the user sees a clear "Loading…" state instead of a
 * dead-looking ghosted window. Backend caching makes these rare; this covers the unavoidable cold ones.
 *
 * Design:
 *  - Wraps window.fetch (without changing its behavior) to track in-flight requests + their age.
 *  - A continuous watcher shows the overlay only when some non-excluded request has been pending past
 *    SHOW_AFTER_MS, so fast operations (normal saves/lists) never flash it.
 *  - AI + upload endpoints are excluded — they're legitimately slow and have their own progress UI.
 *  - Hard safety timeout: the overlay can never get permanently stuck.
 *  - window.NovaLoading.show()/hide()/during() lets a page force a loading state around a known-heavy
 *    action if it ever wants to (optional; the auto watcher already covers most cases).
 */
(function () {
  if (window.__novaLoadingOverlay) return;
  window.__novaLoadingOverlay = true;

  var SHOW_AFTER_MS = 500;     // only show once a request has been slow this long (no flash when warm)
  var QUIET_MS = 250;          // hide this long after the last tracked request settles
  var HARD_MAX_MS = 30000;     // absolute safety: a single continuous show can never exceed this
  var EXCLUDE = [/\/api\/ai\//i, /\/api\/upload/i, /\/api\/.*generate/i]; // own progress UI / long-running

  var tracked = [];            // [{ start }] of in-flight non-excluded requests
  var manualHolds = 0;         // window.NovaLoading.show() holders
  var visibleSince = 0;        // when the overlay became visible (for HARD_MAX safety)
  var isVisible = false;

  function isExcluded(url) {
    var u = "";
    try { u = typeof url === "string" ? url : (url && url.url) || ""; } catch (_e) { u = ""; }
    for (var i = 0; i < EXCLUDE.length; i++) { if (EXCLUDE[i].test(u)) return true; }
    return false;
  }

  // ---- track fetches without altering behavior ----
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (realFetch) {
    window.fetch = function () {
      var url = arguments && arguments.length ? arguments[0] : "";
      if (isExcluded(url)) return realFetch.apply(null, arguments);
      var rec = { start: Date.now() };
      tracked.push(rec);
      var settle = function () { var i = tracked.indexOf(rec); if (i !== -1) tracked.splice(i, 1); };
      var p;
      try { p = realFetch.apply(null, arguments); }
      catch (e) { settle(); throw e; }
      return p.then(function (r) { settle(); return r; }, function (err) { settle(); throw err; });
    };
  }

  function injectOnce() {
    if (document.getElementById("nova-loading-overlay")) return;
    var style = document.createElement("style");
    style.textContent =
      "#nova-loading-overlay{position:fixed;inset:0;z-index:99999;display:none;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:20px;background:radial-gradient(at 30% 25%," +
      "rgba(168,85,247,0.13) 0,transparent 55%),radial-gradient(at 75% 80%,rgba(56,139,253,0.11) 0," +
      "transparent 55%),rgba(13,17,23,0.92);font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#c9d1d9;" +
      "opacity:0;transition:opacity .2s ease;pointer-events:all;backdrop-filter:blur(1.5px);}" +
      "#nova-loading-overlay.nova-vis{opacity:1;}" +
      "#nova-loading-overlay .nlo-planet{font-size:46px;animation:nlo-float 3s ease-in-out infinite;" +
      "filter:drop-shadow(0 0 16px rgba(168,85,247,0.5));}" +
      "@keyframes nlo-float{0%,100%{transform:translateY(0) rotate(-4deg);}50%{transform:translateY(-8px) rotate(4deg);}}" +
      "#nova-loading-overlay .nlo-title{font-size:18px;font-weight:700;color:#e6edf3;}" +
      "#nova-loading-overlay .nlo-sub{font-size:12.5px;color:#8b949e;margin-top:-10px;}" +
      "#nova-loading-overlay .nlo-bar{width:240px;height:4px;border-radius:4px;background:rgba(148,163,184,.14);overflow:hidden;position:relative;}" +
      "#nova-loading-overlay .nlo-bar::after{content:'';position:absolute;top:0;left:-40%;height:100%;width:40%;border-radius:4px;" +
      "background:linear-gradient(90deg,transparent,#a855f7,#3b82f6,transparent);animation:nlo-slide 1.2s ease-in-out infinite;}" +
      "@keyframes nlo-slide{0%{left:-40%;}100%{left:100%;}}";
    document.head.appendChild(style);

    var ov = document.createElement("div");
    ov.id = "nova-loading-overlay";
    ov.setAttribute("role", "status");
    ov.innerHTML =
      '<div class="nlo-planet">🪐</div>' +
      '<div class="nlo-title">Loading…</div>' +
      '<div class="nlo-sub">Working through your mod data</div>' +
      '<div class="nlo-bar"></div>';
    document.body.appendChild(ov);
  }

  function setText(title, sub) {
    var ov = document.getElementById("nova-loading-overlay");
    if (!ov) return;
    var t = ov.querySelector(".nlo-title");
    var s = ov.querySelector(".nlo-sub");
    if (t && title != null) t.textContent = title;
    if (s && sub != null) s.textContent = sub;
  }

  function showOverlay(title, sub) {
    injectOnce();
    var ov = document.getElementById("nova-loading-overlay");
    if (!ov) return;
    if (title != null || sub != null) setText(title, sub);
    if (isVisible) return;
    isVisible = true;
    visibleSince = Date.now();
    ov.style.display = "flex";
    requestAnimationFrame(function () { ov.classList.add("nova-vis"); });
  }

  function hideOverlay() {
    if (!isVisible) return;
    isVisible = false;
    var ov = document.getElementById("nova-loading-overlay");
    if (!ov) return;
    ov.classList.remove("nova-vis");
    setTimeout(function () { if (ov && !isVisible) ov.style.display = "none"; }, 250);
  }

  // True if some tracked request has been pending long enough to warrant the overlay, but not so
  // long it's presumed stuck/abandoned. The upper bound (HARD_MAX_MS) is the safety: a request that
  // never settles stops triggering the overlay after that, so it can never get permanently stuck —
  // and because we use an age WINDOW (not a one-time timer) there's no hide/re-show flapping.
  function hasRelevantSlowRequest() {
    var now = Date.now();
    for (var i = 0; i < tracked.length; i++) {
      var age = now - tracked[i].start;
      if (age >= SHOW_AFTER_MS && age < HARD_MAX_MS) return true;
    }
    return false;
  }

  var wantFalseSince = 0;
  function tick() {
    var wantVisible = manualHolds > 0 || hasRelevantSlowRequest();
    if (wantVisible) {
      wantFalseSince = 0;
      if (!isVisible) showOverlay(manualHolds > 0 ? undefined : "Loading…", manualHolds > 0 ? undefined : "Working through your mod data");
    } else if (isVisible) {
      // Hide only after a short quiet period so a sequence of slow fetches doesn't flicker.
      if (!wantFalseSince) wantFalseSince = Date.now();
      if (Date.now() - wantFalseSince >= QUIET_MS) hideOverlay();
    }
    setTimeout(tick, 120);
  }

  function startWhenReady() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", startWhenReady, { once: true }); return; }
    tick();
  }
  startWhenReady();

  // ---- Optional manual API (the auto watcher already covers most cases) ----
  window.NovaLoading = {
    show: function (title, sub) { manualHolds++; showOverlay(title || "Loading…", sub || ""); },
    hide: function () { manualHolds = Math.max(0, manualHolds - 1); },
    during: function (title, sub, fn) {
      this.show(title, sub);
      var self = this, done = function () { self.hide(); };
      try {
        var p = typeof fn === "function" ? fn() : fn;
        if (p && typeof p.then === "function") return p.then(function (v) { done(); return v; }, function (e) { done(); throw e; });
        done(); return p;
      } catch (e) { done(); throw e; }
    },
  };
})();

/*
 * Nova write-note surface — SHOW WHAT THE SAVE WANTED TO TELL YOU.  (#write-notes-reach-one-page)
 *
 * WHY IT LIVES IN THIS FILE: it needs to run on every page that saves, and it needs the window.fetch
 * wrapper this script already owns. Nothing else is loaded by every maker page. Given its own file it
 * would have to be added to each page by hand, which is precisely the drift this fixes — the server
 * stopped hand-wiring the producer side for the same reason (installWriteNoteDrain in server.js).
 *
 * The server staples three things onto a save's reply when it has something to say:
 *   refWarning  — a reference it could not rewrite, an equipment file it had to redirect, an unknown tag
 *   warnings[]  — per-endpoint notes (order of battle, an inherited spirit a rename could not follow)
 *   guiRepair   — an interface file it fixed on your behalf
 * Only research.js ever read the first and nobody read the others, so the messages were written and
 * dropped. This is now the ONE place that shows them; pages must not also show them themselves.
 *
 * Deliberately narrow:
 *  - WRITES ONLY. A GET is never inspected, so no background poll can pop a dialog and no large
 *    catalogue response is ever cloned.
 *  - clone() first, so the page's own response body is untouched and still readable.
 *  - every step in a try/catch: failing to show a note must never break the save that succeeded.
 */
(function () {
  if (window.__novaWriteNotes) return;
  window.__novaWriteNotes = true;
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!realFetch) return;

  // One request can answer several notes; a page can also re-save quickly. Collapse an identical message
  // repeated within a few seconds so a retry does not stack dialogs.
  var lastMsg = "", lastAt = 0;

  // NEVER window.alert. Nova replaced the native dialogs everywhere on purpose — in Electron's
  // renderer they are unreliable — and army.html and home.html do not load the script that defines
  // nbAlert, so a bare `window.nbAlert || window.alert` fell back to exactly the thing Nova removed.
  // showNovaInfoModal is the shared modal underneath nbAlert and is present wherever either is.
  function present(msg, title) {
    if (typeof window.nbAlert === "function") { window.nbAlert(msg, title); return true; }
    if (typeof window.showNovaInfoModal === "function") {
      var html = String(msg).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
      window.showNovaInfoModal(title, html);
      return true;
    }
    if (window.console) window.console.warn(title + ": " + msg);
    return false;
  }

  // …and never SHOW one on top of another. showNovaInfoModal removes any modal already on screen, so
  // two messages in a row destroy the first — and the page's own "Successfully saved" lands a moment
  // AFTER this one, which meant the note explaining what the save could not do was the half that died.
  // Wait for the screen to be clear, then show. Bounded, because a modal the user never dismisses must
  // not leave a timer running for the life of the page.
  var WAIT_MS = 400, MAX_WAIT_MS = 120000;
  function showWhenClear(msg, waited) {
    var open = null;
    try { open = document.getElementById("novaInfoModalOverlay"); } catch (_e) { open = null; }
    if (!open) { present(msg, "Saved — with a note"); return; }
    if ((waited || 0) >= MAX_WAIT_MS) return; // give up rather than nag forever
    setTimeout(function () { showWhenClear(msg, (waited || 0) + WAIT_MS); }, WAIT_MS);
  }

  function show(msg) {
    var now = Date.now();
    if (msg === lastMsg && (now - lastAt) < 4000) return;
    lastMsg = msg; lastAt = now;
    // A beat first: the page that triggered the save usually shows its own "Successfully saved" right
    // after the response, and this must queue behind that rather than race it.
    try { setTimeout(function () { showWhenClear(msg, 0); }, 60); } catch (_e) {}
  }

  function notesIn(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return [];
    var out = [];
    if (Array.isArray(body.warnings)) {
      for (var i = 0; i < body.warnings.length; i++) {
        // modhealth-style replies use `warnings` as a COUNT, not a list. Only strings are messages.
        if (typeof body.warnings[i] === "string" && body.warnings[i].trim()) out.push(body.warnings[i].trim());
      }
    }
    if (typeof body.refWarning === "string" && body.refWarning.trim()) out.push(body.refWarning.trim());
    if (typeof body.guiRepair === "string" && body.guiRepair.trim()) out.push(body.guiRepair.trim());
    // #army-save-notes-invisible — the Military save answers with two more notes that had nowhere to go.
    // `note` is the OOB wiring result ("Saved the OOB, but GER already loads …") and NOTHING on the page
    // ever read it, so it was computed and thrown away. `namesGroupNote` warns that a division name group
    // is defined nowhere, which means unnamed divisions in game; it was appended to the transient status
    // line, which the page's own next message overwrites. Both are standing facts about what the save
    // could not do, which is exactly what this surface is for.
    // ⚠️ `oobNote`, NOT `note`. This drains named fields from EVERY json reply, so a field name it claims
    // must be unique across the whole API. `note` is not: /api/technologies/save-country-techs returns one
    // too, and Country Setup already shows that with its own title, so claiming `note` made the user read
    // the same warning in two dialogs. #army-save-notes-invisible
    if (typeof body.oobNote === "string" && body.oobNote.trim()) out.push(body.oobNote.trim());
    if (typeof body.namesGroupNote === "string" && body.namesGroupNote.trim()) out.push(body.namesGroupNote.trim());
    return out;
  }

  window.fetch = function () {
    var args = arguments;
    var method = "GET";
    try {
      var init = args.length > 1 ? args[1] : null;
      method = String((init && init.method) || (args[0] && args[0].method) || "GET").toUpperCase();
    } catch (_e) { method = "GET"; }
    var p = realFetch.apply(null, args);
    if (method === "GET" || method === "HEAD") return p;
    return p.then(function (r) {
      try {
        var ct = "";
        try { ct = (r.headers && r.headers.get && r.headers.get("content-type")) || ""; } catch (_e) { ct = ""; }
        if (r.ok && /json/i.test(ct)) {
          // Read the COPY. Touching r itself would consume the body the caller is about to parse.
          r.clone().json().then(function (body) {
            var notes = notesIn(body);
            if (notes.length) show(notes.join("\n\n"));
          }, function () {});
        }
      } catch (_e) {}
      return r;
    });
  };
})();

/*
 * Nova suite-nav guard — ONE OWNER FOR "you have unsaved work, are you sure?"
 *
 * Every maker page carries the same bar of 11 .suite-nav-link anchors. Leaving with unsaved edits was
 * guarded two different ways and, in the build users actually run, only one of them worked:
 *
 *   - beforeunload is Chromium's "Leave site?" prompt. ELECTRON SHOWS NO SUCH PROMPT — the handler simply
 *     CANCELS the navigation instead. So app.js, army.js and research.js each register it only when the UA
 *     is not Electron, which is correct, and which leaves the desktop app with no guard at all.
 *   - intercepting the link's own click and confirming. research.js and map.js did this; nobody else did.
 *
 * So on Focus Tree and Military a nav click discarded unsaved work instantly and silently, while the same
 * click in a browser at least raised Chromium's prompt. Decisions was worse: it registered beforeunload with
 * NO Electron gate, so a nav click did nothing whatsoever — and, never having defined
 * window.__focusEditorHasUnsavedChanges, main.js's quit handler was told there was nothing to save, set
 * allowWindowClose and called close(), which that same beforeunload then cancelled. The app could not be quit.
 *
 * This lives here because loading-overlay.js is the one script every maker page already loads. A page hands
 * it a dirty-check; it owns the rest.
 */
(function () {
  if (window.__novaSuiteNavGuard) return;
  window.__novaSuiteNavGuard = true;

  var isElectron = /\bElectron\//.test(String((window.navigator && window.navigator.userAgent) || ""));

  window.novaGuardSuiteNav = function (isDirty, label, opts) {
    if (typeof isDirty !== "function") return;
    // Resolved at prompt time, because a label may be a FUNCTION. The Spirits page also hosts the
    // Company editor and renames itself at runtime, so a string captured here would tell someone
    // editing a company that they have unsaved changes "in the Spirit maker".
    var whatNow = function () {
      var v = (typeof label === "function") ? label() : label;
      return v ? String(v) : "this page";
    };

    // …and the SAVE half of the same contract. main.js's quit dialog offers Save / Don't Save / Cancel with
    // Save as the DEFAULT (so Enter picks it), and its Save branch runs
    //     window.__focusEditorSaveBeforeExit ? …() : Promise.resolve(false)
    // — a page that answers "yes, unsaved" but publishes no saver therefore fails that branch, gets the
    // "Save Failed — fix any validation or save errors" box, and does not close. Every retry repeats it and
    // the only way out is Don't Save, which discards the work. Publishing the dirty-check WITHOUT this turned
    // the Decisions page from unquittable into un-quittable-without-discarding. #suite-nav-discards-unsaved-work
    if (opts && typeof opts.onSave === "function" && typeof window.__focusEditorSaveBeforeExit !== "function") {
      window.__focusEditorSaveBeforeExit = function () {
        var settled = false;
        return new Promise(function (resolve) {
          var give = function (v) { if (!settled) { settled = true; resolve(v); } };
          try { opts.onSave(); } catch (_e) { give(false); return; }
          // The page's own Save is asynchronous and reports through its dirty flag, so wait for that rather
          // than for the click. Bounded: a save that never lands must not hang the quit for ever.
          var waited = 0;
          var tick = function () {
            var stillDirty = true;
            try { stillDirty = !!isDirty(); } catch (_e) { stillDirty = false; }
            if (!stillDirty) { give(true); return; }
            waited += 150;
            if (waited >= 8000) { give(false); return; }
            setTimeout(tick, 150);
          };
          setTimeout(tick, 150);
        });
      };
    }

    // Electron's quit handler (main.js) asks the page this question before closing the window. A page that
    // never answers is taken to have nothing to save. Only publish it when the page has not already — army.js
    // and research.js supply richer versions that can also SAVE on the way out.
    if (typeof window.__focusEditorHasUnsavedChanges !== "function") {
      window.__focusEditorHasUnsavedChanges = function () {
        try { return !!isDirty(); } catch (_e) { return false; }
      };
    }

    // THE PATH THAT WORKS IN THE DESKTOP APP: the link's own click.
    try {
      var links = document.querySelectorAll(".suite-nav-link:not(.active)");
      for (var i = 0; i < links.length; i++) {
        links[i].addEventListener("click", function (e) {
          var dirty = false;
          try { dirty = !!isDirty(); } catch (_e) { dirty = false; }
          if (!dirty) return; // a clean page must never be interrupted
          if (!window.confirm("You have unsaved changes in " + whatNow() + ". Leave without saving?")) {
            e.preventDefault();
          }
        });
      }
    } catch (_e) {}

    // …and the browser path. NEVER under Electron: there it cancels navigation rather than prompting, which
    // is the bug this guard exists to remove.
    if (!isElectron) {
      try {
        window.addEventListener("beforeunload", function (e) {
          var dirty = false;
          try { dirty = !!isDirty(); } catch (_e) { dirty = false; }
          if (!dirty) return;
          e.preventDefault();
          e.returnValue = ""; // browsers show their own wording; the value is ignored
        });
      } catch (_e) {}
    }
  };
})();

/*
 * Nova unsaved-work watcher — ONE OWNER FOR "have I typed something I have not saved?"
 *
 * The Focus Tree, Research, Map, Military, Decisions and Country Setup all answer that question, and every
 * one of them answers it differently. Events, Spirits/Ideas and Characters did not answer it at all: no
 * dirty flag, no guard, no confirmation. Clicking another event in the list replaced a filled-in editor —
 * trigger, immediate, after, and every option's effect script — with no prompt and no way back.
 *
 * The design is the Decisions maker's, which is the best of the six: SNAPSHOT the editor when it loads and
 * compare, rather than setting a flag on the first keystroke. Comparing means undoing an edit by hand makes
 * the page quietly clean again, which a flag can never do, and it needs no listener on any field.
 *
 * What it does NOT do is hold a list of field ids. Decisions did, and the editor grew two fields past it —
 * so this asks the DOM for whatever is inside the editor root right now (#decision-guard-list-goes-stale).
 * Two details that a naive version gets wrong, both learned from real fields in this app:
 *
 *   · KEY BY POSITION, NOT BY ID. An event's OPTIONS are built at runtime as <div class="event-option"> with
 *     class-only inputs — .opt-name, .opt-title, .opt-script, .opt-trigger — and no ids at all. An id-only
 *     snapshot would have ignored the single most authored part of an event. Including the index also means
 *     adding, removing or reordering an option registers as a change, which it is.
 *   · READ A CHECKBOX WITH .checked. Its .value does not move when you tick it, so a .value snapshot leaves
 *     every checkbox on the page permanently clean.
 */
(function () {
  if (window.novaWatchUnsaved) return;

  /**
   * Watch an editor for unsaved work.
   * @param {{root: string, label: string, saveButtonId?: string, ignoreIds?: string[]}} opts
   *        root  — CSS selector for the editor container. SCOPE IS PART OF THE FIX: a list-search or
   *                picker-search box outside this element can then never raise an unsaved-work prompt.
   * @returns {{isDirty: function, markClean: function, confirmDiscard: function, snapshot: function}}
   */
  window.novaWatchUnsaved = function (opts) {
    var rootSel = (opts && opts.root) || "";
    // A string, as every caller but one passes, or a function for a page whose identity changes at
    // runtime. Evaluated per prompt rather than once at registration. #maker-names-itself-wrongly
    var label = (opts && opts.label) || "this editor";
    var labelNow = function () {
      var v = (typeof label === "function") ? label() : label;
      return String(v || "this editor");
    };
    var ignore = {};
    ((opts && opts.ignoreIds) || []).forEach(function (id) { ignore[id] = true; });

    function snapshot() {
      var root = rootSel && document.querySelector(rootSel);
      if (!root) return "";
      var els = root.querySelectorAll("input, textarea, select");
      var parts = [];
      // #owner-chips-are-unsaved-work — UNSAVED WORK THAT IS NOT AN INPUT.
      //
      // This reads form controls, which is the right default and covers almost everything. It cannot see the
      // game-start owner chips: those are spans rendered from a JS Set, so adding five countries changed
      // nothing the snapshot could compare and the page stayed "clean" over work that was very much unsaved.
      // A page with state like that passes an "extra" returning a string that changes when it changes.
      if (typeof opts.extra === "function") {
        try { parts.push("\u0002extra=" + String(opts.extra())); } catch (_e) { /* never break the dirty check */ }
      }
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.id && ignore[el.id]) continue;
        var type = String(el.type || "").toLowerCase();
        if (type === "button" || type === "submit" || type === "reset" || type === "file") continue;
        var key = i + ":" + (el.id || el.className || el.tagName);
        parts.push(key + "=" + (type === "checkbox" || type === "radio" ? (el.checked ? "1" : "0") : el.value));
      }
      return parts.join("\u0001");
    }

    // null = nothing has been loaded into the editor yet, so there is nothing to lose. Every page must call
    // markClean() once its editor is filled, or the guard has no baseline to compare against and stays quiet.
    var clean = null;

    // Has the user touched this editor since the last baseline? Only markCleanUnlessTouched() reads it, and
    // it exists because a maker's load is not over when the synchronous part ends. The Event Maker fetches
    // an event's schedule after painting the form and then writes the date fields — so it has to re-baseline
    // when that lands, or every freshly-opened event announces unsaved changes. But a re-baseline is exactly
    // "forget what was typed", and the fetch takes long enough for someone to start typing into it. Without
    // this flag the late call would quietly adopt their first sentence as the unedited state and let the
    // next click throw it away — the very bug the watcher is here to prevent, arriving through its own fix.
    var touched = false;
    function noteTouched() { touched = true; }
    function wireTouch() {
      var root = rootSel && document.querySelector(rootSel);
      if (!root || root.__novaTouchWired) return;
      root.__novaTouchWired = true;
      // Capture phase, so a handler that stops propagation cannot hide a keystroke from this.
      root.addEventListener("input", noteTouched, true);
      root.addEventListener("change", noteTouched, true);
    }

    var api = {
      snapshot: snapshot,
      markClean: function () { wireTouch(); touched = false; clean = snapshot(); },
      /** Re-baseline after an async load, but never over something the user typed while it was loading. */
      markCleanUnlessTouched: function () { if (!touched) api.markClean(); },
      isDirty: function () { return clean !== null && snapshot() !== clean; },
      /** Run 'proceed' unless there is unsaved work the user would rather keep. */
      confirmDiscard: function (what, proceed) {
        if (!api.isDirty()) { proceed(); return; }
        var msg = "You have unsaved changes in " + labelNow() + ". " + what + " anyway and lose them?";
        if (typeof window.novaConfirm === "function") {
          window.novaConfirm(msg, function () { clean = null; proceed(); },
            { title: "Unsaved changes", yesLabel: what + " (discard)", cancelLabel: "Keep editing", danger: true });
        } else if (window.confirm(msg)) { clean = null; proceed(); }
        // No dialog available and the user said no → do nothing, which keeps the work. Never fall through
        // to proceed(): silently discarding is the bug this exists to remove.
      },
    };

    // …and the ways off the page entirely. The shared nav guard owns the nav-link click (the only path that
    // works under Electron), the browser-only beforeunload, and main.js's quit hook.
    if (typeof window.novaGuardSuiteNav === "function") {
      window.novaGuardSuiteNav(api.isDirty, label, opts && opts.saveButtonId ? {
        onSave: function () { var b = document.getElementById(opts.saveButtonId); if (b) b.click(); },
      } : undefined);
    }
    return api;
  };
})();
