--[[
  Lottery App
  A decentralized lottery with ticket purchasing, random drawing, and prize distribution.

  Vibe Prompt: "Create a lottery where users buy tickets, a random winner
  is selected at the end of each round, and prizes are distributed.
  Support multiple prize tiers and automatic round cycling."

  Actions:
  - BuyTicket: Purchase lottery tickets
  - Draw: Trigger drawing (anyone can call when round ends)
  - CurrentRound: Get current round info
  - MyTickets: Get my tickets for current round
  - History: Get past round results
  - Claim: Claim winnings
  - Stats: Get lottery statistics
]]

local json = require("json")

-- Configuration
Config = Config or {
  ticketPrice = 100,
  roundDuration = 86400,      -- 24 hours
  maxTicketsPerUser = 100,
  prizeDistribution = {       -- Percentage distribution
    jackpot = 50,             -- 50% to winner
    secondTier = 20,          -- 20% split among 2nd tier
    thirdTier = 10,           -- 10% split among 3rd tier
    treasury = 10,            -- 10% to treasury
    rollover = 10             -- 10% rolls to next round
  },
  winnersPerTier = {
    jackpot = 1,
    secondTier = 3,
    thirdTier = 10
  }
}

-- State
Rounds = Rounds or {}        -- { roundId: { tickets, prizePool, winners, ... } }
CurrentRoundId = CurrentRoundId or 0
Balances = Balances or {}    -- User balances
Treasury = Treasury or 0
UnclaimedWinnings = UnclaimedWinnings or {}  -- { address: amount }

-- Initialize first round
if CurrentRoundId == 0 then
  CurrentRoundId = 1
  Rounds[1] = {
    id = 1,
    tickets = {},
    ticketHolders = {},
    prizePool = 0,
    startTime = os.time(),
    endTime = os.time() + Config.roundDuration,
    status = "active",
    winners = nil
  }
end

-- Helper: Get current round
local function getCurrentRound()
  return Rounds[CurrentRoundId]
end

-- Helper: Pseudo-random number using block data
local function pseudoRandom(seed, max)
  -- Use block height and timestamp for randomness
  local combined = seed + os.time()
  return (combined % max) + 1
end

-- Helper: Select winners
local function selectWinners(round)
  local ticketCount = #round.tickets
  if ticketCount == 0 then return nil end

  local winners = {
    jackpot = {},
    secondTier = {},
    thirdTier = {}
  }

  local selectedIndices = {}

  -- Select jackpot winner
  for i = 1, Config.winnersPerTier.jackpot do
    if #selectedIndices >= ticketCount then break end
    local idx
    repeat
      idx = pseudoRandom(round.id + i, ticketCount)
    until not selectedIndices[idx]
    selectedIndices[idx] = true
    table.insert(winners.jackpot, round.tickets[idx])
  end

  -- Select second tier
  for i = 1, Config.winnersPerTier.secondTier do
    if #selectedIndices >= ticketCount then break end
    local idx
    repeat
      idx = pseudoRandom(round.id + 100 + i, ticketCount)
    until not selectedIndices[idx]
    selectedIndices[idx] = true
    table.insert(winners.secondTier, round.tickets[idx])
  end

  -- Select third tier
  for i = 1, Config.winnersPerTier.thirdTier do
    if #selectedIndices >= ticketCount then break end
    local idx
    repeat
      idx = pseudoRandom(round.id + 200 + i, ticketCount)
    until not selectedIndices[idx]
    selectedIndices[idx] = true
    table.insert(winners.thirdTier, round.tickets[idx])
  end

  return winners
end

-- Buy tickets
Handlers.add("BuyTicket", "BuyTicket", function(msg)
  local quantity = tonumber(msg.Tags.Quantity) or 1

  if quantity <= 0 then
    msg.reply({ Tags = { Error = "Invalid-Quantity" }, Data = "Quantity must be positive" })
    return
  end

  local round = getCurrentRound()

  if round.status ~= "active" then
    msg.reply({ Tags = { Error = "Round-Inactive" }, Data = "Current round is not active" })
    return
  end

  if os.time() > round.endTime then
    msg.reply({ Tags = { Error = "Round-Ended" }, Data = "Round has ended. Call Draw to start new round" })
    return
  end

  -- Check max tickets
  local currentTickets = round.ticketHolders[msg.From] or 0
  if currentTickets + quantity > Config.maxTicketsPerUser then
    msg.reply({
      Tags = { Error = "Max-Tickets" },
      Data = "Maximum " .. Config.maxTicketsPerUser .. " tickets per user"
    })
    return
  end

  local cost = quantity * Config.ticketPrice
  local balance = Balances[msg.From] or 0

  if balance < cost then
    msg.reply({
      Tags = { Error = "Insufficient-Balance" },
      Data = json.encode({ need = cost, have = balance })
    })
    return
  end

  -- Purchase tickets
  Balances[msg.From] = balance - cost
  round.prizePool = round.prizePool + cost
  round.ticketHolders[msg.From] = currentTickets + quantity

  -- Add tickets to pool
  for i = 1, quantity do
    table.insert(round.tickets, msg.From)
  end

  msg.reply({
    Data = json.encode({
      action = "purchased",
      quantity = quantity,
      cost = cost,
      totalTickets = round.ticketHolders[msg.From],
      roundPrizePool = round.prizePool
    })
  })
end)

-- Draw winners and start new round
Handlers.add("Draw", "Draw", function(msg)
  local round = getCurrentRound()

  if os.time() < round.endTime then
    msg.reply({
      Tags = { Error = "Round-Active" },
      Data = "Round hasn't ended yet. Ends at " .. round.endTime
    })
    return
  end

  if round.status == "completed" then
    msg.reply({ Tags = { Error = "Already-Drawn" }, Data = "This round has already been drawn" })
    return
  end

  -- Select winners
  local winners = selectWinners(round)
  round.winners = winners
  round.status = "completed"
  round.drawnAt = os.time()
  round.drawnBy = msg.From

  local prizePool = round.prizePool

  if winners and #round.tickets > 0 then
    -- Calculate prizes
    local jackpotTotal = math.floor(prizePool * Config.prizeDistribution.jackpot / 100)
    local secondTotal = math.floor(prizePool * Config.prizeDistribution.secondTier / 100)
    local thirdTotal = math.floor(prizePool * Config.prizeDistribution.thirdTier / 100)
    local treasuryAmount = math.floor(prizePool * Config.prizeDistribution.treasury / 100)
    local rolloverAmount = math.floor(prizePool * Config.prizeDistribution.rollover / 100)

    -- Distribute prizes
    round.prizes = {
      jackpot = {},
      secondTier = {},
      thirdTier = {}
    }

    -- Jackpot
    local jackpotPer = #winners.jackpot > 0 and math.floor(jackpotTotal / #winners.jackpot) or 0
    for _, winner in ipairs(winners.jackpot) do
      UnclaimedWinnings[winner] = (UnclaimedWinnings[winner] or 0) + jackpotPer
      table.insert(round.prizes.jackpot, { address = winner, amount = jackpotPer })
    end

    -- Second tier
    local secondPer = #winners.secondTier > 0 and math.floor(secondTotal / #winners.secondTier) or 0
    for _, winner in ipairs(winners.secondTier) do
      UnclaimedWinnings[winner] = (UnclaimedWinnings[winner] or 0) + secondPer
      table.insert(round.prizes.secondTier, { address = winner, amount = secondPer })
    end

    -- Third tier
    local thirdPer = #winners.thirdTier > 0 and math.floor(thirdTotal / #winners.thirdTier) or 0
    for _, winner in ipairs(winners.thirdTier) do
      UnclaimedWinnings[winner] = (UnclaimedWinnings[winner] or 0) + thirdPer
      table.insert(round.prizes.thirdTier, { address = winner, amount = thirdPer })
    end

    Treasury = Treasury + treasuryAmount

    -- Start new round with rollover
    CurrentRoundId = CurrentRoundId + 1
    Rounds[CurrentRoundId] = {
      id = CurrentRoundId,
      tickets = {},
      ticketHolders = {},
      prizePool = rolloverAmount,
      startTime = os.time(),
      endTime = os.time() + Config.roundDuration,
      status = "active",
      winners = nil
    }
  else
    -- No tickets sold - carry over entire pool
    CurrentRoundId = CurrentRoundId + 1
    Rounds[CurrentRoundId] = {
      id = CurrentRoundId,
      tickets = {},
      ticketHolders = {},
      prizePool = prizePool,
      startTime = os.time(),
      endTime = os.time() + Config.roundDuration,
      status = "active",
      winners = nil
    }
  end

  msg.reply({
    Data = json.encode({
      action = "drawn",
      round = round.id,
      winners = round.prizes,
      newRoundId = CurrentRoundId
    })
  })
end)

-- Get current round info
Handlers.add("CurrentRound", "CurrentRound", function(msg)
  local round = getCurrentRound()

  msg.reply({
    Data = json.encode({
      id = round.id,
      prizePool = round.prizePool,
      ticketCount = #round.tickets,
      startTime = round.startTime,
      endTime = round.endTime,
      timeRemaining = math.max(0, round.endTime - os.time()),
      status = round.status,
      ticketPrice = Config.ticketPrice,
      maxTickets = Config.maxTicketsPerUser
    })
  })
end)

-- Get my tickets
Handlers.add("MyTickets", "MyTickets", function(msg)
  local roundId = tonumber(msg.Tags.RoundId) or CurrentRoundId
  local round = Rounds[roundId]

  if not round then
    msg.reply({ Tags = { Error = "Invalid-Round" }, Data = "Round not found" })
    return
  end

  local tickets = round.ticketHolders[msg.From] or 0
  local unclaimed = UnclaimedWinnings[msg.From] or 0

  msg.reply({
    Data = json.encode({
      roundId = roundId,
      tickets = tickets,
      unclaimedWinnings = unclaimed
    })
  })
end)

-- Get history
Handlers.add("History", "History", function(msg)
  local limit = tonumber(msg.Tags.Limit) or 10
  local history = {}

  for i = CurrentRoundId - 1, 1, -1 do
    if #history >= limit then break end
    local round = Rounds[i]
    if round and round.status == "completed" then
      table.insert(history, {
        id = round.id,
        prizePool = round.prizePool,
        ticketCount = #round.tickets,
        winners = round.prizes,
        drawnAt = round.drawnAt
      })
    end
  end

  msg.reply({
    Data = json.encode({ history = history })
  })
end)

-- Claim winnings
Handlers.add("Claim", "Claim", function(msg)
  local unclaimed = UnclaimedWinnings[msg.From] or 0

  if unclaimed == 0 then
    msg.reply({ Tags = { Error = "No-Winnings" }, Data = "No unclaimed winnings" })
    return
  end

  Balances[msg.From] = (Balances[msg.From] or 0) + unclaimed
  UnclaimedWinnings[msg.From] = 0

  msg.reply({
    Data = json.encode({
      action = "claimed",
      amount = unclaimed,
      newBalance = Balances[msg.From]
    })
  })
end)

-- Get stats
Handlers.add("Stats", "Stats", function(msg)
  local totalRounds = CurrentRoundId
  local totalTickets = 0
  local totalPrizes = 0
  local uniquePlayers = {}

  for _, round in pairs(Rounds) do
    totalTickets = totalTickets + #round.tickets
    if round.status == "completed" then
      totalPrizes = totalPrizes + round.prizePool
    end
    for addr, _ in pairs(round.ticketHolders) do
      uniquePlayers[addr] = true
    end
  end

  local playerCount = 0
  for _ in pairs(uniquePlayers) do
    playerCount = playerCount + 1
  end

  msg.reply({
    Data = json.encode({
      totalRounds = totalRounds,
      totalTicketsSold = totalTickets,
      totalPrizesDistributed = totalPrizes,
      uniquePlayers = playerCount,
      treasury = Treasury
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
    Data = json.encode({
      balance = Balances[msg.From] or 0,
      unclaimed = UnclaimedWinnings[msg.From] or 0
    })
  })
end)
