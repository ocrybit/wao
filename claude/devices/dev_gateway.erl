%%%-------------------------------------------------------------------
%%% @doc Authenticated API Gateway Device
%%%
%%% Full-featured gateway with auth, payment, scheduling, routing.
%%%
%%% @end
%%%-------------------------------------------------------------------
-module(dev_gateway).
-export([
    info/3,
    %% Auth
    register_key/3, authenticate/3,
    %% Payment
    balance/3, deposit/3, withdraw/3,
    %% API
    api_call/3,
    %% Scheduling
    schedule/3, tasks/3, cancel_task/3,
    %% Routing
    add_route/3, routes/3
]).
-include("include/hb.hrl").

-define(KEYS_KEY, <<"gateway-keys">>).
-define(BALANCES_KEY, <<"gateway-balances">>).
-define(TASKS_KEY, <<"gateway-tasks">>).
-define(ROUTES_KEY, <<"gateway-routes">>).
-define(API_COST, 10).

%%====================================================================
%% Device Info
%%====================================================================

info(_M1, _M2, _Opts) ->
    {ok, #{
        <<"name">> => <<"gateway">>,
        <<"version">> => <<"1.0">>,
        <<"description">> => <<"Authenticated API Gateway">>,
        <<"features">> => [
            <<"api-key-auth">>,
            <<"token-payment">>,
            <<"task-scheduling">>,
            <<"request-routing">>
        ]
    }}.

%%====================================================================
%% Authentication
%%====================================================================

register_key(M1, M2, Opts) ->
    case get_signer(M2, Opts) of
        not_found ->
            {error, #{<<"status">> => 401, <<"error">> => <<"Request not signed">>}};
        Signer ->
            APIKey = generate_api_key(),
            Keys = load_data(M1, ?KEYS_KEY, Opts),
            NewKeys = maps:put(APIKey, Signer, Keys),
            M1Updated = save_data(M1, ?KEYS_KEY, NewKeys, Opts),
            {ok, maps:merge(M1Updated, #{
                <<"api_key">> => APIKey,
                <<"address">> => Signer
            })}
    end.

authenticate(M1, M2, Opts) ->
    case maps:get(<<"api-key">>, M2, not_found) of
        not_found ->
            {error, #{<<"status">> => 401, <<"error">> => <<"Missing API key">>}};
        Key ->
            Keys = load_data(M1, ?KEYS_KEY, Opts),
            case maps:get(Key, Keys, not_found) of
                not_found ->
                    {error, #{<<"status">> => 401, <<"error">> => <<"Invalid">>}};
                Address ->
                    {ok, #{<<"authenticated">> => true, <<"address">> => Address}}
            end
    end.

%%====================================================================
%% Payment
%%====================================================================

balance(M1, M2, Opts) ->
    case get_authenticated_address(M1, M2, Opts) of
        {error, E} -> {error, E};
        Addr ->
            Balances = load_data(M1, ?BALANCES_KEY, Opts),
            {ok, #{<<"address">> => Addr, <<"balance">> => maps:get(Addr, Balances, 0)}}
    end.

deposit(M1, M2, Opts) ->
    case get_authenticated_address(M1, M2, Opts) of
        {error, E} -> {error, E};
        Addr ->
            Amount = maps:get(<<"amount">>, M2, 0),
            case Amount > 0 of
                false ->
                    {error, #{<<"status">> => 400, <<"error">> => <<"Invalid amount">>}};
                true ->
                    Balances = load_data(M1, ?BALANCES_KEY, Opts),
                    NewBalance = maps:get(Addr, Balances, 0) + Amount,
                    NewBalances = maps:put(Addr, NewBalance, Balances),
                    M1Updated = save_data(M1, ?BALANCES_KEY, NewBalances, Opts),
                    {ok, maps:merge(M1Updated, #{
                        <<"deposited">> => Amount,
                        <<"balance">> => NewBalance
                    })}
            end
    end.

withdraw(M1, M2, Opts) ->
    case get_authenticated_address(M1, M2, Opts) of
        {error, E} -> {error, E};
        Addr ->
            Amount = maps:get(<<"amount">>, M2, 0),
            Balances = load_data(M1, ?BALANCES_KEY, Opts),
            CurrentBalance = maps:get(Addr, Balances, 0),
            case {Amount > 0, CurrentBalance >= Amount} of
                {false, _} ->
                    {error, #{<<"status">> => 400, <<"error">> => <<"Invalid amount">>}};
                {_, false} ->
                    {error, #{<<"status">> => 402, <<"error">> => <<"Insufficient balance">>}};
                {true, true} ->
                    NewBalance = CurrentBalance - Amount,
                    NewBalances = maps:put(Addr, NewBalance, Balances),
                    M1Updated = save_data(M1, ?BALANCES_KEY, NewBalances, Opts),
                    {ok, maps:merge(M1Updated, #{
                        <<"withdrawn">> => Amount,
                        <<"balance">> => NewBalance
                    })}
            end
    end.

%%====================================================================
%% Protected API
%%====================================================================

api_call(M1, M2, Opts) ->
    case get_authenticated_address(M1, M2, Opts) of
        {error, E} -> {error, E};
        Address ->
            Balances = load_data(M1, ?BALANCES_KEY, Opts),
            Balance = maps:get(Address, Balances, 0),
            case Balance >= ?API_COST of
                false ->
                    {error, #{
                        <<"status">> => 402,
                        <<"error">> => <<"Insufficient balance">>,
                        <<"required">> => ?API_COST,
                        <<"balance">> => Balance
                    }};
                true ->
                    Action = maps:get(<<"action">>, M2, <<"default">>),
                    Data = maps:get(<<"data">>, M2, #{}),
                    Result = #{
                        <<"action">> => Action,
                        <<"processed">> => true,
                        <<"timestamp">> => erlang:system_time(second),
                        <<"input">> => Data
                    },
                    NewBalance = Balance - ?API_COST,
                    NewBalances = maps:put(Address, NewBalance, Balances),
                    M1Updated = save_data(M1, ?BALANCES_KEY, NewBalances, Opts),
                    {ok, maps:merge(M1Updated, #{
                        <<"result">> => Result,
                        <<"charged">> => ?API_COST,
                        <<"balance">> => NewBalance
                    })}
            end
    end.

%%====================================================================
%% Scheduling
%%====================================================================

schedule(M1, M2, Opts) ->
    case get_authenticated_address(M1, M2, Opts) of
        {error, E} -> {error, E};
        Addr ->
            Cron = maps:get(<<"cron">>, M2, <<"* * * * *">>),
            Action = maps:get(<<"action">>, M2, not_found),
            Data = maps:get(<<"data">>, M2, #{}),
            case Action of
                not_found ->
                    {error, #{<<"status">> => 400, <<"error">> => <<"Missing action">>}};
                _ ->
                    TaskID = generate_task_id(),
                    Task = #{
                        <<"id">> => TaskID, <<"owner">> => Addr,
                        <<"cron">> => Cron, <<"action">> => Action,
                        <<"data">> => Data, <<"created">> => erlang:system_time(second),
                        <<"status">> => <<"active">>
                    },
                    Tasks = load_data(M1, ?TASKS_KEY, Opts),
                    M1Updated = save_data(M1, ?TASKS_KEY, maps:put(TaskID, Task, Tasks), Opts),
                    {ok, maps:merge(M1Updated, #{
                        <<"task_id">> => TaskID,
                        <<"cron">> => Cron,
                        <<"status">> => <<"scheduled">>
                    })}
            end
    end.

tasks(M1, M2, Opts) ->
    case get_authenticated_address(M1, M2, Opts) of
        {error, E} -> {error, E};
        Addr ->
            AllTasks = load_data(M1, ?TASKS_KEY, Opts),
            UserTasks = maps:filter(fun(_K, V) -> maps:get(<<"owner">>, V) =:= Addr end, AllTasks),
            {ok, #{<<"tasks">> => maps:values(UserTasks), <<"count">> => maps:size(UserTasks)}}
    end.

cancel_task(M1, M2, Opts) ->
    case {get_authenticated_address(M1, M2, Opts), maps:get(<<"id">>, M2, not_found)} of
        {{error, E}, _} -> {error, E};
        {_, not_found} ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Missing task ID">>}};
        {Addr, TID} ->
            Tasks = load_data(M1, ?TASKS_KEY, Opts),
            case maps:get(TID, Tasks, not_found) of
                not_found ->
                    {error, #{<<"status">> => 404, <<"error">> => <<"Not found">>}};
                Task ->
                    case maps:get(<<"owner">>, Task) of
                        Addr ->
                            UpdatedTask = Task#{<<"status">> => <<"cancelled">>},
                            M1Updated = save_data(M1, ?TASKS_KEY, maps:put(TID, UpdatedTask, Tasks), Opts),
                            {ok, maps:merge(M1Updated, #{<<"task_id">> => TID, <<"status">> => <<"cancelled">>})};
                        _ ->
                            {error, #{<<"status">> => 403, <<"error">> => <<"Forbidden">>}}
                    end
            end
    end.

%%====================================================================
%% Routing
%%====================================================================

add_route(M1, M2, Opts) ->
    case {maps:get(<<"template">>, M2, not_found), maps:get(<<"node">>, M2, not_found)} of
        {not_found, _} ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Missing template">>}};
        {_, not_found} ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Missing node">>}};
        {T, N} ->
            Route = #{
                <<"template">> => T, <<"node">> => N,
                <<"methods">> => maps:get(<<"methods">>, M2, [<<"GET">>, <<"POST">>]),
                <<"created">> => erlang:system_time(second)
            },
            Routes = load_data(M1, ?ROUTES_KEY, Opts),
            M1Updated = save_data(M1, ?ROUTES_KEY, maps:put(T, Route, Routes), Opts),
            {ok, maps:merge(M1Updated, #{<<"route">> => Route, <<"status">> => <<"added">>})}
    end.

routes(M1, _M2, Opts) ->
    Routes = load_data(M1, ?ROUTES_KEY, Opts),
    {ok, #{<<"routes">> => maps:values(Routes), <<"count">> => maps:size(Routes)}}.

%%====================================================================
%% Internal Helpers
%%====================================================================

get_signer(M2, Opts) ->
    case hb_message:signers(M2, Opts) of
        [] -> not_found;
        [Signer | _] -> Signer
    end.

get_authenticated_address(M1, M2, Opts) ->
    case maps:get(<<"api-key">>, M2, not_found) of
        not_found ->
            case get_signer(M2, Opts) of
                not_found -> {error, #{<<"status">> => 401, <<"error">> => <<"Not authenticated">>}};
                Signer -> Signer
            end;
        APIKey ->
            Keys = load_data(M1, ?KEYS_KEY, Opts),
            case maps:get(APIKey, Keys, not_found) of
                not_found -> {error, #{<<"status">> => 401, <<"error">> => <<"Invalid API key">>}};
                Address -> Address
            end
    end.

generate_api_key() ->
    hb_util:encode(crypto:strong_rand_bytes(32)).

generate_task_id() ->
    hb_util:encode(crypto:strong_rand_bytes(16)).

load_data(M1, Key, _Opts) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{Key := Data} when is_map(Data) -> Data;
        _ -> #{}
    end.

save_data(M1, Key, Data, _Opts) ->
    Priv = maps:get(<<"priv">>, M1, #{}),
    M1#{<<"priv">> => Priv#{Key => Data}}.

%%====================================================================
%% Tests - Using hb_ao:resolve with {as, Module, Msg} pattern
%% Following L3 tutorial pattern from docs/pages/book/build3.mdx
%%====================================================================

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").

setup_test_env() ->
    application:ensure_all_started(hb),
    Store = hb_test_utils:test_store(hb_store_fs),
    Wallet = ar_wallet:new(),
    #{store => [Store], priv_wallet => Wallet}.

%% Test device info via hb_ao:resolve
info_test() ->
    application:ensure_all_started(hb),
    {ok, Info} = hb_ao:resolve(
        {as, dev_gateway, #{}},
        #{<<"path">> => <<"info">>},
        #{}
    ),
    ?assertEqual(<<"gateway">>, maps:get(<<"name">>, Info)).

%% Test payment flow via hb_ao:resolve
payment_flow_test() ->
    Opts = setup_test_env(),
    Wallet = maps:get(priv_wallet, Opts),
    M1 = #{},

    %% Sign a message with amount
    SignedMsg = hb_message:commit(#{<<"amount">> => 1000}, #{priv_wallet => Wallet}),

    %% Deposit via hb_ao:resolve
    {ok, DepRes} = hb_ao:resolve(
        {as, dev_gateway, M1},
        maps:merge(SignedMsg, #{<<"path">> => <<"deposit">>}),
        Opts
    ),
    ?assertEqual(1000, maps:get(<<"balance">>, DepRes)),

    %% Check balance
    {ok, BalRes} = hb_ao:resolve(
        {as, dev_gateway, DepRes},
        maps:merge(SignedMsg, #{<<"path">> => <<"balance">>}),
        Opts
    ),
    ?assertEqual(1000, maps:get(<<"balance">>, BalRes)),

    %% Withdraw
    WithdrawMsg = hb_message:commit(#{<<"amount">> => 500}, #{priv_wallet => Wallet}),
    {ok, WithRes} = hb_ao:resolve(
        {as, dev_gateway, DepRes},
        maps:merge(WithdrawMsg, #{<<"path">> => <<"withdraw">>}),
        Opts
    ),
    ?assertEqual(500, maps:get(<<"balance">>, WithRes)).

%% Test API call via hb_ao:resolve
api_call_test() ->
    Opts = setup_test_env(),
    Wallet = maps:get(priv_wallet, Opts),
    M1 = #{},

    %% Deposit first
    SignedMsg = hb_message:commit(#{<<"amount">> => 100}, #{priv_wallet => Wallet}),
    {ok, DepRes} = hb_ao:resolve(
        {as, dev_gateway, M1},
        maps:merge(SignedMsg, #{<<"path">> => <<"deposit">>}),
        Opts
    ),

    %% Make API call
    APICallMsg = hb_message:commit(#{
        <<"action">> => <<"test">>,
        <<"data">> => #{<<"foo">> => <<"bar">>}
    }, #{priv_wallet => Wallet}),
    {ok, APIRes} = hb_ao:resolve(
        {as, dev_gateway, DepRes},
        maps:merge(APICallMsg, #{<<"path">> => <<"api_call">>}),
        Opts
    ),
    ?assertEqual(10, maps:get(<<"charged">>, APIRes)),
    ?assertEqual(90, maps:get(<<"balance">>, APIRes)).

%% Test scheduling via hb_ao:resolve
scheduling_test() ->
    Opts = setup_test_env(),
    Wallet = maps:get(priv_wallet, Opts),
    M1 = #{},

    %% Schedule a task
    SchedMsg = hb_message:commit(#{
        <<"action">> => <<"test-action">>,
        <<"cron">> => <<"0 * * * *">>,
        <<"data">> => #{<<"key">> => <<"value">>}
    }, #{priv_wallet => Wallet}),
    {ok, SchedRes} = hb_ao:resolve(
        {as, dev_gateway, M1},
        maps:merge(SchedMsg, #{<<"path">> => <<"schedule">>}),
        Opts
    ),
    ?assertEqual(<<"scheduled">>, maps:get(<<"status">>, SchedRes)),

    %% List tasks
    {ok, TasksRes} = hb_ao:resolve(
        {as, dev_gateway, SchedRes},
        maps:merge(SchedMsg, #{<<"path">> => <<"tasks">>}),
        Opts
    ),
    ?assertEqual(1, maps:get(<<"count">>, TasksRes)).

%% Test routing via hb_ao:resolve
routing_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Add route
    {ok, AddRes} = hb_ao:resolve(
        {as, dev_gateway, M1},
        #{
            <<"path">> => <<"add_route">>,
            <<"template">> => <<"/api/users/*">>,
            <<"node">> => #{<<"prefix">> => <<"http://backend:8080">>}
        },
        Opts
    ),
    ?assertEqual(<<"added">>, maps:get(<<"status">>, AddRes)),

    %% List routes
    {ok, RoutesRes} = hb_ao:resolve(
        {as, dev_gateway, AddRes},
        #{<<"path">> => <<"routes">>},
        Opts
    ),
    ?assertEqual(1, maps:get(<<"count">>, RoutesRes)).

-endif.
