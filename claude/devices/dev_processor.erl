%%%-------------------------------------------------------------------
%%% @doc Data Processor Device
%%%
%%% Format conversion, signing, and name resolution.
%%%
%%% API:
%%%   POST /~processor@1.0/encode?format=json    Encode to format
%%%   POST /~processor@1.0/decode?format=json    Decode from format
%%%   POST /~processor@1.0/convert?from=X&to=Y   Convert between formats
%%%   POST /~processor@1.0/sign                  Sign message
%%%   POST /~processor@1.0/verify                Verify signatures
%%%   POST /~processor@1.0/normalize             Normalize to links
%%%   POST /~processor@1.0/expand                Expand links
%%%   POST /~processor@1.0/register?name=X       Register name
%%%   GET  /~processor@1.0/lookup?name=X         Lookup name
%%%
%%% @end
%%%-------------------------------------------------------------------
-module(dev_processor).
-export([
    info/3,
    encode/3, decode/3, convert/3,
    sign/3, verify/3,
    normalize/3, expand/3,
    register_name/3, lookup/3
]).
-include("include/hb.hrl").

-define(NAMES_KEY, <<"processor-names-id">>).

%%====================================================================
%% Device Info
%%====================================================================

info(_M1, _M2, _Opts) ->
    {ok, #{
        <<"name">> => <<"processor">>,
        <<"version">> => <<"1.0">>,
        <<"description">> => <<"Data Processor with Codecs & Signatures">>,
        <<"endpoints">> => [
            <<"encode">>, <<"decode">>, <<"convert">>,
            <<"sign">>, <<"verify">>,
            <<"normalize">>, <<"expand">>,
            <<"register">>, <<"lookup">>
        ]
    }}.

%%====================================================================
%% Encoding/Decoding
%%====================================================================

encode(_M1, M2, Opts) ->
    Format = maps:get(<<"format">>, M2, <<"json">>),
    Body = maps:get(<<"body">>, M2, #{}),

    Result = case Format of
        <<"json">> ->
            case dev_codec_json:to(Body, #{}, Opts) of
                {ok, E} -> {ok, E};
                _ -> {error, <<"JSON encoding failed">>}
            end;
        <<"structured">> ->
            {ok, hb_message:convert(Body, <<"structured@1.0">>, Opts)};
        <<"flat">> ->
            case dev_codec_flat:to(Body, #{}, Opts) of
                {ok, E} -> {ok, E};
                _ -> {error, <<"Flat encoding failed">>}
            end;
        _ ->
            {error, <<"Unknown format">>}
    end,

    case Result of
        {ok, Encoded} ->
            {ok, #{<<"encoded">> => Encoded, <<"format">> => Format}};
        {error, Reason} ->
            {error, #{<<"status">> => 400, <<"error">> => Reason}}
    end.

decode(_M1, M2, Opts) ->
    Format = maps:get(<<"format">>, M2, <<"json">>),
    Body = maps:get(<<"body">>, M2, <<>>),

    Result = case Format of
        <<"json">> ->
            case dev_codec_json:from(Body, #{}, Opts) of
                {ok, D} -> {ok, D};
                _ -> {error, <<"JSON decoding failed">>}
            end;
        <<"structured">> ->
            {ok, hb_message:convert(Body, tabm, <<"structured@1.0">>, Opts)};
        <<"flat">> ->
            case dev_codec_flat:from(Body, #{}, Opts) of
                {ok, D} -> {ok, D};
                _ -> {error, <<"Flat decoding failed">>}
            end;
        _ ->
            {error, <<"Unknown format">>}
    end,

    case Result of
        {ok, Decoded} ->
            {ok, #{<<"decoded">> => Decoded, <<"format">> => Format}};
        {error, Reason} ->
            {error, #{<<"status">> => 400, <<"error">> => Reason}}
    end.

convert(_M1, M2, Opts) ->
    FromFormat = maps:get(<<"from">>, M2, <<"flat">>),
    ToFormat = maps:get(<<"to">>, M2, <<"structured">>),
    Body = maps:get(<<"body">>, M2, #{}),

    %% Decode from source
    Decoded = case FromFormat of
        <<"json">> ->
            case dev_codec_json:from(Body, #{}, Opts) of
                {ok, D} -> D;
                _ -> Body
            end;
        <<"flat">> ->
            case dev_codec_flat:from(Body, #{}, Opts) of
                {ok, D} -> D;
                _ -> Body
            end;
        _ -> Body
    end,

    %% Encode to target
    Encoded = case ToFormat of
        <<"json">> ->
            case dev_codec_json:to(Decoded, #{}, Opts) of
                {ok, E} -> E;
                _ -> Decoded
            end;
        <<"flat">> ->
            case dev_codec_flat:to(Decoded, #{}, Opts) of
                {ok, E} -> E;
                _ -> Decoded
            end;
        <<"structured">> ->
            hb_message:convert(Decoded, <<"structured@1.0">>, Opts);
        _ -> Decoded
    end,

    {ok, #{
        <<"converted">> => Encoded,
        <<"from">> => FromFormat,
        <<"to">> => ToFormat
    }}.

%%====================================================================
%% Signing/Verification
%%====================================================================

sign(_M1, M2, Opts) ->
    Body = maps:get(<<"body">>, M2, #{}),
    Wallet = hb_opts:get(priv_wallet, no_wallet, Opts),

    case Wallet of
        no_wallet ->
            {error, #{<<"status">> => 500, <<"error">> => <<"No wallet">>}};
        _ ->
            SignedMsg = hb_message:commit(Body, #{priv_wallet => Wallet}),
            Signers = hb_message:signers(SignedMsg, Opts),
            ID = hb_message:id(SignedMsg, signed, Opts),

            {ok, #{
                <<"signed">> => SignedMsg,
                <<"signer">> => hd(Signers),
                <<"id">> => hb_util:human_id(ID)
            }}
    end.

verify(_M1, M2, Opts) ->
    Body = maps:get(<<"body">>, M2, #{}),

    case maps:is_key(<<"commitments">>, Body) of
        false ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Not signed">>}};
        true ->
            Valid = hb_message:verify(Body, all, Opts),
            Signers = hb_message:signers(Body, Opts),

            {ok, #{
                <<"valid">> => Valid,
                <<"signers">> => Signers,
                <<"signer_count">> => length(Signers)
            }}
    end.

%%====================================================================
%% Link Operations
%%====================================================================

normalize(_M1, M2, Opts) ->
    Body = maps:get(<<"body">>, M2, #{}),
    Normalized = hb_link:normalize(Body, offload, Opts),
    LinkKeys = [K || K <- maps:keys(Normalized), hb_link:is_link_key(K)],

    {ok, #{
        <<"normalized">> => Normalized,
        <<"links_created">> => length(LinkKeys)
    }}.

expand(_M1, M2, Opts) ->
    Body = maps:get(<<"body">>, M2, #{}),
    Decoded = hb_link:decode_all_links(Body),
    Expanded = hb_cache:ensure_all_loaded(Decoded, Opts),

    {ok, #{<<"expanded">> => Expanded}}.

%%====================================================================
%% Name Resolution
%%====================================================================

register_name(M1, M2, Opts) ->
    Name = maps:get(<<"name">>, M2, not_found),
    Value = maps:get(<<"value">>, M2, not_found),

    case {Name, Value} of
        {not_found, _} ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Missing 'name'">>}};
        {_, not_found} ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Missing 'value'">>}};
        {N, V} ->
            State = load_names(M1, Opts),
            NewState = maps:put(N, V, State),
            M1Updated = save_names(M1, NewState, Opts),
            {ok, maps:merge(M1Updated, #{
                <<"registered">> => N,
                <<"value">> => V
            })}
    end.

lookup(M1, M2, Opts) ->
    Name = maps:get(<<"name">>, M2, not_found),

    case Name of
        not_found ->
            {error, #{<<"status">> => 400, <<"error">> => <<"Missing 'name'">>}};
        N ->
            State = load_names(M1, Opts),
            case maps:get(N, State, not_found) of
                not_found ->
                    {error, #{<<"status">> => 404, <<"error">> => <<"Not found">>}};
                Value ->
                    {ok, #{<<"name">> => N, <<"value">> => Value}}
            end
    end.

%%====================================================================
%% Internal Helpers
%%====================================================================

load_names(M1, Opts) ->
    case maps:get(<<"priv">>, M1, #{}) of
        #{?NAMES_KEY := ID} ->
            case hb_cache:read(ID, Opts) of
                {ok, State} -> hb_cache:ensure_all_loaded(State, Opts);
                not_found -> #{}
            end;
        _ ->
            #{}
    end.

save_names(M1, State, Opts) ->
    {ok, ID} = hb_cache:write(State, Opts),
    Priv = maps:get(<<"priv">>, M1, #{}),
    M1#{<<"priv">> => Priv#{?NAMES_KEY => ID}}.

%%====================================================================
%% Tests - Using hb_ao:resolve with {as, Module, Msg} pattern
%% Following L2 tutorial pattern from docs/pages/book/build2.mdx
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
    {ok, Info} = hb_ao:resolve(
        {as, dev_processor, #{}},
        #{<<"path">> => <<"info">>},
        #{}
    ),
    ?assertEqual(<<"processor">>, maps:get(<<"name">>, Info)).

%% Test JSON encoding via hb_ao:resolve
encode_json_test() ->
    application:ensure_all_started(hb),
    {ok, Result} = hb_ao:resolve(
        {as, dev_processor, #{}},
        #{
            <<"path">> => <<"encode">>,
            <<"format">> => <<"json">>,
            <<"body">> => #{<<"key">> => <<"value">>}
        },
        #{}
    ),
    ?assertEqual(<<"json">>, maps:get(<<"format">>, Result)).

%% Test sign and verify via hb_ao:resolve
sign_verify_test() ->
    application:ensure_all_started(hb),
    Wallet = ar_wallet:new(),
    Opts = #{priv_wallet => Wallet},
    Body = #{<<"data">> => <<"test">>},

    %% Sign
    {ok, SignResult} = hb_ao:resolve(
        {as, dev_processor, #{}},
        #{<<"path">> => <<"sign">>, <<"body">> => Body},
        Opts
    ),
    SignedMsg = maps:get(<<"signed">>, SignResult),

    %% Verify
    {ok, VerifyResult} = hb_ao:resolve(
        {as, dev_processor, #{}},
        #{<<"path">> => <<"verify">>, <<"body">> => SignedMsg},
        Opts
    ),
    ?assertEqual(true, maps:get(<<"valid">>, VerifyResult)),
    ?assertEqual(1, maps:get(<<"signer_count">>, VerifyResult)).

%% Test name registration and lookup via hb_ao:resolve
name_resolution_test() ->
    Opts = setup_test_env(),
    M1 = #{},

    %% Register
    {ok, RegResult} = hb_ao:resolve(
        {as, dev_processor, M1},
        #{
            <<"path">> => <<"register_name">>,
            <<"name">> => <<"alice">>,
            <<"value">> => <<"addr123">>
        },
        Opts
    ),
    ?assertEqual(<<"alice">>, maps:get(<<"registered">>, RegResult)),

    %% Lookup
    {ok, LookupResult} = hb_ao:resolve(
        {as, dev_processor, RegResult},
        #{<<"path">> => <<"lookup">>, <<"name">> => <<"alice">>},
        Opts
    ),
    ?assertEqual(<<"addr123">>, maps:get(<<"value">>, LookupResult)).

-endif.
