/**
 * A codec for turning nested objects into/from flat objects that have
 * (potentially multi-layer) paths as their keys, and values as their values.
 *
 * This implementation matches the Erlang dev_codec_flat behavior.
 */

/**
 * Convert a flat map to a nested object (TABM).
 * Matches Erlang: from(Map, Req, Opts)
 * @param {Object|string|Buffer} input - Either a flat object or a binary (passthrough)
 * @returns {Object|string|Buffer} - Nested object or passthrough value
 */
export function flat_from(input) {
  // Binary passthrough - matches Erlang: from(Bin, _, _Opts) when is_binary(Bin) -> {ok, Bin}
  if (typeof input === "string" || Buffer.isBuffer(input)) {
    return input
  }

  // Array passthrough - matches Erlang: from(List, ...) - lists pass through
  if (Array.isArray(input)) {
    return input.map(item => flat_from(item))
  }

  if (typeof input !== "object" || input === null) {
    // Non-object, non-binary values pass through
    return input
  }

  const result = {}

  for (const [pathKey, value] of Object.entries(input)) {
    const pathParts = pathToParts(pathKey)
    // Recursively process value - matches Erlang: hb_util:ok(from(Value, Req, Opts))
    const processedValue = flat_from(value)
    injectAtPath(pathParts, processedValue, result)
  }

  return result
}

/**
 * Convert a nested object (TABM) to a flat map.
 * Matches Erlang: to(Map, Req, Opts)
 * @param {Object|string|Buffer} input - Either a nested object or a binary (passthrough)
 * @returns {Object|string|Buffer} - Flat object or passthrough value
 */
export function flat_to(input) {
  // Binary passthrough - matches Erlang: to(Bin, _, _Opts) when is_binary(Bin) -> {ok, Bin}
  if (typeof input === "string" || Buffer.isBuffer(input)) {
    return input
  }

  // Array passthrough - matches Erlang: to(Other, _, _Opts) -> {ok, Other}
  if (Array.isArray(input)) {
    return input.map(item => flat_to(item))
  }

  if (typeof input !== "object" || input === null) {
    // Non-object, non-binary values pass through
    return input
  }

  const result = {}

  for (const [key, value] of Object.entries(input)) {
    // Recursively process the value first - matches Erlang: to(Value, Req, Opts)
    const processed = flat_to(value)

    if (typeof processed === "object" && processed !== null && !Array.isArray(processed)) {
      // If result is a map, flatten its keys with current key prefix
      // Matches Erlang: {ok, SubMap} when is_map(SubMap) -> maps:fold(...)
      for (const [subKey, subValue] of Object.entries(processed)) {
        const flatKey = pathToBinary([key, subKey])
        result[flatKey] = subValue
      }
    } else {
      // Simple value (not a map) - store directly
      // Matches Erlang: {ok, SimpleValue} -> maps:put(hb_path:to_binary([Key]), SimpleValue, Acc)
      const flatKey = pathToBinary([key])
      result[flatKey] = processed
    }
  }

  return result
}

/**
 * Convert path parts to a binary string.
 * Matches Erlang: hb_path:to_binary(Path)
 * @param {Array} parts - Path parts
 * @returns {string} - Joined path string
 */
function pathToBinary(parts) {
  // Filter out empty parts and join with /
  // Matches Erlang: Parts = binary:split(do_to_binary(Path), <<"/">>, [global, trim_all]),
  //                 iolist_to_binary(lists:join(<<"/">>, Parts))
  const filtered = parts.filter(p => p !== "" && p !== undefined && p !== null)
  return filtered.join("/")
}

/**
 * Helper function to convert a path string to path parts.
 * Matches Erlang: hb_path:term_to_path_parts(Path, Opts)
 * @param {string|Array} path - Path string like "a/b/c" or array of parts
 * @returns {Array} - Array of path parts
 */
function pathToParts(path) {
  if (Array.isArray(path)) {
    // Handle array paths
    if (path.length === 1 && Array.isArray(path[0])) {
      return path[0]
    }
    return path
  }

  if (typeof path === "string") {
    // Split by '/' but filter empty parts
    return path.split("/").filter(p => p !== "")
  }

  // Convert to string for other types
  return [String(path)]
}

/**
 * Helper function to inject a value at a specific path in a nested object.
 * Matches Erlang: inject_at_path(PathParts, Value, Acc, Opts)
 * @param {Array} pathParts - Array of path parts
 * @param {*} value - Value to inject
 * @param {Object} obj - Object to inject into
 */
function injectAtPath(pathParts, value, obj) {
  if (pathParts.length === 0) {
    return
  }

  if (pathParts.length === 1) {
    const key = pathParts[0]
    const existing = obj[key]

    if (existing === undefined) {
      // Not found - just set the value
      // Matches Erlang: not_found -> Map#{ Key => Value }
      obj[key] = value
    } else if (
      typeof existing === "object" &&
      existing !== null &&
      !Array.isArray(existing) &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      // Both are maps - merge them
      // Matches Erlang: ExistingMap when is_map(ExistingMap) andalso is_map(Value) ->
      //                 Map#{ Key => hb_maps:merge(ExistingMap, Value, Opts) }
      obj[key] = { ...existing, ...value }
    } else {
      // Path collision
      // Matches Erlang: throw({path_collision, ...})
      throw new Error(
        `Path collision at key: ${key}, existing: ${JSON.stringify(existing)}, value: ${JSON.stringify(value)}`
      )
    }
    return
  }

  const [key, ...rest] = pathParts

  // Get or create submap
  // Matches Erlang: SubMap = hb_maps:get(Key, Map, #{}, Opts)
  if (!(key in obj)) {
    obj[key] = {}
  }

  const subObj = obj[key]
  if (typeof subObj !== "object" || subObj === null || Array.isArray(subObj)) {
    throw new Error(`Cannot create nested path at non-object key: ${key}`)
  }

  injectAtPath(rest, value, subObj)
}

/**
 * Serialize a map to a string format.
 * Matches Erlang: serialize(Map, Opts)
 * @param {Object} map - The map to serialize
 * @returns {Object} - {ok: string} or {error: string}
 */
export function serialize(map) {
  try {
    const flattened = flat_to(map)
    const keys = Object.keys(flattened).sort()
    const lines = []

    for (const key of keys) {
      lines.push(`${key}: ${flattened[key]}`)
    }

    return { ok: lines.join("\n") + (lines.length > 0 ? "\n" : "") }
  } catch (error) {
    return { error: error.message }
  }
}

/**
 * Deserialize a string to a map.
 * Matches Erlang: deserialize(Bin)
 * @param {string|Buffer} input - The string to deserialize
 * @returns {Object} - {ok: Object} or {error: string}
 */
export function deserialize(input) {
  try {
    const str = Buffer.isBuffer(input) ? input.toString() : input
    const lines = str.split("\n")
    const flat = {}

    for (const line of lines) {
      const colonIndex = line.indexOf(": ")
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex)
        const value = line.substring(colonIndex + 2)
        flat[key] = value
      }
    }

    return { ok: flat_from(flat) }
  } catch (error) {
    return { error: error.message }
  }
}
