# hook-input.sh — shared Claude Code hook-input decoding for the no-skip, freeze-tests
# and security-watch hooks (identical copy in each skill's scripts/ directory; sourced).
#
# A PreToolUse hook receives a JSON payload on stdin:
#   {"tool_name":"Write|Edit|MultiEdit","tool_input":{"file_path":...,"content":...,
#    "new_string":...,"edits":[{"new_string":...}]}}
# read_hook_input reads stdin. Input whose first non-space character is "{" (after an
# optional UTF-8 BOM) is treated as a hook payload and decoded with one node call (node is
# always present where Claude Code runs; jq is not required); it sets HOOK_MODE=1,
# HOOK_FILE (tool_input.file_path, "\" normalised to "/") and HOOK_TEXT (content /
# new_string / edits[].new_string). A payload that cannot be decoded, or has no
# tool_input object, blocks (exit 2, reason on stderr) — it never reads as "allowed".
# Any other input is plain text: HOOK_MODE=0, HOOK_TEXT=<stdin>. To check plain text
# that starts with "{" manually, pass it as the first argument instead.

read_hook_input() {
  HOOK_INPUT=$(cat)
  HOOK_MODE=0
  HOOK_FILE=""
  HOOK_TEXT="$HOOK_INPUT"
  local trimmed decoded rc
  trimmed="${HOOK_INPUT#$'\xef\xbb\xbf'}"
  trimmed="${trimmed#"${trimmed%%[![:space:]]*}"}"
  [ "${trimmed:0:1}" = "{" ] || return 0
  if ! command -v node >/dev/null 2>&1; then
    echo "BLOCKED: cannot decode the hook payload: node was not found on PATH" >&2
    exit 2
  fi
  # Output: "<file_path>\nT<text>". The "T" sentinel keeps an empty text distinguishable.
  decoded=$(printf '%s' "$HOOK_INPUT" | node -e '
    const fail = (why) => { process.stderr.write("BLOCKED: cannot decode the hook payload: " + why + "\n"); process.exit(3); };
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => { raw += d; }).on("end", () => {
      let payload;
      try { payload = JSON.parse(raw.replace(/^﻿/, "")); } catch (e) { fail("invalid JSON (" + e.message + ")"); }
      const input = payload && typeof payload === "object" ? payload.tool_input : undefined;
      if (!input || typeof input !== "object" || Array.isArray(input)) fail("no tool_input object");
      let file = input.file_path ?? input.notebook_path ?? input.path ?? "";
      if (typeof file !== "string") fail("tool_input.file_path is not a string");
      if (/[\n\r\0]/.test(file)) fail("tool_input.file_path contains a line break");
      file = file.replace(/\\/g, "/");
      const parts = [];
      for (const key of ["content", "new_string", "new_source"]) {
        if (typeof input[key] === "string") parts.push(input[key]);
      }
      if (Array.isArray(input.edits)) {
        for (const e of input.edits) if (e && typeof e.new_string === "string") parts.push(e.new_string);
      }
      process.stdout.write(file + "\nT" + parts.join("\n"));
    });
  ')
  rc=$?
  if [ $rc -ne 0 ]; then
    [ $rc -eq 3 ] || echo "BLOCKED: cannot decode the hook payload (node exit $rc)" >&2
    exit 2
  fi
  HOOK_FILE="${decoded%%$'\n'*}"
  HOOK_TEXT="${decoded#*$'\n'}"
  HOOK_TEXT="${HOOK_TEXT#T}"
  HOOK_MODE=1
}
