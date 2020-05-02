/// <reference path="./reflection.d.ts" />
import * as ts from "typescript";
import {SyntaxKind, TypeFlags} from "typescript";
import * as utils from "tsutils";
import {
    SimpleType,
    SimpleTypeEnum,
    SimpleTypeEnumMember,
    SimpleTypeKind,
    SimpleTypeMemberNamed,
    SimpleTypeObject,
    toSimpleType
} from "ts-simple-type";
import {readFileSync} from "fs";
import * as path from "path";

export interface Options {
    // Unfortunately without proper type information TSTL is unable to figure out array access identifier offset
    // by itself and we currently can't create new types on the fly, so we have to manually alter indices
    lua_array_access: boolean
}

export default function run_transformer(program: ts.Program, options: Options): ts.TransformerFactory<ts.Node> {
    const checker = program.getTypeChecker();
    const cyan = "\x1b[36m";
    const reset = "\x1b[0m";
    const bright = "\x1b[1m";
    const red = "\x1b[31m";

    function error_out(node: ts.Node, error: string) {
        const source = node.getSourceFile();
        const { line, character } = source.getLineAndCharacterOfPosition(node.getStart());
        throw new Error(`${bright}${red}ERROR${reset}: ${path.normalize(source.fileName)}:${line + 1}:${character + 1} / ${error}`);
    }

    function copy_object(expression: ts.Expression, type: SimpleTypeObject) {
        return ts.createObjectLiteral(type.members.map(member => ts.createPropertyAssignment(member.name, ts.createPropertyAccess(expression, member.name))), true)
    }

    function resolve_alias(type: SimpleType): SimpleType {
        return type.kind == SimpleTypeKind.ALIAS ? type.target : type;
    }

    function resolve_enum_members(type: SimpleType): SimpleTypeEnumMember[] {
        const enum_members: SimpleTypeEnumMember[] = [];

        if (type.kind == SimpleTypeKind.ENUM_MEMBER) {
            return [ type ];
        }

        if (type.kind == SimpleTypeKind.ENUM) {
            enum_members.push(...type.types);
        }

        if (type.kind == SimpleTypeKind.UNION) {
            for (const union_member of type.types) {
                if (union_member.kind == SimpleTypeKind.ENUM_MEMBER) {
                    enum_members.push(union_member);
                }
            }
        }

        return enum_members;
    }

    function extract_members(types: SimpleType[]): SimpleTypeMemberNamed[]{
        const result: SimpleTypeMemberNamed[] = [];

        for (const child of types) {
            const resolved = resolve_alias(child);

            if (resolved.kind == SimpleTypeKind.OBJECT) {
                resolved.members.forEach(member => result.push(member));
            } else if (resolved.kind == SimpleTypeKind.INTERSECTION || resolved.kind == SimpleTypeKind.UNION) {
                result.push(...extract_members(resolved.types));
            } else {
                console.log("Can't extract from", resolved);
            }
        }

        return result;
    }

    function enum_member_to_literal(member: SimpleTypeEnumMember) {
        if (member.type.kind == SimpleTypeKind.NUMBER_LITERAL) {
            const literal = ts.createLiteral(member.type.value);

            ts.addSyntheticTrailingComment(literal, ts.SyntaxKind.MultiLineCommentTrivia, member.name);

            return literal;
        }

        if (member.type.kind == SimpleTypeKind.STRING_LITERAL) {
            return ts.createStringLiteral(member.type.value);
        }
    }

    function object_to_property_assignments(object: ts.ObjectLiteralExpression): ts.PropertyAssignment[] {
        return object.properties
            .map(property => {
                if (property.kind == ts.SyntaxKind.PropertyAssignment) {
                    return property as ts.PropertyAssignment;
                } else {
                    error_out(property, `${property.getText()} is not a property assignment in type ${toSimpleType(object, checker).name}`);
                }
            });
    }

    // Stupidscript won't allow me to use those directly...
    const type_string: Type_Kind.string = 0;
    const type_number: Type_Kind.number = 1;
    const type_boolean: Type_Kind.boolean = 2;
    const type_string_literal: Type_Kind.string_literal = 3;
    const type_number_literal: Type_Kind.number_literal = 4;
    const type_boolean_literal: Type_Kind.boolean_literal = 5;
    const type_object: Type_Kind.object = 6;
    const type_union: Type_Kind.union = 7;
    const type_intersection: Type_Kind.intersection = 8;
    const type_enum_member: Type_Kind.enum_member = 9;
    const type_enum: Type_Kind.enum = 10;
    const type_array: Type_Kind.array = 11;
    const type_any: Type_Kind.any = 12;
    const type_undefined: Type_Kind.undefined = 13;
    const type_generic: Type_Kind.generic = 14;

    type Serialization_Context = {
        enums: SimpleTypeEnum[]
        named_types: Record<string, ts.Expression>
        back_patches: Back_Patch[]
    }

    type Back_Patch = {
        with_what: string
        path: Path_Fragment[]
    }

    type Path_Fragment = number | string

    function serialize_type_to_function(type: SimpleType) {
        const context: Serialization_Context = {
            enums: [],
            named_types: {},
            back_patches: []
        };

        const root_name = "__root";
        context.named_types[root_name] = serialize_type(type, context, [ root_name ]);

        const statements: ts.Statement[] = [];

        for (const [name, expression] of Object.entries(context.named_types)) {
            const declaration = ts.createVariableDeclaration(name, undefined, expression);
            const declaration_list = ts.createVariableDeclarationList([ declaration ], ts.NodeFlags.Const);
            statements.push(ts.createVariableStatement(undefined, declaration_list));
        }

        for (const patch of context.back_patches) {
            let chain: ts.Expression | undefined = undefined;

            for (let index = 1; index < patch.path.length; index++) {
                const fragment = patch.path[index];
                const parent = chain ? chain : ts.createIdentifier(patch.path[0] as string);

                if (typeof fragment == "string") {
                    chain = ts.createPropertyAccess(parent, fragment);
                } else {
                    chain = ts.createElementAccess(parent, options.lua_array_access ? (fragment + 1) : fragment);
                }
            }

            // @Hack to shut up TSTL
            chain.parent = ts.createIdentifier("");

            statements.push(ts.createExpressionStatement(ts.createAssignment(chain, ts.createIdentifier(patch.with_what))));
        }

        return ts.createImmediatelyInvokedArrowFunction([
            ...statements,
            ts.createReturn(ts.createIdentifier(root_name))
        ]);
    }

    function serialize_type(type: SimpleType, context: Serialization_Context, path: Path_Fragment[]): ts.Expression {
        switch (type.kind) {
            case SimpleTypeKind.ALIAS: {
                const already_serialized = context.named_types[type.name];

                if (!already_serialized) {
                    context.named_types[type.name] = ts.createLiteral(0); // Placeholder for recursion
                    context.named_types[type.name] = serialize_type(type.target, context, [ type.name ]);
                }

                context.back_patches.push({
                    with_what: type.name,
                    path: path
                });

                return ts.createLiteral("");
            }

            case SimpleTypeKind.ENUM: {
                const members = type.types.map((member, index) => serialize_type(member, context, path.concat("members", index)));

                return ts.createObjectLiteral([
                    ts.createPropertyAssignment("kind", ts.createLiteral(type_enum)),
                    ts.createPropertyAssignment("name", ts.createLiteral(type.name)),
                    ts.createPropertyAssignment("members", ts.createArrayLiteral(members)),
                ], true);
            }

            case SimpleTypeKind.CIRCULAR_TYPE_REF: {
                return serialize_type(type.ref, context, path);
            }

            case SimpleTypeKind.OBJECT: {
                const members = type.members.map((member, index) => ts.createObjectLiteral([
                    ts.createPropertyAssignment("optional", ts.createLiteral(member.optional)),
                    ts.createPropertyAssignment("name", ts.createLiteral(member.name)),
                    ts.createPropertyAssignment("type", serialize_type(member.type, context, path.concat("members", index, "type")))
                ], true));

                return ts.createObjectLiteral([
                    ts.createPropertyAssignment("kind", ts.createLiteral(type_object)),
                    ts.createPropertyAssignment("members", ts.createArrayLiteral(members))
                ], true);
            }

            case SimpleTypeKind.GENERIC_ARGUMENTS: {
                const type_args = type.typeArguments.map((member_type, index) => serialize_type(member_type, context, path.concat("arguments", index)));

                return ts.createObjectLiteral([
                    ts.createPropertyAssignment("kind", ts.createLiteral(type_generic)),
                    ts.createPropertyAssignment("target", serialize_type(type.target, context, path.concat("target"))),
                    ts.createPropertyAssignment("arguments", ts.createArrayLiteral(type_args))
                ], true);
            }

            case SimpleTypeKind.INTERSECTION: {
                const types = type.types.map((member_type, index) => serialize_type(member_type, context, path.concat("types", index)));

                return ts.createObjectLiteral([
                    ts.createPropertyAssignment("kind", ts.createLiteral(type_intersection)),
                    ts.createPropertyAssignment("types", ts.createArrayLiteral(types))
                ], true);
            }

            case SimpleTypeKind.UNION: {
                const types = type.types.map((member_type, index) => serialize_type(member_type, context, path.concat("types", index)));

                return ts.createObjectLiteral([
                    ts.createPropertyAssignment("kind", ts.createLiteral(type_union)),
                    ts.createPropertyAssignment("types", ts.createArrayLiteral(types))
                ], true);
            }

            case SimpleTypeKind.ENUM_MEMBER: {
                return ts.createObjectLiteral([
                    ts.createPropertyAssignment("kind", ts.createLiteral(type_enum_member)),
                    ts.createPropertyAssignment("name", ts.createLiteral(type.name)),
                    ts.createPropertyAssignment("full_name", ts.createLiteral(type.fullName)),
                    ts.createPropertyAssignment("type", serialize_type(type.type, context, path.concat("type"))),
                ], true);
            }

            case SimpleTypeKind.ARRAY: {
                return ts.createObjectLiteral([
                    ts.createPropertyAssignment("kind", ts.createLiteral(type_array)),
                    ts.createPropertyAssignment("type", serialize_type(type.type, context, path.concat("type")))
                ], true);
            }

            case SimpleTypeKind.ANY: {
                return ts.createObjectLiteral([ ts.createPropertyAssignment("kind", ts.createLiteral(type_any)) ]);
            }

            case SimpleTypeKind.UNDEFINED:{
                return ts.createObjectLiteral([ ts.createPropertyAssignment("kind", ts.createLiteral(type_undefined)) ]);
            }

            case SimpleTypeKind.STRING:{
                return ts.createObjectLiteral([ ts.createPropertyAssignment("kind", ts.createLiteral(type_string)) ]);
            }

            case SimpleTypeKind.NUMBER:{
                return ts.createObjectLiteral([ ts.createPropertyAssignment("kind", ts.createLiteral(type_number)) ]);
            }

            case SimpleTypeKind.BOOLEAN: {
                return ts.createObjectLiteral([ ts.createPropertyAssignment("kind", ts.createLiteral(type_boolean)) ]);
            }

            case SimpleTypeKind.NUMBER_LITERAL: {
                return ts.createObjectLiteral([
                    ts.createPropertyAssignment("kind", ts.createLiteral(type_number_literal)),
                    ts.createPropertyAssignment("value", ts.createLiteral(type.value))
                ], true);
            }

            case SimpleTypeKind.STRING_LITERAL:{
                return ts.createObjectLiteral([
                    ts.createPropertyAssignment("kind", ts.createLiteral(type_string_literal)),
                    ts.createPropertyAssignment("value", ts.createLiteral(type.value))
                ], true);
            }

            case SimpleTypeKind.BOOLEAN_LITERAL: {
                return ts.createObjectLiteral([
                    ts.createPropertyAssignment("kind", ts.createLiteral(type_boolean_literal)),
                    ts.createPropertyAssignment("value", ts.createLiteral(type.value))
                ], true);
            }

            default: {
                throw "Unsupported type " + type.kind;
            }
        }
    }

    function process_node(node: ts.Node): ts.Node | undefined {
        if (utils.isPrefixUnaryExpression(node)) {
            if (node.operator == SyntaxKind.ExclamationToken) {
                const operand = node.operand;
                const type = checker.getTypeAtLocation(operand);
                const is_not_any = (type.flags & TypeFlags.Any) == 0;

                if (is_not_any && utils.isTypeAssignableToNumber(checker, type)) {
                    error_out(node, `Implicitly coercing number to boolean in expression '${node.getText()}', use != undefined instead`);
                }
            }
        } else if (utils.isCallExpression(node)) {
            const signature = checker.getResolvedSignature(node);
            const decl = signature.declaration;

            if (!decl) return;

            if (decl.kind == ts.SyntaxKind.FunctionDeclaration) {
                const function_name = decl.name.escapedText;

                if (function_name == "type_of") {
                    const argument = resolve_alias(toSimpleType(node.typeArguments[0], checker));
                    return serialize_type_to_function(argument);
                }

                if (function_name == "enum_to_string") {
                    const argument = node.arguments[0];
                    const type = resolve_alias(toSimpleType(argument, checker));
                    const enum_members: SimpleTypeEnumMember[] = resolve_enum_members(type);

                    ok:
                    if (type.kind == SimpleTypeKind.GENERIC_PARAMETER) {
                        if (node.typeArguments) {
                            const type_arg = node.typeArguments[0];

                            if (type_arg) {
                                const arg_type = resolve_alias(toSimpleType(type_arg, checker));

                                enum_members.length = 0;
                                enum_members.push(...resolve_enum_members(arg_type));

                                break ok;
                            }
                        }

                        error_out(argument, "Generic parameters not supported, specify the type in type arguments");
                    }

                    if (enum_members.length == 1) {
                        return ts.createStringLiteral(enum_members[0].name);
                    }

                    if (enum_members.length > 10) {
                        const properties = enum_members.map(member => {
                            if (member.type.kind == SimpleTypeKind.NUMBER_LITERAL) {
                                return ts.createPropertyAssignment(ts.createComputedPropertyName(ts.createLiteral(member.type.value)), ts.createStringLiteral(member.name));
                            }

                            error_out(argument, "Unsupported member type " + member.type);
                        });

                        return ts.createElementAccess(ts.createObjectLiteral(properties, true), argument);
                    }

                    const cases = enum_members.map(member => {
                        if (member.type.kind == SimpleTypeKind.NUMBER_LITERAL) {
                            return ts.createCaseClause(ts.createLiteral(member.type.value), [
                                ts.createReturn(ts.createStringLiteral(member.name))
                            ]);
                        }

                        error_out(argument, "Unsupported member type " + member.type);
                    });

                    const inline_function_argument_name = "value";
                    const switch_expression = ts.createSwitch(ts.createIdentifier(inline_function_argument_name), ts.createCaseBlock(cases));
                    const code_block = ts.createBlock([
                        switch_expression
                    ]);

                    const arrow_function = ts.createArrowFunction(
                        undefined,
                        undefined,
                        [
                            ts.createParameter(undefined, undefined, undefined, inline_function_argument_name)
                        ],
                        undefined,
                        undefined,
                        code_block
                    );

                    return ts.createCall(arrow_function, undefined, [argument]);
                } else if (function_name == "enum_names_to_values") {
                    const argument = resolve_alias(toSimpleType(node.typeArguments[0], checker));
                    const enum_members: SimpleTypeEnumMember[] = resolve_enum_members(argument);

                    return ts.createArrayLiteral(enum_members.map(member => {
                        const literal = enum_member_to_literal(member);

                        if (!literal) {
                            error_out(node, "Unsupported member type " + member.type);
                        }

                        return ts.createArrayLiteral([ ts.createStringLiteral(member.name), literal ]);
                    }), true);
            } else if (function_name == "enum_values") {
                    const argument = resolve_alias(toSimpleType(node.typeArguments[0], checker));
                    const enum_members: SimpleTypeEnumMember[] = resolve_enum_members(argument);

                    return ts.createArrayLiteral(enum_members.map(member => {
                        const literal = enum_member_to_literal(member);

                        if (!literal) {
                            error_out(node, "Unsupported member type " + member.type);
                        }

                        return literal;
                    }), true);
                } else if (function_name == "embed_base64") {
                    const argument = node.arguments[0];
                    const type = resolve_alias(toSimpleType(checker.getTypeAtLocation(argument), checker));

                    if (type.kind == SimpleTypeKind.STRING_LITERAL) {
                        const config_file = (program.getCompilerOptions() as { configFilePath: string }).configFilePath;
                        const project_directory = path.dirname(config_file);
                        const resolved_path = path.resolve(project_directory, type.value);

                        console.log("Reading", cyan, path.relative(process.cwd(), resolved_path), reset);

                        return ts.createStringLiteral(readFileSync(resolved_path, "base64"));
                    } else {
                        error_out(argument, "Only string literals are supported, " + type.kind + " given");
                    }
                } else if (function_name == "spell" || function_name == "active_ability" || function_name == "passive_ability") {
                    const type = resolve_alias(toSimpleType(node.typeArguments[0], checker));
                    const argument = node.arguments[0];

                    const base_type_members = extract_members([ type ]);
                    const result_properties: ts.PropertyAssignment[] = [];

                    for (const base_type_member of base_type_members) {
                        if (base_type_member.type.kind == SimpleTypeKind.ENUM_MEMBER) {
                            const enum_member = base_type_member.type;

                            if (enum_member.type.kind == SimpleTypeKind.NUMBER_LITERAL) {
                                const assignment = ts.createPropertyAssignment(base_type_member.name, ts.createLiteral(enum_member.type.value));

                                ts.addSyntheticTrailingComment(assignment, ts.SyntaxKind.MultiLineCommentTrivia, enum_member.name);

                                result_properties.push(assignment);
                            } else {
                                error_out(argument, "Unsupported base type member type: " + enum_member.type.kind)
                            }
                        }
                    }

                    const argument_properties = object_to_property_assignments(argument as ts.ObjectLiteralExpression);

                    result_properties.push(...argument_properties);

                    return ts.createObjectLiteral(result_properties, true);
                } else if (function_name == "copy") {
                    const argument = node.arguments[0];
                    const type = resolve_alias(toSimpleType(argument, checker));

                    if (type.kind == SimpleTypeKind.UNION || type.kind == SimpleTypeKind.INTERSECTION) {
                        const set: Record<string, undefined> = {};

                        extract_members(type.types).map(member => member.name).forEach(name => set[name] = undefined);

                        const member_names = Object.keys(set);

                        return ts.createObjectLiteral(member_names.map(name => ts.createPropertyAssignment(name, ts.createPropertyAccess(argument, name))), true)
                    }

                    if (type.kind == SimpleTypeKind.OBJECT) {
                        return copy_object(argument, type);
                    }

                    error_out(argument, "Unsupported argument type " + type.kind);
                }
            }

            return;
        }
    }

    function process_source_file(context: ts.TransformationContext, file: ts.SourceFile) {
        console.log("Processing", cyan, path.relative(process.cwd(), file.fileName), reset);

        function visitor(node: ts.Node): ts.Node {
            const new_node_or_nothing = process_node(node);

            if (new_node_or_nothing != undefined) {
                return new_node_or_nothing;
            }

            return ts.visitEachChild(node, visitor, context);
        }

        return ts.visitEachChild(file, visitor, context);
    }

    function process_and_update_source_file(context: ts.TransformationContext, file: ts.SourceFile) {
        const updated_node = process_source_file(context, file);

        return ts.updateSourceFileNode(
            file,
            updated_node.statements,
            updated_node.isDeclarationFile,
            updated_node.referencedFiles,
            updated_node.typeReferenceDirectives,
            updated_node.hasNoDefaultLib
        );
    }

    return context => (node: ts.Node) => {
        try {
            if (ts.isBundle(node)) {
                const new_files = node.sourceFiles.map(file => process_and_update_source_file(context, file));

                return ts.updateBundle(node, new_files);
            } else if (ts.isSourceFile(node)) {
                return process_and_update_source_file(context, node);
            }
        } catch (e) {
            console.error(e);
            throw e;
        }

        return node;
    }
}