"use strict";
/*
 * Shared "start the game with this for one / several / no countries" bridge, used by the Decision and
 * Spirit makers (and reusable elsewhere). It renders an owner picker + removable country chips + a
 * status line INTO a host element, loads the item's existing owners from /api/history/item-countries,
 * and writes them via /api/history/set-startup on save (unwiring any the user removed).
 *
 * Usage:
 *   const bridge = NovaOwnerBridge.attach({
 *     host: "decisionOwnerBridge", itemType: "decision",
 *     title: "Activate this decision at game start for…", applyVerb: "activate",
 *     getModPath: () => localStorage.getItem("activeModPath") || "",
 *   });
 *   bridge.load(itemId);   // when an item is opened (shows its current owner countries)
 *   bridge.clear();        // when starting a fresh item
 *   await bridge.sync(itemId); // after the item is saved (writes owners into the game)
 *   bridge.repopulate();   // after the active mod changes (refresh the picker list)
 */
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function attach(opts) {
    const host = typeof opts.host === "string" ? document.getElementById(opts.host) : opts.host;
    if (!host) return { load() {}, clear() {}, sync() {}, owners: () => new Set(), repopulate() {} };
    const itemType = opts.itemType;
    const applyVerb = opts.applyVerb || "apply";
    const getModPath = opts.getModPath || (() => localStorage.getItem("activeModPath") || "");

    host.innerHTML = `
      <label style="margin:0; font-weight:500; display:block; margin-bottom:6px;">${esc(opts.title || "Start the game with this for…")}</label>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <select class="ob-picker" style="padding:5px; background:#0d1117; border:1px solid #30363d; color:#c9d1d9; border-radius:4px; font-size:12px; min-width:220px; flex:1 1 220px;"></select>
        <button type="button" class="ob-add" style="padding:5px 10px; font-size:12px; cursor:pointer; background:#1f2937; border:1px solid #374151; color:#c9d1d9; border-radius:4px;">+ Add country</button>
      </div>
      <div class="ob-chips" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;"></div>
      <div class="ob-status" style="font-size:12px; min-height:16px; color:#8b949e; margin-top:6px;"></div>`;

    const picker = host.querySelector(".ob-picker");
    const addBtn = host.querySelector(".ob-add");
    const chipsEl = host.querySelector(".ob-chips");
    const statusEl = host.querySelector(".ob-status");
    let owners = new Set();
    let loaded = new Set(); // what was wired when we loaded (so removals get unwired on save)

    function setStatus(msg, color) { statusEl.textContent = msg || ""; statusEl.style.color = color || "#8b949e"; }
    function defaultStatus() {
      if (owners.has("__ALL__")) { setStatus(`Saving will ${applyVerb} this for EVERY country at game start.`); return; }
      const n = owners.size;
      setStatus(n ? `Saving will ${applyVerb} this for ${n} countr${n === 1 ? "y" : "ies"} at game start.` : "");
    }
    function renderChips() {
      chipsEl.innerHTML = "";
      if (!owners.size) { chipsEl.innerHTML = `<span style="color:#6e7681; font-size:12px;">No countries yet — pick one above and click “Add country”.</span>`; return; }
      [...owners].sort().forEach((tag) => {
        const chip = document.createElement("span");
        chip.style.cssText = "display:inline-flex; align-items:center; gap:5px; background:#1f2937; border:1px solid #30363d; border-radius:12px; padding:2px 6px 2px 10px; font-size:12px; color:#c9d1d9;";
        const chipLabel = tag === "__ALL__" ? "🌍 All countries" : tag;
        chip.innerHTML = `${esc(chipLabel)} <button type="button" title="Remove" style="background:transparent; border:none; color:#f85149; cursor:pointer; font-weight:bold; font-size:14px; line-height:1; padding:0 2px;">&times;</button>`;
        chip.querySelector("button").addEventListener("click", () => { owners.delete(tag); renderChips(); defaultStatus(); });
        chipsEl.appendChild(chip);
      });
    }
    async function populate() {
      if (window.NovaCountryPicker) { try { await window.NovaCountryPicker.populate(picker, { modPath: getModPath(), includeAll: true, all: true }); } catch (_e) {} }
    }
    addBtn.addEventListener("click", () => {
      const raw = (picker.value || "").trim();
      const tag = raw === "__ALL__" ? "__ALL__" : raw.toUpperCase();
      if (!tag) { setStatus("Pick a country from the list first.", "#e8a849"); return; }
      if (owners.has(tag)) { setStatus(tag === "__ALL__" ? "Already set to every country." : `${tag} is already in the list.`, "#e8a849"); return; }
      // "All countries" is exclusive: choosing it clears specific tags; choosing a specific tag clears it.
      if (tag === "__ALL__") { owners = new Set(["__ALL__"]); }
      else { owners.delete("__ALL__"); owners.add(tag); }
      renderChips(); defaultStatus();
    });

    async function load(itemId) {
      if (!itemId) { clear(); return; }
      try {
        const d = await (await fetch(`/api/history/item-countries?itemType=${encodeURIComponent(itemType)}&itemId=${encodeURIComponent(itemId)}&modPath=${encodeURIComponent(getModPath())}`)).json();
        const tags = (d && d.tags) || [];
        if (d && d.all) { owners = new Set(["__ALL__"]); loaded = new Set(["__ALL__"]); }
        else { owners = new Set(tags); loaded = new Set(tags); }
      } catch (_e) { owners = new Set(); loaded = new Set(); }
      renderChips(); defaultStatus();
    }
    function clear() { owners = new Set(); loaded = new Set(); renderChips(); setStatus(""); }
    async function sync(itemId) {
      if (!itemId) return { failed: [] };
      // #owner-write-refused-in-silence — THIS USED TO SWALLOW EVERY REFUSAL.
      //
      // Each call below was a bare fetch wrapped in `catch (_e) {}`, and a fetch RESOLVES on a 400 — so the
      // catch never even ran and a write the server refused was indistinguishable from one it performed.
      // The server refuses here for reasons the user can act on: no mod selected, the vanilla install is
      // read-only, or the item type cannot be granted this way. All of them were silent, and `loaded` was
      // then set to `owners` regardless, so the chips kept showing owners that are not on disk.
      const post = async (url, body) => {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        let data = null;
        try { data = await r.json(); } catch (_e) {}
        if (!r.ok || (data && data.error)) throw new Error((data && data.error) || `The server answered ${r.status}.`);
        return data;
      };
      const failed = [];
      const attempt = async (who, run) => {
        try { await run(); return true; } catch (e) { failed.push({ who, error: (e && e.message) || String(e) }); return false; }
      };
      const wasAll = loaded.has("__ALL__"), isAll = owners.has("__ALL__");
      // Toggle the single on_startup → every_country grant when "All countries" is turned on/off.
      const allAdded = (isAll && !wasAll) ? await attempt("All countries", () => post("/api/history/set-startup-all", { itemId, itemType, active: true, modPath: getModPath() })) : true;
      const allRemoved = (!isAll && wasAll) ? await attempt("All countries", () => post("/api/history/set-startup-all", { itemId, itemType, active: false, modPath: getModPath() })) : true;
      // Per-country writes (skip the __ALL__ sentinel). Switching TO all unwires any loaded specific tags.
      const writes = [];
      if (!isAll) {
        owners.forEach((tag) => { if (tag !== "__ALL__") writes.push({ tag, active: true }); });
        loaded.forEach((tag) => { if (tag !== "__ALL__" && !owners.has(tag)) writes.push({ tag, active: false }); });
      } else {
        loaded.forEach((tag) => { if (tag !== "__ALL__") writes.push({ tag, active: false }); });
      }
      const failedTags = new Map(); // tag -> the active flag we could not write
      for (const w of writes) {
        const ok = await attempt(w.tag, () => post("/api/history/set-startup", { tag: w.tag, itemId, itemType, active: w.active, modPath: getModPath() }));
        if (!ok) failedTags.set(w.tag, w.active);
      }
      // `loaded` is what we believe is ON DISK, and it is what the next sync diffs against. Record what
      // actually happened: an owner we failed to ADD is not there, and one we failed to REMOVE still is.
      const nowLoaded = new Set(owners);
      for (const [tag, wanted] of failedTags) { if (wanted) nowLoaded.delete(tag); else nowLoaded.add(tag); }
      if (!allAdded) nowLoaded.delete("__ALL__");
      if (!allRemoved) nowLoaded.add("__ALL__");
      loaded = nowLoaded;
      if (failed.length) {
        // Say it where the user is already looking, and leave it up rather than letting defaultStatus
        // overwrite it with a reassuring count.
        const first = failed[0];
        setStatus(`⚠ ${failed.length} owner setting${failed.length === 1 ? "" : "s"} could not be written — ${first.who}: ${first.error}`, "#f0a44e");
      }
      return { failed };
    }

    populate();
    renderChips();
    return { load, clear, sync, owners: () => owners, repopulate: populate };
  }

  window.NovaOwnerBridge = { attach };
})();
