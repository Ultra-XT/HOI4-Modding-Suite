document.addEventListener("DOMContentLoaded", () => {
  // Image fallback (CSP-safe): inline image error handlers are blocked by the page CSP (script-src 'self'),
  // so a thumbnail/preview whose image is missing would just show the browser's broken-image glyph. Instead,
  // mark images with data-fallback="…" and swap to it here via one capture-phase error listener (the error
  // event doesn't bubble, so capture is required). Guarded so a failing fallback can't loop.
  // Supports the project-wide convention, not just half of it: data-fallback swaps the src,
  // data-fallback-html REPLACES the broken <img> with markup, and data-hide-on-error removes it. Only the
  // first was implemented here, which is why every failing image on this page had to fall back to some other
  // PICTURE — and the one chosen was the newspaper background, so a missing event picture rendered the whole
  // 528x595 newspaper inside the newspaper's own photo slot. A fallback has to be able to say "this is not
  // art", or the only honest option is another wrong image.
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (!t || t.tagName !== "IMG" || !t.dataset) return;
    if (t.dataset.fallbackHtml) { const s = document.createElement("span"); s.innerHTML = t.dataset.fallbackHtml; t.replaceWith(s); return; }
    if (t.dataset.hideOnError != null) { t.style.display = "none"; return; }
    if (t.dataset.fallback && t.src.indexOf(t.dataset.fallback) < 0) t.src = t.dataset.fallback;
  }, true);

  const eventPictureUpload = document.getElementById("eventPictureUpload");
  const eventPictureId = document.getElementById("eventPictureId");
  const uploadStatus = document.getElementById("uploadStatus");
  const eventPicturePreview = document.getElementById("eventPicturePreview");

  // Retrieve active mod path from localStorage
  function getModPath() {
    return localStorage.getItem("activeModPath") || "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Exact inverse of the server's escapeLocalizationValue. Loc stores a line break as the two-char "\n",
  // a quote as \" and a backslash as \\ — loading that RAW form into the editor and re-saving re-escaped
  // the backslashes (\n → \\n → \\\\n …), corrupting the text a little more on EVERY save (live-e2e
  // finding: type a multi-line description, load it, save untouched → in-game shows literal "\n").
  // Unknown escapes keep their backslash verbatim so hand-authored oddities survive.
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

  function cleanScriptId(value, fallback) {
    const cleaned = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned || fallback;
  }

  // #event-namespace-lowercased — an event NAMESPACE must keep its case. Sending it through cleanScriptId
  // lowercased it, so `USA_FOCUS.9` was saved as `usa_focus.9` — a different event id. Two outcomes, both bad:
  //
  //   * if the event's file is not named after its namespace, the server cannot find `usa_focus.9`, writes a
  //     brand-new events/usa_focus.txt, and the real USA_FOCUS.9 is left untouched. The modder edits the event
  //     forever and nothing changes in game.
  //   * if the file IS named after the namespace — the normal convention — Windows' case-insensitive
  //     filesystem resolves events/serbia.txt onto the real Serbia.txt, so the ghost is appended there and the
  //     rename-cleanup then DELETES the genuine Serbia.1 block and its localisation. The event is gone.
  //
  // 34% of Millennium Dawn's events and 53% of vanilla's sit under a capitalised namespace.
  //
  // HOI4's rule (and the server's, at /api/events/save) is `[A-Za-z_][A-Za-z0-9_]*`: case is preserved, a
  // leading digit is not allowed. cleanScriptId stays as it is for the numeric id and the option-letter
  // suffix, where lowercasing is harmless.
  function cleanEventNamespace(value, fallback) {
    // A DOT IS LEGAL BETWEEN SEGMENTS — see #event-multi-segment-namespace. Replacing it with an underscore
    // silently renamed israel.coalition to israel_coalition, which is a different namespace and a different
    // file. Keep interior dots, collapse runs, and never leave one at either end.
    let cleaned = String(value || "")
      .trim()
      .replace(/[^A-Za-z0-9_.]+/g, "_")
      .replace(/\.{2,}/g, ".")
      .replace(/^[_.]+|[_.]+$/g, "");
    if (/^\d/.test(cleaned)) cleaned = "_" + cleaned; // a leading digit lexes as a number and breaks the file
    return cleaned || fallback;
  }

  // The full id this event was LOADED as. Editing the namespace or id box renames it, and the save has to be
  // told which block to remove or the old event stays behind (#event-rename). Null for a new event.
  let loadedEventFullId = null;
  // …and WHICH FILE the card came from. The sidebar groups by file, so a duplicated id shows as two cards
  // under two folders — but Delete/Save sent only the id, and the server resolved a single home file by
  // readdir order. Clicking the card under zzz_second.txt could rewrite or delete aaa_first.txt.
  // #event-wrong-file-targeted
  let loadedEventFileName = null;
  // The resolved fallback branch of a conditional title/desc block, for PREVIEW ONLY. Never written back:
  // the editable boxes stay empty for the block form so the writer keeps preserving it verbatim.
  let loadedConditionalDesc = null;
  let loadedConditionalTitle = null;

  function splitAiEventId(namespace, rawId) {
    // Case-preserving: lowercasing the namespace renames the event. #event-namespace-lowercased
    let ns = cleanEventNamespace(namespace, "custom_events");
    let id = String(rawId || "").trim();
    if (id.includes(".")) {
      const parts = id.split(".").filter(Boolean);
      if (parts.length > 1) {
        // Rejoin with a DOT, not an underscore. A namespace may legitimately contain dots — vanilla ships
        // MUN_czech.news, Millennium Dawn israel.coalition, The Road to 56 has 39 of them — so pasting the
        // full id `israel.coalition.5` into the id box used to yield the namespace `israel_coalition`, which
        // is a DIFFERENT namespace and a different file. Both the Save and Delete buttons route through here,
        // as does the AI-generated path. #event-multi-segment-namespace
        ns = cleanEventNamespace(parts.slice(0, -1).join("."), ns);
        id = parts[parts.length - 1];
      }
    }
    // The namespace is a PDX bareword — it becomes both the filename and `add_namespace`, so it must start
    // with a letter/underscore (a leading digit is lexed as a number and breaks the file). The id, by
    // contrast, is required to be an INTEGER after the dot, so it is left alone here (validated at save).
    // cleanEventNamespace already applies the leading-digit guard.
    return { namespace: ns, id: cleanScriptId(id, "1") };
  }

  function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function getEffectiveCountryTag() {
    const lastPath = localStorage.getItem("lastLoadedFocusFilePath") || "";
    const base = lastPath.split(/[/\\]/).pop() || "";
    const m = base.match(/^([A-Z0-9]{3})[_\-]/i);
    if (m) return m[1].toUpperCase();
    const lower = base.toLowerCase();
    if (lower.startsWith("afghanistan")) return "AFG";
    if (lower.startsWith("albania")) return "ALB";
    if (lower.startsWith("austria")) return "AUT";
    if (lower.startsWith("france")) return "FRA";
    if (lower.startsWith("germany")) return "GER";
    if (lower.startsWith("italy")) return "ITA";
    if (lower.startsWith("japan")) return "JAP";
    if (lower.startsWith("soviet_union")) return "SOV";
    if (lower.startsWith("united_kingdom")) return "ENG";
    if (lower.startsWith("usa")) return "USA";
    return "ZZZ";
  }

  // ── Event → country bridge: which countries this event belongs to, and WHEN it fires (a typed date) ──
  // The user picks one / several / no owner countries (chips) and types an in-game date (year.month.day at
  // hour). On Save we wire a country_event into each owner's history with the matching days+hours offset
  // from the mod's real start date. If the date is BEFORE the start, we warn (the game can't fire earlier).
  let eventOwners = new Set();   // tags the user wants this event to fire for
  let loadedOwners = new Set();  // tags that already had it when the event loaded (to unwire removals)
  // #all-countries-date-never-written — the schedule that was on disk when the event loaded. The fire date
  // does not live in the event file; it lives in the on_startup grant, so the only way to tell whether it
  // needs rewriting is to remember what it was.
  let loadedEventDays = 0;
  let loadedEventHours = 0;
  let modStartCache = { key: null, date: { year: 1936, month: 1, day: 1 } };

  async function getModStartDate() {
    const key = getModPath();
    if (modStartCache.key === key) return modStartCache.date;
    let date = { year: 1936, month: 1, day: 1 };
    try {
      const d = await (await fetch(`/api/mod/start-date?modPath=${encodeURIComponent(key)}`)).json();
      if (d && d.year) date = { year: d.year, month: d.month || 1, day: d.day || 1 };
    } catch (_e) {}
    modStartCache = { key, date };
    return date;
  }
  // Whole days between two {year,month,day} dates (leap-year accurate via UTC).
  function daysBetween(target, start) {
    return Math.round((Date.UTC(target.year, (target.month || 1) - 1, target.day || 1) -
                       Date.UTC(start.year, (start.month || 1) - 1, start.day || 1)) / 86400000);
  }
  function dateFromOffset(start, days) {
    const d = new Date(Date.UTC(start.year, (start.month || 1) - 1, (start.day || 1) + (days || 0)));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  const EVENT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // The little "🕓 when it fires" line under an event card. Built from the event's registered start-game
  // schedule (eventSchedules) + the mod start date, so the user sees the YEAR / day / hour at a glance
  // and can click in to edit. Returns "" for events with no fixed schedule (those are fired by other
  // events/decisions, so there's no calendar time to show).
  function eventScheduleBadgeHtml(fullId) {
    const s = eventSchedules[fullId];
    if (!s) return "";
    const start = modStartCache.date || { year: 1936, month: 1, day: 1 };
    const days = Math.max(0, s.days || 0);
    const hours = Math.max(0, s.hours || 0);
    const t = dateFromOffset(start, days);
    const hh = String(hours).padStart(2, "0");
    const when = (days === 0 && hours === 0)
      ? "At game start"
      : `${t.year} ${EVENT_MONTHS[(t.month || 1) - 1]} ${t.day}, ${hh}:00`;
    const tags = (s.tags || []);
    const owners = tags.length ? ` · ${tags.slice(0, 4).join(", ")}${tags.length > 4 ? "…" : ""}` : "";
    const title = `Registered to fire ${when}${tags.length ? " for " + tags.join(", ") : ""}. Click the event to edit its timing.`;
    return `<div class="event-card-when" style="font-size:10px; color:#6e7681; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${title}">🕓 ${when}${owners}</div>`;
  }
  function readDateFields() {
    const gv = (id) => parseInt((document.getElementById(id) || {}).value, 10);
    return { year: gv("eventDateYear"), month: gv("eventDateMonth"), day: gv("eventDateDay"), hour: gv("eventDateHour") };
  }
  function setDateFields(y, mo, d, h) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v != null ? v : ""); };
    set("eventDateYear", y); set("eventDateMonth", mo); set("eventDateDay", d);
    // `h || 0` turned "" into 0, so the two callers that blank the whole row — clearEventBridge, and the
    // "bare country_event = fires on day one; leave date blank" branch whose own comment says otherwise —
    // blanked three boxes and wrote a 0 into the fourth. An hour of 0 next to an empty date reads as a real
    // setting, and it was also what made a freshly-loaded event show up as having unsaved changes.
    // The default is for an hour that was not supplied ALONGSIDE A DATE; with no date there is nothing to
    // default.
    const haveDate = [y, mo, d].some((v) => v !== "" && v != null);
    set("eventDateHour", haveDate ? (h || 0) : "");
  }
  // For a self-firing event with no owner country, the fire-date can't be scheduled into anyone's
  // history, so we instead gate the event on `date > Y.M.D` in its OWN trigger. We tag that one line
  // `#nova_fire_date` so Nova owns it end-to-end: pulled back out into the date field on load (below)
  // and re-applied on save — it lives in the date field, never in the visible trigger box, so it can't
  // accumulate across re-saves. These two helpers are the strip/extract and the inject.
  const NOVA_FIRE_DATE_RE = /^[ \t]*date\s*>\s*(\d+)\.(\d+)\.(\d+)[^\n]*#\s*nova_fire_date[^\n]*$/m;
  function extractManagedFireDate(triggerText) {
    const text = String(triggerText == null ? "" : triggerText);
    const m = text.match(NOVA_FIRE_DATE_RE);
    if (!m) return { fireDate: null, trigger: text };
    const fireDate = { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
    const cleaned = text.replace(NOVA_FIRE_DATE_RE, "").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
    return { fireDate, trigger: cleaned };
  }
  function injectManagedFireDate(triggerText, fireDate) {
    const cleaned = extractManagedFireDate(triggerText).trigger;
    const line = `date > ${fireDate.year}.${fireDate.month || 1}.${fireDate.day || 1} #nova_fire_date`;
    return cleaned ? `${line}\n${cleaned}` : line;
  }
  function eventFullId() {
    const namespace = (document.getElementById("eventNamespace").value || "").trim();
    const id = (document.getElementById("eventId").value || "").trim();
    if (!namespace || !id || id.startsWith("new_event_")) return "";
    return `${namespace}.${id}`;
  }
  function renderOwnerChips() {
    const wrap = document.getElementById("eventOwnerChips");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!eventOwners.size) {
      wrap.innerHTML = `<span style="color:#6e7681; font-size:12px;">No countries yet — the event won't fire on its own (only if something else triggers it).</span>`;
      return;
    }
    [...eventOwners].sort().forEach((tag) => {
      const chip = document.createElement("span");
      chip.style.cssText = "display:inline-flex; align-items:center; gap:5px; background:#1f2937; border:1px solid #30363d; border-radius:12px; padding:2px 6px 2px 10px; font-size:12px; color:#c9d1d9;";
      const chipLabel = tag === "__ALL__" ? "🌍 All countries" : tag;
      chip.innerHTML = `${chipLabel} <button type="button" title="Remove" style="background:transparent; border:none; color:#f85149; cursor:pointer; font-weight:bold; font-size:14px; line-height:1; padding:0 2px;">&times;</button>`;
      chip.querySelector("button").addEventListener("click", () => { eventOwners.delete(tag); renderOwnerChips(); updateBridgeStatus(); });
      wrap.appendChild(chip);
    });
  }
  function updateBridgeStatus(msg, color) {
    const el = document.getElementById("eventBridgeStatus");
    if (!el) return;
    if (msg) { el.textContent = msg; el.style.color = color || "#8b949e"; return; }
    el.style.color = "#8b949e";
    if (eventOwners.has("__ALL__")) { el.textContent = "Saving will fire this event for EVERY country at the time below."; return; }
    const n = eventOwners.size;
    el.textContent = n ? `Saving will fire this event for ${n} countr${n === 1 ? "y" : "ies"} at the time below.` : "";
  }
  // Validate the typed date, show a friendly hint or a before-start warning, and return the offset to write.
  async function syncDateHint() {
    const start = await getModStartDate();
    const hint = document.getElementById("eventDateHint");
    const startStr = `${start.year}.${start.month}.${start.day}`;
    const f = readDateFields();
    if (!Number.isFinite(f.year)) { // no date typed → fire on day one
      if (hint) { hint.style.color = "#6e7681"; hint.textContent = `Leave blank to fire on day one (the ${startStr} start).`; }
      return { days: 0, hours: 0, valid: true };
    }
    const target = { year: f.year, month: Number.isFinite(f.month) ? f.month : 1, day: Number.isFinite(f.day) ? f.day : 1 };
    // HOI4 hours run 0–23 (0 = midnight, 23 = 11 PM); there is no hour 24. Warn instead of silently clamping.
    if (Number.isFinite(f.hour) && (f.hour < 0 || f.hour > 23)) {
      if (hint) { hint.style.color = "#e8a849"; hint.textContent = `⚠ Hour must be 0–23 (0 = midnight, 23 = 11 PM) — there's no hour ${f.hour}.`; }
      return { days: 0, hours: 0, valid: false };
    }
    const hours = Number.isFinite(f.hour) ? f.hour : 0;
    const days = daysBetween(target, start);
    if (days < 0) {
      if (hint) { hint.style.color = "#e8a849"; hint.textContent = `⚠ ${target.year}.${target.month}.${target.day} is before the mod's start (${startStr}). The game can't fire an event before the campaign begins — pick the start date or later.`; }
      return { days: 0, hours: 0, valid: false };
    }
    if (hint) {
      hint.style.color = "#6e7681";
      hint.textContent = (days === 0 && hours === 0)
        ? `Fires on day one (the ${startStr} start).`
        : `Fires ${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours} hour${hours === 1 ? "" : "s"}` : ""} into the game (mod starts ${startStr}).`;
    }
    return { days, hours, valid: true };
  }
  function clearEventBridge() {
    eventOwners = new Set();
    loadedOwners = new Set();
    loadedEventDays = 0; loadedEventHours = 0; // #all-countries-date-never-written
    setDateFields("", "", "", "");
    const hint = document.getElementById("eventDateHint"); if (hint) hint.textContent = "";
    renderOwnerChips();
    updateBridgeStatus();
  }
  async function loadEventBridge() {
    const fullId = eventFullId();
    const start = await getModStartDate();
    if (!fullId) { clearEventBridge(); return; }
    try {
      const d = await (await fetch(`/api/history/event-countries?itemId=${encodeURIComponent(fullId)}&modPath=${encodeURIComponent(getModPath())}`)).json();
      const tags = (d && d.tags) || [];
      if (d && d.all) { eventOwners = new Set(["__ALL__"]); loadedOwners = new Set(["__ALL__"]); }
      else { eventOwners = new Set(tags); loadedOwners = new Set(tags); }
      const days = (d && d.days) || 0;
      const hours = (d && d.hours) || 0;
      loadedEventDays = days; loadedEventHours = hours; // #all-countries-date-never-written
      if (days > 0 || hours > 0) {
        const t = dateFromOffset(start, days);
        setDateFields(t.year, t.month, t.day, hours);
      } else {
        // No owner-scheduled date — surface a Nova-managed global fire-date baked into the trigger
        // (date > Y.M.D #nova_fire_date) in the date field, and strip it from the visible trigger box
        // so the date is edited in one place only.
        const trgEl = document.getElementById("eventTrigger");
        const md = trgEl ? extractManagedFireDate(trgEl.value) : { fireDate: null };
        if (md.fireDate) {
          setDateFields(md.fireDate.year, md.fireDate.month, md.fireDate.day, 0);
          trgEl.value = md.trigger;
        } else {
          setDateFields("", "", "", ""); // bare country_event = fires on day one; leave date blank
        }
      }
      await syncDateHint();
    } catch (_e) {
      eventOwners = new Set(); loadedOwners = new Set();
    }
    renderOwnerChips();
    updateBridgeStatus();
  }
  // The "Event Info" card shown when an existing event is clicked: its flags, who sees it, and — via the
  // reverse-lookup endpoint — WHAT fires it (which focus / decision / on-action / other event).
  function _evPill(text, color) {
    return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:#161b22;color:' + (color || "#c9d1d9") + ';border:1px solid ' + (color ? color + "66" : "#30363d") + ';">' + text + "</span>";
  }
  async function renderEventInfo(evt) {
    const card = document.getElementById("eventInfoCard");
    const flagsEl = document.getElementById("eventInfoFlags");
    const trigEl = document.getElementById("eventInfoTriggers");
    if (!card || !flagsEl || !trigEl) return;
    if (!evt || evt.isDraft || !evt.fullId) { card.style.display = "none"; return; }
    card.style.display = "";
    const typeLabel = { country_event: "📜 Country event", news_event: "📰 News event", state_event: "🗺 State event", unit_leader_event: "⚔️ Leader event", operative_leader_event: "🕵️ Operative event" }[evt.type] || "📜 Event";
    const flags = [_evPill(typeLabel)];
    if (evt.major === "yes") flags.push(_evPill("🔴 Major", "#f85149"));
    if (evt.hidden === "yes") flags.push(_evPill("👁 Hidden — no popup", "#8b949e"));
    if (evt.fireOnce === "yes") flags.push(_evPill("1️⃣ Fires once", "#d29922"));
    if (evt.triggeredOnly === "yes") flags.push(_evPill("🔒 Triggered only", "#58a6ff"));
    else if (evt.mtthDays > 0) flags.push(_evPill("⏱ ~" + evt.mtthDays + "d mean-time", "#3fb950"));
    flagsEl.innerHTML = flags.join("");
    trigEl.innerHTML = '<span style="color:#6e7681;">Looking up what fires this event…</span>';
    const id = evt.fullId;
    try {
      const mp = getModPath();
      const [trg, scope] = await Promise.all([
        fetch(`/api/events/triggers?id=${encodeURIComponent(id)}&modPath=${encodeURIComponent(mp)}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/history/event-countries?itemId=${encodeURIComponent(id)}&modPath=${encodeURIComponent(mp)}`).then((r) => r.json()).catch(() => ({})),
      ]);
      if (eventFullId() !== id) return; // the user clicked a different event while this was loading
      const map = (arr, fmt) => (arr || []).map(fmt);
      let by = [];
      by = by.concat(map(trg.focuses, (f) => '🎯 Focus <b style="color:#58a6ff;">' + escapeHtml(f.focus) + '</b> <span style="color:#6e7681;">(' + escapeHtml(f.file) + ")</span>"));
      by = by.concat(map(trg.decisions, (d) => "⚖️ Decision <b>" + escapeHtml(d.decision) + "</b>"));
      by = by.concat(map(trg.onActions, (o) => "📅 On-action <b>" + escapeHtml(o.onAction) + "</b>"));
      by = by.concat(map(trg.events, (e) => "📜 Event <b>" + escapeHtml(e.event) + "</b>"));
      by = by.concat(map(trg.scriptedEffects, (s) => "⚙️ Scripted effect <b>" + escapeHtml(s.effect) + "</b>"));
      by = by.concat(map(trg.scriptedGuis, (g) => "🖱️ Scripted GUI <b>" + escapeHtml(g.gui) + "</b>"));
      const lines = [];
      // HOI4 rule: an event fires on its own ONLY via mean_time_to_happen. With is_triggered_only = no AND no
      // MTTH, the game never checks its trigger — so if nothing else fires it, it never fires at all.
      const wontFire = evt.triggeredOnly !== "yes" && !(evt.mtthDays > 0) && by.length === 0;
      if (by.length) {
        lines.push('<span style="color:#8b949e;">Triggered by:</span><div style="padding-left:2px;margin-top:2px;">' + by.map((t) => "• " + t).join("<br>") + "</div>");
        if (evt.triggeredOnly !== "yes" && !(evt.mtthDays > 0)) lines.push('<div style="color:#6e7681;margin-top:4px;font-size:11px;">(Not "Triggered only" and no mean-time, so it only fires via the above.)</div>');
      } else if (evt.triggeredOnly === "yes") {
        lines.push('🔍 <span style="color:#8b949e;">No focus, decision, on-action, scripted effect, or scripted GUI in this mod fires it directly — it may be triggered dynamically (e.g. from another mod or built in code), or it isn\'t used anywhere.</span>');
      } else if (evt.mtthDays > 0) {
        lines.push("⏱ <span style=\"color:#8b949e;\">Fires on its own after ~" + evt.mtthDays + " days (mean time to happen) once its trigger conditions are met.</span>");
      } else {
        lines.push('<span style="color:#f0a44e;font-weight:600;">⚠️ This event won\'t fire on its own.</span> <span style="color:#8b949e;">It isn\'t "Triggered only" and has no mean-time-to-happen, so HOI4 never checks its trigger. Give it a mean-time (⚙ Advanced ▸ timing), or set "Triggered only" and fire it from a focus / decision.</span>');
      }
      if (wontFire) flagsEl.insertAdjacentHTML("beforeend", _evPill("⚠️ Won't fire", "#f0a44e"));
      let scopeLine = "";
      if (evt.type === "news_event") scopeLine = "🌍 Shown to <b>everyone</b> in the World News.";
      else if (scope && scope.all) scopeLine = "🌍 Granted to <b>ALL countries</b> at game start.";
      else if (scope && Array.isArray(scope.tags) && scope.tags.length) scopeLine = "🏳️ Fired at start for: <b>" + scope.tags.map(escapeHtml).join(", ") + "</b>.";
      else if ((trg.focuses || []).length) scopeLine = "🏳️ Fires for whichever country completes the focus above.";
      if (scopeLine) lines.push('<div style="margin-top:6px;padding-top:6px;border-top:1px solid #21262d;">' + scopeLine + "</div>");
      trigEl.innerHTML = lines.join("");
    } catch (_e) {
      trigEl.innerHTML = '<span style="color:#8b949e;">Couldn\'t look up what fires this event.</span>';
    }
  }
  // Write the chosen owners into the game (called after the event file is saved, with the final id).
  async function syncEventOwnersToGame(fullId) {
    if (!fullId) return { failed: [] };
    const t = await syncDateHint();
    const eventDays = Math.max(0, t.days || 0);
    const eventHours = Math.max(0, t.hours || 0);
    // #all-countries-date-never-written — syncDateHint reports `valid`, and nothing read it. On a rejected
    // date (an hour outside 0–23 is the reachable case) it returns { days: 0, hours: 0, valid: false }, so
    // the event was quietly scheduled for day one and the save reported success. Say so instead: the caller
    // prints `failed` beside the save result.
    if (t && t.valid === false) {
      return { failed: [{ who: "Fire date", error: "the date or hour is not valid, so the game-start schedule was left alone." }] };
    }
    // #owner-write-refused-in-silence — THIS USED TO SWALLOW EVERY REFUSAL.
    //
    // A fetch RESOLVES on a 400, so the `catch (_e) {}` around each call below never even ran: a write the
    // server refused was indistinguishable from one it performed. Picking a state_event or an
    // operative_leader_event as an owner answers 400 "…nothing was written", and the user was told the
    // event had saved with those owners — then loadedOwners recorded them, so reopening the event showed
    // owners that are not on disk and the next save would not retry them.
    const post = async (url, body) => {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      let data = null;
      try { data = await r.json(); } catch (_e) {}
      if (!r.ok || (data && data.error)) throw new Error((data && data.error) || `The server answered ${r.status}.`);
      return data;
    };
    // What did not get written, and why — reported to the user by the caller.
    const failed = [];
    const attempt = async (who, run) => {
      try { await run(); return true; } catch (e) { failed.push({ who, error: (e && e.message) || String(e) }); return false; }
    };
    const wasAll = loadedOwners.has("__ALL__"), isAll = eventOwners.has("__ALL__");
    // Toggle the single on_startup → every_country grant when "All countries" is turned on/off.
    // #all-countries-date-never-written — THE DATE LIVES IN THIS GRANT, SO A CHANGED DATE HAS TO REWRITE IT.
    //
    // This fired only when All-countries was being switched ON (isAll && !wasAll). For an event that was
    // already granted to everyone, changing the fire date sent no request at all: the event file saved, the
    // on_startup grant kept its old delay, and the user was told it had saved. The per-country branch below
    // does not cover it either — when isAll is set, it only ever REMOVES individual tags.
    //
    // Rewriting on a changed schedule as well. Compared against what was on disk at load, so an ordinary
    // save of an unchanged event still writes nothing.
    const scheduleChanged = eventDays !== loadedEventDays || eventHours !== loadedEventHours;
    const allAdded = (isAll && (!wasAll || scheduleChanged))
      ? await attempt("All countries", () => post("/api/history/set-startup-all", { itemId: fullId, itemType: "event", active: true, eventDays, eventHours, modPath: getModPath() }))
      : true;
    const allRemoved = (!isAll && wasAll) ? await attempt("All countries", () => post("/api/history/set-startup-all", { itemId: fullId, itemType: "event", active: false, modPath: getModPath() })) : true;
    const writes = [];
    if (!isAll) {
      eventOwners.forEach((tag) => { if (tag !== "__ALL__") writes.push({ tag, active: true }); });
      loadedOwners.forEach((tag) => { if (tag !== "__ALL__" && !eventOwners.has(tag)) writes.push({ tag, active: false }); });
    } else {
      loadedOwners.forEach((tag) => { if (tag !== "__ALL__") writes.push({ tag, active: false }); });
    }
    const failedTags = new Map(); // tag -> the active flag we could not write
    for (const w of writes) {
      const ok = await attempt(w.tag, () => post("/api/history/set-startup", { tag: w.tag, itemId: fullId, itemType: "event", active: w.active, eventDays, eventHours, modPath: getModPath() }));
      if (!ok) failedTags.set(w.tag, w.active);
    }
    // loadedOwners is what we believe is ON DISK, and it is what the next save diffs against. Record what
    // actually happened: an owner we failed to ADD is not there, and one we failed to REMOVE still is.
    const nowLoaded = new Set(eventOwners);
    for (const [tag, wanted] of failedTags) { if (wanted) nowLoaded.delete(tag); else nowLoaded.add(tag); }
    if (!allAdded) nowLoaded.delete("__ALL__");
    if (!allRemoved) nowLoaded.add("__ALL__");
    loadedOwners = nowLoaded;
    // #all-countries-date-never-written — re-anchor the schedule too, or a second save in the same session
    // would compare against the ORIGINAL date and rewrite a grant that is already correct. Only when the
    // write went through: after a failure the disk still holds the old delay.
    if (allAdded) { loadedEventDays = eventDays; loadedEventHours = eventHours; }
    return { failed };
  }
  // Advanced Settings opt-in: does the server currently allow writing into the real vanilla HOI4 install?
  // It is off on every fresh launch. When vanilla is the active workspace and this is false, every write
  // endpoint here rejects AFTER the round-trip (a raw "Save failed" toast), so we grey out the write
  // controls up-front instead — the same honest read-only treatment Country Setup uses. #vanilla-ro
  let vanillaEditsAllowed = false;
  const EV_WRITE_BTN_IDS = ["saveEventBtn", "duplicateEventBtn", "deleteEventBtn", "eventPictureUploadBtn"];
  function setWriteControlsLocked(locked) {
    const why = "Vanilla is read-only. Select or create a mod (or enable “Allow editing vanilla game files” in Settings) to edit.";
    EV_WRITE_BTN_IDS.forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (locked) {
        if (!btn.disabled) {
          if (btn.dataset.origTitle === undefined) btn.dataset.origTitle = btn.getAttribute("title") || "";
          btn.disabled = true; btn.dataset.vanillaLocked = "1"; btn.title = why;
        }
      } else if (btn.dataset.vanillaLocked === "1") {
        btn.disabled = false; delete btn.dataset.vanillaLocked; btn.title = btn.dataset.origTitle || "";
      }
    });
  }
  function updateVanillaBanner() {
    const banner = document.getElementById("vanillaBanner");
    if (!banner) return;
    const sel = document.getElementById("headerModSelector") || document.getElementById("modSelector");
    if (!sel) return;
    const selectedText = sel.options[sel.selectedIndex]?.text || "";
    // #vanilla-by-name — the flag set on the option, never the option's TEXT. A mod called
    // "Vanilla Plus" was locked read-only: its write controls were disabled and its banner shown.
    const isVanilla = !!(sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].dataset.vanilla === "1");
    banner.style.display = isVanilla ? "" : "none";
    setWriteControlsLocked(isVanilla && !vanillaEditsAllowed);
  }

  // Initialize Active Mod Selector
  async function initModSelector(onChangedCallback) {
    const selector = document.getElementById("headerModSelector");
    if (!selector) return;
    try {
      // Learn whether vanilla writes are permitted (advanced Settings) before the banner/lock first runs.
      try {
        const s = await fetch("/api/settings/allow-vanilla-edits").then((r) => r.json());
        vanillaEditsAllowed = Boolean(s && s.allowed);
      } catch (_) { vanillaEditsAllowed = false; }
      const response = await fetch("/api/mods/list");
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      selector.innerHTML = "";
      if (!data.mods || data.mods.length === 0) {
        selector.innerHTML = `<option value="">-- No Mods Found --</option>`;
        return;
      }
      
      let active = localStorage.getItem("activeModPath") || "";
      if (!active) {
        const lastPath = localStorage.getItem("lastLoadedFocusFilePath") || "";
        const match = lastPath.match(/(.*)[\\/]common[\\/]national_focus/i);
        if (match) {
          active = match[1];
          localStorage.setItem("activeModPath", active);
        }
      }
      
      data.mods.forEach(mod => {
        const opt = document.createElement("option");
        opt.value = mod.path;
        opt.textContent = mod.name;
        // #vanilla-by-name — the server publishes a PATH-based `isVanilla`, and its own comment says to
        // key off that and NOT a "vanilla" substring in the name, which false-positives on real mods
        // like "Vanilla Plus". The path check is only a fallback for an older server.
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
      // the mod). Do NOT blank + persist the fallback (index 0 = the prepended vanilla entry) over a non-empty
      // selection — that turns every custom sprite into the beige placeholder and STICKS across reloads. Keep
      // the stored value (it self-heals when the mod reappears) and show it as a "(not detected)" placeholder
      // so the selector isn't blank. Only adopt+persist a default when nothing was stored.
      if (active && !data.mods.some(m => normalizePath(m.path) === normalizePath(active))) {
        const opt = document.createElement("option");
        opt.value = active;
        opt.textContent = (String(active).split(/[\\/]/).filter(Boolean).pop() || active) + " (not detected)";
        selector.insertBefore(opt, selector.firstChild);
      }
      if (!active && data.mods.length > 0) {
        active = data.mods[0].path;
        localStorage.setItem("activeModPath", active);
      }
      selector.value = active;
      updateVanillaBanner();
      
      selector.addEventListener("change", (e) => {
        const selected = e.target.value;
        // #makers-lose-unsaved-work — switching mod reloads the list and abandons the editor. Put the
        // selector back BEFORE asking, so cancelling leaves it naming the mod that is actually loaded.
        if (evUnsaved && evUnsaved.isDirty()) {
          const previous = localStorage.getItem("activeModPath") || "";
          selector.value = previous;
          evUnsaved.confirmDiscard("Switch mod", () => {
            selector.value = selected;
            selector.dispatchEvent(new Event("change"));
          });
          return;
        }
        localStorage.setItem("activeModPath", selected);
        localStorage.setItem("lastLoadedFocusFilePath", selected + "/common/national_focus/mod.txt");
        updateVanillaBanner();
        if (typeof window.loadGenesisScriptedDefs === "function") window.loadGenesisScriptedDefs();
        if (typeof onChangedCallback === "function") onChangedCallback();
      });
    } catch (err) {
      console.error("Failed to initialize mod selector:", err);
    }
  }

  // #makers-lose-unsaved-work — THIS PAGE THREW AWAY A FINISHED EVENT WITHOUT ASKING.
  //
  // An event is the most expensive thing to lose in this app: a trigger, an immediate block, an after
  // block, and an effect script per option. Clicking another event in the list simply overwrote all of it,
  // and so did changing the mod. There was no dirty flag, no guard and no confirmation anywhere on the page.
  //
  // novaWatchUnsaved (loading-overlay.js) owns the pattern — snapshot on load, compare before anything
  // replaces the editor — so that undoing an edit by hand makes the page quietly clean again. Scoped to
  // .event-editor-panel, which excludes the event-list search and the picture-picker search: typing in
  // either must never raise an unsaved-work prompt. The AI prompt box is inside the panel but is an
  // instruction to the generator, never written to the mod, so it is ignored on purpose.
  const evUnsaved = (typeof window.novaWatchUnsaved === "function") ? window.novaWatchUnsaved({
    root: ".event-editor-panel",
    label: "the Event Maker",
    saveButtonId: "saveEventBtn",
    ignoreIds: ["aiEventPrompt"],
    // #owner-chips-are-unsaved-work — the "fire this event for…" chips are spans over a JS Set, invisible
    // to a snapshot of form controls, so removing one was discarded with no prompt. Sorted, so the order
    // they were added in is not mistaken for a change. The Spirit and Decision makers own the same widget
    // and adopted this hook; this page owns it too.
    extra: () => [...eventOwners].sort().join(","),
  }) : null;

  let allEvents = [];
  let activeDraft = null;
  // eventId -> { days, hours, tags } for events scheduled at game start (from history/countries).
  // Loaded once per mod by loadEventsList so each card can show WHEN it fires (year/day/hour).
  let eventSchedules = {};
  const expandedFolders = new Set();
  let autoSelectFullId = null;

  function renderEventsList(events, filterText = "") {
    const eventsList = document.getElementById("eventsList");
    if (!eventsList) return;
    eventsList.innerHTML = "";

    const groups = {};
    events.forEach(evt => {
      const file = evt.fileName || "events.txt";
      if (!groups[file]) groups[file] = [];
      groups[file].push(evt);
    });

    if (activeDraft) {
      groups["Drafts"] = [{
        fullId: activeDraft.fullId,
        title: activeDraft.title,
        isDraft: true,
        fileName: "events.txt",
        namespace: activeDraft.namespace,
        id: activeDraft.id,
        type: activeDraft.type,
        description: activeDraft.description,
        picture: activeDraft.picture,
        triggeredOnly: activeDraft.triggeredOnly,
        options: activeDraft.options
      }];
    }

    const fileKeys = Object.keys(groups);
    if (fileKeys.length === 0) {
      eventsList.innerHTML = `<div style="padding: 12px; color: #8b949e; font-size: 12px; text-align: center;">No events found in mod folder. Click "+ Create New Event" to start fresh!</div>`;
      return;
    }

    let anyMatched = false;
    fileKeys.forEach(fileName => {
      const isDraftFolder = fileName === "Drafts";
      const fileEvents = groups[fileName];

      let matchedEvents = fileEvents;
      if (filterText) {
        matchedEvents = fileEvents.filter(evt => evt.fullId.toLowerCase().includes(filterText) || (evt.title && evt.title.toLowerCase().includes(filterText)));
        if (matchedEvents.length === 0) return;
      }
      anyMatched = true;

      const fileDiv = document.createElement("div");
      fileDiv.className = "category-container";

      const fileTitle = document.createElement("div");
      const hasAutoSelect = autoSelectFullId && matchedEvents.some(evt => evt.fullId === autoSelectFullId);
      const isExpanded = !!filterText || isDraftFolder || expandedFolders.has(fileName) || hasAutoSelect;
      fileTitle.className = "category-title" + (isExpanded ? " expanded" : "");
      fileTitle.innerHTML = `
        <svg class="folder-chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        <svg class="folder-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        <span class="folder-name-text">${fileName}</span>
        <span class="folder-count-badge">${matchedEvents.length}</span>
      `;
      fileDiv.appendChild(fileTitle);

      const itemsContainer = document.createElement("div");
      itemsContainer.className = "category-items";
      itemsContainer.style.display = isExpanded ? "block" : "none";
      fileDiv.appendChild(itemsContainer);

      let rendered = false;
      const doRenderItems = () => {
        if (rendered) return;
        rendered = true;
        itemsContainer.innerHTML = "";

        matchedEvents.slice(0, 150).forEach(evt => {
          const item = document.createElement("div");
          item.className = "event-item-card" + (evt.isDraft ? " draft" : "");
          if (evt.isDraft) {
            item.id = "draft-item-event";
          }

          // Strip loc DISPLAY codes (§/[SCOPE.Get…]/£) so the card reads the way a player sees it — the
          // preview panel already does this, so the sidebar was the outlier leaking raw codes. Escape both
          // fields (they go into innerHTML) and give the clipped title a hover tooltip with the full text.
          // Strip FIRST, then fall back. Choosing the fallback on the RAW value meant a title made entirely
          // of runtime tokens stripped to "" and the card rendered blank instead of "No Title" — vanilla has
          // 13 such titles ([DEN.GetDanishIndependenceTitle], [GetPurgeEventTitles], …), MD 1. The canonical
          // stripper now also removes $KEY$ and [?var|%fmt], so more titles reach that state.
          const cardTitle = stripLocDisplayCodes(evt.title || "") || "No Title";
          item.innerHTML = `
            <div style="font-weight: 600; color: ${evt.isDraft ? '#e8a849' : '#58a6ff'};" class="event-card-id">${escapeHtml(evt.fullId)}</div>
            <div style="font-size: 11px; color: #8b949e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" class="event-card-title" title="${escapeHtml(cardTitle)}">${escapeHtml(cardTitle)}</div>
            ${evt.isDraft ? "" : eventScheduleBadgeHtml(evt.fullId)}
          `;

          item.addEventListener("click", () => {
            let bridgeLoad = null; // set below when this event's owner/date bridge is loaded asynchronously
            // #makers-lose-unsaved-work — ask before this replaces a filled-in editor. On "discard" the
            // watcher is already clean, so re-clicking runs straight through rather than asking twice.
            if (evUnsaved && evUnsaved.isDirty()) {
              evUnsaved.confirmDiscard("Switch event", () => item.click());
              return;
            }
            document.querySelectorAll(".event-item-card").forEach(el => {
              el.style.borderColor = el.id === "draft-item-event" ? "#e8a849" : "#30363d";
            });
            item.style.borderColor = "#58a6ff";

            loadedEventFullId = evt.fullId;
            loadedEventFileName = evt.fileName || null;
            // 🈯 SPLIT ON THE LAST DOT. HOI4 turns everything after it into an integer, so the namespace is
            // everything before — and a namespace may contain dots of its own (vanilla's MUN_czech.news,
            // Millennium Dawn's israel.coalition, 39 of them in The Road to 56; 756 events in total).
            // Taking parts[0]/parts[1] read `israel.coalition.5` as namespace `israel`, id `coalition`, and
            // the save then renamed it to israel.1 — deleting the real event. uniqueEventLocalId below
            // (/^(.+)\.(\d+)$/) and splitAiEventId have always done this correctly.
            // #event-multi-segment-namespace
            const idSplit = /^(.+)\.([^.]+)$/.exec(String(evt.fullId || ""));
            document.getElementById("eventNamespace").value = (idSplit && idSplit[1]) || "custom_events";
            document.getElementById("eventId").value = (idSplit && idSplit[2]) || "";
            document.getElementById("eventType").value = evt.type || "country_event";
            document.getElementById("eventTitle").value = unescapeLocForEdit(evt.title || "");
            document.getElementById("eventDescription").value = unescapeLocForEdit(evt.description || "");
            // A `desc = { text = KEY trigger = { … } }` block has no single key, so the box above is empty
            // for it — correctly, because writing one branch's text back would flatten a block that has
            // several. Kept OUT of the box and used only by the preview, so the author can finally see the
            // copy they wrote instead of demo prose. #conditional-desc-previews-as-invented-prose
            loadedConditionalDesc = evt.conditionalDesc || null;
            loadedConditionalTitle = evt.conditionalTitle || null;
            refreshDynamicTextHint("eventTitle", "eventTitleDynamicHint");
            refreshDynamicTextHint("eventDescription", "eventDescDynamicHint");
            document.getElementById("eventPictureId").value = evt.picture || "";
            updateIconPreview(evt.picture || "");
            if (document.getElementById("eventTriggeredOnly")) {
              document.getElementById("eventTriggeredOnly").value = evt.triggeredOnly === "yes" ? "yes" : "no";
            }
            if (document.getElementById("eventHidden")) document.getElementById("eventHidden").checked = evt.hidden === "yes";
            if (document.getElementById("eventFireOnce")) document.getElementById("eventFireOnce").checked = evt.fireOnce === "yes";
            if (document.getElementById("eventMajor")) document.getElementById("eventMajor").checked = evt.major === "yes";
            if (document.getElementById("eventMtthDays")) document.getElementById("eventMtthDays").value = evt.mtthDays || 0;
            if (document.getElementById("eventTrigger")) document.getElementById("eventTrigger").value = evt.trigger || "";
            if (document.getElementById("eventImmediate")) document.getElementById("eventImmediate").value = evt.immediate || "";
            if (document.getElementById("eventAfter")) document.getElementById("eventAfter").value = evt.after || "";
            if (document.getElementById("eventTimeoutDays")) document.getElementById("eventTimeoutDays").value = evt.timeoutDays || 0;
            if (window.__novaRefreshEventTopFields) window.__novaRefreshEventTopFields();

            optionsList.innerHTML = "";
            optionCount = 0;
            if (Array.isArray(evt.options)) {
              evt.options.forEach(opt => {
                optionCount++;
                const optDiv = document.createElement("div");
                optDiv.className = "event-option";
                optDiv.innerHTML = `
                  <button class="remove-opt-btn" title="Remove Option" type="button">&times;</button>
                  <div style="margin-bottom: 8px;">
                    <label>Option ${optionCount} Name</label>
                  </div>
                  <input type="text" class="opt-name" value="${escapeHtml(opt.name || '')}" placeholder="custom_events.1.a" style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; margin-bottom: 8px;" />
                  
                  <label style="display: block; margin-bottom: 4px; color: #c9d1d9; font-size: 12px;">Option Title Text (e.g. Great!)</label>
                  <input type="text" class="opt-title" value="${escapeHtml(unescapeLocForEdit(opt.title || ''))}" placeholder="Great!" style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; margin-bottom: 8px;" />
                  
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 4px;">
                    <label style="margin: 0; color: #c9d1d9; font-weight: 600; font-size: 12px;">Effects Script</label>
                    <div class="effect-quick-inserts" style="display: flex; gap: 6px;">
                      <button class="quick-insert-btn" data-type="spirit" type="button" style="background: #1f2937; border: 1px solid #374151; color: #10b981; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Spirit</button>
                      <button class="quick-insert-btn" data-type="tech" type="button" style="background: #1f2937; border: 1px solid #374151; color: #3b82f6; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Tech</button>
                      <button class="quick-insert-btn" data-type="event" type="button" style="background: #1f2937; border: 1px solid #374151; color: #ec4899; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Event</button>
                      <button class="quick-insert-btn" data-type="decision" type="button" style="background: #1f2937; border: 1px solid #374151; color: #eab308; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Decision</button>
                    </div>
                  </div>
                  <textarea class="opt-script" placeholder="add_political_power = 50\nadd_stability = 0.10" style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; min-height: 80px; font-family: monospace;">${escapeHtml(opt.script || '')}</textarea>
                  <div class="genesis-preview" style="display:none;"></div>
                  ${optionExtraFieldsHTML(opt)}
                `;
                optDiv.querySelector(".remove-opt-btn").addEventListener("click", () => {
                  optDiv.remove();
                  renumberOptionLabels();
                  updateLivePreview();
                });
                optDiv.querySelector(".opt-title").addEventListener("input", updateLivePreview);
                optionsList.appendChild(optDiv);
                wireOptionGenesisPreview(optDiv);
              });
            }
            updateLivePreview();

            if (evt.isDraft) {
              document.getElementById("aiStatus").textContent = "Editing Draft Event template!";
              document.getElementById("aiStatus").style.color = "#e8a849";
              clearEventBridge(); // a draft has no saved id yet — nothing to wire
              if (document.getElementById("deleteEventBtn")) document.getElementById("deleteEventBtn").classList.add("is-hidden");
            } else {
              document.getElementById("aiStatus").textContent = `Loaded ${evt.fullId}!`;
              document.getElementById("aiStatus").style.color = "#2ea043";

              // Captured, because the editor is not finished loading when this returns: the bridge fetches
              // the event's schedule and then writes the fire-date fields — and can lift a Nova-managed
              // `date > Y.M.D` line out of the trigger box into them. #makers-lose-unsaved-work
              bridgeLoad = loadEventBridge(); // which countries fire this at start, + the year

              if (document.getElementById("deleteEventBtn")) document.getElementById("deleteEventBtn").classList.remove("is-hidden");
            }
            renderEventInfo(evt); // flags + who fires this event (focus / decision / on-action / …)
            // Everything synchronous has populated the editor; THIS is what "unchanged" means from here on
            // — and again once the asynchronous half lands, or every loaded event would look edited before
            // the user had touched it. Measured on Millennium Dawn: without the second call, eventDateHour
            // moved from "" to "0" about 200ms after the click and the page announced unsaved changes.
            if (evUnsaved) {
              evUnsaved.markClean();
              // …UnlessTouched: the bridge fetch is slow enough to type into, and a plain markClean here
              // would adopt those keystrokes as the unedited state and let the next click discard them.
              Promise.resolve(bridgeLoad).then(() => evUnsaved.markCleanUnlessTouched()).catch(() => {});
            }
          });

          if (activeDraft && evt.isDraft && activeDraft.autoSelect) {
            activeDraft.autoSelect = false;
            setTimeout(() => item.click(), 50);
          }

          if (autoSelectFullId && evt.fullId === autoSelectFullId) {
            autoSelectFullId = null;
            setTimeout(() => item.click(), 50);
          }

          itemsContainer.appendChild(item);
        });
        if (matchedEvents.length > 150) {
          const _m = document.createElement("div");
          _m.style.cssText = "padding:8px 12px; color:#8b949e; font-size:11px; font-style:italic;";
          _m.textContent = "...and " + (matchedEvents.length - 150) + " more - use the search box to narrow this folder.";
          itemsContainer.appendChild(_m);
        }
      };

      if (isExpanded) {
        doRenderItems();
      }

      fileTitle.addEventListener("click", () => {
        if (itemsContainer.style.display === "none") {
          doRenderItems();
          itemsContainer.style.display = "block";
          fileTitle.classList.add("expanded");
          expandedFolders.add(fileName);
        } else {
          itemsContainer.style.display = "none";
          fileTitle.classList.remove("expanded");
          expandedFolders.delete(fileName);
        }
      });

      eventsList.appendChild(fileDiv);
    });

    if (filterText && !anyMatched) {
      eventsList.innerHTML = `<div style="padding: 12px; color: #8b949e; font-size: 12px; text-align: center;">No events match "<span style="color:#c9d1d9;">${escapeHtml(filterText)}</span>". Try a different search or clear the box.</div>`;
    }
  }

  // Live search input filtering
  const eventsSearchInput = document.getElementById("eventsListSearch");

  async function loadEventsList() {
    const eventsList = document.getElementById("eventsList");
    if (!eventsList) return;
    try {
      const response = await fetch(`/api/events/list?modPath=${encodeURIComponent(getModPath())}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (!data.events || data.events.length === 0) {
        allEvents = [];
      } else {
        allEvents = data.events;
      }
      // Pull every event's registered start-game fire time in one pass, plus the mod start date so we
      // can turn a day-offset into a real calendar date on each card. Best-effort: a failure just hides
      // the time badges, it never blocks the list.
      try {
        const sched = await (await fetch(`/api/history/event-schedules?modPath=${encodeURIComponent(getModPath())}`)).json();
        eventSchedules = (sched && sched.schedules) || {};
      } catch (_e) { eventSchedules = {}; }
      await getModStartDate(); // warm modStartCache so the synchronous render can read it
      const searchVal = eventsSearchInput ? eventsSearchInput.value.toLowerCase().trim() : "";
      renderEventsList(allEvents, searchVal);
    } catch (err) {
      eventsList.innerHTML = `<div style="padding: 12px; color: #f85149; font-size: 13px;">Error: ${err.message}</div>`;
    }
  }

  if (eventsSearchInput) {
    eventsSearchInput.addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase().trim();
      renderEventsList(allEvents, val);
    });
  }

  const updateEventDraftDisplay = () => {
    if (!activeDraft) return;
    const ns = document.getElementById("eventNamespace").value.trim() || "custom_events";
    const id = document.getElementById("eventId").value.trim() || "new_event_1";
    const title = document.getElementById("eventTitle").value.trim() || "New Event Title";
    activeDraft.fullId = `${ns}.${id}`;
    activeDraft.title = title;

    const draftEl = document.getElementById("draft-item-event");
    if (draftEl) {
      const idEl = draftEl.querySelector(".event-card-id");
      const titleEl = draftEl.querySelector(".event-card-title");
      if (idEl) idEl.textContent = activeDraft.fullId;
      if (titleEl) titleEl.textContent = activeDraft.title;
    }
  };

  // Mirror app.js's sanitizeLocalization for preview display: drop Paradox color codes (including
  // digit codes like §7 that the app.js copy misses) and [Dynamic.Tokens] so the event card preview
  // reads the way a player sees it in-game. Display-only — never applied to the saved value.
  // Delegates to the one canonical implementation (#loc-display-strip in loading-overlay.js). Five makers had
  // grown their own near-copy and they disagreed — none stripped $KEY$ references or the [?var|%fmt] print
  // form, and the leading punctuation a removed token exposed was left behind.
  // DISPLAY ONLY: the editable field and the saved .yml keep the raw value.

  // A name is often not plain text — 8.5% of vanilla's localisation values START with a runtime token, so a
  // real one shows up here as e.g. "[ROOT.GetNameDefCap] Reform Act". The box keeps the RAW value (editing it
  // must be lossless, and that is what gets saved), so show what a player will actually read underneath it.
  function updateEventTitleRenderedHint() {
    const el = document.getElementById("eventTitleRendered");
    const input = document.getElementById("eventTitle");
    if (!el || !input) return;
    const raw = input.value || "";
    const dynamic = window.novaLocHasDynamicCodes ? window.novaLocHasDynamicCodes(raw) : /[§£[]$]/.test(raw);
    if (!dynamic) { el.style.display = "none"; el.textContent = ""; return; }
    const shown = stripLocDisplayCodes(raw);
    el.style.display = "";
    el.textContent = shown
      ? "In game this reads: " + shown + "   (the [..] / $..$ / § parts are filled in by the game — they are kept exactly as typed)"
      : "Every part of this is filled in by the game at runtime, so there is no fixed text to preview.";
  }

  const stripLocDisplayCodes = (s) => {
    if (typeof window !== "undefined" && window.novaStripLocCodes) return window.novaStripLocCodes(s);
    return typeof s === "string" ? s.replace(/§[A-Za-z0-9!]/g, "").trim() : s;
  };

  // ── News-event skin ──────────────────────────────────────────────────
  // A `news_event` is shown in-game as the "World News" newspaper, not the parchment report popup. We
  // skin the live preview to match by toggling .is-news on the box and loading the REAL event_news_bg art
  // as its backdrop. The art is resolved mod-aware (sprite-url honours the active mod's override; vanilla
  // is the fallback), so the preview matches whatever newspaper the player will actually see.
  // Resolve a GFX sprite key to an image URL, mod-aware (active mod's override wins; vanilla is the
  // fallback) — so the preview art matches whatever the player will actually see. Cached per key+mod.
  // When a sprite cannot be converted, the gui stage would otherwise render as a transparent rectangle with
  // dark text on Nova's dark page: unreadable, and identical to "this mod has no newspaper". Give the stage
  // a paper floor so the text is legible, and name the sprite that failed, once, so the cause is knowable
  // instead of guessable. Idempotent — several sprites can fail in one render and the user needs one line,
  // not eight.
  function markStageArtFailed(stage, spriteKey) {
    if (!stage || stage.dataset.artFailed === "1") return;
    stage.dataset.artFailed = "1";
    stage.style.background = "#d8ccb0"; // the paper colour the pre-gui skin used, so text stays readable
    const note = document.createElement("div");
    note.className = "ev-art-failed-note";
    note.textContent = "Art could not be loaded (" + (spriteKey || "unknown sprite") + "). The layout below is correct; the image is missing or could not be converted.";
    stage.appendChild(note);
  }

  let spriteUrlCache = {};
  let newspaperBust = "";
  function bustUrl(u) { return (newspaperBust && u) ? (u + (u.includes("?") ? "&" : "?") + "_nb=" + newspaperBust) : u; }
  function getSpriteUrl(key, vanillaRel) {
    if (spriteUrlCache[key]) return spriteUrlCache[key];
    const fallback = "/api/vanilla-ui?rel=" + vanillaRel;
    spriteUrlCache[key] = fetch(`/api/ideas/sprite-url?key=${encodeURIComponent(key)}&modPath=${encodeURIComponent(getModPath())}`)
      .then((r) => r.json()).then((d) => (d && d.url) ? d.url : fallback).catch(() => fallback);
    return spriteUrlCache[key];
  }
  // The 3-slice parchment "report" art for the country_event skin (top clip / tileable middle / base bar).
  function loadReportSlices(box) {
    getSpriteUrl("GFX_event_report_top_win", "gfx/interface/event_report_top_win.dds").then((u) => box.style.setProperty("--rep-top", `url("${u}")`));
    getSpriteUrl("GFX_event_report_tileable_midsection", "gfx/interface/event_report_tileable_midsection.dds").then((u) => box.style.setProperty("--rep-mid", `url("${u}")`));
    getSpriteUrl("GFX_event_report_bottom_win_2", "gfx/interface/event_report_bottom_win_2.dds").then((u) => box.style.setProperty("--rep-bottom", `url("${u}")`));
  }
  function applyPreviewSkin() {
    const box = document.getElementById("previewEventBox");
    if (!box) return;
    const type = document.getElementById("eventType")?.value || "country_event";
    const isNews = type === "news_event";
    const isLeader = type === "unit_leader_event";
    const isOperative = type === "operative_leader_event";
    // HOI4 picks the event window by TYPE: news_event → newspaper; unit_leader → leader window;
    // operative_leader → operative window; everything else → the parchment report. Leader/operative
    // are parchment variants that show a centred portrait.
    box.classList.toggle("is-news", isNews);
    // Operative events get their OWN dark intelligence window (GFX_event_operative_background), so they
    // must NOT also inherit the parchment .is-report. Leader events keep the parchment body but add the
    // ornate GFX_event_leader_frame around the commander portrait.
    box.classList.toggle("is-report", !isNews && !isOperative);
    box.classList.toggle("is-leader", isLeader);
    box.classList.toggle("is-operative", isOperative);
    if (isNews) {
      getSpriteUrl("GFX_event_news_bg", "gfx/interface/event_news_bg.dds").then((url) => { box.style.backgroundImage = `url("${bustUrl(url)}")`; });
    } else if (isOperative) {
      // event_operative_bg.dds is a 24-frame animation strip; .is-operative crops to frame 1 via CSS.
      getSpriteUrl("GFX_event_operative_background", "gfx/interface/events/event_operative_bg.dds").then((url) => { box.style.backgroundImage = `url("${bustUrl(url)}")`; });
    } else {
      box.style.backgroundImage = "";
      loadReportSlices(box);
    }
    // Leader window = parchment body + the ornate metal portrait frame (loaded mod-aware into a CSS var).
    if (isLeader) getSpriteUrl("GFX_event_leader_frame", "gfx/interface/event_leader_frame.dds").then((url) => box.style.setProperty("--leader-frame", `url("${url}")`));
    // Highlight the matching style button so the user SEES which window this event uses (incl. when editing).
    const sty = isNews ? "news_event" : isLeader ? "unit_leader_event" : isOperative ? "operative_leader_event" : "country_event";
    document.querySelectorAll(".ev-style-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === sty));
    // Explain the selected window so the user knows what each type IS (esp. "Military Leader" is NOT a newspaper).
    const hintEl = document.getElementById("eventStyleHint");
    if (hintEl) {
      const HINTS = {
        news_event: "📰 Shown in the game's World News newspaper — for global announcements every country sees.",
        country_event: "📜 The standard parchment report popup with a picture — the default for most events.",
        state_event: "📜 Like a country event (parchment report), but about a specific state.",
        unit_leader_event: "⚔️ An event about a specific general or admiral — shown with their portrait in the leader window (not a newspaper).",
        operative_leader_event: "🕵️ An intelligence / spy event — shown in the dark operative window. In game it also carries the intelligence agency's own logo, which is chosen per country at runtime, so the preview cannot show it.",
      };
      hintEl.textContent = HINTS[type] || HINTS.country_event;
    }
  }

  // ── GUI-DRIVEN preview ────────────────────────────────────────────────────
  // Render the preview from the ACTIVE MOD's real eventwindow.gui geometry (fetched once, mod-aware) so it
  // auto-matches any mod's event-window style. Report/leader/operative go through the stage; news keeps its
  // dedicated (already gui-accurate + tested) skin.
  let eventWindowLayouts = null, eventLayoutsModPath = null;
  async function loadEventWindowLayouts(force) {
    const mp = getModPath();
    if (!force && eventWindowLayouts && eventLayoutsModPath === mp) return eventWindowLayouts;
    try {
      const r = await fetch(`/api/events/window-layouts?modPath=${encodeURIComponent(mp)}`);
      const d = await r.json();
      eventWindowLayouts = d && d.layouts ? d.layouts : {};
    } catch (_) { eventWindowLayouts = {}; }
    eventLayoutsModPath = mp;
    return eventWindowLayouts;
  }
  function windowNameForType(type) {
    if (type === "news_event") return "EventWindow_News";
    if (type === "unit_leader_event") return "EventWindow_leader";
    if (type === "operative_leader_event") return "EventWindow_Operative";
    return "EventWindow"; // country_event / state_event / anything else
  }
  // Font size = the TRAILING number in the HOI4 font name (hoi4_typewriter22 → 22, hoi_20bs → 20); the
  // leading "hoi4" must not be mistaken for the size.
  const FONT_PX = (font) => { const m = (font || "").match(/\d+/g); return m ? Math.max(9, +m[m.length - 1]) : 14; };
  const EV_SPRITE_FALLBACK = {
    GFX_event_report_top_win: "gfx/interface/event_report_top_win.dds",
    GFX_event_report_tileable_midsection: "gfx/interface/event_report_tileable_midsection.dds",
    GFX_event_report_tileable_bottom_section: "gfx/interface/event_report_tileable_bottom_section.dds",
    GFX_event_report_bottom_win: "gfx/interface/event_report_bottom_win.dds",
    GFX_event_report_bottom_win_2: "gfx/interface/event_report_bottom_win_2.dds",
    GFX_event_operative_background: "gfx/interface/events/event_operative_bg.dds",
    GFX_event_leader_frame: "gfx/interface/event_leader_frame.dds",
    GFX_event_pic_clip: "gfx/interface/event_pic_clip.dds",
    // Required, not optional. evSprite() falls back to event_news_bg.dds for any key that is not in this
    // table, so without this entry a failure to resolve the newsprint overlay would paint the ENTIRE
    // newspaper background across the photo — the same bug that was just fixed on the picture path.
    GFX_event_news_pic_overlay: "gfx/interface/event_news_pic_overlay.dds",
    GFX_paper_clip_event: "gfx/interface/paper_clip_event.dds",
    GFX_leader_unknown: "gfx/leaders/generic/generic_neutral.dds",
    // These two are event PICTURES and live in gfx/event_pictures/. GFX_report_event_001 used to fall back
    // to gfx/interface/event_news_bg.dds — the newspaper BACKGROUND — so a report picture that failed to
    // resolve painted the whole newspaper into the photo slot. Same confusion as the picture path itself had.
    // Verified on disk: report_event_001.dds and news_event_001.dds both exist where these now point.
    GFX_report_event_001: "gfx/event_pictures/report_event_001.dds",
    GFX_news_event_001: "gfx/event_pictures/news_event_001.dds",
  };
  const evSprite = (key) => getSpriteUrl(key, EV_SPRITE_FALLBACK[key] || "gfx/interface/event_news_bg.dds");
  function updateStylePickerAndHint(type) {
    const map = { news_event: "news_event", unit_leader_event: "unit_leader_event", operative_leader_event: "operative_leader_event" };
    const sty = map[type] || "country_event";
    document.querySelectorAll(".ev-style-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === sty));
    const hintEl = document.getElementById("eventStyleHint");
    if (hintEl) {
      const HINTS = {
        news_event: "📰 Shown in the game's World News newspaper — for global announcements every country sees.",
        country_event: "📜 The standard parchment report popup with a picture — the default for most events.",
        state_event: "📜 Like a country event (parchment report), but about a specific state.",
        unit_leader_event: "⚔️ An event about a specific general or admiral — shown with their portrait in the leader window (not a newspaper).",
        operative_leader_event: "🕵️ An intelligence / spy event — shown in the dark operative window. In game it also carries the intelligence agency's own logo, which is chosen per country at runtime, so the preview cannot show it.",
      };
      hintEl.textContent = HINTS[type] || HINTS.country_event;
    }
  }
  // Undo the stage (move the live elements back as direct children) so a skin render (news/fallback) is clean.
  function teardownStage(box) {
    const wrap = box.querySelector(".ev-stage-wrap");
    if (!wrap) return;
    const title = document.getElementById("previewEventTitle");
    const desc = document.getElementById("previewEventDesc");
    const frame = box.querySelector(".hoi4-event-img-frame");
    const opts = document.getElementById("previewEventOptions");
    [title, frame, desc, opts].forEach((el) => { if (el) { el.style.cssText = ""; box.appendChild(el); } });
    wrap.remove();
    box.classList.remove("ev-gui");
  }
  function applyGuiLayout(type) {
    if (type === "news_event") {
      // #newspaper-preview-ignores-the-mods-own-layout — this used to bail out whenever the newspaper
      // background was GFX_event_news_bg, on the reasoning that a standard backdrop meant a standard window
      // and the hand-built CSS skin was good enough. Measured against the installed corpora, that does not
      // hold: a mod can keep the vanilla backdrop sprite and still move everything inside it, and two of the
      // four that keep it do exactly that.
      //
      //   vanilla / RoN      Title x=12 y=260 maxWidth=490   Description x=39 maxWidth=460
      //   Millennium Dawn    Title x=35 y=253 maxWidth=444   Description x=52 maxWidth=405 format=left
      //   Novum Vexillum     Title x=30 y=260 maxWidth=460   picture x=64, no overlay layer at all
      //
      // Nova already fetched those numbers — resolveEffectiveEventGuiPath picks the mod's own
      // eventwindow.gui correctly — and then threw them away here, so a Millennium Dawn author previewed
      // their newspaper at vanilla's proportions: the body column 45px too wide, justified where MD says
      // left, and cut off 48px above where the game stops drawing.
      //
      // The gui stage is strictly more faithful anyway: it draws the mod's real background sprite, its real
      // option-button sprite and the fonts the .gui names, instead of a hand-made approximation. So news
      // goes through the same renderer as every other event type, and the only thing lost is invented
      // decoration the game never draws.
      const nl = eventWindowLayouts && eventWindowLayouts.EventWindow_News;
      if (!nl) return false; // no layout parsed at all — the CSS skin is better than nothing
    }
    const box = document.getElementById("previewEventBox");
    if (!box || !eventWindowLayouts) return false;
    const layout = eventWindowLayouts[windowNameForType(type)];
    if (!layout || !layout.size || !layout.size.w || !layout.size.h) return false;
    const W = layout.size.w, H = layout.size.h;
    const title = document.getElementById("previewEventTitle");
    const desc = document.getElementById("previewEventDesc");
    const frame = box.querySelector(".hoi4-event-img-frame");
    const opts = document.getElementById("previewEventOptions");

    let wrap = box.querySelector(".ev-stage-wrap");
    let stage = wrap && wrap.querySelector(".ev-stage");
    if (!wrap) {
      wrap = document.createElement("div"); wrap.className = "ev-stage-wrap";
      stage = document.createElement("div"); stage.className = "ev-stage";
      wrap.appendChild(stage);
      [title, frame, desc, opts].forEach((el) => { if (el) stage.appendChild(el); });
      box.appendChild(wrap);
    }
    box.className = "hoi4-event-box ev-gui";
    box.style.cssText = "";
    wrap.style.aspectRatio = W + " / " + H;
    stage.style.width = W + "px"; stage.style.height = H + "px";
    stage.querySelectorAll(".ev-deco").forEach((n) => n.remove());
    // The stage element is REUSED between renders, so a previous render's art-failure state has to be undone
    // here or it sticks: the paper floor would stay under art that now loads fine, and the note would keep
    // blaming a sprite that has since been fixed or is no longer even drawn.
    stage.querySelectorAll(".ev-art-failed-note").forEach((n) => n.remove());
    delete stage.dataset.artFailed;
    stage.style.background = "";
    [title, desc, frame, opts].forEach((el) => { if (el) el.style.cssText = "position:absolute"; });

    const addSpriteDeco = (key, x, y, z, scale) => {
      const d = document.createElement("div"); d.className = "ev-deco";
      d.style.left = x + "px"; d.style.top = y + "px"; d.style.zIndex = z; d.style.transformOrigin = "top left";
      if (scale) d.style.transform = "scale(" + scale + ")";
      stage.appendChild(d);
      evSprite(key).then((u) => {
        const im = new Image();
        im.onload = () => { d.style.width = im.naturalWidth + "px"; d.style.height = im.naturalHeight + "px"; d.style.backgroundImage = 'url("' + u + '")'; };
        // A decoration that fails to convert leaves nothing behind — the div stays 0x0 with no image, which
        // is correct-looking and silent. Say so rather than showing a window quietly missing a layer.
        im.onerror = () => { markStageArtFailed(stage, key); };
        im.src = bustUrl(u);
      });
      return d;
    };

    if (layout.background && layout.background !== "GFX_tiled_window_transparent") {
      const frames = layout.backgroundFrames || 1;
      const bg = document.createElement("div"); bg.className = "ev-deco"; bg.style.zIndex = "0"; bg.style.top = "0";
      stage.appendChild(bg);
      evSprite(layout.background).then((u) => {
        const url = bustUrl(u);
        if (frames > 1) {
          // Multi-frame horizontal strip (e.g. the 24-frame operative background): crop to FRAME 0 at its
          // natural frame size, centred, and grow the stage to the frame height — otherwise the WHOLE strip
          // gets squashed into the window (the "missing line chunks" the user saw).
          const im = new Image();
          im.onload = () => {
            const frameW = Math.round(im.naturalWidth / frames), frameH = im.naturalHeight;
            if (frameH > 0) { stage.style.height = frameH + "px"; wrap.style.aspectRatio = W + " / " + frameH; }
            bg.style.left = Math.round((W - frameW) / 2) + "px"; bg.style.width = frameW + "px"; bg.style.height = frameH + "px";
            bg.style.backgroundImage = 'url("' + url + '")';
            bg.style.backgroundSize = (frames * 100) + "% 100%"; bg.style.backgroundPosition = "0 0"; bg.style.backgroundRepeat = "no-repeat";
            rescale();
          };
          im.src = url;
        } else {
          bg.style.left = "0"; bg.style.width = W + "px"; bg.style.height = H + "px";
          // ⚠️ DO NOT ASSIGN THE BACKGROUND BLIND.
          //
          // A CSS background-image raises no `error` event, so a 404 from the icon endpoint — texconv absent
          // from a packaged layout, a .dds neither converter reads, a sticky negative cache — was completely
          // unobservable. And the gui stage paints no floor of its own: `.hoi4-event-box.ev-gui` kills the
          // base parchment with `background:none !important`, and neither .ev-stage-wrap nor .ev-stage
          // replaces it. So a failed backdrop produced a fully transparent box with the headline and body
          // still drawn at #111 on Nova's dark page — dark on dark, unreadable, and indistinguishable from
          // "this mod has no newspaper".
          //
          // Preload instead, so failure is knowable. On success nothing changes. On failure the stage falls
          // back to a paper colour so the text is legible, and says why — the one thing that turns an
          // apparently-empty preview into a diagnosable one. Applies to all four window types, not just
          // news: they all render through here.
          const im = new Image();
          im.onload = () => { bg.style.backgroundImage = 'url("' + url + '")'; };
          im.onerror = () => { markStageArtFailed(stage, layout.background); };
          im.src = url;
        }
      });
    }

    const portraitEl = layout.elements.find((e) => e.kind === "button" && e.name === "leader");
    const pictureEl = layout.elements.find((e) => e.kind === "icon" && e.name === "event_picture" && e.sprite && /report_event|news_event/i.test(e.sprite));
    const slotEl = portraitEl || pictureEl;
    const gridEl = layout.elements.find((e) => e.kind === "grid");
    const descTextEl = layout.elements.find((e) => e.kind === "text" && /description/i.test(e.name));

    // ── THE OPTIONS GRID'S .gui y IS A BASELINE, NOT WHERE THE ENGINE DRAWS ──────────────────────────
    //
    // HOI4 stacks an event window's sections at runtime: the midsection grows to fit the description and the
    // bottom section follows it down. That is the behaviour everyone has seen — a long event popup is taller
    // and its buttons sit lower. So the y in the file assumes a default-height body.
    //
    // Vanilla's own EventWindow_News proves the number is stale rather than meaningful: it puts the options
    // grid at y=220 while the description starts at y=291. Drawn literally, the buttons land across the
    // bottom of the photograph and on top of the headline — a render that contradicts itself no matter what
    // the engine does, since the body they belong under starts 71px BELOW them. The window is internally
    // inconsistent in the same way: its midsection (y=121, h=385) demands a bottom at 506, and the file says
    // 221 — the same byte value as the report window, i.e. a copy-paste the engine's runtime stacking hides.
    //
    // Four of the five event windows installed on this machine carry that number. Old World Blues is the
    // exception: it re-authored its news window self-consistently, with the grid at 462 BELOW its own body,
    // and it renders correctly today.
    //
    // So this does not hard-code "put them at the bottom" — that would break Old World Blues to fix the rest.
    // It treats the literal y as a FLOOR and only intervenes where the file contradicts itself, i.e. where
    // the description begins BELOW the grid that is supposed to sit under it.
    function optionsTopFor(e) {
      // Self-consistent window (grid already below the body): the file means what it says. Leave it alone.
      if (!descTextEl || !(descTextEl.y > e.y)) return e.y;
      const below = slotEl && slotEl.y > descTextEl.y ? slotEl.y : 0;
      const bodyH = below ? Math.max(30, below - descTextEl.y - 4) : 200;
      const slotH = e.slot && e.slot.h > 0 ? e.slot.h : 47; // a real mod ships a NEGATIVE slotsize height
      // Never push the buttons off the paper, however tall the body claims to be.
      return Math.max(e.y, Math.min(descTextEl.y + bodyH + 6, Math.max(0, H - slotH)));
    }

    layout.elements.forEach((e) => {
      if (e.kind === "sectionBg") {
        if (!e.sprite || e.sprite === "GFX_tiled_window_transparent" || e.y < 0) return;
        const d = document.createElement("div"); d.className = "ev-deco";
        d.style.left = e.x + "px"; d.style.top = e.y + "px"; d.style.width = (e.w || W) + "px"; d.style.height = (e.h || 40) + "px"; d.style.zIndex = "0";
        if (/tileable|midsection/i.test(e.sprite)) { d.style.backgroundSize = "100% auto"; d.style.backgroundRepeat = "repeat-y"; }
        stage.appendChild(d);
        evSprite(e.sprite).then((u) => { d.style.backgroundImage = 'url("' + bustUrl(u) + '")'; });
      } else if (e.kind === "text" && title && /title/i.test(e.name)) {
        // The headline is clipped too, and used not to be: maxHeight was applied to the body only, so a long
        // headline flowed into as many lines as it liked here while HOI4 cut it. All four installed windows
        // declare 32 for the title, which at the newspaper's 24px font is one line — so an author writing a
        // two-line headline saw both lines and the player sees one.
        Object.assign(title.style, { position: "absolute", left: e.x + "px", top: e.y + "px", width: (e.maxWidth || (W - e.x)) + "px", maxHeight: (e.maxHeight > 0 ? e.maxHeight + "px" : ""), overflow: (e.maxHeight > 0 ? "hidden" : ""), fontSize: FONT_PX(e.font) + "px", fontWeight: "700", textAlign: /cent/i.test(e.format) ? "center" : "left", color: "#111", zIndex: "3" });
      } else if (e.kind === "text" && desc && /description/i.test(e.name)) {
        // The .gui declares this outright as maxHeight. Prefer it over any inference: the old guess derived
        // the clip height from whatever element happened to sit below the body, and fell through to a magic
        // 200 when nothing did — which is what happens for a newspaper, because both the picture and the
        // options grid resolve ABOVE the description. Measured against the five eventwindow.gui files here,
        // that guess was wrong on every one, in both directions (declared 230/230/230/210/100 against a
        // shown 200/200/200/200/118).
        //
        // The guess is kept only for a window that genuinely declares no maxHeight, and its own bug is fixed
        // while it is here: `gridEl` is the FIRST grid in the layout, not necessarily the options grid.
        const optionsGrid = layout.elements.find((g) => g.kind === "grid" && /options/i.test(g.name || "")) || gridEl;
        const below = slotEl && slotEl.y > e.y ? slotEl.y : (optionsGrid && optionsGrid.y > e.y ? optionsGrid.y : 0);
        const maxH = e.maxHeight > 0 ? e.maxHeight : (below ? Math.max(30, below - e.y - 4) : 200);
        Object.assign(desc.style, { position: "absolute", left: e.x + "px", top: e.y + "px", width: (e.maxWidth || (W - e.x)) + "px", maxHeight: maxH + "px", fontSize: FONT_PX(e.font) + "px", textAlign: /cent/i.test(e.format) ? "center" : "left", color: "#111", zIndex: "2", overflow: "hidden" });
      } else if (e.kind === "icon" && /leader_frame/i.test(e.name)) {
        addSpriteDeco(e.sprite, e.x, e.y, "4", e.scale);
      } else if (e.kind === "icon" && /picture_overlay|pic_overlay/i.test(e.name)) {
        // The newspaper's `event_picture_overlay`. The icon dispatch had branches for leader_frame and
        // pic_clip and no `else`, so this element was parsed, handed to the client, and silently dropped.
        //
        // It is NOT a frame or border, despite the name. Decoding vanilla's
        // gfx/interface/event_news_pic_overlay.dds (399x155, uncompressed BGRA): every one of its 61,845
        // pixels has partial alpha — min 51, max 97, mean 55 (~22%) — with no fully opaque and no fully
        // transparent pixel, and flat alpha across rows and columns. It is a full-area translucent NEWSPRINT
        // GRAIN laid over the photo at the same origin, which is why it is 2px larger rather than centred.
        //
        // Drawn by 3 of the 5 layouts installed here: vanilla, Rise of Nations (no texture of its own, so it
        // inherits vanilla's) and Old World Blues (its own 500x200 wash). Millennium Dawn declares the
        // element but ships a texture that is alpha-0 in every pixel, and Novum Vexillum comments the block
        // out — so both must keep drawing nothing. That is why this paints the REAL resolved sprite and
        // never a synthesized tint: a tint would put grain on the two mods that deliberately have none.
        //
        // It is also a regression rather than a missing feature. The old CSS skin approximated it with
        // `filter: grayscale(0.55) contrast(1.05) sepia(0.12)` under `.hoi4-event-box.is-news`, and the gui
        // stage drops `.is-news`, so the stage had neither the sprite nor the filter.
        //
        // z-index 4: above the photo and its frame (3), below the paper clip (5).
        addSpriteDeco(e.sprite, e.x, e.y, "4", e.scale);
      } else if (e.kind === "icon" && /pic_clip|paper_clip/i.test(e.name)) {
        addSpriteDeco(e.sprite, e.x, e.y, "5", e.scale);
      } else if (e.kind === "grid" && opts && /options/i.test(e.name)) {
        // A slotsize can be negative in a real mod: Novum Vexillum ships `height = -67`. Used literally that
        // produced `height: -71px`, which is not a valid CSS length, so the browser dropped the declaration
        // silently and those buttons fell back to their natural height — a wrong preview with nothing logged.
        // Fall back to the default rather than emitting a value that cannot mean anything.
        const sw = e.slot && e.slot.w > 0 ? e.slot.w : 300;
        const sh = e.slot && e.slot.h > 0 ? e.slot.h : 47;
        // A grid wraps after max_slots_horizontal buttons. One column is the common case (vanilla and
        // Millennium Dawn both declare 1), but Old World Blues declares 2, and drawing that as a single
        // column gets both the shape and the height wrong. The container is flex-direction:column, so a
        // wider grid becomes a wrapping ROW sized to hold exactly that many slots.
        const cols = e.slotsH > 1 ? e.slotsH : 1;
        const GAP = 3;
        Object.assign(opts.style, {
          position: "absolute", left: e.x + "px", top: optionsTopFor(e) + "px",
          width: (sw * cols + GAP * (cols - 1)) + "px", zIndex: "6", gap: GAP + "px",
          flexDirection: cols > 1 ? "row" : "column",
          flexWrap: cols > 1 ? "wrap" : "nowrap",
        });
        // The label's real metrics live in the option button's OWN window, event_option_entry, which is a
        // top-level sibling of this one rather than a child — so `e` here is the gridBoxType and carries no
        // font at all. That is why this used to hard-code 15px: the value genuinely was not available until
        // the parser started collecting that window.
        //
        // HOI4 gives the label font hoi_20bs (size 20, lineHeight 20) in a 340x40 box, i.e. exactly TWO
        // lines, deliberately 40px wider than the 300px sprite with `clipping = no`. Nova drew one line of
        // 15px inside 280px of usable width — about 30 characters, where 48.4% of vanilla's 10,146 option
        // labels are longer than that. The button is already 43px tall here, which fits two 20px lines, so
        // no geometry changes.
        // ⚠️ KNOWN REMAINING GAP, deliberately not papered over: the stage draws in Courier New, a MONOSPACE
        // stand-in for HOI4's proportional hoi_20bs (xadvance 4-13, averaging about 7 against Courier's flat
        // 0.6em). So a label still takes roughly 70% more width here than in game, and a long one is still
        // clipped sooner than the player would see. Reading the declared font SIZE and allowing the wrap the
        // engine performs is a strict improvement and is what the .gui actually says; substituting a
        // proportional face is a separate change that needs its own ground truth about which face to use.
        const entry = eventWindowLayouts && eventWindowLayouts.event_option_entry;
        const label = entry && entry.elements ? entry.elements.find((x) => x.kind === "text") : null;
        const labelPx = label ? FONT_PX(label.font) : 15;
        opts.querySelectorAll(".hoi4-event-opt-btn").forEach((b) => {
          b.style.width = sw + "px"; b.style.height = (sh - 4) + "px"; b.style.fontSize = labelPx + "px";
        });
      }
    });

    if (slotEl && frame) {
      Object.assign(frame.style, { position: "absolute", left: slotEl.x + "px", top: slotEl.y + "px", zIndex: "3", transformOrigin: "top left", transform: slotEl.scale ? "scale(" + slotEl.scale + ")" : "" });
      // Hide the picture frame entirely for a REPORT with no picture, so an already-made pictureless event
      // shows no art (not a misleading empty box). Leader/operative keep their frame — the silhouette portrait
      // IS the window's identity (portraitEl). A picture that's set always shows (setBoxPhoto owns the img).
      // Must use setProperty(...,"important"): a `.is-report .hoi4-event-img-frame { display:block !important }`
      // rule would otherwise win over a plain inline display. removeProperty on show lets that rule apply again;
      // teardownStage clears all inline styles when leaving the stage, so the news skin isn't affected.
      const hasPicture = !!document.getElementById("eventPictureId")?.value.trim();
      if (hasPicture || portraitEl) frame.style.removeProperty("display");
      else frame.style.setProperty("display", "none", "important");
    }

    // Scale the gui-unit stage to the panel width. A ResizeObserver keeps it correct as the panel settles
    // during load (the wrap width is 0 at first paint) and on window resize — reading the stage's CURRENT
    // width so it stays right across event-type switches.
    const rescale = () => { const wr = box.querySelector(".ev-stage-wrap"), st = box.querySelector(".ev-stage"); if (!wr || !st) return; const ww = parseFloat(st.style.width) || W; const cw = wr.clientWidth; if (cw > 0) st.style.transform = "scale(" + (cw / ww) + ")"; };
    rescale();
    requestAnimationFrame(rescale);
    if (!box._evRO && typeof ResizeObserver !== "undefined") { box._evRO = new ResizeObserver(rescale); box._evRO.observe(wrap); }
    if (!box._evResize) { box._evResize = true; window.addEventListener("resize", rescale); }
    return true;
  }

  const updateLivePreview = () => {
    // What HOI4 draws for a title with no localisation is the RAW KEY — a newspaper whose headline reads
    // "mynamespace.1.t". Nova used to substitute "The Fall of the Government" and a paragraph of demo prose,
    // so an event that is visibly broken in game previewed as a finished newspaper. This is the one surface
    // whose entire job is to show what the player will see, so inventing text here is the worst place to do
    // it: nothing else tells the author their loc keys never landed.
    //
    // The distinction is LOADED vs DRAFT, and the picture logic immediately below already draws it — a
    // loaded, genuinely pictureless event previews with no picture, while a fresh draft keeps its
    // placeholder. That reasoning was never carried across to the text. Same rule here: a draft you are
    // still building keeps the friendly placeholder; an event that exists shows what the game will show.
    const evNs = document.getElementById("eventNamespace")?.value.trim() || "";
    const evId = document.getElementById("eventId")?.value.trim() || "";
    const locBase = evNs && evId ? evNs + "." + evId : "";
    const previewsRealEvent = !!loadedEventFullId && !!locBase;
    // A conditional block's fallback branch is REAL COPY the author wrote, so it outranks the raw key — but
    // never outranks what is actually in the box, which is the author editing right now.
    const condText = (c) => (c && c.text ? c.text : "");
    const titleVal = document.getElementById("eventTitle")?.value.trim()
      || condText(loadedConditionalTitle)
      || (previewsRealEvent ? locBase + ".t" : "The Fall of the Government");
    const descVal = document.getElementById("eventDescription")?.value.trim()
      || condText(loadedConditionalDesc)
      || (previewsRealEvent ? locBase + ".d" : "A long description of the event...");

    const evType = document.getElementById("eventType")?.value || "country_event";
    // Picture handling when NO picture is set. A REPORT (country/state) shows NO picture — an already-made
    // event with no `picture` should preview with none, not a misleading default that makes it look like it
    // has art. (The "New Event" button pre-fills GFX_report_event_001, so a fresh draft still shows the default
    // placeholder while you build it — that's fine; it only disappears for a loaded, genuinely-pictureless
    // event.) Leader/operative keep their default portrait silhouette (that framed portrait IS the window's
    // identity); news keeps its empty masthead. When a picture IS set, updateIconPreview owns the img.
    if (!document.getElementById("eventPictureId")?.value.trim()) {
      const defKey = (evType === "unit_leader_event" || evType === "operative_leader_event") ? "GFX_leader_unknown"
        : null;
      if (defKey) {
        getSpriteUrl(defKey, EV_SPRITE_FALLBACK[defKey] || "gfx/interface/event_news_bg.dds").then((u) => {
          if (!document.getElementById("eventPictureId")?.value.trim() && (document.getElementById("eventType")?.value || "country_event") === evType) setBoxPhoto(u);
        });
      } else {
        setBoxPhoto(null);
      }
    }
    const previewTitle = document.getElementById("previewEventTitle");
    const previewDesc = document.getElementById("previewEventDesc");
    updateEventTitleRenderedHint();
    if (previewTitle) previewTitle.textContent = stripLocDisplayCodes(titleVal);
    if (previewDesc) previewDesc.textContent = stripLocDisplayCodes(descVal);

    // Options
    const previewOptions = document.getElementById("previewEventOptions");
    if (previewOptions) {
      previewOptions.innerHTML = "";
      const optEls = document.querySelectorAll(".event-option");
      if (optEls.length === 0) {
        const btn = document.createElement("button");
        btn.className = "hoi4-event-opt-btn";
        btn.type = "button";
        btn.textContent = "We must stand firm!";
        previewOptions.appendChild(btn);
      } else {
        optEls.forEach(optEl => {
          // #preview-invents-option-text — SHOW WHAT THE GAME WILL SHOW. With no button text, HOI4 renders
          // the option's loc KEY on the button — "novaexp.1.a" — because that is what `name = <key>` points
          // at and nothing defines it. The preview used to substitute a friendly "Option Text", so the one
          // surface whose entire job is to show the player's view was the surface hiding the defect: Nova
          // looked finished and the built mod had raw keys on its buttons. A quoted literal name IS the
          // button text, so it is shown as-is.
          const optNameRaw = (optEl.querySelector(".opt-name")?.value || "").trim();
          const quoted = /^"(.*)"$/.exec(optNameRaw);
          const optTitle = optEl.querySelector(".opt-title")?.value.trim()
            || (quoted ? quoted[1] : (optNameRaw || "Option Text"));
          const btn = document.createElement("button");
          btn.className = "hoi4-event-opt-btn";
          btn.type = "button";
          btn.textContent = stripLocDisplayCodes(optTitle);
          previewOptions.appendChild(btn);
        });
      }
      // Paint the REAL option-button sprite (mod-aware) so the preview matches the in-game buttons.
      getSpriteUrl("GFX_event_option_entry", "gfx/interface/event_option_entry.dds").then((u) => {
        const _u = bustUrl(u);
        previewOptions.querySelectorAll(".hoi4-event-opt-btn").forEach((b) => { b.style.background = `url("${_u}") center/100% 100% no-repeat`; });
      });
    }
    // Render path: the gui-driven stage (matches the active mod's real eventwindow.gui geometry) when a
    // layout is available; otherwise the dedicated news skin / parchment fallback.
    updateStylePickerAndHint(evType);
    const _box = document.getElementById("previewEventBox");
    if (!applyGuiLayout(evType)) { if (_box) teardownStage(_box); applyPreviewSkin(); }
  };

  const nsInput = document.getElementById("eventNamespace");
  const evIdInput = document.getElementById("eventId");
  const evTitleInput = document.getElementById("eventTitle");
  const evDescInput = document.getElementById("eventDescription");
  [nsInput, evIdInput, evTitleInput, evDescInput].forEach(inp => {
    if (inp) {
      inp.addEventListener("input", () => {
        updateEventDraftDisplay();
        updateLivePreview();
      });
    }
  });
  // Switching Country Event ⇄ News Event re-skins the preview (parchment popup ⇄ newspaper) live.
  // ── THE DEFAULT PICTURE HAS TO FOLLOW THE EVENT TYPE ────────────────────────────────────────────────
  //
  // HOI4 has two picture families and they are not interchangeable. A news_event draws its picture in the
  // newspaper's photo slot at (59,91), where news_event_001.dds is 397x153 and fills it. A report picture
  // is 210x176 — about half the width and 23px too tall — so it leaves most of the frame empty and spills
  // out of the bottom. Vanilla uses GFX_news_event_* in all 664 of its news events and GFX_report_event_*
  // in none of them.
  //
  // server.js:13301 already knows this rule exactly. It just never got to apply it: that default fires only
  // when the client sends an EMPTY picture, and "New Event" pre-fills a report key, so the field is never
  // empty. Correcting it server-side would also be wrong — test-event-picture-and-bridge.js deliberately
  // pins "an explicit picture is still written, whatever the type", because the author's choice must be
  // respected. So the fix belongs here, in what Nova DEFAULTS to.
  const DEFAULT_PICTURES = { news_event: "GFX_news_event_001", other: "GFX_report_event_001" };
  const defaultPictureFor = (type) => (type === "news_event" ? DEFAULT_PICTURES.news_event : DEFAULT_PICTURES.other);
  // "Untouched" means the field still holds one of the two defaults. Anything else is the author's choice
  // and is never overwritten — switching type to look at a skin must not silently discard their picture.
  const isUntouchedDefaultPicture = (v) => v === DEFAULT_PICTURES.news_event || v === DEFAULT_PICTURES.other;

  const evTypeInput = document.getElementById("eventType");
  if (evTypeInput) evTypeInput.addEventListener("change", () => {
    const pic = document.getElementById("eventPictureId");
    if (pic && isUntouchedDefaultPicture(pic.value.trim())) {
      const want = defaultPictureFor(evTypeInput.value);
      if (pic.value.trim() !== want) { pic.value = want; updateIconPreview(want); }
    }
    updateEventDraftDisplay(); updateLivePreview();
  });
  // Style picker: each button sets the event TYPE (what HOI4 uses to choose the window) + re-skins the
  // preview, so the user can browse all 4 styles and see which one applies to the event being edited.
  document.querySelectorAll(".ev-style-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = document.getElementById("eventType"); if (!t) return;
      // state_event has no button of its own and shares the parchment "Report" window with country_event,
      // so it lights up the 📜 Report button. Clicking that button must NOT silently downgrade a state_event
      // into a country_event (that changes what gets saved) — treat it as a no-op instead.
      if (t.value === "state_event" && btn.dataset.type === "country_event") return;
      t.value = btn.dataset.type; t.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  async function initCountryDatalist() {
    const sel = document.getElementById("eventOwnerPicker");
    if (!sel) return;
    // Shared picker: shows country name + (Your Mod)/(Vanilla) badge, groups mod countries
    // first, and flags a custom country that reuses a vanilla tag. See country-picker.js.
    if (window.NovaCountryPicker) {
      await window.NovaCountryPicker.populate(sel, { modPath: getModPath(), includeAll: true, all: true });
    }
    getModStartDate().then(() => syncDateHint()); // resolve the start date + refresh the date hint
  }

  // Warm the event sprite map for the (new) mod in the BACKGROUND so opening the image picker is
  // instant. The endpoint is non-blocking now, so this can't freeze the UI; we ignore the result.
  function prefetchEventSprites() {
    try { fetch(`/api/sprites?type=event&modPath=${encodeURIComponent(getModPath())}`).catch(() => {}); } catch (_) {}
    // Pre-warm the icon/preview sprite maps for this mod in the background so the first picture browse or
    // preview is instant (not the ~18s cold build on a big base mod). Fire-and-forget.
    try { fetch(`/api/mod/warm-sprites?modPath=${encodeURIComponent(getModPath())}`).catch(() => {}); } catch (_) {}
  }
  // ── SWITCHING MOD MUST EMPTY THE EDITOR, NOT JUST RELOAD THE LIST ───────────────────────────────────
  //
  // This callback re-resolved the art and re-read the list, but never cleared the editor, and
  // loadEventsList() only re-renders the LIST. So a loaded-but-unedited event survived the switch whole —
  // the unsaved-work guard only prompts when the form is DIRTY, and an untouched one is not.
  //
  // The visible half was a stale photograph: updateIconPreview is the only writer for a picture that is
  // set, nothing re-ran it, and the img kept an absolute path INSIDE THE PREVIOUS MOD. The file still
  // exists, so nothing 404s — the newspaper renders perfectly with the wrong mod's picture in it.
  //
  // The dangerous half is quieter. `loadedEventFileName` is sent as `fileName` on save and
  // `loadedEventFullId` as `previousEventId` on a rename. Carried across a switch, Save targets the NEW mod
  // at the OLD mod's filename, and a rename asks the new mod to drop an id that only exists in the old one.
  // That is a wrong WRITE, which is worse than a wrong preview.
  //
  // The Decision Maker already solved this — clearDecisionEditorForModSwitch(), public/decisions.js:726 —
  // and the Event Maker never adopted it. One difference on purpose: decisions.js clears a HAND-WRITTEN list
  // of field ids, and its own comment records that the list once missed `decisionCategoryIcon`, which then
  // survived a switch and got written into the newly-opened mod. So this derives the fields from the same
  // root the unsaved-work watcher already watches, and a field added later is cleared without being listed.
  function clearEventEditorForModSwitch() {
    loadedEventFullId = null;
    loadedEventFileName = null;
    loadedEventDays = 0;
    loadedEventHours = 0;
    loadedConditionalDesc = null;   // belongs to the event that was open, not to the new mod
    loadedConditionalTitle = null;
    activeDraft = null;
    autoSelectFullId = null;
    const panel = document.querySelector(".event-editor-panel");
    if (panel) {
      // Same scope and same exclusion as the watcher: the AI prompt is an instruction to the generator,
      // never written to the mod.
      panel.querySelectorAll("input, textarea, select").forEach((el) => {
        if (el.id === "aiEventPrompt") return;
        if (el.type === "checkbox" || el.type === "radio") el.checked = false;
        else if (el.tagName === "SELECT") el.selectedIndex = 0;
        else el.value = "";
      });
    }
    const opts = document.getElementById("optionsList");
    if (opts) opts.innerHTML = "";
    try { clearEventBridge(); } catch (_) {}
    const del = document.getElementById("deleteEventBtn");
    if (del) del.classList.add("is-hidden");
    // .event-item-card, matching what renderEventsList actually builds (line ~706) and what the selection
    // code already deselects. An .event-item selector matches nothing here and would have left the old mod's
    // card highlighted next to an empty editor.
    document.querySelectorAll(".event-item-card").forEach((el) => el.classList.remove("active"));
    try { updateIconPreview(""); } catch (_) {}
    try { updateLivePreview(); } catch (_) {}
    // Re-baseline last: the form is empty ON PURPOSE, so it must not read as unsaved work the user did.
    if (evUnsaved) { try { evUnsaved.markClean(); } catch (_) {} }
  }

  initModSelector(() => {
    spriteUrlCache = {}; // re-resolve the newspaper/report art for the newly-selected mod (may override it)
    try { loadNewspaperStyleDisplay(); } catch (_) {}
    clearEventEditorForModSwitch();
    loadEventsList();
    initCountryDatalist();
    prefetchEventSprites();
    updateLivePreview();
    loadEventWindowLayouts(true).then(() => updateLivePreview()); // re-detect this mod's event-window geometry
  }).then(() => {
    loadEventsList();
    initCountryDatalist();
    prefetchEventSprites();
    updateLivePreview();
    loadEventWindowLayouts().then(() => updateLivePreview());
  });

  // Handle DDS Image Upload
  eventPictureUpload.addEventListener("change", async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("image", file);
    
    const eventTitle = document.getElementById("eventTitle").value || "custom_event";
    formData.append("name", eventTitle);
    formData.append("type", "event");
    
    const modPath = getModPath();
    if (modPath) formData.append("modPath", modPath);

    uploadStatus.textContent = "Uploading and converting to DDS...";
    uploadStatus.style.color = "#e8a849";

    try {
      const response = await fetch("/api/upload-gfx", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      uploadStatus.textContent = "Successfully converted to DDS & .gfx generated!" + (data.overwrote ? " ⚠ Replaced an existing icon (original backed up)." : "");
      uploadStatus.style.color = "#2ea043";
      eventPictureId.value = data.spriteName;
      // Pass the just-written DDS path so the live preview loads the real icon INSTANTLY via
      // /api/buildings/icon-file. Resolving a brand-new sprite through sprite-url can miss on a cold
      // sprite map (Millennium Dawn) and fall back to a placeholder — which looked like "upload did nothing".
      updateIconPreview(data.spriteName, data.ddsPath);
    } catch (err) {
      uploadStatus.textContent = `Error: ${err.message}`;
      uploadStatus.style.color = "#f85149";
    }
  });

  // Handle Picture Upload button click
  const eventPictureUploadBtn = document.getElementById("eventPictureUploadBtn");
  if (eventPictureUploadBtn) {
    eventPictureUploadBtn.addEventListener("click", () => {
      eventPictureUpload.click();
    });
  }

  const eventBrowseImageBtn = document.getElementById("eventBrowseImageBtn");
  const eventImagePickerModal = document.getElementById("eventImagePickerModal");
  const closeEventImagePicker = document.getElementById("closeEventImagePicker");
  const eventImagePickerSearch = document.getElementById("eventImagePickerSearch");
  const eventImagePickerGrid = document.getElementById("eventImagePickerGrid");
  let allEventSprites = null;
  let filteredEventSprites = [];
  let renderedEventSpriteCount = 0;
  // Render a small first batch, not the whole list. Each grid <img> hits /api/buildings/icon-file which does a
  // server-side DDS→PNG decode; the old batch of 120 fired ~120 of those at once and froze the UI (native
  // loading="lazy" is viewport-relative and the grid fills the viewport, so off-screen images load anyway).
  const EVENT_IMAGE_BATCH_SIZE = 24;

  function renderEventImageBatch() {
    if (!eventImagePickerGrid) return;
    const batch = filteredEventSprites.slice(renderedEventSpriteCount, renderedEventSpriteCount + EVENT_IMAGE_BATCH_SIZE);
    const fragment = document.createDocumentFragment();
    batch.forEach(sprite => {
      const item = document.createElement("div");
      item.className = "icon-picker-item";
      item.innerHTML = `
        <img src="/api/buildings/icon-file?path=${encodeURIComponent(sprite.texturefile || "")}" alt="Event Image" loading="lazy" style="width: 96px; height: 64px; object-fit: contain; margin-bottom: 8px;" data-fallback-html="&lt;span style=&quot;font-size:11px;color:#d29922&quot;&gt;Art missing&lt;/span&gt;" />
        <span style="font-size: 10px; color: #8b949e; word-break: break-all; font-family: monospace;">${escapeHtml(sprite.key.replace(/^gfx_report_event_/i, ""))}</span>
      `;
      item.addEventListener("click", () => {
        eventPictureId.value = sprite.key;
        updateIconPreview(sprite.key, sprite.texturefile); // use the exact image we already loaded
        if (eventImagePickerModal) eventImagePickerModal.style.display = "none";
      });
      fragment.appendChild(item);
    });
    eventImagePickerGrid.appendChild(fragment);
    renderedEventSpriteCount += batch.length;
    // Keep rendering small batches until the grid is actually scrollable (so the scroll-to-load-more handler
    // can take over) — but never all at once. Bounded + guarded against a not-yet-laid-out grid (clientHeight 0).
    if (renderedEventSpriteCount < filteredEventSprites.length &&
        renderedEventSpriteCount < 96 &&
        eventImagePickerGrid.clientHeight > 0 &&
        eventImagePickerGrid.scrollHeight <= eventImagePickerGrid.clientHeight + 40) {
      requestAnimationFrame(renderEventImageBatch);
    }
  }

  function filterEventImages() {
    if (!eventImagePickerGrid || !allEventSprites) return;
    const val = (eventImagePickerSearch?.value || "").toLowerCase().trim();
    filteredEventSprites = allEventSprites.filter(sprite => sprite.key.toLowerCase().includes(val));
    eventImagePickerGrid.innerHTML = "";
    renderedEventSpriteCount = 0;
    if (!filteredEventSprites.length) {
      eventImagePickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">No images found.</div>`;
      return;
    }
    renderEventImageBatch();
  }

  if (eventBrowseImageBtn && eventImagePickerModal && eventImagePickerGrid) {
    eventBrowseImageBtn.addEventListener("click", async () => {
      eventImagePickerModal.style.display = "block";
      if (eventImagePickerSearch) { eventImagePickerSearch.value = ""; setTimeout(() => { try { eventImagePickerSearch.focus(); } catch (_) {} }, 0); } // type to search at once

      if (allEventSprites !== null) {
        filterEventImages();
        eventImagePickerGrid.scrollTop = 0;
        return;
      }

      eventImagePickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #8b949e; text-align: center;">Scanning game files for event images...</div>`;
      try {
        const res = await fetch(`/api/sprites?type=event&modPath=${encodeURIComponent(getModPath())}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        allEventSprites = data.sprites || [];
        filterEventImages();
        eventImagePickerGrid.scrollTop = 0;
      } catch (err) {
        eventImagePickerGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; color: #f85149; text-align: center;">Error: ${escapeHtml(err.message)}</div>`;
      }
    });
    eventImagePickerGrid.addEventListener("scroll", () => {
      if (eventImagePickerGrid.scrollTop + eventImagePickerGrid.clientHeight >= eventImagePickerGrid.scrollHeight - 60) {
        if (renderedEventSpriteCount < filteredEventSprites.length) renderEventImageBatch();
      }
    });
    if (closeEventImagePicker) {
      closeEventImagePicker.addEventListener("click", () => {
        eventImagePickerModal.style.display = "none";
      });
    }
    if (eventImagePickerSearch) eventImagePickerSearch.addEventListener("input", filterEventImages);
    window.addEventListener("click", (e) => {
      if (e.target === eventImagePickerModal) eventImagePickerModal.style.display = "none";
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && eventImagePickerModal.style.display === "block") {
        eventImagePickerModal.style.display = "none";
      }
    });
  }

  // Show (with a src) or hide the in-box live-preview photo. With NO picture we HIDE it so the frame reads
  // as an empty photo slot — otherwise the old event_news_bg placeholder rendered a tiny newspaper inside
  // the newspaper skin (and an out-of-place newspaper inside the parchment popup).
  function setBoxPhoto(url) {
    const previewImg = document.getElementById("previewEventImage");
    if (!previewImg) return;
    const frame = previewImg.closest(".hoi4-event-img-frame");
    if (url) { previewImg.src = url; previewImg.style.visibility = "visible"; if (frame) frame.style.display = ""; }
    // No picture → hide the WHOLE frame (not just the img) so an event with no art doesn't show an empty
    // box (a dark rectangle in the report skin) — the text just flows, like a text-only event in game.
    else { previewImg.removeAttribute("src"); previewImg.style.visibility = "hidden"; if (frame) frame.style.display = "none"; }
  }

  // Icon Preview Helper
  async function updateIconPreview(gfxKey, directTexturefile) {
    if (!eventPicturePreview) return;
    if (!gfxKey) {
      eventPicturePreview.innerHTML = "No Picture";
      setBoxPhoto(null);
      return;
    }
    // The icon picker already knows the exact texture file (it rendered the thumbnail from it), so use it
    // directly — instant, and never falls back to a placeholder, even on a cold sprite map (Millennium Dawn).
    if (directTexturefile) {
      const directUrl = `/api/buildings/icon-file?path=${encodeURIComponent(directTexturefile)}`;
      eventPicturePreview.innerHTML = `<img src="${directUrl}" alt="Event Picture" data-fallback-html="&lt;span style=&quot;font-size:11px;color:#d29922&quot;&gt;Art missing&lt;/span&gt;" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
      setBoxPhoto(directUrl);
      return;
    }
    eventPicturePreview.innerHTML = `<span style="font-size: 11px; color: #8b949e;">Loading...</span>`;
    try {
      const res = await fetch(`/api/ideas/sprite-url?key=${encodeURIComponent(gfxKey)}&modPath=${encodeURIComponent(getModPath())}`);
      const data = await res.json();
      if (data.url) {
        eventPicturePreview.innerHTML = `<img src="${data.url}" alt="Event Picture" data-fallback-html="&lt;span style=&quot;font-size:11px;color:#d29922&quot;&gt;Art missing&lt;/span&gt;" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
        setBoxPhoto(data.url);
      } else {
        // A picture key was set but did not resolve. This used to show event_news_bg.dds — the ENTIRE
        // newspaper — as the "placeholder", which reads as artwork and hides the problem completely: the
        // preview looked finished while the game will draw nothing at all for an undefined sprite.
        //
        // It is also the normal state while authoring. A modder types `picture = GFX_news_event_bandung`
        // before the art exists, or renames a key, and this is the only place that can tell them. The
        // empty-key branch above already models "no picture" correctly; this one now names the reason.
        eventPicturePreview.innerHTML = `<span style="font-size: 11px; color: #d29922;">No art found for this key</span>`;
        setBoxPhoto(null);
      }
    } catch (err) {
      eventPicturePreview.innerHTML = `<span style="font-size: 11px; color: #f85149;">Error</span>`;
    }
  }

  if (eventPictureId) {
    eventPictureId.addEventListener("input", (e) => {
      updateIconPreview(e.target.value.trim());
    });
  }

  // Handle adding options
  const addOptionBtn = document.getElementById("addOptionBtn");
  const optionsList = document.getElementById("optionsList");
  let optionCount = 0;

  // optionCount only ever increments (it names the NEXT option), so after removing an option the visible
  // "Option N Name" headers freeze out of sync with the visual order (remove #1 of 3 leaves "Option 2",
  // "Option 3"). Re-label every option header by its live DOM position instead. Display-only — the saved
  // key is read from each .opt-name input, never from this label.
  function renumberOptionLabels() {
    if (!optionsList) return;
    optionsList.querySelectorAll(".event-option").forEach((el, i) => {
      const label = el.querySelector("label");
      if (!label) return;
      const txt = `Option ${i + 1} Name`;
      // Update ONLY the leading text node — the label hosts an appended "✨ AI" assist button
      // (ai-field-assist.js); label.textContent = … would wipe that button.
      const first = label.firstChild;
      if (first && first.nodeType === 3) first.nodeValue = txt;
      else label.insertBefore(document.createTextNode(txt), label.firstChild);
    });
  }

  // Genesis "plain English" preview for the event's top-level Trigger (condition) and Immediate
  // (effect) fields — same read-only, additive aid as the option scripts. DOM text nodes only.
  function refreshEventFieldPreview(taId, boxId, mode, label) {
    const ta = document.getElementById(taId);
    const box = document.getElementById(boxId);
    if (!ta || !box) return;
    const raw = (ta.value || "").trim();
    if (!raw) { box.style.display = "none"; box.textContent = ""; return; }
    const fnName = mode === "trigger" ? "translateTriggers" : "translate";
    let english = "";
    try {
      if (window.GenesisEngine && typeof window.GenesisEngine[fnName] === "function") english = window.GenesisEngine[fnName](raw);
    } catch (_) { english = ""; }
    box.style.display = "";
    box.textContent = "";
    const lab = document.createElement("span");
    lab.className = "genesis-preview-label";
    lab.textContent = label;
    box.appendChild(lab);
    if (english) {
      box.classList.remove("genesis-preview-empty");
      box.appendChild(document.createTextNode(english));
    } else {
      box.classList.add("genesis-preview-empty");
      box.appendChild(document.createTextNode("Couldn't auto-translate this script — it will still be saved exactly as written."));
    }
  }
  // Many real events (e.g. MD's ace-pilot events) have titles/descriptions full of HOI4 dynamic tokens
  // like [From.GetCallsign] and §Ycolour§! codes. Those look like "weird extra text" in the plain field,
  // but they're intentional — the game substitutes them at runtime. Rather than strip them (which would
  // DESTROY them on save), we keep the raw value editable and show a display-only hint of how it reads.
  function stripDynamicLoc(s) {
    return String(s || "")
      .replace(/§[A-Za-z!]/g, "")      // §Y colour start / §! reset
      .replace(/\[[^\]]*\]/g, "…")     // dynamic [From.GetX] scope tokens
      .replace(/\\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function refreshDynamicTextHint(fieldId, hintId) {
    const el = document.getElementById(fieldId);
    const hint = document.getElementById(hintId);
    if (!el || !hint) return;
    const v = el.value || "";
    const hasDyn = /\[[^\]]+\]/.test(v) || /§[A-Za-z!]/.test(v);
    if (!hasDyn) { hint.style.display = "none"; hint.textContent = ""; return; }
    hint.style.display = "";
    hint.textContent = "ℹ Uses in-game dynamic text — the game fills in the [tags]/colour codes at runtime (this is correct, not a typo). Reads roughly: “" + stripDynamicLoc(v) + "”";
  }
  ["eventTitle", "eventDescription"].forEach((fid) => {
    const el = document.getElementById(fid);
    const hid = fid === "eventTitle" ? "eventTitleDynamicHint" : "eventDescDynamicHint";
    if (el) el.addEventListener("input", () => refreshDynamicTextHint(fid, hid));
  });

  function refreshEventTopFields() {
    refreshEventFieldPreview("eventTrigger", "eventTriggerPreview", "trigger", "🔮 Fires when");
    refreshEventFieldPreview("eventImmediate", "eventImmediatePreview", "effect", "🔮 Immediately");
    refreshEventFieldPreview("eventAfter", "eventAfterPreview", "effect", "🔮 After choosing");
  }
  [["eventTrigger", "eventTriggerPreview", "trigger", "🔮 Fires when"],
   ["eventImmediate", "eventImmediatePreview", "effect", "🔮 Immediately"],
   ["eventAfter", "eventAfterPreview", "effect", "🔮 After choosing"]].forEach(([t, b, m, l]) => {
    const el = document.getElementById(t);
    if (el) el.addEventListener("input", () => refreshEventFieldPreview(t, b, m, l));
  });
  window.__novaRefreshEventTopFields = refreshEventTopFields;

  // Genesis "plain English" preview for an event option's effect-script textarea (read-only,
  // additive — never changes what is saved). Lets a modder confirm what a pasted/AI-written
  // effect does without reading raw Paradox script. DOM text nodes only (no markup injection).
  function wireOptionGenesisPreview(optDiv) {
    if (!optDiv) return;
    const ta = optDiv.querySelector(".opt-script");
    const box = optDiv.querySelector(".genesis-preview");
    if (!ta || !box) return;
    const refresh = () => {
      const raw = (ta.value || "").trim();
      if (!raw) { box.style.display = "none"; box.textContent = ""; return; }
      let english = "";
      try {
        if (window.GenesisEngine && typeof window.GenesisEngine.translate === "function") {
          english = window.GenesisEngine.translate(raw);
        }
      } catch (_) { english = ""; }
      box.style.display = "";
      box.textContent = "";
      const label = document.createElement("span");
      label.className = "genesis-preview-label";
      label.textContent = "🔮 In plain English";
      box.appendChild(label);
      box.appendChild(document.createTextNode(
        english || "Couldn't auto-translate this script — it will still be saved exactly as written."));
      box.classList.toggle("genesis-preview-empty", !english);
    };
    ta.addEventListener("input", refresh);
    ta.addEventListener("change", refresh);
    refresh();
  }

  // Shared per-option "AI weight + option trigger" fields (ai_chance base + a trigger that gates whether the
  // choice is even offered). Both optional — blank = omitted. Used by every option template so they stay in sync.
  function optionExtraFieldsHTML(opt) {
    opt = opt || {};
    const ai = (opt.aiChance != null && opt.aiChance !== "") ? opt.aiChance : "";
    return `
      <div style="display:flex; gap:8px; margin-top:8px; align-items:flex-start;">
        <div style="flex:0 0 92px;">
          <label style="display:block; margin-bottom:4px; color:#8b949e; font-size:11px;" title="How likely the AI is to pick this option (ai_chance base). Blank = game default.">AI weight</label>
          <input type="number" class="opt-ai-chance" value="${ai}" placeholder="—" min="0" style="width:100%; padding:6px; background:#0d1117; border:1px solid #30363d; border-radius:6px; color:#c9d1d9;" />
        </div>
        <div style="flex:1;">
          <label style="display:block; margin-bottom:4px; color:#8b949e; font-size:11px;">Option trigger <span style="font-weight:400; color:#6e7681;">(only offer this choice if…)</span></label>
          <textarea class="opt-trigger" placeholder="e.g. has_war = no" style="width:100%; padding:6px; background:#0d1117; border:1px solid #30363d; border-radius:6px; color:#c9d1d9; min-height:36px; font-family:monospace; font-size:12px;">${escapeHtml(opt.trigger || "")}</textarea>
        </div>
      </div>`;
  }
  addOptionBtn.addEventListener("click", () => {
    optionCount++;
    const optDiv = document.createElement("div");
    optDiv.className = "event-option";
    optDiv.innerHTML = `
      <button class="remove-opt-btn" title="Remove Option" type="button">&times;</button>
      <div style="margin-bottom: 8px;">
        <label>Option ${optionCount} Name</label>
      </div>
      <input type="text" class="opt-name" placeholder="custom_events.1.a" style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; margin-bottom: 8px;" />
      
      <label style="display: block; margin-bottom: 4px; color: #c9d1d9; font-size: 12px;">Option Title Text (e.g. Great!)</label>
      <input type="text" class="opt-title" placeholder="Great!" style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; margin-bottom: 8px;" />
      
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 4px;">
        <label style="margin: 0; color: #c9d1d9; font-weight: 600; font-size: 12px;">Effects Script</label>
        <div class="effect-quick-inserts" style="display: flex; gap: 6px;">
          <button class="quick-insert-btn" data-type="spirit" type="button" style="background: #1f2937; border: 1px solid #374151; color: #10b981; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Spirit</button>
          <button class="quick-insert-btn" data-type="tech" type="button" style="background: #1f2937; border: 1px solid #374151; color: #3b82f6; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Tech</button>
          <button class="quick-insert-btn" data-type="event" type="button" style="background: #1f2937; border: 1px solid #374151; color: #ec4899; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Event</button>
          <button class="quick-insert-btn" data-type="decision" type="button" style="background: #1f2937; border: 1px solid #374151; color: #eab308; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">+ Decision</button>
        </div>
      </div>
      <textarea class="opt-script" placeholder="add_political_power = 50\nadd_stability = 0.10" style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; min-height: 80px; font-family: monospace;"></textarea>
      <div class="genesis-preview" style="display:none;"></div>
      ${optionExtraFieldsHTML({})}
    `;
    optDiv.querySelector(".remove-opt-btn").addEventListener("click", () => {
      optDiv.remove();
      renumberOptionLabels();
      updateLivePreview();
    });
    optDiv.querySelector(".opt-title").addEventListener("input", updateLivePreview);
    optionsList.appendChild(optDiv);
    wireOptionGenesisPreview(optDiv);
    renumberOptionLabels(); // keep headers 1..N in DOM order even after earlier removes
    updateLivePreview();
  });
  
  // AI Help Dialog click listener
  const aiLogicHelpBtn = document.getElementById("aiLogicHelpBtn");
  if (aiLogicHelpBtn) {
    aiLogicHelpBtn.addEventListener("click", () => {
      window.showNovaAiHelpModal("aiEventPrompt");
    });
  }

  // AI Generator integration
  const generateAiEventBtn = document.getElementById("generateAiEventBtn");
  const aiEventPrompt = document.getElementById("aiEventPrompt");
  const aiStatus = document.getElementById("aiStatus");
  
  generateAiEventBtn.addEventListener("click", async () => {
    const prompt = aiEventPrompt.value.trim();
    if (!prompt) return;
    
    aiStatus.textContent = "Generating...";
    generateAiEventBtn.disabled = true;
    
    const storedKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("geminiApiKey");
    const systemPrompt = `You are a Master-Level Hearts of Iron IV (HOI4) Event Scripting AI.
Your purpose is to translate user requests into structured, complete data for a HOI4 event.
You MUST output ONLY a valid JSON object. Do NOT wrap the JSON in markdown code blocks. Do not include any explanation or chatter.
The JSON object must have this exact structure:
{
  "namespace": "custom_events",
  "id": "1",
  "type": "country_event",
  "title": "Event Title",
  "description": "Event Description Text",
  "picture": "GFX_report_event_001",
  "triggeredOnly": "yes",
  "options": [
    {
      "name": "custom_events.1.a",
      "title": "Option Title Text",
      "script": "add_political_power = 50\\nadd_stability = 0.05"
    }
  ]
}`;

    try {
      const response = await fetch("/api/ai/logic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          systemPrompt,
          modPath: localStorage.getItem("activeModPath") || "",
          apiKey: storedKey || ""
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      const parsedData = window.NovaAI.parseJsonResponse(data.script);

      const parsedEventId = splitAiEventId(parsedData.namespace || "custom_events", parsedData.id || "1");
      // #ai-generate-renames-the-open-item — the generated event REPLACES the form, so it is a new event, not
      // a rename of whatever the user happened to have open. Leaving loadedEventFullId attached made the next
      // Save read the new id as a rename of the event they were merely looking at, removing its block and its
      // localisation. ⧉ Duplicate clears this for the same reason.
      loadedEventFullId = null;
      document.getElementById("eventNamespace").value = parsedEventId.namespace;
      document.getElementById("eventId").value = parsedEventId.id;
      document.getElementById("eventType").value = parsedData.type || "country_event";
      document.getElementById("eventTitle").value = parsedData.title || "";
      document.getElementById("eventDescription").value = parsedData.description || "";
      document.getElementById("eventPictureId").value = parsedData.picture || "";
      updateIconPreview(parsedData.picture || "");
      if (document.getElementById("eventTriggeredOnly")) {
        document.getElementById("eventTriggeredOnly").value = parsedData.triggeredOnly === "yes" ? "yes" : "no";
      }

      // Trigger input and change events to sync draft and update live preview
      ["eventNamespace", "eventId", "eventType", "eventTitle", "eventDescription", "eventPictureId", "eventTriggeredOnly"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      if (window.__novaRefreshEventTopFields) window.__novaRefreshEventTopFields();

      optionsList.innerHTML = "";
      optionCount = 0;
      if (Array.isArray(parsedData.options)) {
        parsedData.options.forEach(opt => {
          optionCount++;
          const fallbackOptName = `${parsedEventId.namespace}.${parsedEventId.id}.${String.fromCharCode(96 + Math.min(optionCount, 26))}`;
          const rawOptName = String(opt.name || fallbackOptName).trim();
          const optName = rawOptName.includes(".")
            ? rawOptName
            : `${parsedEventId.namespace}.${parsedEventId.id}.${cleanScriptId(rawOptName, String.fromCharCode(96 + Math.min(optionCount, 26)))}`;
          const optDiv = document.createElement("div");
          optDiv.className = "event-option";
          optDiv.innerHTML = `
            <button class="remove-opt-btn" title="Remove Option" type="button">&times;</button>
            <div style="margin-bottom: 8px;">
              <label>Option ${optionCount} Name</label>
            </div>
            <input type="text" class="opt-name" value="${escapeHtml(optName)}" placeholder="custom_events.1.a" style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; margin-bottom: 8px;" />
            
            <label style="display: block; margin-bottom: 4px; color: #c9d1d9; font-size: 12px;">Option Title Text (e.g. Great!)</label>
            <input type="text" class="opt-title" value="${escapeHtml(opt.title || '')}" placeholder="Great!" style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; margin-bottom: 8px;" />
            
            <label style="display: block; margin-bottom: 4px; color: #c9d1d9; font-weight: 600; font-size: 12px;">Effects Script</label>
            <textarea class="opt-script" placeholder="add_political_power = 50\nadd_stability = 0.10" style="width: 100%; padding: 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; min-height: 80px; font-family: monospace;">${escapeHtml(opt.script || '')}</textarea>
            <div class="genesis-preview" style="display:none;"></div>
            ${optionExtraFieldsHTML(opt)}
          `;
          optDiv.querySelector(".remove-opt-btn").addEventListener("click", () => {
            optDiv.remove();
            renumberOptionLabels();
            updateLivePreview();
          });
          optDiv.querySelector(".opt-title").addEventListener("input", updateLivePreview);
          optionsList.appendChild(optDiv);
          wireOptionGenesisPreview(optDiv);
        });
      }
      updateLivePreview();
      
      aiStatus.textContent = "AI Event successfully parsed and loaded into the form!";
      aiStatus.style.color = "#2ea043";
    } catch (err) {
      aiStatus.textContent = "Error: " + err.message;
      aiStatus.style.color = "#f85149";
    } finally {
      generateAiEventBtn.disabled = false;
    }
  });

  // Create New Event button click handler
  // Duplicate: make an editable COPY of the loaded event with a fresh non-colliding id in the SAME
  // namespace, ready to Save as a new event (the original is untouched). Speeds up event-chain building.
  function allEventFullIds() {
    const s = new Set();
    (allEvents || []).forEach((e) => { if (e && e.fullId) s.add(e.fullId); });
    return s;
  }
  function uniqueEventLocalId(namespace, base) {
    // HOI4 event ids MUST be `<namespace>.<integer>` (wiki, Event modding: everything after the last dot is
    // converted to an integer — a non-numeric id converts to 0, so EVERY such event becomes the same event,
    // plus "Failed to create id" errors). The old `_copy` suffix minted exactly that broken form; mint the
    // next free NUMBER in the namespace instead.
    const ids = allEventFullIds();
    let next = 0;
    ids.forEach((fid) => {
      const m = /^(.+)\.(\d+)$/.exec(String(fid || ""));
      if (m && m[1] === namespace) next = Math.max(next, parseInt(m[2], 10));
    });
    const baseNum = parseInt(String(base || ""), 10);
    if (Number.isFinite(baseNum)) next = Math.max(next, baseNum);
    let cand = next + 1;
    while (ids.has(namespace + "." + cand)) cand++;
    return String(cand);
  }
  const duplicateEventBtn = document.getElementById("duplicateEventBtn");
  if (duplicateEventBtn) {
    duplicateEventBtn.addEventListener("click", () => {
      // A copy is a NEW event. Forget where the form was loaded from, or the save reads the changed id as a
      // rename and removes the event being copied — the mistake this loop already made on characters.
      const ns = (document.getElementById("eventNamespace").value || "").trim();
      const cur = (document.getElementById("eventId").value || "").trim();
      if (!ns || !cur || cur.startsWith("new_event_")) {
        (window.nbAlert || window.alert)("Load or select an event first — Duplicate then makes an editable copy of it.");
        return;
      }
      const copyId = uniqueEventLocalId(ns, cur);
      loadedEventFullId = null;
      document.getElementById("eventId").value = copyId;
      // #duplicate-shares-option-keys — the option NAME inputs still hold the original's localisation keys
      // (`<ns>.<cur>.a`, `.b`, …), and nothing downstream repoints them: nulling loadedEventFullId means Save
      // sends no previousEventId, so the server's option-key-carry block is skipped precisely because this is
      // not a rename. The copy was therefore written with the ORIGINAL's option keys and the two events shared
      // them forever — editing the copy's button text overwrote the original's authored text in place, and
      // deleting either event stripped the shared keys and blanked the other's buttons. All while the
      // confirmation below promised the original was untouched.
      const oldOptPrefix = ns + "." + cur + ".";
      const newOptPrefix = ns + "." + copyId + ".";
      document.querySelectorAll(".opt-name").forEach((el) => {
        const v = String(el.value || "").trim();
        // Only the keys that belong to the event being copied. A key pointing somewhere else is either
        // deliberately shared or hand-written, and is not ours to rewrite.
        if (v.startsWith(oldOptPrefix)) el.value = newOptPrefix + v.slice(oldOptPrefix.length);
      });
      const titleEl = document.getElementById("eventTitle");
      if (titleEl && titleEl.value) titleEl.value = titleEl.value.replace(/\s*\(copy\)\s*$/i, "") + " (copy)";
      // It's now a NEW, unsaved event: drop the active selection + hide Delete until it's saved.
      document.querySelectorAll(".event-item-card").forEach((el) => el.classList.remove("active"));
      const delBtn = document.getElementById("deleteEventBtn"); if (delBtn) delBtn.classList.add("is-hidden");
      ["eventId", "eventTitle"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
      });
      if (typeof updateLivePreview === "function") updateLivePreview();
      if (window.nbAlert) window.nbAlert('Copy ready as "' + ns + "." + copyId + '". Tweak it if you like, then Save to create it — the original "' + ns + "." + cur + '" is untouched.', "Duplicated");
    });
  }

  const newEventBtn = document.getElementById("newEventBtn");
  if (newEventBtn) {
    newEventBtn.addEventListener("click", () => {
      // #create-new-discards-the-form — this replaces a written event with a blank template: the trigger,
      // the immediate and after blocks, every option's effect script. Clicking another event in the list has
      // asked since #makers-lose-unsaved-work; this button, three inches away, did not. On "discard" the
      // watcher is already clean, so the re-click runs straight through.
      if (evUnsaved && evUnsaved.isDirty()) {
        evUnsaved.confirmDiscard("Start a new event", () => newEventBtn.click());
        return;
      }
      loadedEventFullId = null; // a blank form has nothing to rename from
      const generatedId = "new_event_" + Math.floor(Math.random() * 1000);
      activeDraft = {
        fullId: `custom_events.${generatedId}`,
        namespace: "custom_events",
        id: generatedId,
        type: "country_event",
        title: "New Event Title",
        description: "New Event Description",
        picture: "GFX_report_event_001",
        triggeredOnly: "no",
        options: [],
        autoSelect: true
      };

      document.getElementById("eventNamespace").value = "custom_events";
      document.getElementById("eventId").value = generatedId;
      document.getElementById("eventType").value = "country_event";
      document.getElementById("eventTitle").value = "New Event Title";
      document.getElementById("eventDescription").value = "New Event Description";
      // A fresh draft inherits nothing from whatever was open before it.
      loadedConditionalDesc = null;
      loadedConditionalTitle = null;
      // Derived from the type this template sets, not restated. Same value today (a new draft is a
      // country_event), but if that ever changes the picture family follows instead of silently going wrong.
      document.getElementById("eventPictureId").value = defaultPictureFor("country_event");
      updateIconPreview(defaultPictureFor("country_event"));
      document.getElementById("eventPictureUpload").value = "";
      document.getElementById("optionsList").innerHTML = "";
      document.getElementById("aiEventPrompt").value = "";
      document.getElementById("aiStatus").textContent = "Starter Event Template Ready! Fill in details and click 'Save Event' above to add it to your sidebar.";
      document.getElementById("aiStatus").style.color = "#58a6ff";
      clearEventBridge(); // fresh template — no owner countries / year yet
      renderEventInfo(null); // hide the Event Info card for a brand-new draft
      if (document.getElementById("deleteEventBtn")) document.getElementById("deleteEventBtn").classList.add("is-hidden");
      if (document.getElementById("eventTriggeredOnly")) {
        document.getElementById("eventTriggeredOnly").value = "no";
      }
      if (document.getElementById("eventHidden")) document.getElementById("eventHidden").checked = false;
      if (document.getElementById("eventFireOnce")) document.getElementById("eventFireOnce").checked = false;
      if (document.getElementById("eventMajor")) document.getElementById("eventMajor").checked = false;
      if (document.getElementById("eventMtthDays")) document.getElementById("eventMtthDays").value = 0;
      if (document.getElementById("eventTrigger")) document.getElementById("eventTrigger").value = "";
      if (document.getElementById("eventImmediate")) document.getElementById("eventImmediate").value = "";
      if (document.getElementById("eventAfter")) document.getElementById("eventAfter").value = "";
      if (document.getElementById("eventTimeoutDays")) document.getElementById("eventTimeoutDays").value = 0;
      if (window.__novaRefreshEventTopFields) window.__novaRefreshEventTopFields();
      optionCount = 0;

      // Refresh list to show Draft folder at top
      renderEventsList(allEvents);
      updateLivePreview();

      // #new-draft-is-not-unsaved-work — THE UNTOUCHED TEMPLATE IS THE BASELINE.
      //
      // Without this the blank draft differs from whatever was loaded before it, so the watcher reads dirty
      // the moment it is created — and the draft auto-selects itself a few lines above, which now goes
      // through the item-switch guard. The result was a "you have unsaved changes" prompt about the empty
      // form the user had just asked for. The Decisions maker already baselines its template for exactly
      // this reason; only real typing should count from here.
      if (evUnsaved) evUnsaved.markClean();

      // Focus + select the title so you can type the real name over the "New Event Title" placeholder.
      const titleInput = document.getElementById("eventTitle");
      if (titleInput) setTimeout(() => { try { titleInput.focus(); titleInput.select(); } catch (_) {} }, 0);
    });
  }

  // Delete Event integration
  const deleteEventBtn = document.getElementById("deleteEventBtn");
  if (deleteEventBtn) {
    deleteEventBtn.addEventListener("click", async () => {
      let namespace = document.getElementById("eventNamespace").value.trim();
      let id = document.getElementById("eventId").value.trim();
      const normalizedEventId = splitAiEventId(namespace, id);
      namespace = normalizedEventId.namespace;
      id = normalizedEventId.id;
      document.getElementById("eventNamespace").value = namespace;
      document.getElementById("eventId").value = id;
      const fullId = namespace && id ? `${namespace}.${id}` : "";

      if (!namespace || !id) return;

      window.novaConfirm(`Are you sure you want to delete Event "${fullId}"?`, async () => {

      deleteEventBtn.disabled = true;
      deleteEventBtn.textContent = "Deleting...";

      try {
        const response = await fetch("/api/events/delete-definition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: getModPath(),
            eventId: fullId,
            // Act on the file the user actually clicked. #event-wrong-file-targeted
            fileName: loadedEventFileName || undefined
          })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Name the file, and never claim more than happened: if the id is defined elsewhere too, the event
        // still loads in game and the user has to know. #event-wrong-file-targeted
        const where = data.deletedFromFile ? ` from ${data.deletedFromFile}` : "";
        const survivors = Array.isArray(data.remainingDefinitionFiles) ? data.remainingDefinitionFiles : [];
        nbAlert(
          `Deleted ${fullId}${where}.` +
          (survivors.length
            ? `\n\n⚠ It is STILL defined in ${survivors.join(", ")}, so it will still load in game. Delete it there too if you meant to remove it entirely.`
            : "") +
          `\n\nA backup of the original file was saved automatically, so this can be recovered if it was a mistake.`);
        activeDraft = null;
        autoSelectFullId = null;
        document.getElementById("eventTitle").value = "";
        document.getElementById("eventDescription").value = "";
        // #delete-leaves-the-page-dirty-over-a-deleted-event — the two fields above are inside evUnsaved's
        // watched root, so blanking them made the page read dirty over an event that no longer exists.
        // Clicking another event then asked whether to discard it, and — far worse — the quit dialog's Save
        // clicks #saveEventBtn, which with the namespace and id still filled in RE-CREATES the event that
        // was just deleted, blank. The identity goes with the rest, exactly as the Decisions maker does.
        document.getElementById("eventNamespace").value = "";
        document.getElementById("eventId").value = "";
        if (evUnsaved) evUnsaved.markClean();
        document.getElementById("deleteEventBtn").classList.add("is-hidden");
        loadEventsList();
      } catch (err) {
        nbAlert(`Delete failed: ${err.message}`);
      } finally {
        deleteEventBtn.disabled = false;
        deleteEventBtn.textContent = "Delete Event";
      }
      }, { title: "Delete Event", yesLabel: "Delete", danger: true });
    });
  }

  // Save Event integration
  const saveEventBtn = document.getElementById("saveEventBtn");
  if (saveEventBtn) {
    saveEventBtn.addEventListener("click", async () => {
      let namespace = document.getElementById("eventNamespace").value.trim();
      let id = document.getElementById("eventId").value.trim();
      const normalizedEventId = splitAiEventId(namespace, id);
      namespace = normalizedEventId.namespace;
      id = normalizedEventId.id;
      // HOI4 requires the id after the namespace to be an INTEGER (wiki: a non-numeric id converts to 0
      // in-game, collapsing every such event into one + "Failed to create id" errors). Drafts
      // ("new_event_123") and hand-typed ids could slip through — auto-assign the next free number instead.
      if (!/^\d+$/.test(id)) {
        const fixedId = uniqueEventLocalId(namespace, id);
        if (window.nbAlert) window.nbAlert(`HOI4 event ids must be a number after the namespace — saving as "${namespace}.${fixedId}" instead of "${namespace}.${id}" (a non-numeric id fails to load in-game).`, "Event id adjusted");
        id = fixedId;
      }
      document.getElementById("eventNamespace").value = namespace;
      document.getElementById("eventId").value = id;
      const type = document.getElementById("eventType").value;
      const title = document.getElementById("eventTitle").value.trim();
      const description = document.getElementById("eventDescription").value.trim();
      const picture = document.getElementById("eventPictureId").value.trim();
      const triggeredOnly = document.getElementById("eventTriggeredOnly") ? document.getElementById("eventTriggeredOnly").value : "no";
      const hidden = document.getElementById("eventHidden") && document.getElementById("eventHidden").checked ? "yes" : "no";
      const fireOnce = document.getElementById("eventFireOnce") && document.getElementById("eventFireOnce").checked ? "yes" : "no";
      const major = document.getElementById("eventMajor") && document.getElementById("eventMajor").checked ? "yes" : "no";
      const mtthDays = parseInt(document.getElementById("eventMtthDays") ? document.getElementById("eventMtthDays").value : "0", 10) || 0;
      const trigger = document.getElementById("eventTrigger") ? document.getElementById("eventTrigger").value.trim() : "";
      const immediate = document.getElementById("eventImmediate") ? document.getElementById("eventImmediate").value.trim() : "";
      const after = document.getElementById("eventAfter") ? document.getElementById("eventAfter").value.trim() : "";
      const timeoutDays = parseInt(document.getElementById("eventTimeoutDays") ? document.getElementById("eventTimeoutDays").value : "0", 10) || 0;

      if (!namespace || !id) {
        nbAlert("Namespace and Event ID are required.");
        return;
      }
      // 🈯 DOT-SEPARATED SEGMENTS ARE LEGAL. An add_namespace may itself contain dots — vanilla ships
      // `MUN_czech.news`, Millennium Dawn `israel.coalition`, The Road to 56 has 39 of them, and 611 event
      // ids across the corpora are therefore multi-segment. #event-multi-segment-namespace widened the click
      // handler, cleanEventNamespace and the server guard; this Save gate is the fourth caller and never
      // adopted it, so the server would happily accept `israel.coalition` while the button in front of the
      // user refused it. Same shape as the server's own regex on purpose — a gate that disagrees with the
      // endpoint it guards is worse than no gate.
      if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$/.test(namespace)) {
        nbAlert("Event namespace must start with a letter or underscore, then letters, numbers and underscores — optionally in dot-separated segments like israel.coalition. HOI4 lexes a leading digit as a number, which breaks the events file (the namespace is also the filename).");
        return;
      }

      const options = [];
      document.querySelectorAll(".event-option").forEach(optEl => {
        const aiRaw = (optEl.querySelector(".opt-ai-chance")?.value || "").trim();
        options.push({
          name: optEl.querySelector(".opt-name").value.trim() || `${namespace}.${id}.a`,
          title: optEl.querySelector(".opt-title").value.trim() || "",
          script: optEl.querySelector(".opt-script").value.trim() || "",
          aiChance: aiRaw === "" ? null : Number(aiRaw),
          trigger: (optEl.querySelector(".opt-trigger")?.value || "").trim()
        });
      });

      // For a self-firing event with no owner, bake the fire-date into its own trigger so it fires
      // globally on that date (see the managed-fire-date helpers near setDateFields). When owners
      // exist the date is scheduled into their history instead, so we strip any managed line. This is
      // recomputed on every save from the date field, so the trigger never accumulates date lines.
      const fireDate = readDateFields();
      const fireDateSet = Number.isFinite(fireDate.year) && fireDate.year > 0;
      const wantsGlobalDate = fireDateSet && eventOwners.size === 0 && triggeredOnly !== "yes";
      let effectiveTrigger = extractManagedFireDate(trigger).trigger;
      let effectiveFireOnce = fireOnce;
      let effectiveMtthDays = mtthDays;
      if (wantsGlobalDate) {
        effectiveTrigger = injectManagedFireDate(effectiveTrigger, fireDate);
        effectiveFireOnce = "yes";                        // a dated event fires once, not every day
        effectiveMtthDays = mtthDays > 0 ? mtthDays : 7;  // a self-firing event needs an MTTH to roll
      }

      saveEventBtn.disabled = true;
      saveEventBtn.textContent = "Saving...";

      try {
        const response = await fetch("/api/events/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: getModPath(),
            namespace,
            id,
            // Where this event used to live, so a rename removes the old block instead of leaving a copy.
            ...(loadedEventFullId && loadedEventFullId !== `${namespace}.${id}` ? { previousEventId: loadedEventFullId } : {}),
            type,
            title,
            description,
            picture,
            triggeredOnly,
            hidden,
            fireOnce: effectiveFireOnce,
            major,
            mtthDays: effectiveMtthDays,
            trigger: effectiveTrigger,
            immediate,
            after,
            timeoutDays,
            options
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Wire the event into each owner country's game-start history (and unwire any removed),
        // using the chosen year → days. Runs with the now-final id.
        const ownerSync = await syncEventOwnersToGame(`${namespace}.${id}`);
        // The event file itself saved; say plainly which owners did not get wired and why, rather than
        // reporting a clean success for a write the server refused. #owner-write-refused-in-silence
        const ownerWarn = (ownerSync && ownerSync.failed.length)
          ? "\n\n⚠️ The event was saved, but " + ownerSync.failed.length + " owner setting could not be written:\n"
            + ownerSync.failed.map((f) => "• " + f.who + ": " + f.error).join("\n")
          : "";

        activeDraft = null; // Save succeeded, clear draft
        if (wantsGlobalDate) {
          nbAlert(ownerWarn + `Saved to ${data.eventPath}. With no owner country set, this self-firing event is now gated to fire globally on ${fireDate.year}.${fireDate.month || 1}.${fireDate.day || 1} (once). Add an owner country if you'd rather it fire for a specific nation.`);
        } else {
          nbAlert(`Successfully saved to ${data.eventPath} and generated English localizations!` + ownerWarn);
        }
        // #save-does-not-rebaseline-the-watcher — the form now IS the file, so this is the new baseline.
        // Without it the save is followed straight away by "You have unsaved changes in the Event Maker.
        // Switch event anyway?", because the auto-select below goes through the item-switch guard and the
        // baseline is still whatever the event was LOADED with.
        if (evUnsaved) evUnsaved.markClean();
        // Expand the file folder containing the saved event and auto-select it
        const savedFileName = data.eventPath ? data.eventPath.split(/[\\/]/).pop() : `${namespace}.txt`;
        expandedFolders.add(savedFileName);
        autoSelectFullId = `${namespace}.${id}`;
        loadEventsList();
      } catch (err) {
        nbAlert(`Save failed: ${err.message}`);
      } finally {
        saveEventBtn.disabled = false;
        saveEventBtn.textContent = "Save Event";
      }
    });
  }
  // ── Wire the event→country bridge controls (Add owner + the typed fire date) ────────────────────
  const ownerAddBtn = document.getElementById("eventOwnerAdd");
  if (ownerAddBtn) ownerAddBtn.addEventListener("click", () => {
    const picker = document.getElementById("eventOwnerPicker");
    const raw = (picker && picker.value || "").trim();
    const tag = raw === "__ALL__" ? "__ALL__" : raw.toUpperCase();
    if (!tag) { updateBridgeStatus("Pick a country from the list first.", "#e8a849"); return; }
    if (eventOwners.has(tag)) { updateBridgeStatus(tag === "__ALL__" ? "Already set to every country." : `${tag} is already in the list.`, "#e8a849"); return; }
    // "All countries" is exclusive: choosing it clears specific tags; choosing a specific tag clears it.
    if (tag === "__ALL__") { eventOwners = new Set(["__ALL__"]); }
    else { eventOwners.delete("__ALL__"); eventOwners.add(tag); }
    renderOwnerChips();
    updateBridgeStatus();
  });
  ["eventDateYear", "eventDateMonth", "eventDateDay", "eventDateHour"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => { syncDateHint(); });
  });
  renderOwnerChips(); // initial empty state
  syncDateHint();     // resolve the start date + show the initial hint
  // ── Newspaper style (mod-wide news-event paper) ──────────────────────
  // The in-game newspaper is one global frame for ALL news events. Let the user override the paper art:
  // vanilla, a style copied from an installed mod, or their own upload. Writes a Nova-owned override and
  // the live preview re-resolves GFX_event_news_bg so it matches what the player will see.
  async function refreshNewspaperThumb() {
    const thumb = document.getElementById("newspaperStyleThumb");
    if (!thumb) return;
    const fallback = "/api/vanilla-ui?rel=gfx/interface/event_news_bg.dds";
    try {
      // Ask for the sprite THIS MOD'S news window actually draws, not a fixed key. The preview beside this
      // thumbnail uses layout.background, and the two disagreed on any mod whose EventWindow_News names a
      // different backdrop — Old World Blues builds its paper from three sliced sprites and never draws
      // GFX_event_news_bg at all, so the 44x50 thumbnail showed a completely different image from the
      // newspaper two inches above it, both labelled as that mod's newspaper.
      let key = "GFX_event_news_bg";
      try {
        const layouts = await loadEventWindowLayouts();
        const nl = layouts && layouts.EventWindow_News;
        if (nl && nl.background && nl.background !== "GFX_tiled_window_transparent") key = nl.background;
      } catch (_) { /* fall back to the conventional key */ }
      const r = await fetch(`/api/ideas/sprite-url?key=${encodeURIComponent(key)}&modPath=${encodeURIComponent(getModPath())}`);
      const d = await r.json();
      thumb.style.backgroundImage = `url("${bustUrl((d && d.url) ? d.url : fallback)}")`;
    } catch (_) { thumb.style.backgroundImage = `url("${fallback}")`; }
  }
  async function loadNewspaperStyleDisplay() {
    const label = document.getElementById("newspaperStyleCurrent");
    if (!label) return;
    try {
      const r = await fetch(`/api/events/newspaper-styles?modPath=${encodeURIComponent(getModPath())}`);
      const d = await r.json();
      const cur = d && d.current;
      label.textContent = (cur && cur.label) ? ("Using: " + cur.label) : "Default — vanilla / whatever mod is loaded";
    } catch (_) { label.textContent = "Default newspaper"; }
    refreshNewspaperThumb();
  }
  async function applyNewspaperStyle(source) {
    const r = await fetch("/api/events/apply-newspaper-style", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: getModPath(), source: source }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || (d && d.error)) throw new Error((d && d.error) || "Failed to apply.");
    newspaperBust = String(Date.now());
    spriteUrlCache = {};
    await loadNewspaperStyleDisplay();
    updateLivePreview();
    return d;
  }
  function openNewspaperPicker() {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = "background:#161b22; border:1px solid #30363d; border-radius:8px; color:#c9d1d9; padding:20px; width:560px; max-width:92%; box-shadow:0 8px 32px rgba(0,0,0,0.5); outline:none;";
    dialog.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <h3 style="margin:0; font-size:16px; font-weight:600; color:#e6edf3;">Newspaper Style</h3>
        <button class="np-close" type="button" style="background:transparent; border:none; color:#8b949e; font-size:18px; cursor:pointer;">✕</button>
      </div>
      <p style="margin:0 0 14px; font-size:12px; color:#8b949e;">HOI4 uses one newspaper frame for every news event, so this applies <b>mod-wide</b>. Pick the paper look your players will see.</p>
      <div class="np-grid" style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; max-height:340px; overflow-y:auto;"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; gap:8px;">
        <button class="np-remove btn btn-secondary" type="button" style="background:#3a1d1d; border-color:#5a2a2a;">Remove override (use default)</button>
        <div style="display:flex; gap:8px;">
          <input type="file" class="np-file" accept="image/png,image/jpeg" style="display:none;" />
          <button class="np-upload btn btn-secondary" type="button" style="opacity:0.5;" title="Coming in a future update">Upload your own… (soon)</button>
          <button class="np-apply btn btn-primary" type="button" disabled style="opacity:0.45;">Apply</button>
        </div>
      </div>
      <div class="np-status" style="margin-top:10px; font-size:12px; color:#8b949e; min-height:16px;"></div>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();
    const close = () => { try { dialog.close(); } catch (_) {} dialog.remove(); };
    dialog.querySelector(".np-close").addEventListener("click", close);
    dialog.addEventListener("cancel", close);
    const grid = dialog.querySelector(".np-grid");
    const status = dialog.querySelector(".np-status");
    const applyBtn = dialog.querySelector(".np-apply");
    let pendingStyle = null;
    // Nothing is written to the mod until the user clicks Apply — selecting/browsing a style only
    // previews it, so changing a style never auto-saves.
    if (applyBtn) applyBtn.addEventListener("click", async () => {
      if (!pendingStyle) return;
      status.textContent = "Applying " + pendingStyle.name + "…";
      applyBtn.disabled = true;
      try { await applyNewspaperStyle(pendingStyle.id); status.textContent = "✓ Applied: " + pendingStyle.name; setTimeout(close, 700); }
      catch (e) { status.textContent = "⚠ " + (e.message || "Failed."); applyBtn.disabled = false; }
    });
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#8b949e; padding:12px;">Loading styles…</div>`;

    const makeTile = (s) => {
      const div = document.createElement("div");
      div.style.cssText = "border:1px solid #30363d; border-radius:6px; overflow:hidden; cursor:pointer; background:#0d1117;";
      const img = document.createElement("div");
      img.style.cssText = "height:90px; background:#0d1117 center/cover no-repeat;";
      img.style.backgroundImage = `url("${s.thumb}")`;
      const cap = document.createElement("div");
      cap.style.cssText = "padding:6px 8px; font-size:12px; color:#c9d1d9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
      cap.textContent = s.name;
      div.appendChild(img); div.appendChild(cap);
      div.addEventListener("click", () => {
        pendingStyle = s;
        grid.querySelectorAll(":scope > div").forEach((t) => { t.style.outline = ""; });
        div.style.outline = "2px solid #58a6ff";
        status.textContent = "Selected: " + s.name + " — click Apply to save it to your mod.";
        if (applyBtn) { applyBtn.disabled = false; applyBtn.style.opacity = "1"; }
      });
      return div;
    };

    fetch(`/api/events/newspaper-styles?modPath=${encodeURIComponent(getModPath())}`)
      .then((r) => r.json())
      .then((d) => {
        grid.innerHTML = "";
        const list = (d && d.styles) || [];
        if (!list.length) { grid.innerHTML = `<div style="grid-column:1/-1; color:#8b949e;">No styles found.</div>`; return; }
        list.forEach((s) => grid.appendChild(makeTile(s)));
      })
      .catch(() => { grid.innerHTML = `<div style="grid-column:1/-1; color:#f85149;">Couldn't load styles.</div>`; });

    const fileInput = dialog.querySelector(".np-file");
    dialog.querySelector(".np-upload").addEventListener("click", () => { status.textContent = "Custom paper upload is still a work in progress — coming in a future update. For now, use Vanilla or copy a style from an installed mod."; });
    fileInput.addEventListener("change", async () => {
      if (!fileInput.files || !fileInput.files[0]) return;
      status.textContent = "Uploading your image…";
      const fd = new FormData();
      fd.append("image", fileInput.files[0]);
      fd.append("modPath", getModPath());
      try {
        const r = await fetch("/api/events/upload-newspaper", { method: "POST", body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || (d && d.error)) throw new Error((d && d.error) || "Upload failed.");
        newspaperBust = String(Date.now()); spriteUrlCache = {}; await loadNewspaperStyleDisplay(); updateLivePreview();
        status.textContent = "✓ Applied your image."; setTimeout(close, 600);
      } catch (e) { status.textContent = "⚠ " + (e.message || "Upload failed."); }
    });
    dialog.querySelector(".np-remove").addEventListener("click", async () => {
      status.textContent = "Removing override…";
      try { await applyNewspaperStyle("remove"); status.textContent = "✓ Reverted to default."; setTimeout(close, 600); }
      catch (e) { status.textContent = "⚠ " + (e.message || "Failed."); }
    });
  }
  (function wireNewspaperStyle() {
    const btn = document.getElementById("newspaperStyleBtn");
    if (btn) btn.addEventListener("click", openNewspaperPicker);
    loadNewspaperStyleDisplay();
  })();


  // ── Reference Picker Modal ─────────────────────────────────────────────
  async function showEntityPickerModal(type, targetTextarea) {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = `
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      color: #c9d1d9;
      padding: 20px;
      width: 450px;
      max-width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      outline: none;
    `;

    const titleMap = {
      spirit: "Select National Spirit (Idea)",
      tech: "Select Starting Technology",
      event: "Select Event to Fire",
      decision: "Select Decision to Activate"
    };

    const header = document.createElement("div");
    header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;";
    header.innerHTML = `
      <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #e6edf3;">${titleMap[type] || "Select Entity"}</h3>
      <button class="close-btn" style="background: transparent; border: none; color: #8b949e; font-size: 18px; cursor: pointer; padding: 4px; line-height: 1;">✕</button>
    `;
    dialog.appendChild(header);

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "🔍 Search by ID or name...";
    searchInput.style.cssText = "width: 100%; padding: 8px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 13px; margin-bottom: 12px; outline: none;";
    dialog.appendChild(searchInput);

    const listContainer = document.createElement("div");
    listContainer.style.cssText = "max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 4px;";
    dialog.appendChild(listContainer);

    document.body.appendChild(dialog);
    dialog.showModal();

    const closeDialog = () => {
      dialog.close();
      dialog.remove();
    };

    header.querySelector(".close-btn").addEventListener("click", closeDialog);
    dialog.addEventListener("cancel", closeDialog);

    listContainer.innerHTML = `<div style="text-align: center; color: #8b949e; padding: 12px; font-size: 13px;">Loading...</div>`;

    try {
      const activeRoot = getModPath();
      let items = [];
      if (type === "spirit") {
        // withNames=1, or the catalogue returns no names at all; and the field is `localizedName` — `it.name`
        // does not exist on a catalogue item under any query, so the grey name line below was dead for the
        // spirit type. 4,977 vanilla spirits and 10,148 of Millennium Dawn's have a name.
        // #pickers-show-raw-tokens
        const resp = await fetch(`/api/ideas/catalog?includeVanilla=1&includeActiveMod=1&withNames=1&modPath=${encodeURIComponent(activeRoot)}`);
        const data = await resp.json();
        items = (data.items || [])
          .map(it => ({ id: it.ideaId, name: it.localizedName || it.ideaId }))
          .filter(it => it.id && it.id !== "country" && it.id !== "hidden_ideas");
      } else if (type === "tech") {
        const qs = new URLSearchParams({ includeVanilla: "1", includeActiveMod: "1" });
        // `modPath` — the endpoint has never read `sourcePath` (that is /api/ideas/catalog's spelling, from
        // which this picker was copied). It fell back to the persisted active mod, listing vanilla only.
        // #tech-picker-sends-a-param-nobody-reads
        if (activeRoot) qs.set("modPath", activeRoot);
        qs.set("lite", "1"); // picker needs id + name only; skip the slow per-icon resolution
        const resp = await fetch(`/api/technologies/catalog?${qs}`);
        const data = await resp.json();
        // The catalogue answers under `technologies`, not `items`; the old `|| data` fallback handed `.map`
        // the response object and threw, so this picker never once listed a technology. Fixed in
        // public/app.js:9910 long ago. #tech-picker-reads-the-wrong-key
        items = (data.technologies || data.items || []).map(t => ({ id: t.id, name: t.name || t.id }));
      } else if (type === "event") {
        const resp = await fetch(`/api/events/list?modPath=${encodeURIComponent(activeRoot)}&includeInherited=1`);
        const data = await resp.json();
        items = (data.events || []).map(evt => ({ id: evt.fullId, name: evt.title || evt.fullId }));
      } else if (type === "decision") {
        const resp = await fetch(`/api/decisions/list?modPath=${encodeURIComponent(activeRoot)}&includeInherited=1`);
        const data = await resp.json();
        const cats = data.categories || [];
        items = cats.flatMap(cat => (cat.decisions || []).map(dec => ({ id: dec.id, name: dec.id })));
      }

      const renderList = (filter = "") => {
        listContainer.innerHTML = "";
        const filtered = items.filter(it => 
          it.id.toLowerCase().includes(filter) || 
          (it.name && it.name.toLowerCase().includes(filter))
        );

        if (!filtered.length) {
          listContainer.innerHTML = `<div style="text-align: center; color: #8b949e; padding: 12px; font-size: 13px;">No items found</div>`;
          return;
        }

        filtered.forEach(it => {
          const btn = document.createElement("button");
          btn.style.cssText = "text-align: left; background: #21262d; border: 1px solid #30363d; border-radius: 4px; padding: 8px 12px; color: #c9d1d9; font-size: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; width: 100%; transition: background 0.15s; margin-bottom: 2px;";
          btn.addEventListener("mouseenter", () => btn.style.background = "#30363d");
          btn.addEventListener("mouseleave", () => btn.style.background = "#21262d");

          btn.innerHTML = `
            <div style="font-family: monospace; font-weight: bold; color: #58a6ff;">${escapeHtml(it.id)}</div>
            ${it.name && it.name !== it.id ? `<div style="color: #8b949e; font-size: 11px;">${escapeHtml(stripLocDisplayCodes(it.name))}</div>` : ""}
          `;

          btn.addEventListener("click", () => {
            let syntax = "";
            if (type === "spirit") {
              syntax = `add_ideas = ${it.id}`;
            } else if (type === "tech") {
              syntax = `set_technology = {\n\t${it.id} = 1\n}`;
            } else if (type === "event") {
              syntax = `country_event = ${it.id}`;
            } else if (type === "decision") {
              syntax = `activate_decision = ${it.id}`;
            }

            const start = targetTextarea.selectionStart;
            const end = targetTextarea.selectionEnd;
            const val = targetTextarea.value;
            const prefix = val.substring(0, start);
            const suffix = val.substring(end);

            let insertText = syntax;
            if (prefix.length > 0 && !prefix.endsWith("\n")) {
              insertText = "\n" + insertText;
            }
            if (suffix.length > 0 && !suffix.startsWith("\n")) {
              insertText = insertText + "\n";
            }

            targetTextarea.value = prefix + insertText + suffix;
            targetTextarea.focus();
            targetTextarea.selectionStart = targetTextarea.selectionEnd = start + insertText.length;
            
            targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            targetTextarea.dispatchEvent(new Event('change', { bubbles: true }));

            closeDialog();
          });

          listContainer.appendChild(btn);
        });
      };

      renderList();
      searchInput.addEventListener("input", (e) => renderList(e.target.value.toLowerCase().trim()));

    } catch (e) {
      console.error(e);
      listContainer.innerHTML = `<div style="text-align: center; color: #f85149; padding: 12px; font-size: 13px;">Failed to load items.</div>`;
    }
  }

  // Event delegation to capture insert clicks inside optionsList
  if (optionsList) {
    optionsList.addEventListener("click", (e) => {
      const btn = e.target.closest(".quick-insert-btn");
      if (!btn) return;
      const type = btn.dataset.type;
      const optDiv = btn.closest(".event-option");
      const textarea = optDiv ? optDiv.querySelector(".opt-script") : null;
      if (textarea) {
        showEntityPickerModal(type, textarea);
      }
    });
  }
});
