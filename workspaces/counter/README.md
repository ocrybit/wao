# Counter

**Type:** Lua App
**Environment:** Mainnet WASM
**Module:** aos2_0_6
**Created:** 2026-01-22
**Status:** Complete

## Description
Simple stateful counter that can be incremented, decremented, and reset.

## Handlers
- **Info** - Returns app info (name, version, current count)
- **Inc** - Increment counter (optional `Amount` tag for custom increment)
- **Dec** - Decrement counter (optional `Amount` tag for custom decrement)
- **Get** - Get current count
- **Reset** - Reset counter to 0

## Test Command
```bash
node --test workspaces/counter/app.test.js
```

## Notes
- State persists across messages
- Use `msg.Tags.Amount` to access custom tags
