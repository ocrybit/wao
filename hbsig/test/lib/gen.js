/**
 * Generate JSON objects for testing the Erlang JSON codec
 * This generator creates test cases compatible with HyperBEAM round-trips
 *
 * Note: HyperBEAM has specific limitations:
 * - Arrays get "linkified" (converted to content-addressed references)
 * - Nested objects get linkified
 * - Numbers, booleans, null are encoded differently
 * - Empty buffers/strings have different handling
 * - Symbols (atoms) have different handling
 *
 * Therefore, this generator only produces flat objects with string/buffer values
 */

// Helper function to get random element from array
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Helper function to generate random integer in range
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Generate a random non-empty string (safe for HyperBEAM round-trips)
function generateString() {
  const choices = [
    // Single character
    "a",
    // ASCII printable
    "Hello World",
    // With special characters
    "Line1\nLine2\tTab\rReturn",
    // With quotes and backslashes
    'He said "Hello" and \\escaped\\',
    // Numbers as strings
    "123",
    "3.14",
    "-42",
    // Boolean-like strings
    "true",
    "false",
    "null",
    "undefined",
    // Long string
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(10),
    // Unicode (though it will be converted to bytes)
    "Hello 世界 😀",
    // Special structured field patterns
    ":base64:",
    "::",
    // Path-like
    "/path/to/file.txt",
    // URL-like
    "https://example.com/path?query=value",
    // JSON-like string
    '{"key": "value"}',
    // Array-like string
    "[1, 2, 3]",
    // With null bytes (will be encoded)
    "before\x00after",
    // All whitespace (non-empty)
    "   \t\n\r   ",
    // Mixed case
    "CamelCase_snake_case-kebab-case",
  ]

  return randomChoice(choices)
}

// Generate a random non-empty buffer (safe for HyperBEAM round-trips)
function generateBuffer() {
  const choices = [
    // Single byte (non-zero to avoid edge cases)
    Buffer.from([1]),
    Buffer.from([255]),
    Buffer.from([128]),
    // ASCII text
    Buffer.from("Hello World"),
    // Binary data
    Buffer.from([0, 1, 2, 3, 255, 254, 253]),
    // All 255s (non-empty)
    Buffer.alloc(10, 255),
    // Pattern
    Buffer.from([0, 255, 0, 255, 0, 255]),
    // Looks like UTF-8 but isn't valid
    Buffer.from([0xff, 0xfe, 0xfd]),
    // Valid UTF-8 for non-ASCII
    Buffer.from("Hello 世界", "utf8"),
    // Printable ASCII that looks like base64
    Buffer.from("SGVsbG8gV29ybGQ="),
    // Bytes that decode to special strings
    Buffer.from("true"),
    Buffer.from("null"),
    Buffer.from("undefined"),
  ]

  return randomChoice(choices)
}

// Generate a random symbol - kept for backwards compatibility but NOT used in gen()
function generateSymbol() {
  const choices = [
    Symbol.for("ok"),
    Symbol.for("error"),
    Symbol.for("atom"),
    Symbol.for("simple"),
  ]
  return randomChoice(choices)
}

// Generate a random number - kept for backwards compatibility but NOT used in gen()
function generateNumber() {
  const choices = [0, 1, -1, 42, 3.14, -3.14]
  return randomChoice(choices)
}

// Generate a random primitive value - only string or buffer for HyperBEAM compat
function generatePrimitive() {
  // Only generate string or buffer - these are the only types that work reliably
  const types = ["string", "buffer"]
  const type = randomChoice(types)

  switch (type) {
    case "string":
      return generateString()
    case "buffer":
      return generateBuffer()
    default:
      return generateString()
  }
}

// Generate a random array - kept for backwards compatibility but NOT used in gen()
function generateArray(depth = 0, maxDepth = 3) {
  if (depth >= maxDepth) return []
  return [generatePrimitive()]
}

// Generate a flat object with string/buffer values (HyperBEAM compatible)
// Note: Avoid HTTP header names like content-type, accept, host, etc. as they get filtered
function generateObject(depth = 0, maxDepth = 3) {
  // For HyperBEAM compatibility, only generate flat objects with string/buffer values
  const choices = [
    // Single key with string
    () => ({ key: generateString() }),
    // Single key with buffer
    () => ({ binary: generateBuffer() }),
    // Multiple keys with strings
    () => ({ x: "hello", y: "world", z: "test" }),
    // Multiple keys with buffers
    () => ({
      a: Buffer.from("alpha"),
      b: Buffer.from("beta"),
      c: Buffer.from("gamma"),
    }),
    // Mixed string and buffer values
    () => ({
      name: "Alice",
      avatar: Buffer.from("image data"),
    }),
    // Keys that test normalization (case sensitivity)
    () => ({ camelcase: "value1", lowercase: "value2", uppercase: "value3" }),
    // Numeric string keys
    () => ({ "0": "zero", "1": "one", "2": "two" }),
    // Special characters in values
    () => ({
      escaped: 'He said "Hello"',
      newline: "Line1\nLine2",
      unicode: "Hello 世界",
    }),
    // Custom app headers (not HTTP standard headers)
    () => ({
      "x-app-id": "myapp",
      "x-request-id": "12345",
    }),
    // Larger object
    () =>
      Object.fromEntries(
        Array(10)
          .fill(0)
          .map((_, i) => [`key${i}`, `value${i}`])
      ),
  ]

  const choice = randomChoice(choices)
  return choice()
}

// Generate a HyperBEAM-compatible test case (flat object with string/buffer values)
function generateTestCase() {
  // Only generate flat objects - no nested objects, arrays, or unsupported primitives
  return generateObject()
}

// Main generator function
// Only generates flat objects with string/buffer values for HyperBEAM compatibility
export function gen(count = 100) {
  const cases = []

  // Add some guaranteed HyperBEAM-compatible cases
  // Note: Avoid HTTP header names (content-type, accept, host, etc.) as they get filtered
  const guaranteedCases = [
    // Simple string values
    { key: "value" },
    { name: "test", version: "1.0" },
    // Buffer values
    { binary: Buffer.from("data") },
    { a: Buffer.from([1, 2, 3]), b: Buffer.from([255, 254, 253]) },
    // Mixed string and buffer
    { name: "Alice", avatar: Buffer.from("image") },
    // Case sensitivity test
    { lowercase: "lower", uppercase: "upper" },
    // Special characters
    { escaped: 'He said "Hello"' },
    { newline: "Line1\nLine2" },
    { unicode: "Hello 世界" },
    // Custom app headers (not HTTP standard headers)
    { "x-app-id": "myapp", "x-request-id": "12345" },
    { "custom-field": "value", "another-field": "test" },
    // Numeric string keys
    { "0": "zero", "1": "one" },
    // Longer values
    { long: "Lorem ipsum dolor sit amet, consectetur adipiscing elit." },
    { longbuf: Buffer.from("A".repeat(100)) },
  ]

  // Add guaranteed cases
  guaranteedCases.forEach(c => {
    if (cases.length < count) {
      cases.push(c)
    }
  })

  // Generate random cases for the rest
  while (cases.length < count) {
    cases.push(generateTestCase())
  }

  // Shuffle the array to mix guaranteed and random cases
  for (let i = cases.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cases[i], cases[j]] = [cases[j], cases[i]]
  }

  return cases
}

// Export individual generators for testing
export {
  generateString,
  generateBuffer,
  generateSymbol,
  generateNumber,
  generatePrimitive,
  generateArray,
  generateObject,
  generateTestCase,
}
