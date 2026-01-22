--[[
  Chatroom App
  A real-time messaging application with rooms, members, and message history.

  Vibe Prompt: "Build a chatroom where users can join rooms, send messages,
  see who's online, and get message history. Support private messages too."

  Actions:
  - Register: Register username
  - Join: Join a room
  - Leave: Leave a room
  - Say: Send message to current room
  - Whisper: Send private message
  - Members: List room members
  - History: Get message history
  - Rooms: List available rooms
]]

local json = require("json")

-- State
Users = Users or {}           -- { address: { name, room, joinedAt } }
Rooms = Rooms or { general = { members = {}, messages = {} } }
PrivateMessages = PrivateMessages or {}  -- { address: [ messages ] }

local MAX_HISTORY = 100

-- Register username
Handlers.add("Register", "Register", function(msg)
  local name = msg.Tags.Name or msg.Tags.Username

  if not name or name == "" then
    msg.reply({ Tags = { Error = "Name-Required" }, Data = "Username is required" })
    return
  end

  -- Check if name is taken
  for addr, user in pairs(Users) do
    if user.name == name and addr ~= msg.From then
      msg.reply({ Tags = { Error = "Name-Taken" }, Data = "Username already taken" })
      return
    end
  end

  Users[msg.From] = Users[msg.From] or {}
  Users[msg.From].name = name
  Users[msg.From].joinedAt = os.time()
  Users[msg.From].room = Users[msg.From].room or "general"

  msg.reply({
    Data = json.encode({
      action = "registered",
      name = name,
      room = Users[msg.From].room
    })
  })
end)

-- Join a room
Handlers.add("Join", "Join", function(msg)
  local room = msg.Tags.Room or "general"

  if not Users[msg.From] then
    msg.reply({ Tags = { Error = "Not-Registered" }, Data = "Please register first" })
    return
  end

  -- Create room if doesn't exist
  if not Rooms[room] then
    Rooms[room] = { members = {}, messages = {}, createdBy = msg.From }
  end

  -- Leave old room
  local oldRoom = Users[msg.From].room
  if oldRoom and Rooms[oldRoom] then
    Rooms[oldRoom].members[msg.From] = nil
  end

  -- Join new room
  Users[msg.From].room = room
  Rooms[room].members[msg.From] = Users[msg.From].name

  -- Announce join
  table.insert(Rooms[room].messages, {
    type = "system",
    text = Users[msg.From].name .. " joined the room",
    timestamp = os.time()
  })

  msg.reply({
    Data = json.encode({
      action = "joined",
      room = room,
      members = Rooms[room].members
    })
  })
end)

-- Leave current room
Handlers.add("Leave", "Leave", function(msg)
  if not Users[msg.From] or not Users[msg.From].room then
    msg.reply({ Tags = { Error = "Not-In-Room" }, Data = "You're not in a room" })
    return
  end

  local room = Users[msg.From].room
  local name = Users[msg.From].name

  Rooms[room].members[msg.From] = nil

  table.insert(Rooms[room].messages, {
    type = "system",
    text = name .. " left the room",
    timestamp = os.time()
  })

  Users[msg.From].room = nil

  msg.reply({
    Data = json.encode({ action = "left", room = room })
  })
end)

-- Send message to room
Handlers.add("Say", "Say", function(msg)
  if not Users[msg.From] then
    msg.reply({ Tags = { Error = "Not-Registered" }, Data = "Please register first" })
    return
  end

  local room = Users[msg.From].room
  if not room or not Rooms[room] then
    msg.reply({ Tags = { Error = "Not-In-Room" }, Data = "Join a room first" })
    return
  end

  local text = msg.Data or msg.Tags.Message
  if not text or text == "" then
    msg.reply({ Tags = { Error = "Empty-Message" }, Data = "Message cannot be empty" })
    return
  end

  local message = {
    type = "message",
    from = msg.From,
    name = Users[msg.From].name,
    text = text,
    timestamp = os.time()
  }

  table.insert(Rooms[room].messages, message)

  -- Trim history
  while #Rooms[room].messages > MAX_HISTORY do
    table.remove(Rooms[room].messages, 1)
  end

  -- Notify all room members
  for memberAddr, _ in pairs(Rooms[room].members) do
    if memberAddr ~= msg.From then
      ao.send({
        Target = memberAddr,
        Tags = { Action = "New-Message", Room = room },
        Data = json.encode(message)
      })
    end
  end

  msg.reply({
    Data = json.encode({ action = "sent", room = room, message = message })
  })
end)

-- Send private message
Handlers.add("Whisper", "Whisper", function(msg)
  local recipient = msg.Tags.To or msg.Tags.Recipient
  local text = msg.Data or msg.Tags.Message

  if not Users[msg.From] then
    msg.reply({ Tags = { Error = "Not-Registered" }, Data = "Please register first" })
    return
  end

  if not recipient then
    msg.reply({ Tags = { Error = "Recipient-Required" }, Data = "Recipient is required" })
    return
  end

  if not text or text == "" then
    msg.reply({ Tags = { Error = "Empty-Message" }, Data = "Message cannot be empty" })
    return
  end

  local message = {
    from = msg.From,
    name = Users[msg.From].name,
    text = text,
    timestamp = os.time()
  }

  -- Store for recipient
  PrivateMessages[recipient] = PrivateMessages[recipient] or {}
  table.insert(PrivateMessages[recipient], message)

  -- Trim
  while #PrivateMessages[recipient] > MAX_HISTORY do
    table.remove(PrivateMessages[recipient], 1)
  end

  -- Notify recipient
  ao.send({
    Target = recipient,
    Tags = { Action = "Private-Message" },
    Data = json.encode(message)
  })

  msg.reply({
    Data = json.encode({ action = "whispered", to = recipient })
  })
end)

-- List room members
Handlers.add("Members", "Members", function(msg)
  local room = msg.Tags.Room or (Users[msg.From] and Users[msg.From].room) or "general"

  if not Rooms[room] then
    msg.reply({ Tags = { Error = "Room-Not-Found" }, Data = "Room doesn't exist" })
    return
  end

  msg.reply({
    Data = json.encode({
      room = room,
      members = Rooms[room].members,
      count = 0  -- Will be counted below
    })
  })
end)

-- Get message history
Handlers.add("History", "History", function(msg)
  local room = msg.Tags.Room or (Users[msg.From] and Users[msg.From].room) or "general"
  local limit = tonumber(msg.Tags.Limit) or 50

  if not Rooms[room] then
    msg.reply({ Tags = { Error = "Room-Not-Found" }, Data = "Room doesn't exist" })
    return
  end

  local messages = Rooms[room].messages
  local result = {}
  local start = math.max(1, #messages - limit + 1)

  for i = start, #messages do
    table.insert(result, messages[i])
  end

  msg.reply({
    Data = json.encode({
      room = room,
      messages = result,
      total = #messages
    })
  })
end)

-- List rooms
Handlers.add("Rooms", "Rooms", function(msg)
  local result = {}
  for name, room in pairs(Rooms) do
    local memberCount = 0
    for _ in pairs(room.members) do
      memberCount = memberCount + 1
    end
    table.insert(result, {
      name = name,
      members = memberCount,
      messages = #room.messages
    })
  end

  msg.reply({
    Data = json.encode({ rooms = result })
  })
end)

-- Get private messages
Handlers.add("Inbox", "Inbox", function(msg)
  local messages = PrivateMessages[msg.From] or {}
  msg.reply({
    Data = json.encode({ messages = messages, count = #messages })
  })
end)
