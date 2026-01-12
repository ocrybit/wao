# HyperBEAM Quick Install (v0.9-milestone-3-beta-3)

## Option 1: Pre-compiled (Fastest - ~5 seconds)

No system dependencies required - everything is pre-compiled including WAMR and dependencies.

```bash
cd ~
tar -xJf /path/to/wao/asdf-erlang-rebar.tar.xz
tar -xJf /path/to/wao/hyperbeam-v0.9-m3-b3-compiled.tar.xz
. ~/.asdf/asdf.sh
asdf global erlang 27.3.4.6
asdf global rebar 3.26.0
echo '. ~/.asdf/asdf.sh' >> ~/.bashrc
```

Validate installation (11 tests, ~7 seconds first run):
```bash
cd ~/HyperBEAM && rebar3 eunit --module=hb_path --sname test
```

Optional: Run all tests
```bash
cd ~/HyperBEAM && rebar3 eunit --sname test
```

## Option 2: Fresh Install (~13 minutes)

### System Dependencies (requires root/sudo)
Skip if already installed:
```bash
apt-get update && apt-get install -y build-essential autoconf libssl-dev libncurses5-dev curl git cmake
```

### Prerequisites
```bash
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0 && . ~/.asdf/asdf.sh && asdf plugin add erlang && asdf plugin add rebar https://github.com/Stratus3D/asdf-rebar.git && asdf install erlang 27.3.4.6 && asdf global erlang 27.3.4.6 && asdf install rebar 3.26.0 && asdf global rebar 3.26.0
echo '. ~/.asdf/asdf.sh' >> ~/.bashrc
```

### Install HyperBEAM
```bash
. ~/.asdf/asdf.sh
cd ~
git clone --depth 1 --branch v0.9-milestone-3-beta-3 https://github.com/permaweb/HyperBEAM.git
cd HyperBEAM
cp /path/to/wao/hyperbeam_rebar.config rebar.config
rm -f rebar.lock
rebar3 compile
```

Optional: Run tests
```bash
rebar3 eunit --sname test
```

## Test Report (January 12, 2026)
| Status | Count | Notes |
|--------|-------|-------|
| Passed | 106 | Core functionality works |
| Failed | 35 | HTTP/cron/integration tests |

Failures are HTTP server initialization, cron timing, and external integration issues in sandboxed test environments. Core functionality (bundles, paths, wallets, codecs, WASM execution) works correctly.

## Files Needed
- `hyperbeam_rebar.config` - Patched config with git-only deps (bypasses hex.pm)
- `hyperbeam-v0.9-m3-b3-compiled.tar.xz` - Pre-compiled HyperBEAM + WAMR + deps with git state (30MB)
- `asdf-erlang-rebar.tar.xz` - Pre-compiled Erlang 27.3.4.6 + rebar3 (23MB, stripped)
