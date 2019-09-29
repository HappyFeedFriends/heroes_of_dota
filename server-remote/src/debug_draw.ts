export const cell_size = 36;

let context: Debug_Draw_Cmd[] = [];
let debug_ai_data = empty_debug_ai_data();
let commands_for_color_rescaling: Debug_Draw_Cmd[] | undefined = undefined;

function empty_debug_ai_data(): Debug_AI_Data {
    return {
        unit_debug: []
    }
}

export function push_color_rescale() {
    commands_for_color_rescaling = [];
}

export function clear_debug_ai_data() {
    debug_ai_data = empty_debug_ai_data();
}

export function get_debug_ai_data(): Debug_AI_Data {
    return debug_ai_data;
}

export function rescale_colors(clr_from: number, clr_to: number) {
    if (commands_for_color_rescaling && commands_for_color_rescaling.length > 0) {
        const just_colors = commands_for_color_rescaling.map(cmd => cmd.clr);
        const from = just_colors.reduce((prev, val) => prev < val ? prev : val);
        const to = just_colors.reduce((prev, val) => prev >= val ? prev : val);
        const len = Math.abs(to - from);
        const clr_len = clr_to - clr_from;

        for (const cmd of commands_for_color_rescaling) {
            if (len == 0) {
                cmd.clr = clr_to;
            } else {
                const progress = (cmd.clr - from) / len;
                cmd.clr = Math.floor(clr_from + clr_len * progress);
            }
        }

        commands_for_color_rescaling = undefined;
    }
}

export function push_debug_context(owner: Unit) {
    context = [];

    debug_ai_data.unit_debug.push({
        unit_id: owner.id,
        cmds: context
    })
}

function push_cmd(cmd: Debug_Draw_Cmd) {
    if (debug_ai_data.unit_debug.length > 0) {
        debug_ai_data.unit_debug[debug_ai_data.unit_debug.length - 1].cmds.push(cmd);

        if (commands_for_color_rescaling) {
            commands_for_color_rescaling.push(cmd);
        }
    }
}

export namespace debug {
    export function line(clr: number, x1: number, y1: number, x2: number, y2: number) {
        push_cmd({
            type: Debug_Draw_Cmd_Type.line,
            clr: clr,
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2
        });
    }

    export function arrow(clr: number, from: XY, to: XY) {
        const half = +cell_size / 2;
        const x1 = from.x * cell_size + half;
        const y1 = from.y * cell_size + half;
        const x2 = to.x * cell_size + half;
        const y2 = to.y * cell_size + half;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length == 0) {
            return;
        }

        const nx = dx / length;
        const ny = dy / length;

        const angle = Math.atan2(ny, nx);

        function polar(angle_delta: number): [number, number] {
            return [
                x2 + Math.cos(angle + angle_delta) * cell_size / 2,
                y2 + Math.sin(angle + angle_delta) * cell_size / 2
            ]
        }

        const arrow_left = polar(Math.PI * 0.8);
        const arrow_right = polar(-Math.PI * 0.8);

        line(clr, x1, y1, x2, y2);
        line(clr, x2, y2, arrow_left[0], arrow_left[1]);
        line(clr, x2, y2, arrow_right[0], arrow_right[1]);
    }

    export function rect(clr: number, x1: number, y1: number, x2: number, y2: number) {
        push_cmd({
            type: Debug_Draw_Cmd_Type.rect,
            clr: clr,
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2
        });
    }

    export function text(clr: number, x: number, y: number, text: string) {
        push_cmd({
            type: Debug_Draw_Cmd_Type.text,
            clr: clr,
            text: text,
            x: x,
            y: y
        });
    }

    export function circle(clr: number, x: number, y: number, r: number) {
        push_cmd({
            type: Debug_Draw_Cmd_Type.circle,
            clr: clr,
            x: x,
            y: y,
            r: r
        });
    }
}
