--[[
  Todo List App
  A personal task management application with categories, priorities, and due dates.

  Vibe Prompt: "Create a todo app where I can add tasks with priorities and
  categories. Let me mark them complete, filter by status, and track my
  productivity stats."

  Actions:
  - Add: Add a new todo
  - Complete: Mark todo as complete
  - Delete: Delete a todo
  - List: List todos with filters
  - Update: Update a todo
  - Stats: Get productivity statistics
  - Categories: List all categories
]]

local json = require("json")

-- State
Todos = Todos or {}      -- { owner: { id: todo } }
IdCounter = IdCounter or 0

-- Priority levels
local PRIORITIES = { low = 1, medium = 2, high = 3, urgent = 4 }

-- Helper to get user todos
local function getUserTodos(addr)
  Todos[addr] = Todos[addr] or {}
  return Todos[addr]
end

-- Add a new todo
Handlers.add("Add", "Add", function(msg)
  local title = msg.Tags.Title or msg.Data

  if not title or title == "" then
    msg.reply({ Tags = { Error = "Title-Required" }, Data = "Title is required" })
    return
  end

  IdCounter = IdCounter + 1
  local id = tostring(IdCounter)

  local todo = {
    id = id,
    title = title,
    description = msg.Tags.Description or "",
    category = msg.Tags.Category or "general",
    priority = msg.Tags.Priority or "medium",
    dueDate = msg.Tags.DueDate,
    status = "pending",
    createdAt = os.time(),
    completedAt = nil
  }

  local userTodos = getUserTodos(msg.From)
  userTodos[id] = todo

  msg.reply({
    Data = json.encode({ action = "added", todo = todo })
  })
end)

-- Complete a todo
Handlers.add("Complete", "Complete", function(msg)
  local id = msg.Tags.Id or msg.Tags.ID

  if not id then
    msg.reply({ Tags = { Error = "Id-Required" }, Data = "Todo ID is required" })
    return
  end

  local userTodos = getUserTodos(msg.From)
  local todo = userTodos[id]

  if not todo then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Todo not found" })
    return
  end

  todo.status = "completed"
  todo.completedAt = os.time()

  msg.reply({
    Data = json.encode({ action = "completed", todo = todo })
  })
end)

-- Delete a todo
Handlers.add("Delete", "Delete", function(msg)
  local id = msg.Tags.Id or msg.Tags.ID

  if not id then
    msg.reply({ Tags = { Error = "Id-Required" }, Data = "Todo ID is required" })
    return
  end

  local userTodos = getUserTodos(msg.From)

  if not userTodos[id] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Todo not found" })
    return
  end

  local deleted = userTodos[id]
  userTodos[id] = nil

  msg.reply({
    Data = json.encode({ action = "deleted", todo = deleted })
  })
end)

-- List todos
Handlers.add("List", "List", function(msg)
  local status = msg.Tags.Status  -- pending, completed, all
  local category = msg.Tags.Category
  local priority = msg.Tags.Priority

  local userTodos = getUserTodos(msg.From)
  local result = {}

  for id, todo in pairs(userTodos) do
    local include = true

    if status and status ~= "all" and todo.status ~= status then
      include = false
    end

    if category and todo.category ~= category then
      include = false
    end

    if priority and todo.priority ~= priority then
      include = false
    end

    if include then
      table.insert(result, todo)
    end
  end

  -- Sort by priority (descending) then by creation date
  table.sort(result, function(a, b)
    local pa = PRIORITIES[a.priority] or 0
    local pb = PRIORITIES[b.priority] or 0
    if pa ~= pb then return pa > pb end
    return a.createdAt < b.createdAt
  end)

  msg.reply({
    Data = json.encode({
      todos = result,
      count = #result,
      filters = { status = status, category = category, priority = priority }
    })
  })
end)

-- Update a todo
Handlers.add("Update", "Update", function(msg)
  local id = msg.Tags.Id or msg.Tags.ID

  if not id then
    msg.reply({ Tags = { Error = "Id-Required" }, Data = "Todo ID is required" })
    return
  end

  local userTodos = getUserTodos(msg.From)
  local todo = userTodos[id]

  if not todo then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Todo not found" })
    return
  end

  -- Update fields if provided
  if msg.Tags.Title then todo.title = msg.Tags.Title end
  if msg.Tags.Description then todo.description = msg.Tags.Description end
  if msg.Tags.Category then todo.category = msg.Tags.Category end
  if msg.Tags.Priority then todo.priority = msg.Tags.Priority end
  if msg.Tags.DueDate then todo.dueDate = msg.Tags.DueDate end
  if msg.Tags.Status then
    todo.status = msg.Tags.Status
    if msg.Tags.Status == "completed" then
      todo.completedAt = os.time()
    end
  end

  todo.updatedAt = os.time()

  msg.reply({
    Data = json.encode({ action = "updated", todo = todo })
  })
end)

-- Get productivity stats
Handlers.add("Stats", "Stats", function(msg)
  local userTodos = getUserTodos(msg.From)

  local stats = {
    total = 0,
    pending = 0,
    completed = 0,
    byCategory = {},
    byPriority = { low = 0, medium = 0, high = 0, urgent = 0 },
    completionRate = 0,
    avgCompletionTime = 0
  }

  local totalCompletionTime = 0
  local completedCount = 0

  for id, todo in pairs(userTodos) do
    stats.total = stats.total + 1

    if todo.status == "completed" then
      stats.completed = stats.completed + 1
      if todo.completedAt and todo.createdAt then
        totalCompletionTime = totalCompletionTime + (todo.completedAt - todo.createdAt)
        completedCount = completedCount + 1
      end
    else
      stats.pending = stats.pending + 1
    end

    -- By category
    stats.byCategory[todo.category] = (stats.byCategory[todo.category] or 0) + 1

    -- By priority
    if stats.byPriority[todo.priority] then
      stats.byPriority[todo.priority] = stats.byPriority[todo.priority] + 1
    end
  end

  if stats.total > 0 then
    stats.completionRate = math.floor((stats.completed / stats.total) * 100)
  end

  if completedCount > 0 then
    stats.avgCompletionTime = math.floor(totalCompletionTime / completedCount)
  end

  msg.reply({
    Data = json.encode(stats)
  })
end)

-- List categories
Handlers.add("Categories", "Categories", function(msg)
  local userTodos = getUserTodos(msg.From)
  local categories = {}

  for id, todo in pairs(userTodos) do
    if not categories[todo.category] then
      categories[todo.category] = { count = 0, pending = 0, completed = 0 }
    end
    categories[todo.category].count = categories[todo.category].count + 1
    if todo.status == "completed" then
      categories[todo.category].completed = categories[todo.category].completed + 1
    else
      categories[todo.category].pending = categories[todo.category].pending + 1
    end
  end

  msg.reply({
    Data = json.encode({ categories = categories })
  })
end)
