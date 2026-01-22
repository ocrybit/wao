--[[
  Key-Value Store App
  A simple on-chain database with namespaces, TTL, and access control.

  Vibe Prompt: "Build a key-value database where I can store and retrieve
  data. Support namespaces for organizing data, TTL for expiration,
  and let me control who can read/write my data."

  Actions:
  - Set: Store a value
  - Get: Retrieve a value
  - Delete: Remove a value
  - List: List keys in namespace
  - SetTTL: Set expiration
  - SetAccess: Control read/write permissions
  - BatchSet: Set multiple values
  - BatchGet: Get multiple values
]]

local json = require("json")

-- State
Data = Data or {}            -- { owner: { namespace: { key: { value, meta } } } }
Access = Access or {}        -- { owner: { namespace: { readers: {}, writers: {} } } }

local DEFAULT_NAMESPACE = "default"

-- Helper: Get user data store
local function getStore(owner, namespace)
  Data[owner] = Data[owner] or {}
  Data[owner][namespace] = Data[owner][namespace] or {}
  return Data[owner][namespace]
end

-- Helper: Check read access
local function canRead(owner, namespace, reader)
  if owner == reader then return true end

  local access = Access[owner] and Access[owner][namespace]
  if not access then return false end
  if access.public then return true end
  if access.readers and access.readers[reader] then return true end
  if access.writers and access.writers[reader] then return true end

  return false
end

-- Helper: Check write access
local function canWrite(owner, namespace, writer)
  if owner == writer then return true end

  local access = Access[owner] and Access[owner][namespace]
  if not access then return false end
  if access.writers and access.writers[writer] then return true end

  return false
end

-- Helper: Check if value is expired
local function isExpired(entry)
  if not entry or not entry.expiresAt then return false end
  return os.time() > entry.expiresAt
end

-- Set a value
Handlers.add("Set", "Set", function(msg)
  local key = msg.Tags.Key
  local value = msg.Data or msg.Tags.Value
  local namespace = msg.Tags.Namespace or DEFAULT_NAMESPACE
  local owner = msg.Tags.Owner or msg.From
  local ttl = tonumber(msg.Tags.TTL)  -- Time to live in seconds

  if not key then
    msg.reply({ Tags = { Error = "Key-Required" }, Data = "Key is required" })
    return
  end

  if not canWrite(owner, namespace, msg.From) then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No write access" })
    return
  end

  local store = getStore(owner, namespace)

  store[key] = {
    value = value,
    type = type(value),
    createdAt = store[key] and store[key].createdAt or os.time(),
    updatedAt = os.time(),
    updatedBy = msg.From,
    expiresAt = ttl and (os.time() + ttl) or nil
  }

  msg.reply({
    Data = json.encode({
      action = "set",
      key = key,
      namespace = namespace,
      owner = owner
    })
  })
end)

-- Get a value
Handlers.add("Get", "Get", function(msg)
  local key = msg.Tags.Key
  local namespace = msg.Tags.Namespace or DEFAULT_NAMESPACE
  local owner = msg.Tags.Owner or msg.From

  if not key then
    msg.reply({ Tags = { Error = "Key-Required" }, Data = "Key is required" })
    return
  end

  if not canRead(owner, namespace, msg.From) then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No read access" })
    return
  end

  local store = getStore(owner, namespace)
  local entry = store[key]

  if not entry or isExpired(entry) then
    if entry and isExpired(entry) then
      store[key] = nil  -- Clean up expired
    end
    msg.reply({
      Tags = { Error = "Not-Found" },
      Data = json.encode({ error = "Key not found", key = key })
    })
    return
  end

  msg.reply({
    Tags = { Key = key, Namespace = namespace },
    Data = json.encode({
      key = key,
      value = entry.value,
      meta = {
        createdAt = entry.createdAt,
        updatedAt = entry.updatedAt,
        expiresAt = entry.expiresAt
      }
    })
  })
end)

-- Delete a value
Handlers.add("Delete", "Delete", function(msg)
  local key = msg.Tags.Key
  local namespace = msg.Tags.Namespace or DEFAULT_NAMESPACE
  local owner = msg.Tags.Owner or msg.From

  if not key then
    msg.reply({ Tags = { Error = "Key-Required" }, Data = "Key is required" })
    return
  end

  if not canWrite(owner, namespace, msg.From) then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No write access" })
    return
  end

  local store = getStore(owner, namespace)

  if not store[key] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Key not found" })
    return
  end

  store[key] = nil

  msg.reply({
    Data = json.encode({ action = "deleted", key = key })
  })
end)

-- List keys
Handlers.add("List", "List", function(msg)
  local namespace = msg.Tags.Namespace or DEFAULT_NAMESPACE
  local owner = msg.Tags.Owner or msg.From
  local prefix = msg.Tags.Prefix
  local limit = tonumber(msg.Tags.Limit) or 100

  if not canRead(owner, namespace, msg.From) then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No read access" })
    return
  end

  local store = getStore(owner, namespace)
  local keys = {}
  local now = os.time()

  for key, entry in pairs(store) do
    if not isExpired(entry) then
      if not prefix or key:sub(1, #prefix) == prefix then
        table.insert(keys, {
          key = key,
          updatedAt = entry.updatedAt,
          expiresAt = entry.expiresAt
        })
      end
    else
      store[key] = nil  -- Clean up
    end
  end

  -- Sort by key
  table.sort(keys, function(a, b) return a.key < b.key end)

  -- Limit results
  if #keys > limit then
    local trimmed = {}
    for i = 1, limit do
      table.insert(trimmed, keys[i])
    end
    keys = trimmed
  end

  msg.reply({
    Data = json.encode({
      namespace = namespace,
      owner = owner,
      keys = keys,
      count = #keys
    })
  })
end)

-- Set TTL on existing key
Handlers.add("SetTTL", "SetTTL", function(msg)
  local key = msg.Tags.Key
  local namespace = msg.Tags.Namespace or DEFAULT_NAMESPACE
  local owner = msg.Tags.Owner or msg.From
  local ttl = tonumber(msg.Tags.TTL)

  if not key then
    msg.reply({ Tags = { Error = "Key-Required" }, Data = "Key is required" })
    return
  end

  if not canWrite(owner, namespace, msg.From) then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No write access" })
    return
  end

  local store = getStore(owner, namespace)

  if not store[key] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Key not found" })
    return
  end

  store[key].expiresAt = ttl and (os.time() + ttl) or nil

  msg.reply({
    Data = json.encode({
      action = "ttl-set",
      key = key,
      expiresAt = store[key].expiresAt
    })
  })
end)

-- Set access permissions
Handlers.add("SetAccess", "SetAccess", function(msg)
  local namespace = msg.Tags.Namespace or DEFAULT_NAMESPACE
  local reader = msg.Tags.Reader
  local writer = msg.Tags.Writer
  local public = msg.Tags.Public == "true"
  local remove = msg.Tags.Remove == "true"

  Access[msg.From] = Access[msg.From] or {}
  Access[msg.From][namespace] = Access[msg.From][namespace] or {
    readers = {},
    writers = {},
    public = false
  }

  local access = Access[msg.From][namespace]

  if public ~= nil then
    access.public = public
  end

  if reader then
    if remove then
      access.readers[reader] = nil
    else
      access.readers[reader] = true
    end
  end

  if writer then
    if remove then
      access.writers[writer] = nil
    else
      access.writers[writer] = true
    end
  end

  msg.reply({
    Data = json.encode({
      action = "access-updated",
      namespace = namespace,
      access = access
    })
  })
end)

-- Batch set
Handlers.add("BatchSet", "BatchSet", function(msg)
  local namespace = msg.Tags.Namespace or DEFAULT_NAMESPACE
  local owner = msg.Tags.Owner or msg.From
  local items = json.decode(msg.Data)

  if not items or type(items) ~= "table" then
    msg.reply({ Tags = { Error = "Invalid-Data" }, Data = "Data must be array of {key, value}" })
    return
  end

  if not canWrite(owner, namespace, msg.From) then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No write access" })
    return
  end

  local store = getStore(owner, namespace)
  local now = os.time()
  local count = 0

  for _, item in ipairs(items) do
    if item.key then
      store[item.key] = {
        value = item.value,
        createdAt = store[item.key] and store[item.key].createdAt or now,
        updatedAt = now,
        updatedBy = msg.From,
        expiresAt = item.ttl and (now + item.ttl) or nil
      }
      count = count + 1
    end
  end

  msg.reply({
    Data = json.encode({
      action = "batch-set",
      count = count,
      namespace = namespace
    })
  })
end)

-- Batch get
Handlers.add("BatchGet", "BatchGet", function(msg)
  local namespace = msg.Tags.Namespace or DEFAULT_NAMESPACE
  local owner = msg.Tags.Owner or msg.From
  local keys = json.decode(msg.Data)

  if not keys or type(keys) ~= "table" then
    msg.reply({ Tags = { Error = "Invalid-Data" }, Data = "Data must be array of keys" })
    return
  end

  if not canRead(owner, namespace, msg.From) then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No read access" })
    return
  end

  local store = getStore(owner, namespace)
  local results = {}

  for _, key in ipairs(keys) do
    local entry = store[key]
    if entry and not isExpired(entry) then
      results[key] = entry.value
    else
      results[key] = nil
      if entry and isExpired(entry) then
        store[key] = nil
      end
    end
  end

  msg.reply({
    Data = json.encode({
      namespace = namespace,
      results = results
    })
  })
end)

-- List namespaces
Handlers.add("Namespaces", "Namespaces", function(msg)
  local owner = msg.Tags.Owner or msg.From

  if owner ~= msg.From and not Access[owner] then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No access" })
    return
  end

  local namespaces = {}

  if Data[owner] then
    for ns, store in pairs(Data[owner]) do
      local keyCount = 0
      for _ in pairs(store) do
        keyCount = keyCount + 1
      end
      table.insert(namespaces, {
        name = ns,
        keys = keyCount,
        public = Access[owner] and Access[owner][ns] and Access[owner][ns].public or false
      })
    end
  end

  msg.reply({
    Data = json.encode({ namespaces = namespaces })
  })
end)

-- Get access info
Handlers.add("GetAccess", "GetAccess", function(msg)
  local namespace = msg.Tags.Namespace or DEFAULT_NAMESPACE
  local owner = msg.Tags.Owner or msg.From

  if owner ~= msg.From then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can view access" })
    return
  end

  local access = Access[owner] and Access[owner][namespace]

  msg.reply({
    Data = json.encode({
      namespace = namespace,
      access = access or { readers = {}, writers = {}, public = false }
    })
  })
end)
