const editor_root = $("#editor_ui");
const buttons_root = editor_root.FindChildTraverse("editor_buttons");
const indicator = editor_root.FindChildTraverse("editor_indicator");
const entity_panel = indicator.FindChildTraverse("editor_entity_panel");
const context_menu = indicator.FindChildTraverse("editor_context_menu");
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

type Adventure_Editor = {
    type: Editor_Type.adventure
    selection: Adventure_Editor_Selection
    camera_height_index: number
    room_entrance_location: XY | undefined
}

type Battleground_Editor = {
    type: Editor_Type.battleground
    cells: Editor_Cell[]
    grid_size: {
        w: number
        h: number
    }
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
}

function editor_button(text: string, action: () => void) {
    return text_button(buttons_root, "editor_button", text, action);
}

function dispatch_editor_event(event: Editor_Event) {
    fire_event(To_Server_Event_Type.editor_event, event);
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
            dispatch_editor_event({
                type: Editor_Event_Type.delete_entity,
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

            $.Msg(entity_id, " ", npc_type);

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

                dispatch_editor_event({
                    type: Editor_Event_Type.set_entity_position,
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

                dispatch_editor_event({
                    type: Editor_Event_Type.set_entity_facing,
                    entity_id: editor.selection.id,
                    facing: xy(facing[0], facing[1])
                });
            });
        } else {
            for (const [entity_name, entity_type] of enum_names_to_values<Adventure_Entity_Type>()) {
                if (entity_type == Adventure_Entity_Type.enemy) {
                    for (const [npc_name, npc_type] of enum_names_to_values<Npc_Type>()) {
                        context_menu_button(`Create ${npc_name}`, () => {
                            dispatch_editor_event({
                                type: Editor_Event_Type.create_entity,
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
                        dispatch_editor_event({
                            type: Editor_Event_Type.create_entity,
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
                dispatch_editor_event({
                    type: Editor_Event_Type.teleport,
                    position: xy(click_world_position[0], click_world_position[1])
                })
            });
        }

        pinned_context_menu_position = click_world_position;
    }

    return true;
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

    if (context_menu.style.visibility == "visible") {
        position_panel_over_position_in_the_world(context_menu, pinned_context_menu_position, Align_H.right, Align_V.bottom);
    }
}

function periodically_update_editor_camera_state() {
    $.Schedule(0.1, periodically_update_editor_camera_state);

    switch (editor.type) {
        case Editor_Type.adventure: {
            dispatch_editor_event({
                type: Editor_Event_Type.set_camera,
                camera: {
                    free: true
                }
            });

            break;
        }

        case Editor_Type.battleground: {
            dispatch_editor_event({
                type: Editor_Event_Type.set_camera,
                camera: {
                    free: false,
                    grid_size: {
                        x: editor.grid_size.w,
                        y: editor.grid_size.h
                    }
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
    editor_button("Toggle map vision", () => dispatch_editor_event({
        type: Editor_Event_Type.toggle_map_vision
    }));

    editor_button("Change camera height", () => {
        editor.camera_height_index = (editor.camera_height_index + 1) % 5;

        update_editor_camera_height(editor);
    });
}

function enter_battleground_editor() {
    local_api_request(Local_Api_Request_Type.get_battle_position, {}, position => {
        const grid_w = 14;
        const grid_h = 10;

        editor = {
            type: Editor_Type.battleground,
            cells: [],
            grid_size: {
                w: grid_w,
                h: grid_h
            }
        };

        const particle_bottom_left_origin: XYZ = [
            position.x + battle_cell_size / 2,
            position.y + battle_cell_size / 2,
            position.z
        ];

        for (let x = 0; x < grid_w; x++) {
            for (let y = 0; y < grid_h; y++) {
                const particle = create_cell_particle_at([
                    particle_bottom_left_origin[0] + x * battle_cell_size,
                    particle_bottom_left_origin[1] + y * battle_cell_size,
                    particle_bottom_left_origin[2]
                ]);

                editor.cells.push({
                    position: xy(x, y),
                    particle: particle
                });

                register_particle_for_reload(particle);
            }
        }

        update_state_from_editor_mode(current_state, editor);
    });
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
    switch (editor.type) {
        case Editor_Type.battleground: {
            for (const cell of editor.cells) {
                Particles.DestroyParticleEffect(cell.particle, false);
                Particles.ReleaseParticleIndex(cell.particle);
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
            editor_button(`Adventure: ${name}`, () => dispatch_editor_event({
                type: Editor_Event_Type.start_adventure,
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
            enter_battleground_editor();
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
            dispatch_editor_event({
                type: Editor_Event_Type.exit_adventure
            })
        });
    }
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