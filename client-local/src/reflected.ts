export function client_event_payload_parser<T extends To_Client_Event_Type>(type: T): (input: object) => Find_To_Client_Payload<T> {
    const payloads = type_of<To_Client_Event>() as Union_Type;
    const member = find_member_of_union_by_tag(payloads, "type", type);
    if (!member.ok) {
        throw "Type not found";
    }

    const payload = find_object_member_type_by_name(member.data, "payload") as Object_Type;
    return value => result_or_throw(deserialize_value(payload, value, server_array_mapper));
}

export function game_net_table_parser(): (input: object) => Game_Net_Table {
    return value => result_or_throw(deserialize_value(type_of<Game_Net_Table>(), value, server_array_mapper));
}

export function adventure_net_table_parser(): (input: object) => Adventure_Net_Table {
    return value => result_or_throw(deserialize_value(type_of<Adventure_Net_Table>(), value, server_array_mapper));
}

export function local_api_response_parser<T extends Local_Api_Request_Type>(type: T): (input: object) => Find_Local_Response<T> {
    const requests = type_of<Local_Api_Request>() as Union_Type;
    const member = find_member_of_union_by_tag(requests, "type", type);
    if (!member.ok) {
        throw "Type not found";
    }

    const response = find_object_member_type_by_name(member.data, "response") as Object_Type;
    return value => result_or_throw(deserialize_value(response, value, server_array_mapper));
}

function result_or_throw<T>(result: Result<T>): T {
    if (!result.ok) {
        throw result.message;
    }

    return result.data;
}

function server_array_mapper(type: Type, value: any) {
    if (type.kind == Type_Kind.array) {
        return fix_array_from_server(value as any[]);
    } else {
        return value;
    }

    function fix_array_from_server<T>(array: Array<T>): Array<T> {
        const result: Array<T> = [];

        for (const index in array) {
            result[parseInt(index) - 1] = array[index];
        }

        return result;
    }
}