%%%-------------------------------------------------------------------
%%% @doc Key-Value Store Device
%%%
%%% A personal key-value store with persistent storage.
%%%
%%% API:
%%%   GET  /~kv@1.0/info              Device metadata
%%%   GET  /~kv@1.0/get?key=KEY       Get value
%%%   POST /~kv@1.0/set?key=KEY       Set value (body = value)
%%%   POST /~kv@1.0/delete?key=KEY    Delete key
%%%   GET  /~kv@1.0/keys              List all keys
%%%
%%% @end
%%%-------------------------------------------------------------------
-module(dev_kv).
-export([info/3, get/3, set/3, delete/3, keys/3]).
-include("include/hb.hrl").

-define(STATE_KEY, <<"kv-state-id">>).

%%====================================================================
%% Public API
%%====================================================================

%% @doc Device metadata
info(_M1, _M2, _Opts) ->
    {ok, #{
        <<"name">> => <<"kv">>,
        <<"version">> => <<"1.0">>,
        <<"description">> => <<"Personal Key-Value Store with Persistence">>,
        <<"author">> => <<"HyperBEAM Book">>
    }}.

%% @doc Get value by key
get(M1, M2, Opts) ->
    case maps:get(<<"key">>, M2, not_found) of
        not_found ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Missing 'key' parameter">>}};
        Key ->
            State = load_state(M1, Opts),
            case maps:get(Key, State, not_found) of
                not_found ->
                    {error, #{<<"status">> => 404, <<"error">> => <<"Key not found">>}};
                Value ->
                    {ok, #{<<"key">> => Key, <<"value">> => Value}}
            end
    end.

%% @doc Set key to value
set(M1, M2, Opts) ->
    case maps:get(<<"key">>, M2, not_found) of
        not_found ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Missing 'key' parameter">>}};
        Key ->
            Value = maps:get(<<"value">>, M2, <<>>),
            State = load_state(M1, Opts),
            NewState = maps:put(Key, Value, State),
            M1Updated = save_state(M1, NewState, Opts),
            {ok, maps:merge(M1Updated, #{
                <<"status">> => <<"stored">>,
                <<"key">> => Key
            })}
    end.

%% @doc Delete key
delete(M1, M2, Opts) ->
    case maps:get(<<"key">>, M2, not_found) of
        not_found ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Missing 'key' parameter">>}};
        Key ->
            State = load_state(M1, Opts),
            case maps:is_key(Key, State) of
                false ->
                    {error, #{<<"status">> => 404, <<"error">> => <<"Key not found">>}};
                true ->
                    NewState = maps:remove(Key, State),
                    M1Updated = save_state(M1, NewState, Opts),
                    {ok, maps:merge(M1Updated, #{
                        <<"status">> => <<"deleted">>,
                        <<"key">> => Key
                    })}
            end
    end.

%% @doc List all keys
keys(M1, _M2, Opts) ->
    State = load_state(M1, Opts),
    Keys = maps:keys(State),
    {ok, #{<<"keys">> => Keys, <<"count">> => length(Keys)}}.

%%====================================================================
%% Internal Functions
%%====================================================================

%% @private Load state from cache
load_state(M1, Opts) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{?STATE_KEY := StateID} ->
            case hb_cache:read(StateID, Opts) of
                {ok, State} ->
                    hb_cache:ensure_all_loaded(State, Opts);
                not_found ->
                    #{}
            end;
        _ ->
            #{}
    end.

%% @private Save state to cache
save_state(M1, State, Opts) ->
    {ok, StateID} = hb_cache:write(State, Opts),
    Priv = maps:get(<<"priv">>, M1, #{}),
    M1#{<<"priv">> => Priv#{?STATE_KEY => StateID}}.

%%====================================================================
%% Tests - Using hb_ao:resolve with {as, Module, Msg} pattern
%% Following L1 tutorial pattern from docs/pages/book/build1.mdx
%%====================================================================

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").

setup_test_env() ->
    application:ensure_all_started(hb),
    Store = hb_test_utils:test_store(hb_store_fs),
    #{store => [Store]}.

%% Test device info via hb_ao:resolve
info_test() ->
    application:ensure_all_started(hb),
    %% Use {as, dev_kv, Msg} to resolve without device registration
    {ok, Info} = hb_ao:resolve(
        {as, dev_kv, #{}},
        #{<<"path">> => <<"info">>},
        #{}
    ),
    ?assertEqual(<<"kv">>, maps:get(<<"name">>, Info)),
    ?assertEqual(<<"1.0">>, maps:get(<<"version">>, Info)).

%% Test set and get via hb_ao:resolve
set_get_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Set value using hb_ao:resolve
    {ok, SetRes} = hb_ao:resolve(
        {as, dev_kv, M1},
        #{<<"path">> => <<"set">>, <<"key">> => <<"foo">>, <<"value">> => <<"bar">>},
        Opts
    ),
    ?assertEqual(<<"stored">>, maps:get(<<"status">>, SetRes)),

    %% Get value - use the returned message which has the state
    {ok, GetRes} = hb_ao:resolve(
        {as, dev_kv, SetRes},
        #{<<"path">> => <<"get">>, <<"key">> => <<"foo">>},
        Opts
    ),
    ?assertEqual(<<"bar">>, maps:get(<<"value">>, GetRes)).

%% Test delete via hb_ao:resolve
delete_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Set then delete
    {ok, SetRes} = hb_ao:resolve(
        {as, dev_kv, M1},
        #{<<"path">> => <<"set">>, <<"key">> => <<"temp">>, <<"value">> => <<"data">>},
        Opts
    ),
    {ok, DelRes} = hb_ao:resolve(
        {as, dev_kv, SetRes},
        #{<<"path">> => <<"delete">>, <<"key">> => <<"temp">>},
        Opts
    ),
    ?assertEqual(<<"deleted">>, maps:get(<<"status">>, DelRes)),

    %% Verify gone
    {error, _} = hb_ao:resolve(
        {as, dev_kv, DelRes},
        #{<<"path">> => <<"get">>, <<"key">> => <<"temp">>},
        Opts
    ).

%% Test keys via hb_ao:resolve
keys_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    {ok, M2} = hb_ao:resolve(
        {as, dev_kv, M1},
        #{<<"path">> => <<"set">>, <<"key">> => <<"a">>, <<"value">> => <<"1">>},
        Opts
    ),
    {ok, M3} = hb_ao:resolve(
        {as, dev_kv, M2},
        #{<<"path">> => <<"set">>, <<"key">> => <<"b">>, <<"value">> => <<"2">>},
        Opts
    ),

    {ok, KeysRes} = hb_ao:resolve(
        {as, dev_kv, M3},
        #{<<"path">> => <<"keys">>},
        Opts
    ),
    ?assertEqual(2, maps:get(<<"count">>, KeysRes)).

%% Test error handling via hb_ao:resolve
error_handling_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Missing key parameter
    {error, E1} = hb_ao:resolve(
        {as, dev_kv, M1},
        #{<<"path">> => <<"get">>},
        Opts
    ),
    ?assertEqual(400, maps:get(<<"status">>, E1)),

    %% Key not found
    {error, E2} = hb_ao:resolve(
        {as, dev_kv, M1},
        #{<<"path">> => <<"get">>, <<"key">> => <<"nonexistent">>},
        Opts
    ),
    ?assertEqual(404, maps:get(<<"status">>, E2)).

-endif.
