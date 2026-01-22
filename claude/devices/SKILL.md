# Erlang Device Development

Build HyperBEAM infrastructure with Erlang.

**BEFORE BUILDING: Read `../docs/llms.txt` for TABM format and device patterns.**

> For Lua apps, see `../apps/SKILL.md`

## Devices

| Device | File | Description |
|--------|------|-------------|
| **KV Store** | `dev_kv.erl` | Personal key-value store with persistence |
| **Processor** | `dev_processor.erl` | Data encoding, signing, and name resolution |
| **Gateway** | `dev_gateway.erl` | Authenticated API gateway with payments |
| **Data Platform** | `dev_dataplatform.erl` | Arweave storage with replication |
| **AOJS** | `dev_aojs.erl` | JavaScript smart contract runtime |
| **Counter** | `dev_counter.erl` | Counter with history tracking (vibe-coded) |
| **Rate Limiter** | `dev_ratelimiter.erl` | Token bucket rate limiting (vibe-coded) |
| **Analytics** | `dev_analytics.erl` | Event and metrics tracking (vibe-coded) |

## Device Structure

```erlang
-module(dev_example).
-export([info/3, operation1/3, operation2/3]).
-include("include/hb.hrl").

%% Device metadata
info(_M1, _M2, _Opts) ->
    {ok, #{
        <<"name">> => <<"example">>,
        <<"version">> => <<"1.0">>,
        <<"description">> => <<"Example Device">>
    }}.

%% Operations take (M1, M2, Opts)
%% M1 = State/process message
%% M2 = Request message
%% Opts = Options map
operation1(M1, M2, Opts) ->
    %% Return {ok, Result} or {error, Error}
    {ok, #{<<"status">> => <<"done">>}}.
```

## Testing

### Eunit Tests (Erlang)

Each device includes eunit tests. Run them with:

```bash
# From HyperBEAM directory (after copying devices)
cd HyperBEAM
rebar3 eunit --module=dev_counter
rebar3 eunit --module=dev_ratelimiter
rebar3 eunit --module=dev_analytics
```

Test patterns used:

```erlang
%% Direct function call
{ok, Info} = info(#{}, #{}, #{}).

%% Using hb_ao:resolve
{ok, Result} = hb_ao:resolve(
    {as, dev_example, #{}},
    #{<<"path">> => <<"operation">>},
    Opts
).
```

### WAO Tests (JavaScript)

After devices are compiled into HyperBEAM:

```bash
# Run WAO integration tests
node --test claude/devices/tests/device-wao.test.js
```

## API Patterns

### HTTP Endpoints

```
GET  /~device@1.0/info          Device metadata
GET  /~device@1.0/read          Read operations
POST /~device@1.0/write         Write operations
```

### WAO SDK Usage

```javascript
import { HB } from "wao/hb"

const hb = await new HB().init()

// GET request
const info = await hb.g("/~kv@1.0/info")

// POST request with params
const result = await hb.p("/~kv@1.0/set", {
  key: "greeting",
  value: "hello"
})
```

## Vibe-Coded Devices

The following devices were vibe-coded (generated from natural language descriptions):

### Counter Device (`dev_counter.erl`)

**Prompt:** "Build a counter device that can increment, decrement, and reset. Track who made each change with history."

**API:**
- `GET /~counter@1.0/get` - Get current count
- `POST /~counter@1.0/inc` - Increment (optional `amount`)
- `POST /~counter@1.0/dec` - Decrement (optional `amount`)
- `POST /~counter@1.0/reset` - Reset to zero
- `GET /~counter@1.0/history` - Get change history

### Rate Limiter Device (`dev_ratelimiter.erl`)

**Prompt:** "Create a token bucket rate limiter for API protection with configurable limits."

**API:**
- `POST /~ratelimiter@1.0/check` - Check if request allowed
- `POST /~ratelimiter@1.0/consume` - Consume tokens
- `GET /~ratelimiter@1.0/status` - Get bucket status
- `POST /~ratelimiter@1.0/configure` - Configure limits
- `POST /~ratelimiter@1.0/reset` - Reset bucket

### Analytics Device (`dev_analytics.erl`)

**Prompt:** "Build an analytics device to track events, record metrics, and provide statistics."

**API:**
- `POST /~analytics@1.0/track` - Track an event
- `POST /~analytics@1.0/metric` - Record a metric value
- `GET /~analytics@1.0/events` - Get events (filtered)
- `GET /~analytics@1.0/metrics` - Get metrics summary
- `GET /~analytics@1.0/stats` - Get overall statistics
- `POST /~analytics@1.0/clear` - Clear all data

## Installing Devices into HyperBEAM

1. Copy device files to HyperBEAM src:
   ```bash
   cp dev_*.erl /path/to/HyperBEAM/src/
   ```

2. Add to `hb_opts.erl` preloaded_devices:
   ```erlang
   preloaded_devices => [
       #{<<"name">> => <<"counter@1.0">>, <<"module">> => dev_counter},
       #{<<"name">> => <<"ratelimiter@1.0">>, <<"module">> => dev_ratelimiter},
       #{<<"name">> => <<"analytics@1.0">>, <<"module">> => dev_analytics}
   ]
   ```

3. Compile and run HyperBEAM:
   ```bash
   rebar3 compile
   rebar3 shell
   ```

## Key Concepts

### State Management

Devices use `hb_private` and `hb_cache` for persistence:

```erlang
%% Store in private state
M1#{<<"priv">> => #{<<"key">> => Value}}

%% Cache larger data
{ok, ID} = hb_cache:write(Data, Opts),
{ok, Data} = hb_cache:read(ID, Opts).
```

### Error Handling

```erlang
{ok, #{<<"status">> => <<"success">>}}
{error, #{<<"status">> => 400, <<"error">> => <<"Bad request">>}}
{error, #{<<"status">> => 404, <<"error">> => <<"Not found">>}}
```

### Testing Setup

```erlang
setup_test_env() ->
    application:ensure_all_started(hb),
    Store = hb_test_utils:test_store(hb_store_fs),
    #{store => [Store]}.
```

## Resources

- [Build1: KV Store](/docs/docs/pages/book/build1.mdx)
- [Build2: Data Processor](/docs/docs/pages/book/build2.mdx)
- [Build3: API Gateway](/docs/docs/pages/book/build3.mdx)
- [Build4: Data Platform](/docs/docs/pages/book/build4.mdx)
- [Build5: JS Smart Contracts](/docs/docs/pages/book/build5.mdx)
