const { _electron: electron } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  const durationMs = 60000;
  const intervalMs = 100;
  console.log("[AI Tester] Launching Electron app under Playwright...");
  
  const errors = [];
  const logs = [];

  const electronApp = await electron.launch({
    args: [path.join(__dirname, "main.js")]
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('load');

    if (window.url().includes('home.html')) {
      console.log("[AI Tester] Redirecting from home.html to index.html...");
      await window.goto(window.url().replace('home.html', 'index.html'));
      await window.waitForLoadState('load');
    }
    
    window.on("pageerror", (err) => {
      console.error("[Page Error]", err);
      errors.push({
        type: "PageError",
        message: err.message,
        stack: err.stack
      });
    });

    window.on("console", (msg) => {
      const text = msg.text();
      logs.push(text);
      
      const isUnhandled = text.includes("[Unhandled Error]") || 
                          text.includes("[Unhandled Promise Rejection]") || 
                          text.includes("[Chaos Monkey Error]") ||
                          text.includes("[UI Assertion Failure]");
                          
      if (isUnhandled) {
        console.error("[Console Error (Unhandled/Failure)]", text);
        errors.push({ type: "UnhandledError", message: text });
      } else {
        console.log("[Console Log]", text);
      }
    });

    console.log("[AI Tester] Window opened. Waiting for main canvas/body...");
    await window.waitForSelector("body");
    
    // Give the app a couple of seconds to settle and load local localization / dictionaries
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Mock confirm dialog to avoid blocking
    console.log("[AI Tester] Mocking showConfirmDialog to auto-decline restore snapshots...");
    await window.evaluate(() => {
      if (window.focusEditor) {
        window.focusEditor.showConfirmDialog = async () => false;
      }
      window.confirm = () => false;
    });

    // Enable verbose logging in the page
    console.log("[AI Tester] Enabling debug verbose checkbox...");
    await window.evaluate(() => {
      const debugVerboseEl = document.getElementById("debugVerbose");
      if (debugVerboseEl) {
        debugVerboseEl.checked = true;
        debugVerboseEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    // Populate file path and call loadFile
    console.log("[AI Tester] Loading focus tree file...");
    await window.evaluate(async () => {
      const filePathEl = document.getElementById("filePath");
      if (filePathEl) {
        filePathEl.value = "D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV\\common\\national_focus\\afghanistan.txt";
        filePathEl.dispatchEvent(new Event("input", { bubbles: true }));
        filePathEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (typeof loadFile === "function") {
        await loadFile();
      } else {
        throw new Error("loadFile is not defined on global scope");
      }
    });

    // Wait for nodes to render
    console.log("[AI Tester] Waiting for focus tree nodes to render on canvas...");
    await window.waitForSelector(".node", { timeout: 15000 });
    console.log("[AI Tester] Focus tree loaded and rendered successfully!");

    console.log(`[AI Tester] Starting Chaos Monkey: duration=${durationMs}ms, interval=${intervalMs}ms...`);
    await window.evaluate(([dur, val]) => {
      if (typeof window.__startChaosMonkey === "function") {
        window.__startChaosMonkey(dur, val);
      } else {
        throw new Error("window.__startChaosMonkey is not defined on the window object.");
      }
    }, [durationMs, intervalMs]);

    // Wait slightly longer than the monkey run duration to capture any post-run logs or final output
    await new Promise(resolve => setTimeout(resolve, durationMs + 3000));

    console.log("[AI Tester] Chaos Monkey execution duration reached. Closing application...");
  } catch (err) {
    console.error("[AI Tester Fail]", err);
    errors.push({ type: "TestRunnerError", message: err.message, stack: err.stack });
  } finally {
    try {
      await electronApp.close();
    } catch (e) {
      console.warn("[AI Tester] Error closing Electron app:", e.message);
    }
  }

  // Generate test report
  const logsDir = path.join(__dirname, "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const reportPath = path.join(logsDir, "test_run.json");
  const report = {
    timestamp: new Date().toISOString(),
    status: errors.length === 0 ? "passed" : "failed",
    durationMs: durationMs,
    errorsCount: errors.length,
    errors: errors,
    consoleLogsCount: logs.length
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n[AI Tester] Test report written to ${reportPath}`);
  console.log(`[AI Tester] Status: ${report.status.toUpperCase()} | Errors: ${report.errorsCount}`);
  
  if (errors.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
