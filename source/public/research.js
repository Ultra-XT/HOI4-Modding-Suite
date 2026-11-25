// MUST MATCH server.js NOVA_DEFAULT_EQUIPMENT_FILE. HOI4 merges common/units/equipment across mod + game and
// reads the result ALPHABETICALLY, so a file named custom_equipment.txt is read BEFORE vanilla's infantry.txt
// — which makes `archetype = infantry_equipment` a forward reference. The game answers "Malformed token:
// infantry_equipment" and DROPS the equipment, so the weapon the modder just made does not exist in game.
//
// The server default was moved to zz_nova_equipment.txt for exactly this reason and the measurement is in the
// comment above it (5 of 5, no false positives). But this file hardcoded the old name in SIX places and always
// sent it explicitly, so the server default was never reached from the Research maker — the fix was there and
// this caller never adopted it. #equipment-file-sorts-before-archetype
const NOVA_DEFAULT_EQUIPMENT_FILE = "zz_nova_equipment.txt";

document.addEventListener("DOMContentLoaded", () => {
  // Exact inverse of the server's escapeLocalizationValue (loc stores a line break as the two-char "\n",
  // a quote as \" and a backslash as \\). Loading the RAW loc form into the editor and re-saving would
  // re-escape the backslashes (\n -> \\n -> ...), corrupting the text a little more on EVERY save — the
  // live-e2e class found in the Event Maker; every maker that loads loc-backed text applies this on load.
  function unescapeLocForEdit(value) {
    const s = String(value || "");
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c !== "\\" || i === s.length - 1) { out += c; continue; }
      const n = s[i + 1];
      if (n === "\\") { out += "\\"; i++; }
      else if (n === "n") { out += "\n"; i++; }
      else if (n === "r") { out += "\r"; i++; }
      else if (n === "t") { out += "\t"; i++; }
      else if (n === '"') { out += '"'; i++; }
      else out += c;
    }
    return out;
  }

  // Image fallback (CSP-safe): inline image error handlers are blocked by the page CSP (script-src 'self'),
  // so a tech-icon thumbnail/preview whose image is missing would just show the browser's broken-image glyph.
  // Images are marked with data-fallback="…" (swap to it) or data-hide-on-error (hide), handled here via one
  // capture-phase error listener (the error event doesn't bubble, so capture is required; guarded vs loops).
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (!t || t.tagName !== "IMG") return;
    if (t.dataset.fallback && t.src.indexOf(t.dataset.fallback) < 0) { t.src = t.dataset.fallback; return; }
    if (t.dataset.hideOnError) t.style.display = "none";
  }, true);

  let allTechs = [];
  let baseModTechs = []; // declared-dependency (e.g. Millennium Dawn) techs — valid prerequisite targets (#110)
  let allEquips = {};
  let selectedTechId = null;
  let activeTab = "infantry_tab";
  // Per-folder themed background art (server room, industrial scene…) is parsed and ready, but OFF
  // for now — the user wants to opt into it later. Flip to true (or wire a toolbar toggle) to show it.
  // ON by default (#bg-accurate): the folder's real art (GFX_<folder>_techtree_bg) is part of what the
  // game shows, so the faithful 1:1 view has to include it — an editor that opens on a bare dark canvas
  // is showing you something HOI4 never draws. Toggled per mod by the 🖼 Background button.
  let SHOW_RESEARCH_BG = true;
  // Toggled by the 👁 Hidden techs button (per mod). When ON, techs the editor would otherwise hide —
  // a tech flagged "Hidden" (allow = always no) or one gated out by the DLC filter — are drawn anyway,
  // dimmed + dashed, so you can find and edit them. Off by default; never changes what saves to disk.
  let SHOW_HIDDEN_TECHS = false;
  // Toggled by the 🏛 Base game button (per mod). ON by default, because that is the truth: a HOI4 mod is
  // an OVERLAY — the base game's technologies are loaded underneath yours whether or not the editor draws
  // them. Turning it OFF is a display convenience for working on a crowded tab; it never changes allTechs
  // or what saves to disk. #overlay-blindness
  let SHOW_BASE_TECHS = true;
  // Names the mod's copy of countrytechtreeview.gui is missing versus the installed base file. #stale-gui-copy
  let staleGuiElements = [];
  let staleGuiCount = 0;
  // The root whose countrytechtreeview.gui this mod's copy actually REPLACES — its base mod's for an add-on,
  // the game's otherwise. The chip used to say "the installed game" whichever it was. #stale-gui-copy
  let staleGuiBase = "";
  // …and its display NAME. A workshop base mod's folder is its Steam id, so naming it by path leaf
  // produced "its base mod (2647689257)". The server sends descriptor.mod's name= alongside the path.
  let staleGuiBaseName = "";
  let customTabs = []; // Array of { name, key, folder, layout }
  let layoutOverrides = {}; // tabKey -> "horizontal" | "vertical" (user orientation overrides, per mod)
  // Authoritative folder->tab-icon map parsed from the active mod's countrytechtreeview.gui
  // (see /api/research/folder-tabs). Lets each tab use the mod's REAL icon instead of a guess.
  let guiFolderIcon = {}; // folderKey -> GFX_..._tab sprite key
  // 1:1 layout ground truth from the game's own GUI (/api/research/gui-layout):
  //  - guiLayout[folder] = { orientation, years:[{year,x,y}] } — orientation read from how the
  //    folder's year-stamp textboxes advance (x = horizontal tree, y = vertical tree); the same
  //    labels the game draws. No more per-tab orientation guessing.
  //  - guiAllFolders = every folder in common/technology_tags, in the game's tab order — the REAL
  //    tab list (this is how MD's Civilian tab exists at all).
  //  - gameFolderTabs = one editor tab per game folder with techs, mirroring the game's tab strip
  //    (armour vs nsb_armour stop sharing one tab with two different orientations).
  let guiLayout = {};
  // Folders that define a "small item" in the GUI. A folder with NONE (e.g. the doctrine folders) renders
  // EVERY tech as the wide box per the wiki — used by isLargeTech. Loaded from /api/research/gui-layout.
  let foldersWithSmallItem = new Set();
  // #custom-folder-tech-drag-discarded — tabs Nova created itself, whose tech coordinates the server
  // lays out on every save (relayoutCustomFolderTechFiles). A tech there cannot be positioned by hand,
  // so it must not be offered a drag that will be thrown away.
  let novaOwnedFolders = new Set();
  let guiAllFolders = [];
  // The tab names the GAME will show, keyed by folder key (from localisation). #tab-name-not-the-game-s
  let guiFolderNames = {};
  let gameFolderTabs = []; // [{ key:"ftab_<folder>", folder, name, layout, gameTab:true }]
  // DLC-gated folder variants. A mod (e.g. Millennium Dawn) ships several layout variants of one logical
  // folder, each gated on DLC in its technology_folders `available = { … }` block (armour_folder when NOT
  // "No Step Back", nsb_armour_folder when it IS; bba_aircraft_folder vs fixed_wing+bomber; etc.). The
  // game shows exactly the variant whose gate passes for the player's owned DLC — so the editor must too,
  // else you see both (a horizontal armour tab AND a vertical nsb one). guiFolderAvailability[folder] =
  // { requireDlc:[…], forbidDlc:[…] }; activeDlcs = the DLC set we treat as owned (default: all, since
  // modern MD assumes them — the user filters via the DLC button).
  let guiFolderAvailability = {};
  let guiDlcs = [];
  let activeDlcs = null; // Set<string>; null until first load (then defaults to all DLCs)
  // Canvas zoom (Z = out, X = in, like the focus tree). We scale the whole research canvas with a
  // CSS transform and compensate the scroll size with margins so scrollbars stay correct.
  let researchZoom = 1;
  // While a node is being dragged, its connector lines should follow its LIVE pixel position rather
  // than its snapped grid coords (else the lines jump to the grid while the node glides). Holds
  // { id, left, top } of the node currently under the cursor, or null.
  let dragAnchorOverride = null;
  // Non-blocking replacement for the native browser alert dialog, which FREEZES the Electron
  // renderer and can leave inputs locked (the user repeatedly hit this). Routes through the shared
  // Nova modal (always loaded via ai-field-assist.js). Same one-arg call shape, so every call site
  // was swapped to nbAlert. NOTE: this function body deliberately contains no native-dialog token.
  function nbAlert(message, title) {
    const msg = String(message == null ? "" : message);
    const html = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const t = title || (/\b(fail|failed|cannot|can.?t|could ?n.?t|could not|error|unable|invalid)\b/i.test(msg) ? "Something went wrong" : "Heads up");
    if (window.showNovaInfoModal) window.showNovaInfoModal(t, html);
    else if (window.console) window.console.warn(msg);
  }
  // Non-blocking replacement for the native confirm dialog (which also freezes the renderer). Because
  // it can't return synchronously, it takes an onYes callback. opts: { title, yesLabel, cancelLabel,
  // danger }. Used for destructive actions (delete tab/tech, reset years). The leave-without-saving
  // navigation guard stays native — a page-unload can't wait for an async modal.
  function showNovaConfirmModal(message, onYes, opts) {
    opts = opts || {};
    const existing = document.getElementById("novaConfirmModalOverlay");
    if (existing) existing.remove();
    const prevFocus = document.activeElement;
    const ov = document.createElement("div");
    ov.id = "novaConfirmModalOverlay";
    ov.style.cssText = "position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; background:rgba(3,7,14,0.66); backdrop-filter:blur(2px); font-family:'Inter',system-ui,sans-serif;";
    const msg = String(message == null ? "" : message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const title = opts.title || "Please confirm";
    const yesLabel = opts.yesLabel || "Yes";
    const cancelLabel = opts.cancelLabel || "Cancel";
    const yesBg = opts.danger ? "linear-gradient(135deg,#d94c2c,#a3321b)" : "linear-gradient(135deg,#3072e6,#7a51d8)";
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" style="width:min(440px,92vw); background:linear-gradient(140deg,#1a3566,#2e1f55); border:1px solid rgba(150,160,255,0.28); border-radius:14px; box-shadow:0 22px 66px rgba(0,0,0,0.6); padding:22px; color:#d7e1f5;">' +
        '<h2 style="margin:0 0 8px; font-size:17px; color:#eaf3ff;">' + title + "</h2>" +
        '<div style="font-size:13px; line-height:1.55; margin:0 0 18px; color:#c4cdec;">' + msg + "</div>" +
        '<div style="display:flex; gap:10px; justify-content:flex-end;">' +
          '<button id="novaConfirmCancel" style="padding:9px 16px; background:rgba(255,255,255,0.10); border:1px solid rgba(150,160,255,0.3); border-radius:10px; color:#eaf3ff; font-size:13px; font-weight:600; cursor:pointer;">' + cancelLabel + "</button>" +
          '<button id="novaConfirmYes" style="padding:9px 16px; background:' + yesBg + '; border:none; border-radius:10px; color:#fff; font-size:13px; font-weight:600; cursor:pointer;">' + yesLabel + "</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); try { (prevFocus || document.body).focus(); } catch (_) {} };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    document.getElementById("novaConfirmYes").addEventListener("click", () => { close(); try { onYes && onYes(); } catch (err) { if (window.console) window.console.error(err); } });
    document.getElementById("novaConfirmCancel").addEventListener("click", close);
    setTimeout(() => { const y = document.getElementById("novaConfirmYes"); if (y) y.focus(); }, 0);
  }

  // ── Right-click context menu for tech nodes ──────────────────────────────────────────────────
  // A Windows-style menu so common actions don't all live on the top bar. Additive: it reuses the
  // existing buttons/logic (the node is selected first, then the action runs on the selection).
  function clickById(id) { const el = document.getElementById(id); if (el) el.click(); }
  function onNodeMenuDocDown(e) { const m = document.getElementById("nodeContextMenu"); if (m && !m.contains(e.target)) hideNodeContextMenu(); }
  function onNodeMenuKey(e) { if (e.key === "Escape") hideNodeContextMenu(); }
  function hideNodeContextMenu() {
    const m = document.getElementById("nodeContextMenu");
    if (m) m.remove();
    document.removeEventListener("mousedown", onNodeMenuDocDown, true);
    document.removeEventListener("keydown", onNodeMenuKey, true);
    window.removeEventListener("scroll", hideNodeContextMenu, true);
  }
  function toggleForceSmallFromMenu(tech) {
    if (!tech.isMod) { nbAlert("This is a vanilla technology. Switch to a mod tech to change its box size."); return; }
    tech.forceSmallLayout = !tech.forceSmallLayout;
    markTechDirty(tech.id);
    renderCanvas();
    if (selectedTechId === tech.id) updateSidebar();
  }
  function showNodeContextMenu(clientX, clientY, tech) {
    hideNodeContextMenu();
    const menu = document.createElement("div");
    menu.id = "nodeContextMenu";
    menu.style.cssText = "position:fixed; z-index:2147483600; min-width:184px; background:#1b2333; border:1px solid #36406a; border-radius:10px; box-shadow:0 12px 36px rgba(0,0,0,0.5); padding:6px; font-family:'Inter',system-ui,sans-serif; font-size:13px; color:#d7e1f5; user-select:none;";
    const items = [
      { label: "✏️ Edit in sidebar", fn: () => { const el = document.getElementById("techName"); if (el) { el.focus(); el.select && el.select(); } } },
      { label: "⧉ Duplicate", fn: () => clickById("duplicateTechBtn") },
      { label: "➕ Add sub-technology", fn: () => clickById("addSubTechBtn") },
      { label: (tech.forceSmallLayout ? "▭ Make wide box" : "▢ Force square box"), fn: () => toggleForceSmallFromMenu(tech), modOnly: true },
      { sep: true },
      { label: "🗑 Delete", fn: () => clickById("deleteTechBtn"), danger: true, modOnly: true },
    ];
    items.forEach((it) => {
      if (it.sep) { const s = document.createElement("div"); s.style.cssText = "height:1px; background:#36406a; margin:5px 4px;"; menu.appendChild(s); return; }
      if (it.modOnly && !tech.isMod) return;
      const b = document.createElement("div");
      b.textContent = it.label;
      b.style.cssText = "padding:7px 10px; border-radius:6px; cursor:pointer;" + (it.danger ? " color:#ff9a86;" : "");
      b.addEventListener("mouseenter", () => { b.style.background = it.danger ? "rgba(217,76,44,0.18)" : "rgba(120,140,255,0.14)"; });
      b.addEventListener("mouseleave", () => { b.style.background = "transparent"; });
      b.addEventListener("click", () => { hideNodeContextMenu(); it.fn(); });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    let x = clientX, y = clientY;
    if (x + r.width > window.innerWidth) x = Math.max(6, window.innerWidth - r.width - 6);
    if (y + r.height > window.innerHeight) y = Math.max(6, window.innerHeight - r.height - 6);
    menu.style.left = `${x}px`; menu.style.top = `${y}px`;
    setTimeout(() => {
      document.addEventListener("mousedown", onNodeMenuDocDown, true);
      document.addEventListener("keydown", onNodeMenuKey, true);
      window.addEventListener("scroll", hideNodeContextMenu, true);
    }, 0);
  }

  // ── In-game detail-popup preview ─────────────────────────────────────────────────────────────
  // Shows how a tech's detail panel (the one a player sees on clicking it in-game) would look:
  // big picture, name, description, research time, equipment stats + modifiers. Display-only mock in
  // the program's aesthetic — overlays the whole editor so the sidebar "vanishes" behind it.
  function escHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function showTechIngamePreview(tech) {
    if (!tech) { nbAlert("Select a technology first."); return; }
    const old = document.getElementById("techIngamePreviewOverlay");
    if (old) old.remove();
    const days = Math.round((parseFloat(tech.researchCost) || 0) * 100);
    const iconKey = tech.iconKey || `GFX_${tech.id}_medium`;
    const imgSrc = tech.iconUrl || `/api/icon-image?key=${encodeURIComponent(iconKey)}&modPath=${encodeURIComponent(getModPath())}`;
    const rows = [];
    rows.push(`<div style="display:flex; justify-content:space-between; gap:12px;"><span style="color:#c9b27a;">Research time</span><b>&asymp; ${days} days</b></div>`);
    const eqId = tech.enableEquipments && tech.enableEquipments[0];
    const eq = eqId && typeof allEquips !== "undefined" ? allEquips[eqId] : null;
    if (eq) {
      const statMap = [["buildCostIc", "Production cost (IC)"], ["softAttack", "Soft attack"], ["hardAttack", "Hard attack"], ["defense", "Defense"], ["breakthrough", "Breakthrough"], ["apAttack", "Armor piercing"], ["airAttack", "Air attack"], ["reliability", "Reliability"]];
      statMap.forEach(([k, label]) => {
        const v = eq[k];
        if (v !== undefined && v !== null && v !== "" && Number(v) !== 0) rows.push(`<div style="display:flex; justify-content:space-between; gap:12px;"><span style="color:#c9b27a;">${label}</span><b>${escHtml(v)}</b></div>`);
      });
    }
    const mods = String(tech.modifiers || "").split("\n").map((s) => s.trim()).filter(Boolean);
    mods.forEach((m) => rows.push(`<div style="color:#8fd28f;">${escHtml(m)}</div>`));
    const cats = Array.isArray(tech.categories) && tech.categories.length ? tech.categories.join(", ") : "";
    const isWide = isLargeTech(tech); // same wide/small rule as the tree (enable_equipments/subunits/modules)

    const ov = document.createElement("div");
    ov.id = "techIngamePreviewOverlay";
    ov.style.cssText = "position:fixed; inset:0; z-index:2147483200; display:flex; align-items:center; justify-content:center; background:rgba(2,5,11,0.74); backdrop-filter:blur(3px); font-family:'Inter',system-ui,sans-serif;";
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" style="width:min(440px,94vw); max-height:88vh; overflow:auto; background:linear-gradient(180deg,#1c1a14 0%,#15130e 100%); border:1px solid #6b5a30; border-radius:8px; box-shadow:0 24px 70px rgba(0,0,0,0.7); color:#e8ddc4;">' +
        '<div style="display:flex; align-items:center; gap:6px; padding:10px 14px; background:linear-gradient(180deg,#3a3018,#2a230f); border-bottom:1px solid #6b5a30;">' +
          '<span style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#c9b27a;">In-game preview</span>' +
          '<span style="margin-left:auto; font-size:10px; color:#8a7c55;">' + (isWide ? "wide item" : "small item") + '</span>' +
          '<span id="techPreviewClose" style="cursor:pointer; font-size:22px; line-height:1; color:#c9b27a; padding:0 4px;">&times;</span>' +
        '</div>' +
        '<div style="padding:16px 18px;">' +
          '<div style="display:flex; gap:14px; align-items:flex-start;">' +
            '<div style="flex:0 0 auto; width:96px; height:96px; border:1px solid #6b5a30; border-radius:6px; background:#0c0a06 center/contain no-repeat; display:flex; align-items:center; justify-content:center; overflow:hidden;">' +
              '<img src="' + imgSrc + '" alt="" style="max-width:100%; max-height:100%;" data-hide-on-error="1" />' +
            '</div>' +
            '<div style="min-width:0;">' +
              '<h2 style="margin:0 0 6px; font-size:18px; color:#f3e9cf;">' + escHtml(tech.name || tech.id) + '</h2>' +
              (cats ? '<div style="font-size:11px; color:#9a895c; margin-bottom:6px;">' + escHtml(cats) + '</div>' : "") +
              '<p style="margin:0; font-size:12.5px; line-height:1.5; color:#c8bd9f;">' + escHtml(tech.description || "") + '</p>' +
            '</div>' +
          '</div>' +
          '<div style="margin-top:14px; padding-top:12px; border-top:1px solid #3a3220; display:flex; flex-direction:column; gap:6px; font-size:12.5px;">' +
            rows.join("") +
          '</div>' +
          '<button id="techPreviewResearch" style="margin-top:16px; width:100%; padding:10px; background:linear-gradient(180deg,#4a7a2e,#365c20); border:1px solid #6b9a45; border-radius:6px; color:#eafbe0; font-size:13px; font-weight:600; cursor:default;">Research</button>' +
          '<p style="margin:10px 0 0; font-size:10.5px; color:#7d7152; text-align:center;">Preview only &mdash; this is how the tech reads in-game. Close to return to editing.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    const x = document.getElementById("techPreviewClose");
    if (x) x.addEventListener("click", close);
  }
  const RZOOM_MIN = 0.4, RZOOM_MAX = 1.6, RZOOM_STEP = 0.1;
  // Last pointer position over the scroll container (in container-viewport px), so zoom anchors to
  // the cursor instead of the canvas's top-left. Updated on pointermove; stays put when the cursor
  // leaves the canvas so a toolbar-button/key zoom uses the last sane on-canvas point.
  let lastResearchZoomAnchor = null;
  let canvasNaturalW = 5200, canvasNaturalH = 2400;
  // Manual workspace sizing (editor convenience, like the focus tree). 0 = auto (the old 5200×2400-min
  // behaviour). When set, it becomes the target canvas size — but never below what the techs actually need,
  // so you can shrink an oversized default OR grow it for more room. Persisted per mod.
  let researchCanvasWOverride = 0, researchCanvasHOverride = 0;
  // Content extent from the last render (tech bounding box + margin) — the "Fit to techs" button snaps the
  // canvas to exactly this on both axes.
  let _researchContentW = 0, _researchContentH = 0;
  let dirty = false;
  // #ahead-of-time-assumes-1936 — THE CAMPAIGN START YEAR IS THE MOD'S, NOT VANILLA'S.
  //
  // The "ahead of time" penalty is charged per year a tech's start_year runs ahead of the campaign date, so
  // it is meaningless without the right campaign date. This was a hard 1936, and three of the five installed
  // workshop mods run a different era: Old World Blues starts 2275 (its bookmark says so, and its techs'
  // commonest start_year is 2275), Novum Vexillum 2000, Millennium Dawn 1985. An OWB tech therefore showed
  // "+33900%" in the sidebar; MD showed "+4900%". Not a rounding error — a number with no meaning at all,
  // printed in red beside every technology in those mods.
  //
  // ⭐ THE FIX ALREADY EXISTED NEXT DOOR: server.js has getModStartDate (default bookmark, mod → deps →
  // vanilla, falling back to 1936.1.1) and publishes it at /api/mod/start-date, which the Events maker has
  // used all along. This caller simply never adopted it — the dominant bug shape in this codebase.
  //
  // `let`, not `const`: it is refreshed on every mod load, and stays vanilla's 1936 until the answer arrives
  // or if the mod ships no bookmark at all.
  let scenarioStartYear = 1936;

  async function refreshScenarioStartYear() {
    const key = getModPath();
    try {
      const d = await (await fetch(`/api/mod/start-date?modPath=${encodeURIComponent(key)}`)).json();
      if (d && Number(d.year)) scenarioStartYear = Number(d.year);
      else scenarioStartYear = 1936;
    } catch (_e) { scenarioStartYear = 1936; }
  }
  let ideasResearchSpeedBonus = 0.0;

  // The grid-column -> year mapping. Defaults to vanilla's infantry @year spacing, but a mod can use
  // entirely different eras (Millennium Dawn runs 1965+), so the labels are editable: click a year
  // marker to change it. Overrides are stored per-mod. yearLabelOverrides maps gridCoord -> year.
  const DEFAULT_YEAR_COLS = [
    { y: -1, year: 1918 }, { y: 0, year: 1922 }, { y: 1, year: 1934 }, { y: 2, year: 1936 },
    { y: 4, year: 1938 }, { y: 6, year: 1939 }, { y: 8, year: 1940 }, { y: 10, year: 1941 },
    { y: 12, year: 1942 }, { y: 14, year: 1943 }, { y: 16, year: 1944 }, { y: 18, year: 1945 },
    { y: 20, year: 1946 }
  ];
  let yearLabelOverrides = {}; // gridCoord(number) -> year(number)
  let detectedYearCols = null; // [{y, year}] auto-detected from the active tab's techs (see below)
  let _yearDetectKey = "";
  // Once the modder DRAGS a year marker to a new column, we freeze the whole ruler into an explicit
  // per-mod list (yearColsCustom) and edit that from then on — so positions are under their control
  // instead of being re-derived from tech years. null = not customized (use auto-detect/default).
  let yearColsCustom = null; // [{ y, year, px? }] | null  (px = a FREE era-axis pixel position)
  // How dragging a year marker behaves: "free" = drop it anywhere (stores a pixel); "lock" = snap it
  // to a grid column so techs line up under it. Default free (toggle in the toolbar). Persisted per mod.
  let yearGripMode = "free";
  let yearDeleteMode = false; // armed by the Delete Year button; next year-marker click removes it
  // How many times each year label repeats ALONG its guide line: 1 = one end (default), 2 = both ends
  // (both sides), 3-4 = evenly spaced — so the year is readable at multiple heights of a tall tree. Per mod.
  let yearLabelCount = 1;
  // Full year-marker DESIGN: each frozen entry gets a stable unique id (so any number of markers can share
  // the same year value + be moved/sized/deleted independently), plus optional fontSize + box w/h. selectedYearId
  // shows that marker's design toolbar. Editor state; the exact px/size design can also be applied to the gui.
  let _yearIdSeq = 0;
  let selectedYearId = null;
  function ensureYearIds() {
    if (!Array.isArray(yearColsCustom)) return;
    yearColsCustom.forEach((c) => { if (c && !c.id) c.id = "yr_" + (++_yearIdSeq); });
  }
  // A3: free-text labels the user places on the tree — [{id, folder, text, x, y}]. Editor layer, per mod.
  let researchAnnotations = [];
  // In-game section labels parsed from the tech-tree gui (read-only, per mod). SHOW_GUI_LABELS toggles them;
  // researchGuiLabelsByFolder caches the fetched labels per folder; guiLabelOverrides holds any user drag
  // positions ({`<folder>|<name>`: {x,y}}), persisted so a repositioned label stays put.
  let SHOW_GUI_LABELS = true; // section labels are ON by default (a faithful 1:1 reference of the in-game tree)
  // ONE LOOK (#one-look): there is no "declutter" mode. The game has exactly one layout; Nova renders it or
  // Nova has a bug. The old declutter toggle nudged labels off their authored pixels to zero the collision
  // count — which silenced the very signal (unexplained overlaps) that led to real parser bugs like the
  // missing anchor-centering term. An overlap Nova can't explain is a bug to FIX, never to hide.
  // COMPACT (game-accurate) view: renders the game's real box mix at the real slot grid so the tree matches in-game.
  // Default ON (the point is a faithful 1:1 preview); the user can turn it off for the roomier name-card view. #compact-view
  // The editor renders EXACTLY what the game renders — one mode, always game-accurate (real slot grid, real box
  // mix). The old "readable wide" view (96/116 spacing + column widening) and its toggle are gone: the program's
  // job is to show what's in the GAME, not an editor-flavored approximation. #accurate-only
  let researchGuiLabelsByFolder = {};
  let researchGuiGeomByFolder = {}; // per-folder gridbox geometry {eraOriginX, slotW, slotH, format} for 1:1 placement
  let guiLabelOverrides = {};
  // Section-label FONT changes staged by the A−/A+ hover toolbar, flushed to the mod's gui by Save Changes.
  // key = "<folder>|<labelName>" so repeated steps on one label collapse to its final font. #staged-label-font
  let guiLabelFontPending = {};
  // Section-label TEXT rewrites, staged exactly like the fonts above (#staged-label-text). Editing a label
  // used to POST /api/research/set-label-text the moment you clicked away, so a rename you were still
  // trying out was already in the mod's localisation — the same "saves immediately" complaint the font
  // stepper had. Now it waits for Save Changes, which also makes it undoable like every other edit.
  // key = "<folder>|<locKey>" so repeated edits to one label collapse to the final text.
  let guiLabelTextPending = {};
  // NEW year model: each in-game year stamp is an individual movable text object placed at its EXACT authored
  // pixel (like a section label), NOT a sticky side/top rail. guiYearPosOverrides = user drag positions
  // ({`folder|key`:{x,y}}); guiYearValOverrides = user-edited values ({`folder|key`: year}). Per mod, staged.
  let guiYearPosOverrides = {};
  let guiYearValOverrides = {};
  let guiYearHidden = {};        // {`folder|key`: true} — a mod-authored stamp the user deleted (editor-hidden)
  let guiYearCustomStamps = {};  // {folder: [{x, y, year}]} — user-added year objects (canvas px), per mod
  let selectedGuiYearKey = null; // which year object is selected (for the future size/design toolbar)
  let SHOW_GUI_YEARS = true;     // in-game year stamps ON by default (the faithful 1:1 reference)
  let _overridesLoadedForMod = null; // which mod's staged annotations/label-overrides are in memory (see loadYearOverrides)

  // ==================== UNDO / REDO — Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z (#research-undo) ====================
  // SNAPSHOT-BASED, deliberately not inverse-commands. A research edit mutates a dozen unrelated
  // structures — the tech objects themselves, four separate year-override maps, label overrides, staged
  // fonts, the researched-tech set, the dirty-id set that decides what Save writes — and hand-writing an
  // inverse for each mutation site is exactly where undo bugs breed (miss one field and undo silently
  // corrupts the tree). Instead `histBaseline` always holds a snapshot of everything the editor can
  // change. When an edit settles, the OLD baseline becomes an undo entry and the new state becomes the
  // baseline, so any mutation that already announces itself via markDirty/markTechDirty is undoable for
  // free, with no per-operation bookkeeping anyone can forget to add.
  //
  // THIS NEVER TOUCHES THE MOD. Every captured field is editor-side state that only reaches disk when the
  // user presses Save Changes; undo and redo call no API and write no file. The two operations that DO
  // write immediately — creating a research tab and deleting a folder, which POST to the server — are
  // excluded on purpose: they are already on disk, so offering to "undo" them would be a lie. They clear
  // the history instead (histReset).
  const HIST_BUDGET_BYTES = 24 * 1024 * 1024; // MD's full state is ~1.4MB/snapshot; this holds ~17 steps
  let histUndo = [];   // [{ snap, label }] — oldest first
  let histRedo = [];
  let histBaseline = null; // state as of the last settled edit
  let histBytes = 0;
  let histPending = null;  // label of the edit burst waiting to settle this frame
  let histApplying = false; // re-entrancy guard: applying a snapshot must not record itself as an edit

  function histSnapshot() {
    return JSON.stringify({
      t: allTechs, e: allEquips,
      d: [...dirtyTechIds], rt: [...countryResearchedTechs],
      // THE DELETION QUEUE MUST TRAVEL WITH THE SNAPSHOT (#undo-pending-deletions). pendingDeletions is
      // what Save sends to the server as `deletions`. Without it here, undoing a delete put the tech back
      // on the canvas while the deletion stayed queued — so Save wiped it from the mod anyway, and the
      // undo you trusted lost the tech silently. deletedUndoStack rides along so the two stay in step.
      pd: pendingDeletions, du: deletedUndoStack,
      lo: guiLabelOverrides, lf: guiLabelFontPending, lt: guiLabelTextPending,
      yp: guiYearPosOverrides, yv: guiYearValOverrides, yh: guiYearHidden, yc: guiYearCustomStamps,
      ycc: yearColsCustom, ylo: yearLabelOverrides, ann: researchAnnotations,
      // A rename writes `display` onto the label cache, so undo has to revert that too — but capture ONLY
      // the texts, keyed by label, never the structure. Section labels load asynchronously AFTER the
      // baseline is taken, so snapshotting the whole cache meant the first undo restored the empty
      // pre-load object and every label vanished from the canvas. Keyed texts degrade safely instead: a
      // key the snapshot never saw is simply left alone.
      glb: Object.fromEntries(Object.entries(researchGuiLabelsByFolder || {}).map(([f, arr]) =>
        [f, Object.fromEntries((arr || []).map((x) => [`${x.key}|${x.name}`, x.display]))])),
    });
  }

  function histApply(snap) {
    const s = JSON.parse(snap);
    allTechs = s.t || []; allEquips = s.e || {};
    dirtyTechIds = new Set(s.d || []); countryResearchedTechs = new Set(s.rt || []);
    pendingDeletions = s.pd || []; deletedUndoStack = s.du || [];
    guiLabelOverrides = s.lo || {}; guiLabelFontPending = s.lf || {}; guiLabelTextPending = s.lt || {};
    guiYearPosOverrides = s.yp || {}; guiYearValOverrides = s.yv || {};
    guiYearHidden = s.yh || {}; guiYearCustomStamps = s.yc || {};
    yearColsCustom = s.ycc || null; yearLabelOverrides = s.ylo || {};
    researchAnnotations = s.ann || [];
    // Restore label TEXT in place — never replace the cache itself (see the snapshot note above).
    for (const [f, texts] of Object.entries(s.glb || {})) {
      const arr = researchGuiLabelsByFolder[f];
      if (!Array.isArray(arr)) continue;
      for (const it of arr) {
        const k = `${it.key}|${it.name}`;
        if (k in texts) it.display = texts[k];
      }
    }
    // A tech that existed when the snapshot was taken may be gone now (or vice versa) — drop a stale
    // selection rather than leave the sidebar editing a tech the canvas no longer has.
    if (selectedTechId && !allTechs.some((t) => t.id === selectedTechId)) selectedTechId = null;
    histApplying = true;
    // Every save*() below sets yearsDirty, which is the flag that makes the NEXT Save push year labels
    // into the mod's countrytechtreeview.gui. So pressing Ctrl+Z — an editor-only action that writes
    // nothing — armed a GUI write, and a later Save injected a NOVA_YEARS block on top of the year
    // labels Millennium Dawn already ships at those exact positions: two overlapping sets of years
    // in-game, from an undo. Restore the flag to whatever it was before the snapshot was applied.
    const yearsDirtyBefore = yearsDirty;
    try {
      // Re-persist the staged maps to localStorage, or an undo would revert the canvas while the previous
      // values sat in storage waiting to come back on reload. Still editor-side only — these are Nova's
      // own localStorage keys, not the mod. (saveGuiLabelOverrides/saveResearchAnnotations are markDirty
      // wrappers, so they are deliberately NOT called here: histApplying already suppresses re-recording,
      // and those two maps live in the snapshot itself.)
      saveGuiYearPos(); saveGuiYearVal(); saveGuiYearHidden(); saveGuiYearCustom();
      if (typeof saveYearColsCustom === "function") saveYearColsCustom();
      renderCanvas();
      if (typeof updateSidebar === "function") updateSidebar();
    } finally {
      histApplying = false;
      yearsDirty = yearsDirtyBefore;
    }
  }

  // Reset the history to "this is the clean starting point" — on load, mod switch, or after an operation
  // whose effects already reached disk and therefore cannot honestly be undone.
  function histReset() {
    histUndo = []; histRedo = []; histBytes = 0; histPending = null;
    histBaseline = histSnapshot();
    updateUndoButtons();
  }

  // Called by markDirty/markTechDirty AFTER a mutation. Coalesces a burst into one entry: a single drag
  // or a loop that dirties 20 prerequisites settles on the next frame as ONE undoable step, which is what
  // a person means by "one edit".
  function histNote(label) {
    if (histApplying || histBaseline === null) return;
    if (histPending !== null) return; // a settle is already scheduled for this burst
    histPending = label || "edit";
    const settle = () => {
      const lbl = histPending; histPending = null;
      const next = histSnapshot();
      if (next === histBaseline) return; // nothing actually changed (a no-op "edit")
      histUndo.push({ snap: histBaseline, label: lbl });
      histBytes += histBaseline.length;
      histBaseline = next;
      histRedo = []; // a fresh edit invalidates the redo branch
      while (histUndo.length > 1 && histBytes > HIST_BUDGET_BYTES) histBytes -= histUndo.shift().snap.length;
      updateUndoButtons();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(settle); else setTimeout(settle, 0);
  }

  function researchUndo() {
    if (histPending !== null) return; // let the in-flight burst settle first
    if (!histUndo.length) { showUndoToast && showUndoToast("Nothing to undo"); return; }
    const e = histUndo.pop();
    histBytes -= e.snap.length;
    histRedo.push({ snap: histBaseline, label: e.label });
    histBaseline = e.snap;
    histApply(e.snap);
    updateUndoButtons();
    showUndoToast && showUndoToast(`Undid: ${e.label}`);
  }

  function researchRedo() {
    if (histPending !== null) return;
    if (!histRedo.length) { showUndoToast && showUndoToast("Nothing to redo"); return; }
    const e = histRedo.pop();
    histUndo.push({ snap: histBaseline, label: e.label });
    histBytes += histBaseline.length;
    histBaseline = e.snap;
    histApply(e.snap);
    updateUndoButtons();
    showUndoToast && showUndoToast(`Redid: ${e.label}`);
  }

  function updateUndoButtons() {
    const u = document.getElementById("researchUndoBtn"), r = document.getElementById("researchRedoBtn");
    if (u) { u.disabled = !histUndo.length; u.title = histUndo.length ? `Undo: ${histUndo[histUndo.length - 1].label} (Ctrl+Z)` : "Nothing to undo (Ctrl+Z)"; }
    if (r) { r.disabled = !histRedo.length; r.title = histRedo.length ? `Redo: ${histRedo[histRedo.length - 1].label} (Ctrl+Y)` : "Nothing to redo (Ctrl+Y)"; }
  }

  function getYearCols() {
    if (Array.isArray(yearColsCustom) && yearColsCustom.length) {
      ensureYearIds();
      return yearColsCustom.map((c) => ({ y: c.y, year: c.year, px: c.px, pxX: c.pxX, pxY: c.pxY, id: c.id, fontSize: c.fontSize, w: c.w, h: c.h }));
    }
    // Prefer years AUTO-DETECTED from this tab's own techs (so Millennium Dawn shows 1965-2035,
    // not vanilla's 1918-1946); fall back to the vanilla spacing. User click-to-edit always wins.
    const base = (detectedYearCols && detectedYearCols.length >= 2) ? detectedYearCols : DEFAULT_YEAR_COLS;
    return base.map((c) => ({ y: c.y, year: (c.y in yearLabelOverrides) ? yearLabelOverrides[c.y] : c.year }));
  }
  // Freeze the current ruler into the explicit per-mod list so positions can be edited directly.
  function ensureYearColsCustom() {
    if (!Array.isArray(yearColsCustom) || !yearColsCustom.length) yearColsCustom = getYearCols();
    ensureYearIds();
    return yearColsCustom;
  }
  const findYearById = (id) => (Array.isArray(yearColsCustom) ? yearColsCustom.find((c) => c && c.id === id) : null);

  const _median = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // Build the year ruler from each tech's RESEARCH YEAR (the year it can actually be researched) —
  // not from its name (names vary by country and don't always carry a year). We read every tech's
  // research year, group by column, take each column's median (robust to a few leftover/stale techs
  // sharing a column), then walk the columns left→right keeping the years non-decreasing so they run
  // earliest→latest. We never invent years for empty columns. The name is used only as a light
  // tiebreaker when a column's own techs disagree.
  function detectYearColsForActiveTab() {
    const layout = getActiveLayout();
    const folders = currentVisibleFolders.length ? currentVisibleFolders : getActiveFoldersForTab(activeTab);
    const techs = allTechs.filter((t) => !t.isSubTech && folders.includes(t.folder));
    if (techs.length < 4) return null;
    // Vanilla already has an exact, hand-tuned ruler that's cleaner than anything we'd derive, so
    // only auto-detect when a MOD is loaded (its techs carry the mod's real research years/eras).
    if (!techs.some((t) => t.isMod)) return null;
    const colOf = (t) => screenXCoordOf(t, layout);
    const plausible = (y) => typeof y === "number" && y >= 1850 && y <= 2300;

    // research years grouped by column, plus any year-in-name as a tiebreaker hint per column
    const byCol = new Map();
    const nameHint = new Map();
    techs.forEach((t) => {
      const c = colOf(t);
      if (plausible(t.startYear)) {
        if (!byCol.has(c)) byCol.set(c, []);
        byCol.get(c).push(t.startYear);
      }
      const m = String(t.name || "").match(/\b(19|20)\d{2}\b/);
      if (m) { const yr = parseInt(m[0], 10); if (plausible(yr)) { if (!nameHint.has(c)) nameHint.set(c, []); nameHint.get(c).push(yr); } }
    });
    if (byCol.size < 2) return null;

    const cols = [...byCol.keys()].sort((a, b) => a - b);
    let running = -Infinity;
    const labelled = [];
    cols.forEach((c) => {
      let year = _median(byCol.get(c)); // the column's representative research year
      // If this column's techs are named with a year, prefer that (it's the modder's explicit label).
      if (nameHint.has(c)) year = _median(nameHint.get(c));
      year = Math.max(Math.round(year), running); // keep the ruler running earliest → latest
      running = year;
      labelled.push({ y: c, year });
    });
    // Collapse consecutive columns that ended on the same year so the ruler isn't crowded.
    const out = [];
    labelled.forEach((col) => { if (!out.length || out[out.length - 1].year !== col.year) out.push(col); });
    return out.length >= 2 ? out : null;
  }

  // Recompute detection only when the tab / folder set / tech count changes (cheap caching).
  function refreshDetectedYearCols() {
    const key = `${activeTab}|${currentVisibleFolders.join(",")}|${allTechs.length}|${getActiveLayout()}|${getYearRulerLayout()}`;
    if (key === _yearDetectKey) return;
    _yearDetectKey = key;
    // The game's own year stamps (from countrytechtreeview.gui) beat the start_year heuristic —
    // they're what the player actually sees, including tabs the heuristic had no stamps for.
    try { detectedYearCols = guiYearColsForActiveTab() || detectYearColsForActiveTab(); }
    catch (_) { detectedYearCols = null; }
  }
  function loadYearOverrides() {
    yearLabelOverrides = {};
    try { yearLabelOverrides = JSON.parse(localStorage.getItem(`research_year_overrides_${getModPath()}`)) || {}; } catch (_) { yearLabelOverrides = {}; }
    yearColsCustom = null;
    try { const raw = JSON.parse(localStorage.getItem(`research_year_cols_${getModPath()}`)); if (Array.isArray(raw) && raw.length) yearColsCustom = raw; } catch (_) { yearColsCustom = null; }
    // SELF-HEAL corrupt saved rulers. A custom ruler is FROZEN from whatever the year detection returned
    // at the moment the user first dragged/edited a marker (ensureYearColsCustom). If that snapshot was
    // taken when detection was wrong, garbage year VALUES (e.g. 222, 2232, 2321 — outside any real research
    // year) get baked into localStorage and then SHADOW the now-correct gui years forever, because
    // getYearCols returns yearColsCustom verbatim. A real HOI4 research year is 1800–2200 (the same window
    // the gui-label parser accepts); any value outside it means the saved data is corrupt. Drop it so the
    // ruler falls back to live auto-detection (the real gui years), and re-save so it heals permanently.
    const plausibleYear = (y) => Number.isFinite(Number(y)) && Number(y) >= 1800 && Number(y) <= 2200;
    if (Array.isArray(yearColsCustom) && yearColsCustom.length && yearColsCustom.some((c) => !c || !plausibleYear(c.year))) {
      yearColsCustom = null;
      try { localStorage.removeItem(`research_year_cols_${getModPath()}`); } catch (_) {}
    }
    if (yearLabelOverrides && typeof yearLabelOverrides === "object") {
      let droppedOverride = false;
      for (const k of Object.keys(yearLabelOverrides)) { if (!plausibleYear(yearLabelOverrides[k])) { delete yearLabelOverrides[k]; droppedOverride = true; } }
      if (droppedOverride) { try { localStorage.setItem(`research_year_overrides_${getModPath()}`, JSON.stringify(yearLabelOverrides)); } catch (_) {} }
    }
    try { yearGripMode = localStorage.getItem(`research_year_grip_${getModPath()}`) || "free"; } catch (_) { yearGripMode = "free"; }
    try { yearLabelCount = Math.min(4, Math.max(1, parseInt(localStorage.getItem(`research_year_label_count_${getModPath()}`), 10) || 1)); } catch (_) { yearLabelCount = 1; }
    // Absent means ON (#bg-accurate) — `=== "1"` made every mod that had never touched the toggle open
    // with the art off, which is the opposite of the faithful default. Only an explicit "0" turns it off.
    try { SHOW_RESEARCH_BG = localStorage.getItem(`research_bg_visible_${getModPath()}`) !== "0"; } catch (_) { SHOW_RESEARCH_BG = true; }
    try { SHOW_HIDDEN_TECHS = localStorage.getItem(`research_show_hidden_${getModPath()}`) === "1"; } catch (_) { SHOW_HIDDEN_TECHS = false; }
    // Absent means ON, same reasoning as the background art above: showing what the GAME shows is the
    // faithful default, and only an explicit "0" (the user having turned it off for this mod) hides it.
    try { SHOW_BASE_TECHS = localStorage.getItem(`research_show_base_${getModPath()}`) !== "0"; } catch (_) { SHOW_BASE_TECHS = true; }
    // researchAnnotations + guiLabelOverrides hold STAGED (unsaved) user edits — only (re)load them from
    // localStorage when the MOD actually changed. A same-mod loadCatalog (e.g. switching COUNTRY to view a
    // different nation's start techs) must NOT clobber an unsaved staged move/annotation with the last-saved
    // values — that was silent data loss. Save keeps in-memory in sync, so skipping the reload is safe.
    const _ovMod = getModPath();
    if (_ovMod !== _overridesLoadedForMod) {
      _overridesLoadedForMod = _ovMod;
      try { researchAnnotations = JSON.parse(localStorage.getItem(`research_annotations_${_ovMod}`)) || []; if (!Array.isArray(researchAnnotations)) researchAnnotations = []; } catch (_) { researchAnnotations = []; }
      try { guiLabelOverrides = JSON.parse(localStorage.getItem(`research_gui_label_overrides_${_ovMod}`)) || {}; if (typeof guiLabelOverrides !== "object" || !guiLabelOverrides) guiLabelOverrides = {}; } catch (_) { guiLabelOverrides = {}; }
      // Per-stamp overrides for the NEW gui-year objects: drag positions ({`folder|key`:{x,y}}) + edited values
      // ({`folder|key`: year}). Editor-side, per mod, staged like the label overrides.
      try { guiYearPosOverrides = JSON.parse(localStorage.getItem(`research_gui_year_pos_${_ovMod}`)) || {}; if (typeof guiYearPosOverrides !== "object" || !guiYearPosOverrides) guiYearPosOverrides = {}; } catch (_) { guiYearPosOverrides = {}; }
      try { guiYearValOverrides = JSON.parse(localStorage.getItem(`research_gui_year_val_${_ovMod}`)) || {}; if (typeof guiYearValOverrides !== "object" || !guiYearValOverrides) guiYearValOverrides = {}; } catch (_) { guiYearValOverrides = {}; }
      try { guiYearHidden = JSON.parse(localStorage.getItem(`research_gui_year_hidden_${_ovMod}`)) || {}; if (typeof guiYearHidden !== "object" || !guiYearHidden) guiYearHidden = {}; } catch (_) { guiYearHidden = {}; }
      try { guiYearCustomStamps = JSON.parse(localStorage.getItem(`research_gui_year_custom_${_ovMod}`)) || {}; if (typeof guiYearCustomStamps !== "object" || !guiYearCustomStamps) guiYearCustomStamps = {}; } catch (_) { guiYearCustomStamps = {}; }
    }
    try { SHOW_GUI_LABELS = localStorage.getItem(`research_gui_labels_${getModPath()}`) !== "0"; } catch (_) { SHOW_GUI_LABELS = true; } // default ON unless the user explicitly turned it off
    // (game-accurate rendering is the ONLY mode — no per-mod toggle to restore. #accurate-only)
    researchGuiLabelsByFolder = {}; // per-mod: drop any cached labels from the previous mod
    if (typeof updateYearGripButton === "function") updateYearGripButton();
    if (typeof updateYearLabelCountButton === "function") updateYearLabelCountButton();
    if (typeof updateResearchBgButton === "function") updateResearchBgButton();
    if (typeof updateShowHiddenButton === "function") updateShowHiddenButton();
    if (typeof updateShowBaseButton === "function") updateShowBaseButton();
    if (typeof updateGuiLabelsButton === "function") updateGuiLabelsButton();
  }
  // Set the moment the user changes the year DESIGN (value/position/size/add/delete/duplicate). Save reads it
  // to auto-apply the years to the game — so there's no separate "Apply years to game" button. These two
  // persistence helpers are the choke point every real year edit flows through (ensureYearColsCustom, the
  // auto-freeze, does NOT call them, so opening a folder never trips this).
  let yearsDirty = false;
  function saveYearOverrides() {
    yearsDirty = true;
    try { localStorage.setItem(`research_year_overrides_${getModPath()}`, JSON.stringify(yearLabelOverrides)); } catch (_) {}
  }
  function saveYearColsCustom() {
    yearsDirty = true;
    try {
      if (Array.isArray(yearColsCustom) && yearColsCustom.length) localStorage.setItem(`research_year_cols_${getModPath()}`, JSON.stringify(yearColsCustom));
      else localStorage.removeItem(`research_year_cols_${getModPath()}`);
    } catch (_) {}
  }
  // Reset the ruler back to auto-detected years (undo all manual positions/values for this mod).
  function resetYearCols() {
    yearColsCustom = null;
    yearLabelOverrides = {};
    saveYearColsCustom();
    saveYearOverrides();
    renderYearMarkers();
    renderCanvas();
    if (selectedTechId) updateSidebar();
  }

  function getYearFromCoord(y) {
    const cols = [...getYearCols()].sort((a, b) => a.y - b.y);
    if (!cols.length) return scenarioStartYear;
    // Exact column?
    for (const c of cols) if (c.y === y) return c.year;
    // Beyond the labeled range: extrapolate along the nearest two columns' real slope, so this
    // works for ANY era scale (vanilla 1918-1946 AND mods like MD's 1965-2035) instead of assuming
    // vanilla's spacing.
    const slopeBetween = (a, b) => (b.y === a.y ? 0 : (b.year - a.year) / (b.y - a.y));
    if (y < cols[0].y) {
      const slope = cols.length >= 2 ? slopeBetween(cols[0], cols[1]) : 0;
      return Math.round(cols[0].year + (y - cols[0].y) * slope);
    }
    if (y > cols[cols.length - 1].y) {
      const a = cols[cols.length - 2], b = cols[cols.length - 1];
      const slope = a ? slopeBetween(a, b) : 0;
      return Math.round(b.year + (y - b.y) * slope);
    }
    // Between two columns: nearest.
    let closest = cols[0], minDiff = Math.abs(y - cols[0].y);
    for (const c of cols) { const d = Math.abs(y - c.y); if (d < minDiff) { minDiff = d; closest = c; } }
    return closest.year;
  }

  function getCoordFromYear(year) {
    const yearCols = getYearCols();
    let closest = yearCols[0];
    let minDiff = Math.abs(year - closest.year);
    for (let i = 1; i < yearCols.length; i++) {
      const diff = Math.abs(year - yearCols[i].year);
      if (diff < minDiff) {
        minDiff = diff;
        closest = yearCols[i];
      }
    }
    if (year > 1946) {
      return 20 + (year - 1946);
    }
    if (year < 1918) {
      return -1 - Math.round((1918 - year) / 2);
    }
    return closest.y;
  }
  
  let activeCountryTag = "";
  let countryResearchedTechs = new Set();
  // Did the user actually change which techs the selected country starts with? Save rewrites that
  // country's history/countries file, and it used to do so on EVERY save because a country is
  // auto-selected on load — so opening the page and pressing Save with no edits reformatted a country
  // file (collapsing blank lines, moving its set_technology block, listing the merged tech set). That is
  // how "ABK - Abkhazia.txt" ended up rewritten in a live install. #no-country-write-without-edit
  let countryTechsDirty = false;
  let tempVanillaTechs = [];
  let tempVanillaEquips = {};
  // #nova-does-not-find-the-game — false when the server found no game folder: an empty tree is then the game NOT FOUND, not a
  // tree nothing defines (the game still loads its own into the mod), and there is no base tree to copy.
  let catalogGameFound = true;

  // Per-tech dirty tracking. Saving used to re-serialize EVERY mod tech (all ~983 in Millennium
  // Dawn) back into the mod's own files through a lossy serializer + a fragile text upsert — which
  // corrupted untouched techs (nodes scattered, doctrine techs landing in the wrong tab, icons
  // dropped) and lost custom blocks on weapons. We now write ONLY the techs the user actually
  // created or edited, so untouched techs are never rewritten and cannot be corrupted.
  let dirtyTechIds = new Set();
  // Techs created in THIS session that have not been saved yet. Save sends these so the server can write
  // the one thing a new tech cannot render without — its gridbox (#new-tech-gridbox). Deliberately not
  // "every unplaced tech": a mod's own unplaced techs must stay exactly as the mod ships them.
  let newlyCreatedTechIds = new Set();
  // Equipment Nova minted itself as a wide tech's starter unlock, keyed by the equipment id. Only these may
  // be renamed along with their tech (#tech-rename-companion-equipment) — an equipment the modder picked or
  // one that already existed in the mod is not ours to rename.
  const autoCreatedEquipIds = new Set();
  // These two are the editor's existing "something changed" signals, so they are also the ONLY hooks undo
  // needs — histNote coalesces a burst into one step (#research-undo). Adding a new mutation that calls
  // either of them gets undo support with no extra work.
  function markTechDirty(id, label) { if (id) dirtyTechIds.add(id); dirty = true; histNote(label || "tech change"); }

  function markDirty(label) {
    dirty = true;
    histNote(label || "edit");
  }

  function clearDirty() {
    dirty = false;
  }

  function techExistsInCatalog(techId) {
    const id = String(techId || "").trim();
    if (!id) return false;
    // A valid prerequisite target is any tech the game will know about: the active mod's own techs,
    // a declared-dependency/base-mod tech (e.g. Millennium Dawn), or a vanilla tech. #110
    return allTechs.some((t) => t.id === id)
      || baseModTechs.some((t) => t.id === id)
      || (Array.isArray(tempVanillaTechs) && tempVanillaTechs.some((t) => t.id === id));
  }

  function warnUnknownTechId(techId, contextLabel) {
    if (techExistsInCatalog(techId)) return true;
    nbAlert(`Unknown technology ID "${techId}" (${contextLabel}). It is not in the loaded catalog.`);
    return false;
  }

  // Autocomplete options for the tech-id prompts (prerequisite / dependency / mutually-exclusive):
  // this mod's own techs, the declared base mod's techs (#110), and vanilla — each tagged by origin so
  // the modder can browse/search valid ids instead of memorising them.
  function validTechSuggestions() {
    const out = [];
    const seen = new Set();
    const add = (t, origin) => {
      if (!t || !t.id || seen.has(t.id)) return;
      seen.add(t.id);
      const nm = t.name && t.name !== t.id ? `${t.name} — ` : "";
      out.push({ id: t.id, label: `${nm}${origin}` });
    };
    // #picker-calls-everything-this-mod — LABEL BY OWNERSHIP, NOT BY WHICH ARRAY IT CAME OUT OF.
    //
    // This said "this mod" for every entry in allTechs. That was true while allTechs was mod-only — and
    // #overlay-blindness then made allTechs the FULL catalogue (a mod is an overlay, so the tree must show
    // what the game shows), which turned the label into a lie for every inherited tech and killed the one
    // thing it exists to tell the modder. Measured in the live picker on Road to 56: 818 of 818 entries read
    // "this mod", vanilla's own `infantry_weapons` among them.
    //
    // A fix arming a latent bug next door is a recorded shape here; the tell was that not one entry in the
    // whole list said "vanilla".
    const baseModIds = new Set((baseModTechs || []).map((t) => t && t.id).filter(Boolean));
    allTechs.forEach((t) => {
      if (t.isSubTech) return;
      add(t, t.isMod ? "this mod" : (baseModIds.has(t.id) ? "base mod" : "vanilla"));
    });
    baseModTechs.forEach((t) => add(t, "base mod"));
    (Array.isArray(tempVanillaTechs) ? tempVanillaTechs : []).forEach((t) => { if (!t.isSubTech) add(t, "vanilla"); });
    return out;
  }

  // Expose dirty-state checker for Electron main.js close handler
  window.__focusEditorHasUnsavedChanges = () => dirty;

  const isElectronRuntime = /\bElectron\//.test(String(navigator.userAgent || ""));
  if (!isElectronRuntime) {
    window.addEventListener("beforeunload", (e) => {
      if (!dirty) return;
      e.returnValue = "You have unsaved changes in the Research Tree.";
    });
  } else {
    // In the desktop app beforeunload is intentionally unused (main.js owns the window-CLOSE prompt via
    // __focusEditorHasUnsavedChanges; a beforeunload would double-prompt on close). But a manual RELOAD
    // (Ctrl/Cmd+R, F5) isn't a close and slipped past the guard entirely — so intercept those keys and
    // confirm when there are unsaved changes.
    window.addEventListener("keydown", (e) => {
      const isReload = e.key === "F5" || ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"));
      if (!isReload || !dirty) return;
      e.preventDefault(); e.stopPropagation();
      const proceed = () => { dirty = false; location.reload(); };
      if (window.novaConfirm) {
        window.novaConfirm("You have unsaved changes in the Research Tree. Reload anyway and lose them?", proceed,
          { title: "Unsaved changes", yesLabel: "Reload (discard)", cancelLabel: "Keep editing", danger: true });
      } else if (confirm("You have unsaved changes in the Research Tree. Reload anyway and lose them?")) {
        proceed();
      }
    }, true);
  }

  // UNDO / REDO keys (#research-undo). Ctrl+Z undoes; Ctrl+Y and Ctrl+Shift+Z both redo (the Windows and
  // Adobe conventions — the user asked for Ctrl+Z/Ctrl+Y by name). Registered OUTSIDE the Electron branch
  // above: an earlier version sat inside it and so only worked in the desktop app, never in the browser.
  // Ignored while a text field has focus, so the browser's own text undo still works where you expect it.
  window.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = String(e.key || "").toLowerCase();
    if (k !== "z" && k !== "y") return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault(); e.stopPropagation();
    if (k === "y" || e.shiftKey) researchRedo(); else researchUndo();
  }, true);

  // Link mode state
  let isLinkMode = false;
  let linkParentId = null;

  // Expose internal state and helper functions on window for E2E testing
  Object.defineProperty(window, "allTechs", { get: () => allTechs, set: (v) => { allTechs = v; }, configurable: true });
  Object.defineProperty(window, "activeTab", { get: () => activeTab, set: (v) => { activeTab = v; }, configurable: true });
  // Undo/redo surface for E2E (#research-undo). Exposes the same entry points the keys and buttons use,
  // plus depths, so a test can assert an edit is reversible without simulating keystrokes.
  window.researchUndo = () => researchUndo();
  window.researchRedo = () => researchRedo();
  window.researchHistoryDepth = () => ({ undo: histUndo.length, redo: histRedo.length, bytes: histBytes, pending: histPending !== null });
  // The queue Save sends to the server as `deletions`. Exposed so a test can prove undo reverts the
  // QUEUE and not just the canvas — the two drifting apart is silent data loss (#undo-pending-deletions).
  window.researchPendingDeletions = () => pendingDeletions.map((d) => d.techId);
  // The same queue with the EQUIPMENT each deletion carries — a tech's equipment must be removed with
  // it, and restored with it on undo, or the mod keeps an equipment nothing enables (#equip-follows-tech).
  window.__researchPendingDeletionsFull = () => pendingDeletions.map((d) => ({ techId: d.techId, equipId: d.equipId || null }));
  // Staged label edits still waiting for Save — exposed so a test can prove a FAILED flush stays queued
  // for retry instead of being silently dropped (#save-failure-retry).
  // The set that decides WHAT SAVE WRITES. Exposed so a test can prove that a mutation touching other
  // techs marks those techs too — save skips anything not in here, so a missed id means a stale
  // reference left on disk (#rename-marks-referrers).
  window.__researchDirtyIds = () => [...dirtyTechIds];
  window.__researchStagedTextCount = () => Object.keys(guiLabelTextPending).length;
  window.__researchStagedFontCount = () => Object.keys(guiLabelFontPending).length;
  Object.defineProperty(window, "customTabs", { get: () => customTabs, set: (v) => { customTabs = v; }, configurable: true });
  Object.defineProperty(window, "selectedTechId", { get: () => selectedTechId, set: (v) => { selectedTechId = v; }, configurable: true });
  window.getTechLayout = getTechLayout;
  window.snapPosition = snapPosition;
  window.clampGridCoords = clampGridCoords;

  // Standard HOI4 tabs. `layout` matches the GUI's `format =` for each folder:
  //   "horizontal" == HOI4 LEFT (year on x-axis, lanes stacked vertically)
  //   "vertical"   == HOI4 UP   (year on y-axis, lanes side by side)
  // Most folders use LEFT; only the doctrine trees use UP.
  const STANDARD_TABS = {
    "infantry_tab": {
      name: "🪖 Infantry",
      iconKey: "GFX_infantry_folder_tab",
      folders: ["infantry_folder"],
      layout: "horizontal"
    },
    "support_tab": {
      name: "🛠️ Support Companies",
      iconKey: "GFX_support_folder_tab",
      folders: ["support_folder"],
      layout: "horizontal"
    },
    "armor_tab": {
      name: "🚜 Armor",
      iconKey: "GFX_armour_folder_tab",
      folders: ["armour_folder", "nsb_armour_folder", "armor_folder"],
      layout: "horizontal"
    },
    "artillery_tab": {
      name: "💥 Artillery",
      iconKey: "GFX_artillery_folder_tab",
      folders: ["artillery_folder"],
      layout: "horizontal"
    },
    "naval_tab": {
      name: "⚓ Naval",
      iconKey: "GFX_naval_folder_tab",
      folders: ["naval_folder", "mtgnavalfolder", "mtgnavalsupportfolder"],
      layout: "horizontal"
    },
    "air_tab": {
      name: "✈️ Air",
      iconKey: "GFX_air_techs_folder_tab",
      folders: ["air_techs_folder", "bba_air_techs_folder", "air_folder"],
      layout: "horizontal"
    },
    "engineering_tab": {
      name: "📡 Engineering",
      iconKey: "GFX_techtree_engineering_tab",
      folders: ["electronics_folder", "electronic_mechanical_engineering_folder"],
      layout: "horizontal"
    },
    "industry_tab": {
      name: "🏭 Industry",
      iconKey: "GFX_industry_folder_tab",
      folders: ["industry_folder", "industry"],
      layout: "horizontal"
    },
    "doctrine_tab": {
      name: "📜 Doctrine",
      iconKey: "GFX_land_doctrine_folder_tab",
      folders: [
        "land_doctrine_folder",
        "naval_doctrine_folder",
        "air_doctrine_folder",
        "special_forces_doctrine_folder"
      ],
      layout: "vertical"
    },
    "special_tab": {
      name: "🔬 Special",
      iconKey: "GFX_secret_weapons_folder_tab",
      folders: [
        "secret_weapons_folder",
        "rocketry_folder",
        "nuclear_folder",
        "special_projects_folder",
        "special_forces_folder",
        "train_techs_folder"
      ],
      layout: "horizontal"
    }
  };

  // HOI4 mixes TWO tech-item sizes (grounded in countrytechtreeview.gui + the wiki rule):
  //   - LARGE/regular item (~183x84 in-game): used when a tech UNLOCKS EQUIPMENT (enable_equipments).
  //   - SMALL item (72x72 in-game): used when it doesn't — or when force_use_small_tech_layout = yes.
  // We render each tech at its real size so the tree reads like the game (mix of big + small icons).
  // Game-accurate proportions: HOI4 grid is 70px/unit, small item ~72x72 (SQUARE),
  // large item ~183x84 (wide, icon-left). Scaled ~1.25x for editor readability, same aspects.
  // Overlap of wide items into neighbour cells is expected — the game allows tech overlap.
  // Game-exact: the REGULAR tech item is 183×84 (wide rectangle, icon-left) and is the DEFAULT for
  // techs; the small_item is 72×72 (square) and only used for techs flagged small. The app had this
  // inverted (defaulting to a square), which is why non-equipment techs showed as squares in the
  // editor but rectangles in-game. Now both match the game pixel-for-pixel.
  const SMALL_W = 72;     // game small_item (square) — only for techs flagged forceSmallLayout
  const SMALL_H = 72;
  const LARGE_W = 183;    // game regular item (wide rectangle) — the default for every tech
  const LARGE_H = 84;
  const NODE_W = LARGE_W; // back-compat default
  const NODE_H = LARGE_H;
  // Per-coord spacing along the two axes = the active folder's REAL gridbox slotsize (the game's own layout unit).
  // `let` because computeEffectiveOrigins() re-reads guiLayout[folder].slotsize every render; 70×70 is only the
  // pre-load fallback (the vanilla default). There is no other spacing mode. #accurate-only
  let SMALL_STEP = 70;    // slot width along the time/lane (screen-x) axis
  let CELL_H = 70;        // slot height on the perpendicular (screen-y) axis
  const SUBTECH_W = 22;   // bigger sub-tech slots so multi-version icons are legible
  // The old 38px year-marker strip is RETIRED (years render in-canvas at exact game pixels); keep only a
  // small breathing-room pad above the topmost content. #year-objects
  const YEAR_BAR_H = 0;
  const CANVAS_TOP_PAD = 24;
  // Game-accurate box size (HOI4 wiki, Technology_modding, verbatim): "If a technology unlocks equipment,
  // it'll use the regular item, while a technology that doesn't unlock equipment will use the small item."
  // "Unlocks equipment" = enable_equipments ONLY — NOT enable_subunits / enable_equipment_modules (verified:
  // vanilla `paratroopers` is enable_subunits-only yet renders as a SMALL square in-game; Nova used to draw
  // those wide). show_equipment_icon does NOT affect size. `force_use_small_tech_layout = yes` forces the
  // square (in a folder that has a small item). The folder-has-no-small-item case (→ every tech wide, e.g.
  // doctrines) is handled in isLargeTech, not here.
  function techUnlocksEquipment(t) {
    return !!t && Array.isArray(t.enableEquipments) && t.enableEquipments.length > 0;
  }
  function isLargeTech(t) {
    if (!t || t.isSubTech) return false;
    // A folder with NO small item defined in the GUI renders EVERY tech as the wide box (wiki) — e.g. the
    // doctrine folders (the doctrine GUI defines no small item), so all doctrine techs are wide regardless of
    // equipment / force_use_small_tech_layout (there's no small item to use). Only once the GUI list loaded.
    if (t.folder && foldersWithSmallItem.size > 0 && !foldersWithSmallItem.has(t.folder)) return true;
    return !t.forceSmallLayout && techUnlocksEquipment(t);
  }
  // Exposed for tests (same convention as window.allTechs/activeTab above) — the wide/small box rule.
  try { window.__novaIsLargeTech = isLargeTech; } catch (_) {}

  // Section-label FONT ladder — the stock HOI4 header fonts (all defined in vanilla fonts.gfx, so they always
  // resolve), smallest→largest; hoi_33 is the vanilla/MD default. HOI4 uses NAMED fonts, not free px, so the
  // font-size control steps through these. The editor renders a label at pt × 0.45 (hoi_33=33pt → 15px, the
  // label's existing on-screen size), so a bigger in-game font shows bigger in the canvas too.
  const SECTION_LABEL_FONTS = [
    { font: "hoi_16mbs", pt: 16 }, { font: "hoi_18", pt: 18 }, { font: "hoi_20b", pt: 20 },
    { font: "hoi_22tech", pt: 22 }, { font: "hoi_24header", pt: 24 }, { font: "hoi_30", pt: 30 },
    { font: "hoi_33", pt: 33 }, { font: "hoi_36header", pt: 36 },
  ];
  const LABEL_FONT_PX_FACTOR = 0.45;
  // The size a year marker renders at before anyone resizes it — i.e. `.year-marker-label`'s font-size in
  // research.html. The renderer only sets an inline size once the marker HAS one, so this is the number on
  // screen for every untouched marker, and it has to be what the resize handle and the toolbar box start
  // from. They used to start from 13, which is why touching the handle jumped the label to a size the user
  // never chose. Keep in step with the stylesheet. #year-label-click-resizes
  const YEAR_LABEL_DEFAULT_PX = 19;
  const labelFontEntry = (font) => SECTION_LABEL_FONTS.find((x) => x.font === font) || SECTION_LABEL_FONTS[6]; // default hoi_33
  const labelFontToPx = (font) => Math.round(labelFontEntry(font).pt * LABEL_FONT_PX_FACTOR);
  const labelFontIndex = (font) => { const i = SECTION_LABEL_FONTS.findIndex((x) => x.font === font); return i < 0 ? 6 : i; };

  // Box dimensions are PER-FOLDER in the game (the item container's `size` — e.g. vanilla industry/electronics
  // use a 204×72 wide-short box at offset {0,+5}, not the 183×84 @ {-56,-7} standard). Read the folder's real
  // sizes from the gui; the vanilla constants are only the fallback. Safe now that per-chain gridbox origins
  // separate the trees — the earlier attempt looked wrong only because chains were piled onto one grid.
  // #accurate-only #gridbox-origins
  function boxDims(t) {
    const large = isLargeTech(t);
    const gl = t && t.folder ? guiLayout[t.folder] : null;
    const b = gl ? (large ? gl.wideBox : gl.smallBox) : null;
    if (b && b.w > 0 && b.h > 0) return { w: b.w, h: b.h };
    return large ? { w: LARGE_W, h: LARGE_H } : { w: SMALL_W, h: SMALL_H };
  }
  function techWidth(t) { return boxDims(t).w; }
  function techHeight(t) { return boxDims(t).h; }
  // Plain-English readout of how this tech renders in-game (drives the sidebar "Box size" line).
  function updateBoxSizeReadout(tech) {
    const el = document.getElementById("techBoxSizeReadout");
    if (!el || !tech) return;
    const hasEquip = techUnlocksEquipment(tech);
    let msg;
    const folderAllWide = tech.folder && foldersWithSmallItem.size > 0 && !foldersWithSmallItem.has(tech.folder);
    if (tech.isSubTech) msg = "▢ Small square — sub-technology";
    else if (folderAllWide) msg = "▭ Wide box — this folder defines no small item, so every tech here is wide (e.g. doctrines)";
    else if (tech.forceSmallLayout) msg = "▢ Small square — forced";
    else if (hasEquip) msg = "▭ Wide box — unlocks equipment";
    else msg = "▢ Small square — no equipment unlocked";
    el.textContent = msg;
  }
  // Minimum pixel position for dragged nodes (keeps them inside visible canvas area)
  const DRAG_MIN_TOP = YEAR_BAR_H + 20;
  const DRAG_MIN_LEFT = 10;
  // In a VERTICAL (UP) tree the year labels become a rail pinned down the LEFT edge, so the
  // leftmost tech must clear that rail or it renders behind the years (e.g. MD's artillery
  // nsb_fire_modes_2). Horizontal trees keep the small left margin (their year rail is at the top).
  const YEAR_RAIL_W = 64;
  function minLeftForLayout(layout) {
    return layout === "vertical" ? YEAR_RAIL_W : DRAG_MIN_LEFT;
  }

  // Effective origins — recomputed per renderCanvas() call so negative-x vanilla
  // techs (HOI4 uses x=-9 in artillery_folder) always render below the year bar.
  let effectiveOriginX = 450;
  let effectiveOriginY = 160;
  // Folders actually drawn for the active tab. A tab can group several folders; some genuinely
  // coexist (the 4 doctrine trees sit in different lanes), but DLC variants OVERLAY each other
  // (e.g. bba_air_techs_folder stacks on air_techs_folder). We draw the coexisting ones and drop
  // the overlapping variant so techs never render on top of each other. Recomputed per render.
  let currentVisibleFolders = [];
  // Tech IDs hidden by the DLC filter (their own allow_branch/allow/available has_dlc gate fails for the
  // owned-DLC set — e.g. nsb_* artillery when "No Step Back" is off, or the base anti-air branch when it's
  // on). Recomputed each render. DISPLAY-ONLY: allTechs (and therefore the save list) is never touched.
  let dlcHiddenTechIds = new Set();
  // For folders that are KEPT but still partly collide (naval-support over naval; nsb-armour over
  // armour), push them into their own lane band below the others. Map: folder -> lane offset.
  let folderLaneOffset = {};

  // Which grid coordinate maps to the horizontal (screen-x) axis — the axis a WIDE item extends
  // along. Horizontal trees: the era axis (tech.y). Vertical trees: the lane axis (tech.x).
  // INTEGER SLOT INDICES (#int-slot). A folder position is a SLOT index, and HOI4 parses it as an integer —
  // a fraction in the file is truncated, not honoured as a half-step. MD authors 13 such techs (the BBA
  // airframe rows at @row0=-8.5/-6.5/-4.5 and one naval tech at y=12.5); vanilla never does. Drawing them at
  // the literal fraction put every airframe row half a slot (35px) off, which is exactly the amount by which
  // their three section labels sat INSIDE the first box — and truncating lands all three flush on their row,
  // the same signature that proved the anchor-centering rule. Truncate at RENDER only: the model keeps the
  // authored value so a save can never rewrite the mod's own "-8.5" into "-8".
  const slotIdx = (v) => Math.trunc(Number(v) || 0);
  function screenXCoordOf(tech, layout) { return slotIdx(layout === "horizontal" ? tech.y : tech.x); }
  function screenYCoordOf(tech, layout) { return slotIdx(layout === "horizontal" ? tech.x : tech.y); }

  // (The old "column model" — widening wide-item columns — is gone: the game packs boxes at the raw slot grid,
  //  so there is nothing to compute. #accurate-only)

  // ── PER-CHAIN GRIDBOX FRAMES (the engine's real model) ─────────────────────────────────────────────
  // In-game every prerequisite chain hangs off its OWN gridbox: pixel = gridbox.position + slot × its
  // slotsize. The pixel ORIGINS are how the game separates chains — collapsing all chains onto one grid
  // interleaved unrelated trees and made boxes overlap (81 phantom overlaps on MD's civilian tab; the
  // game has none). A root tech (no prereq inside its folder) belongs to the gridbox named after it
  // (vanilla/MD convention: "<rootId>_tree" or the bare id); descendants inherit their parent's. The
  // folder's FIRST gridbox is the base frame (single-gridbox folders keep zero delta). #gridbox-origins
  let techGbMap = new Map(); // tech.id → gridbox entry (null/absent = base frame)
  // Techs the ENGINE cannot place: in a multi-gridbox folder, a chain that resolves to NO gridbox (no path in,
  // no gridbox named after its root) is not drawn by the game at all — MD's civilian "commercial
  // nanomanufacturing" branch (5 techs) is authored that way, which is why the game shows no overlap where we
  // drew one. Treat them exactly like hidden techs: not rendered, surfaced dimmed under the 👁 toggle so the
  // modder can find and FIX them. #gridbox-unplaced
  let gbUnplacedIds = new Set();
  function rebuildTechGridboxMap() {
    techGbMap = new Map();
    gbUnplacedIds = new Set();
    currentVisibleFolders.forEach((f) => {
      const gbs = (guiLayout[f] && guiLayout[f].gridboxes) || [];
      if (gbs.length <= 1) return;
      const inFolder = allTechs.filter((t) => t.folder === f && !t.isSubTech);
      const byId = new Map(inFolder.map((t) => [t.id, t]));
      const gbByName = new Map();
      gbs.forEach((g) => {
        if (!g.name) return;
        gbByName.set(g.name, g);
        if (/_tree$/i.test(g.name)) gbByName.set(g.name.replace(/_tree$/i, ""), g);
      });
      const parentIdsOf = (t) => {
        const out = [];
        for (const pr of (t.prerequisites || [])) {
          if (pr.type === "OR") { for (const id of (pr.techs || [])) if (byId.has(id)) out.push(id); }
          else if (pr.tech && byId.has(pr.tech)) out.push(pr.tech);
        }
        return out;
      };
      // A tech belongs to the gridbox its chain resolves to. Try EVERY in-folder parent in path order until one
      // resolves — following only the first parent let a multi-parent tech dead-end on a gridbox-less branch and
      // silently fall to the base frame, parking its whole chain ~30px off its real origin (the phantom civilian
      // overlaps). Own-name match is the root rule and the last resort for mid-chain gridbox names. #gridbox-origins
      const resolve = (t, depth) => {
        if (techGbMap.has(t.id)) return techGbMap.get(t.id);
        if (depth > 60) return null; // cycle guard — malformed prereq loops must not hang the render
        techGbMap.set(t.id, null);   // provisional (breaks cycles)
        let gb = null;
        for (const pid of parentIdsOf(t)) {
          gb = resolve(byId.get(pid), depth + 1);
          if (gb) break;
        }
        if (!gb) gb = gbByName.get(t.id) || gbByName.get(t.id + "_tree") || null;
        techGbMap.set(t.id, gb);
        return gb;
      };
      inFolder.forEach((t) => resolve(t, 0));
      // A tech that resolves to NO gridbox is "engine-unplaced" — the game doesn't draw it, so we hide it
      // (dimmed under 👁). EXCEPT a tech the user is actively creating/editing (dirty): "+ Add Tech Node"
      // makes a root with no prereq + a name matching no gridbox, so it would be born INVISIBLE (the user
      // clicks Add and nothing appears). Keep dirty techs visible at the folder's base frame so they can be
      // seen, positioned, and linked; once linked to a chain (or saved into a custom folder whose gridboxes
      // are regenerated) they resolve normally. #new-tech-visible
      inFolder.forEach((t) => { if (!techGbMap.get(t.id) && !dirtyTechIds.has(t.id)) gbUnplacedIds.add(t.id); });
    });
  }
  // The pixel frame a tech renders in: delta from the folder's base gridbox origin + its own slot size.
  function techFrame(tech) {
    const gbs = (tech && tech.folder && guiLayout[tech.folder] && guiLayout[tech.folder].gridboxes) || [];
    const base = gbs[0] || null;
    // ANCHOR-CENTERING (#anchor-centering): each gridbox carries shiftX/shiftY from the server — the
    // (size - slotsize)/2 cross-axis centering the game applies for format="UP"/"LEFT" when a size is
    // declared. It's part of the tech's GAME PIXEL, so it's added on top of gb.x here while labels/years
    // keep mapping through the RAW base origin — that relative offset is exactly what the game renders
    // (naval row headers land flush on their rows; air helicopter columns clear the year rail).
    // A tech with no resolved gridbox (fresh/dirty) inherits the BASE frame including its shift, so it
    // lands inside the same shifted grid its coords will belong to.
    const gb = (tech && techGbMap.get(tech.id)) || base;
    return {
      dx: gb && base ? (gb.x + (gb.shiftX || 0)) - base.x : 0,
      dy: gb && base ? (gb.y + (gb.shiftY || 0)) - base.y : 0,
      stepX: (gb && gb.slotW) || SMALL_STEP,
      stepY: (gb && gb.slotH) || CELL_H,
    };
  }
  // The item-container offset that re-anchors a box on its cell in-game (wide is {-56,-7} in vanilla — it
  // CENTERS the 183×84 box on a 70×70 cell; a folder's gui overrides win). Small boxes are usually {0,0}.
  function boxOffset(tech) {
    const gl = tech && tech.folder ? guiLayout[tech.folder] : null;
    const b = gl ? (isLargeTech(tech) ? gl.wideBox : gl.smallBox) : null;
    if (b) return { x: b.offX || 0, y: b.offY || 0 }; // the gui defined this box — trust its offset fully (even 0,0)
    return isLargeTech(tech) ? { x: -56, y: -7 } : { x: 0, y: 0 };
  }
  // Stack partly-colliding folders into separate lane bands (horizontal trees only — the lane axis
  // is screen-y there, which is uniform and easy to offset). Biggest folder stays at its real
  // lanes; a later folder that collides with it is pushed below. Folders that don't collide (the
  // doctrine trees) keep their real lanes.
  function computeFolderLaneOffsets() {
    folderLaneOffset = {};
    if (getActiveLayout() !== "horizontal") return; // lane axis isn't a clean uniform axis when vertical
    const folders = currentVisibleFolders;
    if (folders.length <= 1) return;
    const byFolder = {};
    folders.forEach((f) => { byFolder[f] = allTechs.filter((t) => t.folder === f && !t.isSubTech && !dlcHiddenTechIds.has(t.id) && !gbUnplacedIds.has(t.id)); });
    const sorted = [...folders].filter((f) => byFolder[f].length).sort((a, b) => byFolder[b].length - byFolder[a].length);
    const occupied = new Set(); // "year,lane" already taken (lane = tech.x, after offset)
    let maxLane = -Infinity, placedAny = false;
    sorted.forEach((f) => {
      const techs = byFolder[f];
      const collides = techs.some((t) => occupied.has(`${t.y},${t.x}`));
      let offset = 0;
      if (placedAny && collides) {
        const minLane = Math.min(...techs.map((t) => t.x));
        offset = (maxLane + 2) - minLane;
      }
      folderLaneOffset[f] = offset;
      techs.forEach((t) => occupied.add(`${t.y},${t.x + offset}`));
      maxLane = Math.max(maxLane, ...techs.map((t) => t.x + offset));
      placedAny = true;
    });
  }

  // Pixel X of a screen-x coordinate. Pure slot math — the game packs wide equipment boxes at the raw slot grid
  // (they overlap into neighbours in-game too); there is NO artificial column widening. #accurate-only
  function screenXForCoord(coord) {
    return effectiveOriginX + coord * SMALL_STEP;
  }
  // Invert screenXForCoord for drag snapping (monotonic, so scan the plausible coord range).
  function coordForScreenX(px) {
    let best = 0, bestDiff = Infinity;
    for (let c = -30; c <= 80; c++) {
      const d = Math.abs(screenXForCoord(c) - px);
      if (d < bestDiff) { bestDiff = d; best = c; }
    }
    return best;
  }

  function computeEffectiveOrigins() {
    currentVisibleFolders = getVisibleFoldersForTab(activeTab);
    // Set the per-coord spacing for THIS render before any screenXForCoord/getTechTop runs: ALWAYS the folder's
    // REAL gridbox slotsize (pixel = origin + slot × slotsize — the game's own layout model; 70×70 vanilla default,
    // MD armour 50×70, MD civilian/electronics 60×60). The whole pixel layer reads SMALL_STEP/CELL_H live, so this
    // one assignment reflows the entire tree. #accurate-only
    {
      const f0 = currentVisibleFolders[0];
      const ss = (f0 && guiLayout[f0] && guiLayout[f0].slotsize) || null;
      SMALL_STEP = (ss && Number(ss.width)) || 70;
      CELL_H = (ss && Number(ss.height)) || 70;
    }
    refreshDetectedYearCols();
    rebuildTechGridboxMap(); // per-chain frames + unplaced set must exist before ANY filter below #gridbox-origins
    computeFolderLaneOffsets();
    // The origin must reserve room for everything the RENDERER draws — mirror its predicate exactly. With the
    // 👁 hidden-techs toggle on, hidden / DLC-gated / engine-unplaced techs are drawn too
    // (dimmed); counting only the unhidden ones left those extras at negative canvas coords, outside the
    // scrollable area where they could never be reached. #canvas-bleed
    const vis = allTechs.filter(t => currentVisibleFolders.includes(t.folder) && !t.isSubTech &&
      (SHOW_HIDDEN_TECHS || (!t.isHidden && !dlcHiddenTechIds.has(t.id) && !gbUnplacedIds.has(t.id))));
    const layout = getActiveLayout();
    // Negative-coord push, in PIXEL space: a tech's offset from the base origin is gbΔ + slot × its own
    // gridbox slotsize, so the minimum must be taken over the per-tech frames, not raw slot units.
    // boxOffset is included because a wide plate hangs LEFT of its slot (−56 infantry, −131 naval): without
    // it the leftmost plate bleeds off the canvas edge by that much. #canvas-bleed
    let minPxX = Infinity, minPxY = Infinity;
    vis.forEach((t) => {
      // PER-TECH layout, exactly like getTechLeft/getTechTop. The tab-level getActiveLayout() is NOT the same
      // thing: a tech's axis mapping comes from its own gridbox `format`, so a folder whose format disagrees
      // with the tab orientation had its extent measured on the WRONG axis — Road to 56's Etax measured the
      // era axis (min −35) while the renderer placed by lane (−980), so 6 elements landed ~283px off the
      // left edge of the canvas, unreachable. #canvas-bleed
      const tl = getTechLayout(t);
      const fr = techFrame(t), off = boxOffset(t);
      minPxX = Math.min(minPxX, fr.dx + screenXCoordOf(t, tl) * fr.stepX + off.x);
      minPxY = Math.min(minPxY, fr.dy + screenYCoordOf(t, tl) * fr.stepY + off.y);
    });
    // Reserve headroom above the TOPMOST content — techs AND section subtitles — so nothing clips into/above the
    // year strip. Subtitles are authored ABOVE the first gridbox (at the container top) in BOTH orientations
    // (vertical trees stack them across the top), so we fold each label's gb0-relative offset into the SAME frame
    // as the tech rows instead of the old fixed, horizontal-only 42px guess (which left vertical labels clipped
    // once the de-overlap clamp was removed). #label-bleed
    let minContentY = minPxY;
    // …and the SAME on the horizontal axis. This used to consider techs only, so a folder whose section
    // labels or year rails are authored LEFT of its first gridbox pushed them to negative canvas x — off the
    // scrollable area entirely, invisible and unreachable (Road to 56's Etax tab put 13 elements out there,
    // its Armour years at −76). Labels and years are placed at `origin + (authored − gb0)`, so that same
    // expression is their offset in this frame. #canvas-bleed
    let minContentX = minPxX;
    const pf = currentVisibleFolders[0];
    const gb0h = ((guiLayout[pf] || {}).gridboxes || [])[0];
    const band = (folderLaneOffset[pf] || 0) * CELL_H;
    if (SHOW_GUI_LABELS) {
      const labs = researchGuiLabelsByFolder[pf];
      if (gb0h && Array.isArray(labs) && labs.length) {
        labs.forEach((l) => {
          minContentY = Math.min(minContentY, (l.y - gb0h.y) + band);
          minContentX = Math.min(minContentX, l.x - gb0h.x);
        });
      } else if (layout !== "vertical") {
        minContentY = Math.min(minContentY, minPxY - 42); // legacy fallback for frameless horizontal tabs
      }
    }
    // YEAR stamps are authored ABOVE the first gridbox too (e.g. infantry years at y=50, gb0 at y=325 → offset
    // −275). Fold them into the same top-content bound so the origin reserves room and they aren't clipped off
    // the top of the canvas now that they render at their exact pixels instead of a pinned rail. #year-objects
    if (SHOW_GUI_YEARS && gb0h && Array.isArray((guiLayout[pf] || {}).years)) {
      guiLayout[pf].years.forEach((yv) => {
        const n = Number(yv.year);
        if (n < 1800 || n > 2200) return;
        minContentY = Math.min(minContentY, (yv.y - gb0h.y) + band);
        minContentX = Math.min(minContentX, yv.x - gb0h.x);
      });
    }
    // The BACKGROUND ART's authored pane is content too, now that it draws at its real size and position
    // instead of being stretched over the whole canvas (#bg-size-natural). MD's infantry pane starts at
    // y=0 against a gridbox at y=325, so without this the origin reserved 26px too little and the top of
    // the artwork was clipped off the canvas — the same class of bleed the techs had. #canvas-bleed
    if (SHOW_RESEARCH_BG && gb0h && (guiLayout[pf] || {}).canvas && (guiLayout[pf] || {}).bgSprite) {
      const pane = guiLayout[pf].canvas;
      minContentY = Math.min(minContentY, (pane.y - gb0h.y) + band);
      minContentX = Math.min(minContentX, pane.x - gb0h.x);
    }
    // No reserved year strip anymore — the origin only needs to push the topmost content (techs, labels,
    // year stamps) fully onto the canvas plus a small pad. The old 160px floor came from the retired rail. #year-objects
    effectiveOriginY = Math.max(60, CANVAS_TOP_PAD + Math.max(0, -minContentY));
    // Same for x: push the LEFTMOST content fully onto the canvas. A folder with no visible techs still has
    // labels/years to place, so this no longer bails out to a blind constant. #canvas-bleed
    if (!isFinite(minContentX)) minContentX = 0;
    effectiveOriginX = Math.max(450, minLeftForLayout(layout) + Math.max(0, -minContentX));
    // Diagnostics for tools-tree-snap / probes: lets a harness verify the canvas actually contains every
    // element instead of eyeballing it. Read-only, no behaviour. #canvas-bleed
    try {
      window.__novaOrigin = { x: effectiveOriginX, y: effectiveOriginY, minContentX, minContentY,
        minPxX, minPxY, visCount: vis.length, layout, folder: pf, minLeft: minLeftForLayout(layout) };
    } catch (_) {}
  }



  function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  // Active mod path
  function getModPath() {
    return localStorage.getItem("activeModPath") || "";
  }

  // Show the "viewing vanilla (read-only)" banner when the active mod is the base game,
  // matching the other maker tabs (Country Setup, Characters, Spirits…).
  function updateVanillaBanner() {
    const banner = document.getElementById("vanillaBanner");
    const selector = document.getElementById("headerModSelector");
    if (!banner || !selector) return;
    const opt = selector.options[selector.selectedIndex];
    // The dataset flag alone — the name test that used to be OR'd in here showed the read-only
    // "You are viewing Vanilla Game Files" banner over the user's own "Vanilla Plus" mod.
    const isVanilla = !!(opt && opt.dataset.vanilla === "1");
    banner.style.display = isVanilla ? "" : "none";
  }

  // Mod selector initialization
  async function initModSelector() {
    const selector = document.getElementById("headerModSelector");
    if (!selector) return;
    try {
      const response = await fetch("/api/mods/list");
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      selector.innerHTML = "";
      if (!data.mods || data.mods.length === 0) {
        selector.innerHTML = `<option value="">-- No Mods Found --</option>`;
        return;
      }
      
      let active = localStorage.getItem("activeModPath") || "";
      data.mods.forEach(mod => {
        const opt = document.createElement("option");
        opt.value = mod.path;
        opt.textContent = mod.name;
        // ⛔ THE MOD'S NAME IS NOT EVIDENCE. /api/mods/list publishes `isVanilla`, a PATH-based flag, and
        // server.js's own comment beside it says clients must key off that and "NOT a 'vanilla' substring in
        // the name, which false-positives on real mods like 'Vanilla Plus' / 'Improved Vanilla'". This file
        // never adopted it, and the consequence is not cosmetic: a mod called "Vanilla Plus" was treated as
        // the read-only base game, so saveAllChanges refused every research edit with "Cannot save changes
        // while 'Vanilla Game Files' is selected. Please select or create a custom mod first" — advice the
        // user has already followed, and which nothing they can do will clear. At quit it is worse: Save
        // returns false, main.js shows "Save Failed" and keeps the window open, so the only ways out are
        // Cancel or Don't Save. The session's work can only be discarded.
        //
        // The path check stays as a fallback for an older server that does not send the flag.
        if (mod.isVanilla === true
          || (mod.isVanilla === undefined && normalizePath(mod.path).includes('steamapps/common/hearts of iron iv'))) {
          opt.dataset.vanilla = '1';
        }
        if (active && normalizePath(mod.path) === normalizePath(active)) {
          opt.selected = true;
          active = mod.path;
          localStorage.setItem("activeModPath", active);
        }
        selector.appendChild(opt);
      });

      // A stored mod missing from THIS list is usually a TRANSIENT enumeration miss (Steam re-validating a
      // workshop item, the library drive not mounted yet, a swallowed getWorkshopModDirs error → 200 without
      // the mod). Do NOT blank + persist the vanilla fallback over a non-empty selection — that turns every
      // custom sprite into the beige idea_unknown placeholder and STICKS across reloads. Keep the stored value
      // (it self-heals when the mod reappears) and show it as a "(not detected)" placeholder so the selector
      // isn't blank. Only adopt+persist a default when nothing was stored.
      if (active && !data.mods.some(m => normalizePath(m.path) === normalizePath(active))) {
        const opt = document.createElement("option");
        opt.value = active;
        opt.textContent = (String(active).split(/[\\/]/).filter(Boolean).pop() || active) + " (not detected)";
        selector.insertBefore(opt, selector.firstChild);
      }
      if (!active && data.mods.length > 0) {
        // #vanilla-by-name — the flag, not the name. Matching on the name here would pick a mod called
        // "Vanilla Plus" as the default selection on a first run, which then trips every read-only path.
        const vanilla = data.mods.find((m) => m.isVanilla === true);
        active = (vanilla || data.mods[0]).path;
        localStorage.setItem("activeModPath", active);
      }
      selector.value = active;
      updateVanillaBanner();

      // GUARD THE MOD SWITCH (#modswitch-guard). Changing mods reloads the whole catalog — indirectly,
      // via refreshCountryList -> loadCountryTechs -> loadCatalog — which throws away every unsaved edit
      // WITHOUT ASKING. Verified live: drag a tech in Millennium Dawn, switch to another mod, and the
      // tree silently reloads with dirty=false and the undo history emptied; the work is simply gone.
      // The page already confronts you for a plain F5 reload, so staying silent for the far more likely
      // action was the inconsistency. (The reload does at least mean the editor never holds mod A's techs
      // while pointed at mod B, so this is lost work, not cross-mod corruption.)
      let lastModPath = active;
      const applyModSwitch = async (value) => {
        lastModPath = value;
        localStorage.setItem("activeModPath", value);
        updateVanillaBanner();
        if (typeof window.loadGenesisScriptedDefs === "function") window.loadGenesisScriptedDefs();
        await refreshCountryList();
      };
      selector.addEventListener("change", async (e) => {
        const next = e.target.value;
        if (!dirty || next === lastModPath) { await applyModSwitch(next); return; }
        // Put the selector back until the user actually agrees, so cancelling leaves everything as it was.
        e.target.value = lastModPath;
        const proceed = () => { dirty = false; selector.value = next; applyModSwitch(next); };
        const msg = "You have unsaved changes in the Research Tree. Switch mod anyway and lose them?";
        if (window.novaConfirm) {
          window.novaConfirm(msg, proceed, { title: "Unsaved changes", yesLabel: "Switch (discard)", cancelLabel: "Keep editing", danger: true });
        } else if (confirm(msg)) { proceed(); }
      });
    } catch (err) {
      console.error("Failed to init mod selector:", err);
    }
  }

  // Country selector initialization
  async function initCountrySelector() {
    const selector = document.getElementById("headerCountrySelector");
    if (!selector) return;
    
    // #country-switch-discards-the-tree — THIS THREW AWAY THE WHOLE TREE WITHOUT ASKING.
    //
    // loadCountryTechs() ends in await loadCatalog() on both of its paths, and loadCatalog re-reads
    // everything from the server: allTechs, dirtyTechIds, pendingDeletions, the staged label and year edits.
    // So picking another country from the header discarded every unsaved change on the page — a dragged
    // tech, a rename, a queued deletion — silently, while the mod dropdown ninety lines above asks first.
    // The same guard, one caller short.
    //
    // Shaped exactly like that sibling: put the selector back BEFORE asking, so cancelling leaves the header
    // naming the country that is actually loaded.
    selector.addEventListener("change", (e) => {
      const next = e.target.value;
      const applyCountrySwitch = (tag) => {
        activeCountryTag = tag;
        localStorage.setItem("activeCountryTag", activeCountryTag);
        loadCountryTechs();
      };
      if (!dirty || next === activeCountryTag) { applyCountrySwitch(next); return; }
      e.target.value = activeCountryTag;
      const proceed = () => {
        dirty = false;
        // The starting-tech ticks belonged to the country being left. Discarding them means this save must
        // not carry them over to the next country's history file.
        countryTechsDirty = false;
        selector.value = next;
        applyCountrySwitch(next);
      };
      const msg = "You have unsaved changes in the Research Tree. Switch country anyway and lose them?";
      if (window.novaConfirm) {
        window.novaConfirm(msg, proceed, { title: "Unsaved changes", yesLabel: "Switch (discard)", cancelLabel: "Keep editing", danger: true });
      } else if (confirm(msg)) { proceed(); }
    });
    
    await refreshCountryList();
  }

  // ── Per-country research lock (#1) ────────────────────────────────────────────────────────────
  // A tech "belongs" to one country when it carries `allow_branch = { original_tag = TAG }` — only that
  // country can see/research it (the rest see an empty/locked tab). We ride the tech's extraScript
  // passthrough (allow_branch isn't serialized separately, so it round-trips), with NO change to the
  // crash-sensitive tech writer. We only manage a SIMPLE country-only gate; a complex allow_branch (with
  // other conditions) is left untouched in extraScript.
  const COUNTRY_GATE_RE = /(?:^|\n)?\s*allow_branch\s*=\s*\{\s*(?:original_tag|tag)\s*=\s*([A-Za-z0-9]{2,3})\s*\}/i;
  function extractCountryLock(extraScript) {
    const m = String(extraScript || "").match(COUNTRY_GATE_RE);
    return m ? m[1].toUpperCase() : "";
  }
  function stripCountryLock(extraScript) {
    return String(extraScript || "").replace(COUNTRY_GATE_RE, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim().length > 0).join("\n");
  }
  function populateTechCountryLock(countries) {
    const sel = document.getElementById("techCountryLock");
    if (!sel) return;
    const prev = sel.value;
    const list = (countries || []).slice();
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const opt = (c) => {
      const name = c.displayName && c.displayName.toUpperCase() !== String(c.tag).toUpperCase() ? `${c.displayName} (${c.tag})` : c.tag;
      return `<option value="${esc(c.tag)}">${esc(name)}${c.isMod ? " — Your Mod" : ""}</option>`;
    };
    const mod = list.filter((c) => c.isMod).sort((a, b) => String(a.tag).localeCompare(b.tag));
    const van = list.filter((c) => !c.isMod).sort((a, b) => String(a.tag).localeCompare(b.tag));
    let html = `<option value="">Any country (everyone)</option>`;
    if (mod.length) html += `<optgroup label="Your mod's countries">${mod.map(opt).join("")}</optgroup>`;
    if (van.length) html += `<optgroup label="Vanilla countries">${van.map(opt).join("")}</optgroup>`;
    sel.innerHTML = html;
    if (prev && Array.prototype.some.call(sel.options, (o) => o.value === prev)) sel.value = prev;
  }

  async function refreshCountryList() {
    const selector = document.getElementById("headerCountrySelector");
    if (!selector) return;
    const container = document.querySelector(".country-selector-container");
    const modSelector = document.getElementById("headerModSelector");
    const isVanilla = modSelector && modSelector.options[modSelector.selectedIndex]?.dataset.vanilla === '1';

    try {
      const activeRoot = getModPath();
      const response = await fetch(`/api/countries/catalog?modPath=${encodeURIComponent(activeRoot)}`);
      const countries = await response.json();
      populateTechCountryLock(countries); // keep the per-tech "Limit to one country" picker in sync

      selector.innerHTML = "";
      
      let filteredCountries = countries || [];
      if (!isVanilla) {
        filteredCountries = (countries || []).filter(c => c.isMod);
      }

      // ?tag= (the map's country card) names the country to open. #country-card
      let urlTag = "";
      try { urlTag = String(new URLSearchParams(location.search).get("tag") || "").trim().toUpperCase(); } catch (_) { urlTag = ""; }
      const hasUrlTag = !!urlTag && (filteredCountries || []).some(c => c.tag === urlTag);
      // Asked for a country this page does not list (one the mod inherits from the game, not one it defines): say so,
      // rather than quietly showing another country's technologies — or none — under the one the user clicked.
      const noteUnlistedTag = (instead) => {
        if (!urlTag || hasUrlTag) return;
        const statsEl = document.getElementById("countryTechStats");
        const note = `${urlTag} is not one of your mod's own countries, so Research does not edit its starting technologies` + (instead ? ` — showing ${instead} instead.` : ".");
        if (statsEl) statsEl.textContent = note + (instead && statsEl.textContent ? " · " + statsEl.textContent : "");
      };
      // Spent once used: a later refresh (the header's mod switch) must not force it over the user's own pick again.
      const forgetUrlTag = () => {
        if (!urlTag) return;
        try { const u = new URL(location.href); u.searchParams.delete("tag"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch (_) {}
      };

      if (!filteredCountries || filteredCountries.length === 0) {
        if (container) container.style.display = "flex";
        selector.innerHTML = `<option value="" disabled selected>— No countries in this mod yet —</option>`;
        activeCountryTag = "";
        const statsEl = document.getElementById("countryTechStats");
        if (statsEl) {
          statsEl.textContent = "No custom countries in this mod. Starting technology slots can still be researched normally!";
        }
        await loadCountryTechs();
        noteUnlistedTag("");
        forgetUrlTag();
        return;
      }
      
      if (container) container.style.display = "flex";
      // Sort alphabetically
      filteredCountries.sort((a, b) => a.tag.localeCompare(b.tag));
      
      filteredCountries.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.tag;
        opt.textContent = `${c.tag} — ${c.displayName || c.tag}`;
        selector.appendChild(opt);
      });
      
      // Default selection: ?tag= (the map's country card) > localStorage tag > TST (test env) > the mod's own country > GER
      // > first. #country-card
      if (hasUrlTag) localStorage.setItem("activeCountryTag", urlTag);
      const savedTag = localStorage.getItem("activeCountryTag");
      const hasSaved = savedTag && filteredCountries.some(c => c.tag === savedTag);
      const hasTst = filteredCountries.some(c => c.tag === "TST");
      const firstModCountry = filteredCountries.find(c => c.isMod);
      const hasGer = filteredCountries.some(c => c.tag === "GER");
      
      selector.value = hasSaved ? savedTag
        : (hasTst ? "TST"
        : (firstModCountry ? firstModCountry.tag
        : (hasGer ? "GER" : filteredCountries[0].tag)));
      activeCountryTag = selector.value;
      
      await loadCountryTechs();
      noteUnlistedTag(activeCountryTag);
      forgetUrlTag();
    } catch (err) {
      console.error("Failed to refresh country selector:", err);
    }
  }

  // Load startup technologies for selected country tag
  async function loadCountryTechs() {
    if (!activeCountryTag) {
      countryResearchedTechs.clear();
      const statsEl = document.getElementById("countryTechStats");
      if (statsEl) statsEl.textContent = "Select a country to load starting techs.";
      await loadCatalog();
      updateSidebar();
      return;
    }
    const activeRoot = getModPath();
    try {
      const res = await fetch(`/api/technologies/country-techs?tag=${activeCountryTag}&modPath=${encodeURIComponent(activeRoot)}`);
      const data = await res.json();
      countryResearchedTechs = new Set(data.techs || []);
      ideasResearchSpeedBonus = data.ideasResearchSpeedBonus || 0.0;
      const statsEl = document.getElementById("countryTechStats");
      if (statsEl) {
        const gameN = (data.fromGame || []).length;
        const modN = (data.fromMod || []).length;
        const total = (data.techs || []).length;
        statsEl.textContent = `${total} at game start — ${gameN} from game files, ${modN} mod-only`;
      }

      await loadCatalog();
      updateSidebar();
    } catch (err) {
      console.error("Failed to load country starting technologies:", err);
    }
  }

  // The name HOI4 will actually put on the tab. It reads it from a localisation key equal to the folder key,
  // and the derived-from-key name disagrees with it far more often than you would guess: 8 of vanilla's 17
  // named folders (Electronics/Engineering, Air Techs/Air, Armour/Armor) and 8 of Millennium Dawn's 15
  // (Civilian/Industrial Technology, Cruise Missiles/Guided Missile Technology). Show what the player sees;
  // fall back to the derived name only where the game has no entry either. #tab-name-not-the-game-s
  function gameFolderName(folder) {
    const v = guiFolderNames && guiFolderNames[folder];
    return (typeof v === "string" && v.trim()) ? v : prettyFolderName(folder);
  }
  function prettyFolderName(folder) {
    // Strip the DLC-variant prefixes/suffixes so a variant folder reads like the game's tab name
    // (nsb_armour_folder → "Armour", bba_aircraft_folder → "Aircraft", missile_non_got_folder →
    // "Missile"). Only one variant is ever shown at a time (DLC gate), so there's no name clash.
    let base = String(folder || "")
      .replace(/_?folder$/i, "")          // "_folder" OR run-on "folder" (vanilla's mtgnavalfolder)
      .replace(/^(nsb|bba|mtg)_?/i, "")    // variant prefix, with or without an underscore
      .replace(/_non_got$/i, "")
      .replace(/_/g, " ")
      .replace(/\b(naval|air|land)(support|techs|forces)\b/i, "$1 $2") // split run-ons: navalsupport → naval support
      .trim();
    return base.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // One editor tab per game folder — exactly the game's research tab strip. Built from
  // common/technology_tags (the game's real tab list, in its order), each tab carrying the
  // orientation read from the GUI's own year stamps. Folders with no techs in this mod get no tab
  // (mirrors the game hiding unavailable folders in practice).
  function buildGameFolderTabs() {
    gameFolderTabs = [];
    if (!Array.isArray(guiAllFolders) || !guiAllFolders.length) return;
    const counts = {};
    allTechs.forEach((t) => { if (!t.isSubTech && t.folder) counts[t.folder] = (counts[t.folder] || 0) + 1; });
    guiAllFolders.forEach((folder) => {
      if (!counts[folder]) return;
      if (!folderPassesDlc(folder)) return; // DLC gate (e.g. hide armour_folder when "No Step Back" is on)
      // `doctrine = yes` folders never render on the game's RESEARCH tree (post-NSB doctrines live in the
      // Officer Corps screen; special_forces_doctrine_folder is even ledger=hidden) — and their flow-layout
      // techs would pile every branch onto the same cells here. Skip them, matching the game. #doctrine-folder-hidden
      if ((guiFolderAvailability[folder] || {}).doctrine) return;
      const gl = guiLayout[folder] || {};
      gameFolderTabs.push({
        key: "ftab_" + folder,
        folder,
        name: gameFolderName(folder),
        layout: gl.orientation || (/doctrine/i.test(folder) ? "vertical" : "horizontal"),
        gameTab: true,
      });
    });
  }

  // ── DLC filter ────────────────────────────────────────────────────────────────────────────────
  // Which DLCs we treat as owned. Defaults to ALL referenced (modern Millennium Dawn assumes them);
  // the DLC button lets the user toggle to see exactly the layout their own game shows.
  function activeDlcsKey() { return `research_active_dlcs_${getModPath() || "vanilla"}`; }
  function loadActiveDlcs() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(activeDlcsKey())); } catch (_) {}
    if (saved && Array.isArray(saved.on) && Array.isArray(saved.known)) {
      // New format: keep the user's choice for DLCs they've already seen; any DLC that's NEW since they
      // last saved (e.g. "La Resistance" surfacing from tech-level gates after a tech scan) defaults ON,
      // so its techs aren't silently hidden. (known = the DLC list present at save time.)
      const on = new Set(saved.on), known = new Set(saved.known);
      activeDlcs = new Set(guiDlcs.filter((d) => (known.has(d) ? on.has(d) : true)));
    } else {
      // No saved prefs, or the legacy on-list-only format (pre-`known`): default ALL DLCs on. This filter
      // is new, so any legacy value is essentially the initial all-on state; migrating to all-on avoids
      // leaving a newly-surfaced DLC (and its techs) hidden. saveActiveDlcs() then records `known`.
      activeDlcs = new Set(guiDlcs);
    }
  }
  function saveActiveDlcs() {
    // Persist BOTH the on-set and the DLC list we knew about, so a later-discovered DLC can default ON.
    try { localStorage.setItem(activeDlcsKey(), JSON.stringify({ on: [...(activeDlcs || [])], known: [...guiDlcs] })); } catch (_) {}
  }
  // Evaluate a DLC gate ({requireDlc:all needed, forbidDlc:any hides, requireAnyDlc:[[≥1 of each group]]})
  // against the owned-DLC set — exactly the rule the game applies. requireAnyDlc is for OR{} gates like
  // vanilla's special_forces_doctrine_folder (Arms Against Tyranny OR No Compromise, No Surrender).
  // Can this gate expression still be TRUE with the owned-DLC set fixed and every non-DLC condition free?
  // Returns {t: can be true, f: can be false}. Nodes: {d}=has_dlc atom, {n}=NOT, {a}=AND, {o}=OR,
  // null = no DLC content (free both ways). #dlc-expr
  function dlcExprSat(e, on) {
    if (e == null) return { t: true, f: true };
    if (e.d) { const v = on.has(e.d); return { t: v, f: !v }; }
    if (e.n) { const k = dlcExprSat(e.n, on); return { t: k.f, f: k.t }; }
    if (e.a) { const ks = e.a.map((k) => dlcExprSat(k, on)); return { t: ks.every((k) => k.t), f: ks.some((k) => k.f) }; }
    if (e.o) { const ks = e.o.map((k) => dlcExprSat(k, on)); return { t: ks.some((k) => k.t), f: ks.every((k) => k.f) }; }
    return { t: true, f: true };
  }
  function gatePasses(gate, on) {
    if (!gate) return true;
    // Prefer the nesting-aware expression: flat require/forbid lists cannot represent a DLC-conditional
    // FALLBACK (OR{ AND{has_dlc X …}  AND{NOT{has_dlc X} …} }), which is satisfiable in BOTH DLC states but
    // flattens to require-X AND forbid-X — a contradiction that hid the tech either way and took its whole
    // branch with it (MD's HELICOPTER OPERATORS naval line). Hide only when the gate is UNSATISFIABLE. #dlc-expr
    if (gate.dlcExpr) return dlcExprSat(gate.dlcExpr, on).t;
    for (const d of (gate.requireDlc || [])) if (!on.has(d)) return false;
    for (const d of (gate.forbidDlc || [])) if (on.has(d)) return false;
    for (const grp of (gate.requireAnyDlc || [])) if (grp.length && !grp.some((d) => on.has(d))) return false;
    return true;
  }
  // A folder is shown only when its technology_folders `available` gate passes for the owned-DLC set.
  function folderPassesDlc(folder) {
    return gatePasses(guiFolderAvailability[folder], activeDlcs || new Set(guiDlcs));
  }
  // Same gate, at the TECH level (a tech's own gate from its allow_branch/allow/available).
  function techPassesDlc(tech) {
    return gatePasses(tech, activeDlcs || new Set(guiDlcs));
  }
  // Recompute which techs the DLC filter hides. Faithful to the game: a tech is hidden when its OWN DLC
  // gate fails OR it can only be reached through hidden prerequisites — HOI4's `allow_branch` sits on a
  // branch's ROOT tech and gates the whole branch, so the gate must propagate down the prerequisite chain
  // (AND: any hidden parent hides the child; OR: only if every alternative parent is hidden). An ungated
  // tech with no gated ancestor is never hidden — we don't guess. No DLC data → hide nothing.
  // Pure: which techs the DLC filter hides. `passesDlc(tech)` = does this tech's OWN gate pass. Hiding
  // then propagates down the prereq chain the way HOI4 does: AND prereqs carry a single `tech`; OR
  // prereqs carry an ARRAY `techs` (any one satisfies). A tech is unreachable — so hidden — if ANY
  // required AND parent is hidden, OR if EVERY alternative in an OR group is hidden. (Earlier this
  // filtered OR prereqs on `p.tech`, which is undefined for them, so OR groups were silently ignored —
  // that left MD's base artillery_2 visible next to nsb_artillery_2, since its chain reaches an
  // OR[artillery_1, SP_arty_1] node both of whose alternatives the No Step Back gate hides.)
  function computeDlcHiddenSet(techs, passesDlc) {
    const hidden = new Set();
    const byId = new Map((techs || []).map((t) => [t.id, t]));
    const memo = new Map();
    const isHidden = (id, stack) => {
      if (memo.has(id)) return memo.get(id);
      const t = byId.get(id);
      if (!t) return false;             // unknown (e.g. base-mod) prereq → treat as available
      if (stack.has(id)) return false;  // cycle guard
      if (!passesDlc(t)) { memo.set(id, true); return true; }
      stack.add(id);
      const prereqs = t.prerequisites || [];
      let h = false;
      for (const p of prereqs) {
        if (!p) continue;
        if (p.type === "OR") {
          const ids = Array.isArray(p.techs) ? p.techs : (p.tech ? [p.tech] : []);
          if (ids.length && ids.every((pid) => isHidden(pid, stack))) { h = true; break; }
        } else {
          const pid = p.tech || (Array.isArray(p.techs) ? p.techs[0] : null);
          if (pid && isHidden(pid, stack)) { h = true; break; }
        }
      }
      stack.delete(id);
      memo.set(id, h);
      return h;
    };
    (techs || []).forEach((t) => { if (isHidden(t.id, new Set())) hidden.add(t.id); });
    return hidden;
  }
  try { window.__novaComputeDlcHidden = computeDlcHiddenSet; } catch (_) {}
  function recomputeDlcHiddenTechIds() {
    dlcHiddenTechIds = new Set();
    if (!guiDlcs || !guiDlcs.length) return;
    dlcHiddenTechIds = computeDlcHiddenSet(allTechs, techPassesDlc);
  }
  // Separate overlapping VISIBLE techs (two sharing one x,y would draw on top of each other). DLC-aware:
  // a tech the filter hides never claims a slot, so the surviving variant keeps its true position. Resets
  // each tech to its original x first (snapshotted once) so toggling DLCs never compounds shifts — and so
  // the real saved coordinate is restored when a hiding tech is toggled back on. Per-folder.
  function applyDlcCollisionPacking() {
    // ACCURATE-ONLY: the old "packing" shifted a tech +1 slot whenever its cell was taken — but the game
    // NEVER reflows: hidden/DLC-gated techs leave a gap (wiki-confirmed), and same-slot techs simply draw
    // stacked. Shoving a tech off its authored cell moved it onto its neighbour's cell and CREATED overlaps
    // the game doesn't have. This is now a pure restore of the authored x (kept for the two call sites +
    // the _origX drag baseline). #accurate-only
    allTechs.forEach((t) => { if (t._origX === undefined) t._origX = t.x; else t.x = t._origX; });
  }

  // Year stamps straight from the game's GUI: each label's era slot is its 70px offset from the
  // first label (the game's tech grid is 70px/slot), anchored on the tab's earliest tech lane.
  // MD artillery: labels at 140→278→420→560→698 ⇒ slots 0,2,4,6,8 = exactly the in-game ruler.
  function guiYearColsForActiveTab() {
    const folders = (currentVisibleFolders && currentVisibleFolders.length)
      ? currentVisibleFolders : getActiveFoldersForTab(activeTab);
    for (const f of folders) {
      const gl = guiLayout[f];
      if (!gl || !Array.isArray(gl.years) || gl.years.length < 2) continue;
      // A tab can aggregate DLC variants with DIFFERENT orientations (e.g. armour_folder is horizontal
      // and forbids No Step Back, while nsb_armour_folder is vertical and requires it). Only the variant
      // actually being RENDERED may drive the year ruler — otherwise a hidden horizontal folder's x-axis
      // stamps get painted on the visible vertical tab, landing the years between the tech rows. Skip a
      // folder the DLC filter hides, or whose orientation differs from the tab's active layout.
      if (typeof folderPassesDlc === "function" && !folderPassesDlc(f)) continue;
      if (gl.orientation && typeof getYearRulerLayout === "function" && gl.orientation !== getYearRulerLayout()) continue;
      const axis = gl.orientation === "vertical" ? "y" : "x";
      // Pixels-per-slot for THIS folder's era axis (gui gridbox slotsize): vertical era runs down → use
      // height, horizontal era runs across → use width. Defaults to 70 (vanilla's slotsize) when the gui
      // didn't expose one, so existing folders are byte-identical.
      const div = (gl.slotsize && (axis === "y" ? gl.slotsize.height : gl.slotsize.width)) || 70;
      // A folder can define more than one independent year RAIL (vanilla electronics has the main left rail
      // AND a far-right "wonderweapon" sub-rail). Sorting all stamps by the era axis alone interleaves them
      // into a non-monotonic ruler (1936,1942,1943,1938,…). Cluster by the CROSS-axis coord (a new rail on a
      // >15px gap — the rails sit ~20px apart, so the era `div`=60 would wrongly merge them) and keep the
      // primary rail = widest era span (tie: most stamps). Single-rail folders form one cluster → unchanged. #year-rails
      const crossAxis = axis === "y" ? "x" : "y";
      const byCross = [...gl.years].sort((a, b) => (a[crossAxis] || 0) - (b[crossAxis] || 0));
      const rails = []; let curRail = null, prevCross = null;
      for (const yv of byCross) {
        const cv = yv[crossAxis] || 0;
        if (curRail && Math.abs(cv - prevCross) <= 15) curRail.push(yv);
        else { curRail = [yv]; rails.push(curRail); }
        prevCross = cv;
      }
      const railSpan = (g) => Math.max(...g.map((x) => x[axis])) - Math.min(...g.map((x) => x[axis]));
      const stamps = rails.sort((a, b) => (railSpan(b) - railSpan(a)) || (b.length - a.length))[0] || gl.years;
      const ys = [...stamps].sort((a, b) => a[axis] - b[axis]);
      const techs = allTechs.filter((t) => t.folder === f && !t.isSubTech);
      if (!techs.length) continue;
      const minSlot = Math.min(...techs.map((t) => t.y));
      const c0 = ys[0][axis];
      const cols = [];
      const seen = new Set();
      for (const yv of ys) {
        const slot = minSlot + Math.round((yv[axis] - c0) / div);
        if (seen.has(slot)) continue;
        seen.add(slot);
        cols.push({ y: slot, year: yv.year });
      }
      if (cols.length >= 2) return cols;
    }
    return null;
  }

  // Load technology catalog from backend
  function discoverCustomTabsFromTechnologies(techs) {
    const knownFolders = new Set();
    Object.values(STANDARD_TABS).forEach((config) => {
      config.folders.forEach((f) => knownFolders.add(f));
    });
    customTabs.forEach((t) => knownFolders.add(t.folder));
    gameFolderTabs.forEach((t) => knownFolders.add(t.folder)); // game tabs already cover these
    const discovered = [];
    (techs || []).forEach((tech) => {
      if (!tech.folder || knownFolders.has(tech.folder)) return;
      // A folder gated OUT by the DLC filter (e.g. armour_folder while "No Step Back" is on) was
      // deliberately dropped from gameFolderTabs — don't resurrect it here as a discovered tab.
      if (guiAllFolders.includes(tech.folder) && !folderPassesDlc(tech.folder)) return;
      // `doctrine = yes` folders never render on the game's RESEARCH tree (post-NSB doctrines live in the
      // Officer Corps screen; special_forces_doctrine_folder is even ledger=hidden). Their techs carry
      // flow-layout positions that pile every branch onto the same cells — don't surface them as tabs. #doctrine-folder-hidden
      if ((guiFolderAvailability[tech.folder] || {}).doctrine) return;
      knownFolders.add(tech.folder);
      const folder = tech.folder;
      const newTabKey = `custom_tab_${folder}`;
      const newTabName = folder.replace("_folder", "").replace(/_/g, " ");
      const formattedName = newTabName.charAt(0).toUpperCase() + newTabName.slice(1);
      // Most folders are horizontal (year on the x-axis); only doctrines are vertical. Defaulting
      // discovered tabs to vertical was making mod folders (e.g. MD's civilian/space) render
      // sideways and overlap. Horizontal is the safe default; the user can flip per-tab.
      const guessLayout = /doctrine/i.test(folder) ? "vertical" : "horizontal";
      // `discovered: true` marks this as a REAL mod folder we surfaced automatically (not a scratch
      // tab the user made). Those must NOT show a delete "×" — deleting reassigns the folder's techs
      // to infantry_folder, which would silently corrupt a real mod's layout on the next save.
      discovered.push({ name: formattedName, key: newTabKey, folder, layout: guessLayout, discovered: true });
    });
    return discovered;
  }

  // #empty-hint-names-a-missing-button — ONE OWNER FOR "DOES THIS TAB HAVE AN × ?".
  //
  // Only a USER-created scratch tab gets a delete ×. Auto-discovered mod folders (discovered:true) are real
  // folders with real techs — deleting one reassigns them to infantry_folder — and the nine standard tabs
  // never had one. The empty-folder hint told every empty tab to "remove this tab with its × button",
  // including the discovered mod folder its own comment cites as the example (MD's "Drones"). A message that
  // sends a modder hunting for a control that is not on screen reads as a broken app.
  //
  // The rule now lives in one place instead of being restated where it is displayed, which is how the two
  // came apart to begin with.
  function tabHasDeleteButton(tabKey) {
    if (!tabKey || STANDARD_TABS[tabKey]) return false;
    const cfg = customTabs.find((t) => t.key === tabKey);
    return !!(cfg && !cfg.discovered);
  }

  function checkEmptyTreeOverlay() {
    const container = document.getElementById("canvasContainer");
    if (!container) return;
    
    const existing = document.getElementById("emptyTreeOverlay");
    if (existing) existing.remove();
    
    const modSelector = document.getElementById("headerModSelector");
    const selectedOptionText = modSelector && modSelector.options[modSelector.selectedIndex] ? modSelector.options[modSelector.selectedIndex].text : "";
    // #vanilla-by-name — the PATH-based dataset flag, never the name. See the option builder.
    const isVanilla = !!(modSelector && modSelector.options[modSelector.selectedIndex] && modSelector.options[modSelector.selectedIndex].dataset.vanilla === "1");
    
    const researchCanvasEl = document.getElementById("researchCanvas");
    // "The mod has none of its OWN" — not "the tree is empty". allTechs now carries the base game's techs
    // too, and this used to test allTechs.length === 0, so the card can no longer claim an empty tree; it
    // also must not appear the moment inherited content exists, which is always. #overlay-blindness
    const ownTechCount = allTechs.filter((t) => t.isMod).length;
    const baseTechCount = allTechs.length - ownTechCount;
    if (!isVanilla && ownTechCount === 0) {
      // VEILING THE CANVAS IS ONLY HONEST WHEN THERE IS NOTHING BEHIND THE VEIL. With the base game's
      // techs now drawn, hiding the canvas would cover the very content this whole fix exists to reveal —
      // so the full-screen card is reserved for the case where nothing at all would be painted, and
      // otherwise the same two choices are offered in a slim, non-blocking banner. #overlay-blindness
      const nothingToDraw = baseTechCount === 0 || !SHOW_BASE_TECHS;
      const overlay = document.createElement("div");
      overlay.id = "emptyTreeOverlay";
      if (nothingToDraw) {
        container.style.overflow = "hidden";
        // Hide the big (5200x2400) canvas + reset scroll so the overlay isn't pushed off-screen by it
        // — otherwise the purple veil sits in the scrolled-away content and only half-covers the blue.
        container.scrollTop = 0;
        container.scrollLeft = 0;
        if (researchCanvasEl) researchCanvasEl.style.display = "none";
        overlay.className = "empty-tree-overlay";
        // ⛔ #nova-does-not-find-the-game — with no game folder found the canvas is empty because Nova cannot SEE the base game,
        // not because nothing defines a tree: the game still loads its technologies into this mod. Say that, and how to fix it,
        // and offer no "Copy Generic Tree": there is nothing to copy, and the copy would be an empty tree marked to save.
        const gameMissing = baseTechCount === 0 && !catalogGameFound;
        overlay.innerHTML = gameMissing ? `
          <div class="empty-tree-card">
            <div class="empty-tree-icon">⚠</div>
            <h2>Nova could not find Hearts of Iron IV</h2>
            <p>So the base game's research tree is missing here. The game itself still loads its technologies into this mod, and
              new ones you place can land on the cells they hold. To fix it, set the game folder on the Home page (Game folder),
              then reload this page. Or start your own tree now:</p>
            <div class="empty-tree-actions">
              <button class="btn" id="startEmptyTreeBtn" style="background: #21262d; border-color: #30363d; color: #c9d1d9; padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s ease;">🌱 Start Fresh</button>
            </div>
          </div>
        ` : `
          <div class="empty-tree-card">
            <div class="empty-tree-icon">🌳</div>
            <h2>No technologies of your own yet</h2>
            <p>${baseTechCount === 0
              ? "Nothing else defines a research tree here either, so the canvas really is empty. Choose how you want to start:"
              : `The base game still loads <strong>${baseTechCount}</strong> technolog${baseTechCount === 1 ? "y" : "ies"} into this tree — they are hidden right now by the 🏛 Base game toggle. Choose how you want to start:`}</p>
            <div class="empty-tree-actions">
              <button class="btn" id="copyVanillaTreeBtn" style="background: #5d3b8e; border-color: #8c60ce; color: #f1e9fc; padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s ease;">📋 Copy Generic Tree</button>
              <button class="btn" id="startEmptyTreeBtn" style="background: #21262d; border-color: #30363d; color: #c9d1d9; padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s ease; margin-left: 8px;">🌱 Start Fresh</button>
            </div>
          </div>
        `;
      } else {
        container.style.overflow = "auto";
        if (researchCanvasEl) researchCanvasEl.style.display = "";
        overlay.style.cssText = "position:sticky; top:0; left:0; z-index:80; display:flex; align-items:center; gap:10px; flex-wrap:wrap;" +
          "padding:8px 14px; background:rgba(93,59,142,0.94); border-bottom:1px solid #8c60ce; color:#f1e9fc; font-size:12.5px;";
        overlay.innerHTML = `
          <span>🌳 This mod has <strong>no technologies of its own</strong> yet — the ${baseTechCount} base-game technologies below are what the game already loads into this tree.</span>
          <button class="btn" id="copyVanillaTreeBtn" style="background:#8c60ce; color:#fff; padding:5px 12px; font-size:12px; font-weight:600; border-radius:5px; border:none; cursor:pointer;">📋 Copy Generic Tree</button>
          <button class="btn" id="startEmptyTreeBtn" style="background:#21262d; color:#c9d1d9; padding:5px 12px; font-size:12px; font-weight:600; border-radius:5px; border:none; cursor:pointer;">🌱 Start Fresh</button>
        `;
      }
      container.prepend(overlay);

      const copyVanillaTreeBtn = document.getElementById("copyVanillaTreeBtn");   // not offered with no game found
      if (copyVanillaTreeBtn) copyVanillaTreeBtn.addEventListener("click", () => {
        const copiedTechs = tempVanillaTechs.map(t => {
          const copied = JSON.parse(JSON.stringify(t));
          copied.isMod = true;
          copied.fileName = "custom_technologies.txt";
          return copied;
        });
        
        const copiedEquips = {};
        Object.entries(tempVanillaEquips).forEach(([eqId, eq]) => {
          const copied = JSON.parse(JSON.stringify(eq));
          copied.isMod = true;
          copied.fileName = NOVA_DEFAULT_EQUIPMENT_FILE;
          copiedEquips[eqId] = copied;
        });
        
        allTechs = copiedTechs;
        allEquips = copiedEquips;

        copiedTechs.forEach((t) => dirtyTechIds.add(t.id)); // the whole copied tree must be written
        markDirty();
        container.style.overflow = "auto";
        if (researchCanvasEl) researchCanvasEl.style.display = "";
        overlay.remove();

        renderTabs();
        renderCanvas();
        updateSidebar();
      });

      document.getElementById("startEmptyTreeBtn").addEventListener("click", () => {
        // "Start Fresh" means "I will write my own techs", not "the base game goes away" — it cannot,
        // short of a replace_path. Drop only the mod's own (there are none here, by definition) and keep
        // the inherited ones on the canvas so the author still sees what they are building into.
        allTechs = allTechs.filter((t) => !t.isMod);
        allEquips = {};
        markDirty();
        container.style.overflow = "auto";
        if (researchCanvasEl) researchCanvasEl.style.display = "";
        overlay.remove();
        renderTabs();
        renderCanvas();
        updateSidebar();
      });
    } else {
      container.style.overflow = "auto";
      if (researchCanvasEl) researchCanvasEl.style.display = "";
    }
  }

  // Pull the active mod's real folder->tab-icon map from its tech-tree GUI. Cheap, best-effort.
  async function loadFolderTabs() {
    guiFolderIcon = {};
    try {
      const res = await fetch(`/api/research/folder-tabs?modPath=${encodeURIComponent(getModPath())}`);
      const data = await res.json();
      (data.tabs || []).forEach((t) => { if (t.folder && t.iconKey) guiFolderIcon[t.folder] = t.iconKey; });
    } catch (_) { /* fall back to hardcoded STANDARD_TABS icons */ }
  }

  // Fill the equipment "archetype" picker with the REAL archetypes from the active mod (+ vanilla),
  // so a custom weapon references one that actually exists (e.g. MD's Inf_equipment, not vanilla's
  // infantry_equipment which MD removed — that mismatch errors in-game).
  async function loadEquipmentArchetypes() {
    const list = document.getElementById("equipArchetypeList");
    if (!list) return;
    try {
      const res = await fetch(`/api/equipment/archetypes?modPath=${encodeURIComponent(getModPath())}`);
      const data = await res.json();
      list.innerHTML = (data.archetypes || [])
        .map((a) => `<option value="${a.id}">${a.isMod ? "from this mod" : "vanilla"}</option>`).join("");
    } catch (_) { /* leave the datalist empty */ }
  }

  // How many top-level techs a tab currently holds (used to hide empty tabs).
  function tabTechCount(tabKey) {
    const folders = getActiveFoldersForTab(tabKey);
    // Counts what the canvas will DRAW, so hiding the base game collapses the tabs that only hold
    // inherited techs back out of the strip instead of leaving empty ones behind. #overlay-blindness
    return allTechs.filter((t) => folders.includes(t.folder) && !t.isSubTech && (SHOW_BASE_TECHS || t.isMod)).length;
  }

  // The folder a tab should take its icon from: the first of its folders that has techs AND a
  // real GUI icon, else the first folder. Lets a grouped tab (e.g. Armor = armour+nsb_armour)
  // pick up whichever variant the mod actually ships.
  function tabPrimaryFolder(tabKey) {
    const folders = getActiveFoldersForTab(tabKey);
    if (!folders.length) return "";
    const withIconAndTechs = folders.find((f) => guiFolderIcon[f] && allTechs.some((t) => t.folder === f && !t.isSubTech));
    if (withIconAndTechs) return withIconAndTechs;
    const withIcon = folders.find((f) => guiFolderIcon[f]);
    return withIcon || folders[0];
  }

  async function loadCatalog() {
    const activeRoot = getModPath();
    if (!activeRoot) return;
    // The campaign start year travels with the mod, so refresh it here rather than once at boot — switching
    // from vanilla to Old World Blues moves it from 1936 to 2275. Awaited before the sidebar can render, and
    // it falls back to 1936 on its own, so a failure costs the old behaviour and nothing more.
    // #ahead-of-time-assumes-1936
    await refreshScenarioStartYear();
    try {
      const res = await fetch(`/api/technologies/catalog?modPath=${encodeURIComponent(activeRoot)}${activeCountryTag ? `&country=${activeCountryTag}` : ""}`);
      const data = await res.json();
      catalogGameFound = data.gameFound !== false;

      // Store vanilla reference
      tempVanillaTechs = (data.technologies || []).filter((t) => !t.isMod);
      tempVanillaEquips = {};
      Object.entries(data.equipments || {}).forEach(([eqId, eq]) => {
        if (!eq.isMod) tempVanillaEquips[eqId] = eq;
      });

      const modSelector = document.getElementById("headerModSelector");
      const selectedOptionText = modSelector && modSelector.options[modSelector.selectedIndex] ? modSelector.options[modSelector.selectedIndex].text : "";
      // #vanilla-by-name — the PATH-based dataset flag, never the name. See the option builder.
      const isVanilla = !!(modSelector && modSelector.options[modSelector.selectedIndex] && modSelector.options[modSelector.selectedIndex].dataset.vanilla === "1");
      
      // A MOD IS AN OVERLAY, NOT A BLANK SLATE (#overlay-blindness). This used to be
      //     allTechs = data.technologies.filter((t) => t.isMod)
      // which threw away the 552 vanilla technologies the server had just merged in and handed us — so the
      // Infantry tab drew 4 nodes where the game draws 66, Industry/Support/Air/Naval drew nothing at all,
      // and a brand-new mod was announced as an "Empty Research Tree" when the game already loads 552 techs
      // into it. The author then placed new techs onto cells vanilla already occupied and never saw the
      // collision: 7 of this mod's 54 techs landed on the exact (folder,x,y) of a vanilla tech.
      //
      // Keeping the full catalog here is safe because every write path is ALREADY isMod-gated — this is the
      // same array the "vanilla" mode has always loaded. Save is double-gated (`t.isMod && idsToSave.has`),
      // so an inherited tech can never be written into the mod, and the ~20 edit guards ("This is a vanilla
      // technology…") were written for exactly this data. generateUniqueTechId also scans allTechs, so ids
      // now avoid colliding with the base game as a side effect.
      //
      // allEquips stays MOD-ONLY on purpose. It is posted back verbatim as `equipments` on save, where
      // persistTechnologySave writes any entry a saved tech names in enable_equipments — feeding vanilla
      // equipment definitions in there would start copying base-game equipment into the mod. The canvas
      // does not need it: the wide/small box rule reads tech.enableEquipments off the tech itself.
      allTechs = data.technologies || [];
      if (!isVanilla) {
        const filteredEquips = {};
        Object.entries(data.equipments || {}).forEach(([eqId, eq]) => {
          if (eq.isMod) filteredEquips[eqId] = eq;
        });
        allEquips = filteredEquips;
      } else {
        allEquips = data.equipments || {};
      }

      // Base-mod (dependency) techs — valid prerequisite targets even though they aren't drawn on the
      // canvas (we can't edit the base mod's tree). Used by validation + the prereq label. #110
      baseModTechs = Array.isArray(data.baseModTechs) ? data.baseModTechs : [];

      customTabs = Array.isArray(data.customTabs) ? data.customTabs : [];
      loadLayoutOverrides(); // user orientation overrides for this mod
      loadYearOverrides();   // user year-label overrides for this mod
      // Merge any locally-remembered tabs the server didn't return (by folder). The server now ALSO surfaces
      // Nova-created folders, so this mainly recovers a tab from a session that never hit Save. Key uses
      // getModPath() to match the save side exactly (previously the load used `activeRoot`, which could differ
      // from the save key and silently lose the tab).
      try {
        const stored = JSON.parse(localStorage.getItem(`custom_research_tabs_${getModPath()}`) || "[]");
        if (Array.isArray(stored)) stored.forEach((t) => { if (t && t.folder && !customTabs.some((c) => c.folder === t.folder)) customTabs.push(t); });
      } catch (_) {}

      // The game's own layout facts (orientation per folder via its year-stamp textboxes, the
      // year stamps themselves, and the full technology_tags tab list). Best-effort: if this
      // fails, the legacy STANDARD_TABS heuristics below remain in charge.
      guiLayout = {}; guiAllFolders = []; guiFolderAvailability = {}; guiDlcs = []; foldersWithSmallItem = new Set(); novaOwnedFolders = new Set();
      try {
        const gl = await fetch(`/api/research/gui-layout?modPath=${encodeURIComponent(activeRoot)}`).then((r) => r.json());
        if (gl && gl.ok) {
          guiLayout = gl.folders || {}; guiAllFolders = gl.allFolders || []; guiFolderNames = gl.folderNames || {};
          guiFolderAvailability = gl.folderAvailability || {}; guiDlcs = gl.dlcs || [];
          foldersWithSmallItem = new Set(gl.foldersWithSmallItem || []);
          novaOwnedFolders = new Set(gl.novaOwnedFolders || []);
          // The mod's own copy of countrytechtreeview.gui is a SNAPSHOT, and HOI4 replaces a same-named
          // file rather than merging it — so anything the base game gained after the copy was taken is
          // silently gone from this mod. 1.19.2 added four elements and every mod on this machine that
          // carries a copy is missing exactly those four. Say so once per load; the author decides, since
          // a removal can be deliberate (Millennium Dawn removes 160 on purpose). #stale-gui-copy
          staleGuiElements = Array.isArray(gl.staleGuiElements) ? gl.staleGuiElements : [];
          staleGuiCount = Number(gl.staleGuiCount) || 0;
          staleGuiBase = typeof gl.staleGuiBase === "string" ? gl.staleGuiBase : "";
          staleGuiBaseName = typeof gl.staleGuiBaseName === "string" ? gl.staleGuiBaseName : "";
        }
      } catch (_) { /* keep legacy fallbacks */ }
      // Purge auto-DISCOVERED tabs for `doctrine = yes` folders that an older session persisted into
      // localStorage — the game never shows doctrine folders on the research tree (they render in the
      // Officer Corps screen), and their flow-layout techs pile onto the same cells. User-created scratch
      // tabs (discovered !== true) are never touched. #doctrine-folder-hidden
      customTabs = customTabs.filter((t) => !(t && t.discovered && (guiFolderAvailability[t.folder] || {}).doctrine));
      // The gui-layout only reports DLCs referenced by FOLDER gates. Individual techs can require a DLC no
      // folder mentions (Millennium Dawn gates ~12 techs on "La Resistance"). Fold those in, or they'd be
      // hidden by their own gate with NO filter checkbox to turn the DLC on. Union → every referenced DLC
      // gets a checkbox and defaults to owned.
      {
        const all = new Set(guiDlcs);
        allTechs.forEach((t) => {
          (t.requireDlc || []).forEach((d) => all.add(d));
          (t.forbidDlc || []).forEach((d) => all.add(d));
          (t.requireAnyDlc || []).forEach((grp) => grp.forEach((d) => all.add(d)));
        });
        if (all.size !== guiDlcs.length) guiDlcs = [...all].sort();
      }
      loadActiveDlcs(); // restore the user's DLC filter for this mod (defaults to all-on)
      // Work out which techs the DLC set hides, then pack the rest so visible techs never overlap. (Both
      // re-run on a DLC toggle; the latter is no-op for mods with no DLC variants.)
      recomputeDlcHiddenTechIds();
      applyDlcCollisionPacking();

      buildGameFolderTabs();
      migrateStaleGameFolderOrientation(); // drop stale overrides that fight a game folder's GUI orientation

      discoverCustomTabsFromTechnologies(allTechs).forEach((tab) => {
        if (!customTabs.some((c) => c.key === tab.key || c.folder === tab.folder)) {
          customTabs.push(tab);
        }
      });

      if (!STANDARD_TABS[activeTab] && !customTabs.some((c) => c.key === activeTab) &&
          !gameFolderTabs.some((t) => t.key === activeTab)) {
        activeTab = gameFolderTabs.length ? gameFolderTabs[0].key : "infantry_tab";
      }
      // Old grouped-tab keys (e.g. armor_tab) stop existing once game tabs take over — remap the
      // remembered selection to the matching per-folder tab instead of dumping the user on infantry.
      if (gameFolderTabs.length && STANDARD_TABS[activeTab]) {
        const firstFolder = (STANDARD_TABS[activeTab].folders || []).find((f) => gameFolderTabs.some((t) => t.folder === f));
        if (firstFolder) activeTab = "ftab_" + firstFolder;
        else activeTab = gameFolderTabs[0].key;
      }

      // If the current active tab has no technologies, but some other tab does, auto-switch to the first tab with technologies.
      const getTechCountForTab = (tabKey) => {
        const folders = getActiveFoldersForTab(tabKey);
        return allTechs.filter(t => folders.includes(t.folder) && !t.isSubTech).length;
      };
      
      if (!isVanilla && allTechs.length > 0 && getTechCountForTab(activeTab) === 0) {
        const allTabKeys = [
          ...Object.keys(STANDARD_TABS),
          ...customTabs.map(c => c.key)
        ];
        const tabWithTechs = allTabKeys.find(tabKey => getTechCountForTab(tabKey) > 0);
        if (tabWithTechs) {
          activeTab = tabWithTechs;
        }
      }

      await loadFolderTabs(); // real per-mod tab icons before we draw the tab strip
      // …and the order the PLAYER sees, which is the gui's tab x positions and not technology_tags order.
      // Without this the strip here could disagree with the game before anything was ever dragged.
      // #research-tab-reorder
      await loadTabStripOrder();
      loadEquipmentArchetypes(); // fill the archetype picker from this mod (fire-and-forget)
      renderTabs();
      renderCanvas();
      checkEmptyTreeOverlay();
      updateShowBaseButton(); // its label carries the inherited-tech COUNT, so it needs the loaded catalog
      updateStaleGuiChip();
      clearDirty();
      // The freshly loaded tree is the clean starting point — you cannot undo past it (#research-undo).
      // This also runs after Save, which calls loadCatalog(), so saved work is never "undoable" back into
      // a state the mod no longer matches.
      histReset();
    } catch (err) {
      console.error("Failed to load catalog:", err);
    }
  }

  // Find which Tab key a folder belongs to
  function getTabForFolder(folderName) {
    if (!folderName) return gameFolderTabs.length ? gameFolderTabs[0].key : "infantry_tab";

    // Game-mirrored per-folder tabs take precedence (one tab per technology_tags folder).
    const gt = gameFolderTabs.find((t) => t.folder === folderName);
    if (gt) return gt.key;

    // Check standard tabs
    for (const [tabKey, config] of Object.entries(STANDARD_TABS)) {
      if (config.folders.includes(folderName)) {
        return tabKey;
      }
    }

    // Check custom tabs
    const custom = customTabs.find(t => t.folder === folderName);
    if (custom) return custom.key;
    return gameFolderTabs.length ? gameFolderTabs[0].key : "infantry_tab";
  }

  // Get active folder keys for current tab
  function getActiveFoldersForTab(tabKey) {
    const gt = gameFolderTabs.find((t) => t.key === tabKey);
    if (gt) return [gt.folder];
    if (STANDARD_TABS[tabKey]) {
      return STANDARD_TABS[tabKey].folders;
    }
    const custom = customTabs.find(t => t.key === tabKey);
    return custom ? [custom.folder] : [];
  }

  // The subset of a tab's folders to actually DRAW. Folders are added biggest-first; a folder whose
  // techs mostly land on coordinates already taken by an added folder is a DLC variant (e.g.
  // mtgnavalfolder vs naval_folder) and is dropped so nothing overlays. Folders that occupy distinct
  // coordinates (the 4 doctrine trees, naval support, etc.) are all kept.
  function getVisibleFoldersForTab(tabKey) {
    const folders = getActiveFoldersForTab(tabKey);
    if (folders.length <= 1) return folders;
    const byFolder = {};
    folders.forEach((f) => { byFolder[f] = allTechs.filter((t) => t.folder === f && !t.isSubTech); });
    const sorted = folders.filter((f) => byFolder[f].length).sort((a, b) => byFolder[b].length - byFolder[a].length);
    const occupied = new Set();
    const visible = [];
    sorted.forEach((f) => {
      const techs = byFolder[f];
      let collisions = 0;
      techs.forEach((t) => { if (occupied.has(`${t.x},${t.y}`)) collisions++; });
      if (visible.length && collisions > techs.length * 0.4) return; // overlapping variant — skip
      visible.push(f);
      techs.forEach((t) => occupied.add(`${t.x},${t.y}`));
    });
    return visible.length ? visible : sorted.slice(0, 1);
  }

  // Render Tabs List
  // Build the DLC-filter dropdown from the DLCs this mod's folders reference. Hidden when none.
  function renderDlcFilter() {
    const wrap = document.getElementById("dlcFilterWrap");
    const list = document.getElementById("dlcFilterList");
    if (!wrap || !list) return;
    if (!guiDlcs || !guiDlcs.length) { wrap.style.display = "none"; return; }
    wrap.style.display = "";
    if (!activeDlcs) loadActiveDlcs();
    list.innerHTML = "";
    guiDlcs.forEach((dlc) => {
      const row = document.createElement("label");
      row.style.cssText = "display:flex; align-items:center; gap:8px; font-size:12px; color:#e6edf3; cursor:pointer;";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = activeDlcs.has(dlc);
      cb.addEventListener("change", () => {
        if (cb.checked) activeDlcs.add(dlc); else activeDlcs.delete(dlc);
        saveActiveDlcs();
        recomputeDlcHiddenTechIds(); // new hidden set …
        applyDlcCollisionPacking();  // … then re-pack visible techs to their true slots
        buildGameFolderTabs();
        // If the active tab's folder just got gated out, jump to the first still-available tab.
        if (gameFolderTabs.length && !gameFolderTabs.some((t) => t.key === activeTab)) {
          activeTab = gameFolderTabs[0].key;
        }
        renderTabs();
        renderCanvas();
        updateOrientationButton();
      });
      const span = document.createElement("span"); span.textContent = dlc;
      row.appendChild(cb); row.appendChild(span);
      list.appendChild(row);
    });
    const btn = document.getElementById("dlcFilterBtn");
    if (btn) btn.textContent = `🎮 DLCs (${activeDlcs.size}/${guiDlcs.length})`;
  }

  // ── Tab reordering ────────────────────────────────────────────────────────────────────────────
  // #research-tab-reorder. The order the PLAYER sees is not the order this editor built its strip from:
  // gameFolderTabs comes from common/technology_tags, while the game reads `position = { x = N y = 0 }` off
  // each `<folder>_tab` button in interface/countrytechtreeview.gui. So before anything can be dragged the
  // two have to be reconciled — otherwise a drag would rearrange a list that never matched the game anyway.
  let tabStripSlots = [];      // [{ x, key, folders[] }] straight from the mod's gui, left to right
  let tabReorderMode = false;
  let tabStripOwnsGui = false; // does the MOD have its own countrytechtreeview.gui, or are we reading a base's?

  async function loadTabStripOrder() {
    tabStripSlots = [];
    tabStripOwnsGui = false;
    try {
      const r = await fetch(`/api/research/tab-order?modPath=${encodeURIComponent(getModPath())}`);
      const d = await r.json();
      if (d && Array.isArray(d.slots)) tabStripSlots = d.slots;
      tabStripOwnsGui = !!(d && d.ownsGui);
    } catch (_) {}
  }

  /** Sort the editor's tabs into the game's own left-to-right order. Anything the strip doesn't mention
   *  keeps its existing relative place at the end, so a tab is never dropped from the editor. */
  function sortTabsByStripOrder(tabs) {
    if (!tabStripSlots.length) return tabs;
    const rank = new Map();
    tabStripSlots.forEach((s, i) => (s.folders || []).forEach((f) => rank.set(f, i)));
    return tabs
      .map((t, i) => ({ t, i, r: rank.has(t.folder) ? rank.get(t.folder) : Infinity }))
      .sort((a, b) => (a.r - b.r) || (a.i - b.i))
      .map((x) => x.t);
  }

  function wireTabDrag(tab, container) {
    tab.addEventListener("dragstart", (e) => {
      tab.classList.add("tab-dragging");
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", tab.dataset.tab); } catch (_) {}
    });
    tab.addEventListener("dragend", () => {
      tab.classList.remove("tab-dragging");
      container.querySelectorAll(".tab-drop-before, .tab-drop-after")
        .forEach((el) => el.classList.remove("tab-drop-before", "tab-drop-after"));
    });
    tab.addEventListener("dragover", (e) => {
      const dragging = container.querySelector(".tab-dragging");
      if (!dragging || dragging === tab || !tab.classList.contains("tab-reorderable")) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = "move"; } catch (_) {}
      // Which half of the tab the pointer is over decides which side the marker shows — so the user can see
      // where it will land before letting go, rather than finding out afterwards.
      const r = tab.getBoundingClientRect();
      const before = (e.clientX - r.left) < r.width / 2;
      tab.classList.toggle("tab-drop-before", before);
      tab.classList.toggle("tab-drop-after", !before);
    });
    tab.addEventListener("dragleave", () => tab.classList.remove("tab-drop-before", "tab-drop-after"));
    tab.addEventListener("drop", async (e) => {
      e.preventDefault();
      const dragging = container.querySelector(".tab-dragging");
      tab.classList.remove("tab-drop-before", "tab-drop-after");
      if (!dragging || dragging === tab) return;
      const r = tab.getBoundingClientRect();
      const before = (e.clientX - r.left) < r.width / 2;
      container.insertBefore(dragging, before ? tab : tab.nextSibling);
      await commitTabOrder(container);
    });
  }

  async function commitTabOrder(container) {
    // Read the order back off the DOM rather than tracking it separately — what the user sees IS the order.
    // This is only the tabs the editor DREW, which is deliberately not every slot in the strip: a folder with
    // no techs in this mod is skipped, and the DLC filter hides variants. The server treats an unnamed slot
    // as "do not move", so those keep their exact position and the drawn ones permute among the positions
    // they already occupied. Sending a partial list is therefore safe — it used to shunt every unnamed slot
    // to the end of the strip. #research-tab-reorder
    const keys = [...container.querySelectorAll(".folder-tab.tab-reorderable")]
      .map((el) => tabPrimaryFolder(el.dataset.tab))
      .filter(Boolean);
    if (!keys.length) return;
    // Saving the order for a mod that has no countrytechtreeview.gui of its own COPIES one in (from the
    // dependency for an add-on, else vanilla). That is the same thing creating a custom tab already does,
    // but it is a bigger change than "moved a tab" sounds, so say it happened rather than let the user find
    // a new file in their mod later.
    const wasCopy = !tabStripOwnsGui;
    setTabReorderStatus("Saving order…", "#8b949e");
    try {
      const r = await fetch("/api/research/reorder-tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: getModPath(), order: keys }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      await loadTabStripOrder();
      // Repaint from what the file now says, even on a no-op — otherwise a drop that did not change anything
      // leaves the DOM showing a position that was never written.
      renderTabs();
      setTabReorderStatus(
        d.changed === false
          ? "Already in that order."
          : wasCopy
            ? "Saved — this mod now has its own research screen (countrytechtreeview.gui), and the game will show this order."
            : "Saved — the game will show this order.",
        "#3fb950");
    } catch (err) {
      // Put the strip back to what the mod actually says, so the screen never shows an order that was not
      // written — but renderTabs() rebuilds the whole strip INCLUDING the status span, so setting the message
      // before it runs threw the message away and a failed save looked like nothing happened at all. Repaint
      // first, then write the message into the fresh element.
      await loadTabStripOrder();
      renderTabs();
      setTabReorderStatus("Could not save: " + err.message, "#f85149");
    }
  }

  function setTabReorderStatus(msg, color) {
    const el = document.getElementById("tabReorderStatus");
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || "#8b949e";
  }

  function renderTabs() {
    renderDlcFilter();
    const folderTabs = document.getElementById("folderTabs");
    if (!folderTabs) return;

    folderTabs.innerHTML = "";
    folderTabs.classList.toggle("tabs-reordering", tabReorderMode);

    if (gameFolderTabs.length) {
      // The game's own tab strip: one tab per technology_tags folder, in the game's order. This is
      // what makes MD's Civilian tab exist, and what un-mixes tabs whose folders have different
      // orientations (armour horizontal vs nsb_armour vertical).
      sortTabsByStripOrder(gameFolderTabs).forEach((t) => createTabElement(t.key, t.name, folderTabs));
      // User-created scratch tabs whose folder isn't already a game tab still show — EXCEPT a tab
      // pointing at a real game folder that's currently DLC-gated out (e.g. a previously-discovered
      // fixed_wing_folder/bomber tab persisted in localStorage, now hidden because "By Blood Alone" is
      // on). Those are the same variant the game itself hides, so don't render them as a stray tab.
      customTabs.forEach((ct) => {
        if (gameFolderTabs.some((t) => t.folder === ct.folder)) return;
        if (guiAllFolders.includes(ct.folder) && !folderPassesDlc(ct.folder)) return;
        createTabElement(ct.key, ct.name, folderTabs);
      });
    } else {
      // Legacy strip (no technology_tags found): grouped standard tabs + discovered/custom tabs.
      // Hide standard tabs with no techs in this mod. Never hide the active tab.
      Object.entries(STANDARD_TABS).forEach(([tabKey, config]) => {
        if (tabKey !== activeTab && tabTechCount(tabKey) === 0) return;
        createTabElement(tabKey, config.name, folderTabs);
      });
      customTabs.forEach(ct => {
        createTabElement(ct.key, ct.name, folderTabs);
      });
    }
    
    // Render "+ Add Tab" button
    const addTabBtn = document.createElement("div");
    addTabBtn.className = "folder-tab";
    addTabBtn.style.cssText = "background: #1f2937; border-color: #4b5563; color: #10b981; font-weight: bold;";
    addTabBtn.textContent = "+ Custom Tab";
    addTabBtn.addEventListener("click", () => {
      editingTabKey = null; editingTabFolder = null; // CREATE mode
      const modal = document.getElementById("customTabModal");
      const nameInput = document.getElementById("customTabNameInput");
      const layoutSelect = document.getElementById("customTabLayoutSelect");
      const confirmBtn = document.getElementById("confirmCustomTabBtn");
      const titleEl = document.getElementById("customTabModalTitle");
      if (nameInput) nameInput.value = "";
      if (layoutSelect) layoutSelect.value = "horizontal";
      if (confirmBtn) confirmBtn.textContent = "Create Tab";
      if (titleEl) titleEl.textContent = "Add a Research Tab";
      if (modal) {
        modal.style.display = "block";
        setTimeout(() => nameInput && nameInput.focus(), 0);
      }
    });
    folderTabs.appendChild(addTabBtn);

    // #research-tab-reorder — the affordance. Off by default: with it on, a tab CLICK no longer selects the
    // tab, so leaving it permanently on would break the strip's normal job. The button says which state it
    // is in and the strip changes appearance, so "these can be dragged now" is visible rather than guessed.
    const reorderBtn = document.createElement("div");
    reorderBtn.className = "folder-tab" + (tabReorderMode ? " tab-reorder-on" : "");
    reorderBtn.id = "tabReorderToggle";
    reorderBtn.style.cssText = tabReorderMode
      ? "background:#1f6feb; border-color:#58a6ff; color:#fff; font-weight:bold;"
      : "background:#1f2937; border-color:#4b5563; color:#8b949e; font-weight:bold;";
    reorderBtn.textContent = tabReorderMode ? "✓ Done reordering" : "⇄ Reorder tabs";
    reorderBtn.title = tabReorderMode
      ? "Stop reordering and go back to selecting tabs."
      : "Drag the tabs into the order you want. It is written to the mod's research screen, so the game shows the same order.";
    reorderBtn.addEventListener("click", async () => {
      tabReorderMode = !tabReorderMode;
      if (tabReorderMode) await loadTabStripOrder();
      renderTabs();
      setTabReorderStatus(tabReorderMode ? "Drag a tab to move it." : "", "#8b949e");
    });
    folderTabs.appendChild(reorderBtn);

    if (tabReorderMode) {
      const status = document.createElement("span");
      status.id = "tabReorderStatus";
      status.style.cssText = "align-self:center; margin-left:10px; font-size:12px; color:#8b949e;";
      status.textContent = "Drag a tab to move it.";
      folderTabs.appendChild(status);
      folderTabs.querySelectorAll(".folder-tab.tab-reorderable").forEach((el) => wireTabDrag(el, folderTabs));
    }

    updateOrientationButton();
    setTimeout(() => {
      updateTabScrollButtons();
      const activeEl = folderTabs.querySelector(".folder-tab.active");
      if (activeEl) activeEl.scrollIntoView({ block: "nearest", inline: "center" });
    }, 50);
  }

  function updateTabScrollButtons() {
    const folderTabs = document.getElementById("folderTabs");
    const leftBtn = document.getElementById("folderTabsScrollLeft");
    const rightBtn = document.getElementById("folderTabsScrollRight");
    if (!folderTabs || !leftBtn || !rightBtn) return;

    if (folderTabs.clientWidth === 0 && folderTabs.scrollWidth === 0) {
      leftBtn.disabled = true;
      rightBtn.disabled = folderTabs.children.length <= 1;
      return;
    }

    const maxScroll = Math.max(0, folderTabs.scrollWidth - folderTabs.clientWidth);
    leftBtn.disabled = folderTabs.scrollLeft <= 1;
    rightBtn.disabled = folderTabs.scrollLeft >= maxScroll - 1;
  }

  function wireTabScrollControls() {
    const folderTabs = document.getElementById("folderTabs");
    const leftBtn = document.getElementById("folderTabsScrollLeft");
    const rightBtn = document.getElementById("folderTabsScrollRight");
    if (!folderTabs || !leftBtn || !rightBtn) return;

    leftBtn.addEventListener("click", () => folderTabs.scrollBy({ left: -280, behavior: "smooth" }));
    rightBtn.addEventListener("click", () => folderTabs.scrollBy({ left: 280, behavior: "smooth" }));
    folderTabs.addEventListener("scroll", updateTabScrollButtons);
    folderTabs.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      folderTabs.scrollBy({ left: e.deltaY });
    }, { passive: false });
    window.addEventListener("resize", updateTabScrollButtons);
  }

  function createTabElement(tabKey, name, container) {
    const tab = document.createElement("div");
    tab.className = `folder-tab ${tabKey === activeTab ? "active" : ""}`;
    tab.dataset.tab = tabKey;
    // #research-tab-reorder — a tab is only draggable while Reorder mode is on, and only if the GAME can
    // actually be told about it. A tab with no folder behind it (a scratch tab that was never created as a
    // real technology_tags folder) has no `<folder>_tab` button in the gui, so dragging it could reorder the
    // editor and nothing else — an unkeepable promise. Those stay put and say why.
    if (tabReorderMode) {
      const folder = tabPrimaryFolder(tabKey);
      const inStrip = folder && tabStripSlots.some((s) => s.folders.includes(folder));
      if (inStrip) {
        tab.draggable = true;
        tab.classList.add("tab-reorderable");
        tab.title = "Drag to move this tab. The order is written to the mod's research screen, so the game shows it too.";
      } else {
        tab.classList.add("tab-not-reorderable");
        tab.title = "This tab has no folder in the mod's research screen yet, so its position can't be written to the game.";
      }
    }

    // Real in-game folder icon (techtree_<x>_tab.dds). These are 2-frame sprites; we show frame 1
    // via background-size:200% + position:left. Strip the placeholder emoji from the label when the
    // game icon is shown. Custom tabs use the GFX_<folder>_tab sprite the custom-folder feature wrote.
    const cfg = STANDARD_TABS[tabKey];
    const customCfg = customTabs.find((t) => t.key === tabKey);
    // Prefer the mod's REAL tab icon (from its countrytechtreeview.gui) over our hardcoded guess.
    const primaryFolder = tabPrimaryFolder(tabKey);
    const guiIcon = primaryFolder ? guiFolderIcon[primaryFolder] : "";
    const iconKey = guiIcon
      || (cfg && cfg.iconKey)
      || (customCfg && customCfg.folder ? `GFX_${customCfg.folder}_tab` : "")
      || (primaryFolder ? `GFX_${primaryFolder}_tab` : ""); // game sprites are GFX_<folderkey>_tab (folderkey already ends in _folder)
    let label = name;
    if (iconKey) {
      const ic = document.createElement("span");
      ic.className = "tab-game-icon";
      ic.style.backgroundImage = `url(/api/icon-image?key=${encodeURIComponent(iconKey)}&modPath=${encodeURIComponent(getModPath())})`;
      tab.appendChild(ic);
      // drop a leading emoji + space from the label since the real icon now represents the tab
      label = name.replace(/^\s*[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}️]+\s*/u, "").trim() || name;
    }
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    tab.appendChild(labelSpan);

    tab.addEventListener("click", () => {
      // While reordering, a click is part of a drag gesture, not a selection. Switching the canvas
      // underneath a half-finished drag is disorienting and costs a re-render for nothing.
      if (tabReorderMode) return;
      document.querySelectorAll(".folder-tab").forEach(el => el.classList.remove("active"));
      tab.classList.add("active");
      activeTab = tabKey;
      selectedTechId = null;
      updateSidebar();
      updateOrientationButton();
      renderCanvas();
      // Show the START of the newly-opened tree, INCLUDING the left-margin year stamps (a vertical tab's
      // years sit left of the first tech). renderGuiYears already ran synchronously in renderCanvas; re-run
      // once more when the async section labels paint, in case one is further left. #year-objects
      researchScrollToLeftmostContent();
      window._researchInitialScrollPending = true;
    });

    // Only USER-created scratch tabs get a delete "×" — see tabHasDeleteButton, which OWNS that rule so the
    // empty-folder hint cannot describe a button this does not draw.
    if (tabHasDeleteButton(tabKey)) {
      const deleteBtn = document.createElement("span");
      deleteBtn.className = "delete-tab-btn";
      deleteBtn.innerHTML = " &times;";
      deleteBtn.style.cssText = "margin-left: 8px; cursor: pointer; color: #ef4444; font-weight: bold; transition: all 0.15s;";
      deleteBtn.title = "Delete this custom tab";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showNovaConfirmModal(`Are you sure you want to delete custom tab "${name}"? Technologies in this tab will be moved to the Infantry tab.`, async () => {

        const ct = customTabs.find(t => t.key === tabKey);
        const deletedFolder = ct ? ct.folder : "";
        const activeRoot = getModPath();

        // STRIP IT FROM THE MOD FIRST, AND ONLY THEN TOUCH THE EDITOR (#tab-delete-verify). This used to
        // remove the tab, rewrite localStorage and reassign every tech to infantry BEFORE calling the
        // server — and then fire the request as `try { await fetch(...) } catch (_) {}`, ignoring both
        // the status and the body. So a delete that FAILED left the folder def, GUI container and sprite
        // in the mod while the editor showed the tab as gone and had already moved its techs out: the
        // orphaned tab still appears in-game (exactly what the old comment said this call existed to
        // prevent) and nothing told the user. The create path already had the right discipline — "a
        // failed scaffold never shows a phantom tab" — so delete now mirrors it. Deleting a folder that
        // is not on disk still answers ok:true, so this cannot block removing an already-gone tab.
        if (deletedFolder) {
          try {
            const res = await fetch("/api/research/delete-custom-folder", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folderKey: deletedFolder, modPath: activeRoot }),
            });
            let data = null;
            try { data = await res.json(); } catch (_) { data = null; }
            if (!res.ok || !data || data.error) throw new Error((data && data.error) || `the server refused the delete (HTTP ${res.status})`);
          } catch (err) {
            const msg = `Couldn't delete the tab "${name}": ${err.message || err}\n\nNothing was changed — the tab and its technologies are untouched.`;
            if (window.showNovaInfoModal) window.showNovaInfoModal("Couldn’t delete the tab", msg);
            else nbAlert(msg);
            return;
          }
        }

        customTabs = customTabs.filter(t => t.key !== tabKey);
        localStorage.setItem(`custom_research_tabs_${activeRoot}`, JSON.stringify(customTabs));

        if (deletedFolder) {
          allTechs.forEach(t => {
            if (t.folder === deletedFolder) {
              t.folder = "infantry_folder";
              if (t.isMod) markTechDirty(t.id); // their folder changed → must be rewritten
            }
          });
        }

        markDirty();

        if (activeTab === tabKey) {
          activeTab = "infantry_tab";
        }
        selectedTechId = null;
        renderTabs();
        renderCanvas();
        updateSidebar();
        }, { title: "Delete tab", yesLabel: "Delete", danger: true });
      });
      tab.appendChild(deleteBtn);
    }
    
    container.appendChild(tab);
  }

  // Year markers — vertical dashed lines down the canvas with year labels at the top.
  // Vanilla HOI4 spaces years irregularly (1918, 1924, 1936, 1938, 1939, 1940, 1941, ...).
  // We render at the grid column where techs of that year actually live.
  function renderYearMarkers() {
    const markersContainer = document.getElementById("yearMarkers");
    if (!markersContainer) return;
    markersContainer.innerHTML = "";
    // REDESIGNED: years are no longer a sticky side/top rail. They render as individual movable text objects
    // at their exact in-game pixels via renderGuiYears() (called from renderCanvas). This old rail is retired;
    // we keep the function (and its many callers) as a harmless no-op so nothing else breaks. #year-objects
    markersContainer.classList.remove("vertical", "compact");
    return; // old rail retired — see renderGuiYears()

    // The year ruler follows the GUI-native orientation, NOT the (toggle-able) tech layout — so a tab
    // whose techs were flipped to horizontal still shows its years where the game stamps them.
    const vertical = getYearRulerLayout() === "vertical";
    // In vertical (UP) trees the era axis runs DOWN the screen, so the markers become horizontal
    // rows down the left edge instead of vertical columns across the top.
    markersContainer.classList.toggle("vertical", vertical);
    // Game-accurate view: HOI4 has no dashed vertical year guide line — hide it (CSS) and keep just the year number,
    // which reads centered over its column, so the years no longer look "shifted left" beside a line. #compact-view
    markersContainer.classList.add("compact"); // accurate-only: game-style year strip, always

    getYearCols().forEach((col) => {
      const marker = document.createElement("div");
      marker.className = "year-marker";
      // Placement, in priority order:
      //  • 2-D free (col.pxX/pxY) — a chip the user dropped ANYWHERE; works regardless of ruler axis.
      //  • legacy 1-D free (col.px) — pinned to a custom era pixel on the ruler axis (cross axis sticky).
      //  • auto/locked — on its era grid column.
      if (col.pxX != null && col.pxY != null) {
        marker.style.left = `${col.pxX}px`; marker.style.top = `${col.pxY}px`;
        marker.classList.add("free");        // hide the long guide line — it's a free-floating chip
        marker.dataset.free2d = "1";         // stickYearLabels leaves it exactly where it was dropped
      } else {
        const eraPx = (col.px != null) ? col.px : (vertical ? effectiveOriginY + col.y * CELL_H : screenXForCoord(col.y));
        // Vertical rail lives in the fixed LEFT MARGIN (the .year-markers.vertical container, sized clear of the
        // tree). The tree's effectiveOriginX already reserves that margin, so a fixed left keeps the year numbers
        // off every box — matching the game's left-margin rail. Horizontal rail sits on the top strip. #accurate-only
        if (vertical) { marker.style.top = `${eraPx}px`; marker.style.left = "0px"; }
        else { marker.style.left = `${eraPx}px`; marker.style.top = "0px"; }
      }
      // The small label box is interactive: click SELECTS it (shows the design toolbar), double-click edits
      // the year value, drag moves it. The long guide line is not interactive, so it never steals clicks.
      const isSel = col.id != null && col.id === selectedYearId;
      const label = document.createElement("span");
      label.className = "year-marker-label" + (isSel ? " selected" : "");
      label.dataset.year = col.year;
      // PIXEL-PERFECT year: blit the string in the game's own bitmap font (hoi_36header = Orator Std, size 36)
      // via the server. This is the ONLY way to match the in-game year exactly — no web font has these glyphs
      // or their condensed metrics ("1965" = 64×25 px). Falls back to a styled span only if the image fails.
      const gimg = document.createElement("img");
      gimg.className = "year-glyph";
      gimg.alt = String(col.year);
      gimg.draggable = false;
      gimg.style.pointerEvents = "none";
      gimg.src = `/api/research/glyph-text?text=${encodeURIComponent(col.year)}&font=hoi_36header&color=e6ddc4`;
      gimg.onerror = () => { gimg.remove(); label.textContent = col.year; };
      if (col.h) gimg.style.height = col.h + "px";
      label.appendChild(gimg);
      // Per-marker DESIGN: font size + box width/height (drives both the editor look and the in-game apply).
      if (col.fontSize) label.style.fontSize = col.fontSize + "px";
      if (col.w) label.style.width = col.w + "px";
      if (col.h) { label.style.height = col.h + "px"; label.style.display = "inline-flex"; label.style.alignItems = "center"; }
      label.style.cursor = "grab";
      label.title = "Click to select (resize/duplicate/delete) · double-click to change the year · drag to move.";
      label.addEventListener("mousedown", (e) => {
        if (label.querySelector("input")) return; // already editing
        if (yearDeleteMode) { e.preventDefault(); e.stopPropagation(); if (col.id != null) deleteYearMarkerById(col.id); else deleteYearMarker(col.y, col.year); yearDeleteMode = false; updateDeleteYearButton(); return; }
        e.preventDefault();
        e.stopPropagation();
        const start = { x: e.clientX, y: e.clientY };
        let moved = false;
        label.style.cursor = "grabbing";
        const baseX = parseFloat(marker.style.left) || 0;
        const baseY = parseFloat(marker.style.top) || 0;
        const onMove = (ev) => {
          if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
          moved = true;
          const z = researchZoom || 1;
          if (yearGripMode === "free") {
            // FREE: follow the cursor on BOTH axes so a year can be dropped anywhere.
            marker.style.left = `${baseX + (ev.clientX - start.x) / z}px`;
            marker.style.top = `${baseY + (ev.clientY - start.y) / z}px`;
            marker.classList.add("free");
            if (marker._ytb) positionYearToolbar(marker, marker._ytb);
          } else {
            const delta = (vertical ? (ev.clientY - start.y) : (ev.clientX - start.x)) / z;
            if (vertical) marker.style.top = `${baseY + delta}px`;
            else marker.style.left = `${baseX + delta}px`;
          }
        };
        const onUp = (ev) => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          label.style.cursor = "grab";
          if (!moved) { selectYearMarkerFromCol(col); return; } // plain click SELECTS (freezes auto ruler first)
          const container = document.getElementById("canvasContainer");
          const rect = container.getBoundingClientRect();
          const z = researchZoom || 1;
          if (yearGripMode === "free") {
            const dropX = (ev.clientX - rect.left + container.scrollLeft) / z;
            const dropY = (ev.clientY - rect.top + container.scrollTop) / z;
            if (col.id != null) setYearFreePosById(col.id, dropX, dropY); else setYearFreePos(col.y, col.year, dropX, dropY);
          } else {
            const eraDropPx = vertical
              ? (ev.clientY - rect.top + container.scrollTop) / z
              : (ev.clientX - rect.left + container.scrollLeft) / z;
            const newCoord = vertical ? Math.round((eraDropPx - effectiveOriginY) / CELL_H) : coordForScreenX(eraDropPx);
            if (col.id != null) moveYearColumnById(col.id, newCoord); else moveYearColumn(col.y, newCoord);
          }
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      label.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); startEditYear(col.y, col.year, label, col.id); });
      // Right-click any year marker to reset the whole ruler back to auto-detected years.
      label.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if ((Array.isArray(yearColsCustom) && yearColsCustom.length) || Object.keys(yearLabelOverrides).length) {
          showNovaConfirmModal("Reset all year markers back to auto-detected positions and values for this mod?", () => resetYearCols(), { title: "Reset year markers", yesLabel: "Reset" });
        }
      });
      marker.appendChild(label);
      // Repeat the year label ALONG the guide line (yearLabelCount: 2 = both ends, 3-4 = evenly spaced) so
      // the year stays readable at multiple heights of a tall tree. Only for line markers, not free chips.
      const isFreeChip = (col.pxX != null && col.pxY != null);
      if (!isFreeChip && yearLabelCount > 1) {
        const canvas = document.getElementById("researchCanvas");
        const span = vertical ? (canvas ? canvas.offsetWidth : 0) : (canvas ? canvas.offsetHeight : 0);
        if (span > 120) {
          for (let i = 1; i < yearLabelCount; i++) {
            const frac = i / (yearLabelCount - 1); // 1..count-1 → fractions up to 1 (the far end)
            const pos = Math.round(frac * (span - 40));
            const mir = document.createElement("span");
            mir.className = "year-marker-mirror";
            mir.textContent = col.year;
            if (vertical) { mir.style.left = `${pos}px`; mir.style.top = "2px"; }
            else { mir.style.top = `${pos}px`; mir.style.left = "8px"; }
            marker.appendChild(mir);
          }
        }
      }
      if (isSel) attachYearDesignControls(marker, label, col);
      markersContainer.appendChild(marker);
    });
    stickYearLabels();
  }

  // The selected year marker's design controls: a font drag-handle + a floating toolbar with year value,
  // font −/px/+, box W/H, ⧉ duplicate and 🗑 delete. All per-marker + persisted (yearColsCustom).
  function positionYearToolbar(marker, tb) {
    // `tb` is a CHILD of the absolutely-positioned marker, so its left/top are relative to the marker itself —
    // not to the canvas. The old code set left = marker.style.left (the marker's OWN canvas coordinate), which
    // double-counted the offset and flung the toolbar far from its year. Anchor it just under the label (which
    // sits at left:8 top:9) so it always opens directly beneath the year the user clicked.
    tb.style.left = "0px";
    tb.style.top = "24px";
  }
  function attachYearDesignControls(marker, label, col) {
    const id = col.id;
    if (id == null) return;
    const clampF = (v) => Math.max(6, Math.min(120, Math.round(v) || YEAR_LABEL_DEFAULT_PX));
    // font drag-handle (corner)
    const handle = document.createElement("div");
    handle.className = "ann-resize-handle";
    handle.title = "Drag up/down to resize the year text";
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      // #year-label-click-resizes — CLICKING THE HANDLE USED TO RESIZE THE LABEL.
      //
      // A click is a mousedown and a mouseup with no movement in between, and `onUp` committed
      // unconditionally. For a marker the user had never resized, `col.fontSize` is undefined, so
      // `|| 13` wrote 13px — while the label had been rendering at the stylesheet's 19px, because the
      // renderer only applies an inline size once one exists (`if (col.fontSize)`). So merely selecting a
      // year marker permanently changed its size, and nothing said so.
      //
      // Two fixes: commit only if the pointer actually moved, and start from the size on SCREEN (19, the
      // CSS default) rather than 13, so grabbing the handle doesn't jump before the first movement.
      const startY = e.clientY, base = col.fontSize || YEAR_LABEL_DEFAULT_PX, z = researchZoom || 1;
      let moved = false;
      const onMove = (ev) => { moved = true; const n = clampF(base + (startY - ev.clientY) / z); setYearFont(id, n, false); label.style.fontSize = n + "px"; if (marker._ytbFont) marker._ytbFont.value = String(n); };
      const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); if (moved) setYearFont(id, col.fontSize || YEAR_LABEL_DEFAULT_PX, true); };
      document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    });
    marker.appendChild(handle);

    const tb = document.createElement("div");
    tb.className = "ann-toolbar year-toolbar";
    tb.addEventListener("mousedown", (e) => e.stopPropagation());
    const mkInput = (val, title, w) => { const i = document.createElement("input"); i.type = "number"; i.value = val == null ? "" : String(val); i.title = title; i.style.width = (w || 46) + "px"; i.addEventListener("mousedown", (e) => e.stopPropagation()); return i; };
    const mkBtn = (txt, title, cls) => { const b = document.createElement("button"); b.textContent = txt; b.title = title; if (cls) b.className = cls; return b; };
    const lblSpan = (t) => { const s = document.createElement("span"); s.className = "ann-tb-label"; s.textContent = t; return s; };
    const yearIn = mkInput(col.year, "Year value", 54);
    const fontIn = mkInput(col.fontSize || YEAR_LABEL_DEFAULT_PX, "Font size (px)", 44);
    const wIn = mkInput(col.w || "", "Box width (px, blank = auto)", 46);
    const hIn = mkInput(col.h || "", "Box height (px, blank = auto)", 46);
    const dupB = mkBtn("⧉", "Duplicate this year marker");
    const delB = mkBtn("🗑", "Delete this year marker", "ann-del");
    yearIn.addEventListener("input", () => { const v = parseInt(yearIn.value, 10); if (Number.isFinite(v)) setYearValue(id, v); });
    fontIn.addEventListener("input", () => { setYearFont(id, clampF(parseInt(fontIn.value, 10)), true); });
    const applyBox = () => setYearBox(id, wIn.value.trim() === "" ? null : Math.max(10, parseInt(wIn.value, 10) || 0), hIn.value.trim() === "" ? null : Math.max(10, parseInt(hIn.value, 10) || 0));
    wIn.addEventListener("input", applyBox); hIn.addEventListener("input", applyBox);
    dupB.addEventListener("click", (e) => { e.stopPropagation(); duplicateYearMarker(id); });
    delB.addEventListener("click", (e) => { e.stopPropagation(); deleteYearMarkerById(id); });
    tb.append(lblSpan("Yr"), yearIn, lblSpan("A"), fontIn, lblSpan("W"), wIn, lblSpan("H"), hIn, dupB, delB);
    marker.appendChild(tb);
    marker._ytb = tb; marker._ytbFont = fontIn;
    positionYearToolbar(marker, tb);
  }

  function selectYearMarker(id) { selectedYearId = id; renderYearMarkers(); }
  // Select the marker for a rendered col — freezing the auto/default ruler into an editable list first (so a
  // click on ANY marker, not just an already-customized one, opens its design toolbar).
  function selectYearMarkerFromCol(col) {
    if (col.id != null) { selectYearMarker(col.id); return; }
    ensureYearColsCustom(); ensureYearIds();
    const e = (yearColsCustom || []).find((c) => c.y === col.y && c.year === col.year) || (yearColsCustom || []).find((c) => c.y === col.y);
    selectYearMarker(e ? e.id : null);
  }
  function clearYearSelection() { if (selectedYearId == null) return false; selectedYearId = null; renderYearMarkers(); return true; }
  // Per-marker design setters (by id). liveOnly=false persists + re-renders; true (font drag) just persists.
  function setYearFont(id, px, persist) {
    const e = findYearById(id); if (!e) return;
    e.fontSize = Math.max(6, Math.min(120, Math.round(px) || YEAR_LABEL_DEFAULT_PX));
    const el = document.querySelector(".year-marker-label.selected");
    if (el) el.style.fontSize = e.fontSize + "px"; // live (no re-render → keeps the toolbar input focused)
    if (persist) saveYearColsCustom();
  }
  function setYearBox(id, w, h) {
    const e = findYearById(id); if (!e) return;
    if (w == null) delete e.w; else e.w = w;
    if (h == null) delete e.h; else e.h = h;
    const el = document.querySelector(".year-marker-label.selected"); // live update, keeps input focus
    if (el) {
      if (e.w) el.style.width = e.w + "px"; else el.style.removeProperty("width");
      if (e.h) { el.style.height = e.h + "px"; el.style.display = "inline-flex"; el.style.alignItems = "center"; }
      else { el.style.removeProperty("height"); el.style.removeProperty("display"); el.style.removeProperty("align-items"); }
    }
    saveYearColsCustom();
  }
  function setYearValue(id, year) {
    const e = findYearById(id); if (!e) return;
    e.year = year; saveYearColsCustom();
    // update the label live without a full re-render (keeps the toolbar input focused). The year is normally
    // a pixel-perfect glyph <img>, so refresh its src; fall back to the text node for the onerror case.
    const el = document.querySelector(`.year-marker-label.selected`);
    if (el) {
      const gi = el.querySelector("img.year-glyph");
      if (gi) { gi.alt = String(year); gi.src = `/api/research/glyph-text?text=${encodeURIComponent(year)}&font=hoi_36header&color=e6ddc4`; }
      else if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.textContent = String(year);
    }
  }
  function setYearFreePosById(id, x, y) {
    const e = findYearById(id); if (!e) return;
    e.pxX = Math.round(x); e.pxY = Math.round(y); delete e.px;
    saveYearColsCustom(); renderYearMarkers();
  }
  function moveYearColumnById(id, newCoord) {
    const e = findYearById(id); if (!e || !Number.isFinite(newCoord)) { renderYearMarkers(); return; }
    e.y = newCoord; delete e.px; delete e.pxX; delete e.pxY; // snapping to a column clears free placement
    saveYearColsCustom(); renderYearMarkers(); renderCanvas();
  }
  function deleteYearMarkerById(id) {
    if (!Array.isArray(yearColsCustom)) return;
    const removed = yearColsCustom.find((c) => c.id === id);
    yearColsCustom = yearColsCustom.filter((c) => c.id !== id);
    if (selectedYearId === id) selectedYearId = null;
    saveYearColsCustom(); renderYearMarkers(); renderCanvas();
    // Editor deletes were instant + irreversible; give the same Undo tech-node deletes get.
    if (removed && typeof showUndoToast === "function") showUndoToast("Deleted year marker", () => { ensureYearColsCustom(); yearColsCustom.push(removed); saveYearColsCustom(); renderYearMarkers(); renderCanvas(); });
  }
  // Clone a marker (new id) offset from the original so you can stack any number of same-value years.
  function duplicateYearMarker(id) {
    const e = findYearById(id); if (!e) return;
    ensureYearColsCustom();
    const clone = { ...e, id: "yr_" + (++_yearIdSeq) };
    // Offset it so it doesn't sit exactly on top of the original.
    const vertical = getYearRulerLayout() === "vertical";
    if (clone.pxX != null && clone.pxY != null) { clone.pxX += 30; clone.pxY += 26; }
    else {
      // Grid-locked: land on the next FREE slot, not just y+1 (which could sit exactly on an existing marker,
      // rendering both at the same spot and applying both to the same in-game pixel).
      clone.y = (Number(clone.y) || 0) + 1;
      let guard = 0;
      while (yearColsCustom.some((c) => c.y === clone.y) && guard++ < 500) clone.y++;
    }
    yearColsCustom.push(clone);
    selectedYearId = clone.id;
    saveYearColsCustom(); renderYearMarkers();
  }

  // Free markers carry raw pxX/pxY and get no collision guard (unlike grid markers, which refuse to stack a
  // column). A user can drag one free marker exactly onto another — both then resolve to the SAME game pixel,
  // and in-game the second label is drawn hidden behind the first (silent visual loss). Spread markers that
  // land on one pixel but carry DIFFERENT text apart along the cross axis (x for a vertical ruler, y for a
  // horizontal one) so each stays readable — which is also exactly the "several years next to each other"
  // arrangement the design tool is meant to allow. Markers with the SAME text at one pixel are left untouched
  // (harmless redundancy; don't disturb an intentional same-number stack). Distinct-pixel markers never move,
  // so the pixel-perfect transform above is preserved for the normal case. Mutates + returns `markers`.
  function decollideYearMarkers(markers, vertical) {
    const byPixel = new Map();
    for (const m of markers) {
      const key = m.x + "|" + m.y;
      if (!byPixel.has(key)) byPixel.set(key, []);
      byPixel.get(key).push(m);
    }
    for (const group of byPixel.values()) {
      if (group.length < 2) continue;
      if (new Set(group.map((g) => String(g.year))).size < 2) continue; // all same text → leave as-is
      let offset = 0;
      for (let i = 1; i < group.length; i++) {
        offset += Math.max(12, Number(group[i].h) || (Number(group[i].fontSize) || YEAR_LABEL_DEFAULT_PX) + 4);
        if (vertical) group[i].x += offset; else group[i].y += offset;
      }
    }
    return markers;
  }
  try { window.__novaDecollideYearMarkers = decollideYearMarkers; } catch (_) {}

  // ── Apply the designed years to the GAME. Convert each marker to a gui pixel via the SLOT→game-pixel
  //    transform (exact for grid-locked markers, anchored on the folder's own existing year labels); free
  //    markers are best-effort (draggable to nudge). The server writes them as instantTextBoxType labels. ──
  function resolveYearMarkersForApply(folder) {
    const gl = guiLayout[folder] || {};
    const guiYears = Array.isArray(gl.years) ? gl.years.slice() : [];
    const vertical = getYearRulerLayout() === "vertical";
    const eraOf = (o) => (vertical ? o.y : o.x);
    const crossOf = (o) => (vertical ? o.x : o.y);
    const cols = getYearCols();
    // (slot → gui era-pixel) samples: match the folder's real gui year labels to the ruler's slots by year.
    const slotByYear = new Map(cols.filter((c) => c.pxX == null && c.y != null).map((c) => [c.year, c.y]));
    const samples = [];
    guiYears.forEach((gy) => { if (slotByYear.has(gy.year)) samples.push({ slot: slotByYear.get(gy.year), era: eraOf(gy) }); });
    let slotsize = (gl.slotsize && (vertical ? gl.slotsize.height : gl.slotsize.width)) || 70;
    let anchorSlot = cols.length && cols[0].y != null ? cols[0].y : 0, anchorEra = null, crossPx = null;
    if (samples.length >= 2) {
      samples.sort((a, b) => a.slot - b.slot);
      const a = samples[0], b = samples[samples.length - 1];
      if (b.slot !== a.slot) slotsize = (b.era - a.era) / (b.slot - a.slot);
      anchorSlot = a.slot; anchorEra = a.era;
    } else if (samples.length === 1) { anchorSlot = samples[0].slot; anchorEra = samples[0].era; }
    if (guiYears.length) crossPx = crossOf(guiYears[0]);
    if (anchorEra == null) anchorEra = vertical ? 20 : 130; // vanilla-ish fallback when the folder has no year labels
    if (crossPx == null) crossPx = 50;
    const eraGamePx = (slot) => Math.round(anchorEra + ((Number(slot) || 0) - anchorSlot) * slotsize);
    // FRACTIONAL era-slot for a canvas era pixel — the exact inverse of the layout, which is now purely linear
    // (pixel = origin + slot × step, no wide-column jumps), so a free marker's drop is preserved exactly. #accurate-only
    const fracEraSlot = (px) => vertical
      ? (px - effectiveOriginY) / CELL_H
      : (px - effectiveOriginX) / SMALL_STEP;
    // Cross axis (the axis a year label does NOT travel along): a clean linear map anchored on the year-label
    // cross (crossPx). Scale = gui-slot / canvas-unit for that axis (canvas cells are bigger than gui slots).
    const crossGuiSlot = (gl.slotsize && (vertical ? gl.slotsize.width : gl.slotsize.height)) || 70;
    const crossCanvasUnit = vertical ? SMALL_STEP : CELL_H;
    const crossScale = crossGuiSlot / (crossCanvasUnit || 1);
    const resolved = cols.filter((c) => c.id != null).map((c) => {
      let gx, gy;
      if (c.pxX != null && c.pxY != null) {
        const era = eraGamePx(fracEraSlot(vertical ? c.pxY : c.pxX)); // exact, no column snap
        const cross = Math.round(crossPx + (vertical ? c.pxX : c.pxY) * crossScale);
        if (vertical) { gx = cross; gy = era; } else { gx = era; gy = cross; }
      } else {
        const era = eraGamePx(c.y); // grid-locked → exact slot math
        if (vertical) { gx = crossPx; gy = era; } else { gx = era; gy = crossPx; }
      }
      return { id: c.id, year: c.year, x: gx, y: gy, fontSize: c.fontSize || YEAR_LABEL_DEFAULT_PX, w: c.w, h: c.h };
    });
    return decollideYearMarkers(resolved, vertical); // spread accidental same-pixel/different-text overlaps
  }
  // Write the designed year labels into the folder's research gui. Called automatically by Save when the year
  // design changed (opts.silent = no dialogs, returns the count / null so Save can fold it into one message).
  async function applyYearsToGame(opts) {
    const silent = !!(opts && opts.silent);
    const folder = (currentVisibleFolders && currentVisibleFolders[0]) || "";
    if (!folder) { if (!silent) nbAlert("Open a research folder tab first."); return null; }
    ensureYearColsCustom(); ensureYearIds(); // freeze the auto-detected ruler so every year has an id to apply
    const markers = resolveYearMarkersForApply(folder);
    if (!markers.length) { if (!silent) nbAlert("No year markers to apply. Add or arrange some years first."); return 0; }
    try {
      const d = await fetch("/api/research/folder-year-labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: getModPath(), folder, markers }) }).then((r) => r.json());
      if (!d.ok) throw new Error(d.error || "failed");
      if (!silent) nbAlert(`Applied ${d.count} year label${d.count === 1 ? "" : "s"} to “${folder.replace(/_folder$/, "")}” (backed up). Reload the research screen in-game to see them. If any needs a tweak, drag it and re-apply.`, "Applied to game");
      return d.count;
    } catch (e) { if (!silent) nbAlert("Couldn't apply the years: " + (e.message || e)); if (silent) throw e; return null; }
  }
  async function removeYearsFromGame() {
    const folder = (currentVisibleFolders && currentVisibleFolders[0]) || "";
    if (!folder) { nbAlert("Open a research folder tab first."); return; }
    try {
      const d = await fetch("/api/research/folder-year-labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: getModPath(), folder, markers: [] }) }).then((r) => r.json());
      if (!d.ok) throw new Error(d.error || "failed");
      nbAlert(`Removed Nova's year labels from “${folder.replace(/_folder$/, "")}” (backed up). The mod's own year labels are untouched.`, "Removed from game");
    } catch (e) { nbAlert("Couldn't remove the years: " + (e.message || e)); }
  }

  // Move a year marker to a different grid column (the modder's manual era placement). Freezes the
  // ruler into the explicit per-mod list on first move; refuses to stack two years on one column.
  function moveYearColumn(origY, newCoord) {
    if (!Number.isFinite(newCoord) || newCoord === origY) { renderYearMarkers(); return; }
    const cols = ensureYearColsCustom();
    const entry = cols.find((c) => c.y === origY);
    if (!entry) { renderYearMarkers(); return; }
    if (cols.some((c) => c !== entry && c.y === newCoord)) { renderYearMarkers(); return; } // occupied
    entry.y = newCoord;
    delete entry.px; delete entry.pxX; delete entry.pxY; // snapping to a column clears free placement
    cols.sort((a, b) => a.y - b.y);
    saveYearColsCustom();
    renderYearMarkers();
    renderCanvas();
    if (selectedTechId) updateSidebar();
  }

  // Free placement (2-D): pin a year marker to an exact (x, y) pixel — no grid snap, any axis. This is
  // what makes "free move" work on horizontal-tech tabs too (the ruler's own axis no longer limits it).
  function setYearFreePos(coordY, year, x, y) {
    const cols = ensureYearColsCustom();
    let entry = cols.find((c) => c.y === coordY && c.year === year) || cols.find((c) => c.y === coordY);
    if (!entry) { entry = { y: coordY, year }; cols.push(entry); }
    entry.pxX = Math.round(x); entry.pxY = Math.round(y);
    delete entry.px; // upgrade any legacy 1-D placement to 2-D
    saveYearColsCustom();
    renderYearMarkers();
  }

  // Add a new year marker (toolbar button). Placed FREE just below the lowest existing one so it's
  // visible; the user edits its value (click) and drags it where they want.
  function addYearMarker() {
    const cols = ensureYearColsCustom();
    const years = cols.map((c) => c.year).filter((y) => Number.isFinite(y));
    const newYear = years.length ? Math.max(...years) + 5 : 1965;
    const maxCoord = cols.length ? Math.max(...cols.map((c) => c.y)) : 0;
    const vertical = getYearRulerLayout() === "vertical";
    // Drop the new chip free (2-D) near the end of the ruler so it's visible; the user then drags it.
    const eraPx = vertical ? (effectiveOriginY + (maxCoord + 2) * CELL_H) : screenXForCoord(maxCoord + 2);
    const cross = vertical ? 6 : 9; // sit just inside the ruler strip
    const pxX = Math.round(vertical ? cross : eraPx);
    const pxY = Math.round(vertical ? eraPx : cross);
    const entry = { y: maxCoord + 2, year: newYear, pxX, pxY, id: "yr_" + (++_yearIdSeq) };
    cols.push(entry);
    cols.sort((a, b) => a.y - b.y);
    selectedYearId = entry.id; // select the new one so its design toolbar is right there
    saveYearColsCustom();
    renderYearMarkers();
  }

  // Toggle how dragging a year marker behaves: free (drop anywhere) vs lock (snap to a tech column).
  function toggleYearGrip() {
    yearGripMode = (yearGripMode === "free") ? "lock" : "free";
    try { localStorage.setItem(`research_year_grip_${getModPath()}`, yearGripMode); } catch (_) {}
    updateYearGripButton();
  }
  function updateYearGripButton() {
    const btn = document.getElementById("yearGripBtn");
    if (!btn) return;
    btn.textContent = yearGripMode === "lock" ? "📌 Years: snap to grid" : "↔ Years: free move";
    btn.title = yearGripMode === "lock"
      ? "Dragging a year marker SNAPS it to a tech column (techs line up under it). Click to drag years freely."
      : "Dragging a year marker drops it ANYWHERE (free). Click to snap years to tech columns instead.";
  }

  // Cycle how many copies of each year run along its guide line: 1 → 2 → 3 → 4 → 1.
  function cycleYearLabelCount() {
    yearLabelCount = (yearLabelCount % 4) + 1;
    try { localStorage.setItem(`research_year_label_count_${getModPath()}`, String(yearLabelCount)); } catch (_) {}
    updateYearLabelCountButton();
    renderYearMarkers();
  }
  function updateYearLabelCountButton() {
    const btn = document.getElementById("yearLabelCountBtn");
    if (!btn) return;
    btn.textContent = `🔢 Year labels: ${yearLabelCount}${yearLabelCount === 2 ? " (both sides)" : ""}`;
    btn.title = "How many times each year is shown along its guide line: 1 = one end, 2 = both sides, 3-4 = evenly spaced. Click to cycle.";
  }

  // Show/hide each folder's real in-game background art (GFX_<folder>_techtree_bg). Per mod.
  function toggleResearchBg() {
    SHOW_RESEARCH_BG = !SHOW_RESEARCH_BG;
    try { localStorage.setItem(`research_bg_visible_${getModPath()}`, SHOW_RESEARCH_BG ? "1" : "0"); } catch (_) {}
    updateResearchBgButton();
    renderCanvas(); // the per-folder bg is set in the main render
  }
  function updateResearchBgButton() {
    const btn = document.getElementById("researchBgBtn");
    if (!btn) return;
    btn.textContent = SHOW_RESEARCH_BG ? "🖼 Background: on" : "🖼 Background: off";
    btn.classList.toggle("active", SHOW_RESEARCH_BG);
    btn.title = "Show each folder's in-game background art behind the techs. Click to toggle (per mod).";
  }

  // Show/hide techs the editor would otherwise drop from the canvas — a tech flagged "Hidden"
  // (allow = always no) or one gated out by the current DLC filter. When ON they're drawn dimmed +
  // dashed so you can find and edit them (otherwise a hidden tech is only reachable via the search box).
  // Display-only, per mod; never changes allTechs or what saves to disk.
  function toggleShowHiddenTechs() {
    SHOW_HIDDEN_TECHS = !SHOW_HIDDEN_TECHS;
    try { localStorage.setItem(`research_show_hidden_${getModPath()}`, SHOW_HIDDEN_TECHS ? "1" : "0"); } catch (_) {}
    updateShowHiddenButton();
    renderCanvas();
  }
  function updateShowHiddenButton() {
    const btn = document.getElementById("showHiddenBtn");
    if (!btn) return;
    btn.textContent = SHOW_HIDDEN_TECHS ? "👁 Hidden techs: shown" : "🙈 Hidden techs: off";
    btn.classList.toggle("active", SHOW_HIDDEN_TECHS);
    btn.title = SHOW_HIDDEN_TECHS
      ? "Hidden techs (flagged Hidden, or gated out by the DLC filter) are drawn dimmed + dashed so you can edit them. Click to hide them again."
      : "A tech flagged “Hidden” (or gated out by the DLC filter) disappears from the tree. Click to SHOW such techs (dimmed) so you can find and edit them.";
  }
  // A quiet chip rather than a modal or a toast: this is a standing fact about the mod's files, not an
  // event, and it would otherwise interrupt every single load of the research page. Hidden entirely when
  // there is nothing to say. #stale-gui-copy
  // Name the file this copy replaces. For an add-on that is the base mod's, and saying "the installed game"
  // there was not a wording slip — the comparison itself used to run against the game, which reported
  // hundreds of elements the base mod had deliberately dropped. #stale-gui-diffs-the-game-not-the-base-mod
  function staleGuiBaseLabel() {
    const p = String(staleGuiBase || "");
    if (!p) return "the file it replaces";
    // Prefer the descriptor's real name; the path leaf is a bare Steam id for any workshop mod.
    const leaf = String(staleGuiBaseName || "") || p.split(/[\\/]/).filter(Boolean).pop() || p;
    return /hearts of iron iv/i.test(leaf) ? "the installed game" : `its base mod (${leaf})`;
  }
  function updateStaleGuiChip() {
    const btn = document.getElementById("staleGuiBtn");
    if (!btn) return;
    if (!staleGuiCount) { btn.style.display = "none"; return; }
    btn.style.display = "";
    btn.textContent = `⚠ Layout file: ${staleGuiCount} missing`;
    btn.title = `This mod ships its own copy of the tech-tree layout file (interface/countrytechtreeview.gui), ` +
      `and it is missing ${staleGuiCount} element${staleGuiCount === 1 ? "" : "s"} ${staleGuiBaseLabel()} has. ` +
      `HOI4 replaces that file rather than merging it, so those are gone from your mod. Click for the list.`;
  }
  {
    const b = document.getElementById("staleGuiBtn");
    if (b) b.addEventListener("click", () => {
      nbAlert(
        `Your mod ships its own copy of interface/countrytechtreeview.gui. HOI4 REPLACES a file of the same ` +
        `name rather than merging it, so anything ${staleGuiBaseLabel()} has and this copy does not is gone ` +
        `from your mod.\n\nMissing here (${staleGuiCount}):\n` +
        staleGuiElements.slice(0, 20).map((n) => `  • ${n}`).join("\n") +
        (staleGuiCount > 20 ? `\n  … and ${staleGuiCount - 20} more` : "") +
        `\n\nThis is fine if you removed them deliberately — overhauls do. Otherwise the copy predates an ` +
        `update, and you can restore an element by copying it back from that file.`,
        "Tech-tree layout file is out of date");
    });
  }

  // Show/hide the BASE GAME's technologies on the canvas. They are always loaded in allTechs (the game
  // loads them whether or not we draw them); this only controls whether they are drawn, and every edit
  // path stays isMod-gated either way. Default ON — see SHOW_BASE_TECHS. #overlay-blindness
  function toggleShowBaseTechs() {
    SHOW_BASE_TECHS = !SHOW_BASE_TECHS;
    try { localStorage.setItem(`research_show_base_${getModPath()}`, SHOW_BASE_TECHS ? "1" : "0"); } catch (_) {}
    updateShowBaseButton();
    renderTabs();   // a tab whose only content is inherited appears/disappears with the toggle
    renderCanvas();
  }
  function updateShowBaseButton() {
    const btn = document.getElementById("showBaseTechsBtn");
    if (!btn) return;
    const n = allTechs.filter((t) => !t.isMod).length;
    btn.textContent = SHOW_BASE_TECHS ? `🏛 Base game: shown${n ? ` (${n})` : ""}` : "🚧 Base game: hidden";
    btn.classList.toggle("active", SHOW_BASE_TECHS);
    btn.title = SHOW_BASE_TECHS
      ? `The base game's ${n} technolog${n === 1 ? "y is" : "ies are"} drawn read-only alongside your mod's — this is what the game actually loads, since a mod is an overlay. Click to hide them while you work.`
      : "Base-game technologies are hidden. They are STILL loaded in game and your techs still share the tree with them — click to see what you are building next to.";
  }

  // Is this tech currently hidden from the normal canvas (so the 👁 toggle is what reveals it)?
  // SPECIAL-PROJECT TECHS ARE NOT HIDDEN HERE ANY MORE (#sp-tech-visible). `is_special_project_tech` techs
  // are invisible on the in-game tree until their project completes, so a pure previewer would omit them —
  // but this is an EDITOR, and a tech you cannot see is a tech you cannot find, place or fix. Millennium
  // Dawn ships 35 and Road to 56 ships 66 (20 in electronics alone); hiding them silently removed real,
  // editable content from the tree. They now always render, marked with a ⚗ badge so it stays obvious that
  // the game reveals them conditionally. isHidden / DLC-gated / engine-unplaced techs are still 👁-only.
  function isTechEditorHidden(tech) {
    return !!(tech && (tech.isHidden || dlcHiddenTechIds.has(tech.id) || gbUnplacedIds.has(tech.id)));
  }

  let _bgCacheBust = 0; // bumped after a Set-background upload so #researchBg reloads the new texture (same URL)
  // Upload a picture as the CURRENT folder's research background — writes it into the mod + overrides the
  // folder's bg sprite (server side), then turns the background on and re-renders with the new image.
  async function setFolderBackgroundImage(file) {
    if (!file) return;
    const folder = (currentVisibleFolders && currentVisibleFolders[0]) || activeTab || "";
    if (!folder) { nbAlert("Open a research folder first."); return; }
    const spriteKey = (guiLayout[folder] && guiLayout[folder].bgSprite) || "";
    const fd = new FormData();
    fd.append("image", file);
    fd.append("modPath", getModPath());
    fd.append("folder", folder);
    fd.append("spriteKey", spriteKey);
    try {
      const r = await fetch("/api/research/set-folder-background", { method: "POST", body: fd }).then((x) => x.json());
      if (!r || r.error) { nbAlert("Background upload failed: " + ((r && r.error) || "unknown error")); return; }
      // #bg-warnings-never-shown — the server works out two things the user needs to know and this handler
      // used to read only `error`, so both went in the bin while the editor cheerfully switched the new
      // background on:
      //   sharedWarning — one sprite is the background of SEVERAL tabs, so changing this one changes those
      //                   too. Vanilla's GFX_air_techtree_bg is shared by air_techs_folder and
      //                   bba_air_techs_folder; Millennium Dawn shares industry's across two more.
      //   warning       — nothing in the .gui references this sprite, so the game will not draw it at all.
      //                   Folders Nova creates have no background element, which is exactly when this fires.
      // Showing them AFTER the preview updates keeps the upload itself feeling instant.
      const bgNotes = [r.sharedWarning, r.warning].filter(Boolean);
      if (guiLayout[folder]) {
        guiLayout[folder].bgSprite = r.sprite; // so the render knows which sprite to draw
        // The server pre-sized the DDS to the folder's content box and reset the icon to {0,0,1}, so the
        // art now fills the tab AT ITS OWN SIZE — which is what both the game and the preview draw. This
        // used to ask for a stretch-fill on top of that, which is a thing the engine never does.
        guiLayout[folder]._bg = { mode: "fit", x: 0, y: 0, scale: 1 };
      }
      SHOW_RESEARCH_BG = true;
      try { localStorage.setItem(`research_bg_visible_${getModPath()}`, "1"); } catch (_) {}
      updateResearchBgButton();
      _bgCacheBust = Date.now(); // force #researchBg to reload the freshly-written texture
      renderCanvas();
      applyResearchBgPreview();
      if (bgNotes.length) nbAlert(bgNotes.join("\n\n"));
    } catch (e) { nbAlert("Background upload failed: " + (e && e.message || e)); }
  }

  // ─ A3: free-text annotations placed on the tree (EDITOR layer, per mod). In-game rendering would need a
  //   full countrytechtreeview.gui override (~6411 lines) — deferred as an opt-in; this is editor-only. ─
  // Moving/editing an annotation STAGES the change (marks the tree dirty) instead of persisting
  // immediately — it's committed to localStorage by persistResearchDisplayState() on "Save Changes",
  // matching the rest of the editor. A reload before Save discards the move (loadYearOverrides re-reads
  // the last-saved positions). The name is kept (call sites unchanged); the body now just stages.
  function saveResearchAnnotations() { markDirty(); }
  // The actual persist — called only from the Save flow (before loadCatalog re-reads localStorage).
  function persistResearchDisplayState() {
    try { localStorage.setItem(`research_annotations_${getModPath()}`, JSON.stringify(researchAnnotations)); } catch (_) {}
    try { localStorage.setItem(`research_gui_label_overrides_${getModPath()}`, JSON.stringify(guiLabelOverrides)); } catch (_) {}
  }
  // Which annotation is currently selected (shows its size/edit/delete toolbar). Editor-only.
  let selectedAnnotationId = null;
  function startEditAnnotation(el, ann) {
    selectedAnnotationId = ann.id;
    const prevText = ann.text || ""; // for Escape-to-cancel
    el.contentEditable = "true"; el.classList.add("editing"); el.focus();
    try { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (_) {}
    // Enter commits, Escape cancels — matching the year-label + section-label editors (this one was the
    // odd one out: Enter injected a literal newline and Escape did nothing). Shift+Enter keeps a newline. #annotation-keys
    const onKey = (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); el.blur(); }
      else if (ev.key === "Escape") { ev.preventDefault(); el.textContent = prevText; el.blur(); }
    };
    const finish = () => {
      el.contentEditable = "false"; el.classList.remove("editing");
      ann.text = (el.textContent || "").trim();
      // Only remove a label the user actually EMPTIED — never on a plain click/select.
      if (!ann.text) { researchAnnotations = researchAnnotations.filter((a) => a.id !== ann.id); if (selectedAnnotationId === ann.id) selectedAnnotationId = null; }
      saveResearchAnnotations();
      el.removeEventListener("blur", finish);
      el.removeEventListener("keydown", onKey);
      renderCanvas();
    };
    el.addEventListener("blur", finish);
    el.addEventListener("keydown", onKey);
  }
  function selectResearchAnnotation(id) { selectedAnnotationId = id; renderCanvas(); }
  // Deselect the current annotation (e.g. clicking empty canvas). Returns true if it changed something.
  function clearAnnotationSelection() { if (selectedAnnotationId == null) return false; selectedAnnotationId = null; renderCanvas(); return true; }
  function addResearchAnnotation() {
    const folder = (currentVisibleFolders && currentVisibleFolders[0]) || activeTab || "";
    const c = document.getElementById("canvasContainer"); const z = researchZoom || 1;
    const x = Math.max(40, Math.round((c ? c.scrollLeft + c.clientWidth / 2 : 600) / z));
    const y = Math.max(60, Math.round((c ? c.scrollTop + c.clientHeight / 2 : 300) / z));
    const ann = { id: "ann_" + Date.now().toString(36), folder, text: "New label", x, y, fontSize: 22 };
    researchAnnotations.push(ann);
    selectedAnnotationId = ann.id;
    saveResearchAnnotations();
    renderCanvas();
    requestAnimationFrame(() => { const el = document.querySelector(`.research-annotation[data-id="${ann.id}"]`); if (el) startEditAnnotation(el, ann); });
  }
  function positionAnnToolbar(el, tb) {
    const left = parseInt(el.style.left, 10) || 0, top = parseInt(el.style.top, 10) || 0;
    tb.style.left = left + "px"; tb.style.top = Math.max(0, top - 34) + "px";
  }
  // The selected label's controls: a corner drag-handle to scale the font, plus a mini toolbar with
  // A−/px input/A+, edit, and delete. All editor-only (saved to per-mod localStorage).
  function attachAnnotationControls(el, ann, layer) {
    const clampSize = (v) => Math.max(8, Math.min(200, Math.round(v) || 20));
    const handle = document.createElement("div");
    handle.className = "ann-resize-handle";
    handle.title = "Drag up/down to resize the text";
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const startY = e.clientY, base = ann.fontSize || 20, z = researchZoom || 1;
      const onMove = (ev) => { ann.fontSize = clampSize(base + (startY - ev.clientY) / z); el.style.fontSize = ann.fontSize + "px"; if (el._tbInput) el._tbInput.value = String(ann.fontSize); positionAnnToolbar(el, el._tb); };
      const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); saveResearchAnnotations(); };
      document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    });
    el.appendChild(handle);

    const tb = document.createElement("div");
    tb.className = "ann-toolbar";
    const input = document.createElement("input"); input.type = "number"; input.min = "8"; input.max = "200"; input.value = String(ann.fontSize || 20); input.title = "Font size (px)";
    const setSize = (v) => { ann.fontSize = clampSize(v); el.style.fontSize = ann.fontSize + "px"; input.value = String(ann.fontSize); saveResearchAnnotations(); positionAnnToolbar(el, tb); };
    const mk = (txt, title, cls) => { const b = document.createElement("button"); b.textContent = txt; b.title = title; if (cls) b.className = cls; return b; };
    const minus = mk("A−", "Smaller"), plus = mk("A+", "Larger"), editB = mk("✎", "Edit text"), delB = mk("🗑", "Delete this label", "ann-del");
    const pxLbl = document.createElement("span"); pxLbl.className = "ann-tb-label"; pxLbl.textContent = "px";
    minus.addEventListener("click", (e) => { e.stopPropagation(); setSize((ann.fontSize || 20) - 2); });
    plus.addEventListener("click", (e) => { e.stopPropagation(); setSize((ann.fontSize || 20) + 2); });
    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("input", (e) => { e.stopPropagation(); setSize(parseInt(input.value, 10)); });
    editB.addEventListener("click", (e) => { e.stopPropagation(); startEditAnnotation(el, ann); });
    delB.addEventListener("click", (e) => { e.stopPropagation(); const removed = ann; researchAnnotations = researchAnnotations.filter((a) => a.id !== ann.id); selectedAnnotationId = null; saveResearchAnnotations(); renderCanvas(); if (typeof showUndoToast === "function") showUndoToast("Deleted label", () => { researchAnnotations.push(removed); saveResearchAnnotations(); renderCanvas(); }); });
    tb.append(minus, input, pxLbl, plus, editB, delB);
    tb.addEventListener("mousedown", (e) => e.stopPropagation());
    layer.appendChild(tb);
    el._tb = tb; el._tbInput = input;
    positionAnnToolbar(el, tb);
  }
  function renderResearchAnnotations(layer) {
    if (!layer) return;
    researchAnnotations.forEach((ann) => {
      if (ann.folder && currentVisibleFolders.length && !currentVisibleFolders.includes(ann.folder)) return;
      const isSel = ann.id === selectedAnnotationId;
      const el = document.createElement("div");
      el.className = "research-annotation" + (isSel ? " selected" : ""); el.dataset.id = ann.id;
      el.textContent = ann.text || ""; el.style.left = `${ann.x}px`; el.style.top = `${ann.y}px`;
      el.style.fontSize = `${ann.fontSize || 20}px`;
      el.title = "Click to select · double-click to edit · drag to move";
      el.addEventListener("mousedown", (e) => {
        if (el.isContentEditable) return;
        e.preventDefault(); e.stopPropagation();
        const start = { x: e.clientX, y: e.clientY }; let moved = false;
        const baseX = ann.x, baseY = ann.y, z = researchZoom || 1;
        const onMove = (ev) => { if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return; moved = true; ann.x = Math.round(baseX + (ev.clientX - start.x) / z); ann.y = Math.round(baseY + (ev.clientY - start.y) / z); el.style.left = ann.x + "px"; el.style.top = ann.y + "px"; if (el._tb) positionAnnToolbar(el, el._tb); };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp);
          if (moved) saveResearchAnnotations();
          else if (!isSel) selectResearchAnnotation(ann.id); // a plain click SELECTS — never deletes/edits
        };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
      });
      el.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); startEditAnnotation(el, ann); });
      layer.appendChild(el);
      if (isSel) attachAnnotationControls(el, ann, layer);
    });
  }

  // Delete a year marker. Arms a one-shot mode (Delete Year button); the next click on a year removes it.
  function toggleDeleteYearMode() {
    yearDeleteMode = !yearDeleteMode;
    updateDeleteYearButton();
  }
  function updateDeleteYearButton() {
    const btn = document.getElementById("deleteYearBtn");
    if (!btn) return;
    btn.textContent = yearDeleteMode ? "🗑 Click a year to delete" : "🗑 Delete Year";
    btn.classList.toggle("active", yearDeleteMode);
  }
  function deleteYearMarker(coordY, year) {
    const cols = ensureYearColsCustom();
    const idx = cols.findIndex((c) => c.y === coordY && c.year === year);
    const i = idx >= 0 ? idx : cols.findIndex((c) => c.y === coordY);
    if (i >= 0) cols.splice(i, 1);
    saveYearColsCustom();
    renderYearMarkers();
  }

  // Keep the year NUMBERS pinned to the visible edge as you scroll (the dashed guide lines stay put
  // and provide the structure). Horizontal trees pin the labels to the top; vertical trees pin them
  // to the left (otherwise the left year strip scrolls completely out of view). Accounts for zoom.
  function stickYearLabels() {
    return; // RETIRED: years no longer follow the scroll — they render at their exact in-game pixels (renderGuiYears). #year-objects
    /* eslint-disable-next-line no-unreachable */
    const container = document.getElementById("canvasContainer");
    const markers = document.getElementById("yearMarkers");
    if (!container || !markers) return;
    const vertical = markers.classList.contains("vertical");
    const z = researchZoom || 1;
    // Pin the ENTIRE rail (its opaque strip, not just the text) to the viewport edge so tech boxes
    // scroll BEHIND it and are hidden — the game clips the tree to the inside of the year rail, so a
    // year is never seen floating over a box. We counteract scroll only on the CROSS axis; the era
    // axis still scrolls with the content so each year stays aligned to its tier of techs.
    if (vertical) { markers.style.left = `${container.scrollLeft / z}px`; markers.style.top = ""; }
    else { markers.style.top = `${container.scrollTop / z}px`; markers.style.left = ""; }
    // Labels now sit at their natural (CSS) spot inside the rail — clear any legacy per-label offset
    // from an older sticky scheme (and never move a label mid-edit or a freely-dropped chip).
    markers.querySelectorAll(".year-marker-label").forEach((label) => {
      if (label.querySelector("input")) return;
      const m = label.parentElement;
      if (m && m.dataset && m.dataset.free2d) return;
      label.style.left = ""; label.style.top = "";
    });
  }

  // Inline-edit a year label. Commits on Enter/blur, cancels on Escape. Persists per mod and
  // re-renders so every tech's displayed year (and the node-edit panel) reflects the new era.
  function startEditYear(coord, current, labelEl, id) {
    if (labelEl.querySelector("input")) return;
    const input = document.createElement("input");
    input.type = "number";
    input.className = "year-edit-input";
    input.value = current;
    labelEl.textContent = "";
    labelEl.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const v = parseInt(input.value, 10);
      if (!isNaN(v) && v !== current) {
        // Prefer the STABLE id (so editing one of several same-value markers targets the right one);
        // fall back to the grid-coord path for the auto/default ruler.
        const byId = id != null ? findYearById(id) : null;
        if (byId) { byId.year = v; saveYearColsCustom(); }
        else if (Array.isArray(yearColsCustom) && yearColsCustom.length) {
          const entry = yearColsCustom.find((c) => c.y === coord);
          if (entry) entry.year = v; else yearColsCustom.push({ y: coord, year: v });
          saveYearColsCustom();
        } else {
          yearLabelOverrides[coord] = v;
          saveYearOverrides();
        }
      }
      renderYearMarkers();
      renderCanvas();
      if (selectedTechId) updateSidebar();
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { done = true; renderYearMarkers(); }
    });
  }

  // Coordinate mappings. Each tab carries its own layout (horizontal == HOI4 LEFT,
  // vertical == HOI4 UP). Custom tabs fall back to "horizontal" since most folders
  // in vanilla HOI4 use LEFT.
  // A tree's horizontal/vertical orientation can't be derived from the tech positions (in HOI4 both
  // kinds progress along the same axis — it's a GUI property). So: vanilla folders use their known
  // correct layout, custom tabs use the chosen one, and the user can override ANY tab's orientation
  // with the toolbar toggle when a mod tree renders the wrong way. Overrides win and persist per mod.
  function getTechLayout(tech) {
    const tabKey = getTabForFolder(tech.folder);
    if (layoutOverrides[tabKey]) return layoutOverrides[tabKey];
    // ENGINE truth first: the tech's own gridbox `format` fixes the axis mapping (wiki verbatim — LEFT:
    // x runs up-to-down, y left-to-right; UP: x left-to-right, y up-to-down). Year-label orientation is
    // only a fallback: MD's nsb_armour proves they can disagree (LEFT gridboxes + a vertical year rail —
    // era authored in x), and inferring from labels swapped the axes there, stacking side-by-side what
    // the game stacks vertically. "horizontal" = the LEFT mapping, "vertical" = the UP mapping.
    // #gridbox-origins
    const gbFmt = (() => {
      const gb = techGbMap.get(tech.id) || (((guiLayout[tech.folder] || {}).gridboxes || [])[0]) || null;
      return gb && gb.format;
    })();
    if (gbFmt === "LEFT") return "horizontal";
    if (gbFmt === "UP" || gbFmt === "UPPER_LEFT") return "vertical";
    const gt = gameFolderTabs.find((t) => t.key === tabKey);
    if (gt) return gt.layout; // orientation read from the game's GUI year stamps
    if (STANDARD_TABS[tabKey] && STANDARD_TABS[tabKey].layout) {
      return STANDARD_TABS[tabKey].layout;
    }
    const custom = customTabs.find((t) => t.key === tabKey);
    return (custom && custom.layout) || "horizontal";
  }

  function getActiveLayout() {
    if (layoutOverrides[activeTab]) return layoutOverrides[activeTab];
    const gt = gameFolderTabs.find((t) => t.key === activeTab);
    if (gt) return gt.layout; // orientation read from the game's GUI year stamps
    if (STANDARD_TABS[activeTab] && STANDARD_TABS[activeTab].layout) {
      return STANDARD_TABS[activeTab].layout;
    }
    const custom = customTabs.find((t) => t.key === activeTab);
    return (custom && custom.layout) || "horizontal";
  }

  // Where the YEAR RULER sits, decoupled from the TECH layout (the orientation toggle).
  //  - CUSTOM (user-made) tabs: the ruler FOLLOWS the orientation toggle, so a creator who flips the
  //    tab also flips which side the year labels run down — what people expect when building a tab.
  //  - GAME tabs (MD's own folders, e.g. nsb_armour_folder): the ruler stays on the GUI-NATIVE side
  //    the game actually stamps the years (armour flows techs left→right but stamps years down the
  //    left), so flipping the TECH view doesn't drag the years off where the game draws them.
  function getYearRulerLayout() {
    if (customTabs.some((t) => t.key === activeTab)) return getActiveLayout(); // creator controls it
    if (layoutOverrides[activeTab]) return layoutOverrides[activeTab];         // explicit user choice wins
    // The RENDERED folder's own year stamps decide the rail. A tab can aggregate DLC variants with opposite
    // orientations (armour_folder horizontal + nsb_armour_folder vertical) — the tab-level entry may carry the
    // HIDDEN variant's orientation, which flipped the rail sideways and piled every year onto one pixel. #gridbox-origins
    const f0 = currentVisibleFolders && currentVisibleFolders[0];
    if (f0 && guiLayout[f0] && guiLayout[f0].orientation) return guiLayout[f0].orientation;
    const gt = gameFolderTabs.find((t) => t.key === activeTab);
    if (gt && gt.layout) return gt.layout; // orientation read straight from the GUI year stamps
    return getActiveLayout();
  }

  function layoutOverridesKey() { return `research_layout_overrides_${getModPath() || "vanilla"}`; }
  function loadLayoutOverrides() {
    try { layoutOverrides = JSON.parse(localStorage.getItem(layoutOverridesKey())) || {}; }
    catch (_) { layoutOverrides = {}; }
  }
  function saveLayoutOverrides() {
    try { localStorage.setItem(layoutOverridesKey(), JSON.stringify(layoutOverrides)); } catch (_) {}
  }
  // One-time per-mod cleanup: a GAME folder must mirror the game's own GUI orientation (read straight
  // from countrytechtreeview.gui). An earlier build let the orientation toggle persist a choice that
  // FOUGHT the GUI — e.g. MD's Armour tab got stuck "Horizontal" (era running sideways) when the game
  // lays nsb_armour_folder out vertically (era running DOWN, with the year rail down the left). Drop any
  // saved override on a game folder that contradicts its GUI orientation, exactly once per mod, so those
  // tabs snap back to matching the game. The toggle still works afterwards: a deliberate later flip is
  // saved normally and never re-cleared (the migration flag is already set).
  // Pure: which saved-override keys fight their game folder's GUI orientation (so should be dropped).
  function staleGameFolderOverrideKeys(tabs, overrides) {
    return (tabs || []).filter((gt) => {
      const ov = overrides && overrides[gt.key];
      return ov && gt.layout && ov !== gt.layout;
    }).map((gt) => gt.key);
  }
  function migrateStaleGameFolderOrientation() {
    const flagKey = `research_orient_migrated_${getModPath() || "vanilla"}`;
    try { if (localStorage.getItem(flagKey) === "1") return; } catch (_) { return; }
    const toClear = staleGameFolderOverrideKeys(gameFolderTabs, layoutOverrides);
    toClear.forEach((k) => { delete layoutOverrides[k]; });
    if (toClear.length) saveLayoutOverrides();
    try { localStorage.setItem(flagKey, "1"); } catch (_) {}
  }
  try { window.__novaStaleOrientKeys = staleGameFolderOverrideKeys; } catch (_) {}
  // Flip the ACTIVE tab between horizontal and vertical, persist, and re-render.
  function toggleActiveLayout() {
    const next = getActiveLayout() === "horizontal" ? "vertical" : "horizontal";
    layoutOverrides[activeTab] = next;
    saveLayoutOverrides();
    const ct = customTabs.find((t) => t.key === activeTab);
    if (ct) ct.layout = next; // keep custom-tab config in sync
    renderCanvas();
    updateOrientationButton();
  }
  function updateOrientationButton() {
    const btn = document.getElementById("orientationToggleBtn");
    if (!btn) return;
    const cur = getActiveLayout();
    btn.textContent = cur === "vertical" ? "Orientation: Vertical ⇅" : "Orientation: Horizontal ⇄";
    btn.title = "This tree is laid out " + cur + ". Click to flip it (use this if a mod's research tree shows sideways).";
  }

  // Sub-techs are not free-floating — they sit inside the parent rectangle at the
  // right edge. Return the parent's pixel position so the renderer can place them.
  function getSubTechParent(tech) {
    if (!tech || !tech.isSubTech) return null;
    return allTechs.find((p) => p.subTechnologies && p.subTechnologies.includes(tech.id)) || null;
  }

  // BOX top-left (what nodes/rects/drags consume): cell position in the tech's own gridbox frame + the
  // item-container offset that the game applies to the box art. pixel = origin + gbΔ + slot × gbSlot + boxOff.
  function getTechLeft(tech) {
    const parent = getSubTechParent(tech);
    if (parent) return getTechLeft(parent) + techWidth(parent) - SUBTECH_W - 6;
    const layout = getTechLayout(tech);
    const fr = techFrame(tech);
    return effectiveOriginX + fr.dx + screenXCoordOf(tech, layout) * fr.stepX + boxOffset(tech).x;
  }

  function getTechTop(tech) {
    const parent = getSubTechParent(tech);
    if (parent) {
      const parentSubs = parent.subTechnologies.filter((id) => allTechs.some((t) => t.id === id));
      const idx = parentSubs.indexOf(tech.id);
      const slotH = SUBTECH_W + 2;
      const parentTop = getTechTop(parent);
      return parentTop + 4 + idx * slotH;
    }
    const layout = getTechLayout(tech);
    const fr = techFrame(tech);
    const bandOffset = folderLaneOffset[tech.folder] || 0; // lane-band offset (horizontal only)
    return effectiveOriginY + fr.dy + (screenYCoordOf(tech, layout) + bandOffset) * fr.stepY + boxOffset(tech).y;
  }

  function snapPosition(left, top, layout, tech) {
    // Invert getTechLeft/getTechTop exactly: strip the box offset + the tech's gridbox delta, then divide
    // by ITS gridbox slot — so a drag rounds to the same cell the game would put it in. #gridbox-origins
    const fr = tech ? techFrame(tech) : { dx: 0, dy: 0, stepX: SMALL_STEP, stepY: CELL_H };
    const off = tech ? boxOffset(tech) : { x: 0, y: 0 };
    const sx = Math.round((left - off.x - fr.dx - effectiveOriginX) / fr.stepX);
    const sy = Math.round((top - off.y - fr.dy - effectiveOriginY) / fr.stepY);
    // Map screen-x/screen-y coords back to grid x/y for this orientation.
    if (layout === "horizontal") return { x: sy, y: sx };
    return { x: sx, y: sy };
  }

  function clampGridCoords(gridX, gridY, layout) {
    // Bounds follow the ACTUAL tree extent (plus a margin), not a fixed box. The old -20..14 /
    // -20..22 cap snapped late-year techs back to ~80% of the canvas and wouldn't let you drag
    // them back out — fatal for modern-era mods like Millennium Dawn whose year columns sit far
    // past grid 22. We start from a sane default and widen to whatever the data needs.
    let minX = -20, maxX = 14, minY = -20, maxY = 22;
    for (const t of allTechs) {
      if (typeof t.x === "number") { if (t.x < minX) minX = t.x; if (t.x > maxX) maxX = t.x; }
      if (typeof t.y === "number") { if (t.y < minY) minY = t.y; if (t.y > maxY) maxY = t.y; }
    }
    const M = 8; // allow dragging a few cells past the current extent in any direction
    return {
      x: Math.max(minX - M, Math.min(maxX + M, gridX)),
      y: Math.max(minY - M, Math.min(maxY + M, gridY)),
    };
  }

  function getXPos(gridStep) {
    return screenXForCoord(gridStep);
  }

  function getYPos(gridStep) {
    return effectiveOriginY + gridStep * CELL_H;
  }

  // Anchor points for a tech node: where connector lines attach to it.
  // The 183×84 card has center at +91, +42; sides at the rect edges.
  function getNodeAnchor(tech, side) {
    // A node being dragged reports its LIVE pixel position so its lines track it smoothly.
    const live = (dragAnchorOverride && dragAnchorOverride.id === tech.id) ? dragAnchorOverride : null;
    const l = live ? live.left : getTechLeft(tech);
    const t = live ? live.top : getTechTop(tech);
    const w = tech.isSubTech ? SUBTECH_W : techWidth(tech);
    const h = tech.isSubTech ? SUBTECH_W : techHeight(tech);
    // "center" = the CELL center, not the box center: the game's line grid runs through slot-cell centers
    // and the box art is offset over it (a wide box's −56,−7 exists to center it on that same point). For
    // sub-techs (badges riding the parent box, no cell of their own) the box center is the cell. #gridbox-origins
    if (side === "center" && !tech.isSubTech) {
      const fr = techFrame(tech), off = boxOffset(tech);
      return { x: l - off.x + fr.stepX / 2, y: t - off.y + fr.stepY / 2 };
    }
    switch (side) {
      case "left":   return { x: l,         y: t + h / 2 };
      case "right":  return { x: l + w,     y: t + h / 2 };
      case "top":    return { x: l + w / 2, y: t };
      case "bottom": return { x: l + w / 2, y: t + h };
      case "center": return { x: l + w / 2, y: t + h / 2 };
    }
    return { x: l + w / 2, y: t + h / 2 };
  }

  function drawLines() {
    const svg = document.getElementById("linesSvg");
    if (!svg) return;
    svg.innerHTML = "";

    const activeFolders = currentVisibleFolders;
    const activeTechs = allTechs.filter((t) => activeFolders.includes(t.folder) && !t.isHidden && !dlcHiddenTechIds.has(t.id) && !gbUnplacedIds.has(t.id));
    const techMap = new Map(activeTechs.map((t) => [t.id, t]));

    // Parent → child connectors (read from prereqs on the child; vanilla path blocks were
    // already inverted into prerequisites by the server's parser).
    activeTechs.forEach((child) => {
      if (child.isSubTech) return;
      if (!child.prerequisites) return;
      child.prerequisites.forEach((prereq) => {
        if (prereq.type === "OR") {
          prereq.techs.forEach((parentId) => {
            const parent = techMap.get(parentId);
            if (parent && !parent.isSubTech) drawCurve(parent, child, svg, true);
          });
        } else if (prereq.tech) {
          const parent = techMap.get(prereq.tech);
          if (parent && !parent.isSubTech) drawCurve(parent, child, svg, false);
        }
      });
    });

    // Dependencies (strict AND) — drawn as dashed bronze lines.
    activeTechs.forEach((child) => {
      if (child.isSubTech) return;
      if (!child.dependencies || !child.dependencies.length) return;
      child.dependencies.forEach((depId) => {
        const parent = techMap.get(depId);
        if (parent && !parent.isSubTech) drawCurve(parent, child, svg, false, "dependency");
      });
    });

    // Mutually exclusive — short dashed red line + swords marker drawn in renderCanvas.
    // Build the obstacle list once: every visible (non-sub) node's rect, so a mutex line can detour
    // around any node sitting between the two exclusive techs instead of cutting straight through it.
    const mexObstacles = activeTechs.filter((t) => !t.isSubTech).map((t) => ({ id: t.id, r: techRect(t) }));
    const drawnExclusivePairs = new Set();
    activeTechs.forEach((tech) => {
      if (tech.isSubTech) return;
      if (!tech.mutuallyExclusive || !tech.mutuallyExclusive.length) return;
      tech.mutuallyExclusive.forEach((otherId) => {
        const other = techMap.get(otherId);
        if (!other || other.isSubTech) return;
        const key = [tech.id, other.id].sort().join("<->");
        if (drawnExclusivePairs.has(key)) return;
        drawnExclusivePairs.add(key);
        drawMutualExclusiveLink(tech, other, svg, mexObstacles);
      });
    });
  }

  // Canvas-space bounding box of a tech node (matches getNodeAnchor's geometry).
  function techRect(t) {
    const l = getTechLeft(t), top = getTechTop(t);
    const w = t.isSubTech ? SUBTECH_W : techWidth(t);
    const h = t.isSubTech ? SUBTECH_W : techHeight(t);
    return { left: l, top, right: l + w, bottom: top + h };
  }
  // Segment vs axis-aligned rect (Liang–Barsky). True if the line a→b touches the rect.
  function segIntersectsRect(ax, ay, bx, by, r) {
    const inside = (x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    if (inside(ax, ay) || inside(bx, by)) return true;
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [ax - r.left, r.right - ax, ay - r.top, r.bottom - ay];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; }
      else { const t = q[i] / p[i]; if (p[i] < 0) { if (t > t0) t0 = t; } else { if (t < t1) t1 = t; } }
    }
    return t0 <= t1;
  }

  // All five anchor points of a node, for the mutex router.
  function nodeAnchors(t) {
    return {
      center: getNodeAnchor(t, "center"), top: getNodeAnchor(t, "top"),
      bottom: getNodeAnchor(t, "bottom"), left: getNodeAnchor(t, "left"), right: getNodeAnchor(t, "right"),
    };
  }
  // Pure: route a mutually-exclusive (⚔) link between two node rects. Returns the SVG path `d` AND the
  // point to pin the swords marker ON that path. Two things the old routing got wrong, both visible on
  // MD's lte ⇄ wimax pair (same row, separated by Modem/Modern Deep):
  //  1) it bowed past EVERY blocker whose x-band overlapped the pair — i.e. the whole column of techs
  //     below them — so the dashed line plunged to the BOTTOM of the tree and back (a giant box). Now it
  //     only bows past the blockers the STRAIGHT line actually crosses (the same-row techs), so it dips
  //     just under that row.
  //  2) the swords sat at the raw midpoint of the two centres, which for a separated pair lands on the
  //     unrelated tech sitting between them (the "red X on Modem"). Now the swords ride the routed line.
  // a/b: anchors from nodeAnchors(). blockers: [{ id, r:{left,top,right,bottom} }] (already excludes a,b).
  function mutexRoute(a, b, blockers) {
    const A = a.center, B = b.center;
    const hit = (blockers || []).filter((o) => segIntersectsRect(A.x, A.y, B.x, B.y, o.r));
    if (!hit.length) {
      return { d: `M ${A.x} ${A.y} L ${B.x} ${B.y}`, sword: { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 } };
    }
    const MARGIN = 22;
    const stacked = Math.abs(B.y - A.y) >= Math.abs(B.x - A.x);
    if (stacked) {
      const bowX = Math.max(A.x, B.x, ...hit.map((o) => o.r.right)) + MARGIN;
      return {
        d: `M ${a.right.x} ${a.right.y} L ${bowX} ${a.right.y} L ${bowX} ${b.right.y} L ${b.right.x} ${b.right.y}`,
        sword: { x: bowX, y: (a.right.y + b.right.y) / 2 },
      };
    }
    const bowY = Math.max(A.y, B.y, ...hit.map((o) => o.r.bottom)) + MARGIN;
    return {
      d: `M ${a.bottom.x} ${a.bottom.y} L ${a.bottom.x} ${bowY} L ${b.bottom.x} ${bowY} L ${b.bottom.x} ${b.bottom.y}`,
      sword: { x: (a.bottom.x + b.bottom.x) / 2, y: bowY },
    };
  }
  try { window.__novaMutexRoute = mutexRoute; } catch (_) {}

  function drawMutualExclusiveLink(nodeA, nodeB, svg, obstacles) {
    const blockers = (obstacles || []).filter((o) => o.id !== nodeA.id && o.id !== nodeB.id);
    const { d } = mutexRoute(nodeAnchors(nodeA), nodeAnchors(nodeB), blockers);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "connector-line mutually-exclusive-link");
    path.setAttribute("style", "stroke: #d94c2c; stroke-width: 2px; stroke-dasharray: 6 4; opacity: 0.6; fill: none;");
    svg.appendChild(path);
  }

  // Pure connector geometry: given a parent's and child's anchor points (canvas px), return the SVG
  // path `d`. Route by the DOMINANT PIXEL AXIS — a straight vertical drop when the child sits mostly
  // below/above its prerequisite, a horizontal run when it sits mostly to the side — exactly how HOI4's
  // research view draws prerequisite lines. This is deliberately independent of whether the FOLDER flows
  // techs left→right or top→down: a horizontal-flow folder (e.g. MD's nsb_armour_folder) still stacks
  // some chains in a single column (same x, e.g. small_autocannon_tech → big_autocannon_tech), and those
  // must drop straight down, not bulge out the node's right side as the old layout-flag routing did.
  // anchors = { center, top, bottom, left, right }, each { x, y }.
  // Game-accurate connector routing (wiki "Technology modding", Folder, verbatim): with "LEFT" a path "goes right
  // for one unit, then goes vertically for as much as necessary, and finally continues right for as much as
  // needed"; with "UP" it "goes down by one unit, goes horizontally for as much as needed, and then continues
  // down". So the turn sits ONE SLOT from the parent's cell — not at the midpoint — and lines run CELL-CENTER to
  // CELL-CENTER on the slot grid (the .lines-svg layer draws UNDER the boxes, z 2 vs 5, so the under-box segments
  // hide exactly like the game's). The wiki's own caveat ("does not always apply, such as when the technology is
  // fairly close") is why a stacked same-column pair is a plain straight drop (verified in-game on MD's Armour
  // tab), and why we keep dominant-axis selection rather than forcing the folder axis on near neighbours.
  // #accurate-only
  function connectorPathD(pa, ca) {
    const p = pa.center, c = ca.center;
    const dx = c.x - p.x, dy = c.y - p.y;
    if (Math.abs(dy) > Math.abs(dx)) {
      // UP-style: down (or up) one slot, across, then continue to the child's cell.
      if (Math.abs(dx) < 2) return `M ${p.x} ${p.y} L ${c.x} ${c.y}`;
      const dir = dy >= 0 ? 1 : -1;
      let elbowY = p.y + dir * CELL_H;
      // span shorter than a full slot + half: turn halfway (the game's close-case look, no overshoot)
      if (dir > 0 ? elbowY > c.y - CELL_H / 2 : elbowY < c.y + CELL_H / 2) elbowY = (p.y + c.y) / 2;
      return `M ${p.x} ${p.y} L ${p.x} ${elbowY} L ${c.x} ${elbowY} L ${c.x} ${c.y}`;
    }
    // LEFT-style: right (or left) one slot, vertical run, then continue to the child's cell.
    if (Math.abs(dy) < 2) return `M ${p.x} ${p.y} L ${c.x} ${c.y}`;
    const dir = dx >= 0 ? 1 : -1;
    let elbowX = p.x + dir * SMALL_STEP;
    if (dir > 0 ? elbowX > c.x - SMALL_STEP / 2 : elbowX < c.x + SMALL_STEP / 2) elbowX = (p.x + c.x) / 2;
    return `M ${p.x} ${p.y} L ${elbowX} ${p.y} L ${elbowX} ${c.y} L ${c.x} ${c.y}`;
  }
  try { window.__novaConnectorPathD = connectorPathD; } catch (_) {}

  function drawCurve(parent, child, svg, isOr, extraClass) {
    const anchorsOf = (t) => ({
      center: getNodeAnchor(t, "center"),
      top: getNodeAnchor(t, "top"),
      bottom: getNodeAnchor(t, "bottom"),
      left: getNodeAnchor(t, "left"),
      right: getNodeAnchor(t, "right"),
    });
    const d = connectorPathD(anchorsOf(parent), anchorsOf(child));

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    const classes = ["connector-line"];
    if (isOr) classes.push("or-branch");
    if (extraClass) classes.push(extraClass);
    if (selectedTechId === parent.id || selectedTechId === child.id) classes.push("selected");
    path.setAttribute("class", classes.join(" "));
    // Tag each connector with its endpoints so hovering a node can light up its links.
    path.dataset.parent = parent.id;
    path.dataset.child = child.id;
    svg.appendChild(path);
  }

  // Light up the connectors touching a tech (its parents + children) while hovering its node.
  function highlightTechLinks(techId, on) {
    const svg = document.getElementById("linesSvg");
    if (!svg) return;
    svg.querySelectorAll(`path[data-parent="${(window.CSS && CSS.escape) ? CSS.escape(techId) : techId}"], path[data-child="${(window.CSS && CSS.escape) ? CSS.escape(techId) : techId}"]`)
      .forEach((p) => p.classList.toggle("hover-highlight", !!on));
  }

  function resolveIconSrc(tech) {
    let iconSrc = tech.iconUrl;
    if (!iconSrc) {
      // Fallback path (server returned no iconUrl): build one ourselves, and ALWAYS carry the
      // active mod so a mod's own tech sprite resolves from the mod (not vanilla / '?').
      const key = tech.iconKey || `GFX_${tech.id}_medium`;
      iconSrc = `/api/icon-image?key=${encodeURIComponent(key)}&modPath=${encodeURIComponent(getModPath())}${activeCountryTag ? `&country=${activeCountryTag}` : ""}`;
    } else if (iconSrc.includes("/api/icon-image") && activeCountryTag && !iconSrc.includes("country=")) {
      iconSrc += `${iconSrc.includes("?") ? "&" : "?"}country=${activeCountryTag}`;
    }
    return iconSrc;
  }

  // ── In-game SECTION LABELS (read-only, draggable). Parsed from the tech-tree gui, smart-placed above the
  //    matching tech group in Nova's layout (the gui's own coords don't match Nova's), fine-tunable by drag. ──
  function updateGuiLabelsButton() {
    const btn = document.getElementById("guiLabelsBtn");
    if (!btn) return;
    btn.textContent = SHOW_GUI_LABELS ? "🏷 Section labels: on" : "🏷 Section labels: off";
    btn.classList.toggle("active", SHOW_GUI_LABELS);
  }
  function toggleGuiLabels() {
    SHOW_GUI_LABELS = !SHOW_GUI_LABELS;
    try { localStorage.setItem(`research_gui_labels_${getModPath()}`, SHOW_GUI_LABELS ? "1" : "0"); } catch (_) {}
    updateGuiLabelsButton();
    renderCanvas();
  }
  // (Game-accurate rendering is the only mode — no declutter, no alternate view. #one-look #accurate-only)
  // STAGES a section-label move (marks dirty); the real localStorage write is persistResearchDisplayState()
  // on "Save Changes". A reload before Save discards the move (loadYearOverrides re-reads last-saved).
  function saveGuiLabelOverrides() { markDirty(); }
  function stripLabelCodes(s) { return String(s == null ? "" : s).replace(/§[A-Za-z!]/g, "").replace(/\[[^\]]*\]/g, "").trim(); }

  // Place each gui label above the tech group its name refers to (e.g. "infantry_subtitle_support_weapons" →
  // the support_weapons techs). Most-specific token first, claiming techs so a generic "weapons" label doesn't
  // steal a "support_weapons" group. Labels Nova can't match fall back to a proportional map of their gui coords.
  // Measure a section label's REAL rendered size (same class → same font/padding). The old fixed
  // 150×22 box was both narrower than long labels (COMMAND AND CONTROL EQUIPMENT renders 357px) and
  // SHORTER than the real 26px height, so "de-overlapped" labels still overlapped by 4px and spilled
  // onto neighbours. Probe is created once and reused; results cached per text.
  const _guiLabelSizeCache = {};
  // REAL rendered-glyph footprint cache (src → {w,h}), populated by each label img's onload. The section
  // labels render as server-drawn bitmap-font PNGs whose word-wrap differs from a CSS text probe — a 2-line
  // label like "STEALTH CORVETTES" measures 1 line via the probe but draws 2 lines (~55px), so the declutter
  // missed a 1px clip. Using the real footprint makes the declutter exact. Keyed by the exact glyph URL so it
  // survives re-renders and folder switches. #declutter-labels
  const _guiGlyphDimCache = {};
  // The glyph-atlas URL for a label — SAME construction used to set the img src AND to look up its cached
  // footprint, so the two always agree.
  function guiGlyphSrc(l) {
    const gfont = /^[\w-]+$/.test(l.font || "") ? l.font : "hoi_33";
    const disp = stripLabelCodes(l.display || l.key);
    // box=1: the game's FULL authored textbox (maxWidth x lines*lineHeight + 2*borderY), glyphs inset by
    // borderSize + font yoffset — same fix as the year stamps. Anchoring the tight ink crop at the authored
    // pixel drew every label ~10px high and undersized its real footprint (naval headers measured 22px vs
    // the game's 41 — the exact -19px residual seen after the #anchor-centering fix). #text-box-raster
    return `/api/research/glyph-text?text=${encodeURIComponent(disp)}&font=${gfont}&maxWidth=${Math.round(l.maxWidth || 0)}&format=${encodeURIComponent(l.format || "left")}&box=1&borderX=${Math.round(l.borderX || 0)}&borderY=${Math.round(l.borderY || 0)}&maxHeight=${Math.round(l.maxHeight || 0)}&modPath=${encodeURIComponent(getModPath())}&color=e3b341`;
  }
  function measureGuiLabel(text, container, maxWidthPx, fontPx) {
    // maxWidthPx (optional) reproduces the game's textbox wrap: when a label's gui maxWidth is small
    // enough that the text wraps in-game, we cap the probe so the measured size (and the on-screen label)
    // wraps to the same lines instead of running one wide row. fontPx (optional) matches a resized label's
    // font so the de-overlap measures its true size.
    const cacheKey = text + "|" + (maxWidthPx ? Math.round(maxWidthPx) : 0) + "|" + (fontPx ? Math.round(fontPx) : 0);
    if (_guiLabelSizeCache[cacheKey]) return _guiLabelSizeCache[cacheKey];
    let probe = document.getElementById("novaGuiLabelProbe");
    // The probe must live in the SAME cascade context as the real labels (the canvas layer) — parked
    // on document.body it inherited the body font and under-measured wide labels by ~20px, which let
    // two same-row labels pass the collision check and still overlap on screen.
    const host = container || document.body;
    if (!probe) {
      probe = document.createElement("div");
      probe.id = "novaGuiLabelProbe";
      probe.className = "research-gui-label";
      probe.style.cssText = "position:absolute; visibility:hidden; left:-9999px; top:-9999px;";
      host.appendChild(probe);
    } else if (probe.parentElement !== host) {
      host.appendChild(probe); // re-home (font context can differ per host)
    }
    probe.style.maxWidth = maxWidthPx ? Math.round(maxWidthPx) + "px" : "";
    probe.style.whiteSpace = maxWidthPx ? "normal" : "nowrap";
    probe.style.fontSize = fontPx ? Math.round(fontPx) + "px" : "";
    probe.textContent = text;
    const s = { w: Math.ceil(probe.offsetWidth) || 150, h: Math.ceil(probe.offsetHeight) || 26 };
    probe.style.maxWidth = ""; probe.style.whiteSpace = ""; probe.style.fontSize = "";
    _guiLabelSizeCache[cacheKey] = s;
    return s;
  }

  // Place each in-game section label where the GAME puts it RELATIVE TO THE TECHS. Two complementary paths:
  //
  //  (1) NAME MATCH — accurate when a label's name references its tech ids (e.g. infantry's
  //      `..._subtitle_command_control_equipment` → the `command_control_equipment` tech). We drop the label
  //      right above that real tech group, so it lands on the exact lane+era of its own branch. This matters
  //      because the game gives each branch its OWN gridbox origin, so a single global transform cannot place
  //      every infantry label correctly — but the matched tech IS the ground truth.
  //
  //  (2) GEOMETRIC — for labels whose name doesn't map to a tech id (e.g. MD's air folder, where
  //      `plane_subtitle_plane_light_airframes` has no `light_airframes` tech: 0/9 matched, and the old
  //      proportional fallback scattered them to left=5098). HOI4 renders labels and tech nodes in one
  //      folder-content pixel layer (tech = gridboxOrigin + folder.position×slot; label = raw gui pixel), and
  //      both the game and Nova draw the tree in the same orientation, so gui.x→screen-x and gui.y→screen-y:
  //        • ERA axis (packed screen-x): gui.x → era grid coord via the gridbox era-origin + slot, then
  //          Nova's screenXForCoord() places it (keeps wide-column spacing correct).
  //        • LANE axis (uniform screen-y): top = (CELL_H/slot)·gui.y + B. Slope is fixed by the slotsize; B is
  //          calibrated from the MATCHED labels when any exist (their real tech tops are exact anchors), else
  //          by aligning the topmost label to the topmost tech row.
  //
  // Both paths are DLC-proof (use whatever techs are visible). A user's dragged position wins in renderGuiLabels.
  function smartPlaceGuiLabels(labels, folder, layerForMeasure, geom) {
    const layout = getActiveLayout();
    const baseWord = folder.replace(/_folder$/, "").toLowerCase();
    const techs = allTechs
      .filter((t) => t.folder === folder && !t.isSubTech && !t.isHidden && !dlcHiddenTechIds.has(t.id) && !gbUnplacedIds.has(t.id))
      .map((t) => ({
        id: String(t.id).toLowerCase(),
        exCoord: screenXCoordOf(t, layout), // era (packed screen-x) grid coord
        left: getTechLeft(t), top: getTechTop(t),
        w: isLargeTech(t) ? LARGE_W : SMALL_W, h: isLargeTech(t) ? LARGE_H : SMALL_H,
      }));
    const placed = labels.map((l) => ({ ...l }));
    if (!placed.length) return placed;
    if (!techs.length) { placed.forEach((l, i) => { l.nx = 6; l.ny = 6 + i * 30; l.matched = false; }); return placed; }

    const slot = (geom && (geom.slotH || geom.slotW)) || 70; // gui px per grid unit
    const A = CELL_H / slot;              // uniform screen-y (lane) slope, px_nova per px_gui
    const hScale = SMALL_STEP / slot;     // horizontal scale, for reproducing maxWidth text-wrap
    const HEADER_LIFT = Math.round(CELL_H * 0.28); // rest just ABOVE the row, like the game
    placed.forEach((l) => { l.mwPx = l.maxWidth ? Math.max(60, Math.round(l.maxWidth * hScale)) : 0; l.fontPx = labelFontToPx(l.font); });

    // --- (a) EXACT frame mapping (the accurate-only default): labels are hand-authored instantTextBoxTypes at
    // folder pixels — with the canvas now 1:1 with the game's grid (step == slotsize), the authored pixel maps
    // STRAIGHT through the folder's base-gridbox frame, exactly like techs: canvas = effectiveOrigin +
    // (authored − baseGridboxOrigin). No slope calibration, no lift, no name-snapping — where the modder put
    // the label is where the game draws it, so that's where we draw it. Heuristics remain only for tabs
    // without a real gridbox frame (custom tabs) or when a lane band shifts this folder. #gridbox-origins ---
    const gb0 = ((guiLayout[folder] || {}).gridboxes || [])[0] || null;
    const bandPx = (folderLaneOffset[folder] || 0) * CELL_H;
    if (gb0) {
      placed.forEach((l) => {
        l.nx = Math.round(effectiveOriginX + (l.x - gb0.x));
        l.ny = Math.round(effectiveOriginY + (l.y - gb0.y) + bandPx);
        l.matched = true;
      });
    } else {
      // --- legacy GEOMETRIC baseline + tight name-snap, for frames the gui doesn't define ---
      const B = Math.min(...techs.map((t) => t.top)) - A * Math.min(...labels.map((l) => l.y));
      const eraOriginX = geom && Number.isFinite(geom.eraOriginX) ? geom.eraOriginX : null;
      const minEx = Math.min(...techs.map((t) => t.exCoord)), maxEx = Math.max(...techs.map((t) => t.exCoord));
      const minLabelX = Math.min(...labels.map((l) => l.x)), maxLabelX = Math.max(...labels.map((l) => l.x));
      const eraGridForGuiX = (gx) => {
        if (eraOriginX != null) return (gx - eraOriginX) / slot;                       // real gridbox origin
        if (maxLabelX > minLabelX) return minEx + ((gx - minLabelX) / (maxLabelX - minLabelX)) * (maxEx - minEx);
        return minEx;                                                                  // custom tab w/o gridbox
      };
      placed.forEach((l) => {
        l.ny = Math.round(A * l.y + B) - HEADER_LIFT;
        l.nx = Math.round(screenXForCoord(eraGridForGuiX(l.x)));
        l.matched = true;
      });
      const sectionTok = (name) => String(name || "").toLowerCase().split("_")
        .filter((w) => w && w !== baseWord && w !== "subtitle" && w !== "title").join("_");
      placed.forEach((l) => {
        const tok = sectionTok(l.name);
        if (tok.length < 5) return; // too short/generic to trust over geometry
        const group = techs.filter((t) => t.id.includes(tok));
        if (!group.length) return;
        const tops = group.map((t) => t.top);
        const laneSpan = Math.max(...tops) - Math.min(...tops);
        const tight = laneSpan <= CELL_H * 1.5 || (group.length <= 5 && laneSpan <= CELL_H * 3);
        if (!tight) return; // multi-lane match — not a single branch; keep the geometric position
        l.nx = Math.round(Math.min(...group.map((t) => t.left)));
        l.ny = Math.round(Math.min(...tops)) - HEADER_LIFT;
      });
    }

    // A FRAMED folder (has a real gridbox) always keeps its EXACT authored pixels — the game draws
    // instantTextBoxType subtitles statically with no collision avoidance (wiki-confirmed), so any nudge
    // would be LESS accurate. An overlap here is either the game's own look or a Nova bug to fix — never
    // something to hide (#one-look). The de-overlap below serves ONLY frameless custom tabs, whose labels
    // have no authored game position to be faithful to.
    if (gb0) return placed;
    const PAD = 5;
    const inter = (ax, ay, aw, ah, bx, by, bw, bh, pad) =>
      ax < bx + bw + pad && bx < ax + aw + pad && ay < by + bh + pad && by < ay + ah + pad;
    const settled = [];
    // OBSTACLES = the ACTUAL rendered boxes, read straight from the DOM (tech nodes render before this — see
    // renderCanvas). Using live rects (style.left/top + offsetWidth/Height) is critical: a box's real width is
    // NOT the LARGE_W constant — naval hull cards render ~332px wide, and computing from LARGE_W (183) made the
    // declutter think a label was clear when the real box still covered it. Fall back to the computed `techs`
    // rects only if the DOM isn't populated yet. #declutter-labels
    const domBoxes = [...document.querySelectorAll("#nodesLayer .tech-node")].map((el) => ({
      x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0, w: el.offsetWidth || 0, h: el.offsetHeight || 0,
    })).filter((b) => b.w && b.h);
    const obstacleBoxes = domBoxes.length ? domBoxes : techs.map((t) => ({ x: t.left, y: t.top, w: t.w, h: t.h }));
    // The YEAR text is an obstacle too ("nothing overlaps — including texts and years"). Years now render
    // in-canvas as .research-gui-year stamps (style.left/top are canvas coords); use those rects. #declutter-labels
    const yearRects = [...document.querySelectorAll(".research-gui-year")].map((m) => {
      const x = parseFloat(m.style.left) || 0, y = parseFloat(m.style.top) || 0;
      const w = m.offsetWidth || 0, h = m.offsetHeight || 0;
      return w && h ? { x, y, w, h } : null;
    }).filter(Boolean);
    placed.sort((a, b) => (a.ny - b.ny) || (a.nx - b.nx));
    for (const a of placed) {
      const size = measureGuiLabel(stripLabelCodes(a.display || a.key || a.name || ""), layerForMeasure, a.mwPx, a.fontPx);
      a.w = size.w; a.h = size.h;
      // Prefer the REAL rendered footprint when we've seen this glyph load (bitmap-font wrap differs from the
      // CSS probe — the probe undersizes 2-line labels, so the nudge would miss a thin clip). #declutter-labels
      const gd = _guiGlyphDimCache[guiGlyphSrc(a)];
      if (gd && gd.w && gd.h) { a.w = gd.w; a.h = gd.h; }
      a.nx = Math.max(6, a.nx);
      const hit = (x, y, pad) => {
        if (y < 4 || x < 6) return true; // off the top/left edge
        for (const b of settled) { if (inter(x, y, a.w, a.h, b.x, b.y, b.w, b.h, pad)) return true; }
        for (const b of obstacleBoxes) { if (inter(x, y, a.w, a.h, b.x, b.y, b.w, b.h, pad)) return true; }
        for (const yr of yearRects) { if (inter(x, y, a.w, a.h, yr.x, yr.y, yr.w, yr.h, pad)) return true; }
        return false;
      };
      let x = a.nx, y = Math.max(4, a.ny);
      if (hit(x, y, PAD)) {
        let fx = null, fy = null;
        // Try a comfortable margin first, then tighten. Some mods pack a column so densely (air's transport
        // helicopters: 84px boxes every 140px → 56px gaps) that a wide header can't fit with a 5px margin —
        // fall back to a zero-margin fit (edges touch but don't cross) so it still lands clear. #declutter-labels
        for (const pad of [PAD, 2, 0]) {
          // 1) NEAREST-FIRST vertical scan — closest clear band above OR below (prefer up on a tie, since a
          //    header reads better just above its row). Wide range so dense tabs still find the gap.
          for (let d = 6; d <= 360 && fy == null; d += 6) {
            if (!hit(x, y - d, pad)) { fx = x; fy = y - d; }
            else if (!hit(x, y + d, pad)) { fx = x; fy = y + d; }
          }
          // 2) Still boxed in vertically (a wide label spanning several columns' boxes): slide sideways in
          //    growing steps and scan a short vertical range at each for the nearest opening.
          if (fy == null) {
            outer: for (const dx of [-40, 40, -80, 80, -140, 140, -220, 220]) {
              for (let d = 0; d <= 200 && fy == null; d += 6) {
                if (!hit(x + dx, y - d, pad)) { fx = x + dx; fy = y - d; break outer; }
                if (!hit(x + dx, y + d, pad)) { fx = x + dx; fy = y + d; break outer; }
              }
            }
          }
          if (fy != null) break; // placed at this margin — don't tighten further
        }
        if (fy != null) { x = fx; y = fy; }
      }
      a.nx = x; a.ny = y;
      settled.push({ x: a.nx, y: a.ny, w: a.w, h: a.h });
    }
    return placed;
  }

  // Inline-edit a section label's TEXT (what it says in-game). A single click (no drag) opens this; typing
  // + Enter/blur writes the new value into the active mod's localisation for that key (Esc cancels). Unlike
  // a position drag (which stages until Save), a text rename is a deliberate typed commit, so it persists on
  // Enter — mirroring how every other maker writes a name. The label keeps its in-tree spot the whole time.
  function startEditGuiLabel(el, folder, l) {
    if (!l || !l.key) return;
    // Edit the RAW loc value (including any §colour codes / [tokens]) — the label normally DISPLAYS a
    // stripLabelCodes'd version, and seeding the editor from that stripped text would silently DESTROY the
    // codes on save. Show raw while editing; re-strip for display on commit/cancel.
    const before = String(l.display != null ? l.display : l.key);
    // #label-changes-size-on-click — MATCH THE GLYPH'S SIZE BEFORE SWAPPING TO EDITABLE TEXT.
    //
    // A label normally draws as an <img> of the game's REAL font (guiGlyphSrc), with padding:0 so the
    // image's top-left is the authored pixel. Setting textContent below destroys that image and leaves
    // browser text behind — which inherits the stylesheet's 15px and the zero padding, so the label
    // visibly jumped size the moment it was clicked. Reported as "when I click on a text it enlarges".
    //
    // The onerror fallback further down already knows what a text-rendered label should look like:
    // the label's own font size and 2px 8px of padding. Use exactly that, so clicking changes what you
    // can do with the label, not how big it is.
    // Pin the box to the glyph it is replacing, so the label does not jump at all when it becomes
    // editable. The typed text is a browser font either way - it cannot be the game bitmap while a caret
    // is in it - but the FOOTPRINT stays put, which is what reads as "it changed size".
    const _glyph = el.querySelector("img.gui-label-glyph");
    const _keepH = _glyph ? _glyph.offsetHeight || el.offsetHeight : el.offsetHeight;
    if (_keepH) { el.style.minHeight = _keepH + "px"; el.style.boxSizing = "border-box"; }
    el.style.fontSize = (l.fontPx || labelFontToPx(l.font)) + "px";
    el.style.padding = "2px 8px";
    el.textContent = before;
    el.contentEditable = "true"; el.classList.add("editing");
    el.style.whiteSpace = "normal"; // let the caret wrap while typing regardless of the maxWidth wrap
    el.focus();
    try { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (_) {}
    let done = false;
    const cleanup = () => {
      el.contentEditable = "false"; el.classList.remove("editing");
      el.removeEventListener("blur", onBlur); el.removeEventListener("keydown", onKey);
    };
    const finish = (commit) => {
      if (done) return; done = true;
      cleanup();
      const after = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!commit || !after || after === before.trim()) {
        // #label-changes-size-on-click — AND IT STAYED CHANGED. This path (clicked in, changed nothing,
        // clicked away) put the stripped text back and returned, leaving the label as browser text at a
        // different size for the rest of the session — the label only became a real-font glyph again if
        // something else happened to redraw the canvas. The Escape path below already re-rendered for
        // exactly this reason; this one never adopted it.
        el.textContent = stripLabelCodes(before);
        setTimeout(() => renderCanvas(), 0); // rebuild it as the real-font glyph image it was before
        return;
      }
      el.textContent = stripLabelCodes(after); // on-screen label stays stripped
      // Cache the RAW value (display is what smartPlaceGuiLabels reads; it strips at render).
      l.display = after;
      const arr = researchGuiLabelsByFolder[folder];
      if (Array.isArray(arr)) { const it = arr.find((x) => x.key === l.key && x.name === l.name); if (it) it.display = after; }
      // STAGE it — no localisation write until Save Changes (#staged-label-text). This used to POST here,
      // so simply clicking away from a half-typed rename put it in the mod. Staging also makes the rename
      // undoable, since markDirty is what feeds the history.
      guiLabelTextPending[folder + "|" + l.key] = { folder, key: l.key, value: after };
      markDirty(`Rename label to "${stripLabelCodes(after)}"`);
      setTimeout(() => renderCanvas(), 0); // rebuild the label as a real-font glyph image with the new text
    };
    const onBlur = () => finish(true);
    const onKey = (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); el.blur(); }
      else if (ev.key === "Escape") { ev.preventDefault(); done = true; cleanup(); el.textContent = stripLabelCodes(before); el.blur(); setTimeout(() => renderCanvas(), 0); }
    };
    el.addEventListener("blur", onBlur); el.addEventListener("keydown", onKey);
  }

  function renderGuiLabels(layer) {
    if (!SHOW_GUI_LABELS || !layer) return;
    const folder = (currentVisibleFolders && currentVisibleFolders[0]) || "";
    if (!folder) return;
    if (!(folder in researchGuiLabelsByFolder)) {
      researchGuiLabelsByFolder[folder] = null; // mark as fetching (guards a re-fetch storm across renders)
      fetch(`/api/research/folder-texts?modPath=${encodeURIComponent(getModPath())}&folder=${encodeURIComponent(folder)}`)
        .then((r) => r.json())
        .then((d) => { researchGuiLabelsByFolder[folder] = (d && d.labels) || []; researchGuiGeomByFolder[folder] = (d && d.geom) || null; if (((currentVisibleFolders || [])[0]) === folder) { renderCanvas(); if (window._researchInitialScrollPending) { window._researchInitialScrollPending = false; researchScrollToLeftmostContent(); } } })
        .catch(() => { researchGuiLabelsByFolder[folder] = []; });
      return;
    }
    const labels = researchGuiLabelsByFolder[folder];
    if (!Array.isArray(labels) || !labels.length) return;
    const geom = researchGuiGeomByFolder[folder] || null;
    smartPlaceGuiLabels(labels, folder, layer, geom).forEach((l) => {
      const key = folder + "|" + (l.name || l.key);
      const ov = guiLabelOverrides[key];
      const px = ov ? ov.x : l.nx, py = ov ? ov.y : l.ny;
      const el = document.createElement("div");
      // Every label is now geometrically placed (name-matched or gridbox-mapped), so none render as the
      // old dimmed "unplaced" state.
      el.className = "research-gui-label";
      el.style.left = (px || 0) + "px"; el.style.top = (py || 0) + "px";
      const disp = stripLabelCodes(l.display || l.key);
      // PIXEL-PERFECT: render the subtitle in its REAL in-game font (hoi_33 etc) with the game's own maxWidth
      // WORD-WRAP, via the glyph-atlas endpoint. This gives the exact in-game footprint — so the label sits at
      // its authored pixel with no CSS-font width drift (the drift is what used to force the de-overlap nudge).
      // padding:0 so the image's top-left IS the authored position. Falls back to CSS text if the image fails.
      el.style.padding = "0";
      const gimg = document.createElement("img");
      gimg.className = "gui-label-glyph"; gimg.alt = disp; gimg.draggable = false; gimg.style.pointerEvents = "none";
      const gsrc = guiGlyphSrc(l);
      gimg.src = gsrc;
      // Cache the glyph's REAL displayed footprint (the frameless custom-tab de-overlap prefers it over the
      // CSS probe; framed folders never move labels, so no re-place pass is needed. #one-look)
      gimg.addEventListener("load", () => {
        const w = gimg.offsetWidth, h = gimg.offsetHeight;
        if (w && h) _guiGlyphDimCache[gsrc] = { w, h };
      });
      gimg.onerror = () => {
        gimg.remove(); el.textContent = disp; el.style.padding = "2px 8px";
        el.style.fontSize = (l.fontPx || labelFontToPx(l.font)) + "px";
        if (l.mwPx) { el.style.maxWidth = l.mwPx + "px"; el.style.whiteSpace = "normal"; }
      };
      el.appendChild(gimg);
      el.title = "In-game section label — click to edit its text, drag to reposition. Hide with 🏷 Section labels.";
      el.addEventListener("mousedown", (e) => {
        if (el.isContentEditable) return; // let the caret work while editing
        e.preventDefault(); e.stopPropagation();
        const start = { x: e.clientX, y: e.clientY }; let moved = false;
        // Base = the element's CURRENT position, not the render-time px/py closure: a second drag
        // without a re-render in between used the stale base and the label SNAPPED BACK to where the
        // first drag started before following the cursor.
        const baseX = parseFloat(el.style.left) || px || 0, baseY = parseFloat(el.style.top) || py || 0, z = researchZoom || 1;
        const onMove = (ev) => {
          if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
          if (!moved && el._hideFontTb) el._hideFontTb(); // drag started — drop the hover font toolbar so it doesn't linger
          moved = true;
          const nx = Math.round(baseX + (ev.clientX - start.x) / z), ny = Math.round(baseY + (ev.clientY - start.y) / z);
          el.style.left = nx + "px"; el.style.top = ny + "px";
          guiLabelOverrides[key] = { x: nx, y: ny };
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp);
          if (moved) { el.classList.remove("unplaced"); saveGuiLabelOverrides(); } // a real drag: stage the move
          else startEditGuiLabel(el, folder, l); // a plain click (no drag): edit the label's text
        };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
      });
      layer.appendChild(el);
      attachLabelFontControl(el, layer, folder, l);
    });
  }

  // Hover a section label → a small A− [size] A+ toolbar to change its FONT (its in-game size). HOI4 uses
  // named fonts, so this steps the SECTION_LABEL_FONTS ladder. The step updates the canvas live and STAGES
  // the change; the mod's gui is written by "Save Changes" like every other edit on this page. It used to
  // POST immediately, which made a hover-toolbar click an instant irreversible write to the user's mod —
  // out of step with the rest of the editor and easy to trigger by accident. #staged-label-font
  function attachLabelFontControl(el, layer, folder, l) {
    let tb = null, hideTimer = null;
    const positionTb = () => { if (!tb) return; const left = parseFloat(el.style.left) || 0, top = parseFloat(el.style.top) || 0; tb.style.left = left + "px"; tb.style.top = Math.max(0, top - 26) + "px"; };
    const commitFont = (newFont, isUndo) => {
      const prevFont = l.font;
      if (prevFont === newFont || !SECTION_LABEL_FONTS.some((x) => x.font === newFont)) return;
      l.font = newFont;
      const arr = researchGuiLabelsByFolder[folder];
      if (Array.isArray(arr)) { const it = arr.find((x) => (x.name || x.key) === (l.name || l.key)); if (it) it.font = newFont; }
      el.style.fontSize = labelFontToPx(newFont) + "px";
      if (tb) { const d = tb.querySelector(".lblfont-size"); if (d) d.textContent = labelFontEntry(newFont).pt; }
      positionTb();
      // STAGE it — no write until Save. Keyed by folder+label name so several labels can be pending at once.
      guiLabelFontPending[folder + "|" + (l.name || l.key)] = { folder, name: l.name, font: newFont };
      markDirty();
      if (!isUndo && typeof showUndoToast === "function") showUndoToast(`Section label font → ${labelFontEntry(newFont).pt}pt (saves on Save Changes)`, () => commitFont(prevFont, true));
    };
    const step = (dir) => { const i = labelFontIndex(l.font); const ni = Math.max(0, Math.min(SECTION_LABEL_FONTS.length - 1, i + dir)); if (ni !== i) commitFont(SECTION_LABEL_FONTS[ni].font); };
    const scheduleHide = () => { if (hideTimer) clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (tb) { tb.remove(); tb = null; } }, 260); };
    const showTb = () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      if (tb) return;
      tb = document.createElement("div");
      tb.className = "lblfont-toolbar";
      const mk = (t, title) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.title = title; b.className = "lblfont-btn"; b.addEventListener("mousedown", (e) => e.stopPropagation()); return b; };
      const minus = mk("A−", "Smaller font (writes the mod's gui — changes in-game)");
      const plus = mk("A+", "Larger font (writes the mod's gui — changes in-game)");
      const disp = document.createElement("span"); disp.className = "lblfont-size"; disp.textContent = labelFontEntry(l.font).pt; disp.title = "In-game font size";
      minus.addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
      plus.addEventListener("click", (e) => { e.stopPropagation(); step(1); });
      tb.append(minus, disp, plus);
      tb.addEventListener("mouseenter", showTb); tb.addEventListener("mouseleave", scheduleHide);
      tb.addEventListener("mousedown", (e) => e.stopPropagation());
      layer.appendChild(tb);
      positionTb();
    };
    el.addEventListener("mouseenter", () => { if (!el.isContentEditable) showTb(); });
    el.addEventListener("mouseleave", scheduleHide);
    // Let the drag handler dismiss the toolbar so it doesn't linger at the label's pre-drag spot (the cursor
    // stays over the moving label, so no mouseleave fires on its own).
    el._hideFontTb = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } if (tb) { tb.remove(); tb = null; } };
  }

  // === In-game YEAR stamps as individual movable text objects (the redesigned year system) =================
  // Each authored year instantTextBoxType is drawn at its EXACT folder pixel — mapped through the same frame as
  // techs + section labels (effectiveOrigin + authored − baseGridboxOrigin) — in the real game font (hoi_36header),
  // and it does NOT follow the scroll. Drag repositions it (per-stamp pixel override); double-click edits the
  // value. The same year can appear more than once (e.g. a left + right rail) — each stamp is its own object.
  // This is the faithful foundation the old sticky side/top rail lacked. A future toggle can re-add a
  // scroll-following mini-bar on top of this, but the stamps live where the game stamps them. #year-objects
  function guiYearKey(folder, stamp, idx) {
    return `${folder}|${stamp.name || (stamp.year + "@" + stamp.x + "," + stamp.y)}|${idx}`;
  }
  // Staged EDITOR overrides only — deliberately NOT yearsDirty.
  //
  // The original reason was that the Save auto-apply writes a Nova-owned ADDITIVE block (NOVA_YEARS) that
  // could not express "move the mod's own stamp": the original stayed and Nova's copy appeared next to
  // it, so the year showed twice. THAT IS NO LONGER TRUE — the writer now comments the mod's own year
  // labels out while Nova's are applied (#hide-original-years), so an additive block can express a move.
  //
  // What still keeps these editor-side is narrower: resolveYearMarkersForApply builds the markers it
  // sends from the year-COLUMN model (yearColsCustom), and never reads guiYearPosOverrides. Setting
  // yearsDirty here would therefore push the ruler's markers, which is not what the user just dragged.
  // Wiring the stamp overrides into resolveYearMarkersForApply is the remaining piece; the duplication
  // that used to block it is gone. Moving a RULER marker (moveYearColumn / setYearFreePos /
  // addYearMarker) does set yearsDirty and does reach the game. #year-objects
  // These persist to Nova's OWN localStorage (never the mod) and each takes an undo label. All four used to
  // skip markDirty entirely, so moving, retyping, deleting or adding a year was invisible to the history —
  // Ctrl+Z would jump straight past it to the previous tech edit. histApply calls these with no label,
  // which is also how they avoid re-recording the undo itself as a new edit. #research-undo
  function saveGuiYearPos(label) { try { localStorage.setItem(`research_gui_year_pos_${getModPath()}`, JSON.stringify(guiYearPosOverrides)); } catch (_) {} if (label) markDirty(label); }
  function saveGuiYearVal(label) { try { localStorage.setItem(`research_gui_year_val_${getModPath()}`, JSON.stringify(guiYearValOverrides)); } catch (_) {} if (label) markDirty(label); }
  function saveGuiYearHidden(label) { try { localStorage.setItem(`research_gui_year_hidden_${getModPath()}`, JSON.stringify(guiYearHidden)); } catch (_) {} if (label) markDirty(label); }
  function saveGuiYearCustom(label) { try { localStorage.setItem(`research_gui_year_custom_${getModPath()}`, JSON.stringify(guiYearCustomStamps)); } catch (_) {} if (label) markDirty(label); }
  // ➕ Add a fresh year object to the active tab, dropped mid-viewport so it's immediately visible & grabbable.
  function addGuiYearStamp() {
    const folder = (currentVisibleFolders && currentVisibleFolders[0]) || "";
    if (!folder) { nbAlert && nbAlert("Open a research folder tab first."); return; }
    const cont = document.getElementById("canvasContainer");
    const z = researchZoom || 1;
    const x = Math.round((cont.scrollLeft + cont.clientWidth / 2) / z);
    const y = Math.round((cont.scrollTop + cont.clientHeight / 2) / z);
    (guiYearCustomStamps[folder] = guiYearCustomStamps[folder] || []).push({ x, y, year: new Date().getFullYear() });
    saveGuiYearCustom("Add year stamp");
    renderCanvas();
  }
  // ↺ Drop every staged year edit for this mod — moves, value edits, hides, and added stamps.
  function resetGuiYearEdits() {
    guiYearPosOverrides = {}; guiYearValOverrides = {}; guiYearHidden = {}; guiYearCustomStamps = {};
    saveGuiYearPos(); saveGuiYearVal(); saveGuiYearHidden(); saveGuiYearCustom("Reset all year edits");
    renderCanvas();
  }
  function renderGuiYears(layer) {
    if (!layer || !SHOW_GUI_YEARS) return;
    const folder = (currentVisibleFolders && currentVisibleFolders[0]) || "";
    if (!folder) return;
    const gl = guiLayout[folder];
    const gb0 = gl ? ((gl.gridboxes || [])[0] || null) : null;
    const bandPx = (folderLaneOffset[folder] || 0) * CELL_H;
    // Authored stamps (need a gridbox frame to anchor their exact pixels) + the user's own added stamps
    // (stored in canvas px, no frame needed). Hidden authored stamps are skipped (editor-deleted).
    const stamps = [];
    if (gl && Array.isArray(gl.years) && gb0) gl.years.forEach((stamp, idx) => stamps.push({ stamp, idx, custom: false }));
    (guiYearCustomStamps[folder] || []).forEach((c, i) => stamps.push({ stamp: c, idx: i, custom: true }));
    stamps.forEach(({ stamp, idx, custom }) => {
      const authored = Number(stamp.year);
      if (!(authored >= 1800 && authored <= 2200)) return;
      const key = custom ? `${folder}|custom|${idx}` : guiYearKey(folder, stamp, idx);
      if (guiYearHidden[key]) return;
      const val = (key in guiYearValOverrides) ? guiYearValOverrides[key] : authored;
      const ov = guiYearPosOverrides[key];
      const nx = ov ? ov.x : (custom ? stamp.x : Math.round(effectiveOriginX + (stamp.x - gb0.x)));
      const ny = ov ? ov.y : (custom ? stamp.y : Math.round(effectiveOriginY + (stamp.y - gb0.y) + bandPx));
      const el = document.createElement("div");
      el.className = "research-gui-year" + (key === selectedGuiYearKey ? " selected" : "");
      el.style.left = nx + "px"; el.style.top = ny + "px";
      el.dataset.year = val;
      const font = /^[\w-]+$/.test(stamp.font || "") ? stamp.font : "hoi_36header";
      const gimg = document.createElement("img");
      gimg.className = "year-glyph"; gimg.alt = String(val); gimg.draggable = false; gimg.style.pointerEvents = "none";
      // format=center/right lay the year inside its [x, x+maxWidth] box exactly like the game (MD's rails
      // use all three alignments); the raster is maxWidth wide then, so left-edge placement is game-true.
      // box=1 → the game's FULL authored textbox (maxWidth x lineHeight+2*borderY) with the glyphs inset by
      // borderSize + the font's yoffset, so el.style.left/top IS the authored box origin and the stamp's
      // footprint matches the game (in-game debug: airtech_year3 = 170x44, not the 68x25 tight crop). #text-box-raster
      gimg.src = `/api/research/glyph-text?text=${encodeURIComponent(val)}&font=${font}&maxWidth=${Math.round(stamp.maxWidth || 0)}&format=${encodeURIComponent(stamp.format || "left")}&box=1&borderX=${Math.round(stamp.borderX || 0)}&borderY=${Math.round(stamp.borderY || 0)}&maxHeight=${Math.round(stamp.maxHeight || 0)}&modPath=${encodeURIComponent(getModPath())}&color=e6ddc4`;
      gimg.onerror = () => { gimg.remove(); el.textContent = val; el.style.color = "#e6ddc4"; el.style.font = "700 20px 'Rockwell','Courier New',monospace"; };
      el.appendChild(gimg);
      el.title = "In-game year — drag to reposition · double-click to change its value. Each stamp is its own object (the same year can appear twice, e.g. left + right).";
      // DRAG to reposition — stores a per-stamp pixel override (staged per mod, like a section label move).
      el.addEventListener("mousedown", (e) => {
        if (el.querySelector("input")) return;
        if (yearDeleteMode) {
          // 🗑 armed: this click deletes the stamp — a user-added one is removed outright; a mod-authored
          // one is hidden in the editor (the mod's gui is never touched).
          e.preventDefault(); e.stopPropagation();
          if (custom) {
            (guiYearCustomStamps[folder] || []).splice(idx, 1); saveGuiYearCustom();
            // custom keys are index-based — shift the overrides of every later stamp down one so they keep
            // pointing at the same object after the splice.
            delete guiYearPosOverrides[key]; delete guiYearValOverrides[key];
            const preLen = (guiYearCustomStamps[folder] || []).length + 1; // length before the splice
            for (let j = idx + 1; j < preLen; j++) {
              const from = `${folder}|custom|${j}`, to = `${folder}|custom|${j - 1}`;
              if (from in guiYearPosOverrides) { guiYearPosOverrides[to] = guiYearPosOverrides[from]; delete guiYearPosOverrides[from]; }
              if (from in guiYearValOverrides) { guiYearValOverrides[to] = guiYearValOverrides[from]; delete guiYearValOverrides[from]; }
            }
          } else { guiYearHidden[key] = true; saveGuiYearHidden(); delete guiYearPosOverrides[key]; delete guiYearValOverrides[key]; }
          saveGuiYearPos(); saveGuiYearVal(`Delete year ${val}`);
          yearDeleteMode = false; if (typeof updateDeleteYearButton === "function") updateDeleteYearButton();
          renderCanvas();
          return;
        }
        e.preventDefault(); e.stopPropagation();
        const start = { x: e.clientX, y: e.clientY };
        const baseX = parseFloat(el.style.left) || 0, baseY = parseFloat(el.style.top) || 0, z = researchZoom || 1;
        let moved = false;
        el.style.cursor = "grabbing";
        const onMove = (ev) => {
          if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
          moved = true;
          el.style.left = `${Math.round(baseX + (ev.clientX - start.x) / z)}px`;
          el.style.top = `${Math.round(baseY + (ev.clientY - start.y) / z)}px`;
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp);
          el.style.cursor = "grab";
          if (!moved) {
            // Select IN PLACE. This used to call renderCanvas(), which rebuilt every year node — so the
            // second click of a double-click landed on a brand-new element, the two clicks had different
            // targets, and the browser fired `dblclick` on their common ancestor instead of on the stamp.
            // Double-click-to-edit-the-year was therefore dead on arrival; keeping the element alive is
            // what makes it work. #year-inplace-edit
            selectedGuiYearKey = (selectedGuiYearKey === key) ? null : key;
            layer.querySelectorAll(".research-gui-year.selected").forEach((n) => n.classList.remove("selected"));
            if (selectedGuiYearKey === key) el.classList.add("selected");
            return;
          }
          guiYearPosOverrides[key] = { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 };
          saveGuiYearPos(`Move year ${val}`);
        };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
      });
      // DOUBLE-CLICK to edit the value (numeric). Stored as a per-stamp value override.
      el.addEventListener("dblclick", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (el.querySelector("input")) return;
        const input = document.createElement("input");
        input.type = "number"; input.className = "year-edit-input"; input.value = val;
        el.innerHTML = ""; el.appendChild(input); input.focus(); input.select();
        let done = false;
        const commit = () => {
          if (done) return; done = true;
          const v = parseInt(input.value, 10);
          if (!isNaN(v) && v !== val && v >= 1800 && v <= 2200) { guiYearValOverrides[key] = v; saveGuiYearVal(`Year ${val} → ${v}`); }
          renderCanvas();
        };
        input.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); commit(); } else if (ev.key === "Escape") { done = true; renderCanvas(); } });
        input.addEventListener("blur", commit);
      });
      layer.appendChild(el);
    });
  }

  // Preview the current folder's in-game background transform on #researchBg. FIT (the default) stretches the
  // art to fill the whole canvas (background-size:100% 100%). MANUAL places it at x/y and scales it, top-left
  // anchored to match HOI4's plain bg icon (no centerposition). Editor-only display — driven by the per-folder
  // cache guiLayout[folder]._bg = {mode,x,y,scale}; unset ⇒ fit. Called after each render + on panel changes.
  // The natural pixel size of a background texture, cached per URL. Needed because the engine draws the
  // sprite at its own size and CSS can only express that in pixels once we know what they are.
  const _bgNatural = new Map();
  function bgNaturalSize(url, onReady) {
    const src = String(url || "").replace(/^url\((.*)\)$/, "$1").replace(/^["']|["']$/g, "");
    if (!src) return null;
    if (_bgNatural.has(src)) return _bgNatural.get(src);
    _bgNatural.set(src, null); // in flight — never queue a second load for the same texture
    const im = new Image();
    im.onload = () => {
      _bgNatural.set(src, { w: im.naturalWidth, h: im.naturalHeight });
      try { if (onReady) onReady(); } catch (_) {}
    };
    im.onerror = () => { _bgNatural.set(src, { w: 0, h: 0 }); };
    im.src = src;
    return null;
  }

  function applyResearchBgPreview() {
    const bgEl = document.getElementById("researchBg");
    if (!bgEl) return;
    const folder = (currentVisibleFolders && currentVisibleFolders[0]) || "";
    const gl = folder ? guiLayout[folder] : null;
    const cfg = (gl && gl._bg) || null;

    // The authored transform has to be known at FIRST render. gui-layout carries only the sprite's name,
    // and `_bg` is filled in by the Background panel — which most people never open — so a backdrop with
    // a non-zero authored position (Old World Blues authors 410,60) was drawn at 0,0 until they did.
    // Ask the endpoint that already serves it, once per folder, then re-render.
    if (gl && gl.bgSprite && !gl._bg && !gl._bgFetch) {
      gl._bgFetch = true;
      fetch(`/api/research/folder-bg-transform?modPath=${encodeURIComponent(getModPath())}&folder=${encodeURIComponent(folder)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d || !d.ok || !d.bg) return;
          gl._bg = { mode: "fit", x: Number(d.bg.x) || 0, y: Number(d.bg.y) || 0, scale: Number(d.bg.scale) || 1 };
          applyResearchBgPreview();
        })
        .catch(() => {});
    }

    // ONE MODEL FOR EVERY MODE, because the engine has only one. #bg-scale-is-canvas-percent
    //
    // A tech-tree backdrop is an iconType over a plain spriteType: HOI4 draws the .dds at its NATIVE
    // pixel size, times the authored `scale`, at the container's origin plus the authored `position`.
    // `fit` and `manual` are only two ways of authoring that same transform, so they render alike here;
    // what used to separate them was a stretch the game never performs. background-size percentages are
    // a share of THIS ELEMENT — which spans the whole scroll canvas — so `100% 100%` blew vanilla's
    // 959x715 infantry art up to 5200x2400, and manual's `scale*100%` made scale 1 mean the same thing.
    const s = cfg ? Math.max(0.1, Number(cfg.scale) || 1) : 1;
    const ax = cfg ? Math.round(Number(cfg.x) || 0) : 0;
    const ay = cfg ? Math.round(Number(cfg.y) || 0) : 0;
    // Anchored through the SAME frame as techs, labels and years (effectiveOrigin + authored - gb0), at
    // the folder's content PANE — because that is where the backdrop actually lives. In the gui the icon
    // is nested inside the pane:
    //     containerWindowType { name = "techtree_stripes"  position = { x=-210 y=0 }
    //         iconType { name="artillery_techtree_bg"  position = { x=0 y=0 } } }
    // so its authored position is pane-relative and the pane's own origin belongs in the sum. I briefly
    // removed it, on a live reading taken from a page with NO TECHS LOADED whose labels were sitting in
    // an empty-state stack — the two forms agree wherever the pane is at 0,0, which is most folders, and
    // differ by 210px on Millennium Dawn's artillery, where the pane is not.
    //
    // The icon's OWN authored position is then added, which is the part that really was missing: Old
    // World Blues authors 410,60 on one backdrop and Millennium Dawn -75 on another's y, and both were
    // drawn as though they were 0,0.
    const pane = (gl && gl.canvas) || null;
    const gb0 = gl ? ((gl.gridboxes || [])[0] || null) : null;
    let px = 0, py = 0;
    if (pane && gb0) {
      px = Math.round(effectiveOriginX + (pane.x - gb0.x));
      py = Math.round(effectiveOriginY + (pane.y - gb0.y));
    }
    px += ax; py += ay;
    // Natural size may not be known on the first pass (the texture is still loading); re-apply once it
    // is, rather than leaving a stale `auto` behind. `auto` IS the natural size, so the interim frame is
    // already correct for scale 1 — the re-apply only matters when a scale is authored.
    const nat = bgNaturalSize(bgEl._novaBgUrl, () => applyResearchBgPreview());
    if (nat && nat.w > 0 && nat.h > 0) {
      bgEl.style.backgroundSize = `${Math.round(nat.w * s)}px ${Math.round(nat.h * s)}px`;
    } else if (Math.abs(s - 1) < 1e-6) {
      bgEl.style.backgroundSize = "auto";
    }
    bgEl.style.backgroundPosition = `${px}px ${py}px`;
  }

  function computeNodeState(tech) {
    if (countryResearchedTechs.has(tech.id)) return "completed";
    if (!tech.prerequisites || tech.prerequisites.length === 0) return "available";
    for (const p of tech.prerequisites) {
      if (p.type === "OR") {
        if (!p.techs.some((parentId) => countryResearchedTechs.has(parentId))) return "locked";
      } else if (!countryResearchedTechs.has(p.tech)) {
        return "locked";
      }
    }
    return "available";
  }

  // Build the inner HTML for a 183×84 HOI4 tech card.
  function renderTechCardInner(tech) {
    const iconSrc = resolveIconSrc(tech);
    const defaultIcon = "/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds";
    const subTechSlots = (tech.subTechnologies || [])
      .map((id) => allTechs.find((t) => t.id === id))
      .filter(Boolean)
      .slice(0, 3);

    let subTechHtml = "";
    if (subTechSlots.length) {
      subTechHtml = `<div class="tech-node-subtechs">`;
      subTechSlots.forEach((sub) => {
        const subIcon = resolveIconSrc(sub);
        const subSelected = sub.id === selectedTechId ? "selected" : "";
        subTechHtml += `
          <div class="sub-tech-slot ${subSelected}" data-id="${sub.id}" title="${sub.name || sub.id}">
            <img src="${subIcon}" alt="" draggable="false" loading="lazy" decoding="async" data-fallback="${defaultIcon}" />
          </div>
        `;
      });
      // Padding slots so the rectangle stays balanced
      for (let i = subTechSlots.length; i < 3; i++) {
        subTechHtml += `<div class="sub-tech-slot empty"></div>`;
      }
      subTechHtml += `</div>`;
    }

    // One structure; the .tech-node-large / .tech-node-small class on the parent flips the layout
    // (large = icon left + name beside it, like the game's equipment item; small = icon over name).
    // Game-accurate (compact) view mirrors HOI4: the SMALL item is icon-only (name on hover), the WIDE equipment item
    // shows its name beside the icon. Normal view always shows the name. The name still rides the node title tooltip
    // for the icon-only tiles (set in renderCanvas). #compact-view
    const headerHtml = (!isLargeTech(tech)) ? "" : `<div class="tech-node-header" title="${(tech.name || tech.id).replace(/"/g, "&quot;")}">${tech.name || tech.id}</div>`;
    // A special-project tech is fully editable here but the GAME only reveals it once its project completes,
    // so mark it rather than hide it — the badge is the difference between "missing" and "conditional". #sp-tech-visible
    const spHtml = tech.specialProjectTech
      ? `<div class="tech-sp-badge" title="Special-project technology — the game only shows this on the tree once its special project is complete. Editable here.">⚗</div>`
      : "";
    return `
      <div class="tech-node-body">
        <div class="tech-node-icon">
          <img src="${iconSrc}" alt="" draggable="false" loading="lazy" decoding="async" />
        </div>
        ${headerHtml}
        ${subTechHtml}
        ${spHtml}
      </div>
    `;
  }

  // Render visual canvas
  function renderCanvas() {
    const nodesLayer = document.getElementById("nodesLayer");
    if (!nodesLayer) return;
    nodesLayer.innerHTML = "";

    // DLC filter first (origin/column/lane math below must ignore techs the game hides), then origins.
    recomputeDlcHiddenTechIds();
    computeEffectiveOrigins();
    renderYearMarkers();

    // Themed per-folder background art behind the techs (server room for electronics, industrial for
    // civilian…). Parsed + ready, but OFF for now (SHOW_RESEARCH_BG) — the user wants to opt into it
    // later, not see it yet. Flip SHOW_RESEARCH_BG to true (or wire a toolbar toggle) to draw them.
    // Purely cosmetic; sits at z-index 0 behind everything, so it never affects tech placement.
    const bgEl = document.getElementById("researchBg");
    if (bgEl) {
      let bgKey = "";
      if (SHOW_RESEARCH_BG) {
        for (const f of currentVisibleFolders) { if (guiLayout[f] && guiLayout[f].bgSprite) { bgKey = guiLayout[f].bgSprite; break; } }
      }
      if (bgKey) {
        // Guard: only touch backgroundImage when it actually changes, so a plain node-rebuild render
        // doesn't invalidate the background's composite layer (keeps the "lag" fix effective).
        const url = `url(/api/icon-image?key=${encodeURIComponent(bgKey)}&modPath=${encodeURIComponent(getModPath())}${_bgCacheBust ? "&_t=" + _bgCacheBust : ""})`;
        if (bgEl._novaBgUrl !== url) { bgEl.style.backgroundImage = url; bgEl._novaBgUrl = url; }
        bgEl.style.display = "";
      } else {
        if (bgEl._novaBgUrl) { bgEl.style.backgroundImage = ""; bgEl._novaBgUrl = ""; }
        bgEl.style.display = "none";
      }
      // Suppress the editor's purple wash + helper grid while real art is behind the techs, so nothing
      // of ours tints it (#bg-accurate). Keyed on whether art is ACTUALLY showing, not just on the
      // toggle — a folder with no bgSprite still gets the grid, which is what you want on a bare canvas.
      const showingArt = !!bgKey;
      const cont = document.getElementById("canvasContainer");
      if (cont) cont.classList.toggle("bg-on", showingArt);
      const rc = document.getElementById("researchCanvas");
      if (rc) rc.classList.toggle("bg-on", showingArt);
    }

    const activeFolders = currentVisibleFolders;
    // Sub-techs render INSIDE their parent now — exclude them from the top-level loop. Techs the DLC
    // filter hides (e.g. nsb_* with No Step Back off) are dropped here — display-only, allTechs is intact.
    // Hidden techs (flagged Hidden, or DLC-gated out) are normally dropped here — display-only, allTechs
    // is intact. The 👁 "Hidden techs" toggle draws them anyway (dimmed + dashed, below) so they can be
    // found and edited; the surrounding layout (columns/years/packing) still ignores them, so revealing
    // a hidden tech never reflows the visible tree.
    const techIsVisible = (t) =>
      !t.isSubTech &&
      (SHOW_BASE_TECHS || t.isMod) &&
      (SHOW_HIDDEN_TECHS || (!t.isHidden && !dlcHiddenTechIds.has(t.id) && !gbUnplacedIds.has(t.id)));

    // #tech-in-two-tabs — A TECH THAT DECLARES A SECOND `folder` BLOCK IS DRAWN IN THAT TAB TOO.
    //
    // HOI4 draws a technology in every folder it names, at that folder's own position. Nova compared the
    // scalar `t.folder === f` everywhere, so the tech appeared in the first tab only and the other tab had a
    // hole where the game draws a node — free space that is not free to anyone laying that tab out.
    // Vanilla alone does this 12 times: `radio` is in Electronics at (-3,2) and in Support at (11,9);
    // `motorised_infantry` in Infantry and Support; the rest are DLC pairs (BBA/NSB/MTG folder + its base
    // folder), so the missing node is exactly what someone browsing without that DLC's tab would look for.
    //
    // ⛔ THESE ARE RENDER-ONLY COPIES AND MUST NEVER ENTER `allTechs`. The save path is
    // `allTechs.filter((t) => t.isMod && idsToSave.has(t.id))` — a duplicate id there would send one tech
    // twice with two different positions, into the writer that has already corrupted mods twice. They are
    // built here, used here, and discarded with the render.
    const secondaryPlacements = [];
    for (const t of allTechs) {
      if (!Array.isArray(t.extraFolders) || !t.extraFolders.length || !techIsVisible(t)) continue;
      for (const f of t.extraFolders) {
        if (!f || !activeFolders.includes(f.folderName)) continue;
        secondaryPlacements.push(Object.assign({}, t, {
          folder: f.folderName, x: f.x, y: f.y, posVarX: f.posVarX, posVarY: f.posVarY,
          isSecondaryPlacement: true, primaryFolder: t.folder,
        }));
      }
    }

    const activeTechs = allTechs
      .filter((t) => activeFolders.includes(t.folder) && techIsVisible(t))
      .concat(secondaryPlacements);

    // Only mark inherited nodes as such when the mod HAS techs of its own to contrast them with. In
    // "vanilla" mode every tech is isMod:false, and dimming the entire tree would be nonsense. #overlay-blindness
    const anyOwnTech = allTechs.some((t) => t.isMod);

    activeTechs.forEach((tech) => {
      const nodeState = computeNodeState(tech);
      const hasSubs = (tech.subTechnologies || []).some((id) => allTechs.some((t) => t.id === id));
      const node = document.createElement("div");
      const large = isLargeTech(tech);
      // Only relevant while the 👁 toggle is on: this tech is normally hidden (flagged Hidden / DLC-gated).
      const editorHidden = SHOW_HIDDEN_TECHS && isTechEditorHidden(tech);
      node.className = [
        "tech-node",
        large ? "tech-node-large" : "tech-node-small",
        "tech-node-compact", // accurate-only: the game's real box mix, always
        nodeState,
        tech.id === selectedTechId ? "selected" : "",
        tech.isMod ? "" : "vanilla",
        !tech.isMod && anyOwnTech ? "inherited" : "",
        hasSubs ? "has-subtechs" : "",
        editorHidden ? "tech-node-editor-hidden" : ""
      ].filter(Boolean).join(" ");

      node.style.left = `${getTechLeft(tech)}px`;
      node.style.top = `${getTechTop(tech)}px`;
      node.style.width = `${techWidth(tech)}px`;
      node.style.height = `${techHeight(tech)}px`;
      // In compact view the name is hidden, so the tile's tooltip carries it (hover to identify a tech). #compact-view
      node.title = tech.name || tech.id; // small tiles carry no printed name (like the game) — the tooltip covers it
      node.dataset.id = tech.id;
      if (tech.isSecondaryPlacement) {
        // ⚠️ MARK IT HERE, NOT BESIDE setupDrag. The drag wiring lives inside `if (tech.isMod)`, and a
        // base-game tech is never draggable — so a branch there is unreachable for exactly the techs this
        // is mostly about: 12 of the 29 are vanilla's own. The node drew correctly and said nothing.
        //
        // Nova cannot write this position: the model carries ONE folder + x/y, which the writer round-trips
        // into the FIRST folder block, while the further blocks ride through extraScript verbatim. Moving it
        // here would rewrite the wrong block and land the tech in this tab twice and the other not at all.
        node.classList.add("tech-node--managed-layout");
        node.dataset.secondaryPlacement = "1";
        // Name the RAW folder key, not prettyFolderName(): that strips the DLC prefix, so
        // bba_air_techs_folder and air_techs_folder both read "Air Techs" — and most of these pairs are
        // exactly that, which would produce "edit it in the Air Techs tab" while you are in Air Techs.
        node.title = `${tech.name || tech.id} — the game draws this tech here too, from a second folder `
          + `block. Its editable position lives under ${tech.primaryFolder}, so move it from that tab.`;
      }
      if (editorHidden) {
        // Dim + dashed so it reads as "hidden in-game" without a stylesheet change; keep it clickable.
        node.style.opacity = "0.5";
        node.style.outline = "1px dashed #b08be0";
        node.style.outlineOffset = "1px";
        node.title = tech.isHidden
          ? "This tech is flagged Hidden (allow = always no) — it won't show in-game. Shown here so you can edit it."
          : "This tech is gated out by the current DLC filter — shown here so you can edit it.";
      }

      node.innerHTML = renderTechCardInner(tech);
      if (countryResearchedTechs.has(tech.id)) {
        const badge = document.createElement("span");
        badge.className = "researched-badge";
        badge.title = "Researched at game start";
        badge.textContent = "✓";
        node.appendChild(badge);
      }

      const mainImg = node.querySelector(".tech-node-icon img");
      if (mainImg) {
        const defaultIcon = "/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds";
        mainImg.addEventListener("error", () => { mainImg.src = defaultIcon; });
      }

      // Click handler: select tech (parent or sub-tech slot inside it)
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        const subSlot = e.target.closest(".sub-tech-slot");
        const targetId = subSlot ? subSlot.dataset.id : tech.id;
        if (!targetId) return;
        if (isLinkMode) {
          handleLinkSelection(targetId);
          return;
        }
        selectedTechId = targetId;
        renderCanvas();
        updateSidebar();
      });

      // Right-click → select the node + open the context menu (common actions off the top bar).
      node.addEventListener("contextmenu", (e) => {
        if (isLinkMode) return;
        e.preventDefault();
        e.stopPropagation();
        const subSlot = e.target.closest(".sub-tech-slot");
        const targetId = subSlot ? subSlot.dataset.id : tech.id;
        const targetTech = allTechs.find((t) => t.id === targetId) || tech;
        selectedTechId = targetId;
        renderCanvas();
        updateSidebar();
        showNodeContextMenu(e.clientX, e.clientY, targetTech);
      });

      // Hover a node to light up its dependency links (to parents + children).
      node.addEventListener("mouseenter", () => highlightTechLinks(tech.id, true));
      node.addEventListener("mouseleave", () => highlightTechLinks(tech.id, false));

      if (tech.isMod) {
        // #custom-folder-tech-drag-discarded — DO NOT OFFER A DRAG THAT WILL BE THROWN AWAY.
        //
        // A tech in a tab Nova created is laid out by the server on every save
        // (relayoutCustomFolderTechFiles owns those tabs' coordinates), so whatever the user dragged was
        // written as `position = { x = 0 y = 0 }`. Measured: send x=4 y=7 for a tech in a BASE folder and
        // 4,7 is what lands; send the same for a tech in a Nova-created folder and 0,0 lands, and re-sending
        // x=9 y=3 changes nothing. The node moved under the cursor, the save reported success, and the tech
        // snapped back on the next load with nothing said.
        //
        // Say so instead. Positioning a tech by hand in a Nova-owned tab is a feature this does not have;
        // pretending to have it is the actual defect.
        if (tech.isSecondaryPlacement) {
          // Marked and explained above, for EVERY secondary node. Nothing more to do here: a drag would
          // rewrite the wrong folder block. #tech-in-two-tabs
        } else if (tech.folder && novaOwnedFolders.has(tech.folder)) {
          node.classList.add("tech-node--managed-layout");
          node.title = "Nova arranges this tab's layout itself, so this tech can't be moved by hand. "
            + "Drag techs in a base-game tab, or change this one's prerequisites to move it in the chain.";
        } else {
          setupDrag(node, tech);
        }
      }

      nodesLayer.appendChild(node);
    });

    // Empty-folder cue: an orphaned custom tab (e.g. MD's "Drones", registered but with no techs) or a
    // freshly-created folder renders zero nodes — draw a centered hint so a blank canvas reads as "empty",
    // not "broken". Distinguish "no techs at all" from "all filtered out by the DLC/hidden toggles". #empty-folder
    if (!nodesLayer.querySelector(".tech-node")) {
      // …counting a tech that reaches this tab through a SECOND folder block too, or a tab holding only
      // those would be told it has no technologies while the game draws several. #tech-in-two-tabs
      const folderHasAnyTech = allTechs.some((t) => !t.isSubTech && (
        activeFolders.includes(t.folder) ||
        (t.extraFolders || []).some((f) => f && activeFolders.includes(f.folderName))));
      const hint = document.createElement("div");
      hint.className = "canvas-empty-hint";
      hint.style.cssText = "position:absolute;left:50%;top:120px;transform:translateX(-50%);max-width:440px;text-align:center;color:#8a94a6;font-size:14px;line-height:1.55;pointer-events:none;";
      hint.textContent = folderHasAnyTech
        ? "No technologies visible with the current DLC / hidden-tech filters."
        : tabHasDeleteButton(activeTab)
          // …only where the × is actually drawn. #empty-hint-names-a-missing-button
          ? "No technologies in this folder yet — add one with “Add Tech”, or remove this tab with its × button."
          : "No technologies in this folder yet — add one with “Add Tech”.";
      nodesLayer.appendChild(hint);
    }

    // Render swords overlay on mutually-exclusive pairs. The swords ride the SAME routed line the link
    // draws (mutexRoute), so for a separated pair they sit on the dashed detour instead of floating onto
    // the unrelated tech between the two (MD's lte⇄wimax swords no longer land on Modem).
    const drawnPairs = new Set();
    const activeMap = new Map(activeTechs.map((t) => [t.id, t]));
    const mexObstacles = activeTechs.filter((t) => !t.isSubTech).map((t) => ({ id: t.id, r: techRect(t) }));
    activeTechs.forEach((tech) => {
      if (!tech.mutuallyExclusive || !tech.mutuallyExclusive.length) return;
      tech.mutuallyExclusive.forEach((otherId) => {
        const other = activeMap.get(otherId);
        if (!other) return;
        const key = [tech.id, other.id].sort().join("<->");
        if (drawnPairs.has(key)) return;
        drawnPairs.add(key);
        const blockers = mexObstacles.filter((o) => o.id !== tech.id && o.id !== other.id);
        const { sword } = mutexRoute(nodeAnchors(tech), nodeAnchors(other), blockers);
        const swords = document.createElement("div");
        swords.className = "exclusive-swords";
        swords.textContent = "⚔";
        swords.style.left = `${sword.x}px`;
        swords.style.top = `${sword.y}px`;
        swords.title = `Mutually exclusive: ${tech.name || tech.id} ⇄ ${other.name || other.id}`;
        nodesLayer.appendChild(swords);
      });
    });

    // Grow the canvas to contain every node (+ margin) so the textured background
    // always covers the full scrollable area instead of "half filling", and there's
    // room to drag nodes outward. Never shrink below the base size.
    const canvasEl = document.getElementById("researchCanvas");
    if (canvasEl) {
      let maxRight = 0, maxBottom = 0;
      nodesLayer.querySelectorAll(".tech-node").forEach((n) => {
        maxRight = Math.max(maxRight, (parseInt(n.style.left, 10) || 0) + LARGE_W);
        maxBottom = Math.max(maxBottom, (parseInt(n.style.top, 10) || 0) + LARGE_H);
      });
      // Content floor: never shrink below what the techs need. Then honour a manual override (which can
      // shrink the oversized 5200×2400 default toward the content, or grow it) — else the auto default.
      const contentW = maxRight + 400, contentH = maxBottom + 300;
      _researchContentW = contentW; _researchContentH = contentH; // "Fit to techs" reads these
      // A manual W/H override is AUTHORITATIVE — it visibly resizes the canvas, so you can GROW it or
      // SHRINK it (down to a sane floor), not just clamp up to the tech content. No override = the auto
      // default (never below what the techs need).
      canvasNaturalW = researchCanvasWOverride ? Math.max(400, researchCanvasWOverride) : Math.max(5200, contentW);
      canvasNaturalH = researchCanvasHOverride ? Math.max(300, researchCanvasHOverride) : Math.max(2400, contentH);
      applyResearchZoom();
      // The background art fills the ENTIRE canvas (stretched via background-size:100% 100%), so it always
      // fits perfectly whether the canvas was grown or shrunk.
      const bgEl2 = document.getElementById("researchBg");
      if (bgEl2 && bgEl2.style.display !== "none") {
        const bw = `${canvasNaturalW}px`, bh = `${canvasNaturalH}px`;
        if (bgEl2.style.width !== bw) bgEl2.style.width = bw;
        if (bgEl2.style.height !== bh) bgEl2.style.height = bh;
        // Re-apply the fit/manual preview so it tracks the new canvas size (fit refills; manual keeps offsets).
        applyResearchBgPreview();
      }
      if (window._researchUpdateCanvasSizeHint) window._researchUpdateCanvasSizeHint();
    }

    renderResearchAnnotations(nodesLayer); // A3: free-text labels the user placed on the tree
    renderGuiLabels(nodesLayer); // in-game section titles parsed from the tech-tree gui (read-only, draggable)
    renderGuiYears(nodesLayer); // in-game YEAR stamps at their exact pixels — individual movable objects, non-sticky #year-objects
    drawLines();
    warmTabIcons(); // background-preload this tab's icons so panning never waits on lazy loads
  }

  // Tech icons render with loading="lazy" (instant first paint), which means panning to a not-yet-
  // seen area waited on the icon request + DDS→PNG decode — the "icons don't load in time" jank.
  // After each render we preload THIS tab's icons in the background (small batches so we don't
  // stampede the server), so by the time you drag there the browser already has them cached. A token
  // cancels the warm if you switch tabs mid-flight. Pure prefetch — never changes what's drawn.
  let _iconWarmToken = 0;
  function warmTabIcons() {
    const token = ++_iconWarmToken;
    setTimeout(() => {
      if (token !== _iconWarmToken) return;
      const srcs = [...new Set(
        Array.from(document.querySelectorAll("#researchCanvas img"))
          .map((im) => im.getAttribute("src"))
          .filter((s) => s && s.indexOf("/api/") !== -1)
      )];
      let i = 0;
      const BATCH = 6;
      (function pump() {
        if (token !== _iconWarmToken || i >= srcs.length) return;
        for (const src of srcs.slice(i, i + BATCH)) { const im = new Image(); im.src = src; }
        i += BATCH;
        setTimeout(pump, 50);
      })();
    }, 0);
  }

  // Apply the current zoom: scale the canvas from its top-left, and use margins to make the scroll
  // container's scrollable area match the SCALED visual size (a transform alone doesn't resize the
  // scroll box). natural*(z-1) is positive when zoomed in (adds scroll) and negative when zoomed
  // out (trims the empty space).
  function applyResearchZoom() {
    const canvasEl = document.getElementById("researchCanvas");
    if (!canvasEl) return;
    const z = researchZoom;
    canvasEl.style.width = `${canvasNaturalW}px`;
    canvasEl.style.height = `${canvasNaturalH}px`;
    canvasEl.style.transformOrigin = "0 0";
    canvasEl.style.transform = z === 1 ? "" : `scale(${z})`;
    canvasEl.style.marginRight = `${canvasNaturalW * (z - 1)}px`;
    canvasEl.style.marginBottom = `${canvasNaturalH * (z - 1)}px`;
    const label = document.getElementById("researchZoomLabel");
    if (label) label.textContent = `${Math.round(z * 100)}%`;
    stickYearLabels();
    drawResearchMinimap();
  }

  // ── Minimap: a bird's-eye view of the whole tree + a viewport box, click/drag to jump (parity with the
  // focus tree). Editor-only, zero game-file impact. Drawn after each render/zoom/scroll. ──
  let researchMinimapOn = false;
  function drawResearchMinimap() {
    const mm = document.getElementById("researchMinimap"), cv = document.getElementById("researchMinimapCanvas");
    const cont = document.getElementById("canvasContainer");
    if (!mm || !cv || !cont) return;
    if (!researchMinimapOn) { mm.style.display = "none"; return; }
    mm.style.display = "block";
    const cw = canvasNaturalW || 1, ch = canvasNaturalH || 1;
    const scale = Math.min(220 / cw, 150 / ch);
    const w = Math.max(1, Math.round(cw * scale)), h = Math.max(1, Math.round(ch * scale));
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#58a6ff";
    document.querySelectorAll("#nodesLayer .tech-node").forEach((n) => {
      ctx.fillRect((parseInt(n.style.left, 10) || 0) * scale, (parseInt(n.style.top, 10) || 0) * scale, 3, 3);
    });
    const z = researchZoom || 1;
    const vx = (cont.scrollLeft / z) * scale, vy = (cont.scrollTop / z) * scale;
    const vw = (cont.clientWidth / z) * scale, vh = (cont.clientHeight / z) * scale;
    ctx.fillStyle = "rgba(88,166,255,0.14)"; ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = "#e6edf3"; ctx.lineWidth = 1; ctx.strokeRect(vx + 0.5, vy + 0.5, Math.max(1, vw - 1), Math.max(1, vh - 1));
    cv._mmScale = scale;
  }
  function navResearchMinimap(clientX, clientY) {
    const cv = document.getElementById("researchMinimapCanvas"), cont = document.getElementById("canvasContainer");
    if (!cv || !cont) return;
    const r = cv.getBoundingClientRect();
    const scale = cv._mmScale || 1, z = researchZoom || 1;
    const canvasX = (clientX - r.left) / scale, canvasY = (clientY - r.top) / scale;
    cont.scrollLeft = canvasX * z - cont.clientWidth / 2;
    cont.scrollTop = canvasY * z - cont.clientHeight / 2;
    drawResearchMinimap();
  }

  // Record where the cursor is over the scroll container, so the next zoom keeps that exact point
  // under the cursor. Only stored while the pointer is actually inside the viewport — a cursor in a
  // corner or off the canvas just keeps the previous anchor (clamped below) instead of jumping.
  function updateResearchZoomAnchor(clientX, clientY) {
    const container = document.getElementById("canvasContainer");
    if (!container) return;
    const r = container.getBoundingClientRect();
    const relX = clientX - r.left;
    const relY = clientY - r.top;
    if (relX >= 0 && relX <= r.width && relY >= 0 && relY <= r.height) {
      lastResearchZoomAnchor = { relX, relY };
    }
  }

  function setResearchZoom(next) {
    const clamped = Math.min(RZOOM_MAX, Math.max(RZOOM_MIN, Math.round(next * 100) / 100));
    if (clamped === researchZoom) return;
    const container = document.getElementById("canvasContainer");
    const oldZoom = researchZoom;

    // Pick the point to hold stationary (in container-viewport px). Default to the viewport centre
    // when we have no cursor info; clamp into the visible box so an out-of-canvas/corner cursor can't
    // throw the scroll position out of range.
    let ax = container ? container.clientWidth / 2 : 0;
    let ay = container ? container.clientHeight / 2 : 0;
    if (container && lastResearchZoomAnchor) {
      ax = Math.max(0, Math.min(lastResearchZoomAnchor.relX, Math.max(0, container.clientWidth - 1e-3)));
      ay = Math.max(0, Math.min(lastResearchZoomAnchor.relY, Math.max(0, container.clientHeight - 1e-3)));
    }
    const contentX = container ? container.scrollLeft + ax : 0;
    const contentY = container ? container.scrollTop + ay : 0;
    const ratio = clamped / oldZoom;

    researchZoom = clamped;
    applyResearchZoom();

    if (container) {
      const maxL = Math.max(0, container.scrollWidth - container.clientWidth);
      const maxT = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollLeft = Math.max(0, Math.min(contentX * ratio - ax, maxL));
      container.scrollTop = Math.max(0, Math.min(contentY * ratio - ay, maxT));
      stickYearLabels();
    }
  }
  // Setup dragging functionality for custom nodes
  function setupDrag(node, tech) {
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let initialGridX = 0, initialGridY = 0;
    let dragging = false;
    let moved = false;
    const DRAG_THRESHOLD_PX = 4;

    node.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || isLinkMode) return;
      // Don't start a drag if the mousedown originated on a sub-tech slot (we want a click).
      if (e.target.closest(".sub-tech-slot")) return;
      e.stopPropagation();

      startX = e.clientX;
      startY = e.clientY;
      initialLeft = node.offsetLeft;
      initialTop = node.offsetTop;
      initialGridX = tech.x;
      initialGridY = tech.y;
      dragging = true;
      moved = false;
      // Kill the node's CSS transition (`transition: all` animates left/top) for the drag: with it on, the node's
      // offsetLeft LAGS the live style.left, so onMouseUp's snapPosition(node.offsetLeft) read the stale ORIGINAL
      // position and the tech snapped back — i.e. dragged techs "didn't move". Restored in onMouseUp. #tech-drag-snapback
      node.style.transition = "none";

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    function onMouseMove(e) {
      if (!dragging) return;
      const sdx = e.clientX - startX;
      const sdy = e.clientY - startY;

      // Only treat as a drag once the user has moved past the threshold (in SCREEN px so the
      // click/drag feel is the same at any zoom).
      // Pure clicks (dx==dy==0) must NOT reposition the node or mark dirty.
      if (!moved) {
        if (Math.abs(sdx) < DRAG_THRESHOLD_PX && Math.abs(sdy) < DRAG_THRESHOLD_PX) return;
        moved = true;
        node.style.cursor = "grabbing";
      }

      // Convert the screen-space delta into canvas (natural) px — the canvas is CSS-scaled by zoom.
      const dx = sdx / researchZoom;
      const dy = sdy / researchZoom;
      const rawLeft = initialLeft + dx;
      const rawTop  = initialTop + dy;
      // Clamp pixel position so nodes can't escape the visible canvas area (vertical trees keep
      // the leftmost node clear of the left year rail).
      const newLeft = Math.max(minLeftForLayout(getActiveLayout()), rawLeft);
      const newTop  = Math.max(DRAG_MIN_TOP, rawTop);

      node.style.left = `${newLeft}px`;
      node.style.top = `${newTop}px`;

      const layout = getTechLayout(tech);
      const snapped = snapPosition(newLeft, newTop, layout, tech);
      snapped.x -= (folderLaneOffset[tech.folder] || 0); // undo the display-only lane band shift
      const clamped = clampGridCoords(snapped.x, snapped.y, layout);

      tech.x = clamped.x;
      tech.y = clamped.y;

      const year = getYearFromCoord(clamped.y);
      tech.startYear = year;
      if (selectedTechId === tech.id) {
        const yearInput = document.getElementById("techYear");
        if (yearInput) yearInput.value = year;
        updateAheadOfTimePenalty(year);
      }

      // Lines follow the node's live pixel position (not the snapped grid) so they move smoothly.
      dragAnchorOverride = { id: tech.id, left: newLeft, top: newTop };
      drawLines();
    }

    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      dragAnchorOverride = null; // back to grid-anchored lines now the node snapped into place
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      node.style.cursor = "move";
      node.style.transition = ""; // restore the CSS transition (disabled on mousedown) — before any early return #tech-drag-snapback

      // Pure click — no movement past threshold. Don't touch the position or dirty state.
      if (!moved) return;

      const layout = getTechLayout(tech);
      const snapped = snapPosition(node.offsetLeft, node.offsetTop, layout, tech);
      snapped.x -= (folderLaneOffset[tech.folder] || 0); // undo the display-only lane band shift
      const clamped = clampGridCoords(snapped.x, snapped.y, layout);

      tech.x = clamped.x;
      tech.y = clamped.y;
      // This drag is the new AUTHORED x, so make it the DLC-packer's baseline too — otherwise toggling a
      // DLC would reset tech.x back to the pre-drag _origX and silently undo the move.
      tech._origX = tech.x;
      // The drag END is the undoable step, not the hundreds of mousemove updates above it (#research-undo).
      markTechDirty(tech.id, `Move ${tech.name || tech.id}`);

      const year = getYearFromCoord(clamped.y);
      tech.startYear = year;

      node.style.left = `${getTechLeft(tech)}px`;
      node.style.top = `${getTechTop(tech)}px`;

      if (selectedTechId === tech.id) {
        const xInput = document.getElementById("techX");
        const yInput = document.getElementById("techY");
        const yearInput = document.getElementById("techYear");
        if (xInput) xInput.value = clamped.x;
        if (yInput) yInput.value = clamped.y;
        if (yearInput) yearInput.value = year;
        updateAheadOfTimePenalty(year);
      }

      // Only mark dirty if the snapped grid position actually changed.
      if (clamped.x !== initialGridX || clamped.y !== initialGridY) {
        markTechDirty(tech.id);
      }
      drawLines();
    }
  }
  const canvasContainer = document.getElementById("canvasContainer");
  const researchCanvas = document.getElementById("researchCanvas");

  // Canvas Panning Logic
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let scrollLeft = 0;
  let scrollTop = 0;

  if (canvasContainer) {
    canvasContainer.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      // Pan when the drag starts on empty canvas — anywhere that isn't a tech node
      // (or a control inside one). More robust than an exact-id allow-list, which
      // missed the SVG/marker overlays and broke drag-to-pan on empty space.
      if (e.target.closest(".tech-node")) return;

      isPanning = true;
      canvasContainer.style.cursor = "grabbing";
      startX = e.pageX - canvasContainer.offsetLeft;
      startY = e.pageY - canvasContainer.offsetTop;
      scrollLeft = canvasContainer.scrollLeft;
      scrollTop = canvasContainer.scrollTop;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isPanning) return;
      e.preventDefault();
      const x = e.pageX - canvasContainer.offsetLeft;
      const y = e.pageY - canvasContainer.offsetTop;
      const walkX = (x - startX);
      const walkY = (y - startY);
      canvasContainer.scrollLeft = scrollLeft - walkX;
      canvasContainer.scrollTop = scrollTop - walkY;
    });

    window.addEventListener("mouseup", () => {
      if (isPanning) {
        isPanning = false;
        canvasContainer.style.cursor = "grab";
      }
    });

    window.addEventListener("mouseleave", () => {
      if (isPanning) {
        isPanning = false;
        canvasContainer.style.cursor = "grab";
      }
    });
  }

  // Double-click intentionally removed — double-clicking empty canvas no longer creates nodes.
  // Use the "+ Add Tech Node" button in the sidebar instead.

  // Create New Node
  /** #equipment-zero-stats — read a stat box, treating BLANK as "inherit from the archetype".
   *
   *  HOI4 fills any stat an equipment omits from its archetype, so writing 0 for an untouched box is not a
   *  neutral default — it is an override that replaces the archetype's value. infantry_equipment supplies
   *  defense 20, breakthrough 2, soft_attack 3, hard_attack 0.5 and ap_attack 1; zeroing all five produced a
   *  weapon that fights at nothing. Returning undefined omits the key, and the serializer already skips it.
   *  A typed 0 is still a deliberate zero and is written.
   */
  function statOrInherit(id) {
    const el = document.getElementById(id);
    const raw = String((el && el.value) != null ? el.value : "").trim();
    if (!raw) return undefined;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  function generateUniqueTechId() {
    let id = "";
    do {
      id = `custom_tech_${Math.floor(Math.random() * 100000)}`;
    } while (allTechs.some((t) => t.id === id));
    return id;
  }

  function createNewNode(x = 0, y = 0, opts = {}) {
    const activeFolders = currentVisibleFolders.length ? currentVisibleFolders : getActiveFoldersForTab(activeTab);
    const defaultFolder = activeFolders[0] || "infantry_folder";

    const id = generateUniqueTechId();
    // Read the year off the folder's OWN ruler, like every other path that derives a year from a
    // coordinate does. The old `1936 + y*2` hardcoded vanilla's era and spacing, so a tech created in
    // Millennium Dawn's infantry tree — whose rows run 1965→2035 — was born with start_year = 1938:
    // researchable from day one, with none of the ahead-of-time cost the row it sits on implies.
    // getYearFromCoord extrapolates from the real columns and falls back to the scenario start year.
    const startYear = getYearFromCoord(Math.max(0, y));
    // Box size at creation: WIDE means it unlocks equipment (so give it a starter equipment), SQUARE
    // means an upgrade/doctrine (force the small box so it stays square even if equipment is added later).
    const withEquipment = !!opts.withEquipment;
    const newTech = {
      id,
      name: "New Technology",
      description: "Enter descriptions here",
      folder: defaultFolder,
      x,
      y,
      researchCost: 1.5,
      startYear,
      prerequisites: [],
      dependencies: [],
      enableEquipments: withEquipment ? [`${id}_equipment`] : [],
      forceSmallLayout: !!opts.forceSmall,
      modifiers: "",
      extraScript: "",
      isMod: true,
      iconKey: "GFX_infantry_weapons_medium",
      fileName: "custom_technologies.txt"
    };
    if (withEquipment) {
      allEquips[`${id}_equipment`] = {
        id: `${id}_equipment`, year: startYear, archetype: "infantry_equipment",
        // #equipment-zero-stats — do NOT write combat stats here. An equipment INHERITS its archetype for
        // every stat it omits, so an explicit 0 is an override that makes the new weapon strictly worse than
        // the archetype it derives from: infantry_equipment gives defense 20, breakthrough 2, soft_attack 3,
        // hard_attack 0.5 and ap_attack 1, and writing zeros replaced all five. A tech created with
        // "unlocks equipment" produced a weapon that fights at nothing, silently.
        buildCostIc: 0.5, reliability: 0.9, resources: {}, name: newTech.name, fileName: NOVA_DEFAULT_EQUIPMENT_FILE,
        isMod: true
      };
      autoCreatedEquipIds.add(`${id}_equipment`);
    }

    allTechs.push(newTech);
    selectedTechId = id;
    // A BRAND-NEW tech needs a gridbox written for it or it is invisible (#new-tech-gridbox): HOI4 logs
    // "Found no grid box for tech X" and draws nothing, and Nova drops it as engine-unplaced — so it
    // saved to disk correctly and then vanished from the tree on reload. Only techs WE create go in this
    // set; a mod's own pre-existing unplaced techs are its business, not ours to resurrect (Millennium
    // Dawn ships ~51 of them, and handing those gridboxes would change its tree without being asked).
    newlyCreatedTechIds.add(id);
    markTechDirty(id);
    // Dismiss the "Empty Research Tree" overlay (which also hid the canvas via display:none) now that the
    // tree has a tech. Without this, adding the FIRST tech to an empty tree left the overlay up and the
    // canvas hidden, so the new node was invisible until a reload — same trap as the focus-tree fix.
    checkEmptyTreeOverlay();
    renderCanvas();
    updateSidebar();
  }

  // Small non-locking 2-choice modal (Wide vs Square) shown when adding a tech node. Mirrors the
  // shared info-modal styling but offers two actions; never uses native confirm() (that froze inputs).
  function askNewNodeSize() {
    const old = document.getElementById("novaChoiceModalOverlay");
    if (old) old.remove();
    const ov = document.createElement("div");
    ov.id = "novaChoiceModalOverlay";
    ov.style.cssText = "position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; background:rgba(3,7,14,0.66); backdrop-filter:blur(2px); font-family:'Inter',system-ui,sans-serif;";
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" style="width:min(440px,92vw); background:linear-gradient(140deg,#1a3566,#2e1f55); border:1px solid rgba(150,160,255,0.28); border-radius:14px; box-shadow:0 22px 66px rgba(0,0,0,0.6); padding:22px; color:#d7e1f5;">' +
        '<h2 style="margin:0 0 6px; font-size:17px; color:#eaf3ff;">New technology — box size</h2>' +
        '<p style="font-size:13px; line-height:1.55; margin:0 0 16px; color:#c4cdec;">How should this tech look in the research tree?</p>' +
        '<div style="display:flex; gap:10px;">' +
          '<button id="novaChoiceWide" style="flex:1; padding:12px 10px; background:linear-gradient(135deg,#3072e6,#7a51d8); border:none; border-radius:10px; color:#fff; font-size:13px; font-weight:600; cursor:pointer;">▭ Wide box<br><span style="font-weight:400; font-size:11px; opacity:.85;">unlocks equipment</span></button>' +
          '<button id="novaChoiceSquare" style="flex:1; padding:12px 10px; background:rgba(255,255,255,0.10); border:1px solid rgba(150,160,255,0.3); border-radius:10px; color:#eaf3ff; font-size:13px; font-weight:600; cursor:pointer;">▢ Small square<br><span style="font-weight:400; font-size:11px; opacity:.85;">upgrade / doctrine</span></button>' +
        '</div>' +
        '<button id="novaChoiceCancel" style="margin-top:12px; width:100%; padding:8px; background:none; border:none; color:#9fb0d8; font-size:12px; cursor:pointer;">Cancel</button>' +
      "</div>";
    document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    document.getElementById("novaChoiceWide").addEventListener("click", () => { close(); createNewNode(1, 1, { withEquipment: true }); });
    document.getElementById("novaChoiceSquare").addEventListener("click", () => { close(); createNewNode(1, 1, { forceSmall: true }); });
    document.getElementById("novaChoiceCancel").addEventListener("click", close);
  }

  // Add click listener on Add Tech Node button
  const newTechBtn = document.getElementById("newTechBtn");
  if (newTechBtn) {
    newTechBtn.addEventListener("click", () => {
      askNewNodeSize();
    });
  }
  { // #research-undo — the buttons are just the keyboard shortcuts with a face on them
    const ub = document.getElementById("researchUndoBtn"), rb = document.getElementById("researchRedoBtn");
    if (ub) ub.addEventListener("click", () => researchUndo());
    if (rb) rb.addEventListener("click", () => researchRedo());
  }

  const previewIngameBtn = document.getElementById("previewIngameBtn");
  if (previewIngameBtn) {
    previewIngameBtn.addEventListener("click", () => {
      const tech = allTechs.find((t) => t.id === selectedTechId);
      showTechIngamePreview(tech);
    });
  }

  // ── Sidebar ?-help popups ───────────────────────────────────────────────────────────────────
  // Each ".sb-help" span carries data-help=<key>; one delegated handler opens the shared non-blocking
  // modal (showNovaInfoModal) so it explains the field WITHOUT freezing/locking the inputs.
  const SB_HELP = {
    "sidebar-general": ["Editing a technology", "<p>This panel edits the <b>selected</b> tech. Click any node on the canvas to edit it, or use <b>+ Add Tech Node</b> (top bar) to create one.</p><p>Set its id, research cost, prerequisites (the tree links), icon, categories and so on. Hover any <b>?</b> for help on a field. Your edits are written into the mod when you press <b>Save Changes</b>.</p>"],
    "research-cost": ["Research Cost", "<p>How long this tech takes to research. The number is in units of ~100 days at default research speed (before any bonuses):</p><ul style='margin:0 0 0 18px;padding:0;line-height:1.7;'><li><b>1.0</b> &asymp; 100 days</li><li><b>1.5</b> &asymp; 150 days</li><li><b>0.5</b> &asymp; 50 days</li></ul><p style='margin-top:8px;'>Bigger = slower / more expensive. Main-line techs are usually ~1.0&ndash;2.0; small bonus techs are lower.</p>"],
    "production-cost": ["Production Cost (IC)", "<p>Industrial Cost (IC) &mdash; the factory effort to <b>build</b> this equipment. Higher IC needs more factory capacity / time to produce.</p><p style='color:#a6acd0;font-size:12px;'>Only relevant for techs that unlock equipment.</p>"],
    "categories": ["Categories", "<p>Space- or newline-separated <b>category tags</b>. They let research bonuses (<code>add_tech_bonus category = &hellip;</code>) and the AI target this tech.</p><p>Use your mod's real category tags &mdash; the same ones defined in <code>common/technology_tags</code>. There's no fixed list; mods define their own.</p>"],
    "prereq-vs-dep": ["Prerequisites vs Dependencies", "<p><b>Prerequisites</b> &mdash; the techs that must be researched before this one. These are the normal tree links (solid lines). Several prerequisite <i>groups</i> = OR (any one group unlocks it); inside one group = AND.</p><p><b>Dependencies</b> &mdash; an <i>extra</i> strict requirement: <b>all</b> listed dependencies must <b>also</b> be researched, but they're not part of the visual branch (drawn as dashed lines). Use these for a cross-tree &lsquo;must also have&rsquo; you don't want drawn as a main path.</p>"],
    "prerequisites": ["Prerequisites", "<p>The techs that must be researched <b>before</b> this one &mdash; the normal tree links (solid lines).</p><p>Several prerequisite <i>groups</i> = OR (any one group unlocks it); several techs inside one group = AND.</p><p style='color:#a6acd0;font-size:12px;margin-top:8px;'>Add one by typing the parent's id (<b>⌨ Add by ID</b>), or click <b>🔗 Add by clicking</b> and pick the parent then the child on the canvas.</p>"],
    "unlocks": ["Unlocks &mdash; child techs", "<p>The techs that list <b>this</b> one as a prerequisite &mdash; its children in the tree. This list is <b>read-only</b>.</p><p>To unlink a child, open that child tech and remove this one from its <b>Prerequisites</b> (the &times; button).</p>"],
    "mutex": ["Mutually exclusive techs", "<p>Techs that can't be researched alongside this one &mdash; picking one <b>locks out</b> the others (drawn with crossed swords). Use it for either/or choices within a branch.</p>"],
    "subtech": ["Sub-technologies", "<p>Smaller child circles attached to this tech &mdash; the little upgrade dots on a weapon box. They research after the parent and share its box.</p>"],
    "orientation": ["Tree orientation", "<p>Flips this tab between <b>horizontal</b> (eras run left&rarr;right) and <b>vertical</b> (eras run top&rarr;down).</p><p>Use it if a mod's research tree shows sideways. Vanilla doctrine trees default to vertical. The year labels stay where the game stamps them either way.</p>"],
    "country-lock": ["Limit to one country", "<p>Restricts this tech so <b>only the chosen country</b> can see and research it (writes <code>allow_branch = { original_tag = TAG }</code>). Great for a country-specific tech tree.</p><p>Leave <b>Any country</b> for a normal tech everyone can research.</p>"],
    "start-researched": ["Start a country with this tech", "<p>Pick a country to begin the game <b>already having</b> this technology &mdash; writes <code>set_technology</code> into that country's history in the active mod.</p><p>Uses the Technology ID above. Use <b>Remove</b> to take it back out.</p>"],
    "box-size": ["Box size — wide vs square", "<p>HOI4 decides a tech's box size automatically:</p><ul style='margin:0 0 0 18px;padding:0;line-height:1.7;'><li><b>Wide box</b> &mdash; the tech <b>unlocks equipment</b> (tick <i>Enable equipment</i> below). Wide boxes show the weapon/vehicle.</li><li><b>Small square</b> &mdash; anything that doesn't unlock equipment (upgrades, doctrines, bonuses).</li></ul><p style='margin-top:8px;'>Tick <b>Force small square box</b> to make a tech use the square <i>even if it unlocks equipment</i> (writes <code>force_use_small_tech_layout = yes</code>).</p><p style='color:#a6acd0;font-size:12px;'>If a custom tab's techs all show wide in-game, that tab's GUI is missing its small-item template &mdash; create the tab through Nova so both are generated.</p>"],
    "show-equipment-icon": ["Use the equipment icon on the tech box", "<p>Writes <code>show_equipment_icon = yes</code>. In game, this tech's box shows the <b>icon of the equipment it unlocks</b> (from <i>Enable equipment</i> below) instead of needing you to supply a custom <code>GFX_&lt;tech&gt;_medium</code> picture.</p><p style='margin-top:6px;'>Handy when a tech enables a piece of equipment and you just want that equipment's art on the box.</p><p style='color:#a6acd0;font-size:12px;margin-top:6px;'>Has <b>no effect</b> unless the tech unlocks equipment (Enable equipment). If it unlocks nothing, leave it off.</p>"],
    "ai-will-do": ["AI Will Do (research weighting)", "<p>How likely the <b>AI</b> is to pick this tech to research. Leave blank for the default. The higher the final weight, the more the AI favours it.</p><p>You can write just a base factor, or add conditional modifiers:</p><pre style='background:rgba(0,0,0,0.25);padding:8px;border-radius:6px;font-size:11px;white-space:pre-wrap;margin:6px 0 0;'>factor = 1\nmodifier = {\n  factor = 2      # double the weight when…\n  has_war = yes\n}</pre><p style='margin-top:8px;color:#a6acd0;font-size:12px;'>Not sure? Use the ✨AI button and describe it in plain English instead.</p>"],
  };
  document.addEventListener("click", (e) => {
    const h = e.target.closest && e.target.closest(".sb-help");
    if (!h) return;
    const c = SB_HELP[h.getAttribute("data-help")];
    if (c && typeof window.showNovaInfoModal === "function") window.showNovaInfoModal(c[0], c[1]);
  });

  // ── Duplicate Tech ────────────────────────────────────────────────────────────────────────
  // The fastest way for a non-coder to make a correct new weapon: copy an existing one and tweak
  // it. Keeps the folder, equipment pattern, modifiers, extra scripts and icon; gives it a fresh
  // unique id + its own equipment copy (so editing the variant never changes the original), and
  // clears relationships a brand-new node shouldn't silently inherit (sub-techs, mutual exclusions).
  const duplicateTechBtn = document.getElementById("duplicateTechBtn");
  if (duplicateTechBtn) {
    duplicateTechBtn.addEventListener("click", () => {
      if (!selectedTechId) { nbAlert("Select a tech to duplicate first."); return; }
      const src = allTechs.find((t) => t.id === selectedTechId);
      if (!src) return;
      const newId = generateUniqueTechId();
      const clone = JSON.parse(JSON.stringify(src));
      clone.id = newId;
      delete clone.previousId;
      clone.isMod = true;
      clone.isSubTech = false;
      clone.fileName = src.fileName || "custom_technologies.txt";
      clone.name = `${src.name && src.name !== src.id ? src.name : src.id} (copy)`;
      clone.subTechnologies = [];
      clone.mutuallyExclusive = [];
      clone.leadsTo = [];
      clone.x = typeof src.x === "number" ? src.x : 0;
      clone.y = (typeof src.y === "number" ? src.y : 0) + 1;
      // Give the copy its own equipment (so editing its stats doesn't change the original's) —
      // but only when the source equipment is actually loaded; otherwise keep the shared ref.
      if (Array.isArray(clone.enableEquipments) && clone.enableEquipments.length) {
        const oldEq = clone.enableEquipments[0];
        if (allEquips[oldEq]) {
          const newEq = `${newId}_equipment`;
          allEquips[newEq] = JSON.parse(JSON.stringify(allEquips[oldEq]));
          allEquips[newEq].id = newEq;
          allEquips[newEq].isMod = true;
          allEquips[newEq].fileName = allEquips[oldEq].fileName || NOVA_DEFAULT_EQUIPMENT_FILE;
          clone.enableEquipments = [newEq];
        }
      }
      allTechs.push(clone);
      markTechDirty(newId);
      // A duplicate is a NEW tech and needs its own gridbox, exactly like one made with "Add Tech Node".
      // Without this the copy saved with no gridbox: harmless-looking for a mid-chain tech (it renders
      // through its prerequisite chain's root) but a duplicated BRANCH ROOT has no chain to inherit from,
      // so it was invisible in Nova and in-game. #new-tech-gridbox
      newlyCreatedTechIds.add(newId);
      jumpToTech(newId); // switch to its tab, select it, scroll + flash
      showUndoToast(`Duplicated "${src.name || src.id}" → edit the copy's ID and stats, then Save.`, () => {
        allTechs = allTechs.filter((t) => t.id !== newId);
        dirtyTechIds.delete(newId);
        newlyCreatedTechIds.delete(newId);
        selectedTechId = src.id;
        renderCanvas();
        updateSidebar();
      });
    });
  }

  // Populate the folder/tab dropdown in the sidebar editor (this is also how you "send a tech to
  // another tab"). It must ONLY offer folders that actually exist as a tab in the ACTIVE mod —
  // otherwise moving a tech to a phantom folder (e.g. vanilla "Support" in Millennium Dawn) hides
  // it with no tab to reach it, and it looks lost. Authoritative sources, in order:
  //   1) guiFolderIcon — the folders the mod's own GUI defines tabs for
  //   2) folders that already hold techs (so their tab renders)
  //   3) the user's custom tabs
  //   4) the currently-selected folder (so the current value always shows)
  // Only if the GUI data didn't load do we fall back to the hardcoded standard tabs.
  function populateFolderSelector(selectedFolder) {
    const select = document.getElementById("techFolderSelect");
    if (!select) return;

    select.innerHTML = "";

    // Reachable = the editor actually renders a tab for this folder (it's in a standard tab or a
    // custom tab). getTabForFolder() silently falls back to infantry_tab for anything else, which
    // is the trap: doctrine/orphan folders LOOK routable but a tech sent there renders nowhere.
    const folderHasRealTab = (folder) =>
      gameFolderTabs.some((t) => t.folder === folder) ||
      Object.values(STANDARD_TABS).some((c) => c.folders.includes(folder)) ||
      customTabs.some((c) => c.folder === folder);
    // Exists in THIS mod = the mod's GUI defines a tab for it, it already holds techs, or it's a
    // custom tab the user made. (So vanilla "Support" won't show for Millennium Dawn.)
    const techFolders = new Set(allTechs.filter((t) => !t.isSubTech).map((t) => t.folder));
    const existsInMod = (folder) =>
      !!(guiFolderIcon && guiFolderIcon[folder]) || techFolders.has(folder) || customTabs.some((c) => c.folder === folder);

    const candidates = new Set();
    Object.values(STANDARD_TABS).forEach((config) => config.folders.forEach((f) => candidates.add(f)));
    Object.keys(guiFolderIcon || {}).forEach((f) => candidates.add(f));
    techFolders.forEach((f) => candidates.add(f));
    customTabs.forEach((ct) => candidates.add(ct.folder));

    const folders = new Set();
    candidates.forEach((f) => { if (folderHasRealTab(f) && existsInMod(f)) folders.add(f); });
    if (selectedFolder) folders.add(selectedFolder); // current value always shows, even if odd

    Array.from(folders).sort().forEach((folder) => {
      const opt = document.createElement("option");
      opt.value = folder;
      const name = folder.replace("_folder", "").replace(/_/g, " ");
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      if (folder === selectedFolder) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function updateAheadOfTimePenalty(startYear) {
    const el = document.getElementById("aheadOfTimePenaltyVal");
    if (!el) return;
    const year = Number(startYear) || scenarioStartYear;
    if (year > scenarioStartYear) {
      const diff = year - scenarioStartYear;
      el.textContent = `+${diff * 100}%`;
      el.style.color = "#f85149";
    } else {
      el.textContent = "0% (No penalty)";
      el.style.color = "#2ea043";
    }
  }

  // Update Sidebar Inputs with selected technology parameters
  function updateSidebar() {
    const editorPanel = document.getElementById("editorPanel");
    const noSelectionPanel = document.getElementById("noSelectionPanel");
    
    if (!selectedTechId) {
      editorPanel.style.display = "none";
      noSelectionPanel.style.display = "block";
      return;
    }
    
    editorPanel.style.display = "block";
    noSelectionPanel.style.display = "none";
    
    const tech = allTechs.find(t => t.id === selectedTechId);
    if (!tech) return;
    
    // Fill technology fields
    const techIdEl = document.getElementById("techId");
    techIdEl.value = tech.id;
    if (tech.isMod) {
      techIdEl.removeAttribute("readonly");
      techIdEl.title = "Rename updates mod files and references on save.";
    } else {
      techIdEl.setAttribute("readonly", "readonly");
      techIdEl.title = "Vanilla technology IDs cannot be changed.";
    }
    document.getElementById("techName").value = unescapeLocForEdit(tech.name || "");
    document.getElementById("techDesc").value = tech.description || "";
    document.getElementById("techCost").value = tech.researchCost || 1.0;
    document.getElementById("techYear").value = tech.startYear || 1936;
    document.getElementById("techX").value = tech.x;
    document.getElementById("techY").value = tech.y;
    document.getElementById("techFile").value = tech.fileName || "custom_technologies.txt";
    document.getElementById("techModifiers").value = tech.modifiers || "";
    if (window.__novaRefreshTechModifiers) window.__novaRefreshTechModifiers();
    // Split a simple country lock out of extraScript so the textarea shows only the user's own script
    // and the lock is driven by the picker (recombined on save).
    const lockTag = extractCountryLock(tech.extraScript || "");
    document.getElementById("techExtraScript").value = stripCountryLock(tech.extraScript || "");
    const lockSel = document.getElementById("techCountryLock");
    if (lockSel) {
      if (lockTag && !Array.prototype.some.call(lockSel.options, (o) => o.value === lockTag)) {
        const o = document.createElement("option"); o.value = lockTag; o.textContent = lockTag; lockSel.appendChild(o);
      }
      lockSel.value = lockTag;
    }
    const techCategoriesEl = document.getElementById("techCategories");
    if (techCategoriesEl) techCategoriesEl.value = Array.isArray(tech.categories) ? tech.categories.join("\n") : (tech.categories || "");
    const techAiWillDoEl = document.getElementById("techAiWillDo");
    if (techAiWillDoEl) techAiWillDoEl.value = tech.aiWillDo || "";
    const techDoctrineEl = document.getElementById("techDoctrine");
    if (techDoctrineEl) techDoctrineEl.checked = !!tech.doctrine;
    const techShowEqIconEl = document.getElementById("techShowEquipmentIcon");
    if (techShowEqIconEl) techShowEqIconEl.checked = !!tech.showEquipmentIcon;
    // The equipment-icon option only does anything when the tech unlocks equipment — dim it with a hint
    // otherwise so its purpose (and when it applies) is obvious. Purely visual: don't touch `disabled`,
    // which the editor's read-only pass owns for vanilla techs. #6
    const showEqRow = document.getElementById("techShowEquipmentIconRow");
    if (showEqRow) {
      const relevant = techUnlocksEquipment(tech);
      showEqRow.style.opacity = relevant ? "" : "0.55";
      showEqRow.title = relevant ? "" : "Only applies when this tech unlocks equipment (Enable equipment below).";
    }

    // Box size: reflect the flag + show what the tech will actually render as in-game (wiki rule:
    // unlocks equipment → wide; otherwise small square; force_use_small_tech_layout → always square).
    const techForceSmallEl = document.getElementById("techForceSmall");
    if (techForceSmallEl) techForceSmallEl.checked = !!tech.forceSmallLayout;
    updateBoxSizeReadout(tech);

    populateFolderSelector(tech.folder);
    
    const iconKey = tech.iconKey || `GFX_${tech.id}_medium`;
    document.getElementById("techIconId").value = iconKey;
    
    let previewSrc = tech.iconUrl;
    if (!previewSrc) {
      previewSrc = `/api/icon-image?key=${encodeURIComponent(iconKey)}&modPath=${encodeURIComponent(getModPath())}`;
    }
    updateIconPreview(previewSrc, "techIconPreview");
    updateIconReadiness(tech);

    // Update Country Researched Checkbox
    const countryLabelTag = document.getElementById("countryLabelTag");
    if (countryLabelTag) {
      countryLabelTag.textContent = activeCountryTag || "---";
    }
    
    const countryTechResearched = document.getElementById("countryTechResearched");
    if (countryTechResearched) {
      countryTechResearched.checked = countryResearchedTechs.has(tech.id);
    }


    const techHidden = document.getElementById("techHidden");
    if (techHidden) {
      techHidden.checked = !!tech.isHidden;
    }

    renderDependenciesList(tech);

    updateAheadOfTimePenalty(tech.startYear);

    // Prerequisites rendering (the techs THIS one needs first — its parents)
    renderPrerequisitesList(tech);

    // The other end of the link: techs that require THIS one (its children) — so a link is
    // visible from both sides, with parent/child made explicit.
    renderUnlocksList(tech);

    // Mutually Exclusive list rendering
    renderExclusiveList(tech);

    // BUGFIX/FEATURE: Render sub-technology list
    renderSubTechList(tech);

    // Equipment configurations
    const hasEquipment = tech.enableEquipments && tech.enableEquipments.length > 0;
    const enableCheck = document.getElementById("enableEquipment");
    enableCheck.checked = hasEquipment;
    
    const equipSection = document.getElementById("equipmentSection");
    if (hasEquipment) {
      equipSection.style.display = "block";
      const eqId = tech.enableEquipments[0];
      let eq = allEquips[eqId];
      if (!eq) {
        // Build a transient default object purely for display — DO NOT register it on
        // allEquips or markDirty here. Mutating shared state during a read-only selection
        // falsely flagged the file as dirty whenever the user clicked any vanilla tech
        // that referenced a non-loaded equipment archetype.
        eq = {
          id: eqId,
          year: tech.startYear,
          archetype: "infantry_equipment",
          buildCostIc: 0.5,
          softAttack: 6,
          hardAttack: 1,
          defense: 22,
          breakthrough: 3,
          apAttack: 4,
          reliability: 0.9,
          resources: { steel: 2 },
          name: tech.name,
          fileName: NOVA_DEFAULT_EQUIPMENT_FILE
        };
        // Display only. Do NOT register this transient default in allEquips and do NOT
        // markDirty — merely *selecting* a tech whose equipment archetype isn't loaded must
        // not flag the file dirty (this is why MD prompted to save after a plain click).
        // When the user actually edits an equipment field, syncForm() registers it for real.
      }
      
      document.getElementById("equipId").value = eq.id;
      // Point the "Open in Military" link at THIS equipment. Carry the mod too, so the Military tab opens
      // on the same workspace instead of whatever it happened to have last. #eq-deeplink
      const openMil = document.getElementById("equipOpenInMilitary");
      if (openMil) {
        let mp = ""; try { mp = localStorage.getItem("activeModPath") || ""; } catch (_) {}
        openMil.href = "army.html?tab=equipment&eq=" + encodeURIComponent(eq.id) + (mp ? "&modPath=" + encodeURIComponent(mp) : "");
      }
      document.getElementById("equipArchetype").value = eq.archetype || "";
      // A stat the equipment does not define is INHERITED from its archetype, so show it blank rather than
      // as 0 — otherwise merely opening the weapon and saving turns every inherited value into a zero
      // override (#equipment-zero-stats). A real 0 in the file still shows as 0.
      const showStat = (id, v) => { document.getElementById(id).value = (v === undefined || v === null) ? "" : v; };
      // #tech-edit-stamps-equipment-stats — build cost and reliability used to sit on either side of that
      // comment and ignore it: `eq.buildCostIc || 0.5` and `eq.reliability || 0.9` filled the boxes with
      // Nova's own numbers for equipment that declares neither, and the save wrote them back as real
      // overrides. Editing ANY field of the tech — its name, description, year, cost, position — was enough,
      // since they all funnel into syncForm. Millennium Dawn's convoy_1 inherits build_cost_ic = 1500 from
      // `convoy`; one rename and it cost 0.5 IC. 28 MD and 44 vanilla tiers inherit build_cost_ic, 111 MD and
      // 80 vanilla inherit reliability. Nothing said a number had changed, and the fabricated value was
      // already showing in the box, so it looked like the value the equipment always had.
      // The catalog reports buildCostIc = 0.5 even when that is only the parser's default, so authoredStats
      // is the only thing that distinguishes "the file says 0.5" from "the file says nothing".
      const authoredStats = eq.authoredStats || {};
      showStat("equipCost", authoredStats.build_cost_ic === false ? undefined : eq.buildCostIc);
      showStat("equipSoftAttack", eq.softAttack);
      showStat("equipHardAttack", eq.hardAttack);
      showStat("equipDefense", eq.defense);
      showStat("equipBreakthrough", eq.breakthrough);
      showStat("equipApAttack", eq.apAttack);
      showStat("equipReliability", eq.reliability);
      document.getElementById("equipFile").value = eq.fileName || NOVA_DEFAULT_EQUIPMENT_FILE;
      
      // Render resources string
      const resStr = Object.entries(eq.resources || {})
        .map(([k, v]) => `${k} = ${v}`)
        .join("\n");
      document.getElementById("equipResources").value = resStr;
    } else {
      equipSection.style.display = "none";
    }

    // Toggle editable state for vanilla techs
    const inputs = editorPanel.querySelectorAll("input, textarea, select, button:not(#deselectBtn)");
    inputs.forEach(el => {
      if (tech.isMod) {
        el.removeAttribute("disabled");
      } else {
        el.setAttribute("disabled", "true");
      }
    });
  }

  // Render Prerequisites List in Sidebar
  function renderPrerequisitesList(tech) {
    const container = document.getElementById("prereqsList");
    container.innerHTML = "";
    
    if (!tech.prerequisites || tech.prerequisites.length === 0) {
      container.innerHTML = `<span style="font-size: 11px; color: #8b949e; font-style: italic;">No prerequisites</span>`;
      return;
    }
    
    tech.prerequisites.forEach((p, idx) => {
      const div = document.createElement("div");
      div.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 4px 8px; background: #161b22; border: 1px solid #30363d; border-radius: 4px; font-size: 12px;";

      let label = "";
      if (p.type === "OR" && Array.isArray(p.techs)) {
        label = `<span style="color:#8b949e;">Any of:</span> ` + p.techs.map(techRefLabel).join(` <span style="color:#8b949e;">/</span> `);
      } else {
        label = techRefLabel(p.tech);
      }

      div.innerHTML = `
        <span style="min-width:0; overflow:hidden;">${label}</span>
        ${tech.isMod ? `<button type="button" style="background:transparent; border:none; color:#f85149; font-weight:bold; cursor:pointer; flex:0 0 auto;" data-idx="${idx}">&times;</button>` : ""}
      `;
      
      if (tech.isMod) {
        div.querySelector("button").addEventListener("click", () => {
          const removed = tech.prerequisites[idx];
          tech.prerequisites.splice(idx, 1);
          markTechDirty(tech.id);
          // The ex-parent(s) need their path/leads_to_tech line removed on save.
          if (removed) {
            if (removed.type === "OR" && Array.isArray(removed.techs)) removed.techs.forEach((id) => markTechDirty(id));
            else if (removed.tech) markTechDirty(removed.tech);
          }
          updateSidebar();
          renderCanvas();
        });
      }
      container.appendChild(div);
    });
    if (window.NovaTechIcon) window.NovaTechIcon.mount(container);
  }

  function renameTechIdInClient(oldId, newId) {
    const tech = allTechs.find((t) => t.id === oldId);
    if (!tech || oldId === newId) return false;
    // previousId must name the id AS IT EXISTS ON DISK — the block the save has to remove. The ID field
    // fires `input` on every KEYSTROKE, so typing "zz_new" renamed the tech six times and left
    // previousId as "zz_ne": the real old id was lost after the second character. The save then removed
    // nothing, appended the tech under its new id, and the mod ended up defining BOTH — with duplicate
    // localisation keys and the parent pointing a path at each. Only record it the first time.
    if (!tech.previousId) tech.previousId = oldId;
    tech.id = newId;
    // Typed all the way back to where it started: there is no rename left to perform.
    if (tech.previousId === newId) delete tech.previousId;
    // A tech created this session is tracked by id, and its gridbox is written from that list. Renaming
    // it before the first Save orphaned the entry, so the tech saved WITHOUT a gridbox — invisible in
    // Nova and in-game ("Found no grid box for tech"). #new-tech-gridbox
    if (newlyCreatedTechIds.has(oldId)) {
      newlyCreatedTechIds.delete(oldId);
      newlyCreatedTechIds.add(newId);
    }

    if (countryResearchedTechs.has(oldId)) {
      countryResearchedTechs.delete(oldId);
      countryResearchedTechs.add(newId);
    }

    // #tech-rename-companion-equipment — a WIDE tech is born with a starter equipment named after the
    // throwaway id it was created with (`custom_tech_44828_equipment`). Renaming the tech to something real
    // left that name behind for good, so the mod shipped `nua_marines` unlocking `custom_tech_44828_equipment`
    // — defined, localised and working, but reading like scaffolding the modder can no longer get rid of
    // without editing three files by hand. Rename it with its tech, but ONLY when it is the one Nova minted:
    // an equipment the modder chose, or one that already existed in the mod, is not ours to rename.
    {
      const oldEquip = `${oldId}_equipment`;
      const newEquip = `${newId}_equipment`;
      const equipIdEl = document.getElementById("equipId");
      if (autoCreatedEquipIds.has(oldEquip) && allEquips[oldEquip] && !allEquips[newEquip]) {
        allEquips[newEquip] = { ...allEquips[oldEquip], id: newEquip };
        delete allEquips[oldEquip];
        autoCreatedEquipIds.delete(oldEquip);
        autoCreatedEquipIds.add(newEquip);
        if (Array.isArray(tech.enableEquipments)) {
          tech.enableEquipments = tech.enableEquipments.map((e) => (e === oldEquip ? newEquip : e));
        }
        // …and the Equipment ID FIELD, or none of the above survives: the same commit that performs the
        // rename goes on to read that field and rebuild both `enableEquipments` and the allEquips entry from
        // it, which put the throwaway name straight back. Only retarget it while it still holds the auto
        // name — once the modder has typed their own equipment id it is theirs.
        if (equipIdEl && equipIdEl.value.trim() === oldEquip) equipIdEl.value = newEquip;
        // The tech's equipment changed, so the tech has to be written — every other allEquips mutation
        // announces itself the same way, and test-research-equipment.js holds the whole file to that rule.
        markTechDirty(newId);
      }
    }

    // A RENAME REWRITES OTHER TECHS, SO THOSE TECHS MUST BE QUEUED FOR SAVE TOO (#rename-marks-referrers).
    // Save deliberately writes ONLY the techs in dirtyTechIds and leaves every other one byte-for-byte on
    // disk. This loop updated referrers in memory but never marked them, so renaming a tech wrote the new
    // id while its referrers kept pointing at the OLD one — dangling prerequisites, and a tree the game
    // cannot resolve. Reproduced on Millennium Dawn: renaming infantry_weapons rewrote infantry_weapons1's
    // prerequisite in memory while dirtyTechIds held only the renamed tech. The DELETE path already got
    // this right (it marks every refEdit owner); rename simply never did. Marking a vanilla tech here is
    // harmless — save filters those out — so mark on the basis of "did we actually change it".
    allTechs.forEach((t) => {
      let changed = false;
      if (t.prerequisites) {
        t.prerequisites.forEach((p) => {
          if (p.type === "OR" && Array.isArray(p.techs)) {
            if (p.techs.includes(oldId)) { p.techs = p.techs.map((id) => (id === oldId ? newId : id)); changed = true; }
          } else if (p.tech === oldId) {
            p.tech = newId; changed = true;
          }
        });
      }
      if (t.mutuallyExclusive && t.mutuallyExclusive.includes(oldId)) {
        t.mutuallyExclusive = t.mutuallyExclusive.map((id) => (id === oldId ? newId : id)); changed = true;
      }
      if (t.dependencies && t.dependencies.includes(oldId)) {
        t.dependencies = t.dependencies.map((id) => (id === oldId ? newId : id)); changed = true;
      }
      if (t.subTechnologies && t.subTechnologies.includes(oldId)) {
        t.subTechnologies = t.subTechnologies.map((id) => (id === oldId ? newId : id)); changed = true;
      }
      // t.id === newId is the renamed tech itself, already queued by the caller.
      if (changed && t.id !== newId) markTechDirty(t.id, `Rename ${oldId} → ${newId}`);
    });

    selectedTechId = newId;
    return true;
  }

  // Read-only "Unlocks" list: the techs that name THIS one as a prerequisite (its children).
  // Shows the other end of every link so a connection is visible from both nodes. Editing/removing
  // a link is still done from the child's Prerequisites × (so there's one source of truth).
  function renderUnlocksList(tech) {
    const container = document.getElementById("unlocksList");
    if (!container) return;
    container.innerHTML = "";
    const children = allTechs.filter((t) => {
      if (t.id === tech.id || t.isSubTech || !Array.isArray(t.prerequisites)) return false;
      return t.prerequisites.some((p) =>
        (p.type === "OR" && Array.isArray(p.techs) && p.techs.includes(tech.id)) || p.tech === tech.id
      );
    });
    if (!children.length) {
      container.innerHTML = `<span style="font-size: 11px; color: #8b949e; font-style: italic;">Unlocks nothing yet</span>`;
      return;
    }
    children.forEach((child) => {
      const div = document.createElement("div");
      div.style.cssText = "padding: 4px 8px; background: #161b22; border: 1px solid #30363d; border-radius: 4px; font-size: 12px;";
      div.innerHTML = techRefLabel(child.id);
      container.appendChild(div);
    });
    if (window.NovaTechIcon) window.NovaTechIcon.mount(container);
  }

  // "Name (id)" for a referenced tech, so prereq/dependency lists are readable instead of raw ids.
  function techRefLabel(id) {
    const t = allTechs.find((x) => x.id === id);
    // A referenced parent can live in the active mod (jump-able), or in a base mod / vanilla (valid but
    // not drawn on this canvas — show its name + a small origin tag, no jump). #110
    const baseRef = !t ? baseModTechs.find((x) => x.id === id) : null;
    const nameSrc = t || baseRef;
    const nm = nameSrc && nameSrc.name && nameSrc.name !== id ? nameSrc.name : null;
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const tag = baseRef ? ` <span style="color:#8b949e; font-size:9px;">(base mod)</span>` : "";
    // Show the tech's in-game icon next to its name (user: recognise techs by picture). #techicon
    const ico = window.NovaTechIcon ? window.NovaTechIcon.html(id) + " " : "";
    const inner = ico + (nm
      ? `<span>${esc(nm)}</span> <span style="font-family:monospace; color:#6e7681; font-size:10px;">${esc(id)}</span>`
      : `<span style="font-family:monospace;">${esc(id)}</span>`) + tag;
    // If the referenced tech is on THIS canvas, make it a clickable jump-link (delegated listener).
    // Base-mod / dangling refs are left as plain text (nothing to jump to here).
    return t
      ? `<span class="tech-ref-jump" data-jump-id="${esc(id)}" title="Go to this tech" style="cursor:pointer;">${inner}</span>`
      : inner;
  }

  // Clicking any tech reference (Prerequisites / Unlocks / Dependencies lists) jumps to that tech.
  // One delegated listener; the × delete buttons sit OUTSIDE the jump-span so they never collide.
  document.addEventListener("click", (e) => {
    const ref = e.target && e.target.closest && e.target.closest(".tech-ref-jump[data-jump-id]");
    if (ref && ref.dataset.jumpId) jumpToTech(ref.dataset.jumpId);
  });

  function renderDependenciesList(tech) {
    const container = document.getElementById("depsList");
    if (!container) return;
    container.innerHTML = "";

    if (!tech.dependencies || tech.dependencies.length === 0) {
      container.innerHTML = `<span style="font-size: 11px; color: #8b949e; font-style: italic;">No dependencies</span>`;
      return;
    }

    tech.dependencies.forEach((depId, idx) => {
      const div = document.createElement("div");
      div.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 4px 8px; background: #161b22; border: 1px solid #30363d; border-radius: 4px; font-size: 12px;";
      div.innerHTML = `
        ${techRefLabel(depId)}
        ${tech.isMod ? `<button type="button" style="background:transparent; border:none; color:#f85149; font-weight:bold; cursor:pointer;" data-idx="${idx}">&times;</button>` : ""}
      `;
      if (tech.isMod) {
        div.querySelector("button").addEventListener("click", () => {
          tech.dependencies.splice(idx, 1);
          markTechDirty(tech.id);
          updateSidebar();
        });
      }
      container.appendChild(div);
    });
    if (window.NovaTechIcon) window.NovaTechIcon.mount(container);
  }

  // Render Mutually Exclusive list in Sidebar
  function renderExclusiveList(tech) {
    const container = document.getElementById("exclusiveList");
    if (!container) return;
    container.innerHTML = "";
    
    if (!tech.mutuallyExclusive || tech.mutuallyExclusive.length === 0) {
      container.innerHTML = `<span style="font-size: 11px; color: #8b949e; font-style: italic;">No mutual exclusions</span>`;
      return;
    }
    
    tech.mutuallyExclusive.forEach((otherId, idx) => {
      const div = document.createElement("div");
      div.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: #161b22; border: 1px solid #30363d; border-radius: 4px; font-size: 12px;";
      
      div.innerHTML = `
        <span style="min-width:0; overflow:hidden;">${techRefLabel(otherId)}</span>
        ${tech.isMod ? `<button type="button" style="background:transparent; border:none; color:#f85149; font-weight:bold; cursor:pointer; flex:0 0 auto;" data-idx="${idx}">&times;</button>` : ""}
      `;

      if (tech.isMod) {
        div.querySelector("button").addEventListener("click", () => {
          tech.mutuallyExclusive.splice(idx, 1);
          
          // Also remove bidirectional link if exists on other node
          const other = allTechs.find(t => t.id === otherId);
          if (other && other.mutuallyExclusive) {
            other.mutuallyExclusive = other.mutuallyExclusive.filter(id => id !== tech.id);
          }

          markTechDirty(tech.id);
          markTechDirty(otherId);
          updateSidebar();
          renderCanvas();
        });
      }
      container.appendChild(div);
    });
  }

  // BUGFIX/FEATURE: Render Sub-technology list in Sidebar
  function renderSubTechList(tech) {
    const container = document.getElementById("subTechList");
    if (!container) return;
    container.innerHTML = "";

    if (!tech.subTechnologies || tech.subTechnologies.length === 0) {
      container.innerHTML = `<span style="font-size: 11px; color: #8b949e; font-style: italic;">No sub-technologies</span>`;
      return;
    }

    tech.subTechnologies.forEach((subId, idx) => {
      const div = document.createElement("div");
      div.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: #161b22; border: 1px solid #30363d; border-radius: 4px; font-size: 12px;";
      div.innerHTML = `
        <span style="font-family: monospace;">⎵ ${subId}</span>
        ${tech.isMod ? `<button type="button" style="background:transparent; border:none; color:#f85149; font-weight:bold; cursor:pointer;" data-idx="${idx}">&times;</button>` : ""}
      `;
      if (tech.isMod) {
        div.querySelector("button").addEventListener("click", () => {
          tech.subTechnologies.splice(idx, 1);
          // Also flip the child tech's isSubTech flag back
          const child = allTechs.find(t => t.id === subId);
          if (child) child.isSubTech = false;
          markTechDirty(tech.id);
          markTechDirty(subId);
          updateSidebar();
          renderCanvas();
        });
      }
      container.appendChild(div);
    });
  }

  // Calculate cumulative research speed bonus from starting researched techs
  function calculateResearchSpeed() {
    let speedBonus = ideasResearchSpeedBonus;
    countryResearchedTechs.forEach(techId => {
      const tech = allTechs.find(t => t.id === techId);
      if (tech && tech.modifiers) {
        const lines = tech.modifiers.split("\n");
        lines.forEach(line => {
          const parts = line.split("=");
          if (parts.length === 2) {
            const key = parts[0].trim().toLowerCase();
            const val = parseFloat(parts[1].trim());
            if (!isNaN(val) && (key === "research_speed" || key === "research_speed_factor")) {
              speedBonus += val;
            }
          }
        });
      }
    });
    return speedBonus;
  }

  // Update Research Speed display
  function updateResearchSlots() {
    const speed = calculateResearchSpeed();
    const speedValEl = document.getElementById("globalResearchSpeedVal");
    if (speedValEl) {
      speedValEl.textContent = `+${(speed * 100).toFixed(1)}%`;
    }
  }

  // Update GFX Icon Preview
  function updateIconPreview(url, previewId) {
    const preview = document.getElementById(previewId);
    if (!preview) return;
    const defaultIcon = "/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds";
    
    if (url) {
      preview.innerHTML = `<img src="${url}" alt="Icon" data-fallback="${defaultIcon}" />`;
    } else {
      preview.innerHTML = `<img src="${defaultIcon}" alt="Icon" />`;
    }
  }

  // Tell the modder, up front, whether the game actually has the picture this weapon needs —
  // instead of only finding out in-game when it shows as a "?". We probe the SAME key + country the
  // research tree itself renders with (the engine already does size-fallback small/medium/large and
  // country-specific prefixes), so this matches exactly what you'll see in the canvas and in-game.
  async function updateIconReadiness(tech) {
    const el = document.getElementById("techIconStatus");
    if (!el || !tech) return;
    const key = tech.iconKey || `GFX_${tech.id}_medium`;
    el.textContent = "Checking icon…";
    el.style.color = "#6e7681";
    let ok = false;
    try {
      const r = await fetch(`/api/icon-image?key=${encodeURIComponent(key)}&modPath=${encodeURIComponent(getModPath())}${activeCountryTag ? `&country=${activeCountryTag}` : ""}&probe=1`);
      const d = await r.json();
      // A real icon resolves either as a web image (found) or, for the usual HOI4 .dds files, as a
      // concrete path with source "dds-only". Only the "?" fallback means it's actually missing.
      ok = !!d && !d.isFallback && (!!d.found || !!d.path);
    } catch (_) { return; }
    if (selectedTechId !== tech.id) return; // selection changed while probing — don't paint stale
    if (ok) {
      el.innerHTML = `<span style="color:#3fb950;">✓ Icon found</span> <span style="color:#6e7681;">— this weapon will show its picture in-game.</span>`;
    } else {
      el.innerHTML = `<span style="color:#f0883e;">⚠ No picture found for this weapon — it will show as a "?" in-game. Use <b>Browse Icons</b> to pick one or <b>Upload PNG</b> to add your own.</span>`;
    }
  }

  // Sync Form Updates Back to the selected technology object
  function syncForm() {
    if (!selectedTechId) return;
    const tech = allTechs.find(t => t.id === selectedTechId);
    if (!tech || !tech.isMod) return;
    markTechDirty(tech.id);

    const techIdEl = document.getElementById("techId");
    const newId = techIdEl ? techIdEl.value.trim() : "";
    if (newId && newId !== tech.id) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newId)) {
        nbAlert("Technology ID must start with a letter or underscore, then use only letters, numbers, and underscores. HOI4 rejects an ID that starts with a number, which would break the mod.");
        techIdEl.value = tech.id;
        return;
      }
      if (allTechs.some((t) => t.id === newId && t.id !== tech.id)) {
        nbAlert(`Technology ID "${newId}" is already in use.`);
        techIdEl.value = tech.id;
        return;
      }
      renameTechIdInClient(tech.id, newId);
      renderCanvas();
    }

    const techAfterRename = allTechs.find((t) => t.id === selectedTechId);
    if (!techAfterRename) return;
    
    techAfterRename.name = document.getElementById("techName").value.trim();
    techAfterRename.description = document.getElementById("techDesc").value.trim();
    techAfterRename.researchCost = parseFloat(document.getElementById("techCost").value) || 1.0;
    
    const activeElId = document.activeElement ? document.activeElement.id : "";
    if (activeElId === "techYear") {
      techAfterRename.startYear = parseInt(document.getElementById("techYear").value) || 1936;
      const newY = getCoordFromYear(techAfterRename.startYear);
      techAfterRename.y = newY;
      const yInput = document.getElementById("techY");
      if (yInput) yInput.value = newY;
      updateAheadOfTimePenalty(techAfterRename.startYear);
      techAfterRename.x = parseInt(document.getElementById("techX").value) || 0;
    } else if (activeElId === "techY") {
      techAfterRename.y = parseInt(document.getElementById("techY").value) || 0;
      const newYear = getYearFromCoord(techAfterRename.y);
      techAfterRename.startYear = newYear;
      const yearInput = document.getElementById("techYear");
      if (yearInput) yearInput.value = newYear;
      updateAheadOfTimePenalty(newYear);
      techAfterRename.x = parseInt(document.getElementById("techX").value) || 0;
    } else {
      techAfterRename.startYear = parseInt(document.getElementById("techYear").value) || 1936;
      updateAheadOfTimePenalty(techAfterRename.startYear);
      techAfterRename.x = parseInt(document.getElementById("techX").value) || 0;
      techAfterRename.y = parseInt(document.getElementById("techY").value) || 0;
    }
    // A typed-in X is the authored baseline for the DLC packer too (see the drag commit) — else toggling
    // a DLC would reset it.
    techAfterRename._origX = techAfterRename.x;
    // Record where the tech came from the FIRST time the File field changes, so the save can remove it
    // from that one file. Like previousId, only the original matters — the field fires `input` on every
    // keystroke, so overwriting this each time would leave a half-typed filename behind. The server
    // deletes from this file and no other: sweeping the directory for the id gutted mods that ship the
    // same id in several files. #one-file-per-tech
    const nextFile = document.getElementById("techFile").value.trim() || "custom_technologies.txt";
    if (nextFile !== techAfterRename.fileName && !techAfterRename.previousFileName) {
      techAfterRename.previousFileName = techAfterRename.fileName;
    }
    if (techAfterRename.previousFileName === nextFile) delete techAfterRename.previousFileName;
    techAfterRename.fileName = nextFile;
    techAfterRename.modifiers = document.getElementById("techModifiers").value.trim();
    {
      // Recombine the user's extra script with the country lock (allow_branch) from the picker.
      let extra = stripCountryLock(document.getElementById("techExtraScript").value.trim());
      const lockTag = (document.getElementById("techCountryLock") && document.getElementById("techCountryLock").value || "").trim().toUpperCase();
      if (lockTag) extra = (extra ? extra + "\n" : "") + `allow_branch = { original_tag = ${lockTag} }`;
      techAfterRename.extraScript = extra;
    }
    const techCatEl = document.getElementById("techCategories");
    if (techCatEl) {
      techAfterRename.categories = techCatEl.value.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean);
    }
    const techAiEl = document.getElementById("techAiWillDo");
    if (techAiEl) techAfterRename.aiWillDo = techAiEl.value.trim();
    const techDoctrineEl2 = document.getElementById("techDoctrine");
    if (techDoctrineEl2) techAfterRename.doctrine = techDoctrineEl2.checked;
    const techShowEqEl2 = document.getElementById("techShowEquipmentIcon");
    if (techShowEqEl2) techAfterRename.showEquipmentIcon = techShowEqEl2.checked;
    const techForceSmallEl2 = document.getElementById("techForceSmall");
    if (techForceSmallEl2) techAfterRename.forceSmallLayout = techForceSmallEl2.checked;
    techAfterRename.iconKey = document.getElementById("techIconId").value.trim();
    


    const techHidden = document.getElementById("techHidden");
    if (techHidden) {
      techAfterRename.isHidden = techHidden.checked;
    }
    
    const folderSelect = document.getElementById("techFolderSelect");
    if (folderSelect) {
      techAfterRename.folder = folderSelect.value;
    }

    // Sync Equipment configuration
    const enableCheck = document.getElementById("enableEquipment");
    if (enableCheck.checked) {
      const eqId = document.getElementById("equipId").value.trim() || `${techAfterRename.id}_equipment`;
      // HOI4 rejects an id that starts with a number (breaks the whole equipment file). Validate the same way
      // the tech id is validated above; the server guards this too (persistTechnologySave / writeEquipmentToFile).
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(eqId)) {
        nbAlert("Equipment ID must start with a letter or underscore, then use only letters, numbers, and underscores. HOI4 rejects an ID that starts with a number, which would break the equipment file.");
        return;
      }
      techAfterRename.enableEquipments = [eqId];
      
      const resourcesObj = {};
      document.getElementById("equipResources").value.split("\n").forEach(line => {
        const parts = line.split("=");
        if (parts.length === 2) {
          const k = parts[0].trim();
          const v = parseInt(parts[1].trim());
          if (k && !isNaN(v)) resourcesObj[k] = v;
        }
      });

      allEquips[eqId] = {
        id: eqId,
        year: techAfterRename.startYear,
        archetype: document.getElementById("equipArchetype").value.trim() || "infantry_equipment",
        // Blank = inherit from the archetype (key omitted); a typed 0 is a deliberate zero and is kept.
        // #tech-edit-stamps-equipment-stats — buildCostIc and reliability used to be
        // `parseFloat(box) || 0.5` / `|| 0.9`, so a blank box became a real override written into the file.
        // They go through statOrInherit now like every other stat: blank yields undefined, and
        // serializeEquipment skips an undefined stat outright (server.js, `if (val === undefined) return`).
        // authoredStats is deliberately NOT forwarded — if the user typed a number it must be written even
        // when it happens to equal the parser default, and forwarding a stale "not authored" flag would
        // suppress exactly that.
        buildCostIc: statOrInherit("equipCost"),
        softAttack: statOrInherit("equipSoftAttack"),
        hardAttack: statOrInherit("equipHardAttack"),
        defense: statOrInherit("equipDefense"),
        breakthrough: statOrInherit("equipBreakthrough"),
        apAttack: statOrInherit("equipApAttack"),
        reliability: statOrInherit("equipReliability"),
        resources: resourcesObj,
        name: techAfterRename.name,
        fileName: document.getElementById("equipFile").value.trim() || NOVA_DEFAULT_EQUIPMENT_FILE
      };
    } else {
      techAfterRename.enableEquipments = [];
    }
    // Box size depends on equipment + the force flag — keep the readout live as either changes.
    updateBoxSizeReadout(techAfterRename);
  }

  // Country Researched Checkbox Live Sync
  const countryTechResearched = document.getElementById("countryTechResearched");
  if (countryTechResearched) {
    countryTechResearched.addEventListener("change", (e) => {
      if (!selectedTechId) return;
      if (e.target.checked) {
        countryResearchedTechs.add(selectedTechId);
      } else {
        countryResearchedTechs.delete(selectedTechId);
      }
      // This is the ONLY thing that makes Save allowed to rewrite the country's history file
      // (#no-country-write-without-edit). Without the flag, every save rewrote it.
      countryTechsDirty = true;
      markDirty();
      renderCanvas();
    });
  }

  // BUGFIX: Split inputs by whether their changes need a canvas re-render.
  // Previously every keystroke in *any* field triggered renderCanvas() which thrashed
  // the DOM, dragged framerate down on large trees, and stole input focus.
  // Only fields that change *visible* node properties cause a canvas re-render now.
  const visualInputs = ["techName", "techYear", "techX", "techY", "techIconId", "techFolderSelect", "techHidden", "techForceSmall"];
  // #sidebar-input-list-is-hand-written — DERIVED, not typed.
  //
  // This used to be a hand-written list of 30 ids while #editorPanel held 35 form controls, and the field
  // that fell through the gap was #techCountryLock: syncForm READS it (it recombines allow_branch into
  // extraScript) but nothing ever called syncForm when it changed, so picking a country lock and saving
  // wrote nothing and the next sidebar refresh rebuilt the dropdown from the old script.
  //
  // Everything in the panel is wired unless it is named below, so a field added to the sidebar is wired
  // the moment it exists. visualInputs stays a hand-written list on purpose: it is the subset whose value
  // changes what the CANVAS draws, which is a real distinction and not derivable from the markup.
  const NOT_TECH_FIELDS = [
    "aiPrompt",              // the AI prompt box — not part of the tech
    "techIconUpload",        // a file input; the upload button handles it
    "techCountrySelect",     // picks WHICH country the researched-techs list is for, not a tech field
    "countryTechResearched", // has its own change handler (it edits the country, not the tech)
  ];
  const nonVisualInputs = [...document.querySelectorAll("#editorPanel input, #editorPanel select, #editorPanel textarea")]
    .map((el) => el.id)
    .filter((id) => id && !visualInputs.includes(id) && !NOT_TECH_FIELDS.includes(id));
  const inputs = [...visualInputs, ...nonVisualInputs];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const needsCanvas = visualInputs.includes(id);
    el.addEventListener("input", () => {
      syncForm();
      if (needsCanvas) renderCanvas();
    });
    el.addEventListener("change", () => {
      syncForm();
      if (needsCanvas) renderCanvas();
      // BUGFIX: only the enableEquipment checkbox needs a full sidebar refresh
      // (to show/hide the equipment section). Other change events used to call
      // updateSidebar() unconditionally, which re-populated form fields with
      // raw stored values mid-edit and overwrote what the user just typed.
      if (id === "enableEquipment") updateSidebar();
    });
  });

  // Genesis "plain English" preview for the tech's passive Modifiers (read-only, additive — never
  // changes what is saved). Same kill-coding aid as the other makers: read "Factory output +10%"
  // instead of raw "industrial_capacity_factory = 0.1". DOM text nodes only (no markup injection).
  function refreshTechModifiersPreview() {
    const ta = document.getElementById("techModifiers");
    const box = document.getElementById("techModifiersPreview");
    if (!ta || !box) return;
    const raw = (ta.value || "").trim();
    if (!raw) { box.style.display = "none"; box.textContent = ""; return; }
    let english = "";
    try {
      if (window.GenesisEngine && typeof window.GenesisEngine.translate === "function") english = window.GenesisEngine.translate(raw);
    } catch (_) { english = ""; }
    box.style.display = "";
    box.textContent = "";
    const lab = document.createElement("span");
    lab.className = "genesis-preview-label";
    lab.textContent = "🔮 Passive effects";
    box.appendChild(lab);
    if (english) {
      box.classList.remove("genesis-preview-empty");
      box.appendChild(document.createTextNode(english));
    } else {
      box.classList.add("genesis-preview-empty");
      box.appendChild(document.createTextNode("Couldn't auto-translate these modifiers — they will still be saved exactly as written."));
    }
  }
  {
    const tm = document.getElementById("techModifiers");
    if (tm) { tm.addEventListener("input", refreshTechModifiersPreview); tm.addEventListener("change", refreshTechModifiersPreview); }
  }
  window.__novaRefreshTechModifiers = refreshTechModifiersPreview;

  // Link mode activation
  const linkTechsBtn = document.getElementById("linkTechsBtn");
  const linkBanner = document.getElementById("linkBanner");
  const cancelLinkBtn = document.getElementById("cancelLinkBtn");
  
  if (linkTechsBtn) {
    linkTechsBtn.addEventListener("click", () => {
      isLinkMode = true;
      linkParentId = selectedTechId || null;
      linkBanner.style.display = "flex";
      if (linkParentId) {
        linkBanner.querySelector("span").innerHTML = `🔗 <strong>Parent Selected:</strong> Select target child node to link from ${linkParentId}`;
      } else {
        linkBanner.querySelector("span").innerHTML = `🔗 Select parent technology node to link from`;
      }
      linkTechsBtn.classList.add("active");
    });
  }

  if (cancelLinkBtn) {
    cancelLinkBtn.addEventListener("click", () => {
      exitLinkMode();
    });
  }

  function exitLinkMode() {
    isLinkMode = false;
    linkParentId = null;
    linkBanner.style.display = "none";
    linkTechsBtn.classList.remove("active");
  }

  function handleLinkSelection(techId) {
    if (!linkParentId) {
      linkParentId = techId;
      linkBanner.querySelector("span").innerHTML = `🔗 <strong>Parent Selected:</strong> Select target child node to link from ${techId}`;
    } else {
      const childId = techId;
      if (childId !== linkParentId) {
        const child = allTechs.find(t => t.id === childId);
        if (child && child.isMod) {
          if (!warnUnknownTechId(linkParentId, "prerequisite parent")) return;
          if (!warnUnknownTechId(childId, "prerequisite child")) return;
          if (!child.prerequisites) child.prerequisites = [];
          
          // Check duplicate
          const exists = child.prerequisites.some(p => p.type === "AND" && p.tech === linkParentId);
          if (!exists) {
            child.prerequisites.push({ type: "AND", tech: linkParentId });
            markTechDirty(childId);
            markTechDirty(linkParentId); // parent gets the path/leads_to line on save
            renderCanvas();
            updateSidebar();
          }
        }
      }
      exitLinkMode();
    }
  }

  // Delete technology node — DEFERRED + UNDOABLE.
  // This used to POST /api/technologies/delete immediately, so one misclick wiped the node from
  // disk forever. Now deletion is in-memory only: the node is removed, recorded for Undo, and the
  // real file removal is carried in the next Save (save-batch `deletions`). Nothing is lost until
  // you click Save, and the last delete can be undone right up to that point.
  let pendingDeletions = [];   // [{techId, techFile, equipId, equipFile}] — applied on next save
  let deletedUndoStack = [];   // [{tech, index, refEdits, wasResearched, pending}]

  function undoLastDelete() {
    const entry = deletedUndoStack.pop();
    if (!entry) return;
    const { tech, index, refEdits, wasResearched, pending } = entry;
    allTechs.splice(Math.min(index, allTechs.length), 0, tech);
    refEdits.forEach((e) => {
      const owner = allTechs.find((t) => t.id === e.ownerId);
      if (!owner) return;
      if (e.kind === "prereq") { owner.prerequisites = owner.prerequisites || []; owner.prerequisites.push(e.value); }
      else if (e.kind === "mutex") { owner.mutuallyExclusive = owner.mutuallyExclusive || []; owner.mutuallyExclusive.push(e.value); }
      else if (e.kind === "dep") { owner.dependencies = owner.dependencies || []; owner.dependencies.push(e.value); }
      else if (e.kind === "subtech") { owner.subTechnologies = owner.subTechnologies || []; owner.subTechnologies.push(e.value); }
    });
    if (wasResearched) countryResearchedTechs.add(tech.id);
    const pi = pendingDeletions.indexOf(pending);
    if (pi !== -1) pendingDeletions.splice(pi, 1);
    selectedTechId = tech.id;
    // Restoring a tech is a mutation like any other, so it has to reach the history — otherwise the
    // toast's Undo and Ctrl+Z would hold different ideas of the current state (#research-undo).
    markTechDirty(tech.id, `Restore ${tech.name || tech.id}`);
    renderCanvas();
    updateSidebar();
  }

  function showUndoToast(message, onUndo) {
    document.querySelectorAll(".nova-toast").forEach((n) => n.remove());
    const toast = document.createElement("div");
    toast.className = "nova-toast";
    const msg = document.createElement("span");
    msg.textContent = message;
    toast.appendChild(msg);
    document.body.appendChild(toast);
    const timer = setTimeout(() => toast.remove(), 9000);
    // #toast-undo-with-nothing-to-undo — the button was appended unconditionally, but four callers use this
    // as a plain notification and pass no callback: "Nothing to undo", "Undid: X", and the two redo
    // equivalents. Clicking the Undo button on one of those threw "onUndo is not a function" — an uncaught
    // error from pressing Undo twice in the research editor. A toast with no action offers no button.
    if (typeof onUndo === "function") {
      const btn = document.createElement("button");
      btn.textContent = "Undo";
      btn.className = "nova-toast-undo";
      toast.appendChild(btn);
      btn.addEventListener("click", () => { clearTimeout(timer); toast.remove(); onUndo(); });
    }
  }

  const deleteTechBtn = document.getElementById("deleteTechBtn");
  if (deleteTechBtn) {
    deleteTechBtn.addEventListener("click", () => {
      if (!selectedTechId) return;
      const tech = allTechs.find((t) => t.id === selectedTechId);
      if (!tech || !tech.isMod) return;
      showNovaConfirmModal(`Delete "${tech.name || tech.id}"?\n\nYou can Undo this, and it stays in your files until you click Save Changes.`, () => {

      const deletedId = tech.id;
      const eqId = tech.enableEquipments && tech.enableEquipments[0];
      const index = allTechs.indexOf(tech);
      const refEdits = [];

      // Strip references to the deleted tech from every other tech (so HOI4 doesn't log
      // "undefined technology"), recording each removal so Undo can restore it exactly.
      allTechs.forEach((t) => {
        if (t.id === deletedId) return;
        if (t.prerequisites && t.prerequisites.length) {
          t.prerequisites = t.prerequisites
            .map((p) => {
              if (p.type === "OR" && Array.isArray(p.techs)) {
                if (!p.techs.includes(deletedId)) return p;
                refEdits.push({ ownerId: t.id, kind: "prereq", value: p });
                const filtered = p.techs.filter((id) => id !== deletedId);
                return filtered.length > 0 ? { type: "OR", techs: filtered } : null;
              }
              if (p.tech === deletedId) { refEdits.push({ ownerId: t.id, kind: "prereq", value: p }); return null; }
              return p;
            })
            .filter(Boolean);
        }
        if (t.mutuallyExclusive && t.mutuallyExclusive.includes(deletedId)) {
          refEdits.push({ ownerId: t.id, kind: "mutex", value: deletedId });
          t.mutuallyExclusive = t.mutuallyExclusive.filter((id) => id !== deletedId);
        }
        if (t.dependencies && t.dependencies.includes(deletedId)) {
          refEdits.push({ ownerId: t.id, kind: "dep", value: deletedId });
          t.dependencies = t.dependencies.filter((id) => id !== deletedId);
        }
        if (t.subTechnologies && t.subTechnologies.includes(deletedId)) {
          refEdits.push({ ownerId: t.id, kind: "subtech", value: deletedId });
          t.subTechnologies = t.subTechnologies.filter((id) => id !== deletedId);
        }
      });

      const wasResearched = countryResearchedTechs.has(deletedId);
      if (wasResearched) countryResearchedTechs.delete(deletedId);

      const techClone = JSON.parse(JSON.stringify(tech));
      const pending = {
        techId: deletedId,
        techFile: tech.fileName,
        equipId: eqId || null,
        equipFile: eqId && allEquips[eqId] ? allEquips[eqId].fileName : null,
      };
      pendingDeletions.push(pending);
      deletedUndoStack.push({ tech: techClone, index, refEdits, wasResearched, pending });

      allTechs = allTechs.filter((t) => t.id !== deletedId);
      selectedTechId = null;
      // Techs whose references we just stripped must be rewritten on save (vanilla ones are
      // filtered out at save time, so marking them here is harmless).
      refEdits.forEach((e) => markTechDirty(e.ownerId));
      // The deleted tech's PARENTS each hold a `path = { leads_to_tech = <deleted> }` that must be
      // dropped on save. They're NOT in refEdits (their model doesn't store the path — it's regenerated
      // server-side from the child list), so mark them dirty explicitly. The server removes the deleted
      // tech from the catalog before regenerating, so the stale edge is not re-emitted.
      (tech.prerequisites || []).forEach((p) => {
        if (p && p.type === "OR" && Array.isArray(p.techs)) p.techs.forEach((id) => markTechDirty(id));
        else if (p && p.tech) markTechDirty(p.tech);
      });
      markDirty();
      renderCanvas();
      updateSidebar();
      showUndoToast(`Deleted "${techClone.name || deletedId}" — removed from files on Save.`, undoLastDelete);
      }, { title: "Delete technology", yesLabel: "Delete", danger: true });
    });
  }

  // Save changes
  const saveAllBtn = document.getElementById("saveAllBtn");
  async function saveAllChanges() {
    syncForm();
    const activeRoot = getModPath();
    if (!activeRoot) {
      nbAlert("Select an active mod folder first.");
      return false;
    }
    
    const modSelector = document.getElementById("headerModSelector");
    const selectedOptionText = modSelector && modSelector.options[modSelector.selectedIndex] ? modSelector.options[modSelector.selectedIndex].text : "";
    // ⛔ THE LOAD-BEARING ONE. Keyed on the mod's NAME, this refused every research edit in any mod called
    // "Vanilla Plus", "Improved Vanilla" or similar — with advice the user had already followed and could
    // not act on, since Nova has no mod-rename. Worse at quit: __focusEditorSaveBeforeExit calls this, so
    // main.js showed "Save Failed — fix any validation or save errors and try exiting again" and kept the
    // window open, leaving Cancel or Don't Save as the only exits. The whole session's research work could
    // only be discarded. Now the PATH-based flag, which is what the base game actually is.
    const selectedOpt = modSelector && modSelector.options[modSelector.selectedIndex];
    if (selectedOpt && selectedOpt.dataset.vanilla === "1") {
      nbAlert("Cannot save changes while 'Vanilla Game Files' is selected. Please select or create a custom mod first.");
      return false;
    }
    
    if (saveAllBtn) {
      saveAllBtn.disabled = true;
      saveAllBtn.textContent = "Saving...";
    }
    
    try {
      // Save ONLY the techs the user created/edited, plus the prerequisite-parents of those techs
      // (so their path/leads_to_tech lines get rewritten correctly). Every other mod tech is left
      // byte-for-byte as it is on disk — never re-serialized — which is what stops save from
      // corrupting untouched techs (scattered nodes, wrong tabs, dropped fields).
      const idsToSave = new Set(dirtyTechIds);
      allTechs.forEach((t) => {
        if (!idsToSave.has(t.id) || !Array.isArray(t.prerequisites)) return;
        t.prerequisites.forEach((p) => {
          if (p && p.type === "OR" && Array.isArray(p.techs)) p.techs.forEach((id) => idsToSave.add(id));
          else if (p && p.tech) idsToSave.add(p.tech);
        });
      });
      const modTechs = allTechs.filter((t) => t.isMod && idsToSave.has(t.id));

      const res = await fetch("/api/technologies/save-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technologies: modTechs,
          equipments: allEquips,
          customTabs,
          modPath: activeRoot,
          countryTag: activeCountryTag || null,
          // null when untouched: the server only rewrites the country's history file when it receives an
          // actual list, so a save that changed no starting techs leaves that file alone entirely.
          countryTechIds: countryTechsDirty ? Array.from(countryResearchedTechs) : null,
          deletions: pendingDeletions,
          // Techs created this session — the server writes a gridbox for these and ONLY these, so a new
          // tech is visible instead of silently unplaced (#new-tech-gridbox).
          newTechIds: [...newlyCreatedTechIds],
        }),
      });
      // A FAILED SAVE MUST NOT LOOK LIKE A SUCCESSFUL ONE (#save-failure-status). This checked only
      // `result.error`, so an HTTP 500 whose JSON body happened to lack that key — or a proxy/error page
      // that still parsed — fell straight through to the success path below: dirty cleared, dirtyTechIds
      // emptied, pendingDeletions dropped, catalog reloaded, "saved successfully". Reproduced with a
      // stubbed 500 returning {ok:false}: the editor discarded the edit and told the user it had saved.
      // Check the STATUS too, and treat an unparseable body as failure rather than as an empty success.
      let result;
      try { result = await res.json(); } catch (_) { result = null; }
      if (!res.ok || !result || result.error) {
        throw new Error((result && result.error) || `the server rejected the save (HTTP ${res.status})`);
      }

      // #tech-modifier-not-a-modifier — SHOW WHAT THE SAVE WANTED TO TELL YOU.
      //
      // The server returns `refWarning` for things a save did that the user needs to know — a rename
      // whose references could not all be rewritten, an equipment file redirected, an unknown country
      // tag, a modifier that is not a modifier. This page read it and every other maker did not, so the
      // same note surfaced here and was thrown away everywhere else.
      //
      // It is now shown for ALL pages by the write-note surface in loading-overlay.js, which is the one
      // script every maker page loads. Showing it here as well would dialog the user twice.
      // #write-notes-reach-one-page

      // Commit the staged editor-display state (annotation + section-label positions) to localStorage
      // NOW — before loadCatalog() re-reads localStorage via loadYearOverrides, which would otherwise
      // restore the pre-move positions and silently drop the just-saved moves.
      persistResearchDisplayState();
      // Deletions are now on disk — clear the pending list, undo stack, and edited-tech set.
      pendingDeletions = [];
      deletedUndoStack = [];
      dirtyTechIds = new Set();
      newlyCreatedTechIds = new Set(); // their gridboxes are written; they are ordinary techs from here on
      countryTechsDirty = false;       // the country's starting techs are committed
      // The id on disk is now the id in the editor, so there is no longer an old block to remove. Leaving
      // previousId set meant a SECOND rename asked the server to delete an id that was already gone,
      // while the current on-disk block stayed — duplicating the tech.
      allTechs.forEach((t) => {
        if (t && t.previousId) delete t.previousId;
        if (t && t.previousFileName) delete t.previousFileName; // the move is on disk; #one-file-per-tech
      });
      clearDirty();
      // Kept as a promise, not fire-and-forget: loadCatalog() ends with clearDirty() + histReset(), so an
      // un-awaited reload RACES the staged flushes below and wipes the dirty flag they set on failure —
      // leaving a failed write queued but the editor claiming everything is saved, which is exactly the
      // unreachable-retry the flush fix exists to prevent. It still runs in parallel; we just wait for it
      // before deciding the final dirty state. #save-failure-retry
      const reloadPromise = loadCatalog();
      // Fold the old "Apply years to game" button into Save: if the year design changed this session, write it
      // into the active folder's research gui now (backed up + reversible) so it's never a separate step.
      // A FLUSH THAT FAILED STAYS QUEUED — the same contract the font and text flushes below spell out.
      // This block used to clear yearsDirty outside its own catch, with an empty catch and silent: true
      // suppressing every message applyYearsToGame would have shown, so a failed write to
      // countrytechtreeview.gui vanished without a word and Save reported success. #year-flush-failure-swallowed
      let flushFailures = 0;
      if (yearsDirty) {
        try {
          // null means it could not even try — no research folder tab is open, so there is nothing to
          // write the markers into. That is still a write that did not happen, so it must not clear the flag.
          const applied = await applyYearsToGame({ silent: true });
          if (applied === null) throw new Error("no research folder tab is open to write them into");
          yearsDirty = false;
        } catch (e) {
          flushFailures += 1;
          nbAlert("Couldn't write the year labels into the research screen: " + (e.message || e)
            + "\n\nThey are still pending — press Save Changes again to retry. Your tech changes were saved.");
        }
      }
      // Flush staged section-label font changes (#staged-label-font). Sequential so each gui write sees the
      // previous one's result; a failure surfaces but never loses the already-committed tech save.
      // A FLUSH THAT FAILED STAYS QUEUED (#save-failure-retry). These loops used to clear the whole
      // pending map afterwards regardless of outcome, so a write that failed was announced once in an
      // alert and then thrown away — pressing Save again would not retry it, and the edit was gone. Keep
      // the failures, drop only what actually landed, and re-mark the editor dirty so the retry is real.
      const pendingFonts = Object.entries(guiLabelFontPending);
      if (pendingFonts.length) {
        const stillPending = {};
        for (const [key, p] of pendingFonts) {
          try {
            const r = await fetch("/api/research/set-label-font", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ modPath: getModPath(), folder: p.folder, name: p.name, font: p.font }),
            }).then((x) => x.json());
            if (!r || r.ok !== true) throw new Error((r && r.error) || "unknown error");
          } catch (e) { stillPending[key] = p; flushFailures += 1; nbAlert("Couldn't save the label font for " + p.name + ": " + e.message + "\n\nIt is still pending — press Save Changes again to retry."); }
        }
        guiLabelFontPending = stillPending;
      }
      // Flush staged section-label TEXT rewrites (#staged-label-text) — same contract as the fonts: nothing
      // reached the mod's localisation while you were editing, so this is the one and only write.
      const pendingTexts = Object.entries(guiLabelTextPending);
      if (pendingTexts.length) {
        const stillPending = {};
        for (const [key, p] of pendingTexts) {
          try {
            const r = await fetch("/api/research/set-label-text", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ modPath: getModPath(), key: p.key, value: p.value }),
            }).then((x) => x.json());
            if (!r || r.ok !== true) throw new Error((r && r.error) || "unknown error");
          } catch (e) { stillPending[key] = p; flushFailures += 1; nbAlert("Couldn't save the label text for " + p.key + ": " + e.message + "\n\nIt is still pending — press Save Changes again to retry."); }
        }
        guiLabelTextPending = stillPending;
      }
      // Anything still queued means the save was PARTIAL: the techs landed but a label write did not.
      // Re-mark dirty so the unsaved-changes guards (reload, mod switch) stay armed and Save retries —
      // clearing dirty here would leave the retry queued but unreachable, which is how the edit got lost.
      try { await reloadPromise; } catch (_) { /* the reload is best-effort; the save already committed */ }
      if (flushFailures > 0) { dirty = true; return false; }
      return true;
    } catch (err) {
      nbAlert("Failed to save research tree: " + err.message);
      return false;
    } finally {
      if (saveAllBtn) {
        saveAllBtn.disabled = false;
        saveAllBtn.textContent = "Save Changes";
      }
    }
  }

  if (saveAllBtn) {
    saveAllBtn.addEventListener("click", async () => {
      const ok = await saveAllChanges();
      if (ok) {
        nbAlert("Research tree, weapons, and country history saved successfully!");
      }
    });
  }

  // "Fix Tab Layout": regenerate per-tech grid positions for the mod's custom research folders so
  // every tech renders in-game (repairs an empty custom tab / "Found no grid box"). Saving techs
  // already keeps this in sync; this button repairs an existing mod in one click.
  // Years menu — NEW model: each button operates the in-place year objects (renderGuiYears), not the old rail.
  const addYearBtn = document.getElementById("addYearBtn");
  if (addYearBtn) addYearBtn.addEventListener("click", () => addGuiYearStamp());
  const deleteYearBtn = document.getElementById("deleteYearBtn");
  if (deleteYearBtn) deleteYearBtn.addEventListener("click", () => toggleDeleteYearMode());
  { const b = document.getElementById("resetYearsBtn"); if (b) b.addEventListener("click", () => resetGuiYearEdits()); }
  // The old "Apply years to game" / "Remove from game" buttons are gone — Save Changes writes the year design
  // to the game automatically (see saveAllChanges + yearsDirty). #year-objects-are-editor-only: that is the
  // RULER model only. yearsDirty is set by saveYearOverrides/saveYearColsCustom, and resolveYearMarkersForApply
  // builds the POST body from getYearCols() alone — so the three buttons above stage editor-side state that
  // Save never writes. The panel says so; see the note in research.html and #year-objects at saveGuiYearPos.
  // removeYearsFromGame() is kept for potential reuse but is no longer wired to a button.
  updateYearLabelCountButton();
  { const b = document.getElementById("researchBgBtn"); if (b) b.addEventListener("click", () => toggleResearchBg()); }
  updateResearchBgButton();
  { const b = document.getElementById("showHiddenBtn"); if (b) b.addEventListener("click", () => toggleShowHiddenTechs()); }
  updateShowHiddenButton();
  { const b = document.getElementById("showBaseTechsBtn"); if (b) b.addEventListener("click", () => toggleShowBaseTechs()); }
  updateShowBaseButton();
  { const b = document.getElementById("researchSetBgBtn"), inp = document.getElementById("researchBgFileInput");
    if (b && inp) {
      b.addEventListener("click", () => inp.click());
      inp.addEventListener("change", () => { const f = inp.files && inp.files[0]; inp.value = ""; if (f) setFolderBackgroundImage(f); });
    } }
  { const b = document.getElementById("addTextBtn"); if (b) b.addEventListener("click", () => addResearchAnnotation()); }
  { const b = document.getElementById("guiLabelsBtn"); if (b) b.addEventListener("click", () => toggleGuiLabels()); }
  // Toolbar dropdown menus: the header's many buttons are grouped under a few "▾" triggers. Clicking a
  // trigger opens its panel (closing others); clicking an item or anywhere else closes it. The buttons
  // themselves keep their IDs, so every existing handler still fires unchanged.
  (function wireResearchToolbarMenus() {
    const menus = Array.from(document.querySelectorAll(".tb-menu"));
    menus.forEach((m) => {
      const trig = m.querySelector(".tb-menu-trigger");
      const panel = m.querySelector(".tb-menu-panel");
      if (!trig || !panel) return;
      trig.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = m.classList.contains("open");
        menus.forEach((x) => x.classList.remove("open"));
        if (!wasOpen) m.classList.add("open");
      });
      // A .tb-stay-open control (a stateful cycle/toggle whose label shows its value, e.g. "Year labels: 1"
      // → 2 → 3 → 4) keeps the menu open so it can be clicked repeatedly; one-shot items still close it. #stay-open
      panel.addEventListener("click", (e) => { if (e.target.closest(".tb-stay-open")) return; setTimeout(() => m.classList.remove("open"), 0); });
    });
    document.addEventListener("click", (e) => { if (e.target.closest(".tb-stay-open")) return; menus.forEach((m) => m.classList.remove("open")); });
  })();
  // Clicking empty canvas deselects the current label (tech-node clicks stopPropagation, so they don't).
  { const cc = document.getElementById("canvasContainer"); if (cc) cc.addEventListener("click", (e) => { if (e.target.closest(".research-annotation, .ann-toolbar, .ann-resize-handle, .year-marker-label, .year-toolbar")) return; clearAnnotationSelection(); clearYearSelection(); }); }

  // ── Canvas-size control (editor workspace sizing — mirrors the focus tree's Manual Workspace Sizing) ──
  (function wireResearchCanvasSize() {
    const btn = document.getElementById("researchCanvasSizeBtn");
    const panel = document.getElementById("researchCanvasSizePanel");
    const wIn = document.getElementById("researchCanvasWInput");
    const hIn = document.getElementById("researchCanvasHInput");
    const hint = document.getElementById("researchCanvasSizeHint");
    if (!btn || !panel || !wIn || !hIn) return;
    const key = () => `research_canvas_size_${getModPath() || "vanilla"}`;
    const persist = () => { try { if (researchCanvasWOverride || researchCanvasHOverride) localStorage.setItem(key(), JSON.stringify({ w: researchCanvasWOverride, h: researchCanvasHOverride })); else localStorage.removeItem(key()); } catch (_) {} };
    const updateHint = () => {
      const manual = !!(researchCanvasWOverride || researchCanvasHOverride);
      if (hint) hint.textContent = "Current: " + canvasNaturalW + " × " + canvasNaturalH + " px" + (manual ? " — manual" : " (auto-fit)");
      if (document.activeElement !== wIn) { wIn.value = researchCanvasWOverride ? String(researchCanvasWOverride) : ""; wIn.placeholder = String(canvasNaturalW); }
      if (document.activeElement !== hIn) { hIn.value = researchCanvasHOverride ? String(researchCanvasHOverride) : ""; hIn.placeholder = String(canvasNaturalH); }
    };
    window._researchUpdateCanvasSizeHint = updateHint; // renderCanvas refreshes the readout after any auto-resize
    const apply = () => { renderCanvas(); updateHint(); persist(); };
    btn.addEventListener("click", () => { const open = panel.style.display !== "none"; panel.style.display = open ? "none" : "block"; if (!open) updateHint(); });
    { const c = document.getElementById("researchCanvasSizeClose"); if (c) c.addEventListener("click", () => { panel.style.display = "none"; }); }
    const onInput = () => { researchCanvasWOverride = Math.max(0, parseInt(wIn.value, 10) || 0); researchCanvasHOverride = Math.max(0, parseInt(hIn.value, 10) || 0); apply(); };
    wIn.addEventListener("input", onInput);
    hIn.addEventListener("input", onInput);
    { const f = document.getElementById("researchCanvasFitBtn"); if (f) f.addEventListener("click", () => {
        // Snap the canvas to wrap the techs tightly on BOTH axes — width AND height (the content extent
        // was measured by the last render). Previously this only ever fit width.
        researchCanvasWOverride = Math.round(_researchContentW || canvasNaturalW);
        researchCanvasHOverride = Math.round(_researchContentH || canvasNaturalH);
        apply();
      }); }
    { const r = document.getElementById("researchCanvasResetBtn"); if (r) r.addEventListener("click", () => { researchCanvasWOverride = 0; researchCanvasHOverride = 0; apply(); }); }
    // load this mod's saved override so the first render already reflects it
    try { const j = JSON.parse(localStorage.getItem(key()) || "null"); if (j && (j.w || j.h)) { researchCanvasWOverride = +j.w || 0; researchCanvasHOverride = +j.h || 0; } } catch (_) {}
  })();

  // ── Background transform (IN-GAME): move + scale the current folder's background art by editing the mod's
  // countrytechtreeview.gui (server backs up + brace-checks). Lives in the canvas-size popover. ──
  (function wireResearchBgTransform() {
    const btn = document.getElementById("researchCanvasSizeBtn");
    const xIn = document.getElementById("researchBgXInput"), yIn = document.getElementById("researchBgYInput"), sIn = document.getElementById("researchBgScaleInput");
    const applyBtn = document.getElementById("researchBgApplyBtn");
    const status = document.getElementById("researchBgTransformStatus");
    const folderLabel = document.getElementById("researchBgFolderLabel");
    const fitRadio = document.getElementById("researchBgModeFit"), manualRadio = document.getElementById("researchBgModeManual");
    const manualBox = document.getElementById("researchBgManualControls");
    if (!btn || !xIn || !yIn || !sIn || !applyBtn) return;
    const currentFolder = () => (typeof currentVisibleFolders !== "undefined" && currentVisibleFolders && currentVisibleFolders[0]) || "";
    const getMode = () => (manualRadio && manualRadio.checked ? "manual" : "fit");
    const syncManualEnabled = () => { const on = getMode() === "manual"; if (manualBox) { manualBox.style.opacity = on ? "1" : "0.4"; manualBox.style.pointerEvents = on ? "auto" : "none"; } };
    // Push the current UI (mode + x/y/scale) into the per-folder preview cache + refresh the editor bg live.
    const pushPreview = () => {
      const folder = currentFolder(); if (!folder) return;
      if (!guiLayout[folder]) guiLayout[folder] = {};
      guiLayout[folder]._bg = { mode: getMode(), x: parseInt(xIn.value, 10) || 0, y: parseInt(yIn.value, 10) || 0, scale: Math.max(0.1, parseFloat(sIn.value) || 1) };
      applyResearchBgPreview();
    };
    const load = async () => {
      const folder = currentFolder();
      if (folderLabel) folderLabel.textContent = folder ? folder.replace(/_folder$/, "").replace(/_/g, " ") : "this folder";
      if (!folder) { if (status) status.textContent = "Open a folder tab first."; xIn.value = yIn.value = sIn.value = ""; return; }
      if (status) { status.textContent = ""; status.style.color = "#8b949e"; }
      try {
        const d = await fetch(`/api/research/folder-bg-transform?modPath=${encodeURIComponent(getModPath())}&folder=${encodeURIComponent(folder)}`).then((r) => r.json());
        if (d.ok && d.bg) {
          xIn.value = d.bg.x; yIn.value = d.bg.y; sIn.value = d.bg.scale;
          xIn.disabled = yIn.disabled = sIn.disabled = applyBtn.disabled = false;
          // Mode is DERIVED from the gui transform: any non-default value ⇒ manual; the vanilla-shaped
          // {0,0,1} ⇒ fit. This keeps the editor + game from ever disagreeing (no separate stored flag).
          const isManual = (Number(d.bg.x) || 0) !== 0 || (Number(d.bg.y) || 0) !== 0 || Math.abs((Number(d.bg.scale) || 1) - 1) > 1e-6;
          if (manualRadio) manualRadio.checked = isManual;
          if (fitRadio) fitRadio.checked = !isManual;
        } else {
          xIn.value = ""; yIn.value = ""; sIn.value = ""; xIn.disabled = yIn.disabled = sIn.disabled = applyBtn.disabled = true;
          if (fitRadio) fitRadio.checked = true; if (manualRadio) manualRadio.checked = false;
          if (status) status.textContent = "No background art yet — upload one with “Set bg…”.";
        }
      } catch (_) { if (status) status.textContent = "Couldn't read the background."; }
      syncManualEnabled(); pushPreview();
    };
    btn.addEventListener("click", () => { if (document.getElementById("researchCanvasSizePanel").style.display !== "none") load(); });
    [xIn, yIn, sIn].forEach((el) => el.addEventListener("input", pushPreview));
    [fitRadio, manualRadio].forEach((r) => { if (r) r.addEventListener("change", () => { if (getMode() === "fit") { xIn.value = "0"; yIn.value = "0"; sIn.value = "1"; } syncManualEnabled(); pushPreview(); }); });
    applyBtn.addEventListener("click", async () => {
      const folder = currentFolder();
      if (!folder) { if (status) status.textContent = "Open a folder tab first."; return; }
      const fit = getMode() === "fit";
      const x = parseInt(xIn.value, 10) || 0, y = parseInt(yIn.value, 10) || 0, scale = Math.max(0.1, parseFloat(sIn.value) || 1);
      if (status) { status.textContent = "Saving…"; status.style.color = "#8b949e"; }
      applyBtn.disabled = true;
      try {
        // FIT posts {fit:true} → the server writes the vanilla default {0 0}/scale-1 (the box-sized DDS fills
        // the viewport). MANUAL posts the exact X/Y/Scale.
        const body = fit ? { modPath: getModPath(), folder, fit: true } : { modPath: getModPath(), folder, x, y, scale };
        const d = await fetch("/api/research/folder-bg-transform", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
        if (!d.ok) throw new Error(d.error || "failed");
        if (status) { status.textContent = fit ? "✓ Fitted to the viewport (backed up). Reload the research screen in-game." : "✓ Applied to the game (backed up). Reload the research screen in-game."; status.style.color = "#3fb950"; }
      } catch (e) { if (status) { status.textContent = "Failed: " + e.message; status.style.color = "#f85149"; } }
      finally { applyBtn.disabled = false; }
    });
  })();

  // ── Folder VIEWPORT transform (IN-GAME): move + resize the current folder's container in countrytechtreeview.gui ──
  (function wireResearchFolderTransform() {
    const btn = document.getElementById("researchCanvasSizeBtn");
    const xIn = document.getElementById("researchFolderXInput"), yIn = document.getElementById("researchFolderYInput");
    const wIn = document.getElementById("researchFolderWInput"), hIn = document.getElementById("researchFolderHInput");
    const applyBtn = document.getElementById("researchFolderApplyBtn");
    const status = document.getElementById("researchFolderStatus");
    const label = document.getElementById("researchFolderLabel");
    if (!btn || !xIn || !yIn || !wIn || !hIn || !applyBtn) return;
    const currentFolder = () => (typeof currentVisibleFolders !== "undefined" && currentVisibleFolders && currentVisibleFolders[0]) || "";
    const load = async () => {
      const folder = currentFolder();
      if (label) label.textContent = folder ? folder.replace(/_folder$/, "").replace(/_/g, " ") : "folder";
      if (!folder) { if (status) status.textContent = "Open a folder tab first."; xIn.value = yIn.value = wIn.value = hIn.value = ""; return; }
      if (status) { status.textContent = ""; status.style.color = "#8b949e"; }
      try {
        const d = await fetch(`/api/research/folder-container-transform?modPath=${encodeURIComponent(getModPath())}&folder=${encodeURIComponent(folder)}`).then((r) => r.json());
        const c = d.ok && d.container;
        const disabled = !c;
        xIn.disabled = yIn.disabled = wIn.disabled = hIn.disabled = applyBtn.disabled = disabled;
        if (c) { xIn.value = c.x; yIn.value = c.y; wIn.value = String(c.width || "").replace(/%%$/, "%"); hIn.value = String(c.height || "").replace(/%%$/, "%"); }
        else { xIn.value = yIn.value = wIn.value = hIn.value = ""; if (status) status.textContent = "No folder container found."; }
      } catch (_) { if (status) status.textContent = "Couldn't read the folder."; }
    };
    btn.addEventListener("click", () => { if (document.getElementById("researchCanvasSizePanel").style.display !== "none") load(); });
    applyBtn.addEventListener("click", async () => {
      const folder = currentFolder();
      if (!folder) { if (status) status.textContent = "Open a folder tab first."; return; }
      const body = { modPath: getModPath(), folder, x: parseInt(xIn.value, 10) || 0, y: parseInt(yIn.value, 10) || 0, width: wIn.value.trim(), height: hIn.value.trim() };
      if (status) { status.textContent = "Saving…"; status.style.color = "#8b949e"; }
      applyBtn.disabled = true;
      try {
        const d = await fetch("/api/research/folder-container-transform", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
        if (!d.ok) throw new Error(d.error || "failed");
        if (status) { status.textContent = "✓ Applied to the game (backed up). Reload the research screen in-game to see it."; status.style.color = "#3fb950"; }
      } catch (e) { if (status) { status.textContent = "Failed: " + e.message; status.style.color = "#f85149"; } }
      finally { applyBtn.disabled = false; }
    });
  })();

  // ── Minimap toggle + navigation (bird's-eye of the whole tree; click/drag to jump) ──
  (function wireResearchMinimap() {
    const btn = document.getElementById("researchMinimapBtn");
    const cont = document.getElementById("canvasContainer");
    const cv = document.getElementById("researchMinimapCanvas");
    if (!btn || !cont || !cv) return;
    const key = () => `research_minimap_${getModPath() || "vanilla"}`;
    const setBtn = () => { btn.textContent = researchMinimapOn ? "🗺 Minimap ✓" : "🗺 Minimap"; btn.style.color = researchMinimapOn ? "#58a6ff" : ""; };
    try { researchMinimapOn = localStorage.getItem(key()) === "1"; } catch (_) {}
    setBtn(); drawResearchMinimap();
    btn.addEventListener("click", () => { researchMinimapOn = !researchMinimapOn; try { localStorage.setItem(key(), researchMinimapOn ? "1" : "0"); } catch (_) {} setBtn(); drawResearchMinimap(); });
    let rafPending = false;
    cont.addEventListener("scroll", () => { if (rafPending || !researchMinimapOn) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; drawResearchMinimap(); }); });
    let dragging = false;
    cv.addEventListener("mousedown", (e) => { dragging = true; navResearchMinimap(e.clientX, e.clientY); e.preventDefault(); });
    window.addEventListener("mousemove", (e) => { if (dragging) navResearchMinimap(e.clientX, e.clientY); });
    window.addEventListener("mouseup", () => { dragging = false; });
  })();

  const fixLayoutBtn = document.getElementById("fixLayoutBtn");
  if (fixLayoutBtn) {
    fixLayoutBtn.addEventListener("click", async () => {
      const modPath = localStorage.getItem("activeModPath") || "";
      fixLayoutBtn.disabled = true;
      const original = fixLayoutBtn.textContent;
      fixLayoutBtn.textContent = "Fixing...";
      try {
        // If the active tab is a CUSTOM folder, tell the backend its orientation + year ruler so it
        // lays the techs out on a clean grid (matching this tab) WITH year labels. The backend places
        // deterministically from the tech coords, so it stays consistent across later saves. Standard
        // MD/vanilla tabs fall back to the default repair.
        let folderKey = null, orientation = "horizontal", years = null;
        try {
          const folder = (getActiveFoldersForTab(activeTab) || [])[0];
          const isStandard = Object.values(STANDARD_TABS || {}).some((t) => (t.folders || []).includes(folder));
          if (folder && !isStandard && allTechs.some((t) => t.folder === folder)) {
            folderKey = folder;
            orientation = (typeof getActiveLayout === "function" ? getActiveLayout() : "horizontal") === "vertical" ? "vertical" : "horizontal";
            years = {};
            (typeof getYearCols === "function" ? getYearCols() : []).forEach((c) => { if (c && c.year != null) years[c.y] = c.year; });
          }
        } catch (_) { folderKey = null; }

        const body = folderKey ? { modPath, folderKey, orientation, years } : { modPath };
        const resp = await fetch("/api/research/fix-tree-layout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || "Request failed");
        const folders = (data.folders || []).filter((f) => !f.error);
        if (!folders.length) {
          nbAlert("No custom research tabs found in this mod, so there's nothing to fix. (This only applies to research tabs you added yourself.)");
        } else if (folderKey) {
          nbAlert(`Laid out "${folderKey}" on a clean ${orientation} grid with year labels (${folders[0].techCount || 0} techs).\n\nLaunch the mod — the techs now sit in tidy columns with the year shown above each one.`);
        } else {
          const names = folders.map((f) => `• ${f.folder}: ${f.techCount} tech${f.techCount === 1 ? "" : "s"}`).join("\n");
          nbAlert(`Fixed the in-game grid layout for your custom research tab(s):\n\n${names}\n\nTip: open a custom tab before clicking to match its on-screen layout pixel-for-pixel.`);
        }
      } catch (err) {
        nbAlert("Couldn't fix the tab layout: " + err.message);
      } finally {
        fixLayoutBtn.disabled = false;
        fixLayoutBtn.textContent = original;
      }
    });
  }

  // "Fix Tech Icons": register GFX_<tech>_medium sprites for techs you've given a picture, so they
  // show their icon in-game instead of the green-circle placeholder. (Saving techs also does this.)
  const fixIconsBtn = document.getElementById("fixIconsBtn");
  if (fixIconsBtn) {
    fixIconsBtn.addEventListener("click", async () => {
      const modPath = localStorage.getItem("activeModPath") || "";
      fixIconsBtn.disabled = true;
      const original = fixIconsBtn.textContent;
      fixIconsBtn.textContent = "Fixing...";
      try {
        const resp = await fetch("/api/research/fix-tech-icons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modPath }),
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || "Request failed");
        if (data.registered > 0) {
          nbAlert(`Registered icons for ${data.registered} tech${data.registered === 1 ? "" : "s"}.\n\nLaunch the mod — those techs now show their picture instead of the placeholder.`);
        } else {
          nbAlert("No tech icons to register yet.\n\nPick a picture on a tech first (then it appears in-game). Techs without a chosen picture keep the default placeholder.");
        }
      } catch (err) {
        nbAlert("Couldn't register tech icons: " + err.message);
      } finally {
        fixIconsBtn.disabled = false;
        fixIconsBtn.textContent = original;
      }
    });
  }

  window.__focusEditorSaveBeforeExit = async () => {
    if (!dirty) return true;
    return await saveAllChanges();
  };

  // AI Generator integration
  const generateAiBtn = document.getElementById("generateAiBtn");
  const aiPrompt = document.getElementById("aiPrompt");
  const aiStatus = document.getElementById("aiStatus");
  
  if (generateAiBtn) {
    generateAiBtn.addEventListener("click", async () => {
      const promptText = aiPrompt.value.trim();
      if (!promptText) return;
      
      aiStatus.textContent = "AI generating details...";
      aiStatus.style.color = "#a88be6";
      generateAiBtn.disabled = true;
      
      const storedKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey");
      const systemPrompt = `You are a Master-Level Hearts of Iron IV (HOI4) Modding AI.
Your purpose is to translate user requests into technology and corresponding equipment parameters.
You MUST output ONLY a valid JSON object. Do NOT wrap the JSON in markdown code blocks. Do not include any explanations.
The JSON object must have this exact structure:
{
  "name": "Advanced Infantry Weapons",
  "description": "Description...",
  "researchCost": 1.5,
  "startYear": 1940,
  "modifiers": "infantry_defend = 0.10\\ninfantry_attack = 0.05",
  "extraScript": "enable_subunits = {\\n  infantry\\n}",
  "equipment": {
    "id": "infantry_equipment_2",
    "archetype": "infantry_equipment",
    "buildCostIc": 0.55,
    "softAttack": 9.0,
    "hardAttack": 1.5,
    "defense": 28.0,
    "breakthrough": 4.0,
    "apAttack": 5.0,
    "reliability": 0.90,
    "resources": "steel = 3"
  }
}`;

      try {
        const response = await fetch("/api/ai/logic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptText,
            systemPrompt,
            modPath: localStorage.getItem("activeModPath") || "",
            apiKey: storedKey || ""
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        const parsed = window.NovaAI.parseJsonResponse(data.script);

        // Fill form fields
        document.getElementById("techName").value = parsed.name || "";
        document.getElementById("techDesc").value = parsed.description || "";
        document.getElementById("techCost").value = parsed.researchCost || 1.5;
        document.getElementById("techYear").value = parsed.startYear || 1936;
        document.getElementById("techModifiers").value = parsed.modifiers || "";
        if (window.__novaRefreshTechModifiers) window.__novaRefreshTechModifiers();
        document.getElementById("techExtraScript").value = stripCountryLock(parsed.extraScript || "");
        { const _lt = extractCountryLock(parsed.extraScript || ""); const _ls = document.getElementById("techCountryLock");
          if (_ls) { if (_lt && !Array.prototype.some.call(_ls.options, (o) => o.value === _lt)) { const _o = document.createElement("option"); _o.value = _lt; _o.textContent = _lt; _ls.appendChild(_o); } _ls.value = _lt; } }

        if (parsed.equipment) {
          document.getElementById("enableEquipment").checked = true;
          document.getElementById("equipmentSection").style.display = "block";
          document.getElementById("equipId").value = parsed.equipment.id || "";
          document.getElementById("equipArchetype").value = parsed.equipment.archetype || "";
          document.getElementById("equipCost").value = parsed.equipment.buildCostIc || "";
          document.getElementById("equipSoftAttack").value = parsed.equipment.softAttack || "";
          document.getElementById("equipHardAttack").value = parsed.equipment.hardAttack || "";
          document.getElementById("equipDefense").value = parsed.equipment.defense || "";
          document.getElementById("equipBreakthrough").value = parsed.equipment.breakthrough || "";
          document.getElementById("equipApAttack").value = parsed.equipment.apAttack || "";
          document.getElementById("equipReliability").value = parsed.equipment.reliability || "";
          document.getElementById("equipResources").value = parsed.equipment.resources || "";
        }
        
        aiStatus.textContent = "Generated successfully! Previewing modifications.";
        aiStatus.style.color = "#2ea043";
        syncForm();
        renderCanvas();
      } catch (err) {
        aiStatus.textContent = "AI Error: " + err.message;
        aiStatus.style.color = "#da3633";
      } finally {
        generateAiBtn.disabled = false;
      }
    });
  }

  // Upload image logic
  const techIconUpload = document.getElementById("techIconUpload");
  const techUploadBtn = document.getElementById("techUploadBtn");
  
  if (techUploadBtn && techIconUpload) {
    techUploadBtn.addEventListener("click", () => {
      techIconUpload.click();
    });
    
    techIconUpload.addEventListener("change", async (e) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append("image", file);
      
      const techIdVal = document.getElementById("techId").value || "custom_tech";
      formData.append("name", techIdVal);
      formData.append("type", "technology");
      
      const modPath = getModPath();
      if (modPath) formData.append("modPath", modPath);
      
      const preview = document.getElementById("techIconPreview");
      preview.innerHTML = `<span style="font-size: 10px; color: #8b949e;">Converting...</span>`;
      
      try {
        const response = await fetch("/api/upload-gfx", {
          method: "POST",
          body: formData
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        document.getElementById("techIconId").value = data.spriteName;

        const objectUrl = URL.createObjectURL(file);
        preview.innerHTML = `<img src="${objectUrl}" alt="Icon" />`;

        syncForm(); // writes tech.iconKey from the field
        // Refresh the node icon so it shows the JUST-uploaded picture. syncForm only updates iconKey, but
        // resolveIconSrc prefers tech.iconUrl — leaving the node on the OLD (or a country-variant that
        // falls back to the beige placeholder) picture until a reload. Point iconUrl at the new sprite with
        // a cache-bust (re-uploading the same sprite name reuses the URL, so the browser would serve stale).
        const upT = allTechs.find((x) => x.id === selectedTechId);
        if (upT) upT.iconUrl = `/api/icon-image?key=${encodeURIComponent(data.spriteName)}&modPath=${encodeURIComponent(getModPath())}&_t=${Date.now()}`;
        renderCanvas();
      } catch (err) {
        preview.innerHTML = `<span style="font-size: 10px; color: #da3633;">Error</span>`;
        nbAlert("Upload failed: " + err.message);
      }
    });
  }

  // Browse Icons Modal Logic
  const techBrowseBtn = document.getElementById("techBrowseBtn");
  const iconPickerModal = document.getElementById("iconPickerModal");
  const closeIconPicker = document.getElementById("closeIconPicker");
  const iconPickerSearch = document.getElementById("iconPickerSearch");
  const iconPickerGrid = document.getElementById("iconPickerGrid");

  let allVanillaSprites = null;
  let currentFilteredSprites = [];
  let renderedCount = 0;
  // Small first batch + fill-until-scrollable (below). Rendering all sprites fired ~120 DDS→PNG conversions
  // at once via /api/buildings/icon-file (native loading="lazy" is viewport-relative, so it doesn't defer).
  const BATCH_SIZE = 24;

  function renderNextBatch() {
    if (!currentFilteredSprites) return;
    const batch = currentFilteredSprites.slice(renderedCount, renderedCount + BATCH_SIZE);
    const fragment = document.createDocumentFragment();

    batch.forEach(sprite => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "icon-picker-item";
      itemDiv.setAttribute("data-key", sprite.key);
      itemDiv.style.cssText = "display: flex; flex-direction: column; align-items: center; justify-content: center; background: #161b22; border: 1px solid #30363d; padding: 12px; border-radius: 8px; cursor: pointer; transition: all 0.2s; text-align: center;";

      itemDiv.innerHTML = `
        <img src="/api/buildings/icon-file?path=${encodeURIComponent(sprite.texturefile)}" alt="Icon" loading="lazy" style="width: 48px; height: 48px; object-fit: contain; margin-bottom: 8px;" data-fallback="/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds" />
        <span style="font-size: 10px; color: #8b949e; word-break: break-all; font-family: monospace;">${sprite.key.replace(/^GFX_/, "").replace(/_medium$/, "")}</span>
      `;

      itemDiv.addEventListener("mouseenter", () => {
        itemDiv.style.background = "#21262d";
        itemDiv.style.borderColor = "#58a6ff";
      });
      itemDiv.addEventListener("mouseleave", () => {
        itemDiv.style.background = "#161b22";
        itemDiv.style.borderColor = "#30363d";
      });

      itemDiv.addEventListener("click", () => {
        document.getElementById("techIconId").value = sprite.key;
        syncForm(); // writes tech.iconKey from the field + marks the tech dirty so it's saved
        // Preview with the SAME endpoint the canvas uses, so the sidebar matches the node instead of
        // staying on "?" — the buildings icon-file endpoint couldn't render some tech sprites.
        const iconUrl = `/api/icon-image?key=${encodeURIComponent(sprite.key)}&modPath=${encodeURIComponent(getModPath())}${activeCountryTag ? `&country=${activeCountryTag}` : ""}`;
        updateIconPreview(iconUrl, "techIconPreview");
        // Refresh the node icon too: syncForm updated iconKey but resolveIconSrc prefers the stale iconUrl,
        // so the node would keep the OLD picture until reload. Point it at the picked sprite with a cache-bust
        // (re-picking a sprite whose .dds was overwritten earlier this session would otherwise show the stale
        // browser-cached image, since the same key→same URL).
        const pkT = allTechs.find((x) => x.id === selectedTechId);
        if (pkT) pkT.iconUrl = iconUrl + "&_t=" + Date.now();
        renderCanvas();
        iconPickerModal.style.display = "none";
      });

      fragment.appendChild(itemDiv);
    });

    iconPickerGrid.appendChild(fragment);
    renderedCount += batch.length;
    // Fill just enough to make the grid scrollable (so scroll-to-load-more takes over) — never all at once.
    if (renderedCount < currentFilteredSprites.length && renderedCount < 96 && iconPickerGrid.clientHeight > 0 && iconPickerGrid.scrollHeight <= iconPickerGrid.clientHeight + 40) requestAnimationFrame(renderNextBatch);
  }

  function handleSearch() {
    const val = iconPickerSearch.value.toLowerCase().trim();
    if (!allVanillaSprites) return;

    currentFilteredSprites = allVanillaSprites.filter(sprite =>
      sprite.key.toLowerCase().includes(val)
    );

    iconPickerGrid.innerHTML = "";
    renderedCount = 0;

    if (currentFilteredSprites.length === 0) {
      iconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">No icons found.</div>`;
    } else {
      renderNextBatch();
    }
  }

  if (techBrowseBtn) {
    techBrowseBtn.addEventListener("click", async () => {
      iconPickerModal.style.display = "block";
      iconPickerSearch.value = "";
      setTimeout(() => { try { iconPickerSearch.focus(); } catch (_) {} }, 0); // type to search at once

      if (allVanillaSprites !== null) {
        handleSearch();
        iconPickerGrid.scrollTop = 0;
        return;
      }

      iconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">Scanning game files for tech icons...</div>`;

      try {
        const activeRoot = getModPath();
        // Tech/equipment icons are the "_medium"/"_small" picture sprites (weapons, tanks, planes…),
        // served by the dedicated "tech" sprite type. The old code pulled IDEA sprites and then kept
        // only a handful by name — which is why the browser showed "only a few, none are weapons".
        const res = await fetch(`/api/sprites?type=tech&modPath=${encodeURIComponent(activeRoot)}`);
        const data = await res.json();
        allVanillaSprites = data.sprites || [];

        handleSearch();
        iconPickerGrid.scrollTop = 0;
      } catch (err) {
        iconPickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #da3633; text-align: center;">Error: ${err.message}</div>`;
      }
    });

    iconPickerGrid.addEventListener("scroll", () => {
      if (iconPickerGrid.scrollTop + iconPickerGrid.clientHeight >= iconPickerGrid.scrollHeight - 60) {
        if (renderedCount < currentFilteredSprites.length) {
          renderNextBatch();
        }
      }
    });

    if (closeIconPicker) {
      closeIconPicker.addEventListener("click", () => {
        iconPickerModal.style.display = "none";
      });
    }
    // Dismiss the picker the way everyone tries: click the dim backdrop (outside .modal-content) or press
    // Escape — not only the ✕ (matches the other makers' pickers).
    iconPickerModal.addEventListener("mousedown", (e) => { if (e.target === iconPickerModal) iconPickerModal.style.display = "none"; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && getComputedStyle(iconPickerModal).display !== "none") iconPickerModal.style.display = "none"; });

    if (iconPickerSearch) {
      iconPickerSearch.addEventListener("input", handleSearch);
    }
  }

  // Custom Tab Modal Handlers
  const customTabModal = document.getElementById("customTabModal");
  const closeCustomTabModal = document.getElementById("closeCustomTabModal");
  const cancelCustomTabBtn = document.getElementById("cancelCustomTabBtn");
  const confirmCustomTabBtn = document.getElementById("confirmCustomTabBtn");
  const customTabNameInput = document.getElementById("customTabNameInput");
  const customTabLayoutSelect = document.getElementById("customTabLayoutSelect");
  const customTabLedgerSelect = document.getElementById("customTabLedgerSelect");
  const customTabIconInput = document.getElementById("customTabIconInput");

  // Edit-an-existing-tab state. When set, the custom-tab modal is in EDIT mode (re-icon / rename /
  // re-ledger the active tab) instead of CREATE mode.
  let editingTabKey = null;
  let editingTabFolder = null;
  // #tab-edit-clobbers-ledger — a base-game or base-mod folder has no `ct`, so the dropdown used to
  // fall back to "army" whatever the folder really was. Saving an ICON change then posted ledger:"army"
  // and the server rewrote the copied base block, moving that whole tab into the wrong research-bonus
  // group: `research_bonus = { navy = … }` from ideas, focuses and advisors stopped applying to it.
  // The server now publishes each folder's real ledger, so the dialog can show the truth and a
  // round-trip preserves it. Exactly the sibling of #tab-name-not-the-game-s, which fixed the same shape
  // for the tab NAME.
  function baseFolderLedger(folderKey) {
    const meta = guiFolderAvailability && guiFolderAvailability[folderKey];
    return (meta && meta.ledger) || "";
  }
  function openTabEditor(tabKey) {
    if (!tabKey) { nbAlert("Select a tab first."); return; }
    const ct = customTabs.find((t) => t.key === tabKey);
    const folders = getActiveFoldersForTab(tabKey);
    editingTabFolder = (ct && ct.folder) || folders[0];
    if (!editingTabFolder) { nbAlert("This tab has no editable folder."); return; }
    editingTabKey = tabKey;
    // Prefill with the name the GAME shows, not one title-cased out of the folder key. Otherwise opening this
    // dialog on vanilla's electronics_folder offered "Electronics" and saving wrote that over the game's
    // "Engineering" — the dialog corrupting the very thing it exists to edit. #tab-name-not-the-game-s
    if (customTabNameInput) customTabNameInput.value = ct ? ct.name : gameFolderName(editingTabFolder);
    // The folder's REAL ledger for a base tab, not a blanket "army". #tab-edit-clobbers-ledger
    if (customTabLedgerSelect) customTabLedgerSelect.value = (ct && ct.ledger) || baseFolderLedger(editingTabFolder) || "army";
    if (customTabLayoutSelect) customTabLayoutSelect.value = (ct && ct.layout) || "horizontal";
    if (customTabIconInput) customTabIconInput.value = "";
    if (confirmCustomTabBtn) confirmCustomTabBtn.textContent = "Save Changes";
    const titleEl = document.getElementById("customTabModalTitle");
    if (titleEl) titleEl.textContent = `Edit Tab: ${customTabNameInput ? customTabNameInput.value : tabKey}`;
    if (customTabModal) { customTabModal.style.display = "block"; setTimeout(() => customTabNameInput && customTabNameInput.focus(), 0); }
  }

  if (customTabLayoutSelect) {
    customTabLayoutSelect.addEventListener("change", () => {
      if (customTabNameInput) {
        setTimeout(() => customTabNameInput.focus(), 50);
      }
    });
  }

  if (closeCustomTabModal) {
    closeCustomTabModal.addEventListener("click", () => {
      editingTabKey = null; editingTabFolder = null;
      customTabModal.style.display = "none";
    });
  }
  if (cancelCustomTabBtn) {
    cancelCustomTabBtn.addEventListener("click", () => {
      editingTabKey = null; editingTabFolder = null;
      customTabModal.style.display = "none";
    });
  }
  if (confirmCustomTabBtn) {
    confirmCustomTabBtn.addEventListener("click", async () => {
      // ── EDIT MODE: update an existing tab's icon / name / ledger ───────────────────────────────
      if (editingTabKey) {
        const folder = editingTabFolder;
        const modPath = getModPath();
        const newName = customTabNameInput ? customTabNameInput.value.trim() : "";
        const newLedger = customTabLedgerSelect ? customTabLedgerSelect.value : "army";
        const iconFile = customTabIconInput && customTabIconInput.files && customTabIconInput.files[0];
        const ct = customTabs.find((t) => t.key === editingTabKey);
        // A base-game tab used to be editable ONLY by uploading an icon, so its in-game NAME could not be
        // changed at all — "no way to name it", which was literally true. A name on its own is enough now.
        if (!iconFile && !ct && !newName) { nbAlert("Type a name, or pick a new icon, to change this tab."); return; }
        const origLabel = confirmCustomTabBtn.textContent;
        confirmCustomTabBtn.disabled = true; confirmCustomTabBtn.textContent = "Saving…";
        try {
          let tabDdsPath = "";
          if (iconFile) {
            const fd = new FormData();
            fd.append("image", iconFile); fd.append("type", "tab");
            fd.append("name", `${folder.replace(/_folder$/, "")}_tab`);
            if (modPath) fd.append("modPath", modPath);
            const upData = await (await fetch("/api/upload-gfx", { method: "POST", body: fd })).json();
            if (upData.error) throw new Error("Icon upload failed: " + upData.error);
            tabDdsPath = upData.ddsPath || "";
          }
          // A RENAME HAS TO REACH THE GAME (#tab-rename-never-localised). This used to run ONLY when a new
          // icon was picked, on the reasoning that a name/ledger edit is "just local config". It is not:
          // HOI4 reads a tab's name from the loc key `<folderKey>`, which only this call writes. So renaming
          // a tab relabelled it in the editor and in editor_custom_tabs.json while the game kept the old
          // name forever — the editor and the game disagreeing with no way to reconcile them.
          //
          // The same gate stranded the LEDGER, which is worse than it sounds: server.js already carries a
          // fix for exactly the "editor showed Air, the game showed Navy" symptom, and that fix was
          // unreachable from this dialog.
          //
          // Safe to call without an icon: the endpoint is idempotent (both upserts), and
          // ensureResearchTabSprite returns a default sprite key when tabDdsPath is "" rather than writing
          // anything. Verified: name+ledger with an empty tabDdsPath answers 200 and writes the loc key.
          // Compare against what is actually on the tab now. For a base-game tab there is no `ct`, and
          // comparing against "" reported a change on every open — so an untouched Save Changes rewrote the
          // name each time and then told the user it had. #tab-name-not-the-game-s
          const currentName = ct ? (ct.name || "") : gameFolderName(folder);
          const nameChanged = !!newName && newName !== currentName;
          // The SAME fallback the dropdown was filled with at line ~7065 — `|| "army"`, not `|| ""`. With the
          // two out of step, a tab that has no stored ledger reported "army" !== "" on every open, so Save
          // Changes always wrote even when the user changed nothing, and for a mod with no
          // countrytechtreeview.gui that first pointless save also copied one in. #tab-rename-never-localised
          // The SAME fallback chain as the prefill above, or the two go out of step and every open reports
          // a change — the bug #tab-rename-never-localised describes, one field along.
          const ledgerChanged = newLedger !== ((ct && ct.ledger) || baseFolderLedger(folder) || "army");
          // RENAMING A BASE-GAME TAB MUST NOT GO THROUGH create-custom-folder. That endpoint also writes the
          // folder into the mod's zz_nova_custom_folders.txt, and being listed there is exactly what makes
          // syncCustomFolderGridboxes willing to relayout a folder — i.e. "saving ruined the electronics
          // tree". A tab that is not one of this mod's own custom tabs gets the loc key written and nothing
          // else. Icon and ledger edits keep their existing path, unchanged. #tab-name-not-the-game-s
          if (!ct && !tabDdsPath && !ledgerChanged && nameChanged) {
            const res = await fetch("/api/research/set-folder-name", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folderKey: folder, name: newName, modPath }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || "Failed to rename the tab.");
            guiFolderNames[folder] = newName; // so the strip updates without a reload
          } else if (tabDdsPath || nameChanged || ledgerChanged) {
            const res = await fetch("/api/research/create-custom-folder", {
              method: "POST", headers: { "Content-Type": "application/json" },
              // #tab-edit-clobbers-ledger — send the ledger ONLY when the user actually changed it.
              //
              // The server already has the escape hatch: it only rewrites the copied base block when the
              // value is one of army/navy/air/civilian, and leaves it alone otherwise. Sending the dropdown's
              // value unconditionally is what wrote `ledger = army` over a base folder during an ICON edit.
              //
              // This also covers the two cases the dropdown cannot express at all: a folder that declares
              // NO ledger (Millennium Dawn has three) had one invented for it, and `ledger = hidden` has no
              // option here. Not sending the field leaves either exactly as the base game wrote it.
              body: JSON.stringify({ folderKey: folder, ledger: ledgerChanged ? newLedger : "", tabDdsPath, modPath, name: newName }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || "Failed to update the tab.");
            // Only the icon map needs re-reading, and only when an icon actually changed.
            if (tabDdsPath) await loadFolderTabs();
          }
          if (ct) {
            if (newName) ct.name = newName;
            ct.ledger = newLedger;
            localStorage.setItem(`custom_research_tabs_${modPath}`, JSON.stringify(customTabs));
          }
          customTabModal.style.display = "none";
          if (customTabIconInput) customTabIconInput.value = "";
          editingTabKey = null; editingTabFolder = null;
          renderTabs(); renderCanvas();
          // Say what actually reached the mod, so a rename does not look like an editor-only change.
          const wrote = [nameChanged && "name", ledgerChanged && "research ledger", tabDdsPath && "icon"].filter(Boolean);
          nbAlert(`Tab saved.${wrote.length ? ` The ${wrote.join(", ")} ${wrote.length === 1 ? "was" : "were"} written to your mod — reload it in-game to see the change there too.` : ""}`);
        } catch (err) {
          nbAlert(err.message || String(err));
        } finally {
          confirmCustomTabBtn.disabled = false; confirmCustomTabBtn.textContent = origLabel;
        }
        return;
      }

      const name = customTabNameInput ? customTabNameInput.value.trim() : "";
      if (!name) {
        if (window.showNovaInfoModal) window.showNovaInfoModal("Tab name needed", "Please type a name for your research tab before creating it.", "customTabNameInput");
        else nbAlert("Please enter a tab name.");
        return;
      }
      const layout = customTabLayoutSelect ? customTabLayoutSelect.value : "horizontal";
      const ledger = customTabLedgerSelect ? customTabLedgerSelect.value : "army";

      // folderKey must be valid HOI4 (lowercase/digits/underscore). Collapse runs of separators.
      let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      // HOI4 identifiers may NOT start with a digit or '-' (lexer.cpp:194). A tab named e.g. "21" would make
      // the folder id "21_folder", which the game rejects — dropping the whole research tab. Prefix a letter.
      if (/^[0-9]/.test(slug)) slug = "t" + slug;
      if (!slug) {
        if (window.showNovaInfoModal) window.showNovaInfoModal("Tab name needs a letter or number", "Your tab name must contain at least one letter or number (it becomes the folder's internal id).", "customTabNameInput");
        else nbAlert("Please use a tab name with at least one letter or number.");
        return;
      }
      const key = `custom_tab_${slug}_${Date.now()}`;
      const folder = `${slug}_folder`;
      const modPath = getModPath();

      const origLabel = confirmCustomTabBtn.textContent;
      confirmCustomTabBtn.disabled = true;
      confirmCustomTabBtn.textContent = "Creating…";
      try {
        // 1. Optional icon: upload PNG/JPG -> DDS, get its absolute path back.
        let tabDdsPath = "";
        const iconFile = customTabIconInput && customTabIconInput.files && customTabIconInput.files[0];
        if (iconFile) {
          const fd = new FormData();
          fd.append("image", iconFile);
          fd.append("type", "tab");
          fd.append("name", `${slug}_tab`);
          if (modPath) fd.append("modPath", modPath);
          const upRes = await fetch("/api/upload-gfx", { method: "POST", body: fd });
          const upData = await upRes.json();
          if (upData.error) throw new Error("Icon upload failed: " + upData.error);
          tabDdsPath = upData.ddsPath || "";
        }

        // 2. Scaffold the real folder def + GUI container + tab button + sprite into the mod (name → the
        //    tab's display-name loc, so the tab shows "Space Tech" not the raw "space_tech_folder").
        const res = await fetch("/api/research/create-custom-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderKey: folder, ledger, tabDdsPath, modPath, name }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "Failed to create the research tab.");

        // 3. Only now reflect it in the editor (so a failed scaffold never shows a phantom tab).
        customTabs.push({ name, key, folder, layout, ledger });
        localStorage.setItem(`custom_research_tabs_${modPath}`, JSON.stringify(customTabs));
        markDirty();
        activeTab = key;
        selectedTechId = null;
        if (customTabModal) customTabModal.style.display = "none";
        if (customTabIconInput) customTabIconInput.value = "";
        renderTabs();
        renderCanvas();
        updateSidebar();
        if (window.showNovaInfoModal) window.showNovaInfoModal("Tab created", `Research tab “${name}” created. Load your mod and open the research tree in-game to see it — add techs to this tab here in the editor.`);
        else nbAlert(`Research tab "${name}" created.`);
      } catch (err) {
        if (window.showNovaInfoModal) window.showNovaInfoModal("Couldn’t create the tab", err.message || String(err));
        else nbAlert(err.message || String(err));
      } finally {
        confirmCustomTabBtn.disabled = false;
        confirmCustomTabBtn.textContent = origLabel;
      }
    });
  }

  // Deselect button
  const deselectBtn = document.getElementById("deselectBtn");
  if (deselectBtn) {
    deselectBtn.addEventListener("click", () => {
      selectedTechId = null;
      updateSidebar();
      renderCanvas();
    });
  }

  const orientationToggleBtn = document.getElementById("orientationToggleBtn");
  if (orientationToggleBtn) {
    // Orientation is a UI-only override saved to localStorage (not the mod file), so flipping
    // it must NOT mark the file dirty / trigger a save prompt.
    orientationToggleBtn.addEventListener("click", () => { toggleActiveLayout(); });
  }

  // 🎮 DLC filter — open/close the panel; clicks outside close it. The checkboxes are (re)built by
  // renderDlcFilter() and carry their own change handlers.
  const dlcFilterBtn = document.getElementById("dlcFilterBtn");
  const dlcFilterPanel = document.getElementById("dlcFilterPanel");
  if (dlcFilterBtn && dlcFilterPanel) {
    dlcFilterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dlcFilterPanel.style.display = dlcFilterPanel.style.display === "none" ? "block" : "none";
    });
    document.addEventListener("click", (e) => {
      if (dlcFilterPanel.style.display !== "none" && !dlcFilterPanel.contains(e.target) && e.target !== dlcFilterBtn) {
        dlcFilterPanel.style.display = "none";
      }
    });
  }

  // "✎ Edit Tab" — opens the tab editor for the ACTIVE tab so you can change its icon, name, or
  // ledger. (Adding a new tab is the in-strip "+ Custom Tab" button; this used to be a duplicate
  // "add" button, which the user rightly found confusing.)
  const openCustomTabBtn = document.getElementById("openCustomTabBtn");
  if (openCustomTabBtn) {
    openCustomTabBtn.addEventListener("click", () => openTabEditor(activeTab));
  }

  // ── Tech search: type a name/id, click a result to jump straight to that tech ──────────────
  const techSearchInput = document.getElementById("techSearchInput");
  const techSearchResults = document.getElementById("techSearchResults");
  function jumpToTech(techId) {
    const tech = allTechs.find((t) => t.id === techId);
    if (!tech) return;
    const tabKey = getTabForFolder(tech.folder);
    if (tabKey && tabKey !== activeTab) { activeTab = tabKey; renderTabs(); }
    selectedTechId = techId;
    renderCanvas();
    updateSidebar();
    // After the canvas re-renders, scroll the node into the centre and flash it.
    setTimeout(() => {
      const node = document.querySelector(`.tech-node[data-id="${(window.CSS && CSS.escape) ? CSS.escape(techId) : techId}"]`);
      const container = document.getElementById("canvasContainer");
      if (node && container) {
        const left = (parseFloat(node.style.left) || 0) * researchZoom;
        const top = (parseFloat(node.style.top) || 0) * researchZoom;
        container.scrollLeft = Math.max(0, left - container.clientWidth / 2);
        container.scrollTop = Math.max(0, top - container.clientHeight / 2);
        node.classList.add("search-flash");
        setTimeout(() => node.classList.remove("search-flash"), 1600);
      }
    }, 40);
  }
  function renderTechSearch() {
    if (!techSearchInput || !techSearchResults) return;
    const q = techSearchInput.value.trim().toLowerCase();
    if (q.length < 2) { techSearchResults.style.display = "none"; techSearchResults.innerHTML = ""; return; }
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const matches = allTechs
      .filter((t) => !t.isSubTech && (((t.name || "").toLowerCase().includes(q)) || t.id.toLowerCase().includes(q)))
      .slice(0, 40);
    if (!matches.length) {
      techSearchResults.innerHTML = `<div style="padding:8px 10px; color:#8b949e; font-size:12px;">No matching tech.</div>`;
      techSearchResults.style.display = "block";
      return;
    }
    techSearchResults.innerHTML = matches.map((t) => {
      const nm = (t.name && t.name !== t.id) ? t.name : t.id;
      return `<div class="tech-search-row" data-id="${esc(t.id)}" style="padding:7px 10px; cursor:pointer; border-bottom:1px solid #161b22;">
        <div style="color:#e6edf3; font-size:12px;">${esc(nm)}</div>
        <div style="color:#6e7681; font-family:monospace; font-size:10px;">${esc(t.id)} · ${esc(t.folder || "")}</div>
      </div>`;
    }).join("");
    techSearchResults.style.display = "block";
    techSearchResults.querySelectorAll(".tech-search-row").forEach((row) => {
      row.addEventListener("mouseenter", () => { row.style.background = "#161b22"; });
      row.addEventListener("mouseleave", () => { row.style.background = ""; });
      row.addEventListener("click", () => {
        techSearchResults.style.display = "none";
        techSearchInput.value = "";
        jumpToTech(row.dataset.id);
      });
    });
  }
  if (techSearchInput) {
    techSearchInput.addEventListener("input", renderTechSearch);
    techSearchInput.addEventListener("focus", renderTechSearch);
    techSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const first = techSearchResults && techSearchResults.querySelector(".tech-search-row"); if (first) first.click(); }
      else if (e.key === "Escape") { techSearchResults.style.display = "none"; techSearchInput.blur(); }
    });
    document.addEventListener("click", (e) => {
      if (techSearchResults && !techSearchInput.contains(e.target) && !techSearchResults.contains(e.target)) techSearchResults.style.display = "none";
    });
  }

  // True only when the event target is a field the user is genuinely TYPING into — a text-like input,
  // textarea, or contentEditable. A focused <select> (the mod/country/folder dropdowns keep focus after
  // a pick) is deliberately NOT counted: it used to swallow Z/X so canvas zoom silently died until you
  // clicked away or restarted. We preventDefault on the zoom keys, so a select sees no stray type-ahead.
  const TEXT_INPUT_TYPES = /^(text|search|number|email|url|tel|password|)$/i; // "" = <input> with no type
  function isTextEntryTarget(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName ? t.tagName.toUpperCase() : "";
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") return TEXT_INPUT_TYPES.test(t.getAttribute("type") || "");
    return false;
  }
  try { window.__novaIsTextEntryTarget = isTextEntryTarget; } catch (_) {}

  // Canvas zoom: buttons + Z (out) / X (in), matching the focus tree. Click the % to reset.
  const rzOut = document.getElementById("researchZoomOut");
  const rzIn = document.getElementById("researchZoomIn");
  const rzLabel = document.getElementById("researchZoomLabel");
  if (rzOut) rzOut.addEventListener("click", () => setResearchZoom(researchZoom - RZOOM_STEP));
  if (rzIn) rzIn.addEventListener("click", () => setResearchZoom(researchZoom + RZOOM_STEP));
  if (rzLabel) rzLabel.addEventListener("click", () => setResearchZoom(1));
  document.addEventListener("keydown", (e) => {
    const inField = isTextEntryTarget(e.target);
    // Escape leaves Link Mode — the universal "get me out of this mode" gesture (previously only the
    // banner button exited it). Runs before the field/modifier guards so it always fires. #link-escape
    if (e.key === "Escape" && isLinkMode) { e.preventDefault(); exitLinkMode(); return; }
    // Ctrl+Z is handled by the UNIFIED history (#research-undo), registered on window in capture phase so
    // it runs before this handler and stops the event here. This used to be a SECOND, delete-only Ctrl+Z
    // calling undoLastDelete() — two undo systems racing for the same key, and the loser silently
    // desynced the deletion queue from the canvas. One key, one history. undoLastDelete() itself stays:
    // it is still the "Undo" action on the delete toast.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (inField) return;
    const k = (e.key || "").toLowerCase();
    if (k === "z") { e.preventDefault(); setResearchZoom(researchZoom - RZOOM_STEP); }
    else if (k === "x") { e.preventDefault(); setResearchZoom(researchZoom + RZOOM_STEP); }
  });
  // Keep the year numbers pinned to the visible edge while scrolling the canvas.
  const canvasContainerEl = document.getElementById("canvasContainer");
  if (canvasContainerEl) canvasContainerEl.addEventListener("scroll", stickYearLabels, { passive: true });

  // Zoom-to-cursor: remember where the pointer is so the +/− buttons and Z/X keys zoom toward it,
  // and Ctrl/Cmd + wheel zooms in/out centred on the cursor (matching the focus tree).
  window.addEventListener("pointermove", (ev) => updateResearchZoomAnchor(ev.clientX, ev.clientY), { passive: true });
  if (canvasContainerEl) {
    canvasContainerEl.addEventListener("wheel", (ev) => {
      if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        updateResearchZoomAnchor(ev.clientX, ev.clientY);
        setResearchZoom(researchZoom + (ev.deltaY > 0 ? -RZOOM_STEP : RZOOM_STEP));
      }
    }, { passive: false });
  }

  // ── novaPrompt / novaConfirm: in-app dialogs ──────────────────────────────────────────────
  // Electron's renderer does NOT support window.prompt() — it silently returns null, which is
  // exactly why every "Add …" button that used prompt() did nothing in the desktop app (it
  // worked in a plain browser, hiding the bug). These styled replacements work everywhere and
  // return a Promise, so handlers must `await` them.
  function novaPrompt(message, defaultValue = "", opts = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "nova-prompt-overlay";
      overlay.innerHTML =
        '<div class="nova-prompt-box">' +
        '<div class="nova-prompt-msg"></div>' +
        '<input type="text" class="nova-prompt-input" autocomplete="off" spellcheck="false" />' +
        '<div class="nova-prompt-actions">' +
        '<button type="button" class="nova-prompt-cancel">Cancel</button>' +
        '<button type="button" class="nova-prompt-ok">OK</button>' +
        '</div></div>';
      overlay.querySelector(".nova-prompt-msg").textContent = message;
      const input = overlay.querySelector(".nova-prompt-input");
      input.value = defaultValue || "";
      if (opts.placeholder) input.placeholder = opts.placeholder;
      // Optional autocomplete: opts.suggestions = [{id, label}] (or bare strings). Rendered as a
      // native <datalist> so the user can browse/search valid ids instead of memorising them — this is
      // what lets the prerequisite prompt surface base-mod (e.g. Millennium Dawn) techs. #110
      if (Array.isArray(opts.suggestions) && opts.suggestions.length) {
        const dlId = "novaPromptDatalist_" + Math.random().toString(36).slice(2);
        const dl = document.createElement("datalist");
        dl.id = dlId;
        const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        // #picker-cap-hides-techs — MEASURE A CAP AGAINST THE REAL CORPUS.
        //
        // This was slice(0, 1500), which keeps the FIRST 1500 and drops the rest without a word.
        // validTechSuggestions() appends in load order — this mod, then the base mod, then vanilla — so the
        // truncation ate the VANILLA end: on a big mod you could not pick a base-game tech as a prerequisite,
        // and nothing said why. Measured across the installed mods: Rise of Nations offers 2,196 technologies,
        // 696 of them past the cap. Vanilla 507, Novum Vexillum 589, Road to 56 818, Millennium Dawn 958,
        // Old World Blues 1,037 — so the one mod that exceeded it exceeded it by 46%.
        //
        // A <datalist> of a few thousand native options costs nothing to render, so the ceiling is now well
        // clear of any real corpus. It still exists as a runaway guard — and if it ever bites, it SAYS SO
        // rather than quietly shortening the list, because a silently short picker is indistinguishable from
        // a tech that does not exist.
        const MAX_SUGGESTIONS = 20000;
        const shown = opts.suggestions.slice(0, MAX_SUGGESTIONS);
        const hidden = opts.suggestions.length - shown.length;
        dl.innerHTML = shown.map((s) => {
          const val = typeof s === "string" ? s : (s && s.id) || "";
          const label = typeof s === "string" ? "" : (s && s.label) || "";
          return `<option value="${escAttr(val)}">${escAttr(label)}</option>`;
        }).join("");
        if (hidden > 0) {
          const note = overlay.querySelector(".nova-prompt-msg");
          if (note) note.textContent += ` (${shown.length.toLocaleString()} of ${opts.suggestions.length.toLocaleString()} ids listed — type an id in full if it is not offered.)`;
        }
        overlay.querySelector(".nova-prompt-box").appendChild(dl);
        input.setAttribute("list", dlId);
      }
      document.body.appendChild(overlay);
      setTimeout(() => { input.focus(); input.select(); }, 0);
      const close = (val) => { overlay.remove(); document.removeEventListener("keydown", onKey, true); resolve(val); };
      const onKey = (e) => {
        if (e.key === "Enter") { e.preventDefault(); close(input.value.trim()); }
        else if (e.key === "Escape") { e.preventDefault(); close(null); }
      };
      document.addEventListener("keydown", onKey, true);
      overlay.querySelector(".nova-prompt-ok").addEventListener("click", () => close(input.value.trim()));
      overlay.querySelector(".nova-prompt-cancel").addEventListener("click", () => close(null));
      overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(null); });
    });
  }

  const addDepBtn = document.getElementById("addDepBtn");
  if (addDepBtn) {
    addDepBtn.addEventListener("click", async () => {
      const tech = allTechs.find((t) => t.id === selectedTechId);
      if (!tech) { nbAlert("Select a technology first."); return; }
      if (!tech.isMod) { nbAlert("This is a vanilla technology. Switch to a mod tech (or enable vanilla editing) to add dependencies."); return; }
      const depId = await novaPrompt("Enter the Technology ID this one unlocks (its dependency):", "", { placeholder: "e.g. infantry_weapons2", suggestions: validTechSuggestions() });
      if (!depId) return;
      const cleanDep = depId.trim();
      if (!warnUnknownTechId(cleanDep, "dependency")) return;

      if (!tech.dependencies) tech.dependencies = [];
      if (!tech.dependencies.includes(cleanDep)) {
        tech.dependencies.push(cleanDep);
        markTechDirty(tech.id);
        updateSidebar();
        renderCanvas();
      }
    });
  }

  // Add prerequisite button
  // BUGFIX: was AND-only. Now supports OR-groups via a second prompt that lets
  // the user enter multiple comma-separated IDs to be grouped under a single OR.
  const addPrereqBtn = document.getElementById("addPrereqBtn");
  if (addPrereqBtn) {
    addPrereqBtn.addEventListener("click", async () => {
      const tech = allTechs.find(t => t.id === selectedTechId);
      if (!tech) { nbAlert("Select a technology first."); return; }
      if (!tech.isMod) { nbAlert("This is a vanilla technology. Switch to a mod tech (or enable vanilla editing) to add prerequisites."); return; }
      if (!tech.prerequisites) tech.prerequisites = [];

      const choice = await novaPrompt(
        "Add prerequisite. Type 'or' for an OR group (any one unlocks), or leave blank for a single required parent:",
        "",
        { placeholder: "blank = single parent · or = OR group" }
      );
      if (choice === null) return; // cancelled

      if (choice && choice.trim().toLowerCase() === "or") {
        const raw = await novaPrompt("Enter comma-separated Technology IDs for the OR group (any one satisfies):", "", { placeholder: "tech_a, tech_b", suggestions: validTechSuggestions() });
        if (!raw) return;
        const ids = raw.split(",").map(s => s.trim()).filter(Boolean);
        const valid = [];
        for (const id of ids) {
          if (warnUnknownTechId(id, "OR prerequisite")) valid.push(id);
        }
        if (valid.length < 2) {
          nbAlert("OR groups need at least 2 valid technology IDs.");
          return;
        }
        tech.prerequisites.push({ type: "OR", techs: valid });
        markTechDirty(tech.id);
        valid.forEach((id) => markTechDirty(id)); // parents get path lines rewritten
        updateSidebar();
        renderCanvas();
        return;
      }

      const parentId = await novaPrompt("Enter the required parent Technology ID (type to search this mod / base mod / vanilla):", "", { placeholder: "e.g. infantry_weapons", suggestions: validTechSuggestions() });
      if (!parentId) return;
      if (!warnUnknownTechId(parentId.trim(), "prerequisite")) return;
      tech.prerequisites.push({ type: "AND", tech: parentId.trim() });
      markTechDirty(tech.id);
      markTechDirty(parentId.trim()); // parent gets its path line rewritten
      updateSidebar();
      renderCanvas();
    });
  }

  // Add mutually exclusive button
  const addExclusiveBtn = document.getElementById("addExclusiveBtn");
  if (addExclusiveBtn) {
    addExclusiveBtn.addEventListener("click", async () => {
      const otherId = await novaPrompt("Enter the mutually exclusive Technology ID:", "", { placeholder: "e.g. artillery_alt_path", suggestions: validTechSuggestions() });
      if (!otherId) return;
      const cleanOther = otherId.trim();
      // BUGFIX: Prevent a tech being mutually exclusive with itself
      if (cleanOther === selectedTechId) {
        nbAlert("A technology cannot be mutually exclusive with itself.");
        return;
      }
      if (!warnUnknownTechId(cleanOther, "mutually exclusive")) return;
      
      const tech = allTechs.find(t => t.id === selectedTechId);
      if (tech && tech.isMod) {
        if (!tech.mutuallyExclusive) tech.mutuallyExclusive = [];
        if (!tech.mutuallyExclusive.includes(cleanOther)) {
          tech.mutuallyExclusive.push(cleanOther);
          markTechDirty(tech.id);
          markTechDirty(cleanOther);

          // Also set bidirectional link on the other node if it exists
          const other = allTechs.find(t => t.id === cleanOther);
          if (other && other.isMod) {
            if (!other.mutuallyExclusive) other.mutuallyExclusive = [];
            if (!other.mutuallyExclusive.includes(tech.id)) {
              other.mutuallyExclusive.push(tech.id);
            }
          }
          
          updateSidebar();
          renderCanvas();
        }
      }
    });
  }

  // BUGFIX/FEATURE: Sub-technology creation
  const addSubTechBtn = document.getElementById("addSubTechBtn");
  if (addSubTechBtn) {
    addSubTechBtn.addEventListener("click", () => {
      const tech = allTechs.find(t => t.id === selectedTechId);
      if (!tech) { nbAlert("Select a technology first."); return; }
      const proceed = async () => {

      const subId = await novaPrompt(
        "Enter a sub-tech ID. If it already exists it gets attached here; otherwise a fresh one is created:",
        "",
        { placeholder: "e.g. infantry_weapons_upgrade" }
      );
      if (!subId) return;
      const cleanSubId = subId.trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleanSubId)) {
        nbAlert("Sub-tech ID must start with a letter or underscore, then use only letters, numbers, and underscores. HOI4 rejects an ID that starts with a number.");
        return;
      }
      if (cleanSubId === tech.id) {
        nbAlert("A technology cannot be its own sub-technology.");
        return;
      }

      if (!tech.subTechnologies) tech.subTechnologies = [];
      if (tech.subTechnologies.includes(cleanSubId)) {
        nbAlert("That sub-technology is already attached.");
        return;
      }

      let child = allTechs.find(t => t.id === cleanSubId);
      if (!child) {
        // Create a fresh sub-tech beneath the parent
        child = {
          id: cleanSubId,
          name: cleanSubId,
          description: "",
          folder: tech.folder,
          x: tech.x,
          y: tech.y + 1,
          researchCost: tech.researchCost,
          startYear: tech.startYear,
          prerequisites: [{ type: "AND", tech: tech.id }],
          dependencies: [],
          enableEquipments: [],
          modifiers: "",
          extraScript: "",
          isMod: true,
          isSubTech: true,
          iconKey: "GFX_infantry_weapons_medium",
          fileName: tech.fileName || "custom_technologies.txt"
        };
        allTechs.push(child);
      } else {
        if (!child.isMod) {
          nbAlert("Cannot promote a vanilla technology to a sub-tech here. Use a custom one.");
          return;
        }
        child.isSubTech = true;
      }

      tech.subTechnologies.push(cleanSubId);
      markTechDirty(tech.id);
      markTechDirty(cleanSubId);
      updateSidebar();
      renderCanvas();
      };
      // Vanilla techs must be copied into the mod before we can attach a sub-tech — confirm first.
      if (!tech.isMod) {
        showNovaConfirmModal("This is a vanilla technology. To add a sub-technology to it, we must copy it to your mod files (overriding the vanilla definition). Proceed?", () => {
          tech.isMod = true;
          tech.fileName = "custom_technologies.txt";
          proceed();
        }, { title: "Copy to your mod?", yesLabel: "Proceed" });
      } else {
        proceed();
      }
    });
  }

  // AI Help Dialog key instruction
  const aiHelpBtn = document.getElementById("aiLogicHelpBtn");
  if (aiHelpBtn) {
    aiHelpBtn.addEventListener("click", () => {
      window.showNovaAiHelpModal("aiPrompt");
    });
  }

  // Intercept suite navigation links so users are warned about unsaved changes
  document.querySelectorAll(".suite-nav-link:not(.active)").forEach((link) => {
    link.addEventListener("click", (e) => {
      if (!dirty) return;
      if (!confirm("You have unsaved changes in the Research Tree. Leave without saving?")) {
        e.preventDefault();
      } else {
        dirty = false; // Reset dirty state to bypass beforeunload handler
      }
    });
  });

  // Start initialization sequentially to prevent race conditions on page load
  wireTabScrollControls();
  // Scroll the canvas to reveal the leftmost content — the leftmost tech node AND any on-screen section
  // label. Labels overhang the nodes (they sit above/left of their era column) and load ASYNC, so a scroll
  // that only measures nodes clips the first ~15px of "SMALL ARMS" etc. on first load. #label-clip
  function researchScrollToLeftmostContent() {
    const container = document.querySelector(".canvas-container");
    if (!container) return;
    let minLeft = effectiveOriginX;
    document.querySelectorAll(".tech-node").forEach((n) => { const l = parseInt(n.style.left || 0); if (l < minLeft) minLeft = l; });
    document.querySelectorAll(".research-gui-label").forEach((el) => { const l = parseFloat(el.style.left); if (Number.isFinite(l) && l > -9000 && l < minLeft) minLeft = l; });
    // Include the in-game YEAR stamps too — on a vertical tree they sit in the LEFT margin (x=0 authored),
    // to the left of the first tech, so the old techs-only scroll parked them off the left edge. #year-objects
    document.querySelectorAll(".research-gui-year").forEach((el) => { const l = parseFloat(el.style.left); if (Number.isFinite(l) && l < minLeft) minLeft = l; });
    container.scrollLeft = Math.max(0, minLeft - 40);
    container.scrollTop = 0;
  }
  initModSelector().then(() => {
    return initCountrySelector();
  }).then(() => {
    // Deep-link: research.html?tech=<id> — jump straight to a tech (e.g. from the Military tab's
    // "Unlocked by" chip). jumpToTech switches to the tech's tab, selects + centres + flashes it.
    // Only when the tech actually exists in the loaded catalog; otherwise fall back to the normal
    // leftmost-content scroll so the two don't fight over the viewport.
    let gotoTech = null;
    try { gotoTech = new URLSearchParams(location.search).get("tech"); } catch (_) { /* no-op */ }
    if (gotoTech && allTechs.some((t) => t.id === gotoTech)) {
      setTimeout(() => jumpToTech(gotoTech), 60);
    } else {
      researchScrollToLeftmostContent();
      window._researchInitialScrollPending = true; // re-run once when the async section labels first paint
    }
  });

  initTechCountryBridge();

  // ── Bridge: make a country start with the current tech researched ──────────
  // Writes set_technology into the country's history via /api/technologies/set-country-tech.
  function initTechCountryBridge() {
    const sel = document.getElementById("techCountrySelect");
    const grantBtn = document.getElementById("techGrantBtn");
    const revokeBtn = document.getElementById("techRevokeBtn");
    const status = document.getElementById("techGrantStatus");
    const techIdEl = document.getElementById("techId");
    if (!sel || !grantBtn || !status || !techIdEl) return;

    function techId() { return (techIdEl.value || "").trim(); }
    function setStatus(msg, color) { status.textContent = msg; status.style.color = color || "#8b949e"; }

    if (window.NovaCountryPicker) {
      window.NovaCountryPicker.populate(sel, { modPath: getModPath(), all: true }).catch(() => {});
    }

    async function refreshStatus() {
      const tag = sel.value, t = techId();
      if (!tag || !t) { setStatus(""); revokeBtn.style.display = "none"; return; }
      try {
        const r = await fetch(`/api/technologies/country-tech-status?tag=${encodeURIComponent(tag)}&techId=${encodeURIComponent(t)}&modPath=${encodeURIComponent(getModPath())}`);
        const d = await r.json();
        if (d.active) { setStatus(`✓ ${tag} starts with this tech.`, "#2ea043"); revokeBtn.style.display = ""; }
        else { setStatus(""); revokeBtn.style.display = "none"; }
      } catch (_e) { setStatus(""); revokeBtn.style.display = "none"; }
    }

    async function setGranted(active) {
      const tag = sel.value, t = techId();
      if (!t) { setStatus("⛔ Set a Tech ID above first.", "#f85149"); return; }
      if (!tag) { setStatus("⛔ Pick a country.", "#f85149"); return; }
      setStatus(active ? `Adding ${t} to ${tag}…` : `Removing ${t} from ${tag}…`);
      try {
        const r = await fetch("/api/technologies/set-country-tech", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag, techId: t, active, modPath: getModPath() }),
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || "Failed");
        // #remove-tech-removes-nothing — the write can legitimately fail to change anything: a tech granted
        // inside a hand-authored dated block (Millennium Dawn does this for 344 of 345 countries) or behind
        // a DLC gate is one Nova refuses to rewrite, because rewriting it would delete the modder's own
        // logic. The endpoint now says so. Claiming "✓ Removed" over the top of that was the worst possible
        // answer — the checkbox cleared, the tree recoloured, and the country still had the technology.
        if (d.note) {
          setStatus(d.note, "#d29922");
          try { nbAlert(d.note, "Nothing was changed"); } catch (_) {}
          return;
        }
        setStatus(active ? `✓ ${tag} now starts with "${t}" researched.` : `✓ Removed "${t}" from ${tag}.`, "#2ea043");
        revokeBtn.style.display = active ? "" : "none";
        // #grant-then-save-deletes-it — this writes straight to disk, but the page keeps its own idea of which
        // techs the open country starts with (countryResearchedTechs, filled once by the catalog load). It was
        // never told, so two things followed: the tech's own "starts researched" checkbox still rendered
        // UNCHECKED, flatly contradicting the green line above; and the next time ANY such checkbox was
        // touched, Save posted the stale set and the server rewrote the country's whole set_technology block
        // from it — silently dropping the tech this button had just granted, while reporting success.
        //
        // Only when the grant targets the country the tree is actually showing: the picker here has its own
        // dropdown, and countryResearchedTechs belongs to activeCountryTag.
        if (tag === activeCountryTag) {
          if (active) countryResearchedTechs.add(t); else countryResearchedTechs.delete(t);
          const box = document.getElementById("countryTechResearched");
          if (box && typeof selectedTechId !== "undefined" && selectedTechId === t) box.checked = active;
          // Same refresh loadCountryTechs uses after it rebuilds this set — the node's "completed" colour and
          // the sidebar checkbox both read from it.
          try { updateSidebar(); } catch (_) {}
        }
      } catch (e) { setStatus("Failed: " + (e.message || e), "#f85149"); }
    }

    grantBtn.addEventListener("click", () => setGranted(true));
    revokeBtn.addEventListener("click", () => setGranted(false));
    sel.addEventListener("change", refreshStatus);
    techIdEl.addEventListener("input", refreshStatus);
  }
});
