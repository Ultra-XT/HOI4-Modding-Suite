// A fetch for a test that drives a server it started itself — one that can tell BUSY from DEAD.
// #a-live-fetch-tells-busy-from-dead
//
// THE DEFECT THIS EXISTS FOR. test-a-name-that-points-at-another-name-resolves.js failed twice, in two different
// suite runs weeks apart, with nothing but:
//     FAIL threw: fetch failed
//     TypeError: fetch failed
// Both times it passed 3 of 3 alone, and both times the run that failed it was the slow one (1001s against a
// normal ~720s, with four agent worktrees hammering the machine). Each failure cost a full 17-minute re-run to
// establish it was the machine and not the code.
//
// ⚠️ THE OBVIOUS FIX IS THE WRONG ONE. Retrying a failed request until it passes is how a real defect gets
// re-labelled as weather. Two rules keep this honest:
//   1. ONLY a connection-level throw is retried. Node's fetch rejects with a TypeError when it cannot reach the
//      socket at all; a server that ANSWERS — 200, 404, 500, a truncated body, the wrong JSON — returns on the
//      first call, untouched. A test that wanted to see a 500 still sees it immediately.
//   2. WHEN IT GIVES UP IT SAYS WHY. The test that flaked spawned its own server with
//      `srv.stderr.on("data", () => {})`, discarding every word it said. So if that server had CRASHED, the
//      failure would have looked exactly the same — "fetch failed" and nothing else. Pass the server's captured
//      output in and a dead server names itself, while a busy one is simply waited for.
//
// The ladder is deliberately short and bounded: a server that is coming back answers within a second or so, and
// one that is gone should fail the test quickly rather than holding the suite open.
"use strict";

const ATTEMPT_DELAYS_MS = [50, 150, 400, 1000];   // 4 retries, ~1.6s total, then give up

/** True for "could not reach the socket", false for anything a server actually answered. */
function isConnectionFailure(err) {
  if (!err) return false;
  // Node's fetch wraps the real reason in `cause`: ECONNREFUSED, ECONNRESET, EPIPE, socket hang up, UND_ERR_*.
  const code = String((err.cause && (err.cause.code || err.cause.message)) || err.code || "");
  const msg = String(err.message || "");
  if (/ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR/i.test(code + " " + msg)) return true;
  // The bare shape Node gives for an unreachable origin, which is what the suite actually saw.
  return err instanceof TypeError && /fetch failed/i.test(msg);
}

/**
 * liveFetch(url, opts) with the same signature as fetch.
 * @param {object} o
 * @param {string[]} [o.serverOutput] the array a caller is pushing the server's stdout/stderr chunks into
 * @param {string}   [o.label]        what to call the server in an error ("the tech server")
 * @param {number[]} [o.delays]       override the ladder (tests for this file use it)
 */
function makeLiveFetch(o = {}) {
  const delays = o.delays || ATTEMPT_DELAYS_MS;
  const label = o.label || "the server this test started";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const attempts = [];
  const liveFetch = async (url, init) => {
    let last = null;
    for (let i = 0; i <= delays.length; i++) {
      try {
        const res = await fetch(url, init);
        attempts.push({ url: String(url), tries: i + 1, reached: true });
        return res;                                  // ANY answer, including 500 — never retried
      } catch (err) {
        if (!isConnectionFailure(err)) throw err;     // a real error is a real error
        last = err;
        if (i < delays.length) await sleep(delays[i]);
      }
    }
    attempts.push({ url: String(url), tries: delays.length + 1, reached: false });
    const said = (o.serverOutput || []).join("").trim();
    const tail = said ? said.split("\n").slice(-12).join("\n") : "";
    const err = new Error(
      `could not reach ${label} at ${url} after ${delays.length + 1} attempts (${last && last.message}).\n` +
      (tail ? `It had said:\n${tail}` : `It said NOTHING — so it either never started, or it died without a word.`));
    err.cause = last;
    err.liveFetchGaveUp = true;
    throw err;
  };
  liveFetch.attempts = attempts;                     // so a test can assert it did NOT need retries
  return liveFetch;
}

module.exports = { makeLiveFetch, isConnectionFailure, ATTEMPT_DELAYS_MS };
