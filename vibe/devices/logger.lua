--[[
  Logger Device
  A comprehensive logging device for debugging and auditing.

  Vibe Prompt: "Create a logging device that records all messages with
  different log levels. Support filtering, searching, and export. Include
  structured logging with context."

  This device provides logging capabilities for other processes.

  Actions:
  - Log: Write a log entry
  - Debug/Info/Warn/Error: Level-specific logging
  - Query: Search logs with filters
  - Tail: Get recent logs
  - SetLevel: Set minimum log level
  - Clear: Clear logs
  - Export: Export logs
]]

local json = require("json")

-- Log levels
local LEVELS = {
  DEBUG = 10,
  INFO = 20,
  WARN = 30,
  ERROR = 40,
  FATAL = 50
}

local LEVEL_NAMES = {
  [10] = "DEBUG",
  [20] = "INFO",
  [30] = "WARN",
  [40] = "ERROR",
  [50] = "FATAL"
}

-- Configuration
Config = Config or {
  minLevel = LEVELS.DEBUG,
  maxLogs = 10000,
  autoRotate = true,
  includeStackTrace = true,
  structuredFormat = true
}

-- State
Logs = Logs or {}              -- Array of log entries
LogIndex = LogIndex or {}      -- { level: [ indices ], from: [ indices ], ... }
LogCounter = LogCounter or 0
ArchivedLogs = ArchivedLogs or {}

-- Owner
Owner = Owner or ao.env.Process.Owner

-- Helper: Create log entry
local function createLogEntry(level, message, context, from)
  LogCounter = LogCounter + 1

  local entry = {
    id = LogCounter,
    level = level,
    levelName = LEVEL_NAMES[level] or "UNKNOWN",
    message = message,
    context = context or {},
    from = from,
    timestamp = os.time(),
    processId = ao.id
  }

  return entry
end

-- Helper: Add log to storage with indexing
local function addLog(entry)
  -- Check level threshold
  if entry.level < Config.minLevel then
    return nil
  end

  -- Add to main log array
  table.insert(Logs, entry)

  -- Index by level
  LogIndex.level = LogIndex.level or {}
  LogIndex.level[entry.levelName] = LogIndex.level[entry.levelName] or {}
  table.insert(LogIndex.level[entry.levelName], #Logs)

  -- Index by source
  if entry.from then
    LogIndex.from = LogIndex.from or {}
    LogIndex.from[entry.from] = LogIndex.from[entry.from] or {}
    table.insert(LogIndex.from[entry.from], #Logs)
  end

  -- Auto-rotate if needed
  if Config.autoRotate and #Logs > Config.maxLogs then
    local overflow = #Logs - Config.maxLogs
    local archived = {}
    for i = 1, overflow do
      table.insert(archived, Logs[i])
    end
    table.insert(ArchivedLogs, {
      timestamp = os.time(),
      count = #archived,
      logs = archived
    })

    -- Trim main logs
    local newLogs = {}
    for i = overflow + 1, #Logs do
      table.insert(newLogs, Logs[i])
    end
    Logs = newLogs

    -- Rebuild index (simplified - just clear it)
    LogIndex = {}
  end

  return entry
end

-- Generic log handler
Handlers.add("Log", "Log", function(msg)
  local level = LEVELS[msg.Tags.Level] or LEVELS.INFO
  local message = msg.Data or msg.Tags.Message
  local context = msg.Tags.Context and json.decode(msg.Tags.Context) or {}

  local entry = createLogEntry(level, message, context, msg.From)
  addLog(entry)

  msg.reply({
    Data = json.encode({ logged = true, id = entry.id })
  })
end)

-- Level-specific handlers
Handlers.add("Debug", "Debug", function(msg)
  local message = msg.Data or msg.Tags.Message
  local context = msg.Tags.Context and json.decode(msg.Tags.Context) or {}

  local entry = createLogEntry(LEVELS.DEBUG, message, context, msg.From)
  addLog(entry)

  msg.reply({
    Data = json.encode({ logged = true, id = entry.id, level = "DEBUG" })
  })
end)

Handlers.add("Info", "Info", function(msg)
  local message = msg.Data or msg.Tags.Message
  local context = msg.Tags.Context and json.decode(msg.Tags.Context) or {}

  local entry = createLogEntry(LEVELS.INFO, message, context, msg.From)
  addLog(entry)

  msg.reply({
    Data = json.encode({ logged = true, id = entry.id, level = "INFO" })
  })
end)

Handlers.add("Warn", "Warn", function(msg)
  local message = msg.Data or msg.Tags.Message
  local context = msg.Tags.Context and json.decode(msg.Tags.Context) or {}

  local entry = createLogEntry(LEVELS.WARN, message, context, msg.From)
  addLog(entry)

  msg.reply({
    Data = json.encode({ logged = true, id = entry.id, level = "WARN" })
  })
end)

Handlers.add("Error", "Error", function(msg)
  local message = msg.Data or msg.Tags.Message
  local context = msg.Tags.Context and json.decode(msg.Tags.Context) or {}

  local entry = createLogEntry(LEVELS.ERROR, message, context, msg.From)
  addLog(entry)

  msg.reply({
    Data = json.encode({ logged = true, id = entry.id, level = "ERROR" })
  })
end)

Handlers.add("Fatal", "Fatal", function(msg)
  local message = msg.Data or msg.Tags.Message
  local context = msg.Tags.Context and json.decode(msg.Tags.Context) or {}

  local entry = createLogEntry(LEVELS.FATAL, message, context, msg.From)
  addLog(entry)

  msg.reply({
    Data = json.encode({ logged = true, id = entry.id, level = "FATAL" })
  })
end)

-- Query logs with filters
Handlers.add("Query", "Query", function(msg)
  local level = msg.Tags.Level
  local from = msg.Tags.From
  local search = msg.Tags.Search
  local startTime = tonumber(msg.Tags.StartTime)
  local endTime = tonumber(msg.Tags.EndTime)
  local limit = tonumber(msg.Tags.Limit) or 100
  local offset = tonumber(msg.Tags.Offset) or 0

  local results = {}
  local matched = 0
  local skipped = 0

  for i, entry in ipairs(Logs) do
    local include = true

    -- Filter by level
    if level and entry.levelName ~= level then
      include = false
    end

    -- Filter by source
    if from and entry.from ~= from then
      include = false
    end

    -- Filter by time range
    if startTime and entry.timestamp < startTime then
      include = false
    end
    if endTime and entry.timestamp > endTime then
      include = false
    end

    -- Filter by search term
    if search and not string.find(entry.message, search, 1, true) then
      include = false
    end

    if include then
      matched = matched + 1
      if skipped >= offset and #results < limit then
        table.insert(results, entry)
      elseif skipped < offset then
        skipped = skipped + 1
      end
    end
  end

  msg.reply({
    Data = json.encode({
      logs = results,
      total = matched,
      limit = limit,
      offset = offset,
      hasMore = matched > offset + #results
    })
  })
end)

-- Get recent logs
Handlers.add("Tail", "Tail", function(msg)
  local count = tonumber(msg.Tags.Count) or 50
  local level = msg.Tags.Level
  local minLevel = level and LEVELS[level] or Config.minLevel

  local results = {}
  local start = math.max(1, #Logs - count * 2)  -- Get more to filter

  for i = #Logs, start, -1 do
    if #results >= count then break end

    local entry = Logs[i]
    if entry.level >= minLevel then
      table.insert(results, 1, entry)
    end
  end

  -- Trim if we have more than requested
  while #results > count do
    table.remove(results, 1)
  end

  msg.reply({
    Data = json.encode({
      logs = results,
      count = #results,
      totalLogs = #Logs
    })
  })
end)

-- Set minimum log level
Handlers.add("SetLevel", "SetLevel", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can set level" })
    return
  end

  local level = msg.Tags.Level

  if not level or not LEVELS[level] then
    msg.reply({
      Tags = { Error = "Invalid-Level" },
      Data = "Valid levels: DEBUG, INFO, WARN, ERROR, FATAL"
    })
    return
  end

  Config.minLevel = LEVELS[level]

  msg.reply({
    Data = json.encode({
      action = "level-set",
      level = level,
      minLevel = Config.minLevel
    })
  })
end)

-- Clear logs
Handlers.add("Clear", "Clear", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can clear logs" })
    return
  end

  local archive = msg.Tags.Archive == "true"
  local cleared = #Logs

  if archive then
    table.insert(ArchivedLogs, {
      timestamp = os.time(),
      count = #Logs,
      logs = Logs,
      reason = "manual-clear"
    })
  end

  Logs = {}
  LogIndex = {}

  msg.reply({
    Data = json.encode({
      action = "cleared",
      count = cleared,
      archived = archive
    })
  })
end)

-- Export logs
Handlers.add("Export", "Export", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can export" })
    return
  end

  local format = msg.Tags.Format or "json"  -- json, csv, ndjson
  local level = msg.Tags.Level
  local minLevel = level and LEVELS[level] or 0

  local filtered = {}
  for _, entry in ipairs(Logs) do
    if entry.level >= minLevel then
      table.insert(filtered, entry)
    end
  end

  if format == "csv" then
    local csv = "id,timestamp,level,from,message\n"
    for _, entry in ipairs(filtered) do
      csv = csv .. string.format("%d,%d,%s,%s,%q\n",
        entry.id, entry.timestamp, entry.levelName,
        entry.from or "", entry.message or "")
    end
    msg.reply({ Data = csv })
  elseif format == "ndjson" then
    local lines = {}
    for _, entry in ipairs(filtered) do
      table.insert(lines, json.encode(entry))
    end
    msg.reply({ Data = table.concat(lines, "\n") })
  else
    msg.reply({ Data = json.encode({ logs = filtered }) })
  end
end)

-- Get log stats
Handlers.add("Stats", "Stats", function(msg)
  local stats = {
    totalLogs = #Logs,
    totalCounter = LogCounter,
    archivedBatches = #ArchivedLogs,
    config = Config,
    byLevel = {}
  }

  -- Count by level
  for _, entry in ipairs(Logs) do
    stats.byLevel[entry.levelName] = (stats.byLevel[entry.levelName] or 0) + 1
  end

  msg.reply({
    Data = json.encode(stats)
  })
end)

-- Configure logger
Handlers.add("Configure", "Configure", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can configure" })
    return
  end

  if msg.Tags.MaxLogs then
    Config.maxLogs = tonumber(msg.Tags.MaxLogs)
  end

  if msg.Tags.AutoRotate ~= nil then
    Config.autoRotate = msg.Tags.AutoRotate == "true"
  end

  if msg.Tags.StructuredFormat ~= nil then
    Config.structuredFormat = msg.Tags.StructuredFormat == "true"
  end

  msg.reply({
    Data = json.encode({
      action = "configured",
      config = Config
    })
  })
end)

-- Get archived logs
Handlers.add("GetArchived", "GetArchived", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can view archives" })
    return
  end

  local batchIndex = tonumber(msg.Tags.Batch)

  if batchIndex then
    if ArchivedLogs[batchIndex] then
      msg.reply({ Data = json.encode(ArchivedLogs[batchIndex]) })
    else
      msg.reply({ Tags = { Error = "Not-Found" }, Data = "Archive batch not found" })
    end
  else
    -- Return summary
    local summary = {}
    for i, batch in ipairs(ArchivedLogs) do
      table.insert(summary, {
        batch = i,
        timestamp = batch.timestamp,
        count = batch.count,
        reason = batch.reason
      })
    end
    msg.reply({ Data = json.encode({ archives = summary }) })
  end
end)
