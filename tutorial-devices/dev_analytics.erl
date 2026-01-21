%%%-------------------------------------------------------------------
%%% @doc Analytics Device
%%%
%%% Track events, metrics, and usage statistics.
%%% Vibe-coded for HyperBEAM observability.
%%%
%%% API:
%%%   GET  /~analytics@1.0/info             Device metadata
%%%   POST /~analytics@1.0/track            Track an event
%%%   POST /~analytics@1.0/metric           Record a metric value
%%%   GET  /~analytics@1.0/events           Get events (filtered)
%%%   GET  /~analytics@1.0/metrics          Get metrics summary
%%%   GET  /~analytics@1.0/stats            Get overall statistics
%%%   POST /~analytics@1.0/clear            Clear all data
%%%
%%% @end
%%%-------------------------------------------------------------------
-module(dev_analytics).
-export([info/3, track/3, metric/3, events/3, metrics/3, stats/3, clear/3]).
-include("include/hb.hrl").

-define(EVENTS_KEY, <<"analytics-events-id">>).
-define(METRICS_KEY, <<"analytics-metrics-id">>).
-define(STATS_KEY, <<"analytics-stats">>).

%%====================================================================
%% Public API
%%====================================================================

info(_M1, _M2, _Opts) ->
    {ok, #{
        <<"name">> => <<"analytics">>,
        <<"version">> => <<"1.0">>,
        <<"description">> => <<"Event and Metrics Tracking">>,
        <<"author">> => <<"Vibe Engineer">>
    }}.

%% @doc Track an event
track(M1, M2, Opts) ->
    EventType = maps:get(<<"event">>, M2, <<"unknown">>),
    Data = maps:get(<<"data">>, M2, #{}),
    Tags = maps:get(<<"tags">>, M2, []),
    From = maps:get(<<"from">>, M2, <<"anonymous">>),

    Event = #{
        <<"id">> => generate_id(),
        <<"type">> => EventType,
        <<"data">> => Data,
        <<"tags">> => Tags,
        <<"from">> => From,
        <<"timestamp">> => erlang:system_time(second)
    },

    Events = load_events(M1, Opts),
    M1a = save_events(M1, [Event | Events], Opts),
    M1b = increment_stat(M1a, <<"total_events">>, 1, Opts),
    M1c = increment_stat(M1b, <<"event_", EventType/binary>>, 1, Opts),

    {ok, maps:merge(M1c, #{
        <<"status">> => <<"tracked">>,
        <<"event_id">> => maps:get(<<"id">>, Event)
    })}.

%% @doc Record a metric value
metric(M1, M2, Opts) ->
    Name = maps:get(<<"name">>, M2, <<"default">>),
    Value = maps:get(<<"value">>, M2, 0),
    Tags = maps:get(<<"tags">>, M2, []),

    Metrics = load_metrics(M1, Opts),
    ExistingMetric = maps:get(Name, Metrics, new_metric(Name)),

    UpdatedMetric = update_metric(ExistingMetric, Value),
    NewMetrics = maps:put(Name, UpdatedMetric, Metrics),

    M1a = save_metrics(M1, NewMetrics, Opts),
    M1b = increment_stat(M1a, <<"total_metric_points">>, 1, Opts),

    {ok, maps:merge(M1b, #{
        <<"status">> => <<"recorded">>,
        <<"name">> => Name,
        <<"value">> => Value,
        <<"summary">> => metric_summary(UpdatedMetric)
    })}.

%% @doc Get events with optional filtering
events(M1, M2, Opts) ->
    EventType = maps:get(<<"type">>, M2, all),
    From = maps:get(<<"from">>, M2, all),
    Limit = maps:get(<<"limit">>, M2, 100),
    Since = maps:get(<<"since">>, M2, 0),

    Events = load_events(M1, Opts),

    %% Filter events
    Filtered = lists:filter(fun(E) ->
        TypeMatch = (EventType =:= all) orelse
                    (maps:get(<<"type">>, E) =:= EventType),
        FromMatch = (From =:= all) orelse
                    (maps:get(<<"from">>, E) =:= From),
        TimeMatch = maps:get(<<"timestamp">>, E) >= Since,
        TypeMatch andalso FromMatch andalso TimeMatch
    end, Events),

    Limited = lists:sublist(Filtered, Limit),

    {ok, #{
        <<"events">> => Limited,
        <<"total">> => length(Filtered),
        <<"returned">> => length(Limited)
    }}.

%% @doc Get metrics summary
metrics(M1, M2, Opts) ->
    Name = maps:get(<<"name">>, M2, all),

    Metrics = load_metrics(M1, Opts),

    Result = case Name of
        all ->
            maps:map(fun(_K, V) -> metric_summary(V) end, Metrics);
        N ->
            case maps:get(N, Metrics, not_found) of
                not_found -> #{<<"error">> => <<"Metric not found">>};
                M -> #{N => metric_summary(M)}
            end
    end,

    {ok, #{
        <<"metrics">> => Result,
        <<"count">> => maps:size(Metrics)
    }}.

%% @doc Get overall statistics
stats(M1, _M2, Opts) ->
    Stats = load_stats(M1, Opts),
    Events = load_events(M1, Opts),
    Metrics = load_metrics(M1, Opts),

    {ok, #{
        <<"stats">> => Stats,
        <<"event_count">> => length(Events),
        <<"metric_count">> => maps:size(Metrics),
        <<"event_types">> => count_event_types(Events),
        <<"oldest_event">> => oldest_timestamp(Events),
        <<"newest_event">> => newest_timestamp(Events)
    }}.

%% @doc Clear all analytics data
clear(M1, _M2, Opts) ->
    M1a = save_events(M1, [], Opts),
    M1b = save_metrics(M1a, #{}, Opts),
    Priv = maps:get(<<"priv">>, M1b, #{}),
    M1c = M1b#{<<"priv">> => maps:remove(?STATS_KEY, Priv)},

    {ok, maps:merge(M1c, #{
        <<"status">> => <<"cleared">>
    })}.

%%====================================================================
%% Internal Functions
%%====================================================================

generate_id() ->
    Bytes = crypto:strong_rand_bytes(16),
    hb_util:encode(Bytes).

new_metric(Name) ->
    #{
        name => Name,
        count => 0,
        sum => 0,
        min => undefined,
        max => undefined,
        values => []
    }.

update_metric(M, Value) ->
    Count = maps:get(count, M) + 1,
    Sum = maps:get(sum, M) + Value,
    Min = case maps:get(min, M) of
        undefined -> Value;
        V when Value < V -> Value;
        V -> V
    end,
    Max = case maps:get(max, M) of
        undefined -> Value;
        V when Value > V -> Value;
        V -> V
    end,
    %% Keep last 100 values for percentile calculations
    Values = lists:sublist([Value | maps:get(values, M)], 100),

    M#{
        count => Count,
        sum => Sum,
        min => Min,
        max => Max,
        values => Values
    }.

metric_summary(M) ->
    Count = maps:get(count, M),
    Sum = maps:get(sum, M),
    Avg = case Count of
        0 -> 0;
        _ -> Sum / Count
    end,
    #{
        <<"count">> => Count,
        <<"sum">> => Sum,
        <<"avg">> => Avg,
        <<"min">> => maps:get(min, M),
        <<"max">> => maps:get(max, M)
    }.

load_events(M1, Opts) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{?EVENTS_KEY := ID} ->
            case hb_cache:read(ID, Opts) of
                {ok, Events} -> Events;
                not_found -> []
            end;
        _ -> []
    end.

save_events(M1, Events, Opts) ->
    {ok, ID} = hb_cache:write(Events, Opts),
    Priv = maps:get(<<"priv">>, M1, #{}),
    M1#{<<"priv">> => Priv#{?EVENTS_KEY => ID}}.

load_metrics(M1, Opts) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{?METRICS_KEY := ID} ->
            case hb_cache:read(ID, Opts) of
                {ok, Metrics} -> Metrics;
                not_found -> #{}
            end;
        _ -> #{}
    end.

save_metrics(M1, Metrics, Opts) ->
    {ok, ID} = hb_cache:write(Metrics, Opts),
    Priv = maps:get(<<"priv">>, M1, #{}),
    M1#{<<"priv">> => Priv#{?METRICS_KEY => ID}}.

load_stats(M1, _Opts) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{?STATS_KEY := Stats} -> Stats;
        _ -> #{}
    end.

increment_stat(M1, Key, Amount, _Opts) ->
    Priv = maps:get(<<"priv">>, M1, #{}),
    Stats = maps:get(?STATS_KEY, Priv, #{}),
    Current = maps:get(Key, Stats, 0),
    NewStats = maps:put(Key, Current + Amount, Stats),
    M1#{<<"priv">> => Priv#{?STATS_KEY => NewStats}}.

count_event_types(Events) ->
    lists:foldl(fun(E, Acc) ->
        Type = maps:get(<<"type">>, E),
        maps:update_with(Type, fun(V) -> V + 1 end, 1, Acc)
    end, #{}, Events).

oldest_timestamp([]) -> null;
oldest_timestamp(Events) ->
    lists:min([maps:get(<<"timestamp">>, E) || E <- Events]).

newest_timestamp([]) -> null;
newest_timestamp(Events) ->
    lists:max([maps:get(<<"timestamp">>, E) || E <- Events]).

%%====================================================================
%% Tests
%%====================================================================

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").

setup_test_env() ->
    application:ensure_all_started(hb),
    Store = hb_test_utils:test_store(hb_store_fs),
    #{store => [Store]}.

%% Test device info
info_test() ->
    {ok, Info} = info(#{}, #{}, #{}),
    ?assertEqual(<<"analytics">>, maps:get(<<"name">>, Info)).

%% Test track event
track_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    {ok, R1} = track(M1, #{
        <<"event">> => <<"page_view">>,
        <<"data">> => #{<<"page">> => <<"/home">>},
        <<"from">> => <<"user1">>
    }, Opts),

    ?assertEqual(<<"tracked">>, maps:get(<<"status">>, R1)),
    ?assert(maps:is_key(<<"event_id">>, R1)).

%% Test record metric
metric_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Record some values
    {ok, R1} = metric(M1, #{<<"name">> => <<"response_time">>, <<"value">> => 100}, Opts),
    {ok, R2} = metric(R1, #{<<"name">> => <<"response_time">>, <<"value">> => 200}, Opts),
    {ok, R3} = metric(R2, #{<<"name">> => <<"response_time">>, <<"value">> => 150}, Opts),

    Summary = maps:get(<<"summary">>, R3),
    ?assertEqual(3, maps:get(<<"count">>, Summary)),
    ?assertEqual(450, maps:get(<<"sum">>, Summary)),
    ?assertEqual(150.0, maps:get(<<"avg">>, Summary)),
    ?assertEqual(100, maps:get(<<"min">>, Summary)),
    ?assertEqual(200, maps:get(<<"max">>, Summary)).

%% Test get events
events_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    {ok, R1} = track(M1, #{<<"event">> => <<"click">>, <<"from">> => <<"alice">>}, Opts),
    {ok, R2} = track(R1, #{<<"event">> => <<"click">>, <<"from">> => <<"bob">>}, Opts),
    {ok, R3} = track(R2, #{<<"event">> => <<"view">>, <<"from">> => <<"alice">>}, Opts),

    %% Get all events
    {ok, AllRes} = events(R3, #{}, Opts),
    ?assertEqual(3, maps:get(<<"total">>, AllRes)),

    %% Filter by type
    {ok, ClickRes} = events(R3, #{<<"type">> => <<"click">>}, Opts),
    ?assertEqual(2, maps:get(<<"total">>, ClickRes)),

    %% Filter by from
    {ok, AliceRes} = events(R3, #{<<"from">> => <<"alice">>}, Opts),
    ?assertEqual(2, maps:get(<<"total">>, AliceRes)).

%% Test stats
stats_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    {ok, R1} = track(M1, #{<<"event">> => <<"a">>}, Opts),
    {ok, R2} = track(R1, #{<<"event">> => <<"b">>}, Opts),
    {ok, R3} = metric(R2, #{<<"name">> => <<"x">>, <<"value">> => 1}, Opts),

    {ok, StatsRes} = stats(R3, #{}, Opts),
    ?assertEqual(2, maps:get(<<"event_count">>, StatsRes)),
    ?assertEqual(1, maps:get(<<"metric_count">>, StatsRes)).

%% Test clear
clear_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    {ok, R1} = track(M1, #{<<"event">> => <<"test">>}, Opts),
    {ok, R2} = clear(R1, #{}, Opts),

    {ok, EventsRes} = events(R2, #{}, Opts),
    ?assertEqual(0, maps:get(<<"total">>, EventsRes)).

%% Test using hb_ao:resolve
resolve_test() ->
    application:ensure_all_started(hb),
    Opts = setup_test_env(),

    {ok, Info} = hb_ao:resolve(
        {as, dev_analytics, #{}},
        #{<<"path">> => <<"info">>},
        Opts
    ),
    ?assertEqual(<<"analytics">>, maps:get(<<"name">>, Info)),

    {ok, TrackRes} = hb_ao:resolve(
        {as, dev_analytics, #{}},
        #{<<"path">> => <<"track">>, <<"event">> => <<"test_event">>},
        Opts
    ),
    ?assertEqual(<<"tracked">>, maps:get(<<"status">>, TrackRes)).

-endif.
