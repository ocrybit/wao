-module(dev_hbsig).
-export([info/1, json_to_erl/3, to_erl/2, to_str/1, structured_from/3, structured_to/3, httpsig_from/3, httpsig_to/3, msg2/3, flat_from/3, flat_to/3]).
-include_lib("eunit/include/eunit.hrl").
-include("include/hb.hrl").

info(_Msg) ->
    #{
        exports => [<<"json_to_erl">>, <<"structured_from">>, <<"structured_to">>, <<"httpsig_from">>, <<"httpsig_to">>, <<"flat_from">>, <<"flat_to">>, <<"msg2">>]
    }.

to_erl(Msg, Opts) ->
    %% Try to get body from "json-body" header (used to avoid httpsig special handling)
    %% or fall back to "body" for backward compatibility
    JSON = case hb_maps:get(<<"json-body">>, Msg, not_found, Opts) of
        not_found -> hb_maps:get(<<"body">>, Msg, <<>>, Opts);
        Val -> Val
    end,
    Data = case JSON of
        <<>> -> #{};
        _ ->
            %% Use simple json:decode - process_json_data handles our annotations
            json:decode(JSON)
    end,
    %% Convert boolean types to atom types (Erlang codec doesn't have boolean handler)
    Data1 = process_json_data(Data),
    convert_boolean_types(Data1).

%% Convert "boolean" type annotations to "atom" and ?1/?0 to "true"/"false"
%% This is needed because Erlang's codec uses "atom" for true/false values
%% and ?1/?0 are structured field booleans which don't work with atom decoder
convert_boolean_types(Map) when is_map(Map) ->
    %% Convert all values: ?1/?0 to true/false, recursively process maps,
    %% and convert (ao-type-boolean) to (ao-type-atom) in strings
    Map1 = maps:map(
        fun(_K, <<"?1">>) -> <<"true">>;
           (_K, <<"?0">>) -> <<"false">>;
           (_K, V) when is_map(V) -> convert_boolean_types(V);
           (_K, V) when is_binary(V) -> convert_boolean_in_string(V);
           (_K, V) -> V
        end, Map),
    %% Then convert "boolean" type to "atom" in ao-types
    case maps:get(<<"ao-types">>, Map1, undefined) of
        undefined ->
            Map1;
        AoTypes when is_binary(AoTypes) ->
            NewAoTypes = binary:replace(AoTypes, <<"\"boolean\"">>, <<"\"atom\"">>, [global]),
            Map1#{<<"ao-types">> => NewAoTypes};
        _ ->
            Map1
    end;
convert_boolean_types(Other) ->
    Other.

%% Convert (ao-type-boolean) to (ao-type-atom) in list string values
%% Also convert ?1 to true and ?0 to false within the string
convert_boolean_in_string(Bin) ->
    %% Replace (ao-type-boolean) with (ao-type-atom)
    Bin1 = binary:replace(Bin, <<"(ao-type-boolean)">>, <<"(ao-type-atom)">>, [global]),
    %% Replace boolean values ?1 and ?0 with true and false in atom context
    Bin2 = binary:replace(Bin1, <<"(ao-type-atom) ?1">>, <<"(ao-type-atom) true">>, [global]),
    binary:replace(Bin2, <<"(ao-type-atom) ?0">>, <<"(ao-type-atom) false">>, [global]).

%% Return both raw term and formatted string representation
to_str(Obj) ->
    RawRepr = iolist_to_binary(format_term_raw(Obj)),
    FormattedRepr = iolist_to_binary(format_term_utf8_safe(Obj)),
    iolist_to_binary([
        <<"#erl_response{raw=">>,
        RawRepr,
        <<",formatted=">>,
        FormattedRepr,
        <<"}">>
    ]).

%% Format term for raw output, preserving string literals
format_term_raw(Map) when is_map(Map) ->
    Items = maps:fold(fun(K, V, Acc) ->
        FormattedK = format_term_raw(K),
        FormattedV = format_term_raw(V),
        [[FormattedK, " => ", FormattedV] | Acc]
    end, [], Map),
    ["#{", lists:join(",", lists:reverse(Items)), "}"];
format_term_raw(List) when is_list(List) ->
    Items = [format_term_raw(Item) || Item <- List],
    ["[", lists:join(",", Items), "]"];
format_term_raw(Bin) when is_binary(Bin) ->
    ["<<\"", escape_binary_string(Bin), "\">>"];
format_term_raw(Atom) when is_atom(Atom) ->
    atom_to_list(Atom);
format_term_raw(Int) when is_integer(Int) ->
    integer_to_list(Int);
format_term_raw(Float) when is_float(Float) ->
    io_lib:format("~p", [Float]);
format_term_raw(Other) ->
    io_lib:format("~p", [Other]).

%% Escape binary content for string representation
escape_binary_string(Bin) ->
    escape_binary_string(Bin, []).

escape_binary_string(<<>>, Acc) ->
    lists:reverse(Acc);
escape_binary_string(<<$", Rest/binary>>, Acc) ->
    escape_binary_string(Rest, [$", $\\ | Acc]);
escape_binary_string(<<$\\, Rest/binary>>, Acc) ->
    escape_binary_string(Rest, [$\\, $\\ | Acc]);
escape_binary_string(<<$\n, Rest/binary>>, Acc) ->
    escape_binary_string(Rest, [$n, $\\ | Acc]);
escape_binary_string(<<$\r, Rest/binary>>, Acc) ->
    escape_binary_string(Rest, [$r, $\\ | Acc]);
escape_binary_string(<<$\t, Rest/binary>>, Acc) ->
    escape_binary_string(Rest, [$t, $\\ | Acc]);
escape_binary_string(<<C, Rest/binary>>, Acc) when C >= 32, C =< 126 ->
    escape_binary_string(Rest, [C | Acc]);
escape_binary_string(<<C, Rest/binary>>, Acc) ->
    Escaped = io_lib:format("\\~3.8.0B", [C]),
    escape_binary_string(Rest, lists:reverse(Escaped) ++ Acc).

json_to_erl(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    Result = to_str(Data),
    {ok, Result}.

%% Format term with UTF-8 safe binary representation
format_term_utf8_safe(Map) when is_map(Map) ->
    Items = maps:fold(fun(K, V, Acc) ->
        FormattedK = format_term_utf8_safe(K),
        FormattedV = format_term_utf8_safe(V),
        [[FormattedK, " => ", FormattedV] | Acc]
    end, [], Map),
    ["#{", lists:join(",", lists:reverse(Items)), "}"];
format_term_utf8_safe(List) when is_list(List) ->
    Items = [format_term_utf8_safe(Item) || Item <- List],
    ["[", lists:join(",", Items), "]"];
format_term_utf8_safe(Bin) when is_binary(Bin) ->
    ByteList = binary_to_list(Bin),
    ["<<", lists:join(",", [integer_to_list(B) || B <- ByteList]), ">>"];
format_term_utf8_safe(Atom) when is_atom(Atom) ->
    atom_to_list(Atom);
format_term_utf8_safe(Int) when is_integer(Int) ->
    integer_to_list(Int);
format_term_utf8_safe(Float) when is_float(Float) ->
    io_lib:format("~p", [Float]);
format_term_utf8_safe(Other) ->
    io_lib:format("~p", [Other]).

%% Process JSON data - transform structured fields and $empty
process_json_data(Map) when is_map(Map) ->
    case maps:get(<<"$empty">>, Map, undefined) of
        <<"binary">> -> <<>>;
        <<"list">> -> [];
        <<"map">> -> #{};
        undefined ->
            maps:map(fun(_K, V) -> process_json_data(V) end, Map);
        _Other ->
            maps:map(fun(_K, V) -> process_json_data(V) end, Map)
    end;
process_json_data(List) when is_list(List) ->
    [process_json_data(Item) || Item <- List];
process_json_data(Value) when is_binary(Value) ->
    case Value of
        <<$:, Rest/binary>> when byte_size(Rest) > 0 ->
            case binary:last(Value) of
                $: ->
                    Base64Len = byte_size(Value) - 2,
                    <<$:, Base64:Base64Len/binary, $:>> = Value,
                    case Base64 of
                        <<>> -> <<>>;
                        _ ->
                            try base64:decode(Base64)
                            catch _:_ -> Value
                            end
                    end;
                _ -> Value
            end;
        <<$%, Rest/binary>> when byte_size(Rest) > 0 ->
            case binary:last(Value) of
                $% ->
                    TokenLen = byte_size(Value) - 2,
                    <<$%, Token:TokenLen/binary, $%>> = Value,
                    binary_to_atom(Token, utf8);
                _ -> Value
            end;
        _ -> Value
    end;
process_json_data(Other) -> Other.

%% Simple wrappers that call standard codec devices
%% Use bundle=>true to disable linkification (keeps nested structures inline)
%% Note: Erlang codec naming is opposite to JS convention:
%%   Erlang from = rich→TABM (encode), Erlang to = TABM→rich (decode)
%%   JS structured_from = TABM→rich (decode), JS structured_to = rich→TABM (encode)
%% So we swap: structured_from endpoint calls to(), structured_to endpoint calls from()
structured_from(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    {ok, OBJ} = dev_codec_structured:to(Data, #{<<"bundle">> => true}, Opts),
    %% Post-process to convert numbered maps to lists (beta3 codec doesn't do this automatically)
    OBJ2 = convert_numbered_maps_to_lists(OBJ),
    Result = to_str(OBJ2),
    {ok, Result}.

%% Convert numbered maps to lists recursively
%% A numbered map has keys like <<"1">>, <<"2">>, etc.
convert_numbered_maps_to_lists(Map) when is_map(Map) ->
    %% First, recursively process all values
    Map1 = maps:map(fun(_K, V) -> convert_numbered_maps_to_lists(V) end, Map),
    %% Check if this map is a numbered map (all keys are numeric strings)
    Keys = maps:keys(Map1),
    NumericKeys = lists:filter(fun is_numeric_key/1, Keys),
    case length(NumericKeys) > 0 andalso length(NumericKeys) == length(Keys) of
        true ->
            %% All keys are numeric - convert to list
            SortedKeys = lists:sort(fun(A, B) ->
                binary_to_integer(A) < binary_to_integer(B)
            end, NumericKeys),
            [maps:get(K, Map1) || K <- SortedKeys];
        false ->
            Map1
    end;
convert_numbered_maps_to_lists(List) when is_list(List) ->
    [convert_numbered_maps_to_lists(Item) || Item <- List];
convert_numbered_maps_to_lists(Other) ->
    Other.

%% Check if a key is a numeric string like <<"1">>, <<"2">>, etc.
is_numeric_key(Key) when is_binary(Key) ->
    try
        _ = binary_to_integer(Key),
        true
    catch _:_ ->
        false
    end;
is_numeric_key(_) ->
    false.

structured_to(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    {ok, OBJ} = dev_codec_structured:from(Data, #{<<"bundle">> => true}, Opts),
    Result = to_str(OBJ),
    {ok, Result}.

httpsig_from(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    {ok, OBJ} = dev_codec_httpsig:to(Data, #{<<"bundle">> => true}, Opts),
    %% Post-process to convert numbered maps to lists
    OBJ2 = convert_numbered_maps_to_lists(OBJ),
    Result = to_str(OBJ2),
    {ok, Result}.

httpsig_to(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    {ok, OBJ} = dev_codec_httpsig:from(Data, #{<<"bundle">> => true}, Opts),
    Result = to_str(OBJ),
    {ok, Result}.

flat_from(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    {ok, OBJ} = dev_codec_flat:to(Data, #{<<"bundle">> => true}, Opts),
    %% Post-process to convert numbered maps to lists
    OBJ2 = convert_numbered_maps_to_lists(OBJ),
    Result = to_str(OBJ2),
    {ok, Result}.

flat_to(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    {ok, OBJ} = dev_codec_flat:from(Data, #{<<"bundle">> => true}, Opts),
    Result = to_str(OBJ),
    {ok, Result}.

msg2(_Msg1, Msg2, _Opts) ->
    Result = to_str(Msg2),
    {ok, Result}.
