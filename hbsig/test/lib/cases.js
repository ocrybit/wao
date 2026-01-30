// Re-export from organized test cases folder
// This file maintains backwards compatibility with existing test imports

import passing from "../cases/passing.js"
import pending, {
  cases_binary_buffer,
  cases_empty_buffer,
  cases_nested_buffer,
  pending_summary,
} from "../cases/pending.js"
import never, {
  cases_case_collision,
  cases_large_int,
  cases_special_keys,
  cases_complex_edge,
  never_summary,
} from "../cases/never.js"

// Export categorized pending cases (cases that should be fixed)
export {
  cases_binary_buffer,
  cases_empty_buffer,
  cases_nested_buffer,
  pending_summary,
}

// Export never-tested cases (edge cases for future)
export {
  cases_case_collision,
  cases_large_int,
  cases_special_keys,
  cases_complex_edge,
  never_summary,
}

// Legacy exports maintained for backwards compatibility
export const ok = passing
export const errors = pending  // Pending cases (to be fixed)
export const never_tested = never  // Cases that were never in test suite

// Map/httpsig/signer error subcategories
export const map_errors = []
export const httpsig_errors = []
export const signer_errors = cases_binary_buffer

// Default export: all passing cases (for signer tests that should pass)
export default passing
