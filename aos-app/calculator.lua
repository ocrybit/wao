-- Calculator AOS Application (Mainnet WASM)
-- A feature-rich calculator demonstrating mainnet device-stack
-- Uses: wasi@1.0, json-iface@1.0, wasm-64@1.0, patch@1.0, multipass@1.0

local memory = 0
local history = {}

-- Helper to format numbers without trailing .0 for integers
local function formatNum(n)
  if n == math.floor(n) then
    return string.format("%d", n)
  else
    return tostring(n)
  end
end

-- Store result in memory
Handlers.add("Store", "Store", function(msg)
  local value = tonumber(msg.Value) or tonumber(msg.Tags.Value) or 0
  memory = value
  msg.reply({
    Data = formatNum(memory),
    Memory = formatNum(memory),
    Action = "Stored"
  })
end)

-- Recall from memory
Handlers.add("Recall", "Recall", function(msg)
  msg.reply({
    Data = formatNum(memory),
    Memory = formatNum(memory),
    Action = "Recalled"
  })
end)

-- Clear memory
Handlers.add("ClearMemory", "ClearMemory", function(msg)
  memory = 0
  msg.reply({
    Data = "0",
    Memory = "0",
    Action = "MemoryCleared"
  })
end)

-- Add two numbers
Handlers.add("Add", "Add", function(msg)
  local a = tonumber(msg.A) or tonumber(msg.Tags.A) or 0
  local b = tonumber(msg.B) or tonumber(msg.Tags.B) or 0
  local result = a + b
  table.insert(history, { op = "Add", a = a, b = b, result = result })
  msg.reply({
    Data = formatNum(result),
    Result = formatNum(result),
    Operation = "Add",
    A = formatNum(a),
    B = formatNum(b)
  })
end)

-- Subtract two numbers
Handlers.add("Subtract", "Subtract", function(msg)
  local a = tonumber(msg.A) or tonumber(msg.Tags.A) or 0
  local b = tonumber(msg.B) or tonumber(msg.Tags.B) or 0
  local result = a - b
  table.insert(history, { op = "Subtract", a = a, b = b, result = result })
  msg.reply({
    Data = formatNum(result),
    Result = formatNum(result),
    Operation = "Subtract",
    A = formatNum(a),
    B = formatNum(b)
  })
end)

-- Multiply two numbers
Handlers.add("Multiply", "Multiply", function(msg)
  local a = tonumber(msg.A) or tonumber(msg.Tags.A) or 0
  local b = tonumber(msg.B) or tonumber(msg.Tags.B) or 0
  local result = a * b
  table.insert(history, { op = "Multiply", a = a, b = b, result = result })
  msg.reply({
    Data = formatNum(result),
    Result = formatNum(result),
    Operation = "Multiply",
    A = formatNum(a),
    B = formatNum(b)
  })
end)

-- Divide two numbers
Handlers.add("Divide", "Divide", function(msg)
  local a = tonumber(msg.A) or tonumber(msg.Tags.A) or 0
  local b = tonumber(msg.B) or tonumber(msg.Tags.B) or 1
  if b == 0 then
    msg.reply({
      Data = "Error: Division by zero",
      Error = "DivisionByZero"
    })
    return
  end
  local result = a / b
  table.insert(history, { op = "Divide", a = a, b = b, result = result })
  msg.reply({
    Data = formatNum(result),
    Result = formatNum(result),
    Operation = "Divide",
    A = formatNum(a),
    B = formatNum(b)
  })
end)

-- Power function
Handlers.add("Power", "Power", function(msg)
  local base = tonumber(msg.Base) or tonumber(msg.Tags.Base) or 0
  local exp = tonumber(msg.Exponent) or tonumber(msg.Tags.Exponent) or 1
  local result = base ^ exp
  table.insert(history, { op = "Power", base = base, exp = exp, result = result })
  msg.reply({
    Data = formatNum(result),
    Result = formatNum(result),
    Operation = "Power",
    Base = formatNum(base),
    Exponent = formatNum(exp)
  })
end)

-- Square root
Handlers.add("Sqrt", "Sqrt", function(msg)
  local value = tonumber(msg.Value) or tonumber(msg.Tags.Value) or 0
  if value < 0 then
    msg.reply({
      Data = "Error: Cannot compute square root of negative number",
      Error = "NegativeValue"
    })
    return
  end
  local result = math.sqrt(value)
  table.insert(history, { op = "Sqrt", value = value, result = result })
  msg.reply({
    Data = formatNum(result),
    Result = formatNum(result),
    Operation = "Sqrt",
    Value = formatNum(value)
  })
end)

-- Modulo operation
Handlers.add("Mod", "Mod", function(msg)
  local a = tonumber(msg.A) or tonumber(msg.Tags.A) or 0
  local b = tonumber(msg.B) or tonumber(msg.Tags.B) or 1
  if b == 0 then
    msg.reply({
      Data = "Error: Modulo by zero",
      Error = "ModuloByZero"
    })
    return
  end
  local result = a % b
  table.insert(history, { op = "Mod", a = a, b = b, result = result })
  msg.reply({
    Data = formatNum(result),
    Result = formatNum(result),
    Operation = "Mod",
    A = formatNum(a),
    B = formatNum(b)
  })
end)

-- Get history count
Handlers.add("HistoryCount", "HistoryCount", function(msg)
  msg.reply({
    Data = tostring(#history),
    Count = tostring(#history)
  })
end)

-- Clear history
Handlers.add("ClearHistory", "ClearHistory", function(msg)
  history = {}
  msg.reply({
    Data = "History cleared",
    Count = "0"
  })
end)

-- Info handler
Handlers.add("Info", "Info", function(msg)
  msg.reply({
    Data = "Calculator App v1.0 - Mainnet WASM",
    Name = "Calculator",
    Version = "1.0",
    AppType = "Mainnet-WASM",
    Memory = formatNum(memory),
    HistoryCount = tostring(#history),
    ["Device-Stack"] = "wasi@1.0,json-iface@1.0,wasm-64@1.0,patch@1.0,multipass@1.0"
  })
end)
