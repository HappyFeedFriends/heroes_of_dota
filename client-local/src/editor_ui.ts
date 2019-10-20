const editor_root = $("#editor_ui");
const buttons_root = editor_root.FindChildTraverse("editor_buttons");
const indicator = editor_root.FindChildTraverse("editor_indicator");

let in_editor_mode = false;
let editor_entity: EntityId | undefined = undefined;
let camera_height_index = 1;

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

// Returns if event should be consumed or not
function editor_filter_mouse_click(event: MouseEvent, button: MouseButton | WheelScroll): boolean {
    if (event != "pressed") return false;

    if (button == MouseButton.LEFT) {
        const entity_under_cursor = get_entity_under_cursor(GameUI.GetCursorPosition());

        editor_entity = entity_under_cursor;

        return true;
    }

    if (button == MouseButton.RIGHT && editor_entity != undefined) {
        const num_buffs = Entities.GetNumBuffs(editor_entity);

        for (let index = 0; index < num_buffs; index++) {
            const buff = Entities.GetBuff(editor_entity, index);

            if (Buffs.GetName(editor_entity, buff) == "Modifier_Editor_Npc_Type") {
                const npc_type = Buffs.GetStackCount(editor_entity, buff) as Npc_Type;
                let new_position: XYZ;
                let facing: XYZ;

                const click_world_position = Game.ScreenXYToWorld(...GameUI.GetCursorPosition());

                if (GameUI.IsShiftDown()) {
                    new_position = Entities.GetAbsOrigin(editor_entity);

                    const delta = [click_world_position[0] - new_position[0], click_world_position[1] - new_position[1]];
                    const length = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);

                    facing = length > 0 ? [ delta[0] / length, delta[1] / length, 0 ] : [ 1, 0, 0 ];
                } else {
                    new_position = click_world_position;
                    facing = Entities.GetForward(editor_entity);
                }

                dispatch_editor_event({
                    type: Editor_Event_Type.edit_npc,
                    npc_type: npc_type,
                    entity_id: editor_entity,
                    position: xy(new_position[0], new_position[1]),
                    facing: xy(facing[0], facing[1])
                });

                return true;
            }
        }
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