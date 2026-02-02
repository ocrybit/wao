# Mission

**Make all checkpoint statuses ✅ DONE**

Each checkpoint follows a task loop. The todo list tracks progress within the current checkpoint iteration.

## Rules (STRICT)

1. **HyperBEAM commits go to `wao-m1` branch only** (ask for GitHub token if needed to push)
2. **Only modify these files:**
   - `HyperBEAM/src/dev_hbsig.erl`
   - `hbsig/src/*.js`
   - `hbsig/test/*.test.js`
3. **NEVER remove or skip test cases** - Cannot proceed to next test file until ALL cases in current file pass (100%)
4. **COMMIT AND PUSH after completing each task** - Do NOT proceed to the next task until changes are committed and pushed to remote
5. **Keep Merged HB updated** - Every time you commit to wao-m1:
   - Push the commit to wao-m1
   - Update submodule reference in wao repo
   - Update "Merged HB" column in checkpoint table to the NEW commit hash
   - Commit and push CLAUDE.md
   - The Merged HB must always point to the LATEST working commit, not the initial rebase commit

## Session Setup (each fresh session)

1. Read `setup.md` and install HyperBEAM from submodule
2. Verify HyperBEAM submodule points to the commit recorded in the Checkpoints table (Merged HB column)
3. Verify current branch commit history matches progress, update Working branch in Current Progress section if on new branch
4. **Report current working progress to user** (which CP, which task, which test)
5. After each commit, verify you are committing to the correct branch

## Checkpoint Task Loop

For each checkpoint with status other than ✅ DONE:

### Task 1: Rebase and Merge Upstream
- Rebase upstream commits onto submodule branch (`wao-m1`)
- Update submodule to point to the merged commit
- Record the merged HB commit in the checkpoint table

### Task 2: Make Tests 100% Pass (one by one)
Kill processes before each test:
```bash
lsof -ti:10001 | xargs -r kill -9 2>/dev/null; lsof -ti:10000 | xargs -r kill -9 2>/dev/null; pkill -9 -f beam.smp; pkill -9 -f epmd; pkill -9 -f rebar3; sleep 2
```

Test files in order (by dependency):
| # | Test File | Purpose | Status |
|---|-----------|---------|--------|
| 1 | `id.test.js` | Address/identity generation | ⬜ |
| 2 | `commit.test.js` | HTTP signature commitment generation | ⬜ |
| 3 | `erl_json.test.js` | JSON ↔ Erlang term conversion (type annotations, atoms, buffers) | ⬜ |
| 4 | `flat.test.js` | Flat codec: key=value header encoding | ⬜ |
| 5 | `structured.test.js` | Structured codec: RFC 8941 structured fields | ⬜ |
| 6 | `httpsig.test.js` | HTTPSig codec: multipart/signed message encoding | ⬜ |
| 7 | `signer.test.js` | **E2E Integration**: Sign → Send to HB → Verify round-trip with erl_json | ⬜ |

**After each fix, re-run ALL tests to confirm no regressions.**

Commands:
```bash
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/id.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/commit.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/erl_json.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/flat.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/structured.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/httpsig.test.js
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/signer.test.js
```

### Task 3: Make wao/test/hyperbeam Tests 100% Pass
Run HyperBEAM integration tests:
```bash
. ~/.asdf/asdf.sh && node --experimental-wasm-memory64 --test test/hyperbeam/hyperbeam.test.js
```

### Task 4: Receive Confirmation from Human
- **STOP and wait for user to confirm tests pass on their local machine**
- User will run tests locally and verify results
- Do NOT proceed to Task 5 until user confirms

### Task 5: Mark Done
- Once user confirms all tests pass locally, update checkpoint status to ✅ DONE
- Move to next checkpoint and repeat the loop

---

# Checkpoints

Using official upstream release tags as checkpoints.

| CP | Upstream Commit | Merged HB | Done Commit (wao) | Date | Message | Status |
|----|-----------------|-----------|-------------------|------|---------|--------|
| 0 | [`b2743e4a`](https://github.com/permaweb/HyperBEAM/commit/b2743e4a) | [`30e00c77`](https://github.com/ocrybit/HyperBEAM/commit/30e00c77) | | 2025-05-19 | Merge pull request #268 from permaweb/dpshade/docs-content-styling | ✅ DONE |
| 1 | [`2c8c6286`](https://github.com/permaweb/HyperBEAM/commit/2c8c6286) | [`bda11b6b`](https://github.com/ocrybit/HyperBEAM/commit/bda11b6b) | | 2025-06-08 | [v0.9-milestone-3-beta-1](https://github.com/permaweb/HyperBEAM/tree/v0.9-milestone-3-beta-1) | ✅ DONE |
| 2 | [`d58f16b8`](https://github.com/permaweb/HyperBEAM/commit/d58f16b8) | [`1ebe8537`](https://github.com/ocrybit/HyperBEAM/commit/1ebe8537) | | 2025-10-02 | [v0.9-milestone-3-beta-3](https://github.com/permaweb/HyperBEAM/tree/v0.9-milestone-3-beta-3) | 🔄 CURRENT |

---

## Current Progress: CP2

**Working branch:** [`claude/cp2-iteration-fS4l2`](https://github.com/ocrybit/wao/tree/claude/cp2-iteration-fS4l2)

**Note:** CP2 rebase already completed (merged HB: 1ebe8537). Beta3 has JSON POST with commitment signatures for proper owner field preservation.

### Tasks
- [x] Task 1: Rebase and Merge Upstream (already done for CP2)
- [x] Task 2: Make hbsig Tests 100% Pass (717/717 passing)
- [ ] Task 3: Make wao/test/hyperbeam Tests 100% Pass ⚠️ BLOCKED
- [ ] Task 4: Receive Confirmation from Human
- [ ] Task 5: Mark Done

### Test Results Report (Last Updated: 2026-02-01)

#### hbsig Tests (Task 2) - ✅ COMPLETE

| # | Test File | Subtests | Cases Passed | Cases Failed | Status |
|---|-----------|----------|--------------|--------------|--------|
| 1 | `id.test.js` | 1 | 1/1 | 0 | ✅ DONE |
| 2 | `commit.test.js` | 2 | 2/2 | 0 | ✅ DONE |
| 3 | `erl_json.test.js` | 3 | 257/257 | 0 | ✅ DONE |
| 4 | `flat.test.js` | 2 | 40/40 | 0 | ✅ DONE |
| 5 | `structured.test.js` | 3 | 150/150 | 0 | ✅ DONE |
| 6 | `httpsig.test.js` | 2 | 130/130 | 0 | ✅ DONE |
| 7 | `signer.test.js` | 1 | 137/137 | 0 | ✅ DONE |

**hbsig Total:** 717/717 cases passing (100%)

#### Hyperbeam Integration Tests (Task 3) - ⚠️ PARTIAL PROGRESS

| # | Test Name | Status | Error |
|---|-----------|--------|-------|
| 1 | should interact with a hyperbeam node | ⚠️ PARTIAL | Lua works (Count: 1), but HB caching error |
| 2 | should get messages and recover them | ⚠️ PARTIAL | Lua works (Count: 1), but HB caching error |
| 3 | should test test device | ❌ FAIL | - |
| 4 | should test add@1.0 | ❌ FAIL | - |
| 5 | should test mul@1.0 | ✅ PASS | - |
| 6 | should upload module #2 | ❌ FAIL | - |
| 7 | should deploy a process | ⚠️ PARTIAL | Same pattern |
| 8 | should run hyper Lua | ❌ FAIL | - |
| 9-15 | (remaining tests) | ❌ FAIL | Connection/other errors |

**Hyperbeam Total:** 1/15 passing (7%), 3+ partially working

**Status:** PARTIAL - Data field now works! But HyperBEAM caching error on subsequent requests

### Progress Update (2026-02-02)

**MAJOR PROGRESS:** The `data` field with Lua code is now being properly preserved!
- Lua handlers are registered and executed correctly
- First `Inc` action returns `"Count: 1"` as expected
- This proves the ao-body-key + content-digest signing approach works

**New Issue: HyperBEAM Caching Error**

After the first successful compute, subsequent requests fail with:
```
{necessary_message_not_found,<<>>,
 <<"Lazy link: XXX/random-seed">>}
```

This error occurs in `hb_cache:write` when HyperBEAM tries to cache the compute result.
The error is in HyperBEAM's lazy link resolution, not in the signing code.

### Current Issue: HyperBEAM Lazy Link Caching

**Problem:** After first compute succeeds, HyperBEAM fails when writing to cache

**Root Cause Analysis:**

The fundamental issue is a mismatch between HTTP Message Signatures and JSON POST:

1. **HTTP Message Signatures** (RFC-9421) sign headers, not body content
2. **Strings with newlines** (like Lua code) cannot be valid HTTP headers
3. **JSON POST with commitment signatures** puts field values in JSON body
4. **HyperBEAM's `with_only_committed`** filters messages to only fields in the committed list
5. **Body content fields** (like `data`) are not in the signature-input, so they're filtered out

**Blocking Upstream Issue:**

In `HyperBEAM/src/hb_message.erl` lines 249-250, there's a comment:
```erlang
%% Add the ao-body-key to the committed list if it is not already present
```

However, this is **NOT actually implemented**. The `with_only_committed` function should:
1. Check for `ao-body-key` header
2. Add that key (e.g., `data`) to the committed list
3. Preserve the body content field

Since `hb_message.erl` is not in the allowed modification list, this requires upstream HyperBEAM changes.

**Attempted Solutions:**

| # | Approach | Result | Why It Failed |
|---|----------|--------|---------------|
| 1 | Add `data` to committed list | `invalid_commitment` | `data` not in signature-input |
| 2 | Encode `data` as `:base64:` byte sequence | `invalid_commitment` | Signature over base64, body has original |
| 3 | Use original values in JSON body | `unexpected_type,binary` | ao-types mismatch |
| 4 | Filter binary type annotations | `invalid_commitment` | Still signature/body mismatch |
| 5 | Use `enc()` for multipart encoding | `invalid_commitment` | JSON POST always used |
| 6 | Base64-text custom type | Messages: 0 | Field still not in committed list |
| 7 | Encode complex strings as base64 headers | `invalid_commitment` | HyperBEAM decodes before signature verification |
| 8 | HTTP POST with multipart (enc()) | 400: Message not valid | Scheduler endpoint rejects multipart |

**Possible Workarounds:**
1. Request upstream fix in `hb_message.erl` to implement `ao-body-key` handling
2. Modify message protocol to not require body content in committed fields
3. Use ANS-104 format instead of httpsig for messages with body content

### Solution That Works (2026-02-02)

**Working approach:** ao-body-key + content-digest signing

1. Put complex string (Lua code) directly in HTTP body
2. Set `ao-body-key: data` header to tell HyperBEAM which field the body maps to
3. Sign `content-digest` header (covers HTTP body)
4. Add body field name (e.g., `data`) to committed list via content-digest

**Key Changes:**
- **signer.js:smartSign()**: Detects data/body fields with non-printable chars, puts in HTTP body
- **signer.js:sign()**: Sign content-digest when `ao-body-key` is set and body exists
- **commit.js**: Add body field to committed list when content-digest is signed

### Changes Made This Session (2026-02-02)
1. **signer.js**: Changed `inline-body-key` to `ao-body-key` (HyperBEAM's expected header)
2. **signer.js**: Modified `hasInlineBody` detection to sign content-digest
3. **commit.js**: Add body field to committed list via content-digest mechanism
4. **hb.js**: Added debug logging for JSON POST body
5. **Result**: Lua handlers now work! "Count: 1" is returned correctly
6. **New issue**: HyperBEAM caching error with lazy links (upstream issue)

---

## Local Reconstruction

To update local machine and verify:

```bash
git pull
git submodule update --init --recursive
cd hbsig && yarn build && cd .. && npm install
```

Verify correct branches/commits:

```bash
# Check wao repo branch and commit
git --no-pager branch -v
git --no-pager log -1 --oneline

# Check HyperBEAM submodule commit (should match Merged HB in checkpoint table)
cd HyperBEAM && git --no-pager log -1 --oneline && cd ..
```

### Switching to a specific checkpoint

Use the "Done Commit (wao)" from the checkpoint table to reconstruct a working state:

```bash
git checkout <DONE_COMMIT>  # e.g., fe0ce72 for CP1
git submodule update --init --recursive
cd HyperBEAM && rebar3 compile && cd ..
cd hbsig && yarn build && cd .. && npm install
```

### Manually setting submodule to specific commit

If the submodule is not at the correct commit:

```bash
cd HyperBEAM
git fetch origin
git checkout <MERGED_HB>  # Use commit hash, e.g., 741c1540 (NOT branch name)
cd ..

# Update parent repo to record this submodule commit
git add HyperBEAM
git commit -m "Update HyperBEAM submodule to <MERGED_HB>"
```
