# HyperBEAM Quick Install (v0.9-milestone-3-beta-3)

## Option 1: Use Pre-compiled Package (Fastest - 3 seconds)

```bash
cd /home/user
tar -xJf /path/to/wao/hyperbeam-v0.9-m3-b3-compiled.tar.xz
. ~/.asdf/asdf.sh && cd HyperBEAM && rebar3 eunit --sname test
```

## Option 2: Fresh Install (~13 minutes)

### System Dependencies (fresh system only)
```bash
sudo apt-get update && sudo apt-get install -y build-essential autoconf libssl-dev libncurses5-dev curl git cmake
```

### Prerequisites (one-time setup)
```bash
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0 && . ~/.asdf/asdf.sh && asdf plugin add erlang && asdf plugin add rebar https://github.com/Stratus3D/asdf-rebar.git && asdf install erlang 27.3.4.6 && asdf global erlang 27.3.4.6 && asdf install rebar 3.26.0 && asdf global rebar 3.26.0
```

**Optional:** Add asdf to shell profile for persistence:
```bash
echo '. ~/.asdf/asdf.sh' >> ~/.bashrc
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

## Test Report (January 11, 2026)
| Status | Count | Notes |
|--------|-------|-------|
| Passed | 92 | Core functionality works |
| Failed | 14 | HTTP/cron tests (see below) |

**Failed tests:**
| File | Test | Line |
|------|------|------|
| dev_apply.erl | resolve_with_prefix_test | 254 |
| dev_apply.erl | apply_over_http_test | 286 |
| dev_arweave.erl | post_ans104_tx_test | 264 |
| dev_auth_hook.erl | cookie_test | 452 |
| dev_auth_hook.erl | http_auth_test | 542 |
| dev_auth_hook.erl | chained_preprocess_test | 621 |
| dev_auth_hook.erl | when_test | 648 |
| dev_codec_cookie_auth.erl | http_set_get_cookies_test | 226 |
| dev_codec_httpsig.erl | validate_large_message_from_http_test | 543 |
| dev_cron.erl | stop_once_test | 186 |
| dev_cron.erl | stop_every_test | 224 |
| dev_cron.erl | once_executed_test | 273 |
| dev_cron.erl | every_worker_loop_test | 299 |
| dev_json_iface.erl | basic_aos_call_test | (timeout) |

Failures are HTTP server initialization and cron timing issues in the test environment.

## Files Needed
- `hyperbeam_rebar.config` - Patched config with git-only deps (bypasses hex.pm)
- `hyperbeam-v0.9-m3-b3-compiled.tar.xz` - Pre-compiled package (19MB)
