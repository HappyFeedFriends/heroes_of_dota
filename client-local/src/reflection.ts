type Result<T> = {
    ok: true
    data: T
} | {
    ok: false
    message: string
    cause?: Result<any>
}

function result_fail<T>(message: string, cause?: Result<any>): Result<T> {
    return { ok: false, message: message, cause: cause };
}

function result_ok<T>(data: T): Result<T> {
    return { ok: true, data: data };
}

function find_object_member_type_by_name(obj: Object_Type, property: string): Type | undefined {
    for (const member of obj.members) {
        if (member.name == property) {
            return member.type;
        }
    }
}

function collapse_intersection(intersection: Intersection_Type): Result<Object_Type> {
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
            return result_fail("Intersections between non-objects are not supported");
        }
    }

    return result_ok({
        kind: Type_Kind.object,
        members: existing_members
    });
}

function object_or_intersection(type: Type): Result<Object_Type> {
    if (type.kind == Type_Kind.object) {
        return result_ok(type);
    } else if (type.kind == Type_Kind.intersection) {
        return collapse_intersection(type);
    } else {
        return result_fail("Unsupported type " + type.kind);
    }
}

function find_member_of_union_by_tag(union: Union_Type, tag_name: string, tag_value: number): Result<Object_Type> {
    for (const type of union.types) {
        const object = object_or_intersection(type);
        if (!object.ok) {
            return result_fail("Unsupported union member " + type.kind, object);
        }

        const tag = find_object_member_type_by_name(object.data, tag_name);
        if (!tag) {
            return result_fail("Tagged value not found");
        }

        if (tag.kind == Type_Kind.enum_member) {
            const value_type = tag.type;

            if (value_type.kind == Type_Kind.number_literal && value_type.value == tag_value) {
                return object;
            }
        }
    }

    return result_fail("Member not found");
}

function find_member_of_union_by_tags(tags: Union_Tag[], value_store: any, mapper: (type: Type, value: any) => any): Result<Object_Type> {
    for (const tag of tags) {
        let continue_to_the_next_tag = false;

        for (const discriminator of tag.discriminated_by) {
            const value_types = discriminator.any_of;

            for (const value_type of value_types) {
                const compare_to = deserialize_value(value_type, value_store[discriminator.name], mapper);
                if (!compare_to.ok) {
                    return result_fail("Unable to deserialize tag key", compare_to);
                }

                if (value_type.kind == Type_Kind.number_literal && value_type.value == compare_to.data) {
                    continue_to_the_next_tag = false;
                    break;
                }

                if (value_type.kind == Type_Kind.boolean_literal && value_type.value == compare_to.data) {
                    continue_to_the_next_tag = false;
                    break;
                }

                continue_to_the_next_tag = true;
            }

            if (continue_to_the_next_tag) {
                break;
            }
        }

        if (!continue_to_the_next_tag) {
            return result_ok(tag.discriminates_to);
        }
    }

    return result_fail("Unable to find union member by tags");
}

type Union_Tag = {
    discriminates_to: Object_Type
    discriminated_by: Array<{
        name: string
        any_of: Primitive[]
    }>
}

function find_union_tags(union: Union_Type): Result<Union_Tag[]> {
    const all_object_types: Object_Type[] = [];

    for (const type of union.types) {
        const object = object_or_intersection(type);
        if (!object.ok) {
            return result_fail("Unsupported union member " + type.kind, object);
        }

        all_object_types.push(object.data);
    }

    type Object_Member = {
        object: Object_Type
        member_name: string
        member_type: Primitive[]
    }

    const members_by_name: Record<string, Object_Member[]> = {};

    function enum_members_from_object_member(member: Member_Named): Primitive[] | undefined {
        if (member.type.kind == Type_Kind.union) {
            const result: Primitive[] = [];

            for (const type of member.type.types) {
                if (type.kind != Type_Kind.enum_member) {
                    return;
                }

                result.push(type.type);
            }

            return result;
        } else if (member.type.kind == Type_Kind.enum_member) {
            return [ member.type.type ]
        } else if (member.type.kind == Type_Kind.boolean_literal) {
            return [ member.type ];
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

    return result_ok(result);
}

function deserialize_value(type: Type, from: any, mapper: (type: Type, value: any) => any): Result<any> {
    from = mapper(type, from);

    try {
        switch (type.kind) {
            case Type_Kind.array: {
                const result: any[] = [];

                for (const member of from as any[]) {
                    const deserialized = deserialize_value(type.type, member, mapper);
                    if (!deserialized.ok) {
                        return result_fail("Failed to deserialize array member", deserialized);
                    }

                    result.push(deserialized.data);
                }

                return result_ok(result);
            }

            case Type_Kind.object: {
                const new_object: Record<string, any> = {};

                for (const member of type.members) {
                    const member_value = from[member.name];
                    const deserialized = deserialize_value(member.type, member_value, mapper);

                    if (!deserialized.ok) {
                        return result_fail("Failed to deserialize object member " + member.name, deserialized);
                    }

                    new_object[member.name] = deserialized.data;
                }

                return result_ok(new_object);
            }

            case Type_Kind.intersection: {
                // Special case: nominal id types aka number & { _brand: any }
                if (type.types.some(type => type.kind == Type_Kind.number)) {
                    return result_ok(from);
                }

                const collapsed = collapse_intersection(type);
                if (!collapsed.ok) {
                    return result_fail("Failed to collapse intersection", collapsed);
                }

                return deserialize_value(collapsed.data, from, mapper);
            }

            case Type_Kind.generic: {
                // Record<Key, Value>
                if (type.target.kind == Type_Kind.object && type.arguments.length == 2) {
                    const result: Record<string, any> = {};
                    const key_type = type.arguments[0];
                    const value_type = type.arguments[1];

                    for (const key of Object.keys(from)) {
                        const deserialized = deserialize_value(value_type, from[key], mapper);
                        if (!deserialized.ok) {
                            return result_fail("Failed to deserialize a member of Record<K, V>", deserialized);
                        }

                        const deserialized_key = deserialize_value(key_type, key, mapper);
                        if (!deserialized_key.ok) {
                            return result_fail("Failed to deserialize a key of Record<K, V>", deserialized_key);
                        }

                        result[deserialized_key.data] = deserialized.data;
                    }

                    return result_ok(result);
                } else {
                    return result_fail("Unsupported generic type");
                }
            }

            case Type_Kind.union: {
                // member: Enum.a | Enum.b
                if (type.types.every(t => t.kind == Type_Kind.enum_member)) {
                    return result_ok(from);
                }

                // a | undefined
                if (type.types.length == 2 && type.types.some(type => type.kind == Type_Kind.undefined)) {
                    return result_ok(from);
                }

                const tags = find_union_tags(type);
                if (!tags.ok || tags.data.length == 0) {
                    return result_fail("Unable to find union tags", tags);
                }

                const member = find_member_of_union_by_tags(tags.data, from, mapper);

                if (member.ok) {
                    return deserialize_value(member.data, from, mapper);
                } else {
                    return result_fail("Unable to find union member by tags, value " + from, member);
                }
            }

            case Type_Kind.enum: {
                if (!type.members.every(member => member.type.kind == Type_Kind.number_literal)) {
                    return result_fail("Unsupported enum member type in enum " + type.name);
                }

                if (typeof from == "string") {
                    return result_ok(parseInt(from));
                } else if (typeof from == "number") {
                    return result_ok(from);
                } else {
                    return result_fail("Unsupported value of type " + typeof from);
                }
            }

            default: {
                return result_ok(from);
            }
        }
    } catch (e) {
        return result_fail(e);
    }
}