# HyperBEAM 1-Minute Install

## Prerequisites
Erlang 27 + rebar3 already installed via asdf. If not:
```bash
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0 && . ~/.asdf/asdf.sh && asdf plugin add erlang && asdf plugin add rebar https://github.com/Stratus3D/asdf-rebar.git && asdf install erlang 27.3.4.6 && asdf global erlang 27.3.4.6 && asdf install rebar 3.26.0 && asdf global rebar 3.26.0
```

## Install & Test HyperBEAM

```bash
. ~/.asdf/asdf.sh
cd /home/user
git clone https://github.com/permaweb/HyperBEAM.git
cd HyperBEAM

# Patch rebar.config for git-only deps (bypasses hex.pm proxy issues)
sed -i 's/{plugins, \[pc, rebar3_rustler, rebar_edown_plugin\]}/{plugins, [{pc, {git, "https:\/\/github.com\/blt\/port_compiler.git", {tag, "v1.15.0"}}}]}/' rebar.config
sed -i 's/{cowlib, "2.16.0"}/{cowlib, {git, "https:\/\/github.com\/ninenines\/cowlib.git", {tag, "2.16.0"}}}/' rebar.config
sed -i 's/{cowboy, "2.14.0"}/{cowboy, {git, "https:\/\/github.com\/ninenines\/cowboy.git", {tag, "2.14.0"}}}/' rebar.config
sed -i 's/{ranch, "2.2.0"}/{ranch, {git, "https:\/\/github.com\/ninenines\/ranch.git", {tag, "2.2.0"}}}/' rebar.config
sed -i 's/{gun, "2.2.0"}/{gun, {git, "https:\/\/github.com\/ninenines\/gun.git", {tag, "2.2.0"}}}/' rebar.config
sed -i 's/{graphql, "0.17.1", {pkg, graphql_erl}}/{graphql, {git, "https:\/\/github.com\/esl\/graphql-erlang.git", {tag, "0.17.0"}}}/' rebar.config
sed -i 's/{luerl, "1.3.0"}/{luerl, {git, "https:\/\/github.com\/rvirding\/luerl.git", {tag, "1.3.0"}}}/' rebar.config
sed -i 's/{override, gun, \[{deps, \[cowlib\]}\]}/{override, gun, [{deps, [{cowlib, {git, "https:\/\/github.com\/ninenines\/cowlib.git", {tag, "2.16.0"}}}]}]}, {override, graphql, [{deps, []}, {plugins, []}, {project_plugins, []}]}/' rebar.config

# Remove prometheus deps (optional - avoids transitive hex deps)
sed -i '/{prometheus/d' rebar.config

# Compile & test
rebar3 compile && rebar3 eunit --sname test
```

## Already Cloned? Just Run:
```bash
. ~/.asdf/asdf.sh && cd /home/user/HyperBEAM && rebar3 compile && rebar3 eunit --sname test
```
