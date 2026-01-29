# Mission

**Make all checkpoint statuses ✅ DONE**

Each checkpoint follows a task loop. The todo list tracks progress within the current checkpoint iteration.

## Rules (STRICT)

1. **HyperBEAM commits go to `wao-m1` branch only** (ask for GitHub token if needed to push)
2. **Only modify these files:**
   - `HyperBEAM/src/dev_hbsig.erl`
   - `hbsig/src/*.js`
   - `hbsig/test/*.test.js`
3. **NEVER remove or skip test cases**
4. **COMMIT AND PUSH after completing each task** - Do NOT proceed to the next task until changes are committed and pushed to remote

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
| # | Test File | Status |
|---|-----------|--------|
| 1 | `id.test.js` | ⬜ |
| 2 | `commit.test.js` | ⬜ |
| 3 | `erl_json.test.js` | ⬜ |
| 4 | `flat.test.js` | ⬜ |
| 5 | `structured.test.js` | ⬜ |
| 6 | `httpsig.test.js` | ⬜ |
| 7 | `signer.test.js` | ⬜ |

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

### Task 3: Mark Done
- Once all 7 tests pass, update checkpoint status to ✅ DONE
- Move to next checkpoint and repeat the loop

---

# Checkpoints

Using official upstream release tags as checkpoints.

| CP | Upstream Commit | Merged HB | Date | Message | Status |
|----|-----------------|-----------|------|---------|--------|
| 0 | [`b2743e4a`](https://github.com/permaweb/HyperBEAM/commit/b2743e4a) | [`30e00c77`](https://github.com/ocrybit/HyperBEAM/commit/30e00c77) | 2025-05-19 | Merge pull request #268 from permaweb/dpshade/docs-content-styling | ✅ DONE |
| 1 | [`2c8c6286`](https://github.com/permaweb/HyperBEAM/commit/2c8c6286) | [`741c1540`](https://github.com/ocrybit/HyperBEAM/commit/741c1540) | 2025-06-08 | [v0.9-milestone-3-beta-1](https://github.com/permaweb/HyperBEAM/tree/v0.9-milestone-3-beta-1) | ✅ DONE |
| 2 | [`d58f16b8`](https://github.com/permaweb/HyperBEAM/commit/d58f16b8) | | 2025-10-02 | [v0.9-milestone-3-beta-3](https://github.com/permaweb/HyperBEAM/tree/v0.9-milestone-3-beta-3) | 🔄 CURRENT |

---

## Current Progress: CP2

**Working branch:** [`claude/read-claude-md-3abIM`](https://github.com/ocrybit/wao/tree/claude/read-claude-md-3abIM)

### Tasks
- [ ] Task 1: Rebase and Merge Upstream
- [ ] Task 2: Make Tests 100% Pass
  - [ ] id.test.js
  - [ ] commit.test.js
  - [ ] erl_json.test.js
  - [ ] flat.test.js
  - [ ] structured.test.js
  - [ ] httpsig.test.js
  - [ ] signer.test.js
- [ ] Task 3: Mark Done

---

## Local Reconstruction

To reconstruct the working environment on a fresh machine:

```bash
# 1. Clone wao repository
git clone https://github.com/ocrybit/wao.git
cd wao

# 2. Initialize and update HyperBEAM submodule
git submodule update --init --recursive

# 3. Verify submodule points to correct commit (should match Merged HB in checkpoint table)
cd HyperBEAM
git log -1 --oneline  # Should show the commit from Merged HB column
cd ..

# 4. Install hbsig dependencies
cd hbsig
npm install
cd ..

# 5. Install wao dependencies
npm install

# 6. Build HyperBEAM (requires Erlang/OTP via asdf)
cd HyperBEAM
rebar3 compile
cd ..

# 7. Run tests to verify setup
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/id.test.js
```

### Switching to a specific checkpoint

```bash
# Update submodule to specific commit
cd HyperBEAM
git fetch origin wao-m1
git checkout <MERGED_HB_COMMIT>  # e.g., 741c1540 for CP1
cd ..

# Update parent repo reference
git add HyperBEAM
git commit -m "Update HyperBEAM submodule to <commit>"

# Rebuild
cd HyperBEAM && rebar3 compile && cd ..
```
