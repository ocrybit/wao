--[[
  AMM DEX App
  An automated market maker decentralized exchange with liquidity pools.

  Vibe Prompt: "Build a Uniswap-style DEX where users can create liquidity
  pools, add/remove liquidity, and swap tokens. Use the constant product
  formula (x*y=k) and charge a small swap fee."

  Actions:
  - CreatePool: Create a new trading pair
  - AddLiquidity: Add liquidity to a pool
  - RemoveLiquidity: Remove liquidity from a pool
  - Swap: Swap one token for another
  - GetPool: Get pool information
  - GetQuote: Get swap quote
  - Pools: List all pools
  - MyLiquidity: Get my liquidity positions
]]

local json = require("json")

-- Configuration
Config = Config or {
  swapFee = 30,            -- 0.3% fee (in basis points, so 30 = 0.30%)
  minLiquidity = 1000,     -- Minimum initial liquidity
  protocolFee = 5          -- 0.05% protocol fee (from swap fee)
}

-- State
Pools = Pools or {}          -- { poolId: { tokenA, tokenB, reserveA, reserveB, ... } }
LiquidityTokens = LiquidityTokens or {}  -- { poolId: { address: amount } }
Balances = Balances or {}    -- { address: { tokenId: amount } }
ProtocolFees = ProtocolFees or {}  -- Accumulated protocol fees

-- Helper: Get pool ID from token pair (sorted)
local function getPoolId(tokenA, tokenB)
  if tokenA < tokenB then
    return tokenA .. "-" .. tokenB
  else
    return tokenB .. "-" .. tokenA
  end
end

-- Helper: Get user balance
local function getBalance(user, token)
  if not Balances[user] then return 0 end
  return Balances[user][token] or 0
end

-- Helper: Set user balance
local function setBalance(user, token, amount)
  Balances[user] = Balances[user] or {}
  Balances[user][token] = amount
end

-- Helper: Calculate output amount (constant product formula)
local function getAmountOut(amountIn, reserveIn, reserveOut)
  local amountInWithFee = amountIn * (10000 - Config.swapFee)
  local numerator = amountInWithFee * reserveOut
  local denominator = (reserveIn * 10000) + amountInWithFee
  return math.floor(numerator / denominator)
end

-- Helper: Calculate input amount needed
local function getAmountIn(amountOut, reserveIn, reserveOut)
  local numerator = reserveIn * amountOut * 10000
  local denominator = (reserveOut - amountOut) * (10000 - Config.swapFee)
  return math.floor(numerator / denominator) + 1
end

-- Helper: Square root (for LP token calculation)
local function sqrt(n)
  if n == 0 then return 0 end
  local x = n
  local y = (x + 1) / 2
  while y < x do
    x = y
    y = (x + n / x) / 2
  end
  return math.floor(x)
end

-- Create a new pool
Handlers.add("CreatePool", "CreatePool", function(msg)
  local tokenA = msg.Tags.TokenA
  local tokenB = msg.Tags.TokenB
  local amountA = tonumber(msg.Tags.AmountA)
  local amountB = tonumber(msg.Tags.AmountB)

  if not tokenA or not tokenB then
    msg.reply({ Tags = { Error = "Tokens-Required" }, Data = "Both tokens are required" })
    return
  end

  if tokenA == tokenB then
    msg.reply({ Tags = { Error = "Same-Token" }, Data = "Cannot create pool with same token" })
    return
  end

  if not amountA or not amountB or amountA <= 0 or amountB <= 0 then
    msg.reply({ Tags = { Error = "Invalid-Amounts" }, Data = "Valid amounts required" })
    return
  end

  local poolId = getPoolId(tokenA, tokenB)

  if Pools[poolId] then
    msg.reply({ Tags = { Error = "Pool-Exists" }, Data = "Pool already exists" })
    return
  end

  -- Check balances
  local balA = getBalance(msg.From, tokenA)
  local balB = getBalance(msg.From, tokenB)

  if balA < amountA or balB < amountB then
    msg.reply({
      Tags = { Error = "Insufficient-Balance" },
      Data = json.encode({ needA = amountA, haveA = balA, needB = amountB, haveB = balB })
    })
    return
  end

  -- Calculate initial LP tokens
  local liquidity = sqrt(amountA * amountB)

  if liquidity < Config.minLiquidity then
    msg.reply({
      Tags = { Error = "Insufficient-Liquidity" },
      Data = "Initial liquidity must be at least " .. Config.minLiquidity
    })
    return
  end

  -- Order tokens
  local orderedA, orderedB, reserveA, reserveB
  if tokenA < tokenB then
    orderedA, orderedB = tokenA, tokenB
    reserveA, reserveB = amountA, amountB
  else
    orderedA, orderedB = tokenB, tokenA
    reserveA, reserveB = amountB, amountA
  end

  -- Create pool
  Pools[poolId] = {
    id = poolId,
    tokenA = orderedA,
    tokenB = orderedB,
    reserveA = reserveA,
    reserveB = reserveB,
    totalLiquidity = liquidity,
    createdBy = msg.From,
    createdAt = os.time(),
    swapCount = 0,
    volumeA = 0,
    volumeB = 0
  }

  -- Deduct tokens and mint LP tokens
  setBalance(msg.From, tokenA, balA - amountA)
  setBalance(msg.From, tokenB, balB - amountB)

  LiquidityTokens[poolId] = LiquidityTokens[poolId] or {}
  LiquidityTokens[poolId][msg.From] = liquidity

  msg.reply({
    Data = json.encode({
      action = "pool-created",
      poolId = poolId,
      liquidity = liquidity,
      pool = Pools[poolId]
    })
  })
end)

-- Add liquidity
Handlers.add("AddLiquidity", "AddLiquidity", function(msg)
  local poolId = msg.Tags.PoolId
  local amountA = tonumber(msg.Tags.AmountA)
  local amountB = tonumber(msg.Tags.AmountB)
  local slippage = tonumber(msg.Tags.Slippage) or 100  -- 1% default

  if not poolId or not Pools[poolId] then
    msg.reply({ Tags = { Error = "Invalid-Pool" }, Data = "Pool not found" })
    return
  end

  local pool = Pools[poolId]

  if not amountA and not amountB then
    msg.reply({ Tags = { Error = "Amount-Required" }, Data = "At least one amount required" })
    return
  end

  -- Calculate optimal amounts based on current ratio
  local optimalA, optimalB

  if amountA and amountB then
    optimalA = amountA
    optimalB = amountB
  elseif amountA then
    optimalA = amountA
    optimalB = math.floor(amountA * pool.reserveB / pool.reserveA)
  else
    optimalB = amountB
    optimalA = math.floor(amountB * pool.reserveA / pool.reserveB)
  end

  -- Check balances
  local balA = getBalance(msg.From, pool.tokenA)
  local balB = getBalance(msg.From, pool.tokenB)

  if balA < optimalA or balB < optimalB then
    msg.reply({
      Tags = { Error = "Insufficient-Balance" },
      Data = json.encode({ needA = optimalA, haveA = balA, needB = optimalB, haveB = balB })
    })
    return
  end

  -- Calculate LP tokens to mint
  local liquidityA = math.floor(optimalA * pool.totalLiquidity / pool.reserveA)
  local liquidityB = math.floor(optimalB * pool.totalLiquidity / pool.reserveB)
  local liquidity = math.min(liquidityA, liquidityB)

  -- Update pool
  pool.reserveA = pool.reserveA + optimalA
  pool.reserveB = pool.reserveB + optimalB
  pool.totalLiquidity = pool.totalLiquidity + liquidity

  -- Deduct tokens and mint LP
  setBalance(msg.From, pool.tokenA, balA - optimalA)
  setBalance(msg.From, pool.tokenB, balB - optimalB)

  LiquidityTokens[poolId][msg.From] = (LiquidityTokens[poolId][msg.From] or 0) + liquidity

  msg.reply({
    Data = json.encode({
      action = "liquidity-added",
      poolId = poolId,
      amountA = optimalA,
      amountB = optimalB,
      liquidity = liquidity,
      totalLiquidity = LiquidityTokens[poolId][msg.From]
    })
  })
end)

-- Remove liquidity
Handlers.add("RemoveLiquidity", "RemoveLiquidity", function(msg)
  local poolId = msg.Tags.PoolId
  local liquidity = tonumber(msg.Tags.Liquidity)
  local percent = tonumber(msg.Tags.Percent)  -- Alternative: remove X% of position

  if not poolId or not Pools[poolId] then
    msg.reply({ Tags = { Error = "Invalid-Pool" }, Data = "Pool not found" })
    return
  end

  local pool = Pools[poolId]
  local userLiquidity = LiquidityTokens[poolId][msg.From] or 0

  if percent then
    liquidity = math.floor(userLiquidity * percent / 100)
  end

  if not liquidity or liquidity <= 0 then
    msg.reply({ Tags = { Error = "Invalid-Liquidity" }, Data = "Valid liquidity amount required" })
    return
  end

  if userLiquidity < liquidity then
    msg.reply({
      Tags = { Error = "Insufficient-Liquidity" },
      Data = json.encode({ have = userLiquidity, want = liquidity })
    })
    return
  end

  -- Calculate token amounts to return
  local amountA = math.floor(liquidity * pool.reserveA / pool.totalLiquidity)
  local amountB = math.floor(liquidity * pool.reserveB / pool.totalLiquidity)

  -- Update pool
  pool.reserveA = pool.reserveA - amountA
  pool.reserveB = pool.reserveB - amountB
  pool.totalLiquidity = pool.totalLiquidity - liquidity

  -- Burn LP and return tokens
  LiquidityTokens[poolId][msg.From] = userLiquidity - liquidity
  setBalance(msg.From, pool.tokenA, getBalance(msg.From, pool.tokenA) + amountA)
  setBalance(msg.From, pool.tokenB, getBalance(msg.From, pool.tokenB) + amountB)

  msg.reply({
    Data = json.encode({
      action = "liquidity-removed",
      poolId = poolId,
      liquidity = liquidity,
      amountA = amountA,
      amountB = amountB,
      remainingLiquidity = LiquidityTokens[poolId][msg.From]
    })
  })
end)

-- Swap tokens
Handlers.add("Swap", "Swap", function(msg)
  local tokenIn = msg.Tags.TokenIn
  local tokenOut = msg.Tags.TokenOut
  local amountIn = tonumber(msg.Tags.AmountIn)
  local minAmountOut = tonumber(msg.Tags.MinAmountOut) or 0

  if not tokenIn or not tokenOut then
    msg.reply({ Tags = { Error = "Tokens-Required" }, Data = "Both tokens required" })
    return
  end

  if not amountIn or amountIn <= 0 then
    msg.reply({ Tags = { Error = "Invalid-Amount" }, Data = "Valid input amount required" })
    return
  end

  local poolId = getPoolId(tokenIn, tokenOut)

  if not Pools[poolId] then
    msg.reply({ Tags = { Error = "No-Pool" }, Data = "No pool for this pair" })
    return
  end

  local pool = Pools[poolId]

  -- Check balance
  local balance = getBalance(msg.From, tokenIn)
  if balance < amountIn then
    msg.reply({
      Tags = { Error = "Insufficient-Balance" },
      Data = json.encode({ have = balance, need = amountIn })
    })
    return
  end

  -- Determine reserves
  local reserveIn, reserveOut
  if tokenIn == pool.tokenA then
    reserveIn = pool.reserveA
    reserveOut = pool.reserveB
  else
    reserveIn = pool.reserveB
    reserveOut = pool.reserveA
  end

  -- Calculate output
  local amountOut = getAmountOut(amountIn, reserveIn, reserveOut)

  if amountOut < minAmountOut then
    msg.reply({
      Tags = { Error = "Slippage" },
      Data = json.encode({ expected = minAmountOut, actual = amountOut })
    })
    return
  end

  if amountOut >= reserveOut then
    msg.reply({ Tags = { Error = "Insufficient-Liquidity" }, Data = "Not enough liquidity" })
    return
  end

  -- Update reserves
  if tokenIn == pool.tokenA then
    pool.reserveA = pool.reserveA + amountIn
    pool.reserveB = pool.reserveB - amountOut
    pool.volumeA = pool.volumeA + amountIn
  else
    pool.reserveB = pool.reserveB + amountIn
    pool.reserveA = pool.reserveA - amountOut
    pool.volumeB = pool.volumeB + amountIn
  end

  pool.swapCount = pool.swapCount + 1

  -- Transfer tokens
  setBalance(msg.From, tokenIn, balance - amountIn)
  setBalance(msg.From, tokenOut, getBalance(msg.From, tokenOut) + amountOut)

  msg.reply({
    Data = json.encode({
      action = "swapped",
      tokenIn = tokenIn,
      tokenOut = tokenOut,
      amountIn = amountIn,
      amountOut = amountOut,
      price = amountIn / amountOut
    })
  })
end)

-- Get swap quote
Handlers.add("GetQuote", "GetQuote", function(msg)
  local tokenIn = msg.Tags.TokenIn
  local tokenOut = msg.Tags.TokenOut
  local amountIn = tonumber(msg.Tags.AmountIn)

  if not tokenIn or not tokenOut or not amountIn then
    msg.reply({ Tags = { Error = "Invalid-Request" }, Data = "All parameters required" })
    return
  end

  local poolId = getPoolId(tokenIn, tokenOut)

  if not Pools[poolId] then
    msg.reply({ Tags = { Error = "No-Pool" }, Data = "No pool for this pair" })
    return
  end

  local pool = Pools[poolId]

  local reserveIn, reserveOut
  if tokenIn == pool.tokenA then
    reserveIn = pool.reserveA
    reserveOut = pool.reserveB
  else
    reserveIn = pool.reserveB
    reserveOut = pool.reserveA
  end

  local amountOut = getAmountOut(amountIn, reserveIn, reserveOut)
  local priceImpact = math.floor((amountIn * 10000 / reserveIn))  -- Basis points

  msg.reply({
    Data = json.encode({
      amountIn = amountIn,
      amountOut = amountOut,
      price = amountIn / amountOut,
      priceImpact = priceImpact,
      fee = math.floor(amountIn * Config.swapFee / 10000)
    })
  })
end)

-- Get pool info
Handlers.add("GetPool", "GetPool", function(msg)
  local poolId = msg.Tags.PoolId

  if not poolId or not Pools[poolId] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Pool not found" })
    return
  end

  local pool = Pools[poolId]
  local price = pool.reserveB / pool.reserveA

  msg.reply({
    Data = json.encode({
      pool = pool,
      price = price,
      tvl = pool.reserveA + pool.reserveB  -- Simplified TVL
    })
  })
end)

-- List all pools
Handlers.add("Pools", "Pools", function(msg)
  local result = {}

  for poolId, pool in pairs(Pools) do
    table.insert(result, {
      id = pool.id,
      tokenA = pool.tokenA,
      tokenB = pool.tokenB,
      reserveA = pool.reserveA,
      reserveB = pool.reserveB,
      totalLiquidity = pool.totalLiquidity,
      swapCount = pool.swapCount
    })
  end

  msg.reply({
    Data = json.encode({ pools = result, count = #result })
  })
end)

-- Get my liquidity positions
Handlers.add("MyLiquidity", "MyLiquidity", function(msg)
  local positions = {}

  for poolId, holders in pairs(LiquidityTokens) do
    if holders[msg.From] and holders[msg.From] > 0 then
      local pool = Pools[poolId]
      local share = holders[msg.From] / pool.totalLiquidity
      table.insert(positions, {
        poolId = poolId,
        liquidity = holders[msg.From],
        share = share * 100,
        valueA = math.floor(share * pool.reserveA),
        valueB = math.floor(share * pool.reserveB)
      })
    end
  end

  msg.reply({
    Data = json.encode({ positions = positions })
  })
end)

-- Mint test tokens
Handlers.add("Mint", "Mint", function(msg)
  local token = msg.Tags.Token or "TOKEN-A"
  local amount = tonumber(msg.Tags.Amount) or 1000000

  setBalance(msg.From, token, getBalance(msg.From, token) + amount)

  msg.reply({
    Data = json.encode({
      action = "minted",
      token = token,
      amount = amount,
      balance = getBalance(msg.From, token)
    })
  })
end)

-- Get balances
Handlers.add("Balances", "Balances", function(msg)
  msg.reply({
    Data = json.encode({ balances = Balances[msg.From] or {} })
  })
end)
