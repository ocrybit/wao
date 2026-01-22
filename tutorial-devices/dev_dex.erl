%%%-------------------------------------------------------------------
%%% @doc AMM DEX Device
%%%
%%% A Uniswap-style decentralized exchange with liquidity pools.
%%% Implements constant product formula (x*y=k) with swap fees.
%%%
%%% API:
%%%   GET  /~dex@1.0/info                    Device metadata
%%%   POST /~dex@1.0/mint                    Mint test tokens
%%%   GET  /~dex@1.0/balances                Get user balances
%%%   POST /~dex@1.0/create_pool             Create trading pair
%%%   POST /~dex@1.0/add_liquidity           Add liquidity to pool
%%%   POST /~dex@1.0/remove_liquidity        Remove liquidity from pool
%%%   POST /~dex@1.0/swap                    Swap tokens
%%%   GET  /~dex@1.0/quote                   Get swap quote
%%%   GET  /~dex@1.0/pool                    Get pool info
%%%   GET  /~dex@1.0/pools                   List all pools
%%%   GET  /~dex@1.0/my_liquidity            Get user's liquidity positions
%%%
%%% @end
%%%-------------------------------------------------------------------
-module(dev_dex).
-export([info/3, mint/3, balances/3, create_pool/3, add_liquidity/3,
         remove_liquidity/3, swap/3, quote/3, pool/3, pools/3, my_liquidity/3]).
-include("include/hb.hrl").

%% State keys
-define(POOLS_KEY, <<"dex-pools-id">>).
-define(BALANCES_KEY, <<"dex-balances-id">>).
-define(LIQUIDITY_KEY, <<"dex-liquidity-id">>).

%% Configuration
-define(SWAP_FEE, 30).           %% 0.3% (in basis points)
-define(MIN_LIQUIDITY, 1000).    %% Minimum initial liquidity

%%====================================================================
%% Public API
%%====================================================================

%% @doc Device metadata
info(_M1, _M2, _Opts) ->
    {ok, #{
        <<"name">> => <<"dex">>,
        <<"version">> => <<"1.0">>,
        <<"description">> => <<"AMM DEX with Constant Product Formula">>,
        <<"author">> => <<"WAO Vibe Engineer">>,
        <<"swap_fee">> => ?SWAP_FEE,
        <<"min_liquidity">> => ?MIN_LIQUIDITY
    }}.

%% @doc Mint test tokens
mint(M1, M2, Opts) ->
    From = get_from(M2),
    Token = get_param(M2, <<"token">>, <<"TOKEN-A">>),
    Amount = get_int_param(M2, <<"amount">>, 1000000),

    Balances = load_balances(M1, Opts),
    UserBal = maps:get(From, Balances, #{}),
    CurrentBal = maps:get(Token, UserBal, 0),
    NewBal = CurrentBal + Amount,

    NewUserBal = maps:put(Token, NewBal, UserBal),
    NewBalances = maps:put(From, NewUserBal, Balances),
    M1a = save_balances(M1, NewBalances, Opts),

    {ok, maps:merge(M1a, #{
        <<"action">> => <<"minted">>,
        <<"token">> => Token,
        <<"amount">> => Amount,
        <<"balance">> => NewBal
    })}.

%% @doc Get user balances
%% Returns balances as individual top-level keys
%% Each token becomes a key: result["TOKEN-X"] => amount
balances(M1, M2, _Opts) ->
    From = get_from(M2),
    Balances = load_balances(M1, _Opts),
    UserBal = maps:get(From, Balances, #{}),
    %% Return each token balance as a top-level key
    Result = maps:fold(
        fun(Token, Amount, Acc) ->
            maps:put(Token, Amount, Acc)
        end,
        #{<<"user">> => From, <<"count">> => maps:size(UserBal)},
        UserBal
    ),
    {ok, Result}.

%% @doc Create a new liquidity pool
create_pool(M1, M2, Opts) ->
    From = get_from(M2),
    TokenA = get_param(M2, <<"tokena">>, not_found),
    TokenB = get_param(M2, <<"tokenb">>, not_found),
    AmountA = get_int_param(M2, <<"amounta">>, 0),
    AmountB = get_int_param(M2, <<"amountb">>, 0),

    %% Validate inputs
    case {TokenA, TokenB} of
        {not_found, _} ->
            {error, #{<<"error">> => <<"tokens-required">>, <<"message">> => <<"Both tokens required">>}};
        {_, not_found} ->
            {error, #{<<"error">> => <<"tokens-required">>, <<"message">> => <<"Both tokens required">>}};
        {T, T} ->
            {error, #{<<"error">> => <<"same-token">>, <<"message">> => <<"Cannot create pool with same token">>}};
        _ when AmountA =< 0 orelse AmountB =< 0 ->
            {error, #{<<"error">> => <<"invalid-amounts">>, <<"message">> => <<"Valid amounts required">>}};
        _ ->
            PoolId = get_pool_id(TokenA, TokenB),
            Pools = load_pools(M1, Opts),

            case maps:is_key(PoolId, Pools) of
                true ->
                    {error, #{<<"error">> => <<"pool-exists">>, <<"message">> => <<"Pool already exists">>}};
                false ->
                    create_pool_impl(M1, From, TokenA, TokenB, AmountA, AmountB, PoolId, Pools, Opts)
            end
    end.

create_pool_impl(M1, From, TokenA, TokenB, AmountA, AmountB, PoolId, Pools, Opts) ->
    Balances = load_balances(M1, Opts),
    UserBal = maps:get(From, Balances, #{}),
    BalA = maps:get(TokenA, UserBal, 0),
    BalB = maps:get(TokenB, UserBal, 0),

    case {BalA >= AmountA, BalB >= AmountB} of
        {false, _} ->
            {error, #{<<"error">> => <<"insufficient-balance">>,
                      <<"need_a">> => AmountA, <<"have_a">> => BalA}};
        {_, false} ->
            {error, #{<<"error">> => <<"insufficient-balance">>,
                      <<"need_b">> => AmountB, <<"have_b">> => BalB}};
        {true, true} ->
            Liquidity = isqrt(AmountA * AmountB),
            case Liquidity < ?MIN_LIQUIDITY of
                true ->
                    {error, #{<<"error">> => <<"insufficient-liquidity">>,
                              <<"min">> => ?MIN_LIQUIDITY, <<"got">> => Liquidity}};
                false ->
                    %% Order tokens alphabetically
                    {OrderedA, OrderedB, ReserveA, ReserveB} =
                        case TokenA < TokenB of
                            true -> {TokenA, TokenB, AmountA, AmountB};
                            false -> {TokenB, TokenA, AmountB, AmountA}
                        end,

                    Pool = #{
                        <<"id">> => PoolId,
                        <<"token_a">> => OrderedA,
                        <<"token_b">> => OrderedB,
                        <<"reserve_a">> => ReserveA,
                        <<"reserve_b">> => ReserveB,
                        <<"total_liquidity">> => Liquidity,
                        <<"created_by">> => From,
                        <<"swap_count">> => 0,
                        <<"volume_a">> => 0,
                        <<"volume_b">> => 0
                    },

                    %% Update state
                    NewPools = maps:put(PoolId, Pool, Pools),
                    NewUserBal = maps:put(TokenA, BalA - AmountA,
                                   maps:put(TokenB, BalB - AmountB, UserBal)),
                    NewBalances = maps:put(From, NewUserBal, Balances),

                    %% Update liquidity tokens
                    LiqTokens = load_liquidity(M1, Opts),
                    PoolLiq = maps:get(PoolId, LiqTokens, #{}),
                    NewPoolLiq = maps:put(From, Liquidity, PoolLiq),
                    NewLiqTokens = maps:put(PoolId, NewPoolLiq, LiqTokens),

                    M1a = save_pools(M1, NewPools, Opts),
                    M1b = save_balances(M1a, NewBalances, Opts),
                    M1c = save_liquidity(M1b, NewLiqTokens, Opts),

                    {ok, maps:merge(M1c, #{
                        <<"action">> => <<"pool-created">>,
                        <<"pool_id">> => PoolId,
                        <<"liquidity">> => Liquidity,
                        <<"pool">> => Pool
                    })}
            end
    end.

%% @doc Add liquidity to existing pool
add_liquidity(M1, M2, Opts) ->
    From = get_from(M2),
    PoolId = get_param(M2, <<"poolid">>, not_found),
    AmountA = get_int_param(M2, <<"amounta">>, 0),
    AmountB = get_int_param(M2, <<"amountb">>, 0),

    Pools = load_pools(M1, Opts),

    case {PoolId, maps:get(PoolId, Pools, not_found)} of
        {not_found, _} ->
            {error, #{<<"error">> => <<"invalid-pool">>, <<"message">> => <<"Pool ID required">>}};
        {_, not_found} ->
            {error, #{<<"error">> => <<"invalid-pool">>, <<"message">> => <<"Pool not found">>}};
        {_, Pool} when AmountA =< 0 andalso AmountB =< 0 ->
            {error, #{<<"error">> => <<"amount-required">>, <<"message">> => <<"At least one amount required">>}};
        {_, Pool} ->
            add_liquidity_impl(M1, From, PoolId, Pool, AmountA, AmountB, Pools, Opts)
    end.

add_liquidity_impl(M1, From, PoolId, Pool, AmountA, AmountB, Pools, Opts) ->
    TokenA = maps:get(<<"token_a">>, Pool),
    TokenB = maps:get(<<"token_b">>, Pool),
    ReserveA = maps:get(<<"reserve_a">>, Pool),
    ReserveB = maps:get(<<"reserve_b">>, Pool),
    TotalLiq = maps:get(<<"total_liquidity">>, Pool),

    %% Calculate optimal amounts
    {OptimalA, OptimalB} = case {AmountA > 0, AmountB > 0} of
        {true, true} -> {AmountA, AmountB};
        {true, false} -> {AmountA, (AmountA * ReserveB) div ReserveA};
        {false, true} -> {(AmountB * ReserveA) div ReserveB, AmountB}
    end,

    Balances = load_balances(M1, Opts),
    UserBal = maps:get(From, Balances, #{}),
    BalA = maps:get(TokenA, UserBal, 0),
    BalB = maps:get(TokenB, UserBal, 0),

    case {BalA >= OptimalA, BalB >= OptimalB} of
        {false, _} ->
            {error, #{<<"error">> => <<"insufficient-balance">>,
                      <<"need_a">> => OptimalA, <<"have_a">> => BalA}};
        {_, false} ->
            {error, #{<<"error">> => <<"insufficient-balance">>,
                      <<"need_b">> => OptimalB, <<"have_b">> => BalB}};
        {true, true} ->
            %% Calculate LP tokens
            LiqA = (OptimalA * TotalLiq) div ReserveA,
            LiqB = (OptimalB * TotalLiq) div ReserveB,
            Liquidity = min(LiqA, LiqB),

            %% Update pool
            NewPool = Pool#{
                <<"reserve_a">> => ReserveA + OptimalA,
                <<"reserve_b">> => ReserveB + OptimalB,
                <<"total_liquidity">> => TotalLiq + Liquidity
            },
            NewPools = maps:put(PoolId, NewPool, Pools),

            %% Update balances
            NewUserBal = maps:put(TokenA, BalA - OptimalA,
                           maps:put(TokenB, BalB - OptimalB, UserBal)),
            NewBalances = maps:put(From, NewUserBal, Balances),

            %% Update liquidity tokens
            LiqTokens = load_liquidity(M1, Opts),
            PoolLiq = maps:get(PoolId, LiqTokens, #{}),
            UserLiq = maps:get(From, PoolLiq, 0),
            NewPoolLiq = maps:put(From, UserLiq + Liquidity, PoolLiq),
            NewLiqTokens = maps:put(PoolId, NewPoolLiq, LiqTokens),

            M1a = save_pools(M1, NewPools, Opts),
            M1b = save_balances(M1a, NewBalances, Opts),
            M1c = save_liquidity(M1b, NewLiqTokens, Opts),

            {ok, maps:merge(M1c, #{
                <<"action">> => <<"liquidity-added">>,
                <<"pool_id">> => PoolId,
                <<"amount_a">> => OptimalA,
                <<"amount_b">> => OptimalB,
                <<"liquidity">> => Liquidity,
                <<"total_liquidity">> => UserLiq + Liquidity
            })}
    end.

%% @doc Remove liquidity from pool
remove_liquidity(M1, M2, Opts) ->
    From = get_from(M2),
    PoolId = get_param(M2, <<"poolid">>, not_found),
    Liquidity = get_int_param(M2, <<"liquidity">>, 0),
    Percent = get_int_param(M2, <<"percent">>, 0),

    Pools = load_pools(M1, Opts),
    LiqTokens = load_liquidity(M1, Opts),

    case {PoolId, maps:get(PoolId, Pools, not_found)} of
        {not_found, _} ->
            {error, #{<<"error">> => <<"invalid-pool">>, <<"message">> => <<"Pool ID required">>}};
        {_, not_found} ->
            {error, #{<<"error">> => <<"invalid-pool">>, <<"message">> => <<"Pool not found">>}};
        {_, Pool} ->
            PoolLiq = maps:get(PoolId, LiqTokens, #{}),
            UserLiq = maps:get(From, PoolLiq, 0),

            %% Calculate liquidity to remove
            RemoveLiq = case Percent > 0 of
                true -> (UserLiq * Percent) div 100;
                false -> Liquidity
            end,

            case RemoveLiq =< 0 of
                true ->
                    {error, #{<<"error">> => <<"invalid-liquidity">>,
                              <<"message">> => <<"Valid liquidity amount required">>}};
                false when RemoveLiq > UserLiq ->
                    {error, #{<<"error">> => <<"insufficient-liquidity">>,
                              <<"have">> => UserLiq, <<"want">> => RemoveLiq}};
                false ->
                    remove_liquidity_impl(M1, From, PoolId, Pool, RemoveLiq, UserLiq,
                                         Pools, LiqTokens, Opts)
            end
    end.

remove_liquidity_impl(M1, From, PoolId, Pool, RemoveLiq, UserLiq, Pools, LiqTokens, Opts) ->
    TokenA = maps:get(<<"token_a">>, Pool),
    TokenB = maps:get(<<"token_b">>, Pool),
    ReserveA = maps:get(<<"reserve_a">>, Pool),
    ReserveB = maps:get(<<"reserve_b">>, Pool),
    TotalLiq = maps:get(<<"total_liquidity">>, Pool),

    %% Calculate tokens to return
    AmountA = (RemoveLiq * ReserveA) div TotalLiq,
    AmountB = (RemoveLiq * ReserveB) div TotalLiq,

    %% Update pool
    NewPool = Pool#{
        <<"reserve_a">> => ReserveA - AmountA,
        <<"reserve_b">> => ReserveB - AmountB,
        <<"total_liquidity">> => TotalLiq - RemoveLiq
    },
    NewPools = maps:put(PoolId, NewPool, Pools),

    %% Update balances
    Balances = load_balances(M1, Opts),
    UserBal = maps:get(From, Balances, #{}),
    BalA = maps:get(TokenA, UserBal, 0),
    BalB = maps:get(TokenB, UserBal, 0),
    NewUserBal = maps:put(TokenA, BalA + AmountA,
                   maps:put(TokenB, BalB + AmountB, UserBal)),
    NewBalances = maps:put(From, NewUserBal, Balances),

    %% Update liquidity tokens
    PoolLiq = maps:get(PoolId, LiqTokens, #{}),
    NewPoolLiq = maps:put(From, UserLiq - RemoveLiq, PoolLiq),
    NewLiqTokens = maps:put(PoolId, NewPoolLiq, LiqTokens),

    M1a = save_pools(M1, NewPools, Opts),
    M1b = save_balances(M1a, NewBalances, Opts),
    M1c = save_liquidity(M1b, NewLiqTokens, Opts),

    {ok, maps:merge(M1c, #{
        <<"action">> => <<"liquidity-removed">>,
        <<"pool_id">> => PoolId,
        <<"liquidity">> => RemoveLiq,
        <<"amount_a">> => AmountA,
        <<"amount_b">> => AmountB,
        <<"remaining_liquidity">> => UserLiq - RemoveLiq
    })}.

%% @doc Swap tokens
swap(M1, M2, Opts) ->
    From = get_from(M2),
    TokenIn = get_param(M2, <<"tokenin">>, not_found),
    TokenOut = get_param(M2, <<"tokenout">>, not_found),
    AmountIn = get_int_param(M2, <<"amountin">>, 0),
    MinAmountOut = get_int_param(M2, <<"minamountout">>, 0),

    case {TokenIn, TokenOut} of
        {not_found, _} ->
            {error, #{<<"error">> => <<"tokens-required">>, <<"message">> => <<"Both tokens required">>}};
        {_, not_found} ->
            {error, #{<<"error">> => <<"tokens-required">>, <<"message">> => <<"Both tokens required">>}};
        _ when AmountIn =< 0 ->
            {error, #{<<"error">> => <<"invalid-amount">>, <<"message">> => <<"Valid amount required">>}};
        _ ->
            PoolId = get_pool_id(TokenIn, TokenOut),
            Pools = load_pools(M1, Opts),

            case maps:get(PoolId, Pools, not_found) of
                not_found ->
                    {error, #{<<"error">> => <<"no-pool">>, <<"message">> => <<"No pool for this pair">>}};
                Pool ->
                    swap_impl(M1, From, TokenIn, TokenOut, AmountIn, MinAmountOut, PoolId, Pool, Pools, Opts)
            end
    end.

swap_impl(M1, From, TokenIn, TokenOut, AmountIn, MinAmountOut, PoolId, Pool, Pools, Opts) ->
    Balances = load_balances(M1, Opts),
    UserBal = maps:get(From, Balances, #{}),
    Balance = maps:get(TokenIn, UserBal, 0),

    case Balance < AmountIn of
        true ->
            {error, #{<<"error">> => <<"insufficient-balance">>,
                      <<"have">> => Balance, <<"need">> => AmountIn}};
        false ->
            TokenA = maps:get(<<"token_a">>, Pool),
            ReserveA = maps:get(<<"reserve_a">>, Pool),
            ReserveB = maps:get(<<"reserve_b">>, Pool),

            {ReserveIn, ReserveOut} = case TokenIn =:= TokenA of
                true -> {ReserveA, ReserveB};
                false -> {ReserveB, ReserveA}
            end,

            AmountOut = get_amount_out(AmountIn, ReserveIn, ReserveOut),

            case AmountOut < MinAmountOut of
                true ->
                    {error, #{<<"error">> => <<"slippage">>,
                              <<"expected">> => MinAmountOut, <<"actual">> => AmountOut}};
                false when AmountOut >= ReserveOut ->
                    {error, #{<<"error">> => <<"insufficient-liquidity">>,
                              <<"message">> => <<"Not enough liquidity">>}};
                false ->
                    %% Update reserves
                    {NewReserveA, NewReserveB, VolumeA, VolumeB} = case TokenIn =:= TokenA of
                        true ->
                            {ReserveA + AmountIn, ReserveB - AmountOut,
                             maps:get(<<"volume_a">>, Pool) + AmountIn,
                             maps:get(<<"volume_b">>, Pool)};
                        false ->
                            {ReserveA - AmountOut, ReserveB + AmountIn,
                             maps:get(<<"volume_a">>, Pool),
                             maps:get(<<"volume_b">>, Pool) + AmountIn}
                    end,

                    NewPool = Pool#{
                        <<"reserve_a">> => NewReserveA,
                        <<"reserve_b">> => NewReserveB,
                        <<"swap_count">> => maps:get(<<"swap_count">>, Pool) + 1,
                        <<"volume_a">> => VolumeA,
                        <<"volume_b">> => VolumeB
                    },
                    NewPools = maps:put(PoolId, NewPool, Pools),

                    %% Update balances
                    BalIn = maps:get(TokenIn, UserBal, 0),
                    BalOut = maps:get(TokenOut, UserBal, 0),
                    NewUserBal = maps:put(TokenIn, BalIn - AmountIn,
                                   maps:put(TokenOut, BalOut + AmountOut, UserBal)),
                    NewBalances = maps:put(From, NewUserBal, Balances),

                    M1a = save_pools(M1, NewPools, Opts),
                    M1b = save_balances(M1a, NewBalances, Opts),

                    {ok, maps:merge(M1b, #{
                        <<"action">> => <<"swapped">>,
                        <<"token_in">> => TokenIn,
                        <<"token_out">> => TokenOut,
                        <<"amount_in">> => AmountIn,
                        <<"amount_out">> => AmountOut,
                        <<"price">> => AmountIn / AmountOut
                    })}
            end
    end.

%% @doc Get swap quote
quote(M1, M2, Opts) ->
    TokenIn = get_param(M2, <<"tokenin">>, not_found),
    TokenOut = get_param(M2, <<"tokenout">>, not_found),
    AmountIn = get_int_param(M2, <<"amountin">>, 0),

    case {TokenIn, TokenOut, AmountIn} of
        {not_found, _, _} ->
            {error, #{<<"error">> => <<"invalid-request">>, <<"message">> => <<"All parameters required">>}};
        {_, not_found, _} ->
            {error, #{<<"error">> => <<"invalid-request">>, <<"message">> => <<"All parameters required">>}};
        {_, _, A} when A =< 0 ->
            {error, #{<<"error">> => <<"invalid-request">>, <<"message">> => <<"All parameters required">>}};
        _ ->
            PoolId = get_pool_id(TokenIn, TokenOut),
            Pools = load_pools(M1, Opts),

            case maps:get(PoolId, Pools, not_found) of
                not_found ->
                    {error, #{<<"error">> => <<"no-pool">>, <<"message">> => <<"No pool for this pair">>}};
                Pool ->
                    TokenA = maps:get(<<"token_a">>, Pool),
                    ReserveA = maps:get(<<"reserve_a">>, Pool),
                    ReserveB = maps:get(<<"reserve_b">>, Pool),

                    {ReserveIn, ReserveOut} = case TokenIn =:= TokenA of
                        true -> {ReserveA, ReserveB};
                        false -> {ReserveB, ReserveA}
                    end,

                    AmountOut = get_amount_out(AmountIn, ReserveIn, ReserveOut),
                    PriceImpact = (AmountIn * 10000) div ReserveIn,
                    Fee = (AmountIn * ?SWAP_FEE) div 10000,

                    {ok, #{
                        <<"amount_in">> => AmountIn,
                        <<"amount_out">> => AmountOut,
                        <<"price">> => AmountIn / max(AmountOut, 1),
                        <<"price_impact">> => PriceImpact,
                        <<"fee">> => Fee
                    }}
            end
    end.

%% @doc Get pool info
pool(M1, M2, Opts) ->
    PoolId = get_param(M2, <<"poolid">>, not_found),
    Pools = load_pools(M1, Opts),

    case {PoolId, maps:get(PoolId, Pools, not_found)} of
        {not_found, _} ->
            {error, #{<<"error">> => <<"not-found">>, <<"message">> => <<"Pool ID required">>}};
        {_, not_found} ->
            {error, #{<<"error">> => <<"not-found">>, <<"message">> => <<"Pool not found">>}};
        {_, Pool} ->
            ReserveA = maps:get(<<"reserve_a">>, Pool),
            ReserveB = maps:get(<<"reserve_b">>, Pool),
            Price = ReserveB / max(ReserveA, 1),
            TVL = ReserveA + ReserveB,

            {ok, #{
                <<"pool">> => Pool,
                <<"price">> => Price,
                <<"tvl">> => TVL
            }}
    end.

%% @doc List all pools
pools(M1, _M2, Opts) ->
    Pools = load_pools(M1, Opts),
    PoolList = maps:fold(fun(_K, Pool, Acc) ->
        [#{
            <<"id">> => maps:get(<<"id">>, Pool),
            <<"token_a">> => maps:get(<<"token_a">>, Pool),
            <<"token_b">> => maps:get(<<"token_b">>, Pool),
            <<"reserve_a">> => maps:get(<<"reserve_a">>, Pool),
            <<"reserve_b">> => maps:get(<<"reserve_b">>, Pool),
            <<"total_liquidity">> => maps:get(<<"total_liquidity">>, Pool),
            <<"swap_count">> => maps:get(<<"swap_count">>, Pool)
        } | Acc]
    end, [], Pools),

    {ok, #{<<"pools">> => PoolList, <<"count">> => length(PoolList)}}.

%% @doc Get user's liquidity positions
my_liquidity(M1, M2, Opts) ->
    From = get_from(M2),
    Pools = load_pools(M1, Opts),
    LiqTokens = load_liquidity(M1, Opts),

    Positions = maps:fold(fun(PoolId, PoolLiq, Acc) ->
        case maps:get(From, PoolLiq, 0) of
            0 -> Acc;
            UserLiq ->
                case maps:get(PoolId, Pools, not_found) of
                    not_found -> Acc;
                    Pool ->
                        TotalLiq = maps:get(<<"total_liquidity">>, Pool),
                        ReserveA = maps:get(<<"reserve_a">>, Pool),
                        ReserveB = maps:get(<<"reserve_b">>, Pool),
                        Share = (UserLiq * 100) / max(TotalLiq, 1),

                        [#{
                            <<"pool_id">> => PoolId,
                            <<"liquidity">> => UserLiq,
                            <<"share">> => Share,
                            <<"value_a">> => (UserLiq * ReserveA) div max(TotalLiq, 1),
                            <<"value_b">> => (UserLiq * ReserveB) div max(TotalLiq, 1)
                        } | Acc]
                end
        end
    end, [], LiqTokens),

    {ok, #{<<"positions">> => Positions}}.

%%====================================================================
%% Internal Functions
%%====================================================================

%% @private Get pool ID from token pair (sorted alphabetically)
get_pool_id(TokenA, TokenB) ->
    case TokenA < TokenB of
        true -> <<TokenA/binary, "-", TokenB/binary>>;
        false -> <<TokenB/binary, "-", TokenA/binary>>
    end.

%% @private Calculate output amount using constant product formula
get_amount_out(AmountIn, ReserveIn, ReserveOut) ->
    AmountInWithFee = AmountIn * (10000 - ?SWAP_FEE),
    Numerator = AmountInWithFee * ReserveOut,
    Denominator = (ReserveIn * 10000) + AmountInWithFee,
    Numerator div Denominator.

%% @private Integer square root
isqrt(0) -> 0;
isqrt(N) when N > 0 ->
    isqrt_loop(N, N).

isqrt_loop(N, X) ->
    Y = (X + N div X) div 2,
    case Y < X of
        true -> isqrt_loop(N, Y);
        false -> X
    end.

%% @private Get parameter from message
get_param(M2, Key, Default) ->
    %% Try lowercase and capitalized versions
    case maps:get(Key, M2, not_found) of
        not_found ->
            CapKey = capitalize(Key),
            maps:get(CapKey, M2, Default);
        V -> V
    end.

%% @private Get integer parameter
get_int_param(M2, Key, Default) ->
    case get_param(M2, Key, not_found) of
        not_found -> Default;
        V when is_binary(V) -> binary_to_integer(V);
        V when is_integer(V) -> V;
        _ -> Default
    end.

%% @private Get from address
get_from(M2) ->
    case maps:get(<<"from">>, M2, not_found) of
        not_found -> maps:get(<<"From">>, M2, <<"unknown">>);
        V -> V
    end.

%% @private Capitalize first letter
capitalize(<<First, Rest/binary>>) when First >= $a, First =< $z ->
    <<(First - 32), Rest/binary>>;
capitalize(Bin) -> Bin.

%% persistent_term keys for global state
-define(POOLS_PT_KEY, {dev_dex, pools}).
-define(BALANCES_PT_KEY, {dev_dex, balances}).
-define(LIQUIDITY_PT_KEY, {dev_dex, liquidity}).

%% @private Load pools from persistent_term
load_pools(_M1, _Opts) ->
    try persistent_term:get(?POOLS_PT_KEY)
    catch error:badarg -> #{}
    end.

%% @private Save pools to persistent_term
save_pools(M1, Pools, _Opts) ->
    persistent_term:put(?POOLS_PT_KEY, Pools),
    M1.

%% @private Load balances from persistent_term
load_balances(_M1, _Opts) ->
    try persistent_term:get(?BALANCES_PT_KEY)
    catch error:badarg -> #{}
    end.

%% @private Save balances to persistent_term
save_balances(M1, Balances, _Opts) ->
    persistent_term:put(?BALANCES_PT_KEY, Balances),
    M1.

%% @private Load liquidity tokens from persistent_term
load_liquidity(_M1, _Opts) ->
    try persistent_term:get(?LIQUIDITY_PT_KEY)
    catch error:badarg -> #{}
    end.

%% @private Save liquidity tokens to persistent_term
save_liquidity(M1, LiqTokens, _Opts) ->
    persistent_term:put(?LIQUIDITY_PT_KEY, LiqTokens),
    M1.

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
    ?assertEqual(<<"dex">>, maps:get(<<"name">>, Info)),
    ?assertEqual(<<"1.0">>, maps:get(<<"version">>, Info)).

%% Test minting tokens
mint_test() ->
    Opts = setup_test_env(),
    M1 = #{},
    M2 = #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 100000},

    {ok, R1} = mint(M1, M2, Opts),
    ?assertEqual(<<"minted">>, maps:get(<<"action">>, R1)),
    ?assertEqual(100000, maps:get(<<"balance">>, R1)),

    %% Mint more
    {ok, R2} = mint(R1, M2#{<<"amount">> => 50000}, Opts),
    ?assertEqual(150000, maps:get(<<"balance">>, R2)).

%% Test getting balances
balances_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Mint some tokens
    {ok, R1} = mint(M1, #{<<"from">> => <<"bob">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 1000}, Opts),
    {ok, R2} = mint(R1, #{<<"from">> => <<"bob">>, <<"token">> => <<"TOKEN-B">>, <<"amount">> => 2000}, Opts),

    %% Check balances
    {ok, Bal} = balances(R2, #{<<"from">> => <<"bob">>}, Opts),
    Bals = maps:get(<<"balances">>, Bal),
    ?assertEqual(1000, maps:get(<<"TOKEN-A">>, Bals)),
    ?assertEqual(2000, maps:get(<<"TOKEN-B">>, Bals)).

%% Test pool creation
create_pool_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Mint tokens for user
    {ok, R1} = mint(M1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 100000}, Opts),
    {ok, R2} = mint(R1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-B">>, <<"amount">> => 100000}, Opts),

    %% Create pool
    {ok, R3} = create_pool(R2, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-B">>,
        <<"amounta">> => 50000,
        <<"amountb">> => 50000
    }, Opts),

    ?assertEqual(<<"pool-created">>, maps:get(<<"action">>, R3)),
    ?assertEqual(<<"TOKEN-A-TOKEN-B">>, maps:get(<<"pool_id">>, R3)),

    %% Verify liquidity
    Pool = maps:get(<<"pool">>, R3),
    ?assertEqual(50000, maps:get(<<"reserve_a">>, Pool)),
    ?assertEqual(50000, maps:get(<<"reserve_b">>, Pool)).

%% Test pool creation errors
create_pool_errors_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Missing tokens
    {error, E1} = create_pool(M1, #{<<"from">> => <<"alice">>}, Opts),
    ?assertEqual(<<"tokens-required">>, maps:get(<<"error">>, E1)),

    %% Same token
    {error, E2} = create_pool(M1, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-A">>,
        <<"amounta">> => 1000,
        <<"amountb">> => 1000
    }, Opts),
    ?assertEqual(<<"same-token">>, maps:get(<<"error">>, E2)),

    %% Insufficient balance
    {error, E3} = create_pool(M1, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-B">>,
        <<"amounta">> => 1000,
        <<"amountb">> => 1000
    }, Opts),
    ?assertEqual(<<"insufficient-balance">>, maps:get(<<"error">>, E3)).

%% Test swap
swap_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Setup: mint and create pool
    {ok, R1} = mint(M1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 200000}, Opts),
    {ok, R2} = mint(R1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-B">>, <<"amount">> => 200000}, Opts),
    {ok, R3} = create_pool(R2, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-B">>,
        <<"amounta">> => 100000,
        <<"amountb">> => 100000
    }, Opts),

    %% Perform swap
    {ok, R4} = swap(R3, #{
        <<"from">> => <<"alice">>,
        <<"tokenin">> => <<"TOKEN-A">>,
        <<"tokenout">> => <<"TOKEN-B">>,
        <<"amountin">> => 10000
    }, Opts),

    ?assertEqual(<<"swapped">>, maps:get(<<"action">>, R4)),
    ?assertEqual(10000, maps:get(<<"amount_in">>, R4)),

    %% Amount out should be less than input due to fee and constant product
    AmountOut = maps:get(<<"amount_out">>, R4),
    ?assert(AmountOut > 0),
    ?assert(AmountOut < 10000).

%% Test swap quote
quote_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Setup pool
    {ok, R1} = mint(M1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 100000}, Opts),
    {ok, R2} = mint(R1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-B">>, <<"amount">> => 100000}, Opts),
    {ok, R3} = create_pool(R2, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-B">>,
        <<"amounta">> => 100000,
        <<"amountb">> => 100000
    }, Opts),

    %% Get quote
    {ok, Q} = quote(R3, #{
        <<"tokenin">> => <<"TOKEN-A">>,
        <<"tokenout">> => <<"TOKEN-B">>,
        <<"amountin">> => 1000
    }, Opts),

    ?assertEqual(1000, maps:get(<<"amount_in">>, Q)),
    ?assert(maps:get(<<"amount_out">>, Q) > 0),
    ?assert(maps:get(<<"fee">>, Q) > 0).

%% Test add liquidity
add_liquidity_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Setup
    {ok, R1} = mint(M1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 200000}, Opts),
    {ok, R2} = mint(R1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-B">>, <<"amount">> => 200000}, Opts),
    {ok, R3} = create_pool(R2, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-B">>,
        <<"amounta">> => 50000,
        <<"amountb">> => 50000
    }, Opts),

    %% Add more liquidity
    {ok, R4} = add_liquidity(R3, #{
        <<"from">> => <<"alice">>,
        <<"poolid">> => <<"TOKEN-A-TOKEN-B">>,
        <<"amounta">> => 10000,
        <<"amountb">> => 10000
    }, Opts),

    ?assertEqual(<<"liquidity-added">>, maps:get(<<"action">>, R4)),
    ?assert(maps:get(<<"liquidity">>, R4) > 0).

%% Test remove liquidity
remove_liquidity_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Setup
    {ok, R1} = mint(M1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 100000}, Opts),
    {ok, R2} = mint(R1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-B">>, <<"amount">> => 100000}, Opts),
    {ok, R3} = create_pool(R2, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-B">>,
        <<"amounta">> => 50000,
        <<"amountb">> => 50000
    }, Opts),

    %% Remove 10% liquidity
    {ok, R4} = remove_liquidity(R3, #{
        <<"from">> => <<"alice">>,
        <<"poolid">> => <<"TOKEN-A-TOKEN-B">>,
        <<"percent">> => 10
    }, Opts),

    ?assertEqual(<<"liquidity-removed">>, maps:get(<<"action">>, R4)),
    ?assert(maps:get(<<"amount_a">>, R4) > 0),
    ?assert(maps:get(<<"amount_b">>, R4) > 0).

%% Test list pools
pools_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Initially empty
    {ok, P1} = pools(M1, #{}, Opts),
    ?assertEqual(0, maps:get(<<"count">>, P1)),

    %% Create pool
    {ok, R1} = mint(M1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 100000}, Opts),
    {ok, R2} = mint(R1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-B">>, <<"amount">> => 100000}, Opts),
    {ok, R3} = create_pool(R2, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-B">>,
        <<"amounta">> => 50000,
        <<"amountb">> => 50000
    }, Opts),

    {ok, P2} = pools(R3, #{}, Opts),
    ?assertEqual(1, maps:get(<<"count">>, P2)).

%% Test my liquidity
my_liquidity_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Setup
    {ok, R1} = mint(M1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 100000}, Opts),
    {ok, R2} = mint(R1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-B">>, <<"amount">> => 100000}, Opts),
    {ok, R3} = create_pool(R2, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-B">>,
        <<"amounta">> => 50000,
        <<"amountb">> => 50000
    }, Opts),

    {ok, Liq} = my_liquidity(R3, #{<<"from">> => <<"alice">>}, Opts),
    Positions = maps:get(<<"positions">>, Liq),
    ?assertEqual(1, length(Positions)),

    [Pos] = Positions,
    ?assertEqual(<<"TOKEN-A-TOKEN-B">>, maps:get(<<"pool_id">>, Pos)),
    ?assertEqual(100.0, maps:get(<<"share">>, Pos)).  %% 100% ownership

%% Test constant product invariant
constant_product_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Setup pool
    {ok, R1} = mint(M1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 200000}, Opts),
    {ok, R2} = mint(R1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-B">>, <<"amount">> => 200000}, Opts),
    {ok, R3} = create_pool(R2, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-B">>,
        <<"amounta">> => 100000,
        <<"amountb">> => 100000
    }, Opts),

    %% Get K before swap
    {ok, P1} = pool(R3, #{<<"poolid">> => <<"TOKEN-A-TOKEN-B">>}, Opts),
    Pool1 = maps:get(<<"pool">>, P1),
    K1 = maps:get(<<"reserve_a">>, Pool1) * maps:get(<<"reserve_b">>, Pool1),

    %% Swap
    {ok, R4} = swap(R3, #{
        <<"from">> => <<"alice">>,
        <<"tokenin">> => <<"TOKEN-A">>,
        <<"tokenout">> => <<"TOKEN-B">>,
        <<"amountin">> => 1000
    }, Opts),

    %% Get K after swap - should be >= K1 due to fees
    {ok, P2} = pool(R4, #{<<"poolid">> => <<"TOKEN-A-TOKEN-B">>}, Opts),
    Pool2 = maps:get(<<"pool">>, P2),
    K2 = maps:get(<<"reserve_a">>, Pool2) * maps:get(<<"reserve_b">>, Pool2),

    ?assert(K2 >= K1).

%% Test slippage protection
slippage_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Setup pool
    {ok, R1} = mint(M1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-A">>, <<"amount">> => 200000}, Opts),
    {ok, R2} = mint(R1, #{<<"from">> => <<"alice">>, <<"token">> => <<"TOKEN-B">>, <<"amount">> => 200000}, Opts),
    {ok, R3} = create_pool(R2, #{
        <<"from">> => <<"alice">>,
        <<"tokena">> => <<"TOKEN-A">>,
        <<"tokenb">> => <<"TOKEN-B">>,
        <<"amounta">> => 100000,
        <<"amountb">> => 100000
    }, Opts),

    %% Swap with impossible min amount out
    {error, E} = swap(R3, #{
        <<"from">> => <<"alice">>,
        <<"tokenin">> => <<"TOKEN-A">>,
        <<"tokenout">> => <<"TOKEN-B">>,
        <<"amountin">> => 1000,
        <<"minamountout">> => 999999
    }, Opts),

    ?assertEqual(<<"slippage">>, maps:get(<<"error">>, E)).

-endif.
