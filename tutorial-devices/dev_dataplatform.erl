%%%-------------------------------------------------------------------
%%% @doc Decentralized Data Platform Device
%%%
%%% Data storage with bundle creation and distributed queries.
%%%
%%% @end
%%%-------------------------------------------------------------------
-module(dev_dataplatform).
-export([info/3]).

%% Upload operations
-export([upload/3, upload_status/3]).

%% Query operations
-export([query/3, query_by_tags/3]).

%% Bundle operations
-export([create_bundle/3, verify_bundle/3]).

%% Node management
-export([nodes/3, add_node/3, remove_node/3]).

-include("include/hb.hrl").

-define(ITEMS_KEY, <<"platform-items">>).
-define(INDEX_KEY, <<"platform-index">>).
-define(STATUS_KEY, <<"platform-status">>).
-define(BUNDLES_KEY, <<"platform-bundles">>).
-define(NODES_KEY, <<"platform-nodes">>).

%%====================================================================
%% Device Info
%%====================================================================

info(_M1, _M2, _Opts) ->
    {ok, #{
        <<"name">> => <<"dataplatform">>,
        <<"version">> => <<"1.0">>,
        <<"description">> => <<"Decentralized data storage with Arweave">>,
        <<"exports">> => [
            <<"upload">>, <<"upload_status">>,
            <<"query">>, <<"query_by_tags">>,
            <<"create_bundle">>, <<"verify_bundle">>,
            <<"nodes">>, <<"add_node">>, <<"remove_node">>
        ]
    }}.

%%====================================================================
%% Upload Operations
%%====================================================================

upload(M1, M2, Opts) ->
    Data = maps:get(<<"data">>, M2, not_found),
    Tags = maps:get(<<"tags">>, M2, #{}),

    case Data of
        not_found ->
            {error, #{<<"error">> => <<"data_required">>}};
        _ ->
            %% Create item ID
            ItemId = generate_item_id(Data),

            %% Create item
            Item = #{
                <<"id">> => ItemId,
                <<"data">> => Data,
                <<"tags">> => format_tags(Tags),
                <<"created">> => erlang:system_time(second)
            },

            %% Store item
            M1Updated = store_item(M1, ItemId, Item),

            %% Update index
            M1Final = update_index(M1Updated, ItemId),

            %% Set upload status
            M1WithStatus = update_status(M1Final, ItemId, <<"uploaded">>),

            {ok, maps:merge(M1WithStatus, #{
                <<"id">> => ItemId,
                <<"status">> => <<"uploaded">>,
                <<"size">> => byte_size(Data)
            })}
    end.

upload_status(M1, M2, _Opts) ->
    ItemId = maps:get(<<"id">>, M2, not_found),

    case ItemId of
        not_found ->
            {error, #{<<"error">> => <<"id_required">>}};
        _ ->
            Status = get_status(M1, ItemId),
            {ok, #{
                <<"id">> => ItemId,
                <<"status">> => Status
            }}
    end.

%%====================================================================
%% Query Operations
%%====================================================================

query(M1, M2, _Opts) ->
    ItemId = maps:get(<<"id">>, M2, not_found),

    case ItemId of
        not_found ->
            {error, #{<<"error">> => <<"id_required">>}};
        _ ->
            case get_item(M1, ItemId) of
                {ok, Item} ->
                    {ok, #{
                        <<"id">> => ItemId,
                        <<"data">> => maps:get(<<"data">>, Item, <<>>),
                        <<"tags">> => maps:get(<<"tags">>, Item, [])
                    }};
                not_found ->
                    {error, #{<<"error">> => <<"not_found">>}}
            end
    end.

query_by_tags(M1, M2, _Opts) ->
    QueryTags = maps:get(<<"tags">>, M2, #{}),
    Limit = maps:get(<<"limit">>, M2, 100),

    %% Get all item IDs
    Index = get_index(M1),

    %% Filter by tags
    Matches = lists:filtermap(fun(ItemId) ->
        case get_item(M1, ItemId) of
            {ok, Item} ->
                ItemTags = maps:get(<<"tags">>, Item, []),
                case matches_tags(ItemTags, QueryTags) of
                    true -> {true, #{
                        <<"id">> => ItemId,
                        <<"tags">> => ItemTags
                    }};
                    false -> false
                end;
            _ ->
                false
        end
    end, Index),

    %% Apply limit
    Limited = lists:sublist(Matches, Limit),

    {ok, #{
        <<"results">> => Limited,
        <<"total">> => length(Matches),
        <<"returned">> => length(Limited)
    }}.

%%====================================================================
%% Bundle Operations
%%====================================================================

create_bundle(M1, M2, _Opts) ->
    Items = maps:get(<<"items">>, M2, not_found),

    case Items of
        not_found ->
            {error, #{<<"error">> => <<"items_required">>}};
        _ when is_list(Items) ->
            %% Create items with IDs
            ItemsWithIds = lists:map(fun(ItemSpec) ->
                Data = maps:get(<<"data">>, ItemSpec, <<>>),
                Tags = maps:get(<<"tags">>, ItemSpec, #{}),
                ItemId = generate_item_id(Data),
                #{
                    <<"id">> => ItemId,
                    <<"data">> => Data,
                    <<"tags">> => format_tags(Tags),
                    <<"signature">> => generate_signature(Data)
                }
            end, Items),

            %% Create bundle
            BundleId = generate_bundle_id(ItemsWithIds),
            Bundle = #{
                <<"id">> => BundleId,
                <<"items">> => ItemsWithIds,
                <<"created">> => erlang:system_time(second)
            },

            %% Store bundle
            M1Updated = store_bundle(M1, BundleId, Bundle),

            {ok, maps:merge(M1Updated, #{
                <<"bundle_id">> => BundleId,
                <<"item_count">> => length(ItemsWithIds),
                <<"item_ids">> => [maps:get(<<"id">>, I) || I <- ItemsWithIds]
            })};
        _ ->
            {error, #{<<"error">> => <<"items_must_be_list">>}}
    end.

verify_bundle(M1, M2, _Opts) ->
    BundleId = maps:get(<<"bundle_id">>, M2, not_found),

    case BundleId of
        not_found ->
            {error, #{<<"error">> => <<"bundle_id_required">>}};
        _ ->
            case get_bundle(M1, BundleId) of
                {ok, Bundle} ->
                    Items = maps:get(<<"items">>, Bundle, []),
                    %% Check all items have signatures
                    AllValid = lists:all(fun(Item) ->
                        maps:is_key(<<"signature">>, Item)
                    end, Items),

                    {ok, #{
                        <<"valid">> => AllValid,
                        <<"item_count">> => length(Items)
                    }};
                not_found ->
                    {error, #{<<"error">> => <<"bundle_not_found">>}}
            end
    end.

%%====================================================================
%% Node Management
%%====================================================================

nodes(M1, _M2, _Opts) ->
    NodeList = get_nodes(M1),
    {ok, #{<<"nodes">> => NodeList, <<"count">> => length(NodeList)}}.

add_node(M1, M2, _Opts) ->
    NodeUrl = maps:get(<<"url">>, M2, not_found),

    case NodeUrl of
        not_found ->
            {error, #{<<"error">> => <<"url_required">>}};
        _ ->
            NodeList = get_nodes(M1),
            case lists:member(NodeUrl, NodeList) of
                true ->
                    {ok, #{<<"message">> => <<"node_already_exists">>}};
                false ->
                    NewNodes = [NodeUrl | NodeList],
                    M1Updated = save_nodes(M1, NewNodes),
                    {ok, maps:merge(M1Updated, #{
                        <<"message">> => <<"node_added">>,
                        <<"url">> => NodeUrl
                    })}
            end
    end.

remove_node(M1, M2, _Opts) ->
    NodeUrl = maps:get(<<"url">>, M2, not_found),

    case NodeUrl of
        not_found ->
            {error, #{<<"error">> => <<"url_required">>}};
        _ ->
            NodeList = get_nodes(M1),
            NewNodes = lists:delete(NodeUrl, NodeList),
            M1Updated = save_nodes(M1, NewNodes),
            {ok, maps:merge(M1Updated, #{
                <<"message">> => <<"node_removed">>,
                <<"url">> => NodeUrl
            })}
    end.

%%====================================================================
%% Internal Functions
%%====================================================================

generate_item_id(Data) ->
    Hash = crypto:hash(sha256, Data),
    hb_util:encode(Hash).

generate_bundle_id(Items) ->
    Serialized = term_to_binary(Items),
    Hash = crypto:hash(sha256, Serialized),
    hb_util:encode(Hash).

generate_signature(Data) ->
    %% Simplified signature for demo
    Hash = crypto:hash(sha256, Data),
    hb_util:encode(Hash).

format_tags(Tags) when is_map(Tags) ->
    maps:fold(fun(Name, Value, Acc) ->
        [#{<<"name">> => to_binary(Name),
           <<"value">> => to_binary(Value)} | Acc]
    end, [], Tags);
format_tags(Tags) when is_list(Tags) ->
    Tags.

to_binary(V) when is_binary(V) -> V;
to_binary(V) when is_list(V) -> list_to_binary(V);
to_binary(V) when is_atom(V) -> atom_to_binary(V, utf8);
to_binary(V) when is_integer(V) -> integer_to_binary(V).

%% Storage helpers using priv map
store_item(M1, ItemId, Item) ->
    Items = load_priv(M1, ?ITEMS_KEY, #{}),
    NewItems = maps:put(ItemId, Item, Items),
    save_priv(M1, ?ITEMS_KEY, NewItems).

get_item(M1, ItemId) ->
    Items = load_priv(M1, ?ITEMS_KEY, #{}),
    case maps:get(ItemId, Items, not_found) of
        not_found -> not_found;
        Item -> {ok, Item}
    end.

update_index(M1, ItemId) ->
    Index = get_index(M1),
    case lists:member(ItemId, Index) of
        true -> M1;
        false -> save_priv(M1, ?INDEX_KEY, [ItemId | Index])
    end.

get_index(M1) ->
    load_priv(M1, ?INDEX_KEY, []).

update_status(M1, ItemId, Status) ->
    StatusMap = load_priv(M1, ?STATUS_KEY, #{}),
    NewStatus = maps:put(ItemId, Status, StatusMap),
    save_priv(M1, ?STATUS_KEY, NewStatus).

get_status(M1, ItemId) ->
    StatusMap = load_priv(M1, ?STATUS_KEY, #{}),
    maps:get(ItemId, StatusMap, <<"unknown">>).

store_bundle(M1, BundleId, Bundle) ->
    Bundles = load_priv(M1, ?BUNDLES_KEY, #{}),
    NewBundles = maps:put(BundleId, Bundle, Bundles),
    save_priv(M1, ?BUNDLES_KEY, NewBundles).

get_bundle(M1, BundleId) ->
    Bundles = load_priv(M1, ?BUNDLES_KEY, #{}),
    case maps:get(BundleId, Bundles, not_found) of
        not_found -> not_found;
        Bundle -> {ok, Bundle}
    end.

get_nodes(M1) ->
    load_priv(M1, ?NODES_KEY, []).

save_nodes(M1, Nodes) ->
    save_priv(M1, ?NODES_KEY, Nodes).

load_priv(M1, Key, Default) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{Key := Data} -> Data;
        _ -> Default
    end.

save_priv(M1, Key, Data) ->
    Priv = maps:get(<<"priv">>, M1, #{}),
    M1#{<<"priv">> => Priv#{Key => Data}}.

matches_tags(ItemTags, QueryTags) when is_map(QueryTags) ->
    maps:fold(fun(Name, Value, Acc) ->
        Acc andalso has_tag(ItemTags, Name, Value)
    end, true, QueryTags);
matches_tags(_ItemTags, _) ->
    true.

has_tag(Tags, Name, Value) ->
    lists:any(fun(Tag) ->
        maps:get(<<"name">>, Tag, <<>>) =:= Name andalso
        maps:get(<<"value">>, Tag, <<>>) =:= Value
    end, Tags).

%%====================================================================
%% Tests - Using hb_ao:resolve with {as, Module, Msg} pattern
%% Following L4 tutorial pattern from docs/pages/book/build4.mdx
%%====================================================================

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").

%% Test device info via hb_ao:resolve
info_test() ->
    application:ensure_all_started(hb),
    {ok, Info} = hb_ao:resolve(
        {as, dev_dataplatform, #{}},
        #{<<"path">> => <<"info">>},
        #{}
    ),
    ?assertEqual(<<"dataplatform">>, maps:get(<<"name">>, Info)).

%% Test upload via hb_ao:resolve
upload_test() ->
    application:ensure_all_started(hb),
    M1 = #{},
    {ok, Result} = hb_ao:resolve(
        {as, dev_dataplatform, M1},
        #{
            <<"path">> => <<"upload">>,
            <<"data">> => <<"Hello Arweave">>,
            <<"tags">> => #{<<"Content-Type">> => <<"text/plain">>}
        },
        #{}
    ),
    ?assertMatch(#{<<"id">> := _, <<"status">> := <<"uploaded">>}, Result).

%% Test upload missing data via hb_ao:resolve
upload_missing_data_test() ->
    application:ensure_all_started(hb),
    M1 = #{},
    {error, #{<<"error">> := <<"data_required">>}} = hb_ao:resolve(
        {as, dev_dataplatform, M1},
        #{<<"path">> => <<"upload">>},
        #{}
    ).

%% Test query via hb_ao:resolve
query_test() ->
    application:ensure_all_started(hb),
    M1 = #{},
    %% First upload
    {ok, UploadRes} = hb_ao:resolve(
        {as, dev_dataplatform, M1},
        #{<<"path">> => <<"upload">>, <<"data">> => <<"Test data">>},
        #{}
    ),
    ItemId = maps:get(<<"id">>, UploadRes),

    %% Then query
    {ok, QueryRes} = hb_ao:resolve(
        {as, dev_dataplatform, UploadRes},
        #{<<"path">> => <<"query">>, <<"id">> => ItemId},
        #{}
    ),
    ?assertEqual(ItemId, maps:get(<<"id">>, QueryRes)),
    ?assertEqual(<<"Test data">>, maps:get(<<"data">>, QueryRes)).

%% Test query by tags via hb_ao:resolve
query_by_tags_test() ->
    application:ensure_all_started(hb),
    M1 = #{},
    %% Upload with tags
    {ok, M2} = hb_ao:resolve(
        {as, dev_dataplatform, M1},
        #{
            <<"path">> => <<"upload">>,
            <<"data">> => <<"Tagged data">>,
            <<"tags">> => #{<<"category">> => <<"test">>}
        },
        #{}
    ),

    %% Query by tags
    {ok, Result} = hb_ao:resolve(
        {as, dev_dataplatform, M2},
        #{
            <<"path">> => <<"query_by_tags">>,
            <<"tags">> => #{<<"category">> => <<"test">>}
        },
        #{}
    ),
    ?assertEqual(1, maps:get(<<"total">>, Result)).

%% Test bundle creation via hb_ao:resolve
create_bundle_test() ->
    application:ensure_all_started(hb),
    M1 = #{},
    {ok, Result} = hb_ao:resolve(
        {as, dev_dataplatform, M1},
        #{
            <<"path">> => <<"create_bundle">>,
            <<"items">> => [
                #{<<"data">> => <<"Item 1">>, <<"tags">> => #{}},
                #{<<"data">> => <<"Item 2">>, <<"tags">> => #{}}
            ]
        },
        #{}
    ),
    ?assertEqual(2, maps:get(<<"item_count">>, Result)),
    ?assertMatch(#{<<"bundle_id">> := _}, Result).

%% Test bundle verification via hb_ao:resolve
verify_bundle_test() ->
    application:ensure_all_started(hb),
    M1 = #{},
    %% Create bundle
    {ok, CreateRes} = hb_ao:resolve(
        {as, dev_dataplatform, M1},
        #{
            <<"path">> => <<"create_bundle">>,
            <<"items">> => [
                #{<<"data">> => <<"Item A">>},
                #{<<"data">> => <<"Item B">>}
            ]
        },
        #{}
    ),
    BundleId = maps:get(<<"bundle_id">>, CreateRes),

    %% Verify bundle
    {ok, VerifyRes} = hb_ao:resolve(
        {as, dev_dataplatform, CreateRes},
        #{<<"path">> => <<"verify_bundle">>, <<"bundle_id">> => BundleId},
        #{}
    ),
    ?assertEqual(true, maps:get(<<"valid">>, VerifyRes)),
    ?assertEqual(2, maps:get(<<"item_count">>, VerifyRes)).

%% Test node management via hb_ao:resolve
node_management_test() ->
    application:ensure_all_started(hb),
    M1 = #{},

    %% Initially empty
    {ok, NodesRes1} = hb_ao:resolve(
        {as, dev_dataplatform, M1},
        #{<<"path">> => <<"nodes">>},
        #{}
    ),
    ?assertEqual(0, maps:get(<<"count">>, NodesRes1)),

    %% Add node
    {ok, AddRes} = hb_ao:resolve(
        {as, dev_dataplatform, M1},
        #{<<"path">> => <<"add_node">>, <<"url">> => <<"http://node1.example">>},
        #{}
    ),
    ?assertEqual(<<"node_added">>, maps:get(<<"message">>, AddRes)),

    %% List nodes
    {ok, NodesRes2} = hb_ao:resolve(
        {as, dev_dataplatform, AddRes},
        #{<<"path">> => <<"nodes">>},
        #{}
    ),
    ?assertEqual(1, maps:get(<<"count">>, NodesRes2)),

    %% Remove node
    {ok, RemoveRes} = hb_ao:resolve(
        {as, dev_dataplatform, AddRes},
        #{<<"path">> => <<"remove_node">>, <<"url">> => <<"http://node1.example">>},
        #{}
    ),
    ?assertEqual(<<"node_removed">>, maps:get(<<"message">>, RemoveRes)),

    %% Verify removed
    {ok, NodesRes3} = hb_ao:resolve(
        {as, dev_dataplatform, RemoveRes},
        #{<<"path">> => <<"nodes">>},
        #{}
    ),
    ?assertEqual(0, maps:get(<<"count">>, NodesRes3)).

-endif.
