// update-checker.js — tells the app when a newer Nova release is on GitHub. Read-only, cached for 6h, and
// FAILS SILENTLY: offline, rate-limited, or no releases yet → it just reports "no update", never throws.
// The frontend (public/update-check.js) polls /api/update-check and shows a quiet dismissible banner.
const REPO = "Ultra-XT/HOI4-Modding-Suite";
const RELEASES_URL = `https://github.com/${REPO}/releases`;

// Compare dotted numeric versions: >0 if a is newer than b, <0 if older, 0 if equal. Strips a leading "v"
// and any -prerelease/+build suffix (so "v1.2.0-beta" compares as 1.2.0).
function cmpSemver(a, b) {
  const norm = (v) => String(v).replace(/^v/i, "").split(/[-+]/)[0].split(".").map((n) => parseInt(n, 10) || 0);
  const pa = norm(a), pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

let _cache = null; // { at, data }
const TTL = 6 * 3600 * 1000;

// Returns { ok, current, latest, updateAvailable, url }. fetchImpl/now/ttl are injectable for tests.
async function checkForUpdate(current, { fetchImpl = global.fetch, now = Date.now, ttl = TTL } = {}) {
  const cur = String(current || "0.0.0").replace(/^v/i, "");
  if (_cache && now() - _cache.at < ttl) return _cache.data;
  const data = { ok: true, current: cur, latest: null, updateAvailable: false, url: RELEASES_URL };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const r = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { "User-Agent": "Nova-Modding-Suite", Accept: "application/vnd.github+json" },
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (r && r.ok) {
      const j = await r.json();
      const tag = String((j && j.tag_name) || "").replace(/^v/i, "").trim();
      if (tag) {
        data.latest = tag;
        data.url = (j && j.html_url) || RELEASES_URL;
        data.updateAvailable = cmpSemver(tag, cur) > 0;
      }
    }
  } catch (_) { /* offline / rate-limited / 404 (no releases) → leave as no-update */ }
  _cache = { at: now(), data };
  return data;
}

function _resetCache() { _cache = null; } // tests only

module.exports = { cmpSemver, checkForUpdate, _resetCache, REPO, RELEASES_URL };
