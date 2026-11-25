"use strict";
/*
 * Shared, robust parser for AI responses across all makers (Event, Decision, Spirit,
 * Character, Country Setup, Research). Replaces fragile copy-pasted
 *   let cleaned = data.script.trim();
 *   if (cleaned.startsWith("```")) cleaned = cleaned.replace(...);
 *   const parsed = JSON.parse(cleaned);   // throws cryptic "Unexpected token" on any chatter
 * which was the root cause of "the AI fails on complex requests": a complex prompt makes the
 * model more likely to add a stray sentence, a ```json fence, or a trailing comma, and the raw
 * JSON.parse error got shown to the user verbatim.
 *
 * window.NovaAI.parseJsonResponse(rawText) -> parsed object, or throws a friendly Error.
 */
(function () {
  // Strip markdown fences anywhere (lang tag may contain digits, e.g. ```json5).
  function stripFences(s) {
    return String(s == null ? "" : s)
      .replace(/```[a-z0-9_+-]*[ \t]*\r?\n?/gi, "")
      .replace(/```/g, "")
      .trim();
  }

  // Extract the first complete, brace-balanced {...} object from text, ignoring braces that
  // appear inside double-quoted strings (so an effect like "x = { y }" in a value is safe).
  function extractFirstJsonObject(text) {
    const s = String(text || "");
    const start = s.indexOf("{");
    if (start === -1) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
    return null; // never closed -> truncated
  }

  // Remove trailing commas before } or ] — a very common model slip that breaks JSON.parse.
  function dropTrailingCommas(jsonish) {
    return String(jsonish || "").replace(/,(\s*[}\]])/g, "$1");
  }

  /**
   * Parse an AI text response that is supposed to be a single JSON object.
   * @param {string} raw  the `data.script` text from /api/ai/logic
   * @returns {object} parsed object
   * @throws {Error} with a human-friendly message on any failure
   */
  function parseJsonResponse(raw) {
    const cleaned = stripFences(raw);
    if (!cleaned) {
      throw new Error("The AI returned an empty response. Please rephrase and try again.");
    }
    // Prefer a balanced {...} slice (tolerates leading/trailing chatter); fall back to the
    // whole cleaned string if no object braces were found at all.
    const candidate = extractFirstJsonObject(cleaned) || cleaned;
    try {
      return JSON.parse(candidate);
    } catch (_e) {
      try {
        return JSON.parse(dropTrailingCommas(candidate));
      } catch (e2) {
        throw new Error("The AI's response wasn't valid structured data (it may have added extra text or been cut off). Please try again, or simplify the request.");
      }
    }
  }

  window.NovaAI = window.NovaAI || {};
  window.NovaAI.parseJsonResponse = parseJsonResponse;
  // Exposed for unit testing / reuse.
  window.NovaAI._stripFences = stripFences;
  window.NovaAI._extractFirstJsonObject = extractFirstJsonObject;
})();
