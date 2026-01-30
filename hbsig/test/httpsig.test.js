import { structured_from, structured_to } from "../src/structured.js"
import { cases_from, cases_to } from "./lib/structured_cases.js"
import { normalize } from "../src/erl_json.js"
import { genTest } from "./lib/test-utils.js"
import { ok, errors, never_tested } from "./lib/cases.js"
import { httpsig_from, httpsig_to } from "../src/httpsig.js"

genTest({
  its: [
    // === PASSING TESTS ===
    {
      it: "should test httpsig_to (cases_from)",
      cases: cases_from,
      path: "/~hbsig@1.0/httpsig_to",
      pmod: v => structured_from(normalize(v)),
      mod: v => httpsig_to(normalize(v)),
    },
    {
      it: "should test httpsig_to (ok cases)",
      cases: ok,
      path: "/~hbsig@1.0/httpsig_to",
      pmod: v => structured_from(normalize(v)),
      mod: v => httpsig_to(normalize(v)),
    },

    // === PENDING TESTS (buffer issues - should be fixed) ===
    {
      it: "[PENDING] httpsig_to - buffer cases (18 cases to fix)",
      cases: errors,
      path: "/~hbsig@1.0/httpsig_to",
      pmod: v => structured_from(normalize(v)),
      mod: v => httpsig_to(normalize(v)),
      skip: true,
    },

    // === NEVER TESTED (edge cases - not in original test suite) ===
    {
      it: "[NEVER] httpsig_to - edge cases (case collision, large int, etc)",
      cases: never_tested,
      path: "/~hbsig@1.0/httpsig_to",
      pmod: v => structured_from(normalize(v)),
      mod: v => httpsig_to(normalize(v)),
      skip: true,
    },
  ],
})
