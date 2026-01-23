--[[
  Staking Pool App
  Stake tokens to earn rewards over time with compound interest.

  Vibe Prompt: "Create a staking pool where users can stake tokens and
  earn rewards based on time staked. Support compound interest,
  early withdrawal penalties, and reward distribution."

  Actions:
  - Stake: Stake tokens
  - Unstake: Unstake tokens (with penalty if early)
  - Claim: Claim pending rewards
  - Compound: Reinvest rewards
  - GetStake: Get stake details
  - PoolInfo: Get pool statistics
  - Leaderboard: Top stakers
]]

local json = require("json")

-- Pool configuration
Config = Config or {
  rewardRate = 10,           -- 10% APY base rate
  minStakePeriod = 86400 * 7,  -- 7 days minimum
  earlyPenalty = 10,         -- 10% penalty for early withdrawal
  compoundBonus = 2,         -- 2% bonus for compounding
  maxStakePerUser = 1000000000  -- Max stake per user
}

-- State
Stakes = Stakes or {}        -- { address: { amount, stakedAt, lastClaim, totalRewards } }
TotalStaked = TotalStaked or 0
RewardPool = RewardPool or 1000000000  -- Rewards available
Balances = Balances or {}    -- User token balances

-- Helper: Calculate pending rewards
local function calculateRewards(stake, now)
  if not stake or stake.amount == 0 then return 0 end

  local timeStaked = now - stake.lastClaim
  local yearInSeconds = 365 * 24 * 60 * 60

  -- Base rewards: amount * rate * time / year
  local rewards = math.floor(
    stake.amount * Config.rewardRate * timeStaked / (yearInSeconds * 100)
  )

  return rewards
end

-- Stake tokens
Handlers.add("Stake", "Stake", function(msg)
  local amount = tonumber(msg.Tags.Amount)

  if not amount or amount <= 0 then
    msg.reply({ Tags = { Error = "Invalid-Amount" }, Data = "Valid amount required" })
    return
  end

  local balance = Balances[msg.From] or 0
  if balance < amount then
    msg.reply({ Tags = { Error = "Insufficient-Balance" }, Data = "Insufficient balance" })
    return
  end

  local now = os.time()
  local stake = Stakes[msg.From]

  if stake then
    -- Add to existing stake - claim pending rewards first
    local pending = calculateRewards(stake, now)
    if pending > 0 and RewardPool >= pending then
      Balances[msg.From] = (Balances[msg.From] or 0) + pending
      RewardPool = RewardPool - pending
      stake.totalRewards = stake.totalRewards + pending
    end

    stake.amount = stake.amount + amount
    stake.lastClaim = now

    -- Check max stake
    if stake.amount > Config.maxStakePerUser then
      msg.reply({
        Tags = { Error = "Max-Stake-Exceeded" },
        Data = "Maximum stake per user is " .. Config.maxStakePerUser
      })
      return
    end
  else
    Stakes[msg.From] = {
      amount = amount,
      stakedAt = now,
      lastClaim = now,
      totalRewards = 0,
      compoundCount = 0
    }
    stake = Stakes[msg.From]
  end

  -- Deduct from balance
  Balances[msg.From] = balance - amount
  TotalStaked = TotalStaked + amount

  msg.reply({
    Data = json.encode({
      action = "staked",
      amount = amount,
      totalStaked = stake.amount,
      poolTotal = TotalStaked
    })
  })
end)

-- Unstake tokens
Handlers.add("Unstake", "Unstake", function(msg)
  local amount = tonumber(msg.Tags.Amount)

  local stake = Stakes[msg.From]
  if not stake or stake.amount == 0 then
    msg.reply({ Tags = { Error = "No-Stake" }, Data = "You have no stake" })
    return
  end

  if not amount then
    amount = stake.amount  -- Unstake all
  end

  if amount > stake.amount then
    msg.reply({ Tags = { Error = "Insufficient-Stake" }, Data = "Amount exceeds stake" })
    return
  end

  local now = os.time()
  local timeStaked = now - stake.stakedAt

  -- Calculate rewards before unstaking
  local pending = calculateRewards(stake, now)

  -- Check for early withdrawal penalty
  local penalty = 0
  if timeStaked < Config.minStakePeriod then
    penalty = math.floor(amount * Config.earlyPenalty / 100)
  end

  local returnAmount = amount - penalty

  -- Claim pending rewards
  if pending > 0 and RewardPool >= pending then
    Balances[msg.From] = (Balances[msg.From] or 0) + pending
    RewardPool = RewardPool - pending
    stake.totalRewards = stake.totalRewards + pending
  end

  -- Return stake (minus penalty)
  Balances[msg.From] = (Balances[msg.From] or 0) + returnAmount
  stake.amount = stake.amount - amount
  stake.lastClaim = now
  TotalStaked = TotalStaked - amount

  -- Add penalty back to reward pool
  if penalty > 0 then
    RewardPool = RewardPool + penalty
  end

  msg.reply({
    Data = json.encode({
      action = "unstaked",
      amount = amount,
      penalty = penalty,
      returned = returnAmount,
      rewardsClaimed = pending,
      remainingStake = stake.amount
    })
  })
end)

-- Claim rewards
Handlers.add("Claim", "Claim", function(msg)
  local stake = Stakes[msg.From]
  if not stake or stake.amount == 0 then
    msg.reply({ Tags = { Error = "No-Stake" }, Data = "You have no stake" })
    return
  end

  local now = os.time()
  local pending = calculateRewards(stake, now)

  if pending == 0 then
    msg.reply({ Tags = { Error = "No-Rewards" }, Data = "No rewards to claim" })
    return
  end

  if RewardPool < pending then
    pending = RewardPool  -- Claim what's available
  end

  Balances[msg.From] = (Balances[msg.From] or 0) + pending
  RewardPool = RewardPool - pending
  stake.lastClaim = now
  stake.totalRewards = stake.totalRewards + pending

  msg.reply({
    Data = json.encode({
      action = "claimed",
      amount = pending,
      totalRewards = stake.totalRewards,
      newBalance = Balances[msg.From]
    })
  })
end)

-- Compound rewards (reinvest)
Handlers.add("Compound", "Compound", function(msg)
  local stake = Stakes[msg.From]
  if not stake or stake.amount == 0 then
    msg.reply({ Tags = { Error = "No-Stake" }, Data = "You have no stake" })
    return
  end

  local now = os.time()
  local pending = calculateRewards(stake, now)

  if pending == 0 then
    msg.reply({ Tags = { Error = "No-Rewards" }, Data = "No rewards to compound" })
    return
  end

  if RewardPool < pending then
    pending = RewardPool
  end

  -- Apply compound bonus
  local bonus = math.floor(pending * Config.compoundBonus / 100)
  local total = pending + bonus

  if RewardPool < total then
    total = pending  -- No bonus if pool can't cover it
    bonus = 0
  end

  -- Add to stake instead of balance
  stake.amount = stake.amount + total
  stake.lastClaim = now
  stake.totalRewards = stake.totalRewards + total
  stake.compoundCount = stake.compoundCount + 1
  TotalStaked = TotalStaked + total
  RewardPool = RewardPool - total

  msg.reply({
    Data = json.encode({
      action = "compounded",
      rewards = pending,
      bonus = bonus,
      total = total,
      newStake = stake.amount,
      compoundCount = stake.compoundCount
    })
  })
end)

-- Get stake details
Handlers.add("GetStake", "GetStake", function(msg)
  local target = msg.Tags.Address or msg.From
  local stake = Stakes[target]

  if not stake then
    msg.reply({
      Data = json.encode({
        staked = 0,
        pending = 0,
        totalRewards = 0
      })
    })
    return
  end

  local now = os.time()
  local pending = calculateRewards(stake, now)
  local timeStaked = now - stake.stakedAt
  local canWithdrawEarly = timeStaked < Config.minStakePeriod

  msg.reply({
    Data = json.encode({
      staked = stake.amount,
      stakedAt = stake.stakedAt,
      pending = pending,
      totalRewards = stake.totalRewards,
      compoundCount = stake.compoundCount,
      timeStaked = timeStaked,
      minPeriod = Config.minStakePeriod,
      earlyWithdrawal = canWithdrawEarly,
      penaltyIfEarly = canWithdrawEarly and math.floor(stake.amount * Config.earlyPenalty / 100) or 0
    })
  })
end)

-- Pool info
Handlers.add("PoolInfo", "PoolInfo", function(msg)
  local stakerCount = 0
  for _ in pairs(Stakes) do
    stakerCount = stakerCount + 1
  end

  msg.reply({
    Data = json.encode({
      totalStaked = TotalStaked,
      rewardPool = RewardPool,
      stakerCount = stakerCount,
      config = Config
    })
  })
end)

-- Leaderboard
Handlers.add("Leaderboard", "Leaderboard", function(msg)
  local limit = tonumber(msg.Tags.Limit) or 10

  local stakers = {}
  for addr, stake in pairs(Stakes) do
    if stake.amount > 0 then
      table.insert(stakers, {
        address = addr,
        staked = stake.amount,
        totalRewards = stake.totalRewards,
        compoundCount = stake.compoundCount
      })
    end
  end

  -- Sort by staked amount
  table.sort(stakers, function(a, b)
    return a.staked > b.staked
  end)

  -- Trim to limit
  local result = {}
  for i = 1, math.min(limit, #stakers) do
    stakers[i].rank = i
    table.insert(result, stakers[i])
  end

  msg.reply({
    Data = json.encode({
      leaderboard = result,
      totalStakers = #stakers
    })
  })
end)

-- Deposit tokens (for testing)
Handlers.add("Deposit", "Deposit", function(msg)
  local amount = tonumber(msg.Tags.Amount) or 1000000
  Balances[msg.From] = (Balances[msg.From] or 0) + amount

  msg.reply({
    Data = json.encode({
      action = "deposited",
      amount = amount,
      balance = Balances[msg.From]
    })
  })
end)

-- Get balance
Handlers.add("Balance", "Balance", function(msg)
  local target = msg.Tags.Target or msg.From
  msg.reply({
    Data = json.encode({
      balance = Balances[target] or 0,
      target = target
    })
  })
end)

-- Add rewards to pool (admin)
Handlers.add("AddRewards", "AddRewards", function(msg)
  local amount = tonumber(msg.Tags.Amount)
  if amount and amount > 0 then
    RewardPool = RewardPool + amount
  end

  msg.reply({
    Data = json.encode({
      action = "rewards-added",
      amount = amount,
      totalPool = RewardPool
    })
  })
end)
