# HyperBEAM Checkpoint Merge Plan

## Rules (DO NOT VIOLATE)

1. **Checkpoints MUST be from upstream** (`https://github.com/permaweb/HyperBEAM`)
2. **Merge upstream commits INTO wao-m1** (which has wao devices)
3. **hbsig tests MUST pass 100%** before any checkpoint is complete
4. **NEVER modify Erlang files** except `dev_hbsig.erl`
5. **Test order**: id → commit → erl_json → flat → structured → httpsig → signer

---

## Checkpoints

### Checkpoint 0 (BASE) - VERIFIED WORKING
- **Branch**: `wao-m1`
- **Commit**: `30e00c77`
- **Status**: ✅ All 7 tests pass 100%
- **Description**: Base wao-m1 with wao devices, no upstream merge

### Checkpoint 1 - TARGET
- **Upstream commit**: `c9f6d1ae` (fix: transition HTTP API to lazy loading)
- **Total upstream commits to merge**: 105
- **Status**: ⏳ Pending
- **Description**: Includes lazy loading fix that resolves API mismatch

Key commits in this range:
```
c9f6d1ae fix: transition HTTP API to lazy loading       <-- TARGET
16c342fc fix: resolve lazily-loaded link references
1682772b impr: correctly convert commitment messages to TABM
b71a8fb4 fix: ensure message is in TABM format
ef382658 chore: add nested message test vectors
288573b3 feat: add HTTP binary serialization in httpsig@1.0
4c44d22e fix: httpsig@1.0 sig and sig-input encoding
...
a55c7420 wip: introduce new link resolver                <-- EARLIEST
```

---

## Merge Strategy

### Option A: Direct Merge
```bash
cd /home/user/wao/HyperBEAM
git checkout wao-m1
git checkout -b wao-m1-cp1
git merge c9f6d1ae -m "Merge upstream c9f6d1ae into wao-m1"
# Resolve conflicts, compile, test
```

### Option B: Rebase wao-m1 onto upstream
```bash
cd /home/user/wao/HyperBEAM
git checkout -b wao-m1-cp1 wao-m1
git rebase --onto c9f6d1ae b2743e4a wao-m1-cp1
# Resolve conflicts, compile, test
```

---

## Branch Structure

```
upstream/edge
    │
    ├── b2743e4a (Merge PR #268) ─── BASE COMMIT
    │       │
    │       ├── ... 105 commits ...
    │       │
    │       └── c9f6d1ae (fix: transition HTTP API) ─── CHECKPOINT 1 TARGET
    │
    └── (continues to latest edge)

wao-m1 (ocrybit fork)
    │
    ├── b2743e4a (same base)
    │       │
    │       └── 10 wao commits (ab61b3a2..30e00c77)
    │               │
    │               └── 30e00c77 [hbsig@1.0] ─── CHECKPOINT 0 (WORKING)
```

---

## Test Commands

```bash
# Kill processes before each test
lsof -ti:10001 | xargs -r kill -9 2>/dev/null; lsof -ti:10000 | xargs -r kill -9 2>/dev/null; pkill -9 -f beam.smp; pkill -9 -f epmd; sleep 2

# Run tests ONE AT A TIME
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/id.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/commit.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/erl_json.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/flat.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/structured.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/httpsig.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/signer.test.js
```

---

## Current Task

- [ ] Create checkpoint 1 by merging upstream `c9f6d1ae` into `wao-m1`
- [ ] Resolve merge conflicts
- [ ] Compile and run all 7 tests
- [ ] Push `wao-m1-cp1` branch
- [ ] Update parent wao repo submodule pointer
