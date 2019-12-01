const editor_root = $("#editor_ui");
const buttons_root = editor_root.FindChildTraverse("editor_buttons");
const indicator = editor_root.FindChildTraverse("editor_indicator");
const entity_panel = indicator.FindChildTraverse("editor_entity_panel");
const context_menu = indicator.FindChildTraverse("editor_context_menu");
const brushes_root = indicator.FindChildTraverse("editor_brushes");
const entrance_indicator = indicator.FindChildTraverse("editor_entrance_indicator");

const entity_buttons = entity_panel.FindChildTraverse("editor_entity_buttons");
const entity_buttons_dropdown = entity_panel.FindChildTraverse("editor_entity_dropdown");

const zone_color: XYZ = [ 64, 200, 255 ];

// To prevent click-through
entity_panel.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {});

const enum Editor_Type {
    none,
    adventure,
    battleground
}

const enum Battleground_Brush_Type {
    select,
    trees,
    grid,
    deployment
}

type Adventure_Editor = {
    type: Editor_Type.adventure
    selection: Adventure_Editor_Selection
    camera_height_index: number
    room_entrance_location: XY | undefined
}

type Battleground_Editor = {
    current_id: Battleground_Id
    type: Editor_Type.battleground
    cells: Editor_Cell[][]
    grid_world_origin: {
        x: number
        y: number
        z: number
    }
    grid_size: XY
    cell_under_cursor?: Editor_Cell
    spawns: Battleground_Spawn[][]
    brush: Battleground_Brush
    deployment_zones: Deployment_Zone[]
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

type Battleground_Brush = Battleground_Select_Brush | Battleground_Grid_Brush | Battleground_Deployment_Brush | {
    type: Battleground_Brush_Type.trees
}

type Battleground_Select_Brush = {
    type: Battleground_Brush_Type.select
    selected: Editor_Cell[]
    selection_outline: ParticleId[]
    drag_state: Drag_State
}

type Battleground_Grid_Brush = {
    type: Battleground_Brush_Type.grid
    selection: {
        active: false
    } | {
        active: true
        outline: Rect_Outline
        min: XY
        max: XY
    }
    drag_state: Drag_State
}

type Battleground_Deployment_Brush = {
    type: Battleground_Brush_Type.deployment
    selection: {
        active: false
    } | {
        active: true
        outline: Rect_Outline
        min: XY
        max: XY
        facing: XY
        facing_particle: ParticleId
    }
    drag_state: Drag_State
    zones: UI_Deployment_Zone[]
}

type UI_Deployment_Zone = Deployment_Zone & {
    outline: Rect_Outline
    facing_particle: ParticleId
}

type Drag_State = Drag_State_Dragging | {
    dragging: false
}

type Drag_State_Dragging = {
    dragging: true
    outline: Rect_Outline
    start_at: XY
}

type Rect_Outline = {
    top: ParticleId
    right: ParticleId
    bottom: ParticleId
    left: ParticleId
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

function destroy_rect_outline(rect: Rect_Outline) {
    destroy_fx(rect.bottom);
    destroy_fx(rect.left);
    destroy_fx(rect.top);
    destroy_fx(rect.right);
}

function make_rect_outline(world_origin: { x: number, y: number, z: number }, from: XY, to: XY, color: XYZ): Rect_Outline {
    const min = xy(Math.min(from.x, to.x), Math.min(from.y, to.y));
    const max = xy(Math.max(from.x, to.x), Math.max(from.y, to.y));

    return {
        bottom: create_particle_for_outline_edge(Edge.bottom, world_origin, xy(min.x, min.y), xy(max.x, min.y), color),
        left: create_particle_for_outline_edge(Edge.left, world_origin, xy(min.x, max.y), xy(min.x, min.y), color),
        right: create_particle_for_outline_edge(Edge.right, world_origin, xy(max.x, min.y), xy(max.x, max.y), color),
        top: create_particle_for_outline_edge(Edge.top, world_origin, xy(max.x, max.y), xy(min.x, max.y), color)
    }
}

function make_zone_facing_particle(editor: Battleground_Editor, min: XY, max: XY, facing: XY) {
    const particle_path = "particles/ui_mouseactions/range_finder_directional_c.vpcf";
    const facing_particle = Particles.CreateParticle(particle_path, ParticleAttachment_t.PATTACH_WORLDORIGIN, 0);

    const world_min = battle_position_to_world_position_center(editor.grid_world_origin, min);
    const world_max = battle_position_to_world_position_center(editor.grid_world_origin, max);
    const arrow_position: XYZ = [
        world_min[0] + (world_max[0] - world_min[0]) / 2,
        world_min[1] + (world_max[1] - world_min[1]) / 2,
        world_min[2] + (world_max[2] - world_min[2]) / 2 + 128,
    ];

    Particles.SetParticleControl(facing_particle, 0, arrow_position);
    Particles.SetParticleControl(facing_particle, 2, [
        arrow_position[0] + facing.x,
        arrow_position[1] + facing.y,
        arrow_position[2]
    ]);

    register_particle_for_reload(facing_particle);

    return facing_particle;
}

function make_new_zone(editor: Battleground_Editor, min: XY, max: XY, facing: XY): UI_Deployment_Zone {
    return {
        min_x: min.x,
        min_y: min.y,
        max_x: max.x,
        max_y: max.y,
        face_x: facing.x,
        face_y: facing.y,
        outline: make_rect_outline(editor.grid_world_origin, min, max, zone_color),
        facing_particle: make_zone_facing_particle(editor, min, max, facing)
    };
}

function make_active_drag_state(drag_from: XY): Drag_State {
    return {
        dragging: true,
        outline: {
            bottom: -1, top: -1, right: -1, left: -1
        },
        start_at: drag_from
    };
}

function update_editor_cells_outline(editor: Battleground_Editor, cells: Editor_Cell[], outline: ParticleId[], color: XYZ = color_green) {
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

    return update_outline(grid, outline, highlighted_cells, color);
}

function battleground_editor_update_buttons_after_selection_change(editor: Battleground_Editor, brush: Battleground_Select_Brush) {
    entity_buttons.RemoveAndDeleteChildren();

    brush.selection_outline = update_editor_cells_outline(editor, brush.selected, brush.selection_outline);

    const selected = brush.selected;
    const all_empty = selected.every(cell => !editor_spawn_at_xy(editor, cell.position));

    function battleground_updating_button(text: string, action: () => void) {
        entity_button(text, () => {
            action();

            battleground_editor_update_buttons_after_selection_change(editor, brush);
            submit_editor_battleground_for_repaint(editor);
        });
    }

    function entity_create_button(text: string, supplier: (at: XY) => Battleground_Spawn) {
        battleground_updating_button(text, () => {
            for (const cell of selected) {
                editor_set_spawn_at(editor, cell.position, supplier(cell.position))
            }
        });
    }

    function create_spawn_specific_buttons(spawn: Battleground_Spawn) {
        function create_facing_buttons(for_spawn: { facing: XY }) {
            function facing_button(direction_name: string, direction: XY) {
                battleground_updating_button(`Face ${direction_name}`, () => {
                    for_spawn.facing = direction;
                });
            }

            facing_button("left", xy(-1, 0));
            facing_button("up", xy(0, 1));
            facing_button("right", xy(1, 0));
            facing_button("down", xy(0, -1));
        }

        switch (spawn.type) {
            case Spawn_Type.monster: {
                create_facing_buttons(spawn);

                break;
            }

            case Spawn_Type.shop: {
                create_facing_buttons(spawn);

                for (const [name, type] of enum_names_to_values<Shop_Type>()) {
                    if (type != spawn.shop_type) {
                        battleground_updating_button(`Set type to '${name}'`, () => {
                            spawn.shop_type = type;
                        });
                    }
                }

                break;
            }
        }
    }

    if (selected.length > 0) {
        if (all_empty) {
            entity_create_button("Create tree", at => ({
                type: Spawn_Type.tree,
                at: at
            }));

            entity_create_button("Create rune", at => ({
                type: Spawn_Type.rune,
                at: at
            }));

            entity_create_button("Create monster", at => ({
                type: Spawn_Type.monster,
                at: at,
                facing: xy(1, 0)
            }));

            entity_create_button("Create shop", at => ({
                type: Spawn_Type.shop,
                at: at,
                facing: xy(1, 0),
                shop_type: Shop_Type.normal,
                item_pool: []
            }));
        } else {
            if (selected.length == 1) {
                const the_only_cell = brush.selected[0];
                const spawn = editor_spawn_at_xy(editor, the_only_cell.position);

                if (spawn) {
                    create_spawn_specific_buttons(spawn);
                }
            }

            entity_button("Delete", () => {
                for (const cell of selected) {
                    editor_remove_spawn_at(editor, cell.position);
                }

                battleground_editor_update_buttons_after_selection_change(editor, brush);
                submit_editor_battleground_for_repaint(editor);
            }, "editor_entity_delete_button");
        }
    }
}

function battleground_editor_update_selection_after_dragging(editor: Battleground_Editor, brush: Battleground_Select_Brush, min: XY, max: XY, shift_down: boolean) {
    function all_cells_within_bounds(editor: Battleground_Editor, min: XY, max: XY) {
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

    const cells: Editor_Cell[] = all_cells_within_bounds(editor, min, max);

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

    battleground_editor_update_buttons_after_selection_change(editor, brush);
    battleground_editor_set_drag_state(brush, { dragging: false });
}

function battleground_editor_set_drag_state(brush: { drag_state: Drag_State }, new_state: Drag_State) {
    if (brush.drag_state.dragging) {
        const outline = brush.drag_state.outline;

        destroy_fx(outline.left);
        destroy_fx(outline.right);
        destroy_fx(outline.top);
        destroy_fx(outline.bottom);
    }

    brush.drag_state = new_state;
}

function battleground_editor_set_deployment_brush_selection_state(editor: Battleground_Editor, brush: Battleground_Deployment_Brush, new_state: Battleground_Deployment_Brush["selection"]) {
    entity_buttons.RemoveAndDeleteChildren();

    if (brush.selection.active) {
        destroy_rect_outline(brush.selection.outline);
        destroy_fx(brush.selection.facing_particle);
    }

    brush.selection = new_state;

    function update_editor_zones() {
        editor.deployment_zones = brush.zones.map(zone => copy<Deployment_Zone>(zone));

        submit_battleground_state_to_server(editor);
    }

    function deselect() {
        battleground_editor_set_deployment_brush_selection_state(editor, brush, { active: false });
    }

    function zone_button(zone: Deployment_Zone, text: string, action: () => void) {
        const button = entity_button(text, action);
        const particles: ParticleId[] = [];

        button.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
            for (let x = zone.min_x; x <= zone.max_x; x++) {
                for (let y = zone.min_y; y <= zone.max_y; y++) {
                    const center = battle_position_to_world_position_center(editor.grid_world_origin, xy(x, y));
                    const particle = create_cell_particle_at(center);
                    register_particle_for_reload(particle);

                    Particles.SetParticleControl(particle, 2, zone_color);

                    particles.push(particle);
                }
            }
        });

        button.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
            particles.forEach(destroy_fx);
            particles.length = 0;
        });
    }

    if (brush.selection.active) {
        const selection = brush.selection;
        const min = selection.min;
        const max = selection.max;

        for (let index = 0; index < brush.zones.length; index++) {
            const zone = brush.zones[index];

            zone_button(zone, `Assign to zone ${index + 1}`, () => {
                destroy_rect_outline(zone.outline);
                destroy_fx(zone.facing_particle);
                brush.zones[index] = make_new_zone(editor, min, max, selection.facing);
                update_editor_zones();
                deselect();
            });
        }

        entity_button(`Assign to new zone`, () => {
            brush.zones.push(make_new_zone(editor, min, max, selection.facing));
            update_editor_zones();
            deselect();
        });
    } else {
        for (let index = 0; index < brush.zones.length; index++) {
            const zone = brush.zones[index];

            zone_button(zone, `Delete Zone ${index + 1}`, () => {
                brush.zones.splice(index, 1);
                destroy_rect_outline(zone.outline);
                destroy_fx(zone.facing_particle);
                update_editor_zones();
                deselect();
            });
        }
    }
}

function battleground_editor_set_grid_brush_selection_state(editor: Battleground_Editor, brush: Battleground_Grid_Brush, new_state: Battleground_Grid_Brush["selection"]) {
    entity_buttons.RemoveAndDeleteChildren();

    const selection_label = $.CreatePanel("Label", entity_buttons, "editor_selected_entity");

    if (brush.selection.active) {
        destroy_rect_outline(brush.selection.outline);
    }

    brush.selection = new_state;

    const selection = brush.selection;

    if (selection.active) {
        selection_label.text = `Selected: ${selection.max.x - selection.min.x + 1}x${selection.max.y - selection.min.y + 1}`;
    } else {
        selection_label.text = `Grid: ${editor.grid_size.x}x${editor.grid_size.y}`;
    }

    if (selection.active) {
        entity_button("Crop grid", () => {
            const old_spawns = editor.spawns;
            editor.spawns = [];

            for_each_editor_spawn(old_spawns, spawn => {
                if (spawn.at.x > selection.max.x ||
                    spawn.at.y > selection.max.y ||
                    spawn.at.x < selection.min.x ||
                    spawn.at.y < selection.min.y) {
                } else {
                    spawn.at.x -= selection.min.x;
                    spawn.at.y -= selection.min.y;

                    editor_set_spawn_at(editor, spawn.at, spawn);
                }
            });

            editor.grid_size.x = selection.max.x - selection.min.x + 1;
            editor.grid_size.y = selection.max.y - selection.min.y + 1;

            battleground_editor_cleanup_cells(editor);
            editor.cells = fill_battleground_editor_cells(editor.grid_world_origin, editor.grid_size.x, editor.grid_size.y);
            battleground_editor_set_grid_brush_selection_state(editor, brush, { active: false });
            submit_editor_battleground_for_repaint(editor);
        });
    }
}

function battleground_editor_filter_mouse_click(editor: Battleground_Editor, event: MouseEvent, button: MouseButton | WheelScroll) {
    const cursor = GameUI.GetCursorPosition();
    const world_position = GameUI.GetScreenWorldPosition(cursor);

    if (!world_position) {
        return;
    }

    const position = world_position_to_battle_position(editor.grid_world_origin, world_position);
    const cell = editor_cell_by_xy(editor, position);
    const brush = editor.brush;

    const pressed = event == "pressed";

    if (!pressed) {
        return;
    }

    if (brush.type == Battleground_Brush_Type.deployment && cell && brush.selection.active && GameUI.IsShiftDown()) {
        const click  = cell.position;
        const selection = brush.selection;

        // TODO annoying but we have to ignore the error for now
        //@ts-ignore
        function set_facing(facing: XY) {
            selection.facing = facing;

            destroy_fx(selection.facing_particle);

            selection.facing_particle = make_zone_facing_particle(editor, selection.min, selection.max, facing);
        }

        if (click.x < selection.min.x) {
            set_facing(xy(-1, 0));
        } else if (click.x > selection.max.x) {
            set_facing(xy(1, 0));
        } else if (click.y < selection.min.y) {
            set_facing(xy(0, -1));
        } else if (click.y > selection.max.y) {
            set_facing(xy(0, 1));
        }

        return;
    }

    switch (brush.type) {
        case Battleground_Brush_Type.grid: {
            if (button == MouseButton.RIGHT) {
                battleground_editor_set_grid_brush_selection_state(editor, brush, { active: false });
                break;
            }

            if (pressed) {
                battleground_editor_set_drag_state(brush, make_active_drag_state(position));
            }

            break;
        }

        case Battleground_Brush_Type.deployment: {
            if (button != MouseButton.LEFT) {
                break;
            }

            if (!cell && pressed) {
                battleground_editor_set_deployment_brush_selection_state(editor, brush, { active: false });
                break;
            }

            if (pressed) {
                battleground_editor_set_drag_state(brush, make_active_drag_state(position));
            }

            break;
        }

        case Battleground_Brush_Type.select: {
            if (button != MouseButton.LEFT) {
                break;
            }

            if (!cell && pressed) {
                brush.selected = [];

                battleground_editor_update_buttons_after_selection_change(editor, brush);

                break;
            }

            if (pressed) {
                battleground_editor_set_drag_state(brush, make_active_drag_state(position));
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
        case Battleground_Brush_Type.deployment:
        case Battleground_Brush_Type.select:
        case Battleground_Brush_Type.grid: {
            const outline_color: Record<typeof brush.type, XYZ> = {
                [Battleground_Brush_Type.select]: color_green,
                [Battleground_Brush_Type.grid]: color_yellow,
                [Battleground_Brush_Type.deployment]: color_green
            };

            const drag_state = brush.drag_state;

            if (drag_state.dragging) {
                const from = drag_state.start_at;
                const to = position;
                const min = xy(Math.min(from.x, to.x), Math.min(from.y, to.y));
                const max = xy(Math.max(from.x, to.x), Math.max(from.y, to.y));

                destroy_rect_outline(drag_state.outline);
                drag_state.outline = make_rect_outline(editor.grid_world_origin, min, max, outline_color[brush.type]);

                if (!pressed) {
                    battleground_editor_set_drag_state(brush, { dragging: false });

                    if (brush.type == Battleground_Brush_Type.grid) {
                        battleground_editor_set_grid_brush_selection_state(editor, brush, {
                            active: true,
                            outline: make_rect_outline(editor.grid_world_origin, min, max, color_yellow),
                            min: min,
                            max: max
                        });
                    }

                    if (brush.type == Battleground_Brush_Type.select) {
                        battleground_editor_update_selection_after_dragging(editor, brush, min, max, shift_down);
                    }

                    if (brush.type == Battleground_Brush_Type.deployment) {
                        const clamped_min = xy(Math.max(0, min.x), Math.max(0, min.y));
                        const clamped_max = xy(Math.min(editor.grid_size.x - 1, max.x), Math.min(editor.grid_size.y - 1, max.y));

                        battleground_editor_set_deployment_brush_selection_state(editor, brush, {
                            active: true,
                            outline: make_rect_outline(editor.grid_world_origin, clamped_min, clamped_max, color_green),
                            min: clamped_min,
                            max: clamped_max,
                            facing: xy(1, 0),
                            facing_particle: make_zone_facing_particle(editor, clamped_min, clamped_max, xy(1, 0))
                        });
                    }
                }
            }

            break;
        }

        case Battleground_Brush_Type.trees: {
            if (!pressed) break;

            const cell = editor_cell_by_xy(editor, position);
            if (!cell) break;

            const spawn = editor_spawn_at_xy(editor, position);

            if (shift_down) {
                if (spawn) {
                    editor_remove_spawn_at(editor, position);
                }
            } else {
                editor_set_spawn_at(editor, position, {
                    type: Spawn_Type.tree,
                    at: position
                });
            }

            submit_editor_battleground_for_repaint(editor);

            break;
        }
    }
}

function battleground_editor_cleanup_brush(editor: Battleground_Editor) {
    const brush = editor.brush;

    if (brush.type == Battleground_Brush_Type.select) {
        brush.selection_outline.forEach(destroy_fx);

        battleground_editor_set_drag_state(brush, { dragging: false });
    }

    if (brush.type == Battleground_Brush_Type.grid) {
        battleground_editor_set_grid_brush_selection_state(editor, brush, { active: false });
        battleground_editor_set_drag_state(brush, { dragging: false });
    }

    if (brush.type == Battleground_Brush_Type.deployment) {
        battleground_editor_set_deployment_brush_selection_state(editor, brush, { active: false });
        battleground_editor_set_drag_state(brush, { dragging: false });

        for (const zone of brush.zones) {
            destroy_rect_outline(zone.outline);
            destroy_fx(zone.facing_particle);
        }
    }

    entity_buttons.RemoveAndDeleteChildren();
}

function editor_cell_by_xy(editor: Battleground_Editor, xy: XY): Editor_Cell | undefined {
    const by_x = editor.cells[xy.x];
    if (!by_x) return;

    return by_x[xy.y];
}

function editor_spawn_at_xy(editor: Battleground_Editor, xy: XY): Battleground_Spawn | undefined {
    const by_x = editor.spawns[xy.x];
    if (!by_x) return;

    return by_x[xy.y];
}

function editor_remove_spawn_at(editor: Battleground_Editor, xy: XY) {
    const by_x = editor.spawns[xy.x];

    if (by_x) {
        delete by_x[xy.y];
    }
}

function editor_set_spawn_at(editor: Battleground_Editor, xy: XY, spawn: Battleground_Spawn) {
    let by_x = editor.spawns[xy.x];

    if (!by_x) {
       by_x = [];
       editor.spawns[xy.x] = by_x;
    }

    by_x[xy.y] = spawn;
}

function for_each_editor_spawn(spawns: Battleground_Spawn[][], action: (spawn: Battleground_Spawn) => void) {
    for (const by_x of spawns) {
        if (by_x) {
            for (const spawn of by_x) {
                if (spawn) {
                    action(spawn);
                }
            }
        }
    }
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
            const should_paint_red = editor.brush.type == Battleground_Brush_Type.trees && GameUI.IsShiftDown();

            Particles.SetParticleControl(editor.cell_under_cursor.particle, 2, should_paint_red ? [255, 0, 0] : [0, 255, 0]);
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

function load_battleground_editor(for_battleground: Battleground_Id) {
    // TODO try async/await?
    local_api_request(Local_Api_Request_Type.get_battle_position, {}, origin => {
        api_request(Api_Request_Type.editor_get_battleground, { id: for_battleground }, response => {
            enter_battleground_editor(origin, for_battleground, response.battleground);
        })
    });
}

function fill_battleground_editor_cells(grid_world_origin: { x: number, y: number, z: number }, w: number, h: number): Editor_Cell[][] {
    const cells: Editor_Cell[][] = [];

    for (let x = 0; x < w; x++) {
        const by_x: Editor_Cell[] = [];

        for (let y = 0; y < h; y++) {
            const center = battle_position_to_world_position_center(grid_world_origin, xy(x, y));
            const particle = create_cell_particle_at(center);

            Particles.SetParticleControl(particle, 3, [ 10, 0, 0 ]);

            by_x.push({
                position: xy(x, y),
                particle: particle
            });

            register_particle_for_reload(particle);
        }

        cells[x] = by_x;
    }

    return cells;
}

function battleground_editor_cleanup_cells(editor: Battleground_Editor) {
    for (const by_x of editor.cells) {
        for (const cell of by_x) {
            destroy_fx(cell.particle);
        }
    }
}

function enter_battleground_editor(grid_world_origin: { x: number, y: number, z: number }, id: Battleground_Id, battleground: Battleground) {
    const grid_w = battleground.grid_size.x;
    const grid_h = battleground.grid_size.y;

    const default_selection_brush: Battleground_Brush = {
        type: Battleground_Brush_Type.select,
        selected: [],
        selection_outline: [],
        drag_state: { dragging: false }
    };

    const new_editor: Battleground_Editor = {
        type: Editor_Type.battleground,
        current_id: id,
        cells: fill_battleground_editor_cells(grid_world_origin, grid_w, grid_h),
        grid_size: xy(grid_w, grid_h),
        spawns: [],
        grid_world_origin: grid_world_origin,
        brush: default_selection_brush,
        deployment_zones: battleground.deployment_zones
    };

    for (const spawn of battleground.spawns) {
        editor_set_spawn_at(new_editor, spawn.at, spawn);
    }

    editor = new_editor;

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
            battleground_editor_cleanup_brush(new_editor);
            new_editor.brush = new_brush;
            update_brush_button_styles();

            if (new_brush.type == Battleground_Brush_Type.grid) {
                battleground_editor_set_grid_brush_selection_state(new_editor, new_brush, { active: false });
            }

            if (new_brush.type == Battleground_Brush_Type.deployment) {
                new_brush.zones = new_editor.deployment_zones.map(zone => make_new_zone(
                    new_editor,
                    xy(zone.min_x, zone.min_y),
                    xy(zone.max_x, zone.max_y),
                    xy(zone.face_x, zone.face_y)
                ));

                battleground_editor_set_deployment_brush_selection_state(new_editor, new_brush, { active: false });
            }
        });

        buttons.push({
            brush: new_brush,
            panel: panel
        });
    }

    set_brush_button("Selection tool", default_selection_brush);

    set_brush_button("Paint trees", {
        type: Battleground_Brush_Type.trees
    });

    set_brush_button("Deployment zones", {
        type: Battleground_Brush_Type.deployment,
        selection: { active: false },
        drag_state: { dragging: false },
        zones: []
    });

    set_brush_button("Crop grid", {
        type: Battleground_Brush_Type.grid,
        selection: { active: false },
        drag_state: { dragging: false }
    });

    update_brush_button_styles();
    submit_editor_battleground_for_repaint(editor);
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
            dispatch_editor_action({
                type: Editor_Action_Type.submit_battleground,
                spawns: []
            });

            battleground_editor_cleanup_cells(editor);
            battleground_editor_cleanup_brush(editor);
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
            load_battleground_editor(0 as Battleground_Id);
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

function submit_battleground_state_to_server(editor: Battleground_Editor) {
    const flattened_spawns: Battleground_Spawn[] = [];

    for_each_editor_spawn(editor.spawns, spawn => flattened_spawns.push(spawn));

    api_request(Api_Request_Type.editor_submit_battleground, {
        id: editor.current_id,
        battleground: {
            grid_size: editor.grid_size,
            deployment_zones: editor.deployment_zones,
            spawns: flattened_spawns
        }
    }, () => {});
}

function submit_editor_battleground_for_repaint(editor: Battleground_Editor) {
    const flattened_spawns: Battleground_Spawn[] = [];

    for_each_editor_spawn(editor.spawns, spawn => flattened_spawns.push(spawn));
    dispatch_editor_action({
        type: Editor_Action_Type.submit_battleground,
        spawns: flattened_spawns
    });

    submit_battleground_state_to_server(editor);
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