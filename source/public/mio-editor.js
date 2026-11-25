/*
 * NovaMioEditor — the shared COMPANY (Military Industrial Organization) editor.
 *
 * Writes a MIO (POST /api/mio) — the in-game-correct company system with Arms Against Tyranny — plus, opt-in, the
 * legacy designer-idea twin so a company works with or without the DLC. Built to match Nova's design system: the
 * shared AI generator panel, per-field ✨ AI, the visual icon grid picker (like the Ideas maker), the canonical
 * sidebar list (like Spirits/Events, click-to-EDIT), and a LIVE in-game preview — so Companies feels like every
 * other maker. Mounted into ideas.html (designers mode); shares that page's window/DOM + shared scripts.
 */
(function () {
  "use strict";

  // Manufacturer designer SLOTS. Picking one sets a default icon and NOTHING ELSE.
  //
  // #mio-seeded-categories-do-not-exist — these used to seed eq/research too, with ids that exist nowhere:
  // `mio_cat_all_armor`, `mio_cat_all_naval`, `mio_cat_all_aircraft`, `mio_cat_all_infantry_weapons`,
  // `CAT_armor`, `CAT_naval_all`, `CAT_air`, `CAT_inf_wep`, `CAT_industry`. The real vanilla ids are
  // `mio_cat_eq_all_*` (21 of them) and `mio_cat_tech_*` — note the `_eq_` / `_tech_` segment the seeds
  // lacked. So a modder picked a slot, filled in name and bonuses, hit Save, got a green ✓ — and in game the
  // company could never be assigned to any equipment, because its equipment_type named a group that does not
  // exist. On any mod not derived from Millennium Dawn that was ALL FIVE slots.
  //
  // Seeding nothing is the fix that cannot be wrong on a mod Nova has not seen. The correct id set differs per
  // mod — MD lists equipment ARCHETYPES directly rather than using vanilla's mio_cat_eq_* groups at all — so
  // any hardcoded default is a guess that silently produces a broken company on some mods. save() already
  // refuses a company with no equipment and no research ("Add at least one equipment or research category it
  // works on"), and the ＋ picker beside those fields lists the REAL values for the active mod. The user is
  // now guided to a working choice instead of handed a broken one that looks authoritative.
  var COMPANY_TYPES = [
    { key: "tank_manufacturer",     label: "🛡 Tank / vehicle",      eq: [], research: [], picture: "generic_tank_manufacturer_1" },
    { key: "naval_manufacturer",    label: "🚢 Naval",               eq: [], research: [], picture: "generic_naval_manufacturer_1" },
    { key: "aircraft_manufacturer", label: "✈ Aircraft",             eq: [], research: [], picture: "generic_air_manufacturer_1" },
    { key: "materiel_manufacturer", label: "🔫 Materiel / infantry",  eq: [], research: [], picture: "generic_infantry_manufacturer_1" },
    { key: "industrial_concern",    label: "🏭 Industrial concern",   eq: [], research: [], picture: "generic_industrial_concern_1" },
  ];
  var typeOf = function (k) { for (var i = 0; i < COMPANY_TYPES.length; i++) if (COMPANY_TYPES[i].key === k) return COMPANY_TYPES[i]; return COMPANY_TYPES[0]; };
  // in-game preview category label (no emoji), matching the Ideas maker's designer catMap
  var CAT_LABEL = { tank_manufacturer: "Tank Manufacturer", naval_manufacturer: "Naval Manufacturer", aircraft_manufacturer: "Aircraft Manufacturer", materiel_manufacturer: "Materiel Manufacturer", industrial_concern: "Industrial Concern" };
  // edit-load: a MIO doesn't store its Nova "type" — infer it from the equipment categories so the idea-fallback still works
  function inferType(eq, hint) {
    var s = ((eq || []).join(" ") + " " + (hint || "")).toLowerCase();
    if (/naval|ship|destroyer|cruiser|carrier|frigate|submarine|boat|shipyard/.test(s)) return "naval_manufacturer";
    if (/air|plane|aircraft|fighter|bomber|helicopter/.test(s)) return "aircraft_manufacturer";
    if (/armor|armour|tank|afv|vehicle/.test(s)) return "tank_manufacturer";
    if (/infantry|weapon|artillery|materiel|material|small_arms|arms/.test(s)) return "materiel_manufacturer";
    return "industrial_concern";
  }

  var EQ_STAT_KEYS = ["reliability", "soft_attack", "hard_attack", "defense", "breakthrough", "armor_value", "ap_attack",
    "air_attack", "maximum_speed", "build_cost_ic", "reliability_factor", "max_organisation", "air_range", "naval_speed"];
  var PROD_KEYS = ["production_efficiency_gain_factor", "production_efficiency_cap", "production_resource_need_factor",
    "resource_cost", "production_speed_buildings_factor"];
  // the canonical ✨ AI button look (copied verbatim from ai-field-assist.js buildAiAssistButton) so every box matches
  var AI_BTN_STYLE = "background:none; border:none; color:#58a6ff; font-size:11px; cursor:pointer; font-weight:600; padding:0; margin-left:8px; transition:color 0.15s;";
  var TRAIT_ICON_FALLBACK = "GFX_generic_mio_trait_icon_design";

  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
  var el = function (id) { return document.getElementById(id); };
  var isTok = function (t) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(t || "").trim()); };
  var modPathLS = function () { try { return localStorage.getItem("activeModPath") || ""; } catch (e) { return ""; } };
  var titleize = function (s) { return String(s || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };
  // #mio-blank-trait-silently-dropped — Token (ID) is the node's identity, but a trait tree is authored by
  // NAME: the user types "Reliable Tracks", the live preview immediately shows "Company trait: Reliable
  // Tracks" (syncPreview accepts `t.token || t.name`), and the trait looks real. save() then dropped every
  // trait whose token box was empty, so the trait and every bonus row on it never reached the file — under
  // an unqualified green "✓ Saved". Derive the token from the name the way every other maker derives an id.
  var tokenFromName = function (name, companyId) {
    var s = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
    if (!s) return "";
    if (isTok(s)) return s;
    var pref = String(companyId || "").trim() + "_" + s; // a name starting with a digit — the server tries this too
    return isTok(pref) ? pref : "";
  };
  var rowsFromObj = function (o) { return o && typeof o === "object" ? Object.keys(o).map(function (k) { return { k: k, v: String(o[k]) }; }) : []; };

  // ── shared searchable-list modal (categories, files, traits). Optional per-item icon thumbnails. ──
  function openListPicker(cfg) {
    var RENDER_CAP = 220; // never inject thousands of rows/imgs at once — search narrows the rest
    var ov = document.createElement("div");
    ov.style.cssText = "position:fixed; inset:0; z-index:2147483300; display:flex; align-items:center; justify-content:center; background:rgba(3,7,14,0.66); backdrop-filter:blur(2px); font-family:'Inter',system-ui,Segoe UI,sans-serif;";
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" style="width:min(660px,94vw); max-height:84vh; display:flex; flex-direction:column; background:linear-gradient(140deg,#1a3566 0%,#262a5e 48%,#2e1f55 100%); border:1px solid rgba(150,160,255,0.28); border-radius:14px; box-shadow:0 22px 66px rgba(0,0,0,0.6); padding:18px; color:#d7e1f5;">' +
        '<div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">' +
          '<h2 style="margin:0; font-size:16px; font-weight:600; color:#eaf3ff;">' + esc(cfg.title) + '</h2>' +
          '<span style="font-size:11px; color:#9fb6ff;">' + esc(cfg.hint || "click one to add") + '</span>' +
          '<span style="flex:1"></span>' +
          '<button data-x aria-label="Close" style="background:none; border:none; color:#aab6e0; font-size:20px; line-height:1; cursor:pointer;">&times;</button>' +
        '</div>' +
        '<input data-s type="text" autocomplete="off" spellcheck="false" placeholder="Search…" style="width:100%; box-sizing:border-box; padding:9px 10px; background:#0d1117; border:1px solid #30363d; color:#e6edf3; border-radius:8px; font-size:13px; outline:none; margin-bottom:8px;" />' +
        '<div data-c style="font-size:11px; color:#9aa6cf; margin-bottom:6px;"></div>' +
        '<div data-l style="overflow:auto; flex:1; border:1px solid rgba(150,160,255,0.16); border-radius:10px; background:rgba(0,0,0,0.18);"></div>' +
      '</div>';
    document.body.appendChild(ov);
    var sEl = ov.querySelector("[data-s]"), lEl = ov.querySelector("[data-l]"), cEl = ov.querySelector("[data-c]");
    function close() { ov.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    ov.querySelector("[data-x]").addEventListener("click", close);
    function render() {
      var q = sEl.value.trim().toLowerCase();
      var m = q ? cfg.items.filter(function (x) { return (x.label + " " + x.value + " " + (x.sub || "")).toLowerCase().indexOf(q) >= 0; }) : cfg.items;
      var shown = m.slice(0, RENDER_CAP);
      cEl.textContent = m.length + (m.length === 1 ? " match" : " matches") + (m.length > shown.length ? " — showing first " + shown.length + ", refine to see more" : "");
      if (!m.length) { lEl.innerHTML = '<div style="padding:18px; text-align:center; color:#9aa6cf; font-size:13px;">Nothing matches.</div>'; return; }
      lEl.innerHTML = shown.map(function (x) {
        var img = x.icon ? '<img src="' + esc(x.icon) + '" loading="lazy" style="width:30px; height:30px; object-fit:contain; flex:0 0 auto; background:rgba(0,0,0,0.25); border-radius:5px;" data-hide-on-error="visibility">' : "";
        return '<div data-v="' + esc(x.value) + '" role="button" tabindex="0" style="display:flex; align-items:center; gap:10px; padding:7px 11px; border-bottom:1px solid rgba(150,160,255,0.08); cursor:pointer;">' + img +
          '<div style="min-width:0;"><code style="color:#9fe0ff; font-size:13px; font-weight:600;">' + esc(x.label) + '</code>' +
          (x.sub ? '<div style="font-size:11.5px; color:#aab6e0; margin-top:2px;">' + esc(x.sub) + '</div>' : '') + '</div></div>';
      }).join("");
    }
    lEl.addEventListener("click", function (e) { var row = e.target.closest("[data-v]"); if (row) { try { cfg.onPick(row.getAttribute("data-v")); } catch (_) {} close(); } });
    sEl.addEventListener("input", render);
    render();
    setTimeout(function () { try { sEl.focus(); } catch (_) {} }, 0);
  }

  function NovaMioEditor(opts) {
    var host = opts.host;
    var getModPath = opts.getModPath || modPathLS;
    var onSaved = opts.onSaved || function () {};
    // #mio-editor-outside-the-unsaved-contract — this component has no unsaved-work watcher of its own;
    // it is mounted inside the host page's editor panel and the host page's watcher is the one that sees
    // its fields. So the two things only the host can do are asked of the host:
    //   confirmReplace — before the form is replaced, let the host offer to keep half-built work
    //   onFormReplaced — after it is replaced, let the host make the new contents the baseline
    // Both default to "no host is listening", so the editor still works standalone.
    var confirmReplace = opts.confirmReplace || function (what, proceed) { proceed(); };
    var onFormReplaced = opts.onFormReplaced || function () {};
    //   onFormSettled  - and again once the ASYNC half of the fill lands, unless the user typed
    //                    meanwhile. render() -> wire() starts a country-catalog fetch that writes the
    //                    company's "Available to" tag into an empty <select> well after the host has
    //                    taken its baseline, which made every company with an `allowed` tag read as
    //                    edited the moment it finished loading. #makers-lose-unsaved-work
    var onFormSettled = opts.onFormSettled || function () {};
    var listHost = opts.listHost || null;
    var pendingFill = null; // the in-flight country-catalog fetch started by the most recent wire()
    var writeIdeaFallback = opts.writeIdeaFallback !== false;
    var cats = { equipment: [], research: [] };
    var traitsCache = null, filesCache = null;
    var openFolders = null; // Set of expanded file names in the sidebar list
    var d = null;
    var _pvIcon = "\u0000"; // last icon resolved into the preview (sentinel so first sync always resolves)

    // render() returning is not the form being finished: wire() leaves a catalog fetch in flight that
    // still has to write the "Available to" tag. Re-baseline when THAT lands too, or the write lands
    // after the baseline and reads as an edit nobody made.
    function settleForm() {
      Promise.resolve(pendingFill).then(function () { onFormSettled(); }).catch(function () {});
    }

    function freshDraft() {
      var t = COMPANY_TYPES[0];
      return { companyType: t.key, id: "", name: "", desc: "", allowedTag: "", icon: "GFX_idea_" + t.picture, file: "nova_mio.txt",
        eq: t.eq.slice(), tech: t.research.slice(), eqPending: "", techPending: "", include: [],
        // #mio-rename-clones — the id this draft was LOADED as, so the server can remove the old organization
        // when the user changes it. A brand-new company has none. See save().
        loadedId: "",
        initEq: [{ k: "reliability", v: "0.05" }], initProd: [], traits: [] };
    }

    function loadCatalog() {
      fetch("/api/mio/categories?modPath=" + encodeURIComponent(getModPath())).then(function (r) { return r.json(); }).then(function (j) {
        cats = { equipment: (j && j.equipment) || [], research: (j && j.research) || [] };
      }).catch(function () {});
    }
    function loadTraits(cb) {
      if (traitsCache) { cb(traitsCache); return; }
      fetch("/api/mio/traits?modPath=" + encodeURIComponent(getModPath())).then(function (r) { return r.json(); }).then(function (j) {
        traitsCache = (j && j.traits) || []; cb(traitsCache);
      }).catch(function () { cb([]); });
    }
    function loadFiles(cb) {
      fetch("/api/mio/files?modPath=" + encodeURIComponent(getModPath())).then(function (r) { return r.json(); }).then(function (j) {
        filesCache = (j && j.files) || ["nova_mio.txt"]; cb(filesCache);
      }).catch(function () { cb(["nova_mio.txt"]); });
    }
    function iconUrl(key) { return "/api/icon-image?key=" + encodeURIComponent(key) + "&modPath=" + encodeURIComponent(getModPath()); }

    // ── picture: resolves into BOTH the 76px box and the live in-game preview icon ──────────────────────────────
    function pictureToken() { return String(d.icon || "").replace(/^GFX_idea_/i, ""); }
    function applyIcon(url) {
      var a = el("mioPicPreview"); if (a) a.innerHTML = '<img src="' + esc(url) + '" alt="" style="max-width:100%; max-height:100%; object-fit:contain;">';
      var b = el("previewIdeaIcon"); if (b) b.src = url;
      _pvIcon = d.icon;
    }
    function refreshIcon(directTexture) {
      if (directTexture) { applyIcon("/api/buildings/icon-file?path=" + encodeURIComponent(directTexture)); return; }
      var tok = pictureToken();
      if (!tok) { var a = el("mioPicPreview"); if (a) a.textContent = "Icon"; _pvIcon = d.icon; return; }
      fetch("/api/ideas/sprite-url?key=GFX_idea_" + encodeURIComponent(tok) + "&modPath=" + encodeURIComponent(getModPath())).then(function (r) { return r.json(); }).then(function (j) {
        applyIcon((j && j.url) || "/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds");
      }).catch(function () {});
    }
    function doUpload(file) {
      var st = el("mioPicStatus"); if (st) { st.style.color = "#8b949e"; st.textContent = "Uploading…"; }
      var fd = new FormData();
      fd.append("image", file);
      fd.append("name", (d.id || "nova_company").trim() || "nova_company");
      fd.append("type", "idea");
      if (getModPath()) fd.append("modPath", getModPath());
      fetch("/api/upload-gfx", { method: "POST", body: fd }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.error) throw new Error(j.error);
        d.icon = j.spriteName || d.icon; if (el("mioIcon")) el("mioIcon").value = d.icon;
        refreshIcon(j.ddsPath);
        if (st) { st.style.color = "#3fb950"; st.textContent = j.overwrote ? "✓ Replaced the icon." : "✓ Icon uploaded."; }
      }).catch(function (e) { if (st) { st.style.color = "#f85149"; st.textContent = "✗ " + (e.message || e); } });
    }
    // Visual THUMBNAIL-GRID icon picker — reuses the SHARED modal classes (.modal / .modal-content / .modal-header /
    // .modal-search / .modal-grid-focus-icons / .icon-picker-item from styles.css) so it looks IDENTICAL to the Event
    // Image picker, not a bespoke design. #company-icon-grid
    function openIconGridPicker() {
      var ov = document.createElement("div");
      ov.className = "modal"; ov.style.display = "block";
      ov.innerHTML =
        '<div class="modal-content">' +
          '<div class="modal-header"><h2>Select Company Icon</h2><span class="modal-close" data-x>&times;</span></div>' +
          '<input type="text" class="modal-search" data-s placeholder="Search company icons by name…">' +
          '<div class="modal-grid-focus-icons" data-g></div>' +
        '</div>';
      document.body.appendChild(ov);
      var sEl = ov.querySelector("[data-s]"), gEl = ov.querySelector("[data-g]");
      var sprites = [], CAP = 200;
      function close() { ov.remove(); document.removeEventListener("keydown", onKey, true); }
      function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
      document.addEventListener("keydown", onKey, true);
      ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
      ov.querySelector("[data-x]").addEventListener("click", close);
      function draw() {
        var q = sEl.value.trim().toLowerCase();
        var m = q ? sprites.filter(function (s) { return s.key.toLowerCase().indexOf(q) >= 0; }) : sprites;
        var shown = m.slice(0, CAP);
        if (!shown.length) { gEl.innerHTML = '<div style="grid-column:1/-1; padding:24px; color:#8b949e; text-align:center;">No icons found.</div>'; return; }
        gEl.innerHTML = shown.map(function (s) {
          return '<div class="icon-picker-item" data-key="' + esc(s.key) + '" data-tex="' + esc(s.texturefile || "") + '" title="' + esc(s.key) + '">' +
            '<img src="/api/buildings/icon-file?path=' + encodeURIComponent(s.texturefile || "") + '" alt="Icon" loading="lazy" style="width:64px; height:64px; object-fit:contain; margin-bottom:8px;" data-hide-on-error="visibility">' +
            '<span style="font-size:10px; color:#8b949e; word-break:break-all; font-family:monospace;">' + esc(s.key.replace(/^GFX_idea_/, "")) + '</span></div>';
        }).join("") + (m.length > shown.length ? '<div style="grid-column:1/-1; padding:8px; color:#6e7681; text-align:center; font-size:11px;">Showing first ' + CAP + ' of ' + m.length + " — refine your search to see more.</div>" : "");
      }
      gEl.addEventListener("click", function (e) {
        var c = e.target.closest("[data-key]"); if (!c) return;
        d.icon = c.getAttribute("data-key"); if (el("mioIcon")) el("mioIcon").value = d.icon;
        refreshIcon(c.getAttribute("data-tex") || ""); close();
      });
      sEl.addEventListener("input", draw);
      gEl.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#8b949e; padding:24px;">Scanning game files for company icons…</div>';
      fetch("/api/ideas/sprites?modPath=" + encodeURIComponent(getModPath())).then(function (r) { return r.json(); }).then(function (j) {
        sprites = (j && j.sprites) || []; draw(); setTimeout(function () { try { sEl.focus(); } catch (_) {} }, 0);
      }).catch(function () { gEl.innerHTML = '<div style="grid-column:1/-1; color:#f85149; padding:24px; text-align:center;">Couldn\'t load icons.</div>'; });
    }

    // ── category picker (purple list — one consistent design, no native dropdown) ───────────────────────────────
    function openCatPicker(kind) {
      var pool = kind === "eq" ? cats.equipment : cats.research;
      var arr = kind === "eq" ? d.eq : d.tech;
      if (!pool.length) { nb("The mod has no " + (kind === "eq" ? "equipment" : "research") + " categories to pick — type one and press Enter."); return; }
      openListPicker({
        title: kind === "eq" ? "Add equipment category (what this company builds)" : "Add research category",
        hint: pool.length + " in this mod — click to add",
        items: pool.filter(function (c) { return arr.indexOf(c) < 0; }).map(function (c) { return { value: c, label: c }; }),
        onPick: function (c) { arr.push(c); render(); },
      });
    }

    // ── trait picker — real mod traits, WITH a picture before each (item 3) ─────────────────────────────────────
    function openTraitPicker() {
      loadTraits(function (traits) {
        if (!traits.length) { d.traits.push(blankTrait()); render(); return; }
        openListPicker({
          title: "Add a company trait", hint: traits.length + " traits in this mod — click to add",
          items: traits.map(function (t) {
            var bon = Object.keys(t.equipmentBonus || {}).map(function (k) { return k.replace(/_/g, " ") + " " + t.equipmentBonus[k]; }).join(", ");
            return { value: t.token, label: (t.name || t.token), sub: t.token + (bon ? "  ·  " + bon : ""), icon: iconUrl(t.icon || TRAIT_ICON_FALLBACK) };
          }),
          onPick: function (tok) {
            var t = traits.filter(function (x) { return x.token === tok; })[0] || { token: tok, name: tok };
            d.traits.push({ token: t.token, name: t.name || t.token, x: 0, y: d.traits.length, relativeTo: "", icon: t.icon || "",
              eq: rowsFromObj(t.equipmentBonus).length ? rowsFromObj(t.equipmentBonus) : [{ k: "", v: "" }], prod: rowsFromObj(t.productionBonus) });
            render();
          },
        });
      });
    }
    function blankTrait() { return { token: "", name: "", x: 0, y: d.traits.length, relativeTo: "", icon: "", eq: [{ k: "", v: "" }], prod: [] }; }

    // ── target-file dropdown (item 13) ──────────────────────────────────────────────────────────────────────────
    function openFilePicker() {
      loadFiles(function (files) {
        openListPicker({
          title: "Choose the file to save into", hint: "click one, or type your own name in the box",
          items: files.map(function (f) { return { value: f, label: f }; }),
          onPick: function (f) { d.file = f; if (el("mioFile")) el("mioFile").value = f; },
        });
      });
    }

    // ── bonus stat rows: resolve a row's path to its draft array, and a consistent stat PICKER (no native datalist) ──
    function bonusArr(p) {
      if (p === "initEq") return d.initEq; if (p === "initProd") return d.initProd;
      var mEq = /^traitEq(\d+)$/.exec(p); if (mEq) return (d.traits[+mEq[1]] || {}).eq;
      var mPr = /^traitProd(\d+)$/.exec(p); if (mPr) return (d.traits[+mPr[1]] || {}).prod;
      return null;
    }
    function openStatPicker(path) {
      var arr = bonusArr(path); if (!arr) return;
      var isProd = path === "initProd" || /^traitProd/.test(path);
      var keys = isProd ? PROD_KEYS : EQ_STAT_KEYS;
      openListPicker({
        title: isProd ? "Add a production stat" : "Add an equipment stat",
        hint: keys.length + " common stats — or just type your own in the row",
        items: keys.map(function (k) { return { value: k, label: k, sub: titleize(k) }; }),
        onPick: function (k) { arr.push({ k: k, v: "" }); render(); },
      });
    }

    // ── AI: per-box helpers + the full generator ────────────────────────────────────────────────────────────────
    var apiKey = function () { try { return localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey") || ""; } catch (e) { return ""; } };
    var nb = function (m) { (window.nbAlert || window.alert)(m); };
    function aiCall(prompt, sys) {
      return fetch("/api/ai/logic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt, systemPrompt: sys, modPath: getModPath(), apiKey: apiKey() }) })
        .then(function (r) { return r.json(); }).then(function (data) {
          if (data.error) throw new Error(data.error);
          return (window.NovaAI && window.NovaAI.parseJsonResponse) ? window.NovaAI.parseJsonResponse(data.script) : JSON.parse(data.script);
        });
    }
    var toRows = function (o) { return o && typeof o === "object" ? Object.keys(o).filter(isTok).map(function (k) { return { k: k, v: String(o[k]) }; }) : []; };
    // match an AI-proposed trait name to a REAL mod trait so the AI "adds traits from the mod" (item 7)
    function matchModTrait(name) {
      if (!traitsCache || !name) return null;
      var n = String(name).toLowerCase().trim();
      return traitsCache.filter(function (t) { return String(t.name || "").toLowerCase() === n; })[0] ||
             traitsCache.filter(function (t) { return String(t.name || "").toLowerCase().indexOf(n) >= 0 || n.indexOf(String(t.name || "").toLowerCase()) >= 0; })[0] || null;
    }
    function aiTraitsToDraft(arr) {
      return (arr || []).map(function (tr, i) {
        var real = matchModTrait(tr.name);
        if (real) return { token: real.token, name: real.name, x: 0, y: i, relativeTo: "", icon: real.icon || "",
          eq: rowsFromObj(real.equipmentBonus).length ? rowsFromObj(real.equipmentBonus) : toRows(tr.equipmentBonus), prod: rowsFromObj(real.productionBonus) };
        var tok = String(tr.name || ("trait_" + i)).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || ("trait_" + i);
        return { token: tok, name: String(tr.name || ""), x: 0, y: i, relativeTo: "", icon: "", eq: toRows(tr.equipmentBonus), prod: toRows(tr.productionBonus) };
      });
    }
    function runAiGenerate() {
      var prompt = (el("mioAiPrompt") && el("mioAiPrompt").value || "").trim();
      var st = el("mioAiStatus"), btn = el("mioAiGenBtn");
      if (!prompt) { if (st) { st.style.color = "#d29922"; st.textContent = "Describe the company first."; } return; }
      var sys = "You are a Master-Level Hearts of Iron IV modding AI. Translate the user's request into ONE JSON object " +
        "describing a Military Industrial Organization (a company). Schema (omit fields you can't infer): {\"name\":string, " +
        "\"description\":string, \"companyType\":one of tank_manufacturer|naval_manufacturer|aircraft_manufacturer|materiel_manufacturer|industrial_concern " +
        "(CHOOSE based on whether it makes tanks, ships, planes, infantry weapons, or is industrial), " +
        "\"equipmentCategories\":[mio_cat_* strings], \"researchCategories\":[CAT_* strings], \"initialEquipmentBonus\":{stat:number}, " +
        "\"initialProductionBonus\":{key:number}, \"traits\":[{\"name\":string,\"equipmentBonus\":{stat:number},\"productionBonus\":{key:number}}]}. " +
        "Use real HOI4 stat keys (reliability, soft_attack, defense, breakthrough, armor_value, maximum_speed, build_cost_ic, air_attack, air_agility). " +
        "Output ONLY the JSON object.";
      if (btn) btn.disabled = true; if (st) { st.style.color = "#8fa4b8"; st.textContent = "Generating…"; }
      loadTraits(function () {
        aiCall(prompt, sys).then(function (p) {
          if (p.companyType && typeOf(p.companyType).key === p.companyType) { d.companyType = p.companyType; var t = typeOf(p.companyType); if (!d.eq.length) d.eq = t.eq.slice(); if (!d.tech.length) d.tech = t.research.slice(); if (!d.icon || /generic_(tank|air|naval|infantry|industrial)/.test(d.icon)) d.icon = "GFX_idea_" + t.picture; }
          if (p.name) d.name = String(p.name);
          if (p.description) d.desc = String(p.description);
          if (Array.isArray(p.equipmentCategories) && p.equipmentCategories.length) d.eq = p.equipmentCategories.filter(isTok);
          if (Array.isArray(p.researchCategories) && p.researchCategories.length) d.tech = p.researchCategories.filter(isTok);
          if (p.initialEquipmentBonus) d.initEq = toRows(p.initialEquipmentBonus);
          if (p.initialProductionBonus) d.initProd = toRows(p.initialProductionBonus);
          if (Array.isArray(p.traits)) d.traits = aiTraitsToDraft(p.traits);
          if (st) { st.style.color = "#3fb950"; st.textContent = "✓ Filled the form — review & Save."; }
          render();
        }).catch(function (e) { if (st) { st.style.color = "#f85149"; st.textContent = "✗ " + (e.message || e); } if (btn) btn.disabled = false; });
      });
    }
    // per-box tuned AI (item 10) — fills ONLY that section
    function sectionAi(kind) {
      var meta = {
        eq: { label: "equipment categories", sys: "Return ONLY JSON {\"equipmentCategories\":[mio_cat_* strings]} — the equipment groups this HOI4 company builds.", apply: function (p) { if (Array.isArray(p.equipmentCategories)) d.eq = p.equipmentCategories.filter(isTok); } },
        tech: { label: "research categories", sys: "Return ONLY JSON {\"researchCategories\":[CAT_* strings]} — HOI4 research categories this company boosts.", apply: function (p) { if (Array.isArray(p.researchCategories)) d.tech = p.researchCategories.filter(isTok); } },
        initEq: { label: "base equipment bonus", sys: "Return ONLY JSON {\"equipmentBonus\":{stat:number}} using real HOI4 equipment stats (reliability, soft_attack, defense, breakthrough, armor_value, maximum_speed, build_cost_ic).", apply: function (p) { if (p.equipmentBonus) d.initEq = toRows(p.equipmentBonus); } },
        initProd: { label: "base production bonus", sys: "Return ONLY JSON {\"productionBonus\":{key:number}} using real HOI4 production keys (production_efficiency_gain_factor, production_efficiency_cap, production_resource_need_factor).", apply: function (p) { if (p.productionBonus) d.initProd = toRows(p.productionBonus); } },
        traits: { label: "trait tree", sys: "Return ONLY JSON {\"traits\":[{\"name\":string,\"equipmentBonus\":{stat:number},\"productionBonus\":{key:number}}]} — a small tree of company traits with real HOI4 stat keys.", apply: function (p) { if (Array.isArray(p.traits)) d.traits = aiTraitsToDraft(p.traits); } },
      }[kind];
      if (!meta) return;
      window.showCustomPrompt("Ask the AI to write the " + meta.label, "e.g. focus on reliable, cheap-to-produce armour").then(function (txt) {
        if (!txt || !txt.trim()) return;
        var btn = host.querySelector('.mio-sec-ai[data-kind="' + kind + '"]'); if (btn) { btn.textContent = "⌛…"; btn.disabled = true; }
        loadTraits(function () {
          aiCall(txt, meta.sys).then(function (p) { meta.apply(p); render(); }).catch(function (e) { nb("AI failed: " + (e.message || e)); if (btn) { btn.textContent = "✨ AI"; btn.disabled = false; } });
        });
      });
    }

    // ── click-to-EDIT: load a company's full data into the form ─────────────────────────────────────────────────
    function loadCompany(id) {
      // Replaces the whole form, so it is a discard — ask the host first, exactly as clicking another
      // spirit does. On discard the host's watcher is already clean, so this never asks twice.
      confirmReplace("Switch company", function () { loadCompanyNow(id); });
    }
    function loadCompanyNow(id) {
      fetch("/api/mio/detail?id=" + encodeURIComponent(id) + "&modPath=" + encodeURIComponent(getModPath())).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) { nb((j && j.error) || "Couldn't load that company."); return; }
        d = { companyType: inferType(j.equipmentType, j.id + " " + (j.name || "")), id: j.id, loadedId: j.id, name: j.name || j.id, desc: j.desc || "", allowedTag: j.allowedTag || "", icon: j.icon || "", file: j.file || "nova_mio.txt",
          eq: (j.equipmentType || []).slice(), tech: (j.researchCategories || []).slice(), eqPending: "", techPending: "", include: (j.include || []).slice(),
          initEq: rowsFromObj(j.initial && j.initial.equipmentBonus), initProd: rowsFromObj(j.initial && j.initial.productionBonus),
          // parents: this editor has no UI for trait prerequisites, so it must CARRY them, not drop them —
          // loading and saving an organization used to delete every any_parent line. #mio-any-parent-dropped
          traits: (j.traits || []).map(function (t, i) { return { token: t.token, name: t.name || t.token, x: t.x || 0, y: (t.y != null ? t.y : i), relativeTo: t.relativeTo || "", icon: t.icon || "", parents: (t.parents || []).slice(),
            eq: rowsFromObj(t.equipmentBonus).length ? rowsFromObj(t.equipmentBonus) : [{ k: "", v: "" }], prod: rowsFromObj(t.productionBonus) }; }),
          // What the game loads for this company through `include`, for DISPLAY only — collect() never reads
          // it, so a save cannot copy an inherited trait into the mod's own block.
          // #mio-include-shown-as-empty
          inherited: j.inherited || null };
        _pvIcon = "\u0000"; render(); renderList();
        // The form now holds this company exactly as it is on disk: that is the new baseline.
        onFormReplaced();
        settleForm();
        settleForm();
        var s = el("mioStatus"); if (s) { s.style.color = "#58a6ff"; s.textContent = "✎ Editing “" + j.id + "” (from " + j.file + ") — change anything and Save."; }
      }).catch(function (e) { nb("Load failed: " + (e.message || e)); });
    }

    // ── render ──────────────────────────────────────────────────────────────────────────────────────────────────
    // ⛔ #mio-include-shown-as-empty — SHOW WHAT THE GAME WILL SHOW, not only what the mod owns.
    //
    // `include = <template>` inherits the template's whole trait tree, and this editor parsed only the
    // organization's own block — so 2,116 companies across the install and every installed mod (483 of them
    // vanilla) opened with an EMPTY trait tree while the game draws a full one. 32,104 traits were invisible.
    // Vanilla's SLO_zbrojnica_roth_organization includes a template with 14 traits and showed none of them.
    //
    // ⚠️ READ-ONLY, AND OUT OF THE DRAFT ON PURPOSE. The save rebuilds the organization from `d.traits`, so
    // an inherited trait that found its way in there would be written into the mod's own block — turning
    // inheritance into 32,104 copied traits on the next save. `d.inherited` is never read by collect().
    function inheritedTraitCount() { return (d && d.inherited && d.inherited.traits) ? d.inherited.traits.length : 0; }
    function inheritedBlock() {
      var inh = (d && d.inherited) || null;
      if (!inh) return "";
      var n = (inh.traits || []).length, eqN = (inh.equipmentType || []).length, rcN = (inh.researchCategories || []).length;
      if (!n && !eqN && !rcN) return "";
      var from = (inh.from || []).join(", ");
      var bonusText = function (o) {
        var ks = Object.keys(o || {});
        if (!ks.length) return "";
        return ks.slice(0, 3).map(function (k) { return esc(k) + " " + (o[k] > 0 ? "+" : "") + o[k]; }).join(", ") + (ks.length > 3 ? " …" : "");
      };
      var rows = (inh.traits || []).map(function (t) {
        var b = [bonusText(t.equipmentBonus), bonusText(t.productionBonus)].filter(Boolean).join(" · ");
        return '<div class="mio-inh-row">' + (t.isInitial ? '<span class="mio-inh-tag">base</span> ' : "")
          + '<b>' + esc(t.name || t.token) + '</b>' + (b ? ' <span class="mio-inh-b">' + b + '</span>' : "") + '</div>';
      }).join("");
      return '<div class="mio-block mio-inh">'
        + '<div class="mio-sub-h">Inherited from ' + esc(from || "its template") + ' — shown because the game loads it, not editable here</div>'
        + (eqN ? '<div class="mio-hint">Equipment it can design: ' + esc((inh.equipmentType || []).join(", ")) + '</div>' : "")
        + (rcN ? '<div class="mio-hint">Research categories: ' + esc((inh.researchCategories || []).join(", ")) + '</div>' : "")
        + (n ? '<div class="mio-hint" style="margin-top:4px;">' + n + ' inherited trait' + (n === 1 ? "" : "s") + ':</div>' + rows : "")
        + '<div class="mio-hint" style="margin-top:6px;">To change one, declare a trait with the same token in this company — that overrides the template’s.</div>'
        + '</div>';
    }
    function secAi(kind) { return '<button type="button" class="ai-field-assist-btn mio-sec-ai" data-kind="' + kind + '" style="' + AI_BTN_STYLE + '">✨ AI</button>'; }
    function render() {
      if (!d) d = freshDraft();
      var chip = function (val, kind, i) { return '<span class="mio-chip">' + esc(val) + '<button type="button" class="mio-chip-x" data-kind="' + kind + '" data-i="' + i + '" title="Remove">×</button></span>'; };
      var bonusRow = function (row, path2, i) {
        return '<div class="mio-stat-row" data-path="' + path2 + '" data-i="' + i + '">' +
          '<input class="mio-bk" placeholder="stat" value="' + esc(row.k) + '">' +
          '<input class="mio-bv" type="number" step="any" placeholder="0" value="' + esc(String(row.v)) + '">' +
          '<button type="button" class="mio-brow-x" data-path="' + path2 + '" data-i="' + i + '" title="Remove">×</button></div>';
      };
      var traitBlock = function (tr, ti) {
        var thumb = '<img src="' + esc(iconUrl(tr.icon || TRAIT_ICON_FALLBACK)) + '" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:4px;background:rgba(0,0,0,0.2);" data-hide-on-error="visibility">';
        return '<div class="mio-trait" data-ti="' + ti + '">' +
          '<div class="mio-trait-head"><b>' + thumb + 'Trait ' + (ti + 1) + '</b><button type="button" class="mio-trait-x" data-ti="' + ti + '" title="Remove trait">× remove</button></div>' +
          '<div class="mio-row2"><label class="mio-lbl">Token (ID) <span class="mio-hint">node identity</span><input class="mio-t-token" data-ti="' + ti + '" placeholder="reliable_tracks" value="' + esc(tr.token) + '"></label>' +
          '<label class="mio-lbl">Name<input class="mio-t-name" data-ti="' + ti + '" placeholder="Reliable tracks" value="' + esc(tr.name) + '"></label></div>' +
          '<div class="mio-sub-h">Equipment bonus <button type="button" class="mio-add mio-statpick" data-path="traitEq' + ti + '">📋 Pick</button> <button type="button" class="mio-add-tbonus mio-add" data-ti="' + ti + '" data-b="eq">＋ stat</button></div>' +
          '<div class="mio-tbonus-rows">' + ((tr.eq || []).map(function (r, i) { return bonusRow(r, "traitEq" + ti, i); }).join("") || '<div class="mio-hint">no bonus yet</div>') + '</div>' +
          '<div class="mio-sub-h" style="margin-top:6px;">Production bonus <button type="button" class="mio-add mio-statpick" data-path="traitProd' + ti + '">📋 Pick</button> <button type="button" class="mio-add-tbonus mio-add" data-ti="' + ti + '" data-b="prod">＋ stat</button></div>' +
          '<div class="mio-tbonus-rows">' + ((tr.prod || []).map(function (r, i) { return bonusRow(r, "traitProd" + ti, i); }).join("") || '<div class="mio-hint">no bonus yet</div>') + '</div></div>';
      };
      host.innerHTML =
        '<div class="ai-generator-panel">' +
          '<h3>✨ <span>AI Company Generator</span> <span id="mioAiHelp" style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:50%; background:#482f6e; color:#d1b4ff; font-size:11px; cursor:pointer; font-weight:bold;" title="How does this work?">?</span></h3>' +
          '<p style="font-size:13px; color:#a18bbb; margin:0 0 12px 0;">Describe the company in plain English — the AI picks the type (tank / ship / plane / …), fills the bonuses, and pulls in real traits from this mod.</p>' +
          '<textarea id="mioAiPrompt" placeholder="e.g. A Soviet aircraft manufacturer specialised in fighters, +12% air research, with a better-agility trait" style="width:100%; box-sizing:border-box; padding:8px; background:#0b0711; border:1px solid #482f6e; color:#e2d1fa; border-radius:4px; min-height:60px; margin-bottom:8px;"></textarea>' +
          '<button class="btn" id="mioAiGenBtn" type="button" style="background:#5d3b8e; border-color:#8c60ce;">Generate Company</button>' +
          '<span id="mioAiStatus" style="font-size:12px; color:#8fa4b8; margin-left:12px;"></span>' +
        '</div>' +
        '<div class="mio-form">' +
          '<div class="mio-row2">' +
            '<label class="mio-lbl">Company type<select id="mioType">' + COMPANY_TYPES.map(function (ct) { return '<option value="' + ct.key + '"' + (ct.key === d.companyType ? " selected" : "") + '>' + esc(ct.label) + '</option>'; }).join("") + '</select></label>' +
            '<label class="mio-lbl">Available to <span class="mio-hint">country — blank = all</span><select id="mioAllowed"></select></label>' +
          '</div>' +
          '<div class="mio-row2">' +
            '<label class="mio-lbl">Company id <span class="mio-hint">no spaces</span><input id="mioId" placeholder="nova_tank_works" value="' + esc(d.id) + '" autocomplete="off"></label>' +
            '<label class="mio-lbl">Display name<input id="mioName" placeholder="Nova Tank Works" value="' + esc(d.name) + '" autocomplete="off"></label>' +
          '</div>' +
          '<label class="mio-lbl">Target file <span class="mio-hint">which .txt to write into — reuse a file to add to it, or type a new name</span>' +
            '<div class="mio-addline"><input id="mioFile" placeholder="nova_mio.txt" value="' + esc(d.file) + '" autocomplete="off"><button type="button" id="mioFileDrop" class="mio-add" title="Pick an existing file">▾</button></div></label>' +
          '<label class="mio-lbl"><span class="mio-cap" id="mioDescCap">Description</span><textarea id="mioDesc" placeholder="A short description of the company (in-game tooltip flavour).">' + esc(d.desc) + '</textarea></label>' +
          '<div class="mio-lbl">Company icon' +
            '<div class="picture-upload-group" style="display:flex; gap:12px; align-items:stretch;">' +
              '<div id="mioPicPreview" style="width:76px; height:76px; flex:0 0 auto; display:flex; align-items:center; justify-content:center; background:#0d1117; border:1px solid #30363d; border-radius:8px; color:#6e7681; font-size:11px; overflow:hidden;">Icon</div>' +
              '<div style="display:flex; flex-direction:column; gap:8px; flex:1;">' +
                '<input id="mioIcon" placeholder="GFX_idea_generic_tank_manufacturer_1" value="' + esc(d.icon) + '" autocomplete="off">' +
                '<input type="file" id="mioPicUpload" accept="image/png,image/jpeg" style="display:none;">' +
                '<div style="display:flex; gap:8px;">' +
                  '<button type="button" class="mio-add" id="mioPicUploadBtn" style="flex:1;">⬆ Upload icon</button>' +
                  '<button type="button" class="mio-add" id="mioPicBrowseBtn" style="flex:1;">🔍 Browse icons</button>' +
                '</div>' +
                '<span id="mioPicStatus" style="font-size:11px; color:#8b949e;">Upload a PNG (auto-converts to DDS) or browse the mod\'s icons.</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          ((d.include && d.include.length) ? '<div class="mio-block" style="border-color:#3a5f3a; background:#0f1a0f;"><div class="mio-sub-h" style="color:#8fd08f;">⤷ Inherits a shared template</div><div class="mio-hint">This company inherits its equipment &amp; trait tree from <b>' + esc(d.include.join(", ")) + '</b> (defined elsewhere in the mod). That inheritance is kept as-is when you Save; add extra categories/traits below to layer on top.</div></div>' : '') +
          '<div class="mio-block"><div class="mio-sub-h">Works on — equipment <span class="mio-hint">≥1 equipment or research</span> ' + secAi("eq") + ' <button type="button" id="mioEqBrowse" class="mio-add">📋 Pick</button></div>' +
            '<div class="mio-addline"><input id="mioEqAdd" placeholder="type a category, Enter to add" value="' + esc(d.eqPending) + '" autocomplete="off"><button type="button" id="mioEqAddBtn" class="mio-add">＋ add</button></div>' +
            '<div class="mio-chips">' + (d.eq.map(function (v, i) { return chip(v, "eq", i); }).join("") || '<span class="mio-hint">none</span>') + '</div></div>' +
          '<div class="mio-block"><div class="mio-sub-h">Works on — research ' + secAi("tech") + ' <button type="button" id="mioTechBrowse" class="mio-add">📋 Pick</button></div>' +
            '<div class="mio-addline"><input id="mioTechAdd" placeholder="type a category, Enter to add" value="' + esc(d.techPending) + '" autocomplete="off"><button type="button" id="mioTechAddBtn" class="mio-add">＋ add</button></div>' +
            '<div class="mio-chips">' + (d.tech.map(function (v, i) { return chip(v, "tech", i); }).join("") || '<span class="mio-hint">none</span>') + '</div></div>' +
          '<div class="mio-block"><div class="mio-sub-h">Base bonus (initial trait) — equipment ' + secAi("initEq") + ' <button type="button" class="mio-add mio-statpick" data-path="initEq">📋 Pick</button> <button type="button" id="mioInitEqAdd" class="mio-add">＋ stat</button></div>' +
            '<div id="mioInitEqRows">' + (d.initEq.map(function (r, i) { return bonusRow(r, "initEq", i); }).join("") || '<div class="mio-hint">no bonus yet</div>') + '</div>' +
            '<div class="mio-sub-h" style="margin-top:6px;">Base bonus — production ' + secAi("initProd") + ' <button type="button" class="mio-add mio-statpick" data-path="initProd">📋 Pick</button> <button type="button" id="mioInitProdAdd" class="mio-add">＋ stat</button></div>' +
            '<div id="mioInitProdRows">' + (d.initProd.map(function (r, i) { return bonusRow(r, "initProd", i); }).join("") || '<div class="mio-hint">no bonus yet</div>') + '</div></div>' +
          '<div class="mio-block"><div class="mio-sub-h">Trait tree ' + secAi("traits") + ' <button type="button" id="mioTraitPick" class="mio-add">📋 Add from mod</button> <button type="button" id="mioAddTrait" class="mio-add">＋ blank trait</button></div>' +
            '<div id="mioTraits">' + (d.traits.map(function (tr, i) { return traitBlock(tr, i); }).join("") || '<div class="mio-hint">' + (inheritedTraitCount() ? 'No traits of its own — the ' + inheritedTraitCount() + ' below come from the template it includes.' : 'No traits — the base bonus alone is a valid company. Add traits for a research-able tree.') + '</div>') + '</div>' +
            inheritedBlock() + '</div>' +
          '<div class="mio-actions"><button type="button" id="mioSaveBtn" class="mio-save">💾 Save company</button><span id="mioStatus" class="mio-status"></span></div>' +
        '</div>';
      wire();
      attachAi();
      syncPreview();
    }

    // Description gets the shared ✨ AI, mounted INLINE-RIGHT of the "Description" caption (item 9). Name excluded by
    // rule; the picture is excluded; the structured sections use their own ✨ (sectionAi). #companies-ai
    function attachAi() {
      if (!window.novaAttachFieldAssist) return;
      var desc = el("mioDesc"), cap = el("mioDescCap");
      if (desc && cap) window.novaAttachFieldAssist(desc, { type: "description", labelText: "Description", mount: cap });
    }

    function wire() {
      if (el("mioAiGenBtn")) el("mioAiGenBtn").addEventListener("click", runAiGenerate);
      if (el("mioAiHelp")) el("mioAiHelp").addEventListener("click", function () { if (window.showNovaAiHelpModal) window.showNovaAiHelpModal(); });
      var allowedSel = el("mioAllowed");
      // Kept, not discarded: this is the late write the host has to wait for before re-baselining.
      if (allowedSel && window.NovaCountryPicker) pendingFill = window.NovaCountryPicker.populate(allowedSel, { modPath: getModPath(), all: true }).then(function () { allowedSel.insertAdjacentHTML("afterbegin", '<option value="">🌍 All countries</option>'); allowedSel.value = d.allowedTag || ""; });
      var typeSel = el("mioType");
      if (typeSel) typeSel.addEventListener("change", function () {
        var prev = typeOf(d.companyType), next = typeOf(typeSel.value); d.companyType = next.key;
        var same = function (a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); };
        if (same(d.eq, prev.eq)) d.eq = next.eq.slice();
        if (same(d.tech, prev.research)) d.tech = next.research.slice();
        if (d.icon === "GFX_idea_" + prev.picture || !d.icon) d.icon = "GFX_idea_" + next.picture;
        render();
      });
      var bind = function (id, key, prev) { var e = el(id); if (e) e.addEventListener("input", function () { d[key] = e.value; if (prev) syncPreview(); }); };
      bind("mioId", "id", true); bind("mioName", "name", true); bind("mioDesc", "desc", true); bind("mioFile", "file", false);
      var iconIn = el("mioIcon"); if (iconIn) iconIn.addEventListener("input", function () { d.icon = iconIn.value; });
      if (iconIn) iconIn.addEventListener("change", function () { d.icon = iconIn.value; refreshIcon(); });
      if (allowedSel) allowedSel.addEventListener("change", function () { d.allowedTag = allowedSel.value; });
      // picture
      if (el("mioPicUploadBtn")) el("mioPicUploadBtn").addEventListener("click", function () { el("mioPicUpload").click(); });
      if (el("mioPicUpload")) el("mioPicUpload").addEventListener("change", function (e) { if (e.target.files && e.target.files[0]) doUpload(e.target.files[0]); });
      if (el("mioPicBrowseBtn")) el("mioPicBrowseBtn").addEventListener("click", openIconGridPicker);
      // file dropdown
      if (el("mioFileDrop")) el("mioFileDrop").addEventListener("click", openFilePicker);
      // category pickers + per-box AI
      if (el("mioEqBrowse")) el("mioEqBrowse").addEventListener("click", function () { openCatPicker("eq"); });
      if (el("mioTechBrowse")) el("mioTechBrowse").addEventListener("click", function () { openCatPicker("tech"); });
      if (el("mioTraitPick")) el("mioTraitPick").addEventListener("click", openTraitPicker);
      host.querySelectorAll(".mio-sec-ai").forEach(function (b) { b.addEventListener("click", function () { sectionAi(b.dataset.kind); }); });
      host.querySelectorAll(".mio-statpick").forEach(function (b) { b.addEventListener("click", function () { openStatPicker(b.dataset.path); }); });
      // bonus-row inputs → draft (path: initEq | initProd | traitEq<ti> | traitProd<ti>) — bonusArr is instance-scope
      host.querySelectorAll(".mio-stat-row").forEach(function (row) {
        var arr = bonusArr(row.dataset.path), i = Number(row.dataset.i); if (!arr || !arr[i]) return;
        var bk = row.querySelector(".mio-bk"), bv = row.querySelector(".mio-bv");
        if (bk) bk.addEventListener("input", function () { arr[i].k = bk.value; });
        if (bv) bv.addEventListener("input", function () { arr[i].v = bv.value; syncPreview(); });
      });
      host.querySelectorAll(".mio-trait").forEach(function (tb) {
        var ti = Number(tb.dataset.ti), tr = d.traits[ti]; if (!tr) return;
        var g = function (cls) { return tb.querySelector(cls); };
        if (g(".mio-t-token")) g(".mio-t-token").addEventListener("input", function (e) { tr.token = e.target.value; });
        if (g(".mio-t-name")) g(".mio-t-name").addEventListener("input", function (e) { tr.name = e.target.value; syncPreview(); });
      });
      // chip add (button + Enter, item 11)
      var addChip = function (inputId, arr, pendKey) { var v = (el(inputId).value || "").trim(); if (v) { if (arr.indexOf(v) < 0) arr.push(v); d[pendKey] = ""; render(); } };
      var wireAdd = function (inputId, btnId, arr, pendKey) {
        if (el(btnId)) el(btnId).addEventListener("click", function () { addChip(inputId, arr, pendKey); });
        if (el(inputId)) el(inputId).addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addChip(inputId, arr, pendKey); } });
      };
      wireAdd("mioEqAdd", "mioEqAddBtn", d.eq, "eqPending");
      wireAdd("mioTechAdd", "mioTechAddBtn", d.tech, "techPending");
      host.querySelectorAll(".mio-chip-x").forEach(function (x) { x.addEventListener("click", function () { (x.dataset.kind === "eq" ? d.eq : d.tech).splice(Number(x.dataset.i), 1); render(); }); });
      if (el("mioFile")) el("mioFile").addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
      el("mioInitEqAdd").addEventListener("click", function () { d.initEq.push({ k: "", v: "" }); render(); });
      el("mioInitProdAdd").addEventListener("click", function () { d.initProd.push({ k: "", v: "" }); render(); });
      el("mioAddTrait").addEventListener("click", function () { d.traits.push(blankTrait()); render(); });
      host.querySelectorAll(".mio-trait-x").forEach(function (x) { x.addEventListener("click", function () { d.traits.splice(Number(x.dataset.ti), 1); render(); }); });
      host.querySelectorAll(".mio-add-tbonus").forEach(function (b) { b.addEventListener("click", function () { var tr = d.traits[Number(b.dataset.ti)]; if (tr) { var a = b.dataset.b === "prod" ? (tr.prod = tr.prod || []) : (tr.eq = tr.eq || []); a.push({ k: "", v: "" }); render(); } }); });
      host.querySelectorAll(".mio-brow-x").forEach(function (x) { x.addEventListener("click", function () { var arr = bonusArr(x.dataset.path); if (arr) { arr.splice(Number(x.dataset.i), 1); render(); } }); });
      el("mioSaveBtn").addEventListener("click", save);
    }

    // ── live in-game preview (item 12) ──────────────────────────────────────────────────────────────────────────
    function syncPreview() {
      var card = document.querySelector(".hoi4-spirit-preview"); if (card) card.classList.add("is-company");
      // #mio-loc-codes-stripped-on-load — strip §colour codes / [scope] tokens / £icons HERE, in the preview
      // only. /api/mio/detail used to strip them on LOAD, which fed the stripped text back into the form and
      // destroyed the author's real text on the next save. The form now holds the file's exact bytes and this
      // is the one place that sanitises, so the preview still reads like the game.
      var disp = function (v) { return String(v == null ? "" : v).replace(/§[A-Za-z0-9!]/g, "").replace(/\[[^\]]*\]/g, "").replace(/£\S+/g, "").replace(/\s+/g, " ").trim(); };
      var nm = disp(d.name) || (d.id ? titleize(d.id) : "New Company");
      var set = function (id, txt) { var e = el(id); if (e) e.textContent = txt; };
      set("previewIdeaName", nm); set("tooltipIdeaName", nm);
      set("tooltipIdeaCat", CAT_LABEL[d.companyType] || "Company");
      set("tooltipIdeaDesc", disp(d.desc) || "No description.");
      var costEl = el("tooltipIdeaCost"); if (costEl) costEl.style.display = "none";
      var line = function (label, val, cls) { return '<div class="hoi4-modifier-line"><span>' + esc(label) + ':</span> <span class="' + cls + '">' + esc(val) + '</span></div>'; };
      var html = "";
      (d.tech || []).forEach(function (c) { html += line(titleize(c.replace(/^CAT_/, "")) + " Research", "boosted", "hoi4-mod-val-pos"); });
      (d.initEq || []).forEach(function (r) { if (r.k && r.v !== "") html += line(titleize(r.k), (Number(r.v) > 0 ? "+" : "") + r.v, Number(r.v) >= 0 ? "hoi4-mod-val-pos" : "hoi4-mod-val-neg"); });
      (d.initProd || []).forEach(function (r) { if (r.k && r.v !== "") html += line(titleize(r.k), (Number(r.v) > 0 ? "+" : "") + r.v, Number(r.v) >= 0 ? "hoi4-mod-val-pos" : "hoi4-mod-val-neg"); });
      (d.traits || []).filter(function (t) { return t.token || t.name; }).forEach(function (t) { html += line("Company trait", disp(t.name) || t.token, "hoi4-mod-val-neut"); });
      var mEl = el("tooltipIdeaModifiers"); if (mEl) mEl.innerHTML = html || '<div style="color: #6e7681;">No research bonus yet — add one below</div>';
      if (d.icon !== _pvIcon) refreshIcon();
    }

    function save() {
      var st = el("mioStatus"), btn = el("mioSaveBtn");
      var warn = function (m) { if (st) { st.style.color = "#d29922"; st.textContent = m; } };
      var rowsToObj = function (arr) { var o = {}; (arr || []).forEach(function (r) { var k = (r.k || "").trim(); if (isTok(k) && r.v !== "" && !isNaN(Number(r.v))) o[k] = Number(r.v); }); return o; };
      if (!isTok(d.id)) return warn("Company id must start with a letter/underscore, no spaces.");
      if (!d.eq.length && !d.tech.length && !(d.include && d.include.length)) return warn("Add at least one equipment or research category it works on.");
      // Fill in a token for any trait the user named but never gave an id, and show what we chose — see
      // #mio-blank-trait-silently-dropped. render() rebuilds the form, so re-acquire the status/button nodes
      // (`warn` closes over the variable, not the node, so it picks the fresh one up).
      var derived = 0;
      (d.traits || []).forEach(function (tr) {
        if ((tr.token || "").trim() || !(tr.name || "").trim()) return;
        var t = tokenFromName(tr.name, d.id);
        if (t) { tr.token = t; derived++; }
      });
      if (derived) { render(); st = el("mioStatus"); btn = el("mioSaveBtn"); }
      // Anything still tokenless that carries the user's work must stop the save, not vanish from it. An
      // untouched "＋ blank trait" carries nothing and is still dropped silently, which is what it's for.
      for (var t0 = 0; t0 < (d.traits || []).length; t0++) {
        var tr0 = d.traits[t0];
        if ((tr0.token || "").trim()) continue;
        var filled = [].concat(tr0.eq || [], tr0.prod || []).some(function (r) { return (r.k || "").trim() || String(r.v == null ? "" : r.v).trim(); });
        if ((tr0.name || "").trim() || (tr0.icon || "").trim() || (tr0.parents || []).length || filled)
          return warn("Trait " + (t0 + 1) + ' needs a Token (ID) — give it a name, or type an id like "reliable_tracks".');
      }
      var seen = {};
      for (var i = 0; i < (d.traits || []).length; i++) { var tk = (d.traits[i].token || "").trim(); if (!tk) continue; if (seen[tk]) return warn('Trait token "' + tk + '" is used twice — each trait needs a unique Token (ID).'); seen[tk] = 1; }
      var body = {
        modPath: getModPath(), id: d.id.trim(), name: d.name.trim() || d.id.trim(), desc: (d.desc || "").trim(),
        allowedTag: (d.allowedTag || "").trim(), icon: (d.icon || "").trim(), fileName: (d.file || "nova_mio.txt").trim() || "nova_mio.txt",
        equipmentType: d.eq.slice(), researchCategories: d.tech.slice(), include: (d.include || []).slice(),
        initial: { equipmentBonus: rowsToObj(d.initEq), productionBonus: rowsToObj(d.initProd) },
        traits: (d.traits || []).map(function (tr) { return { token: (tr.token || "").trim(), name: (tr.name || "").trim(), x: Number(tr.x) || 0, y: Number(tr.y) || 0, relativeTo: (tr.relativeTo || "").trim(), icon: (tr.icon || "").trim(), parents: (tr.parents || []).slice(), equipmentBonus: rowsToObj(tr.eq), productionBonus: rowsToObj(tr.prod) }; }).filter(function (tr) { return tr.token; }),
        writeIdeaFallback: writeIdeaFallback, companyType: d.companyType,
        // #mio-rename-clones — tells the server which organization this draft REPLACES, so a changed id
        // renames instead of appending a second copy. Empty for a brand-new company.
        previousId: (d.loadedId || "").trim(),
      };
      if (btn) btn.disabled = true; if (st) { st.style.color = "#8b949e"; st.textContent = "Saving…"; }
      fetch("/api/mio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(function (r) {
        if (r && r.ok) {
          var fb = r.ideaFallback && r.ideaFallback.ok ? " + no-AAT idea fallback" : "";
          // #mio-rename-clones — re-anchor to what was just written. Without this a SECOND rename in the same
          // session would still name the ORIGINAL id as its previous, so the first rename's block would be
          // removed again (a no-op) and the intermediate one left behind — the same defect the Characters
          // maker has, found separately by this hunt.
          d.loadedId = r.id;
          var rn = r.renamedFrom ? " (renamed from “" + r.renamedFrom + "”)" : "";
          if (st) { st.style.color = "#3fb950"; st.textContent = "✓ Saved “" + r.id + "” → " + r.file + fb + rn + "."; }
          filesCache = null; renderList(); onSaved(r.id);
        } else if (st) { st.style.color = "#f85149"; st.textContent = (r && r.error) || "Save failed."; }
        if (btn) btn.disabled = false;
      }).catch(function (e) { if (st) { st.style.color = "#f85149"; st.textContent = "Save failed: " + (e.message || e); } if (btn) btn.disabled = false; });
    }

    // ── sidebar list — canonical folders/rows (like Spirits/Events), click-to-EDIT (items 5,14) ─────────────────
    var FOLDER_SVG = '<svg class="folder-icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
    var CHEV_SVG = '<svg class="folder-chevron-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    function renderList() {
      if (!listHost) return;
      fetch("/api/mio?modPath=" + encodeURIComponent(getModPath())).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) { listHost.innerHTML = '<div class="mio-hint" style="padding:8px;">Couldn\'t load companies. <button type="button" id="mioListRetry" class="mio-add">↻ Retry</button></div>'; var rb = el("mioListRetry"); if (rb) rb.addEventListener("click", renderList); return; }
        var mios = j.mios || [];
        if (!mios.length) { listHost.innerHTML = '<div class="mio-hint" style="padding:8px;">No companies yet — fill the form and 💾 Save.</div>'; return; }
        var byFile = {}; mios.forEach(function (m) { var f = m.file || "(unknown)"; (byFile[f] = byFile[f] || []).push(m); });
        var fileNames = Object.keys(byFile).sort();
        if (!openFolders) { openFolders = {}; fileNames.forEach(function (f) { openFolders[f] = true; }); } // default all open
        listHost.innerHTML = fileNames.map(function (f) {
          var open = openFolders[f] !== false;
          var rows = byFile[f].sort(function (a, b) { return a.id.localeCompare(b.id); }).map(function (m) {
            return '<div class="decision-item' + (m.id === (d && d.id) ? " active" : "") + '" data-id="' + esc(m.id) + '" title="' + esc(m.id) + ' — click to edit">' + esc(m.id) + '</div>';
          }).join("");
          return '<div class="category-container"><div class="category-title' + (open ? " expanded" : "") + '" data-f="' + esc(f) + '">' + CHEV_SVG + FOLDER_SVG +
            '<span class="folder-name-text">' + esc(f) + '</span><span class="folder-count-badge">' + byFile[f].length + '</span></div>' +
            '<div class="category-items" style="display:' + (open ? "block" : "none") + ';">' + rows + '</div></div>';
        }).join("");
        listHost.querySelectorAll(".category-title").forEach(function (t) { t.addEventListener("click", function () {
          var f = t.dataset.f; openFolders[f] = !(openFolders[f] !== false);
          t.classList.toggle("expanded", openFolders[f]); var items = t.nextElementSibling; if (items) items.style.display = openFolders[f] ? "block" : "none";
        }); });
        listHost.querySelectorAll(".decision-item").forEach(function (row) { row.addEventListener("click", function () {
          listHost.querySelectorAll(".decision-item.active").forEach(function (x) { x.classList.remove("active"); });
          row.classList.add("active"); loadCompany(row.dataset.id);
        }); });
      }).catch(function () { if (listHost) listHost.innerHTML = '<div class="mio-hint" style="padding:8px;">Couldn\'t load companies.</div>'; });
    }

    this.mount = function () { d = freshDraft(); _pvIcon = "\u0000"; loadCatalog(); loadTraits(function () {}); render(); renderList(); };
    // The untouched blank is the baseline — without onFormReplaced the fresh draft reads dirty the
    // instant it is made, and the next click asks about the empty form the user just asked for.
    // (The host's "+ Create New" guards before calling this; confirmReplace here covers any other caller
    // and costs nothing when the watcher is already clean.)
    this.newCompany = function () {
      confirmReplace("Start a new one", function () {
        d = freshDraft(); _pvIcon = "\u0000"; render(); renderList();
        onFormReplaced();
        if (el("mioId")) el("mioId").focus();
      });
    };
    this.refreshList = renderList;
  }

  window.NovaMioEditor = { create: function (opts) { return new NovaMioEditor(opts); } };
})();
