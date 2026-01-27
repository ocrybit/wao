# WAO SDK HyperBEAM Upgrade: wao → wao-m3

## Version History

### Old Working Version (master branch)

- **ocrybit/wao master branch** has HyperBEAM as a git submodule
- Submodule points to: `30e00c771577c119e159201a8ddfe82e27447106`
- This is from **weavedb/HyperBEAM** branch `wao`
- Which is based on **permaweb/HyperBEAM** at commit `b2743e4a` (PR #268)
- PR #268: https://github.com/permaweb/HyperBEAM/pull/268

### New Target Version (wao-m3 branch)

- **ocrybit/HyperBEAM** branch `wao-m3`
- This is a **rebase** of wao/hbsig updates onto beta3
- Beta3 tag: `v0.9-milestone-3-beta-3` at commit `d58f16b8`
- Current wao-m3 HEAD: `7f4096dd`

### Commit Gap

**1341 commits** between PR #268 (`b2743e4a`) and beta3 (`d58f16b8`)

```bash
# Verify commit count
cd ~/HyperBEAM && git rev-list --count b2743e4a..v0.9-milestone-3-beta-3
# Output: 1341
```

## What Changed

The 1341 commits include significant changes to:

1. **Codec APIs** - `dev_codec_structured`, `dev_codec_httpsig`, `dev_codec_flat`
2. **Message handling** - How nested objects/arrays are processed
3. **Linkification** - Nested structures get converted to content-addressed references
4. **JSON parsing** - `dev_codec_json:from/3` vs `json:decode/1`

## Constraint

**Only modify `/root/HyperBEAM/src/dev_hbsig.erl`** - no other .erl files can be changed.

## Current State

### Installed HyperBEAM

```bash
cd ~/HyperBEAM
git remote -v  # origin: ocrybit/HyperBEAM
git branch     # wao-m3
git log -1     # 7f4096dd (or current HEAD)
```

### Test Files

All tests in `/home/user/wao/hbsig/test/*.test.js`:

| Test File | Description |
|-----------|-------------|
| `erl_json.test.js` | JSON ↔ Erlang conversion |
| `signer.test.js` | HTTP signing round-trip |
| `structured.test.js` | structured_from/to codec |
| `httpsig.test.js` | httpsig_from/to codec |
| `flat.test.js` | flat_from/to codec |
| `commit.test.js` | Commit functionality |
| `id.test.js` | ID generation |

### Goal

**100% test pass rate** for all `hbsig/test/*.test.js` with wao-m3.

## Key Files

### dev_hbsig.erl (modifiable)

Location: `/root/HyperBEAM/src/dev_hbsig.erl`

Wraps codec devices for testing:
- `json_to_erl` - JSON to Erlang term conversion
- `structured_from`, `structured_to` - structured codec
- `httpsig_from`, `httpsig_to` - httpsig codec
- `flat_from`, `flat_to` - flat codec
- `msg2` - raw message inspection

### Test Utils

Location: `/home/user/wao/hbsig/test/lib/test-utils.js`

- `modIn` - Prepare JS object for comparison
- `modOut` - Parse Erlang response (`#erl_response{raw=...,formatted=...}`)

## Known Issues with wao-m3

1. **Linkification** - HyperBEAM converts nested objects/arrays to content-addressed links
2. **Header handling** - `json-body` vs `body` key differences
3. **Export format** - Must use binaries: `[<<"json_to_erl">>, ...]` not atoms

## Commands

```bash
# Run all hbsig tests
cd /home/user/wao
. ~/.asdf/asdf.sh
pkill -9 -f beam.smp; pkill -9 -f epmd; sleep 1
HB_TIMEOUT=120 node --test --test-concurrency=1 hbsig/test/*.test.js

# Recompile after dev_hbsig.erl changes
cd ~/HyperBEAM && rebar3 compile

# Check HyperBEAM version
cd ~/HyperBEAM && git log --oneline -1
```

## Timeline

- **PR #268 merge date**: ~1 month before beta1
- **Beta3 release**: `v0.9-milestone-3-beta-3`
- **Commits between**: 1341
