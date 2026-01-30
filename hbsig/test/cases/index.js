// Index file for all test cases
// Import from here to get organized test case collections

// Passing cases (signer tests) - cases that work now
import passing from "./passing.js"
export { passing }
export * as passingCategories from "./passing.js"

// Pending cases - cases that were in test suite but currently fail (should be fixed)
import pending from "./pending.js"
export { pending }
export * as pendingCategories from "./pending.js"

// Never cases - cases that were NEVER in the test suite (edge cases for future)
import never from "./never.js"
export { never }
export * as neverCategories from "./never.js"

// Structured codec cases
import structured from "./structured.js"
export { structured }
export * as structuredCategories from "./structured.js"

// Combined exports for backwards compatibility
export const all = [...passing, ...pending]
export default all
