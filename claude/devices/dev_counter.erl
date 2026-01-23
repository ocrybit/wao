%%%-------------------------------------------------------------------
%%% @doc Counter Device
%%%
%%% A simple counter with increment, decrement, reset, and history tracking.
%%% Vibe-coded to match the Lua counter app pattern.
%%%
%%% API:
%%%   GET  /~counter@1.0/info              Device metadata
%%%   GET  /~counter@1.0/get               Get current count
%%%   POST /~counter@1.0/inc               Increment (optional Amount tag)
%%%   POST /~counter@1.0/dec               Decrement (optional Amount tag)
%%%   POST /~counter@1.0/reset             Reset to zero
%%%   GET  /~counter@1.0/history           Get change history
%%%
%%% @end
%%%-------------------------------------------------------------------
-module(dev_counter).
-export([info/3, get/3, inc/3, dec/3, reset/3, history/3]).
-include("include/hb.hrl").

-define(COUNT_KEY, <<"counter-count">>).
-define(HISTORY_KEY, <<"counter-history-id">>).

%%====================================================================
%% Public API
%%====================================================================

%% @doc Device metadata
info(_M1, _M2, _Opts) ->
    {ok, #{
        <<"name">> => <<"counter">>,
        <<"version">> => <<"1.0">>,
        <<"description">> => <<"Counter with History Tracking">>,
        <<"author">> => <<"Vibe Engineer">>
    }}.

%% @doc Get current count
get(M1, _M2, Opts) ->
    Count = load_count(M1, Opts),
    {ok, #{<<"count">> => Count}}.

%% @doc Increment counter
inc(M1, M2, Opts) ->
    Amount = get_amount(M2, Opts, 1),
    Count = load_count(M1, Opts),
    NewCount = Count + Amount,
    From = maps:get(<<"from">>, M2, <<"unknown">>),

    M1a = save_count(M1, NewCount, Opts),
    M1b = add_history(M1a, #{
        <<"action">> => <<"inc">>,
        <<"amount">> => Amount,
        <<"from">> => From,
        <<"result">> => NewCount,
        <<"timestamp">> => erlang:system_time(second)
    }, Opts),

    {ok, maps:merge(M1b, #{
        <<"count">> => NewCount,
        <<"change">> => Amount
    })}.

%% @doc Decrement counter
dec(M1, M2, Opts) ->
    Amount = get_amount(M2, Opts, 1),
    Count = load_count(M1, Opts),
    NewCount = Count - Amount,
    From = maps:get(<<"from">>, M2, <<"unknown">>),

    M1a = save_count(M1, NewCount, Opts),
    M1b = add_history(M1a, #{
        <<"action">> => <<"dec">>,
        <<"amount">> => Amount,
        <<"from">> => From,
        <<"result">> => NewCount,
        <<"timestamp">> => erlang:system_time(second)
    }, Opts),

    {ok, maps:merge(M1b, #{
        <<"count">> => NewCount,
        <<"change">> => -Amount
    })}.

%% @doc Reset counter to zero
reset(M1, M2, Opts) ->
    OldCount = load_count(M1, Opts),
    From = maps:get(<<"from">>, M2, <<"unknown">>),

    M1a = save_count(M1, 0, Opts),
    M1b = add_history(M1a, #{
        <<"action">> => <<"reset">>,
        <<"from">> => From,
        <<"previous">> => OldCount,
        <<"result">> => 0,
        <<"timestamp">> => erlang:system_time(second)
    }, Opts),

    {ok, maps:merge(M1b, #{
        <<"count">> => 0,
        <<"previous">> => OldCount
    })}.

%% @doc Get change history
history(M1, M2, Opts) ->
    Limit = maps:get(<<"limit">>, M2, 10),
    History = load_history(M1, Opts),
    Limited = lists:sublist(History, Limit),
    {ok, #{
        <<"history">> => Limited,
        <<"total">> => length(History),
        <<"returned">> => length(Limited)
    }}.

%%====================================================================
%% Internal Functions
%%====================================================================

get_amount(M2, _Opts, Default) ->
    case maps:get(<<"amount">>, M2, not_found) of
        not_found ->
            case maps:get(<<"Amount">>, M2, not_found) of
                not_found -> Default;
                V when is_binary(V) -> binary_to_integer(V);
                V when is_integer(V) -> V
            end;
        V when is_binary(V) -> binary_to_integer(V);
        V when is_integer(V) -> V
    end.

load_count(M1, _Opts) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{?COUNT_KEY := Count} -> Count;
        _ -> 0
    end.

save_count(M1, Count, _Opts) ->
    Priv = maps:get(<<"priv">>, M1, #{}),
    M1#{<<"priv">> => Priv#{?COUNT_KEY => Count}}.

load_history(M1, Opts) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{?HISTORY_KEY := ID} ->
            case hb_cache:read(ID, Opts) of
                {ok, History} -> History;
                not_found -> []
            end;
        _ -> []
    end.

add_history(M1, Entry, Opts) ->
    History = load_history(M1, Opts),
    NewHistory = [Entry | History],
    {ok, ID} = hb_cache:write(NewHistory, Opts),
    Priv = maps:get(<<"priv">>, M1, #{}),
    M1#{<<"priv">> => Priv#{?HISTORY_KEY => ID}}.

%%====================================================================
%% Tests - Direct function calls and hb_ao:resolve
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
    ?assertEqual(<<"counter">>, maps:get(<<"name">>, Info)),
    ?assertEqual(<<"1.0">>, maps:get(<<"version">>, Info)).

%% Test initial count is 0 - direct call
initial_count_test() ->
    Opts = setup_test_env(),
    {ok, Result} = get(#{}, #{}, Opts),
    ?assertEqual(0, maps:get(<<"count">>, Result)).

%% Test increment - direct call
inc_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Increment once
    {ok, R1} = inc(M1, #{}, Opts),
    ?assertEqual(1, maps:get(<<"count">>, R1)),

    %% Increment again with amount
    {ok, R2} = inc(R1, #{<<"amount">> => 5}, Opts),
    ?assertEqual(6, maps:get(<<"count">>, R2)).

%% Test decrement - direct call
dec_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Start at 10
    {ok, R1} = inc(M1, #{<<"amount">> => 10}, Opts),
    ?assertEqual(10, maps:get(<<"count">>, R1)),

    %% Decrement by 3
    {ok, R2} = dec(R1, #{<<"amount">> => 3}, Opts),
    ?assertEqual(7, maps:get(<<"count">>, R2)).

%% Test reset - direct call
reset_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Set to 100
    {ok, R1} = inc(M1, #{<<"amount">> => 100}, Opts),
    ?assertEqual(100, maps:get(<<"count">>, R1)),

    %% Reset
    {ok, R2} = reset(R1, #{}, Opts),
    ?assertEqual(0, maps:get(<<"count">>, R2)),
    ?assertEqual(100, maps:get(<<"previous">>, R2)).

%% Test history tracking - direct call
history_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    {ok, R1} = inc(M1, #{<<"from">> => <<"alice">>}, Opts),
    {ok, R2} = inc(R1, #{<<"from">> => <<"bob">>}, Opts),
    {ok, R3} = dec(R2, #{<<"from">> => <<"alice">>}, Opts),

    {ok, HistRes} = history(R3, #{}, Opts),
    ?assertEqual(3, maps:get(<<"total">>, HistRes)),

    %% History is in reverse order (newest first)
    [H1, H2, H3] = maps:get(<<"history">>, HistRes),
    ?assertEqual(<<"dec">>, maps:get(<<"action">>, H1)),
    ?assertEqual(<<"inc">>, maps:get(<<"action">>, H2)),
    ?assertEqual(<<"inc">>, maps:get(<<"action">>, H3)).

%% Test using hb_ao:resolve pattern
resolve_test() ->
    application:ensure_all_started(hb),
    Opts = setup_test_env(),

    %% Get info via resolve
    {ok, Info} = hb_ao:resolve(
        {as, dev_counter, #{}},
        #{<<"path">> => <<"info">>},
        Opts
    ),
    ?assertEqual(<<"counter">>, maps:get(<<"name">>, Info)),

    %% Increment via resolve
    {ok, IncRes} = hb_ao:resolve(
        {as, dev_counter, #{}},
        #{<<"path">> => <<"inc">>, <<"amount">> => 5},
        Opts
    ),
    ?assertEqual(5, maps:get(<<"count">>, IncRes)).

-endif.
