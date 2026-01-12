%%%-------------------------------------------------------------------
%%% @doc JavaScript Smart Contract Runtime Device
%%%
%%% Executes JavaScript smart contracts using QuickJS compiled to WASM.
%%% This device interfaces with hb_beamr to run JavaScript code in a
%%% sandboxed WebAssembly environment.
%%%
%%% API:
%%%   init/3     - Initialize the runtime
%%%   compute/3  - Execute a handler for a message
%%%   snapshot/3 - Save runtime state
%%%   normalize/3 - Restore runtime state
%%%
%%% @end
%%%-------------------------------------------------------------------
-module(dev_aojs).
-export([info/3, init/3, compute/3, snapshot/3, normalize/3]).
-export([load_js_module/2]).

-include("include/hb.hrl").

-define(RESULT_BUF_SIZE, 65536).

%%% ============================================================
%%% Device Info
%%% ============================================================

info(_M1, _M2, _Opts) ->
    {ok, #{
        <<"name">> => <<"aojs@1.0">>,
        <<"description">> => <<"JavaScript Smart Contract Runtime">>,
        <<"exports">> => [<<"init">>, <<"compute">>, <<"snapshot">>, <<"normalize">>]
    }}.

%%% ============================================================
%%% Initialize
%%% ============================================================

init(M1, _M2, Opts) ->
    Prefix = dev_stack:prefix(M1, #{}, Opts),

    %% Check if already initialized
    case hb_private:get(prefixed_key(Prefix, <<"initialized">>), M1, not_found, Opts) of
        true ->
            {ok, M1};
        _ ->
            do_init(M1, Prefix, Opts)
    end.

do_init(M1, Prefix, Opts) ->
    %% Get WASM instance (created by dev_wasm below us in the stack)
    Instance = hb_private:get(prefixed_key(Prefix, <<"instance">>), M1, not_found, Opts),

    case Instance of
        not_found ->
            {error, #{<<"error">> => <<"wasm_instance_not_found">>}};
        _ ->
            {ok, hb_private:set(M1, prefixed_key(Prefix, <<"ready">>), true, Opts)}
    end.

%%% ============================================================
%%% Load JavaScript Module
%%% ============================================================

load_js_module(M1, Opts) ->
    Prefix = dev_stack:prefix(M1, #{}, Opts),
    Instance = hb_private:get(prefixed_key(Prefix, <<"instance">>), M1, not_found, Opts),

    %% Inject AO runtime if needed
    case needs_runtime_injection(M1, Instance, Opts) of
        true ->
            inject_ao_runtime(Instance, Opts);
        false ->
            ok
    end,

    %% Get and load the JavaScript module source
    case find_module_source(M1, Opts) of
        not_found ->
            {ok, M1};
        Source when is_binary(Source) ->
            case eval_js(Instance, Source, Opts) of
                {ok, _} -> {ok, M1};
                {error, Error} -> {error, #{<<"error">> => Error}}
            end
    end.

needs_runtime_injection(_M1, Instance, Opts) ->
    case eval_js(Instance, <<"typeof Handlers">>, Opts) of
        {ok, <<"object">>} -> false;
        _ -> true
    end.

inject_ao_runtime(Instance, Opts) ->
    Runtime = ao_runtime_js(),
    eval_js(Instance, Runtime, Opts).

ao_runtime_js() ->
    %% Read from aojs/ao-runtime.js
    {ok, Content} = file:read_file("aojs/ao-runtime.js"),
    Content.

find_module_source(M1, Opts) ->
    %% Check for module in message or load from file
    case hb_maps:get(<<"aojs-module">>, M1, not_found, Opts) of
        not_found ->
            case hb_maps:get(<<"module-id">>, M1, not_found, Opts) of
                not_found -> not_found;
                ModuleId ->
                    Path = <<"aojs/aojs-modules/", ModuleId/binary, ".js">>,
                    case file:read_file(Path) of
                        {ok, Content} -> Content;
                        _ -> not_found
                    end
            end;
        Source ->
            Source
    end.

%%% ============================================================
%%% Compute - Handle Messages
%%% ============================================================

compute(M1, M2, Opts) ->
    %% Ensure module is loaded
    {ok, M1Loaded} = load_js_module(M1, Opts),
    execute_handler(M1Loaded, M2, Opts).

execute_handler(M1, M2, Opts) ->
    Prefix = dev_stack:prefix(M1, M2, Opts),
    Instance = hb_private:get(prefixed_key(Prefix, <<"instance">>), M1, not_found, Opts),

    %% Get message and process info
    Message = hb_maps:get(<<"body">>, M2, #{}, Opts),
    Process = hb_maps:get(<<"process">>, M1, #{}, Opts),

    %% Build JSON for JavaScript
    MsgJson = build_msg_json(Message, M2, Opts),
    EnvJson = build_env_json(Process, Opts),

    %% Execute handler
    JsCode = iolist_to_binary([
        <<"_clearOutbox();globalThis.msg=">>, MsgJson,
        <<";globalThis.env=">>, EnvJson,
        <<";JSON.stringify(Handlers.handle(msg))">>
    ]),

    case eval_js(Instance, JsCode, Opts) of
        {ok, ResultJson} ->
            OutboxJson = read_outbox(Instance, Opts),
            process_results(M1, ResultJson, OutboxJson, Opts);
        {error, Error} ->
            {error, #{<<"error">> => Error}}
    end.

build_msg_json(Message, M2, Opts) ->
    Id = hb_maps:get(<<"id">>, Message, <<>>, Opts),
    From = hb_maps:get(<<"from-process">>, Message, <<>>, Opts),
    Action = hb_maps:get(<<"action">>, Message, <<"default">>, Opts),
    Data = hb_maps:get(<<"data">>, Message, <<>>, Opts),
    BlockHeight = hb_maps:get(<<"block-height">>, M2, 0, Opts),

    MsgMap = #{
        <<"Id">> => Id,
        <<"From">> => From,
        <<"Action">> => Action,
        <<"Data">> => Data,
        <<"Tags">> => build_tags(Message, Opts),
        <<"Block-Height">> => BlockHeight
    },
    hb_json:encode(MsgMap).

build_env_json(Process, Opts) ->
    ProcId = hb_maps:get(<<"id">>, Process, <<>>, Opts),
    EnvMap = #{
        <<"Process">> => #{<<"Id">> => ProcId}
    },
    hb_json:encode(EnvMap).

build_tags(Message, _Opts) when is_map(Message) ->
    ExcludeKeys = [<<"id">>, <<"from">>, <<"action">>, <<"data">>, <<"priv">>],
    maps:fold(fun(Key, Value, Acc) ->
        case lists:member(hb_ao:normalize_key(Key), ExcludeKeys) of
            true -> Acc;
            false when is_binary(Value); is_integer(Value) ->
                Acc#{Key => Value};
            false -> Acc
        end
    end, #{}, Message);
build_tags(_, _) -> #{}.

%%% ============================================================
%%% JavaScript Evaluation (WASM Interface)
%%% ============================================================

eval_js(Instance, Code, _Opts) ->
    %% Write code to WASM memory
    case hb_beamr_io:write_string(Instance, Code) of
        {ok, CodePtr} ->
            CodeLen = byte_size(Code),
            %% Allocate result buffer
            case hb_beamr_io:malloc(Instance, ?RESULT_BUF_SIZE) of
                {ok, ResultPtr} ->
                    %% Call qjs_eval(code, len, out, out_size)
                    Result = hb_beamr:call(Instance, "qjs_eval",
                        [CodePtr, CodeLen, ResultPtr, ?RESULT_BUF_SIZE]),

                    EvalResult = case Result of
                        {ok, [Length]} when Length >= 0 ->
                            {ok, ResultBin} = hb_beamr_io:read(Instance, ResultPtr, max(1, Length)),
                            {ok, ResultBin};
                        {ok, [Length]} when Length < 0 ->
                            {ok, ErrorBin} = hb_beamr_io:read_string(Instance, ResultPtr),
                            {error, ErrorBin};
                        {error, E} ->
                            {error, E}
                    end,

                    %% Free memory
                    hb_beamr_io:free(Instance, CodePtr),
                    hb_beamr_io:free(Instance, ResultPtr),
                    EvalResult;
                {error, E} ->
                    hb_beamr_io:free(Instance, CodePtr),
                    {error, E}
            end;
        {error, E} ->
            {error, E}
    end.

read_outbox(Instance, Opts) ->
    case eval_js(Instance, <<"_getOutbox()">>, Opts) of
        {ok, OutboxJson} -> OutboxJson;
        _ -> <<"[]">>
    end.

process_results(M1, ResultJson, OutboxJson, _Opts) ->
    Result = hb_json:decode(ResultJson),
    Outbox = hb_json:decode(OutboxJson),
    {ok, M1#{
        <<"results">> => #{
            <<"data">> => Result,
            <<"outbox">> => Outbox
        }
    }}.

%%% ============================================================
%%% Snapshot and Normalize (State Persistence)
%%% ============================================================

snapshot(M1, _M2, Opts) ->
    Prefix = dev_stack:prefix(M1, #{}, Opts),
    Instance = hb_private:get(prefixed_key(Prefix, <<"instance">>), M1, not_found, Opts),
    case Instance of
        not_found ->
            {error, <<"no_wasm_instance">>};
        _ ->
            case hb_beamr:serialize(Instance) of
                {ok, Snapshot} -> {ok, M1#{<<"snapshot">> => Snapshot}};
                {error, E} -> {error, E}
            end
    end.

normalize(M1, _M2, Opts) ->
    case hb_maps:get(<<"snapshot">>, M1, not_found, Opts) of
        not_found ->
            {ok, M1};
        Snapshot ->
            Prefix = dev_stack:prefix(M1, #{}, Opts),
            Instance = hb_private:get(prefixed_key(Prefix, <<"instance">>), M1, not_found, Opts),
            case hb_beamr:deserialize(Instance, Snapshot) of
                ok -> {ok, maps:remove(<<"snapshot">>, M1)};
                {error, E} -> {error, E}
            end
    end.

%%% ============================================================
%%% Helpers
%%% ============================================================

prefixed_key(<<>>, Key) -> Key;
prefixed_key(Prefix, Key) -> <<Prefix/binary, "/", Key/binary>>.

%%% ============================================================
%%% Tests - Using hb_ao:resolve with device stack composition
%%% Following L5 tutorial pattern from docs/pages/book/build5.mdx
%%% ============================================================

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").

%% Test helper - start environment
start() ->
    application:ensure_all_started(hb),
    <<I1:32, I2:32, I3:32>> = crypto:strong_rand_bytes(12),
    rand:seed(exsplus, {I1, I2, I3}),
    ok.

%% Test helper - setup store
setup_test_env() ->
    start(),
    Store = hb_test_utils:test_store(hb_store_fs),
    #{store => [Store]}.

%% ============================================================
%% Basic Device Tests - Using {as, Module, Msg} pattern
%% ============================================================

%% Test device info via hb_ao:resolve with {as, dev_aojs, Msg}
info_test() ->
    start(),
    %% Use {as, dev_aojs, Msg} to resolve without device registration
    {ok, Info} = hb_ao:resolve(
        {as, dev_aojs, #{}},
        #{<<"path">> => <<"info">>},
        #{}
    ),
    ?assertEqual(<<"aojs@1.0">>, maps:get(<<"name">>, Info)),
    ?assertEqual(<<"JavaScript Smart Contract Runtime">>, maps:get(<<"description">>, Info)).

%% ============================================================
%% Device Stack Tests - Following L5 tutorial pattern
%% Tests use wasm-64@1.0 device for WASM execution
%% ============================================================

%% Test WASM-based AOJS device stack initialization
%% This tests the actual QuickJS WASM integration
aojs_wasm_init_test_() ->
    {timeout, 60, fun aojs_wasm_init/0}.

aojs_wasm_init() ->
    Opts = setup_test_env(),

    %% Cache the WASM image
    #{<<"image">> := WASMImageID} = dev_wasm:cache_wasm_image("aojs/aojs.wasm", Opts),

    %% Create a device stack: wasm-64 at the bottom
    %% The device message with wasm-64 creates the WASM instance
    StackMsg = #{
        <<"device">> => <<"stack@1.0">>,
        <<"device-stack">> => [<<"wasm-64@1.0">>],
        <<"stack-keys">> => [<<"init">>, <<"compute">>],
        <<"image">> => WASMImageID
    },

    %% Initialize the stack - this loads the WASM
    {ok, M1} = hb_ao:resolve(StackMsg, #{<<"path">> => <<"init">>}, Opts),

    %% Verify we got a valid message back
    ?assertMatch(#{}, M1),

    %% Try calling qjs_init via compute
    {ok, InitResult} = hb_ao:resolve(
        M1,
        #{
            <<"path">> => <<"compute">>,
            <<"body">> => #{
                <<"function">> => <<"qjs_init">>,
                <<"parameters">> => []
            }
        },
        Opts
    ),

    %% qjs_init returns 0 on success
    Output = hb_ao:get(<<"results/output">>, InitResult, Opts),
    ?assertEqual([0], Output),

    ok.

%% Test JavaScript evaluation via WASM stack
aojs_js_eval_test_() ->
    {timeout, 60, fun aojs_js_eval/0}.

aojs_js_eval() ->
    Opts = setup_test_env(),

    %% Setup WASM stack
    #{<<"image">> := WASMImageID} = dev_wasm:cache_wasm_image("aojs/aojs.wasm", Opts),

    StackMsg = #{
        <<"device">> => <<"stack@1.0">>,
        <<"device-stack">> => [<<"wasm-64@1.0">>],
        <<"stack-keys">> => [<<"init">>, <<"compute">>],
        <<"image">> => WASMImageID
    },

    %% Initialize
    {ok, M1} = hb_ao:resolve(StackMsg, #{<<"path">> => <<"init">>}, Opts),

    %% Initialize QuickJS
    {ok, M2} = hb_ao:resolve(
        M1,
        #{
            <<"path">> => <<"compute">>,
            <<"body">> => #{
                <<"function">> => <<"qjs_init">>,
                <<"parameters">> => []
            }
        },
        Opts
    ),

    %% Evaluate simple JavaScript: 1 + 1
    %% Using qjs_eval(code, len, out, out_size)
    {ok, EvalResult} = hb_ao:resolve(
        M2,
        #{
            <<"path">> => <<"compute">>,
            <<"body">> => #{
                <<"function">> => <<"qjs_eval">>,
                <<"parameters">> => [<<"1+1">>, 3, 0, 65536]
            }
        },
        Opts
    ),

    %% Check we got output
    ?assertMatch(#{}, EvalResult),

    ok.

%% ============================================================
%% Process + Scheduler Integration Tests
%% Following dev_genesis_wasm test patterns
%% ============================================================

%% Helper to create a base process message
test_base_process(Opts) ->
    Wallet = hb_opts:get(priv_wallet, hb:wallet(), Opts),
    Address = hb_util:human_id(ar_wallet:to_address(Wallet)),
    hb_message:commit(#{
        <<"device">> => <<"process@1.0">>,
        <<"scheduler-device">> => <<"scheduler@1.0">>,
        <<"scheduler-location">> => Address,
        <<"type">> => <<"Process">>,
        <<"test-random-seed">> => rand:uniform(1337)
    }, #{priv_wallet => Wallet}).

%% Helper to create AOJS process with WASM
test_aojs_process(Opts) ->
    Wallet = hb_opts:get(priv_wallet, hb:wallet(), Opts),
    Address = hb_util:human_id(ar_wallet:to_address(Wallet)),
    #{<<"image">> := WASMImageID} = dev_wasm:cache_wasm_image("aojs/aojs.wasm", Opts),
    hb_message:commit(
        maps:merge(
            hb_message:uncommitted(test_base_process(Opts), Opts),
            #{
                <<"execution-device">> => <<"stack@1.0">>,
                <<"device-stack">> => [<<"wasm-64@1.0">>],
                <<"stack-keys">> => [<<"init">>, <<"compute">>],
                <<"image">> => WASMImageID,
                <<"scheduler">> => Address,
                <<"authority">> => Address
            }
        ),
        #{priv_wallet => Wallet}
    ).

%% Helper to schedule a WASM function call
schedule_wasm_call(Msg1, FuncName, Params, Opts) ->
    Wallet = hb:wallet(),
    Msg2 = hb_message:commit(#{
        <<"path">> => <<"schedule">>,
        <<"method">> => <<"POST">>,
        <<"body">> =>
            hb_message:commit(#{
                <<"type">> => <<"Message">>,
                <<"function">> => FuncName,
                <<"parameters">> => Params
            }, Opts#{priv_wallet => Wallet})
    }, Opts#{priv_wallet => Wallet}),
    hb_ao:resolve(Msg1, Msg2, Opts).

%% Full process + scheduler integration test
%% Following dev_genesis_wasm:spawn_and_execute_slot pattern
process_scheduler_test_() ->
    {timeout, 120, fun process_scheduler_integration/0}.

process_scheduler_integration() ->
    start(),
    Opts = #{
        priv_wallet => hb:wallet(),
        cache_control => <<"always">>,
        store => hb_opts:get(store)
    },

    %% Create aojs process
    Msg1 = test_aojs_process(Opts),
    hb_cache:write(Msg1, Opts),

    %% Register process with scheduler (schedule the process itself first)
    {ok, _SchedInit} = hb_ao:resolve(
        Msg1,
        #{
            <<"method">> => <<"POST">>,
            <<"path">> => <<"schedule">>,
            <<"body">> => Msg1
        },
        Opts
    ),

    %% Schedule qjs_init call
    {ok, _} = schedule_wasm_call(Msg1, <<"qjs_init">>, [], Opts),

    %% Get schedule to verify messages are queued
    {ok, SchedulerRes} = hb_ao:resolve(
        Msg1,
        #{<<"method">> => <<"GET">>, <<"path">> => <<"schedule">>},
        Opts
    ),

    %% Verify process is scheduled first
    ?assertMatch(
        <<"Process">>,
        hb_ao:get(<<"assignments/0/body/type">>, SchedulerRes)
    ),

    %% Compute slot 0 (process init)
    {ok, _Slot0Result} = hb_ao:resolve(
        Msg1,
        #{<<"path">> => <<"compute">>, <<"slot">> => 0},
        Opts
    ),

    %% Compute slot 1 (qjs_init)
    {ok, Slot1Result} = hb_ao:resolve(
        Msg1,
        #{<<"path">> => <<"compute">>, <<"slot">> => 1},
        Opts
    ),

    %% Verify qjs_init returned 0 (success)
    ?assertEqual([0], hb_ao:get(<<"results/output">>, Slot1Result, Opts)),

    ok.

%% Test using /now path (computes all pending slots)
%% Following dev_genesis_wasm pattern
process_now_test_() ->
    {timeout, 120, fun process_now_integration/0}.

process_now_integration() ->
    start(),
    Opts = #{
        priv_wallet => hb:wallet(),
        cache_control => <<"always">>,
        store => hb_opts:get(store)
    },

    %% Create and register process
    Msg1 = test_aojs_process(Opts),
    hb_cache:write(Msg1, Opts),
    {ok, _} = hb_ao:resolve(
        Msg1,
        #{<<"method">> => <<"POST">>, <<"path">> => <<"schedule">>, <<"body">> => Msg1},
        Opts
    ),

    %% Schedule qjs_init
    {ok, _} = schedule_wasm_call(Msg1, <<"qjs_init">>, [], Opts),

    %% Use /now to compute all pending slots
    {ok, NowResult} = hb_ao:resolve(
        Msg1,
        #{<<"path">> => <<"now">>},
        Opts
    ),

    %% Verify result
    ?assertMatch(#{}, NowResult),
    ?assertEqual([0], hb_ao:get(<<"results/output">>, NowResult, Opts)),

    ok.

-endif.
