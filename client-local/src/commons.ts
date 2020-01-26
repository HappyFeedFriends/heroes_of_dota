export type XYZ = { x: number, y: number, z: number };
export type RGB = [ number, number, number ] & { _color_id_brand: any };
export const enum Align_H { left, center, right}
export const enum Align_V { top, center, bottom}

export declare const enum Const {
    hand_base_x = 400,
    hand_base_y = 957,

    battle_cell_size = 144,

    map_camera_height = 1300
}

export type Error_Reason = {
    reason: number,
    message?: string
};

interface Temporary_Storage_Panel extends Panel {
    temporary_particles: ParticleId[] | undefined;
}

export function xyz(x: number, y: number, z: number): XYZ {
    return { x: x, y: y, z: z };
}

export function xyz_to_array(xyz: XYZ): [ number, number, number ] {
    return [xyz.x, xyz.y, xyz.z];
}

export function rgb(r: number, g: number, b: number): RGB {
    return [r, g, b] as RGB;
}

export function get_screen_world_position(cursor: [number, number]): XYZ | undefined {
    const position = GameUI.GetScreenWorldPosition(cursor);

    if (!position) {
        return;
    }

    return xyz(position[0], position[1], position[2]);
}

export function position_panel_over_position_in_the_world(panel: Panel, position: XYZ, h: Align_H, v: Align_V) {
    const screen_ratio = Game.GetScreenHeight() / 1080;

    const screen_x = Game.WorldToScreenX(position.x, position.y, position.z);
    const screen_y = Game.WorldToScreenY(position.x, position.y, position.z);

    if (screen_x == -1 || screen_y == -1) {
        return;
    }

    let panel_offset_x = 0;
    let panel_offset_y = 0;

    if (h == Align_H.center) panel_offset_x = panel.actuallayoutwidth / 2.0;
    if (h == Align_H.left) panel_offset_x = panel.actuallayoutwidth;

    if (v == Align_V.center) panel_offset_y = panel.actuallayoutheight / 2.0;
    if (v == Align_V.top) panel_offset_y = panel.actuallayoutheight;

    panel.style.x = Math.floor(screen_x / screen_ratio - panel_offset_x) + "px";
    panel.style.y = Math.floor(screen_y / screen_ratio - panel_offset_y) + "px";
}

export function get_entity_under_cursor(cursor: [ number, number ]): EntityId | undefined {
    const entities_under_cursor = GameUI.FindScreenEntities(cursor);

    for (const entity of entities_under_cursor) {
        if (entity.accurateCollision) {
            return entity.entityIndex;
        }
    }

    if (entities_under_cursor.length > 0) {
        return entities_under_cursor[0].entityIndex;
    }

    return undefined;
}

export function safely_set_panel_background_image(panel: Panel, image: string) {
    panel.style.backgroundImage = `url('${image}')`;
    panel.AddClass("fix_bg");
    panel.RemoveClass("fix_bg");
}

export function from_server_array<T>(array: Array<T>): Array<T> {
    const result: Array<T> = [];

    for (const index in array) {
        result[parseInt(index) - 1] = array[index];
    }

    return result;
}

export function register_particle_for_reload(particle: ParticleId) {
    if (!Game.IsInToolsMode()) {
        return;
    }

    const storage = $.GetContextPanel() as Temporary_Storage_Panel;

    let array: ParticleId[] | undefined = storage.temporary_particles;

    if (!array) {
        array = [];
        storage.temporary_particles = array;
    }

    array.push(particle);
}

export function destroy_fx(id: ParticleId) {
    Particles.DestroyParticleEffect(id, false);
    Particles.ReleaseParticleIndex(id);
}

export function emit_random_sound(sounds: string[]) {
    Game.EmitSound(sounds[random_int_up_to(sounds.length)]);
}

function random_int_up_to(upper_bound: number) {
    return Math.floor(Math.random() * upper_bound);
}

export function custom_error(message: string) {
    return { reason: 80, message: message };
}

export function show_error_ui(reason: Error_Reason): undefined {
    GameEvents.SendEventClientSide("dota_hud_error_message", reason);

    return;
}

export function show_generic_error(error: string) {
    GameEvents.SendEventClientSide("dota_hud_error_message", { reason: 80, message: error });
}

function clean_up_particles_after_reload() {
    if (!Game.IsInToolsMode()) {
        return;
    }

    const storage = $.GetContextPanel() as Temporary_Storage_Panel;

    if (storage.temporary_particles) {
        for (const particle of storage.temporary_particles) {
            Particles.DestroyParticleEffect(particle, true);
            Particles.ReleaseParticleIndex(particle);
        }

        $.Msg(`Cleaned up ${storage.temporary_particles.length} temporary particles`);

        storage.temporary_particles = [];
    }
}

clean_up_particles_after_reload();