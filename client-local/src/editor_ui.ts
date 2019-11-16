const editor_root = $("#editor_ui");
const buttons_root = editor_root.FindChildTraverse("editor_buttons");
const indicator = editor_root.FindChildTraverse("editor_indicator");
const entity_panel = indicator.FindChildTraverse("editor_entity_panel");
const context_menu = indicator.FindChildTraverse("editor_context_menu");
const brushes_root = indicator.FindChildTraverse("editor_brushes");
const entrance_indicator = indicator.FindChildTraverse("editor_entrance_indicator");

const entity_buttons = entity_panel.FindChildTraverse("editor_entity_buttons");
const entity_buttons_dropdown = entity_panel.FindChildTraverse("editor_entity_dropdown");

// To prevent click-through
entity_panel.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {});

const enum Editor_Type {
    none,
    adventure,
    battleground
}

const enum Battleground_Brush_Type {
    select = 0,
    trees = 1
}

type Adventure_Editor = {
    type: Editor_Type.adventure
    selection: Adventure_Editor_Selection
    camera_height_index: number
    room_entrance_location: XY | undefined
}

type Battleground_Editor = {
    type: Editor_Type.battleground
    cells: Editor_Cell[][]
    grid_world_origin: {
        x: number
        y: number
        z: number
    }
    grid_size: XY
    cell_under_cursor?: Editor_Cell
    spawns: Battleground_Spawn[]
    brush: Battleground_Brush
}

type Editor_Cell = {
    position: XY
    particle: ParticleId
}

type Editor = { type: Editor_Type.none } | Adventure_Editor | Battleground_Editor

type Adventure_Editor_Selection = {
    selected: false
} | {
    selected: true
    id: Adventure_Entity_Id
    type: Adventure_Entity_Type.enemy
    entity: EntityId
    particle: ParticleId
    creeps: Creep_Type[]
    highlighted_creep_button?: Panel
} | {
    selected: true
    type: Adventure_Entity_Type.lost_creep
    id: Adventure_Entity_Id
    entity: EntityId
    particle: ParticleId
}

type Battleground_Brush = {
    type: Battleground_Brush_Type.select
    selected: Editor_Cell[]
    selection_outline: ParticleId[]
    drag_state: {
        dragging: false
    } | {
        dragging: true
        outline: ParticleId[]
        start_at: XY
    }
} | {
    type: Battleground_Brush_Type.trees
}

let pinned_context_menu_position: XYZ = [0, 0, 0];
let context_menu_particle: ParticleId | undefined = undefined;
let editor: Editor = { type: Editor_Type.none };

const adventure_editor: Adventure_Editor = {
    type: Editor_Type.adventure,
    selection: { selected: false },
    camera_height_index: 4,
    room_entrance_location: undefined
};

function text_button(parent: Panel, css_class: string, text: string, action: (button: Panel) => void) {
    const button = $.CreatePanel("Panel", parent, "");
    button.AddClass(css_class);
    button.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => action(button));

    $.CreatePanel("Label", button, "").text = text;

    return button;
}

function editor_button(text: string, action: () => void) {
    return text_button(buttons_root, "editor_button", text, action);
}

function brush_button(text: string, action: () => void) {
    return text_button(brushes_root, "brush_button", text, action);
}

function dispatch_editor_action(event: Editor_Action) {
    fire_event(To_Server_Event_Type.editor_action, event);
}

function update_editor_indicator(editor: Editor) {
    indicator.style.visibility = editor.type != Editor_Type.none ? "visible" : "collapse";
}

function update_editor_camera_height(editor: Editor) {
    GameUI.SetCameraDistance(editor.type == Editor_Type.adventure ? 1200 + 200 * editor.camera_height_index : map_camera_height);
}

function enum_value_from_modifier<T extends number>(entity: EntityId, modifier_name: string): T | undefined {
    const num_buffs = Entities.GetNumBuffs(entity);

    for (let index = 0; index < num_buffs; index++) {
        const buff = Entities.GetBuff(entity, index);

        if (Buffs.GetName(entity, buff) == modifier_name) {
            return Buffs.GetStackCount(entity, buff) as T;
        }
    }
}

function drop_adventure_editor_selection(editor: Adventure_Editor) {
    if (editor.selection.selected) {
        Particles.DestroyParticleEffect(editor.selection.particle, false);
        Particles.ReleaseParticleIndex(editor.selection.particle);
    }

    editor.selection = {
        selected: false
    };

    entity_buttons.RemoveAndDeleteChildren();
    entity_buttons_dropdown.RemoveAndDeleteChildren();
}

function entity_button(text: string, action: (button: Panel) => void, css_class: string = "editor_entity_button") {
    return text_button(entity_buttons, css_class, text, action);
}

function dropdown_button(text: string, action: () => void) {
    return text_button(entity_buttons_dropdown, "editor_entity_dropdown_button", text, action);
}

function create_adventure_enemy_menu_buttons(editor: Adventure_Editor, adventure_entity_id: Adventure_Entity_Id, creeps: Creep_Type[], reselect: () => void) {
    for (let index = 0; index < creeps.length + 1; index++) {
        const creep = creeps[index];
        const text = index < creeps.length ? enum_to_string(creep) : "Add a creep";

        entity_button(text, (button) => {
            entity_buttons_dropdown.RemoveAndDeleteChildren();

            let show_dropdown = true;

            const selection = editor.selection;

            if (selection.selected && selection.type == Adventure_Entity_Type.enemy) {
                if (selection.highlighted_creep_button) {
                    selection.highlighted_creep_button.RemoveClass("selected");
                }

                if (selection.highlighted_creep_button != button) {
                    selection.highlighted_creep_button = button;
                    selection.highlighted_creep_button.AddClass("selected");
                } else {
                    selection.highlighted_creep_button = undefined;
                    show_dropdown = false;
                }
            }

            if (!show_dropdown) return;

            for (const [name, type] of enum_names_to_values<Creep_Type>()) {
                dropdown_button(name, () => {
                    creeps[index] = type;

                    api_request(Api_Request_Type.editor_action, {
                        type: Adventure_Editor_Action_Type.edit_enemy_deck,
                        entity_id: adventure_entity_id,
                        creeps: creeps,
                        access_token: get_access_token()
                    }, reselect);
                });
            }
        });
    }
}

function adventure_editor_select_entity(editor: Adventure_Editor, entity: EntityId, adventure_entity_id: Adventure_Entity_Id, entity_type: Adventure_Entity_Type, name: string) {
    if (editor.selection.selected) {
        drop_adventure_editor_selection(editor);
    }

    function create_delete_button() {
        entity_button("Delete", () => {
            dispatch_editor_action({
                type: Editor_Action_Type.delete_entity,
                entity_id: adventure_entity_id
            })
        }, "editor_entity_delete_button");
    }

    if (entity_type == Adventure_Entity_Type.enemy) {
        api_request(Api_Request_Type.editor_get_enemy_deck, {
            entity_id: adventure_entity_id,
            access_token: get_access_token()
        }, data => {
            const fx = Particles.CreateParticle("particles/shop_arrow.vpcf", ParticleAttachment_t.PATTACH_OVERHEAD_FOLLOW, entity);

            register_particle_for_reload(fx);

            editor.selection = {
                selected: true,
                type: Adventure_Entity_Type.enemy,
                id: adventure_entity_id,
                entity: entity,
                particle: fx,
                creeps: data.creeps
            };

            const selection_label = $.CreatePanel("Label", entity_buttons, "editor_selected_entity");
            selection_label.text = `Selected: ${name}`;

            create_adventure_enemy_menu_buttons(editor, adventure_entity_id, data.creeps, () => {
                adventure_editor_select_entity(editor, entity, adventure_entity_id, entity_type, name);
            });

            create_delete_button();
        });
    } else {
        const fx = Particles.CreateParticle("particles/shop_arrow.vpcf", ParticleAttachment_t.PATTACH_OVERHEAD_FOLLOW, entity);

        register_particle_for_reload(fx);

        const selection_label = $.CreatePanel("Label", entity_buttons, "editor_selected_entity");
        selection_label.text = `Selected: ${name}`;

        editor.selection = {
            selected: true,
            type: entity_type,
            id: adventure_entity_id,
            entity: entity,
            particle: fx
        };

        create_delete_button();
    }
}

function hide_editor_context_menu() {
    context_menu.style.visibility = "collapse";

    if (context_menu_particle != undefined) {
        Particles.DestroyParticleEffect(context_menu_particle, true);
        Particles.ReleaseParticleIndex(context_menu_particle);
    }
}

function context_menu_button(text: string, action: () => void) {
    return text_button(context_menu, "context_menu_button", text, () => {
        hide_editor_context_menu();

        action();
    });
}

function update_editor_cells_outline(editor: Battleground_Editor, cells: Editor_Cell[], outline: ParticleId[]) {
    const indexed_cells: Editor_Cell[] = [];
    const highlighted_cells: boolean[] = [];

    const grid: World_Grid<Editor_Cell> = {
        cells: indexed_cells,
        world_origin: editor.grid_world_origin,
        size: editor.grid_size
    };

    for (const by_x of editor.cells) {
        for (const editor_cell of by_x) {
            indexed_cells[grid_cell_index(grid, editor_cell.position)] = editor_cell;
        }
    }

    for (let cell of cells) {
        highlighted_cells[grid_cell_index(grid, cell.position)] = true;
    }

    return update_outline(grid, outline, highlighted_cells, color_green);
}

function all_cells_within_bounds(editor: Battleground_Editor, from: XY, to: XY) {
    const min = xy(Math.min(from.x, to.x), Math.min(from.y, to.y));
    const max = xy(Math.max(from.x, to.x), Math.max(from.y, to.y));

    const result: Editor_Cell[] = [];

    for (const by_x of editor.cells) {
        for (const editor_cell of by_x) {
            const point = editor_cell.position;
            if (point.x >= min.x && point.y >= min.y && point.x <= max.x && point.y <= max.y) {
                result.push(editor_cell);
            }
        }
    }

    return result;
}

function battleground_editor_filter_mouse_click(editor: Battleground_Editor, event: MouseEvent, button: MouseButton | WheelScroll) {
    if (button != MouseButton.LEFT) {
        return;
    }

    const cursor = GameUI.GetCursorPosition();
    const world_position = GameUI.GetScreenWorldPosition(cursor);

    if (!world_position) {
        return;
    }

    const shift_down = GameUI.IsShiftDown();
    const position = world_position_to_battle_position(editor.grid_world_origin, world_position);
    const cell = editor_cell_by_xy(editor, position);
    const brush = editor.brush;

    const pressed = event == "pressed";
    const released = event == "released";

    if (!pressed && !released) {
        return;
    }

    switch (brush.type) {
        case Battleground_Brush_Type.select: {
            if (!cell) {
                if (pressed) {
                    brush.selected = [];
                    brush.selection_outline = update_editor_cells_outline(editor, brush.selected, brush.selection_outline);
                }

                break;
            }

            const drag_state = brush.drag_state;

            if (pressed) {
                if (!brush.drag_state.dragging) {
                    brush.drag_state = {
                        dragging: true,
                        outline: [],
                        start_at: position
                    }
                }
            } else if (released && drag_state.dragging) {
                const cells: Editor_Cell[] = all_cells_within_bounds(editor, drag_state.start_at, position);

                if (shift_down) {
                    const the_only_cell = cells[0];
                    if (cells.length == 1) {
                        const index_in_selection = brush.selected.findIndex(cell => xy_equal(the_only_cell.position, cell.position));

                        if (index_in_selection != -1) {
                            brush.selected.splice(index_in_selection, 1);
                        } else {
                            brush.selected.push(the_only_cell);
                        }
                    } else {
                        brush.selected.push(...cells);
                    }
                } else {
                    brush.selected = cells;
                }

                brush.selection_outline = update_editor_cells_outline(editor, brush.selected, brush.selection_outline);
                drag_state.outline.forEach(destroy_fx);
                brush.drag_state = { dragging: false };
            }

            break;
        }
    }
}

// Returns if event should be consumed or not
function adventure_editor_filter_mouse_click(editor: Adventure_Editor, event: MouseEvent, button: MouseButton | WheelScroll): boolean {
    if (event != "pressed") {
        return true;
    }

    hide_editor_context_menu();

    if (button == MouseButton.LEFT) {
        const entity_under_cursor = get_entity_under_cursor(GameUI.GetCursorPosition());

        if (entity_under_cursor != undefined) {
            const entity_type = enum_value_from_modifier<Adventure_Entity_Type>(entity_under_cursor, "Modifier_Editor_Adventure_Entity_Type");
            const entity_id = enum_value_from_modifier<Adventure_Entity_Id>(entity_under_cursor, "Modifier_Editor_Adventure_Entity_Id");
            const npc_type = enum_value_from_modifier<Npc_Type>(entity_under_cursor, "Modifier_Editor_Npc_Type");
            const name = `${npc_type != undefined ? enum_to_string(npc_type) : enum_to_string(entity_type)} (#${entity_id})`;

            if (entity_id != undefined && entity_type != undefined) {
                adventure_editor_select_entity(editor, entity_under_cursor, entity_id, entity_type, name);
            }
        } else {
            drop_adventure_editor_selection(editor);
        }

        return true;
    }

    if (button == MouseButton.RIGHT) {
        const click_world_position = Game.ScreenXYToWorld(...GameUI.GetCursorPosition());

        context_menu.style.visibility = "visible";
        context_menu.RemoveAndDeleteChildren();

        context_menu_particle = Particles.CreateParticle("particles/ui_mouseactions/ping_waypoint.vpcf", ParticleAttachment_t.PATTACH_WORLDORIGIN, 0);
        Particles.SetParticleControl(context_menu_particle, 0, click_world_position);

        if (editor.selection.selected) {
            context_menu_button(`Move here`, () => {
                if (!editor.selection.selected) return;

                dispatch_editor_action({
                    type: Editor_Action_Type.set_entity_position,
                    entity_id: editor.selection.id,
                    position: xy(click_world_position[0], click_world_position[1])
                });
            });

            context_menu_button(`Look here`, () => {
                if (!editor.selection.selected) return;

                const position = Entities.GetAbsOrigin(editor.selection.entity);
                const delta = [click_world_position[0] - position[0], click_world_position[1] - position[1]];
                const length = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);
                const facing = length > 0 ? [delta[0] / length, delta[1] / length, 0] : [1, 0, 0];

                dispatch_editor_action({
                    type: Editor_Action_Type.set_entity_facing,
                    entity_id: editor.selection.id,
                    facing: xy(facing[0], facing[1])
                });
            });
        } else {
            for (const [entity_name, entity_type] of enum_names_to_values<Adventure_Entity_Type>()) {
                if (entity_type == Adventure_Entity_Type.enemy) {
                    for (const [npc_name, npc_type] of enum_names_to_values<Npc_Type>()) {
                        context_menu_button(`Create ${npc_name}`, () => {
                            dispatch_editor_action({
                                type: Editor_Action_Type.create_entity,
                                definition: {
                                    type: entity_type,
                                    npc_type: npc_type,
                                    spawn_position: xy(click_world_position[0], click_world_position[1]),
                                    spawn_facing: xy(1, 0),
                                    creeps: []
                                }
                            })
                        });
                    }
                } else {
                    context_menu_button(`Create ${entity_name}`, () => {
                        dispatch_editor_action({
                            type: Editor_Action_Type.create_entity,
                            definition: {
                                type: entity_type,
                                spawn_position: xy(click_world_position[0], click_world_position[1]),
                                spawn_facing: xy(1, 0),
                            }
                        })
                    });
                }
            }

            context_menu_button(`Set entrance to here`, () => {
                api_request(Api_Request_Type.editor_action, {
                    type: Adventure_Editor_Action_Type.set_entrance,
                    entrance: xy(click_world_position[0], click_world_position[1]),
                    access_token: get_access_token()
                }, () => {
                    editor.room_entrance_location = xy(click_world_position[0], click_world_position[1]);
                });
            });

            context_menu_button(`Teleport here`, () => {
                dispatch_editor_action({
                    type: Editor_Action_Type.teleport,
                    position: xy(click_world_position[0], click_world_position[1])
                })
            });
        }

        pinned_context_menu_position = click_world_position;
    }

    return true;
}

function update_battleground_brush_from_cursor(editor: Battleground_Editor, position: XY, pressed: boolean, shift_down: boolean) {
    const brush = editor.brush;

    switch (brush.type) {
        case Battleground_Brush_Type.select: {
            const drag_state = brush.drag_state;

            if (drag_state.dragging) {
                const cells: Editor_Cell[] = all_cells_within_bounds(editor, drag_state.start_at, position);
                drag_state.outline = update_editor_cells_outline(editor, cells, drag_state.outline);
            }

            break;
        }

        case Battleground_Brush_Type.trees: {
            if (!pressed) break;

            const cell = editor_cell_by_xy(editor, position);
            if (!cell) break;

            const spawn_index = editor.spawns.findIndex(spawn => xy_equal(position, spawn.at));

            if (shift_down) {
                if (spawn_index != -1) {
                    editor.spawns.splice(spawn_index, 1);
                }
            } else {
                if (spawn_index == -1) {
                    editor.spawns.push({
                        type: Spawn_Type.tree,
                        at: position
                    });
                } else {
                    editor.spawns[spawn_index] = {
                        type: Spawn_Type.tree,
                        at: position
                    };
                }
            }

            submit_editor_battleground(editor);

            break;
        }
    }
}

function editor_cell_by_xy(editor: Battleground_Editor, xy: XY): Editor_Cell | undefined {
    const by_x = editor.cells[xy.x];
    if (!by_x) return;

    return by_x[xy.y];
}

function periodically_update_editor_ui() {
    $.Schedule(1 / 200, periodically_update_editor_ui);

    if (editor.type == Editor_Type.adventure) {
        if (editor.selection.selected) {
            if (!Entities.IsValidEntity(editor.selection.entity)) {
                drop_adventure_editor_selection(editor);
            }
        }

        if (editor.room_entrance_location) {
            const position_over: XYZ = [editor.room_entrance_location.x, editor.room_entrance_location.y, 256];

            position_panel_over_position_in_the_world(entrance_indicator, position_over, Align_H.center, Align_V.top);
        }
    }

    if (editor.type == Editor_Type.battleground) {
        const cursor = GameUI.GetCursorPosition();
        const world_position = GameUI.GetScreenWorldPosition(cursor);

        if (editor.cell_under_cursor) {
            Particles.SetParticleControl(editor.cell_under_cursor.particle, 2, GameUI.IsShiftDown() ? [255, 0, 0] : [0, 255, 0]);
            Particles.SetParticleControl(editor.cell_under_cursor.particle, 3, [255, 0, 0]);
        }

        if (world_position) {
            const battle_position = world_position_to_battle_position(editor.grid_world_origin, world_position);
            const actual_cell_under_cursor = editor_cell_by_xy(editor, battle_position);

            if (actual_cell_under_cursor != editor.cell_under_cursor) {
                if (editor.cell_under_cursor) {
                    Particles.SetParticleControl(editor.cell_under_cursor.particle, 2, [255, 255, 255]);
                    Particles.SetParticleControl(editor.cell_under_cursor.particle, 3, [ 10, 0, 0 ]);
                }

                editor.cell_under_cursor = actual_cell_under_cursor;
            }

            update_battleground_brush_from_cursor(editor, battle_position, GameUI.IsMouseDown(MouseButton.LEFT), GameUI.IsShiftDown());
        }
    }

    if (context_menu.style.visibility == "visible") {
        position_panel_over_position_in_the_world(context_menu, pinned_context_menu_position, Align_H.right, Align_V.bottom);
    }
}

function periodically_update_editor_camera_state() {
    $.Schedule(0.1, periodically_update_editor_camera_state);

    switch (editor.type) {
        case Editor_Type.adventure: {
            dispatch_editor_action({
                type: Editor_Action_Type.set_camera,
                camera: {
                    free: true
                }
            });

            break;
        }

        case Editor_Type.battleground: {
            dispatch_editor_action({
                type: Editor_Action_Type.set_camera,
                camera: {
                    free: false,
                    grid_size: editor.grid_size
                }
            });

            break;
        }
    }
}

function update_state_from_editor_mode(state: Player_State, editor: Editor) {
    entrance_indicator.style.visibility = editor.type == Editor_Type.adventure ? "visible" : "collapse";

    update_editor_indicator(editor);
    update_editor_camera_height(editor);

    if (editor.type == Editor_Type.none) {
        hide_editor_context_menu();
    }

    $.GetContextPanel().SetHasClass("in_editor", editor.type != Editor_Type.none);

    update_editor_buttons(state);
}

function update_adventure_editor_buttons(editor: Adventure_Editor) {
    editor_button("Toggle map vision", () => dispatch_editor_action({
        type: Editor_Action_Type.toggle_map_vision
    }));

    editor_button("Change camera height", () => {
        editor.camera_height_index = (editor.camera_height_index + 1) % 5;

        update_editor_camera_height(editor);
    });
}

function load_battleground_editor() {
    local_api_request(Local_Api_Request_Type.get_battle_position, {}, enter_battleground_editor);
}

function enter_battleground_editor(grid_world_origin: { x: number, y: number, z: number }) {
    const grid_w = 14;
    const grid_h = 10;

    const default_selection_brush: Battleground_Brush = {
        type: Battleground_Brush_Type.select,
        selected: [],
        selection_outline: [],
        drag_state: { dragging: false }
    };

    const new_editor: Battleground_Editor = {
        type: Editor_Type.battleground,
        cells: [],
        grid_size: xy(grid_w, grid_h),
        spawns: [],
        grid_world_origin: grid_world_origin,
        brush: default_selection_brush
    };

    editor = new_editor;

    const particle_bottom_left_origin: XYZ = [
        grid_world_origin.x + battle_cell_size / 2,
        grid_world_origin.y + battle_cell_size / 2,
        grid_world_origin.z
    ];

    for (let x = 0; x < grid_w; x++) {
        const by_x: Editor_Cell[] = [];

        for (let y = 0; y < grid_h; y++) {
            const particle = create_cell_particle_at([
                particle_bottom_left_origin[0] + x * battle_cell_size,
                particle_bottom_left_origin[1] + y * battle_cell_size,
                particle_bottom_left_origin[2]
            ]);

            Particles.SetParticleControl(particle, 3, [ 10, 0, 0 ]);

            by_x.push({
                position: xy(x, y),
                particle: particle
            });

            register_particle_for_reload(particle);
        }

        editor.cells[x] = by_x;
    }

    const buttons: Brush_Button[] = [];

    type Brush_Button = {
        panel: Panel
        brush: Battleground_Brush
    }

    function update_brush_button_styles() {
        for (const button of buttons) {
            button.panel.SetHasClass("active", button.brush == new_editor.brush);
        }
    }

    function set_brush_button(text: string, new_brush: Battleground_Brush) {
        const panel = brush_button(text, () => {
            new_editor.brush = new_brush;
            update_brush_button_styles();
        });

        buttons.push({
            brush: new_brush,
            panel: panel
        });
    }

    set_brush_button("Select", default_selection_brush);

    set_brush_button("Paint trees", {
        type: Battleground_Brush_Type.trees
    });

    update_brush_button_styles();
    submit_editor_battleground(editor);
    update_state_from_editor_mode(current_state, editor);
}

function enter_adventure_editor() {
    editor = adventure_editor;

    api_request(Api_Request_Type.editor_get_room_details, {
        access_token: get_access_token()
    }, response => {
        if (editor.type == Editor_Type.adventure) {
            editor.room_entrance_location = response.entrance_location;
        }
    });
}

function exit_current_editor() {
    brushes_root.RemoveAndDeleteChildren();

    switch (editor.type) {
        case Editor_Type.battleground: {
            for (const by_x of editor.cells) {
                for (const cell of by_x) {
                    destroy_fx(cell.particle);
                }
            }

            switch (editor.brush.type) {
                case Battleground_Brush_Type.select: {
                    editor.brush.selection_outline.forEach(destroy_fx);

                    if (editor.brush.drag_state.dragging) {
                        editor.brush.drag_state.outline.forEach(destroy_fx);
                    }

                    break;
                }
            }

            break;
        }

        case Editor_Type.adventure: {
            drop_adventure_editor_selection(editor);

            break;
        }
    }
}

function update_editor_buttons(state: Player_State) {
    buttons_root.RemoveAndDeleteChildren();

    const adventures = enum_names_to_values<Adventure_Id>();

    if (state == Player_State.on_global_map) {
        for (const [name, id] of adventures) {
            editor_button(`Adventure: ${name}`, () => dispatch_editor_action({
                type: Editor_Action_Type.start_adventure,
                adventure: id
            }));
        }
    }

    if (editor.type != Editor_Type.none) {
        editor_button("Exit editor", () => {
            exit_editor();
            update_state_from_editor_mode(state, editor);
        });
    } else {
        editor_button("Battleground editor", () => {
            load_battleground_editor();
        });
    }

    if (state == Player_State.on_adventure) {
        if (editor.type == Editor_Type.adventure) {
            update_adventure_editor_buttons(editor);
        } else {
            editor_button("Adventure editor", () => {
                enter_adventure_editor();
                update_state_from_editor_mode(state, editor);
            });
        }

        editor_button("Back to map", () => {
            dispatch_editor_action({
                type: Editor_Action_Type.exit_adventure
            })
        });
    }
}

function submit_editor_battleground(editor: Battleground_Editor) {
    dispatch_editor_action({
        type: Editor_Action_Type.submit_battleground,
        spawns: editor.spawns
    });
}

function exit_editor() {
    exit_current_editor();

    editor = { type: Editor_Type.none };
}

function init_editor_ui() {
    editor_root.style.visibility = "visible";

    subscribe_to_net_table_key<Game_Net_Table>("main", "game", data => {
        buttons_root.RemoveAndDeleteChildren();

        if (data.state != Player_State.on_adventure && editor.type == Editor_Type.adventure) {
            exit_editor();
        }

        update_state_from_editor_mode(data.state, editor);
    });

    update_editor_indicator(editor);
    periodically_update_editor_ui();
    periodically_update_editor_camera_state();
}

if (Game.IsInToolsMode()) {
    init_editor_ui();
}