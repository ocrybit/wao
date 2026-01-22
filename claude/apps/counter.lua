--[[
  Counter App
  A simple counter demonstrating basic state management in AO.

  Vibe Prompt: "Build me a simple counter that can increment, decrement,
  and reset. Track who made each change."

  Actions:
  - Inc: Increment counter by 1 (or by Amount tag)
  - Dec: Decrement counter by 1 (or by Amount tag)
  - Reset: Reset counter to 0
  - Get: Get current counter value
  - History: Get last 10 changes
]]

local json = require("json")

-- State
Count = Count or 0
History = History or {}

-- Helper to add history entry
local function addHistory(action, by, amount, newValue)
  table.insert(History, 1, {
    action = action,
    by = by,
    amount = amount,
    value = newValue,
    timestamp = os.time()
  })
  -- Keep only last 100 entries
  while #History > 100 do
    table.remove(History)
  end
end

-- Increment counter
Handlers.add("Inc", "Inc", function(msg)
  local amount = tonumber(msg.Tags.Amount) or 1
  Count = Count + amount
  addHistory("Inc", msg.From, amount, Count)
  msg.reply({
    Data = json.encode({ count = Count, action = "incremented", by = amount })
  })
end)

-- Decrement counter
Handlers.add("Dec", "Dec", function(msg)
  local amount = tonumber(msg.Tags.Amount) or 1
  Count = Count - amount
  addHistory("Dec", msg.From, amount, Count)
  msg.reply({
    Data = json.encode({ count = Count, action = "decremented", by = amount })
  })
end)

-- Reset counter
Handlers.add("Reset", "Reset", function(msg)
  local oldValue = Count
  Count = 0
  addHistory("Reset", msg.From, oldValue, 0)
  msg.reply({
    Data = json.encode({ count = Count, action = "reset", previousValue = oldValue })
  })
end)

-- Get current count
Handlers.add("Get", "Get", function(msg)
  msg.reply({
    Data = json.encode({ count = Count })
  })
end)

-- Get history
Handlers.add("History", "History", function(msg)
  local limit = tonumber(msg.Tags.Limit) or 10
  local result = {}
  for i = 1, math.min(limit, #History) do
    table.insert(result, History[i])
  end
  msg.reply({
    Data = json.encode({ history = result, total = #History })
  })
end)
