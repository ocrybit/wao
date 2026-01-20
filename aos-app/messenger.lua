-- Messenger AOS Application
-- Demonstrates inter-device communication via push@1.0
-- Messages sent via ao.send() are delivered to target processes

local inbox = {}
local outbox = {}
local contacts = {}
local myName = nil

-- Register this process with a name
Handlers.add("Register", "Register", function(msg)
  myName = msg.Name or msg.Tags.Name or "Anonymous"
  msg.reply({
    Data = "Registered as: " .. myName,
    Name = myName,
    Action = "Registered"
  })
end)

-- Get my registration info
Handlers.add("WhoAmI", "WhoAmI", function(msg)
  msg.reply({
    Data = myName or "Not registered",
    Name = myName or "Unknown",
    Registered = myName and "true" or "false"
  })
end)

-- Add a contact (another process)
Handlers.add("AddContact", "AddContact", function(msg)
  local contactId = msg.ContactId or msg.Tags.ContactId
  local contactName = msg.ContactName or msg.Tags.ContactName or "Unknown"
  if contactId then
    contacts[contactId] = contactName
    msg.reply({
      Data = "Contact added: " .. contactName,
      ContactId = contactId,
      ContactName = contactName,
      Action = "ContactAdded"
    })
  else
    msg.reply({
      Data = "Error: ContactId required",
      Error = "MissingContactId"
    })
  end
end)

-- List all contacts
Handlers.add("ListContacts", "ListContacts", function(msg)
  local contactList = ""
  local count = 0
  for id, name in pairs(contacts) do
    if count > 0 then contactList = contactList .. ", " end
    contactList = contactList .. name .. "(" .. id:sub(1, 8) .. "...)"
    count = count + 1
  end
  msg.reply({
    Data = count > 0 and contactList or "No contacts",
    Count = tostring(count)
  })
end)

-- Send a message to another process (uses push@1.0)
Handlers.add("SendMessage", "SendMessage", function(msg)
  local target = msg.Recipient or msg.Tags.Recipient
  local content = msg.Content or msg.Tags.Content or msg.Data or ""

  if not target then
    msg.reply({
      Data = "Error: Recipient required",
      Error = "MissingRecipient"
    })
    return
  end

  -- Record in our outbox
  local outboxEntry = {
    to = target,
    content = content,
    timestamp = msg.Timestamp or "unknown",
    from = msg.From
  }
  table.insert(outbox, outboxEntry)

  -- Use ao.send() to deliver message via push@1.0
  -- This queues the message to the outbox which push@1.0 will deliver
  Send({
    Target = target,
    Action = "ReceiveMessage",
    Sender = msg.From,
    SenderName = myName or "Unknown",
    Content = content,
    OriginalTimestamp = msg.Timestamp or "unknown"
  })

  msg.reply({
    Data = "Message sent to " .. target:sub(1, 12) .. "...",
    Recipient = target,
    Content = content,
    Action = "MessageSent",
    OutboxCount = tostring(#outbox)
  })
end)

-- Receive a message from another process
Handlers.add("ReceiveMessage", "ReceiveMessage", function(msg)
  local sender = msg.Sender or msg.From
  local senderName = msg.SenderName or contacts[sender] or "Unknown"
  local content = msg.Content or msg.Data or ""

  -- Store in inbox
  local inboxEntry = {
    from = sender,
    fromName = senderName,
    content = content,
    timestamp = msg.OriginalTimestamp or msg.Timestamp or "unknown",
    receivedAt = msg.Timestamp
  }
  table.insert(inbox, inboxEntry)

  -- Send acknowledgment back via push@1.0
  Send({
    Target = sender,
    Action = "MessageReceived",
    OriginalContent = content,
    Receiver = ao.id,
    ReceiverName = myName or "Unknown"
  })

  msg.reply({
    Data = "Message received from " .. senderName,
    From = sender,
    FromName = senderName,
    Content = content,
    InboxCount = tostring(#inbox)
  })
end)

-- Handle message receipt acknowledgment
Handlers.add("MessageReceived", "MessageReceived", function(msg)
  -- Update outbox with delivery confirmation
  local receiver = msg.Receiver
  local receiverName = msg.ReceiverName or "Unknown"

  msg.reply({
    Data = "Delivery confirmed by " .. receiverName,
    Receiver = receiver,
    ReceiverName = receiverName,
    Action = "DeliveryConfirmed"
  })
end)

-- Get inbox messages
Handlers.add("GetInbox", "GetInbox", function(msg)
  local limit = tonumber(msg.Limit or msg.Tags.Limit) or 10
  local messages = {}
  local count = math.min(#inbox, limit)

  for i = #inbox, math.max(1, #inbox - count + 1), -1 do
    table.insert(messages, inbox[i])
  end

  msg.reply({
    Data = tostring(#inbox) .. " messages in inbox",
    InboxCount = tostring(#inbox),
    RecentCount = tostring(count)
  })
end)

-- Get outbox messages
Handlers.add("GetOutbox", "GetOutbox", function(msg)
  msg.reply({
    Data = tostring(#outbox) .. " messages in outbox",
    OutboxCount = tostring(#outbox)
  })
end)

-- Clear inbox
Handlers.add("ClearInbox", "ClearInbox", function(msg)
  inbox = {}
  msg.reply({
    Data = "Inbox cleared",
    InboxCount = "0"
  })
end)

-- Broadcast to all contacts (uses push@1.0 for each)
Handlers.add("Broadcast", "Broadcast", function(msg)
  local content = msg.Content or msg.Tags.Content or msg.Data or ""
  local count = 0

  for contactId, contactName in pairs(contacts) do
    Send({
      Target = contactId,
      Action = "ReceiveMessage",
      Sender = msg.From,
      SenderName = myName or "Unknown",
      Content = content,
      IsBroadcast = "true"
    })
    count = count + 1
  end

  msg.reply({
    Data = "Broadcast sent to " .. tostring(count) .. " contacts",
    RecipientsCount = tostring(count),
    Content = content,
    Action = "BroadcastSent"
  })
end)

-- Ping another process to check if it's alive
Handlers.add("Ping", "Ping", function(msg)
  local target = msg.Target or (msg.Tags and msg.Tags.Target) or nil
  if not target then
    msg.reply({
      Data = "Error: Target required",
      Error = "MissingTarget"
    })
    return
  end

  Send({
    Target = target,
    Action = "Pong",
    PingSender = msg.From,
    PingTimestamp = msg.Timestamp or "unknown"
  })

  msg.reply({
    Data = "Ping sent to " .. target:sub(1, 12) .. "...",
    Target = target,
    Action = "PingSent"
  })
end)

-- Respond to ping
Handlers.add("Pong", "Pong", function(msg)
  local pingSender = msg.PingSender or msg.From

  Send({
    Target = pingSender,
    Action = "PongResponse",
    Responder = ao.id,
    ResponderName = myName or "Unknown",
    OriginalPingTimestamp = msg.PingTimestamp
  })

  msg.reply({
    Data = "Pong sent back to " .. pingSender:sub(1, 12) .. "...",
    PingSender = pingSender
  })
end)

-- Handle pong response
Handlers.add("PongResponse", "PongResponse", function(msg)
  local responder = msg.Responder
  local responderName = msg.ResponderName or "Unknown"

  msg.reply({
    Data = "Pong received from " .. responderName,
    Responder = responder,
    ResponderName = responderName,
    Latency = "calculated",
    Action = "PongReceived"
  })
end)

-- Info handler
Handlers.add("Info", "Info", function(msg)
  msg.reply({
    Data = "Messenger App v1.0 - Inter-Device Communication via push@1.0",
    Name = "Messenger",
    Version = "1.0",
    MyName = myName or "Not registered",
    InboxCount = tostring(#inbox),
    OutboxCount = tostring(#outbox),
    ContactsCount = tostring(#contacts or 0),
    ["Push-Device"] = "push@1.0"
  })
end)
