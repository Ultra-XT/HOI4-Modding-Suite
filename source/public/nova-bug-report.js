// 🐞 Roadmap item 4 — a bug report worth reading, without a server behind it.
//
// The owner files the best bug reports this project gets, and the reason is that they say WHICH MOD, WHICH
// SCREEN and WHAT THE FILE LOOKED LIKE. Nobody else supplies that unprompted, and the repo's issue template
// (GitHub's stock default) asks about smartphones and browsers instead. So the job here is not to add another
// way to complain — the Discord link is on every page now — it is to make the report carry the four or five
// facts that turn "the map editor is broken" into something reproducible.
//
// ⭐ WHY THERE IS NO SERVER IN THIS FILE. A 24/7 endpoint that receives reports is the version that costs
// money every month, needs uptime, and turns a desktop app that has never sent a byte anywhere into one that
// handles other people's data. Everything below produces the same text; the user reads it, then pastes it
// where they were already going. What is lost is automatic collection. What is kept is that the user sees
// exactly what they are sending — which is also why the paths arrive with the home directory collapsed to
// `~` (see /api/about): a report is pasted in public, and the account name is the one thing that would leak
// in every single one.
//
// CSP: script-src 'self', connect-src 'self'. No inline handlers, no remote anything.
(function () {
  "use strict";

  // A short ring of what actually went wrong. Long enough to catch the error that made someone reach for the
  // button; short enough that it is never a log file.
  //
  // ⭐ IT HAS TO OUTLIVE THE PAGE. This file loads on all eleven screens, but the button that builds a report
  // exists only in Home's Settings modal — and Nova's nav is ordinary <a href> navigation, so every screen is
  // a fresh document. An in-memory ring therefore died on the way to the only place it could be read.
  // Measured: throw an uncaught TypeError on the Map Editor, walk to Home, build a report — the ring is
  // empty, there is no "Errors on this screen" section at all, and `Screen:` says "Home (home.html)".
  // Two of the three facts this module exists to carry — WHICH SCREEN, and what went wrong — were wrong in
  // every report a user could actually produce. #bug-report-ring-died-with-the-page
  //
  // sessionStorage is the right shelf: per tab, cleared when Nova closes, never sent anywhere. Each entry
  // records the screen it happened ON, because "which screen" is now a property of the error and not of the
  // page the report happens to be built from.
  var MAX = 12;
  var KEY = "novaBugRing";
  var errors = [];
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    if (Object.prototype.toString.call(saved) === "[object Array]") errors = saved.slice(-MAX);
  } catch (_) { errors = []; }   // private mode, blocked storage, or junk left by an older build

  function persist() {
    try { sessionStorage.setItem(KEY, JSON.stringify(errors)); } catch (_) { /* memory-only is still better than nothing */ }
  }

  function note(kind, detail) {
    try {
      errors.push({ at: new Date().toISOString(), kind: kind, detail: String(detail).slice(0, 400), page: pageName() });
      if (errors.length > MAX) errors.shift();
      persist();
    } catch (_) { /* never let the reporter be the thing that throws */ }
  }

  window.addEventListener("error", function (ev) {
    // The capture-phase resource errors every page already listens for (a missing icon) are noise here: an
    // <img> that 404s is not why anyone opens a bug report. Only script errors carry a message.
    if (!ev || !ev.message) return;
    note("error", ev.message + (ev.filename ? "  @ " + String(ev.filename).replace(/^https?:\/\/[^/]+/, "") + ":" + ev.lineno : ""));
  });
  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev && ev.reason;
    note("unhandled", (r && r.message) ? r.message : String(r));
  });

  function pageName() {
    var f = (location.pathname.split("/").pop() || "index.html");
    var active = document.querySelector(".suite-nav-link.active");
    // The nav's own label, so the report says "Map Editor" and not "map.html" — and says it in whatever
    // language the reporter is running, which is a hint in itself.
    var label = active ? active.textContent.trim() : "";
    return label ? label + " (" + f + ")" : f;
  }

  function modPath() {
    try { return localStorage.getItem("activeModPath") || ""; } catch (_) { return ""; }
  }

  // Where the user has actually BEEN. The button lives only in Home's Settings modal, so `Screen:` can only
  // ever say "Home" — and most reports are not about a JS error at all ("I changed the terrain and the game
  // still shows the old one" throws nothing), so the error ring cannot supply the screen either. Without
  // this, the one question the report exists to answer is unanswerable for the ordinary case.
  // Consecutive repeats collapse, so a reload does not fill the trail with one name.
  var TRAIL_KEY = "novaBugTrail";
  var TRAIL_MAX = 6;
  function trail() {
    try {
      var t = JSON.parse(sessionStorage.getItem(TRAIL_KEY) || "[]");
      return Object.prototype.toString.call(t) === "[object Array]" ? t : [];
    } catch (_) { return []; }
  }
  // ⚠ AFTER THE DOM, not at load. pageName() reads the nav's active link for a human label, and this script
  // is in <head> on home.html (line 9) but at the end of <body> on map.html — so recording immediately would
  // have written "home.html" for one screen and "Map Editor (map.html)" for the others, from the same code.
  function recordVisit() {
    try {
      var t = trail();
      var here = pageName();
      if (t[t.length - 1] !== here) t.push(here);
      sessionStorage.setItem(TRAIL_KEY, JSON.stringify(t.slice(-TRAIL_MAX)));
    } catch (_) { /* storage blocked — the report simply omits the trail */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", recordVisit);
  else recordVisit();

  // Build the report text. Returns a string; never throws, because the one moment this is used is the moment
  // something else already broke.
  async function build(userText) {
    var about = null;
    try {
      about = await fetch("/api/about?modPath=" + encodeURIComponent(modPath())).then(function (r) { return r.json(); });
    } catch (_) { about = null; }

    var L = [];
    if (userText && String(userText).trim()) {
      L.push(String(userText).trim());
      L.push("");
    }
    L.push("--- Nova ---");
    if (about && about.ok) {
      L.push("Nova:     " + about.nova + "   (" + about.platform + (about.electron ? ", Electron " + about.electron : "") + ")");
      L.push("Screen:   " + pageName());
      var tr = trail();
      if (tr.length > 1) L.push("Was on:   " + tr.join("  →  "));
      if (about.mod) L.push("Mod:      " + about.mod.name + "   " + about.mod.path);
      else L.push("Mod:      (none selected)");
      if (about.dependencies && about.dependencies.length) {
        L.push("Depends:  " + about.dependencies.map(function (d) { return d.name; }).join(", "));
      }
      if (about.game && about.game.path) {
        L.push("Game:     " + (about.game.version || "version unknown") + "   " + about.game.path);
      } else if (about.game && about.game.found === false) {
        // #nova-does-not-find-the-game — the one fact that explains a report where every maker is missing the base game
        L.push("Game:     NOT FOUND — Nova could not find Hearts of Iron IV (Home → Game folder)");
      }
    } else {
      // The endpoint is the thing that failed. Say so plainly rather than shipping a report that looks
      // complete and is not.
      L.push("(Nova's own details could not be read — the backend did not answer. That is itself worth reporting.)");
      L.push("Screen:   " + pageName());
      L.push("Mod:      " + (modPath() || "(none selected)"));
    }
    if (errors.length) {
      L.push("");
      // Not "on this screen" any more — the ring survives navigation, so the screen is named per error.
      // That is the whole point: the report is built on Home, and the error almost never happened there.
      L.push("--- Errors this session (" + errors.length + ", newest last) ---");
      for (var i = 0; i < errors.length; i++) {
        var e = errors[i];
        L.push(e.at + "  [" + (e.page || "?") + "]  " + e.kind + ": " + e.detail);
      }
    }
    return L.join("\n");
  }

  // A GitHub issue with the body already filled in. Nothing is submitted — this opens the compose form and
  // the user still reads it and presses the button, which is the whole point.
  function issueUrl(body, title) {
    var base = "https://github.com/Ultra-XT/HOI4-Modding-Suite/issues/new";
    var q = "?labels=bug&title=" + encodeURIComponent(title || "") + "&body=" + encodeURIComponent(body || "");
    // GitHub truncates a very long query; keep the body inside a length the URL survives, and say so in the
    // text rather than silently dropping the tail.
    if (q.length > 6000) {
      var keep = body.slice(0, 3500) + "\n\n…(trimmed to fit the link — press “Copy” instead to send all of it)";
      q = "?labels=bug&title=" + encodeURIComponent(title || "") + "&body=" + encodeURIComponent(keep);
    }
    return base + q;
  }

  window.novaBugReport = { build: build, issueUrl: issueUrl, recentErrors: function () { return errors.slice(); } };
})();
