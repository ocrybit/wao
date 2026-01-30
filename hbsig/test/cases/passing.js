// Passing test cases for signer tests
// These cases work correctly through JS → Erlang round-trip

const bin = Buffer.from([1, 2, 3])
const empty_bin = Buffer.from([])

// Basic types and structures that pass
export const basic = [
  { recursive: [1, [2, [3, [4]]]] },
  { alternating: [1, "one", 2, "two", 3, "three"] },
  {
    binary_data: "some binary content",
    symbols: [Symbol("success"), Symbol("failure"), Symbol("pending")],
    numbers: [0, -1, 42, 3.14, -99.99],
    strings: ["hello", "world", "test"],
  },
  {
    count: 10,
    active: true,
    tags: ["alpha", "beta", "gamma"],
  },
  {
    values: [1, 2, 3, 4, 5],
    states: [Symbol("active"), Symbol("inactive"), Symbol("pending")],
  },
  { empty: Buffer.from([]), nested: [Buffer.from([]), 3] },
  { list: [1, [2, 3]] },
  { list: [53.05] },
  { list: [Symbol("ok")] },
  { "data-field": 1, data_field: 2, dataField: 3 },
]

// Matrix and nested structures
export const nested_structures = [
  {
    matrix: [
      [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      [
        { x: 3, y: 3 },
        { x: 4, y: 4 },
      ],
    ],
  },
  { network: { nodes: [{ ip: "127.0.0.1", port: 8080 }] } },
  { nested_maps: { a: [{ val: 1 }], b: [{ val: 2 }] } },
  { tree: { value: 1, children: [{ value: 2 }, { value: 3 }] } },
  { complex_empty: { lists: [[]], maps: [{}] } },
  { empty_in_maps: [{ empty: "" }, { empty: [] }, { empty: {} }] },
  { empty_nested: [[], [[]], [[], []]] },
  { empty_maps_list: [{}, {}, {}] },
  { empty_map_array: [{}, { a: 1 }, {}, { b: 2 }] },
  { users: [{ id: 1 }, { id: 2 }] },
  {
    items: [
      { name: "a", value: 1 },
      { name: "b", value: 2 },
    ],
  },
  {
    mixed_maps: [
      { type: "binary", data: [1, 2, 3] },
      { type: "text", data: "hello" },
    ],
  },
  { nested_array_maps: [{ items: [1, 2, 3] }, { items: [4, 5, 6] }] },
  { maps_different_keys: [{ x: 1 }, { y: 2 }, { z: 3 }] },
  { deep_map_array: [{ level: { deep: 1 } }, { level: { deep: 2 } }] },
  { maps_with_arrays: [{ arr: [1, 2] }, { arr: [3, 4] }] },
]

// Integer boundary cases (32-bit safe)
export const safe_integers = [
  { max_int32: 2147483647 },
  { min_int32: -2147483648 },
  { _field: 1, field: 2, field_: 3 },
  {
    matrix: [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
  },
  { layers: [{ data: [1, 2] }, { data: [3, 4] }] },
  { mixed_types: [{ int: 2, str: "three" }] },
  {
    config: [
      { setting: "on", value: 1 },
      { setting: "off", value: 0 },
    ],
  },
  { wrapped: [[1], [2], ["three"], [true], [Symbol("ok")]] },
  {
    indexed: [
      { idx: 1, data: 1 },
      { idx: 2, data: "two" },
    ],
  },
  {
    flagged: [
      { flag: true, value: 1 },
      { flag: false, value: 0 },
    ],
  },
  {
    tagged: [
      { tag: "num", val: 123 },
      { tag: "str", val: "hello" },
    ],
  },
  { protocol: { header: [1, 2, 3, 4], body: { data: [9, 10, 11] } } },
  { messages: [{ from: 1, to: 2, data: "hello" }] },
  {
    files: [
      { name: "file1", size: 123 },
      { name: "file2", size: 456 },
    ],
  },
  { stream: { chunks: ["part1", "part2", "part3"], eof: true } },
  {
    levels: {
      1: [1],
      2: [1, 2],
      3: [1, 2, 3],
      empty: [],
    },
  },
]

// Complex mixed type cases
export const complex_types = [
  { data: { test: [1.23, "str", 1, Symbol("ok"), [1, 2, 3]] } },
  { key: [{ str: "abc" }] },
  {
    complex: {
      nested: {
        array: [true, false, "text", 42],
        empty_map: {},
        symbol: Symbol("atom_value"),
      },
      simple: "value",
    },
  },
  {
    mixed_array: [{ name: "John", age: 25 }, "standalone_string", 3.14159],
    boolean_flag: true,
    number: 999,
  },
  {
    list_of_maps: [
      { id: 1, status: Symbol("active") },
      {
        id: 2,
        status: Symbol("inactive"),
        meta: { created: "2024-01-01" },
      },
    ],
    metadata: { version: "1.0", timestamp: 1640995200 },
  },
  {
    deep_nesting: {
      level1: {
        level2: {
          level3: [Symbol("error"), Symbol("warning"), Symbol("info")],
          config: { debug: true },
        },
      },
    },
    simple_list: [1, 2, 3, 4, 5],
  },
  {
    body: Buffer.from([1, 2, 3, 255, 0]),
    empty_list: [],
    empty_binary: Buffer.from([]),
  },
  {
    nested_empty: {
      a: {},
      b: { c: [] },
    },
    flag: false,
  },
  {
    data: [[], [1], [1, 2], []],
    meta: null,
  },
  {
    body: {
      raw: Buffer.from([0, 0, 0, 0]),
      encoded: "base64_content",
    },
    empty_string: "",
  },
]

// Body and data field combinations that pass
export const body_data_combos = [
  {
    body: { a: { b: 5, c: 3 } },
    data: { d: { e: 5, f: 3 } },
    key: { g: { h: 5, i: 3 } },
    num: 3,
    list: [1, 2, 3],
    str: "Hello",
  },
  { data: { a: 3, b: 4 } },
  { body: { a: { c: 3 }, b: 4 } },
  { data: { a: 3, b: { c: { d: 4 } } }, body: { a: 3, b: { c: { d: 4 } } } },
  {
    float: 1.23,
    int: 1,
    bool: true,
    atom: Symbol("ok"),
    nest: { bool: true, atom: Symbol("ok") },
    body: { bool: true, nest: { atom: Symbol("ok") } },
    data: { bool: true, nest: { atom: Symbol("ok") } },
  },
  { key: [{ str: "abc" }] },
  { key: [{ int: 1 }] },
  { null: null, undefined: undefined },
  { body: { list: [], map: {} }, nested: { list: [], map: {} } },
  {
    str: "abc",
    bool: true,
    num: 123,
    float: 3.14,
    atom: Symbol("ok"),
    list: [1, 2, 3],
    body: bin,
  },
  { map: { a: 1, b: 2, c: { d: 3 } }, body: bin },
  { map: { a: 3, b: "abc", c: { d: { e: 3 } } } },
  { map: { jntzf: 8.02 } },
  { map: { float: 86.01, bool: true } },
  { key: [[8.02]] },
  { base64: Buffer.from([1, 2, 3]).toString("base64") },
]

// Empty value combinations
export const empty_values = [
  { bin: {} },
  { data: {} },
  { body: {} },
  { data: {}, body: {} },
  { bin: {}, data: {} },
  { bin: {}, body: {} },
  { bin: {}, data: {}, body: {} },
  { bin: [] },
  { data: [] },
  { body: [] },
  { data: [], body: [] },
  { bin: [], data: [] },
  { bin: [], body: [] },
  { bin: [], data: [], body: [] },
]

// Atom/Symbol cases
export const atom_cases = [
  { num: Symbol("atom") },
  { data: Symbol("atom") },
  { body: Symbol("atom") },
  { data: Symbol("atom"), body: Symbol("atom") },
  { num: Symbol("atom"), data: Symbol("atom") },
  { num: Symbol("atom"), body: Symbol("atom") },
  { num: Symbol("atom"), data: Symbol("atom"), body: Symbol("atom") },
]

// Float cases
export const float_cases = [
  { num: 3.14 },
  { data: 3.14 },
  { body: 3.14 },
  { data: 3.14, body: 3.14 },
  { num: 3.14, data: 3.14 },
  { num: 3.14, body: 3.14 },
  { num: 3.14, data: 3.14, body: 3.14 },
]

// String cases
export const string_cases = [
  { data: "abc" },
  { body: "abc" },
  { data: "abc", body: "abc" },
  { str: "abc" },
  { data: "abc", str: "abc" },
  { body: "abc", str: "abc" },
  { data: "abc", body: "abc", str: "abc" },
]

// Boolean cases
export const boolean_cases = [
  { ok: true },
  { data: true },
  { body: true },
  { data: true, body: true },
  { ok: true, data: true },
  { ok: true, body: true },
  { ok: true, data: true, body: true },
]

// Integer cases
export const integer_cases = [
  { num: 1 },
  { data: 1 },
  { body: 1 },
  { data: 1, body: 1 },
  { num: 1, data: 1 },
  { num: 1, body: 1 },
  { num: 1, data: 1, body: 1 },
]

// Map error cases that pass
export const map_errors_passing = [
  { types: ["", 0, "", false, Symbol("null"), [], {}, -1] },
  { chaos: [1, "three", true, Symbol("ok"), null, [], {}, 4.5] },
  { mixed_empty_full: ["", [1], {}, { a: 1 }] },
  {
    data: [
      1,
      "abc",
      true,
      "ok",
      1.23,
      { bool: false, float: 3.14, int: 1, nested: "ok", str: "abc" },
    ],
  },
  { mixed_empty: ["", 0, [], "", {}, null, false] },
]

// HTTPsig error cases that pass
export const httpsig_errors_passing = [
  {
    data: {
      bytes: Buffer.from([0, 127, 255]),
      empty: { list: [], map: {} },
    },
  },
  {
    data: "plain text",
    body: { content: Buffer.from([192, 168, 1, 1]) },
  },
  {
    items: {
      first: Buffer.from([255]),
      second: Buffer.from([0]),
      third: Buffer.from([128]),
    },
  },
  {
    data: { body: Buffer.from([255]) },
    body: { data: Buffer.from([0]) },
  },
]

// Combine all passing cases
export const all = [
  ...basic,
  ...nested_structures,
  ...safe_integers,
  ...complex_types,
  ...body_data_combos,
  ...empty_values,
  ...atom_cases,
  ...float_cases,
  ...string_cases,
  ...boolean_cases,
  ...integer_cases,
  ...map_errors_passing,
  ...httpsig_errors_passing,
]

export default all
