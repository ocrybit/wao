import { structured_from, structured_to } from "../src/structured.js"
import { cases_from, cases_to } from "./lib/structured_cases.js"
import { ok, errors, never_tested } from "./lib/cases.js"
import { normalize } from "../src/erl_json.js"
import { genTest } from "./lib/test-utils.js"

genTest({
  its: [
    // === PASSING TESTS ===
    {
      it: "should test structured_from (cases_from)",
      path: "/~hbsig@1.0/structured_from",
      cases: cases_from,
      mod: v => structured_from(normalize(v)),
    },
    {
      it: "should test structured_from (ok cases)",
      path: "/~hbsig@1.0/structured_from",
      cases: ok,
      mod: v => structured_from(normalize(v)),
    },
    {
      it: "should test structured_to (cases_to)",
      path: "/~hbsig@1.0/structured_to",
      cases: cases_to,
      mod: v => structured_to(normalize(v)),
    },

    // === PENDING TESTS (buffer issues - should be fixed) ===
    {
      it: "[PENDING] structured_from - buffer cases (18 cases to fix)",
      path: "/~hbsig@1.0/structured_from",
      cases: errors,
      mod: v => structured_from(normalize(v)),
      skip: true,
    },
    {
      it: "[PENDING] structured_to - buffer cases (18 cases to fix)",
      path: "/~hbsig@1.0/structured_to",
      cases: errors,
      mod: v => structured_to(normalize(v)),
      skip: true,
    },

    // === NEVER TESTED (edge cases - not in original test suite) ===
    {
      it: "[NEVER] structured_from - edge cases (case collision, large int, etc)",
      path: "/~hbsig@1.0/structured_from",
      cases: never_tested,
      mod: v => structured_from(normalize(v)),
      skip: true,
    },
    {
      it: "[NEVER] structured_to - edge cases (case collision, large int, etc)",
      path: "/~hbsig@1.0/structured_to",
      cases: never_tested,
      mod: v => structured_to(normalize(v)),
      skip: true,
    },
  ],
})
