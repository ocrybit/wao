-- Counter - Simple stateful counter
-- Created: 2026-01-22
-- Environment: Mainnet WASM (aos2_0_6)

local json = require("json")

-- State
Count = Count or 0

-- Handlers
Handlers.add("Info", "Info", function(msg)
  msg.reply({ Data = json.encode({ name = "counter", version = "1.0", count = Count }) })
end)

Handlers.add("Inc", "Inc", function(msg)
  local amount = tonumber(msg.Tags.Amount) or 1
  Count = Count + amount
  msg.reply({ Data = json.encode({ count = Count }) })
end)

Handlers.add("Dec", "Dec", function(msg)
  local amount = tonumber(msg.Tags.Amount) or 1
  Count = Count - amount
  msg.reply({ Data = json.encode({ count = Count }) })
end)

Handlers.add("Get", "Get", function(msg)
  msg.reply({ Data = json.encode({ count = Count }) })
end)

Handlers.add("Reset", "Reset", function(msg)
  Count = 0
  msg.reply({ Data = json.encode({ count = Count }) })
end)
