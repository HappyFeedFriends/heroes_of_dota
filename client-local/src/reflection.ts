function find_object_member_type_by_name(obj: Object_Type, property: string): Type | undefined {
    for (const member of obj.members) {
        if (member.name == property) {
            return member.type;
        }
    }
}

function collapse_intersection(intersection: Intersection_Type): Object_Type | undefined {
    const existing_members: Member_Named[] = [];

    for (let index = intersection.types.length - 1; index >= 0; index--) {
        const child = intersection.types[index];

        if (child.kind == Type_Kind.object) {
            for (let member of child.members) {
                if (!existing_members.some(existing => existing.name == member.name)) {
                    existing_members.push(member);
                }
            }
        } else {
            $.Msg("Intersections between non-objects are not supported");
            return undefined;
        }
    }

    return {
        kind: Type_Kind.object,
        members: existing_members
    }
}

function object_or_intersection(type: Type): Object_Type | undefined {
    if (type.kind == Type_Kind.object) {
        return type;
    } else if (type.kind == Type_Kind.intersection) {
        return collapse_intersection(type);
    }
}

function find_member_of_union_by_tag(union: Union_Type, tag_name: string, tag_value: number): Object_Type | undefined {
    for (const type of union.types) {
        const object = object_or_intersection(type);
        if (!object) {
            $.Msg("Unsupported union member ", type.kind);
            return undefined;
        }

        const tag = find_object_member_type_by_name(object, tag_name);
        if (!tag) {
            $.Msg("Tagged value not found");
            return undefined;
        }

        if (tag.kind == Type_Kind.enum_member) {
            const value_type = tag.type;

            if (value_type.kind == Type_Kind.number_literal && value_type.value == tag_value) {
                return object;
            }
        }
    }
}

function find_member_of_union_by_tags(tags: Union_Tag[], value_store: any): Object_Type | undefined {
    to_the_next_tag:
    for (const tag of tags) {
        for (const discriminator of tag.discriminated_by) {
            const value_types = discriminator.any_of;
            const compare_to = value_store[discriminator.name];

            // $.Msg("Compare ", value_types.map(a => a.type.kind == Type_Kind.number_literal ? a.type.value : "").join(", "), " to ", compare_to);

            if (value_types.some(vt => vt.type.kind == Type_Kind.number_literal && vt.type.value == compare_to)) {
                // ok
            } else {
                continue to_the_next_tag;
            }
        }

        return tag.discriminates_to;
    }
}

type Union_Tag = {
    discriminates_to: Object_Type
    discriminated_by: Array<{
        name: string
        any_of: Enum_Member_Type[]
    }>
}

function find_union_tags(union: Union_Type): Union_Tag[] | undefined {
    const all_object_types: Object_Type[] = [];

    for (const type of union.types) {
        const object = object_or_intersection(type);
        if (!object) {
            $.Msg("Unsupported union member ", type.kind);
            return undefined;
        }

        all_object_types.push(object);
    }

    type Object_Member = {
        object: Object_Type
        member_name: string
        member_type: Enum_Member_Type[]
    }

    const members_by_name: Record<string, Object_Member[]> = {};

    function enum_members_from_object_member(member: Member_Named): Enum_Member_Type[] | undefined {
        if (member.type.kind == Type_Kind.union) {
            const result: Enum_Member_Type[] = [];

            for (const type of member.type.types) {
                if (type.kind != Type_Kind.enum_member) {
                    return;
                }

                result.push(type);
            }

            return result;
        } else if (member.type.kind == Type_Kind.enum_member) {
            return [ member.type ]
        }
    }

    for (const object of all_object_types) {
        for (const member of object.members) {
            const enum_members = enum_members_from_object_member(member);
            if (!enum_members) continue;

            let members = members_by_name[member.name];

            if (!members) {
                members = [];
                members_by_name[member.name] = members;
            }

            members.push({
                object: object,
                member_name: member.name,
                member_type: enum_members
            });
        }
    }

    const result: Union_Tag[] = [];

    for (const member_name of Object.keys(members_by_name)) {
        const member_values = members_by_name[member_name];

        for (const member_value of member_values) {
            const existing_tag = result.find(tag => tag.discriminates_to == member_value.object);

            if (existing_tag) {
                existing_tag.discriminated_by.push({
                    name: member_value.member_name,
                    any_of: member_value.member_type
                });
            } else {
                result.push({
                    discriminates_to: member_value.object,
                    discriminated_by: [{
                        name: member_value.member_name,
                        any_of: member_value.member_type
                    }]
                })
            }
        }
    }

    return result;
}

function deserialize_value(type: Type, from: any): any {
    function fix_array_from_server<T>(array: Array<T>): Array<T> {
        const result: Array<T> = [];

        for (const index in array) {
            result[parseInt(index) - 1] = array[index];
        }

        return result;
    }

    switch (type.kind) {
        case Type_Kind.array: {
            const fixed_array = fix_array_from_server(from as any[]);
            return fixed_array.map(array_value => deserialize_value(type.type, array_value));
        }

        case Type_Kind.object: {
            const new_object: Record<string, any> = {};

            for (const member of type.members) {
                const member_value = from[member.name];
                new_object[member.name] = deserialize_value(member.type, member_value);
            }

            return new_object;
        }

        case Type_Kind.intersection: {
            // Special case: nominal id types aka number & { _brand: any }
            if (type.types.some(type => type.kind == Type_Kind.number)) {
                return from;
            }

            const collapsed = collapse_intersection(type);
            if (!collapsed) {
                $.Msg("Failed to collapse intersection");
                return;
            }

            return deserialize_value(collapsed, from);
        }

        case Type_Kind.generic: {
            // Record<Key, Value>
            if (type.target.kind == Type_Kind.object && type.arguments.length == 2) {
                const result: Record<string, any> = {};
                const value_type = type.arguments[1];

                for (const key of Object.keys(from)) {
                    result[key] = deserialize_value(value_type, from[key]);
                }

                return result;
            } else {
                $.Msg("Unsupported generic type");
                return;
            }
        }

        case Type_Kind.union: {
            // member: Enum.a | Enum.b
            if (type.types.every(t => t.kind == Type_Kind.enum_member)) {
                return from;
            }

            const tags = find_union_tags(type);
            if (!tags || tags.length == 0) {
                $.Msg("Unable to find union tags");
                return;
            }

            const member = find_member_of_union_by_tags(tags, from);

            if (member) {
                return deserialize_value(member, from);
            } else {
                $.Msg("Unable to find union member by tags");
            }

            break;
        }

        default: {
            return from;
        }
    }
}

export function client_event_payload_parser<T extends To_Client_Event_Type>(type: T): (input: object) => Find_To_Client_Payload<T> {
    const payloads = type_of<To_Client_Event>() as Union_Type;
    const member = find_member_of_union_by_tag(payloads, "type", type);
    if (!member) {
        throw "Type not found";
    }

    const payload = find_object_member_type_by_name(member, "payload") as Object_Type;
    return value => deserialize_value(payload, value);
}

export function game_net_table_parser(): (input: object) => Game_Net_Table {
    return value => deserialize_value(type_of<Game_Net_Table>(), value);
}

export function adventure_net_table_parser(): (input: object) => Adventure_Net_Table {
    return value => deserialize_value(type_of<Adventure_Net_Table>(), value);
}

export function local_api_response_parser<T extends Local_Api_Request_Type>(type: T): (input: object) => Find_Local_Response<T> {
    const requests = type_of<Local_Api_Request>() as Union_Type;
    const member = find_member_of_union_by_tag(requests, "type", type);
    if (!member) {
        throw "Type not found";
    }

    const response = find_object_member_type_by_name(member, "response") as Object_Type;
    return value => deserialize_value(response, value);
}