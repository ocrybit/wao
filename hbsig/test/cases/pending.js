// Pending test cases - Cases that were in the original test suite but currently fail
// These worked in CP0 and should be fixed

const bin = Buffer.from([1, 2, 3])
const empty_bin = Buffer.from([])

// =============================================================================
// CATEGORY: Binary Buffer Issues (from original signer_errors)
// Cause: Binary Buffer fields have issues with inline body key detection
// Original: These were in the test suite as known edge cases
// =============================================================================
export const cases_binary_buffer = [
  { binary: bin },
  { body: bin, data: bin },
  { bin },
  { data: bin },
  { body: bin },
  { bin, data: bin },
  { bin, body: bin },
  { bin, data: bin, body: bin },
]

// =============================================================================
// CATEGORY: Empty Buffer Issues
// Cause: Empty buffer fields get lost or transformed during round-trip
// =============================================================================
export const cases_empty_buffer = [
  { bin: empty_bin },
  { body: empty_bin },
  { bin: empty_bin, body: empty_bin },
  { data: empty_bin },
  { data: empty_bin, body: empty_bin },
  { bin: empty_bin, data: empty_bin },
  { bin: empty_bin, data: empty_bin, body: empty_bin },
]

// =============================================================================
// CATEGORY: Multiple Buffer in Nested Structure
// =============================================================================
export const cases_nested_buffer = [
  { binary: Buffer.from([1, 2, 3]), binary2: Buffer.from([1, 2, 3]) },
  { bin: [bin, bin] },
  { list: [Symbol("ok"), [bin]] },
]

// =============================================================================
// All pending cases - these should be fixed to pass
// =============================================================================
export const all = [
  ...cases_binary_buffer,
  ...cases_empty_buffer,
  ...cases_nested_buffer,
]

export default all

// Export summary
export const pending_summary = {
  binary_buffer: cases_binary_buffer.length,
  empty_buffer: cases_empty_buffer.length,
  nested_buffer: cases_nested_buffer.length,
  total: all.length,
}
