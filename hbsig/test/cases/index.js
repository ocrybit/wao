// Index file for all test cases
// Import from here to get organized test case collections

// Passing cases (signer tests)
import passing from "./passing.js"
export { passing }
export * as passingCategories from "./passing.js"

// Pending cases (known failures, categorized by error cause)
import pending from "./pending.js"
export { pending }
export * as pendingCategories from "./pending.js"

// Structured codec cases
import structured from "./structured.js"
export { structured }
export * as structuredCategories from "./structured.js"

// Combined exports for backwards compatibility
export const all = [...passing, ...pending]
export default all
