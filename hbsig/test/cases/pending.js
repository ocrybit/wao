// Pending test cases - categorized by error cause
// These cases currently fail in JS → Erlang round-trip

const bin = Buffer.from([1, 2, 3])
const empty_bin = Buffer.from([])

// =============================================================================
// CATEGORY: Empty Buffer Issues
// Cause: Empty buffer fields (data: Buffer.from([])) get lost or transformed
//        during round-trip due to inline body key behavior
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
// CATEGORY: Multiple Binary Buffer Issues
// Cause: Multiple binary Buffer fields in the same message cause issues
//        with multipart body encoding or inline body key detection
// =============================================================================
export const cases_multiple_buffer = [
  { binary: bin },
  { body: bin, data: bin },
  { bin },
  { data: bin },
  { body: bin },
  { bin, data: bin },
  { bin, body: bin },
  { bin, data: bin, body: bin },
  { binary: Buffer.from([1, 2, 3]), binary2: Buffer.from([1, 2, 3]) },
  { bin: [bin, bin] },
  { list: [Symbol("ok"), [bin]] },
]

// =============================================================================
// CATEGORY: Case-Sensitive Key Collision
// Cause: Keys that differ only in case (data vs Data vs DATA) collide
//        when normalized to lowercase
// =============================================================================
export const cases_case_collision = [
  { data: 1, Data: 2, DATA: 3 },
  { body: "a", Body: "b", BODY: "c" },
  { test: 1, Test: 2, TEST: 3, TeSt: 4 },
  { a1: 1, A1: 2, "1a": 3, "1A": 4 },
  { 123: "numeric", abc: "alpha", ABC: "ALPHA" },
  {
    field: 1,
    Field: [2],
    FIELD: { data: 3 },
    FiElD: [{ val: 4 }],
  },
  {
    data: [1, 9223372036854775807, "text", { val: 2 }],
    Data: [3, -9223372036854775808, [], {}],
    DATA: ["", null, Symbol("undefined"), Symbol("ok")],
  },
  {
    ultimate: [
      { id: 1, data: "small", meta: { empty: "" } },
      { id: 9223372036854775807, data: [4, 5, 6], meta: {} },
      { id: -9223372036854775808, data: "", meta: { list: [7] } },
    ],
    Data: 255,
    data: 0,
    DATA: [128],
  },
]

// =============================================================================
// CATEGORY: Large Integer (Int64) Precision Issues
// Cause: JavaScript Number cannot precisely represent int64 values
//        beyond Number.MAX_SAFE_INTEGER (2^53-1)
// =============================================================================
export const cases_large_int = [
  { max_int64: 9223372036854775807 },
  { min_int64: -9223372036854775808 },
  { large_positive: 1000000000000000 },
  { large_negative: -1000000000000000 },
  { int_array: [9223372036854775807, -9223372036854775808, 0] },
  { boundary_ints: { max: 9223372036854775807, min: -9223372036854775808 } },
  {
    users: [
      { id: 9223372036854775807, name: "user1", tags: ["a", "b"] },
      { id: -9223372036854775808, name: "user2", tags: [] },
    ],
  },
  {
    types: [
      { type: "integer", value: 9223372036854775807 },
      { type: "empty", value: "" },
      { type: "list", value: [1, 2] },
    ],
  },
]

// =============================================================================
// CATEGORY: Special Character Keys
// Cause: Keys with special characters (!, ?, #, space, empty string)
//        may not encode/decode correctly
// =============================================================================
export const cases_special_keys = [
  { "field!": 1, "field?": 2, "field#": 3 },
  { "": "empty_key", " ": "space_key", "  ": "two_spaces" },
]

// =============================================================================
// CATEGORY: Complex Nested with Edge Cases
// Cause: Combination of multiple edge cases (large ints, empty values,
//        nested structures, etc.)
// =============================================================================
export const cases_complex_edge = [
  {
    nested: {
      nums: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      maps: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }],
      empty: ["", [], {}, null],
    },
  },
  {
    all: [
      0,
      255,
      9223372036854775807,
      -9223372036854775808,
      "",
      [],
      {},
      { a: 1 },
      [2, 3],
      null,
      Symbol("undefined"),
      Symbol("ok"),
    ],
  },
]

// =============================================================================
// All pending cases combined
// =============================================================================
export const all = [
  ...cases_empty_buffer,
  ...cases_multiple_buffer,
  ...cases_case_collision,
  ...cases_large_int,
  ...cases_special_keys,
  ...cases_complex_edge,
]

export default all

// Export error counts for documentation
export const error_summary = {
  empty_buffer: cases_empty_buffer.length,
  multiple_buffer: cases_multiple_buffer.length,
  case_collision: cases_case_collision.length,
  large_int: cases_large_int.length,
  special_keys: cases_special_keys.length,
  complex_edge: cases_complex_edge.length,
  total: all.length,
}
