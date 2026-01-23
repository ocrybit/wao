%%%-------------------------------------------------------------------
%%% @doc Rate Limiter Device
%%%
%%% Token bucket rate limiting for API protection.
%%% Vibe-coded for HyperBEAM infrastructure.
%%%
%%% API:
%%%   GET  /~ratelimiter@1.0/info           Device metadata
%%%   POST /~ratelimiter@1.0/check          Check if request allowed
%%%   POST /~ratelimiter@1.0/consume        Consume tokens (if allowed)
%%%   GET  /~ratelimiter@1.0/status         Get bucket status for key
%%%   POST /~ratelimiter@1.0/configure      Configure rate limits
%%%   POST /~ratelimiter@1.0/reset          Reset bucket for key
%%%
%%% @end
%%%-------------------------------------------------------------------
-module(dev_ratelimiter).
-export([info/3, check/3, consume/3, status/3, configure/3, reset/3]).
-include("include/hb.hrl").

-define(CONFIG_KEY, <<"ratelimiter-config">>).
-define(BUCKETS_KEY, <<"ratelimiter-buckets-id">>).

%% Default configuration
-define(DEFAULT_CAPACITY, 100).      % Max tokens in bucket
-define(DEFAULT_REFILL_RATE, 10).    % Tokens added per second
-define(DEFAULT_COST, 1).            % Tokens per request

%%====================================================================
%% Public API
%%====================================================================

info(_M1, _M2, _Opts) ->
    {ok, #{
        <<"name">> => <<"ratelimiter">>,
        <<"version">> => <<"1.0">>,
        <<"description">> => <<"Token Bucket Rate Limiter">>,
        <<"author">> => <<"Vibe Engineer">>,
        <<"algorithm">> => <<"token_bucket">>
    }}.

%% @doc Check if request would be allowed (without consuming)
check(M1, M2, Opts) ->
    Key = get_key(M2),
    Cost = get_cost(M2),
    Config = load_config(M1, Opts),

    Bucket = get_bucket(M1, Key, Config, Opts),
    RefreshedBucket = refresh_tokens(Bucket, Config),

    Allowed = RefreshedBucket >= Cost,

    {ok, #{
        <<"allowed">> => Allowed,
        <<"key">> => Key,
        <<"tokens">> => RefreshedBucket,
        <<"cost">> => Cost,
        <<"capacity">> => maps:get(capacity, Config, ?DEFAULT_CAPACITY)
    }}.

%% @doc Consume tokens if allowed
consume(M1, M2, Opts) ->
    Key = get_key(M2),
    Cost = get_cost(M2),
    Config = load_config(M1, Opts),

    Bucket = get_bucket(M1, Key, Config, Opts),
    RefreshedBucket = refresh_tokens(Bucket, Config),

    case RefreshedBucket >= Cost of
        true ->
            NewBucket = RefreshedBucket - Cost,
            M1Updated = save_bucket(M1, Key, NewBucket, Opts),
            {ok, maps:merge(M1Updated, #{
                <<"allowed">> => true,
                <<"key">> => Key,
                <<"consumed">> => Cost,
                <<"remaining">> => NewBucket
            })};
        false ->
            {ok, #{
                <<"allowed">> => false,
                <<"key">> => Key,
                <<"tokens">> => RefreshedBucket,
                <<"required">> => Cost,
                <<"retry_after">> => calculate_retry_after(RefreshedBucket, Cost, Config)
            }}
    end.

%% @doc Get bucket status for a key
status(M1, M2, Opts) ->
    Key = get_key(M2),
    Config = load_config(M1, Opts),

    Bucket = get_bucket(M1, Key, Config, Opts),
    RefreshedBucket = refresh_tokens(Bucket, Config),
    Capacity = maps:get(capacity, Config, ?DEFAULT_CAPACITY),

    {ok, #{
        <<"key">> => Key,
        <<"tokens">> => RefreshedBucket,
        <<"capacity">> => Capacity,
        <<"percentage">> => (RefreshedBucket / Capacity) * 100,
        <<"refill_rate">> => maps:get(refill_rate, Config, ?DEFAULT_REFILL_RATE)
    }}.

%% @doc Configure rate limits
configure(M1, M2, Opts) ->
    Capacity = maps:get(<<"capacity">>, M2, ?DEFAULT_CAPACITY),
    RefillRate = maps:get(<<"refill_rate">>, M2, ?DEFAULT_REFILL_RATE),
    DefaultCost = maps:get(<<"default_cost">>, M2, ?DEFAULT_COST),

    NewConfig = #{
        capacity => Capacity,
        refill_rate => RefillRate,
        default_cost => DefaultCost,
        updated_at => erlang:system_time(second)
    },

    M1Updated = save_config(M1, NewConfig, Opts),

    {ok, maps:merge(M1Updated, #{
        <<"status">> => <<"configured">>,
        <<"config">> => #{
            <<"capacity">> => Capacity,
            <<"refill_rate">> => RefillRate,
            <<"default_cost">> => DefaultCost
        }
    })}.

%% @doc Reset bucket for a key
reset(M1, M2, Opts) ->
    Key = get_key(M2),
    Config = load_config(M1, Opts),
    Capacity = maps:get(capacity, Config, ?DEFAULT_CAPACITY),

    M1Updated = save_bucket(M1, Key, Capacity, Opts),

    {ok, maps:merge(M1Updated, #{
        <<"status">> => <<"reset">>,
        <<"key">> => Key,
        <<"tokens">> => Capacity
    })}.

%%====================================================================
%% Internal Functions
%%====================================================================

get_key(M2) ->
    case maps:get(<<"key">>, M2, not_found) of
        not_found ->
            maps:get(<<"from">>, M2, <<"default">>);
        K -> K
    end.

get_cost(M2) ->
    maps:get(<<"cost">>, M2, ?DEFAULT_COST).

load_config(M1, _Opts) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{?CONFIG_KEY := Config} -> Config;
        _ -> #{
            capacity => ?DEFAULT_CAPACITY,
            refill_rate => ?DEFAULT_REFILL_RATE,
            default_cost => ?DEFAULT_COST
        }
    end.

save_config(M1, Config, _Opts) ->
    Priv = maps:get(<<"priv">>, M1, #{}),
    M1#{<<"priv">> => Priv#{?CONFIG_KEY => Config}}.

get_bucket(M1, Key, Config, Opts) ->
    Buckets = load_buckets(M1, Opts),
    case maps:get(Key, Buckets, not_found) of
        not_found ->
            %% Initialize with full capacity
            maps:get(capacity, Config, ?DEFAULT_CAPACITY);
        #{tokens := Tokens, last_update := _} ->
            Tokens
    end.

save_bucket(M1, Key, Tokens, Opts) ->
    Buckets = load_buckets(M1, Opts),
    NewBuckets = maps:put(Key, #{
        tokens => Tokens,
        last_update => erlang:system_time(second)
    }, Buckets),
    save_buckets(M1, NewBuckets, Opts).

load_buckets(M1, Opts) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{?BUCKETS_KEY := ID} ->
            case hb_cache:read(ID, Opts) of
                {ok, Buckets} -> Buckets;
                not_found -> #{}
            end;
        _ -> #{}
    end.

save_buckets(M1, Buckets, Opts) ->
    {ok, ID} = hb_cache:write(Buckets, Opts),
    Priv = maps:get(<<"priv">>, M1, #{}),
    M1#{<<"priv">> => Priv#{?BUCKETS_KEY => ID}}.

refresh_tokens(Bucket, Config) when is_map(Bucket) ->
    #{tokens := Tokens, last_update := LastUpdate} = Bucket,
    Now = erlang:system_time(second),
    Elapsed = Now - LastUpdate,
    RefillRate = maps:get(refill_rate, Config, ?DEFAULT_REFILL_RATE),
    Capacity = maps:get(capacity, Config, ?DEFAULT_CAPACITY),

    NewTokens = Tokens + (Elapsed * RefillRate),
    min(NewTokens, Capacity);
refresh_tokens(Tokens, Config) when is_number(Tokens) ->
    %% Already a number (newly initialized bucket)
    Capacity = maps:get(capacity, Config, ?DEFAULT_CAPACITY),
    min(Tokens, Capacity).

calculate_retry_after(CurrentTokens, RequiredTokens, Config) ->
    Deficit = RequiredTokens - CurrentTokens,
    RefillRate = maps:get(refill_rate, Config, ?DEFAULT_REFILL_RATE),
    case RefillRate > 0 of
        true -> ceiling(Deficit / RefillRate);
        false -> 0
    end.

ceiling(X) when X >= 0 ->
    T = trunc(X),
    case X - T == 0 of
        true -> T;
        false -> T + 1
    end.

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
    ?assertEqual(<<"ratelimiter">>, maps:get(<<"name">>, Info)),
    ?assertEqual(<<"token_bucket">>, maps:get(<<"algorithm">>, Info)).

%% Test initial check (should be allowed with full bucket)
check_allowed_test() ->
    Opts = setup_test_env(),
    {ok, Result} = check(#{}, #{<<"key">> => <<"test">>}, Opts),
    ?assertEqual(true, maps:get(<<"allowed">>, Result)),
    ?assertEqual(100, maps:get(<<"tokens">>, Result)).

%% Test consume tokens
consume_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Consume 10 tokens
    {ok, R1} = consume(M1, #{<<"key">> => <<"user1">>, <<"cost">> => 10}, Opts),
    ?assertEqual(true, maps:get(<<"allowed">>, R1)),
    ?assertEqual(90, maps:get(<<"remaining">>, R1)).

%% Test rate limiting
rate_limit_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Configure small bucket
    {ok, M2} = configure(M1, #{
        <<"capacity">> => 5,
        <<"refill_rate">> => 1
    }, Opts),

    %% Consume all tokens
    {ok, R1} = consume(M2, #{<<"key">> => <<"limited">>, <<"cost">> => 5}, Opts),
    ?assertEqual(true, maps:get(<<"allowed">>, R1)),
    ?assertEqual(0, maps:get(<<"remaining">>, R1)),

    %% Next request should be denied
    {ok, R2} = consume(R1, #{<<"key">> => <<"limited">>, <<"cost">> => 1}, Opts),
    ?assertEqual(false, maps:get(<<"allowed">>, R2)),
    ?assert(maps:get(<<"retry_after">>, R2) > 0).

%% Test reset
reset_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Consume some tokens
    {ok, R1} = consume(M1, #{<<"key">> => <<"user">>, <<"cost">> => 50}, Opts),
    ?assertEqual(50, maps:get(<<"remaining">>, R1)),

    %% Reset
    {ok, R2} = reset(R1, #{<<"key">> => <<"user">>}, Opts),
    ?assertEqual(100, maps:get(<<"tokens">>, R2)).

%% Test status
status_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    {ok, R1} = consume(M1, #{<<"key">> => <<"user">>, <<"cost">> => 30}, Opts),

    {ok, Status} = status(R1, #{<<"key">> => <<"user">>}, Opts),
    ?assertEqual(70, maps:get(<<"tokens">>, Status)),
    ?assertEqual(100, maps:get(<<"capacity">>, Status)),
    ?assertEqual(70.0, maps:get(<<"percentage">>, Status)).

%% Test using hb_ao:resolve
resolve_test() ->
    application:ensure_all_started(hb),
    Opts = setup_test_env(),

    {ok, Info} = hb_ao:resolve(
        {as, dev_ratelimiter, #{}},
        #{<<"path">> => <<"info">>},
        Opts
    ),
    ?assertEqual(<<"ratelimiter">>, maps:get(<<"name">>, Info)).

-endif.
