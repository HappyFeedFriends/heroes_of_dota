const editor_root = $("#editor_ui");
const buttons_root = editor_root.FindChildTraverse("editor_buttons");
const indicator = editor_root.FindChildTraverse("editor_indicator");
const toolbar = indicator.FindChildTraverse("editor_toolbar");

let in_editor_mode = false;
let camera_height_index = 4;

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

function editor_button(text: string, action: () => void) {
    const button = $.CreatePanel("Panel", buttons_root, "");
    button.AddClass("editor_button");
    button.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, action);

    $.CreatePanel("Label", button, "").text = text;
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
        const button = $.CreatePanel("Panel", toolbar, "");
        button.AddClass("editor_toolbar_button");
        button.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, action);

        $.CreatePanel("Label", button, "").text = text;
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

// Returns if event should be consumed or not
function editor_filter_mouse_click(event: MouseEvent, button: MouseButton | WheelScroll): boolean {
    if (event != "pressed") return false;

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

    if (button == MouseButton.RIGHT && editor_selection.selected) {
        let new_position: XYZ;
        let facing: XYZ;

        const click_world_position = Game.ScreenXYToWorld(...GameUI.GetCursorPosition());

        if (GameUI.IsShiftDown()) {
            new_position = Entities.GetAbsOrigin(editor_selection.entity);

            const delta = [click_world_position[0] - new_position[0], click_world_position[1] - new_position[1]];
            const length = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);

            facing = length > 0 ? [ delta[0] / length, delta[1] / length, 0 ] : [ 1, 0, 0 ];
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

        return true;
    }

    return false;
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
}

if (Game.IsInToolsMode()) {
    init_editor_ui();
}