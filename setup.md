# HyperBEAM Setup Guide

This guide explains how to install HyperBEAM from the submodule and run tests.

---

## CRITICAL RULES FOR CLAUDE CODE AGENTS

**READ THIS SECTION COMPLETELY BEFORE DOING ANYTHING**

### Rule 1: NEVER MODIFY ERLANG FILES
- **ABSOLUTELY FORBIDDEN** to modify any `.erl` file in HyperBEAM
- The **ONLY** exception is `src/dev_hbsig.erl` (wao-specific device)
- This includes: `dev_codec_*.erl`, `hb_*.erl`, and ALL other `.erl` files
- If tests fail, fix the **JavaScript** code, NOT the Erlang code
- If there's a bug in HyperBEAM, report it to upstream - do NOT patch locally

### Rule 2: KILL PROCESSES BEFORE RUNNING TESTS
- **ALWAYS** kill existing processes before running ANY test
- Use this command EVERY TIME before running tests:
```bash
lsof -ti:10001 | xargs -r kill -9 2>/dev/null; lsof -ti:10000 | xargs -r kill -9 2>/dev/null; pkill -9 -f beam.smp; pkill -9 -f epmd; pkill -9 -f rebar3; sleep 2
```
- Port 10001 conflicts cause "address already in use" errors
- This is the #1 cause of test failures

### Rule 3: RUN TESTS ONE AT A TIME
- **NEVER** run `node --test hbsig/test/*.test.js` (all tests together)
- Run each test file individually:
```bash
node --experimental-wasm-memory64 --test hbsig/test/id.test.js
# KILL PROCESSES
node --experimental-wasm-memory64 --test hbsig/test/commit.test.js
# KILL PROCESSES
# ... etc
```

### Rule 4: VERIFY 100% TEST SUCCESS BEFORE COMMITTING
- Run ALL test files one by one
- Verify 100% pass rate for EACH file
- Only then commit changes
- **NEVER** commit after reverting or without testing

### Rule 5: FIX JAVASCRIPT, NOT ERLANG
- When tests fail, the fix must be in `hbsig/src/*.js` files
- The JavaScript library adapts to HyperBEAM's behavior
- HyperBEAM is the source of truth - JavaScript adapts to it

### Rule 6: DO NOT REVERT ENDLESSLY
- Think before reverting
- Understand WHY tests fail before changing code
- One careful fix is better than 100 reverts

---

## Prerequisites

The installation uses pre-built tarballs (all included in this repo under `installation/`):
- `asdf-erlang-rebar.tar.xz` - Erlang 27.3.4.6 and Rebar3 3.26.0
- `hyperbeam-prebuilt.tar.xz` - Pre-built HyperBEAM dependencies and NIFs
- `hyperbeam_rebar.config` - Offline rebar configuration

## Installation Steps

### Step 1: Extract Erlang and setup asdf

```bash
cd ~ && tar -xJf /home/user/wao/installation/asdf-erlang-rebar.tar.xz
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0
```

### Step 2: Initialize the HyperBEAM submodule

```bash
cd /home/user/wao
git submodule update --init --recursive
```

### Step 3: Extract pre-built dependencies

```bash
cd /home/user/wao/HyperBEAM && tar -xJf /home/user/wao/installation/hyperbeam-prebuilt.tar.xz _build
```

### Step 4: Configure rebar for offline compilation (Claude Code only)

> **Note:** This step is only required for offline environments like Claude Code where hexpm package fetching is unavailable. Skip this step if you have internet access to hexpm.

```bash
cd /home/user/wao/HyperBEAM
rm -f rebar.lock
cp /home/user/wao/installation/hyperbeam_rebar.config rebar.config
```

### Step 5: Compile HyperBEAM

```bash
cd /home/user/wao/HyperBEAM
rm -rf _build/wamr/lib/CMakeCache.txt _build/wamr/lib/CMakeFiles
. ~/.asdf/asdf.sh && rebar3 compile
```

### Step 6: Extract pre-built NIFs

```bash
cd /home/user/wao/HyperBEAM && tar -xJf /home/user/wao/installation/hyperbeam-prebuilt.tar.xz priv
mkdir -p /home/user/wao/HyperBEAM/_build/default/lib/hb/priv
cp -r /home/user/wao/HyperBEAM/priv/* /home/user/wao/HyperBEAM/_build/default/lib/hb/priv/
```

### Step 7: Extract wallet file

```bash
cd /home/user/wao/HyperBEAM && tar -xJf /home/user/wao/installation/hyperbeam-prebuilt.tar.xz .wallet.json
```

### Step 8: Create symlink for tests

```bash
ln -sfn /home/user/wao/HyperBEAM ~/HyperBEAM
```

### Step 9: Configure environment

```bash
cd /home/user/wao
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF
```

### Step 10: Build hbsig and install dependencies

```bash
cd /home/user/wao/hbsig && npm install && npm run build
cd /home/user/wao && npm install
```

## Verification

Check the installation:

```bash
cd ~/HyperBEAM
echo "Beam files: $(ls _build/default/lib/hb/ebin/*.beam | wc -l)"
echo "NIFs: $(ls priv/*.so)"
echo "WASM: $(ls _build/wamr/lib/libvmlib.a && echo OK)"
```

Expected output:
```
Beam files: 150
NIFs: priv/hb_beamr.so priv/hb_keccak.so
WASM: OK
```

## Running Tests

### hbsig tests

```bash
cd /home/user/wao

# ID test (no HyperBEAM needed)
node --experimental-wasm-memory64 --test hbsig/test/id.test.js

# Commit test (requires HyperBEAM)
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/commit.test.js
```

### General test commands

| Test | Command |
|------|---------|
| hbsig ID test | `node --experimental-wasm-memory64 --test hbsig/test/id.test.js` |
| hbsig commit test | `. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/commit.test.js` |
| All hbsig tests | `. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/*.test.js` |

## Troubleshooting

### "spawn rebar3 ENOENT"
Load asdf before running tests:
```bash
. ~/.asdf/asdf.sh
```

### "Package not found in any repo: luerl"
This occurs in offline environments (like Claude Code). Apply the offline rebar config:
```bash
cp /home/user/wao/installation/hyperbeam_rebar.config /home/user/wao/HyperBEAM/rebar.config
rm -f /home/user/wao/HyperBEAM/rebar.lock
```

### "Cannot find module hbsig"
Rebuild hbsig and reinstall:
```bash
cd /home/user/wao/hbsig && npm run build
cd /home/user/wao && npm install
```

### Tests hang or timeout
Kill stuck processes:
```bash
pkill -9 -f beam.smp; pkill -9 -f epmd
```

### CMake cache error
Clear CMake cache and recompile:
```bash
cd /home/user/wao/HyperBEAM
rm -rf _build/wamr/lib/CMakeCache.txt _build/wamr/lib/CMakeFiles
. ~/.asdf/asdf.sh && rebar3 compile
```

## Quick Start Script

Run all setup steps at once:

```bash
#!/bin/bash
set -e

# Step 1: Erlang
cd ~ && tar -xJf /home/user/wao/installation/asdf-erlang-rebar.tar.xz
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0

# Step 2: Submodule
cd /home/user/wao && git submodule update --init --recursive

# Step 3: Dependencies
cd /home/user/wao/HyperBEAM && tar -xJf /home/user/wao/installation/hyperbeam-prebuilt.tar.xz _build

# Step 4: Rebar config (Claude Code only - skip if online)
rm -f rebar.lock
cp /home/user/wao/installation/hyperbeam_rebar.config rebar.config

# Step 5: Compile
rm -rf _build/wamr/lib/CMakeCache.txt _build/wamr/lib/CMakeFiles
rebar3 compile

# Step 6: NIFs
tar -xJf /home/user/wao/installation/hyperbeam-prebuilt.tar.xz priv
mkdir -p _build/default/lib/hb/priv
cp -r priv/* _build/default/lib/hb/priv/

# Step 7: Wallet
tar -xJf /home/user/wao/installation/hyperbeam-prebuilt.tar.xz .wallet.json

# Step 8: Symlink
ln -sfn /home/user/wao/HyperBEAM ~/HyperBEAM

# Step 9: Environment
cd /home/user/wao
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

# Step 10: hbsig
cd /home/user/wao/hbsig && npm install && npm run build
cd /home/user/wao && npm install

echo "Setup complete!"
```

## Development Guidelines

### HyperBEAM Branch Policy

- **Always use the `wao-m1` branch** for HyperBEAM development and merging changes
- The submodule in `wao` should point to the `wao-m1` branch
- When pushing HyperBEAM changes, use: `git push origin wao-m1`
- Never hard-code authentication tokens in code or documentation

### Running Tests

**IMPORTANT: Run tests ONE AT A TIME, not together.**

Running all tests together causes port conflicts and test failures. Always run each test file individually:

```bash
# CORRECT - run tests one at a time
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/id.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/commit.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/signer.test.js
# ... etc

# WRONG - do NOT run all tests together
# node --test hbsig/test/*.test.js  # This will cause failures!
```

Kill any lingering processes between test runs if needed:
```bash
pkill -9 -f beam.smp; pkill -9 -f epmd
```

### Modifying Erlang Files

**⚠️ CRITICAL: NEVER MODIFY ANY ERLANG FILES IN HYPERBEAM ⚠️**

The ONLY exception is `src/dev_hbsig.erl` which is a wao-specific device.

**Absolute Rules:**
1. **NEVER** modify any `.erl` files in HyperBEAM except `dev_hbsig.erl`
2. **NEVER** patch bugs in core HyperBEAM files locally - report them to upstream instead
3. **NEVER** add "fixes" to files like `dev_codec_httpsig.erl`, `dev_codec_ans104.erl`, etc.

**What wao-m1 branch should contain:**
- Checkpoint base (upstream HyperBEAM commit)
- wao-specific devices: `dev_hbsig.erl`, `dev_wao.erl`, `dev_mydev.erl`, `dev_add.erl`, `dev_double.erl`, `dev_inc.erl`, `dev_square.erl`
- `hb_opts.erl` modifications for wao configuration
- **Nothing else**

**If you find a bug in HyperBEAM:**
1. Do NOT fix it locally
2. Report the issue to upstream HyperBEAM maintainers
3. Wait for the fix to be merged upstream
4. Then merge the upstream fix into wao-m1

**Why this matters:**
- Local patches create merge conflicts with upstream
- Local patches diverge from upstream and become unmaintainable
- Local patches may introduce new bugs
- Users testing locally will have different code than what was tested

### Fixing Test Failures

**When tests fail, ALWAYS modify JavaScript source files, NOT Erlang files.**

The hbsig JavaScript library must adapt to HyperBEAM's behavior, not the other way around.

**Correct approach:**
1. Run the failing test and analyze the error
2. Debug using the JavaScript source in `hbsig/src/`
3. Understand what HyperBEAM expects/returns
4. Modify the JavaScript code to work with HyperBEAM's behavior
5. Re-run the test until it passes
6. Never delete or skip test cases

**Files you CAN modify:**
- `hbsig/src/*.js` - JavaScript library source
- `hbsig/src/*.ts` - TypeScript source (if any)
- `hbsig/test/*.test.js` - Test files (but NEVER delete or skip tests)

**Files you CANNOT modify:**
- ANY `.erl` file in HyperBEAM (except `dev_hbsig.erl`)
- `src/dev_codec_*.erl` - ABSOLUTELY FORBIDDEN
- `src/hb_*.erl` - ABSOLUTELY FORBIDDEN

**Before committing:**
1. Run ALL tests individually (not together)
2. Verify 100% pass rate
3. Only then commit and push

### Submodule Updates

When updating the HyperBEAM submodule:

1. Make changes in `HyperBEAM/` directory on `wao-m1` branch
2. Commit and push HyperBEAM changes: `git push origin wao-m1`
3. Return to wao repo and stage the submodule: `git add HyperBEAM`
4. Commit the submodule pointer update in wao

### Test Files

| Test File | Description |
|-----------|-------------|
| `id.test.js` | ID generation tests (no HyperBEAM needed) |
| `commit.test.js` | Message commit and schedule tests |
| `signer.test.js` | Signer conversion tests (137 cases) |
| `structured.test.js` | Structured codec tests |
| `flat.test.js` | Flat codec tests |
| `erl_json.test.js` | Erlang JSON conversion tests |
| `httpsig.test.js` | HTTPSig codec tests |

---

## HyperBEAM Upstream Merge Checkpoint Plan

This section outlines the checkpoint plan for merging 537 upstream commits from `permaweb/HyperBEAM` (v0.9-milestone-3-beta-1) into `wao-m1`.

### Current Status

| Checkpoint | Status | Notes |
|------------|--------|-------|
| 0 (wao-m1) | **PASSING** | All hbsig tests pass (baseline) |
| 1 | **SKIPPED** | API mismatch bug: `from/2` vs `from/3` |
| 2 | **SKIPPED** | Same API mismatch bug |
| 3 | **BLOCKED** | Needs `prometheus_cowboy` not in prebuilt tarball |
| 4-7 | PENDING | Waiting on checkpoint 3 |

**Checkpoint 3 Blocker**: Checkpoint 3 introduces a dependency on `prometheus_cowboy` which is not included in the offline prebuilt tarball. The HyperBEAM server starts but `prometheus_cowboy2_instrumenter:observe/1 undef` errors disrupt test execution. Options:
1. Add prometheus dependencies to the prebuilt tarball (requires network access)
2. Find a workaround to disable prometheus metrics in HyperBEAM

### Overview

- **Base commit (wao-m1)**: b2743e4a (Merge PR #268)
- **Target**: v0.9-milestone-3-beta-1 (2c8c6286)
- **Total commits to merge**: 537
- **Custom commits to preserve**: 10 (ab61b3a2..30e00c77)

### Critical Files

The hbsig JavaScript library depends on these Erlang devices:

| File | Status in Upstream | Risk |
|------|-------------------|------|
| `dev_hbsig.erl` | **Custom wao file** - not in upstream | Must preserve |
| `dev_codec_flat.erl` | 64 changes | HIGH |
| `dev_codec_structured.erl` | 64 changes | HIGH |
| `dev_codec_httpsig.erl` | 64 changes | HIGH |
| `hb_message.erl` | Major refactor | MEDIUM |

### Merge Strategy

For each checkpoint:
1. Cherry-pick or merge commits up to checkpoint
2. Re-apply custom wao commits (rebase)
3. Compile HyperBEAM
4. Run all hbsig tests
5. Fix any failures before proceeding

### Checkpoints

#### Checkpoint 0: Current State (BASELINE)
- **Commit**: 30e00c77
- **Status**: All hbsig tests passing

#### Checkpoint 1: Hyperstate Links & Lazy Loading (~50 commits)
- **Target commit**: 60104eb8
- **Risk Level**: LOW
- Changes: `hb_maps` abstraction, lazy loading infrastructure, link resolution

#### Checkpoint 2: TABM Encoding & Commitment Simplification (~100 commits)
- **Target commit**: ef382658
- **Risk Level**: HIGH
- Changes: Major httpsig simplification, TABM encoding, commitment restructuring

#### Checkpoint 3: Structured Encoding Scheme (~150 commits)
- **Target commit**: 3c80b76d
- **Risk Level**: HIGH
- Changes: New structured encoding scheme, message infrastructure reorganization

#### Checkpoint 4: HTTPSig Fixes & Stabilization (~200 commits)
- **Target commit**: 4024287b
- **Risk Level**: MEDIUM
- Changes: HTTPSig tag fixes, test improvements

#### Checkpoint 5: HTTPSig Reorg PR #301 (~313 commits)
- **Target commit**: 7eb51633
- **Risk Level**: HIGH
- Changes: Major httpsig reorganization, payment/ledger features

#### Checkpoint 6: LMDB Integration (~395 commits)
- **Target commit**: 5242203e
- **Risk Level**: MEDIUM
- Changes: LMDB as default store, router updates

#### Checkpoint 7: Final v0.9-milestone-3-beta-1 (~537 commits)
- **Target commit**: 2c8c6286
- **Risk Level**: LOW
- Changes: Commitment read speed, dashboard improvements, final polish

### Recovery Strategy

If hbsig tests fail at a checkpoint:

1. **Identify which test fails**
   ```bash
   node --experimental-wasm-memory64 --test hbsig/test/SPECIFIC.test.js
   ```

2. **Check codec changes**
   ```bash
   git diff PREV_CHECKPOINT..CURRENT -- src/dev_codec_*.erl
   ```

3. **Update dev_hbsig.erl if needed** (this is the ONLY file you may modify)

4. **Update JavaScript library** - match encoding/decoding changes

5. **Do NOT proceed to next checkpoint until all tests pass**

### Checkpoint Reorganization Strategy

**When an upstream bug causes checkpoint failures, reorganize checkpoints to skip broken ones.**

This happens when:
- A checkpoint contains an API mismatch bug (e.g., function arity mismatch)
- The bug is fixed in a later checkpoint
- Fixing the bug locally would require modifying Erlang files (which is FORBIDDEN)

**Example: Checkpoint 1 and 2 were SKIPPED**

During the checkpoint 1 merge attempt, we discovered:
- `hb_http.erl:673` calls `dev_codec_httpsig_conv:from/2`
- But `dev_codec_httpsig_conv.erl` only exports `from/3`
- This API mismatch causes all HTTP requests to fail with `undef` errors

**Investigation process:**
```bash
# Find when the bug was introduced
git log --oneline --all -- src/hb_http.erl | head -20

# Find when the bug was fixed
git log --oneline --all --grep="from/2" -- src/hb_http.erl
git log --oneline --all --grep="lazy" -- src/hb_http.erl

# Found: commit c9f6d1ae "fix: transition HTTP API to lazy loading" fixes it
# This commit is between checkpoint 2 and checkpoint 3
```

**Resolution:**
- Checkpoint 0 (30e00c77): WORKING (baseline)
- Checkpoint 1 (60104eb8): BROKEN (API mismatch) → SKIP
- Checkpoint 2 (ef382658): BROKEN (same API mismatch) → SKIP
- Checkpoint 3 (3c80b76d): FIXED (contains the fix commit) → USE THIS

**Key principle:** When a checkpoint range is broken due to upstream bugs, skip to the first checkpoint where the bug is fixed. Never attempt to fix upstream bugs locally.

### Checkpoint 1 Progress Notes

#### Prometheus Dependencies (RESOLVED)
Manually compiled and added to `_build/default/lib/`:
- `prometheus` (v4.11.0) - 29 beam files
- `prometheus_cowboy` (v0.1.8) - 4 beam files
- `prometheus_httpd` (v2.1.11) - 3 beam files
- `accept` (v0.3.5) - 4 beam files

#### Codec API Changes (RESOLVED)
Updated `dev_hbsig.erl` to use new 3-arity codec function signatures:
- `dev_codec_json:from(JSON, #{}, #{})`
- `dev_codec_structured:from(Data, Msg2, Opts)`
- `dev_codec_httpsig:from(Data, Msg2, Opts)`
- `dev_codec_flat:from(Data, Msg2, Opts)`

#### Content-Digest Fix (NEEDS UPSTREAM FIX)
**Problem:** `field_not_found_error` for `content-digest` during HMAC signature verification

**Root Cause:** The `to()` function applies `hb_link:linkify` which converts nested maps to links before `add_content_digest()` is called. After linkify, the body key becomes `<<"body+link">>` instead of `<<"body">>`.

**Note:** This requires an upstream fix - do NOT patch locally. Report to upstream maintainers.

### Command Reference

```bash
# Run specific test
node --experimental-wasm-memory64 --test hbsig/test/id.test.js

# Run all tests with timeout (one at a time!)
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/id.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/commit.test.js

# Kill stuck HyperBEAM processes
pkill -9 -f beam.smp; pkill -9 -f epmd

# Check codec differences
git diff b2743e4a..TARGET -- src/dev_codec_flat.erl
git diff b2743e4a..TARGET -- src/dev_codec_structured.erl
git diff b2743e4a..TARGET -- src/dev_codec_httpsig.erl
```
