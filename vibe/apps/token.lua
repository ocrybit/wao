--[[
  Token App
  A standard fungible token with transfers, balances, minting and burning.

  Vibe Prompt: "Create a fungible token called VibeToken (VIBE) with
  12 decimals. Support transfers, balance checks, minting by owner,
  and burning. Track total supply."

  Actions:
  - Info: Get token metadata
  - Balance: Get balance of an address
  - Balances: Get all balances
  - Transfer: Transfer tokens to another address
  - Mint: Mint new tokens (owner only)
  - Burn: Burn tokens from your balance
  - TotalSupply: Get total supply
]]

local json = require("json")

-- Token metadata (use explicit assignment if default Name exists from AOS)
if not TokenName then TokenName = "VibeToken" end
if not TokenTicker then TokenTicker = "VIBE" end
if not TokenDenomination then TokenDenomination = 12 end
if not TokenLogo then TokenLogo = "dR7j3RCy9TXuYRq4OcCy_lZ42eE_5yTcuMQU4hKzWvI" end

-- State
Balances = Balances or {}
TotalSupply = TotalSupply or 0
TokenOwner = TokenOwner or ao.env.Process.Owner

-- Initialize owner balance
if TotalSupply == 0 then
  local initialSupply = 1000000 * (10 ^ TokenDenomination)
  Balances[TokenOwner] = initialSupply
  TotalSupply = initialSupply
end

-- Get token info
Handlers.add("Info", "Info", function(msg)
  msg.reply({
    Data = json.encode({
      Name = TokenName,
      Ticker = TokenTicker,
      Denomination = TokenDenomination,
      Logo = TokenLogo,
      TotalSupply = tostring(TotalSupply),
      Owner = TokenOwner
    })
  })
end)

-- Get balance
Handlers.add("Balance", "Balance", function(msg)
  local target = msg.Tags.Target or msg.Tags.Recipient or msg.From
  local balance = Balances[target] or 0
  msg.reply({
    Tags = {
      Balance = tostring(balance),
      Target = target,
      Ticker = TokenTicker
    },
    Data = json.encode({ balance = tostring(balance), target = target })
  })
end)

-- Get all balances
Handlers.add("Balances", "Balances", function(msg)
  msg.reply({
    Data = json.encode(Balances)
  })
end)

-- Transfer tokens
Handlers.add("Transfer", "Transfer", function(msg)
  local recipient = msg.Tags.Recipient or msg.Tags.Target
  local quantity = tonumber(msg.Tags.Quantity)

  if not recipient then
    msg.reply({ Tags = { Error = "Recipient-Required" }, Data = "Recipient is required" })
    return
  end

  if not quantity or quantity <= 0 then
    msg.reply({ Tags = { Error = "Invalid-Quantity" }, Data = "Valid quantity is required" })
    return
  end

  local senderBalance = Balances[msg.From] or 0

  if senderBalance < quantity then
    msg.reply({
      Tags = { Error = "Insufficient-Balance" },
      Data = json.encode({
        error = "Insufficient balance",
        balance = tostring(senderBalance),
        requested = tostring(quantity)
      })
    })
    return
  end

  -- Execute transfer
  Balances[msg.From] = senderBalance - quantity
  Balances[recipient] = (Balances[recipient] or 0) + quantity

  -- Notify recipient
  ao.send({
    Target = recipient,
    Tags = {
      Action = "Credit-Notice",
      Sender = msg.From,
      Quantity = tostring(quantity),
      Ticker = TokenTicker
    },
    Data = json.encode({
      type = "credit",
      from = msg.From,
      amount = tostring(quantity)
    })
  })

  -- Notify sender
  msg.reply({
    Tags = {
      Action = "Debit-Notice",
      Recipient = recipient,
      Quantity = tostring(quantity),
      Ticker = TokenTicker
    },
    Data = json.encode({
      type = "transfer",
      to = recipient,
      amount = tostring(quantity),
      newBalance = tostring(Balances[msg.From])
    })
  })
end)

-- Mint tokens (owner only)
Handlers.add("Mint", "Mint", function(msg)
  if msg.From ~= TokenOwner then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can mint" })
    return
  end

  local recipient = msg.Tags.Recipient or TokenOwner
  local quantity = tonumber(msg.Tags.Quantity)

  if not quantity or quantity <= 0 then
    msg.reply({ Tags = { Error = "Invalid-Quantity" }, Data = "Valid quantity is required" })
    return
  end

  Balances[recipient] = (Balances[recipient] or 0) + quantity
  TotalSupply = TotalSupply + quantity

  msg.reply({
    Data = json.encode({
      action = "minted",
      recipient = recipient,
      amount = tostring(quantity),
      newSupply = tostring(TotalSupply)
    })
  })
end)

-- Burn tokens
Handlers.add("Burn", "Burn", function(msg)
  local quantity = tonumber(msg.Tags.Quantity)

  if not quantity or quantity <= 0 then
    msg.reply({ Tags = { Error = "Invalid-Quantity" }, Data = "Valid quantity is required" })
    return
  end

  local balance = Balances[msg.From] or 0

  if balance < quantity then
    msg.reply({ Tags = { Error = "Insufficient-Balance" }, Data = "Insufficient balance to burn" })
    return
  end

  Balances[msg.From] = balance - quantity
  TotalSupply = TotalSupply - quantity

  msg.reply({
    Data = json.encode({
      action = "burned",
      amount = tostring(quantity),
      newBalance = tostring(Balances[msg.From]),
      newSupply = tostring(TotalSupply)
    })
  })
end)

-- Get total supply
Handlers.add("TotalSupply", "TotalSupply", function(msg)
  msg.reply({
    Tags = { TotalSupply = tostring(TotalSupply) },
    Data = json.encode({ totalSupply = tostring(TotalSupply) })
  })
end)
