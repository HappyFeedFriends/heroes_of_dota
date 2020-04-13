declare function type_of<T>(): Type;

declare const enum Type_Kind {
    string = 0,
    number = 1,
    boolean = 2,
    string_literal = 3,
    number_literal = 4,
    boolean_literal = 5,
    object = 6,
    union = 7,
    intersection = 8,
    enum_member = 9,
    enum = 10,
    array = 11,
    any = 12,
    undefined = 13
}

type Find_By_Kind<Union, Type> = Union extends { kind: Type } ? Union : never;

type Type = {
    kind: Type_Kind.string
} | {
    kind: Type_Kind.number
} | {
    kind: Type_Kind.boolean
} | {
    kind: Type_Kind.object
    name?: string
    members: Member_Named[]
} | {
    kind: Type_Kind.number_literal
    value: number
} | {
    kind: Type_Kind.string_literal
    value: string
} | {
    kind: Type_Kind.boolean_literal
    value: boolean
} | {
    kind: Type_Kind.union
    types: Type[]
} | {
    kind: Type_Kind.enum_member
    name: string
    full_name: string
    type: Primitive
} | {
    kind: Type_Kind.enum
    name: string
    members: Find_By_Kind<Type, Type_Kind.enum_member>[]
} | {
    kind: Type_Kind.array
    type: Type
} | {
    kind: Type_Kind.intersection
    types: Type[]
} | {
    kind: Type_Kind.any
} | {
    kind: Type_Kind.undefined
}

type Primitive = Find_By_Kind<Type,
    Type_Kind.string_literal |
    Type_Kind.number_literal |
    Type_Kind.boolean_literal |
    Type_Kind.string |
    Type_Kind.number |
    Type_Kind.boolean |
    Type_Kind.undefined
>

type Member = {
    type: Type
    optional: boolean
}

type Member_Named = Member & {
    name: string
}