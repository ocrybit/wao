--[[
  Escrow App
  A secure escrow service for peer-to-peer trades with multi-sig release.

  Vibe Prompt: "Build an escrow service where a buyer and seller can
  trade safely. The buyer deposits funds, seller delivers, and funds
  release on confirmation. Support disputes with arbiter resolution."

  Actions:
  - Create: Create new escrow
  - Fund: Deposit funds into escrow
  - Deliver: Mark as delivered (seller)
  - Confirm: Confirm delivery and release funds (buyer)
  - Dispute: Open a dispute
  - Resolve: Resolve dispute (arbiter)
  - Cancel: Cancel escrow (before funded)
  - GetEscrow: Get escrow details
  - MyEscrows: List my escrows
]]

local json = require("json")

-- Configuration
Config = Config or {
  escrowFee = 1,              -- 1% fee
  disputePeriod = 86400 * 3,  -- 3 days to dispute after delivery
  autoRelease = 86400 * 7,    -- 7 days auto-release if no dispute
  minAmount = 100
}

-- State
Escrows = Escrows or {}      -- { escrowId: { ... } }
EscrowCounter = EscrowCounter or 0
Balances = Balances or {}    -- User balances
Treasury = Treasury or 0     -- Platform fees

-- Escrow statuses
local STATUS = {
  CREATED = "created",
  FUNDED = "funded",
  DELIVERED = "delivered",
  DISPUTED = "disputed",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  REFUNDED = "refunded"
}

-- Create escrow
Handlers.add("Create", "Create", function(msg)
  local seller = msg.Tags.Seller
  local amount = tonumber(msg.Tags.Amount)
  local description = msg.Data or msg.Tags.Description
  local arbiter = msg.Tags.Arbiter  -- Optional arbiter for disputes

  if not seller then
    msg.reply({ Tags = { Error = "Seller-Required" }, Data = "Seller address is required" })
    return
  end

  if not amount or amount < Config.minAmount then
    msg.reply({
      Tags = { Error = "Invalid-Amount" },
      Data = "Minimum amount is " .. Config.minAmount
    })
    return
  end

  if seller == msg.From then
    msg.reply({ Tags = { Error = "Self-Trade" }, Data = "Cannot create escrow with yourself" })
    return
  end

  EscrowCounter = EscrowCounter + 1
  local id = tostring(EscrowCounter)

  local fee = math.floor(amount * Config.escrowFee / 100)

  Escrows[id] = {
    id = id,
    buyer = msg.From,
    seller = seller,
    arbiter = arbiter,
    amount = amount,
    fee = fee,
    description = description,
    status = STATUS.CREATED,
    createdAt = os.time(),
    fundedAt = nil,
    deliveredAt = nil,
    completedAt = nil,
    disputeReason = nil,
    resolution = nil
  }

  -- Notify seller
  ao.send({
    Target = seller,
    Tags = { Action = "Escrow-Created", EscrowId = id },
    Data = json.encode({
      escrowId = id,
      buyer = msg.From,
      amount = amount,
      description = description
    })
  })

  msg.reply({
    Data = json.encode({
      action = "created",
      escrow = Escrows[id]
    })
  })
end)

-- Fund escrow
Handlers.add("Fund", "Fund", function(msg)
  local id = msg.Tags.EscrowId or msg.Tags.Id

  if not id or not Escrows[id] then
    msg.reply({ Tags = { Error = "Invalid-Escrow" }, Data = "Escrow not found" })
    return
  end

  local escrow = Escrows[id]

  if escrow.buyer ~= msg.From then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only buyer can fund" })
    return
  end

  if escrow.status ~= STATUS.CREATED then
    msg.reply({ Tags = { Error = "Invalid-Status" }, Data = "Escrow already funded" })
    return
  end

  local total = escrow.amount + escrow.fee
  local balance = Balances[msg.From] or 0

  if balance < total then
    msg.reply({
      Tags = { Error = "Insufficient-Balance" },
      Data = json.encode({ need = total, have = balance })
    })
    return
  end

  -- Lock funds
  Balances[msg.From] = balance - total
  escrow.status = STATUS.FUNDED
  escrow.fundedAt = os.time()

  -- Notify seller
  ao.send({
    Target = escrow.seller,
    Tags = { Action = "Escrow-Funded", EscrowId = id },
    Data = json.encode({
      escrowId = id,
      amount = escrow.amount
    })
  })

  msg.reply({
    Data = json.encode({
      action = "funded",
      escrowId = id,
      amount = total
    })
  })
end)

-- Mark as delivered
Handlers.add("Deliver", "Deliver", function(msg)
  local id = msg.Tags.EscrowId or msg.Tags.Id
  local trackingInfo = msg.Data or msg.Tags.TrackingInfo

  if not id or not Escrows[id] then
    msg.reply({ Tags = { Error = "Invalid-Escrow" }, Data = "Escrow not found" })
    return
  end

  local escrow = Escrows[id]

  if escrow.seller ~= msg.From then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only seller can mark delivered" })
    return
  end

  if escrow.status ~= STATUS.FUNDED then
    msg.reply({ Tags = { Error = "Invalid-Status" }, Data = "Escrow must be funded first" })
    return
  end

  escrow.status = STATUS.DELIVERED
  escrow.deliveredAt = os.time()
  escrow.trackingInfo = trackingInfo

  -- Notify buyer
  ao.send({
    Target = escrow.buyer,
    Tags = { Action = "Escrow-Delivered", EscrowId = id },
    Data = json.encode({
      escrowId = id,
      trackingInfo = trackingInfo,
      confirmBy = escrow.deliveredAt + Config.autoRelease
    })
  })

  msg.reply({
    Data = json.encode({
      action = "delivered",
      escrowId = id,
      autoReleaseAt = escrow.deliveredAt + Config.autoRelease
    })
  })
end)

-- Confirm delivery and release funds
Handlers.add("Confirm", "Confirm", function(msg)
  local id = msg.Tags.EscrowId or msg.Tags.Id

  if not id or not Escrows[id] then
    msg.reply({ Tags = { Error = "Invalid-Escrow" }, Data = "Escrow not found" })
    return
  end

  local escrow = Escrows[id]
  local now = os.time()

  -- Allow buyer to confirm, or auto-release after period
  local canAutoRelease = escrow.status == STATUS.DELIVERED and
    (now - escrow.deliveredAt) > Config.autoRelease

  if escrow.buyer ~= msg.From and not canAutoRelease then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only buyer can confirm" })
    return
  end

  if escrow.status ~= STATUS.DELIVERED then
    msg.reply({ Tags = { Error = "Invalid-Status" }, Data = "Must be in delivered status" })
    return
  end

  -- Release funds to seller
  Balances[escrow.seller] = (Balances[escrow.seller] or 0) + escrow.amount

  -- Fee to treasury
  Treasury = Treasury + escrow.fee

  escrow.status = STATUS.COMPLETED
  escrow.completedAt = now
  escrow.releasedBy = canAutoRelease and "auto" or msg.From

  -- Notify parties
  ao.send({
    Target = escrow.seller,
    Tags = { Action = "Escrow-Completed", EscrowId = id },
    Data = json.encode({
      escrowId = id,
      amount = escrow.amount
    })
  })

  msg.reply({
    Data = json.encode({
      action = "completed",
      escrowId = id,
      releasedTo = escrow.seller,
      amount = escrow.amount
    })
  })
end)

-- Open dispute
Handlers.add("Dispute", "Dispute", function(msg)
  local id = msg.Tags.EscrowId or msg.Tags.Id
  local reason = msg.Data or msg.Tags.Reason

  if not id or not Escrows[id] then
    msg.reply({ Tags = { Error = "Invalid-Escrow" }, Data = "Escrow not found" })
    return
  end

  local escrow = Escrows[id]

  if escrow.buyer ~= msg.From and escrow.seller ~= msg.From then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only buyer or seller can dispute" })
    return
  end

  if escrow.status ~= STATUS.FUNDED and escrow.status ~= STATUS.DELIVERED then
    msg.reply({ Tags = { Error = "Invalid-Status" }, Data = "Cannot dispute in current status" })
    return
  end

  if not reason then
    msg.reply({ Tags = { Error = "Reason-Required" }, Data = "Dispute reason is required" })
    return
  end

  escrow.status = STATUS.DISPUTED
  escrow.disputedAt = os.time()
  escrow.disputedBy = msg.From
  escrow.disputeReason = reason

  -- Notify parties
  local notifyTarget = escrow.buyer == msg.From and escrow.seller or escrow.buyer

  ao.send({
    Target = notifyTarget,
    Tags = { Action = "Escrow-Disputed", EscrowId = id },
    Data = json.encode({
      escrowId = id,
      disputedBy = msg.From,
      reason = reason
    })
  })

  -- Notify arbiter if exists
  if escrow.arbiter then
    ao.send({
      Target = escrow.arbiter,
      Tags = { Action = "Escrow-Dispute-Opened", EscrowId = id },
      Data = json.encode({
        escrow = escrow
      })
    })
  end

  msg.reply({
    Data = json.encode({
      action = "disputed",
      escrowId = id
    })
  })
end)

-- Resolve dispute (arbiter only)
Handlers.add("Resolve", "Resolve", function(msg)
  local id = msg.Tags.EscrowId or msg.Tags.Id
  local winner = msg.Tags.Winner  -- "buyer" or "seller"
  local buyerPercent = tonumber(msg.Tags.BuyerPercent)  -- Optional split

  if not id or not Escrows[id] then
    msg.reply({ Tags = { Error = "Invalid-Escrow" }, Data = "Escrow not found" })
    return
  end

  local escrow = Escrows[id]

  if escrow.arbiter ~= msg.From then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only arbiter can resolve" })
    return
  end

  if escrow.status ~= STATUS.DISPUTED then
    msg.reply({ Tags = { Error = "Invalid-Status" }, Data = "Escrow not in dispute" })
    return
  end

  local buyerAmount = 0
  local sellerAmount = 0

  if buyerPercent then
    -- Split resolution
    buyerAmount = math.floor(escrow.amount * buyerPercent / 100)
    sellerAmount = escrow.amount - buyerAmount
  elseif winner == "buyer" then
    buyerAmount = escrow.amount
  elseif winner == "seller" then
    sellerAmount = escrow.amount
  else
    msg.reply({ Tags = { Error = "Invalid-Resolution" }, Data = "Must specify winner or split" })
    return
  end

  -- Distribute funds
  if buyerAmount > 0 then
    Balances[escrow.buyer] = (Balances[escrow.buyer] or 0) + buyerAmount
  end
  if sellerAmount > 0 then
    Balances[escrow.seller] = (Balances[escrow.seller] or 0) + sellerAmount
  end

  -- Fee to treasury
  Treasury = Treasury + escrow.fee

  escrow.status = STATUS.COMPLETED
  escrow.completedAt = os.time()
  escrow.resolution = {
    resolvedBy = msg.From,
    buyerAmount = buyerAmount,
    sellerAmount = sellerAmount,
    notes = msg.Data
  }

  -- Notify parties
  ao.send({
    Target = escrow.buyer,
    Tags = { Action = "Escrow-Resolved", EscrowId = id },
    Data = json.encode({ yourAmount = buyerAmount })
  })

  ao.send({
    Target = escrow.seller,
    Tags = { Action = "Escrow-Resolved", EscrowId = id },
    Data = json.encode({ yourAmount = sellerAmount })
  })

  msg.reply({
    Data = json.encode({
      action = "resolved",
      escrowId = id,
      buyerAmount = buyerAmount,
      sellerAmount = sellerAmount
    })
  })
end)

-- Cancel escrow (before funded)
Handlers.add("Cancel", "Cancel", function(msg)
  local id = msg.Tags.EscrowId or msg.Tags.Id

  if not id or not Escrows[id] then
    msg.reply({ Tags = { Error = "Invalid-Escrow" }, Data = "Escrow not found" })
    return
  end

  local escrow = Escrows[id]

  if escrow.buyer ~= msg.From then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only buyer can cancel" })
    return
  end

  if escrow.status ~= STATUS.CREATED then
    msg.reply({ Tags = { Error = "Invalid-Status" }, Data = "Can only cancel before funding" })
    return
  end

  escrow.status = STATUS.CANCELLED
  escrow.cancelledAt = os.time()

  -- Notify seller
  ao.send({
    Target = escrow.seller,
    Tags = { Action = "Escrow-Cancelled", EscrowId = id },
    Data = json.encode({ escrowId = id })
  })

  msg.reply({
    Data = json.encode({
      action = "cancelled",
      escrowId = id
    })
  })
end)

-- Get escrow details
Handlers.add("GetEscrow", "GetEscrow", function(msg)
  local id = msg.Tags.EscrowId or msg.Tags.Id

  if not id or not Escrows[id] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Escrow not found" })
    return
  end

  local escrow = Escrows[id]

  -- Only parties can view
  if msg.From ~= escrow.buyer and msg.From ~= escrow.seller and msg.From ~= escrow.arbiter then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Not a party to this escrow" })
    return
  end

  msg.reply({
    Data = json.encode({ escrow = escrow })
  })
end)

-- List my escrows
Handlers.add("MyEscrows", "MyEscrows", function(msg)
  local role = msg.Tags.Role  -- buyer, seller, arbiter, or all
  local status = msg.Tags.Status

  local result = {}

  for id, escrow in pairs(Escrows) do
    local include = false

    if not role or role == "all" then
      include = escrow.buyer == msg.From or escrow.seller == msg.From or escrow.arbiter == msg.From
    elseif role == "buyer" then
      include = escrow.buyer == msg.From
    elseif role == "seller" then
      include = escrow.seller == msg.From
    elseif role == "arbiter" then
      include = escrow.arbiter == msg.From
    end

    if include and (not status or escrow.status == status) then
      table.insert(result, {
        id = escrow.id,
        buyer = escrow.buyer,
        seller = escrow.seller,
        amount = escrow.amount,
        status = escrow.status,
        createdAt = escrow.createdAt
      })
    end
  end

  -- Sort by creation time (newest first)
  table.sort(result, function(a, b)
    return a.createdAt > b.createdAt
  end)

  msg.reply({
    Data = json.encode({
      escrows = result,
      count = #result
    })
  })
end)

-- Deposit (for testing)
Handlers.add("Deposit", "Deposit", function(msg)
  local amount = tonumber(msg.Tags.Amount) or 10000
  Balances[msg.From] = (Balances[msg.From] or 0) + amount

  msg.reply({
    Data = json.encode({
      action = "deposited",
      amount = amount,
      balance = Balances[msg.From]
    })
  })
end)

-- Balance
Handlers.add("Balance", "Balance", function(msg)
  msg.reply({
    Data = json.encode({ balance = Balances[msg.From] or 0 })
  })
end)
