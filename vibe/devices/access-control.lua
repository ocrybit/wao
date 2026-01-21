--[[
  Access Control Device
  A permission-based access control system with roles and capabilities.

  Vibe Prompt: "Create an access control device with roles and permissions.
  Support admin, moderator, member roles. Allow fine-grained action permissions
  and role hierarchy."

  This device provides authentication and authorization for other processes.

  Actions:
  - GrantRole: Assign a role to an address
  - RevokeRole: Remove a role from an address
  - SetPermission: Set permission for a role
  - CheckAccess: Check if address has permission
  - GetRoles: Get roles for an address
  - GetPermissions: Get permissions for a role
  - CreateRole: Create a custom role
  - DeleteRole: Delete a custom role
]]

local json = require("json")

-- Built-in roles
local ROLES = {
  OWNER = "owner",
  ADMIN = "admin",
  MODERATOR = "moderator",
  MEMBER = "member",
  GUEST = "guest"
}

-- Role hierarchy (higher number = more permissions)
RoleHierarchy = RoleHierarchy or {
  [ROLES.OWNER] = 100,
  [ROLES.ADMIN] = 80,
  [ROLES.MODERATOR] = 50,
  [ROLES.MEMBER] = 20,
  [ROLES.GUEST] = 0
}

-- State
UserRoles = UserRoles or {}        -- { address: { role: true, ... } }
RolePermissions = RolePermissions or {}  -- { role: { permission: true, ... } }
CustomRoles = CustomRoles or {}    -- { roleName: { level, description } }
PermissionOverrides = PermissionOverrides or {}  -- { address: { permission: bool } }

-- Owner
Owner = Owner or ao.env.Process.Owner

-- Initialize owner
if not UserRoles[Owner] then
  UserRoles[Owner] = { [ROLES.OWNER] = true, [ROLES.ADMIN] = true }
end

-- Initialize default permissions
if not RolePermissions[ROLES.OWNER] then
  RolePermissions[ROLES.OWNER] = { ["*"] = true }  -- All permissions
  RolePermissions[ROLES.ADMIN] = {
    ["grant-role"] = true,
    ["revoke-role"] = true,
    ["set-permission"] = true,
    ["manage-members"] = true,
    ["configure"] = true,
    ["read"] = true,
    ["write"] = true
  }
  RolePermissions[ROLES.MODERATOR] = {
    ["manage-members"] = true,
    ["delete-content"] = true,
    ["mute-user"] = true,
    ["read"] = true,
    ["write"] = true
  }
  RolePermissions[ROLES.MEMBER] = {
    ["read"] = true,
    ["write"] = true,
    ["comment"] = true
  }
  RolePermissions[ROLES.GUEST] = {
    ["read"] = true
  }
end

-- Helper: Get highest role for address
local function getHighestRole(addr)
  local roles = UserRoles[addr] or {}
  local highest = ROLES.GUEST
  local highestLevel = -1

  for role, active in pairs(roles) do
    if active then
      local level = RoleHierarchy[role] or (CustomRoles[role] and CustomRoles[role].level) or 0
      if level > highestLevel then
        highestLevel = level
        highest = role
      end
    end
  end

  return highest, highestLevel
end

-- Helper: Check if address has permission
local function hasPermission(addr, permission)
  -- Check direct override first
  if PermissionOverrides[addr] and PermissionOverrides[addr][permission] ~= nil then
    return PermissionOverrides[addr][permission]
  end

  local roles = UserRoles[addr] or {}

  for role, active in pairs(roles) do
    if active then
      local perms = RolePermissions[role] or {}
      if perms["*"] or perms[permission] then
        return true
      end
    end
  end

  -- Check guest permissions if no roles
  local guestPerms = RolePermissions[ROLES.GUEST] or {}
  return guestPerms[permission] or false
end

-- Helper: Check if granter can grant role
local function canGrantRole(granter, roleToGrant)
  local _, granterLevel = getHighestRole(granter)
  local targetLevel = RoleHierarchy[roleToGrant] or
    (CustomRoles[roleToGrant] and CustomRoles[roleToGrant].level) or 0

  -- Can only grant roles lower than own level
  return granterLevel > targetLevel
end

-- Grant role to address
Handlers.add("GrantRole", "GrantRole", function(msg)
  local target = msg.Tags.Target or msg.Tags.Address
  local role = msg.Tags.Role

  if not target or not role then
    msg.reply({ Tags = { Error = "Missing-Params" }, Data = "Target and Role required" })
    return
  end

  -- Check permission
  if not hasPermission(msg.From, "grant-role") then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No grant-role permission" })
    return
  end

  -- Check hierarchy
  if not canGrantRole(msg.From, role) then
    msg.reply({ Tags = { Error = "Hierarchy-Violation" }, Data = "Cannot grant role equal or above your level" })
    return
  end

  -- Check if role exists
  if not RoleHierarchy[role] and not CustomRoles[role] then
    msg.reply({ Tags = { Error = "Invalid-Role" }, Data = "Role does not exist" })
    return
  end

  -- Grant role
  UserRoles[target] = UserRoles[target] or {}
  UserRoles[target][role] = true

  -- Notify target
  ao.send({
    Target = target,
    Tags = { Action = "Role-Granted", Role = role },
    Data = json.encode({ role = role, grantedBy = msg.From })
  })

  msg.reply({
    Data = json.encode({
      action = "role-granted",
      target = target,
      role = role
    })
  })
end)

-- Revoke role from address
Handlers.add("RevokeRole", "RevokeRole", function(msg)
  local target = msg.Tags.Target or msg.Tags.Address
  local role = msg.Tags.Role

  if not target or not role then
    msg.reply({ Tags = { Error = "Missing-Params" }, Data = "Target and Role required" })
    return
  end

  -- Check permission
  if not hasPermission(msg.From, "revoke-role") then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No revoke-role permission" })
    return
  end

  -- Check hierarchy
  if not canGrantRole(msg.From, role) then
    msg.reply({ Tags = { Error = "Hierarchy-Violation" }, Data = "Cannot revoke role equal or above your level" })
    return
  end

  -- Prevent revoking owner's owner role
  if target == Owner and role == ROLES.OWNER then
    msg.reply({ Tags = { Error = "Cannot-Revoke-Owner" }, Data = "Cannot revoke owner's owner role" })
    return
  end

  -- Revoke role
  if UserRoles[target] then
    UserRoles[target][role] = nil
  end

  -- Notify target
  ao.send({
    Target = target,
    Tags = { Action = "Role-Revoked", Role = role },
    Data = json.encode({ role = role, revokedBy = msg.From })
  })

  msg.reply({
    Data = json.encode({
      action = "role-revoked",
      target = target,
      role = role
    })
  })
end)

-- Set permission for a role
Handlers.add("SetPermission", "SetPermission", function(msg)
  local role = msg.Tags.Role
  local permission = msg.Tags.Permission
  local allowed = msg.Tags.Allowed ~= "false"

  if not role or not permission then
    msg.reply({ Tags = { Error = "Missing-Params" }, Data = "Role and Permission required" })
    return
  end

  -- Check permission
  if not hasPermission(msg.From, "set-permission") then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No set-permission permission" })
    return
  end

  -- Check hierarchy
  if not canGrantRole(msg.From, role) then
    msg.reply({ Tags = { Error = "Hierarchy-Violation" }, Data = "Cannot modify role equal or above your level" })
    return
  end

  RolePermissions[role] = RolePermissions[role] or {}
  RolePermissions[role][permission] = allowed

  msg.reply({
    Data = json.encode({
      action = "permission-set",
      role = role,
      permission = permission,
      allowed = allowed
    })
  })
end)

-- Set direct permission override for address
Handlers.add("SetOverride", "SetOverride", function(msg)
  local target = msg.Tags.Target or msg.Tags.Address
  local permission = msg.Tags.Permission
  local allowed = msg.Tags.Allowed

  if not target or not permission then
    msg.reply({ Tags = { Error = "Missing-Params" }, Data = "Target and Permission required" })
    return
  end

  -- Check permission
  if not hasPermission(msg.From, "set-permission") then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No set-permission permission" })
    return
  end

  PermissionOverrides[target] = PermissionOverrides[target] or {}

  if allowed == nil or allowed == "remove" then
    PermissionOverrides[target][permission] = nil
  else
    PermissionOverrides[target][permission] = allowed == "true"
  end

  msg.reply({
    Data = json.encode({
      action = "override-set",
      target = target,
      permission = permission,
      value = PermissionOverrides[target][permission]
    })
  })
end)

-- Check if address has access
Handlers.add("CheckAccess", "CheckAccess", function(msg)
  local target = msg.Tags.Target or msg.Tags.Address or msg.From
  local permission = msg.Tags.Permission or msg.Tags.Action

  if not permission then
    msg.reply({ Tags = { Error = "Permission-Required" }, Data = "Permission to check is required" })
    return
  end

  local allowed = hasPermission(target, permission)
  local highestRole, level = getHighestRole(target)

  msg.reply({
    Tags = {
      Allowed = tostring(allowed),
      Role = highestRole
    },
    Data = json.encode({
      target = target,
      permission = permission,
      allowed = allowed,
      role = highestRole,
      level = level
    })
  })
end)

-- Get roles for an address
Handlers.add("GetRoles", "GetRoles", function(msg)
  local target = msg.Tags.Target or msg.Tags.Address or msg.From

  local roles = {}
  local highestRole, level = getHighestRole(target)

  if UserRoles[target] then
    for role, active in pairs(UserRoles[target]) do
      if active then
        table.insert(roles, {
          name = role,
          level = RoleHierarchy[role] or (CustomRoles[role] and CustomRoles[role].level) or 0
        })
      end
    end
  end

  -- Sort by level
  table.sort(roles, function(a, b) return a.level > b.level end)

  msg.reply({
    Data = json.encode({
      target = target,
      roles = roles,
      highestRole = highestRole,
      level = level
    })
  })
end)

-- Get permissions for a role
Handlers.add("GetPermissions", "GetPermissions", function(msg)
  local role = msg.Tags.Role

  if not role then
    msg.reply({ Tags = { Error = "Role-Required" }, Data = "Role is required" })
    return
  end

  local perms = RolePermissions[role] or {}
  local permList = {}

  for perm, allowed in pairs(perms) do
    if allowed then
      table.insert(permList, perm)
    end
  end

  msg.reply({
    Data = json.encode({
      role = role,
      level = RoleHierarchy[role] or (CustomRoles[role] and CustomRoles[role].level) or 0,
      permissions = permList
    })
  })
end)

-- Create custom role
Handlers.add("CreateRole", "CreateRole", function(msg)
  local name = msg.Tags.Name or msg.Tags.Role
  local level = tonumber(msg.Tags.Level)
  local description = msg.Data or msg.Tags.Description

  if not name or not level then
    msg.reply({ Tags = { Error = "Missing-Params" }, Data = "Name and Level required" })
    return
  end

  -- Check permission (only admins can create roles)
  if not hasPermission(msg.From, "grant-role") then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No permission to create roles" })
    return
  end

  -- Check level isn't above creator's level
  local _, creatorLevel = getHighestRole(msg.From)
  if level >= creatorLevel then
    msg.reply({ Tags = { Error = "Hierarchy-Violation" }, Data = "Cannot create role at or above your level" })
    return
  end

  -- Check for collision with built-in roles
  if RoleHierarchy[name] then
    msg.reply({ Tags = { Error = "Reserved-Name" }, Data = "Cannot use built-in role name" })
    return
  end

  CustomRoles[name] = {
    level = level,
    description = description,
    createdBy = msg.From,
    createdAt = os.time()
  }

  RolePermissions[name] = RolePermissions[name] or {}

  msg.reply({
    Data = json.encode({
      action = "role-created",
      role = name,
      level = level
    })
  })
end)

-- Delete custom role
Handlers.add("DeleteRole", "DeleteRole", function(msg)
  local name = msg.Tags.Name or msg.Tags.Role

  if not name then
    msg.reply({ Tags = { Error = "Name-Required" }, Data = "Role name required" })
    return
  end

  -- Check permission
  if not hasPermission(msg.From, "grant-role") then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "No permission to delete roles" })
    return
  end

  -- Cannot delete built-in roles
  if RoleHierarchy[name] then
    msg.reply({ Tags = { Error = "Cannot-Delete-Builtin" }, Data = "Cannot delete built-in role" })
    return
  end

  if not CustomRoles[name] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Role not found" })
    return
  end

  -- Remove role from all users
  for addr, roles in pairs(UserRoles) do
    roles[name] = nil
  end

  CustomRoles[name] = nil
  RolePermissions[name] = nil

  msg.reply({
    Data = json.encode({
      action = "role-deleted",
      role = name
    })
  })
end)

-- List all roles
Handlers.add("ListRoles", "ListRoles", function(msg)
  local roles = {}

  -- Built-in roles
  for name, level in pairs(RoleHierarchy) do
    table.insert(roles, {
      name = name,
      level = level,
      builtin = true,
      permissions = RolePermissions[name] or {}
    })
  end

  -- Custom roles
  for name, info in pairs(CustomRoles) do
    table.insert(roles, {
      name = name,
      level = info.level,
      builtin = false,
      description = info.description,
      permissions = RolePermissions[name] or {}
    })
  end

  -- Sort by level
  table.sort(roles, function(a, b) return a.level > b.level end)

  msg.reply({
    Data = json.encode({ roles = roles })
  })
end)

-- Batch grant roles
Handlers.add("BatchGrant", "BatchGrant", function(msg)
  local role = msg.Tags.Role
  local targets = json.decode(msg.Data)

  if not role or not targets then
    msg.reply({ Tags = { Error = "Missing-Params" }, Data = "Role and targets array required" })
    return
  end

  if not hasPermission(msg.From, "grant-role") or not canGrantRole(msg.From, role) then
    msg.reply({ Tags = { Error = "Unauthorized" }, Data = "Cannot grant this role" })
    return
  end

  local granted = 0
  for _, target in ipairs(targets) do
    UserRoles[target] = UserRoles[target] or {}
    UserRoles[target][role] = true
    granted = granted + 1
  end

  msg.reply({
    Data = json.encode({
      action = "batch-granted",
      role = role,
      count = granted
    })
  })
end)
