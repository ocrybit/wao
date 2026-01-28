// Test cases for flat_from (flat to nested)
// Note: Erlang dev_codec_flat only supports binaries (strings) and maps (objects)
// All leaf values must be strings for compatibility
export const cases_from = [
  // 1. Simple single-level key
  { a: "value" },

  // 2. Single nested path
  { "a/b": "value" },

  // 3. Multiple paths with same parent
  { "x/y": "1", "x/z": "2" },

  // 4. Mixed levels
  { a: "1", "b/c": "2", "d/e/f": "3" },

  // 5. Deep nesting
  { "a/b/c/d/e": "deep" },

  // 6. Numeric values as strings
  { count: "42", "nested/number": "3.14" },

  // 7. Boolean values as strings
  { flag: "true", "config/enabled": "false" },

  // 8. Empty string values
  { empty: "", "nested/empty": "" },

  // 9. Object values (maps with string leaf values)
  { meta: { type: "test" }, "config/data": { key: "value" } },

  // 10. Special characters in values
  { message: "Hello, World!", "path/to/text": "Line1\nLine2" },

  // 11. Unicode in keys and values
  { "unicode/🎉": "celebration", greeting: "Hello 世界" },

  // 12. Numbers as strings
  { id: "123", "user/age": "25" },

  // 13. Complex nested structure
  {
    "app/name": "MyApp",
    "app/version": "1.0.0",
    "app/config/debug": "true",
    "app/config/port": "3000",
  },

  // 14. Path with numbers
  { "items/0": "first", "items/1": "second", "items/2": "third" },

  // 15. Long path
  { "a/b/c/d/e/f/g/h/i/j": "deeply nested" },

  // 16. Special JSON characters
  { json: '{"key": "value"}', "escaped/path": 'a"b"c' },

  // 17. Large nested structure
  {
    "users/john/name": "John Doe",
    "users/john/email": "john@example.com",
    "users/john/preferences/theme": "dark",
    "users/john/preferences/notifications": "true",
    "users/jane/name": "Jane Smith",
    "users/jane/email": "jane@example.com",
    "users/jane/preferences/theme": "light",
    "users/jane/preferences/notifications": "false",
  },
]

// Test cases for flat_to (nested to flat)
// Note: Erlang dev_codec_flat only supports binaries (strings) and maps (objects)
// All leaf values must be strings for compatibility
export const cases_to = [
  // 1. Simple single-level object
  { a: "value" },

  // 2. Single nested object
  { a: { b: "value" } },

  // 3. Multiple properties at same level
  { x: { y: "1", z: "2" } },

  // 4. Mixed levels
  { a: "1", b: { c: "2" }, d: { e: { f: "3" } } },

  // 5. Deep nesting
  { a: { b: { c: { d: { e: "deep" } } } } },

  // 6. Numeric values as strings
  { count: "42", nested: { number: "3.14" } },

  // 7. Boolean values as strings
  { flag: "true", config: { enabled: "false" } },

  // 8. Empty string values
  { empty: "", nested: { empty: "" } },

  // 9. Nested objects that should flatten completely
  { meta: { type: "test" }, config: { data: { key: "value" } } },

  // 10. Special characters in values
  { message: "Hello, World!", path: { to: { text: "Line1\nLine2" } } },

  // 11. Unicode in keys and values
  { unicode: { "🎉": "celebration" }, greeting: "Hello 世界" },

  // 12. Numbers as strings
  { id: "123", user: { age: "25" } },

  // 13. Complex nested structure with string values
  {
    app: {
      name: "MyApp",
      version: "1.0.0",
      config: {
        debug: "true",
        port: "3000",
      },
    },
  },

  // 14. Object with numeric-like keys
  { items: { 0: "first", 1: "second", 2: "third" } },

  // 15. Very deep nesting
  {
    a: {
      b: {
        c: { d: { e: { f: { g: { h: { i: { j: "deeply nested" } } } } } } },
      },
    },
  },

  // 16. Special JSON characters
  { json: '{"key": "value"}', escaped: { path: 'a"b"c' } },

  // 17. Large nested structure with all string values
  {
    users: {
      john: {
        name: "John Doe",
        email: "john@example.com",
        preferences: {
          theme: "dark",
          notifications: "true",
        },
      },
      jane: {
        name: "Jane Smith",
        email: "jane@example.com",
        preferences: {
          theme: "light",
          notifications: "false",
        },
      },
    },
  },
]
