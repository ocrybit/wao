--[[
  Rate Limiter Device
  A middleware device that limits message frequency per address.

  Vibe Prompt: "Create a device that rate limits incoming messages.
  Allow X messages per time window, with configurable limits per action
  and support for whitelisted addresses."

  This device wraps another process and filters messages before they reach it.

  Actions:
  - Configure: Set rate limit configuration
  - Whitelist: Add address to whitelist
  - Blacklist: Add address to blacklist
  - GetLimits: Get current limits
  - GetStats: Get rate limit statistics
  - Reset: Reset counters for an address
]]

local json = require("json")

-- Configuration
Config = Config or {
  defaultLimit = 10,          -- Messages per window
  defaultWindow = 60,         -- Window in seconds
  burstAllowed = 3,          -- Extra burst messages
  cooldownMultiplier = 2,     -- Cooldown multiplier after limit hit
  actionLimits = {}           -- Per-action limits
}

-- State
RateLimits = RateLimits or {}    -- { address: { count, windowStart, inCooldown } }
Whitelist = Whitelist or {}      -- { address: true }
Blacklist = Blacklist or {}      -- { address: true }
Stats = Stats or {
  totalBlocked = 0,
  totalAllowed = 0,
  uniqueAddresses = 0
}

-- Owner (can configure)
Owner = Owner or ao.env.Process.Owner

-- Helper: Get limit for action
local function getLimit(action)
  if Config.actionLimits[action] then
    return Config.actionLimits[action].limit, Config.actionLimits[action].window
  end
  return Config.defaultLimit, Config.defaultWindow
end

-- Helper: Check if address is rate limited
local function checkRateLimit(addr, action)
  -- Whitelisted addresses bypass limits
  if Whitelist[addr] then
    return true, "whitelisted"
  end

  -- Blacklisted addresses always blocked
  if Blacklist[addr] then
    return false, "blacklisted"
  end

  local now = os.time()
  local limit, window = getLimit(action)

  -- Initialize tracking
  if not RateLimits[addr] then
    RateLimits[addr] = {
      count = 0,
      windowStart = now,
      inCooldown = false,
      cooldownEnd = 0,
      totalMessages = 0,
      totalBlocked = 0
    }
    Stats.uniqueAddresses = Stats.uniqueAddresses + 1
  end

  local tracker = RateLimits[addr]

  -- Check if in cooldown
  if tracker.inCooldown and now < tracker.cooldownEnd then
    tracker.totalBlocked = tracker.totalBlocked + 1
    Stats.totalBlocked = Stats.totalBlocked + 1
    return false, "cooldown", tracker.cooldownEnd - now
  end

  -- Reset cooldown if expired
  if tracker.inCooldown and now >= tracker.cooldownEnd then
    tracker.inCooldown = false
    tracker.count = 0
    tracker.windowStart = now
  end

  -- Reset window if expired
  if now - tracker.windowStart > window then
    tracker.count = 0
    tracker.windowStart = now
  end

  -- Check limit
  local maxAllowed = limit + Config.burstAllowed
  if tracker.count >= maxAllowed then
    -- Enter cooldown
    tracker.inCooldown = true
    tracker.cooldownEnd = now + (window * Config.cooldownMultiplier)
    tracker.totalBlocked = tracker.totalBlocked + 1
    Stats.totalBlocked = Stats.totalBlocked + 1
    return false, "rate_limited", tracker.cooldownEnd - now
  end

  -- Allow message
  tracker.count = tracker.count + 1
  tracker.totalMessages = tracker.totalMessages + 1
  Stats.totalAllowed = Stats.totalAllowed + 1

  -- Warn if approaching limit
  local remaining = maxAllowed - tracker.count
  local warning = remaining <= Config.burstAllowed and remaining or nil

  return true, "allowed", remaining, warning
end

-- Main message handler - wraps all incoming messages
Handlers.add("RateLimitCheck", function(msg)
  -- Always allow internal/system messages
  return msg.From ~= ao.id and msg.Action ~= nil
end, function(msg)
  local action = msg.Action or msg.Tags.Action or "default"
  local allowed, reason, extra, warning = checkRateLimit(msg.From, action)

  if not allowed then
    msg.reply({
      Tags = {
        Error = "Rate-Limited",
        Reason = reason,
        RetryAfter = tostring(extra or 0)
      },
      Data = json.encode({
        error = "Rate limited",
        reason = reason,
        retryAfter = extra
      })
    })
    return  -- Stop processing
  end

  -- Add rate limit headers to response
  if warning then
    msg.reply({
      Tags = {
        ["X-RateLimit-Warning"] = "true",
        ["X-RateLimit-Remaining"] = tostring(extra)
      }
    })
  end

  -- Message passes through - would forward to wrapped process
  -- In a real device, this would call the next handler
end)

-- Configure rate limits (owner only)
Handlers.add("Configure", "Configure", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can configure" })
    return
  end

  if msg.Tags.DefaultLimit then
    Config.defaultLimit = tonumber(msg.Tags.DefaultLimit)
  end

  if msg.Tags.DefaultWindow then
    Config.defaultWindow = tonumber(msg.Tags.DefaultWindow)
  end

  if msg.Tags.BurstAllowed then
    Config.burstAllowed = tonumber(msg.Tags.BurstAllowed)
  end

  if msg.Tags.CooldownMultiplier then
    Config.cooldownMultiplier = tonumber(msg.Tags.CooldownMultiplier)
  end

  -- Set action-specific limit
  if msg.Tags.Action and msg.Tags.Limit then
    Config.actionLimits[msg.Tags.Action] = {
      limit = tonumber(msg.Tags.Limit),
      window = tonumber(msg.Tags.Window) or Config.defaultWindow
    }
  end

  msg.reply({
    Data = json.encode({
      action = "configured",
      config = Config
    })
  })
end)

-- Add to whitelist (owner only)
Handlers.add("Whitelist", "Whitelist", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can whitelist" })
    return
  end

  local addr = msg.Tags.Address
  local remove = msg.Tags.Remove == "true"

  if not addr then
    msg.reply({ Tags = { Error = "Address-Required" }, Data = "Address is required" })
    return
  end

  if remove then
    Whitelist[addr] = nil
  else
    Whitelist[addr] = true
    Blacklist[addr] = nil  -- Remove from blacklist if present
  end

  msg.reply({
    Data = json.encode({
      action = remove and "removed-from-whitelist" or "whitelisted",
      address = addr
    })
  })
end)

-- Add to blacklist (owner only)
Handlers.add("Blacklist", "Blacklist", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can blacklist" })
    return
  end

  local addr = msg.Tags.Address
  local remove = msg.Tags.Remove == "true"

  if not addr then
    msg.reply({ Tags = { Error = "Address-Required" }, Data = "Address is required" })
    return
  end

  if remove then
    Blacklist[addr] = nil
  else
    Blacklist[addr] = true
    Whitelist[addr] = nil  -- Remove from whitelist if present
  end

  msg.reply({
    Data = json.encode({
      action = remove and "removed-from-blacklist" or "blacklisted",
      address = addr
    })
  })
end)

-- Get current limits
Handlers.add("GetLimits", "GetLimits", function(msg)
  local addr = msg.Tags.Address or msg.From
  local tracker = RateLimits[addr]
  local limit, window = getLimit("default")

  local response = {
    config = {
      limit = limit,
      window = window,
      burst = Config.burstAllowed
    },
    whitelisted = Whitelist[addr] or false,
    blacklisted = Blacklist[addr] or false
  }

  if tracker then
    local now = os.time()
    response.current = {
      count = tracker.count,
      remaining = (limit + Config.burstAllowed) - tracker.count,
      windowResets = tracker.windowStart + window - now,
      inCooldown = tracker.inCooldown,
      cooldownEnds = tracker.inCooldown and tracker.cooldownEnd - now or 0
    }
  end

  msg.reply({
    Data = json.encode(response)
  })
end)

-- Get statistics
Handlers.add("GetStats", "GetStats", function(msg)
  local detailed = msg.Tags.Detailed == "true"

  local response = {
    global = Stats,
    config = Config
  }

  if detailed and msg.From == Owner then
    response.whitelist = {}
    response.blacklist = {}
    response.topLimited = {}

    for addr in pairs(Whitelist) do
      table.insert(response.whitelist, addr)
    end

    for addr in pairs(Blacklist) do
      table.insert(response.blacklist, addr)
    end

    -- Get top rate-limited addresses
    local limited = {}
    for addr, tracker in pairs(RateLimits) do
      if tracker.totalBlocked > 0 then
        table.insert(limited, { address = addr, blocked = tracker.totalBlocked })
      end
    end
    table.sort(limited, function(a, b) return a.blocked > b.blocked end)
    for i = 1, math.min(10, #limited) do
      table.insert(response.topLimited, limited[i])
    end
  end

  msg.reply({
    Data = json.encode(response)
  })
end)

-- Reset counters for an address (owner only)
Handlers.add("Reset", "Reset", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can reset" })
    return
  end

  local addr = msg.Tags.Address

  if addr then
    RateLimits[addr] = nil
    msg.reply({
      Data = json.encode({ action = "reset", address = addr })
    })
  else
    -- Reset all
    RateLimits = {}
    Stats = { totalBlocked = 0, totalAllowed = 0, uniqueAddresses = 0 }
    msg.reply({
      Data = json.encode({ action = "reset-all" })
    })
  end
end)
