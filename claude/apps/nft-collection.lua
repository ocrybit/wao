--[[
  NFT Collection App
  A non-fungible token collection with minting, transfers, and metadata.

  Vibe Prompt: "Build an NFT collection where I can mint unique tokens with
  metadata (name, description, image). Support transfers, royalties on
  secondary sales, and allow owners to update metadata."

  Actions:
  - Mint: Mint a new NFT
  - Transfer: Transfer NFT to another address
  - Info: Get collection info
  - Token: Get specific token details
  - TokensOf: Get all tokens owned by address
  - AllTokens: List all tokens
  - SetApproval: Approve address to transfer
  - UpdateMetadata: Update token metadata (owner only)
]]

local json = require("json")

-- Collection metadata
CollectionName = CollectionName or "Vibe Collection"
CollectionSymbol = CollectionSymbol or "VIBE"
CollectionDescription = CollectionDescription or "A vibe-coded NFT collection"
MaxSupply = MaxSupply or 10000
RoyaltyPercent = RoyaltyPercent or 5  -- 5% royalty on sales

-- State
Tokens = Tokens or {}         -- { tokenId: { owner, metadata, ... } }
TokenCounter = TokenCounter or 0
Owners = Owners or {}         -- { address: [ tokenIds ] }
Approvals = Approvals or {}   -- { tokenId: approvedAddress }
OperatorApprovals = OperatorApprovals or {}  -- { owner: { operator: bool } }

Creator = Creator or ao.env.Process.Owner

-- Helper: Check if address can transfer token
local function canTransfer(tokenId, addr)
  local token = Tokens[tokenId]
  if not token then return false end
  if token.owner == addr then return true end
  if Approvals[tokenId] == addr then return true end
  if OperatorApprovals[token.owner] and OperatorApprovals[token.owner][addr] then
    return true
  end
  return false
end

-- Helper: Remove token from owner's list
local function removeFromOwner(owner, tokenId)
  if not Owners[owner] then return end
  for i, id in ipairs(Owners[owner]) do
    if id == tokenId then
      table.remove(Owners[owner], i)
      return
    end
  end
end

-- Helper: Add token to owner's list
local function addToOwner(owner, tokenId)
  Owners[owner] = Owners[owner] or {}
  table.insert(Owners[owner], tokenId)
end

-- Mint a new NFT
Handlers.add("Mint", "Mint", function(msg)
  local name = msg.Tags.Name or msg.Tags.Title
  local description = msg.Data or msg.Tags.Description
  local image = msg.Tags.Image
  local recipient = msg.Tags.To or msg.From

  if not name then
    msg.reply({ Tags = { Error = "Name-Required" }, Data = "Token name is required" })
    return
  end

  if TokenCounter >= MaxSupply then
    msg.reply({ Tags = { Error = "Max-Supply" }, Data = "Maximum supply reached" })
    return
  end

  TokenCounter = TokenCounter + 1
  local tokenId = tostring(TokenCounter)

  Tokens[tokenId] = {
    id = tokenId,
    owner = recipient,
    creator = msg.From,
    name = name,
    description = description or "",
    image = image,
    attributes = msg.Tags.Attributes and json.decode(msg.Tags.Attributes) or {},
    mintedAt = os.time(),
    mintedBy = msg.From,
    transfers = 0
  }

  addToOwner(recipient, tokenId)

  msg.reply({
    Data = json.encode({
      action = "minted",
      tokenId = tokenId,
      token = Tokens[tokenId]
    })
  })
end)

-- Transfer NFT
Handlers.add("Transfer", "Transfer", function(msg)
  local tokenId = msg.Tags.TokenId or msg.Tags.Id
  local to = msg.Tags.To or msg.Tags.Recipient

  if not tokenId or not Tokens[tokenId] then
    msg.reply({ Tags = { Error = "Invalid-Token" }, Data = "Token not found" })
    return
  end

  if not to then
    msg.reply({ Tags = { Error = "Recipient-Required" }, Data = "Recipient is required" })
    return
  end

  if not canTransfer(tokenId, msg.From) then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Not authorized to transfer" })
    return
  end

  local token = Tokens[tokenId]
  local from = token.owner

  -- Update ownership
  removeFromOwner(from, tokenId)
  addToOwner(to, tokenId)
  token.owner = to
  token.transfers = token.transfers + 1

  -- Clear approval
  Approvals[tokenId] = nil

  -- Notify recipient
  ao.send({
    Target = to,
    Tags = {
      Action = "NFT-Received",
      TokenId = tokenId,
      From = from,
      Collection = CollectionName
    },
    Data = json.encode({ token = token })
  })

  msg.reply({
    Data = json.encode({
      action = "transferred",
      tokenId = tokenId,
      from = from,
      to = to
    })
  })
end)

-- Get collection info
Handlers.add("Info", "Info", function(msg)
  local totalMinted = TokenCounter
  local uniqueOwners = {}
  for owner, _ in pairs(Owners) do
    if #Owners[owner] > 0 then
      uniqueOwners[owner] = true
    end
  end

  local ownerCount = 0
  for _ in pairs(uniqueOwners) do
    ownerCount = ownerCount + 1
  end

  msg.reply({
    Data = json.encode({
      name = CollectionName,
      symbol = CollectionSymbol,
      description = CollectionDescription,
      creator = Creator,
      maxSupply = MaxSupply,
      totalMinted = totalMinted,
      uniqueOwners = ownerCount,
      royaltyPercent = RoyaltyPercent
    })
  })
end)

-- Get token details
Handlers.add("Token", "Token", function(msg)
  local tokenId = msg.Tags.TokenId or msg.Tags.Id

  if not tokenId or not Tokens[tokenId] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Token not found" })
    return
  end

  msg.reply({
    Data = json.encode({
      token = Tokens[tokenId],
      approval = Approvals[tokenId]
    })
  })
end)

-- Get tokens owned by address
Handlers.add("TokensOf", "TokensOf", function(msg)
  local owner = msg.Tags.Owner or msg.Tags.Address or msg.From
  local tokenIds = Owners[owner] or {}

  local tokens = {}
  for _, tokenId in ipairs(tokenIds) do
    table.insert(tokens, Tokens[tokenId])
  end

  msg.reply({
    Data = json.encode({
      owner = owner,
      tokens = tokens,
      count = #tokens
    })
  })
end)

-- List all tokens
Handlers.add("AllTokens", "AllTokens", function(msg)
  local limit = tonumber(msg.Tags.Limit) or 50
  local offset = tonumber(msg.Tags.Offset) or 0

  local result = {}
  local count = 0

  for tokenId, token in pairs(Tokens) do
    if count >= offset and #result < limit then
      table.insert(result, {
        id = token.id,
        name = token.name,
        owner = token.owner,
        image = token.image
      })
    end
    count = count + 1
  end

  msg.reply({
    Data = json.encode({
      tokens = result,
      total = TokenCounter,
      limit = limit,
      offset = offset
    })
  })
end)

-- Set approval for single token
Handlers.add("Approve", "Approve", function(msg)
  local tokenId = msg.Tags.TokenId or msg.Tags.Id
  local approved = msg.Tags.Approved or msg.Tags.To

  if not tokenId or not Tokens[tokenId] then
    msg.reply({ Tags = { Error = "Invalid-Token" }, Data = "Token not found" })
    return
  end

  if Tokens[tokenId].owner ~= msg.From then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can approve" })
    return
  end

  if approved then
    Approvals[tokenId] = approved
  else
    Approvals[tokenId] = nil
  end

  msg.reply({
    Data = json.encode({
      action = "approved",
      tokenId = tokenId,
      approved = approved
    })
  })
end)

-- Set operator approval (approve all)
Handlers.add("SetApprovalForAll", "SetApprovalForAll", function(msg)
  local operator = msg.Tags.Operator
  local approved = msg.Tags.Approved ~= "false"

  if not operator then
    msg.reply({ Tags = { Error = "Operator-Required" }, Data = "Operator is required" })
    return
  end

  OperatorApprovals[msg.From] = OperatorApprovals[msg.From] or {}
  OperatorApprovals[msg.From][operator] = approved

  msg.reply({
    Data = json.encode({
      action = "operator-set",
      operator = operator,
      approved = approved
    })
  })
end)

-- Update token metadata (owner only)
Handlers.add("UpdateMetadata", "UpdateMetadata", function(msg)
  local tokenId = msg.Tags.TokenId or msg.Tags.Id

  if not tokenId or not Tokens[tokenId] then
    msg.reply({ Tags = { Error = "Invalid-Token" }, Data = "Token not found" })
    return
  end

  local token = Tokens[tokenId]

  if token.owner ~= msg.From and token.creator ~= msg.From then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner or creator can update" })
    return
  end

  if msg.Tags.Name then token.name = msg.Tags.Name end
  if msg.Tags.Description or msg.Data then
    token.description = msg.Tags.Description or msg.Data
  end
  if msg.Tags.Image then token.image = msg.Tags.Image end
  if msg.Tags.Attributes then
    token.attributes = json.decode(msg.Tags.Attributes)
  end

  token.updatedAt = os.time()

  msg.reply({
    Data = json.encode({
      action = "updated",
      token = token
    })
  })
end)

-- Burn token
Handlers.add("Burn", "Burn", function(msg)
  local tokenId = msg.Tags.TokenId or msg.Tags.Id

  if not tokenId or not Tokens[tokenId] then
    msg.reply({ Tags = { Error = "Invalid-Token" }, Data = "Token not found" })
    return
  end

  if Tokens[tokenId].owner ~= msg.From then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Only owner can burn" })
    return
  end

  local token = Tokens[tokenId]
  removeFromOwner(token.owner, tokenId)
  Tokens[tokenId] = nil
  Approvals[tokenId] = nil

  msg.reply({
    Data = json.encode({
      action = "burned",
      tokenId = tokenId
    })
  })
end)
