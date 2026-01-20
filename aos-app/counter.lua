-- Counter AOS Application
-- A simple counter that demonstrates basic AO message handling

local count = 0

-- Get current count
Handlers.add("Get", "Get", function(msg)
  msg.reply({ Data = tostring(count), Count = tostring(count) })
end)

-- Increment count by 1
Handlers.add("Inc", "Inc", function(msg)
  count = count + 1
  msg.reply({ Data = tostring(count), Count = tostring(count) })
end)

-- Decrement count by 1
Handlers.add("Dec", "Dec", function(msg)
  count = count - 1
  msg.reply({ Data = tostring(count), Count = tostring(count) })
end)

-- Add a custom amount
Handlers.add("Add", "Add", function(msg)
  local amount = tonumber(msg.Amount) or tonumber(msg.Tags.Amount) or 0
  count = count + amount
  msg.reply({ Data = tostring(count), Count = tostring(count), Added = tostring(amount) })
end)

-- Reset count to 0
Handlers.add("Reset", "Reset", function(msg)
  count = 0
  msg.reply({ Data = "0", Count = "0" })
end)

-- Info handler
Handlers.add("Info", "Info", function(msg)
  msg.reply({
    Data = "Counter App v1.0",
    Name = "Counter",
    Version = "1.0",
    Count = tostring(count)
  })
end)
