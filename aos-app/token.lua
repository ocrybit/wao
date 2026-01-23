-- Token AOS Application
-- Implements the ao Standard Token Specification
-- Based on: https://github.com/permaweb/aos/blob/main/blueprints/token.lua

local bint = require('.bint')(256)

-- Token Configuration
Name = Name or "Test Token"
Ticker = Ticker or "TEST"
Denomination = Denomination or 12
Logo = Logo or "dFJzkXIQf0JNmJIcHB-aOYaDNuKymIveD2K60jUnTfQ"
TotalSupply = TotalSupply or bint(10000 * 10^Denomination)
Balances = Balances or { [ao.id] = TotalSupply }

-- Utility to check quantity is positive
local function isPositive(n)
  return bint.__lt(0, bint(n))
end

-- Get balance as string
local function getBalance(addr)
  if Balances[addr] then
    return tostring(Balances[addr])
  else
    return "0"
  end
end

-- Info handler - Returns token metadata
Handlers.add("Info", "Info", function(msg)
  msg.reply({
    Name = Name,
    Ticker = Ticker,
    Logo = Logo,
    Denomination = tostring(Denomination),
    ["Total-Supply"] = tostring(TotalSupply),
    Owner = Owner or ao.id,
  })
end)

-- Balance handler - Get balance for an account
Handlers.add("Balance", "Balance", function(msg)
  local target = msg.Tags.Target or msg.Tags.Recipient or msg.From
  local bal = getBalance(target)

  msg.reply({
    Data = bal,
    Balance = bal,
    Target = target,
    Ticker = Ticker,
  })
end)

-- Balances handler - Get all balances
Handlers.add("Balances", "Balances", function(msg)
  local balances = {}
  for addr, amount in pairs(Balances) do
    balances[addr] = tostring(amount)
  end
  msg.reply({ Data = require("json").encode(balances) })
end)

-- Transfer handler - Transfer tokens between accounts
Handlers.add("Transfer", "Transfer", function(msg)
  assert(type(msg.Tags.Recipient) == "string", "Recipient is required!")
  assert(type(msg.Tags.Quantity) == "string", "Quantity is required!")
  assert(isPositive(msg.Tags.Quantity), "Quantity must be positive!")

  local qty = bint(msg.Tags.Quantity)
  local senderBal = Balances[msg.From] or bint(0)

  if bint.__le(qty, senderBal) then
    -- Deduct from sender
    Balances[msg.From] = bint.__sub(senderBal, qty)
    -- Add to recipient
    Balances[msg.Tags.Recipient] = bint.__add(Balances[msg.Tags.Recipient] or bint(0), qty)

    -- Send Debit-Notice to sender
    if not msg.Tags.Cast then
      ao.send({
        Target = msg.From,
        Action = "Debit-Notice",
        Recipient = msg.Tags.Recipient,
        Quantity = msg.Tags.Quantity,
        Data = "You transferred " .. msg.Tags.Quantity .. " to " .. msg.Tags.Recipient,
      })
    end

    -- Send Credit-Notice to recipient
    ao.send({
      Target = msg.Tags.Recipient,
      Action = "Credit-Notice",
      Sender = msg.From,
      Quantity = msg.Tags.Quantity,
      Data = "You received " .. msg.Tags.Quantity .. " from " .. msg.From,
    })

    msg.reply({
      Data = "Transfer successful",
      ["New-Balance"] = getBalance(msg.From),
    })
  else
    msg.reply({
      Data = "Insufficient balance",
      Error = "Insufficient balance",
    })
  end
end)

-- Mint handler - Create new tokens (owner only)
Handlers.add("Mint", "Mint", function(msg)
  assert(msg.From == Owner or msg.From == ao.id, "Only the owner can mint!")
  assert(type(msg.Tags.Quantity) == "string", "Quantity is required!")
  assert(isPositive(msg.Tags.Quantity), "Quantity must be positive!")

  local qty = bint(msg.Tags.Quantity)
  local target = msg.Tags.Recipient or msg.From

  -- Add to recipient
  Balances[target] = bint.__add(Balances[target] or bint(0), qty)
  -- Update total supply
  TotalSupply = bint.__add(TotalSupply, qty)

  msg.reply({
    Data = "Minted " .. msg.Tags.Quantity .. " to " .. target,
    ["New-Balance"] = getBalance(target),
    ["Total-Supply"] = tostring(TotalSupply),
  })
end)

-- Burn handler - Destroy tokens
Handlers.add("Burn", "Burn", function(msg)
  assert(type(msg.Tags.Quantity) == "string", "Quantity is required!")
  assert(isPositive(msg.Tags.Quantity), "Quantity must be positive!")

  local qty = bint(msg.Tags.Quantity)
  local senderBal = Balances[msg.From] or bint(0)

  if bint.__le(qty, senderBal) then
    -- Deduct from sender
    Balances[msg.From] = bint.__sub(senderBal, qty)
    -- Update total supply
    TotalSupply = bint.__sub(TotalSupply, qty)

    msg.reply({
      Data = "Burned " .. msg.Tags.Quantity,
      ["New-Balance"] = getBalance(msg.From),
      ["Total-Supply"] = tostring(TotalSupply),
    })
  else
    msg.reply({
      Data = "Insufficient balance",
      Error = "Insufficient balance",
    })
  end
end)

-- Total-Supply handler
Handlers.add("Total-Supply", "Total-Supply", function(msg)
  msg.reply({
    Data = tostring(TotalSupply),
    ["Total-Supply"] = tostring(TotalSupply),
    Ticker = Ticker,
  })
end)

-- Grant handler - Allow others to transfer on your behalf (allowance)
Allowances = Allowances or {}

Handlers.add("Approve", "Approve", function(msg)
  assert(type(msg.Tags.Spender) == "string", "Spender is required!")
  assert(type(msg.Tags.Quantity) == "string", "Quantity is required!")

  if not Allowances[msg.From] then
    Allowances[msg.From] = {}
  end

  Allowances[msg.From][msg.Tags.Spender] = bint(msg.Tags.Quantity)

  msg.reply({
    Data = "Approved " .. msg.Tags.Quantity .. " for " .. msg.Tags.Spender,
    Spender = msg.Tags.Spender,
    Quantity = msg.Tags.Quantity,
  })
end)

-- Allowance handler - Check allowance
Handlers.add("Allowance", "Allowance", function(msg)
  local owner = msg.Tags.Owner or msg.From
  local spender = msg.Tags.Spender

  assert(spender, "Spender is required!")

  local allowance = "0"
  if Allowances[owner] and Allowances[owner][spender] then
    allowance = tostring(Allowances[owner][spender])
  end

  msg.reply({
    Data = allowance,
    Allowance = allowance,
    Owner = owner,
    Spender = spender,
  })
end)

-- TransferFrom handler - Transfer using allowance
Handlers.add("Transfer-From", "Transfer-From", function(msg)
  assert(type(msg.Tags.From) == "string", "From is required!")
  assert(type(msg.Tags.Recipient) == "string", "Recipient is required!")
  assert(type(msg.Tags.Quantity) == "string", "Quantity is required!")
  assert(isPositive(msg.Tags.Quantity), "Quantity must be positive!")

  local owner = msg.Tags.From
  local spender = msg.From
  local qty = bint(msg.Tags.Quantity)

  -- Check allowance
  local allowance = (Allowances[owner] and Allowances[owner][spender]) or bint(0)
  assert(bint.__le(qty, allowance), "Insufficient allowance!")

  -- Check balance
  local ownerBal = Balances[owner] or bint(0)
  assert(bint.__le(qty, ownerBal), "Insufficient balance!")

  -- Deduct from owner
  Balances[owner] = bint.__sub(ownerBal, qty)
  -- Add to recipient
  Balances[msg.Tags.Recipient] = bint.__add(Balances[msg.Tags.Recipient] or bint(0), qty)
  -- Deduct from allowance
  Allowances[owner][spender] = bint.__sub(allowance, qty)

  msg.reply({
    Data = "Transfer successful",
    ["New-Balance"] = getBalance(owner),
  })
end)
