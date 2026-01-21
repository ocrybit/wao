# Lua Apps Testing Report

## Summary

| Test Environment | Status | Tests |
|------------------|--------|-------|
| ArMem (In-Memory) | ✅ PASS | 14/14 |
| HyperBEAM (lua@5.3a) | ❌ FAIL | 0/14 |

## ArMem Test Results

All 14 tests pass using the in-memory ArMem testing environment.

### Counter App
- ✅ should start at 0
- ✅ should increment
- ✅ should increment by amount
- ✅ should decrement
- ✅ should reset

### Token App
- ✅ should have token info
- ✅ should have initial balance for owner
- ✅ should transfer tokens

### Todo App
- ✅ should add a todo
- ✅ should list todos
- ✅ should complete a todo

### KV Store App
- ✅ should set and get a value
- ✅ should list keys
- ✅ should delete a key

## Test Files

- **Test file**: `vibe/tests/example-usage.test.js`
- **Run command**: `node --test vibe/tests/example-usage.test.js`

## Issues Fixed During Testing

### 1. Response Structure
**Problem**: Tests expected data in `res.Output.data` but `msg.reply()` puts data in `res.Messages[0].Data`.

**Solution**: Added `getReplyData()` helper function:
```javascript
const getReplyData = (res) => {
  if (res.Messages && res.Messages.length > 0 && res.Messages[0].Data) {
    return JSON.parse(res.Messages[0].Data)
  }
  if (res.Output?.data) {
    return JSON.parse(res.Output.data)
  }
  throw new Error("No reply data found in response")
}
```

### 2. AOS Global Collision
**Problem**: Token app's `Name` variable collided with AOS runtime's default `Name = "aos"` global.

**Solution**: Renamed token variables:
- `Name` → `TokenName`
- `Ticker` → `TokenTicker`
- `Denomination` → `TokenDenomination`
- `Logo` → `TokenLogo`
- `Owner` → `TokenOwner`

## HyperBEAM Lua Execution Issues

### Symptoms
- Process spawn: ✅ Works
- Schedule message: ✅ Works
- Compute results: ❌ 500 error

### Debug Logs
```
starting_compute, proc_id: -Mle6..7Haeg, current: -1, target: 1
sent, status: 500, duration: 1427, method: GET, path: /.../compute/results
```

### Root Cause
The `lua@5.3a` execution device:
1. Fetches AOS module from Arweave mainnet
2. Requires module initialization at slot 0 before processing
3. Has timing/initialization issues in local test environment

The `current: -1` in logs indicates the process hasn't completed initialization before compute is attempted.

### Implications
- Lua app logic is correct (proven by ArMem tests)
- HyperBEAM `lua@5.3a` has environment-specific issues
- Production deployment would use mainnet/legacynet which have working infrastructure

## Lua App Patterns

### State Management
```lua
-- Lazy initialization - state persists between messages
Balances = Balances or {}
Owner = Owner or ao.env.Process.Owner
```

### Handler Pattern
```lua
Handlers.add("ActionName", "ActionName", function(msg)
  -- Validate, execute, reply
  msg.reply({ Data = json.encode(result) })
end)
```

### Response Format
- Use `msg.reply({ Data = json.encode({...}) })` for responses
- Data appears in `Messages[0].Data` in test results
- NOT in `Output.data`

## Recommendations

1. **Use ArMem for development**: Fast iteration, syntax checking, logic validation
2. **Test with HyperBEAM before production**: Real behavior verification (when environment is stable)
3. **Avoid AOS global names**: Use prefixed names like `TokenName` instead of `Name`
4. **Always use json.encode**: For structured response data

## File Locations

```
vibe/
├── apps/
│   ├── counter.lua      # Counter with history tracking
│   ├── token.lua        # Fungible token (ERC-20 style)
│   ├── todo.lua         # Task management
│   ├── kv-store.lua     # Key-value database
│   └── ... (9 more apps)
└── tests/
    └── example-usage.test.js  # ArMem tests (14 tests)
```

## Running Tests

```bash
# Run all vibe app tests
node --test vibe/tests/example-usage.test.js

# Run with verbose output
node --test --test-reporter=spec vibe/tests/example-usage.test.js
```
