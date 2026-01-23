--[[
  Auction House App
  A decentralized auction platform with bidding, escrow, and automatic settlement.

  Vibe Prompt: "Create an auction house where users can list items,
  place bids with automatic escrow, and have auctions settle automatically.
  Support both English (ascending) and Dutch (descending) auctions."

  Actions:
  - CreateAuction: List an item for auction
  - Bid: Place a bid
  - CancelAuction: Cancel (before first bid)
  - Settle: Settle ended auction
  - GetAuction: Get auction details
  - ListAuctions: List all auctions
  - MyBids: Get my active bids
  - Withdraw: Withdraw outbid funds
]]

local json = require("json")

-- State
Auctions = Auctions or {}
AuctionCounter = AuctionCounter or 0
Balances = Balances or {}      -- User balances (deposited funds)
Escrow = Escrow or {}          -- Locked bids { auctionId: { bidder: amount } }

-- Auction types
local TYPES = {
  english = "english",   -- Ascending price
  dutch = "dutch"        -- Descending price
}

-- Create an auction
Handlers.add("CreateAuction", "CreateAuction", function(msg)
  local title = msg.Tags.Title
  local description = msg.Data or msg.Tags.Description
  local startPrice = tonumber(msg.Tags.StartPrice) or 0
  local reservePrice = tonumber(msg.Tags.ReservePrice) or startPrice
  local duration = tonumber(msg.Tags.Duration) or 86400  -- Default 24 hours
  local auctionType = msg.Tags.Type or "english"
  local endPrice = tonumber(msg.Tags.EndPrice)  -- For Dutch auctions
  local itemId = msg.Tags.ItemId  -- Reference to NFT/item being sold

  if not title then
    msg.reply({ Tags = { Error = "Title-Required" }, Data = "Title is required" })
    return
  end

  if auctionType == "dutch" and not endPrice then
    msg.reply({ Tags = { Error = "EndPrice-Required" }, Data = "Dutch auctions require EndPrice" })
    return
  end

  AuctionCounter = AuctionCounter + 1
  local id = tostring(AuctionCounter)

  local now = os.time()
  Auctions[id] = {
    id = id,
    seller = msg.From,
    title = title,
    description = description,
    itemId = itemId,
    type = auctionType,
    startPrice = startPrice,
    reservePrice = reservePrice,
    endPrice = endPrice,
    currentBid = 0,
    currentBidder = nil,
    bids = {},
    startTime = now,
    endTime = now + duration,
    status = "active",
    settled = false,
    createdAt = now
  }

  Escrow[id] = {}

  msg.reply({
    Data = json.encode({
      action = "created",
      auction = Auctions[id]
    })
  })
end)

-- Place a bid
Handlers.add("Bid", "Bid", function(msg)
  local auctionId = msg.Tags.AuctionId or msg.Tags.Id
  local amount = tonumber(msg.Tags.Amount)

  if not auctionId or not Auctions[auctionId] then
    msg.reply({ Tags = { Error = "Invalid-Auction" }, Data = "Auction not found" })
    return
  end

  if not amount or amount <= 0 then
    msg.reply({ Tags = { Error = "Invalid-Amount" }, Data = "Valid amount required" })
    return
  end

  local auction = Auctions[auctionId]
  local now = os.time()

  if auction.status ~= "active" then
    msg.reply({ Tags = { Error = "Not-Active" }, Data = "Auction is " .. auction.status })
    return
  end

  if now > auction.endTime then
    msg.reply({ Tags = { Error = "Ended" }, Data = "Auction has ended" })
    return
  end

  if msg.From == auction.seller then
    msg.reply({ Tags = { Error = "Self-Bid" }, Data = "Cannot bid on own auction" })
    return
  end

  -- Check user has sufficient balance
  local userBalance = Balances[msg.From] or 0
  local existingEscrow = Escrow[auctionId][msg.From] or 0
  local needed = amount - existingEscrow

  if userBalance < needed then
    msg.reply({
      Tags = { Error = "Insufficient-Balance" },
      Data = json.encode({
        error = "Insufficient balance",
        have = userBalance,
        need = needed
      })
    })
    return
  end

  -- Handle bid based on auction type
  if auction.type == "english" then
    -- English auction: must be higher than current bid
    local minBid = auction.currentBid > 0 and auction.currentBid + 1 or auction.startPrice

    if amount < minBid then
      msg.reply({
        Tags = { Error = "Bid-Too-Low" },
        Data = "Minimum bid is " .. minBid
      })
      return
    end

    -- Release previous bidder's escrow
    if auction.currentBidder and auction.currentBidder ~= msg.From then
      local prevEscrow = Escrow[auctionId][auction.currentBidder] or 0
      Balances[auction.currentBidder] = (Balances[auction.currentBidder] or 0) + prevEscrow
      Escrow[auctionId][auction.currentBidder] = 0

      -- Notify outbid
      ao.send({
        Target = auction.currentBidder,
        Tags = { Action = "Outbid", AuctionId = auctionId },
        Data = json.encode({
          auction = auction.title,
          yourBid = prevEscrow,
          newBid = amount,
          refunded = prevEscrow
        })
      })
    end

    -- Lock new bid in escrow
    Balances[msg.From] = userBalance - needed
    Escrow[auctionId][msg.From] = amount

    auction.currentBid = amount
    auction.currentBidder = msg.From

    -- Record bid history
    table.insert(auction.bids, {
      bidder = msg.From,
      amount = amount,
      timestamp = now
    })

  elseif auction.type == "dutch" then
    -- Dutch auction: price decreases over time, first bid wins
    local elapsed = now - auction.startTime
    local duration = auction.endTime - auction.startTime
    local priceRange = auction.startPrice - auction.endPrice
    local currentPrice = auction.startPrice - math.floor((priceRange * elapsed) / duration)

    if amount < currentPrice then
      msg.reply({
        Tags = { Error = "Bid-Too-Low" },
        Data = "Current price is " .. currentPrice
      })
      return
    end

    -- Dutch auction: immediate win
    Balances[msg.From] = userBalance - currentPrice
    Escrow[auctionId][msg.From] = currentPrice

    auction.currentBid = currentPrice
    auction.currentBidder = msg.From
    auction.status = "ended"

    table.insert(auction.bids, {
      bidder = msg.From,
      amount = currentPrice,
      timestamp = now
    })
  end

  msg.reply({
    Data = json.encode({
      action = "bid",
      auctionId = auctionId,
      amount = auction.currentBid,
      status = auction.status
    })
  })
end)

-- Cancel auction (before any bids)
Handlers.add("CancelAuction", "CancelAuction", function(msg)
  local auctionId = msg.Tags.AuctionId or msg.Tags.Id

  if not auctionId or not Auctions[auctionId] then
    msg.reply({ Tags = { Error = "Invalid-Auction" }, Data = "Auction not found" })
    return
  end

  local auction = Auctions[auctionId]

  if auction.seller ~= msg.From then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only seller can cancel" })
    return
  end

  if auction.currentBidder then
    msg.reply({ Tags = { Error = "Has-Bids" }, Data = "Cannot cancel auction with bids" })
    return
  end

  auction.status = "cancelled"

  msg.reply({
    Data = json.encode({ action = "cancelled", auctionId = auctionId })
  })
end)

-- Settle an ended auction
Handlers.add("Settle", "Settle", function(msg)
  local auctionId = msg.Tags.AuctionId or msg.Tags.Id

  if not auctionId or not Auctions[auctionId] then
    msg.reply({ Tags = { Error = "Invalid-Auction" }, Data = "Auction not found" })
    return
  end

  local auction = Auctions[auctionId]
  local now = os.time()

  if auction.settled then
    msg.reply({ Tags = { Error = "Already-Settled" }, Data = "Auction already settled" })
    return
  end

  if auction.status == "active" and now <= auction.endTime then
    msg.reply({ Tags = { Error = "Not-Ended" }, Data = "Auction has not ended" })
    return
  end

  auction.status = "ended"

  -- Check if reserve was met
  if auction.currentBid < auction.reservePrice then
    -- Reserve not met - refund bidder
    if auction.currentBidder then
      local escrowAmount = Escrow[auctionId][auction.currentBidder] or 0
      Balances[auction.currentBidder] = (Balances[auction.currentBidder] or 0) + escrowAmount
      Escrow[auctionId][auction.currentBidder] = 0
    end

    auction.settled = true
    auction.settledAt = now
    auction.winner = nil

    msg.reply({
      Data = json.encode({
        action = "settled",
        result = "reserve-not-met",
        auctionId = auctionId
      })
    })
    return
  end

  -- Auction successful - transfer funds to seller
  if auction.currentBidder then
    local winningBid = Escrow[auctionId][auction.currentBidder] or 0
    Balances[auction.seller] = (Balances[auction.seller] or 0) + winningBid
    Escrow[auctionId][auction.currentBidder] = 0

    auction.winner = auction.currentBidder
    auction.winningBid = winningBid
  end

  auction.settled = true
  auction.settledAt = now

  -- Notify winner
  if auction.winner then
    ao.send({
      Target = auction.winner,
      Tags = { Action = "Auction-Won", AuctionId = auctionId },
      Data = json.encode({
        auction = auction.title,
        itemId = auction.itemId,
        amount = auction.winningBid
      })
    })
  end

  msg.reply({
    Data = json.encode({
      action = "settled",
      result = "success",
      winner = auction.winner,
      amount = auction.winningBid
    })
  })
end)

-- Get auction details
Handlers.add("GetAuction", "GetAuction", function(msg)
  local auctionId = msg.Tags.AuctionId or msg.Tags.Id

  if not auctionId or not Auctions[auctionId] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Auction not found" })
    return
  end

  local auction = Auctions[auctionId]
  local now = os.time()

  -- Calculate current Dutch price if applicable
  local currentPrice = auction.currentBid
  if auction.type == "dutch" and auction.status == "active" then
    local elapsed = now - auction.startTime
    local duration = auction.endTime - auction.startTime
    local priceRange = auction.startPrice - auction.endPrice
    currentPrice = auction.startPrice - math.floor((priceRange * elapsed) / duration)
  end

  msg.reply({
    Data = json.encode({
      auction = auction,
      currentPrice = currentPrice,
      timeRemaining = math.max(0, auction.endTime - now),
      bidCount = #auction.bids
    })
  })
end)

-- List auctions
Handlers.add("ListAuctions", "ListAuctions", function(msg)
  local status = msg.Tags.Status  -- active, ended, cancelled
  local seller = msg.Tags.Seller

  local result = {}
  for id, auction in pairs(Auctions) do
    local include = true

    if status and auction.status ~= status then
      include = false
    end

    if seller and auction.seller ~= seller then
      include = false
    end

    if include then
      table.insert(result, {
        id = auction.id,
        title = auction.title,
        seller = auction.seller,
        type = auction.type,
        currentBid = auction.currentBid,
        status = auction.status,
        endTime = auction.endTime
      })
    end
  end

  -- Sort by end time
  table.sort(result, function(a, b)
    return a.endTime < b.endTime
  end)

  msg.reply({
    Data = json.encode({ auctions = result, count = #result })
  })
end)

-- Get my bids
Handlers.add("MyBids", "MyBids", function(msg)
  local result = {}

  for auctionId, escrowData in pairs(Escrow) do
    if escrowData[msg.From] and escrowData[msg.From] > 0 then
      local auction = Auctions[auctionId]
      table.insert(result, {
        auctionId = auctionId,
        title = auction.title,
        myBid = escrowData[msg.From],
        isWinning = auction.currentBidder == msg.From,
        status = auction.status
      })
    end
  end

  msg.reply({
    Data = json.encode({ bids = result })
  })
end)

-- Deposit funds
Handlers.add("Deposit", "Deposit", function(msg)
  local amount = tonumber(msg.Tags.Amount) or tonumber(msg.Tags.Quantity)

  if not amount or amount <= 0 then
    msg.reply({ Tags = { Error = "Invalid-Amount" }, Data = "Valid amount required" })
    return
  end

  Balances[msg.From] = (Balances[msg.From] or 0) + amount

  msg.reply({
    Data = json.encode({
      action = "deposited",
      amount = amount,
      balance = Balances[msg.From]
    })
  })
end)

-- Withdraw funds
Handlers.add("Withdraw", "Withdraw", function(msg)
  local amount = tonumber(msg.Tags.Amount)
  local balance = Balances[msg.From] or 0

  if not amount then
    amount = balance
  end

  if amount > balance then
    msg.reply({ Tags = { Error = "Insufficient-Balance" }, Data = "Insufficient balance" })
    return
  end

  Balances[msg.From] = balance - amount

  msg.reply({
    Data = json.encode({
      action = "withdrawn",
      amount = amount,
      remaining = Balances[msg.From]
    })
  })
end)

-- Get balance
Handlers.add("Balance", "Balance", function(msg)
  local target = msg.Tags.Target or msg.From
  msg.reply({
    Data = json.encode({ balance = Balances[target] or 0, target = target })
  })
end)
