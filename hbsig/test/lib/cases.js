// Re-export from organized test cases folder
// This file maintains backwards compatibility with existing test imports

import passing from "../cases/passing.js"
import pending, {
  cases_empty_buffer,
  cases_multiple_buffer,
  cases_case_collision,
  cases_large_int,
  cases_special_keys,
  cases_complex_edge,
  error_summary,
} from "../cases/pending.js"

// Export categorized pending cases for reference
export {
  cases_empty_buffer,
  cases_multiple_buffer,
  cases_case_collision,
  cases_large_int,
  cases_special_keys,
  cases_complex_edge,
  error_summary,
}

// Legacy exports maintained for backwards compatibility
export const ok = passing
export const errors = pending

// Map/httpsig/signer error subcategories (now part of pending)
export const map_errors = []
export const httpsig_errors = []
export const signer_errors = cases_multiple_buffer

// Default export: all passing cases (for signer tests that should pass)
export default passing
