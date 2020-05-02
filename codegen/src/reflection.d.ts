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
    undefined = 13,
    generic = 14
}

type Type =
    Object_Type |
    Union_Type |
    Intersection_Type |
    Enum_Member_Type |
    Generic_Type |
    Primitive |
    Enum_Type |
    Array_Type |
    Any_Type

type Union_Type = {
    kind: Type_Kind.union
    types: Type[]
}

type Intersection_Type = {
    kind: Type_Kind.intersection
    types: Type[]
}

type Object_Type = {
    kind: Type_Kind.object
    name?: string
    members: Member_Named[]
}

type Enum_Member_Type = {
    kind: Type_Kind.enum_member
    name: string
    full_name: string
    type: Primitive
}

type Enum_Type = {
    kind: Type_Kind.enum
    name: string
    members: Enum_Member_Type[]
}

type Array_Type = {
    kind: Type_Kind.array
    type: Type
}

type Any_Type = {
    kind: Type_Kind.any
}

type Generic_Type = {
    kind: Type_Kind.generic
    name?: string
    target: Type
    arguments: Type[]
}

type Literal = {
    kind: Type_Kind.number_literal
    value: number
} | {
    kind: Type_Kind.string_literal
    value: string
} | {
    kind: Type_Kind.boolean_literal
    value: boolean
}

type Primitive = Literal | {
    kind: Type_Kind.string
} | {
    kind: Type_Kind.number
} | {
    kind: Type_Kind.boolean
} | {
    kind: Type_Kind.undefined
}

type Member = {
    type: Type
    optional: boolean
}

type Member_Named = Member & {
    name: string
}