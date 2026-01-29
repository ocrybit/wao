# HyperBEAM Upstream Merge Checkpoint Plan

This document outlines the checkpoint plan for merging 537 upstream commits from `permaweb/HyperBEAM` (v0.9-milestone-3-beta-1) into `wao-m1`.

## Current Status

| Checkpoint | Status | Notes |
|------------|--------|-------|
| 0 (wao-m1) | **PASSING** | All hbsig tests pass (baseline) |
| 1 | **IN PROGRESS** | 1/2 tests pass; Test 1 fixed, Test 2 times out |
| 2-7 | PENDING | Waiting on checkpoint 1 |

### Checkpoint 1 Progress

#### Prometheus Dependencies (RESOLVED)
Manually compiled and added to `_build/default/lib/`:
- `prometheus` (v4.11.0) - 29 beam files
- `prometheus_cowboy` (v0.1.8) - 4 beam files
- `prometheus_httpd` (v2.1.11) - 3 beam files
- `accept` (v0.3.5) - 4 beam files

Note: `prometheus_cowboy2_instrumenter:observe` throws error at metrics collection, but doesn't affect request processing.

#### Codec API Changes (RESOLVED)
Updated `dev_hbsig.erl` to use new 3-arity codec function signatures:
- `dev_codec_json:from(JSON, #{}, #{})`
- `dev_codec_structured:from(Data, Msg2, Opts)`
- `dev_codec_httpsig:from(Data, Msg2, Opts)`
- `dev_codec_flat:from(Data, Msg2, Opts)`

#### HTTP Parsing Fix (RESOLVED)
Fixed `hb_http:httpsig_to_tabm_singleton` to pass 3 arguments to `dev_codec_httpsig_conv:from`:
```erlang
{ok, Msg} = dev_codec_httpsig_conv:from(
    RawHeaders#{ <<"body">> => Body },
    #{},
    Opts
),
```

#### Content-Digest Fix (RESOLVED)
**Problem:** `field_not_found_error` for `content-digest` during HMAC signature verification

**Root Cause:** The `to()` function in checkpoint 1 applies `hb_link:linkify` which converts nested maps (like body) to links before `add_content_digest()` is called. After linkify, the body key becomes `<<"body+link">>` instead of `<<"body">>`, so `add_content_digest()` can't find it.

**Fix:** Added `none` mode to `hb_link:linkify` that returns messages unchanged, and modified `hmac()` to pass `#{ <<"linkify">> => none }` to `to()`:
```erlang
% In hb_link.erl - new clauses for 'none' mode
linkify(Msg, none, _Opts) when is_map(Msg) -> Msg;
linkify(Msg, none, _Opts) when is_list(Msg) -> Msg;

% In dev_codec_httpsig.erl - modified hmac()
{ok, ToResult} = to(MsgForTo, #{ <<"linkify">> => none }, Opts),
```

### Current Blocking Issue: Test 2 Timeout

Test 1 (commit test) now passes with the content-digest fix.
Test 2 (spawn/schedule nested message) times out instead of returning an error.

**Behavior:**
- On wao-m1 (baseline): Both tests pass
- On wao-m1-cp1 without fix: Test 2 fails with 500 error quickly
- On wao-m1-cp1 with fix: Test 2 hangs/times out

**Hypothesis:** The fix allows the request to proceed past the content-digest issue, but there's another issue in the process creation/scheduling flow that causes a hang. This may be related to other changes between wao-m1 and wao-m1-cp1.

**Next Steps:**
1. Compare process@1.0/schedule handling between wao-m1 and wao-m1-cp1
2. Add debug logging to trace where spawn request hangs
3. Check for differences in dev_process or dev_scheduler between versions

---

## Overview

- **Base commit (wao-m1)**: b2743e4a (Merge PR #268)
- **Target**: v0.9-milestone-3-beta-1 (2c8c6286)
- **Total commits to merge**: 537
- **Custom commits to preserve**: 10 (ab61b3a2..30e00c77)

## Critical Files

The hbsig JavaScript library depends on these Erlang devices:

| File | Status in Upstream | Risk |
|------|-------------------|------|
| `dev_hbsig.erl` | **Custom wao file** - not in upstream | Must preserve |
| `dev_codec_flat.erl` | 64 changes | HIGH |
| `dev_codec_structured.erl` | 64 changes | HIGH |
| `dev_codec_httpsig.erl` | 64 changes | HIGH |
| `hb_message.erl` | Major refactor | MEDIUM |

## Merge Strategy

For each checkpoint:
1. Cherry-pick or merge commits up to checkpoint
2. Re-apply custom wao commits (rebase)
3. Compile HyperBEAM
4. Run all hbsig tests
5. Fix any failures before proceeding

---

## Checkpoint 0: Current State (BASELINE)

**Commit**: 30e00c77
**Commits merged**: 0
**Status**: All hbsig tests passing

```bash
# Verify baseline
cd /home/user/wao
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/*.test.js
```

---

## Checkpoint 1: Hyperstate Links & Lazy Loading (~50 commits)

**Target commit**: 60104eb8
**Commits**: 1-50
**Risk Level**: LOW

### Changes included:
- `hb_maps` abstraction layer
- Lazy loading infrastructure
- Link resolution functions
- Debugger improvements

### Codec changes:
- `dev_codec_flat.erl`: Minor change (do not force resolution)

### Expected hbsig impact:
- Minimal - internal infrastructure changes

### Test verification:
```bash
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/*.test.js
```

---

## Checkpoint 2: TABM Encoding & Commitment Simplification (~100 commits)

**Target commit**: ef382658
**Commits**: 51-100
**Risk Level**: HIGH

### Changes included:
- "Bonfire of complexity" - major httpsig simplification
- TABM encoding changes
- Commitment message restructuring
- `x-` encoding for signature-input

### Codec changes:
- `dev_codec_httpsig.erl`: Heavily simplified signature encodings
- `dev_codec_structured.erl`: Commitment normalization

### Expected hbsig impact:
- **HIGH** - Signature format may change
- May need to update `hbsig/src/commit.js`
- May need to update `hbsig/src/signer.js`

### Test verification:
Focus on: `commit.test.js`, `httpsig.test.js`

---

## Checkpoint 3: Structured Encoding Scheme (~150 commits)

**Target commit**: 3c80b76d
**Commits**: 101-150
**Risk Level**: HIGH

### Changes included:
- New structured encoding scheme
- Message infrastructure reorganization
- Index explorer features

### Codec changes:
- `dev_codec_structured.erl`: New encoding scheme

### Expected hbsig impact:
- **HIGH** - structured encoding is fundamental
- May need to update `hbsig/src/structured.js`
- `structured.test.js` likely to break

### Test verification:
Focus on: `structured.test.js`, `flat.test.js`

---

## Checkpoint 4: HTTPSig Fixes & Stabilization (~200 commits)

**Target commit**: 4024287b (Merge PR #269)
**Commits**: 151-200
**Risk Level**: MEDIUM

### Changes included:
- Additional HTTPSig tag fixes (PR #269)
- Test improvements
- Stabilization fixes

### Codec changes:
- Bug fixes in httpsig encoding

### Expected hbsig impact:
- May fix or break edge cases
- Test all HTTPSig scenarios

### Test verification:
Focus on: `httpsig.test.js`

---

## Checkpoint 5: HTTPSig Reorg (PR #301) (~313 commits)

**Target commit**: 7eb51633
**Commits**: 201-313
**Risk Level**: HIGH

### Changes included:
- Major httpsig reorganization (PR #301)
- Payment/ledger features
- ANS-104 improvements
- LRU cache fixes

### Codec changes:
- `dev_codec_httpsig.erl`: Major restructure
- ANS-104 bundling support

### Expected hbsig impact:
- **HIGH** - httpsig device API may change
- May need to rewrite parts of `hbsig/src/commit.js`

### Test verification:
All tests - comprehensive revalidation needed

---

## Checkpoint 6: LMDB Integration (~395 commits)

**Target commit**: 5242203e
**Commits**: 314-395
**Risk Level**: MEDIUM

### Changes included:
- LMDB as default store
- Store abstraction improvements
- Router updates for hyperstate

### Codec changes:
- Minimal codec changes in this phase

### Expected hbsig impact:
- LOW - storage layer changes shouldn't affect encoding
- May affect test setup if store configuration changes

### Test verification:
All tests - verify no storage-related regressions

---

## Checkpoint 7: Final v0.9-milestone-3-beta-1 (~537 commits)

**Target commit**: 2c8c6286
**Commits**: 396-537
**Risk Level**: LOW

### Changes included:
- Commitment read speed improvements
- Dashboard improvements
- Key normalization
- Final beta polish

### Codec changes:
- Minor fixes and optimizations

### Expected hbsig impact:
- LOW - mostly polish and performance

### Test verification:
All tests - final validation

---

## Recovery Strategy

If hbsig tests fail at a checkpoint:

1. **Identify which test fails**
   ```bash
   node --experimental-wasm-memory64 --test hbsig/test/SPECIFIC.test.js
   ```

2. **Check codec changes**
   ```bash
   git diff PREV_CHECKPOINT..CURRENT -- src/dev_codec_*.erl
   ```

3. **Update dev_hbsig.erl if needed**
   - The device may need API changes to match new codec behavior

4. **Update JavaScript library**
   - Match encoding/decoding changes in TypeScript/JavaScript

5. **Do NOT proceed to next checkpoint until all tests pass**

---

## Post-Merge Tasks

After all checkpoints complete:

1. Verify all 7 hbsig test files pass
2. Update `setup.md` if needed
3. Commit merged changes to wao-m1
4. Tag the new version

---

## Command Reference

### Run specific test
```bash
node --experimental-wasm-memory64 --test hbsig/test/id.test.js
```

### Run all tests with timeout
```bash
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/*.test.js
```

### Kill stuck HyperBEAM processes
```bash
pkill -9 -f beam.smp; pkill -9 -f epmd
```

### Check codec differences
```bash
git diff b2743e4a..TARGET -- src/dev_codec_flat.erl
git diff b2743e4a..TARGET -- src/dev_codec_structured.erl
git diff b2743e4a..TARGET -- src/dev_codec_httpsig.erl
```
