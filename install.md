# HyperBEAM Quick Install (v0.9-milestone-3-beta-3)

## Option 1: Use Pre-compiled Package (Fastest - 3 seconds)

```bash
cd /home/user
tar -xJf /path/to/wao/hyperbeam-v0.9-m3-b3-compiled.tar.xz
. ~/.asdf/asdf.sh && cd HyperBEAM && rebar3 eunit --sname test
```

## Option 2: Fresh Install (~2.5 minutes)

### System Dependencies (fresh system only)
```bash
sudo apt-get update && sudo apt-get install -y build-essential autoconf libssl-dev libncurses5-dev curl git cmake
```

### Prerequisites (one-time setup)
```bash
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0 && . ~/.asdf/asdf.sh && asdf plugin add erlang && asdf plugin add rebar https://github.com/Stratus3D/asdf-rebar.git && asdf install erlang 27.3.4.6 && asdf global erlang 27.3.4.6 && asdf install rebar 3.26.0 && asdf global rebar 3.26.0
```

### Install HyperBEAM
```bash
. ~/.asdf/asdf.sh
cd /home/user
git clone --depth 1 --branch v0.9-milestone-3-beta-3 https://github.com/permaweb/HyperBEAM.git
cd HyperBEAM
cp /path/to/wao/hyperbeam_rebar.config rebar.config
rm -f rebar.lock
rebar3 compile && rebar3 eunit --sname test
```

## Test Report
| Status | Count | Notes |
|--------|-------|-------|
| Passed | 120 | Core functionality works |
| Failed | 40 | Due to removed dependencies |

**Failed tests caused by removed dependencies:**
- `elmdb` - LMDB storage (requires Rust/Cargo)
- `prometheus` - Metrics collection
- `prometheus_cowboy` - Prometheus HTTP integration
- `prometheus_httpd` - HTTP metrics endpoint

These dependencies were removed to enable installation without Rust toolchain and hex.pm access.

## Files Needed
- `hyperbeam_rebar.config` - Patched config with git-only deps (bypasses hex.pm)
- `hyperbeam-v0.9-m3-b3-compiled.tar.xz` - Pre-compiled package (19MB)
