--[[
  Voting DAO App
  A decentralized governance system with proposals, voting, and execution.

  Vibe Prompt: "Build a DAO where token holders can create proposals,
  vote with their token balance as voting power, and execute passed
  proposals. Include quorum requirements and voting periods."

  Actions:
  - Propose: Create a new proposal
  - Vote: Vote on a proposal (for/against)
  - Execute: Execute a passed proposal
  - GetProposal: Get proposal details
  - ListProposals: List all proposals
  - GetVotes: Get votes for a proposal
  - Delegate: Delegate voting power
]]

local json = require("json")

-- Config
Config = Config or {
  votingPeriod = 86400 * 3,     -- 3 days in seconds
  executionDelay = 86400,       -- 1 day delay after passing
  quorumPercent = 10,           -- 10% of total supply needed
  passThreshold = 51,           -- 51% to pass
  proposalDeposit = 100         -- Deposit to create proposal
}

-- State
Proposals = Proposals or {}
ProposalCounter = ProposalCounter or 0
Balances = Balances or {}
Delegations = Delegations or {}    -- { delegator: delegate }
TotalSupply = TotalSupply or 1000000

-- Initialize some test balances
if not Balances._initialized then
  Balances._initialized = true
end

-- Helper: Get voting power (own balance + delegated)
local function getVotingPower(addr)
  local power = Balances[addr] or 0

  -- Add delegated power
  for delegator, delegate in pairs(Delegations) do
    if delegate == addr then
      power = power + (Balances[delegator] or 0)
    end
  end

  return power
end

-- Helper: Check if voting period is active
local function isVotingActive(proposal)
  local now = os.time()
  return now >= proposal.startTime and now <= proposal.endTime
end

-- Create a proposal
Handlers.add("Propose", "Propose", function(msg)
  local title = msg.Tags.Title
  local description = msg.Data or msg.Tags.Description
  local actionType = msg.Tags.ActionType  -- e.g., "transfer", "config", "custom"
  local actionData = msg.Tags.ActionData

  if not title or title == "" then
    msg.reply({ Tags = { Error = "Title-Required" }, Data = "Title is required" })
    return
  end

  local balance = Balances[msg.From] or 0
  if balance < Config.proposalDeposit then
    msg.reply({
      Tags = { Error = "Insufficient-Deposit" },
      Data = "Need " .. Config.proposalDeposit .. " tokens to create proposal"
    })
    return
  end

  -- Lock deposit
  Balances[msg.From] = balance - Config.proposalDeposit

  ProposalCounter = ProposalCounter + 1
  local id = tostring(ProposalCounter)

  local now = os.time()
  Proposals[id] = {
    id = id,
    title = title,
    description = description,
    proposer = msg.From,
    actionType = actionType,
    actionData = actionData,
    startTime = now,
    endTime = now + Config.votingPeriod,
    executionTime = now + Config.votingPeriod + Config.executionDelay,
    votes = { ["for"] = 0, against = 0 },
    voters = {},
    status = "active",
    deposit = Config.proposalDeposit,
    createdAt = now
  }

  msg.reply({
    Data = json.encode({
      action = "proposed",
      proposal = Proposals[id]
    })
  })
end)

-- Vote on a proposal
Handlers.add("Vote", "Vote", function(msg)
  local id = msg.Tags.ProposalId or msg.Tags.Id
  local vote = msg.Tags.Vote  -- "for" or "against"

  if not id or not Proposals[id] then
    msg.reply({ Tags = { Error = "Invalid-Proposal" }, Data = "Proposal not found" })
    return
  end

  if vote ~= "for" and vote ~= "against" then
    msg.reply({ Tags = { Error = "Invalid-Vote" }, Data = "Vote must be 'for' or 'against'" })
    return
  end

  local proposal = Proposals[id]

  if not isVotingActive(proposal) then
    msg.reply({ Tags = { Error = "Voting-Closed" }, Data = "Voting period has ended" })
    return
  end

  if proposal.voters[msg.From] then
    msg.reply({ Tags = { Error = "Already-Voted" }, Data = "You have already voted" })
    return
  end

  -- Check for delegation
  if Delegations[msg.From] then
    msg.reply({ Tags = { Error = "Delegated" }, Data = "Your voting power is delegated" })
    return
  end

  local power = getVotingPower(msg.From)
  if power <= 0 then
    msg.reply({ Tags = { Error = "No-Voting-Power" }, Data = "You have no voting power" })
    return
  end

  -- Record vote
  proposal.voters[msg.From] = { vote = vote, power = power, timestamp = os.time() }
  proposal.votes[vote] = proposal.votes[vote] + power

  msg.reply({
    Data = json.encode({
      action = "voted",
      proposalId = id,
      vote = vote,
      power = power,
      totals = proposal.votes
    })
  })
end)

-- Execute a passed proposal
Handlers.add("Execute", "Execute", function(msg)
  local id = msg.Tags.ProposalId or msg.Tags.Id

  if not id or not Proposals[id] then
    msg.reply({ Tags = { Error = "Invalid-Proposal" }, Data = "Proposal not found" })
    return
  end

  local proposal = Proposals[id]
  local now = os.time()

  if proposal.status ~= "active" then
    msg.reply({ Tags = { Error = "Not-Active" }, Data = "Proposal is " .. proposal.status })
    return
  end

  if now < proposal.endTime then
    msg.reply({ Tags = { Error = "Voting-Active" }, Data = "Voting period not ended" })
    return
  end

  -- Calculate results
  local totalVotes = proposal.votes["for"] + proposal.votes.against
  local quorumNeeded = math.floor(TotalSupply * Config.quorumPercent / 100)

  if totalVotes < quorumNeeded then
    proposal.status = "failed"
    proposal.failReason = "quorum"
    -- Return deposit
    Balances[proposal.proposer] = (Balances[proposal.proposer] or 0) + proposal.deposit

    msg.reply({
      Data = json.encode({
        action = "failed",
        reason = "Quorum not reached",
        votes = totalVotes,
        needed = quorumNeeded
      })
    })
    return
  end

  local forPercent = math.floor((proposal.votes["for"] / totalVotes) * 100)

  if forPercent < Config.passThreshold then
    proposal.status = "rejected"
    -- Return deposit
    Balances[proposal.proposer] = (Balances[proposal.proposer] or 0) + proposal.deposit

    msg.reply({
      Data = json.encode({
        action = "rejected",
        forPercent = forPercent,
        needed = Config.passThreshold
      })
    })
    return
  end

  if now < proposal.executionTime then
    msg.reply({
      Tags = { Error = "Execution-Delay" },
      Data = "Execution delay not passed. Can execute at " .. proposal.executionTime
    })
    return
  end

  -- Execute the proposal
  proposal.status = "executed"
  proposal.executedAt = now
  proposal.executedBy = msg.From

  -- Return deposit on success
  Balances[proposal.proposer] = (Balances[proposal.proposer] or 0) + proposal.deposit

  msg.reply({
    Data = json.encode({
      action = "executed",
      proposal = proposal
    })
  })
end)

-- Get proposal details
Handlers.add("GetProposal", "GetProposal", function(msg)
  local id = msg.Tags.ProposalId or msg.Tags.Id

  if not id or not Proposals[id] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Proposal not found" })
    return
  end

  local proposal = Proposals[id]
  local totalVotes = proposal.votes["for"] + proposal.votes.against
  local quorumNeeded = math.floor(TotalSupply * Config.quorumPercent / 100)

  msg.reply({
    Data = json.encode({
      proposal = proposal,
      quorumReached = totalVotes >= quorumNeeded,
      quorumNeeded = quorumNeeded,
      totalVotes = totalVotes,
      forPercent = totalVotes > 0 and math.floor((proposal.votes["for"] / totalVotes) * 100) or 0,
      timeRemaining = math.max(0, proposal.endTime - os.time())
    })
  })
end)

-- List all proposals
Handlers.add("ListProposals", "ListProposals", function(msg)
  local status = msg.Tags.Status  -- active, executed, failed, rejected

  local result = {}
  for id, proposal in pairs(Proposals) do
    if not status or proposal.status == status then
      table.insert(result, {
        id = proposal.id,
        title = proposal.title,
        proposer = proposal.proposer,
        status = proposal.status,
        votes = proposal.votes,
        endTime = proposal.endTime
      })
    end
  end

  -- Sort by id descending
  table.sort(result, function(a, b)
    return tonumber(a.id) > tonumber(b.id)
  end)

  msg.reply({
    Data = json.encode({ proposals = result, count = #result })
  })
end)

-- Get votes for a proposal
Handlers.add("GetVotes", "GetVotes", function(msg)
  local id = msg.Tags.ProposalId or msg.Tags.Id

  if not id or not Proposals[id] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Proposal not found" })
    return
  end

  msg.reply({
    Data = json.encode({
      proposalId = id,
      totals = Proposals[id].votes,
      voters = Proposals[id].voters
    })
  })
end)

-- Delegate voting power
Handlers.add("Delegate", "Delegate", function(msg)
  local delegate = msg.Tags.To or msg.Tags.Delegate

  if not delegate then
    -- Remove delegation
    Delegations[msg.From] = nil
    msg.reply({
      Data = json.encode({ action = "undelegated" })
    })
    return
  end

  if delegate == msg.From then
    msg.reply({ Tags = { Error = "Self-Delegation" }, Data = "Cannot delegate to yourself" })
    return
  end

  Delegations[msg.From] = delegate

  msg.reply({
    Data = json.encode({
      action = "delegated",
      to = delegate,
      power = Balances[msg.From] or 0
    })
  })
end)

-- Set balance (for testing)
Handlers.add("SetBalance", "SetBalance", function(msg)
  local target = msg.Tags.Target or msg.From
  local amount = tonumber(msg.Tags.Amount)

  if amount then
    Balances[target] = amount
  end

  msg.reply({
    Data = json.encode({ balance = Balances[target] or 0, target = target })
  })
end)
