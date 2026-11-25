(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  // A deep-link (Research Tree → "Open in Military") carries the workspace it was viewing, so the target
  // equipment actually exists here. Adopt it BEFORE anything reads modPath(), or the page loads the last
  // mod and the link lands on an arsenal that has no such equipment. #eq-deeplink
  try {
    const wantMod = (new URLSearchParams(location.search).get("modPath") || "").trim();
    if (wantMod) localStorage.setItem("activeModPath", wantMod);
  } catch (_) {}
  const modPath = () => localStorage.getItem("activeModPath") || "";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Strip HOI4 §color / [Scope.GetName] / £icon display codes for READ-ONLY labels — mirrors the other makers
  // (characters.js etc.). DISPLAY ONLY: editable Name inputs keep the raw string so codes are never dropped on
  // save (that would be data loss on the loc value). #loc-display-strip
  const stripLoc = (s) => String(s == null ? "" : s).replace(/§[A-Za-z0-9!]/g, "").replace(/\[[A-Za-z0-9_.]+(\s+[A-Za-z0-9_.]+)*\]/g, "").replace(/£[^\s§\[]+/g, "").replace(/\s{2,}/g, " ").trim();
  const escLoc = (s) => esc(stripLoc(s)); // convenience: strip codes THEN html-escape, for read-only display
  const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  // The real dropdown that replaces every native <datalist> popup now lives in public/nova-combo.js, so
  // the other makers get it too — it used to be here, and only here, which is why the focus editor's
  // country list still bled off the screen. It self-installs; nothing to call. #combo
  const normalize = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

  // ── State ───────────────────────────────────────────────────────────────
  const S = {
    country: "",
    model: { file: "", templates: [], divisions: [] }, // templates: [{name, line:[key], support:[key], priority, names_group, _dirty}]
    palette: { line: [], support: [], byKey: {}, byKeyLC: {} },
    selTpl: -1,

    equip: {
      all: [], landTypes: [], sel: "", showBase: false, loaded: false, loading: false, mode: "", chassis: [], chassisById: {}, modulesByCategory: {}, pick: {}, gdb: {},
      // The ARSENAL: every country's named create_equipment_variant ("AH-1 Cobra", "AK-74M"…).
      variants: [], varCountries: [], varFilter: [], showVariants: true, selVar: "",
    }, // mode: "" | "new"
    companies: { loaded: false },
  };
  const LINE_COLS = 5, COL_CAP = 5, SUPPORT_CAP = 5;

  // ── Regiment groups ───────────────────────────────────────────────────────────────────────────────
  // A column in the grid IS a regiment, and the in-game designer only lets a regiment hold ONE group:
  // "The group cannot change in a single y column" (HOI4 wiki, Division modding). That is exactly why you
  // can't stack tanks on infantry, or motorised on either — they're different groups.
  // These seven are the real set, read out of vanilla common/units/*.txt (not invented):
  //   infantry · mobile · armor · combat_support · armor_combat_support · mobile_combat_support · support
  // IMPORTANT — this is a DESIGNER rule, not a file rule, so Nova warns and never blocks. Vanilla itself
  // ships templates that break it and the game runs: history/units/CA1.txt "Azad Hind Infantry Corps" puts
  // medium_armor (armor) above infantry (infantry) in column 0, and ETH_1936_bba.txt "Kebur Zabagna" stacks
  // cavalry (mobile) on four infantry — Paradox just marks that one `is_locked = yes` so the player can
  // never open it in the designer. Blocking would refuse to save the base game's own content. #column-group
  const GROUP_LABEL = {
    infantry: "Infantry", mobile: "Motorised", armor: "Armour",
    combat_support: "Towed support", armor_combat_support: "Armoured support", mobile_combat_support: "Motorised support",
    support: "Support",
  };
  const GROUP_LABEL_OF = (g) => GROUP_LABEL[g] || g || "?";
  const groupOf = (key) => {
    const s = (S.palette.byKey && S.palette.byKey[key]) || (S.palette.byKeyLC && S.palette.byKeyLC[String(key || "").toLowerCase()]);
    return s ? s.group : null;
  };
  const colGroups = (units) => [...new Set((units || []).map(groupOf).filter(Boolean))];

  // ── Inner sub-tabs (lazy-load the heavier tabs on first open) ────────────
  function lazyLoad(tab) {
    // Load the heavy Equipment tab lazily. Do NOT latch loaded=true up-front — if the mod is still
    // cold-warming (MD takes ~60s), the first fetch fails and an up-front latch would leave the tab
    // permanently blank. loadEquipment() latches only on SUCCESS; `loading` guards against double-fire. #3
    if (tab === "equipment" && !S.equip.loaded && !S.equip.loading) { loadEquipment().then(loadDesigner); loadUpgradeInfo(); } // MIO editor card removed — #mio-card-removed
    // Companies = the full National-Spirits designers editor, embedded via iframe. Set its src on first
    // open (lazy) so a cold Military-tab open doesn't pull in the whole ideas page. #7/#10
    if (tab === "companies" && !S.companies.loaded) {
      S.companies.loaded = true;
      const fr = $("companiesFrame"), load = $("companiesLoading");
      if (fr && !fr.src) {
        // Swap the "loading…" placeholder for the iframe only once it has actually loaded, so a slow
        // total-conversion (Rise of Nations) shows a spinner instead of a frozen blank box. #companies-lag
        fr.addEventListener("load", () => {
          if (load) load.style.display = "none"; fr.style.display = "";
          watchCompaniesContent(); // content-size the frame + keep it fitted as the embed reflows
          // Only re-fit if the user is STILL on the Companies tab — a slow iframe finishing after they
          // switched away must not lock page scrolling on another tab. #companies-fit-race
          const panel = $("panel-companies");
          fitCompanies(!!(panel && panel.classList.contains("active")));
        });
        fr.src = "ideas.html?mode=designers&embed=1&v=op1"; // v= busts the cached embed CSS on update #companies-wheel
      }
    }
    fitCompanies(tab === "companies");
  }
  // Companies hosts the National-Spirits editor as its OWN fixed-viewport app: the embedded page keeps its
  // normal two-pane layout, so the folders sidebar and the editor each scroll inside their own panel — exactly
  // like the standalone page (and like Events / Characters). The previous "#companies-onepage" version
  // content-sized the iframe with a ResizeObserver and flattened the embed's panes so the outer page was the
  // only scroller; that took the sidebar's window away, needed a wheel-forwarding hack to fake scrolling, and
  // felt clunky. Reverted. #companies-embed
  //
  // The frame is a FULL VIEWPORT tall, which makes the Military page scroll by exactly the height of the header
  // + sub-tabs above it. That is deliberate: scroll down and the "military hat" header scrolls away as on any
  // other Nova page, leaving the editor the whole screen. Sizing it to only the LEFTOVER space (viewport minus
  // the ~270px header) instead pinned the header forever — the page could never scroll, so it read as a giant
  // fixed top bar with a separate pane under it, i.e. two layers rather than one page. #companies-fit
  // The frame must fill the space LEFT under the Military header — not a whole viewport. Giving it the full
  // innerHeight made the document (header + a full-viewport frame) taller than the viewport, so the page grew
  // its own scrollbar ON TOP of the embedded editor's: two scrollbars, and the tab stopped feeling like one
  // page. Sized to the remainder, the only scrollbars left are the editor's own panes — same as the
  // standalone National Spirits page. #companies-embed
  // ONE PAGE: size the frame to its CONTENT height so the whole Military page (helmet header included) is the
  // single scroller and scrolls as one — the helmet carries away with everything, which is what the user
  // asked for. Sizing it to the viewport instead pinned the header as a dead top bar over a self-scrolling
  // frame. Safe now that the embed flows with only the folders list bounded (ideas.html #companies-onepage),
  // so the content height stays sane instead of the old 13,000px folder blow-up. #companies-onepage
  function sizeCompaniesFrame() {
    const fr = $("companiesFrame"); if (!fr || fr.style.display === "none") return;
    // #companies-embed-sidebar-cut-off — BOUND THE FRAME; DO NOT GROW IT TO ITS CONTENT.
    //
    // Growing it to content is what made the outer page the scroller, and a content-sized frame gives the
    // embedded layout no height to divide between its two panes — so the folders sidebar rendered at its own
    // content height (423px) inside a 1500px column and stopped dead partway down.
    //
    // Sized to the space actually left under the Military header, the embed is a normal fixed-viewport
    // two-pane app: the folders list and the editor each scroll in their own panel, and the page itself does
    // not scroll at all (see body.companies-fit). One scrollbar per pane, none on the page.
    const top = fr.getBoundingClientRect().top;
    const avail = window.innerHeight - top - 12; // 12px breathing room at the bottom
    fr.style.height = Math.max(420, Math.round(avail)) + "px";
  }
  // The embed's content height changes as folders expand / a designer is selected — keep the frame fitted so
  // the page never grows an inner scrollbar or clips content. One observer, wired once the frame has loaded.
  function watchCompaniesContent() {
    const fr = $("companiesFrame");
    let doc; try { doc = fr && fr.contentDocument; } catch (_) { return; }
    if (!doc || !doc.body || fr._sizeObserved) return;
    fr._sizeObserved = true;
    try {
      // #companies-embed-sidebar-cut-off — the frame is bound to the VIEWPORT now, not to its content, so
      // there is nothing to observe inside it: the embed reflowing cannot change the frame's height. The
      // ResizeObserver on doc.body and the click-reflow that went with it are gone, and so is the wheel
      // forwarding — the embed scrolls its own panes, which is the point.
      void 0;
    } catch (_) {}
    sizeCompaniesFrame();
  }
  function fitCompanies(active) {
    document.body.classList.toggle("companies-fit", !!active);
    if (active) { sizeCompaniesFrame(); setTimeout(sizeCompaniesFrame, 60); }
  }
  window.addEventListener("resize", () => { if (document.body.classList.contains("companies-fit")) sizeCompaniesFrame(); });

  // #companies-embed-sidebar-cut-off — wireCompaniesWheelToPage lived here. It forwarded the wheel from
  // inside the embed to the outer page, which only made sense while the frame was content-sized and the page
  // was the scroller. The embed scrolls its own panes now, so it was dead code and is gone.
  // Make the Stockpile + Navy/Air cards fold away by clicking their title — they're tall and often not the
  // thing you're working on. State persists per card. The help "?" chip inside the title keeps its own job. #army-collapsible
  function initCollapsibleCards() {
    document.querySelectorAll(".army-collapsible").forEach((card) => {
      const h = card.querySelector("h3"); if (!h || h.dataset.collapWired) return;
      h.dataset.collapWired = "1";
      const chev = document.createElement("span"); chev.className = "col-chev"; chev.textContent = "▾";
      h.appendChild(chev);
      const key = "armyCollapse:" + (card.dataset.collapseKey || card.id);
      let collapsed = false; try { collapsed = localStorage.getItem(key) === "1"; } catch (_) {}
      card.classList.toggle("collapsed", collapsed);
      h.addEventListener("click", (e) => {
        if (e.target.closest(".sb-help")) return; // the ? opens help, doesn't fold
        const now = !card.classList.contains("collapsed");
        card.classList.toggle("collapsed", now);
        try { localStorage.setItem(key, now ? "1" : "0"); } catch (_) {}
      });
    });
  }
  function initSubtabs() {
    const btns = Array.from(document.querySelectorAll(".army-subtab"));
    btns.forEach((b) => b.addEventListener("click", () => {
      btns.forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll(".army-panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + b.dataset.tab));
      try { localStorage.setItem("armyActiveSubtab", b.dataset.tab); } catch (_) {}
      lazyLoad(b.dataset.tab);
    }));
    // An explicit ?tab= beats the remembered tab — a deep-link from the Research Tree must land where it
    // says, not on whichever tab happened to be open last. #eq-deeplink
    const want = (new URLSearchParams(location.search).get("tab") || "").trim();
    let last = ""; try { last = localStorage.getItem("armyActiveSubtab") || ""; } catch (_) {}
    const restore = btns.find((b) => b.dataset.tab === want) || btns.find((b) => b.dataset.tab === last);
    if (restore) restore.click();
  }

  async function showContext() {
    const nameEl = $("armyModName"), pathEl = $("armyModPath");
    const mp = modPath();
    if (pathEl) pathEl.textContent = mp || "(none)";
    if (!nameEl) return;
    if (!mp) { nameEl.textContent = "No mod selected"; return; }
    try {
      const data = await fetch("/api/mods/list").then((r) => r.json());
      const m = (data.mods || []).find((x) => normalize(x.path) === normalize(mp));
      nameEl.textContent = m ? (m.name || mp.split(/[\\/]/).pop()) : mp.split(/[\\/]/).pop();
    } catch (_) { nameEl.textContent = mp.split(/[\\/]/).pop(); }
  }

  // A header mod SELECTOR (every other maker page has one; the Military page only showed the name). Switching
  // reloads the page so all tab state (templates, equipment, designer, companies iframe) resets for the new mod.
  async function initModSelector() {
    const sel = $("armyModSelector"); if (!sel) return;
    let mods = [];
    try { const d = await fetch("/api/mods/list").then((r) => r.json()); mods = (d && d.mods) || []; } catch (_) {}
    const active = modPath();
    sel.innerHTML = "";
    if (!mods.length) { sel.innerHTML = '<option value="">— no mods found —</option>'; return; }
    for (const m of mods) {
      const opt = document.createElement("option");
      opt.value = m.path; opt.textContent = m.name || m.path.split(/[\\/]/).pop();
      // The server's PATH-based flag, so the banner above can stop guessing from the mod's name.
      if (m.isVanilla === true
        || (m.isVanilla === undefined && normalize(m.path).includes("steamapps/common/hearts of iron iv"))) {
        opt.dataset.vanilla = "1";
      }
      if (active && normalize(m.path) === normalize(active)) opt.selected = true;
      sel.appendChild(opt);
    }
    // A stored mod missing from the list is usually a transient enumeration miss — keep it (self-heals),
    // shown as "(not detected)", instead of silently switching the user to another mod. Mirrors the makers.
    if (active && !mods.some((m) => normalize(m.path) === normalize(active))) {
      const opt = document.createElement("option");
      opt.value = active; opt.textContent = (active.split(/[\\/]/).filter(Boolean).pop() || active) + " (not detected)";
      sel.insertBefore(opt, sel.firstChild); sel.value = active;
    }
    // Same proactive Vanilla read-only banner the other maker pages show (browse fine, saving needs a mod).
    const banner = $("vanillaBanner");
    if (banner) {
      const selectedText = (sel.options[sel.selectedIndex] || {}).text || "";
      // #vanilla-by-name — the option's flag, not its TEXT. Keyed on the name, this read-only banner
      // appeared over any mod the user happened to call "Vanilla Plus" or "Improved Vanilla". The flag is
      // set from the server's path-based `isVanilla` where the options are built.
      const vOpt = sel.options[sel.selectedIndex];
      banner.style.display = (vOpt && vOpt.dataset.vanilla === "1") ? "" : "none";
    }
    sel.addEventListener("change", () => {
      // Ask BEFORE persisting the new mod. Persist-then-reload let the user cancel the browser's
      // leave-confirm and keep working on the OLD mod's data while modPath() already pointed at the
      // NEW mod — every subsequent save would write into the wrong mod. Confirm first; only a yes
      // touches localStorage. (Clearing the dirty flags stops beforeunload from double-asking.)
      const dirty = S.unsaved || (S.equip && (S.equip.editorDirty || S.equip.variantDirty));
      if (dirty && !confirm("You have unsaved Military changes. Switch mods and discard them?")) {
        sel.value = active || sel.value;
        return;
      }
      S.unsaved = false; if (S.equip) { S.equip.editorDirty = false; S.equip.variantDirty = false; }
      try { localStorage.setItem("activeModPath", sel.value); } catch (_) {}
      location.reload(); // cleanest reset of all Military-tab state for the newly-selected mod
    });
  }

  // ── Unit symbols (NATO-style, like the in-game counters) + category colours ──
  const CAT_COLOR = {
    infantry: "#5aa452", motorized: "#7fb241", mechanized: "#3d7a2f", armored: "#3f7fbf", armor: "#3f7fbf",
    cavalry: "#a15fa0", artillery: "#d98a34", anti_tank: "#c0392b", anti_air: "#6d54b0", rocket: "#c77ba8",
    support: "#8a929c", air: "#6db3d1", ship: "#5a8fbf", other: "#7f8790",
  };
  // Draw the interior symbol of a unit tile (the tile itself is the NATO rectangle frame).
  function unitSymbol(cat) {
    const c = "currentColor", w = 'stroke="' + c + '" stroke-width="3" fill="none" stroke-linecap="round"';
    const X = `<path d="M6 4 L34 22" ${w}/><path d="M34 4 L6 22" ${w}/>`;
    const OVAL = `<ellipse cx="20" cy="13" rx="14" ry="7" ${w}/>`;
    const map = {
      infantry: X,
      armored: OVAL,
      motorized: X + `<circle cx="20" cy="13" r="3.2" fill="${c}"/>`,
      mechanized: X + `<ellipse cx="20" cy="13" rx="16.5" ry="9" ${w}/>`,
      cavalry: `<path d="M6 22 L34 4" ${w}/>`,
      artillery: `<circle cx="20" cy="13" r="5.2" fill="${c}"/>`,
      anti_tank: `<path d="M6 7 L20 20 L34 7" ${w}/>`,
      anti_air: `<path d="M6 20 L20 6 L34 20" ${w}/>`,
      rocket: `<path d="M20 22 L20 8" ${w}/><path d="M14 14 L20 6 L26 14" ${w}/>`,
      support: `<path d="M20 4 L34 13 L20 22 L6 13 Z" ${w}/>`,
      air: `<path d="M4 13 L23 12 L29 5 L32 5 L30 12 L36 13 L30 14 L32 21 L29 21 L23 14 L4 13 Z" fill="${c}"/>`,
      ship: `<path d="M6 15 L34 15 L30 21 L10 21 Z" fill="${c}"/><rect x="17" y="8" width="9" height="7" fill="${c}"/><rect x="20" y="4" width="3" height="4" fill="${c}"/>`,
      other: `<path d="M6 13 L34 13" ${w}/>`,
    };
    return `<svg viewBox="0 0 40 26" class="unit-sym" aria-hidden="true">${map[cat] || map.other}</svg>`;
  }
  // The REAL in-game battalion icon (the user's ask): the coloured helmet / tank / IFV picture the game
  // shows in the division designer and on the map — NOT the abstract NATO symbol above. It is keyed on the
  // sub_unit's BLOCK KEY (its id), resolved to GFX_unit_<key>_icon_medium: this works for BOTH vanilla base
  // types (GFX_unit_infantry_icon_medium) AND Millennium Dawn's renamed units (GFX_unit_L_Inf_Bat_icon_medium
  // → the green helmet, GFX_unit_armor_Bat_icon_medium → the red tank, GFX_unit_Mech_Inf_Bat → green IFV).
  // NOTE: the sub_unit `sprite` field is NOT the icon — in MD it's a 3D map-mesh (MD4_infantry_2), so we try
  // the KEY first and the sprite token only as a weak fallback. The counter sprite is a 2-frame strip
  // (normal|selected); the CSS crops to frame 0. On any miss the NATO symbol underneath stays visible. #unit-icons
  function unitPic(su) {
    const key = (su && (su.key || su.id)) || "";
    const spr = (su && su.sprite) || "";
    if (!key && !spr) return "";
    return `<span class="unit-pic" data-ukey="${esc(key)}" data-uspr="${esc(spr && spr !== key ? spr : "")}" data-ucat="${esc(unitCat(su))}"></span>`;
  }
  // Category → a canonical vanilla unit key, so a battalion whose OWN icon is missing still shows a
  // REPRESENTATIVE in-game picture (a tank for armored, a helmet for infantry, a gun for artillery…)
  // instead of the abstract NATO glyph. These vanilla keys resolve in ANY mod (Nova's sprite map merges
  // vanilla with the mod), so "everything is represented" even when a mod skips a unit's own icon. #unit-icons
  const UNIT_CAT_FALLBACK = { infantry: "infantry", motorized: "motorized", mechanized: "mechanized", cavalry: "cavalry", armored: "medium_armor", artillery: "artillery", anti_tank: "anti_tank", anti_air: "anti_air", rocket: "rocket_artillery", support: "engineer" };
  // Nova's missing-icon placeholder is a 63×63 PNG — treat it (or a 0-width load) as a MISS. Shared by the mounters.
  const isMissingIcon = (im) => !im.naturalWidth || (im.naturalWidth === 63 && im.naturalHeight === 63);
  // The battalion picker renders hundreds of tiles that mostly share the SAME category-fallback icon URL, and it
  // re-mounts on every add. Resolve each icon-image URL ONCE (a shared promise) so ~500 tiles collapse to a few
  // real fetches and post-add redraws hit the cache — /api/icon-image is served no-store so the browser won't. #icon-memo
  const _unitIconMemo = new Map(); // url → Promise<resolved-url | null>  (null = miss)
  function resolveUnitIconUrl(url) {
    if (_unitIconMemo.has(url)) return _unitIconMemo.get(url);
    const p = new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(isMissingIcon(im) ? null : url);
      im.onerror = () => resolve(null);
      im.src = url;
    });
    _unitIconMemo.set(url, p);
    return p;
  }
  function mountUnitIcons(root) {
    const mp = modPath();
    (root || document).querySelectorAll(".unit-pic[data-ukey]").forEach((el) => {
      if (el.dataset.mounted) return; el.dataset.mounted = "1";
      const glyph = el.parentElement && el.parentElement.querySelector(".unit-glyph");
      const canon = UNIT_CAT_FALLBACK[el.dataset.ucat || ""] || "";
      // Try in order: the unit's OWN block key, its sprite token, then a category representative. First real hit wins.
      const keys = [...new Set([el.dataset.ukey, el.dataset.uspr, canon].filter(Boolean))];
      const urls = keys.map((k) => "/api/icon-image?key=" + encodeURIComponent("GFX_unit_" + k + "_icon_medium") + "&modPath=" + encodeURIComponent(mp));
      (async () => {
        for (const url of urls) {
          const hit = await resolveUnitIconUrl(url); // shared across all tiles → dedups the picker's fetches
          if (hit) { el.style.backgroundImage = `url("${hit}")`; el.style.display = "block"; if (glyph) glyph.style.display = "none"; return; }
        }
        // no key resolved — the coloured NATO glyph stays visible
      })();
    });
  }
  // The NATO symbol for a battalion/company must come from its COMBAT ROLE (its `categories` tags + name),
  // NOT `map_icon_category` — that field is for the map counter and reads "armored" for self-propelled
  // artillery and "infantry" for engineer/recon companies, so it gave the wrong designer symbol. Role wins:
  // an SP-artillery battery rides a tank chassis but IS artillery; a recon company IS recon. #brigade-icons
  function unitCat(su) {
    if (!su) return "other";
    const cats = (su.categories || []).map((x) => String(x).toLowerCase());
    const types = (su.types || []).map((x) => String(x).toLowerCase());
    const hay = cats.join(" ") + " " + String(su.key || su.id || "").toLowerCase(); // categories + unit key
    const has = (re) => re.test(hay);
    // Aircraft / missiles are defined as sub_units in some mods (MD) but are NOT land battalions. Give them
    // the air symbol so they group like ships and drop out of the ground-only combat-regiment picker
    // (whose group order lists ships/air separately). Detect by their exclusive air/missile TYPE tokens.
    const AIR = ["fighter", "cas", "tactical_bomber", "naval_bomber", "strategic_bomber", "scout_plane", "suicide", "missile", "ballistic_missile", "nuclear_missile", "sam_missile", "interceptor"];
    // .some, not .every: a mixed-type unit (e.g. MD's stealth_frigate = [screen_ship, artillery]) carries a
    // second non-naval/air type, but ANY air/naval type token means it isn't a land battalion. No land unit
    // in MD/RoN/vanilla carries an air or naval type, so .some can't misroute a real ground unit.
    if (types.some((t) => AIR.includes(t))) return "air";
    // Naval units (ships / submarines) registered as sub_units in some mods → the ship symbol; like air,
    // these are excluded from the land combat picker. Detect by their exclusive naval TYPE tokens.
    const SEA = ["submarine", "carrier", "capital_ship", "screen_ship", "ship"];
    if (types.some((t) => SEA.includes(t))) return "ship";
    // Specific combat roles first (a role beats the coarse map-icon category). The sub_unit's `type` IS the
    // authoritative role, so trust it first — a keyword-only match misses units like MD's Arty_Bat
    // (type=[artillery], key "arty_bat" where "_" defeats \barty\b) that would otherwise fall to infantry.
    // Ground SAM/MANPADS → anti_air, ground ATGM → anti_tank (NOT the air bucket).
    if (types.includes("anti_air") || has(/anti[_-]?air|_aa_|_aa\b|\bspaa\b|\bflak\b|\bmanpad|\bsam_(?!missile)|_sam_(?!missile)|_sam\b|category_anti_air/)) return "anti_air";
    if (types.includes("anti_tank") || has(/anti[_-]?tank|_at_|_at\b|\batgm|_atgm|tank_destroyer|category_anti_tank/)) return "anti_tank";
    if (types.includes("rocket") || has(/rocket|mlrs|\bmrl\b/)) return "rocket";
    if (types.includes("artillery") || has(/artillery|\barty\b|howitzer|\bspg\b|railway_gun/)) return "artillery";
    if (has(/recon|recce|\bscout\b|category_all_recon/)) return "cavalry"; // recon shares the cavalry symbol
    // Non-combat support companies (engineer / signal / maintenance / logistics / hospital / MP) → the
    // support diamond, even when they ride an armored chassis (types=[armor]) — role of function wins.
    if (has(/engineer|_engi\b|_engi_|pioneer|\bsignals?\b|_signal|maintenance|logistics|field_?hospital|hospital|military_police|service_support|combat_service|_supply\b/)) return "support";
    if (types.includes("mechanized") || has(/mechani[sz]ed|\bmech_|\bifv\b|\bmech\b/)) return "mechanized";
    if (types.includes("motorized") || has(/motori[sz]ed|\bmot_|_mot_|\bapc\b|armored_car|armoured_car/)) return "motorized";
    if (types.includes("cavalry") || has(/cavalry|horse|camelry|elephantry/)) return "cavalry";
    if (types.includes("armor") || has(/\btank\b|armou?red|panzer|\bmbt\b/)) return "armored";
    if (has(/infantry|foot_inf|militia|(?:^|[\s_])marine|mountain|paratroop|para_|special_forces|garrison/)) return "infantry";
    // No specific role — a support company (engineer / logistics / signal / etc.) → the support diamond.
    if (su.isSupport || su.group === "support" || cats.includes("category_support_battalions")) return "support";
    // Bare aircraft/naval-air archetype keys some mods register as sub_units with no group/type at all —
    // caught here (after every ground-role check, so no real battalion can reach this) to keep them out
    // of the land picker. Genuinely-other entries (e.g. ammo) fall through to "other".
    if (has(/\bfighter\b|_fighter\b|\bcas\b|_cas\b|bomber|scout_plane|patrol_plane|transport_plane|suicide_craft|missile|zeppelin|airship|\bicbm\b|\birbm\b|\bsrbm\b|\bslbm\b|\bmrbm\b/)) return "air";
    // Fall back to the coarse map-icon category / group.
    let c = (su.mapIconCategory || su.group || "").toLowerCase();
    if (c === "armor") c = "armored";
    if (c === "anti_tank_brigade") c = "anti_tank";
    return CAT_COLOR[c] ? c : "other";
  }
  const unitLabel = (su) => (su && (su.abbreviation || su.key) || "?");

  // HOI4's script parser is case-INSENSITIVE for sub-unit keys, but a JS object index is not. MD defines the
  // sub_unit block as `armor_Bat` yet its OWN division templates write `Armor_Bat` (46×) and `armor_bat` (14×).
  // A case-sensitive lookup missed those, so the battalion fell through to the grey "other" line glyph with no
  // picture, the division counter showed a bare blue NATO oval instead of the tank art — and stats() silently
  // DROPPED the battalion, under-reporting every affected division's width/HP/manpower. Exact match first (so
  // nothing that works today changes), then a lower-cased alias. #unit-key-case
  const suByKey = (k) => (!k || !S.palette) ? null
    : ((S.palette.byKey && S.palette.byKey[k]) || (S.palette.byKeyLC && S.palette.byKeyLC[String(k).toLowerCase()]) || null);

  // Dominant NATO category of a template (for its division counter). Uses the loaded palette when
  // available; else keyword-matches the unit key so a counter still gets a sensible symbol/colour.
  function catFromKey(key) {
    const su = suByKey(key);
    if (su) return unitCat(su);
    const k = String(key || "").toLowerCase();
    if (/mech/.test(k)) return "mechanized";
    if (/motor/.test(k)) return "motorized";
    if (/armor|armour|tank|panzer/.test(k)) return "armored";
    if (/cavalry|horse/.test(k)) return "cavalry";
    if (/anti[_-]?tank|(^|_)at(_|$)/.test(k)) return "anti_tank";
    if (/anti[_-]?air|(^|_)aa(_|$)|flak/.test(k)) return "anti_air";
    if (/rocket|katyusha/.test(k)) return "rocket";
    if (/art|howitz/.test(k)) return "artillery";
    if (/marine|mountain|para|infantry|garrison|militia|guard/.test(k)) return "infantry";
    return "other";
  }
  function templateCat(t) {
    const counts = {};
    for (const u of ((t && t.cols) ? t.cols.flat() : [])) { const c = catFromKey(u); counts[c] = (counts[c] || 0) + 1; }
    let best = "other", bestN = -1;
    for (const c in counts) if (counts[c] > bestN) { bestN = counts[c]; best = c; }
    return best;
  }
  // The most-common line-unit KEY in a template — so a division counter can show that battalion's REAL icon.
  function templateDominantKey(t) {
    const counts = {};
    for (const u of ((t && t.cols) ? t.cols.flat() : [])) counts[u] = (counts[u] || 0) + 1;
    let best = "", bestN = 0;
    for (const u in counts) if (counts[u] > bestN) { bestN = counts[u]; best = u; }
    return best;
  }

  // ── Unit-type DATA (no palette UI — adding happens by clicking a ＋ slot in the grid, like the game) ──
  // S.palette.loaded is set only on SUCCESS so a cold-start failure can retry (openUnitPicker re-kicks it —
  // same latch-class fix as the equipment tab). #palette-retry
  async function loadPalette() {
    const mp = modPath();
    if (!mp) return;
    let data, eq;
    try {
      [data, eq] = await Promise.all([
        fetch("/api/subunits?modPath=" + encodeURIComponent(mp)).then((r) => r.json()),
        fetch("/api/equipment/list?modPath=" + encodeURIComponent(mp)).then((r) => r.json()).catch(() => ({})),
      ]);
    } catch (_) { return; }
    if (!data || !data.ok) return;
    S.palette.loaded = true;
    const list = data.subunits || [];
    S.palette.byKey = {};
    S.palette.byKeyLC = {}; // lower-cased alias index — HOI4 sub-unit keys are case-insensitive. #unit-key-case
    for (const s of list) { S.palette.byKey[s.key] = s; S.palette.byKeyLC[String(s.key).toLowerCase()] = s; }
    S.palette.line = list.filter((s) => !s.isSupport);
    S.palette.support = list.filter((s) => s.isSupport);
    // Equipment stats by id — so a battalion's attack/defense (which come from its equipment) show in the panel.
    S.palette.equip = {};
    for (const e of ((eq && eq.equipment) || [])) S.palette.equip[e.id] = e;
    renderDesigner(); // re-render so unit icons + stats resolve now the sub-unit data is in
  }
  // Feedback line in the designer's status area (auto-fades).
  let _statusTimer = null;
  function flashArmyStatus(msg, color) {
    const st = $("armySaveStatus"); if (!st) return;
    st.style.color = color || "#8b949e"; st.textContent = msg;
    if (_statusTimer) clearTimeout(_statusTimer);
    _statusTimer = setTimeout(() => { if (st.textContent === msg) st.textContent = ""; }, 2600);
  }
  // Say plainly that this country's army lives in more than one file and only one of them is being edited.
  // Without it, saving one DLC branch looked like saving the army — the other branch keeps whatever it had,
  // and players on that DLC get the old one. #army-dlc-variant-silent
  function renderArmyVariantWarning() {
    const warn = $("armyVariantWarn");
    if (!warn) return;
    const vs = (S.landVariants || []).filter((v) => v && v.file);
    const others = vs.filter((v) => v.file !== (S.model && S.model.file));
    if (!S.country || vs.length < 2 || !others.length) { warn.style.display = "none"; warn.innerHTML = ""; return; }
    warn.innerHTML = `⚠ <b>${esc(S.country)}</b>'s army is split across ${vs.length} DLC variants. You are editing `
      + `<b>${esc((S.model && S.model.file) || "")}</b>. Saving does not change `
      + others.map((v) => `<b>${esc(v.file)}</b> (${pl(Number(v.divisions) || 0, "division")})`).join(", ")
      + ` — edit those separately if the change should apply to every DLC combination.`;
    warn.style.display = "block";
  }

  // ── Load a country's templates ──────────────────────────────────────────
  async function loadCountry(tag) {
    tag = String(tag || "").trim().toUpperCase();
    const status = $("armyCountryStatus");
    if (!/^[A-Z][A-Z0-9]{2}$/.test(tag)) { if (status) status.textContent = "Enter a 3-character tag starting with a letter (e.g. GER, Z00)."; return; }
    if (status) status.textContent = "Loading…";
    let d;
    try { d = await fetch(`/api/army?modPath=${encodeURIComponent(modPath())}&tag=${encodeURIComponent(tag)}`).then((r) => r.json()); }
    catch (e) { if (status) status.textContent = "Load failed: " + (e.message || e); return; }
    if (!d || d.ok !== true) { if (status) status.textContent = "Load failed" + (d && d.error ? ": " + d.error : "."); return; }
    S.country = tag;
    S.model = {
      file: d.file || (tag + "_nova.txt"),
      // #army-save-overwrites-an-outside-edit — the fingerprint of the file this model was built from. Sent
      // back at save so the server can refuse to merge into a file something else has changed since.
      fingerprint: d.fingerprint || "",
      templates: (d.templates || []).map((t) => {
        // COLUMN-AWARE model, exactly like the game: each of the 5 combat columns is a real regiment.
        // Group the loaded regiments by their x (clamped into the 5 columns), keep y order. #game-grid
        const cols = Array.from({ length: LINE_COLS }, () => []);
        const overflow = []; // >5×5 (mods can raise the game's defines) — keep them so an edit+save never deletes them
        (t.regiments || []).slice().sort((a, b) => (a.x - b.x) || (a.y - b.y)).forEach((r) => {
          let c = Math.max(0, Math.min(LINE_COLS - 1, Number(r.x) || 0));
          if (cols[c].length >= COL_CAP) { // overfull column in the file → spill into ANY column with room
            const free = cols.findIndex((k) => k.length < COL_CAP);
            if (free === -1) { overflow.push({ unit: r.unit, x: Number(r.x) || 0, y: Number(r.y) || 0 }); return; }
            c = free;
          }
          cols[c].push(r.unit);
        });
        const supAll = (t.support || []).slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
        return {
          name: t.name || "",
          // The name AS LOADED — the template's stable identity. It rides along unchanged through a rename so
          // the server can match this edited template to its ORIGINAL file block (preserving un-modeled fields
          // in place) instead of losing the match when the name changes. New templates carry no _origName. #tpl-identity
          _origName: t.name || "",
          cols,
          support: supAll.map((r) => r.unit).slice(0, SUPPORT_CAP),
          priority: t.priority,
          names_group: t.division_names_group || "",
          template_counter: t.template_counter,
          is_locked: t.is_locked || "",
          override_model: t.override_model || "",
          _overflowRegiments: overflow,
          _overflowSupport: supAll.slice(SUPPORT_CAP).map((r) => ({ unit: r.unit, x: Number(r.x) || 0, y: Number(r.y) || 0 })),
          _dirty: false,
        };
      }),
      divisions: d.divisions || [],
    };
    // #army-dlc-variant-silent — a country's army is often split across DLC branches (MD's GER history reads
    // `if = { limit = { has_dlc = "No Step Back" } set_oob = "GER_2000_nsb" else = { set_oob = "GER_2000_nonnsb" } }`).
    // The server has always computed landVariants for exactly this — its own comment says "so the UI can warn
    // that editing one file doesn't update the others" — and the map editor's 🪖 tool renders it. This page
    // dropped it, so editing one branch looked like editing the army. 148 of Millennium Dawn's 244 OOB
    // countries ship more than one land-bearing file, and vanilla does it too.
    S.landVariants = Array.isArray(d.landVariants) ? d.landVariants : [];
    S.selTpl = S.model.templates.length ? 0 : -1;
    renderArmyVariantWarning();
    if (status) status.textContent = `${pl(S.model.templates.length, "template")}, ${pl(S.model.divisions.length, "division")} · editing ${esc(S.model.file)}`;
    $("armyNewTplBtn").disabled = false;
    $("armySaveBtn").style.display = "";
    $("armyDeployCard").style.display = "";
    const spCard = $("armyStockpileCard"); if (spCard) spCard.style.display = "";
    const naCard = $("armyNavalAirCard"); if (naCard) naCard.style.display = "";
    setUnsaved(false); // fresh load = nothing pending
    renderTemplateList();
    renderDesigner();
    renderDeploy();
    loadStockpile();
    loadNavalAir();
  }

  // ── Starting equipment stockpile (add_equipment_to_stockpile) — seed a country's day-0 reserve. #stockpile-seed
  // Rebuild the stockpile card's variant cache (S.allVariants) + its #spVariantList datalist from a variants/all
  // payload. S.allVariants is the SOLE data source for stockpileAdd's dangling-reference guard, so it must be kept
  // live: refreshVariants() calls this after every variant create/rename/delete. Without it the cache froze at first
  // stockpile-open, so deleting a design left its name still passing the guard (→ a saved stockpile entry pointing at
  // a design that no longer exists), and a just-created design was falsely rejected as "not in this mod". #sp-variant-stale
  function rebuildStockpileVariantCache(list) {
    const raw = list || [];
    S.allVariants = Array.isArray(raw) ? raw : Object.values(raw);
    const dl = $("spVariantList"); if (!dl) return;
    // De-dupe by name+type: the same design is often declared for many countries, and the game matches a stockpile
    // entry on the NAME, so one row per distinct design is what's actually choosable.
    const seen = new Set(), opts = [];
    for (const v of S.allVariants) {
      const k = `${v.name}|${v.type}`;
      if (!v.name || seen.has(k)) continue;
      seen.add(k);
      opts.push(`<option value="${esc(v.name)}">${esc(v.tag || "")}${v.type ? " · " + esc(v.type) : ""}</option>`);
    }
    dl.innerHTML = opts.join("");
  }
  async function loadStockpile() {
    const list = $("spList"); if (!list || !S.country) return;
    if (!S._spWired) {
      S._spWired = true;
      const add = $("spAddBtn"); if (add) add.addEventListener("click", stockpileAdd);
      // #equipment-picker-blind — a visual browser beside the type-it-yourself box.
      const spBrowse = $("spBrowseBtn");
      if (spBrowse) spBrowse.addEventListener("click", () => openEquipmentBrowser({
        title: "Pick starting equipment",
        rows: S.eqBrowseRows || [],
        onPick: (id) => eqbSetInput("spType", id),
      }));
      const save = $("spSaveBtn"); if (save) save.addEventListener("click", stockpileSave);
      const prod = $("spProducer");
      if (prod && window.NovaCountryPicker) {
        NovaCountryPicker.populate(prod, { modPath: modPath(), all: true }).then(() => { prod.insertAdjacentHTML("afterbegin", '<option value="">— none —</option>'); prod.value = ""; });
      }
      // Equipment-type autocomplete from the mod's real ids (one lightweight fetch).
      fetch("/api/equipment/list?modPath=" + encodeURIComponent(modPath())).then((r) => r.json()).then((d) => {
        const dl = $("spTypeList"); if (dl && d && d.ok) dl.innerHTML = (d.equipment || []).map((e) => `<option value="${esc(e.id)}"></option>`).join("");
        // …and keep the rows for the visual browser, so Browse does not need a second fetch.
        // #equipment-picker-blind
        const eqList = (d && d.ok ? (d.equipment || []) : []);
        // Equipment art is GFX_<picture>_medium, and a TIER usually carries no picture of its own — it
        // inherits its archetype's. Measured on vanilla: GFX_<id>_medium resolves for only 74 of 308
        // entries, while resolving `picture` through the archetype covers the rest. Build the map first so
        // a tier can look its archetype up regardless of the order the list arrives in.
        const picOf = new Map(eqList.map((e) => [e.id, e.picture || ""]));
        const archOf = new Map(eqList.map((e) => [e.id, e.archetype || ""]));
        // Walk the archetype chain until a picture turns up. The previous form assigned hop = "" inside
        // the loop body, so it could only ever hop ONCE and the i < 4 bound was dead - it read as a
        // four-level walk and behaved as a single lookup.
        //
        // Measured on Millennium Dawn before changing it, this rescues nothing: 221 of 590 entries
        // resolve no picture either way, because MD's chains are one level deep and those 221 simply
        // declare no art of their own. Fixed anyway, so the code means what it says and a mod with a
        // deeper chain does not silently lose its icons. `seen` also stops an archetype that points at
        // itself, or at a cycle, from hanging the browser.
        const iconKeyFor = (e) => {
          let pic = e.picture || "";
          let hop = e.archetype || "";
          const seen = new Set();
          while (!pic && hop && !seen.has(hop)) {
            seen.add(hop);
            pic = picOf.get(hop) || "";
            hop = pic ? "" : (archOf.get(hop) || "");
          }
          return `GFX_${pic || e.id}_medium`;
        };
        S.eqIconKey = new Map(eqList.map((e) => [e.id, iconKeyFor(e)]));
        S.eqBrowseRows = eqList.map((e) => ({
          id: e.id, name: e.name || e.id, hint: e.isMod ? "this mod" : (e.isBaseMod ? "base mod" : "vanilla"),
          own: !!e.isMod, iconKey: iconKeyFor(e),
        }));
      }).catch(() => {});
      // EVERY named design in the mod, from EVERY country — you shouldn't have to remember what a variant
      // was called to seed it. MD has 827 of them. The tag + equipment ride along as the hint so two
      // countries' identically-named designs are still tellable apart. #stockpile-variant-list
      fetch("/api/equipment/variants/all?modPath=" + encodeURIComponent(modPath())).then((r) => r.json()).then((d) => {
        rebuildStockpileVariantCache((d && (d.variants || d.all)) || []);
      }).catch(() => {});
    }
    S.stockpile = [];
    S.stockpileExisting = []; // hand-written entries — read-only, never sent back. #stockpile-shows-only-the-part-nova-wrote
    S._spSavedSig = stockpileSignature([]); // the content baseline, in lockstep with the count below
    S._spSavedCount = 0; // keep the "saved" baseline in lockstep with the (now-empty) list so hasStagedStockpile can't
    S._spLoadFailed = false; // read the PREVIOUS country's count during this load window and falsely flag a removal #sp-unsaved
    // loadCountry fires this WITHOUT awaiting, so two country loads leave two stockpile GETs racing. If a stale one
    // (for the previous country) resolves last, it would leave S.stockpile holding country A's entries while
    // S.country/S.model already point at B — and a later 💾 Save would then POST {tag:B, entries:A}, overwriting B's
    // real starting stockpile. Snapshot the tag and bail if superseded, like saveArmy/deployDivisions. #toctou
    const tagAtRequest = S.country;
    try {
      const d = await fetch(`/api/army/stockpile?modPath=${encodeURIComponent(modPath())}&tag=${encodeURIComponent(tagAtRequest)}`).then((r) => r.json());
      if (S.country !== tagAtRequest) return; // a country switch superseded this load — don't touch the new country's state
      if (d && d.ok) { S.stockpile = d.entries || []; S.stockpileExisting = d.existing || []; }
      else S._spLoadFailed = true; // {ok:false} is an ERROR, not an empty stockpile — don't fall through to a false "empty"
    } catch (_) { if (S.country !== tagAtRequest) return; S._spLoadFailed = true; }
    if (S._spLoadFailed) {
      // A transient failure (mod still cold-warming, a 500, a blip) must NOT masquerade as an EMPTY stockpile —
      // otherwise the user adds one entry, Saves, and the server replaces the file's stockpile block, silently
      // wiping this country's REAL starting equipment. Show a retry (mirrors loadMioList / eqErrorRetry); the
      // _spLoadFailed flag is what makes stockpileSave refuse to overwrite (checked before it reads any count). #stockpile-load-fail
      const list = $("spList");
      if (list) { list.innerHTML = '<div class="army-empty">Couldn’t load this country’s starting stockpile (the mod may still be warming up). <button type="button" class="army-btn-sm" id="spRetryBtn">↻ Retry</button></div>'; const rb = $("spRetryBtn"); if (rb) rb.addEventListener("click", loadStockpile); }
      return;
    }
    S._spSavedCount = S.stockpile.length; // what's really in the file — so "save nothing" can tell clearing from losing
    S._spSavedSig = stockpileSignature(S.stockpile); // …and what it CONTAINS, so a swap is not mistaken for no change
    renderStockpileList();
  }
  // ── The two art boxes on a template ───────────────────────────────────────────────────────────────
  // `template_counter = 10` is NOT a frame index (Nova used to claim it was, and that it went 1=infantry,
  // 2=cavalry… — which is simply false: vanilla's own templates use 66, 84, 93, 119). The wiki is exact:
  // "template_counter = 10 … will make sure that the sprites with the name of GFX_div_templ_10_large and
  // GFX_div_templ_10_small will get used." So the ONLY valid numbers are the ones whose sprite exists — and
  // that differs per mod: vanilla declares 0-43 + 65-120 (44-64 come from the anniversary DLC), while MD
  // ships its own subuniticons.gfx adding 3050-3054 and 3100-3102. Scan, don't hardcode. #tpl-counter-list
  function updateCounterPreview() {
    const img = $("tplCounterPrev"), inp = $("tplCounter");
    if (!img || !inp) return;
    const n = String(inp.value || "").trim();
    if (!/^\d+$/.test(n)) { img.style.display = "none"; img.removeAttribute("src"); return; }
    img.style.display = "block";
    img.src = "/api/icon-image?key=" + encodeURIComponent("GFX_div_templ_" + n + "_large") + "&modPath=" + encodeURIComponent(modPath());
  }
  let _artListsLoaded = false;
  async function populateTemplateArtLists() {
    updateCounterPreview();
    if (_artListsLoaded) return; _artListsLoaded = true;
    try {
      const d = await fetch("/api/sprites?type=all&modPath=" + encodeURIComponent(modPath())).then((r) => r.json());
      const nums = [...new Set((d.sprites || [])
        .map((s) => /^GFX_div_templ_(\d+)_large$/i.exec(String(s.key || s)))
        .filter(Boolean).map((m) => Number(m[1])))].sort((a, b) => a - b);
      const dl = $("tplCounterList");
      if (dl) dl.innerHTML = nums.map((n) => `<option value="${n}">symbol ${n}</option>`).join("");
    } catch (_) {}
    // The 3D models. ~29.5k on MD, so the searchable dropdown's paging does the work — type "infantry"
    // or your country's tag and it narrows instantly. #tpl-model-list
    try {
      const d = await fetch("/api/army/entities?modPath=" + encodeURIComponent(modPath())).then((r) => r.json());
      const dl = $("tplModelList");
      if (dl && d && d.ok) dl.innerHTML = (d.entities || []).map((e) => `<option value="${esc(e)}"></option>`).join("");
    } catch (_) {}
  }
  function renderStockpileList() {
    const el = $("spList"); if (!el) return;
    const sp = S.stockpile || [];
    // #stockpile-shows-only-the-part-nova-wrote — entries the modder wrote by hand, which Nova does not
    // manage and must not move. Listing them stops the card claiming a country has no starting equipment
    // when the file hands it 150 of everything, and stops the modder adding a second copy of what is
    // already there. Read-only on purpose: 878 of the 1,005 in the installed corpus sit inside an `if` or a
    // dated block, and lifting one out of its condition would change what the game does.
    const existing = S.stockpileExisting || [];
    const existingHtml = !existing.length ? "" : (
      `<div class="army-empty" style="padding-bottom:2px;">Already in this country’s history file — written by hand, so Nova leaves it exactly where it is:</div>` +
      existing.map((e) => `<div class="deploy-row" style="opacity:.75;"><span class="dr-tpl" title="${esc(e.type)}">${esc(e.type)}${e.variant_name ? ' · "' + esc(e.variant_name) + '"' : ""}</span><span class="dr-meta">× ${Number(e.amount) || 0}${e.producer ? " · from " + esc(e.producer) : ""}${e.where ? " · " + esc(e.where) : ""}${e.line ? " · line " + Number(e.line) : ""}</span></div>`).join("") +
      (sp.length ? `<div class="army-empty" style="padding-top:10px;">Added by Nova:</div>` : "")
    );
    if (!sp.length) {
      el.innerHTML = existingHtml + `<div class="army-empty">${existing.length ? "Nova hasn’t added any of its own — use the row above to add one." : "No starting stockpile yet — add a type + amount above."}</div>`;
      return;
    }
    // The amount and the remove × are both "×", and with nothing between them the row read
    // "infantry_equipment_1×14000×". Space the count so the two stop running together.
    el.innerHTML = existingHtml + sp.map((e, i) => `<div class="deploy-row"><span class="dr-tpl" title="${esc(e.type)}">${esc(e.type)}${e.variant_name ? ' · "' + esc(e.variant_name) + '"' : ""}</span><span class="dr-meta">× ${Number(e.amount) || 0}${e.producer ? " · from " + esc(e.producer) : ""}</span><span class="dr-del" data-i="${i}" title="Remove">×</span></div>`).join("");
    el.querySelectorAll(".dr-del").forEach((x) => x.addEventListener("click", () => { (S.stockpile || []).splice(Number(x.dataset.i), 1); renderStockpileList(); }));
  }
  // True when the row has anything typed in it — used to stop Save from throwing a filled row away.
  function stockpileRowFilled() {
    return !!(($("spType") && $("spType").value.trim()) || ($("spVariant") && $("spVariant").value.trim()) || ($("spAmount") && $("spAmount").value.trim()));
  }
  // Returns "" on success, else why the row can't be added. Nonsense must not reach the file.
  function stockpileAdd(silent) {
    const st = $("spStatus");
    const warn = (m) => { if (st && !silent) { st.style.color = "#d29922"; st.textContent = m; } return m; };
    const type = ($("spType").value || "").trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(type)) return warn("Pick an equipment type first — click the box for the list.");
    const amount = Math.max(0, Math.floor(Number($("spAmount").value) || 0));
    // An amount of 0 writes an entry that hands the country nothing — that is the "saved nonsense" case.
    if (amount < 1) return warn("Enter how many — an amount of 0 would add nothing.");
    const variant_name = ($("spVariant").value || "").trim() || undefined;
    // A variant_name the mod doesn't define is a DANGLING REFERENCE: the game looks for a design by that
    // exact name, doesn't find it, and the entry quietly does nothing. Nothing legitimate names a variant
    // that isn't there, so refuse it at the point of entry rather than writing a dud into the file.
    if (variant_name && Array.isArray(S.allVariants) && S.allVariants.length) {
      const hit = S.allVariants.filter((v) => v.name === variant_name);
      if (!hit.length) return warn(`No design is named “${variant_name}” anywhere in this mod. Click the box to pick one, or clear it to stockpile the plain equipment.`);
      if (!hit.some((v) => v.type === type)) return warn(`“${variant_name}” is a design of ${hit[0].type}, not ${type} — they must match, or the game won't find it.`);
    }
    const producer = ($("spProducer") && $("spProducer").value || "").trim().toUpperCase() || undefined;
    (S.stockpile = S.stockpile || []).push({ type, variant_name, amount, producer });
    $("spType").value = ""; $("spVariant").value = ""; $("spAmount").value = "";
    if (st) { st.style.color = "#8b949e"; st.textContent = "Added — don't forget 💾 Save stockpile."; }
    renderStockpileList();
    return "";
  }
  async function stockpileSave() {
    const st = $("spStatus"), btn = $("spSaveBtn");
    if (!S.country) return;
    // If the stockpile GET failed, the list on screen is NOT this country's real stockpile — saving would overwrite
    // its actual starting equipment with a stale/empty view. Refuse until a successful (re)load. #stockpile-load-fail
    if (S._spLoadFailed) { if (st) { st.style.color = "#f85149"; st.textContent = "This country’s stockpile didn’t load — ↻ Retry above before saving, so you don’t overwrite its real starting equipment."; } return; }
    // Save used to write ONLY the rows you had pressed ＋ Add on. Fill the row, hit Save, and it threw your
    // typing away and reported a green "✓ Saved 0 entries" — technically true, completely baffling. A filled
    // row is obviously meant to be saved, so add it first; if it can't be added, say why and save NOTHING.
    // #stockpile-lost-row
    if (stockpileRowFilled()) {
      const why = stockpileAdd();
      if (why) return; // stockpileAdd already explained it
    }
    const entries = S.stockpile || [];
    // "Saved 0 entries" is not a success. Either the user meant to clear the stockpile (which is a real
    // thing to want) or they lost work — so make them say which.
    if (!entries.length) {
      const had = (S._spSavedCount || 0) > 0;
      if (!had) { if (st) { st.style.color = "#d29922"; st.textContent = "Nothing to save — add a type and an amount above first."; } return; }
      // Say what will actually go. Nova only owns its own region — the hand-written entries listed above it
      // stay exactly where they are, and promising to remove "every" entry was a lie in both directions:
      // it overstated the damage, and it would have had the user hunting for entries that never left.
      // #stockpile-shows-only-the-part-nova-wrote
      const kept = (S.stockpileExisting || []).length;
      if (!confirm(kept
        ? `This will remove the ${S._spSavedCount} starting-stockpile ${S._spSavedCount === 1 ? "entry" : "entries"} Nova added to this country. The ${kept} written by hand in the history file ${kept === 1 ? "stays" : "stay"} untouched. Continue?`
        : "This will REMOVE every starting-stockpile entry from this country. Continue?")) return;
    }
    btn.disabled = true; if (st) { st.style.color = "#8b949e"; st.textContent = "Saving…"; }
    try {
      const d = await fetch("/api/army/stockpile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: modPath(), tag: S.country, entries }) }).then((r) => r.json());
      if (d && d.ok) {
        S._spSavedCount = d.count;
        if (st) { st.style.color = (d.warnings || []).length ? "#d29922" : "#3fb950"; st.textContent = `✓ Saved ${d.count} ${d.count === 1 ? "entry" : "entries"} → ${d.file}`; }
        // The dangling-design warning: the entry saved fine and hands the country nothing.
        // #warnings-were-computed-and-thrown-away
        showSaveWarnings("spStatus", d.warnings);
        // Re-read from the file so the list shows what's ACTUALLY in the mod now, not just what we sent —
        // no page refresh needed to see the country's real stockpile. #stockpile-live
        await loadStockpile();
      } else if (st) { st.style.color = "#f85149"; st.textContent = (d && d.error) || "Save failed."; }
    } catch (e) { if (st) { st.style.color = "#f85149"; st.textContent = e.message; } }
    finally { btn.disabled = false; }
  }

  // Fill the ship + aircraft equipment lists from the classified endpoint. Each option's LABEL carries the
  // hint the novaCombo dropdown shows on the right — the country's own design, "generic (any DLC)", or which
  // DLC a bare modular hull needs — so picking the right thing is obvious. #oob-list
  async function loadOobEquipmentLists() {
    let d;
    try { d = await fetch(`/api/army/oob-equipment?modPath=${encodeURIComponent(modPath())}&tag=${encodeURIComponent(S.country || "")}`).then((r) => r.json()); }
    catch (_) { return; }
    if (!d || !d.ok) return;
    const hint = (row) => row.ownDesign ? `★ ${S.country || ""} design`
      : row.generic ? "generic — any DLC"
      : row.dlc ? `needs ${row.dlc}` : "modular — needs the designer DLC";
    // own designs first (most relevant), then generics, then modular — each row's <option> label is the hint.
    const fill = (listId, own, rest) => {
      const dl = $(listId); if (!dl) return;
      const seen = new Set();
      const rows = [...own, ...rest].filter((r) => r.id && !seen.has(r.id) && seen.add(r.id));
      // sort: own designs, then generic, then modular; era within each
      rows.sort((a, b) => (b.ownDesign ? 1 : 0) - (a.ownDesign ? 1 : 0) || (b.generic ? 1 : 0) - (a.generic ? 1 : 0) || (a.year || 9999) - (b.year || 9999));
      dl.innerHTML = rows.map((r) => `<option value="${esc(r.id)}">${escLoc(r.name || r.id)} · ${esc(hint(r))}</option>`).join("");
    };
    fill("naNavalEqList", d.ownShips || [], d.ships || []);
    fill("naAirEqList", d.ownAir || [], d.air || []);
    // …and the same rows for the visual browser. The hint the datalist shows as its option label becomes the
    // tile's caption, so the two pickers say exactly the same thing about a design. #equipment-picker-blind
    const rowsFor = (own, rest) => {
      const seen = new Set();
      return [...own, ...rest].filter((r) => r && r.id && !seen.has(r.id) && seen.add(r.id))
        // Reuse the resolved sprite key from the equipment list when it has loaded; these are the same ids.
        // `parts` is what the thing CONSISTS OF — a design's real modules, or the headline stats of a plain
        // hull, whichever the server could resolve. #ship-composition
        .map((r) => ({ id: r.id, name: r.name || r.id, hint: hint(r), own: !!r.ownDesign,
          iconKey: (S.eqIconKey && S.eqIconKey.get(r.id)) || "",
          modules: Array.isArray(r.modules) ? r.modules : [], stats: Array.isArray(r.stats) ? r.stats : [] }));
    };
    S.naNavalRows = rowsFor(d.ownShips || [], d.ships || []);
    S.naAirRows = rowsFor(d.ownAir || [], d.air || []);
  }

  // ── Starting NAVY / AIR force (fleets → ships, air wings). Writes the OOB file AND wires
  // set_naval_oob / set_air_oob so it actually loads. Mirrors the stockpile card; operates on S.country. #naval-air
  async function loadNavalAir(preserveStaged) {
    const card = $("armyNavalAirCard"); if (!card || !S.country) return;
    const tagEl = $("naTag"); if (tagEl) tagEl.textContent = S.country;
    if (!S._naWired) {
      S._naWired = true;
      S.na = { domain: "naval", ships: [], groups: [] };
      card.querySelectorAll(".na-dom").forEach((b) => b.addEventListener("click", () => naSetDomain(b.dataset.dom)));
      const addShip = $("naAddShipBtn"); if (addShip) addShip.addEventListener("click", naAddShip);
      // #equipment-picker-blind — the same browser for the two OOB pickers. "Aircraft should offer real
      // in-game or user-made aircraft" was the report; these rows are exactly that list, now with pictures.
      // #navy-type-and-equipment-unexplained — WHY BROWSE DOES NOT FILL THE "TYPE" BOX.
      //
      // Reported as "why choose an equipment type when I can just browse?". The two boxes are genuinely
      // different — HOI4 writes a ship as `definition = destroyer equipment = { destroyer_2 = { … } }`,
      // where definition is the ROLE and equipment is the HULL — and they must agree. So filling Type from
      // the hull the user just picked looks like the obvious fix. It was tried and backed out:
      //
      // The equipment's own archetype is NOT the definition. Measured on Millennium Dawn's USA list:
      //     convoy_1              -> archetype "convoy"              (a real definition, by luck)
      //     battleship_hull_1     -> archetype "battleship_hull_0"   (an archetype EQUIPMENT, not a role)
      // The valid definitions are destroyer, light_cruiser, heavy_cruiser, battle_cruiser, battleship,
      // carrier, submarine — and "battleship_hull_0" is none of them. Writing it would produce a ship the
      // game cannot resolve, which is worse than the blank box the user has to fill in themselves.
      //
      // Deriving "battleship" from "battleship_hull_0" by prefix is the obvious next idea and is the same
      // mistake as #focus-icon-prefix: a naming pattern is a vanilla CONVENTION, not an engine rule, and a
      // total conversion is free to name its hulls anything. Doing this properly needs the equipment ->
      // sub_unit mapping the OOB writer uses, not a string match.
      //
      // Until then the two boxes explain themselves in their tooltips, which is what was actually confusing.
      const shipBrowse = $("naShipEqBrowseBtn");
      if (shipBrowse) shipBrowse.addEventListener("click", () => openEquipmentBrowser({
        title: "Pick a ship", rows: S.naNavalRows || [], onPick: (id) => eqbSetInput("naShipEq", id),
      }));
      const airBrowse = $("naAirEqBrowseBtn");
      if (airBrowse) airBrowse.addEventListener("click", () => openEquipmentBrowser({
        title: "Pick an aircraft", rows: S.naAirRows || [], onPick: (id) => eqbSetInput("naAirEq", id),
      }));
      // #airbase-state-owner — an air wing sits at an air base in a STATE, and the box asked you to know its
      // numeric id. Offer the list, with the owner's OWN states first: a wing based in someone else's
      // territory is almost always a typo, and there are thousands of states to mistype.
      const stBrowse = $("naStateBrowseBtn");
      if (stBrowse) stBrowse.addEventListener("click", () => openStateBrowser());
      const addGroup = $("naAddGroupBtn"); if (addGroup) addGroup.addEventListener("click", naAddGroup);
      const save = $("naSaveBtn"); if (save) save.addEventListener("click", naSave);
      if (window.NovaCountryPicker) {
        for (const id of ["naShipOwner", "naAirOwner"]) {
          const sel = $(id); if (sel) NovaCountryPicker.populate(sel, { modPath: modPath(), all: true }).then(() => { sel.value = S.country; });
        }
      }
      // Ship / aircraft lists, classified server-side (/api/army/oob-equipment): only DEPLOYABLE equipment
      // (no chassis), split by real domain (naval bombers go to AIR, not ships), each labelled so the user
      // knows what works without the DLC — and the country's OWN designs on top. #oob-list
      loadOobEquipmentLists();
      // Ship `definition` must name a real unit type. super_heavy_battleship is NOT one — it exists only as a
      // 3D model / special-project id; the super-heavy BB is fielded with definition = battleship. Suggesting it
      // led modders to write a definition HOI4 can't spawn. These 7 are the real vanilla naval definitions (a
      // total-conversion like MD adds its own — corvette/frigate/… — which the modder types directly). #ship-def
      const defDl = $("naDefList"); if (defDl) defDl.innerHTML = ["destroyer", "light_cruiser", "heavy_cruiser", "battle_cruiser", "battleship", "carrier", "submarine"].map((x) => `<option value="${x}"></option>`).join("");
    }
    // Re-sync the owner default to the CURRENT country on EVERY load — the populate above runs only once, so
    // after a country switch the selects would otherwise keep the previously-loaded tag and stage the wrong
    // owner. The old `some(...)` guard only re-synced when the tag was IN the catalog, so switching to an
    // out-of-catalog tag (a country with no file yet) left the select STUCK on the previous country and staged
    // ships/air-groups under the WRONG owner. Set unconditionally, injecting the tag as a visible option when the
    // catalog lacks it (cleaned up each load so injected tags don't accumulate). #naval-owner-stale
    for (const oid of ["naShipOwner", "naAirOwner"]) {
      const sel = $(oid);
      if (!sel || !S.country) continue;
      [...sel.querySelectorAll("option[data-na-synth]")].forEach((o) => o.remove());
      if (![...sel.options].some((o) => o.value === S.country)) {
        const opt = document.createElement("option"); opt.value = S.country; opt.textContent = S.country; opt.setAttribute("data-na-synth", "1"); sel.appendChild(opt);
      }
      sel.value = S.country;
    }
    // Fresh entry (country switch / card open) resets BOTH staged buffers. A post-SAVE reload passes preserveStaged
    // so it does NOT wipe the OTHER domain's still-unsaved staged units (naSave already cleared the saved one). #na-stage-preserve
    if (!preserveStaged) { S.na.ships = []; S.na.groups = []; }
    naSetDomain(S.na.domain || "naval");
    renderNaList();
    loadOobEquipmentLists(); // per-country: the "own designs" depend on the current tag
    // Reset the summary BEFORE the fetch so a failure (or a country switch) never leaves the PREVIOUS country's
    // fleet/air counts on screen under the new country's header — an actively misleading display. #na-current-stale
    const cur0 = $("naCurrent"); if (cur0) cur0.textContent = "Checking this country’s current navy/air…";
    const naTagAtReq = S.country;
    try {
      const g = await fetch(`/api/army/naval-air?modPath=${encodeURIComponent(modPath())}&tag=${encodeURIComponent(naTagAtReq)}`).then((r) => r.json());
      if (S.country !== naTagAtReq) return; // a country switch superseded this — don't write stale text
      const cur = $("naCurrent");
      if (cur) {
        if (g && g.ok) {
          const bits = [];
          if (g.navy && g.navy.navy) bits.push(`${g.navy.navy} fleet block${g.navy.navy === 1 ? "" : "s"}`);
          if (g.air && g.air.airWings) bits.push(`${g.air.airWings} air-wing block${g.air.airWings === 1 ? "" : "s"}`);
          cur.textContent = bits.length ? `Currently has: ${bits.join(" · ")}.` : "No Nova navy/air yet.";
        } else cur.textContent = "Couldn’t check this country’s current navy/air.";
      }
    } catch (_) { if (S.country !== naTagAtReq) return; const cur = $("naCurrent"); if (cur) cur.textContent = "Couldn’t check this country’s current navy/air."; }
  }
  function naSetDomain(dom) {
    S.na = S.na || { ships: [], groups: [] };
    S.na.domain = dom === "air" ? "air" : "naval";
    const card = $("armyNavalAirCard"); if (!card) return;
    card.querySelectorAll(".na-dom").forEach((b) => b.classList.toggle("na-dom-sel", b.dataset.dom === S.na.domain));
    const navy = $("naNavyForm"), air = $("naAirForm");
    if (navy) navy.style.display = S.na.domain === "naval" ? "" : "none";
    if (air) air.style.display = S.na.domain === "air" ? "" : "none";
    const sd = $("naSaveDom"); if (sd) sd.textContent = S.na.domain === "air" ? "air force" : "navy";
    renderNaList();
  }
  function renderNaList() {
    const el = $("naList"); if (!el) return;
    const dom = (S.na && S.na.domain) || "naval";
    const items = dom === "air" ? (S.na.groups || []) : (S.na.ships || []);
    if (!items.length) { el.innerHTML = `<div class="army-empty">Add ${dom === "air" ? "air groups" : "ships"} above, then 💾 Save.</div>`; return; }
    el.innerHTML = items.map((it, i) => dom === "air"
      // The same spacing the stockpile rows got: .dr-tpl is flex:1 and .dr-meta sits straight after it, so an
      // equipment name that fills the row runs into the count — "fighter_equipment_1×10". One space, same fix,
      // and the count check in test-deploy-tiles-per-division.js now covers every row that starts this way.
      ? `<div class="deploy-row"><span class="dr-tpl" title="${esc(it.equipment)}">✈️ ${esc(it.equipment)}</span><span class="dr-meta">× ${Number(it.amount) || 0} · ${esc(it.owner)} · state ${esc(String(it.state || "?"))}</span><span class="dr-del" data-i="${i}" title="Remove">×</span></div>`
      : `<div class="deploy-row"><span class="dr-tpl" title="${esc(it.name)}">🚢 ${esc(it.name)}</span><span class="dr-meta">${esc(it.definition)} · ${esc(it.equipment)} ×${it.amount} · ${esc(it.owner)}</span><span class="dr-del" data-i="${i}" title="Remove">×</span></div>`
    ).join("");
    el.querySelectorAll(".dr-del").forEach((x) => x.addEventListener("click", () => { items.splice(Number(x.dataset.i), 1); renderNaList(); }));
  }
  function naWarn(msg) { const st = $("naStatus"); if (st) { st.style.color = "#d29922"; st.textContent = msg; } }
  // #warnings-were-computed-and-thrown-away — both army save endpoints build a `warnings` array for the
  // failures HOI4 does not report: a fleet based on a province that is not coastal land, an air wing keyed
  // on a state that does not exist, a stockpile entry pinned to a design no mod defines, an OOB reference a
  // dated block overrules. Every one of them is a case where the file loads and the units simply never
  // appear — which is exactly when a modder needs telling, because nothing else will tell them. The client
  // read none of them: `warnings` appeared zero times in this file. They went to the browser and stopped.
  //
  // A <span> of status text is the wrong shape for a paragraph, so give them their own block under it,
  // created on demand so no HTML change is needed and an older page cannot lose them.
  function showSaveWarnings(statusId, warnings) {
    const st = $(statusId); if (!st) return;
    const id = statusId + "Warnings";
    let box = $(id);
    if (!box) {
      box = document.createElement("div");
      box.id = id;
      // Both status spans sit in a `display:flex; flex-wrap:wrap` row, so a plain block lands BESIDE the
      // status text and runs off the edge of the card — measured in the page, not guessed. flex-basis:100%
      // makes it take its own line there, and width:100% is a no-op in a normal block container.
      box.style.cssText = "flex:0 0 100%;width:100%;margin-top:6px;color:#d29922;font-size:12px;line-height:1.5;";
      (st.parentNode || document.body).insertBefore(box, st.nextSibling);
    }
    const list = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
    box.textContent = "";
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    for (const w of list) {
      const line = document.createElement("div");
      line.textContent = "⚠ " + String(w);
      box.appendChild(line);
    }
  }
  // Exposed so this can be exercised in the real page rather than only asserted at source level — the same
  // convention as __novaBrushStampCentres. A warning surface that throws is a warning surface that does not
  // exist, and nothing about "the client never showed these" is provable from a regex.
  window.__novaShowSaveWarnings = showSaveWarnings;
  function naAddShip() {
    const name = ($("naShipName").value || "").trim() || "Ship";
    const definition = ($("naShipDef").value || "").trim();
    const equipment = ($("naShipEq").value || "").trim();
    const amount = Math.max(1, Math.floor(Number($("naShipAmount").value) || 1));
    const owner = (($("naShipOwner").value || S.country) || "").trim().toUpperCase();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(definition)) { naWarn("Enter a ship type (e.g. destroyer)."); return; }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(equipment)) { naWarn("Enter a ship equipment archetype (e.g. destroyer_1)."); return; }
    // #oob-references-equipment-that-does-not-exist — the check above only proves this LOOKS like a PDX
    // token. The stockpile card refuses a design no mod defines and says where to find a real one; this
    // wrote whatever was typed straight into the OOB, where the game cannot resolve it. Guarded only once
    // the list has loaded, exactly as stockpileAdd does, so a slow fetch never blocks real input.
    if (Array.isArray(S.naNavalRows) && S.naNavalRows.length && !S.naNavalRows.some((r) => r.id === equipment)) {
      naWarn(`No ship equipment named “${equipment}” exists in this mod or the base game — click Browse to pick a real one.`);
      return;
    }
    if (!/^[A-Za-z][A-Za-z0-9]{2}$/.test(owner)) { naWarn("Owner must be a 3-letter country tag."); return; }
    (S.na.ships = S.na.ships || []).push({ name, definition, equipment, amount, owner });
    $("naShipName").value = ""; $("naShipAmount").value = "";
    const st = $("naStatus"); if (st) { st.style.color = "#8b949e"; st.textContent = "Ship staged — 💾 Save navy when ready."; }
    renderNaList();
  }
  function naAddGroup() {
    const equipment = ($("naAirEq").value || "").trim();
    const amount = Math.max(1, Math.floor(Number($("naAirAmount").value) || 1)); // floor to 1 like naAddShip — a 0-plane wing is a dead OOB entry #air-amount-floor
    const owner = (($("naAirOwner").value || S.country) || "").trim().toUpperCase();
    const state = Math.max(0, Math.floor(Number($("naState").value) || 0));
    if (!state) { naWarn("Enter the air-base state id."); return; }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(equipment)) { naWarn("Enter an aircraft equipment archetype (e.g. fighter_equipment_1)."); return; }
    // #oob-references-equipment-that-does-not-exist — same guard as the ship path above, and for the same
    // reason: an air wing pointing at an archetype nothing defines is an OOB the game cannot load.
    if (Array.isArray(S.naAirRows) && S.naAirRows.length && !S.naAirRows.some((r) => r.id === equipment)) {
      naWarn(`No aircraft equipment named “${equipment}” exists in this mod or the base game — click Browse to pick a real one.`);
      return;
    }
    if (!/^[A-Za-z][A-Za-z0-9]{2}$/.test(owner)) { naWarn("Owner must be a 3-letter country tag."); return; }
    S.na.state = state; // keep as the input default for the next group
    (S.na.groups = S.na.groups || []).push({ equipment, amount, owner, state }); // per-GROUP state — see naSave grouping #air-per-state
    $("naAirAmount").value = "";
    const st = $("naStatus"); if (st) { st.style.color = "#8b949e"; st.textContent = "Group staged — 💾 Save air force when ready."; }
    renderNaList();
  }
  async function naSave() {
    const st = $("naStatus"), btn = $("naSaveBtn");
    if (!S.country) return;
    const dom = (S.na && S.na.domain) || "naval";
    let body;
    if (dom === "air") {
      if (!S.na.groups || !S.na.groups.length) { naWarn("Add at least one air group."); return; }
      // Group staged groups by their OWN state → one air wing per distinct state (the server supports many).
      // Previously everything went into a single wing keyed on S.na.state, silently moving groups to the last state.
      const byState = {};
      for (const g of S.na.groups) { const k = Number(g.state) || S.na.state; (byState[k] = byState[k] || []).push({ equipment: g.equipment, amount: g.amount, owner: g.owner }); }
      const airWings = Object.keys(byState).map((k) => ({ state: Number(k), groups: byState[k] }));
      body = { modPath: modPath(), tag: S.country, domain: "air", airWings };
    } else {
      if (!S.na.ships || !S.na.ships.length) { naWarn("Add at least one ship."); return; }
      const fleetName = ($("naFleetName").value || "").trim() || "Fleet";
      const navalBase = Math.max(0, Math.floor(Number($("naNavalBase").value) || 0));
      body = { modPath: modPath(), tag: S.country, domain: "naval", fleets: [{ name: fleetName, naval_base: navalBase, ships: S.na.ships }] };
    }
    // Snapshot EXACTLY the staged items that go into this request (by reference). The ＋ Add ship/group buttons
    // stay live during the await, so a unit staged mid-flight must NOT be wiped by a blanket reset — on success we
    // remove only the items we actually sent, leaving anything added meanwhile still staged. #na-inflight-race
    const sentItems = ((dom === "air" ? S.na.groups : S.na.ships) || []).slice();
    btn.disabled = true; if (st) { st.style.color = "#8b949e"; st.textContent = "Saving…"; }
    try {
      const d = await fetch("/api/army/naval-air", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (d && d.ok) {
        if (st) {
          let msg = `✓ Saved → ${d.file} · wired set_${dom === "air" ? "air" : "naval"}_oob = "${d.ref}"`;
          if (d.replacedExisting) msg += " · ⚠ replaced this country's existing OOB reference";
          st.style.color = d.replacedExisting ? "#d29922" : "#3fb950"; st.textContent = msg;
        }
        // A green tick over a reference the game will discard is worse than no tick at all.
        // #warnings-were-computed-and-thrown-away #the-oob-reference-a-dated-block-overrules
        showSaveWarnings("naStatus", d.warnings);
        if (st && (d.warnings || []).length) st.style.color = "#d29922";
        // Remove ONLY the just-persisted items from the just-saved domain — units staged mid-save (not in the
        // request) survive, and the OTHER domain's staged units are untouched. #na-inflight-race #na-stage-preserve
        const sent = new Set(sentItems);
        if (dom === "air") S.na.groups = (S.na.groups || []).filter((g) => !sent.has(g));
        else S.na.ships = (S.na.ships || []).filter((x) => !sent.has(x));
        renderNaList(); loadNavalAir(true);
      } else if (st) { st.style.color = "#f85149"; st.textContent = (d && d.error) || "Save failed."; }
    } catch (e) { if (st) { st.style.color = "#f85149"; st.textContent = e.message; } }
    finally { btn.disabled = false; }
  }

  function renderTemplateList() {
    const el = $("armyTemplateList"); if (!el) return;
    if (!S.country) { el.innerHTML = '<div class="army-empty">Load a country to see its templates.</div>'; return; }
    if (!S.model.templates.length) { el.innerHTML = '<div class="army-empty">No templates yet — ＋ New template.</div>'; return; }
    el.innerHTML = S.model.templates.map((t, i) =>
      `<div class="tpl-row${i === S.selTpl ? " active" : ""}${t._dirty ? " dirty" : ""}" data-i="${i}">`
      + `<span class="tpl-name" title="${esc(t.name || "(unnamed)")}">${esc(t.name || "(unnamed)")}</span>`
      + `<span class="tpl-meta">${(() => { const p = []; const n = lineUnits(t).length; if (n) p.push(n + "× line"); if (t.support.length) p.push(t.support.length + "× support"); return p.join(" · ") || "empty"; })()}</span>`
      // #military-cannot-duplicate — a template is the most laborious thing in the app to rebuild by hand:
      // five regiment columns plus support. Every other maker has Duplicate; this one made you do it again.
      + `<button type="button" class="tpl-dup" data-dup="${i}" title="Duplicate this template">⧉</button></div>`
    ).join("");
    el.querySelectorAll(".tpl-row").forEach((row) => row.addEventListener("click", () => { S.selTpl = +row.dataset.i; renderTemplateList(); renderDesigner(); }));
    // stopPropagation: the whole row selects on click, so without it duplicating would also re-select.
    el.querySelectorAll(".tpl-dup").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); duplicateTemplate(+b.dataset.dup); }));
  }

  // All combat battalions of a template, flattened across its 5 regiment columns.
  const lineUnits = (t) => (t && t.cols ? t.cols.flat() : []);

  function newTemplate() {
    if (!S.country) return;
    let name = "New Template", n = 2;
    while (S.model.templates.some((t) => t.name === name)) name = `New Template ${n++}`;
    S.model.templates.push({ name, cols: Array.from({ length: LINE_COLS }, () => []), support: [], priority: undefined, names_group: "", template_counter: undefined, is_locked: "", override_model: "", _dirty: true });
    S.selTpl = S.model.templates.length - 1;
    setUnsaved(true); // a created template is unsaved work — glow + leave/switch guards must cover it
    renderTemplateList(); renderDesigner(); renderDeploy(); // deploy's Template dropdown must see the new name
    updateCountStatus(); // the header "N templates …" count must move with the add (mirrors the division flows)
  }

  // #military-cannot-duplicate — COPY A TEMPLATE INSTEAD OF REBUILDING IT.
  //
  // A modder builds "1936 Infantry", then wants "1940 Infantry" with two battalions changed. Every other
  // maker in Nova has a Duplicate (Events, Decisions, Characters, Spirits, Focus Tree, Research); the
  // Military tab — the newest one — had none, so the only route was to make a new template and lay out the
  // whole regiment grid again.
  //
  // ⚠️ THE COPY MUST NOT INHERIT _origName. That field is the template's stable identity: the save matches
  // it against the original block in the file so a RENAME edits that block rather than adding a second one
  // (#tpl-identity). A copy carrying it would make the save rewrite the ORIGINAL template instead of adding
  // the new one — the copy would eat its source. It is deleted below, so the copy saves as a new block.
  //
  // Everything else IS carried, including _overflowRegiments / _overflowSupport — the battalions a
  // raised-defines mod has beyond the five columns the grid can draw. A "duplicate" that quietly dropped
  // them would not be a duplicate.
  function duplicateTemplate(i) {
    const srcT = S.model.templates[i];
    if (!srcT) return;
    const base = srcT.name || "Template";
    let name = base + " (copy)", n = 2;
    while (S.model.templates.some((t) => t.name === name)) name = `${base} (copy ${n++})`;
    const copy = JSON.parse(JSON.stringify(srcT));
    copy.name = name;
    delete copy._origName; // see above — identity belongs to the original
    copy._dirty = true;
    S.model.templates.splice(i + 1, 0, copy); // next to its source, where the eye already is
    S.selTpl = i + 1;
    setUnsaved(true);
    renderTemplateList(); renderDesigner(); renderDeploy(); // the deploy dropdown must see the new name
    // No status line here: updateCountStatus() above already rewrites armyCountryStatus with the new
    // counts, so anything written after it would be overwritten in the same tick. The copy is selected and
    // on screen, which is the feedback that matters.
    updateCountStatus();
  }

  // Tiny stat icons (16px) so the panel reads like the in-game division stat column.
  const SICON = {
    width: '<path d="M2 8H14M2 8l3-3M2 8l3 3M14 8l-3-3M14 8l-3 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    hp: '<path d="M8 14S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 8-6 8z" fill="currentColor"/>',
    org: '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/>',
    soft: '<circle cx="8" cy="8" r="5.5" fill="currentColor" opacity="0.9"/>',
    hard: '<rect x="2.5" y="6" width="11" height="5" rx="1" fill="currentColor"/><rect x="6" y="3.5" width="4" height="3" fill="currentColor"/>',
    air: '<path d="M8 2l1.5 5H14l-4 3 1.5 5L8 11l-3.5 4L6 10 2 7h4.5z" fill="currentColor"/>',
    def: '<path d="M8 2l5 2v4c0 3.5-2.5 5.5-5 6.5C5.5 13.5 3 11.5 3 8V4z" fill="currentColor"/>',
    bt: '<path d="M3 13L13 3M13 3H8M13 3v5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    armor: '<path d="M8 2l5 2v4c0 3.5-2.5 5.5-5 6.5C5.5 13.5 3 11.5 3 8V4z" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 5.5v5" stroke="currentColor" stroke-width="1.2"/>',
    pierce: '<path d="M2 14L14 2M14 2H9M14 2v5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M2 14l2-.5-1.5-1.5z" fill="currentColor"/>',
    speed: '<path d="M3 4l4 4-4 4M8 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
    recon: '<path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/>',
    mp: '<circle cx="8" cy="5" r="2.6" fill="currentColor"/><path d="M3 14c0-3 2.5-4.5 5-4.5s5 1.5 5 4.5z" fill="currentColor"/>',
    supply: '<path d="M8 2l6 3v6l-6 3-6-3V5z" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M2 5l6 3 6-3M8 8v7" stroke="currentColor" stroke-width="1.1" fill="none"/>',
  };
  const sIcon = (k, color) => `<svg viewBox="0 0 16 16" class="stat-ico" style="color:${color}">${SICON[k] || ""}</svg>`;

  // Division stats: attack/HP summed, org/armor/hardness/speed averaged — like HOI4. A battalion's punch
  // comes from its equipment, so add the equipment's stats (via `need`) on top of the sub-unit's own.
  function stats(t) {
    const bk = S.palette.byKey, eqs = S.palette.equip || {};
    const sum = { combat_width: 0, max_strength: 0, manpower: 0, soft_attack: 0, hard_attack: 0, air_attack: 0, defense: 0, breakthrough: 0, ap_attack: 0, recon: 0, suppression: 0, supply_consumption: 0 };
    const avgAcc = { max_organisation: [0, 0], hardness: [0, 0] };
    const needs = {};
    // Armor + top speed live on a battalion's EQUIPMENT, not the sub_unit (which reports them as null), so
    // the old sub_unit average read 0.0 for every division — even tanks. Resolve them from each battalion's
    // `need` equipment: HOI4 division armor = mean over LINE battalions (0-armor infantry included), division
    // speed = the SLOWEST line battalion. (For modular designs the equipment carries only a base value, so
    // these are an approximation — but a real number beats a misleading 0.0.) #stat-armor-speed
    let armorSum = 0, armorN = 0, divSpeed = null;
    const acc = (u, isLine) => {
      const s = suByKey(u); if (!s) return; // case-insensitive: MD templates spell keys differently. #unit-key-case
      // equipment-provided stats (from what this battalion needs)
      const eqStat = { soft_attack: 0, hard_attack: 0, air_attack: 0, defense: 0, breakthrough: 0, ap_attack: 0 };
      let bnArmor = 0, bnSpeed = null;
      for (const eqId in (s.need || {})) {
        needs[eqId] = (needs[eqId] || 0) + (Number(s.need[eqId]) || 0);
        const e = eqs[eqId];
        if (e) {
          eqStat.soft_attack += e.softAttack || 0; eqStat.hard_attack += e.hardAttack || 0; eqStat.air_attack += e.airAttack || 0; eqStat.defense += e.defense || 0; eqStat.breakthrough += e.breakthrough || 0; eqStat.ap_attack += e.apAttack || 0;
          const av = Number(e.armorValue); if (!isNaN(av) && av > bnArmor) bnArmor = av;                 // battalion armor = its most-armoured piece
          const sp = Number(e.maximumSpeed); if (!isNaN(sp) && sp > 0) bnSpeed = (bnSpeed == null) ? sp : Math.max(bnSpeed, sp); // battalion speed = its fastest transport
        }
      }
      sum.combat_width += Number(s.combat_width) || 0;
      sum.max_strength += Number(s.max_strength) || 0;
      sum.manpower += Number(s.manpower) || 0;
      sum.recon += Number(s.recon) || 0;
      sum.suppression += Number(s.suppression) || 0;
      sum.supply_consumption += Number(s.supply_consumption) || 0;
      sum.soft_attack += (Number(s.soft_attack) || 0) + eqStat.soft_attack;
      sum.hard_attack += (Number(s.hard_attack) || 0) + eqStat.hard_attack;
      sum.air_attack += (Number(s.air_attack) || 0) + eqStat.air_attack;
      sum.defense += (Number(s.defense) || 0) + eqStat.defense;
      sum.breakthrough += (Number(s.breakthrough) || 0) + eqStat.breakthrough;
      sum.ap_attack += (Number(s.ap_attack) || 0) + eqStat.ap_attack;
      // Test DECLAREDNESS on the raw value, never on the coerced number: unit-data's num() reports an absent stat
      // as null and Number(null) === 0, so a `v !== 0` filter cannot tell "not declared" from a LEGAL 0 — and it
      // dropped every artillery/AA/AT battalion (vanilla max_organisation = 0) out of the org average, so the
      // designer showed 60 org where HOI4 computes 45 and the artillery-drags-org-down tradeoff was invisible.
      // Same hit on a genuine hardness = 0. #falsy-zero
      for (const k of Object.keys(avgAcc)) { if (s[k] == null) continue; const v = Number(s[k]); if (!isNaN(v)) { avgAcc[k][0] += v; avgAcc[k][1]++; } }
      if (isLine) { // only combat regiments set division armor/speed; support companies ride along
        armorSum += bnArmor; armorN++;
        if (bnSpeed != null) divSpeed = (divSpeed == null) ? bnSpeed : Math.min(divSpeed, bnSpeed);
      }
    };
    lineUnits(t).forEach((u) => acc(u, true));
    (t.support || []).forEach((u) => acc(u, false));
    const avg = {};
    for (const k of Object.keys(avgAcc)) avg[k] = avgAcc[k][1] ? avgAcc[k][0] / avgAcc[k][1] : 0;
    avg.armor_value = armorN ? armorSum / armorN : 0;
    avg.maximum_speed = divSpeed; // null → underivable (no line battalion had an equipment speed) → render "—"
    return { sum, avg, needs, count: lineUnits(t).length + (t.support || []).length };
  }

  function renderDesigner() {
    const el = $("armyDesigner"); if (!el) return;
    if (S.selTpl < 0 || !S.model.templates[S.selTpl]) {
      el.innerHTML = '<div class="army-empty">Load a country, then select or create a template to build its division.</div>';
      return;
    }
    const t = S.model.templates[S.selTpl];
    const bk = S.palette.byKey;
    const st = stats(t);
    // A placed battalion tile. `kind` = "support" | "line"; line tiles also carry their column.
    const tile = (u, kind, idx, colIdx) => {
      const su = suByKey(u); const c = unitCat(su); // #unit-key-case
      return `<div class="unit-tile" draggable="true" data-kind="${kind}" data-idx="${idx}"${kind === "line" ? ` data-col="${colIdx}"` : ""} style="--uc:${CAT_COLOR[c]}" title="${esc(u)} — drag to move it, × removes it">`
        + `<span class="ut-del" data-kind="${kind}" data-idx="${idx}"${kind === "line" ? ` data-col="${colIdx}"` : ""} title="Remove">×</span>`
        + `<span class="unit-ico" style="color:${CAT_COLOR[c]}"><span class="unit-glyph">${unitSymbol(c)}</span>${unitPic(su)}</span>`
        + `<span class="unit-lbl">${esc(su ? unitLabel(su) : u)}</span></div>`;
    };
    // ONE column of the game grid: filled tiles, then a bright ＋ on the next free cell, then faint ghost
    // cells so the full 5-slot shape stays visible — exactly like the in-game designer. #game-grid
    const gridCol = (units, kind, colIdx) => {
      const cells = [];
      units.forEach((u, i) => cells.push(tile(u, kind, i, colIdx)));
      if (units.length < COL_CAP) {
        cells.push(`<button type="button" class="slot-add" data-kind="${kind}"${kind === "line" ? ` data-col="${colIdx}"` : ""} title="Add ${kind === "support" ? "a support company" : "a battalion to this regiment"}">＋</button>`);
        for (let i = units.length + 1; i < COL_CAP; i++) cells.push('<div class="slot-ghost"></div>');
      }
      // A column is one REGIMENT, and the in-game designer only lets a regiment hold ONE group — that's the
      // wiki's "The group cannot change in a single y column", and it's why you can't stack tanks on infantry.
      // Show which group a column is locked to, and flag it when it mixes. #column-group
      const gs = kind === "line" ? colGroups(units) : [];
      const bad = gs.length > 1;
      const head = kind === "line"
        ? `<div class="reg-col-h${bad ? " bad" : ""}" title="${bad ? "This regiment mixes " + gs.map(GROUP_LABEL_OF).join(" + ") + " — the in-game designer only allows one kind per regiment." : gs.length ? "This regiment holds " + GROUP_LABEL_OF(gs[0]) : "Empty — takes any kind"}">${bad ? "⚠ mixed" : gs.length ? esc(GROUP_LABEL_OF(gs[0])) : "—"}</div>`
        : "";
      return `<div class="reg-col${bad ? " reg-col-bad" : ""}">${head}${cells.join("")}</div>`;
    };
    const supportCol = gridCol(t.support, "support");
    const combatCols = t.cols.map((col, ci) => gridCol(col, "line", ci)).join("");

    const row = (icon, color, label, val, digits) => `<div class="stat-row">${sIcon(icon, color)}<span class="sr-lbl">${label}</span><span class="sr-val">${typeof val === "number" ? (digits ? val.toFixed(digits) : Math.round(val)).toLocaleString() : val}</span></div>`;
    const s = st.sum, a = st.avg;
    const statPanel =
      `<div class="stat-group-h">General</div>`
      + row("width", "#c9d1d9", "Combat width", s.combat_width)
      + row("hp", "#e05561", "HP", s.max_strength)
      + row("org", "#58a6ff", "Organisation", a.max_organisation, 1)
      + row("speed", "#8fd18f", "Speed", a.maximum_speed == null ? "—" : a.maximum_speed, 1)
      + row("recon", "#c9a227", "Recon", s.recon)
      + `<div class="stat-group-h">Offense</div>`
      + row("soft", "#e0a45e", "Soft attack", s.soft_attack)
      + row("hard", "#b06a3a", "Hard attack", s.hard_attack)
      + row("air", "#6db3d1", "Air attack", s.air_attack)
      + row("bt", "#d18fd1", "Breakthrough", s.breakthrough)
      + row("pierce", "#d17a7a", "Piercing", s.ap_attack)
      + `<div class="stat-group-h">Defense</div>`
      + row("def", "#7ab87a", "Defense", s.defense)
      + row("armor", "#8a8fb0", "Armor", a.armor_value, 1)
      + `<div class="stat-group-h">Cost & supply</div>`
      + row("mp", "#c9d1d9", "Manpower", s.manpower)
      + row("supply", "#9aa0a6", "Supply use", s.supply_consumption, 2);
    const needStr = Object.keys(st.needs).length ? Object.keys(st.needs).map((k) => `${esc(k)} ×${st.needs[k]}`).join(" · ") : "—";
    const ovf = (t._overflowRegiments || []).length + (t._overflowSupport || []).length;

    el.innerHTML =
      `<div class="dz-head">
        <input id="tplName" class="dz-name" type="text" value="${esc(t.name)}" placeholder="Division name" />
        <label class="dz-prio">Priority<select id="tplPriority" class="army-input"><option value="">default</option><option value="0">0 low</option><option value="1">1 normal</option><option value="2">2 high</option></select></label>
        <button id="tplDelete" class="army-btn-danger" type="button">🗑 Delete</button>
      </div>
      <div class="dz-body">
        <div class="dz-canvas">
          <div class="dz-grid-wrap">
            <div class="dz-grid-sec dz-grid-support"><div class="dz-section-h">Support</div>${supportCol}</div>
            <div class="dz-grid-divider"></div>
            <div class="dz-grid-sec dz-grid-combat"><div class="dz-section-h">Combat regiments</div><div class="reg-grid">${combatCols}</div></div>
          </div>
          <p class="dz-hint">Click a <b>＋</b> slot to add a battalion — just like the in-game designer. Each column is one <b>regiment</b>, and a regiment holds one kind: you can't stack tanks on infantry. <span class="sb-help" data-help="tpl-column-group" title="Why can't I mix them?">?</span></p>
          ${(() => {
            const bad = t.cols.map((c, i) => [i, colGroups(c)]).filter(([, g]) => g.length > 1);
            return bad.length ? `<p class="dz-hint" style="color:#d29922;">⚠ ${bad.map(([i, g]) => `Regiment ${i + 1} mixes <b>${g.map(GROUP_LABEL_OF).join(" + ")}</b>`).join("; ")}. The in-game designer can't build that — the game will still load it, but you won't be able to edit this template in-game.</p>` : "";
          })()}
          ${ovf ? `<p class="dz-hint" style="color:#d29922;">⚠ ${pl(ovf, "unit")} ${ovf === 1 ? "sits" : "sit"} beyond the 5×5 grid (this mod raises the game's designer limits). They stay in the file untouched — Nova just can't show them here.</p>` : ""}
          <div class="dz-meta">
            <label><span class="dz-lbl">Names group <span class="sb-help" data-help="tpl-names-group" title="What is a names group?">?</span></span><input id="tplNamesGroup" class="army-input" type="text" value="${esc(t.names_group || "")}" placeholder="e.g. GER_INF_01" /></label>
            <label><span class="dz-lbl">Map symbol <span class="sb-help" data-help="tpl-counter" title="What is the map symbol?">?</span></span><span style="display:flex; gap:6px; align-items:center;"><input id="tplCounter" class="army-input" list="tplCounterList" value="${esc(t.template_counter == null ? "" : t.template_counter)}" placeholder="—" style="width:86px;" autocomplete="off" /><img id="tplCounterPrev" class="tpl-ctr-prev" alt="" /></span><datalist id="tplCounterList"></datalist></label>
            <label><span class="dz-lbl">3D model <span class="sb-help" data-help="tpl-override-model" title="What is the 3D model?">?</span></span><input id="tplOverrideModel" class="army-input" list="tplModelList" type="text" value="${esc(t.override_model || "")}" placeholder="— automatic —" autocomplete="off" /><datalist id="tplModelList"></datalist></label>
            <label class="dz-lock"><input id="tplLocked" type="checkbox" ${t.is_locked === "yes" ? "checked" : ""} style="accent-color:#1f6feb;" /> Locked template <span class="sb-help" data-help="tpl-locked" title="What is a locked template?">?</span></label>
          </div>
          <div class="dz-needs"><b>Equipment:</b> ${needStr}</div>
        </div>
        <div class="dz-stats">${statPanel}</div>
      </div>`;

    // A priority the dropdown has no option for must not silently read as "default". The select only carries
    // "", 0, 1 and 2, so assigning `.value = "10"` left it on the empty option and a template the FILE sets
    // to priority 10 was shown to the modder as "default" — the value itself round-trips (the model keeps it
    // and re-emits it), so this misreported the file rather than losing it. Add the real value as an option
    // instead, so what the dropdown says matches what is on disk. #division-priority-out-of-range
    {
      const sel = $("tplPriority");
      const want = (t.priority == null ? "" : String(t.priority));
      if (want !== "" && !Array.prototype.some.call(sel.options, (o) => o.value === want)) {
        const o = document.createElement("option");
        o.value = want;
        o.textContent = `${want} (from file)`;
        sel.appendChild(o);
      }
      sel.value = want;
    }
    { // Template metadata fields (division_names_group / template_counter / override_model / is_locked). #template-metadata
      const gn = $("tplNamesGroup"); if (gn) gn.addEventListener("input", (e) => { t.names_group = e.target.value; markDirty(t); });
      const tc = $("tplCounter");
      if (tc) tc.addEventListener("input", (e) => {
        const raw = String(e.target.value || "").trim();
        // The box now offers a real list, so it can hold a picked value or free text. Only a plain number is
        // a legal template_counter — anything else must not silently become NaN in the file.
        t.template_counter = raw === "" ? undefined : (/^\d+$/.test(raw) ? Number(raw) : undefined);
        updateCounterPreview(); markDirty(t);
      });
      const ovm = $("tplOverrideModel"); if (ovm) ovm.addEventListener("input", (e) => { t.override_model = e.target.value; markDirty(t); });
      populateTemplateArtLists();
      const lk = $("tplLocked"); if (lk) lk.addEventListener("change", (e) => { t.is_locked = e.target.checked ? "yes" : ""; markDirty(t); });
    }
    let renameOwned = null; // divisions that belong to THIS template, captured by OBJECT before the first keystroke
    $("tplName").addEventListener("input", (e) => {
      // Renaming must FOLLOW through to placed divisions, or the save writes divisions referencing a
      // division_template that no longer exists (in-game error). Follow by OBJECT identity, not by
      // name-per-keystroke: typing through another template's name (e.g. backspacing "Infantry Division 2"
      // past "Infantry Division") must never hijack that template's divisions.
      if (!renameOwned) renameOwned = (S.model.divisions || []).filter((d) => d.template === t.name);
      t.name = e.target.value;
      for (const d of renameOwned) { d.template = t.name; d._dirty = true; }
      markDirty(t); renderTemplateList(); renderDeploy();
    });
    $("tplPriority").addEventListener("change", (e) => { t.priority = e.target.value === "" ? undefined : Number(e.target.value); markDirty(t); });
    $("tplDelete").addEventListener("click", () => {
      // Deleting a template also removes its placed divisions (like the game) — orphan divisions would
      // reference a missing division_template. The confirm says how many go with it.
      const users = (S.model.divisions || []).filter((d) => d.template === t.name).length;
      if (!confirm(`Delete template "${t.name}"?${users ? `\n\n${users} placed division${users > 1 ? "s" : ""} using it will also be removed.` : ""}`)) return;
      S.model.divisions = (S.model.divisions || []).filter((d) => d.template !== t.name);
      S.model.templates.splice(S.selTpl, 1);
      S.selTpl = Math.min(S.selTpl, S.model.templates.length - 1);
      setUnsaved(true);
      renderTemplateList(); renderDesigner(); renderDeploy();
      updateCountStatus(); // both counts move: the template is gone AND its placed divisions were just removed
    });
    // Every ＋ slot opens the battalion picker for ITS column (or the support column) — the game's interaction.
    el.querySelectorAll(".slot-add").forEach((b) => b.addEventListener("click", () =>
      openUnitPicker(b.dataset.kind, b.dataset.col != null ? +b.dataset.col : undefined)));
    el.querySelectorAll(".ut-del").forEach((x) => x.addEventListener("click", (e) => {
      e.stopPropagation();
      const kind = x.dataset.kind, idx = +x.dataset.idx;
      if (kind === "line") t.cols[+x.dataset.col].splice(idx, 1); else t.support.splice(idx, 1);
      markDirty(t); renderTemplateList(); renderDesigner();
    }));
    wireRegimentDrag(el, t);
    mountUnitIcons(el); // swap each battalion's NATO glyph for its real in-game icon (helmet / tank / IFV)
  }
  // ── Dragging battalions around the template ───────────────────────────────────────────────────────
  // Drag a battalion to another slot. Two rules, and they are NOT the same kind of rule — which is why one
  // refuses and the other only warns:
  //  · SUPPORT ↔ COMBAT IS A HARD BOUNDARY and is refused. The wiki: "For a unit to be placed as a support
  //    company, it must have group = support in its definition, and to be placed in combat battalions, it
  //    must have a different group." An engineer company simply is not a thing that can stand in a line
  //    regiment, so dropping one there would write a template the game cannot make sense of.
  //  · MIXING GROUPS INSIDE A COMBAT COLUMN is allowed, and flagged. It breaks the in-game designer's rule
  //    ("the group cannot change in a single y column") but NOT the game: vanilla itself ships templates that
  //    do it (CA1.txt "Azad Hind Infantry Corps" stacks a tank on infantry). Refusing would mean Nova can't
  //    reproduce the base game's own content. The column header already says "⚠ mixed" when it happens.
  // A gap can't be created by any of this: a column is an ARRAY and serialises with y = the array index, so
  // "nothing can go forward unless something is behind it" is guaranteed by the shape of the data. #reg-drag
  let _drag = null;
  function wireRegimentDrag(el, t) {
    const listFor = (kind, col) => (kind === "line" ? t.cols[col] : t.support);
    el.querySelectorAll(".unit-tile").forEach((tile) => {
      tile.addEventListener("dragstart", (e) => {
        _drag = { kind: tile.dataset.kind, col: tile.dataset.col == null ? null : +tile.dataset.col, idx: +tile.dataset.idx };
        _drag.key = listFor(_drag.kind, _drag.col)[_drag.idx];
        try { e.dataTransfer.setData("text/plain", _drag.key); e.dataTransfer.effectAllowed = "move"; } catch (_) {}
        tile.classList.add("dragging");
        // Show which columns can take it: same group, or empty. Mixing is still permitted — this teaches
        // the rule rather than enforcing it, because vanilla itself breaks it.
        const g = groupOf(_drag.key);
        el.querySelectorAll(".dz-grid-combat .reg-col").forEach((c, ci) => {
          if (_drag.kind !== "line") { c.classList.add("drop-no"); return; }
          const gs = colGroups(t.cols[ci]).filter((x) => x !== g);
          c.classList.add(gs.length && ci !== _drag.col ? "drop-warn" : "drop-ok");
        });
        const sup = el.querySelector(".dz-grid-support");
        if (sup) sup.classList.add(_drag.kind === "support" ? "drop-ok" : "drop-no");
      });
      tile.addEventListener("dragend", () => {
        tile.classList.remove("dragging");
        el.querySelectorAll(".drop-ok,.drop-warn,.drop-no,.drop-over").forEach((c) => c.classList.remove("drop-ok", "drop-warn", "drop-no", "drop-over"));
        _drag = null;
      });
    });
    const dropInto = (kind, col, at) => {
      if (!_drag) return;
      // The one hard refusal: a support company can't stand in a line regiment, nor a battalion in support.
      if (_drag.kind !== kind) {
        flashArmyStatus(kind === "support"
          ? "Only support companies go in the support column — that's a game rule, not Nova's."
          : "A support company can't be a combat battalion — it has to stay in the support column.", "#d29922");
        return;
      }
      const from = listFor(_drag.kind, _drag.col), to = listFor(kind, col);
      const cap = kind === "support" ? SUPPORT_CAP : COL_CAP;
      if (from !== to && to.length >= cap) { flashArmyStatus(`That ${kind === "support" ? "support column" : "regiment"} is full (${cap}).`, "#d29922"); return; }
      const [moved] = from.splice(_drag.idx, 1);
      if (moved == null) return;
      // Removing from the same list first shifts everything after it down by one.
      let dest = at == null ? to.length : at;
      if (from === to && _drag.idx < dest) dest--;
      to.splice(Math.max(0, Math.min(to.length, dest)), 0, moved);
      markDirty(t); renderTemplateList(); renderDesigner(); // renderDesigner recomputes the stat panel → live stats
    };
    // Drop ON a tile = insert at that position (this is what makes reordering possible).
    el.querySelectorAll(".unit-tile").forEach((tile) => {
      tile.addEventListener("dragover", (e) => { if (_drag) { e.preventDefault(); e.stopPropagation(); tile.classList.add("drop-over"); } });
      tile.addEventListener("dragleave", () => tile.classList.remove("drop-over"));
      tile.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation(); tile.classList.remove("drop-over");
        dropInto(tile.dataset.kind, tile.dataset.col == null ? null : +tile.dataset.col, +tile.dataset.idx);
      });
    });
    // Drop on the column's empty space = append to the end.
    el.querySelectorAll(".dz-grid-combat .reg-col").forEach((c, ci) => {
      c.addEventListener("dragover", (e) => { if (_drag && _drag.kind === "line") e.preventDefault(); });
      c.addEventListener("drop", (e) => { e.preventDefault(); dropInto("line", ci, null); });
    });
    const supCol = el.querySelector(".dz-grid-support .reg-col");
    if (supCol) {
      supCol.addEventListener("dragover", (e) => { if (_drag && _drag.kind === "support") e.preventDefault(); });
      supCol.addEventListener("drop", (e) => { e.preventDefault(); dropInto("support", null, null); });
    }
  }
  function markDirty(t) { if (t) t._dirty = true; setUnsaved(true); }
  // The human contract: the app never silently loses work. This flag drives the Save button's "unsaved"
  // glow, the leave-page browser warning, and the switch-country confirm. Cleared on load + successful save.
  function setUnsaved(v) {
    S.unsaved = !!v;
    const btn = $("armySaveBtn");
    if (btn) btn.classList.toggle("unsaved", S.unsaved);
  }
  // ── Closing the app with unsaved army edits ────────────────────────────────────────────────────────
  // DANGEROUS BUG this fixes: on Electron a raw `beforeunload` that calls preventDefault() SILENTLY cancels
  // the window close — no dialog, no way to override — so with any unsaved edit (e.g. after dragging a
  // regiment) the app became IMPOSSIBLE to close. And Nova's Electron main.js drives its own Save/Don't-Save/
  // Cancel dialog through two globals — but the Military page never defined them (only app.js + research.js
  // did), so on this page main.js couldn't see the army's unsaved state OR save on exit. Both halves fixed,
  // mirroring app.js exactly: expose the hooks, and register the raw beforeunload ONLY in a browser. #army-close
  // Staged (not-yet-Saved) naval/air units are unsaved work too, but they never set S.unsaved (naAddShip/naAddGroup
  // only push + render). Without this, a country switch or app close silently discarded them. #na-unsaved
  const hasStagedNavalAir = () => Boolean(S.na && (((S.na.ships || []).length) || ((S.na.groups || []).length)));
  // Staged stockpile edits (added/removed rows not yet 💾 Saved) are unsaved work too — stockpileAdd only pushes +
  // renders, it never sets S.unsaved. The list differs from what's on disk exactly when its length ≠ the last-saved
  // count, so a country switch/app close must treat that as unsaved (was silently discarded before). #sp-unsaved
  // #staged-stockpile-compared-by-COUNT — comparing lengths meant removing one entry and adding another
  // was invisible to every guard, and so was editing a row in place. Serialize the whole list: the save
  // sends these row objects as they are, so there is no field list here to fall behind what a row holds.
  const stockpileSignature = (list) => JSON.stringify(list || []);
  const hasStagedStockpile = () => Array.isArray(S.stockpile) && !S._spLoadFailed
    && stockpileSignature(S.stockpile) !== (S._spSavedSig || stockpileSignature([]));
  // A division being edited in the deploy form is unsaved work too. The form only reaches the model when
  // "✓ Update this one" is pressed, so pressing 💾 Save instead wrote the division as it was and reported
  // success, with the typed value still visible in the box. Compares against S.deployEdit.seed — the exact
  // strings startDeployEdit put in those boxes — so a field only LOOKED at never counts.
  // #deploy-edit-not-drained-by-save
  const deployEditDirty = () => {
    if (!S.deployEdit || !S.deployEdit.seed) return false;
    const seed = S.deployEdit.seed;
    const now = (id) => { const e = $(id); return (e && e.value) || ""; };
    return now("deployOfficer") !== seed.officer || now("deployEquip") !== seed.equip || now("deployExp") !== seed.exp;
  };
  const hasUnsavedArmy = () => Boolean((S.unsaved || (S.equip && (S.equip.editorDirty || S.equip.variantDirty)) || hasStagedNavalAir() || hasStagedStockpile() || deployEditDirty()) && !S._armySaving);
  window.__focusEditorHasUnsavedChanges = hasUnsavedArmy;
  window.__focusEditorSaveBeforeExit = async () => {
    // #exit-save-writes-nothing — THIS ANSWERED "SAVED" WITHOUT WRITING ANYTHING.
    //
    // hasUnsavedArmy() above counts four kinds of unsaved work: the army model (S.unsaved), staged naval/air
    // units, staged stockpile rows, and a dirty equipment sub-editor. main.js asks that question, so the quit
    // dialog correctly said there were unsaved changes for any of them.
    //
    // This saver only ever looked at S.unsaved. Press "Save" on the way out with six staged ships and it ran
    // nothing, returned !S.unsaved — true — and the window closed on work that was never written. The user
    // had explicitly chosen to save it.
    //
    // So save each of them, with the button each one belongs to where there is one, and then answer the
    // question honestly: is anything still unsaved? A false answer keeps the window open and re-offers the
    // dialog, which is the right outcome — "Don't Save" is still there for someone who means it.
    const settle = async (done, ms = 6000) => {
      for (let waited = 0; waited < ms; waited += 150) {
        if (done()) return true;
        await new Promise((r) => setTimeout(r, 150));
      }
      return done();
    };
    // deployEditDirty() as well as S.unsaved: a division edited in the form but not Updated never sets the
    // flag, so "Save" on the quit dialog would have skipped saveArmy entirely. #deploy-edit-not-drained-by-save
    if (S.unsaved || deployEditDirty()) { try { await saveArmy(); } catch (_) {} }
    if (hasStagedNavalAir()) { try { await naSave(); } catch (_) {} }
    if (hasStagedStockpile()) { try { await stockpileSave(); } catch (_) {} }
    // A sub-editor's form buffer belongs to its own Save button. Press whichever is on screen and wait for
    // the dirty flag to clear, the way the shared nav guard's onSave does — the write is asynchronous and
    // reports through that flag, not through the click.
    // #exit-saver-presses-the-wrong-button — one button lookup for two flags meant the quit dialog could
    // press a Save that does not own the work: it rewrote an unrelated equipment file, left variantDirty
    // set, waited out the settle timeout and then reported "The file could not be saved" with nothing to
    // fix. Each flag presses the button that clears it.
    const pressAndSettle = async (el, isClean) => {
      if (!el || el.getClientRects().length === 0 || el.disabled) return false;
      el.click();
      await settle(isClean);
      return true;
    };
    if (S.equip && S.equip.editorDirty) {
      // editorDirty is cleared by saveEquip (#eqSaveBtn) or saveVariantEdits (#vvSaveBtn), whichever editor
      // is open — and, on the read-only equipment branches that render no #eqSaveBtn at all, by the role
      // grid's own "💾 Save roles".
      const clean = () => !(S.equip && S.equip.editorDirty);
      let pressed = await pressAndSettle($("eqSaveBtn"), clean);
      if (!pressed) pressed = await pressAndSettle($("vvSaveBtn"), clean);
      if (!pressed) await pressAndSettle(document.querySelector(".role-save"), clean);
    }
    if (S.equip && S.equip.variantDirty) {
      // variantDirty belongs to the Designer alone.
      await pressAndSettle($("dsgSaveBtn"), () => !(S.equip && S.equip.variantDirty));
    }
    return !hasUnsavedArmy();
  };
  // #suite-nav-discards-unsaved-work — gating beforeunload on the runtime was right, but it left the DESKTOP
  // build with no guard at all: a click on any of the 11 suite-nav links discarded a dragged regiment or a
  // staged ship instantly and silently, where the same click in a browser at least raised Chromium's prompt.
  // The shared guard intercepts the link's own click, which is the path that works under Electron, and still
  // registers beforeunload outside it. The richer __focusEditorHasUnsavedChanges above (which can SAVE on the
  // way out) is left alone — the guard only publishes one when the page has not.
  if (typeof window.novaGuardSuiteNav === "function") {
    window.novaGuardSuiteNav(hasUnsavedArmy, "the Military page");
  }
  // #dsgPicker is the SHARED overlay for the module / MIO / upgrade / chassis editors + the icon picker.
  // Create it once, UNCONDITIONALLY — it used to be built only inside renderModularDesigner's innerHTML, so a
  // mod with NO modular chassis (that function's early return) left it absent and ＋ New chassis / New MIO /
  // New upgrade silently did nothing (their handlers bail on `if (!ov) return`). #dsgpicker-always
  if (!document.getElementById("dsgPicker")) { const _dp = document.createElement("div"); _dp.id = "dsgPicker"; _dp.className = "dsg-picker-overlay"; _dp.style.display = "none"; document.body.appendChild(_dp); }
  // A save's deferred "auto-close" must NOT blank a DIFFERENT editor the user opened during the delay. Cancel any
  // pending timer and only close if the SAME editor box is still shown (a new editor replaces .mp-box). #dsg-close-race
  function cancelDsgClose() { if (S._dsgCloseTimer) { clearTimeout(S._dsgCloseTimer); S._dsgCloseTimer = null; } }
  function scheduleDsgClose(ov, ms) {
    cancelDsgClose();
    const box = ov.querySelector(".mp-box");
    S._dsgCloseTimer = setTimeout(() => { S._dsgCloseTimer = null; if (ov.querySelector(".mp-box") === box) { ov.style.display = "none"; ov.innerHTML = ""; } }, ms);
  }
  // Escape closes whichever picker/overlay is open — what fingers expect.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const hm = $("armyHelpModal");
    if (hm && hm.style.display === "flex") { hm.style.display = "none"; e.preventDefault(); return; }
    for (const id of ["divPicker", "dsgPicker"]) {
      const ov = $(id);
      if (ov && ov.style.display === "flex") {
        // If a sub-picker (icon picker) is layered OVER an editor (2 overlay children — the editor node is hidden,
        // the picker box appended), Esc must dismiss just the TOP layer and restore the editor — NOT blank the whole
        // overlay, which would destroy the draftless module/chassis editor (the same data-loss the backdrop-close
        // guard prevents; the Esc path was its unguarded sibling). #modal-backdrop-guard
        if (ov.firstElementChild && ov.firstElementChild !== ov.lastElementChild) {
          ov.lastElementChild.remove();
          if (ov.firstElementChild) ov.firstElementChild.style.display = "";
          e.preventDefault(); return;
        }
        ov.style.display = "none"; ov.innerHTML = ""; e.preventDefault(); return;
      }
    }
  });

  // Click a grid "＋" → pick a battalion (for THAT regiment column) or a support company from a popup —
  // the same interaction as the in-game division designer. Stays open for rapid adding. #game-grid
  function openUnitPicker(kind, colIdx) {
    const t = (S.selTpl >= 0) ? S.model.templates[S.selTpl] : null;
    if (!t) { flashArmyStatus("Select or create a template first.", "#d29922"); return; }
    const isSupport = kind === "support";
    // Unit data not in yet (cold start / earlier fetch failed): retry the load, then reopen this picker,
    // instead of a false "No battalions in this mod". #palette-retry
    if (!S.palette.loaded) {
      flashArmyStatus("Loading the mod's unit types…", "#8b949e");
      loadPalette().then(() => { if (S.palette.loaded) openUnitPicker(kind, colIdx); else flashArmyStatus("Couldn't load unit types — is the mod still warming up? Try again.", "#d29922"); });
      return;
    }
    const units = (isSupport ? S.palette.support : S.palette.line) || [];
    const col = isSupport ? null : (t.cols[Math.max(0, Math.min(LINE_COLS - 1, colIdx || 0))]);
    const cap = isSupport ? SUPPORT_CAP : COL_CAP;
    const cur = () => isSupport ? t.support.length : col.length;
    let ov = $("divPicker");
    if (!ov) { ov = document.createElement("div"); ov.id = "divPicker"; ov.className = "dsg-picker-overlay"; document.body.appendChild(ov); }
    const groupOrder = ["infantry", "motorized", "mechanized", "cavalry", "armored", "artillery", "anti_tank", "anti_air", "rocket", "support", "other"];
    const uTile = (s) => { const c = unitCat(s); return `<button type="button" class="unit-pick" data-key="${esc(s.key)}" title="${esc(s.key)}" style="--uc:${CAT_COLOR[c]}"><span class="su-edit" data-key="${esc(s.key)}" title="Edit this battalion's stats">✎</span><span class="unit-ico" style="color:${CAT_COLOR[c]}"><span class="unit-glyph">${unitSymbol(c)}</span>${unitPic(s)}</span><span class="unit-lbl">${esc(unitLabel(s))}</span></button>`; };
    const close = () => { ov.style.display = "none"; ov.innerHTML = ""; };
    const draw = () => {
      const groups = {};
      for (const s of units) { const c = unitCat(s); (groups[c] = groups[c] || []).push(s); }
      const cols = groupOrder.filter((g) => groups[g] && groups[g].length)
        .map((g) => `<div class="pal-group"><div class="pal-group-h" style="color:${CAT_COLOR[g]}">${g.replace(/_/g, "-")}</div><div class="pal-tiles">${groups[g].map(uTile).join("")}</div></div>`).join("");
      ov.innerHTML = `<div class="mp-box"><div class="mp-head"><b>Add ${isSupport ? "a support company" : "a battalion — regiment " + ((colIdx || 0) + 1)}</b> <span style="color:#6e7681;font-weight:400;">(${cur()}/${cap})</span> <button type="button" class="mp-close" title="Close">×</button></div>`
        + `<div class="mp-scroll" style="max-height:60vh; overflow:auto;">${cols || '<div class="army-empty">No ' + (isSupport ? "support companies" : "battalions") + ' in this mod.</div>'}</div></div>`;
      ov.querySelector(".mp-close").addEventListener("click", close);
      mountUnitIcons(ov); // real in-game battalion icons in the picker (NATO glyph is the fallback)
      ov.querySelectorAll(".unit-pick").forEach((b) => b.addEventListener("click", () => {
        const key = b.dataset.key;
        if (cur() >= cap) { flashArmyStatus(`${isSupport ? "Support" : "This regiment is"} full (max ${cap}).`, "#d29922"); return; }
        if (isSupport) t.support.push(key); else col.push(key);
        markDirty(t);
        const y = window.scrollY; renderTemplateList(); renderDesigner(); window.scrollTo(0, y);
        flashArmyStatus(`Added ${unitLabel(S.palette.byKey[key] || {})}${isSupport ? " (support)" : ""}.`, "#3fb950");
        if (cur() >= cap) close(); else draw(); // keep open for rapid adding; refresh the count
      }));
      // The ✎ on each tile opens the battalion stat editor (stop the click bubbling to add). #subunit-edit
      ov.querySelectorAll(".su-edit").forEach((e) => e.addEventListener("click", (ev) => { ev.stopPropagation(); openSubUnitEditor(e.dataset.key); }));
    };
    ov.style.display = "flex";
    ov.onclick = (e) => { if (e.target === ov) close(); };
    draw();
  }

  // ── Battalion (sub_unit) stat editor — retune an existing MOD battalion's stats + equipment need. #subunit-edit
  const SU_EDIT_FIELDS = [
    ["combat_width", "Combat width"], ["max_strength", "Max strength (HP)"], ["max_organisation", "Max org"],
    ["default_morale", "Default morale"], ["manpower", "Manpower"], ["training_time", "Training time"],
    ["soft_attack", "Soft attack"], ["hard_attack", "Hard attack"], ["defense", "Defense"], ["breakthrough", "Breakthrough"],
    ["suppression", "Suppression"], ["weight", "Weight"], ["supply_consumption", "Supply use"],
  ];
  function openSubUnitEditor(key) {
    const su = suByKey(key); if (!su) return;
    let ov = $("suEditOverlay");
    if (!ov) { ov = document.createElement("div"); ov.id = "suEditOverlay"; ov.className = "dsg-picker-overlay"; document.body.appendChild(ov); }
    const val = (k) => (su[k] == null || su[k] === "") ? "" : su[k];
    const needRows = Object.entries(su.need || {}).slice(0, 6);
    ov.innerHTML = `<div class="mp-box" style="width:min(640px,94vw);">`
      + `<div class="mp-head"><b>✎ Edit battalion — ${esc(su.key)}</b> <span style="color:#6e7681;font-weight:400;">${su.file ? "(" + esc(su.file) + ")" : ""}</span> <button type="button" class="mp-close" title="Close">×</button></div>`
      + `<div class="mp-scroll" style="max-height:64vh; overflow:auto; padding:14px;">`
      + `<div class="comp-label">Stats <span style="text-transform:none;color:#6e7681;">(blank = leave unchanged)</span></div>`
      + `<div class="eq-editor-fields">${SU_EDIT_FIELDS.map(([k, lbl]) => `<label>${esc(lbl)}<input id="su_${k}" class="army-input" type="number" step="0.01" value="${esc(val(k))}" /></label>`).join("")}</div>`
      + `<div class="comp-label" style="margin-top:12px;">Equipment need <span style="text-transform:none;color:#6e7681;">(what it consumes per battalion)</span></div>`
      + `<div id="suNeedRows" style="display:flex; flex-direction:column; gap:6px;">${(needRows.length ? needRows : [["", ""]]).map(([eq, amt]) => `<div style="display:flex;gap:8px;"><input class="su-need-key army-input" list="suNeedList" type="text" value="${esc(eq)}" placeholder="equipment id" style="flex:1;"><input class="su-need-val army-input" type="number" min="0" value="${esc(amt)}" placeholder="amount" style="width:110px;"></div>`).join("")}</div>`
      + `<datalist id="suNeedList">${Object.keys(S.palette.equip || {}).slice(0, 400).map((id) => `<option value="${esc(id)}"></option>`).join("")}</datalist>`
      + `<div style="margin-top:14px;display:flex;align-items:center;gap:10px;"><button type="button" id="suSaveBtn" class="army-btn">💾 Save battalion</button><span id="suEditStatus" style="font-size:12px;"></span></div>`
      + `<p class="card-sub" style="margin:8px 0 0;font-size:11px;">Only a battalion defined in your mod's OWN unit file can be edited — a base-game one must be overridden first.</p>`
      + `</div></div>`;
    ov.style.display = "flex";
    const close = () => { ov.style.display = "none"; ov.innerHTML = ""; };
    ov.querySelector(".mp-close").addEventListener("click", close);
    ov.onclick = (e) => { if (e.target === ov) close(); };
    $("suSaveBtn").addEventListener("click", async () => {
      const st = $("suEditStatus"), btn = $("suSaveBtn");
      const stats = {};
      for (const [k] of SU_EDIT_FIELDS) { const v = ($("su_" + k).value || "").trim(); if (v !== "" && Number.isFinite(Number(v))) stats[k] = Number(v); }
      const need = {};
      ov.querySelectorAll("#suNeedRows > div").forEach((r) => { const kk = (r.querySelector(".su-need-key").value || "").trim(); const vv = r.querySelector(".su-need-val").value; if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(kk) && vv !== "" && Number(vv) > 0) need[kk] = Math.floor(Number(vv)); });
      btn.disabled = true; st.style.color = "#8b949e"; st.textContent = "Saving…";
      try {
        const d = await fetch("/api/subunits/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: modPath(), key: su.key, fileName: su.file, stats, need }) }).then((r) => r.json());
        if (d && d.ok) { st.style.color = "#3fb950"; st.textContent = "✓ Saved to the mod."; S.palette.loaded = false; await loadPalette(); }
        else { st.style.color = "#f85149"; st.textContent = (d && d.error) || "Save failed."; }
      } catch (e) { st.style.color = "#f85149"; st.textContent = e.message; }
      finally { btn.disabled = false; }
    });
  }

  // ── Deploy divisions (by State ID → a real land province) ───────────────
  // ── Editing divisions you already placed ──────────────────────────────────────────────────────────
  // Clicking a placed group pulls it into the form above so its commander / equipment % / experience % can
  // be changed. The location deliberately does NOT come back into the State box: a tile only knows its
  // PROVINCE, and the box wants a STATE — so an edit keeps the divisions exactly where they are, and moving
  // them stays a delete-and-place. Changing "how many" adds or removes from the group. #deploy-edit
  // #x2-brigade-cards — edits ONE division, the one whose tile was clicked. It used to take (loc, tpl) and
  // edit every division sharing them, which is why an uneven stack needed the "the box shows one of them"
  // warning below: a single set of boxes cannot honestly describe three different commanders. Editing one
  // division at a time removes the problem rather than warning about it.
  function startDeployEdit(div) {
    if (!div || !(S.model.divisions || []).includes(div)) return;
    const loc = div.location, tpl = div.template || "";
    S.deployEdit = { div, loc, tpl };
    const set = (id, v) => { const e = $(id); if (e) e.value = v == null ? "" : v; };
    // #deploy-tile-update-homogenises-group — the pre-filled values are recorded below, once the boxes are
    // populated, so Update can tell a field the user CHANGED from one they only looked at. Still needed with
    // one division in hand: pressing Update having only looked would otherwise stamp the box's rendering of a
    // value back over the real one (a blank box would delete a commander).
    const sel = $("deployTemplate");
    if (sel && [...sel.options].some((o) => o.value === tpl)) sel.value = tpl;
    // "How many" belongs to PLACING. Editing acts on the division you clicked, so pin it and take it out of
    // play rather than leave a box that looks like it still does something.
    set("deployCount", 1);
    const cnt = $("deployCount"); if (cnt) cnt.disabled = true;
    set("deployState", "");
    // Officers are numbered per division ("Rommel 1", "Rommel 2") when several are placed at once — show the
    // shared stem back, not the numbered one, or re-saving would turn "Rommel 1" into "Rommel 1 1".
    const off = div.officer || "";
    set("deployOfficer", off ? String(off).replace(/\s+\d+$/, "") : "");
    const ef = div.equipmentFactor, xp = div.experience;
    set("deployEquip", ef == null ? "" : Math.round(ef * 100));
    set("deployExp", xp == null ? "" : Math.round(xp * 100));
    // The exact strings now sitting in the boxes. Comparing strings (not parsed numbers) means a value the
    // user retyped identically still counts as unchanged, which is what they meant.
    S.deployEdit.seed = {
      officer: ($("deployOfficer") && $("deployOfficer").value) || "",
      equip: ($("deployEquip") && $("deployEquip").value) || "",
      exp: ($("deployExp") && $("deployExp").value) || "",
    };
    const btn = $("deployBtn"); if (btn) btn.textContent = "✓ Update this one";
    const st = $("deployStatus");
    if (st) {
      st.style.color = "#58a6ff";
      const others = (S.model.divisions || []).filter((d) => d !== div && d.location === loc && (d.template || "") === tpl).length;
      const note = others
        ? ` <span style="color:#8b949e;">${pl(others, "other division")} of this template ${others === 1 ? "is" : "are"} also at this province — ${others === 1 ? "it is" : "they are"} not affected.</span>`
        : "";
      st.innerHTML = `Editing <b>one division</b> at province ${loc}. Change the boxes and press Update.${note} <a href="#" id="deployCancelEdit" style="color:#8b949e;">cancel</a>`;
    }
    const cx = $("deployCancelEdit");
    if (cx) cx.addEventListener("click", (e) => { e.preventDefault(); endDeployEdit(); });
    renderDivisionList();
    const state = $("deployState"); if (state) state.placeholder = "— staying put —";
  }
  function endDeployEdit() {
    S.deployEdit = null;
    const btn = $("deployBtn"); if (btn) btn.textContent = "Deploy here";
    const st = $("deployStatus"); if (st) st.textContent = "";
    const state = $("deployState"); if (state) state.placeholder = "e.g. 100";
    ["deployCount", "deployOfficer", "deployEquip", "deployExp"].forEach((id) => { const e = $(id); if (e) e.value = id === "deployCount" ? "1" : ""; });
    const cnt = $("deployCount"); if (cnt) cnt.disabled = false; // it means "how many to place" again
    renderDivisionList();
  }
  // Apply the form to divisions already placed, in place — no state lookup, they aren't moving.
  function applyDeployEdit() {
    const { loc, div } = S.deployEdit;
    const st = $("deployStatus");
    // One division — the one whose tile was clicked. #x2-brigade-cards
    if (!div || !(S.model.divisions || []).includes(div)) { endDeployEdit(); return; }
    const mine = [div];
    const officer = ($("deployOfficer") && $("deployOfficer").value || "").trim();
    const equipPct = parseInt($("deployEquip") && $("deployEquip").value, 10);
    const expPct = parseInt($("deployExp") && $("deployExp").value, 10);
    // Same clamp as placing: these are FACTORS (0-1). 100% is the ceiling — no real file in vanilla, MD or
    // R56 goes above 1.0 in ~16k uses, and the inputs are min=0 max=100.
    const ef = Number.isFinite(equipPct) ? Math.max(0, Math.min(100, equipPct)) / 100 : null;
    const xp = Number.isFinite(expPct) ? Math.max(0, Math.min(100, expPct)) / 100 : null;
    // The count box is disabled while editing — it means "how many to place", and an edit acts on the one
    // division you clicked. Growing or shrinking a stack is done by placing more or by removing tiles, both
    // of which are now per-division. #x2-brigade-cards
    // #deploy-tile-update-homogenises-group — ONLY WRITE A FIELD THE USER ACTUALLY CHANGED.
    //
    // This used to write all three onto every division in the group unconditionally, from values scavenged
    // off whichever division happened to have one. So clicking a placed tile to look at it and pressing the
    // button — with nothing edited — replaced every commander in the stack with division[0]'s name plus an
    // index it never had, and flattened their equipment and experience onto division[0]'s.
    //
    // Real content is full of uneven stacks: 34 groups across 10 vanilla order-of-battle files have two or
    // more divisions sharing a template and province with DIFFERENT commanders. Vanilla's ETH_1936_bba.txt
    // puts "1 Wag Sefari" (Haile Kebbede, 45% equipment, 5% experience) and "1 Welega-Ardjo Sefari"
    // (Makonnen Demissie, 100%, 25%) on the same template at province 7944; one Update deleted Makonnen
    // Demissie from the mod and halved the second division's readiness, reporting plain success.
    //
    // startDeployEdit already knew the group can be uneven — its firstWith() comment says so. The knowledge
    // was in the reader and not in the writer.
    const seed = (S.deployEdit && S.deployEdit.seed) || {};
    const now = {
      officer: ($("deployOfficer") && $("deployOfficer").value) || "",
      equip: ($("deployEquip") && $("deployEquip").value) || "",
      exp: ($("deployExp") && $("deployExp").value) || "",
    };
    const changed = (k) => seed[k] === undefined || now[k] !== seed[k];
    mine.forEach((d, i) => {
      if (changed("officer")) {
        // One division, so the name goes on as typed — no "Rommel 1" index, which only exists to tell several
        // divisions placed together apart.
        if (officer) d.officer = officer;
        else delete d.officer;
      }
      if (changed("equip")) { if (ef != null) d.equipmentFactor = ef; else delete d.equipmentFactor; }
      if (changed("exp")) { if (xp != null) d.experience = xp; else delete d.experience; }
      d._dirty = true;
    });
    const msg = "Updated this division";
    setUnsaved(true);
    S.deployEdit = null;
    const btn = $("deployBtn"); if (btn) btn.textContent = "Deploy here";
    // startDeployEdit disabled the count box; this path clears the edit without going through
    // endDeployEdit, so it has to hand the box back itself or placing is stuck at one. #x2-brigade-cards
    const cnt = $("deployCount"); if (cnt) { cnt.disabled = false; cnt.value = "1"; }
    renderDivisionList(); updateCountStatus(); renderDesigner();
    if (st) { st.style.color = "#3fb950"; st.textContent = `${msg} at province ${loc}. Don't forget 💾 Save.`; }
  }
  function renderDeploy() {
    const sel = $("deployTemplate");
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = S.model.templates.map((t) => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join("");
      if (S.model.templates.some((t) => t.name === cur)) sel.value = cur;
    }
    renderDivisionList();
  }
  function renderDivisionList() {
    const el = $("deployList"); if (!el) return;
    const divs = (S.model.divisions || []).filter((d) => d.location != null);
    if (!divs.length) { el.innerHTML = '<div class="army-empty">No divisions placed yet — pick a template + state above.</div>'; return; }
    // #x2-brigade-cards — ONE TILE PER DIVISION.
    //
    // These used to be grouped by template@province into a single tile marked ×N, and the grouping hid more
    // than it tidied. Real stacks are UNEVEN: 34 groups across 10 vanilla order-of-battle files put two or
    // more divisions on the same template and province with DIFFERENT commanders, and vanilla's
    // ETH_1936_bba.txt has "1 Wag Sefari" (Haile Kebbede, 45% / 5%) and "1 Welega-Ardjo Sefari" (Makonnen
    // Demissie, 100% / 25%) at province 7944. One ×2 tile showed a single commander count and one of the two
    // equipment figures, so neither division was visible and neither could be removed or edited on its own —
    // the × deleted BOTH.
    //
    // The render order is kept on S so a click maps back to the exact division OBJECT. Identity, not an
    // index: the array is filtered on delete, and a stored index would then point at a different division.
    S._depOrder = divs.slice();
    el.innerHTML = '<div class="dep-tiles">' + S._depOrder.map((d, di) => {
      const g = { template: d.template, location: d.location,
        officer: d.officer || "", ef: d.equipmentFactor != null ? d.equipmentFactor : null,
        xp: d.experience != null ? d.experience : null };
      const t = S.model.templates.find((x) => x.name === g.template);
      // Derive frame colour, NATO glyph AND the overlaid picture from the SAME dominant battalion, so a
      // template like 3-inf + 2-tank never shows an infantry glyph under a tank picture. #counter-align
      const domKey = t ? templateDominantKey(t) : "";
      const cat = domKey ? catFromKey(domKey) : "other";
      const domSu = domKey ? suByKey(domKey) : null; // dominant battalion → its real icon (case-insensitive #unit-key-case)
      const col = CAT_COLOR[cat] || CAT_COLOR.other;
      const chips = [];
      // This division's OWN commander by name — the thing the grouped tile could not show.
      if (g.officer) chips.push(`<span class="dep-chip">🎖 ${esc(g.officer)}</span>`);
      if (g.ef != null) chips.push(`<span class="dep-chip">⚙ ${Math.round(g.ef * 100)}% equipment</span>`);
      if (g.xp != null) chips.push(`<span class="dep-chip">🎯 ${Math.round(g.xp * 100)}% experience</span>`);
      const ed = S.deployEdit && S.deployEdit.div === d;
      return `<div class="dep-tile${ed ? " editing" : ""}" style="--uc:${col}" data-i="${di}" title="Click to edit this division — its commander, equipment and experience">`
        + `<div class="dep-counter"><span class="dep-echelon">XX</span><span class="unit-glyph">${unitSymbol(cat)}</span>${domSu ? unitPic(domSu) : ""}</div>`
        + `<div class="dep-body"><div class="dep-name" title="${esc(d.name || g.template || "(no template)")}">${esc(g.template || "(no template)")}</div>`
        + `<div class="dep-loc">📍 province ${g.location}</div>`
        + (chips.length ? `<div class="dep-chips">${chips.join("")}</div>` : "")
        + `</div>`
        // Growing a stack used to be the count box on the group edit form. With one tile per division that
        // box no longer has a group to resize, so the capability moves here, per-division: copy this exact
        // division — commander, equipment and experience included — into the same province. #x2-brigade-cards
        + `<span class="dep-dup" data-i="${di}" title="Add another just like this one at this province">⧉</span>`
        + `<span class="dep-del" data-i="${di}" title="Remove this division">×</span></div>`;
    }).join("") + '</div>';
    // Click a placed division to pull it back into the boxes above and change it — that was the only way to
    // adjust experience/equipment/commander short of deleting and re-placing. #deploy-edit
    el.querySelectorAll(".dep-tile").forEach((tile) => tile.addEventListener("click", (e) => {
      // the × and the ⧉ have their own jobs
      if (e.target.classList.contains("dep-del") || e.target.classList.contains("dep-dup")) return;
      const d = (S._depOrder || [])[Number(tile.dataset.i)];
      if (d) startDeployEdit(d);
    }));
    el.querySelectorAll(".dep-dup").forEach((b) => b.addEventListener("click", () => {
      const d = (S._depOrder || [])[Number(b.dataset.i)];
      if (!d) return;
      const tpl = d.template || "";
      const n = (S.model.divisions || []).filter((x) => (x.template || "") === tpl).length + 1;
      const copy = { name: `${n}. ${tpl}`, location: d.location, template: d.template, _dirty: true };
      if (d.officer) copy.officer = d.officer;
      if (d.equipmentFactor != null) copy.equipmentFactor = d.equipmentFactor;
      if (d.experience != null) copy.experience = d.experience;
      S.model.divisions.push(copy);
      setUnsaved(true);
      renderDivisionList(); updateCountStatus();
      const st = $("deployStatus");
      if (st) { st.style.color = "#3fb950"; st.textContent = `Added another ${tpl || "division"} at province ${d.location}. Don't forget 💾 Save.`; }
    }));
    mountUnitIcons(el); // real dominant-battalion icon on each division counter
    el.querySelectorAll(".dep-del").forEach((x) => x.addEventListener("click", () => {
      // Remove THIS division, not every division sharing its template and province. #x2-brigade-cards
      const d = (S._depOrder || [])[Number(x.dataset.i)];
      if (!d) return;
      S.model.divisions = S.model.divisions.filter((y) => y !== d);
      setUnsaved(true);
      // If we're mid-edit of the very division just deleted, the form is left pointing at something that no
      // longer exists: the button stays "✓ Update these" and the next press silently no-ops. Reset the editor
      // so the button returns to "Deploy here" and the typed boxes place fresh. #deploy-del-mid-edit
      const wasEditingThis = S.deployEdit && S.deployEdit.div === d;
      if (wasEditingThis) endDeployEdit(); else renderDivisionList(); // endDeployEdit already re-renders the list
      updateCountStatus();
    }));
  }
  async function deployDivisions() {
    const st = $("deployStatus");
    // Editing an existing group? Then the button means Update, and nothing moves — so no state lookup.
    if (S.deployEdit) { applyDeployEdit(); return; }
    const tpl = $("deployTemplate").value;
    const stateId = parseInt($("deployState").value, 10);
    const count = Math.max(1, Math.min(50, parseInt($("deployCount").value, 10) || 1));
    if (!tpl) { if (st) { st.style.color = "#d29922"; st.textContent = "Create a template first."; } return; }
    if (!Number.isInteger(stateId) || stateId <= 0) { if (st) { st.style.color = "#d29922"; st.textContent = "Enter a valid state ID."; } return; }
    if (st) { st.style.color = "#8b949e"; st.textContent = "Resolving state…"; }
    // Re-entry guard: `base` is read and the rows are pushed AFTER the await below, so a double-click — or a double-
    // Enter (the deploy inputs' Enter handler turns each keypress into a button click) — would run two placements
    // that each recompute base and push `count` divisions, silently placing 2×N and then saving them to the OOB.
    // Bail synchronously on the concurrent second call; always clear the flag in finally. #deploy-double-fire
    if (S._deploying) return;
    S._deploying = true;
    try {
      const modelAtRequest = S.model; // if the country changes while we await, the placement must NOT land in it
      let d;
      try { d = await fetch(`/api/state-province?modPath=${encodeURIComponent(modPath())}&state=${stateId}`).then((r) => r.json()); }
      catch (e) { if (st) { st.style.color = "#f85149"; st.textContent = "Failed: " + (e.message || e); } return; }
      if (!d || !d.ok) { if (st) { st.style.color = "#f85149"; st.textContent = d && d.error ? d.error : "Couldn't resolve that state."; } return; }
      if (S.model !== modelAtRequest) { if (st) { st.style.color = "#d29922"; st.textContent = "Country changed while resolving — deploy cancelled."; } return; }
      const officer = ($("deployOfficer") && $("deployOfficer").value || "").trim();
      const equipPct = parseInt($("deployEquip") && $("deployEquip").value, 10);
      const equipmentFactor = Number.isFinite(equipPct) ? Math.max(0, Math.min(100, equipPct)) / 100 : null;
      const expPct = parseInt($("deployExp") && $("deployExp").value, 10);
      const experience = Number.isFinite(expPct) ? Math.max(0, Math.min(100, expPct)) / 100 : null;
      const base = (S.model.divisions || []).filter((x) => x.template === tpl).length;
      for (let i = 0; i < count; i++) {
        const div = { name: `${base + i + 1}. ${tpl}`, location: d.province, template: tpl, _dirty: true };
        if (officer) div.officer = count === 1 ? officer : `${officer} ${base + i + 1}`;
        if (equipmentFactor != null) div.equipmentFactor = equipmentFactor;
        if (experience != null) div.experience = experience;
        S.model.divisions.push(div);
      }
      const ownerNote = d.owner && d.owner !== S.country ? ` — ⚠ ${d.name || "state " + stateId} is ${d.owner}'s, not ${S.country}'s` : "";
      if (st) { st.style.color = ownerNote ? "#d29922" : "#3fb950"; st.textContent = `Placed ${count} → province ${d.province}${d.viaVictoryPoint ? " (VP)" : ""} in ${d.name || "state " + stateId}${ownerNote}. Don't forget 💾 Save.`; }
      setUnsaved(true);
      renderDivisionList(); updateCountStatus();
      renderDesigner(); // resets the rename-follow capture so freshly placed divisions join a later rename
    } finally { S._deploying = false; }
  }
  function updateCountStatus() {
    const status = $("armyCountryStatus");
    if (status && S.country) status.textContent = `${pl(S.model.templates.length, "template")}, ${pl(S.model.divisions.length, "division")} · editing ${S.model.file}`;
  }

  // ── Equipment sub-tab (land equipment families) ─────────────────────────
  const EQ_STATS = [
    { key: "softAttack", label: "Soft attack", ic: "soft" }, { key: "hardAttack", label: "Hard attack", ic: "hard" },
    { key: "defense", label: "Defense", ic: "def" }, { key: "breakthrough", label: "Breakthrough", ic: "bt" },
    { key: "apAttack", label: "Armor pierce", ic: "pierce" }, { key: "airAttack", label: "Air attack", ic: "air" },
    { key: "reliability", label: "Reliability", ic: null }, { key: "buildCostIc", label: "Build cost (IC)", ic: null },
  ];
  // The 6 HOI4 strategic resources an equipment can cost per unit built (resources = { steel = 2 … }).
  const EQ_RESOURCES = ["steel", "aluminium", "tungsten", "rubber", "oil", "chromium"];
  // Ships and planes don't have soft/hard attack — they have NAVAL / AIR stats. Show the right set per domain
  // so a ship isn't a wall of blank land fields ("ships don't display power"). #ship-stats
  const EQ_STATS_NAVAL = [
    { key: "maxStrength", label: "HP", ic: "hp" }, { key: "armorValue", label: "Armor", ic: "armor" },
    { key: "navalSpeed", label: "Speed", ic: "speed" }, { key: "lgAttack", label: "Light gun", ic: "soft" },
    { key: "hgAttack", label: "Heavy gun", ic: "hard" }, { key: "torpedoAttack", label: "Torpedo", ic: "pierce" },
    { key: "antiAirAttack", label: "Anti-air", ic: "air" }, { key: "reliability", label: "Reliability", ic: null },
    { key: "buildCostIc", label: "Build cost (IC)", ic: null },
  ];
  const EQ_STATS_AIR = [
    { key: "airAttack", label: "Air attack", ic: "air" }, { key: "airDefence", label: "Air defense", ic: "def" },
    { key: "airAgility", label: "Agility", ic: "speed" }, { key: "airRange", label: "Range", ic: "recon" },
    { key: "maximumSpeed", label: "Max speed", ic: "speed" }, { key: "reliability", label: "Reliability", ic: null },
    { key: "buildCostIc", label: "Build cost (IC)", ic: null },
  ];
  const eqDomain = (e) => (e && e.designer === "ships") ? "ships" : (e && e.designer === "planes") ? "planes" : "land";
  const statsForEquip = (e) => eqDomain(e) === "ships" ? EQ_STATS_NAVAL : eqDomain(e) === "planes" ? EQ_STATS_AIR : EQ_STATS;
  // If an equipment carries NO combat stats at all, explain why (support/utility gear) — same courtesy as
  // the ship note, so no equipment is a silent wall of blank fields. #stat-audit
  // HOI4's `duplicate_archetypes` makes the ENGINE generate a whole chassis family — a clone archetype plus
  // one tier per source tier — and none of them has a line of text in any file. Nova lists them so the
  // designer can find them, which it should; what it must not do is list them as if they were the modder's
  // own blocks. Saving one writes a real block, and an explicit definition WINS over the generated one — so
  // a weapon that used to track its source silently stops. Vanilla's x_tank_chassis.txt reports 135
  // equipment against 69 real blocks. Say what the button will do before it does it.
  // #generated-tier-listed-as-authored
  function eqGeneratedNote(e) {
    const from = e && e.generatedFrom ? String(e.generatedFrom) : "";
    if (!from) return "";
    return `<div class="eq-readonly-note" style="margin-top:12px;">⚙️ HOI4 <b>generates this</b> from <code>${esc(from)}</code>`
      + ` — <code>duplicate_archetypes</code> makes a copy of that whole family, so there is no block for it in your files`
      + ` and it follows <code>${esc(from)}</code> whenever you change it.`
      + ` <b>Saving will write a real block</b>, which overrides the generated one: useful if you want this variant to differ,`
      + ` but from then on it stops following <code>${esc(from)}</code>. Edit <code>${esc(from)}</code> instead to change the whole family.</div>`;
  }
  function eqNoStatsNote(e, statSet) {
    const anyCombat = statSet.some((s) => { const v = e[s.key]; return v !== undefined && v !== null && v !== "" && Number(v) !== 0; });
    if (anyCombat) return "";
    const idl = String(e.id || "").toLowerCase(), t = String(e.type || "").toLowerCase();
    const isSupport = t === "support" || /support|logistic|signal|engineer|recon|maintenance|hospital|military_police|_mp_|armored_car|util/.test(idl);
    const kind = isSupport ? "support / utility equipment" : "non-combat equipment";
    return `<div class="eq-readonly-note" style="margin-top:12px;">ℹ️ This is <b>${kind}</b> — its value is the bonuses / capacity / reliability it gives the units that use it, not direct soft/hard attack, so those stats are simply not defined for it.</div>`;
  }
  // Category glyph + the REAL in-game picture on top (GFX_<id>_medium). mountEqIcons resolves it: on a real
  // hit it CONTAINS the full picture and HIDES the glyph; on the "?" placeholder it hides the picture so the
  // glyph shows. (These _medium sprites are single WIDE frames, so we contain — never strip-crop, which was
  // slicing them = the "bleeding".) #equipment-pictures
  // Art candidates for one equipment, most-specific → most-generic; FIRST REAL HIT WINS.
  //   1. GFX_<id>_medium      — its OWN sprite. FIRST ON PURPOSE: mods name the era-specific art after the
  //                             equipment id (MD: MBT_3 → SOV/LAND/MBT3.dds), and MD gives MBT_1/MBT_3/IFV_3
  //                             the SAME `picture`, so picture-first would collapse 406 distinct pictures
  //                             into one generic silhouette.
  //   2. GFX_<picture>_medium — HOI4's own `picture` field. Recovers the ~122 MD equipment (tank chassis,
  //                             convoys, airframes) that ship no sprite under their id.
  //   3. GFX_<tech>_medium    — the ENABLING TECH. Missiles/satellites hang their only art off the tech
  //                             (ballistic_missile_equipment → GFX_IRBM_medium), so this is what makes them
  //                             show a picture at all.
  //   4. the ARCHETYPE (id, then its picture) — the family silhouette, last resort.
  // Measured on MD: 406 → 559 of 588 equipment now resolve to a real picture. #equipment-pictures
  function eqArtCands(e) {
    if (!e) return [];
    const c = [];
    const push = (k) => { if (k && !c.includes(k)) c.push("GFX_" + k + "_medium"); };
    push(e.id);
    push(e.picture);
    for (const t of (e.enabledBy || [])) push(t);
    if (e.archetype) {
      push(e.archetype);
      const a = (S.equip.all || []).find((x) => x.id === e.archetype);
      if (a && a.picture) push(a.picture);
    }
    return c;
  }
  function eqIcon(e, big) {
    const cat = eqGlyphCat(e), col = CAT_COLOR[cat] || CAT_COLOR.other;
    return `<span class="eq-ico${big ? " eq-ico-lg" : ""}" style="color:${col}; border-color:${col}66;">`
      + `<span class="eq-glyph">${unitSymbol(cat)}</span>`
      + `<span class="eq-pic" data-cands="${esc(eqArtCands(e).join("|"))}"></span></span>`;
  }
  // The big variant/equipment photo box (.vv-photo) is a fixed WIDTH; its height hugs the picture's aspect
  // so a wide ~2:1 plane/tank/ship picture fills the box instead of floating in a tall band of empty space
  // (the "giant empty space" the user hit). Only the big panel resizes — small chips (.eq-ico) are ignored.
  // #vv-photo-hug
  function fitPhotoBox(picEl, url) {
    const box = picEl && picEl.parentElement;
    if (!box || !box.classList.contains("vv-photo")) return;
    const im = new Image();
    im.onload = () => {
      const w = im.naturalWidth, h = im.naturalHeight;
      if (!w || !h || (w === 63 && h === 63)) return; // guard: a placeholder slipped through → leave default
      const inset = 12, avail = Math.max(80, (box.clientWidth || 280) - inset * 2);
      const boxH = Math.round(Math.max(120, Math.min(avail / (w / h) + inset * 2, 300)));
      box.style.height = boxH + "px";
    };
    im.src = url;
  }
  // The ONE mounter for every equipment picture box (small chips AND the big photo panel). Walks the
  // candidate chain; the coloured category glyph stays only if NOTHING in the chain resolves — which now
  // means the mod genuinely ships no art for it, rather than "we asked under the wrong name".
  function mountEqIcons(root) {
    const mp = modPath();
    (root || document).querySelectorAll(".eq-pic[data-cands]").forEach((el) => {
      if (el.dataset.mounted) return; el.dataset.mounted = "1";
      const glyph = el.parentElement && el.parentElement.querySelector(".eq-glyph");
      // A variant's own `icon` may be a raw .dds PATH rather than a GFX_ key — /api/icon-image resolves both,
      // so candidates go in unwrapped. Route through the shared per-URL memo so re-renders (e.g. typing in
      // search) reuse the first resolution instead of re-fetching + async-blanking every icon. #icon-memo
      const urls = (el.dataset.cands || "").split("|").filter(Boolean)
        .map((k) => "/api/icon-image?key=" + encodeURIComponent(k) + "&modPath=" + encodeURIComponent(mp));
      (async () => {
        for (const u of urls) {
          const hit = await resolveUnitIconUrl(u); // null = "?" placeholder / error → try the next candidate
          if (hit) {
            el.style.backgroundImage = `url("${hit}")`; el.style.display = "block"; if (glyph) glyph.style.display = "none";
            fitPhotoBox(el, hit); // big photo panel only: shrink the box to hug a wide picture #vv-photo-hug
            return;
          }
        }
        // nothing resolved → the coloured category glyph stays visible
      })();
    });
  }
  // A COUNTRY VARIANT's own picture. The variant's `icon` is either a raw asset path
  // ("gfx/interface/technologies/USA/LAND/SPG3.dds") or a GFX_ key — both resolve via /api/icon-image.
  // When it has no icon, fall back to the base equipment's picture so a tank variant still shows a tank.
  // #variant-pictures
  // Shared art resolution for a variant: base equipment, category glyph, colour, and the base-picture
  // fallback (own icon → base picture → category glyph). variantIcon (small thumb) + variantPhoto (big
  // panel) both use it, computed once. #variant-art
  // The picture HOI4 itself would show for a variant, in the game's own priority order:
  //   1. the variant's explicit `icon`
  //   2. the equipment-designer GRAPHIC DB — country scope first, then "default"; the concrete TYPE beats the
  //      ARCHETYPE. This is how the game pictures an icon-less variant, and it is why MD's Czech "ShKH vz. 77
  //      DANA" shows the real DANA in-game (CZE → gfx/interface/technologies/CZE/LAND/DANA.dds) while Nova used
  //      to show the generic beige archetype silhouette.
  //   3. the base equipment's own sprite chain (id → picture → tech → archetype) as the final fallback.
  // #equipment-pictures
  function gdbIcons(tag, base) {
    const gdb = S.equip.gdb || {};
    const out = [];
    for (const scope of [String(tag || "").trim(), "default"]) {
      const s = scope && gdb[scope];
      if (!s) continue;
      for (const k of [base && base.id, base && base.archetype].filter(Boolean)) {
        if (s[k] && s[k].length) { out.push(...s[k]); break; } // type beats archetype
      }
    }
    return out;
  }
  function variantArt(v) {
    const base = S.equip.all.find((e) => e.id === v.type);
    const cat = eqGlyphCat(base || { type: v.type });
    const cands = [...new Set([
      (v && v.icon) || "",
      ...gdbIcons(v && v.tag, base),
      ...eqArtCands(base),
    ].filter(Boolean))];
    return { base, cat, col: CAT_COLOR[cat] || CAT_COLOR.other, cands };
  }
  function variantIcon(v, big) {
    const { cat, col, cands } = variantArt(v);
    return `<span class="eq-ico${big ? " eq-ico-lg" : ""}" style="color:${col}; border-color:${col}66;">`
      + `<span class="eq-glyph">${unitSymbol(cat)}</span>`
      + `<span class="eq-pic" data-cands="${esc(cands.join("|"))}"></span></span>`;
  }
  // The BIG vehicle picture for the variant editor (see the tank/plane/ship art at a large size beside the
  // modules, like the in-game designer). Same resolution as variantIcon; mountEqIcons fills it.
  function variantPhoto(v, arch, tag) {
    const { cat, col, cands } = variantArt(v);
    const photo = `<div class="vv-photo" style="border-color:${col}55;" title="${escLoc(v.name || v.type)}">`
      + `<span class="eq-glyph" style="color:${col};">${unitSymbol(cat)}</span>`
      + `<span class="eq-pic" data-cands="${esc(cands.join("|"))}"></span></div>`;
    // The company that designs this equipment sits right below its picture — same place as the in-game
    // designer. Filled async (fillVariantCompanies) so a slow MIO scan can't block the view. data-mio carries
    // the variant's OWN design_team (mio:X) when it declares one — the authoritative single designer. #mio-design
    const companies = (arch || (v && v.designTeam)) ? `<div class="vv-companies" data-arch="${esc(arch || "")}" data-tag="${esc(tag || "")}" data-mio="${esc((v && v.designTeam) || "")}"></div>` : "";
    return `<div class="vv-right-col">${photo}${companies}</div>`;
  }
  // The BIG picture for a PLAIN (non-modular) equipment — a missile, a satellite, MBT_3, a gun. Before, only
  // modular VARIANTS got a large photo panel, so non-DLC equipment looked second-class and missiles/satellites
  // had no big picture at all. Same panel, same chain. #equipment-pictures
  function eqPhoto(e) {
    const cat = eqGlyphCat(e), col = CAT_COLOR[cat] || CAT_COLOR.other;
    return `<div class="vv-photo" style="border-color:${col}55;" title="${escLoc((e && (e.name || e.id)) || "")}">`
      + `<span class="eq-glyph" style="color:${col};">${unitSymbol(cat)}</span>`
      + `<span class="eq-pic" data-cands="${esc(eqArtCands(e).join("|"))}"></span></div>`;
  }
  // Variants now share mountEqIcons (one candidate-chain mounter for every .eq-pic on the tab).
  const mountVariantIcons = mountEqIcons;
  // Equipment `type` → a unit-symbol category, so each row/row-editor gets a coloured glyph icon.
  function eqGlyphCat(e) {
    const t = String((e && e.type) || "").toLowerCase();
    if (t === "armor") return "armored";
    if (["screen_ship", "capital_ship", "carrier", "submarine", "convoy", "naval_support"].includes(t)) return "ship";
    if (["fighter", "cas", "tactical_bomber", "strategic_bomber", "naval_bomber", "interceptor", "air_transport", "heavy_fighter", "scout_plane", "maritime_patrol_plane", "suicide", "missile"].includes(t)) return "air";
    if (t === "anti_tank") return "anti_tank";
    if (t === "anti_air") return "anti_air";
    if (t === "artillery" || t === "rocket") return "artillery";
    if (t === "motorized") return "motorized";
    if (t === "mechanized") return "mechanized";
    if (t === "cavalry") return "cavalry";
    if (t === "infantry" || t === "support" || !t) return "infantry";
    return "other";
  }
  // A real HOI4 technology icon. Tech icons are multi-frame sprite STRIPS (e.g. 120×24 = 5 frames of 24²),
  // so we can't just <img> them — after the strip loads we crop to frame 0 via background-size/position
  // (the same trick the Research tree uses). Renders empty, then fills in; hides the 63×63 "?" placeholder.
  function techIcon(techId) { return `<span class="tech-ico" data-tech="${esc(techId)}" title="${esc(techId)}"></span>`; }
  function mountTechIcons(root) {
    (root || document).querySelectorAll(".tech-ico[data-tech]").forEach((el) => {
      if (el.dataset.mounted) return; el.dataset.mounted = "1";
      const im = new Image();
      im.onload = () => {
        const w = im.naturalWidth, h = im.naturalHeight;
        if (!w || !h || (w === 63 && h === 63)) { el.style.display = "none"; return; } // Nova's missing-icon placeholder
        el.style.backgroundImage = `url("${im.src}")`;
        // GFX_<tech>_medium sprites are SINGLE-frame pictures (vanilla declares zero noOfFrames on all
        // 1836 of them) — contain the whole image; a ratio-guessed strip-crop slices the artwork.
        el.style.backgroundSize = "contain";
        el.style.backgroundPosition = "left center";
      };
      im.onerror = () => { el.style.display = "none"; };
      im.src = "/api/icon-image?key=" + encodeURIComponent("GFX_" + el.dataset.tech + "_medium") + "&modPath=" + encodeURIComponent(modPath());
    });
  }
  // The REAL in-game module icon (the user's top priority). Verified naming: tank/plane modules =
  // GFX_EMI_<id> (Equipment Module Icon, single 56×42 frame), ship modules = GFX_SMI_<id>. Try EMI, then
  // SMI, then hide (so the ⛭ fallback behind shows). Placeholder = the 63×63 "?".
  const moduleImgSrc = (key) => "/api/icon-image?key=" + encodeURIComponent(key) + "&modPath=" + encodeURIComponent(modPath());
  function moduleIcon(moduleId) {
    return `<span class="mod-ico-wrap"><span class="mod-ico-fb">⛭</span><img class="mod-ico" data-mod="${esc(moduleId)}" alt="" /></span>`;
  }
  function mountModuleIcons(root) {
    (root || document).querySelectorAll("img.mod-ico[data-mod]").forEach((img) => {
      if (img.dataset.mounted) return; img.dataset.mounted = "1";
      const id = img.dataset.mod;
      const isPlaceholder = () => img.naturalWidth === 63 && img.naturalHeight === 63;
      let stage = 0; // 0 = trying EMI, 1 = trying SMI, 2 = give up
      const advance = () => {
        stage++;
        if (stage === 1) img.src = moduleImgSrc("GFX_SMI_" + id);
        else img.style.display = "none";
      };
      img.addEventListener("load", () => {
        if (isPlaceholder()) { advance(); return; }
        img.style.opacity = "1";
        // Real icon loaded → HIDE the ⛭ fallback behind it, or it shows through transparent pixels
        // (the "mechanical wheel behind the shell"). It only displays when there's no image.
        const fb = img.parentElement && img.parentElement.querySelector(".mod-ico-fb");
        if (fb) fb.style.display = "none";
      });
      img.addEventListener("error", advance);
      img.src = moduleImgSrc("GFX_EMI_" + id);
    });
  }
  // ── Purple "?" help chips (same look as the Research sidebar) + a tiny self-contained modal. ──
  const ARMY_HELP = {
    outdated: ["Outdated equipment", "<p>Marks this design as <b>outdated</b>: the country keeps any it already built, but factories won't produce more and new units won't request it — newer designs take over.</p><p style='color:#8b949e;font-size:12px;'>In the files this is the game's <code>obsolete = yes</code> flag — same thing, the game's interface calls it outdated.</p>"],
    upgrades: ["Upgrade levels", "<p>How many levels of each upgrade this design already has (<b>0</b> = none). Upgrades are defined by the mod — e.g. <i>tank nsb armor upgrade</i> adds armour per level — and each level improves the matching stat for a bit more production cost.</p><p style='color:#8b949e;font-size:12px;'>In game these are the “+” levels you buy with army XP on a variant in the designer.</p>"],
    "plane-roles": ["Roles this plane can fly", "<p>The missions this aircraft is <b>allowed</b> to be assigned to (the game's <code>allow_mission_type</code>). Tick every role you want it to be able to do.</p><p>This only decides whether it <b>can</b> fly the mission, not how good it is at it — a plane with 0 bombing that's allowed <i>Strategic bombing</i> will fly the mission but do almost nothing. It won't crash the game; it's just ineffective.</p><p style='color:#a6acd0;font-size:12px;'>Tip: give a role its matching stat (Close air support → ground attack, Naval strike → naval attack, Air superiority → air attack) so the plane is actually useful at it.</p>"],
    "equipment-tab": ["Equipment &amp; arsenal", "<p>Every weapon in the mod, grouped by <b>category</b> (its equipment family). Under each family you see:</p><ul style='margin:0 0 0 18px; padding:0; line-height:1.7;'><li>the <b>equipment types</b> — the archetype + its tech tiers;</li><li>the <b>country variants</b> built on them — each nation's named designs (\"AH-1 Cobra\", \"AK-74M\"), with the owner's tag.</li></ul><p style='margin-top:8px;'>Filter by one or more countries up top, tick <b>base game</b> to include vanilla types, and untick <b>country variants</b> to hide the named ones. Click any row to see its full stats; click a variant to edit or rebuild it.</p><p style='color:#a6acd0;font-size:12px;'>Make your own with <b>＋ New equipment family</b> (land or aircraft — you assign an aircraft's roles), or design a tank / ship / plane from parts below.</p>"],
    designer: ["The tank / ship / plane designer", "<p>Build a vehicle the way you do in-game: pick a <b>chassis</b>, fill each <b>slot</b> with a module, name it, and give it to a country. Stats update live as you add parts.</p><p>Each designer needs its DLC — <b>tanks → No Step Back</b>, <b>ships → Man the Guns</b>, <b>planes → By Blood Alone</b>. Nova always writes a safe non-modular <b>fallback</b> alongside your design, so players <i>without</i> the DLC still get a working piece of equipment instead of a crash.</p>"],
    "stockpile": ["Starting stockpile", "<p>Fills the country's national equipment reserve at the <b>start of the game</b> (<code>add_equipment_to_stockpile</code>), so its units can equip on day 1 instead of producing everything from scratch.</p><p><b>Equipment type</b> is the equipment id (e.g. <code>infantry_equipment_1</code>). <b>Variant name</b> (optional) pins a specific named design you built in the arsenal (e.g. \"AH-1 Cobra\"). <b>Amount</b> is how many. <b>Producer</b> (optional) is which country is credited as the maker.</p><p style='color:#a6acd0;font-size:12px;'>Written into this country's history in a Nova-managed block, so re-saving replaces it cleanly.</p>"],
    "new-chassis": ["Create a modular chassis", "<p>Builds a brand-new <b>modular chassis</b> — the frame the designer fills with parts (a tank hull, a ship hull, an airframe). You define the <b>module slots</b> and which module categories each accepts, and Nova writes the archetype plus one buildable tier so it appears in the chassis list here.</p><p><b>Domain</b> (tank / ship / plane) sets the in-game interface. <b>Type</b> is the <b>equipment type</b>, which is what decides the designer it appears in — <code>armor</code> for tanks; <code>screen_ship</code> / <code>capital_ship</code> / <code>carrier</code> / <code>submarine</code> for ships; a role (<code>fighter</code>, <code>cas</code>, <code>tactical_bomber</code>…) for planes. Pick from the suggestions — a type outside those lists is rejected, because HOI4 would never show the chassis. Each <b>slot</b> needs a name and at least one allowed module category (pick from the ones that exist in this mod).</p><p style='color:#a6acd0;font-size:12px;'>Careful: <code>destroyer</code>/<code>light_cruiser</code>/<code>battleship</code> are <i>not</i> equipment types — they're the <code>ship = { definition = … }</code> values used by the starting-navy editor. A ship <i>hull</i> is a <code>screen_ship</code> or a <code>capital_ship</code>.</p><p style='color:#a6acd0;font-size:12px;'>To make it researchable in-game, link its tier to a tech's <b>enable_equipments</b> in the Research Tree. The designer shows it regardless.</p>"],
    "upgrade-def": ["Custom equipment upgrade", "<p>Defines a new <b>upgrade</b> — the small “+” improvements a player buys with <b>army/air/navy experience</b> on a designed variant in the equipment designer. Each level applies your stat change (e.g. <i>+0.1 armour, −0.02 speed</i> per level).</p><p><b>Cost type</b> (land / air / naval) is which XP pool pays for it. <b>Max level</b> is how many levels can be bought. Give it at least one <b>per-level stat change</b>.</p><p><b>Which equipment gets it</b> is the part that makes it real: HOI4 only offers an upgrade on a design if the equipment itself lists it — <code>mechanized = { … upgrades = { tank_engine_upgrade } … }</code>. Tick the equipment and Nova writes that line. Leave it empty and the upgrade exists in the files but no designer in the game will ever show it.</p><p style='color:#a6acd0;font-size:12px;'>Written to common/units/equipment/upgrades/ in a Nova file. Only this mod's own equipment is listed, because a mod file replaces a base-game file of the same name wholesale. Once it's attached, setting a level on a particular named variant is done in the designer / arsenal.</p>"],
    "mio": ["Manufacturers (MIO)", "<p>A <b>Military Industrial Organization</b> is a real-world manufacturer (Daimler-Benz, Krupp, Mitsubishi…) that a country assigns to build a piece of equipment. Each has a small <b>trait tree</b> the player unlocks with army XP, and every trait <b>buffs the equipment it produces</b> (armour, reliability, production efficiency…). Added by the <i>Arms Against Tyranny</i> DLC.</p><p><b>Available to</b> gates which country can use it (blank = anyone). <b>Works on</b> is the equipment/research categories it can manufacture (<code>mio_cat_eq_*</code> / <code>mio_cat_tech_*</code>). The <b>base bonus</b> (initial trait) always applies; each extra <b>trait</b> sits at a grid position and adds more when unlocked.</p><p style='color:#a6acd0;font-size:12px;'>Written to common/military_industrial_organization/organizations/ in a Nova file; names go to localisation.</p>"],
    "navalair": ["Starting navy &amp; air force", "<p>Give this country ships and planes at the <b>start of the game</b>. Nova writes a mod-owned order-of-battle file (<code>history/units/&lt;TAG&gt;_nova_navy.txt</code> / <code>_air.txt</code>) <b>and</b> wires the country's history to load it (<code>set_naval_oob</code> / <code>set_air_oob</code>) — without that reference the file would be ignored.</p><p><b>Navy:</b> a <b>fleet</b> is based at a <b>naval-base province</b> and holds <b>ships</b>. Each ship has a <b>type</b> (e.g. <code>destroyer</code>), an <b>equipment archetype</b> (e.g. <code>destroyer_1</code> — the actual hull it's built from), an amount and an owner.</p><p><b>Air:</b> an <b>air wing</b> sits in a <b>state</b> (its air base) and holds groups of aircraft — each an <b>equipment archetype</b> (e.g. <code>fighter_equipment_1</code>), an amount and an owner.</p><p style='color:#a6acd0;font-size:12px;'>Adding to a country that already had a naval/air OOB replaces that reference — Nova warns you when it does.</p>"],
    "dsg-icon": ["Icon (optional)", "<p>The small <b>counter picture</b> this design shows in the production queue, the equipment tooltip and the unit's info panel — the icon a player actually sees next to the name.</p><p>Two accepted forms:</p><ul style='margin:6px 0 6px 18px; padding:0;'><li>a <b>sprite key</b> from a .gfx file — <code>GFX_medium_tank_medium</code></li><li>a <b>picture path</b> inside the mod — <code>gfx/interface/technologies/my_tank.dds</code></li></ul><p><b>Leave it blank</b> and the design simply inherits its chassis's icon — which is correct almost always. Only set it when this design should look different from the frame it's built on. Use <b>🖼 Browse</b> to pick a real one instead of typing.</p><p style='color:#a6acd0;font-size:12px;'>A key that doesn't exist renders as the “?” placeholder in-game, so browse rather than guess.</p>"],
    "tpl-column-group": ["Why can't I mix them in one column?", "<p>Each column here is one <b>regiment</b>, and a regiment is made of one kind of battalion. Tanks, infantry and motorised are three different kinds, so they each need their own column. That's the game's rule, not Nova's — the in-game designer works exactly the same way.</p><p>The kinds are: <b>Infantry</b> (infantry, marines, mountaineers, paratroopers…), <b>Motorised</b> (motorised, mechanised, cavalry, armoured cars), <b>Armour</b> (every tank), and the towed / armoured / motorised <b>support</b> kinds (artillery, AA, anti-tank).</p><p style='color:#a6acd0;font-size:12px;'>Nova <b>warns</b> instead of stopping you, because it isn't a crash — it's the designer's rule. The base game itself breaks it: vanilla's own “Kebur Zabagna” stacks cavalry on four infantry, and “Azad Hind Infantry Corps” puts a tank above infantry. Paradox just marks those templates locked so a player can never open them in the designer. If you mix kinds, expect the same: the game loads your division fine, but you won't be able to edit it in-game.</p>"],
    "mio-design": ["Designed by", "<p>The <b>company</b> (Military Industrial Organization) that builds this kind of equipment. Its trait tree gives real bonuses to everything it produces of this type — more armour, more speed, cheaper build cost.</p><p>HOI4 doesn't tie a design to one fixed company; instead every manufacturer that works on this equipment TYPE (tanks, fighters, ships…) can build it, and you pick which one when you set up production. Nova lists the ones available to this country first, then generic manufacturers any nation can use.</p><p style='color:#a6acd0;font-size:12px;'>Hover a company to see its full trait bonuses. This is display-only — it reads the mod's real MIOs and never changes your files.</p>"],
    "chassis-priority": ["Priority", "<p>How hard the game's <b>AI</b> pushes to produce this, relative to your other equipment. It does <b>not</b> change the weapon's stats or what a human player can build — you always choose your own production yourself.</p><p>Higher = the AI favours it. <b>100</b> is the normal default; vanilla tank and plane chassis sit around there. <b>0</b> is legal and means “lowest” — it doesn't disable anything.</p><p style='color:#a6acd0;font-size:12px;'>If you're not sure, leave it at 100. It's the one field here you can safely ignore.</p>"],
    "nw-multirole": ["Can it do more than one thing?", "<p>Yes — and real mods rely on it.</p><p>Pick the job it <b>mainly</b> does above, then tick every other job it also does below. One weapon, several roles.</p><p><b>Aircraft</b> keep one main job and list the rest as roles they're allowed to fly. Vanilla's own fighter airframe allows <b>five</b> — fighter, interceptor, CAS, naval strike and kamikaze — off a single frame. That's written as <code>allowed_types</code>.</p><p><b>Land vehicles</b> instead count as several kinds at once, written as <code>type = { armor anti_air }</code>. That is exactly how self-propelled AA is made — Millennium Dawn builds its SPAA that way, and its flame and rocket tanks too.</p><p style='color:#a6acd0;font-size:12px;'>Ships have no equivalent — no real file gives a hull more than one job, so Nova doesn't offer it.</p>"],
    "nw-behaviour": ["Why can't I invent a brand-new kind?", "<p>You're building something HOI4 has never seen — its own frame, its own part slots, its own art, its own name. All of that is <b>real and yours</b>.</p><p>The one thing you can't invent is the <b>engine's idea of what it is</b>. HOI4's list of kinds (tank, fighter, bomber, submarine…) is compiled into the game itself, not read from files — so a mod can't add “satellite” to it. What you do instead is pick the kind whose <b>behaviour</b> is closest, and everything the player actually sees is still yours.</p><p><b>Every mod does this.</b> Millennium Dawn wanted helicopters; the engine has no helicopter, so MD's helicopters are built on a <b>tank</b> chassis. Paradox themselves did the same — vanilla's helicopter is <code>infantry</code>. MD's corvettes are <code>screen_ship</code>. Its zombies are <code>infantry</code>.</p><p>So for an orbital laser platform, pick <i>“Flies and bombs buildings &amp; industry”</i> — the game will treat it as a strategic bomber under the hood, and your players will only ever see your satellite.</p><p style='color:#a6acd0;font-size:12px;'>Only these kinds can have <b>swappable parts</b> at all — parts are a designer-DLC feature (tanks → No Step Back, ships → Man the Guns, planes → By Blood Alone). Nothing else in the game has them, which is why missiles and infantry aren't offered here: they have fixed stats instead, made with <b>＋ New equipment</b>.</p>"],
    "dsg-fallback": ["No-DLC fallback", "<p>The <b>plain (non-modular) equipment</b> that players who don't own the designer DLC get instead of this design.</p><p>Modular equipment only exists with its DLC (tanks → No Step Back, ships → Man the Guns, planes → By Blood Alone). Without a fallback the mod would reference equipment those players don't have and <b>crash them</b>, so Nova always writes the design as a <code>has_dlc</code> pair: the modular version for owners, this fallback for everyone else.</p><p>Pick something of the <b>same kind and era</b> as what you're building — a medium tank design falls back to a medium tank, a fighter to a fighter — so the two play alike.</p><p style='color:#a6acd0;font-size:12px;'>Nova pre-selects a matching fallback from the chassis you chose and re-picks it if you change chassis; override it only if you want a specific one.</p>"],
    "build-cost": ["Build cost (IC)", "<p>How much <b>industry</b> one unit of this equipment costs to produce — the single biggest lever on how many a country can field.</p><p>Writes <code>build_cost_ic</code>. It is not money or a one-off price: it's the production weight a factory chews through, so <b>double the cost ≈ half the output</b> from the same factories.</p><p>Vanilla reference points:</p><ul style='margin:6px 0 6px 18px; padding:0;'><li><code>0.5</code> — infantry equipment (rifles)</li><li><code>1</code>–<code>2</code> — support/artillery gear</li><li><code>4</code>–<code>8</code> — light / medium tanks</li><li><code>12</code>–<code>20</code> — heavy tanks, fighters</li><li><code>30</code>+ — strategic bombers, capital-ship hulls</li></ul><p style='color:#a6acd0;font-size:12px;'>Modules add their own cost on top of the chassis, so the finished design usually lands above this number. Setting it far below the vanilla band for its class is the classic way to accidentally make a mod trivially easy.</p>"],
    "tpl-names-group": ["Names group", "<p>Ties this template to a historical division-name <b>pool</b> so its divisions get period-correct names instead of “1. Infantry Division, 2. Infantry Division…”.</p><p>Writes <code>division_names_group</code>. The pools live in <b>common/units/names_division</b> — e.g. <code>GER_INF_01</code> gives German infantry names, <code>SOV_ARM_01</code> Soviet armour names.</p><p style='color:#a6acd0;font-size:12px;'>Leave blank and the game just numbers them. The name you type must match a group that exists in this mod or the base game.</p>"],
    "tpl-counter": ["Map symbol", "<p>The little symbol this division wears <b>on the map</b> — the NATO-style box with a cross, an oval, a tank silhouette.</p><p>The number <b>is</b> the picture: <code>10</code> tells the game to use the image named <b>div_templ_10</b>. So the only numbers that do anything are the ones your mod actually has art for — Nova reads them out of your mod, lists them, and shows you the picture as you pick.</p><p style='color:#a6acd0;font-size:12px;'>Leave it blank and the game picks a symbol from the battalions in the template — usually what you want. The numbers are <b>not</b> the same in every mod, which is why Nova scans instead of guessing: the base game has 0-43 and 65-120, the anniversary DLC adds 44-64, and Millennium Dawn ships its own set including 3050-3054.</p>"],
    "tpl-override-model": ["3D model", "<p>Which <b>3D model</b> the little soldiers of this division use on the map. Purely cosmetic — it changes nothing about how the division fights.</p><p>Writes <code>override_model</code>. <b>Leave it blank</b> and the game picks the model from the battalions in the template, which is right almost always. Set it when you want a specific look — a country's own uniform, militia, or jungle troops.</p><p style='color:#a6acd0;font-size:12px;'>The list is every model Nova can find in your game, its DLCs and your mod (about 29,500 with Millennium Dawn active) — so type a country tag or a word like <i>infantry</i> to narrow it. It's a suggestion list, not a rulebook: models that ship with DLC you don't own won't appear here, and the base game itself references a few of those, so a name you typed that isn't listed may still be perfectly valid.</p>"],
    "tpl-locked": ["Locked template", "<p>Stops the <b>player</b> editing this template in-game — the designer opens read-only.</p><p>Writes <code>is_locked = yes</code>. Used for AI-only, garrison and scripted formations you don't want reorganised (and for templates a focus/event depends on staying exactly as authored).</p><p style='color:#a6acd0;font-size:12px;'>Leave off for anything the player is meant to customise.</p>"],
    "deploy-extras": ["Commander, Equipment % &amp; Experience %", "<p><b>Commander</b> gives each deployed division its own named officer (a real HOI4 <code>officer</code> on the division).</p><p><b>Equipment %</b> is how stocked they start — 100% = fully equipped, lower = short on gear (<code>start_equipment_factor</code>).</p><p><b>Experience %</b> is how trained they start — 0% = green recruits, ~30–50% = veterans, 100% = elite (<code>start_experience_factor</code>). This is the most common OOB field in the game.</p><p style='color:#a6acd0;font-size:12px;'>Note: HOI4 can't pre-assign divisions to a field-marshal's army group at the start of a game — that's always done in-game.</p>"],
  };
  function armyHelp(key) {
    const c = ARMY_HELP[key]; if (!c) return;
    // The shared Nova info modal (purple/blue gradient, same as the Research Tree) — loaded on this page.
    if (typeof window.showNovaInfoModal === "function") { window.showNovaInfoModal(c[0], c[1]); return; }
    // Fallback only if the shared modal somehow didn't load.
    let m = $("armyHelpModal");
    if (!m) {
      m = document.createElement("div"); m.id = "armyHelpModal";
      m.innerHTML = '<div class="ahm-box"><div class="ahm-title"><span id="ahmTitle"></span><button class="ahm-close" type="button" title="Close">×</button></div><div class="ahm-body" id="ahmBody"></div></div>';
      document.body.appendChild(m);
      m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".ahm-close")) m.style.display = "none"; });
    }
    m.querySelector("#ahmTitle").textContent = c[0];
    m.querySelector("#ahmBody").innerHTML = c[1];
    m.style.display = "flex";
  }
  document.addEventListener("click", (e) => {
    const h = e.target.closest && e.target.closest(".sb-help");
    if (h && h.dataset.help) { e.preventDefault(); armyHelp(h.dataset.help); }
  });
  // An error box with a Retry button (CSP-safe: wired via addEventListener, no inline handler).
  function eqErrorRetry(elId, msg, retryFn) {
    const el = $(elId); if (!el) return;
    el.innerHTML = '<div class="army-empty">' + msg + ' <button type="button" class="army-btn-sm eq-retry" style="margin-top:8px;">↻ Retry</button></div>';
    const rb = el.querySelector(".eq-retry");
    if (rb) rb.addEventListener("click", retryFn || (() => { loadEquipment().then(loadDesigner); }));
  }
  // `keepPlace` = this is a RELOAD after the user saved/deleted something, not a cold open. The list must not
  // blank out and must not jump back to row 1 — the user asked for it to stay exactly where they left it.
  // #no-refresh
  async function loadEquipment(keepPlace) {
    const el = $("eqList"); if (!el) return;
    const mp = modPath();
    if (!mp) { el.innerHTML = '<div class="army-empty">Pick a mod on the Home page first.</div>'; return; }
    S.equip.loading = true;
    // Remember where the user was BEFORE the "Loading…" line destroys the scroll container.
    const scOld = keepPlace ? el.querySelector(".eq-list-scroll") : null;
    S.equip._listTop = scOld ? scOld.scrollTop : 0;
    // Blank ONLY on a cold load. A save/delete reload leaves the rendered arsenal on screen.
    if (!keepPlace || !el.querySelector(".eq-list-scroll")) el.innerHTML = '<div class="army-loading">Loading equipment…</div>';
    let d, dv, gd;
    try {
      [d, dv, gd] = await Promise.all([
        fetch("/api/equipment/list?modPath=" + encodeURIComponent(mp)).then((r) => r.json()),
        // The arsenal: every country's named variants. A failure here must not block the types list.
        fetch("/api/equipment/variants/all?modPath=" + encodeURIComponent(mp)).then((r) => r.json()).catch(() => null),
        // HOI4's equipment-designer graphic_db — the GAME's own picture for an icon-less variant. Optional. #equipment-pictures
        fetch("/api/equipment/graphicdb?modPath=" + encodeURIComponent(mp)).then((r) => r.json()).catch(() => null),
      ]);
    }
    catch (e) { S.equip.loading = false; eqErrorRetry("eqList", "Couldn't load equipment: " + esc(e.message || e) + "."); return; }
    if (!d || !d.ok) { S.equip.loading = false; eqErrorRetry("eqList", "Couldn't load equipment" + (d && d.error ? ": " + esc(d.error) : ".")); return; }
    S.equip.all = d.equipment || [];
    if (gd && gd.ok) S.equip.gdb = gd.gdb || {}; // scope → { equipmentId: [icon…] }
    S.equip.landTypes = d.landTypes || ["infantry"];
    S.equip.airTypes = d.airTypes || ["fighter"];
    S.equip.airMissions = d.airMissions || ["air_superiority"];
    if (dv && dv.ok) {
      S.equip.variants = (dv.variants || []).map((v, i) => ({ ...v, _key: v.file + "|" + v.blockIdx + "|" + v.name + "|" + i }));
      S.equip.varCountries = dv.countries || [];
      populateVariantCountryFilter();
    }
    S.equip.loaded = true;   // latch ONLY after a successful load, so a cold-start failure can retry
    S.equip.loading = false;
    renderEquipList();
    applyEquipDeepLink();
  }
  // Research Tree → "Open in Military" lands here: army.html?tab=equipment&eq=<id>. Runs once, after the
  // arsenal is really loaded. The hard part isn't selecting the row — it's making sure the row EXISTS to
  // select: a base-game equipment is hidden unless "base game" is ticked, and a country filter hides most
  // of the list. A link that silently does nothing is worse than no link, so widen the filters to reveal
  // the target, and say so plainly if it genuinely isn't in this mod. #eq-deeplink
  let _eqDeepLinkDone = false;
  function applyEquipDeepLink() {
    if (_eqDeepLinkDone) return;
    let id = "";
    try { id = (new URLSearchParams(location.search).get("eq") || "").trim(); } catch (_) { return; }
    if (!id) return;
    _eqDeepLinkDone = true;
    const eq = (S.equip.all || []).find((e) => e.id === id);
    if (!eq) {
      const ed = $("eqEditor");
      if (ed) ed.innerHTML = '<div class="army-empty">The Research Tree links this tech to <b>' + esc(id)
        + '</b>, but no such equipment exists in this mod.<br><span style="color:#8b949e;">The tech\'s <b>enable_equipments</b> names an equipment that was never defined — in game it unlocks nothing. Create it with <b>＋ New equipment</b>, or fix the tech\'s equipment id.</span></div>';
      return;
    }
    if (!eq.isMod && !S.equip.showBase) {           // it's vanilla and vanilla is hidden → reveal it
      S.equip.showBase = true;
      const cb = $("eqShowBase"); if (cb) cb.checked = true;
    }
    if (S.equip.varFilter && S.equip.varFilter.length) { // a country filter would hide it → clear it
      S.equip.varFilter = [];
      renderCountryChips();
    }
    const s = $("eqSearch"); if (s && s.value) s.value = "";
    renderEquipList();
    selectEquip(id);
    // selectEquip deliberately does NOT scroll (that would jump the list on every click), but a deep-link
    // must actually SHOW you what it opened — otherwise you land on a list scrolled to the top with the
    // selection somewhere off-screen, which reads exactly like the link did nothing. Scroll the list's own
    // container only, never the page.
    const list = $("eqList");
    const esc2 = (window.CSS && CSS.escape) ? CSS.escape(id) : id;
    const row = list && list.querySelector(`.eq-row[data-id="${esc2}"]`);
    const box = list && list.querySelector(".eq-list-scroll");
    if (row && box) {
      // Measure with rects, not offsetTop — rows sit inside per-category groups, so offsetTop is relative
      // to the group rather than the scroll box and lands nowhere near the row.
      const rr = row.getBoundingClientRect(), bb = box.getBoundingClientRect();
      box.scrollTop += (rr.top - bb.top) - (bb.height / 2 - rr.height / 2);
    } else if (row) row.scrollIntoView({ block: "center" });
  }
  async function populateVariantCountryFilter() {
    const sel = $("eqCountryFilter"); if (!sel) return;
    // EVERY country goes in the list, active or not — the picker's complete roster, decorated with
    // variant counts where a country has some. Countries only the scan knows get appended. #all-countries
    const counts = new Map(S.equip.varCountries.map((c) => [c.tag, c]));
    if (window.NovaCountryPicker) {
      try { await NovaCountryPicker.populate(sel, { modPath: modPath(), all: true }); } catch (_) {}
    }
    const present = new Set();
    for (const o of Array.from(sel.options)) {
      if (!o.value) continue;
      present.add(o.value);
      const c = counts.get(o.value);
      if (c && c.count) o.textContent += ` — ${c.count} variant${c.count > 1 ? "s" : ""}`;
    }
    for (const c of S.equip.varCountries) {
      if (present.has(c.tag)) continue;
      const o = document.createElement("option");
      o.value = c.tag; o.textContent = `${c.tag}${c.name ? " — " + c.name : ""} — ${c.count} variant${c.count > 1 ? "s" : ""}`;
      sel.appendChild(o);
    }
    sel.insertAdjacentHTML("afterbegin", '<option value="">🌍 All countries</option>');
    sel.value = "";
  }
  function renderCountryChips() {
    const wrap = $("eqCountryChips"); if (!wrap) return;
    wrap.style.display = S.equip.varFilter.length ? "flex" : "none";
    wrap.innerHTML = S.equip.varFilter.map((t) => {
      const c = S.equip.varCountries.find((x) => x.tag === t);
      return `<span class="eq-cchip">${esc(t)}${c && c.name ? " · " + escLoc(c.name) : ""}<span class="cchip-x" data-tag="${esc(t)}" title="Remove">×</span></span>`;
    }).join("");
    wrap.querySelectorAll(".cchip-x").forEach((x) => x.addEventListener("click", () => {
      S.equip.varFilter = S.equip.varFilter.filter((t) => t !== x.dataset.tag);
      renderCountryChips(); renderEquipList();
    }));
  }
  // The variant rows honoring search + country picks (no picks = all countries).
  function filteredVariants() {
    if (!S.equip.showVariants) return [];
    const q = ($("eqSearch") && $("eqSearch").value || "").trim().toLowerCase();
    let vs = S.equip.variants;
    if (S.equip.varFilter.length) vs = vs.filter((v) => S.equip.varFilter.includes(v.tag));
    if (q) vs = vs.filter((v) => v.name.toLowerCase().includes(q) || (v.type || "").toLowerCase().includes(q) || v.tag.toLowerCase().includes(q));
    return vs;
  }
  const VAR_ROW_CAP = 500; // 2,000+ rows would crawl — cap and say how to narrow
  // ONE unified list, grouped by equipment FAMILY (the category). Each family shows its archetype + tiers
  // AND the country variants built on it, together — a variant sits WITH its chassis, not in a separate
  // section above. Works the same for tanks, ships, planes, artillery, everything. #arsenal-merge
  function renderEquipList() {
    const el = $("eqList"); if (!el) return;
    // The rebuild below replaces .eq-list-scroll (the internally-scrolling container) with a FRESH node, which
    // resets scrollTop to 0 — that is the "list jumps back to the top" the user reported. ONLY the save/delete
    // reload paths stash an offset (loadEquipment(true) / refreshVariants); a SEARCH deliberately stashes
    // nothing, because new results should start at the top. Consume the stash so it applies exactly once.
    // #no-refresh
    const prevTop = S.equip._listTop || 0;
    S.equip._listTop = 0;
    const q = ($("eqSearch") && $("eqSearch").value || "").trim().toLowerCase();
    const eqById = new Map(S.equip.all.map((e) => [e.id, e]));
    const famKeyOfEq = (e) => e.archetype || e.id;
    const famKeyOfVar = (v) => { const b = eqById.get(v.type); return b ? (b.archetype || b.id) : (v.type || "other"); };

    const allVars = filteredVariants();           // country + search + showVariants toggle
    const vars = allVars.slice(0, VAR_ROW_CAP);
    let typeItems = S.equip.all.filter((e) => S.equip.showBase || e.isMod);
    if (q) typeItems = typeItems.filter((e) => e.id.toLowerCase().includes(q) || (e.name || "").toLowerCase().includes(q));

    const fams = new Map(); // famKey → { types:[], variants:[], hasVar }
    const ensure = (k) => { if (!fams.has(k)) fams.set(k, { types: [], variants: [], hasVar: false }); return fams.get(k); };
    for (const v of vars) { const g = ensure(famKeyOfVar(v)); g.variants.push(v); g.hasVar = true; }
    for (const e of typeItems) ensure(famKeyOfEq(e)).types.push(e);
    // A family that has variants ALWAYS shows its base equipment (archetype + tiers), even when "base game"
    // is off — you see the chassis together with the variants built on it.
    for (const [k, g] of fams) {
      if (!g.hasVar) continue;
      const present = new Set(g.types.map((e) => e.id));
      for (const e of S.equip.all) if (famKeyOfEq(e) === k && !present.has(e.id)) g.types.push(e);
    }

    if (!fams.size) {
      // Distinguish "nothing matches your search/filter" from a genuinely empty arsenal — otherwise a
      // no-match search on vanilla (470 base equipments hidden) misreads as "No mod equipment yet". #empty-state
      const filtering = q || (S.equip.varFilter && S.equip.varFilter.length);
      const msg = filtering
        ? "No equipment matches your search." + (S.equip.showBase ? "" : " Tick “base game” to include the base game.")
        : (S.equip.all.some((e) => e.isMod) || S.equip.showBase
          ? "No equipment matches." : "No mod equipment yet — ＋ New equipment family, or tick “base game” to browse the base game.");
      el.innerHTML = '<div class="army-empty">' + msg + "</div>";
      return;
    }
    // Families with variants (the arsenal) first, then the rest; mod-first; alpha.
    const keys = [...fams.keys()].sort((a, b) => {
      const ga = fams.get(a), gb = fams.get(b);
      return (Number(gb.hasVar) - Number(ga.hasVar))
        || (gb.variants.length - ga.variants.length)
        || (Number(gb.types.some((e) => e.isMod)) - Number(ga.types.some((e) => e.isMod)))
        || a.localeCompare(b);
    });
    const rowHtml = (e) => {
      const tier = !e.isArchetype && e.archetype;
      const badge = e.isMod ? '<span class="eq-badge mod">mod</span>' : '<span class="eq-badge base">base</span>';
      const arch = e.isArchetype ? '<span class="eq-badge arch">type</span>' : "";
      const dlc = e.dlc ? `<span class="eq-badge dlc">${esc(e.dlc)}</span>` : "";
      return `<div class="eq-row${tier ? " tier" : ""}${e.id === S.equip.sel ? " active" : ""}" data-id="${esc(e.id)}">`
        + eqIcon(e) + `<span class="eq-id" title="${esc(e.id)}">${esc(e.id)}</span>${arch}${dlc}${badge}<span class="eq-yr">${e.year || ""}</span></div>`;
    };
    const vRow = (v) => {
      const badges =
        `<span class="eq-tag-chip" title="${esc(v.tag)}">${esc(v.tag)}</span>`
        + (v.novaManaged ? '<span class="eq-badge mod">yours</span>' : "")
        + (v.obsolete ? '<span class="eq-badge" style="background:rgba(139,148,158,0.15); color:#8b949e;">outdated</span>' : "");
      return `<div class="eqv-row tier${v.obsolete ? " obs" : ""}${v._key === S.equip.selVar ? " active" : ""}" data-vkey="${esc(v._key)}">`
        + variantIcon(v) + `<span class="eqv-name" title="${escLoc(v.name)}">${escLoc(v.name)}</span>${badges}</div>`;
    };
    const html = keys.map((k) => {
      const g = fams.get(k);
      const arch = eqById.get(k);
      const nice = arch && arch.name ? arch.name : (g.types.find((e) => e.isArchetype && e.name) || {}).name || "";
      const types = g.types.slice().sort((a, b) => (Number(b.isArchetype) - Number(a.isArchetype)) || ((a.year || 0) - (b.year || 0)) || String(a.id).localeCompare(String(b.id)));
      const variants = g.variants.slice().sort((a, b) => a.tag.localeCompare(b.tag) || a.name.localeCompare(b.name));
      const head = `<div class="eq-fam-head">${esc(k.replace(/_/g, " "))}${nice ? ' <span style="text-transform:none; color:#6e7681;">— ' + escLoc(nice) + "</span>" : ""}${g.hasVar ? ` <span style="text-transform:none; color:#8b949e;">· ${variants.length} variant${variants.length > 1 ? "s" : ""}</span>` : ""}</div>`;
      return head + types.map(rowHtml).join("") + variants.map(vRow).join("");
    }).join("");
    const more = allVars.length - vars.length;
    const capNote = more > 0 ? `<div class="army-empty">…and ${more.toLocaleString()} more variant${more > 1 ? "s" : ""} — pick a country or search to narrow.</div>` : "";
    el.innerHTML = '<div class="eq-list-scroll">' + html + capNote + "</div>";
    el.querySelectorAll(".eq-row").forEach((r) => r.addEventListener("click", () => selectEquip(r.dataset.id)));
    el.querySelectorAll(".eqv-row").forEach((r) => r.addEventListener("click", () => selectVariant(r.dataset.vkey)));
    mountEqIcons(el); mountVariantIcons(el); // real in-game pictures (equipment types + each variant's own icon)
    // Put the user back exactly where they were — a save/delete must not scroll the arsenal away. #no-refresh
    if (prevTop) { const sc = el.querySelector(".eq-list-scroll"); if (sc) sc.scrollTop = prevTop; }
  }
  function selectVariant(key) {
    if (S.equip.editorDirty) {
      if (key === S.equip.selVar) return; // misclick on the one being viewed — keep any typed edits
      if (!confirm("Discard your unsaved equipment edits?")) return;
    }
    S.equip.editorDirty = false;
    S.equip.selVar = key; S.equip.sel = ""; S.equip.mode = "";
    const el = $("eqList");
    if (el) {
      el.querySelectorAll(".eq-row.active, .eqv-row.active").forEach((r) => r.classList.remove("active"));
      const row = el.querySelector(`.eqv-row[data-vkey="${(window.CSS && CSS.escape) ? CSS.escape(key) : key}"]`);
      if (row) row.classList.add("active");
    }
    const v = S.equip.variants.find((x) => x._key === key);
    renderVariantView(v);
  }
  function selectEquip(id) {
    // Same never-lose-work contract as Divisions: typed-but-unsaved stat edits must not vanish because
    // the user clicked another equipment. Ask first. #eq-editor-dirty
    if (S.equip.editorDirty && id !== S.equip.sel) {
      if (!confirm("Discard your unsaved equipment edits?")) return;
    }
    // Re-clicking the row being edited is a no-op, not a discard — the misclick must keep typed edits.
    // (Save/create clear editorDirty before re-selecting, so their refresh path is unaffected.)
    if (S.equip.editorDirty && id === S.equip.sel) return;
    S.equip.editorDirty = false;
    S.equip.sel = id; S.equip.mode = ""; S.equip.selVar = "";
    // Update the active row IN PLACE instead of rebuilding the whole list — otherwise the scroll position
    // jumps back to the top of the list on every click. #eq-list-scroll
    const el = $("eqList");
    if (el && el.querySelector(".eq-row")) {
      el.querySelectorAll(".eq-row.active, .eqv-row.active").forEach((r) => r.classList.remove("active"));
      const esc2 = (window.CSS && CSS.escape) ? CSS.escape(id) : id;
      const row = el.querySelector(`.eq-row[data-id="${esc2}"]`);
      if (row) row.classList.add("active");
    } else {
      renderEquipList(); // list not rendered yet (e.g. coming from the New-family form) — build it once
    }
    const eq = S.equip.all.find((e) => e.id === id);
    renderEquipEditor(eq);
  }
  function numOrEmpty(v) { return (v === undefined || v === null) ? "" : v; }
  function renderEquipEditor(eq) {
    const el = $("eqEditor"); if (!el) return;
    ensureRoleDelegation(); // one document-level Save handler works in both the editor and the designer
    if (!eq) { el.innerHTML = '<div class="army-empty">Select an equipment on the left, or ＋ New equipment family to create your own.</div>'; return; }
    const enabled = (eq.enabledBy || []).length
      ? '<div class="eq-enabled">Unlocked by: ' + eq.enabledBy.map((t) => '<a class="eq-chip tech-chip" href="research.html?tech=' + encodeURIComponent(t) + '" title="Open ' + esc(t) + ' in the Research Tree">' + techIcon(t) + esc(t) + "</a>").join("") + ' <span style="color:#6e7681;">(click a tech to open it in the <a href="research.html" style="color:#58a6ff;">Research Tree</a>)</span></div>'
      : '<div class="eq-enabled" style="color:#d29922;">⚠ No tech unlocks this yet — add it to a tech\'s <b>enable_equipments</b> in the <a href="research.html" style="color:#58a6ff;">Research Tree</a>.</div>';
    const statLbl = (s) => `${s.ic ? sIcon(s.ic, "#9fb0c0") : ""} ${s.label}`;
    const head = `<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">`
      + eqIcon(eq, true)
      + `<h3 style="margin:0; font-family:monospace; overflow-wrap:anywhere; min-width:0;">${esc(eq.id)}</h3>`
      + (eq.dlc ? `<span class="eq-badge dlc">${esc(eq.dlc)}</span>` : "")
      + (eq.isArchetype ? '<span class="eq-badge arch">archetype</span>' : (eq.archetype ? '<span class="eq-badge" style="background:rgba(88,166,255,0.14); color:#58a6ff;">variant of ' + esc(eq.archetype) + "</span>" : ""))
      + (eq.isMod ? '<span class="eq-badge mod">mod</span>' : '<span class="eq-badge base">base game</span>') + `</div>`;
    const domain = eqDomain(eq);
    const statSet = statsForEquip(eq);
    // A modular CHASSIS (tank / ship / plane) is DESIGNED — its guns/armour/engine come from the modules you
    // add — so show its stats READ-ONLY + point at the Designer, whatever the domain. (Fixes a tank chassis
    // being shown as an editable land item, and gives ships/planes the same treatment.) #chassis-editor
    if (eq.isChassis) {
      const domNoun = domain === "ships" ? "ship hull" : domain === "planes" ? "airframe" : "tank chassis";
      el.innerHTML = head + `<div class="vv-photo-solo">` + eqPhoto(eq) + `</div>` + enabled
        + `<div class="eq-readonly-note" style="margin-top:12px;">🔧 This is a <b>${domNoun}</b> — its guns, armour, engine and other stats come from the <b>modules you add</b>. Design it in <b>“Design a tank / ship / plane”</b> below (the base stats shown here are the chassis's own).</div>`
        + roleBlock(eq) + (statsAllGrid(eq) || eqNoStatsNote(eq, statSet))
        + `<div style="margin-top:12px;"><button id="eqToDesigner" class="army-btn-sm" type="button">🔧 Design this in the Designer ↓</button></div>`;
      const toDsg = $("eqToDesigner");
      if (toDsg) toDsg.addEventListener("click", () => {
        // Jump to the Designer AND pre-select this chassis (its root archetype) + tier. Use eq.designer
        // (tanks/ships/planes) — NOT eqDomain, which returns "land" for tanks and isn't a dropdown value.
        const dsg = $("dsgDesigner");
        if (dsg && eq.designer && Array.prototype.some.call(dsg.options, (o) => o.value === eq.designer)) { dsg.value = eq.designer; onDesignerChange(); }
        const rootId = eq.isArchetype ? eq.id : (eq.archetype || eq.id);
        const chSel = $("dsgChassis");
        if (chSel && Array.prototype.some.call(chSel.options, (o) => o.value === rootId)) { chSel.value = rootId; onChassisChange(); }
        if (!eq.isArchetype) { const tSel = $("dsgTier"); if (tSel && Array.prototype.some.call(tSel.options, (o) => o.value === eq.id)) tSel.value = eq.id; }
        const body = $("dsgBody"); if (body) body.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      mountTechIcons(el); mountEqIcons(el);
      return;
    }
    // Non-chassis naval / air equipment (rare — legacy built ships/planes): show its stats read-only.
    if (domain !== "land") {
      el.innerHTML = head + `<div class="vv-photo-solo">` + eqPhoto(eq) + `</div>` + enabled
        + `<div class="eq-readonly-note" style="margin-top:12px;">This is <b>${domain === "ships" ? "naval" : "air"} equipment</b> — its power is shown below.</div>`
        + roleBlock(eq) + (statsAllGrid(eq) || eqNoStatsNote(eq, statSet))
        + namedVariantCreatorHtml(eq);
      wireNamedVariantCreator(eq);
      mountTechIcons(el); mountEqIcons(el);
      return;
    }
    if (!eq.isMod) {
      el.innerHTML = head + `<div class="vv-photo-solo">` + eqPhoto(eq) + `</div>` + enabled
        + '<div class="eq-readonly-note" style="margin-top:12px;">This is <b>base-game equipment</b>, so Nova keeps it read-only — editing it here would risk breaking the vanilla files. To make your own version, click <b>＋ New equipment family</b> and give it a new id (you can copy these stats).</div>'
        + roleChips(eq) + (statsAllGrid(eq) || eqNoStatsNote(eq, statSet))
        + namedVariantCreatorHtml(eq);
      wireNamedVariantCreator(eq);
      mountTechIcons(el); mountEqIcons(el);
      return;
    }
    // Managed editable stats first; anything ELSE the file declares shows read-only below so no stat
    // is ever invisible (exotic mod fields included). If the equipment carries NONE of the standard land
    // stats but has its own (an MD missile, a drone), don't show six blank attack inputs — show name/year
    // plus its REAL stats. That's how "the program never saw this weapon but reads it right" feels. #arsenal
    const managedSnake = new Set(["soft_attack", "hard_attack", "defense", "breakthrough", "ap_attack", "air_attack", "reliability", "build_cost_ic"]);
    const effAll = effectiveStatsAll(eq);
    // "Has land stats" must ignore build cost + reliability — EVERY equipment has those, and counting
    // them kept missiles showing six blank land-attack inputs.
    const universal = new Set(["buildCostIc", "reliability", "build_cost_ic"]);
    const specialized = !statSet.some((s) => { if (universal.has(s.key)) return false; const v = eq[s.key]; return v !== undefined && v !== null && v !== ""; })
      && !Object.keys(effAll).some((k) => managedSnake.has(k) && !universal.has(k))
      && Object.keys(effAll).length > 1;
    const extraGrid = specialized ? statsAllGrid(eq, null, true) : statsAllGrid(eq, managedSnake, true);
    el.innerHTML = head + `<div class="vv-photo-solo">` + eqPhoto(eq) + `</div>` + enabled + eqGeneratedNote(eq) + (specialized ? "" : eqNoStatsNote(eq, statSet)) + roleChips(eq)
      + '<div class="eq-editor-fields">'
      + `<label>Display name<input id="eqName" class="army-input" type="text" value="${esc(eq.name || "")}" placeholder="e.g. Assault Rifle" /></label>`
      + `<label>Year<input id="eqYear" class="army-input" type="number" value="${esc(numOrEmpty(eq.year))}" /></label>`
      + (specialized ? "" : statSet.map((s) => `<label>${statLbl(s)}<input id="eq_${s.key}" class="army-input" type="number" step="0.01" value="${esc(numOrEmpty(eq[s.key]))}" /></label>`).join(""))
      + "</div>"
      + (extraGrid ? `<div class="comp-label">${specialized ? "This equipment's stats (armour, speed, range … — edit any of them)" : "More stats — armour, speed, hardness, naval/air (editable)"}</div>` + extraGrid : "")
      + resourceGridHtml(eq)
      + `<div style="display:flex; align-items:center; gap:10px;"><button id="eqSaveBtn" class="army-btn" type="button">💾 Save equipment</button><span id="eqSaveStatus" style="font-size:12px;"></span></div>`
      + namedVariantCreatorHtml(eq);
    wireNamedVariantCreator(eq);
    $("eqSaveBtn").addEventListener("click", () => saveEquip(eq.id));
    mountTechIcons(el); mountEqIcons(el);
  }
  // Strategic-resource cost editor (steel/tungsten/…): every real equipment declares one; drives the whole
  // production/trade balance. The save endpoint already round-trips `resources`. #equipment-resources
  function resourceGridHtml(eq) {
    const res = (eq && eq.resources) || {};
    return `<div class="comp-label" style="margin-top:6px;">Strategic resources <span style="text-transform:none; color:#6e7681;">(cost per unit built)</span></div>`
      + '<div class="eq-editor-fields">'
      + EQ_RESOURCES.map((r) => `<label>${r.charAt(0).toUpperCase() + r.slice(1)}<input id="eqres_${r}" class="army-input" type="number" min="0" step="1" value="${esc(numOrEmpty(res[r]))}" placeholder="0" /></label>`).join("")
      + "</div>";
  }
  async function saveEquip(id) {
    const st = $("eqSaveStatus"), btn = $("eqSaveBtn");
    const eqNm = ($("eqName").value || "").trim();
    // A blank name used to save "successfully" but keep the OLD name (the server won't write an empty loc), so the
    // user thinks they renamed/cleared it and nothing changed. Block it with a clear hint. #eq-blank-name
    if (!eqNm) { if (st) { st.style.color = "#d29922"; st.textContent = "Give the equipment a display name — a blank name would show as a raw token in-game."; } return; }
    const body = { modPath: modPath(), id, name: eqNm, year: $("eqYear").value };
    // Specialized gear (missiles/drones) hides the standard land inputs — send only what's on screen;
    // the server overlays onto current values, so omitted stats keep whatever the file already says.
    for (const s of EQ_STATS) { const inp = $("eq_" + s.key); if (inp) body[s.key] = inp.value; }
    // Strategic resources: send the full set (a blank field = 0 = drop that resource). Only send when the
    // grid is present so a specialized view without it never wipes existing resources.
    if ($("eqres_" + EQ_RESOURCES[0])) {
      const resources = {};
      for (const r of EQ_RESOURCES) { const inp = $("eqres_" + r); const v = parseInt(inp && inp.value, 10); if (Number.isFinite(v) && v > 0) resources[r] = v; }
      body.resources = resources;
    }
    // Extra stats from the generic grid (armor_value, maximum_speed, hardness, naval/air/missile …). A blank
    // field is omitted → the server overlays, keeping whatever the file already said. #full-stat-editor
    const statsAll = {};
    // ⛔ #equipment-stat-cannot-be-removed — THE EXPLICIT CLEAR, and why it is shaped like this.
    //
    // Blank means "unchanged" on purpose (see the note above), so until now no payload could take a stat
    // back OUT — and the save still answered ok, so the editor said "✓ Saved" for a change it had not made.
    // It matters in game: an ABSENT stat inherits the archetype's value, while an explicit 0 forces zero, so
    // the nearest thing a stuck user could do wrote something that means something else.
    //
    // The signal is "this box was rendered with a value and is now empty". inp.defaultValue is the value
    // attribute as rendered and does not move as the user types, so it is exactly what we loaded. A
    // specialized gear view never renders these inputs at all, so it cannot produce the signal — the rule
    // that blank must not wipe what a view never showed is preserved by construction, not by a check.
    const clearStats = [];
    for (const inp of document.querySelectorAll('#eqEditor [id^="eqsa_"]')) {
      const v = (inp.value || "").trim();
      const was = (inp.defaultValue || "").trim();
      if (v === "") { if (was !== "") clearStats.push(inp.id.slice(5)); continue; }
      const n = Number(v); if (!Number.isFinite(n)) continue;
      statsAll[inp.id.slice(5)] = n;
    }
    if (Object.keys(statsAll).length) body.statsAll = statsAll;
    if (clearStats.length) body.clearStats = clearStats;
    // `year` and `build_cost_ic` are the two stats the PARSER invents a display value for (1936 / 0.5) when the
    // block omits them — so these two boxes are pre-filled with a number the file never said, and posting them
    // back turns an inherited production cost into an explicit override. 436 equipment have no year and 319 no
    // build_cost_ic across the install; every one gained the default on a save that changed nothing.
    // The save endpoint can't tell an echo from a deliberate 0.5 — same bytes — so say which this is. It is
    // authored if the FILE already declared it, or if the box no longer holds what we loaded.
    // #equipment-echoed-default
    const loadedEq = (S.equip.all || []).find((e) => e.id === id) || {};
    const wasAuthored = (loadedEq.authoredStats && typeof loadedEq.authoredStats === "object") ? loadedEq.authoredStats : {};
    const boxDiffers = (elId, loadedVal) => {
      const inp = $(elId); if (!inp) return false;
      const v = (inp.value || "").trim(); if (v === "") return false;
      const n = Number(v);
      return Number.isFinite(n) && loadedVal !== undefined && loadedVal !== null && loadedVal !== ""
        ? n !== Number(loadedVal) : String(v) !== String(loadedVal === undefined || loadedVal === null ? "" : loadedVal);
    };
    body.authoredStats = {
      year: !!wasAuthored.year || boxDiffers("eqYear", loadedEq.year),
      build_cost_ic: !!wasAuthored.build_cost_ic || boxDiffers("eq_buildCostIc", loadedEq.buildCostIc),
    };
    const orig = btn.textContent; btn.disabled = true; btn.textContent = "Saving…";
    try {
      const d = await fetch("/api/equipment/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (!d || !d.ok) throw new Error(d && d.error ? d.error : "Save failed.");
      S.equip.editorDirty = false;
      await loadEquipment(true); selectEquip(id); // keep scroll/filter — a save must not reset the list. #no-refresh
      // Set the ✓ AFTER the reload re-renders the editor — setting it before left a message the re-render
      // instantly wiped, so the user couldn't tell the save happened. #save-feedback
      const st2 = $("eqSaveStatus");
      if (st2) { st2.style.color = "#3fb950"; st2.textContent = "✓ Saved → " + d.file; }
    } catch (e) { if (st) { st.style.color = "#f85149"; st.textContent = "✗ " + (e.message || e); } }
    finally { btn.disabled = false; btn.textContent = orig; }
  }
  const AIR_TYPE_LABEL = { fighter: "Fighter", cas: "Close air support", tactical_bomber: "Tactical bomber", strategic_bomber: "Strategic bomber", naval_bomber: "Naval bomber", scout_plane: "Scout plane", transport_plane: "Transport plane", suicide: "Suicide craft" };
  // Keys must be the engine's real tokens — the mine ones are PLURAL (naval_mineS_*); the singular
  // spellings Nova used to ship appear nowhere in HOI4, so those two roles never did anything in game.
  const AIR_MISSION_LABEL = { air_superiority: "Air superiority", interception: "Interception", cas: "Close air support", strategic_bomber: "Strategic bombing", naval_bomber: "Naval strike", port_strike: "Port strike", naval_patrol: "Naval patrol", recon: "Air reconnaissance", paradrop: "Paradrop", air_supply: "Air supply", training: "Training", attack_logistics: "Logistics strike", naval_mines_planting: "Mine laying", naval_mines_sweeping: "Mine sweeping", sam_mission: "Surface-to-air (SAM)", naval_kamikaze: "Kamikaze", barrage_mission: "Missile barrage", drop_nuke: "Nuclear strike" };
  function showNewFamilyForm(domain) {
    // The form replaces the stat editor in-place — typed-but-unsaved edits need the same ask-first,
    // and the flag must reset or the NEXT row click fires a confusing "Discard…?" about edits already gone.
    if (!domain && S.equip.editorDirty && !confirm("Discard your unsaved equipment edits?")) return;
    S.equip.editorDirty = false;
    S.equip.mode = "new"; S.equip.sel = ""; renderEquipList();
    const el = $("eqEditor"); if (!el) return;
    domain = domain === "air" ? "air" : "land";
    // ONE door: ask what you're making, up front and in words. These are three genuinely different HOI4
    // things, which is why they can't be merged into a single form — but they can share a single entrance.
    // (Land/Aircraft = a new equipment archetype + its tech tiers. Modular chassis = an archetype with
    // module slots, which you then design variants of below.) The old unlabelled "Kind" dropdown hid the
    // aircraft branch — and its roles — so well that it needed a second button to point at it. #one-door
    const domSel =
      '<div class="nf-kind" role="radiogroup" aria-label="What are you making?">'
      + '<div class="dz-lbl" style="margin-bottom:6px;">What are you making?</div>'
      + [
        ["land", "🪖", "Land equipment", "Infantry weapons, artillery, anti-tank — anything with fixed stats."],
        ["air", "✈️", "Aircraft", "A plane with fixed stats, and the missions it's allowed to fly."],
        ["chassis", "🛠️", "Modular chassis", "A tank / ship / plane frame with module slots, to design from parts below."],
      ].map(([v, icon, title, sub]) =>
        '<label class="nf-kind-opt' + (domain === v ? " sel" : "") + '">'
        + '<input type="radio" name="nfKind" value="' + v + '"' + (domain === v ? " checked" : "") + ' style="accent-color:#1f6feb;">'
        + '<span><b>' + icon + " " + esc(title) + '</b><small>' + esc(sub) + "</small></span></label>").join("")
      + "</div>";
    let typeOpts, statFields, roles = "";
    if (domain === "air") {
      typeOpts = (S.equip.airTypes && S.equip.airTypes.length ? S.equip.airTypes : ["fighter"]).map((t) => `<option value="${esc(t)}">${esc(AIR_TYPE_LABEL[t] || t.replace(/_/g, " "))}</option>`).join(""); // length-aware, see landTypes below
      statFields =
        `<label>Air attack<input id="nfAir" class="army-input" type="number" step="0.01" placeholder="4" /></label>`
        + `<label>Range (km)<input id="nfRange" class="army-input" type="number" step="1" placeholder="1000" /></label>`
        + `<label><span class="dz-lbl">Build cost (IC) <span class="sb-help" data-help="build-cost" title="What is build cost?">?</span></span><input id="nfCost" class="army-input" type="number" step="0.01" placeholder="20" /></label>`;
      roles = '<div class="comp-label" style="margin-top:6px;">Roles this plane can fly <span class="sb-help" data-help="plane-roles" title="What are roles?">?</span></div>'
        + '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:4px 12px; margin-bottom:14px;">'
        + (S.equip.airMissions || []).map((m) => `<label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#c9d1d9; text-transform:none;"><input type="checkbox" class="nf-role" value="${esc(m)}" ${["air_superiority", "cas", "strategic_bomber"].includes(m) ? "checked" : ""} style="accent-color:#1f6feb;" /> ${esc(AIR_MISSION_LABEL[m] || m.replace(/_/g, " "))}</label>`).join("")
        + "</div>";
    } else {
      // length-aware: landTypes is initialised to [] and `[] || [...]` is [] (an empty array is TRUTHY), so the
      // intended fallback was dead and the Category select could render with ZERO options. #newfamily-race
      typeOpts = (S.equip.landTypes && S.equip.landTypes.length ? S.equip.landTypes : ["infantry"]).map((t) => `<option value="${esc(t)}">${esc(t.replace(/_/g, " "))}</option>`).join("");
      statFields =
        `<label>Soft attack<input id="nfSoft" class="army-input" type="number" step="0.01" placeholder="3" /></label>`
        + `<label>Defense<input id="nfDef" class="army-input" type="number" step="0.01" placeholder="20" /></label>`
        + `<label><span class="dz-lbl">Build cost (IC) <span class="sb-help" data-help="build-cost" title="What is build cost?">?</span></span><input id="nfCost" class="army-input" type="number" step="0.01" placeholder="0.5" /></label>`;
    }
    el.innerHTML = '<h3 style="margin:0 0 4px;">New equipment</h3>'
      + domSel  // the question comes FIRST, above the fields it decides
      + `<p class="card-sub">Creates a buildable <b>${domain === "air" ? "aircraft" : "land-equipment"}</b> archetype + the tiers you pick. Link it to a tech's <b>enable_equipments</b> in the <a href="research.html" style="color:#58a6ff;">Research Tree</a> so it can be researched.</p>`
      + '<div class="eq-editor-fields" style="align-items:end;">'
      + `<label>Family id (no spaces)<input id="nfId" class="army-input" type="text" placeholder="${domain === "air" ? "nova_drone_equipment" : "nova_rifle_equipment"}" /></label>`
      + `<label>Display name<input id="nfName" class="army-input" type="text" placeholder="${domain === "air" ? "Nova Drone" : "Nova Rifle"}" /></label>`
      + `<label>${domain === "air" ? "Plane type" : "Category"}<select id="nfType" class="army-input">${typeOpts}</select></label>`
      + `<label>Tiers (1–6)<input id="nfTiers" class="army-input" type="number" min="1" max="6" value="1" /></label>`
      + `<label>Base year<input id="nfYear" class="army-input" type="number" value="1936" /></label>`
      + statFields
      + "</div>"
      + roles
      + `<div style="display:flex; align-items:center; gap:10px;"><button id="nfCreateBtn" class="army-btn" type="button">Create family</button><button id="nfCancelBtn" class="army-btn-sm" type="button">Cancel</button><span id="nfStatus" style="font-size:12px;"></span></div>`;
    // Re-render for the new kind. "chassis" is a different construct with its own editor, so it hands off
    // rather than re-rendering this form — one entrance, two destinations.
    el.querySelectorAll('input[name="nfKind"]').forEach((r) => r.addEventListener("change", (e) => {
      if (e.target.value === "chassis") { openChassisEditor(); return; }
      showNewFamilyForm(e.target.value);
    }));
    $("nfCreateBtn").addEventListener("click", createFamily);
    $("nfCancelBtn").addEventListener("click", () => { S.equip.editorDirty = false; S.equip.mode = ""; renderEquipEditor(null); }); // explicit Cancel = intentional discard
    $("nfId").focus();
  }
  async function createFamily() {
    const st = $("nfStatus"), btn = $("nfCreateBtn");
    const id = ($("nfId").value || "").trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) { if (st) { st.style.color = "#d29922"; st.textContent = "Id must start with a letter/underscore, no spaces."; } return; }
    // A blank display name would make the new equipment show as a raw token (e.g. "nova_rifle") in-game. Require one
    // (mirrors the equipment editor + variant guards) so a new family is always named. #family-blank-name
    if (!($("nfName").value || "").trim()) { if (st) { st.style.color = "#d29922"; st.textContent = "Give the family a display name — otherwise it shows as a raw token in-game."; } return; }
    // The kind is now a radio group, not a <select>. Falling back to "land" silently would post type:""
    // for an aircraft, which the server coerces to `infantry` — so read the checked radio explicitly.
    const kindEl = document.querySelector('input[name="nfKind"]:checked');
    const domain = (kindEl && kindEl.value === "air") ? "air" : "land";
    const body = {
      modPath: modPath(), id, name: ($("nfName").value || "").trim(), type: $("nfType").value, domain,
      tierCount: Math.max(1, Math.min(6, parseInt($("nfTiers").value, 10) || 1)),
      year: $("nfYear").value, build_cost_ic: $("nfCost") && $("nfCost").value,
    };
    if (domain === "air") {
      body.air_attack = $("nfAir") && $("nfAir").value;
      body.air_range = $("nfRange") && $("nfRange").value;
      body.missions = Array.from(document.querySelectorAll(".nf-role:checked")).map((c) => c.value);
    } else {
      body.soft_attack = $("nfSoft") && $("nfSoft").value;
      body.defense = $("nfDef") && $("nfDef").value;
    }
    const orig = btn.textContent; btn.disabled = true; btn.textContent = "Creating…";
    try {
      const d = await fetch("/api/equipment/family", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (!d || !d.ok) throw new Error(d && d.error ? d.error : "Create failed.");
      S.equip.editorDirty = false;
      S.equip.mode = ""; // never touch the user's "base game" filter — the new family is isMod so it lists anyway. #eq-filter-desync
      await loadEquipment(); selectEquip(d.id);
      const st2 = $("eqSaveStatus"); // the form (and its own status line) was replaced by the editor — confirm there
      if (st2) { st2.style.color = "#3fb950"; st2.textContent = `✓ Created ${d.id} → ${d.file || "your mod"}`; }
      // #every-tier-unlocked-at-game-start — which tiers still need a technology behind them. Without this
      // the modder learns it by not finding them in game.
      showSaveWarnings("eqSaveStatus", d.notes);
    } catch (e) { if (st) { st.style.color = "#f85149"; st.textContent = "✗ " + (e.message || e); btn.disabled = false; btn.textContent = orig; } }
  }

  // ── Modular tank/ship/plane designer (Equipment sub-tab) ────────────────
  const DSG_LABEL = { tanks: "🚜 Tanks", ships: "⚓ Ships", planes: "✈️ Planes" };
  function designerOfType(t) {
    if (t === "armor") return "tanks";
    if (["screen_ship", "capital_ship", "carrier", "submarine"].includes(t)) return "ships";
    if (["fighter", "cas", "tactical_bomber", "strategic_bomber", "naval_bomber", "interceptor", "suicide", "scout_plane", "maritime_patrol_plane", "air_transport", "heavy_fighter"].includes(t)) return "planes";
    return null;
  }
  async function loadDesigner() {
    const body = $("dsgBody"); if (!body) return;
    const mp = modPath();
    if (!mp) { body.innerHTML = '<div class="army-empty">Pick a mod on the Home page first.</div>'; return; }
    let ch, md;
    try {
      [ch, md] = await Promise.all([
        fetch("/api/equipment/chassis?modPath=" + encodeURIComponent(mp)).then((r) => r.json()),
        fetch("/api/equipment/modules?modPath=" + encodeURIComponent(mp)).then((r) => r.json()),
      ]);
    } catch (e) { eqErrorRetry("dsgBody", "Couldn't load the designer: " + esc(e.message || e) + ".", loadDesigner); return; }
    if (!ch || !ch.ok) { eqErrorRetry("dsgBody", "Couldn't load chassis" + (ch && ch.error ? ": " + esc(ch.error) : "."), loadDesigner); return; }
    S.equip.chassis = ch.chassis || [];
    // HOI4's equipment-designer graphic_db: scope (country tag | "default") → { equipmentId: [icon…] }. This is
    // the GAME's own source of truth for the picture of a variant that declares no `icon`. #equipment-pictures
    S.equip.gdb = ch.gdb || {};
    S.equip.chassisById = {};
    for (const c of S.equip.chassis) S.equip.chassisById[c.archetypeId] = c;
    S.equip.modulesByCategory = (md && md.byCategory) || {};
    // (#dsgNewChassisBtn is gone — the chassis editor is reached from the one "＋ New equipment" door. #one-door)
    renderModularDesigner();
  }

  // ── Manufacturers (MIO) editor. Lists mod-owned MIOs + a "＋ New MIO" form → POST /api/mio. #mio
  const MIO_PROD_KEYS = ["production_efficiency_gain_factor", "production_efficiency_cap", "production_resource_need_factor", "organization_cost_reduction", "research_bonus"];
  async function loadMioList() {
    const el = $("mioList"); if (!el) return;
    if (!S._mioWired) {
      S._mioWired = true;
      const nb = $("mioNewBtn"); if (nb) nb.addEventListener("click", () => openMioEditor());
      // Collapsed by default — a total conversion ships hundreds of MIOs and an always-open flat list buried the
      // rest of the tab. The header keeps the count so it stays informative while shut. #mio-collapse
      const tg = $("mioToggle"), body = $("mioBody");
      if (tg && body) tg.addEventListener("click", () => {
        const open = tg.getAttribute("aria-expanded") === "true";
        tg.setAttribute("aria-expanded", open ? "false" : "true");
        body.style.display = open ? "none" : "";
      });
      const se = $("mioSearch");
      if (se) se.addEventListener("input", () => renderMioList());
      // real mio_cat_* tokens for the datalists (one fetch, cached)
      fetch("/api/mio/categories?modPath=" + encodeURIComponent(modPath())).then((r) => r.json()).then((d) => {
        S.mioCats = { equipment: (d && d.equipment) || [], research: (d && d.research) || [] };
      }).catch(() => { S.mioCats = { equipment: [], research: [] }; });
    }
    try {
      const d = await fetch("/api/mio?modPath=" + encodeURIComponent(modPath())).then((r) => r.json());
      if (!d || !d.ok) throw new Error((d && d.error) || "load failed"); // {ok:false} is an ERROR, not an empty list
      S.mios = d.mios || [];
      renderMioList();
    } catch (_) {
      // Don't show a false "none" on a transient (cold-warm) failure — show a retry instead. #mio-retry
      el.innerHTML = '<div class="army-empty">Couldn\'t load manufacturers. <button type="button" class="army-btn-sm" id="mioRetryBtn" style="margin-left:6px;">↻ Retry</button></div>';
      const rb = $("mioRetryBtn"); if (rb) rb.addEventListener("click", () => { S._mioWired = true; loadMioList(); });
    }
  }
  // Compact + grouped by source FILE, each group collapsible and collapsed by default, inside one capped scroll
  // window. MD ships 800+ MIOs across dozens of country files; the old flat always-open list of full-height rows
  // ran thousands of pixels tall and pushed everything else off the tab. #mio-collapse
  function renderMioList() {
    const el = $("mioList"); if (!el) return;
    const all = S.mios || [];
    const cnt = $("mioCount"); if (cnt) cnt.textContent = all.length ? `(${all.length})` : "";
    const q = (($("mioSearch") && $("mioSearch").value) || "").trim().toLowerCase();
    const mios = q ? all.filter((m) => String(m.id || "").toLowerCase().includes(q) || String(m.file || "").toLowerCase().includes(q)) : all;
    if (!all.length) { el.innerHTML = '<div class="army-empty">No manufacturers in this mod yet — ＋ New MIO to create one.</div>'; return; }
    if (!mios.length) { el.innerHTML = `<div class="army-empty">No manufacturer matches “${esc(q)}”.</div>`; return; }
    const byFile = new Map();
    for (const m of mios) { const f = m.file || "(unknown file)"; if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(m); }
    // A search should reveal its hits, so auto-open groups while filtering; otherwise start closed.
    const open = !!q;
    el.innerHTML = [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([file, list], gi) => `
      <button type="button" class="mio-grp-head" data-g="${gi}" aria-expanded="${open}" aria-controls="mioGrp${gi}">
        <span class="mio-chev">▸</span><span>📄 ${esc(file)}</span><span class="mio-grp-badge">${list.length}</span>
      </button>
      <div id="mioGrp${gi}" class="mio-grp-body" style="display:${open ? "" : "none"};">
        ${list.map((m) => `<div class="mio-row" title="${esc(m.id)}">🏭 <b>${esc(m.id)}</b></div>`).join("")}
      </div>`).join("");
    el.querySelectorAll(".mio-grp-head").forEach((h) => h.addEventListener("click", () => {
      const body = $("mioGrp" + h.dataset.g); if (!body) return;
      const isOpen = h.getAttribute("aria-expanded") === "true";
      h.setAttribute("aria-expanded", isOpen ? "false" : "true");
      body.style.display = isOpen ? "none" : "";
    }));
  }
  function openMioEditor() {
    const ov = $("dsgPicker"); if (!ov) return;
    S.mioDraft = { id: "", name: "", allowedTag: "", icon: "", eq: [], tech: [], initEq: [{ k: "", v: "" }], initProd: [], traits: [] };
    renderMioEditor();
  }

  // ── Equipment browser ────────────────────────────────────────────────────────────────────────────────
  // #equipment-picker-blind — picking equipment meant typing an id into a bare text box with a datalist
  // behind it. You had to already know the id to find it, and nothing showed you what the thing LOOKED like
  // — which is the whole point of a picker, and why the decisions and spirits browsers work. Same shape as
  // the starting-technology browser: a grid of tiles, each with the real in-game picture, searchable.
  //
  // The picture reuses NovaTechIcon: an equipment icon is GFX_<id>_medium, the same convention a technology
  // uses (measured: 429 of vanilla's 552 techs declare _medium and none a bare name), and army.html already
  // loads that helper. Rows that carry no art simply hide their picture — the helper does that itself.
  //
  // rows: [{ id, name, hint, own }] — `own` sorts a country's own designs to the front, which is what a
  // modder is nearly always reaching for.
  // #commander-typed-from-memory — PICK A GENERAL BY FACE, NOT BY SPELLING.
  //
  // A division's commander is HOI4's native `officer = { name = "…" }`, so the field wants a display name —
  // and the box asked the user to produce one from memory. Every other id-shaped field on this card grew a
  // Browse picker; this one did not, even though the country's generals are already scanned, already carry
  // portraits, and are exactly the sort of thing people recognise by face rather than by name.
  //
  // Includes the BASE MOD's characters too. An add-on on Millennium Dawn has almost no characters of its
  // own — the generals it wants to deploy belong to MD, and the game loads them all the same.
  async function openCommanderBrowser() {
    const ov = $("dsgPicker");
    if (!ov) return;
    const tag = String((S && S.country) || "").trim().toUpperCase();
    const status = $("deployStatus");
    if (status) status.textContent = "Loading commanders…";

    let rows = [];
    try {
      const mp = modPath();
      const data = await fetch("/api/characters/list?includeBaseMod=1&modPath=" + encodeURIComponent(mp)).then((r) => r.json());
      const own = (data && data.files) || [];
      const base = (data && data.baseModFiles) || [];
      const flat = [];
      for (const f of own) for (const c of (f.characters || [])) flat.push({ ...c, _base: false });
      for (const f of base) for (const c of (f.characters || [])) flat.push({ ...c, _base: true });
      // This country's, by either of the two things that tie a character to a tag: the file it lives in
      // (MD ships USA.txt) or the token prefix (USA_george_marshall).
      const mine = flat.filter((c) => {
        if (!tag) return true;
        const file = String(c.file || "").toUpperCase();
        const tok = String(c.token || "").toUpperCase();
        return file === tag + ".TXT" || file.startsWith(tag + "_") || tok.startsWith(tag + "_");
      });
      // A commander is a general or a field marshal. Fall back to everyone for this country if the mod
      // marks nobody — better a full list than an empty picker.
      const generals = mine.filter((c) => c.roleGeneral);
      rows = (generals.length ? generals : mine).map((c) => ({
        id: c.token || c.name,
        name: c.name || c.token,
        portrait: c.portraitArmyLarge || c.portraitArmySmall || c.portraitNavyLarge || c.portraitNavySmall || c.portraitCivLarge || "",
        kind: c.generalType || (c.roleAdmiral ? "admiral" : (c.roleGeneral ? "general" : "")),
        skills: [c.genSkill && ("skill " + c.genSkill), c.genAttack && ("atk " + c.genAttack),
                 c.genDefense && ("def " + c.genDefense), c.genPlanning && ("plan " + c.genPlanning),
                 c.genLogistics && ("log " + c.genLogistics)].filter(Boolean).join(" · "),
        base: c._base,
      }));
    } catch (_) { rows = []; }
    if (status) status.textContent = "";

    ov.innerHTML =
      '<div class="mp-box" style="width:min(920px,94vw); max-height:86vh;">' +
        '<div class="mp-head"><b>Pick a commander' + (tag ? " for " + esc(tag) : "") + "</b>" +
          '<span style="color:#6e7681; font-size:12px; text-transform:none;" id="cmdCount"></span>' +
          '<button type="button" class="mp-close" id="cmdClose" title="Close">×</button></div>' +
        '<div style="padding:10px 14px; border-bottom:1px solid #21262d;">' +
          '<input id="cmdSearch" class="army-input" type="text" placeholder="Search by name…" style="width:100%;" autocomplete="off"></div>' +
        '<div id="cmdGrid" class="modal-grid-techs" style="padding:12px; overflow-y:auto;"></div>' +
      "</div>";
    ov.style.display = "flex";

    const grid = $("cmdGrid"), search = $("cmdSearch"), count = $("cmdCount");
    const close = () => { ov.style.display = "none"; ov.innerHTML = ""; };
    $("cmdClose").addEventListener("click", close);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);

    function draw(list) {
      grid.innerHTML = "";
      if (!list.length) {
        grid.innerHTML = '<div style="padding:24px; color:#8b949e; text-align:center; grid-column:1/-1;">' +
          (tag ? "No commanders found for " + esc(tag) + ". Create one in the Characters maker." : "Pick a country first.") + "</div>";
        if (count) count.textContent = "";
        return;
      }
      const frag = document.createDocumentFragment();
      for (const r of list) {
        const tile = document.createElement("div");
        tile.className = "modal-item-tech";
        tile.innerHTML =
          '<div style="height:72px; display:flex; align-items:center; justify-content:center; margin-bottom:8px; overflow:hidden;">' +
            (r.portrait
              ? '<img alt="" data-portrait="' + esc(r.portrait) + '" style="max-height:72px; max-width:100%; object-fit:contain; border-radius:4px;">'
              : '<span style="font-size:30px;">🎖️</span>') + "</div>" +
          '<div style="font-size:12px; color:#e6edf3; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%;" title="' + esc(r.name) + '">' + esc(r.name) + "</div>" +
          (r.kind ? '<div style="font-size:9px; color:' + (r.base ? "#6e7681" : "#3fb950") + '; margin-top:3px; text-transform:uppercase; letter-spacing:0.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%;">' + esc(String(r.kind).replace(/_/g, " ")) + (r.base ? " · base mod" : "") + "</div>" : "") +
          (r.skills ? '<div style="font-size:9px; color:#8b949e; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%;" title="' + esc(r.skills) + '">' + esc(r.skills) + "</div>" : "");
        tile.addEventListener("click", () => {
          close();
          const box = $("deployOfficer");
          if (box) { box.value = r.name; box.dispatchEvent(new Event("input", { bubbles: true })); }
          if (status) status.textContent = "Commander: " + r.name;
        });
        frag.appendChild(tile);
      }
      grid.appendChild(frag);
      if (count) count.textContent = list.length + " commander" + (list.length === 1 ? "" : "s");
      // Portraits are .dds on disk; the sprite-url endpoint hands back something a browser can draw.
      grid.querySelectorAll("img[data-portrait]").forEach(async (img) => {
        try {
          const p = img.getAttribute("data-portrait");
          const j = await fetch("/api/ideas/sprite-url?key=" + encodeURIComponent(p) + "&modPath=" + encodeURIComponent(modPath())).then((r) => r.json());
          if (j && j.url) img.src = j.url;
          else img.replaceWith(Object.assign(document.createElement("span"), { textContent: "🎖️", style: "font-size:30px;" }));
        } catch (_) { /* leave the placeholder */ }
      });
    }
    draw(rows);
    search.addEventListener("input", () => {
      const q = (search.value || "").toLowerCase().trim();
      draw(!q ? rows : rows.filter((r) => String(r.name).toLowerCase().includes(q) || String(r.id).toLowerCase().includes(q)));
    });
    setTimeout(() => search.focus(), 30);
  }

  function openEquipmentBrowser(opts) {
    const o = opts || {};
    const ov = $("dsgPicker");
    if (!ov) return;
    const rows = (Array.isArray(o.rows) ? o.rows : []).filter((r) => r && r.id);
    let filtered = rows.slice();
    let drawn = 0;
    const BATCH = 120;

    ov.innerHTML =
      '<div class="mp-box" style="width:min(920px,94vw); max-height:86vh;">' +
        '<div class="mp-head"><b>' + esc(o.title || "Pick equipment") + "</b>" +
          '<span style="color:#6e7681; font-size:12px; text-transform:none;" id="eqbCount"></span>' +
          '<button type="button" class="mp-close" id="eqbClose" title="Close">×</button></div>' +
        '<div style="padding:10px 14px; border-bottom:1px solid #21262d;">' +
          '<input id="eqbSearch" class="army-input" type="text" placeholder="Search by id or name…" style="width:100%;" autocomplete="off"></div>' +
        '<div id="eqbGrid" class="modal-grid-techs" style="padding:12px; overflow-y:auto;"></div>' +
      "</div>";
    ov.style.display = "flex";

    const grid = $("eqbGrid"), search = $("eqbSearch"), count = $("eqbCount");
    const close = () => { ov.style.display = "none"; ov.innerHTML = ""; };
    $("eqbClose").addEventListener("click", close);
    // Same dismissal the other pickers use: click the backdrop, or press Escape.
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);

    function drawBatch() {
      const frag = document.createDocumentFragment();
      for (const r of filtered.slice(drawn, drawn + BATCH)) {
        const tile = document.createElement("div");
        tile.className = "modal-item-tech";
        tile.innerHTML =
          '<div style="height:52px; display:flex; align-items:center; justify-content:center; margin-bottom:8px;">' +
            (window.NovaTechIcon ? window.NovaTechIcon.html(r.id, { size: "lg", key: r.iconKey || "" }) : "🔧") + "</div>" +
          '<div style="font-family:monospace; font-size:11px; color:#58a6ff; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%;" title="' + esc(r.id) + '">' + esc(r.id) + "</div>" +
          '<div style="font-size:11px; color:#c9d1d9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%; margin-top:4px;" title="' + esc(r.name || r.id) + '">' + esc(r.name || r.id) + "</div>" +
          (r.hint ? '<div style="font-size:9px; color:' + (r.own ? "#3fb950" : "#6e7681") + '; margin-top:3px; text-transform:uppercase; letter-spacing:0.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%;">' + esc(r.hint) + "</div>" : "") +
          // #ship-composition — "ships don't show what they consist of". A design lists the modules it is
          // built from; a plain hull has no fitted module list we parse, so it shows the numbers that tell
          // one hull from another. Full text in the tooltip, since the tile only has one line for it.
          eqbPartsLine(r);
        tile.addEventListener("click", () => { close(); if (typeof o.onPick === "function") o.onPick(r.id, r); });
        frag.appendChild(tile);
      }
      grid.appendChild(frag);
      if (window.NovaTechIcon) window.NovaTechIcon.mount(grid);
      drawn += Math.min(BATCH, filtered.length - drawn);
      if (count) count.textContent = `${filtered.length} item${filtered.length === 1 ? "" : "s"}`;
    }
    function apply() {
      const q = (search.value || "").toLowerCase().trim();
      filtered = rows.filter((r) => !q || r.id.toLowerCase().includes(q) || String(r.name || "").toLowerCase().includes(q));
      // Own designs first — a modder is nearly always reaching for one of their own. Ids that are numbers
      // (state ids) sort as numbers; "100" before "20" is what a plain string compare would give.
      filtered.sort((a, b) => {
        const own = (b.own ? 1 : 0) - (a.own ? 1 : 0);
        if (own) return own;
        const na = Number(a.id), nb = Number(b.id);
        if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === String(a.id) && String(nb) === String(b.id)) return na - nb;
        return String(a.id).localeCompare(String(b.id));
      });
      grid.innerHTML = "";
      drawn = 0;
      if (!filtered.length) { grid.innerHTML = '<div style="padding:24px; color:#8b949e; text-align:center; grid-column:1/-1;">Nothing matches that.</div>'; if (count) count.textContent = "0 items"; return; }
      drawBatch();
    }
    // Long lists render in batches; pull the next one in as the grid is scrolled.
    grid.addEventListener("scroll", () => {
      if (drawn < filtered.length && grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 200) drawBatch();
    });
    search.addEventListener("input", apply);
    apply();
    setTimeout(() => search.focus(), 0);
  }

  // #ship-composition — one line saying what a row is made of. Modules when the design has them (that is the
  // literal answer to "what does it consist of"), otherwise the headline stats. Module ids are long, so the
  // slot's own prefix is dropped for display — ship_light_battery_2 under fixed_ship_battery_slot reads as
  // "light battery 2" — with the untouched ids in the tooltip.
  function eqbPrettyModule(id) {
    return String(id || "")
      .replace(/^(ship|tank|plane|air)_/, "")
      .replace(/_/g, " ")
      .trim();
  }
  function eqbPartsLine(r) {
    const mods = Array.isArray(r.modules) ? r.modules : [];
    const stats = Array.isArray(r.stats) ? r.stats : [];
    let text = "", title = "";
    if (mods.length) {
      text = mods.map((m) => eqbPrettyModule(m.module)).join(" · ");
      title = mods.map((m) => `${m.slot || "?"} = ${m.module}`).join("\n");
    } else if (stats.length) {
      text = stats.map((s) => `${eqbPrettyModule(s.k)} ${s.v}`).join(" · ");
      title = stats.map((s) => `${s.k} = ${s.v}`).join("\n");
    }
    if (!text) return "";
    return '<div style="font-size:10px; color:#8b949e; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%;" title="' + esc(title) + '">' + esc(text) + "</div>";
  }
  // #airbase-state-owner — states to base an air wing in, the owner's own first. The catalogue endpoint
  // already knows every state's owner and display name and sorts a given tag's states to the front, so this
  // asks it for the OWNER selected beside the box (falling back to the country being edited) rather than
  // filtering a full list client-side. Ownership is a soft filter, not a rule: a mod may legitimately base a
  // wing abroad, so the others are still listed, just after — and said to belong to someone else.
  // #deploy-state-id-blind-box — the LAND deploy box asked for the same thing and offered no list, so the
  // author had to already know a numeric state id (there are thousands) or leave the page to look one up.
  // Same picker, same owner-first ordering; only which input it fills and where it reports differ.
  async function openStateBrowser(opts) {
    const targetId = (opts && opts.target) || "naState";
    const statusId = (opts && opts.status) || "naStatus";
    // `in`, not `||` — the deploy card passes an EMPTY ownerFrom on purpose (it has no owner dropdown, it is
    // always the country being edited), and `||` would have silently read the air wing's owner instead.
    const ownerId = (opts && "ownerFrom" in opts) ? opts.ownerFrom : "naAirOwner";
    const title = (opts && opts.title) || "";
    const owner = ((ownerId && $(ownerId) && $(ownerId).value) || S.country || "").trim().toUpperCase();
    const st = $(statusId);
    if (st) { st.style.color = "#6e7681"; st.textContent = "Loading states…"; }
    let rows = [];
    try {
      const qs = new URLSearchParams({ modPath: modPath() });
      if (/^[A-Z][A-Z0-9]{2}$/.test(owner)) qs.set("countryTag", owner);
      const d = await fetch(`/api/buildings/state-catalog?${qs}`).then((r) => r.json());
      // The catalogue answers with `items` and carries no ok flag — check the array, not a status word.
      rows = (d && Array.isArray(d.items) ? d.items : []).map((s) => ({
        id: String(s.stateId),
        name: s.displayName || `State ${s.stateId}`,
        hint: s.ownerTag ? (s.ownerTag === owner ? `${owner} — owned` : s.ownerTag) : "no owner",
        own: !!owner && s.ownerTag === owner,
      }));
    } catch (_) { rows = []; }
    if (st) st.textContent = "";
    if (!rows.length) {
      if (st) { st.style.color = "#d29922"; st.textContent = "Couldn't read the state list for this mod."; }
      return;
    }
    openEquipmentBrowser({
      title: title
        ? (owner ? `${title} — ${owner} first` : title)
        : (owner ? `Pick an air-base state — ${owner} first` : "Pick an air-base state"),
      rows,
      onPick: (id) => eqbSetInput(targetId, id),
    });
  }
  // Fill a text input from the browser and let anything listening know it changed.
  function eqbSetInput(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function renderMioEditor() {
    const ov = $("dsgPicker"); if (!ov) return;
    const d = S.mioDraft;
    const cats = S.mioCats || { equipment: [], research: [] };
    const eqStatKeys = Object.keys(EQ_STAT);
    const chip = (val, kind, i) => `<span class="mio-chip">${esc(val)}<button type="button" class="mio-chip-x" data-kind="${kind}" data-i="${i}" title="Remove">×</button></span>`;
    const bonusRow = (row, path2, i, listId) =>
      `<div class="me-stat-row" data-path="${path2}" data-i="${i}"><input class="mio-bk army-input" list="${listId}" placeholder="stat" value="${esc(row.k)}"><input class="mio-bv army-input" type="number" step="any" placeholder="0" value="${esc(String(row.v))}"><button type="button" class="mio-brow-x" data-path="${path2}" data-i="${i}" title="Remove">×</button></div>`;
    const traitBlock = (t, ti) =>
      `<div class="mio-trait" data-ti="${ti}">
        <div class="mio-trait-head"><b>Trait ${ti + 1}</b><button type="button" class="mio-trait-x" data-ti="${ti}" title="Remove trait">× remove</button></div>
        <div class="me-row2">
          <label class="me-lbl">Token<input class="mio-t-token army-input" data-ti="${ti}" placeholder="reliable_tracks" value="${esc(t.token)}"></label>
          <label class="me-lbl">Name<input class="mio-t-name army-input" data-ti="${ti}" placeholder="Reliable tracks" value="${esc(t.name)}"></label>
        </div>
        <div class="me-row2">
          <label class="me-lbl">Grid X<input class="mio-t-x army-input" data-ti="${ti}" type="number" min="0" step="1" value="${Number(t.x) || 0}"></label>
          <label class="me-lbl">Grid Y<input class="mio-t-y army-input" data-ti="${ti}" type="number" min="0" step="1" value="${Number(t.y) || 0}"></label>
        </div>
        <div class="me-stats-h" style="margin-top:4px;">Equipment bonus <button type="button" class="mio-add-tbonus me-add" data-ti="${ti}">＋ stat</button></div>
        <div class="mio-tbonus-rows">${(t.eq || []).map((r, i) => bonusRow(r, "trait" + ti, i, "mioEqStatList")).join("") || '<div class="me-hint">no bonus yet</div>'}</div>
      </div>`;
    ov.innerHTML =
      `<div class="mp-box me-box mio-box">
        <div class="mp-head"><b>New manufacturer (MIO)</b> <button type="button" class="mp-close" title="Close">×</button></div>
        <div class="me-form">
          <div class="me-row2">
            <label class="me-lbl">MIO id <span class="me-hint">no spaces</span><input id="mioId" class="army-input" placeholder="nova_tank_works" value="${esc(d.id)}" autocomplete="off"></label>
            <label class="me-lbl">Display name<input id="mioName" class="army-input" placeholder="Nova Tank Works" value="${esc(d.name)}" autocomplete="off"></label>
          </div>
          <div class="me-row2">
            <label class="me-lbl">Available to <span class="me-hint">country — blank = all</span><select id="mioAllowed" class="army-input"></select></label>
            <label class="me-lbl">Icon <span class="me-hint">GFX_… optional</span><input id="mioIcon" class="army-input" placeholder="GFX_idea_generic_tank_manufacturer_1" value="${esc(d.icon)}" autocomplete="off"></label>
          </div>
          <div class="me-stats">
            <div class="me-stats-h">Works on — equipment <span class="me-hint">at least one equipment or research category</span></div>
            <div style="display:flex; gap:6px;"><input id="mioEqAdd" class="army-input" list="mioEqCatList" placeholder="mio_cat_eq_all_medium_tank" style="flex:1;" autocomplete="off" value="${esc(d.eqPending || "")}"><button type="button" id="mioEqAddBtn" class="me-add">＋ add</button></div>
            <div class="mio-chips">${d.eq.map((v, i) => chip(v, "eq", i)).join("") || '<span class="me-hint">none</span>'}</div>
          </div>
          <div class="me-stats">
            <div class="me-stats-h">Works on — research</div>
            <div style="display:flex; gap:6px;"><input id="mioTechAdd" class="army-input" list="mioTechCatList" placeholder="mio_cat_tech_medium_armor_and_modules" style="flex:1;" autocomplete="off" value="${esc(d.techPending || "")}"><button type="button" id="mioTechAddBtn" class="me-add">＋ add</button></div>
            <div class="mio-chips">${d.tech.map((v, i) => chip(v, "tech", i)).join("") || '<span class="me-hint">none</span>'}</div>
          </div>
          <div class="me-stats">
            <div class="me-stats-h">Base bonus (initial trait) — equipment <button type="button" id="mioInitEqAdd" class="me-add">＋ stat</button></div>
            <div id="mioInitEqRows">${d.initEq.map((r, i) => bonusRow(r, "initEq", i, "mioEqStatList")).join("") || '<div class="me-hint">no bonus yet</div>'}</div>
            <div class="me-stats-h" style="margin-top:6px;">Base bonus — production <button type="button" id="mioInitProdAdd" class="me-add">＋ stat</button></div>
            <div id="mioInitProdRows">${d.initProd.map((r, i) => bonusRow(r, "initProd", i, "mioProdKeyList")).join("") || '<div class="me-hint">no bonus yet</div>'}</div>
          </div>
          <div class="me-stats">
            <div class="me-stats-h">Trait tree <button type="button" id="mioAddTrait" class="me-add">＋ add trait</button></div>
            <div id="mioTraits">${d.traits.map((t, i) => traitBlock(t, i)).join("") || '<div class="me-hint">No traits — the base bonus alone is a valid MIO. Add traits for a research-able tree.</div>'}</div>
          </div>
          <datalist id="mioEqCatList">${cats.equipment.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <datalist id="mioTechCatList">${cats.research.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <datalist id="mioEqStatList">${eqStatKeys.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <datalist id="mioProdKeyList">${MIO_PROD_KEYS.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <div class="me-actions"><span id="mioStatus" class="me-status"></span><button type="button" class="me-save army-btn">Save MIO</button></div>
        </div>
      </div>`;
    ov.style.display = "flex";
    // country picker (preserve current selection)
    const allowedSel = $("mioAllowed");
    if (allowedSel && window.NovaCountryPicker) {
      NovaCountryPicker.populate(allowedSel, { modPath: modPath(), all: true }).then(() => { allowedSel.insertAdjacentHTML("afterbegin", '<option value="">🌍 All countries</option>'); allowedSel.value = d.allowedTag || ""; });
    }
    // Guarded like the module/chassis editors: this closer persists on the shared overlay after the MIO editor is
    // dismissed, so without the single-child check a stale backdrop click could blank a LATER layered editor. #modal-backdrop-guard
    const close = () => { if (ov.firstElementChild !== ov.lastElementChild) return; ov.style.display = "none"; ov.innerHTML = ""; };
    ov.querySelector(".mp-close").addEventListener("click", close);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    // scalar inputs → write into the draft (no re-render, so focus stays)
    const bind = (id, key) => { const el = $(id); if (el) el.addEventListener("input", () => { d[key] = el.value; }); };
    bind("mioId", "id"); bind("mioName", "name"); bind("mioIcon", "icon");
    if (allowedSel) allowedSel.addEventListener("change", () => { d.allowedTag = allowedSel.value; });
    // bonus-row scalar inputs → draft
    ov.querySelectorAll(".me-stat-row").forEach((row) => {
      const p = row.dataset.path, i = Number(row.dataset.i);
      const arr = p === "initEq" ? d.initEq : p === "initProd" ? d.initProd : (d.traits[Number(p.slice(5))] || {}).eq;
      if (!arr || !arr[i]) return;
      const bk = row.querySelector(".mio-bk"), bv = row.querySelector(".mio-bv");
      if (bk) bk.addEventListener("input", () => { arr[i].k = bk.value; });
      if (bv) bv.addEventListener("input", () => { arr[i].v = bv.value; });
    });
    // trait scalar inputs → draft
    ov.querySelectorAll(".mio-trait").forEach((tb) => {
      const ti = Number(tb.dataset.ti), t = d.traits[ti]; if (!t) return;
      const g = (cls) => tb.querySelector(cls);
      if (g(".mio-t-token")) g(".mio-t-token").addEventListener("input", (e) => { t.token = e.target.value; });
      if (g(".mio-t-name")) g(".mio-t-name").addEventListener("input", (e) => { t.name = e.target.value; });
      if (g(".mio-t-x")) g(".mio-t-x").addEventListener("input", (e) => { t.x = e.target.value; });
      if (g(".mio-t-y")) g(".mio-t-y").addEventListener("input", (e) => { t.y = e.target.value; });
    });
    // The two chip inputs must be BOUND to the draft like every other field: adding a chip re-renders the whole
    // editor, and an unbound sibling input rendered without a value= silently lost whatever the user had typed
    // into it. Bind → the re-render restores it; clear only the one whose chip was just added. #mio-chip-pending
    if ($("mioEqAdd")) $("mioEqAdd").addEventListener("input", (e) => { d.eqPending = e.target.value; });
    if ($("mioTechAdd")) $("mioTechAdd").addEventListener("input", (e) => { d.techPending = e.target.value; });
    // structural buttons → mutate draft + re-render
    const addChip = (inputId, arr, pendKey) => { const v = ($(inputId).value || "").trim(); if (v) { arr.push(v); d[pendKey] = ""; renderMioEditor(); } };
    $("mioEqAddBtn").addEventListener("click", () => addChip("mioEqAdd", d.eq, "eqPending"));
    $("mioTechAddBtn").addEventListener("click", () => addChip("mioTechAdd", d.tech, "techPending"));
    ov.querySelectorAll(".mio-chip-x").forEach((x) => x.addEventListener("click", () => { (x.dataset.kind === "eq" ? d.eq : d.tech).splice(Number(x.dataset.i), 1); renderMioEditor(); }));
    $("mioInitEqAdd").addEventListener("click", () => { d.initEq.push({ k: "", v: "" }); renderMioEditor(); });
    $("mioInitProdAdd").addEventListener("click", () => { d.initProd.push({ k: "", v: "" }); renderMioEditor(); });
    $("mioAddTrait").addEventListener("click", () => { d.traits.push({ token: "", name: "", x: 0, y: d.traits.length, eq: [{ k: "", v: "" }] }); renderMioEditor(); });
    ov.querySelectorAll(".mio-trait-x").forEach((x) => x.addEventListener("click", () => { d.traits.splice(Number(x.dataset.ti), 1); renderMioEditor(); }));
    ov.querySelectorAll(".mio-add-tbonus").forEach((b) => b.addEventListener("click", () => { const t = d.traits[Number(b.dataset.ti)]; if (t) { (t.eq = t.eq || []).push({ k: "", v: "" }); renderMioEditor(); } }));
    ov.querySelectorAll(".mio-brow-x").forEach((x) => x.addEventListener("click", () => {
      const p = x.dataset.path, i = Number(x.dataset.i);
      const arr = p === "initEq" ? d.initEq : p === "initProd" ? d.initProd : (d.traits[Number(p.slice(5))] || {}).eq;
      if (arr) { arr.splice(i, 1); renderMioEditor(); }
    }));
    ov.querySelector(".me-save").addEventListener("click", mioSave);
  }
  async function mioSave() {
    const ov = $("dsgPicker"), d = S.mioDraft, st = $("mioStatus"), btn = ov.querySelector(".me-save");
    const rowsToObj = (arr) => { const o = {}; for (const r of (arr || [])) { const k = (r.k || "").trim(); if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && r.v !== "" && !isNaN(Number(r.v))) o[k] = Number(r.v); } return o; };
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test((d.id || "").trim())) { st.style.color = "#d29922"; st.textContent = "MIO id must start with a letter/underscore, no spaces."; return; }
    if (!d.eq.length && !d.tech.length) { st.style.color = "#d29922"; st.textContent = "Add at least one equipment or research category it works on."; return; }
    // A trait token is the org-unique node identity — mirror the server's dup-token refusal so the user gets an
    // inline message instead of a silent rejection (matches the dup-MIO-id / dup-variant-name guards). #mio-trait-dup
    { const seen = new Set(); for (const t of (d.traits || [])) { const tk = (t.token || "").trim(); if (!tk) continue; if (seen.has(tk)) { st.style.color = "#d29922"; st.textContent = `Trait token “${tk}” is used twice — each trait needs a unique token.`; return; } seen.add(tk); } }
    // A trait with a name/bonus but a BLANK token gets silently dropped by the .filter below — losing the user's
    // work. Refuse and point at it (a token is the trait's unique id; it can't be saved without one). #mio-blank-token
    { const orphan = (d.traits || []).find((t) => !(t.token || "").trim() && (((t.name || "").trim()) || ((t.eq || []).some((r) => (r.k || "").trim() && r.v !== "" && r.v != null)))); if (orphan) { st.style.color = "#d29922"; st.textContent = "A trait has a name or bonus but no token — give it a token (its unique id), or clear it, before saving."; return; } }
    const body = {
      modPath: modPath(), id: d.id.trim(), name: d.name.trim() || d.id.trim(), allowedTag: (d.allowedTag || "").trim(), icon: (d.icon || "").trim(),
      equipmentType: d.eq.slice(), researchCategories: d.tech.slice(),
      initial: { equipmentBonus: rowsToObj(d.initEq), productionBonus: rowsToObj(d.initProd) },
      traits: (d.traits || []).map((t) => ({ token: (t.token || "").trim(), name: (t.name || "").trim(), x: Number(t.x) || 0, y: Number(t.y) || 0, equipmentBonus: rowsToObj(t.eq) })).filter((t) => t.token),
    };
    btn.disabled = true; st.style.color = "#6e7681"; st.textContent = "Saving…";
    try {
      const r = await fetch("/api/mio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
      if (r && r.ok) { st.style.color = "#3fb950"; st.textContent = `✓ Saved “${r.id}” (${r.traits} trait${r.traits === 1 ? "" : "s"}) → ${r.file}`; loadMioList(); scheduleDsgClose(ov, 900); }
      else { st.style.color = "#f85149"; st.textContent = (r && r.error) || "Save failed."; btn.disabled = false; }
    } catch (e) { st.style.color = "#f85149"; st.textContent = "Save failed: " + (e.message || e); btn.disabled = false; }
  }

  // ── Custom equipment UPGRADE definition editor. "＋ New upgrade" → POST /api/equipment/upgrade. #upgrades
  async function loadUpgradeInfo() {
    const card = $("eqUpgradeCard"); if (!card) return;
    if (!S._upgWired) {
      S._upgWired = true;
      const nb = $("upgNewBtn"); if (nb) nb.addEventListener("click", () => openUpgradeEditor());
    }
    const c = $("upgCount");
    try {
      const d = await fetch("/api/equipment/upgrades?modPath=" + encodeURIComponent(modPath())).then((r) => r.json());
      if (!d || !d.ok) throw new Error((d && d.error) || "load failed");
      const n = (d.upgrades || []).length;
      if (c) c.innerHTML = n ? `${n} upgrade${n === 1 ? "" : "s"} exist here (mod + base game).` : "";
    } catch (_) {
      // transient (cold-warm) failure → offer a retry instead of a silently-blank count. #upg-retry
      if (c) { c.innerHTML = 'Couldn\'t load upgrades. <button type="button" class="army-btn-sm" id="upgRetryBtn" style="margin-left:4px;">↻ Retry</button>'; const rb = $("upgRetryBtn"); if (rb) rb.addEventListener("click", loadUpgradeInfo); }
    }
  }
  function openUpgradeEditor() {
    const ov = $("dsgPicker"); if (!ov) return;
    S.upgDraft = { id: "", abbreviation: "", cost: "land", max_level: 5, stats: [{ k: "", v: "" }], attachTo: [] };
    renderUpgradeEditor();
    // #an-upgrade-attached-to-nothing — the list of this mod's own equipment, which is the only thing an
    // upgrade can be attached to (a mod file replaces a vanilla common/ file of the same name wholesale).
    // Fetched after the first render so a slow catalogue never delays the form.
    fetch("/api/equipment/list?modPath=" + encodeURIComponent(modPath())).then((r) => r.json()).then((d) => {
      if (!d || !d.ok || !S.upgDraft) return;
      S.upgAttachable = (d.equipment || []).filter((e) => e && e.isMod && e.id).map((e) => ({ id: e.id, name: e.name || "" }));
      if ($("upgAttachBox")) renderUpgradeAttachList();
    }).catch(() => {});
  }
  function renderUpgradeAttachList() {
    const box = $("upgAttachBox"); if (!box) return;
    const list = S.upgAttachable;
    if (!Array.isArray(list)) { box.innerHTML = '<div class="army-empty">Loading this mod’s equipment…</div>'; return; }
    if (!list.length) {
      box.innerHTML = '<div class="army-empty">This mod has no equipment of its own yet. Make a family first — an upgrade can only be attached to equipment the mod owns, because a mod file replaces a base-game one of the same name wholesale.</div>';
      return;
    }
    const sel = new Set(S.upgDraft.attachTo || []);
    box.innerHTML = list.map((e) =>
      `<label class="upg-att" style="display:flex;gap:6px;align-items:center;padding:2px 0;">` +
      `<input type="checkbox" class="upg-att-cb" value="${esc(e.id)}"${sel.has(e.id) ? " checked" : ""}>` +
      `<span>${esc(e.id)}${e.name ? ' <span style="color:#8b949e;">' + esc(e.name) + "</span>" : ""}</span></label>`).join("");
    box.querySelectorAll(".upg-att-cb").forEach((cb) => cb.addEventListener("change", () => {
      const s = new Set(S.upgDraft.attachTo || []);
      if (cb.checked) s.add(cb.value); else s.delete(cb.value);
      S.upgDraft.attachTo = [...s];
    }));
  }
  function renderUpgradeEditor() {
    const ov = $("dsgPicker"); if (!ov) return;
    const d = S.upgDraft;
    const eqStatKeys = Object.keys(EQ_STAT);
    const opt = (v, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${v === "air" ? "✈️ Air" : v === "naval" ? "🚢 Naval" : "🪖 Land"}</option>`;
    const statRow = (r, i) => `<div class="me-stat-row" data-i="${i}"><input class="upg-sk army-input" list="upgStatList" placeholder="stat (e.g. armor_value)" value="${esc(r.k)}"><input class="upg-sv army-input" type="number" step="any" placeholder="0" value="${esc(String(r.v))}"><button type="button" class="upg-srow-x mio-brow-x" data-i="${i}" title="Remove">×</button></div>`;
    ov.innerHTML =
      `<div class="mp-box me-box">
        <div class="mp-head"><b>New equipment upgrade</b> <button type="button" class="mp-close" title="Close">×</button></div>
        <div class="me-form">
          <div class="me-row2">
            <label class="me-lbl">Upgrade id <span class="me-hint">no spaces</span><input id="upgId" class="army-input" placeholder="nova_armor_upgrade" value="${esc(d.id)}" autocomplete="off"></label>
            <label class="me-lbl">Abbreviation <span class="me-hint">≤8, optional</span><input id="upgAbbr" class="army-input" maxlength="8" placeholder="arm" value="${esc(d.abbreviation)}" autocomplete="off"></label>
          </div>
          <div class="me-row2">
            <label class="me-lbl">Cost type <span class="me-hint">which XP pool pays</span><select id="upgCost" class="army-input">${["land", "air", "naval"].map((v) => opt(v, d.cost)).join("")}</select></label>
            <label class="me-lbl">Max level <span class="me-hint">levels the player can buy</span><input id="upgMax" class="army-input" type="number" min="1" max="100" step="1" value="${Number(d.max_level) || 5}"></label>
          </div>
          <div class="me-stats">
            <div class="me-stats-h">Per-level stat change <span class="me-hint">applied each level</span><button type="button" id="upgAddStat" class="me-add">＋ stat</button></div>
            <div id="upgStatRows">${d.stats.map((r, i) => statRow(r, i)).join("")}</div>
          </div>
          <datalist id="upgStatList">${eqStatKeys.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <div class="me-stats">
            <div class="me-stats-h">Which equipment gets it <span class="me-hint">the game only offers an upgrade the equipment lists</span></div>
            <div id="upgAttachBox" style="max-height:150px;overflow:auto;padding:2px 0;"></div>
          </div>
          <div class="me-actions"><span id="upgStatus" class="me-status"></span><button type="button" class="me-save army-btn">Save upgrade</button></div>
        </div>
      </div>`;
    ov.style.display = "flex";
    // Guarded like the module/chassis editors: this closer persists on the shared overlay after the upgrade editor
    // is dismissed, so without the single-child check a stale backdrop click could blank a LATER layered editor. #modal-backdrop-guard
    const close = () => { if (ov.firstElementChild !== ov.lastElementChild) return; ov.style.display = "none"; ov.innerHTML = ""; };
    ov.querySelector(".mp-close").addEventListener("click", close);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    const bind = (id, key, num) => { const el = $(id); if (el) el.addEventListener("input", () => { d[key] = num ? el.value : el.value; }); };
    bind("upgId", "id"); bind("upgAbbr", "abbreviation");
    $("upgCost").addEventListener("change", () => { d.cost = $("upgCost").value; });
    $("upgMax").addEventListener("input", () => { d.max_level = $("upgMax").value; });
    ov.querySelectorAll("#upgStatRows .me-stat-row").forEach((row) => {
      const i = Number(row.dataset.i); if (!d.stats[i]) return;
      const sk = row.querySelector(".upg-sk"), sv = row.querySelector(".upg-sv");
      if (sk) sk.addEventListener("input", () => { d.stats[i].k = sk.value; });
      if (sv) sv.addEventListener("input", () => { d.stats[i].v = sv.value; });
    });
    $("upgAddStat").addEventListener("click", () => { d.stats.push({ k: "", v: "" }); renderUpgradeEditor(); });
    ov.querySelectorAll(".upg-srow-x").forEach((x) => x.addEventListener("click", () => { d.stats.splice(Number(x.dataset.i), 1); if (!d.stats.length) d.stats.push({ k: "", v: "" }); renderUpgradeEditor(); }));
    renderUpgradeAttachList();
    ov.querySelector(".me-save").addEventListener("click", upgSave);
  }
  async function upgSave() {
    const ov = $("dsgPicker"), d = S.upgDraft, st = $("upgStatus"), btn = ov.querySelector(".me-save");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test((d.id || "").trim())) { st.style.color = "#d29922"; st.textContent = "Upgrade id must start with a letter/underscore, no spaces."; return; }
    const stats = {}; for (const r of d.stats) { const k = (r.k || "").trim(); if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && r.v !== "" && !isNaN(Number(r.v))) stats[k] = Number(r.v); }
    if (!Object.keys(stats).length) { st.style.color = "#d29922"; st.textContent = "Add at least one stat the upgrade improves."; return; }
    btn.disabled = true; st.style.color = "#6e7681"; st.textContent = "Saving…";
    try {
      const r = await fetch("/api/equipment/upgrade", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: modPath(), id: d.id.trim(), abbreviation: (d.abbreviation || "").trim(), cost: d.cost, max_level: Number(d.max_level) || 5, stats, attachTo: d.attachTo || [] }),
      }).then((x) => x.json());
      if (r && r.ok) {
        // A stat name HOI4 doesn't know is a PARSE error, not an ignored line — so the save reports it and
        // stays open instead of auto-closing over the top of it. #upgrade-stat-vocabulary
        // #an-upgrade-attached-to-nothing — and an upgrade no equipment lists is never offered by the game,
        // which is just as invisible, so that keeps the editor open too rather than closing on a green tick.
        const attached = (r.attachedTo || []).length;
        if (r.statWarning || (r.notes || []).length) {
          st.style.color = "#d29922";
          st.textContent = r.statWarning ? "⚠ " + r.statWarning
            : `Saved “${r.id}”${attached ? ` and attached it to ${(r.attachedTo || []).join(", ")}` : ""} → ${r.file}`;
          showSaveWarnings("upgStatus", r.notes);
          loadUpgradeInfo(); btn.disabled = false;
        } else {
          st.style.color = "#3fb950";
          st.textContent = `✓ Saved “${r.id}” (${r.cost}, max ${r.max_level}) → ${r.file}` +
            (attached ? ` · offered on ${(r.attachedTo || []).join(", ")}` : "");
          showSaveWarnings("upgStatus", []);
          loadUpgradeInfo(); scheduleDsgClose(ov, 900);
        }
      }
      else { st.style.color = "#f85149"; st.textContent = (r && r.error) || "Save failed."; btn.disabled = false; }
    } catch (e) { st.style.color = "#f85149"; st.textContent = "Save failed: " + (e.message || e); btn.disabled = false; }
  }
  // ── New modular CHASSIS editor. "＋ New chassis" → POST /api/equipment/chassis-new → reload designer. #new-chassis
  // MUST mirror the server's deriveEquipmentDesigner sets — `type` is what decides which designer a chassis lands
  // in, and a type outside those sets writes a chassis that is invisible in the UI and invalid in-game. The old
  // list offered OOB `ship = { definition = destroyer }` values (destroyer/light_cruiser/battleship) and airframe
  // NAME prefixes (small_plane/…) which are not equipment types at all. The server now rejects a bad type at the
  // write choke point, so this list is only a convenience — but keep the two in sync. #chassis-type-valid
  const CHASSIS_TYPE_HINTS = {
    armor: ["armor"],
    ship: ["screen_ship", "capital_ship", "carrier", "submarine"],
    plane: ["fighter", "cas", "tactical_bomber", "strategic_bomber", "naval_bomber", "interceptor", "heavy_fighter", "scout_plane", "maritime_patrol_plane", "air_transport", "suicide"],
  };
  // What a new weapon can BE, phrased by what it does rather than by its engine token. The list is not a
  // style choice: these are the only types vanilla ever gives `module_slots` to. Modules are a DLC-DESIGNER
  // feature (No Step Back tanks / Man the Guns ships / By Blood Alone planes) and NOTHING else has them —
  // verified across vanilla + MD + R56, where ZERO missiles of any kind carry module_slots. So a weapon with
  // swappable parts must be one of these. (air_transport is deliberately absent: it's a plane type, but
  // vanilla gives it no module_slots, so it isn't modular either.) #new-weapon
  const WEAPON_BEHAVIOUR = {
    armor: [["armor", "Drives and fights on the ground", "A tank or armoured vehicle — serves in land divisions."]],
    plane: [
      ["fighter", "Flies and fights other aircraft", "Air superiority and interception."],
      ["cas", "Flies and attacks troops on the ground", "Close air support."],
      ["tactical_bomber", "Flies and hits troops and buildings", "A flexible medium bomber."],
      ["strategic_bomber", "Flies and bombs buildings & industry", "Long range. The closest HOI4 has to an orbital strike platform."],
      ["naval_bomber", "Flies and attacks ships", "Naval strike."],
      ["heavy_fighter", "Flies far and fights aircraft", "Long-range escort."],
      ["interceptor", "Flies and intercepts bombers", "Point defence."],
      ["scout_plane", "Flies and scouts", "Recon."],
      ["maritime_patrol_plane", "Flies and patrols the sea", "Spots ships and submarines."],
      ["suicide", "Flies once — kamikaze", "One-way attack."],
    ],
    ship: [
      ["screen_ship", "Sails as a small escort", "Destroyers and light cruisers."],
      ["capital_ship", "Sails as a heavy warship", "Battleships and heavy cruisers."],
      ["carrier", "Sails and carries aircraft", "A flight deck at sea."],
      ["submarine", "Sails underwater", "Stealth and torpedoes."],
    ],
  };
  const DOMAIN_LABEL = { armor: "🪖 Drives (tank)", plane: "✈️ Flies (aircraft)", ship: "🚢 Sails (ship)" };
  // The creator renders INSIDE the designer box (#dsgBody) rather than in the shared overlay — the user's
  // point was that a separate modal is exactly what made this feel like a third designer. `host` decides
  // where; the overlay path stays for the ＋New-equipment radio. #new-weapon
  // The extra jobs ONE weapon can also do. Land says so with a multi-value `type` (MD's SPAA is
  // `type = { armor anti_air }`); air keeps one primary `type` and lists the rest in `allowed_types`
  // (vanilla's fighter airframe allows five). Ships have no multi-role form in any real file. #multi-role
  const LAND_EXTRA_JOBS = [["anti_air", "Shoot at aircraft"], ["anti_tank", "Kill tanks"], ["artillery", "Bombard as artillery"],
    ["rocket", "Fire rockets"], ["flame", "Flamethrower"], ["amphibious", "Cross water"], ["motorized", "Count as motorized"], ["mechanized", "Count as mechanized"]];
  function newChassisDraft() {
    return { id: "", name: "", domain: "armor", type: "armor", picture: "", priority: 100, year: 1936,
      extraTypes: [], allowedTypes: [],
      slots: [{ name: "", required: true, cats: [] }], base: [{ k: "build_cost_ic", v: "" }, { k: "reliability", v: "" }] };
  }
  // #chassis-missing-required-slot — HOI4's modules name the slot they mount into, so a chassis whose slot
  // set omits one of them can never take those modules. The editor used to hand the modder an empty row and
  // a placeholder, and a tank hull got written with no gun slot, no engine slot and no suspension slot — the
  // game reported it twelve times and the hull was unbuildable. Start from what the game's own chassis of
  // this type declare. Only ever seeds when the modder has not typed anything, so it cannot overwrite work.
  async function seedChassisSlots(d) {
    const untouched = !d.slots.length ||
      d.slots.every((s) => !(s.name || "").trim() && !((s.cats || []).length));
    if (!untouched || !d.type) return;
    try {
      const r = await fetch(`/api/equipment/chassis-slot-template?type=${encodeURIComponent(d.type)}`).then((x) => x.json());
      if (!r || !r.ok || !Array.isArray(r.slots) || !r.slots.length) return;
      d.slots = r.slots.map((s) => ({ name: s.name, required: !!s.required, cats: (s.categories || []).slice() }));
      d.slotsSeededFrom = r.from || "";
    } catch (_) { /* offline or no game files — the modder just types them, as before */ }
  }
  function openWeaponCreator() {
    S.chassisDraft = newChassisDraft();
    S.chassisHost = "inline";
    seedChassisSlots(S.chassisDraft).then(() => renderChassisEditor());
  }
  function openChassisEditor() {
    const ov = $("dsgPicker"); if (!ov) return;
    S.chassisDraft = newChassisDraft();
    S.chassisHost = "modal";
    seedChassisSlots(S.chassisDraft).then(() => renderChassisEditor());
  }
  const chassisHostEl = () => (S.chassisHost === "inline" ? $("dsgBody") : $("dsgPicker"));
  // priority 0 is legal (lowest production weight); default ONLY on empty/NaN, never coerce a real 0. Note
  // Number("") === 0, so an empty field must be treated as "default", not 0. #chassis-priority-zero
  function chassisPriority(v) { const s = String(v == null ? "" : v).trim(); return s === "" || isNaN(Number(s)) ? 100 : Number(s); }
  function renderChassisEditor() {
    const inline = S.chassisHost === "inline";
    const ov = chassisHostEl(); if (!ov) return;
    // ONE chassis editor at a time. Both hosts emit the SAME element ids (chId, chAddSlot, chStatus, ...)
    // and the same per-slot data-si indices, so leaving the other one in the DOM duplicates every id and
    // each lookup below - the bind() calls, $("chAddSlot"), the per-slot .ch-cat-add inputs - silently
    // resolves to whichever comes FIRST in document order. Opening the modal from "+ New equipment" while
    // the inline "New weapon" editor was still on screen therefore pointed the modal's own buttons at the
    // hidden inline form: adding a category to a new slot did nothing, and add/remove slot re-rendered
    // from a draft the visible fields were never writing into. #two-chassis-editors
    //
    // Torn down through the paths the editor's Cancel and close buttons already use, and a no-op once
    // done - which matters because this runs again on every slot add and remove.
    const stale = inline ? $("dsgPicker") : $("dsgBody");
    if (stale && stale.querySelector("#chId")) {
      if (inline) { stale.style.display = "none"; stale.innerHTML = ""; }
      else renderModularDesigner();
    }
    const d = S.chassisDraft;
    const catKeys = Object.keys(S.equip.modulesByCategory || {}).sort();
    const typeHints = CHASSIS_TYPE_HINTS[d.domain] || [];
    const eqStatKeys = Object.keys(EQ_STAT);
    const catChip = (v, si, ci) => `<span class="mio-chip">${esc(v)}<button type="button" class="ch-cat-x mio-chip-x" data-si="${si}" data-ci="${ci}" title="Remove">×</button></span>`;
    const slotBlock = (s, si) =>
      `<div class="mio-trait" data-si="${si}">
        <div class="mio-trait-head"><b>Slot ${si + 1}</b><button type="button" class="ch-slot-x mio-trait-x" data-si="${si}" title="Remove slot">× remove</button></div>
        <div class="me-row2">
          <label class="me-lbl">Slot name<input class="ch-s-name army-input" data-si="${si}" placeholder="turret_type_slot" value="${esc(s.name)}"></label>
          <label class="me-lbl" style="flex-direction:row; align-items:center; gap:6px;"><input type="checkbox" class="ch-s-req" data-si="${si}" ${s.required ? "checked" : ""} style="accent-color:#1f6feb;"> required</label>
        </div>
        <div class="me-stats-h" style="margin-top:4px;">Allowed module categories</div>
        <div style="display:flex; gap:6px;"><input class="ch-cat-add army-input" data-si="${si}" list="chCatList" placeholder="tank_light_turret_type" style="flex:1;" autocomplete="off"><button type="button" class="ch-cat-add-btn me-add" data-si="${si}">＋ add</button></div>
        <div class="mio-chips">${(s.cats || []).map((v, ci) => catChip(v, si, ci)).join("") || '<span class="me-hint">none — add at least one</span>'}</div>
      </div>`;
    const behaviours = WEAPON_BEHAVIOUR[d.domain] || [];
    const curB = behaviours.find((b) => b[0] === d.type);
    const inner =
      `<div class="me-form">
          ${inline ? '<div class="nw-lead">Build a weapon that isn\'t in the game — your own frame, your own part slots, your own art. Fill it with parts in the designer afterwards.</div>' : ""}
          <div class="me-row2">
            <label class="me-lbl">Weapon id <span class="me-hint">no spaces — the game's internal name</span><input id="chId" class="army-input" placeholder="nova_satellite_chassis" value="${esc(d.id)}" autocomplete="off"></label>
            <label class="me-lbl">Display name <span class="me-hint">what players see</span><input id="chName" class="army-input" placeholder="Orbital Platform" value="${esc(d.name)}" autocomplete="off"></label>
          </div>
          <div class="me-row2">
            <label class="me-lbl"><span class="dz-lbl">How does it move? <span class="sb-help" data-help="nw-behaviour" title="Why can't I invent a new kind?">?</span></span><select id="chDomain" class="army-input">${["armor", "plane", "ship"].map((x) => `<option value="${x}"${x === d.domain ? " selected" : ""}>${DOMAIN_LABEL[x]}</option>`).join("")}</select></label>
            <label class="me-lbl"><span class="dz-lbl">What does it mainly do? <span class="sb-help" data-help="nw-multirole" title="Can it do more than one thing?">?</span></span><select id="chType" class="army-input">${behaviours.map(([v, t]) => `<option value="${v}"${v === d.type ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
          </div>
          ${curB && curB[2] ? `<div class="nw-why">${esc(curB[2])}</div>` : ""}
          ${d.domain === "ship" ? "" : `<div class="me-stats">
            <div class="me-stats-h">${d.domain === "plane" ? "It can also fly these roles" : "It also counts as"} <span class="me-hint">${d.domain === "plane" ? "optional — a real fighter airframe allows five" : "optional — this is how SPAA and flame tanks are made"}</span></div>
            <div class="nw-jobs">${(d.domain === "plane"
              ? (WEAPON_BEHAVIOUR.plane || []).filter(([v]) => v !== d.type).map(([v, t]) => [v, t])
              : LAND_EXTRA_JOBS
            ).map(([v, t]) => `<label class="nw-job"><input type="checkbox" class="ch-job" value="${esc(v)}" ${((d.domain === "plane" ? d.allowedTypes : d.extraTypes) || []).includes(v) ? "checked" : ""} style="accent-color:#1f6feb;"> ${esc(t)}</label>`).join("")}</div>
          </div>`}
          <div class="me-row2">
            <label class="me-lbl">Picture <span class="me-hint">its art in-game</span><span style="display:flex; gap:5px; align-items:center;"><input id="chPicture" class="army-input" placeholder="GFX_…" value="${esc(d.picture || "")}" style="flex:1;" autocomplete="off"><button type="button" id="chPicBrowse" class="army-btn-sm" title="Browse in-game equipment art">🖼 Browse</button></span></label>
            <label class="me-lbl">Year<input id="chYear" class="army-input" type="number" min="1" step="1" value="${Number(d.year) || 1936}"></label>
          </div>
          <div class="me-row2">
            <label class="me-lbl"><span class="dz-lbl">Priority <span class="sb-help" data-help="chassis-priority" title="What is priority?">?</span></span><input id="chPriority" class="army-input" type="number" min="0" step="1" value="${chassisPriority(d.priority)}"></label>
            <span></span>
          </div>
          <div class="me-stats">
            <div class="me-stats-h">Part slots <span class="me-hint">name your own — e.g. laser_beam_slot</span><button type="button" id="chAddSlot" class="me-add">＋ add slot</button></div>
            <div id="chSlots">${d.slots.map((s, i) => slotBlock(s, i)).join("")}</div>
          </div>
          <div class="me-stats">
            <div class="me-stats-h">Base stats <span class="me-hint">optional — the tier's starting stats</span></div>
            <div id="chBaseRows">${d.base.map((r, i) => `<div class="me-stat-row" data-i="${i}"><input class="ch-b-k army-input" list="chStatList" placeholder="stat" value="${esc(r.k)}"><input class="ch-b-v army-input" type="number" step="any" placeholder="0" value="${esc(String(r.v))}"><button type="button" class="ch-b-x mio-brow-x" data-i="${i}" title="Remove">×</button></div>`).join("")}</div>
            <button type="button" id="chAddBase" class="me-add" style="margin-top:6px;">＋ stat</button>
          </div>
          <datalist id="chCatList">${catKeys.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <datalist id="chTypeList">${typeHints.map((x) => `<option value="${x}"></option>`).join("")}</datalist>
          <datalist id="chStatList">${eqStatKeys.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <div class="me-actions"><span id="chStatus" class="me-status"></span>${inline ? '<button type="button" id="chCancel" class="army-btn-sm">Cancel</button>' : ""}<button type="button" class="me-save army-btn">${inline ? "Create weapon" : "Save chassis"}</button></div>
        </div>`;
    // Inline: render straight into the designer box, no overlay chrome. Modal: keep the old shell.
    ov.innerHTML = inline
      ? `<div class="nw-wrap"><div class="nw-head"><b>🛠️ New weapon</b><span class="card-sub" style="margin:0;">Its own frame, slots and art — then design variants of it below.</span></div>${inner}</div>`
      : `<div class="mp-box me-box mio-box"><div class="mp-head"><b>New modular chassis</b> <button type="button" class="mp-close" title="Close">×</button></div>${inner}</div>`;
    const backToDesigner = () => { S.chassisHost = ""; renderModularDesigner(); };
    if (inline) {
      const cx = $("chCancel"); if (cx) cx.addEventListener("click", backToDesigner);
    } else {
      ov.style.display = "flex";
      // Don't blank the shared overlay while a sub-picker (the icon picker) is layered on top — a backdrop click
      // would otherwise destroy the in-progress modal chassis design (and the only resume path resets the draft).
      // The editor is a single root child; a layered picker box makes it no longer the only child. #modal-backdrop-guard
      const close = () => { if (ov.firstElementChild !== ov.lastElementChild) return; ov.style.display = "none"; ov.innerHTML = ""; };
      ov.querySelector(".mp-close").addEventListener("click", close);
      ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    }
    const bind = (id, key) => { const el = $(id); if (el) el.addEventListener("input", () => { d[key] = el.value; }); };
    bind("chId", "id"); bind("chName", "name"); bind("chPicture", "picture");
    // Type is a SELECT now, not free text — re-render so the "what this means" line under it follows.
    $("chType").addEventListener("change", () => { d.type = $("chType").value; seedChassisSlots(d).then(() => renderChassisEditor()); });
    // Reset Type on ANY domain change — switching armor→ship/plane must NOT keep the default 'armor' type (it
    // would silently write an invalid land-type on a naval/air archetype). Land on that domain's FIRST real
    // behaviour rather than empty, since the field is now a closed list. #chassis-domain-type
    $("chDomain").addEventListener("change", () => {
      d.domain = $("chDomain").value;
      d.type = (WEAPON_BEHAVIOUR[d.domain] && WEAPON_BEHAVIOUR[d.domain][0][0]) || "";
      seedChassisSlots(d).then(() => renderChassisEditor());
    });
    // Extra jobs. Kept in the draft (not read off the DOM at save time) so a re-render preserves them.
    ov.querySelectorAll(".ch-job").forEach((cb) => cb.addEventListener("change", () => {
      const key = d.domain === "plane" ? "allowedTypes" : "extraTypes";
      const cur = new Set(d[key] || []);
      if (cb.checked) cur.add(cb.value); else cur.delete(cb.value);
      d[key] = [...cur];
    }));
    // Reuse the arsenal's icon browser, domain-filtered to this weapon's own domain.
    const pb = $("chPicBrowse");
    if (pb) pb.addEventListener("click", () => openIconPicker("chPicture", d.domain === "armor" ? "tanks" : d.domain === "ship" ? "ships" : "planes", () => { d.picture = $("chPicture").value; }));
    $("chPriority").addEventListener("input", () => { d.priority = $("chPriority").value; });
    $("chYear").addEventListener("input", () => { d.year = $("chYear").value; });
    // slot scalar inputs
    ov.querySelectorAll(".mio-trait").forEach((sb) => {
      const si = Number(sb.dataset.si), s = d.slots[si]; if (!s) return;
      const nm = sb.querySelector(".ch-s-name"), rq = sb.querySelector(".ch-s-req");
      if (nm) nm.addEventListener("input", () => { s.name = nm.value; });
      if (rq) rq.addEventListener("change", () => { s.required = rq.checked; });
    });
    // base-stat inputs
    ov.querySelectorAll("#chBaseRows .me-stat-row").forEach((row) => {
      const i = Number(row.dataset.i); if (!d.base[i]) return;
      const bk = row.querySelector(".ch-b-k"), bv = row.querySelector(".ch-b-v");
      if (bk) bk.addEventListener("input", () => { d.base[i].k = bk.value; });
      if (bv) bv.addEventListener("input", () => { d.base[i].v = bv.value; });
    });
    // structural buttons
    $("chAddSlot").addEventListener("click", () => { d.slots.push({ name: "", required: false, cats: [] }); renderChassisEditor(); });
    ov.querySelectorAll(".ch-slot-x").forEach((x) => x.addEventListener("click", () => { d.slots.splice(Number(x.dataset.si), 1); if (!d.slots.length) d.slots.push({ name: "", required: true, cats: [] }); renderChassisEditor(); }));
    ov.querySelectorAll(".ch-cat-add-btn").forEach((b) => b.addEventListener("click", () => { const si = Number(b.dataset.si); const inp = ov.querySelector(`.ch-cat-add[data-si="${si}"]`); const v = (inp.value || "").trim(); if (v) { (d.slots[si].cats = d.slots[si].cats || []).push(v); renderChassisEditor(); } }));
    ov.querySelectorAll(".ch-cat-x").forEach((x) => x.addEventListener("click", () => { d.slots[Number(x.dataset.si)].cats.splice(Number(x.dataset.ci), 1); renderChassisEditor(); }));
    $("chAddBase").addEventListener("click", () => { d.base.push({ k: "", v: "" }); renderChassisEditor(); });
    ov.querySelectorAll(".ch-b-x").forEach((x) => x.addEventListener("click", () => { d.base.splice(Number(x.dataset.i), 1); renderChassisEditor(); }));
    ov.querySelector(".me-save").addEventListener("click", chassisSave);
  }
  async function chassisSave() {
    const inline = S.chassisHost === "inline";
    const ov = chassisHostEl(), d = S.chassisDraft, st = $("chStatus"), btn = ov.querySelector(".me-save");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test((d.id || "").trim())) { st.style.color = "#d29922"; st.textContent = "The weapon id must start with a letter/underscore, no spaces."; return; }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test((d.type || "").trim())) { st.style.color = "#d29922"; st.textContent = "Pick what it does."; return; }
    const slots = [];
    for (const s of d.slots) {
      const name = (s.name || "").trim();
      const cats = (s.cats || []).map((c) => (c || "").trim()).filter((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c));
      if (!name && !cats.length) continue; // a wholly-empty row is just an unused slot — ignore it
      // A HALF-configured slot (a name but no category, or a category but no name) used to be silently DROPPED,
      // losing the user's config with a green success. Refuse and say which one to finish. #chassis-partial-slot
      if (!name || !cats.length) { st.style.color = "#d29922"; st.textContent = `Finish the slot “${name || "(unnamed)"}” — it needs both a name and at least one module category (or remove it).`; return; }
      slots.push({ name, required: !!s.required, categories: cats });
    }
    if (!slots.length) { st.style.color = "#d29922"; st.textContent = "Add at least one slot with a name and ≥1 module category."; return; }
    const baseStats = {}; for (const r of d.base) { const k = (r.k || "").trim(); if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && r.v !== "" && !isNaN(Number(r.v))) baseStats[k] = Number(r.v); }
    btn.disabled = true; st.style.color = "#6e7681"; st.textContent = "Saving…";
    try {
      const r = await fetch("/api/equipment/chassis-new", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // picture has ALWAYS been accepted server-side; the client just never sent it, so every Nova-made
        // chassis shipped art-less. The creator asks for it, so pass it through. #new-weapon
        body: JSON.stringify({ modPath: modPath(), id: d.id.trim(), name: d.name.trim() || d.id.trim(), domain: d.domain, type: d.type.trim(), picture: (d.picture || "").trim(), priority: chassisPriority(d.priority), year: Number(d.year) || 1936, slots, baseStats,
          extraTypes: d.domain === "armor" ? (d.extraTypes || []) : [], allowedTypes: d.domain === "plane" ? (d.allowedTypes || []) : [] }),
      }).then((x) => x.json());
      if (r && r.ok) {
        st.style.color = "#3fb950"; st.textContent = `✓ Created “${r.id}” (${r.slots} slot${r.slots === 1 ? "" : "s"}).`;
        // A chassis missing a slot the game's modules target is unbuildable, and nothing else would say so.
        // showNovaInfoModal, not nbAlert: nbAlert lives in ai-field-assist.js, which this page does not load,
        // so calling it here would throw into a catch and the warning would be lost — a message nobody sees.
        if (r.slotWarning && typeof window.showNovaInfoModal === "function") {
          window.showNovaInfoModal("This chassis is missing a slot", `<p>${esc(r.slotWarning)}</p>`);
        }
        // INLINE: the creator REPLACED the designer, so there is no in-progress variant to protect and nothing
        // to close — rebuild the designer and land the user on the weapon they just made, ready to fill its
        // slots. That hand-off is the whole point of the merge: create it here, then design it here. #new-weapon
        if (inline) {
          const madeId = r.id, madeDomain = d.domain === "armor" ? "tanks" : d.domain === "ship" ? "ships" : "planes";
          setTimeout(() => {
            S.chassisHost = "";
            Promise.resolve(loadDesigner()).then(() => {
              const ds = $("dsgDesigner"), cs = $("dsgChassis");
              if (ds && [...ds.options].some((o) => o.value === madeDomain)) { ds.value = madeDomain; ds.dispatchEvent(new Event("change", { bubbles: true })); }
              if (cs && [...cs.options].some((o) => o.value === madeId)) { cs.value = madeId; cs.dispatchEvent(new Event("change", { bubbles: true })); }
            });
          }, 700);
          return;
        }
        // The ＋New-chassis button lives OUTSIDE #dsgBody, so it is reachable MID-DESIGN. loadDesigner() (needed to
        // surface the chassis we just saved) rebuilds #dsgBody and runs onChassisChange() → S.equip.pick = {},
        // which silently threw away an in-progress variant — module picks AND the typed name/icon — with none of
        // the confirm() guards the equivalent paths have (#variant-dirty never-lose-work contract). A confirm is
        // the wrong shape here (the server write already succeeded and the reload is mandatory), so snapshot the
        // in-progress design and restore it after the rebuild instead. #chassis-reload-preserve
        const hadWork = !!(S.equip && ((S.equip.pick && Object.keys(S.equip.pick).length) || S.equip.variantDirty));
        const snap = hadWork ? {
          pick: Object.assign({}, S.equip.pick || {}), dirty: !!S.equip.variantDirty, editing: S.equip.editingVariant,
          f: ["dsgDesigner", "dsgChassis", "dsgTier", "dsgTag", "dsgName", "dsgIcon"].reduce((o, id) => { const e = $(id); if (e) o[id] = e.value; return o; }, {}),
        } : null;
        Promise.resolve(loadDesigner()).then(() => {
          if (!snap) return;
          // Re-driving the selects fires their change listeners, which carry the #variant-dirty discard-confirm.
          // These are SYNTHETIC restore events, not the user switching away, so suppress the flag across them —
          // otherwise the restore prompts "Switching chassis discards the variant…" and answering Cancel reverts
          // the select while we still restore the picks, leaving S.equip.pick bound to the WRONG chassis.
          // snap.dirty is put back immediately after. #chassis-reload-preserve
          S.equip.variantDirty = false;
          // restore the selects first (they drive the module grid), then the picks the rebuild cleared
          for (const id of ["dsgDesigner", "dsgChassis", "dsgTier", "dsgTag"]) { const e = $(id); if (e && snap.f[id] != null && [...e.options].some((o) => o.value === snap.f[id]) && e.value !== snap.f[id]) { e.value = snap.f[id]; e.dispatchEvent(new Event("change", { bubbles: true })); } }
          // restore AFTER those dispatches — onChassisChange resets S.equip.pick, so it must be put back last
          S.equip.pick = snap.pick; S.equip.variantDirty = snap.dirty; S.equip.editingVariant = snap.editing;
          for (const id of ["dsgName", "dsgIcon"]) { const e = $(id); if (e && snap.f[id] != null) e.value = snap.f[id]; }
          try { const cc = S.equip.chassisById[$("dsgChassis") ? $("dsgChassis").value : ""]; if (cc) renderBlueprint(cc); } catch (_) {}
          try { updateEditBanner(); } catch (_) {}
        });
        scheduleDsgClose(ov, 1100);
      }
      else { st.style.color = "#f85149"; st.textContent = (r && r.error) || "Save failed."; btn.disabled = false; }
    } catch (e) { st.style.color = "#f85149"; st.textContent = "Save failed: " + (e.message || e); btn.disabled = false; }
  }
  // Equipment-stat labels + which stat icon to reuse (from SICON). Unknown keys show the raw key.
  const EQ_STAT = {
    // Offense
    soft_attack: ["Soft attack", "soft"], hard_attack: ["Hard attack", "hard"], ap_attack: ["Piercing", "pierce"],
    air_attack: ["Air attack (anti-air)", "air"], breakthrough: ["Breakthrough", "bt"],
    air_bombing: ["Bombing", "hard"], air_ground_attack: ["Ground attack", "soft"],
    naval_strike_attack: ["Naval strike", "hard"], naval_strike_targetting: ["Naval strike targeting", "recon"],
    lg_attack: ["Light gun", "soft"], hg_attack: ["Heavy gun", "hard"], torpedo_attack: ["Torpedoes", "hard"],
    sub_attack: ["Sub attack", "hard"], anti_air_attack: ["Anti-air", "air"], shore_bombardment: ["Shore bombardment", "hard"],
    // Defense & survivability
    defense: ["Defense", "def"], armor_value: ["Armor", "armor"], hardness: ["Hardness", "armor"],
    max_strength: ["HP", "hp"], air_defence: ["Air defence", "def"], reliability: ["Reliability", null],
    surface_visibility: ["Visibility", null], sub_visibility: ["Sub visibility", null],
    // Performance
    maximum_speed: ["Speed", "speed"], naval_speed: ["Speed", "speed"], thrust: ["Thrust", "speed"],
    air_range: ["Range", "recon"], naval_range: ["Naval range", "recon"], maximum_range: ["Max range", "recon"],
    air_agility: ["Agility", "speed"], air_superiority: ["Air superiority", "air"],
    surface_detection: ["Surface detection", "recon"], sub_detection: ["Sub detection", "recon"],
    entrenchment: ["Entrenchment", "def"], recon: ["Recon", "recon"], weight: ["Weight", null],
    // Cost & logistics
    build_cost_ic: ["Build cost", null], fuel_consumption: ["Fuel use", null], supply_consumption: ["Supply use", null],
    lend_lease_cost: ["Convoy space", null], manpower: ["Crew", "mp"],
  };
  // ── Generic full-stat display: EVERY stat any weapon declares, known or exotic. #arsenal ──
  // Effective stats = archetype's fields overridden by the tier's own (that's how the game inherits).
  // Known keys get friendly labels + icons from EQ_STAT; keys Nova has never seen are prettified raw.
  function prettyStatKey(k) { return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
  function effectiveStatsAll(eq) {
    const arch = eq && eq.archetype ? S.equip.all.find((e) => e.id === eq.archetype) : null;
    return Object.assign({}, (arch && arch.statsAll) || {}, (eq && eq.statsAll) || {});
  }
  function effectiveMissions(eq) {
    if (eq && (eq.missions || []).length) return eq.missions;
    const arch = eq && eq.archetype ? S.equip.all.find((e) => e.id === eq.archetype) : null;
    return (arch && arch.missions) || [];
  }
  function statsAllFields(eq, ownOnly) {
    // ownOnly = the EDITABLE grid: show only the equipment's OWN declared scalars (eq.statsAll), never the
    // archetype-inherited ones — editing must not copy an inherited stat onto a tier. Read-only display
    // keeps the effective (own + inherited) set so nothing looks missing.
    const sa = ownOnly ? ((eq && eq.statsAll) || {}) : effectiveStatsAll(eq);
    const ordered = Object.keys(EQ_STAT).filter((k) => k in sa);
    const rest = Object.keys(sa).filter((k) => !(k in EQ_STAT)).sort();
    return [...ordered, ...rest].map((k) => {
      const meta = EQ_STAT[k];
      return { key: k, label: meta ? meta[0] : prettyStatKey(k), ic: meta ? meta[1] : null, value: sa[k] };
    });
  }
  function roleChips(eq) {
    const ms = effectiveMissions(eq);
    const arch = eq && eq.archetype ? S.equip.all.find((e) => e.id === eq.archetype) : null;
    const oneUse = !!(eq && (eq.oneUseOnly || (arch && arch.oneUseOnly)));
    let h = "";
    if (ms.length) h += `<div class="eq-enabled" style="color:#8b949e;">Role: ${ms.map((m) => `<span class="eq-chip">${esc(AIR_MISSION_LABEL[m] || m.replace(/_/g, " "))}</span>`).join(" ")}${ms.includes("sam_mission") ? ' <span style="color:#6e7681;">(surface-to-air missile — shoots down planes)</span>' : ""}</div>`;
    if (oneUse) h += `<div class="eq-enabled" style="color:#d29922;">Single-use: each one is expended when fired (missile-style).</div>`;
    return h;
  }
  // Is this equipment an aircraft (the only thing that has allow_mission_type roles)?
  function isAirEquip(eq) {
    if (!eq) return false;
    if (eqDomain(eq) === "planes") return true;
    const at = S.equip.airTypes || [];
    if (at.includes(eq.type)) return true;
    const arch = eq.archetype ? S.equip.all.find((e) => e.id === eq.archetype) : null;
    if (arch && (eqDomain(arch) === "planes" || at.includes(arch.type))) return true;
    return (effectiveMissions(eq) || []).length > 0;
  }
  // Roles live on the ARCHETYPE (a tier/variant inherits them, and a create_equipment_variant can't carry
  // allow_mission_type), so edits always target the archetype.
  function airRoleTarget(eq) {
    if (!eq) return null;
    if (eq.isArchetype) return eq;
    if (eq.archetype) { const a = S.equip.all.find((e) => e.id === eq.archetype); if (a) return a; }
    return eq;
  }
  // For an aircraft the mod owns, an EDITABLE role editor; otherwise the read-only chips. #plane-roles-edit
  function roleBlock(eq) {
    if (!isAirEquip(eq)) return roleChips(eq);
    const target = airRoleTarget(eq);
    if (!target || !target.isMod) return roleChips(eq); // base-game aircraft stay read-only
    const cur = new Set(effectiveMissions(target));
    const missions = S.equip.airMissions || [];
    const note = target.id !== eq.id
      ? `<div class="role-note">Roles live on the airframe <b>${esc(target.id)}</b> — saving here applies to all its tiers.</div>` : "";
    return `<div class="role-editor" data-arch="${esc(target.id)}">`
      + `<div class="comp-label" style="margin-top:12px;">Roles this plane can fly <span class="sb-help" data-help="plane-roles" title="What are roles?">?</span></div>`
      + note
      + `<div class="role-grid">` + missions.map((m) =>
          `<label class="role-opt"><input type="checkbox" class="role-ck" value="${esc(m)}" ${cur.has(m) ? "checked" : ""} style="accent-color:#1f6feb;" /> ${esc(AIR_MISSION_LABEL[m] || m.replace(/_/g, " "))}</label>`).join("")
      + `</div>`
      + `<div class="role-actions"><button class="army-btn-sm role-save" type="button">💾 Save roles</button> <span class="role-status"></span></div>`
      + `</div>`;
  }
  // One document-level click handler serves every role editor rendered by roleBlock(), wherever it lives
  // (the Equipment editor OR the modular designer's blueprint). Attached once.
  function ensureRoleDelegation() {
    if (document._novaRoleWired) return;
    document._novaRoleWired = true;
    document.addEventListener("click", handleRoleSave);
  }
  // Delegated Save handler for any role editor rendered by roleBlock(). Persists the archetype's roles in
  // place via /api/equipment/archetype-missions. #plane-roles-edit
  async function handleRoleSave(e) {
    const btn = e.target.closest(".role-save"); if (!btn) return;
    const box = btn.closest(".role-editor"); if (!box) return;
    const status = box.querySelector(".role-status");
    const archId = box.getAttribute("data-arch");
    const picked = Array.from(box.querySelectorAll(".role-ck:checked")).map((c) => c.value);
    btn.disabled = true; if (status) { status.style.color = "#8b949e"; status.textContent = "Saving…"; }
    try {
      const r = await fetch("/api/equipment/archetype-missions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: modPath(), id: archId, missions: picked }),
      }).then((x) => x.json());
      if (r && r.ok) {
        if (status) { status.style.color = "#3fb950"; status.textContent = "✓ Saved to the mod."; }
        const arch = S.equip.all.find((eq) => eq.id === archId); if (arch) arch.missions = (r.missions || []).slice();
      } else if (status) { status.style.color = "#f85149"; status.textContent = (r && r.error) || "Save failed."; }
    } catch (err) { if (status) { status.style.color = "#f85149"; status.textContent = err.message; } }
    finally { btn.disabled = false; }
  }
  function statsAllGrid(eq, skipKeys, editable) {
    const skip = skipKeys || null;
    const fields = statsAllFields(eq, editable).filter((f) => !(skip && skip.has(f.key)));
    if (!fields.length) return "";
    return '<div class="eq-editor-fields">' + fields.map((f) =>
      editable
        ? `<label>${f.ic ? sIcon(f.ic, "#9fb0c0") : ""} ${esc(f.label)}<input id="eqsa_${esc(f.key)}" class="army-input" type="number" step="0.01" value="${esc(numOrEmpty(f.value))}" /></label>`
        : `<label>${f.ic ? sIcon(f.ic, "#9fb0c0") : ""} ${esc(f.label)}<input class="army-input" type="text" value="${esc(f.value)}" disabled /></label>`).join("") + "</div>";
  }
  // Read-only view of a COUNTRY VARIANT ("AH-1 Cobra"): what it is, its modules/upgrades, base stats.
  function renderVariantView(v) {
    const el = $("eqEditor"); if (!el) return;
    if (!v) { renderEquipEditor(null); return; }
    const base = S.equip.all.find((e) => e.id === v.type);
    const kind = v.modules ? "modular design" : (v.upgrades && Object.keys(v.upgrades).length ? "upgraded variant" : "named variant");
    const cn = S.equip.varCountries.find((c) => c.tag === v.tag);
    const head = `<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">`
      + variantIcon(v, true)
      + `<h3 style="margin:0; overflow-wrap:anywhere; min-width:0;">${escLoc(v.name)}</h3>`
      + `<span class="eq-tag-chip" title="${escLoc(cn && cn.name ? cn.name : v.tag)}">${esc(v.tag)}${cn && cn.name ? " · " + escLoc(cn.name) : ""}</span>`
      + `<span class="eq-badge" style="background:rgba(88,166,255,0.14); color:#58a6ff;">${kind}</span>`
      + (v.novaManaged ? '<span class="eq-badge mod">yours</span>' : "")
      + (v.source === "base" ? '<span class="eq-badge base">base game</span>' : (v.source === "dep" ? '<span class="eq-badge base">dependency</span>' : ""))
      + (v.obsolete ? '<span class="eq-badge" style="background:rgba(139,148,158,0.15); color:#8b949e;" title="The country keeps it but won\'t produce or request it">outdated</span>' : "")
      + `</div>`;
    const baseRow = `<div class="eq-enabled">Variant of ${base
      ? `<a href="#" id="vvGoBase" style="color:#58a6ff; font-family:monospace;">${esc(v.type)}</a>`
      : `<span style="font-family:monospace;">${esc(v.type)}</span>`}${base && base.name ? ` <span style="color:#6e7681;">(${escLoc(base.name)})</span>` : ""}`
      + (v.parentVersion != null ? ` <span style="color:#6e7681;">· builds on version ${v.parentVersion}</span>` : "") + `</div>`;
    // Editable in place when it lives in the ACTIVE mod (never a dependency / base game / Nova region —
    // Nova-region ones are managed by the Designer's "Designed variants" list below). #arsenal-edit
    const canEdit = !!v.editable && !v.novaManaged;
    let body = "";
    if (canEdit) {
      // 3 clean grid cells (Name | Icon | outdated) — the old inline icon hint wrapped to three lines
      // and the checkbox floated ON the input. Hint lives in the tooltip + placeholder now. #overlap-fix
      body += `<div class="comp-label">Edit this variant</div>`
        + `<div class="eq-editor-fields" style="grid-template-columns: minmax(180px, 1fr) minmax(220px, 1.4fr) auto; align-items: end;">`
        + `<label>Name<input id="vvName" class="army-input" type="text" value="${esc(v.name)}" /></label>`
        + `<label title="Optional — a gfx sprite key or a .dds picture path from the mod">Icon (optional)<span style="display:flex; gap:5px; align-items:center;"><input id="vvIcon" class="army-input" type="text" value="${esc(v.icon || "")}" placeholder="gfx key or .dds path" style="flex:1; min-width:0;" /><button type="button" id="vvIconBrowse" class="army-btn-sm" title="Browse in-game equipment icons">🖼 Browse</button></span></label>`
        + `<label style="flex-direction:row; align-items:center; gap:6px; justify-content:flex-start; padding-bottom:8px; white-space:nowrap;"><input id="vvObsolete" type="checkbox" ${v.obsolete ? "checked" : ""} style="accent-color:#1f6feb;" /> outdated <span class="sb-help" data-help="outdated" title="What does outdated mean?">?</span></label>`
        + `</div>`;
    }
    // The big vehicle picture — paired BESIDE the modules (or the upgrades) so it sits next to content and
    // stretches to match, like the in-game designer; solo+centered only when the variant has neither. #variant-photo
    // Pass the base ARCHETYPE (medium_tank_chassis, not the tier) + owner tag so the company panel below the
    // photo can look up who designs it. #mio-design
    const arch = (base && base.archetype) || v.type;
    const photo = variantPhoto(v, arch, v.tag);
    const hasModules = !!(v.modules && Object.keys(v.modules).length);
    const hasUpgrades = !!(v.upgrades && Object.keys(v.upgrades).length);
    const upLabel = `<div class="comp-label">Upgrades${canEdit ? " (levels)" : ""} <span class="sb-help" data-help="upgrades" title="What are upgrade levels?">?</span></div>`;
    const upFields = hasUpgrades ? Object.keys(v.upgrades).map((u) =>
      `<label>${esc(u.replace(/_/g, " "))}<input ${canEdit ? `id="vvUp_${esc(u)}" type="number" min="0" step="1"` : 'type="text" disabled'} class="army-input" value="${esc(v.upgrades[u])}" style="width:110px;" /></label>`).join("") : "";
    if (hasModules) {
      const slots = Object.keys(v.modules).map((slot) =>
        `<label>${esc(slot.replace(/_/g, " "))}<span style="display:flex; align-items:center; gap:6px;">${moduleIcon(v.modules[slot])}<input class="army-input" type="text" value="${esc(v.modules[slot])}" disabled style="flex:1; min-width:0;" /></span></label>`).join("");
      body += `<div class="comp-label">Modules</div><div class="vv-modules-wrap"><div class="eq-editor-fields vv-modules-grid">${slots}</div>${photo}</div>`;
      if (hasUpgrades) body += upLabel + `<div class="eq-editor-fields">${upFields}</div>`;
    } else if (hasUpgrades) {
      // No modules but HAS upgrades (common for named aircraft/ship variants): pair the photo beside the
      // upgrades — same shape as the modules branch, so it matches height with no empty gutter.
      body += upLabel + `<div class="vv-modules-wrap"><div class="eq-editor-fields vv-modules-grid">${upFields}</div>${photo}</div>`;
    } else {
      body += `<div class="vv-photo-solo">${photo}</div>`;
    }
    if (canEdit) {
      // A modular variant whose chassis the Designer knows can be REBUILT there: modules pre-loaded,
      // Save rewrites the ORIGINAL block in place. #designer-bridge (reuse `base` from the top of this fn)
      const rootId = base ? (base.isArchetype ? base.id : (base.archetype || base.id)) : "";
      const rebuildable = !!(v.modules && rootId && S.equip.chassisById[rootId]);
      body += `<div style="display:flex; align-items:center; gap:10px; margin-top:4px;">`
        + `<button id="vvSaveBtn" class="army-btn" type="button">💾 Save changes</button>`
        + (rebuildable ? `<button id="vvRebuildBtn" class="army-btn-sm" type="button" title="Open this design in the Designer with its modules loaded — Save updates it in place">🔧 Rebuild in the Designer ↓</button>` : "")
        + `<button id="vvDelBtn" class="army-btn-danger" type="button">🗑 Delete variant</button>`
        + `<span id="vvStatus" style="font-size:12px;"></span></div>`;
    } else if (v.novaManaged) {
      body += `<div class="eq-readonly-note" style="margin-top:10px;">This is one of <b>your designed variants</b> — manage it in the Designer's “Designed variants” list below.</div>`;
    } else {
      body += `<div class="eq-readonly-note" style="margin-top:10px;">This variant comes from ${v.source === "base" ? "the <b>base game</b>" : "a <b>dependency mod</b>"}, so Nova keeps it read-only here.</div>`;
    }
    const statPart = base
      ? `<div class="comp-label" style="margin-top:14px;">Base stats — ${esc(v.type)}${v.modules ? " (its modules add on top)" : (v.upgrades && Object.keys(v.upgrades).length ? " (its upgrades add on top)" : "")}</div>` + roleChips(base) + (statsAllGrid(base) || '<div class="army-empty">The base equipment declares no numeric stats of its own.</div>')
      : `<div class="eq-readonly-note" style="margin-top:12px;">Base equipment <b style="font-family:monospace;">${esc(v.type)}</b> wasn't found in this mod's equipment scan, so its stats can't be shown.</div>`;
    el.innerHTML = head + baseRow + body + statPart;
    const go = $("vvGoBase");
    if (go) go.addEventListener("click", (e) => { e.preventDefault(); selectEquip(v.type); });
    if (canEdit) {
      $("vvSaveBtn").addEventListener("click", () => saveVariantEdits(v));
      $("vvDelBtn").addEventListener("click", () => deleteVariantBlock(v));
      const ib = $("vvIconBrowse"); if (ib) ib.addEventListener("click", () => openIconPicker("vvIcon", base && base.designer, () => {})); // same picker the Designer uses
      const rb = $("vvRebuildBtn");
      if (rb) rb.addEventListener("click", () => openVariantInDesigner(v));
    }
    mountModuleIcons(el); mountTechIcons(el); mountEqIcons(el); mountVariantIcons(el);
    fillVariantCompanies(el);
  }
  // Show the COMPANY that designs this equipment, below its picture (same spot as the in-game designer). Icon
  // + name + a couple of headline buffs; hovering the icon pops the full trait list. Best-effort and honest:
  // if no manufacturer is tied to this equipment type in the mod, it says so rather than inventing one. #mio-design
  const MIO_STAT_LABEL = { armor_value: "armour", soft_attack: "soft atk", hard_attack: "hard atk", ap_attack: "AP", defense: "defense", breakthrough: "breakthrough", reliability: "reliability", build_cost_ic: "build cost", maximum_speed: "speed", air_attack: "air atk", air_defence: "air def", air_range: "range", naval_speed: "speed", max_strength: "HP" };
  const fmtBonus = (k, val) => { const pct = Math.round(val * 100); const lbl = MIO_STAT_LABEL[k] || k.replace(/_/g, " "); return `${pct > 0 ? "+" : ""}${pct}% ${lbl}`; };
  async function fillVariantCompanies(scope) {
    const box = (scope || document).querySelector(".vv-companies"); if (!box) return;
    const arch = box.dataset.arch, tag = box.dataset.tag || "", mio = box.dataset.mio || "";
    if (!arch && !mio) return;
    let d; try { d = await fetch(`/api/mio/for-equipment?modPath=${encodeURIComponent(modPath())}&archetype=${encodeURIComponent(arch)}&tag=${encodeURIComponent(tag)}&mio=${encodeURIComponent(mio)}`).then((r) => r.json()); } catch (_) { return; }
    if (!box.isConnected) return; // view changed while we fetched
    const cos = (d && d.companies) || [];
    // EXACTLY ONE company — HOI4 never ties more than one organization to a variant (a production line takes a
    // single MIO). Priority: (A) the variant's OWN design_team = mio:X (the game's authoritative designer),
    // else (B) the single best owner-country manufacturer for this type (companies[0] — the endpoint already
    // sorted owner-first, direct-declaration, most-specialized, id). Never a list. #mio-single-designer
    const pick = (d && d.designer) || cos.find((c) => c.tag && c.tag === tag) || null;
    if (!pick) {
      const genN = cos.length;
      box.innerHTML = `<div class="vv-co-label">Designed by <span class="sb-help" data-help="mio-design" title="How companies buff a design">?</span></div>`
        + `<div class="vv-co-none">No ${esc(tag || "national")} company designs this type${genN ? ` — ${genN} manufacturer${genN === 1 ? "" : "s"} can build it` : " in this mod"}.</div>`;
      return;
    }
    const show = [pick];
    const chip = (c) => {
      const top = Object.entries(c.bonuses || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2).map(([k, v]) => fmtBonus(k, v));
      const traitHtml = (c.traits || []).map((t) => `<div class="vv-co-trait"><b>${escLoc(t.name)}</b>${Object.entries(t.bonuses || {}).map(([k, v]) => `<span>${esc(fmtBonus(k, v))}</span>`).join("")}</div>`).join("") || "<div class='vv-co-trait'>Bonuses vary by the trait path you pick.</div>";
      return `<div class="vv-co" data-tip>`
        + `<span class="vv-co-ico" data-cands="${esc((c.icon || "") + "|GFX_idea_" + c.id)}"></span>`
        + `<span class="vv-co-body"><span class="vv-co-name">${escLoc(c.name)}${c.tag ? ` <span class="vv-co-tag">${esc(c.tag)}</span>` : ""}</span>`
        + `<span class="vv-co-buffs">${top.map(esc).join(" · ") || "designer bonuses"}</span></span>`
        + `<div class="vv-co-pop"><div class="vv-co-pop-h">${escLoc(c.name)} — full bonuses</div>${traitHtml}</div></div>`;
    };
    // Exactly one company is rendered (the authoritative design_team, or the single best owner manufacturer) —
    // the game never lets several organizations design one weapon, so a list would show state that can't exist.
    box.innerHTML = `<div class="vv-co-label">Designed by <span class="sb-help" data-help="mio-design" title="How companies buff a design">?</span></div>`
      + show.map(chip).join("");
    // resolve the company icons the same way equipment icons resolve (idea sprite → picture → "?")
    box.querySelectorAll(".vv-co-ico").forEach((el2) => {
      const cands = (el2.dataset.cands || "").split("|").filter(Boolean);
      if (!cands.length) return;
      const img = new Image();
      let i = 0;
      const tryNext = () => { if (i >= cands.length) return; img.src = "/api/icon-image?key=" + encodeURIComponent(cands[i++]) + "&modPath=" + encodeURIComponent(modPath()); };
      img.onload = () => { el2.style.backgroundImage = `url("${img.src}")`; };
      img.onerror = () => tryNext();
      tryNext();
    });
  }
  // Load a design's every field back into the Designer. Split out of openVariantInDesigner so the Designer's
  // own "Designed variants" list can reuse it WITHOUT claiming a block to rewrite: a Nova-managed design is
  // upserted by NAME (the save endpoint filters the old one out and pushes the new), while the arsenal's
  // Rebuild targets an arbitrary create_equipment_variant by file + blockIdx. Same prefill, different save
  // route — so the flag stays with the caller. #edit-variant-prefill
  // Returns false when the chassis behind the design isn't loaded, or the user declined to discard.
  function prefillDesignerFrom(v) {
    const base = S.equip.all.find((e) => e.id === v.type);
    const rootId = base ? (base.isArchetype ? base.id : (base.archetype || base.id)) : "";
    const c = S.equip.chassisById[rootId];
    if (!c) return false;
    if (S.equip.variantDirty && !confirm("Discard the variant you're currently building in the Designer?")) return false;
    const dsg = $("dsgDesigner");
    if (dsg && c.designer && Array.prototype.some.call(dsg.options, (o) => o.value === c.designer)) { dsg.value = c.designer; onDesignerChange(); }
    const chSel = $("dsgChassis");
    if (chSel && Array.prototype.some.call(chSel.options, (o) => o.value === rootId)) { chSel.value = rootId; onChassisChange(); }
    const tSel = $("dsgTier");
    if (tSel && Array.prototype.some.call(tSel.options, (o) => o.value === v.type)) tSel.value = v.type;
    S.equip.pick = Object.assign({}, v.modules || {});
    renderBlueprint(c);
    if ($("dsgName")) $("dsgName").value = v.name;
    if ($("dsgIcon")) { $("dsgIcon").value = v.icon || ""; try { updateDsgIconPreview(); } catch (_) {} }
    if ($("dsgObsolete")) $("dsgObsolete").checked = !!v.obsolete;
    const tagSel = $("dsgTag");
    if (tagSel && Array.prototype.some.call(tagSel.options, (o) => o.value === v.tag)) { tagSel.value = v.tag; loadDesignerVariants(); }
    if (dsg) dsg.dataset.prev = dsg.value;
    if (chSel) chSel.dataset.prev = chSel.value;
    S.equip.variantDirty = false; // freshly loaded = nothing typed yet
    return true;
  }
  // Open an existing modular variant in the Designer, modules pre-loaded; Save routes back to its block.
  function openVariantInDesigner(v) {
    if (!prefillDesignerFrom(v)) return;
    S.equip.editingVariant = { file: v.file, blockIdx: v.blockIdx, expect: { name: v.name, type: v.type }, tag: v.tag, name: v.name };
    updateEditBanner();
    const body = $("dsgBody"); if (body) body.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // "Edit" on the Designer's own list. The design is Nova-managed, so Save upserts it BY NAME — no block to
  // claim, and claiming one would send the save down the arsenal's file+blockIdx route instead.
  // #edit-variant-prefill
  function editNovaVariantInDesigner(v, tag) {
    const shaped = {
      type: v.chassisType,
      // The stored form is a LIST of {slot, module}; the Designer picks by slot.
      modules: Object.fromEntries((Array.isArray(v.modules) ? v.modules : []).map((m) => [m.slot, m.module])),
      name: v.name, icon: v.icon || "", obsolete: !!v.obsolete, tag,
    };
    if (!prefillDesignerFrom(shaped)) return;
    S.equip.editingVariant = null; // a name-upsert, not a block rewrite
    updateEditBanner();
    const st = $("dsgStatus");
    if (st) { st.style.color = "#58a6ff"; st.textContent = `Loaded “${v.name}” — change what you like and 💾 Save under the same name to replace it.`; }
    const body = $("dsgBody"); if (body) body.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // Clear the Designer for a design that has nothing to do with the last one. Without this the form keeps
  // whatever was last built or loaded, so "make another" silently starts from someone else's design.
  // #edit-variant-prefill
  function startBrandNewVariant() {
    if (S.equip.variantDirty && !confirm("Discard the variant you're currently building in the Designer?")) return;
    S.equip.pick = {};
    S.equip.editingVariant = null;
    S.equip.variantDirty = false;
    for (const [id, val] of [["dsgName", ""], ["dsgIcon", ""]]) { const e = $(id); if (e) e.value = val; }
    const ob = $("dsgObsolete"); if (ob) ob.checked = false;
    try { updateDsgIconPreview(); } catch (_) {}
    updateEditBanner();
    onDesignerChange(); // re-derives chassis/tier lists and repaints an empty blueprint
    const st = $("dsgStatus");
    if (st) { st.style.color = "#8b949e"; st.textContent = "Starting a brand-new design."; }
    const body = $("dsgBody"); if (body) body.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function updateEditBanner() {
    const el = $("dsgEditBanner"); if (!el) return;
    const ev = S.equip.editingVariant;
    el.style.display = ev ? "" : "none";
    el.innerHTML = ev
      ? `🔁 Rebuilding <b>${escLoc(ev.name)}</b> (${esc(ev.tag)}) — 💾 Save updates the original variant in place. <button id="dsgStopEdit" class="army-btn-sm" type="button" style="margin-left:8px;">✕ Stop editing</button>`
      : "";
    const btn = $("dsgSaveBtn");
    if (btn) btn.textContent = ev ? "💾 Save changes to variant" : "💾 Save variant";
    const stop = $("dsgStopEdit");
    if (stop) stop.addEventListener("click", () => {
      if (S.equip.variantDirty && !confirm("Stop editing and discard the changes you made here?")) return;
      S.equip.editingVariant = null; S.equip.variantDirty = false; updateEditBanner(); onDesignerChange();
    });
  }
  // "＋ named variant" — ANY concrete equipment (rifles, trains, missiles…) can get a country-specific
  // NAME with one click: create_equipment_variant { name type }, has_dlc-wrapped when the base needs it.
  function namedVariantCreatorHtml(eq) {
    if (!eq || eq.isArchetype || eq.isChassis) return ""; // chassis variants need modules — that's the Designer's job
    // Explicit 3-column grid (country | name | button), inputs bottom-aligned — the auto-fill grid let
    // the button land ON the name input. #overlap-fix
    return `<div class="comp-label" style="margin-top:16px;">Give a country its own named version of this</div>`
      + `<div class="eq-editor-fields" style="grid-template-columns: minmax(190px, 1.2fr) minmax(170px, 1fr) auto; align-items: end;">`
      + `<label>Country<select id="nvTag" class="army-input"></select></label>`
      + `<label>Name<input id="nvName" class="army-input" type="text" placeholder="e.g. Karabin wz.98" /></label>`
      + `<button id="nvCreateBtn" class="army-btn-sm" type="button" style="height:34px; white-space:nowrap;">＋ Create named variant</button>`
      + `</div><div id="nvStatus" style="font-size:12px; margin:-6px 0 4px;"></div>`;
  }
  function wireNamedVariantCreator(eq) {
    const btn = $("nvCreateBtn"); if (!btn) return;
    if (window.NovaCountryPicker) NovaCountryPicker.populate($("nvTag"), { modPath: modPath(), all: true }).then(() => {
      const sel = $("nvTag"); if (sel && S.country && Array.prototype.some.call(sel.options, (o) => o.value === S.country)) sel.value = S.country;
    });
    btn.addEventListener("click", async () => {
      const st = $("nvStatus");
      const tag = ($("nvTag").value || "").trim().toUpperCase();
      const name = ($("nvName").value || "").trim();
      if (!tag) { if (st) { st.style.color = "#d29922"; st.textContent = "Pick a country."; } return; }
      if (!name) { if (st) { st.style.color = "#d29922"; st.textContent = "Type the name."; } return; }
      btn.disabled = true;
      try {
        const d = await fetch("/api/equipment/variant/create-simple", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: modPath(), tag, name, type: eq.id }) }).then((r) => r.json());
        if (!d || !d.ok) throw new Error(d && d.error ? d.error : "Create failed.");
        S.equip.editorDirty = false;
        await refreshVariants();
        const st2 = $("nvStatus");
        if (st2) { st2.style.color = "#3fb950"; st2.textContent = `✓ ${tag} now fields “${name}”${d.dlc ? ` (gated by ${d.dlc})` : ""}.`; }
      } catch (e) { const st2 = $("nvStatus"); if (st2) { st2.style.color = "#f85149"; st2.textContent = "✗ " + (e.message || e); } }
      finally { btn.disabled = false; }
    });
  }
  async function refreshVariants() {
    try {
      const dv = await fetch("/api/equipment/variants/all?modPath=" + encodeURIComponent(modPath())).then((r) => r.json());
      if (dv && dv.ok) {
        S.equip.variants = (dv.variants || []).map((v, i) => ({ ...v, _key: v.file + "|" + v.blockIdx + "|" + v.name + "|" + i }));
        S.equip.varCountries = dv.countries || [];
        rebuildStockpileVariantCache(dv.variants || dv.all || []); // same payload → keep the stockpile guard/datalist live after any create/rename/delete #sp-variant-stale
        const _sc0 = document.querySelector("#eqList .eq-list-scroll");
    S.equip._listTop = _sc0 ? _sc0.scrollTop : 0; // keep the user's place across the variant rebuild. #no-refresh
    populateVariantCountryFilter(); renderCountryChips(); renderEquipList();
      }
    } catch (_) {}
  }
  async function saveVariantEdits(v) {
    const st = $("vvStatus"), btn = $("vvSaveBtn");
    const set = {
      name: ($("vvName").value || "").trim(),
      icon: ($("vvIcon").value || "").trim(),
      obsolete: $("vvObsolete").checked,
    };
    if (!set.name) { if (st) { st.style.color = "#d29922"; st.textContent = "The variant needs a name."; } return; }
    if (v.upgrades) {
      set.upgrades = {};
      for (const k of Object.keys(v.upgrades)) { const inp = $("vvUp_" + k); if (inp) set.upgrades[k] = inp.value; }
    }
    const orig = btn.textContent; btn.disabled = true; btn.textContent = "Saving…";
    try {
      const d = await fetch("/api/equipment/variant/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: modPath(), file: v.file, blockIdx: v.blockIdx, expect: { name: v.name, type: v.type }, set }),
      }).then((r) => r.json());
      if (!d || !d.ok) throw new Error(d && d.error ? d.error : "Save failed.");
      S.equip.editorDirty = false;
      await refreshVariants();
      // Re-select the same block under its (possibly) new name so the view shows the saved state.
      const again = S.equip.variants.find((x) => x.file === v.file && x.blockIdx === v.blockIdx);
      if (again) {
        // _key embeds the variant NAME, so a RENAME invalidates the key renderEquipList just matched on and the
        // row silently loses its highlight. Re-mark it and bring it back into view. #rename-keeps-selection
        S.equip.selVar = again._key;
        const lst = $("eqList");
        if (lst) {
          lst.querySelectorAll(".eq-row.active, .eqv-row.active").forEach((r) => r.classList.remove("active"));
          const k = (window.CSS && CSS.escape) ? CSS.escape(again._key) : again._key;
          const row = lst.querySelector(`.eqv-row[data-vkey="${k}"]`);
          if (row) { row.classList.add("active"); row.scrollIntoView({ block: "nearest" }); }
        }
        renderVariantView(again);
        const st2 = $("vvStatus"); if (st2) { st2.style.color = "#3fb950"; st2.textContent = `✓ Saved → ${v.file}`; }
      }
    } catch (e) { if (st) { st.style.color = "#f85149"; st.textContent = "✗ " + (e.message || e); } btn.disabled = false; btn.textContent = orig; }
  }
  async function deleteVariantBlock(v) {
    if (!confirm(`Delete the variant "${v.name}" (${v.tag})? The country loses this design.`)) return; // destructive — always ask
    const st = $("vvStatus");
    try {
      const d = await fetch("/api/equipment/variant/remove-block", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: modPath(), file: v.file, blockIdx: v.blockIdx, expect: { name: v.name, type: v.type } }),
      }).then((r) => r.json());
      if (!d || !d.ok) throw new Error(d && d.error ? d.error : "Delete failed.");
      S.equip.editorDirty = false; S.equip.selVar = "";
      await refreshVariants();
      renderEquipEditor(null);
    } catch (e) { if (st) { st.style.color = "#f85149"; st.textContent = "✗ " + (e.message || e); } else alert("Delete failed: " + (e.message || e)); }
  }
  function renderModularDesigner() {
    const body = $("dsgBody"); if (!body) return;
    if (!S.equip.chassis.length) { body.innerHTML = '<div class="army-empty">No modular chassis found for this mod (tanks/ships/planes need chassis with module_slots — those come from the NSB / MtG / BbA content).</div>'; return; }
    const designers = [...new Set(S.equip.chassis.map((c) => c.designer).filter(Boolean))];
    body.innerHTML =
      `<div id="dsgEditBanner" class="eq-readonly-note" style="display:none; margin-bottom:12px;"></div>
      <div class="designer-fields" style="margin-bottom:10px;">
        <label>Type<select id="dsgDesigner" class="army-input">${designers.map((d) => `<option value="${d}">${DSG_LABEL[d] || d}</option>`).join("")}<option value="__new__">＋ New weapon…</option></select></label>
        <label>Chassis<select id="dsgChassis" class="army-input" style="min-width:180px;"></select></label>
        <label>Model (tier)<select id="dsgTier" class="army-input" style="min-width:150px;"></select></label>
        <label>Owner (country)<select id="dsgTag" class="army-input" style="min-width:200px; font-weight:600;"></select></label>
        <label>Variant name<input id="dsgName" class="army-input" type="text" placeholder="e.g. Panzer IV F2" style="width:170px;"></label>
      </div>
      <div id="dsgBlueprint"></div>
      <div class="designer-fields" style="margin-top:12px;">
        <label><span class="dz-lbl">No-DLC fallback <span class="sb-help" data-help="dsg-fallback" title="What is the no-DLC fallback?">?</span></span><select id="dsgFallback" class="army-input" style="min-width:190px;"></select></label>
        <label><span class="dz-lbl">Icon <span style="color:#6e7681;">(optional)</span> <span class="sb-help" data-help="dsg-icon" title="What is this icon?">?</span></span><span style="display:flex; gap:5px; align-items:center;"><input id="dsgIcon" class="army-input" type="text" placeholder="GFX_…" style="width:150px;"><button type="button" id="dsgIconBrowse" class="army-btn-sm" title="Browse in-game equipment icons">🖼 Browse</button><span id="dsgIconPrev" class="dsg-icon-prev"></span></span></label>
        <label style="flex-direction:row; align-items:center; gap:6px; margin-bottom:2px;"><input id="dsgObsolete" type="checkbox" style="accent-color:#1f6feb;"> outdated <span class="sb-help" data-help="outdated" title="What does outdated mean?">?</span></label>
        <button id="dsgNewBtn" class="army-btn-sm" type="button" style="margin-left:auto;" title="Clear the Designer and start a design from scratch">✨ Brand new</button>
        <button id="dsgSaveBtn" class="army-btn" type="button">💾 Save variant</button>
      </div>
      <div style="display:flex; align-items:center; gap:10px; margin-top:6px;"><span id="dsgStatus" style="font-size:12px;"></span></div>
      <p class="card-sub" id="dsgFallbackHint" style="margin:8px 0 0; font-size:11px;"></p>
      <p class="card-sub" style="margin:4px 0 0; font-size:11px;">Players WITHOUT the DLC get the <b>fallback</b> (a non-modular equipment) instead, so the mod never crashes them. It is written with the same <b>name</b> and <b>icon</b> as your design.</p>
      <div id="dsgVariants" style="margin-top:16px;"></div>`;
    // A half-built variant (modules picked / name typed) must not be wiped silently by switching Type or
    // Chassis — ask first, restore the dropdown on cancel. Same never-lose-work contract. #variant-dirty
    const dsgSel = $("dsgDesigner"), chSel0 = $("dsgChassis");
    dsgSel.addEventListener("change", () => {
      if (S.equip.variantDirty && !confirm("Switching type discards the variant you're building. Continue?")) { dsgSel.value = dsgSel.dataset.prev || dsgSel.value; return; }
      S.equip.variantDirty = false;
      S.equip.editingVariant = null; updateEditBanner(); // switching away ends a rebuild session
      dsgSel.dataset.prev = dsgSel.value;
      onDesignerChange();
    });
    // Tier carries the era, and the auto-matched fallback is era-aware — so re-match when the tier changes
    // (a 1936 tier and a 1944 tier of the same chassis want different no-DLC counterparts). #fallback-auto
    const tierSel0 = $("dsgTier");
    if (tierSel0) tierSel0.addEventListener("change", () => {
      const c = S.equip.chassisById[chSel0 ? chSel0.value : ""];
      if (c) fillFallback(c.designer, c, tierSel0.value);
    });
    chSel0.addEventListener("change", () => {
      if (S.equip.variantDirty && !confirm("Switching chassis discards the variant you're building. Continue?")) { chSel0.value = chSel0.dataset.prev || chSel0.value; return; }
      S.equip.variantDirty = false;
      S.equip.editingVariant = null; updateEditBanner(); // switching away ends a rebuild session
      chSel0.dataset.prev = chSel0.value;
      onChassisChange();
    });
    $("dsgTag").addEventListener("change", loadDesignerVariants);
    $("dsgSaveBtn").addEventListener("click", saveDesignerVariant);
    // #edit-variant-prefill — the form keeps whatever was last built or loaded, so "make another" started
    // from someone else's design unless you cleared every box by hand.
    { const nb = $("dsgNewBtn"); if (nb) nb.addEventListener("click", startBrandNewVariant); }
    const iconBrowse = $("dsgIconBrowse"); if (iconBrowse) iconBrowse.addEventListener("click", () => openIconPicker());
    const iconInput = $("dsgIcon"); if (iconInput) iconInput.addEventListener("input", () => { S.equip.variantDirty = true; updateDsgIconPreview(); });
    const tierInput = $("dsgTier"); if (tierInput) tierInput.addEventListener("change", () => { if (!($("dsgIcon") && $("dsgIcon").value.trim())) mountDesignerPicture(); }); // no custom icon → picture follows the model tier
    const nameInput = $("dsgName"); if (nameInput) nameInput.addEventListener("input", () => { S.equip.variantDirty = true; });
    onDesignerChange();
    dsgSel.dataset.prev = dsgSel.value; chSel0.dataset.prev = chSel0.value;
    // Owner is a COMPLETE country dropdown (any mod, incl. add-ons/vanilla) — not a tag to type. #5
    if (window.NovaCountryPicker) {
      NovaCountryPicker.populate($("dsgTag"), { modPath: modPath(), all: true }).then(() => {
        const sel = $("dsgTag"); if (!sel) return;
        if (S.country && Array.prototype.some.call(sel.options, (o) => o.value === S.country)) sel.value = S.country;
        loadDesignerVariants();
      });
    } else {
      loadDesignerVariants();
    }
  }
  function onDesignerChange() {
    const dsgSel = $("dsgDesigner");
    const d = dsgSel.value;
    // "＋ New weapon…" is a DOOR, not a domain — it swaps this box into the weapon creator. It MUST be
    // intercepted before onChassisChange() below, which clears S.equip.pick before its own `if (!c)` bail:
    // picking the sentinel would silently wipe an in-progress design. Snap the dropdown back to the real
    // domain first, so cancelling the creator leaves you exactly where you were. #new-weapon
    if (d === "__new__") {
      dsgSel.value = dsgSel.dataset.prevDesigner || (S.equip.chassis[0] && S.equip.chassis[0].designer) || "";
      if (S.equip.variantDirty && !confirm("Discard your unsaved design and start a new weapon?")) return;
      S.equip.variantDirty = false;
      openWeaponCreator();
      return;
    }
    dsgSel.dataset.prevDesigner = d;
    const sel = $("dsgChassis");
    // Hide land_cruiser chassis — the variant writer refuses them (they need TWO DLCs, unsupported), so
    // offering them here would be a dead-end (design then a rejected Save). #land-cruiser-parked
    const list = S.equip.chassis.filter((c) => c.designer === d && !/land_cruiser/i.test(c.archetypeId || ""));
    sel.innerHTML = list.map((c) => `<option value="${esc(c.archetypeId)}">${esc(c.archetypeId)}${c.isMod ? " (mod)" : ""}</option>`).join("") || '<option value="">— none —</option>';
    sel.dataset.prev = sel.value; // options were rebuilt — keep the cancel-restore baseline in sync
    onChassisChange(); // fills the fallback too — it needs the resolved chassis, which isn't known here yet
  }
  // Meaningful name tokens for matching: drop the boilerplate every id carries so "medium_tank_chassis" and
  // "medium_tank_equipment_1" share {medium, tank} rather than {equipment}. #fallback-auto
  const FB_NOISE = /^(equipment|chassis|hull|airframe|frame|ship|plane|\d+)$/;
  const fbTokens = (s) => new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !FB_NOISE.test(t)));
  // Mirror of the server's deriveEquipmentDesigner sets — used to place a candidate whose own `designer` is null.
  const FB_DESIGNER_BY_TYPE = { armor: "tanks", screen_ship: "ships", capital_ship: "ships", carrier: "ships", submarine: "ships",
    fighter: "planes", cas: "planes", tactical_bomber: "planes", strategic_bomber: "planes", naval_bomber: "planes",
    interceptor: "planes", suicide: "planes", scout_plane: "planes", maritime_patrol_plane: "planes", air_transport: "planes", heavy_fighter: "planes" };
  // A TIER does not redeclare `type` — it inherits it from its archetype (MD: CV_MR_Fighter1 → cv_medium_plane_airframe
  // → tactical_bomber), so 73 of MD's plane candidates and 54 of its tanks read as type:"" unless we walk the chain.
  // Without this the type match never fires and name tokens decide it, which is how attack_submarine matched
  // attack_helicopter1 — on the shared word "attack". #fallback-auto
  function fbTypeOf(e, byId) { let n = e, g = 0; while (n && g++ < 8) { if (n.type) return String(n.type).toLowerCase(); n = byId[n.archetype]; } return ""; }
  // Populate + AUTO-MATCH the no-DLC fallback for the CURRENT chassis/tier.
  // The fallback is a create_equipment_variant of an EXISTING non-modular equipment, so its stats and roles are
  // whatever that equipment already has — they cannot be authored. Choosing the closest equipment IS therefore the
  // only way to make the no-DLC version play like the modular one.
  // The old version filtered only by `designer`, sorted by year ASCENDING and left the select on the FIRST option —
  // it silently defaulted a 1944 jet's no-DLC version to the oldest plane in the mod, and when a domain had no
  // candidates at all it fell through to EVERY equipment (that is how a submarine got an attack helicopter). #fallback-auto
  function fillFallback(designer, c, tierId) {
    const sel = $("dsgFallback"); if (!sel) return;
    const hint = $("dsgFallbackHint");
    const all = S.equip.all || [];
    const byId = {}; for (const e of all) byId[e.id] = e;
    const pool = all.filter((e) => !e.isChassis && !e.isArchetype);
    const label = (e) => `${esc(e.id)}${e.year ? " (" + e.year + ")" : ""}`;
    if (!c) { // no chassis context yet — stable ordering, no claim about matching
      const opts = pool.filter((e) => e.designer === designer).sort((a, b) => (a.year || 0) - (b.year || 0) || a.id.localeCompare(b.id));
      sel.innerHTML = opts.map((e) => `<option value="${esc(e.id)}">${label(e)}</option>`).join("") || '<option value="">— none —</option>';
      if (hint) hint.textContent = "";
      return;
    }
    const wantType = String(c.type || "").toLowerCase();
    const tiers = c.concreteTypes || [];
    const tier = tiers.find((t) => t.id === tierId) || tiers[0] || {};
    const wantYear = tier.year || 0;
    // SAME KIND ONLY. Never widen past the domain: shipping a helicopter as a submarine's no-DLC version is worse
    // than admitting there isn't one.
    let cand = wantType ? pool.filter((e) => fbTypeOf(e, byId) === wantType) : [];
    let exact = cand.length > 0;
    if (!cand.length) cand = pool.filter((e) => (e.designer || FB_DESIGNER_BY_TYPE[fbTypeOf(e, byId)] || "") === c.designer);
    if (!cand.length) {
      sel.innerHTML = '<option value="">— none available —</option>';
      const noun = { tanks: "tank", ships: "ship", planes: "aircraft" }[c.designer] || String(c.designer || "");
      if (hint) hint.innerHTML = `<span style="color:#d29922;">⚠ This mod ships no non-modular <b>${esc(noun)}</b> equipment, so there is no valid no-DLC fallback for this chassis — players without <b>${esc(c.dlc || "the DLC")}</b> could not build this design at all. Add a plain (non-modular) ${esc(noun)} equipment first, or only ship this design to DLC owners.</span>`;
      return;
    }
    const want = fbTokens(c.archetypeId);
    const ranked = cand.map((e) => {
      let s = 0;
      if (wantYear && e.year) s -= Math.abs(e.year - wantYear) * 2; // same ERA first — not the oldest in the list
      let shared = 0; const have = fbTokens(e.id); for (const t of want) if (have.has(t)) shared++;
      s += shared * 3;                                              // mild tiebreak only — names are noisy in total conversions
      if (e.isMod) s += 1;                                          // prefer the mod's own gear over vanilla's
      return { e, s };
    }).sort((a, b) => b.s - a.s || a.e.id.localeCompare(b.e.id));
    sel.innerHTML = ranked.map(({ e }, i) => `<option value="${esc(e.id)}">${i === 0 ? "★ " : ""}${label(e)}</option>`).join("");
    const best = ranked[0].e;
    sel.value = best.id;
    if (hint) {
      hint.innerHTML = exact
        ? `Auto-matched to <b>${escLoc(best.id)}</b>${best.year ? " (" + best.year + ")" : ""} — same <b>${esc(wantType)}</b>, closest era. Players without the DLC get this, with your design's name and icon. Change it if you want a different one.`
        : `<span style="color:#d29922;">Auto-matched to <b>${escLoc(best.id)}</b>${best.year ? " (" + best.year + ")" : ""} — but this mod has no non-modular <b>${esc(wantType || c.designer)}</b>, so it is the nearest <b>${esc(c.designer)}</b> rather than a like-for-like match. Worth checking.</span>`;
    }
  }
  function onChassisChange() {
    const c = S.equip.chassisById[$("dsgChassis") ? $("dsgChassis").value : ""];
    const tierSel = $("dsgTier");
    S.equip.pick = {}; // reset the chosen modules when the chassis changes
    if (!c) {
      if (tierSel) tierSel.innerHTML = ""; if ($("dsgBlueprint")) $("dsgBlueprint").innerHTML = "";
      fillFallback($("dsgDesigner") ? $("dsgDesigner").value : "", null);
      return;
    }
    tierSel.innerHTML = (c.concreteTypes || []).map((t) => `<option value="${esc(t.id)}">${esc(t.id)}${t.year ? " (" + t.year + ")" : ""}</option>`).join("") || '<option value="">— no buildable tier —</option>';
    // The no-DLC fallback FOLLOWS the chassis (and its tier's era) automatically. #fallback-auto
    fillFallback(c.designer, c, tierSel ? tierSel.value : "");
    renderBlueprint(c);
  }
  // Valid modules for a slot: category ∈ slot.categories AND same DLC as the chassis (mirrors guardrail G5).
  function modulesForSlot(c, slot) {
    const mods = [], seen = new Set();
    for (const cat of (slot.categories || [])) for (const m of (S.equip.modulesByCategory[cat] || [])) {
      if ((m.dlc && m.dlc !== c.dlc) || seen.has(m.id)) continue;
      seen.add(m.id); mods.push(m);
    }
    return mods.sort((a, b) => a.id.localeCompare(b.id));
  }
  function computeVariantStats(c) {
    const pick = S.equip.pick || {};
    const add = {}, mul = {};
    for (const slot of (c.slots || [])) {
      const id = pick[slot.name];
      if (!id || id === "empty") continue;
      const m = (S.equip.modulesByCategory[slot.categories && slot.categories[0]] || []).find((x) => x.id === id)
        || Object.values(S.equip.modulesByCategory).flat().find((x) => x.id === id);
      if (!m) continue;
      for (const k in (m.addStats || {})) add[k] = (add[k] || 0) + m.addStats[k];
      for (const k in (m.multiplyStats || {})) mul[k] = (mul[k] || 0) + m.multiplyStats[k];
    }
    const out = {};
    const keys = new Set([...Object.keys(add), ...Object.keys(mul)]);
    for (const k of keys) out[k] = (add[k] || 0) * (1 + (mul[k] || 0));
    return out;
  }
  // The big vehicle PICTURE above the modules — the game shows the tank/plane/ship art in its designer, so
  // Nova does too. Clickable to change the design's picture to ANY equipment art (old or new, mod OR vanilla)
  // via the icon browser — the chosen picture becomes the variant's `icon`. #designer-picture
  function designerPictureHtml(c) {
    const cat = c.designer === "ships" ? "ship" : c.designer === "planes" ? "air" : "armored";
    const col = CAT_COLOR[cat] || CAT_COLOR.other;
    return `<div class="bp-photo" id="dsgPhoto" title="Click to change the design's picture" style="--uc:${col};">`
      + `<span class="bp-photo-glyph">${unitSymbol(cat)}</span>`
      + `<span class="bp-photo-img" id="dsgPhotoImg"></span>`
      + `<span class="bp-photo-hint">🖼 change picture</span></div>`;
  }
  function mountDesignerPicture() {
    const el = $("dsgPhotoImg"); if (!el) return;
    const glyph = el.parentElement && el.parentElement.querySelector(".bp-photo-glyph");
    const c = S.equip.chassisById[$("dsgChassis") ? $("dsgChassis").value : ""];
    const chosen = ($("dsgIcon") && $("dsgIcon").value || "").trim();
    const tier = ($("dsgTier") && $("dsgTier").value || "").trim();
    const arch = c && c.archetypeId;
    const eqById = (id) => S.equip.all.find((e) => e.id === id);
    const tierEq = tier ? eqById(tier) : null, archEq = arch ? eqById(arch) : null;
    // Prefer the SPECIFIC per-tier/era art, not one generic picture for the whole family. HOI4 stores the
    // real per-era tank art on the tier's ENABLING TECH (medium_tank_chassis_2 ← improved_medium_tank_chassis,
    // whose GFX_..._medium is a distinct tank) — true for vanilla AND mods. So each model tier shows its own
    // picture. Fall back to the tier's own sprite, then the (generic) chassis picture field, then the glyph.
    // #designer-picture-specific
    const cands = [];
    if (chosen) cands.push(chosen); // the user's explicit choice always wins
    const techs = (tierEq && Array.isArray(tierEq.enabledBy) ? tierEq.enabledBy.slice() : [])
      .sort((a, b) => (/(chassis|tank|hull|airframe|ship|armou?r|panzer|plane|boat|gun)/i.test(b) ? 1 : 0) - (/(chassis|tank|hull|airframe|ship|armou?r|panzer|plane|boat|gun)/i.test(a) ? 1 : 0));
    for (const t of techs) cands.push("GFX_" + t + "_medium"); // the era-specific tank picture
    if (tier) cands.push("GFX_" + tier + "_medium");           // the tier's own tech sprite, if any
    if (tierEq && tierEq.picture) cands.push("GFX_" + tierEq.picture + "_medium");
    if (archEq && archEq.picture) cands.push("GFX_" + archEq.picture + "_medium");
    if (arch) cands.push("GFX_" + arch + "_medium");
    el.style.display = "none"; if (glyph) glyph.style.display = ""; // glyph until a real image resolves
    let i = 0; const im = new Image();
    const load = () => { if (i >= cands.length) return; im.src = "/api/icon-image?key=" + encodeURIComponent(cands[i]) + "&modPath=" + encodeURIComponent(modPath()); };
    im.onload = () => {
      if (isMissingIcon(im)) { i++; load(); return; } // "?" placeholder → next candidate
      el.style.backgroundImage = `url("${im.src}")`; el.style.display = "block";
      if (glyph) glyph.style.display = "none";
    };
    im.onerror = () => { i++; load(); };
    load();
  }
  function renderBlueprint(c) {
    const wrap = $("dsgBlueprint"); if (!wrap) return;
    const slots = c.slots || [];
    const pick = S.equip.pick || {};
    // No fake vehicle silhouette (chassis game sprites don't resolve) — just a clean chassis header:
    // the designer type + chassis id, with the DLC badge on the right.
    const img = `<span class="bp-ch-type">${esc((DSG_LABEL[c.designer] || "").replace(/[^A-Za-z]/g, "").trim() || c.designer || "")}</span>`
      + `<span class="bp-ch-name" title="${esc(c.archetypeId)}">${esc(c.archetypeId)}</span>`;
    const slotBox = (s) => {
      const chosen = pick[s.name];
      const filled = chosen && chosen !== "empty";
      const m = filled ? Object.values(S.equip.modulesByCategory).flat().find((x) => x.id === chosen) : null;
      const label = filled ? (m && m.abbreviation ? m.abbreviation : chosen) : (s.required ? "＋ pick" : "＋ empty");
      const sub = s.name.replace(/_slot$/, "").replace(/_/g, " ");
      return `<button type="button" class="bp-slot${filled ? " filled" : ""}${s.required ? " req" : ""}" data-slot="${esc(s.name)}" title="${esc(s.name)}${filled ? " = " + esc(chosen) : ""}">`
        + `<span class="bp-slot-name">${esc(sub)}${s.required ? ' <b style="color:#f0857a;">*</b>' : ""}</span>`
        + `<span class="bp-slot-body">${filled ? moduleIcon(chosen) : ""}<span class="bp-slot-mod">${esc(String(label))}</span></span></button>`;
    };
    const stats = computeVariantStats(c);
    const statKeys = Object.keys(stats).filter((k) => Math.abs(stats[k]) > 0.0001).sort((a, b) => (EQ_STAT[a] ? -1 : 1) - (EQ_STAT[b] ? -1 : 1));
    const statPanel = statKeys.length
      ? statKeys.map((k) => {
        const meta = EQ_STAT[k] || [k.replace(/_/g, " "), null];
        const ic = meta[1] ? sIcon(meta[1], "#9fb0c0") : `<span class="stat-ico"></span>`;
        const v = stats[k]; const disp = Number.isInteger(v) ? v : v.toFixed(2);
        return `<div class="stat-row">${ic}<span class="sr-lbl" style="text-transform:capitalize;">${esc(meta[0])}</span><span class="sr-val">${disp > 0 && !EQ_STAT[k] ? "+" : ""}${disp}</span></div>`;
      }).join("")
      : '<div class="army-empty" style="padding:8px 2px;">Pick modules to see the design\'s stats build up.</div>';

    // A plane's ROLES live on the airframe (a variant can't carry allow_mission_type), so surface them here —
    // editable when the mod owns the airframe. Editing applies to every variant built on this airframe. #plane-roles-edit
    const archEq = S.equip.all.find((e) => e.id === c.archetypeId);
    const roleSection = (c.designer === "planes" && archEq)
      ? `<div class="bp-roles">${roleBlock(archEq)}</div>` : "";

    wrap.innerHTML =
      `<div class="bp-body">
        <div class="bp-canvas">
          ${designerPictureHtml(c)}
          <div class="bp-chassis" style="--uc:${c.dlc ? "#d29922" : "#3f7fbf"}">${img}<span class="bp-dlc-badge">${esc(c.dlc || "")}</span></div>
          <div class="bp-slots">${slots.map(slotBox).join("")}</div>
          ${roleSection}
        </div>
        <div class="bp-stats"><div class="stat-group-h">Design stats <span style="text-transform:none; color:#6e7681;">(from modules)</span></div>${statPanel}</div>
      </div>`;
    wrap.querySelectorAll(".bp-slot").forEach((b) => b.addEventListener("click", () => openModulePicker(c, b.dataset.slot)));
    const photo = $("dsgPhoto"); if (photo) photo.addEventListener("click", openIconPicker); // click the picture to change it
    mountModuleIcons(wrap);
    mountDesignerPicture();
  }
  const moduleById = (id) => Object.values(S.equip.modulesByCategory || {}).flat().find((x) => x.id === id) || null;
  // Would choosing module m in slotName break a chassis count-limit (or duplicate a module)? Returns a short
  // reason string to grey the tile, or null if it's fine. Mirrors the server's G6 so the UI prevents it. #4
  function moduleCapBlock(c, slotName, m) {
    if (!m || m.id === "empty") return null;
    const pick = Object.assign({}, S.equip.pick || {});
    pick[slotName] = m.id; // simulate picking m here (replaces whatever was in this slot)
    const modTally = {}, catTally = {};
    for (const sn in pick) {
      const id = pick[sn]; if (!id || id === "empty") continue;
      modTally[id] = (modTally[id] || 0) + 1;
      const mm = moduleById(id);
      if (mm && mm.category) catTally[mm.category] = (catTally[mm.category] || 0) + 1;
    }
    const limits = c.countLimits || [];
    for (const lim of limits) {
      if (lim.module === m.id && (modTally[m.id] || 0) > lim.max) return `max ${lim.max} allowed`;
      if (lim.category === m.category && (catTally[m.category] || 0) > lim.max) return `max ${lim.max} of this type`;
    }
    // No blanket "same module twice" refusal — module_count_limit is opt-in and usually category-based, so a
    // repeat within the declared caps (checked above) or with no cap is legal and shipped by MD (Algeria's
    // corvette repeats module_asm_1). The server accepts it; the picker must not be stricter. #dup-module
    return null;
  }
  function openModulePicker(c, slotName) {
    const slot = (c.slots || []).find((s) => s.name === slotName); if (!slot) return;
    const ov = $("dsgPicker"); if (!ov) return;
    const mods = modulesForSlot(c, slot);
    const cur = (S.equip.pick || {})[slotName];
    const statDelta = (m) => {
      const parts = [];
      for (const k in (m.addStats || {})) { const meta = EQ_STAT[k] || [k.replace(/_/g, " "), null]; parts.push(`${meta[0]} ${m.addStats[k] > 0 ? "+" : ""}${m.addStats[k]}`); }
      for (const k in (m.multiplyStats || {})) { const meta = EQ_STAT[k] || [k.replace(/_/g, " "), null]; parts.push(`${meta[0]} ${m.multiplyStats[k] > 0 ? "+" : ""}${Math.round(m.multiplyStats[k] * 100)}%`); }
      return parts.slice(0, 5).join(" · ") || "no stat change";
    };
    const tile = (m) => {
      const block = m.id === cur ? null : moduleCapBlock(c, slotName, m); // the current pick is always allowed to stay
      return `<button type="button" class="mp-mod${m.id === cur ? " sel" : ""}${block ? " mp-blocked" : ""}" data-mod="${esc(m.id)}"${block ? ` data-block="1" title="Can't add: ${esc(block)}"` : ""}>`
        + moduleIcon(m.id)
        + `<span class="mp-mod-txt"><span class="mp-mod-name">${esc(m.id)}${m.abbreviation ? ' <span class="mp-abbr">' + esc(m.abbreviation) + "</span>" : ""}</span>`
        + `<span class="mp-mod-stats">${block ? "⛔ " + esc(block) : esc(statDelta(m))}</span></span></button>`;
    };
    ov.innerHTML =
      `<div class="mp-box">
        <div class="mp-head"><b>${esc(slotName.replace(/_slot$/, "").replace(/_/g, " "))}</b> — pick a module${slot.required ? "" : " (optional)"}, or <button type="button" class="mp-new" title="Build a brand-new module from scratch — its own id, stats and picture — and drop it straight into this slot">🔧 Make one from scratch</button> <button type="button" class="mp-close" title="Close">×</button></div>
        <div class="mp-list">
          ${slot.required ? "" : `<button type="button" class="mp-mod${!cur || cur === "empty" ? " sel" : ""}" data-mod="empty"><span class="mp-mod-name">(empty)</span><span class="mp-mod-stats">leave this slot empty</span></button>`}
          ${mods.map(tile).join("") || '<div class="army-empty">No modules available for this slot in this mod.</div>'}
        </div>
      </div>`;
    ov.style.display = "flex";
    mountModuleIcons(ov);
    // This closer STAYS attached to the persistent overlay after this picker is replaced by the module editor
    // (listeners bound to ov survive an innerHTML swap). Guard it so a backdrop click can't blank the overlay
    // while a later editor + its icon sub-picker are layered (2 children) — mirrors #modal-backdrop-guard so a stale
    // listener can't defeat it. #modal-backdrop-guard
    const close = () => { if (ov.firstElementChild !== ov.lastElementChild) return; ov.style.display = "none"; ov.innerHTML = ""; };
    ov.querySelector(".mp-close").addEventListener("click", close);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    const nb = ov.querySelector(".mp-new"); if (nb) nb.addEventListener("click", () => openModuleEditor(c, slotName));
    ov.querySelectorAll(".mp-mod").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.block) return; // greyed — would break a count-limit / duplicate a module
      S.equip.pick = S.equip.pick || {}; S.equip.pick[slotName] = b.dataset.mod;
      S.equip.variantDirty = true; // a module choice = variant in progress
      close(); renderBlueprint(c);
    }));
  }
  // Create a brand-new equipment MODULE (a gun/engine/armour part) without leaving the designer. Writes via
  // POST /api/equipment/module into a mod-owned modules file, then re-scans so the new module appears live in
  // this slot's picker. Category defaults to what THIS slot accepts, so the module drops straight in. #custom-modules
  // The icons a module can wear in the designer — the ~160 in equipmentdesignermoduleicons.gfx
  // (GFX_SMI_/GFX_EMI_/GFX_EMSI_) plus any the mod adds. A tight reuse of the arsenal's icon grid.
  let _modIconCache = null;
  async function openModuleIconPicker(onPick) {
    const ov = $("dsgPicker"); if (!ov) return;
    // HIDE the editor's node rather than overwrite innerHTML — a snapshot/restore of innerHTML brings the
    // markup back but NOT its event listeners, leaving a visually-present but dead editor. Hiding keeps every
    // listener alive. #module-icon-picker
    const editorNode = ov.firstElementChild;
    if (editorNode) editorNode.style.display = "none";
    const box = document.createElement("div");
    box.className = "mp-box";
    box.innerHTML = '<div class="mp-head"><b>Pick a module icon</b> <span id="miCount" style="color:#6e7681;font-weight:400;"></span><button type="button" class="mp-close" title="Close">×</button></div><input id="miSearch" class="army-input" placeholder="Search…" style="margin:8px 0;width:100%;box-sizing:border-box;"><div id="miGrid" class="ip-grid"><div class="army-loading">Loading…</div></div>';
    ov.appendChild(box);
    ov.style.display = "flex";
    const restore = () => { box.remove(); if (editorNode) editorNode.style.display = ""; };
    box.querySelector(".mp-close").addEventListener("click", restore);
    if (!_modIconCache) {
      try {
        const d = await fetch("/api/sprites?type=all&modPath=" + encodeURIComponent(modPath())).then((r) => r.json());
        _modIconCache = (d.sprites || []).map((s) => String(s.key || s)).filter((k) => /^GFX_(SMI|EMI|EMSI)_/i.test(k));
      } catch (_) { _modIconCache = []; }
    }
    if (!$("miGrid")) return; // closed while loading
    const all = _modIconCache;
    const render = () => {
      const q = ($("miSearch").value || "").toLowerCase().trim();
      const list = (q ? all.filter((k) => k.toLowerCase().includes(q)) : all).slice(0, 300);
      const cEl = $("miCount"); if (cEl) cEl.textContent = all.length ? "(" + all.length + ")" : "(none — this mod defines no module icons)";
      const g = $("miGrid"); if (!g) return;
      g.innerHTML = list.length ? list.map((k) =>
        `<button type="button" class="ip-item" data-key="${esc(k)}" title="${esc(k)}"><img class="ip-img" loading="lazy" src="/api/icon-image?key=${encodeURIComponent(k)}&modPath=${encodeURIComponent(modPath())}" alt=""><span class="ip-name">${esc(k.replace(/^GFX_(SMI|EMI|EMSI)_/i, ""))}</span></button>`
      ).join("") : '<div class="army-empty" style="grid-column:1/-1;">No module icons match.</div>';
      // Restore the editor FIRST, THEN hand back the key — onPick writes into #meGfx, which only exists once
      // the editor markup is back. Calling it before restore() targets a null and silently loses the pick.
      g.querySelectorAll(".ip-item").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.key; restore(); onPick(k); }));
    };
    $("miSearch").addEventListener("input", render);
    render();
  }
  function openModuleEditor(c, slotName) {
    const slot = (c.slots || []).find((s) => s.name === slotName); if (!slot) return;
    const ov = $("dsgPicker"); if (!ov) return;
    const accepted = (slot.categories || []).slice();          // categories THIS slot takes (most relevant first)
    const allCats = Object.keys(S.equip.modulesByCategory || {});
    const catOpts = [...new Set([...accepted, ...allCats])];
    const defCat = accepted[0] || allCats[0] || "";
    const statKeys = Object.keys(EQ_STAT);
    const statRow = (listId, k = "", v = "") =>
      `<div class="me-stat-row"><input class="me-sk army-input" list="${listId}" placeholder="stat (e.g. soft_attack)" value="${esc(k)}"><input class="me-sv army-input" type="number" step="any" placeholder="0" value="${esc(String(v))}"><button type="button" class="me-del" title="Remove">×</button></div>`;
    ov.innerHTML =
      `<div class="mp-box me-box">
        <div class="mp-head"><b>🔧 Make a module from scratch</b> for <i>${esc(slotName.replace(/_slot$/, "").replace(/_/g, " "))}</i> <button type="button" class="mp-close" title="Close">×</button></div>
        <div class="me-form">
          <label class="me-lbl">Module ID <span class="me-hint">no spaces — e.g. my_custom_cannon</span>
            <input id="meId" class="army-input" placeholder="my_custom_cannon" autocomplete="off"></label>
          <label class="me-lbl">Slot category <span class="me-hint">which slot type it fits — defaults to this slot</span>
            <input id="meCat" class="army-input" list="meCatList" value="${esc(defCat)}" autocomplete="off"></label>
          <datalist id="meCatList">${catOpts.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <div class="me-row2">
            <label class="me-lbl">GUI category <span class="me-hint">optional</span><input id="meGui" class="army-input" placeholder="(optional)" autocomplete="off"></label>
            <label class="me-lbl">Abbreviation <span class="me-hint">≤8, optional</span><input id="meAbbr" class="army-input" maxlength="8" placeholder="opt" autocomplete="off"></label>
          </div>
          <label class="me-lbl">Picture <span class="me-hint">optional — the icon it shows in the designer</span><span style="display:flex; gap:5px; align-items:center;"><input id="meGfx" class="army-input" placeholder="none — inherits its category's icon" style="flex:1;" autocomplete="off"><button type="button" id="meGfxBrowse" class="army-btn-sm" title="Browse module icons">🖼 Browse</button><img id="meGfxPrev" class="me-gfx-prev" alt="" /></span></label>
          <div class="me-stats">
            <div class="me-stats-h">Flat bonuses <span class="me-hint">add_stats</span><button type="button" id="meAddAdd" class="me-add">＋ stat</button></div>
            <div id="meAddRows">${statRow("meStatList", "", "")}</div>
          </div>
          <div class="me-stats">
            <div class="me-stats-h">Percentage bonuses <span class="me-hint">multiply_stats — 0.15 = +15%</span><button type="button" id="meAddMul" class="me-add">＋ stat</button></div>
            <div id="meMulRows"></div>
          </div>
          <datalist id="meStatList">${statKeys.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <div class="me-actions"><span id="meStatus" class="me-status"></span><button type="button" class="me-back army-btn-sm">← Back</button><button type="button" class="me-save army-btn">Save module</button></div>
        </div>
      </div>`;
    ov.style.display = "flex";
    // Don't blank the shared overlay while a sub-picker (the module icon picker) is layered on top — a backdrop
    // click would otherwise DESTROY the in-progress module, which is read from the DOM at save time (no draft). The
    // editor is a single root child; a layered picker box makes it no longer the only child. #modal-backdrop-guard
    const close = () => { if (ov.firstElementChild !== ov.lastElementChild) return; ov.style.display = "none"; ov.innerHTML = ""; };
    ov.querySelector(".mp-close").addEventListener("click", close);
    ov.querySelector(".me-back").addEventListener("click", () => openModulePicker(c, slotName));
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    // Picture: browse the mod's real module icons + live preview. Module icons live in
    // interface/equipmentdesignermoduleicons.gfx as GFX_SMI_* / GFX_EMI_* / GFX_EMSI_*, plus any the mod adds.
    const meGfxPrev = () => {
      const img = $("meGfxPrev"), v = ($("meGfx").value || "").trim();
      if (!img) return;
      if (!v) { img.style.display = "none"; img.removeAttribute("src"); return; }
      const key = /^GFX_/i.test(v) ? v : "GFX_SMI_" + v; // preview best-guesses the ship prefix; the picker sets a full key
      img.style.display = "block";
      img.src = "/api/icon-image?key=" + encodeURIComponent(key) + "&modPath=" + encodeURIComponent(modPath());
    };
    { const g = $("meGfx"); if (g) g.addEventListener("input", meGfxPrev); }
    { const gb = $("meGfxBrowse"); if (gb) gb.addEventListener("click", () => openModuleIconPicker((key) => { $("meGfx").value = key; meGfxPrev(); })); }
    // wire add/remove stat rows
    ov.querySelector("#meAddAdd").addEventListener("click", () => { $("meAddRows").insertAdjacentHTML("beforeend", statRow("meStatList")); });
    ov.querySelector("#meAddMul").addEventListener("click", () => { $("meMulRows").insertAdjacentHTML("beforeend", statRow("meStatList")); });
    // delegate row-remove on the FORM (replaced on every render) so listeners don't pile up on the persistent overlay
    ov.querySelector(".me-form").addEventListener("click", (e) => { const d = e.target.closest && e.target.closest(".me-del"); if (d) { const row = d.closest(".me-stat-row"); if (row) row.remove(); } });
    const collect = (rowsId) => {
      const o = {};
      (ov.querySelector(rowsId) ? ov.querySelectorAll(rowsId + " .me-stat-row") : []).forEach((r) => {
        const k = (r.querySelector(".me-sk").value || "").trim();
        const v = r.querySelector(".me-sv").value;
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && v !== "" && !isNaN(Number(v))) o[k] = Number(v);
      });
      return o;
    };
    const st = ov.querySelector(".me-status"), saveBtn = ov.querySelector(".me-save");
    saveBtn.addEventListener("click", async () => {
      const id = ($("meId").value || "").trim();
      const category = ($("meCat").value || "").trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) { st.style.color = "#d29922"; st.textContent = "ID must start with a letter/underscore, no spaces."; return; }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(category)) { st.style.color = "#d29922"; st.textContent = "Pick a slot category (the slot type it fits)."; return; }
      const add_stats = collect("#meAddRows"), multiply_stats = collect("#meMulRows");
      if (!Object.keys(add_stats).length && !Object.keys(multiply_stats).length) { st.style.color = "#d29922"; st.textContent = "Add at least one stat bonus."; return; }
      const orig = saveBtn.textContent; saveBtn.disabled = true; saveBtn.textContent = "Saving…"; st.style.color = "#6e7681"; st.textContent = "";
      try {
        const d = await fetch("/api/equipment/module", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({ modPath: modPath(), id, category, gui_category: ($("meGui").value || "").trim(), abbreviation: ($("meAbbr").value || "").trim(), add_stats, multiply_stats }, ($("meGfx").value || "").trim() ? { gfx: ($("meGfx").value || "").trim() } : {})),
        }).then((r) => r.json());
        if (!d || !d.ok) { st.style.color = "#f85149"; st.textContent = (d && d.error) || "Save failed."; saveBtn.disabled = false; saveBtn.textContent = orig; return; }
        // bust the module scan cache so the new module shows up live
        const md = await fetch("/api/equipment/modules?modPath=" + encodeURIComponent(modPath()) + "&_=" + Date.now()).then((r) => r.json());
        S.equip.modulesByCategory = (md && md.byCategory) || S.equip.modulesByCategory;
        const fitsThisSlot = (slot.categories || []).includes(category);
        if (fitsThisSlot) {
          // drop it straight into the slot the user was filling
          S.equip.pick = S.equip.pick || {}; S.equip.pick[slotName] = id; S.equip.variantDirty = true;
          close(); renderBlueprint(c);
        } else {
          // valid module, but a different slot type — keep the modal, tell the user where it lives. Re-enable
          // Save (this branch alone left it disabled → a second save was impossible without reopening).
          st.style.color = "#3fb950";
          st.textContent = `Saved “${id}”. This slot takes ${(slot.categories || []).join(", ") || "n/a"}; your module (${category}) is now available for ${category} slots.`;
          saveBtn.textContent = "Saved ✓"; saveBtn.disabled = false;
        }
      } catch (e) { st.style.color = "#f85149"; st.textContent = "Save failed: " + (e.message || e); saveBtn.disabled = false; saveBtn.textContent = orig; }
    });
    setTimeout(() => { const el = $("meId"); if (el) el.focus(); }, 30);
  }
  // Small live preview of the icon key currently typed in the designer's Icon field + the big vehicle photo.
  function updateDsgIconPreview() {
    const prev = $("dsgIconPrev");
    if (prev) {
      const v = ($("dsgIcon") && $("dsgIcon").value || "").trim();
      prev.innerHTML = v ? `<img src="/api/icon-image?key=${encodeURIComponent(v)}&modPath=${encodeURIComponent(modPath())}" alt="" />` : "";
    }
    mountDesignerPicture(); // the big picture above the modules follows the chosen icon
  }
  // Browse in-game equipment icons (#9). Reuses army's own overlay (like the module picker) — a searchable
  // thumbnail grid from /api/sprites?type=equipment (the _medium/_small icon sprites). Defaults to a filter
  // matching the selected domain (tanks/ships/planes) with a checkbox to drop the filter and see them all.
  async function openIconPicker(targetId = "dsgIcon", domain = ($("dsgDesigner") ? $("dsgDesigner").value : ""), onPick) {
    const ov = $("dsgPicker"); if (!ov) return;
    const domLabel = (DSG_LABEL[domain] || domain || "").replace(/[^A-Za-z]/g, "").trim() || domain || "domain";
    // HIDE any active editor already in the overlay (e.g. the modal chassis editor, whose Picture "Browse"
    // opens this) and append a SIBLING picker — overwriting the overlay's innerHTML destroyed that form (and
    // its #chPicture input, so onPick then threw reading `.value` of null and the in-progress design was lost).
    // Mirrors openModuleIconPicker's approach. #icon-picker-preserve
    const editorNode = ov.firstElementChild;
    if (editorNode) editorNode.style.display = "none";
    const box = document.createElement("div");
    box.className = "mp-box";
    box.innerHTML =
      '<div class="mp-head"><b>Pick an icon</b> <span id="ipCount" style="color:#6e7681;font-weight:400;"></span>'
      + '<label style="margin-left:auto;font-weight:400;font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" id="ipDomainOnly" checked style="accent-color:#1f6feb;"> ' + esc(domLabel) + ' only</label>'
      + ' <button type="button" class="mp-close" title="Close">×</button></div>'
      + '<input id="ipSearch" class="army-input" placeholder="Search icons…" style="margin:8px 0;width:100%;box-sizing:border-box;">'
      + '<div id="ipGrid" class="ip-grid"><div class="army-loading">Loading icons…</div></div>';
    ov.appendChild(box);
    ov.style.display = "flex";
    const close = () => { box.remove(); if (editorNode) editorNode.style.display = ""; if (!ov.firstElementChild) { ov.style.display = "none"; ov.innerHTML = ""; } };
    box.querySelector(".mp-close").addEventListener("click", close);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    let all = [];
    try { const d = await fetch("/api/sprites?type=equipment&modPath=" + encodeURIComponent(modPath())).then((r) => r.json()); all = d.sprites || []; } catch (_) {}
    if (!$("ipSearch")) return; // picker closed (Escape/×/backdrop) while the sprites loaded — nothing to render into
    // Domain match. The sprite name alone is a weak signal — "naval_bomber1" is a PLANE but contains "naval",
    // and "air_superiority"/"aircraft_construction" are doctrine/decision art, not aircraft. So ask the DATA
    // first: most equipment art is named after the equipment, and every equipment already knows its own
    // designer domain. Only fall back to keywords for art that names no equipment.
    // `designer` is only set on MODULAR chassis equipment, so a plain non-modular plane like naval_bomber1
    // has none — its DOMAIN still follows from its `type`, resolved through the archetype chain (a tier does
    // not redeclare type). Same rule the no-DLC fallback matcher uses.
    const idDomain = new Map(); // equipment/chassis id -> "tanks" | "ships" | "planes" | "" (not a vehicle)
    const byId = {};
    for (const e of (S.equip.all || [])) byId[e.id] = e;
    const domainOf = (e) => e.designer || FB_DESIGNER_BY_TYPE[fbTypeOf(e, byId)] || "";
    for (const e of (S.equip.all || [])) idDomain.set(String(e.id).toLowerCase(), domainOf(e));
    for (const c of (S.equip.chassis || [])) if (c.archetypeId) idDomain.set(String(c.archetypeId).toLowerCase(), c.designer || "");
    // Art that is provably NOT a vehicle: doctrines, NATO counters, decision/branch icons, AA guns.
    const NOT_EQUIPMENT_ART = /(^|_)(unit|nato)_|_icon$|(^|_)(doctrine|superiority|initiative|land_battle|integration|engineering|construction|refueling|category|anti_air)(_|$)/i;
    // Token-boundary keywords (so "air" doesn't match "chair"/"repair"), for icons not named after an id.
    // `\d*` because HOI4 names its tiers with the digit glued on — naval_bomber1, fighter2, cas1 — so a
    // plain token boundary after "bomber" never matched them.
    const KW_PLANES = /(^|_)(plane|air|airframe|aircraft|fighter|bomber|cas|interceptor)\d*(_|$)/;
    const kw = domain === "tanks" ? /(^|_)(tank|armou?r|panzer|tanks)\d*(_|$)/
      : domain === "ships" ? /(^|_)(ship|hull|naval|navy|submarine|destroyer|cruiser|battleship|carrier|torpedo)\d*(_|$)/
      : domain === "planes" ? KW_PLANES
      : null;
    const matchesDomain = (key) => {
      const base = key.toLowerCase().replace(/^gfx_/, "").replace(/_(medium|small)$/, "");
      // Most country-specific art is the shared id under a TAG prefix (GFX_BEL_naval_bomber1) — resolve it
      // to the equipment it depicts, or that art falls through to the keywords and a naval BOMBER lands
      // under Ships on the word "naval".
      const bare = base.replace(/^[a-z]{3}_/, "");
      // 1. Named after a real equipment → that equipment's OWN domain decides.
      if (idDomain.has(base)) return idDomain.get(base) === domain;
      if (idDomain.has(bare)) return idDomain.get(bare) === domain;
      // 2. Otherwise fall back to the name, minus the art we can prove isn't a vehicle at all.
      if (NOT_EQUIPMENT_ART.test(base)) return false;
      // The navy words are shared with aircraft — a NAVAL bomber, a CARRIER fighter and a TORPEDO bomber
      // are all planes. When a name reads as both, the plane wins.
      if (domain === "ships" && KW_PLANES.test(base)) return false;
      return kw ? kw.test(base) : true;
    };
    // Icons render as <img> hitting /api/icon-image, so paint a page at a time rather than 1.7k at once —
    // but never hide the rest behind a silent cap. That cap is why "Browse" only ever showed an alphabetical
    // A-prefix of the roster (advanced_/AFG_/…), which reads as "it only has base-game planes". #icon-cap
    const PAGE = 60;
    let shown = PAGE;
    const g = () => $("ipGrid");
    function render() {
      const q = ($("ipSearch").value || "").toLowerCase().trim();
      const domainOnly = $("ipDomainOnly").checked;
      const list = all.filter((s) => (!domainOnly || matchesDomain(s.key)) && (!q || s.key.toLowerCase().includes(q)));
      const total = list.length;
      const page = list.slice(0, shown);
      const cEl = $("ipCount");
      if (cEl) cEl.textContent = total ? (total > page.length ? "(showing " + page.length + " of " + total + ")" : "(" + total + ")") : "";
      g().innerHTML = page.length ? page.map((s) =>
        '<button type="button" class="ip-item" data-key="' + esc(s.key) + '" title="' + esc(s.key) + '">'
        + '<img class="ip-img" loading="lazy" src="/api/icon-image?key=' + encodeURIComponent(s.key) + '&modPath=' + encodeURIComponent(modPath()) + '" alt="" />'
        + '<span class="ip-name">' + esc(s.key.replace(/^GFX_/, "").replace(/_(medium|small)$/, "")) + "</span></button>"
      ).join("") + (total > page.length
        ? '<button type="button" id="ipMore" class="army-btn-sm" style="grid-column:1/-1;margin-top:6px;">Show more (' + (total - page.length) + ' left)</button>'
        : "")
        : '<div class="army-empty" style="grid-column:1/-1;">No icons ' + (domainOnly ? "for this domain — untick “" + esc(domLabel) + " only” to see all." : "found.") + "</div>";
      g().querySelectorAll(".ip-item").forEach((b) => b.addEventListener("click", () => {
        const tgt = $(targetId); if (tgt) tgt.value = b.dataset.key;
        (onPick || updateDsgIconPreview)(); close();
      }));
      const more = $("ipMore");
      if (more) more.addEventListener("click", () => { shown += PAGE * 2; render(); });
    }
    // A new search/filter starts a fresh page — otherwise "Show more" leaks its count across queries.
    $("ipSearch").addEventListener("input", () => { shown = PAGE; render(); });
    $("ipDomainOnly").addEventListener("change", () => { shown = PAGE; render(); });
    render();
  }
  async function saveDesignerVariant() {
    const st = $("dsgStatus"), btn = $("dsgSaveBtn");
    // Rebuilding an EXISTING variant: Save rewrites its original block in place (validated modules),
    // never the Nova region. #designer-bridge
    const ev = S.equip.editingVariant;
    if (ev) {
      const name2 = ($("dsgName").value || "").trim();
      if (!name2) { st.style.color = "#d29922"; st.textContent = "Name your variant."; return; }
      const orig2 = btn.textContent; btn.disabled = true; btn.textContent = "Saving…";
      try {
        const d = await fetch("/api/equipment/variant/update", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: modPath(), file: ev.file, blockIdx: ev.blockIdx, expect: ev.expect,
            set: { name: name2, icon: ($("dsgIcon").value || "").trim(), obsolete: $("dsgObsolete").checked, modules: Object.assign({}, S.equip.pick || {}), type: $("dsgTier").value },
          }),
        }).then((r) => r.json());
        if (!d || !d.ok) throw new Error(d && d.error ? d.error : "Save failed.");
        S.equip.variantDirty = false;
        S.equip.editingVariant = null;
        updateEditBanner();
        await refreshVariants();
        st.style.color = "#3fb950"; st.textContent = `✓ Updated "${name2}" (${ev.tag}) in place.`;
      } catch (e) { st.style.color = "#f85149"; st.textContent = "✗ " + (e.message || e); }
      finally { btn.disabled = false; btn.textContent = S.equip.editingVariant ? orig2 : "💾 Save variant"; }
      return;
    }
    const tag = ($("dsgTag").value || "").trim().toUpperCase();
    const chassisType = $("dsgTier").value;
    const name = ($("dsgName").value || "").trim();
    const fallbackType = $("dsgFallback").value;
    const modules = Object.assign({}, S.equip.pick || {});
    if (!/^[A-Z][A-Z0-9]{2}$/.test(tag)) { st.style.color = "#d29922"; st.textContent = "Enter a 3-letter owner tag (e.g. GER)."; return; }
    if (!name) { st.style.color = "#d29922"; st.textContent = "Name your variant."; return; }
    if (!chassisType) { st.style.color = "#d29922"; st.textContent = "Pick a model."; return; }
    const body = { modPath: modPath(), tag, name, chassisType, modules, fallbackType, icon: ($("dsgIcon").value || "").trim(), obsolete: $("dsgObsolete").checked };
    const orig = btn.textContent; btn.disabled = true; btn.textContent = "Saving…";
    try {
      const d = await fetch("/api/equipment/variant/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (!d || !d.ok) throw new Error(d && d.error ? d.error : "Save failed.");
      S.equip.variantDirty = false; // saved — switching type/chassis no longer needs a warning
      st.style.color = "#3fb950"; st.textContent = `✓ Saved "${name}" for ${tag} (gated by ${d.dlc}).`;
      loadDesignerVariants(); refreshVariants(); // update the bottom list AND the left arsenal (else the new design is missing until reload)
    } catch (e) { st.style.color = "#f85149"; st.textContent = "✗ " + (e.message || e); }
    finally { btn.disabled = false; btn.textContent = orig; }
  }
  async function loadDesignerVariants() {
    const wrap = $("dsgVariants"); if (!wrap) return;
    const tag = ($("dsgTag") ? $("dsgTag").value : "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{2}$/.test(tag)) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = '<div class="army-loading">Loading designed variants…</div>';
    let d;
    try { d = await fetch(`/api/equipment/variant/list?modPath=${encodeURIComponent(modPath())}&tag=${tag}`).then((r) => r.json()); }
    catch (_) { d = null; }
    if (!d || !d.ok) {
      // A transient failure must NOT blank the panel (reads as "no designs" / broken) or leave the previous
      // country's list under the new header — show a retry so the user can recover. #designer-variants-load-fail
      wrap.innerHTML = `<div class="comp-label">Designed variants on ${esc(tag)}</div><div class="army-empty">Couldn’t load this country’s designs (the mod may still be warming up). <button type="button" class="army-btn-sm" id="dsgVarRetry">↻ Retry</button></div>`;
      const rb = $("dsgVarRetry"); if (rb) rb.addEventListener("click", loadDesignerVariants);
      return;
    }
    const vs = d.variants || [];
    wrap.innerHTML = `<div class="comp-label">Designed variants on ${esc(tag)}${vs.length ? " (" + vs.length + ")" : ""}</div>` +
      (vs.length ? vs.map((v) =>
        // #edit-variant-prefill — the list offered only Delete, so "edit this design" meant retyping it from
        // scratch. Saving under the same name already replaced the old one; only the prefill was missing.
        `<div class="deploy-row"><span class="dr-tpl" title="${escLoc(v.name)}">${escLoc(v.name)}</span><span class="dr-meta">${esc(v.chassisType)} · ${esc(v.dlc)}</span>` +
        `<span class="dr-edit" data-i="${vs.indexOf(v)}" title="Load this design into the Designer — Save under the same name replaces it">✎</span>` +
        `<span class="dr-del" data-name="${esc(v.name)}" title="Delete">×</span></div>`
      ).join("") : '<div class="army-empty">None yet.</div>');
    wrap.querySelectorAll(".dr-del").forEach((x) => x.addEventListener("click", () => deleteDesignerVariant(x.dataset.name)));
    wrap.querySelectorAll(".dr-edit").forEach((x) => x.addEventListener("click", () => {
      const v = vs[Number(x.dataset.i)];
      if (v) editNovaVariantInDesigner(v, tag);
    }));
  }
  async function deleteDesignerVariant(name) {
    const tag = ($("dsgTag").value || "").trim().toUpperCase();
    if (!confirm(`Delete the designed variant "${name}" (${tag})?`)) return; // destructive — always ask
    const st = $("dsgStatus");
    try {
      const d = await fetch("/api/equipment/variant/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: modPath(), tag, name }) }).then((r) => r.json());
      if (!d || !d.ok) throw new Error(d && d.error ? d.error : "Delete failed.");
      if (st) { st.style.color = "#8b949e"; st.textContent = `Deleted "${name}".`; }
      // If the editor was mid-"Rebuild" of the variant we just deleted, its editingVariant still points at that
      // (now-removed) block by file+blockIdx. Leaving the "🔁 Rebuilding … / 💾 Save changes to variant" banner
      // live would let a Save write to a stale/shifted block. Drop back to create-new mode. #del-clears-edit
      const ev = S.equip && S.equip.editingVariant;
      if (ev && ev.tag === tag && ev.name === name) { S.equip.editingVariant = null; S.equip.variantDirty = false; updateEditBanner(); }
      refreshVariants(); // drop the phantom row from the left arsenal too (only on a real delete)
    } catch (e) { if (st) { st.style.color = "#f85149"; st.textContent = "✗ " + (e.message || e); } }
    loadDesignerVariants();
  }

  // ── Companies sub-tab (designer ideas, surfaced read + deep-link to edit) ─
  // Companies are now edited by the FULL National-Spirits designers editor embedded in #companiesFrame
  // (see lazyLoad + army.html) — the old light index (loadCompanies/renderCompanies) was replaced. #7/#10

  async function saveArmy() {
    const statusEl = $("armySaveStatus"), btn = $("armySaveBtn");
    if (!S.country) return;
    // Fold a half-finished division edit into the model before reading it. Without this the save wrote the
    // division as it was on disk and said "saved", with the user's typing still in the box.
    // #deploy-edit-not-drained-by-save
    // …and clear the form's own "Don't forget 💾 Save" line, which applyDeployEdit leaves behind and which
    // would otherwise sit under a save that has just happened.
    if (deployEditDirty()) { applyDeployEdit(); const ds = $("deployStatus"); if (ds) ds.textContent = ""; }
    const bad = S.model.templates.find((t) => !String(t.name || "").trim());
    if (bad) { if (statusEl) { statusEl.style.color = "#f85149"; statusEl.textContent = "Every template needs a name."; } return; }
    // A template needs at least one combat battalion — HOI4's own designer forbids a 0-regiment template and the
    // engine can't build a division from it. Same content guard the naval/air savers apply ("Add at least one ship/
    // group"). The user can add a regiment or 🗑 Delete the empty template, so this never soft-locks. #empty-template
    const emptyTpl = S.model.templates.find((t) => (t.cols.flat().length + ((t._overflowRegiments || []).length)) === 0);
    if (emptyTpl) { if (statusEl) { statusEl.style.color = "#f85149"; statusEl.textContent = `Template “${String(emptyTpl.name || "").trim()}” has no battalions — add a regiment (or delete the template) before saving.`; } return; }
    // A duplicate template name is the MOD'S business, not a crash — and blocking the save here made Nova
    // unusable on real mods. Millennium Dawn itself ships TWO division_template blocks both named "Northern
    // Alliance Brigade" (history/units/AFG_2000_nonnsb.txt lines 2 and 111) plus two named "Northern Alliance
    // Militia", and the game runs. So the user hit a hard refusal over a duplicate THEY DIDN'T CREATE and
    // could never clear: renaming their own template can't fix the mod's other pair. Warn, name it, and save.
    // (Nova's own rule: a first-wins/ambiguity problem must never be reported as a crash.) #dup-template-name
    const tNames = S.model.templates.map((t) => String(t.name || "").trim());
    const dupName = tNames.find((n, i) => tNames.indexOf(n) !== i);
    const dupWarn = dupName
      ? `Saved — but heads-up: two templates are named “${dupName}”. Divisions that name it will use one of them. (This mod already ships duplicates like this, so it isn't fatal.)`
      : "";
    const templates = S.model.templates.map((t) => ({
      name: t.name,
      // Real per-column regiments + any beyond-the-grid units the file had (raised-defines mods) — an
      // edit+save must never silently delete what the grid can't show.
      regiments: t.cols.flatMap((col, x) => col.map((u, y) => ({ unit: u, x, y }))).concat(t._overflowRegiments || []),
      support: t.support.map((u, i) => ({ unit: u, x: 0, y: i })).concat(t._overflowSupport || []),
      priority: t.priority,
      division_names_group: t.names_group || undefined,
      template_counter: (t.template_counter === "" || t.template_counter == null) ? undefined : Number(t.template_counter),
      is_locked: t.is_locked === "yes" ? "yes" : undefined,
      override_model: (t.override_model || "").trim() || undefined,
      _origName: t._origName, // stable identity so a rename still matches the original file block #tpl-identity
      _dirty: !!t._dirty,
    }));
    const orig = btn.textContent; btn.disabled = true; btn.textContent = "Saving…"; if (statusEl) statusEl.textContent = "";
    S._armySaving = true; // so the exit-hook reports "clean" mid-save (mirrors app.js saveInFlight)
    const modelAtRequest = S.model; // snapshot: if the country switches mid-save the post-await bookkeeping must NOT run on the new model #toctou
    try {
      const r = await fetch("/api/army/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: modPath(), tag: S.country, file: S.model.file, templates, divisions: S.model.divisions, baseFingerprint: S.model.fingerprint || "" }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Save failed.");
      // The save body was serialized SYNCHRONOUSLY above, so the on-disk write is correct for the country that was
      // active at request time. But a country switch can interleave: guardedLoad only checks S.unsaved (still true
      // until setUnsaved(false) below) and the new country's read GET often resolves before this disk-heavy POST, so
      // S.model may now point at a DIFFERENT country. Running the success bookkeeping (model.file / _origName re-sync
      // / setUnsaved) against it would plant THIS save's filename into the WRONG model — and a later save of that
      // country would then POST its OOB with the wrong `file`, writing it into this country's units file. Bail like
      // deployDivisions does. The finally still resets the button + _armySaving. #toctou
      if (S.model !== modelAtRequest) { if (statusEl) { statusEl.style.color = "#8b949e"; statusEl.textContent = "Saved — country changed while saving, so this result applies to the previous country."; } return; }
      S.model.file = d.file || S.model.file;
      // The file now reflects the current names, so each template's stable identity re-syncs to its saved
      // name — otherwise a SECOND rename would carry a stale _origName and miss its (now renamed) block. #tpl-identity
      // #army-save-overwrites-an-outside-edit — the file on disk is now what we just wrote, so the
      // fingerprint has to move with it. Without this the SECOND save compares against the pre-save file
      // and refuses its own work. A successful save must re-baseline every watcher it owns.
      if (d.fingerprint) S.model.fingerprint = d.fingerprint;
      S.model.templates.forEach((t) => { t._dirty = false; t._origName = t.name || ""; });
      S.model.divisions.forEach((dv) => { if (dv) delete dv._dirty; });
      setUnsaved(false);
      if (statusEl) {
        statusEl.style.color = dupWarn ? "#d29922" : "#3fb950";
        statusEl.textContent = dupWarn || (`✓ Saved ${pl(templates.length, "template")} + ${pl(S.model.divisions.length, "division")} → ${d.file}` + (d.oobWired ? " (wired)." : "."));
        // A names group the game cannot resolve leaves the divisions unnamed (#division-names-group-undefined),
        // and the OOB auto-wiring can report that it could not wire the file it just wrote. BOTH now go
        // through the shared write-note surface in loading-overlay.js — the one owner, so the message is a
        // dialog the user has to see rather than a status line the next save overwrites. Reading them here
        // as well would show the same thing twice. #army-save-notes-invisible
        // Say at the moment of saving — not only on load — that the other DLC branches are untouched, or
        // "✓ Saved" reads as "the army is saved". #army-dlc-variant-silent
        const otherFiles = (S.landVariants || []).filter((v) => v && v.file && v.file !== d.file);
        if (otherFiles.length) {
          statusEl.style.color = "#d29922";
          statusEl.textContent += `  ⚠ ${S.country}'s army is split across DLC variants — ${otherFiles.map((v) => v.file).join(", ")} still ${otherFiles.length === 1 ? "has" : "have"} the old version.`;
        }
      }
      renderTemplateList(); renderDeploy();
    } catch (e) { if (statusEl) { statusEl.style.color = "#f85149"; statusEl.textContent = "✗ " + (e.message || e); } }
    finally { btn.disabled = false; btn.textContent = orig; S._armySaving = false; }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSubtabs();
    initCollapsibleCards();
    showContext();
    initModSelector();
    loadPalette();
    const loadBtn = $("armyLoadCountryBtn"), inp = $("armyCountryInput");
    // Switching (or re-loading) a country while there are unsaved changes must ASK, not silently discard.
    const guardedLoad = (tag) => {
      if (!tag) return;
      if ((S.unsaved || hasStagedNavalAir() || hasStagedStockpile()) && S.country) {
        const what = S.unsaved ? "unsaved army changes"
          : hasStagedNavalAir() ? "staged ships/air groups (not yet Saved)"
          : "staged stockpile changes (not yet Saved)";
        if (!confirm(`You have ${what} for ${S.country}. Discard them and load ${tag}?`)) {
          if (inp) inp.value = S.country; // put the dropdown back where it was
          return;
        }
      }
      loadCountry(tag);
    };
    if (loadBtn && inp) {
      loadBtn.addEventListener("click", () => guardedLoad(inp.value));
      // A complete country dropdown (any mod, incl. add-ons/vanilla). Selecting one loads it right away.
      inp.addEventListener("change", () => guardedLoad(inp.value));
      if (window.NovaCountryPicker) {
        NovaCountryPicker.populate(inp, { modPath: modPath(), all: true }).then(() => {
          // keep the "— pick a country —" prompt selected until the user chooses
          inp.insertAdjacentHTML("afterbegin", '<option value="">— pick a country —</option>');
          inp.value = "";
          // Deep-link: army.html?tag=GER (e.g. Country Setup's "🪖 Set up army") auto-loads that country.
          try {
            const tag = (new URLSearchParams(location.search).get("tag") || "").trim().toUpperCase();
            if (tag && Array.prototype.some.call(inp.options, (o) => o.value === tag)) {
              inp.value = tag; loadCountry(tag);
              // The link means "set up this army" — land on Divisions even if the user last used
              // Equipment/Companies, or the loaded country is invisible and the link looks broken.
              const divBtn = Array.from(document.querySelectorAll(".army-subtab")).find((b) => b.dataset.tab === "divisions");
              if (divBtn && !divBtn.classList.contains("active")) divBtn.click();
            }
          } catch (_) {}
        });
      }
    }
    const newBtn = $("armyNewTplBtn");
    if (newBtn) newBtn.addEventListener("click", newTemplate);
    const saveBtn = $("armySaveBtn");
    if (saveBtn) saveBtn.addEventListener("click", saveArmy);
    const deployBtn = $("deployBtn");
    if (deployBtn) deployBtn.addEventListener("click", deployDivisions);
    // #deploy-state-id-blind-box — the Air-base state box next door has had a Browse picker since
    // #airbase-state-owner; the land one asked for the same numeric id with nothing but a placeholder.
    // There is no owner dropdown here — the deploy card is always about the country being edited — so the
    // ordering comes from S.country.
    const deployStBrowse = $("deployStateBrowseBtn");
    if (deployStBrowse) deployStBrowse.addEventListener("click", () => openStateBrowser({
      target: "deployState", status: "deployStatus", ownerFrom: "", title: "Pick a state to deploy in",
    }));
    // #commander-typed-from-memory — the same treatment for the Commander box beside it.
    const deployOffBrowse = $("deployOfficerBrowseBtn");
    if (deployOffBrowse) deployOffBrowse.addEventListener("click", () => { openCommanderBrowser(); });
    // Wait for the equipment scan before showing the form, so the Category dropdown has the mod's real land types.
    // The old guard only deferred when the scan had NOT STARTED — but initSubtabs' restore.click() kicks a scan off
    // synchronously BEFORE these listeners are wired, so `loading` was already true and the guard was always false
    // during exactly the multi-second (cold MD) window the user can click in. Then the form opened against unloaded
    // state and createFamily posted type:"" (which the server silently coerces to infantry = a mistyped family on
    // disk). Await an IN-FLIGHT scan too — reusing it rather than starting a second one. #newfamily-race
    const whenEquipReady = () => {
      if (S.equip.loaded) return Promise.resolve();
      if (S.equip.loading) return new Promise((res) => { const iv = setInterval(() => { if (S.equip.loaded || !S.equip.loading) { clearInterval(iv); res(); } }, 60); });
      return loadEquipment();
    };
    // Equipment sub-tab
    const eqNew = $("eqNewFamilyBtn");
    if (eqNew) eqNew.addEventListener("click", () => { whenEquipReady().then(() => showNewFamilyForm()); });
    // The plane ROLE checkboxes (allow_mission_type — air superiority / CAS / naval strike / interception …)
    // only render in the New-family form's AIRCRAFT branch, and that form always opened in LAND mode, so they
    // were invisible unless you happened to find the unlabelled "Kind" dropdown inside it. Give air its own
    // labelled entry point. showNewFamilyForm(domain) skips its own discard-guard when a domain is passed
    // (so the Kind re-render doesn't re-prompt), so run that guard here. #plane-roles-discoverability
    const eqNewAir = $("eqNewAirBtn");
    if (eqNewAir) eqNewAir.addEventListener("click", () => {
      if (S.equip.editorDirty && !confirm("Discard your unsaved equipment edits?")) return;
      S.equip.editorDirty = false;
      whenEquipReady().then(() => showNewFamilyForm("air")); // #newfamily-race (same in-flight gap as above)
    });
    const eqSearch = $("eqSearch");
    // Debounce so a 5-char search rebuilds the list ~once instead of per keystroke (each rebuild re-mounts
    // every icon). Combined with the shared icon memo, typing no longer blanks-and-reloads the arsenal. #icon-memo
    if (eqSearch) { let _eqT; eqSearch.addEventListener("input", () => { clearTimeout(_eqT); _eqT = setTimeout(renderEquipList, 150); }); }
    const eqShowBase = $("eqShowBase");
    if (eqShowBase) eqShowBase.addEventListener("change", () => { S.equip.showBase = eqShowBase.checked; renderEquipList(); });
    // Arsenal filters: variants on/off + add-a-country (each pick becomes a removable chip; none = all).
    const eqShowVar = $("eqShowVariants");
    if (eqShowVar) eqShowVar.addEventListener("change", () => { S.equip.showVariants = eqShowVar.checked; renderEquipList(); });
    const eqCF = $("eqCountryFilter");
    if (eqCF) eqCF.addEventListener("change", () => {
      const t = eqCF.value;
      if (t && !S.equip.varFilter.includes(t)) { S.equip.varFilter.push(t); renderCountryChips(); renderEquipList(); }
      eqCF.value = ""; // the select is an "add a country" control; the chips are the state
    });
    // Equipment editor: typing marks it dirty (feeds the discard-confirm + leave-guard); Enter saves —
    // or creates, when the New-family form is open. Delegated once, survives every re-render. #eq-editor-dirty
    const eqEd = $("eqEditor");
    if (eqEd) {
      eqEd.addEventListener("input", (e) => {
        const t = e.target; if (!t || t.tagName !== "INPUT" || t.disabled) return;
        S.equip.editorDirty = true;
        const b = $("eqSaveBtn") || $("vvSaveBtn") || $("nfCreateBtn"); if (b) b.classList.add("unsaved"); // same amber cue as Save army
      });
      // #enter-writes-without-save — ENTER USED TO PRESS SAVE FOR YOU, AND SAVE HERE MEANS WRITE TO DISK.
      //
      // This was a delegated keydown on the whole editor: Enter in ANY input clicked eqSaveBtn / vvSaveBtn /
      // nfCreateBtn, so tabbing through the stat boxes and hitting Enter out of habit wrote the equipment
      // straight into common/units/equipment. Measured on Millennium Dawn: typing in a stat box issued no
      // request, and one Enter issued POST /api/equipment/save for MBT_1.
      //
      // It also reached buttons that were not on screen. The chain falls back through three ids, so on a
      // chassis — whose own editor shows none of them — Enter still clicked whichever hidden one existed.
      //
      // Enter now commits the FIELD and nothing else: blur it, so any change/blur handler runs and the value
      // is definitely taken, and leave the writing to the Save button the user can see. The amber "unsaved"
      // cue set by the input handler above is what tells them it is still theirs to save.
      eqEd.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || !e.target || e.target.tagName !== "INPUT") return;
        e.preventDefault(); // never let it submit anything
        try { e.target.blur(); } catch (_) {}
        const st = $("eqSaveStatus");
        if (st) { st.style.color = "#8b949e"; st.textContent = "Entered — 💾 Save equipment when ready."; }
      });
    }
    // Deploy: Enter in any deploy field = Deploy here (fingers expect Enter to submit).
    for (const id of ["deployState", "deployCount", "deployOfficer", "deployEquip"]) {
      const el = $(id);
      if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const b = $("deployBtn"); if (b) b.click(); } });
    }
  });
})();
