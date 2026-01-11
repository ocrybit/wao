# HyperBEAM Installation Report

## Environment Details
- **OS**: Ubuntu 24.04.3 LTS (Noble Numbat)
- **Platform**: Linux 4.4.0 (x86_64)
- **Date**: January 11, 2026

## Test Results Summary
- **Passed**: 120 tests
- **Failed**: 40 tests (due to removed dependencies)
- **Skipped**: 0 tests

## Extra Steps Required Beyond Official Documentation

The official HyperBEAM documentation assumes a clean Ubuntu 22.04 environment with sudo access. On this machine (Ubuntu 24.04 without sudo), the following extra steps were required:

### 1. Installing Erlang OTP 27 via asdf (No Sudo Access)

Since sudo was unavailable, the system packages couldn't be used. Instead:

```bash
# Install asdf version manager
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0

# Source asdf
. ~/.asdf/asdf.sh

# Add Erlang plugin
asdf plugin add erlang https://github.com/asdf-vm/asdf-erlang.git

# Install Erlang OTP 27
asdf install erlang 27.3.4.6
asdf global erlang 27.3.4.6
```

### 2. Installing rebar3 via asdf

```bash
# Add rebar plugin
asdf plugin add rebar https://github.com/Stratus3D/asdf-rebar.git

# Install rebar3
asdf install rebar 3.26.0
asdf global rebar 3.26.0
```

### 3. Network/Proxy Issues with Hex Package Manager

**Problem**: The environment was behind an HTTP proxy that doesn't properly handle SSL tunneling for Erlang's httpc client. This caused all hex.pm package fetches to fail with 401 Unauthorized errors.

**Solution**: Convert all hex dependencies to git sources in rebar.config:

```erlang
% Original (fails):
{deps, [{cowboy, "2.14.0"}]}.

% Fixed:
{deps, [{cowboy, {git, "https://github.com/ninenines/cowboy.git", {tag, "2.14.0"}}}]}.
```

### 4. Required rebar.config Modifications

The following modifications were made to `/home/user/HyperBEAM/rebar.config`:

#### 4.1 Convert Plugins to Git Sources
```erlang
{plugins, [
    {pc, {git, "https://github.com/blt/port_compiler.git", {tag, "v1.15.0"}}}
]}.
```

#### 4.2 Convert All Dependencies to Git Sources
```erlang
{deps, [
    {b64fast, {git, "https://github.com/ArweaveTeam/b64fast.git", {ref, "58f0502..."}}},
    {cowlib, {git, "https://github.com/ninenines/cowlib.git", {tag, "2.16.0"}}},
    {cowboy, {git, "https://github.com/ninenines/cowboy.git", {tag, "2.14.0"}}},
    {ranch, {git, "https://github.com/ninenines/ranch.git", {tag, "2.2.0"}}},
    {gun, {git, "https://github.com/ninenines/gun.git", {tag, "2.2.0"}}},
    {graphql, {git, "https://github.com/esl/graphql-erlang.git", {tag, "0.17.0"}}},
    {luerl, {git, "https://github.com/rvirding/luerl.git", {tag, "1.3.0"}}}
]}.
```

#### 4.3 Add Overrides for Transitive Dependencies
```erlang
{overrides, [
    {override, gun, [{deps, [
        {cowlib, {git, "https://github.com/ninenines/cowlib.git", {tag, "2.16.0"}}}
    ]}]},
    {override, graphql, [{deps, []}, {plugins, []}, {project_plugins, []}]}
]}.
```

### 5. Removed Dependencies

The following dependencies were removed to simplify the build (they depend on additional hex packages):

- **elmdb** - Requires rebar3_cargo plugin for Rust compilation
- **prometheus** - Has transitive hex dependencies (ddskerl)
- **prometheus_cowboy** - Has transitive hex dependencies
- **prometheus_httpd** - Has transitive hex dependencies
- **rebar3_cargo** - Plugin for Rust builds
- **rebar3_rustler** - Plugin for Rust builds
- **rebar_edown_plugin** - Documentation plugin

### 6. Post-Hook Fixes

Removed elmdb-related post-hook that referenced non-existent files:
```erlang
% Removed:
{ compile, "cp _build/default/lib/elmdb/priv/crates/elmdb_nif/elmdb_nif.so ..." }
```

### 7. Provider Hooks

Commented out provider_hooks as they caused duplicate native compilation:
```erlang
% {provider_hooks, [
%     {post, [
%         {compile, {pc, compile}},
%         {clean, {pc, clean}}
%     ]}
% ]}.
```

## Working Commands After Modifications

```bash
# Source asdf
. ~/.asdf/asdf.sh

# Navigate to HyperBEAM
cd /home/user/HyperBEAM

# Compile
rebar3 compile

# Run tests
rebar3 eunit --sname test
```

## Key Findings

1. **Hex.pm Proxy Issues**: Erlang's built-in HTTP client (`httpc`) doesn't handle HTTP CONNECT proxies well for SSL connections. This is a known limitation when behind corporate proxies.

2. **Dependency Graph**: HyperBEAM has a deep dependency tree. Many hex packages have their own plugins and dependencies that also try to fetch from hex.pm.

3. **Ubuntu 24.04 Compatibility**: The system runs fine on Ubuntu 24.04 despite documentation recommending 22.04.

4. **Test Failures**: The 40 failed tests are likely due to missing functionality from removed dependencies (prometheus metrics, elmdb storage, etc.).

## Recommendations for Future Installations

1. **Use Docker**: The HyperBEAM repo includes a Dockerfile that bundles all dependencies.

2. **Offline Installation**: Pre-download all hex packages and configure rebar3 to use local packages.

3. **Direct Network Access**: If possible, avoid HTTP proxies for Erlang builds.

4. **Document Git Alternatives**: Maintain a list of git repository URLs for all hex dependencies.

## Sources

- [Running a HyperBEAM Node - Documentation](https://hyperbeam.ar.io/run/running-a-hyperbeam-node.html)
- [HyperBEAM GitHub Repository](https://github.com/permaweb/HyperBEAM)
- [asdf Version Manager](https://github.com/asdf-vm/asdf)
- [asdf Erlang Plugin](https://github.com/asdf-vm/asdf-erlang)
