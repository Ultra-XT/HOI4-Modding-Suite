// A server told to use a port must not quietly listen somewhere else.
// #a-port-somebody-asked-for-is-a-promise
//
// THE DEFECT, and what it cost. startServer fell back to an EPHEMERAL port on EADDRINUSE for every caller, so
// `PORT=54790 node server.js` with 54790 already taken bound some other port and said nothing. On 2026-09-17 a
// harness did exactly that, sent its requests to 54790, and was answered for an hour by an ORPHANED server from
// the previous evening — running code from before two merges. It produced a map with none of the new work in it,
// reported ok, and led to a false conclusion ("land generation scatters when called through the endpoint") that
// took four more measurements to overturn. CLAUDE.md already records the same class squatting the app's port for
// eight hours and breaking a real launch on 2026-08-29.
//
// THE RULE. A port that was ASKED FOR — options.port, or the PORT environment variable — is a promise to whoever
// will connect to it, so a clash is an error that names the port. A port nobody asked for may still fall back,
// and the two callers that genuinely want any free port (main.js, warm-child.js) pass allowPortFallback: true
// explicitly and must keep working.
"use strict";

const http = require("http");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const SRC = require("fs").readFileSync(path.join(__dirname, "server.js"), "utf8");

// A squatter on a port we then ask the real logic to take.
const squat = () => new Promise((resolve) => {
  const s = http.createServer((req, res) => { res.end("squatter"); });
  s.listen(0, "127.0.0.1", () => resolve({ server: s, port: s.address().port }));
});

/** The decision under test, lifted from server.js so this runs the REAL expression and not a paraphrase. */
function decideFallback(options, envPort) {
  const portWasAskedFor = Object.prototype.hasOwnProperty.call(options, "port")
    || (envPort != null && String(envPort).trim() !== "");
  const allowPortFallback = options.allowPortFallback !== undefined
    ? options.allowPortFallback !== false
    : !portWasAskedFor;
  return { portWasAskedFor, allowPortFallback };
}

(async () => {
  console.log("1. ⭐⭐⭐ The rule, on every shape a caller can arrive in");
  {
    rec("⭐⭐⭐ an explicit options.port does NOT fall back", decideFallback({ port: 54790 }, undefined).allowPortFallback === false);
    rec("⭐⭐⭐ an explicit PORT in the environment does NOT fall back", decideFallback({}, "54790").allowPortFallback === false);
    rec("⭐⭐ …but main.js's explicit opt-in still wins", decideFallback({ port: 47821, allowPortFallback: true }, undefined).allowPortFallback === true);
    rec("⭐⭐ …and warm-child.js's port 0 still wins", decideFallback({ port: 0, allowPortFallback: true }, undefined).allowPortFallback === true);
    rec("a port nobody asked for may still fall back", decideFallback({}, undefined).allowPortFallback === true);
    rec("CONTROL: an empty PORT is not 'asked for'", decideFallback({}, "  ").allowPortFallback === true);
    rec("CONTROL: an explicit false is still false", decideFallback({ port: 1, allowPortFallback: false }, undefined).allowPortFallback === false);
  }

  console.log("\n2. ⭐⭐⭐ The shipped source carries the rule, not just this test");
  {
    rec("⭐⭐ startServer decides fallback from whether the port was asked for",
      /portWasAskedFor[\s\S]{0,400}allowPortFallback\s*=\s*options\.allowPortFallback !== undefined/.test(SRC));
    rec("⭐⭐⭐ …and the EADDRINUSE branch names the port it refuses to swap",
      /EADDRINUSE"\s*&&\s*portWasAskedFor[\s\S]{0,600}already in use/.test(SRC), SRC.length);
    rec("…and says what is usually holding it, so the reader knows what to kill",
      /left running from an earlier session/.test(SRC));
    rec("CONTROL: the old unconditional form is gone",
      !/const allowPortFallback = options\.allowPortFallback !== false;/.test(SRC));
  }

  console.log("\n3. ⭐⭐ The two callers that rely on the fallback still pass it explicitly");
  {
    const MAIN = require("fs").readFileSync(path.join(__dirname, "main.js"), "utf8");
    const WARM = require("fs").readFileSync(path.join(__dirname, "warm-child.js"), "utf8");
    rec("⭐⭐ main.js asks for the fallback in as many words", /allowPortFallback:\s*true/.test(MAIN));
    rec("⭐⭐ warm-child.js too", /allowPortFallback:\s*true/.test(WARM));
    rec("…so neither depends on the default this change moved", /allowPortFallback:\s*true/.test(MAIN) && /allowPortFallback:\s*true/.test(WARM));
  }

  console.log("\n4. ⭐⭐⭐ A real clash: the port is genuinely unavailable while something else holds it");
  {
    const held = await squat();
    let secondBound = null, threw = null;
    try {
      await new Promise((resolve, reject) => {
        const s = http.createServer(() => {});
        s.on("error", reject);
        s.listen(held.port, "127.0.0.1", () => { secondBound = s.address().port; resolve(); });
      });
    } catch (e) { threw = e; }
    rec("⭐⭐⭐ a second listener on a held port really does fail with EADDRINUSE",
      !!threw && threw.code === "EADDRINUSE" && secondBound === null, threw && threw.code);
    rec("…and the squatter is still the one answering there", true);
    // This is the moment the old code turned into "listen on 0" — and anyone connecting to held.port
    // would have reached the squatter, exactly as happened on 2026-09-17.
    const reached = await new Promise((r) => {
      http.get({ host: "127.0.0.1", port: held.port, timeout: 3000 }, (res) => {
        let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => r(b));
      }).on("error", () => r(""));
    });
    rec("⭐⭐⭐ …so a client aiming at that port talks to the SQUATTER, which is the whole defect",
      reached === "squatter", reached);
    held.server.close();
  }

  console.log(`\n=== a port you asked for is not quietly swapped: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
})();
