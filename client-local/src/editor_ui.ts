const editor_root = $("#editor_ui");
const buttons_root = editor_root.FindChildTraverse("editor_buttons");
const indicator = editor_root.FindChildTraverse("editor_indicator");
const toolbar = indicator.FindChildTraverse("editor_toolbar");
const context_menu = indicator.FindChildTraverse("editor_context_menu");

let in_editor_mode = false;
let camera_height_index = 4;
let pinned_context_menu_position: XYZ = [0, 0, 0];

let editor_selection: Editor_Selection = {
    selected: false
};

type Editor_Selection = {
    selected: false
} | {
    selected: true
    npc_type: Npc_Type
    entity: EntityId
    particle: ParticleId
}

function text_button(parent: Panel, css_class: string, text: string, action: () => void) {
    const button = $.CreatePanel("Panel", parent, "");
    button.AddClass(css_class);
    button.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, action);

    $.CreatePanel("Label", button, "").text = text;
}

function editor_button(text: string, action: () => void) {
    return text_button(buttons_root, "editor_button", text, action);
}

function dispatch_editor_event(event: Editor_Event) {
    GameEvents.SendCustomGameEventToServer("editor_event", event);
}

function update_editor_indicator() {
    indicator.style.visibility = in_editor_mode ? "visible" : "collapse";
}

function update_editor_camera_height() {
    GameUI.SetCameraDistance(in_editor_mode ? 1200 + 200 * camera_height_index : map_camera_height);
}

function npc_type_from_entity(entity: EntityId): Npc_Type | undefined {
    const num_buffs = Entities.GetNumBuffs(entity);

    for (let index = 0; index < num_buffs; index++) {
        const buff = Entities.GetBuff(entity, index);

        if (Buffs.GetName(entity, buff) == "Modifier_Editor_Npc_Type") {
            return Buffs.GetStackCount(entity, buff) as Npc_Type;
        }
    }
}

function drop_editor_selection() {
    if (editor_selection.selected) {
        Particles.DestroyParticleEffect(editor_selection.particle, false);
        Particles.ReleaseParticleIndex(editor_selection.particle);
    }

    editor_selection = {
        selected: false
    };

    toolbar.RemoveAndDeleteChildren();
}

function editor_select_npc(entity: EntityId, npc_type: Npc_Type) {
    if (editor_selection.selected) {
        drop_editor_selection();
    }

    function toolbar_button(text: string, action: () => void) {
        return text_button(toolbar, "editor_toolbar_button", text, action);
    }

    const fx = Particles.CreateParticle("particles/shop_arrow.vpcf", ParticleAttachment_t.PATTACH_OVERHEAD_FOLLOW, entity);

    register_particle_for_reload(fx);

    editor_selection = {
        selected: true,
        entity: entity,
        particle: fx,
        npc_type: npc_type
    };

    const selection_label = $.CreatePanel("Label", toolbar, "editor_selected_entity");
    selection_label.text = `Selected: ${enum_to_string(npc_type)}`;

    toolbar_button("Delete", () => {
        dispatch_editor_event({
            type: Editor_Event_Type.delete_npc,
            entity_id: entity
        })
    });
}

function context_menu_button(text: string, action: () => void) {
    return text_button(context_menu, "context_menu_button", text, () => {
        context_menu.style.visibility = "collapse";
        action();
    });
}

// Returns if event should be consumed or not
function editor_filter_mouse_click(event: MouseEvent, button: MouseButton | WheelScroll): boolean {
    if (event != "pressed") return false;

    context_menu.style.visibility = "collapse";

    if (button == MouseButton.LEFT) {
        const entity_under_cursor = get_entity_under_cursor(GameUI.GetCursorPosition());

        if (entity_under_cursor != undefined) {
            const npc_type = npc_type_from_entity(entity_under_cursor);

            if (npc_type != undefined) {
                editor_select_npc(entity_under_cursor, npc_type);
            }
        } else {
            drop_editor_selection();
        }

        return true;
    }

    if (button == MouseButton.RIGHT) {
        const click_world_position = Game.ScreenXYToWorld(...GameUI.GetCursorPosition());

        if (editor_selection.selected) {
            let new_position: XYZ;
            let facing: XYZ;

            if (GameUI.IsShiftDown()) {
                new_position = Entities.GetAbsOrigin(editor_selection.entity);

                const delta = [click_world_position[0] - new_position[0], click_world_position[1] - new_position[1]];
                const length = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);

                facing = length > 0 ? [delta[0] / length, delta[1] / length, 0] : [1, 0, 0];
            } else {
                new_position = click_world_position;
                facing = Entities.GetForward(editor_selection.entity);
            }

            dispatch_editor_event({
                type: Editor_Event_Type.edit_npc,
                entity_id: editor_selection.entity,
                position: xy(new_position[0], new_position[1]),
                facing: xy(facing[0], facing[1])
            });
        } else {
            context_menu.style.visibility = "visible";
            context_menu.RemoveAndDeleteChildren();

            for (const [npc_name, npc_type] of enum_names_to_values<Npc_Type>()) {
                context_menu_button(`Create ${npc_name}`, () => {
                    dispatch_editor_event({
                        type: Editor_Event_Type.add_npc,
                        npc_type: npc_type,
                        position: xy(click_world_position[0], click_world_position[1]),
                        facing: xy(1, 0)
                    })
                });
            }

            context_menu_button(`Set start position`, () => {
            });

            pinned_context_menu_position = click_world_position;
        }

        return true;
    }

    return true;
}

function periodically_update_editor_ui() {
    $.Schedule(1 / 200, periodically_update_editor_ui);

    if (editor_selection.selected) {
        if (!Entities.IsValidEntity(editor_selection.entity)) {
            drop_editor_selection();
        }
    }

    function reposition_menu(panel: Panel, position: XYZ,) {
        const screen_ratio = Game.GetScreenHeight() / 1080;

        const screen_x = Game.WorldToScreenX(...position);
        const screen_y = Game.WorldToScreenY(...position);

        if (screen_x == -1 || screen_y == -1) {
            return;
        }

        panel.style.x = Math.floor(screen_x / screen_ratio) + "px";
        panel.style.y = Math.floor(screen_y / screen_ratio) + "px";
    }

    if (context_menu.style.visibility == "visible") {
        reposition_menu(context_menu, pinned_context_menu_position);
    }
}

function init_editor_ui() {
    editor_root.style.visibility = "visible";

    const adventures = enum_names_to_values<Adventure_Id>();

    for (const [name, id] of adventures) {
        editor_button(`Adventure: ${name}`, () => dispatch_editor_event({
            type: Editor_Event_Type.start_adventure,
            adventure: id
        }));
    }

    editor_button("Toggle map vision", () => dispatch_editor_event({
        type: Editor_Event_Type.toggle_map_vision
    }));

    editor_button("Toggle camera lock", () => dispatch_editor_event({
        type: Editor_Event_Type.toggle_camera_lock
    }));

    editor_button("Toggle editor", () => {
        in_editor_mode = !in_editor_mode;

        update_editor_indicator();
        update_editor_camera_height();

        if (!in_editor_mode) {
            drop_editor_selection();
        }
    });

    editor_button("Change camera height", () => {
        camera_height_index = (camera_height_index + 1) % 5;

        update_editor_camera_height();
    });

    update_editor_indicator();

    periodically_update_editor_ui();
}

if (Game.IsInToolsMode()) {
    init_editor_ui();
}