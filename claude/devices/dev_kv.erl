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
    case hb_maps:get(<<"key">>, M2, not_found, Opts) of
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
    case hb_maps:get(<<"key">>, M2, not_found, Opts) of
        not_found ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Missing 'key' parameter">>}};
        Key ->
            Value = hb_maps:get(<<"value">>, M2, <<>>, Opts),
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
    case hb_maps:get(<<"key">>, M2, not_found, Opts) of
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
    case hb_private:get(?STATE_KEY, M1, not_found, Opts) of
        not_found ->
            #{};
        StateID ->
            case hb_cache:read(StateID, Opts) of
                {ok, State} ->
                    hb_cache:ensure_all_loaded(State, Opts);
                not_found ->
                    #{}
            end
    end.

%% @private Save state to cache
save_state(M1, State, Opts) ->
    {ok, StateID} = hb_cache:write(State, Opts),
    hb_private:set(M1, #{?STATE_KEY => StateID}, Opts).

%%====================================================================
%% Tests - Direct function calls to test device logic
%%====================================================================

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").

setup_test_env() ->
    application:ensure_all_started(hb),
    Store = hb_test_utils:test_store(hb_store_fs),
    #{store => [Store]}.

%% Test device info - direct call
info_test() ->
    {ok, Info} = info(#{}, #{}, #{}),
    ?assertEqual(<<"kv">>, maps:get(<<"name">>, Info)),
    ?assertEqual(<<"1.0">>, maps:get(<<"version">>, Info)).

%% Test set and get - direct function calls
set_get_test() ->
    Opts = setup_test_env(),
    M1 = #{},
    M2_set = #{<<"key">> => <<"foo">>, <<"value">> => <<"bar">>},

    %% Set value
    {ok, SetRes} = set(M1, M2_set, Opts),
    ?assertEqual(<<"stored">>, maps:get(<<"status">>, SetRes)),

    %% Get value - use the returned message which has the state
    M2_get = #{<<"key">> => <<"foo">>},
    {ok, GetRes} = get(SetRes, M2_get, Opts),
    ?assertEqual(<<"bar">>, maps:get(<<"value">>, GetRes)).

%% Test delete - direct function calls
delete_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Set then delete
    {ok, SetRes} = set(M1, #{<<"key">> => <<"temp">>, <<"value">> => <<"data">>}, Opts),
    {ok, DelRes} = delete(SetRes, #{<<"key">> => <<"temp">>}, Opts),
    ?assertEqual(<<"deleted">>, maps:get(<<"status">>, DelRes)),

    %% Verify gone
    {error, _} = get(DelRes, #{<<"key">> => <<"temp">>}, Opts).

%% Test keys - direct function calls
keys_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    {ok, M2} = set(M1, #{<<"key">> => <<"a">>, <<"value">> => <<"1">>}, Opts),
    {ok, M3} = set(M2, #{<<"key">> => <<"b">>, <<"value">> => <<"2">>}, Opts),

    {ok, KeysRes} = keys(M3, #{}, Opts),
    ?assertEqual(2, maps:get(<<"count">>, KeysRes)).

%% Test error handling - direct function calls
error_handling_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Missing key parameter
    {error, E1} = get(M1, #{}, Opts),
    ?assertEqual(400, maps:get(<<"status">>, E1)),

    %% Key not found
    {error, E2} = get(M1, #{<<"key">> => <<"nonexistent">>}, Opts),
    ?assertEqual(404, maps:get(<<"status">>, E2)).

-endif.
