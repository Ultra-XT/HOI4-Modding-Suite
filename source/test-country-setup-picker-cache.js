// #country-setup-pickers-frozen — Country Setup's spirit, technology and country pickers were frozen for the
// whole app session, so content created on another page never appeared in them.
//
// fetchCachedJson(url, cacheKey) returned sessionStorage.getItem(cacheKey) whenever the key existed — no TTL,
// no fingerprint, no revalidation. There is no sessionStorage.removeItem or .clear() anywhere in public/, and
// sessionStorage deliberately survives in-window navigation (map-dev-warning.js and startup-backup-warning.js
// rely on exactly that property). So leaving Country Setup, creating a spirit on the Ideas page or a
// technology on the Research page, and coming back re-read the same frozen payload: the thing you had just
// made was missing from the picker whose entire job is to offer it. Switching the mod dropdown and back did
// not help either — that handler calls the same loaders, straight back through here.
//
// It backed three pickers: countries_catalog_<mod>, ideas_catalog_named_<mod>, techs_catalog_lite_<mod>.
//
// Fix: keep the cache (these catalogues run to thousands of entries) but serve it for the paint and ALWAYS
// revalidate in the background, re-rendering only if the payload actually changed. The callback is each
// loader's own apply(), so the lists rebuild from fresh data without duplicating the transform.
//
// The helper is exercised for real here — pulled out of the shipped source and run against a stub
// sessionStorage and fetch — rather than asserted about by grep alone.
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const src = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");

// ── pull the real helper out and run it ──────────────────────────────────────────────────────────
// Start at the _revalidatedKeys declaration — the helper closes over it, so extracting from the `async
// function` line alone would throw a ReferenceError the moment a cache hit tried to revalidate.
const start = src.indexOf("const _revalidatedKeys = new Set();");
const end = src.indexOf("function normalizePath");
ok("fetchCachedJson is still there", start !== -1 && end > start, { start, end });
const fnSrc = src.slice(start, end);
ok("…and it explains why it revalidates", /#country-setup-pickers-frozen/.test(src), "no marker comment");

const makeHelper = (store, fetchImpl) =>
  new Function("sessionStorage", "fetch", fnSrc + "\nreturn fetchCachedJson;")(store, fetchImpl);

const mkStore = (init) => {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), _map: m };
};
const jsonFetch = (payloadRef, counter) => async () => { counter.n++; return { json: async () => payloadRef.v }; };
const settle = () => new Promise((r) => setTimeout(r, 30)); // let the background revalidation run

(async () => {
  // 1. cold: no cache — fetch, store, return
  {
    const store = mkStore(), hits = { n: 0 }, payload = { v: { items: [1, 2] } };
    const f = makeHelper(store, jsonFetch(payload, hits));
    let revalidated = null;
    const got = await f("/u", "k", (d) => { revalidated = d; });
    ok("a cold read fetches", hits.n === 1, hits.n);
    ok("…returns the payload", JSON.stringify(got) === JSON.stringify(payload.v), got);
    ok("…and writes it to the cache", store.getItem("k") === JSON.stringify(payload.v), store.getItem("k"));
    await settle();
    ok("…without a spurious revalidation callback", revalidated === null, revalidated);
    ok("…and no second fetch", hits.n === 1, hits.n);
  }

  // 2. warm and unchanged — serve cache, revalidate quietly, do NOT touch the DOM
  {
    const data = { items: [1, 2] };
    const store = mkStore({ k: JSON.stringify(data) }), hits = { n: 0 }, payload = { v: data };
    const f = makeHelper(store, jsonFetch(payload, hits));
    let revalidated = null;
    const got = await f("/u", "k", (d) => { revalidated = d; });
    ok("a warm read returns the cached payload immediately", JSON.stringify(got) === JSON.stringify(data), got);
    await settle();
    ok("…it still revalidates in the background", hits.n === 1, hits.n);
    ok("…but does not re-render when nothing changed", revalidated === null, revalidated);
  }

  // 3. warm and CHANGED — this is the bug
  {
    const oldData = { items: ["old_spirit"] };
    const newData = { items: ["old_spirit", "brand_new_spirit"] };
    const store = mkStore({ k: JSON.stringify(oldData) }), hits = { n: 0 }, payload = { v: newData };
    const f = makeHelper(store, jsonFetch(payload, hits));
    let revalidated = null;
    const got = await f("/u", "k", (d) => { revalidated = d; });
    ok("the cached payload still paints first", JSON.stringify(got) === JSON.stringify(oldData), got);
    await settle();
    ok("THE PICKER IS TOLD ABOUT THE NEW CONTENT", revalidated !== null, "no revalidation callback");
    ok("…with the fresh payload", revalidated && JSON.stringify(revalidated) === JSON.stringify(newData), revalidated);
    ok("…including the item created on the other page", revalidated && revalidated.items.includes("brand_new_spirit"), revalidated);
    ok("…and the cache is updated for next time", store.getItem("k") === JSON.stringify(newData), store.getItem("k"));
  }

  // 4. a failed revalidation must not break the page or poison the cache
  {
    const data = { items: [1] };
    const store = mkStore({ k: JSON.stringify(data) });
    const f = makeHelper(store, async () => { throw new Error("offline"); });
    let revalidated = null;
    const got = await f("/u", "k", (d) => { revalidated = d; });
    ok("a warm read survives a failed revalidation", JSON.stringify(got) === JSON.stringify(data), got);
    await settle();
    ok("…the callback is not fired", revalidated === null, revalidated);
    ok("…and the cached value is left alone", store.getItem("k") === JSON.stringify(data), store.getItem("k"));
  }

  // 5. one revalidation per key per page load. The loaders are each called from three places during a single
  //    load, and the ideas/technology catalogues are ~2 MB and ~1.8 MB — without this guard a page load fired
  //    three identical rounds of all three requests (~11 MB). Confirmed in the browser before it was added.
  {
    const data = { items: [1] };
    const store = mkStore({ k: JSON.stringify(data), other: JSON.stringify(data) });
    const hits = { n: 0 }, payload = { v: { items: [1, 2] } };
    const f = makeHelper(store, jsonFetch(payload, hits));
    let calls = 0;
    await f("/u", "k", () => { calls++; });
    await f("/u", "k", () => { calls++; });
    await f("/u", "k", () => { calls++; });
    await settle();
    ok("three cached reads of the same key revalidate ONCE", hits.n === 1, hits.n);
    ok("…and re-render once", calls === 1, calls);
    await f("/u2", "other", () => { calls++; });
    await settle();
    ok("…while a different key still revalidates on its own", hits.n === 2, hits.n);
  }

  // 6. called without a callback — no background traffic (back-compat for any other caller)
  {
    const data = { items: [1] };
    const store = mkStore({ k: JSON.stringify(data) }), hits = { n: 0 }, payload = { v: { items: [9] } };
    const f = makeHelper(store, jsonFetch(payload, hits));
    const got = await f("/u", "k");
    await settle();
    ok("with no callback there is no background fetch", hits.n === 0, hits.n);
    ok("…and the cached value is returned", JSON.stringify(got) === JSON.stringify(data), got);
  }

  // ── all three pickers must actually pass their apply() ─────────────────────────────────────────
  [
    ["the countries picker", "cacheKey"],
    ["the spirits picker", "ideasCacheKey"],
    ["the technologies picker", "techsCacheKey"],
  ].forEach(([label, key]) => {
    ok(label + " revalidates", new RegExp("apply\\(await fetchCachedJson\\(url, " + key + ", apply\\)\\)").test(src), key);
  });
  ok("the spirits loader rebuilds locMap inside apply (not once, outside it)",
    /const apply = \(d\) => \{[\s\S]*?locMap = \{\};[\s\S]*?updateSuggestions\(\);/.test(src), "locMap would keep stale names");
  // Scope this to the apply BODY — a lazy [\s\S]*? still runs past the closing brace and finds
  // selectCountry() further down the file, which is exactly the kind of file-wide match that has produced
  // false readings before.
  {
    const at = src.indexOf("const apply = (raw) => {");
    const body = at === -1 ? "" : src.slice(at, src.indexOf("\n      };", at));
    ok("the countries revalidation rebuilds the list", /renderCountryList\(\);/.test(body), body.slice(0, 300));
    ok("…and does NOT move the user's selection", at !== -1 && !/selectCountry\(/.test(body) && !/showEmpty\(/.test(body), body.slice(0, 400));
  }
  ok("the client cache version was bumped",
    // At least, not exactly — an exact pin turns every future bump of this file into a false failure.
    (() => { const m = /country-setup\.js\?v=(\d+)/.exec(fs.readFileSync(path.join(__dirname, "public", "country-setup.html"), "utf8")); return !!m && Number(m[1]) >= 28; })(), "stale cache version");

  console.log("\ntest-country-setup-picker-cache: " + pass + "/" + total + " checks passed");
  process.exitCode = pass === total && total >= 30 ? 0 : 1;
})();
