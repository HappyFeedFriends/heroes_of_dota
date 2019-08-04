import * as ts from "typescript";
import {SimpleType, SimpleTypeEnumMember, SimpleTypeKind, toSimpleType} from "ts-simple-type";
import {readFileSync} from "fs";
import * as path from "path";

export interface Options {
}

export default function run_transformer(program: ts.Program, options: Options): ts.TransformerFactory<ts.Node> {
    const checker = program.getTypeChecker();

    function error_out(node: ts.Node, error: string) {
        const source = node.getSourceFile();
        const { line, character } = source.getLineAndCharacterOfPosition(node.getStart());
        throw new Error(`ERROR: ${source.fileName}:${line + 1},${character + 1} / ${error}`);
    }

    function resolve_alias(type: SimpleType): SimpleType {
        return type.kind == SimpleTypeKind.ALIAS ? type.target : type;
    }

    function resolve_enum_members(type: SimpleType): SimpleTypeEnumMember[] {
        const enum_members: SimpleTypeEnumMember[] = [];

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

    function process_node(node: ts.Node): ts.Node | undefined {
        if (node.kind == ts.SyntaxKind.CallExpression) {
            const call = node as ts.CallExpression;
            const signature = checker.getResolvedSignature(call);
            const decl = signature.declaration;

            if (!decl) return;

            if (decl.kind == ts.SyntaxKind.FunctionDeclaration) {
                const function_name = decl.name.escapedText;

                if (function_name == "enum_to_string") {
                    const argument = call.arguments[0];
                    const type = resolve_alias(toSimpleType(checker.getTypeAtLocation(argument), checker));
                    const enum_members: SimpleTypeEnumMember[] = resolve_enum_members(type);

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
                } else if (function_name == "enum_values") {
                    const argument = resolve_alias(toSimpleType(call.typeArguments[0], checker));
                    const enum_members: SimpleTypeEnumMember[] = resolve_enum_members(argument);

                    return ts.createArrayLiteral(enum_members.map(member => {
                        if (member.type.kind == SimpleTypeKind.NUMBER_LITERAL) {
                            const literal = ts.createLiteral(member.type.value);

                            ts.addSyntheticTrailingComment(literal, ts.SyntaxKind.MultiLineCommentTrivia, member.name);

                            return literal;
                        }

                        error_out(call, "Unsupported member type " + member.type);
                    }), true);
                } else if (function_name == "embed_base64") {
                    const argument = call.arguments[0];
                    const type = resolve_alias(toSimpleType(checker.getTypeAtLocation(argument), checker));

                    if (type.kind == SimpleTypeKind.STRING_LITERAL) {
                        const config_file = (program.getCompilerOptions() as { configFilePath: string }).configFilePath;
                        const project_directory = path.dirname(config_file);
                        const resolved_path = path.resolve(project_directory, type.value);

                        console.log("Reading", resolved_path);

                        return ts.createStringLiteral(readFileSync(resolved_path, "base64"));
                    } else {
                        error_out(argument, "Only string literals are supported, " + type.kind + " given");
                    }

                }
            }

            return;
        }
    }

    function process_source_file(context: ts.TransformationContext, file: ts.SourceFile) {
        console.log("Processing", file.fileName);

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
        if (ts.isBundle(node)) {
            const new_files = node.sourceFiles.map(file => process_and_update_source_file(context, file));

            return ts.updateBundle(node, new_files);
        } else if (ts.isSourceFile(node)) {
            return process_and_update_source_file(context, node);
        }

        return node;
    }
}