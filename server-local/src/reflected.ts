function server_event_payload_parser<T extends To_Server_Event_Type>(type: T): (input: object) => Find_To_Server_Payload<T> | undefined {
    const payloads = type_of<To_Server_Event>() as Union_Type;
    const member = find_member_of_union_by_tag(payloads, "type", type);
    if (!member.ok) {
        throw "Type not found";
    }

    const payload = find_object_member_type_by_name(member.data, "payload") as Object_Type;
    return value => {
        const result = deserialize_value(payload, value, client_value_mapper);

        if (!result.ok) {
            print("Deserialization error:", result.message);
            print_table(result);
            return;
        }

        return result.data;
    };
}

function local_api_request_parser<T extends Local_Api_Request_Type>(type: T): (input: object) => Find_Local_Request<T> | undefined {
    const payloads = type_of<Local_Api_Request>() as Union_Type;
    const member = find_member_of_union_by_tag(payloads, "type", type);
    if (!member.ok) {
        throw "Type not found";
    }

    const payload = find_object_member_type_by_name(member.data, "request") as Object_Type;
    return value => {
        const result = deserialize_value(payload, value, client_value_mapper);

        if (!result.ok) {
            print("Deserialization error:", result.message);
            print_table(result);
            return;
        }

        return result.data;
    };
}

function client_value_mapper(type: Type, value: any) {
    function from_client_array<T>(array: Array<T>): Array<T> {
        let [index, value] = next(array, undefined);

        const result: Array<T> = [];

        while (index != undefined) {
            result[tonumber(index.toString())] = value;

            [index, value] = next(array, index);
        }

        return result
    }

    if (type.kind == Type_Kind.array) {
        return from_client_array(value);
    }

    if (type.kind == Type_Kind.boolean) {
        return value == 1;
    }

    if (type.kind == Type_Kind.boolean_literal) {
        return value == 1;
    }

    return value;
}
