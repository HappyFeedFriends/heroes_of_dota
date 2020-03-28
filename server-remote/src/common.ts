export interface XY {
    x: number;
    y: number;
}

export type Id_Generator = () => number;

export function xy(x: number, y: number): XY {
    return { x: x, y: y };
}

export function xy_equal(a: XY, b: XY) {
    return a.x == b.x && a.y == b.y;
}

export function unreachable(x: never): never {
    throw new Error("Didn't expect to get here");
}

export function try_string_to_enum_value<T>(value: string, enum_values: [string, T][]): T | undefined {
    const result = enum_values.find(([name]) => value == name);

    if (!result) {
        return undefined;
    }

    return result[1];
}