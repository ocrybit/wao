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
    JSON = case hb_ao:get(<<"json-body">>, Msg, not_found, Opts) of
        not_found -> hb_ao:get(<<"body">>, Msg, <<>>, Opts);
        Val -> Val
    end,
    case JSON of
        <<>> -> #{};
        _ ->
            %% Use simple json:decode - process_json_data handles our annotations
            Data = json:decode(JSON),
            process_json_data(Data)
    end.

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

%% ============================================================================
%% Main codec endpoint functions - use custom JS-compatible implementations
%% ============================================================================

structured_from(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    %% Decode TABM to rich (matches JS structured_from behavior)
    OBJ = js_structured_to(Data),
    Result = to_str(OBJ),
    {ok, Result}.

structured_to(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    io:format("TRACE structured_to Data: ~p~n", [Data]),
    %% Round-trip: encode rich to TABM, then decode TABM to rich
    %% This matches JS: structured_from(structured_to(v))
    Encoded = js_structured_from(Data),
    io:format("TRACE structured_to Encoded: ~p~n", [Encoded]),
    OBJ = js_structured_to(Encoded),
    io:format("TRACE structured_to OBJ: ~p~n", [OBJ]),
    Result = to_str(OBJ),
    {ok, Result}.

httpsig_from(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    %% Decode HTTP message to rich (matches JS httpsig_from behavior)
    %% Use linkify_mode => false to disable linkification
    NoLinkOpts = Opts#{ linkify_mode => false },
    {ok, OBJ} = dev_codec_httpsig:from(Data, #{}, NoLinkOpts),
    Result = to_str(OBJ),
    {ok, Result}.

httpsig_to(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    %% Round-trip: encode rich to HTTP, then decode HTTP to rich
    %% This matches JS: httpsig_from(httpsig_to(v))
    try
        Encoded = js_httpsig_to(Data),
        %% Use dev_codec_httpsig:from to decode back
        NoLinkOpts = Opts#{ linkify_mode => false },
        {ok, OBJ} = dev_codec_httpsig:from(Encoded, #{}, NoLinkOpts),
        Result = to_str(OBJ),
        {ok, Result}
    catch
        Type:Error:Stack ->
            io:format("HTTPSIG_TO ERROR: ~p:~p~nData: ~p~nStack: ~p~n",
                     [Type, Error, Data, Stack]),
            erlang:raise(Type, Error, Stack)
    end.

flat_from(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    %% Decode flat paths to nested (matches JS flat_from behavior)
    OBJ = hbsig_flat_from(Data),
    Result = to_str(OBJ),
    {ok, Result}.

flat_to(_Msg1, Msg2, Opts) ->
    Data = to_erl(Msg2, Opts),
    %% Round-trip: encode nested to flat, then decode flat to nested
    %% This matches JS: flat_from(flat_to(v))
    Encoded = hbsig_flat_to(Data),
    OBJ = hbsig_flat_from(Encoded),
    Result = to_str(OBJ),
    {ok, Result}.

msg2(_Msg1, Msg2, _Opts) ->
    Result = to_str(Msg2),
    {ok, Result}.

%% ============================================================================
%% Custom flat codec implementations
%% ============================================================================

%% Custom flat_from implementation that handles all data types
%% Converts flat paths like <<"a/b/c">> to nested maps
hbsig_flat_from(Bin) when is_binary(Bin) -> Bin;
hbsig_flat_from(Map) when is_map(Map) ->
    maps:fold(
        fun(Path, Value, Acc) ->
            PathParts = path_to_parts(Path),
            inject_at_path(PathParts, Value, Acc)
        end,
        #{},
        Map
    );
hbsig_flat_from(Other) -> Other.

%% Custom flat_to implementation that handles all data types
%% Converts nested maps to flat paths
hbsig_flat_to(Bin) when is_binary(Bin) -> Bin;
hbsig_flat_to(Map) when is_map(Map) ->
    flatten_recursive(Map, [], #{});
hbsig_flat_to(Other) -> Other.

%% Helper: convert path string to parts
path_to_parts(Path) when is_binary(Path) ->
    binary:split(Path, <<"/">>, [global]);
path_to_parts(Path) when is_list(Path) ->
    Path.

%% Helper: inject value at path in nested map
inject_at_path([Key], Value, Map) ->
    case maps:get(Key, Map, undefined) of
        undefined ->
            maps:put(Key, Value, Map);
        Existing when is_map(Existing), is_map(Value) ->
            maps:put(Key, maps:merge(Existing, Value), Map);
        _ ->
            maps:put(Key, Value, Map)
    end;
inject_at_path([Key | Rest], Value, Map) ->
    SubMap = maps:get(Key, Map, #{}),
    NewSubMap = case is_map(SubMap) of
        true -> inject_at_path(Rest, Value, SubMap);
        false -> inject_at_path(Rest, Value, #{})
    end,
    maps:put(Key, NewSubMap, Map).

%% Helper: recursively flatten a map
flatten_recursive(Map, CurrentPath, Result) when is_map(Map) ->
    maps:fold(
        fun(Key, Value, Acc) ->
            NewPath = CurrentPath ++ [Key],
            flatten_recursive(Value, NewPath, Acc)
        end,
        Result,
        Map
    );
flatten_recursive(Value, CurrentPath, Result) ->
    PathKey = path_to_binary(CurrentPath),
    maps:put(PathKey, Value, Result).

%% Helper: convert path parts to binary path
path_to_binary([]) -> <<>>;
path_to_binary([Part]) when is_binary(Part) -> Part;
path_to_binary([Part | Rest]) ->
    RestBin = path_to_binary(Rest),
    <<Part/binary, "/", RestBin/binary>>.

%% ============================================================================
%% JS-compatible structured_from implementation
%% Converts rich message to TABM (Type-Annotated Binary Message)
%% This matches the behavior of structured.js from() function exactly
%% ============================================================================

js_structured_from(Bin) when is_binary(Bin) -> Bin;
js_structured_from(List) when is_list(List) -> List;
js_structured_from(Map) when is_map(Map) ->
    %% Normalize all keys to lowercase
    NormMap = maps:fold(
        fun(K, V, Acc) ->
            NormK = normalize_key(K),
            maps:put(NormK, V, Acc)
        end,
        #{},
        Map
    ),
    %% Get sorted keys
    SortedKeys = lists:sort(maps:keys(NormMap)),
    %% Process each key to build types and values lists
    {Types, Values} = lists:foldl(
        fun(Key, {TypesAcc, ValuesAcc}) ->
            Value = maps:get(Key, NormMap),
            classify_for_tabm(Key, Value, TypesAcc, ValuesAcc)
        end,
        {[], []},
        SortedKeys
    ),
    %% Build result: first add ao-types, then add values (values can overwrite ao-types)
    Result0 = case lists:reverse(Types) of
        [] -> #{};
        TypesList ->
            AoTypesStr = build_ao_types_str(TypesList),
            #{ <<"ao-types">> => AoTypesStr }
    end,
    %% Add values (this can overwrite ao-types if input had ao-types key)
    lists:foldl(
        fun({K, V}, Acc) -> maps:put(K, V, Acc) end,
        Result0,
        lists:reverse(Values)
    );
js_structured_from(Other) -> Other.

%% Classify a value for TABM encoding
%% Empty values - match JS behavior (add to values, minimal type annotations)
classify_for_tabm(Key, <<>>, TypesAcc, ValuesAcc) ->
    %% Empty binary - add to values, no type annotation (matches JS)
    {TypesAcc, [{Key, <<>>} | ValuesAcc]};
classify_for_tabm(Key, [], TypesAcc, ValuesAcc) ->
    %% Empty list - add nested object with ao-types (matches JS)
    %% JS adds { "ao-types": '.="list"' } to values
    NestedMap = #{<<"ao-types">> => <<".=\"list\"">>},
    {TypesAcc, [{Key, NestedMap} | ValuesAcc]};
classify_for_tabm(Key, Map, TypesAcc, ValuesAcc) when is_map(Map), map_size(Map) == 0 ->
    %% Empty map - add to values, no type annotation (matches JS)
    {TypesAcc, [{Key, #{}} | ValuesAcc]};
classify_for_tabm(Key, Value, TypesAcc, ValuesAcc) when is_binary(Value) ->
    %% String value - just add to values (no type annotation needed)
    {TypesAcc, [{Key, Value} | ValuesAcc]};
classify_for_tabm(Key, Value, TypesAcc, ValuesAcc) when is_map(Value) ->
    %% Nested map - recursively convert
    Converted = js_structured_from(Value),
    {TypesAcc, [{Key, Converted} | ValuesAcc]};
classify_for_tabm(Key, Value, TypesAcc, ValuesAcc) when is_list(Value), length(Value) > 0 ->
    %% Non-empty list - always convert to numbered map with internal ao-types
    %% JS beta3 behavior: .="list" goes INSIDE the numbered map, NOT in parent ao-types
    NumberedMap = list_to_numbered_map_with_types(Value),
    %% Don't add to TypesAcc - ao-types is inside the map
    {TypesAcc, [{Key, NumberedMap} | ValuesAcc]};
classify_for_tabm(Key, Value, TypesAcc, ValuesAcc) when is_integer(Value) ->
    %% Integer
    {[{Key, <<"integer">>} | TypesAcc], [{Key, integer_to_binary(Value)} | ValuesAcc]};
classify_for_tabm(Key, Value, TypesAcc, ValuesAcc) when is_float(Value) ->
    %% Float - format like JS with exponential notation
    Encoded = format_float_js_style(Value),
    {[{Key, <<"float">>} | TypesAcc], [{Key, Encoded} | ValuesAcc]};
classify_for_tabm(Key, true, TypesAcc, ValuesAcc) ->
    %% Boolean true
    {[{Key, <<"atom">>} | TypesAcc], [{Key, <<"\"true\"">>} | ValuesAcc]};
classify_for_tabm(Key, false, TypesAcc, ValuesAcc) ->
    %% Boolean false
    {[{Key, <<"atom">>} | TypesAcc], [{Key, <<"\"false\"">>} | ValuesAcc]};
classify_for_tabm(Key, null, TypesAcc, ValuesAcc) ->
    %% Null
    {[{Key, <<"atom">>} | TypesAcc], [{Key, <<"\"null\"">>} | ValuesAcc]};
classify_for_tabm(Key, Value, TypesAcc, ValuesAcc) when is_atom(Value) ->
    %% Other atoms
    AtomStr = atom_to_binary(Value, utf8),
    {[{Key, <<"atom">>} | TypesAcc], [{Key, <<"\"", AtomStr/binary, "\"">>} | ValuesAcc]};
classify_for_tabm(_Key, _Value, TypesAcc, ValuesAcc) ->
    %% Unknown type - skip
    {TypesAcc, ValuesAcc}.

%% Build ao-types string from list of {Key, Type} tuples
build_ao_types_str(Types) ->
    Parts = [<<Key/binary, "=\"", Type/binary, "\"">> || {Key, Type} <- Types],
    iolist_to_binary(lists:join(<<", ">>, Parts)).

%% Convert list to numbered map with ao-types inside (matching JS beta3 behavior)
%% JS creates: { "1": "val1", "2": "val2", "ao-types": ".=\"list\", 1=\"integer\", ..." }
list_to_numbered_map_with_types(List) ->
    {Map, ItemTypes, _} = lists:foldl(
        fun(Item, {MapAcc, TypesAcc, Idx}) ->
            Key = integer_to_binary(Idx),
            {EncodedValue, MaybeType} = encode_list_item_for_numbered_map(Item),
            NewTypesAcc = case MaybeType of
                none -> TypesAcc;
                Type -> [{Key, Type} | TypesAcc]
            end,
            {maps:put(Key, EncodedValue, MapAcc), NewTypesAcc, Idx + 1}
        end,
        {#{}, [], 1},
        List
    ),
    %% Build ao-types string: start with .="list", then add item types
    AoTypesParts = [<<".=\"list\"">> | [<<K/binary, "=\"", T/binary, "\"">> || {K, T} <- lists:reverse(ItemTypes)]],
    AoTypesStr = iolist_to_binary(lists:join(<<", ">>, AoTypesParts)),
    maps:put(<<"ao-types">>, AoTypesStr, Map).

%% Encode a list item for numbered map, returning {EncodedValue, Type | none}
encode_list_item_for_numbered_map(Item) when is_binary(Item) ->
    %% String - keep as is, no type annotation
    {Item, none};
encode_list_item_for_numbered_map(Item) when is_integer(Item) ->
    %% Integer - encode as string with type
    {integer_to_binary(Item), <<"integer">>};
encode_list_item_for_numbered_map(Item) when is_float(Item) ->
    %% Float - encode in JS style with type
    {format_float_js_style(Item), <<"float">>};
encode_list_item_for_numbered_map(true) ->
    %% Boolean true - encode as "true" with atom type
    {<<"true">>, <<"atom">>};
encode_list_item_for_numbered_map(false) ->
    %% Boolean false - encode as "false" with atom type
    {<<"false">>, <<"atom">>};
encode_list_item_for_numbered_map(null) ->
    %% Null - encode as "null" with atom type
    {<<"null">>, <<"atom">>};
encode_list_item_for_numbered_map(Item) when is_atom(Item) ->
    %% Other atom
    {atom_to_binary(Item, utf8), <<"atom">>};
encode_list_item_for_numbered_map(Item) when is_map(Item) ->
    %% Nested map - recursively encode
    {js_structured_from(Item), none};
encode_list_item_for_numbered_map(Item) when is_list(Item) ->
    %% Nested list - recursively encode as numbered map with types
    case Item of
        [] ->
            %% Empty list
            {#{<<"ao-types">> => <<".=\"list\"">>}, none};
        _ ->
            {list_to_numbered_map_with_types(Item), none}
    end;
encode_list_item_for_numbered_map(_Item) ->
    %% Unknown type
    {<<>>, none}.

%% Format float in JS exponential style
%% Matches JS: value.toExponential(20) with cleanup
format_float_js_style(Float) ->
    %% Use ~.21e to match JS toExponential(20) (21 gives 20 digits after decimal in Erlang)
    Str = io_lib:format("~.21e", [Float]),
    StrBin = list_to_binary(lists:flatten(Str)),
    %% JS cleanup: remove trailing zeros (but keep at least one after decimal)
    %% and ensure 2-digit exponent
    cleanup_float_format(StrBin).

%% Clean up float format to match JS exactly
cleanup_float_format(Bin) ->
    %% Split on 'e' to separate mantissa and exponent
    case binary:split(Bin, <<"e">>) of
        [Mantissa, Exp] ->
            %% Remove trailing zeros from mantissa (but keep at least one decimal digit)
            CleanMantissa = remove_trailing_zeros(Mantissa),
            %% Ensure 2-digit exponent (e.g., e+0 -> e+00)
            CleanExp = ensure_two_digit_exp(Exp),
            <<CleanMantissa/binary, "e", CleanExp/binary>>;
        [_] ->
            Bin
    end.

%% Remove trailing zeros but keep at least X.0
remove_trailing_zeros(Mantissa) ->
    case binary:match(Mantissa, <<".">>) of
        nomatch -> Mantissa;
        {DotPos, 1} ->
            %% Get the part after the decimal
            AfterDot = binary:part(Mantissa, DotPos + 1, byte_size(Mantissa) - DotPos - 1),
            %% Remove trailing zeros
            Trimmed = remove_trailing_zeros_bin(AfterDot),
            %% Ensure at least one digit after decimal
            FinalAfter = case Trimmed of
                <<>> -> <<"0">>;
                _ -> Trimmed
            end,
            BeforeDot = binary:part(Mantissa, 0, DotPos),
            <<BeforeDot/binary, ".", FinalAfter/binary>>
    end.

remove_trailing_zeros_bin(<<>>) -> <<>>;
remove_trailing_zeros_bin(Bin) ->
    case binary:last(Bin) of
        $0 ->
            Len = byte_size(Bin) - 1,
            remove_trailing_zeros_bin(binary:part(Bin, 0, Len));
        _ ->
            Bin
    end.

%% Ensure exponent has 2 digits (e.g., +0 -> +00, -5 -> -05)
ensure_two_digit_exp(Exp) ->
    case Exp of
        <<Sign, D>> when (Sign == $+ orelse Sign == $-) andalso D >= $0 andalso D =< $9 ->
            <<Sign, $0, D>>;
        _ ->
            Exp
    end.

%% Normalize key to lowercase binary
normalize_key(Key) when is_binary(Key) ->
    %% string:lowercase returns a list, convert back to binary
    unicode:characters_to_binary(string:lowercase(Key));
normalize_key(Key) when is_atom(Key) ->
    unicode:characters_to_binary(string:lowercase(atom_to_binary(Key, utf8)));
normalize_key(Key) when is_list(Key) ->
    unicode:characters_to_binary(string:lowercase(list_to_binary(Key)));
normalize_key(Key) ->
    Key.

%% ============================================================================
%% JS-compatible structured_to implementation
%% Converts TABM (Type-Annotated Binary Message) to rich message
%% This matches the behavior of structured.js to() function exactly
%% ============================================================================

js_structured_to(Bin) when is_binary(Bin) -> Bin;
js_structured_to(List) when is_list(List) -> List;
js_structured_to(Map) when is_map(Map) ->
    %% Parse ao-types if present
    AoTypesStr = maps:get(<<"ao-types">>, Map, <<>>),
    Types = parse_ao_types(AoTypesStr),
    %% Build result - DON'T materialize empty values from ao-types alone (match JS behavior)
    %% Only process actual key-value pairs in the input
    Result = maps:fold(
        fun(RawKey, Value, Acc) ->
            %% Skip ao-types field
            case RawKey of
                <<"ao-types">> -> Acc;
                _ ->
                    NormKey = normalize_key(RawKey),
                    Type = maps:get(NormKey, Types, undefined),
                    DecodedValue = decode_tabm_value(Type, Value),
                    maps:put(RawKey, DecodedValue, Acc)
            end
        end,
        #{},
        Map
    ),
    Result;
js_structured_to(Other) -> Other.

%% Parse ao-types string into a map of {key => type}
parse_ao_types(<<>>) -> #{};
parse_ao_types(AoTypesStr) ->
    %% Split by ", " and parse each "key=\"type\"" pair
    Parts = binary:split(AoTypesStr, <<", ">>, [global]),
    lists:foldl(
        fun(Part, Acc) ->
            case parse_ao_type_pair(Part) of
                {Key, Type} -> maps:put(Key, Type, Acc);
                error -> Acc
            end
        end,
        #{},
        Parts
    ).

%% Parse a single "key=\"type\"" pair
parse_ao_type_pair(Part) ->
    case binary:match(Part, <<"=\"">>) of
        {Pos, 2} ->
            Key = binary:part(Part, 0, Pos),
            %% Decode escaped key (like %2d -> -)
            DecodedKey = decode_escaped_key(Key),
            %% Extract type (remove quotes)
            RestStart = Pos + 2,
            RestLen = byte_size(Part) - RestStart - 1,
            case RestLen > 0 of
                true ->
                    Type = binary:part(Part, RestStart, RestLen),
                    %% string:lowercase returns a list, convert back to binary
                    LowerKey = unicode:characters_to_binary(string:lowercase(DecodedKey)),
                    {LowerKey, Type};
                false ->
                    error
            end;
        nomatch ->
            error
    end.

%% Decode URL-encoded key
decode_escaped_key(Key) ->
    decode_escaped_key(Key, <<>>).

decode_escaped_key(<<>>, Acc) -> Acc;
decode_escaped_key(<<$%, H1, H2, Rest/binary>>, Acc) ->
    %% Hex decode
    Char = list_to_integer([H1, H2], 16),
    decode_escaped_key(Rest, <<Acc/binary, Char>>);
decode_escaped_key(<<C, Rest/binary>>, Acc) ->
    decode_escaped_key(Rest, <<Acc/binary, C>>).

%% Decode a TABM value based on its type
decode_tabm_value(undefined, Value) when is_binary(Value) ->
    %% No type info, keep as binary
    Value;
decode_tabm_value(undefined, Value) when is_map(Value) ->
    %% Regular nested map, recursively decode
    %% Note: Don't handle { "ao-types": '.="list"' } specially - match JS behavior
    js_structured_to(Value);
decode_tabm_value(<<"integer">>, Value) ->
    %% Parse integer
    case Value of
        V when is_binary(V) -> binary_to_integer(V);
        V when is_integer(V) -> V;
        _ -> Value
    end;
decode_tabm_value(<<"float">>, Value) ->
    %% Parse float
    case Value of
        V when is_binary(V) ->
            try binary_to_float(V)
            catch _:_ ->
                try list_to_float(binary_to_list(V))
                catch _:_ -> Value
                end
            end;
        V when is_float(V) -> V;
        _ -> Value
    end;
decode_tabm_value(<<"boolean">>, Value) ->
    case Value of
        <<"?1">> -> true;
        <<"?0">> -> false;
        _ -> Value
    end;
decode_tabm_value(<<"atom">>, Value) ->
    %% Parse atom - may be quoted or unquoted
    %% JS encodes atoms without quotes in numbered maps (e.g., "true" not "\"true\"")
    Unquoted = case Value of
        <<"\"", Rest/binary>> when byte_size(Rest) > 0 ->
            Len = byte_size(Rest) - 1,
            binary:part(Rest, 0, Len);
        _ ->
            Value
    end,
    case Unquoted of
        <<"null">> -> null;
        <<"true">> -> true;
        <<"false">> -> false;
        _ -> binary_to_atom(Unquoted, utf8)
    end;
decode_tabm_value(<<"list">>, Value) when is_map(Value) ->
    %% Numbered map - convert back to list
    Decoded = js_structured_to(Value),
    numbered_map_to_list(Decoded);
decode_tabm_value(<<"list">>, Value) when is_binary(Value) ->
    %% Parse list string
    parse_list_string(Value);
decode_tabm_value(_Type, Value) when is_map(Value) ->
    %% Recursively decode nested map
    js_structured_to(Value);
decode_tabm_value(_Type, Value) ->
    Value.

%% Convert numbered map back to ordered list
numbered_map_to_list(Map) when is_map(Map) ->
    %% Get numeric keys and sort them
    Keys = maps:keys(Map),
    NumericKeys = lists:filtermap(
        fun(K) ->
            try {true, {binary_to_integer(K), K}}
            catch _:_ -> false
            end
        end,
        Keys
    ),
    SortedKeys = lists:sort(fun({A, _}, {B, _}) -> A =< B end, NumericKeys),
    [maps:get(K, Map) || {_, K} <- SortedKeys];
numbered_map_to_list(Other) -> Other.

%% Parse a structured field list string
parse_list_string(Value) ->
    %% Split by ", " (outside quotes) and parse each item
    Items = split_list_string(Value),
    lists:map(fun parse_list_item/1, Items).

%% Split list string by ", " respecting quotes
split_list_string(Value) ->
    split_list_string(Value, <<>>, [], false).

split_list_string(<<>>, Current, Acc, _InQuote) ->
    case Current of
        <<>> -> lists:reverse(Acc);
        _ -> lists:reverse([Current | Acc])
    end;
split_list_string(<<$", Rest/binary>>, Current, Acc, false) ->
    split_list_string(Rest, <<Current/binary, $">>, Acc, true);
split_list_string(<<$", Rest/binary>>, Current, Acc, true) ->
    split_list_string(Rest, <<Current/binary, $">>, Acc, false);
split_list_string(<<$\\, C, Rest/binary>>, Current, Acc, InQuote) ->
    split_list_string(Rest, <<Current/binary, $\\, C>>, Acc, InQuote);
split_list_string(<<$,, $\s, Rest/binary>>, Current, Acc, false) ->
    split_list_string(Rest, <<>>, [Current | Acc], false);
split_list_string(<<C, Rest/binary>>, Current, Acc, InQuote) ->
    split_list_string(Rest, <<Current/binary, C>>, Acc, InQuote).

%% Parse a single list item
parse_list_item(Item) ->
    %% Remove quotes if present
    case Item of
        <<"\"", Rest/binary>> when byte_size(Rest) > 0 ->
            Len = byte_size(Rest) - 1,
            Unquoted = binary:part(Rest, 0, Len),
            parse_list_item_content(Unquoted);
        _ ->
            Item
    end.

%% Parse list item content (may have type annotation)
parse_list_item_content(<<"(ao-type-integer) ", Rest/binary>>) ->
    binary_to_integer(Rest);
parse_list_item_content(<<"(ao-type-float) ", Rest/binary>>) ->
    try binary_to_float(Rest)
    catch _:_ ->
        try list_to_float(binary_to_list(Rest))
        catch _:_ -> Rest
        end
    end;
parse_list_item_content(<<"(ao-type-boolean) ?1">>) ->
    true;
parse_list_item_content(<<"(ao-type-boolean) ?0">>) ->
    false;
parse_list_item_content(<<"(ao-type-atom) ", Rest/binary>>) ->
    %% Remove quotes from atom
    case Rest of
        <<"\\\"", AtomRest/binary>> ->
            Len = byte_size(AtomRest) - 2,
            AtomStr = binary:part(AtomRest, 0, Len),
            case AtomStr of
                <<"null">> -> null;
                <<"true">> -> true;
                <<"false">> -> false;
                _ -> binary_to_atom(AtomStr, utf8)
            end;
        _ -> Rest
    end;
parse_list_item_content(Content) ->
    %% Unescape the content
    unescape_structured_field(Content).

%% Unescape structured field content
unescape_structured_field(Content) ->
    unescape_structured_field(Content, <<>>).

unescape_structured_field(<<>>, Acc) -> Acc;
unescape_structured_field(<<$\\, $", Rest/binary>>, Acc) ->
    unescape_structured_field(Rest, <<Acc/binary, $">>);
unescape_structured_field(<<$\\, $\\, Rest/binary>>, Acc) ->
    unescape_structured_field(Rest, <<Acc/binary, $\\>>);
unescape_structured_field(<<$\\, $n, Rest/binary>>, Acc) ->
    unescape_structured_field(Rest, <<Acc/binary, $\n>>);
unescape_structured_field(<<$\\, $r, Rest/binary>>, Acc) ->
    unescape_structured_field(Rest, <<Acc/binary, $\r>>);
unescape_structured_field(<<$\\, $t, Rest/binary>>, Acc) ->
    unescape_structured_field(Rest, <<Acc/binary, $\t>>);
unescape_structured_field(<<$\\, C, Rest/binary>>, Acc) ->
    unescape_structured_field(Rest, <<Acc/binary, C>>);
unescape_structured_field(<<C, Rest/binary>>, Acc) ->
    unescape_structured_field(Rest, <<Acc/binary, C>>).

%% ============================================================================
%% JS-compatible httpsig_to implementation
%% Converts TABM to HTTP message (multipart if needed)
%% This matches the behavior of httpsig.js httpsig_to function exactly
%% ============================================================================

%% Normalize Buffer-like objects to binaries (like JS normalize does)
normalize_buffers(Bin) when is_binary(Bin) -> Bin;
normalize_buffers(List) when is_list(List) ->
    [normalize_buffers(Item) || Item <- List];
normalize_buffers(Map) when is_map(Map) ->
    %% Check if this looks like a Buffer object: { type: "Buffer", data: [...] }
    case {maps:get(<<"type">>, Map, undefined), maps:get(<<"data">>, Map, undefined)} of
        {<<"Buffer">>, Data} when is_list(Data) ->
            %% Convert data array to binary
            list_to_binary(Data);
        _ ->
            %% Recursively normalize nested maps
            maps:map(fun(_K, V) -> normalize_buffers(V) end, Map)
    end;
normalize_buffers(Other) -> Other.

js_httpsig_to(Bin) when is_binary(Bin) -> Bin;
js_httpsig_to(Map) when is_map(Map) ->
    %% Pre-process: convert Buffer-like objects back to binaries (like JS normalize does)
    Normalized = normalize_buffers(Map),

    %% Remove signature-related and private keys
    Stripped = maps:without([
        <<"commitments">>, <<"signature">>, <<"signature-input">>, <<"priv">>
    ], Normalized),

    %% Check if there are nested maps (objects that are not arrays or buffers)
    HasNestedMaps = maps:fold(
        fun(_, Value, Acc) ->
            Acc orelse (is_map(Value) andalso map_size(Value) >= 0)
        end,
        false,
        Stripped
    ),

    %% If no nested maps, return flat headers
    case HasNestedMaps of
        false ->
            %% Flat structure - handle inline body key logic
            handle_flat_structure(Stripped);
        true ->
            %% Has nested maps - create multipart body
            create_multipart_body(Stripped)
    end;
js_httpsig_to(Other) -> Other.

%% Handle flat structure with inline body key logic (like JS does)
handle_flat_structure(Map) ->
    %% Determine inline key: if 'data' exists but 'body' doesn't, use 'data' as body
    {InlineHeaders, InlineKey} = get_inline_key(Map),

    case InlineKey of
        <<"body">> ->
            %% Normal case - just add content-digest if body exists
            maybe_add_content_digest(Map);
        _ ->
            %% Move data from inline key to body
            case maps:get(InlineKey, Map, undefined) of
                undefined ->
                    maybe_add_content_digest(Map);
                Value ->
                    Map1 = maps:remove(InlineKey, Map),
                    Map2 = maps:put(<<"body">>, Value, Map1),
                    Map3 = maps:merge(InlineHeaders, Map2),
                    maybe_add_content_digest(Map3)
            end
    end.

%% Determine inline key based on JS logic
get_inline_key(Map) ->
    case maps:get(<<"inline-body-key">>, Map, undefined) of
        undefined ->
            case maps:is_key(<<"body">>, Map) of
                true -> {#{}, <<"body">>};
                false ->
                    case maps:is_key(<<"data">>, Map) of
                        true -> {#{<<"inline-body-key">> => <<"data">>}, <<"data">>};
                        false -> {#{}, <<"body">>}
                    end
            end;
        Key ->
            {#{}, Key}
    end.

%% Determine inline key for multipart - checks nested map keys
get_multipart_inline_key(Map) ->
    case maps:get(<<"inline-body-key">>, Map, undefined) of
        undefined ->
            %% Check if there's a nested 'body' map
            case maps:is_key(<<"body">>, Map) andalso is_map(maps:get(<<"body">>, Map)) of
                true -> {#{}, <<"body">>};
                false ->
                    %% Check if there's a nested 'data' map
                    case maps:is_key(<<"data">>, Map) andalso is_map(maps:get(<<"data">>, Map)) of
                        true -> {#{<<"inline-body-key">> => <<"data">>}, <<"data">>};
                        false -> {#{}, <<"body">>}
                    end
            end;
        Key ->
            {#{}, Key}
    end.

%% Add content-digest if body exists
maybe_add_content_digest(Map) ->
    case maps:get(<<"body">>, Map, undefined) of
        undefined -> Map;
        Body ->
            %% Convert body to binary if needed
            BodyBin = ensure_binary(Body),
            Digest = compute_content_digest(BodyBin),
            maps:put(<<"content-digest">>, Digest, Map)
    end.

%% Ensure value is binary for hashing
ensure_binary(Bin) when is_binary(Bin) -> Bin;
ensure_binary(Atom) when is_atom(Atom) -> atom_to_binary(Atom, utf8);
ensure_binary(Int) when is_integer(Int) -> integer_to_binary(Int);
ensure_binary(Float) when is_float(Float) -> float_to_binary(Float);
ensure_binary(List) when is_list(List) -> list_to_binary([ensure_binary(E) || E <- List]);
ensure_binary(Map) when is_map(Map) -> iolist_to_binary(io_lib:format("~p", [Map]));
ensure_binary(Other) -> iolist_to_binary(io_lib:format("~p", [Other])).

%% Create multipart body from nested map structure
create_multipart_body(Map) ->
    %% Determine inline key for this map
    {InlineHeaders, InlineKey} = get_multipart_inline_key(Map),

    %% Separate headers (primitives) from body parts (nested maps)
    %% Note: body/inlineKey ALWAYS goes to body map (like JS does)
    {Headers0, BodyMap} = maps:fold(
        fun(Key, Value, {HAcc, BAcc}) ->
            %% Check if this is the body/inline key
            IsBodyKey = (Key == <<"body">>) orelse (Key == InlineKey),
            case {IsBodyKey, is_map(Value)} of
                {true, _} ->
                    %% body/inlineKey always goes to body map
                    {HAcc, maps:put(Key, Value, BAcc)};
                {false, true} ->
                    %% Nested map goes to body map
                    {HAcc, maps:put(Key, Value, BAcc)};
                {false, false} ->
                    %% Primitive value stays in headers
                    {maps:put(Key, Value, HAcc), BAcc}
            end
        end,
        {#{}, #{}},
        Map
    ),

    %% Use groupMaps to flatten the body map structure (like JS does)
    GroupedBodyMap = group_maps(BodyMap, <<>>, #{}),

    %% Convert grouped body map to sorted list of parts
    SortedBodyParts = lists:sort(
        fun({K1, _}, {K2, _}) -> K1 =< K2 end,
        maps:to_list(GroupedBodyMap)
    ),

    %% If no body parts, return headers only
    case SortedBodyParts of
        [] ->
            maybe_add_content_digest(Headers0);
        _ ->
            %% Encode each body part (passing InlineKey for disposition)
            EncodedParts = lists:map(
                fun({PartName, PartValue}) ->
                    encode_body_part(PartName, PartValue, InlineKey)
                end,
                SortedBodyParts
            ),

            %% Compute boundary from parts
            Boundary = compute_boundary(EncodedParts),

            %% Build multipart body
            Body = build_multipart_body(Boundary, EncodedParts),

            %% Build body-keys - use actual part names (flattened paths)
            BodyKeys = iolist_to_binary(lists:join(<<", ">>,
                [<<"\"", K/binary, "\"">> || {K, _} <- SortedBodyParts]
            )),

            %% Build result with inline headers
            Headers1 = maps:merge(Headers0, InlineHeaders),
            ContentType = <<"multipart/form-data; boundary=\"", Boundary/binary, "\"">>,
            ContentDigest = compute_content_digest(Body),

            Result0 = maps:put(<<"body-keys">>, BodyKeys, Headers1),
            Result1 = maps:put(<<"content-type">>, ContentType, Result0),
            Result2 = maps:put(<<"body">>, Body, Result1),
            maps:put(<<"content-digest">>, ContentDigest, Result2)
    end.

%% JS-compatible groupMaps function
%% Recursively flattens nested maps into flat paths
%% e.g., #{<<"items">> => #{<<"0">> => #{<<"name">> => <<"John">>}}}
%% becomes #{<<"items/0">> => #{<<"name">> => <<"John">>}}
group_maps(Map, Parent, Top) when is_map(Map) ->
    SortedEntries = lists:sort(maps:to_list(Map)),
    lists:foldl(
        fun({Key, Value}, AccTop) ->
            NormKey = normalize_key(Key),
            FlatK = case Parent of
                <<>> -> NormKey;
                _ -> <<Parent/binary, "/", NormKey/binary>>
            end,
            case is_map(Value) of
                true ->
                    %% Recursively process nested objects
                    group_maps(Value, FlatK, AccTop);
                false when is_binary(Value), byte_size(Value) > 4096 ->
                    %% Value too large for header, lift to top level
                    maps:put(FlatK, Value, AccTop);
                false ->
                    %% Keep in flattened map under parent
                    %% Find or create the parent entry
                    case Parent of
                        <<>> ->
                            %% No parent, add directly
                            maps:put(NormKey, Value, AccTop);
                        _ ->
                            %% Has parent, add to parent's flattened map
                            Existing = maps:get(Parent, AccTop, #{}),
                            NewExisting = case is_map(Existing) of
                                true -> maps:put(NormKey, Value, Existing);
                                false -> #{NormKey => Value}
                            end,
                            maps:put(Parent, NewExisting, AccTop)
                    end
            end
        end,
        Top,
        SortedEntries
    );
group_maps(_Value, _Parent, Top) ->
    Top.

%% Encode a single body part
encode_body_part(PartName, PartValue, InlineKey) when is_map(PartValue) ->
    %% Get ao-types if present (to determine sort order)
    HasAoTypes = maps:is_key(<<"ao-types">>, PartValue),

    %% Determine disposition based on whether this is the inline key
    IsInline = (PartName == InlineKey),
    Disposition = case IsInline of
        true -> <<"inline">>;
        false -> <<"form-data;name=\"", PartName/binary, "\"">>
    end,

    %% Get all headers except body
    PartHeaders = maps:without([<<"body">>], PartValue),

    %% Build lines based on whether ao-types is present and inline status
    Lines = case {HasAoTypes, IsInline} of
        {true, _} ->
            %% With ao-types: sort ALL headers alphabetically (including content-disposition)
            AllHeaders = maps:put(<<"content-disposition">>, Disposition, PartHeaders),
            SortedKeys = lists:sort(maps:keys(AllHeaders)),
            [format_header_line(K, maps:get(K, AllHeaders)) || K <- SortedKeys];
        {false, true} ->
            %% Inline without ao-types: sort ALL headers alphabetically (including content-disposition)
            AllHeaders = maps:put(<<"content-disposition">>, Disposition, PartHeaders),
            SortedKeys = lists:sort(maps:keys(AllHeaders)),
            [format_header_line(K, maps:get(K, AllHeaders)) || K <- SortedKeys];
        {false, false} ->
            %% Regular form-data without ao-types: content-disposition first, then other headers
            HeaderKeys = lists:sort(maps:keys(PartHeaders)),
            HeaderLines = [format_header_line(K, maps:get(K, PartHeaders)) || K <- HeaderKeys],
            [<<"content-disposition: ", Disposition/binary>> | HeaderLines]
    end,

    %% Add body if present
    PartBody = maps:get(<<"body">>, PartValue, <<>>),
    case PartBody of
        <<>> ->
            iolist_to_binary(lists:join(<<"\r\n">>, Lines));
        _ ->
            iolist_to_binary([
                lists:join(<<"\r\n">>, Lines),
                <<"\r\n\r\n">>,
                PartBody
            ])
    end;
encode_body_part(PartName, PartValue, InlineKey) when is_binary(PartValue) ->
    IsInline = (PartName == InlineKey),
    Disposition = case IsInline of
        true -> <<"inline">>;
        false -> <<"form-data;name=\"", PartName/binary, "\"">>
    end,
    <<"content-disposition: ", Disposition/binary, "\r\n\r\n", PartValue/binary>>.

%% Format a header line
format_header_line(Key, Value) when is_binary(Value) ->
    <<Key/binary, ": ", Value/binary>>;
format_header_line(Key, Value) when is_integer(Value) ->
    ValueBin = integer_to_binary(Value),
    <<Key/binary, ": ", ValueBin/binary>>;
format_header_line(Key, Value) ->
    ValueBin = iolist_to_binary(io_lib:format("~p", [Value])),
    <<Key/binary, ": ", ValueBin/binary>>.

%% Compute boundary using SHA-256 of body parts
compute_boundary(EncodedParts) ->
    BodyBin = iolist_to_binary(lists:join(<<"\r\n">>, EncodedParts)),
    Hash = crypto:hash(sha256, BodyBin),
    base64url_encode(Hash).

%% Build multipart body with boundary
build_multipart_body(Boundary, EncodedParts) ->
    BoundaryLine = <<"--", Boundary/binary>>,
    EndBoundary = <<"--", Boundary/binary, "--">>,
    Parts = [<<BoundaryLine/binary, "\r\n", Part/binary>> || Part <- EncodedParts],
    iolist_to_binary([lists:join(<<"\r\n">>, Parts), <<"\r\n">>, EndBoundary]).

%% Compute content-digest using SHA-256
compute_content_digest(Body) ->
    Hash = crypto:hash(sha256, Body),
    Base64 = base64:encode(Hash),
    <<"sha-256=:", Base64/binary, ":">>.

%% Base64URL encode (no padding)
base64url_encode(Bin) ->
    B64 = base64:encode(Bin),
    %% Replace + with -, / with _, and remove =
    B64_1 = binary:replace(B64, <<"+">>, <<"-">>, [global]),
    B64_2 = binary:replace(B64_1, <<"/">>, <<"_">>, [global]),
    %% Remove trailing = padding
    remove_base64_padding(B64_2).

remove_base64_padding(<<B/binary>>) ->
    case binary:last(B) of
        $= ->
            Len = byte_size(B) - 1,
            remove_base64_padding(binary:part(B, 0, Len));
        _ ->
            B
    end.
