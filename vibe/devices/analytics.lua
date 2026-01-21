--[[
  Analytics Device
  A comprehensive analytics and metrics tracking device.

  Vibe Prompt: "Create an analytics device that tracks all message activity.
  Record user actions, compute metrics, generate reports on usage patterns,
  and detect anomalies."

  This device provides observability for other processes.

  Actions:
  - Track: Record a custom event
  - GetMetrics: Get aggregated metrics
  - GetReport: Generate analytics report
  - GetUserStats: Get stats for a specific user
  - GetActionStats: Get stats for a specific action
  - GetTimeSeries: Get time-based data
  - Alert: Configure anomaly alerts
]]

local json = require("json")

-- Configuration
Config = Config or {
  retentionDays = 30,       -- Keep data for 30 days
  aggregationInterval = 3600,  -- 1 hour aggregation
  anomalyThreshold = 3,     -- Standard deviations for anomaly
  maxEventsPerUser = 10000  -- Max events to store per user
}

-- State
Events = Events or {}            -- { timestamp: [ events ] }
UserStats = UserStats or {}      -- { address: { ... } }
ActionStats = ActionStats or {}  -- { action: { ... } }
HourlyAggregates = HourlyAggregates or {}  -- { hourKey: { metrics } }
Alerts = Alerts or {}            -- Configured alerts

-- Counters
Counters = Counters or {
  totalEvents = 0,
  totalUsers = 0,
  totalActions = 0,
  todayEvents = 0,
  todayStart = os.time()
}

-- Owner
Owner = Owner or ao.env.Process.Owner

-- Helper: Get hour key for timestamp
local function getHourKey(timestamp)
  return math.floor(timestamp / 3600) * 3600
end

-- Helper: Get day key for timestamp
local function getDayKey(timestamp)
  return math.floor(timestamp / 86400) * 86400
end

-- Helper: Update daily counter
local function updateDailyCounter()
  local today = getDayKey(os.time())
  if Counters.todayStart ~= today then
    Counters.todayStart = today
    Counters.todayEvents = 0
  end
end

-- Helper: Record event internally
local function recordEvent(eventType, data, from)
  local now = os.time()
  updateDailyCounter()

  local event = {
    type = eventType,
    from = from,
    data = data,
    timestamp = now
  }

  -- Store by hour
  local hourKey = getHourKey(now)
  Events[hourKey] = Events[hourKey] or {}
  table.insert(Events[hourKey], event)

  -- Update counters
  Counters.totalEvents = Counters.totalEvents + 1
  Counters.todayEvents = Counters.todayEvents + 1

  -- Update user stats
  if from then
    if not UserStats[from] then
      UserStats[from] = {
        firstSeen = now,
        lastSeen = now,
        totalEvents = 0,
        eventsByType = {},
        sessions = 1
      }
      Counters.totalUsers = Counters.totalUsers + 1
    end

    local user = UserStats[from]
    user.lastSeen = now
    user.totalEvents = user.totalEvents + 1
    user.eventsByType[eventType] = (user.eventsByType[eventType] or 0) + 1

    -- Detect new session (30 min gap)
    if now - user.lastSeen > 1800 then
      user.sessions = user.sessions + 1
    end
  end

  -- Update action stats
  if not ActionStats[eventType] then
    ActionStats[eventType] = {
      firstSeen = now,
      totalCount = 0,
      uniqueUsers = {},
      hourlyAvg = 0
    }
    Counters.totalActions = Counters.totalActions + 1
  end

  local action = ActionStats[eventType]
  action.totalCount = action.totalCount + 1
  action.lastSeen = now
  if from then
    action.uniqueUsers[from] = true
  end

  -- Update hourly aggregates
  HourlyAggregates[hourKey] = HourlyAggregates[hourKey] or {
    events = 0,
    users = {},
    actions = {}
  }

  local hourly = HourlyAggregates[hourKey]
  hourly.events = hourly.events + 1
  if from then hourly.users[from] = true end
  hourly.actions[eventType] = (hourly.actions[eventType] or 0) + 1

  return event
end

-- Auto-track all incoming messages
Handlers.add("AutoTrack", function(msg)
  return msg.Action ~= nil or msg.Tags.Action ~= nil
end, function(msg)
  local action = msg.Action or msg.Tags.Action
  recordEvent(action, {
    tags = msg.Tags,
    hasData = msg.Data ~= nil
  }, msg.From)

  -- Continue processing (don't block)
end)

-- Manual event tracking
Handlers.add("Track", "Track", function(msg)
  local eventType = msg.Tags.Event or msg.Tags.Type or "custom"
  local data = msg.Data and json.decode(msg.Data) or {}

  local event = recordEvent(eventType, data, msg.From)

  msg.reply({
    Data = json.encode({
      action = "tracked",
      event = event
    })
  })
end)

-- Get aggregated metrics
Handlers.add("GetMetrics", "GetMetrics", function(msg)
  local period = msg.Tags.Period or "day"  -- hour, day, week, month

  local now = os.time()
  local periodSeconds = {
    hour = 3600,
    day = 86400,
    week = 604800,
    month = 2592000
  }

  local duration = periodSeconds[period] or 86400
  local startTime = now - duration

  -- Aggregate data for period
  local metrics = {
    period = period,
    startTime = startTime,
    endTime = now,
    totalEvents = 0,
    uniqueUsers = {},
    actionBreakdown = {},
    hourlyTrend = {}
  }

  for hourKey, data in pairs(HourlyAggregates) do
    if hourKey >= startTime then
      metrics.totalEvents = metrics.totalEvents + data.events

      for user in pairs(data.users) do
        metrics.uniqueUsers[user] = true
      end

      for action, count in pairs(data.actions) do
        metrics.actionBreakdown[action] = (metrics.actionBreakdown[action] or 0) + count
      end

      table.insert(metrics.hourlyTrend, {
        hour = hourKey,
        events = data.events
      })
    end
  end

  -- Count unique users
  local userCount = 0
  for _ in pairs(metrics.uniqueUsers) do
    userCount = userCount + 1
  end
  metrics.uniqueUsers = userCount

  -- Sort hourly trend
  table.sort(metrics.hourlyTrend, function(a, b) return a.hour < b.hour end)

  msg.reply({
    Data = json.encode(metrics)
  })
end)

-- Generate analytics report
Handlers.add("GetReport", "GetReport", function(msg)
  updateDailyCounter()

  local report = {
    generated = os.time(),
    summary = {
      totalEvents = Counters.totalEvents,
      totalUsers = Counters.totalUsers,
      totalActions = Counters.totalActions,
      todayEvents = Counters.todayEvents
    },
    topActions = {},
    topUsers = {},
    recentActivity = {}
  }

  -- Top actions by count
  local actionList = {}
  for action, stats in pairs(ActionStats) do
    local uniqueCount = 0
    for _ in pairs(stats.uniqueUsers) do uniqueCount = uniqueCount + 1 end
    table.insert(actionList, {
      action = action,
      count = stats.totalCount,
      uniqueUsers = uniqueCount
    })
  end
  table.sort(actionList, function(a, b) return a.count > b.count end)
  for i = 1, math.min(10, #actionList) do
    table.insert(report.topActions, actionList[i])
  end

  -- Top users by activity
  local userList = {}
  for addr, stats in pairs(UserStats) do
    table.insert(userList, {
      address = addr,
      events = stats.totalEvents,
      sessions = stats.sessions,
      lastSeen = stats.lastSeen
    })
  end
  table.sort(userList, function(a, b) return a.events > b.events end)
  for i = 1, math.min(10, #userList) do
    table.insert(report.topUsers, userList[i])
  end

  -- Recent activity (last hour)
  local lastHour = getHourKey(os.time())
  if Events[lastHour] then
    local recent = {}
    for i = math.max(1, #Events[lastHour] - 20), #Events[lastHour] do
      table.insert(recent, Events[lastHour][i])
    end
    report.recentActivity = recent
  end

  msg.reply({
    Data = json.encode(report)
  })
end)

-- Get user stats
Handlers.add("GetUserStats", "GetUserStats", function(msg)
  local target = msg.Tags.Address or msg.Tags.User or msg.From

  if not UserStats[target] then
    msg.reply({
      Tags = { Error = "Not-Found" },
      Data = json.encode({ error = "User not found", address = target })
    })
    return
  end

  local stats = UserStats[target]

  -- Calculate additional metrics
  local daysSinceFirst = math.floor((os.time() - stats.firstSeen) / 86400)
  local avgEventsPerDay = daysSinceFirst > 0 and stats.totalEvents / daysSinceFirst or stats.totalEvents

  msg.reply({
    Data = json.encode({
      address = target,
      stats = stats,
      computed = {
        daysSinceFirst = daysSinceFirst,
        avgEventsPerDay = avgEventsPerDay,
        avgEventsPerSession = stats.totalEvents / stats.sessions
      }
    })
  })
end)

-- Get action stats
Handlers.add("GetActionStats", "GetActionStats", function(msg)
  local action = msg.Tags.Action or msg.Tags.Event

  if not action then
    msg.reply({ Tags = { Error = "Action-Required" }, Data = "Action name required" })
    return
  end

  if not ActionStats[action] then
    msg.reply({
      Tags = { Error = "Not-Found" },
      Data = json.encode({ error = "Action not found", action = action })
    })
    return
  end

  local stats = ActionStats[action]
  local uniqueCount = 0
  for _ in pairs(stats.uniqueUsers) do uniqueCount = uniqueCount + 1 end

  msg.reply({
    Data = json.encode({
      action = action,
      totalCount = stats.totalCount,
      uniqueUsers = uniqueCount,
      firstSeen = stats.firstSeen,
      lastSeen = stats.lastSeen
    })
  })
end)

-- Get time series data
Handlers.add("GetTimeSeries", "GetTimeSeries", function(msg)
  local metric = msg.Tags.Metric or "events"  -- events, users, action
  local action = msg.Tags.Action
  local hours = tonumber(msg.Tags.Hours) or 24

  local now = os.time()
  local startTime = now - (hours * 3600)
  local series = {}

  for hourKey, data in pairs(HourlyAggregates) do
    if hourKey >= startTime then
      local value = 0

      if metric == "events" then
        value = data.events
      elseif metric == "users" then
        for _ in pairs(data.users) do value = value + 1 end
      elseif metric == "action" and action then
        value = data.actions[action] or 0
      end

      table.insert(series, {
        timestamp = hourKey,
        value = value
      })
    end
  end

  table.sort(series, function(a, b) return a.timestamp < b.timestamp end)

  msg.reply({
    Data = json.encode({
      metric = metric,
      action = action,
      hours = hours,
      series = series
    })
  })
end)

-- Configure alerts
Handlers.add("Alert", "Alert", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can configure alerts" })
    return
  end

  local alertName = msg.Tags.Name
  local alertType = msg.Tags.Type  -- spike, drop, threshold
  local threshold = tonumber(msg.Tags.Threshold)
  local action = msg.Tags.Action  -- Optional: specific action to monitor
  local webhook = msg.Tags.Webhook  -- Notification target

  if not alertName then
    msg.reply({ Tags = { Error = "Name-Required" }, Data = "Alert name required" })
    return
  end

  if msg.Tags.Remove == "true" then
    Alerts[alertName] = nil
    msg.reply({
      Data = json.encode({ action = "alert-removed", name = alertName })
    })
    return
  end

  Alerts[alertName] = {
    name = alertName,
    type = alertType,
    threshold = threshold,
    targetAction = action,
    webhook = webhook,
    createdAt = os.time(),
    triggered = 0
  }

  msg.reply({
    Data = json.encode({
      action = "alert-configured",
      alert = Alerts[alertName]
    })
  })
end)

-- List alerts
Handlers.add("ListAlerts", "ListAlerts", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can list alerts" })
    return
  end

  local alertList = {}
  for name, alert in pairs(Alerts) do
    table.insert(alertList, alert)
  end

  msg.reply({
    Data = json.encode({ alerts = alertList })
  })
end)

-- Cleanup old data
Handlers.add("Cleanup", "Cleanup", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can trigger cleanup" })
    return
  end

  local now = os.time()
  local cutoff = now - (Config.retentionDays * 86400)
  local cleaned = 0

  for hourKey in pairs(Events) do
    if hourKey < cutoff then
      Events[hourKey] = nil
      cleaned = cleaned + 1
    end
  end

  for hourKey in pairs(HourlyAggregates) do
    if hourKey < cutoff then
      HourlyAggregates[hourKey] = nil
    end
  end

  msg.reply({
    Data = json.encode({
      action = "cleanup-complete",
      hoursCleaned = cleaned,
      cutoff = cutoff
    })
  })
end)

-- Export data
Handlers.add("Export", "Export", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can export" })
    return
  end

  msg.reply({
    Data = json.encode({
      counters = Counters,
      userStats = UserStats,
      actionStats = ActionStats,
      alerts = Alerts
    })
  })
end)
