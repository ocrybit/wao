# HyperBEAM Quick Install Guide

## Prerequisites

```bash
# Check existing tools
which git cargo  # Both should be installed
```

## Step 1: Install Erlang OTP 27 & rebar3 via asdf

```bash
# Install asdf
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0
echo '. ~/.asdf/asdf.sh' >> ~/.bashrc
. ~/.asdf/asdf.sh

# Install Erlang
asdf plugin add erlang
asdf install erlang 27.3.4.6
asdf global erlang 27.3.4.6

# Install rebar3
asdf plugin add rebar https://github.com/Stratus3D/asdf-rebar.git
asdf install rebar 3.26.0
asdf global rebar 3.26.0

# Verify
erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().' -noshell  # Should show "27"
rebar3 --version
```

## Step 2: Clone HyperBEAM

```bash
cd /home/user
git clone https://github.com/permaweb/HyperBEAM.git
cd HyperBEAM
```

## Step 3: Patch rebar.config (Required if hex.pm is blocked by proxy)

Apply this patch to convert hex deps to git sources:

```bash
cat > /tmp/rebar_patch.erl << 'PATCH'
{plugins, [
    {pc, {git, "https://github.com/blt/port_compiler.git", {tag, "v1.15.0"}}}
]}.

{deps, [
    {elmdb, {git, "https://github.com/twilson63/elmdb-rs.git", {branch, "feat/match"}}},
    {b64fast, {git, "https://github.com/ArweaveTeam/b64fast.git", {ref, "58f0502e49bf73b29d95c6d02460d1fb8d2a5273"}}},
    {cowlib, {git, "https://github.com/ninenines/cowlib.git", {tag, "2.16.0"}}},
    {cowboy, {git, "https://github.com/ninenines/cowboy.git", {tag, "2.14.0"}}},
    {ranch, {git, "https://github.com/ninenines/ranch.git", {tag, "2.2.0"}}},
    {gun, {git, "https://github.com/ninenines/gun.git", {tag, "2.2.0"}}},
    {graphql, {git, "https://github.com/esl/graphql-erlang.git", {tag, "0.17.0"}}},
    {luerl, {git, "https://github.com/rvirding/luerl.git", {tag, "1.3.0"}}}
]}.

{overrides, [
    {override, gun, [{deps, [{cowlib, {git, "https://github.com/ninenines/cowlib.git", {tag, "2.16.0"}}}]}]},
    {override, graphql, [{deps, []}, {plugins, []}, {project_plugins, []}]}
]}.
PATCH
```

Then manually edit `rebar.config`:
1. Replace `{plugins, [...]}` with the git version above
2. Replace `{deps, [...]}` with the git version above
3. Replace `{overrides, [...]}` with the version above
4. Remove prometheus deps if they cause issues (prometheus, prometheus_cowboy, prometheus_httpd)
5. Comment out `{provider_hooks, [...]}` section

## Step 4: Compile

```bash
. ~/.asdf/asdf.sh
cd /home/user/HyperBEAM
rebar3 compile
```

## Step 5: Run Tests

```bash
rebar3 eunit --sname test
```

## Quick One-Liner (After asdf setup)

```bash
. ~/.asdf/asdf.sh && cd /home/user/HyperBEAM && rebar3 compile && rebar3 eunit --sname test
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Package not found in any repo: X` | Convert hex dep to git in rebar.config |
| `Hook for compile failed!` | Remove elmdb post-hook, comment out provider_hooks |
| `behaviour X undefined` | Missing dep, add or ignore warning |
| SSL/TLS errors with hex.pm | Use git sources instead of hex |

## Key Git Repos for Deps

| Package | Git URL |
|---------|---------|
| cowboy | `https://github.com/ninenines/cowboy.git` |
| cowlib | `https://github.com/ninenines/cowlib.git` |
| ranch | `https://github.com/ninenines/ranch.git` |
| gun | `https://github.com/ninenines/gun.git` |
| graphql | `https://github.com/esl/graphql-erlang.git` |
| luerl | `https://github.com/rvirding/luerl.git` |
| prometheus | `https://github.com/deadtrickster/prometheus.erl.git` |
| ddskerl | `https://github.com/NelsonVides/ddskerl.git` |
| accept | `https://github.com/deadtrickster/accept.git` |
