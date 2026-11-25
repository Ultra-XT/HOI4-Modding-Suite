// Nova's own interface language. Roadmap item 3.
//
// ⭐ THE RULE THAT MAKES A PARTIAL TRANSLATION SAFE: the fallback is the ENGLISH ALREADY ON THE PAGE, never
// the key. `<a data-i18n="nav.home">Home</a>` shows "Home" until ru.json defines nav.home. So a dictionary
// that covers a tenth of the app leaves the other nine tenths in working English rather than showing
// "nav.home" to a user mid-edit — and it can grow one string at a time, by anyone, without a code change.
//
// What is DELIBERATELY not translated, and why: HOI4's own vocabulary. `national_focus`, `division template`,
// `add_equipment_to_stockpile`, every file path, every script token, every id. Those are English in the game's
// files, on the wiki, and in every guide and tutorial a modder will ever read; a Russian modder searching for
// why their `set_oob` did nothing needs the string they will find in the wiki, not a translation of it. So the
// keys here cover Nova's CHROME — navigation, buttons, headings, explanations — and leave the domain alone.
//
// Storage: localStorage, per browser, like the rest of Nova's per-view preferences. There is nothing to save
// server-side and nothing that has to travel.
//
// CSP: script-src 'self' (so this is a plain external script, no inline), connect-src 'self' (so the
// dictionary is fetched from this origin). Nothing here uses an inline handler.
(function () {
  "use strict";

  var STORE_KEY = "novaLang";
  var DEFAULT_LANG = "en";
  // Every language Nova ships a dictionary for. `en` needs no file — it IS the text in the HTML.
  var LANGUAGES = [
    { code: "en", label: "English", english: "English" },
    { code: "ru", label: "Русский", english: "Russian" },
  ];

  var dict = {};
  var current = DEFAULT_LANG;

  function readStoredLang() {
    // A browser with site data blocked throws on the accessor itself, not just on a miss.
    try {
      var v = window.localStorage.getItem(STORE_KEY);
      for (var i = 0; i < LANGUAGES.length; i++) if (LANGUAGES[i].code === v) return v;
    } catch (_) { /* private window, cleared data, storage disabled */ }
    return DEFAULT_LANG;
  }

  function storeLang(code) {
    try { window.localStorage.setItem(STORE_KEY, code); } catch (_) { /* nothing to do; the page still works */ }
  }

  // t(key, fallback) — the fallback is what an English user sees, so it must always be a real sentence.
  function t(key, fallback) {
    var v = dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : null;
    return (typeof v === "string" && v !== "") ? v : (fallback === undefined ? key : fallback);
  }

  // Apply the dictionary over a subtree. Called on load and again by any page that injects markup later.
  //
  // The first pass REMEMBERS each element's English, in a data attribute, before overwriting it — otherwise
  // switching back to English (or to a language missing that key) would have nothing to restore and the page
  // would be stuck in whatever was applied first.
  function apply(root) {
    var scope = root || document;
    var pairs = [
      ["data-i18n", "textContent", "novaI18nEn"],
      ["data-i18n-title", "title", "novaI18nEnTitle"],
      ["data-i18n-placeholder", "placeholder", "novaI18nEnPlaceholder"],
      ["data-i18n-html", "innerHTML", "novaI18nEnHtml"],
    ];
    for (var p = 0; p < pairs.length; p++) {
      var attr = pairs[p][0], prop = pairs[p][1], memo = pairs[p][2];
      var nodes = scope.querySelectorAll("[" + attr + "]");
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.dataset[memo] === undefined) el.dataset[memo] = String(el[prop] == null ? "" : el[prop]);
        el[prop] = t(el.getAttribute(attr), el.dataset[memo]);
      }
    }
    // Let a page react (re-render a canvas caption, re-measure a layout) without polling.
    try { scope.dispatchEvent(new CustomEvent("nova-i18n-applied", { bubbles: true, detail: { lang: current } })); } catch (_) {}
  }

  function loadDictionary(code) {
    if (code === DEFAULT_LANG) { dict = {}; return Promise.resolve({}); }
    return fetch("lang/" + encodeURIComponent(code) + ".json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { dict = (d && typeof d === "object") ? d : {}; return dict; })
      // A missing or malformed dictionary must leave the app in English, not blank it.
      .catch(function () { dict = {}; return dict; });
  }

  function setLanguage(code) {
    var known = false;
    for (var i = 0; i < LANGUAGES.length; i++) if (LANGUAGES[i].code === code) known = true;
    if (!known) code = DEFAULT_LANG;
    current = code;
    storeLang(code);
    try { document.documentElement.setAttribute("lang", code); } catch (_) {}
    return loadDictionary(code).then(function () { apply(document); return code; });
  }

  window.novaI18n = {
    languages: LANGUAGES.slice(),
    get: function () { return current; },
    set: setLanguage,
    apply: apply,
    t: t,
  };
  // The short name the rest of the app uses.
  window.novaT = t;

  // Run before first paint where possible: this script is loaded first on every page, so the dictionary
  // request is already in flight while the rest of the page's scripts parse.
  current = readStoredLang();
  try { document.documentElement.setAttribute("lang", current); } catch (_) {}
  var ready = loadDictionary(current);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { ready.then(function () { apply(document); }); });
  } else {
    ready.then(function () { apply(document); });
  }
})();
