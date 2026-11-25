// A test's fetch at a server it started itself must wait out a busy socket and NAME a dead one.
// #a-live-fetch-tells-busy-from-dead
//
// THE DEFECT. test-a-name-that-points-at-another-name-resolves.js failed twice in two suite runs, weeks apart,
// with "FAIL threw: fetch failed / TypeError: fetch failed" and nothing else, passing 3 of 3 alone both times.
// Both failing runs were the slow ones. It spawns its own server and then discards everything that server says
// (srv.stderr.on("data", () => {})), so a CRASHED server and a BUSY one produced an identical message, and each
// failure cost a 17-minute re-run to tell them apart.
//
// WHAT IS GUARDED HERE. testlib-live-fetch.js retries a connection-level throw on a short bounded ladder, and:
//   - never retries an answer. A 500, a 404, a bad body: returned on the first call, exactly as before.
//   - never retries a programming error. A bad URL still throws immediately.
//   - when it gives up, quotes what the server had said, so a dead server names itself.
// A retry that swallowed real failures would be worse than the flake it replaces, so each of those has a check
// here with a control beside it.
"use strict";

const http = require("http");
const { makeLiveFetch, isConnectionFailure } = require("./testlib-live-fetch.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

(async () => {
  try {
    console.log("1. ⭐⭐⭐ A BUSY socket is waited out");
    {
      // Refuse the first two connections by not listening yet, then come up. The ladder must cover it.
      const server = http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); });
      const port = await listen(server);
      server.close();                                   // now nothing is listening on `port`
      await new Promise((r) => setTimeout(r, 30));
      let reopened = null;
      setTimeout(() => { reopened = http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); }); reopened.listen(port, "127.0.0.1"); }, 220);
      const lf = makeLiveFetch({ label: "the late server", delays: [50, 150, 400, 1000] });
      let body = null, threw = null;
      try { body = await (await lf(`http://127.0.0.1:${port}/`)).json(); } catch (e) { threw = e; }
      rec("⭐⭐⭐ the request succeeds once the server arrives", !threw && body && body.ok === true, threw ? threw.message : body);
      rec("…and it took more than one attempt, so the retry is what carried it",
        lf.attempts.length === 1 && lf.attempts[0].tries > 1, lf.attempts);
      try { if (reopened) reopened.close(); } catch (_) {}
    }

    console.log("\n2. ⭐⭐⭐ CONTROL: an ANSWER is never retried, whatever it says");
    {
      let hits = 0;
      const server = http.createServer((req, res) => { hits++; res.writeHead(500, { "Content-Type": "text/plain" }); res.end("boom"); });
      const port = await listen(server);
      const lf = makeLiveFetch({ label: "the 500 server" });
      const res = await lf(`http://127.0.0.1:${port}/`);
      rec("⭐⭐⭐ a 500 comes straight back", res.status === 500, res.status);
      rec("⭐⭐ …and the server was asked exactly ONCE — a failing endpoint is not retried into looking healthy", hits === 1, { hits });
      rec("…and the helper counted one try", lf.attempts[0] && lf.attempts[0].tries === 1, lf.attempts);
      server.close();
    }

    console.log("\n3. ⭐⭐⭐ A DEAD server names itself, instead of 'fetch failed'");
    {
      const said = ["Error: listen EADDRINUSE: address already in use :::47821\n", "    at Server.setupListenHandle\n"];
      const lf = makeLiveFetch({ label: "the tech server", serverOutput: said, delays: [10, 10] });
      let threw = null;
      try { await lf("http://127.0.0.1:1/"); } catch (e) { threw = e; }
      rec("⭐⭐⭐ it gives up rather than hanging", !!threw && threw.liveFetchGaveUp === true, threw && threw.message);
      rec("⭐⭐⭐ …and quotes what the server had said, so a crash is visible",
        !!threw && /EADDRINUSE/.test(threw.message), threw && threw.message);
      rec("…and says how many attempts it made", !!threw && /3 attempts/.test(threw.message), threw && threw.message);
      rec("…and keeps the original error as the cause", !!threw && !!threw.cause);
    }

    console.log("\n4. ⭐⭐ CONTROL: a server that said NOTHING is reported as saying nothing");
    {
      const lf = makeLiveFetch({ label: "the silent server", serverOutput: [], delays: [10] });
      let threw = null;
      try { await lf("http://127.0.0.1:1/"); } catch (e) { threw = e; }
      rec("⭐⭐ the message distinguishes silence from a crash log",
        !!threw && /said NOTHING/.test(threw.message) && !/It had said/.test(threw.message), threw && threw.message);
    }

    console.log("\n5. ⭐⭐ CONTROL: a programming error is not treated as a busy socket");
    {
      const lf = makeLiveFetch({ label: "n/a", delays: [10, 10, 10] });
      let threw = null;
      const t0 = Date.now();
      try { await lf("not-a-url-at-all"); } catch (e) { threw = e; }
      rec("⭐⭐ a bad URL throws immediately, not after the ladder", !!threw && threw.liveFetchGaveUp !== true, threw && threw.message);
      rec("…and it did not sleep through the retries first", Date.now() - t0 < 200, Date.now() - t0);
    }

    console.log("\n6. The classifier itself, on the exact shapes Node produces");
    {
      const nodeStyle = new TypeError("fetch failed");
      nodeStyle.cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:54321"), { code: "ECONNREFUSED" });
      rec("⭐ the shape the suite actually saw is a connection failure", isConnectionFailure(nodeStyle) === true);
      rec("a reset is too", isConnectionFailure(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } })) === true);
      rec("⭐⭐ CONTROL: a JSON parse error is NOT", isConnectionFailure(new SyntaxError("Unexpected token < in JSON at position 0")) === false);
      rec("⭐⭐ CONTROL: a plain Error is NOT", isConnectionFailure(new Error("something went wrong")) === false);
      rec("CONTROL: null is not", isConnectionFailure(null) === false);
    }
  } catch (e) {
    rec("harness threw", false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e));
  }

  console.log(`\n=== a live fetch tells busy from dead: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
})();
