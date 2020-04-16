import {current_state} from "./main_ui";

import {
    subscribe_to_game_net_table_key,
    async_local_api_request,
    async_api_request,
    api_request,
    get_access_token
} from "./interop";

import {find_adventure_entity_by_id, find_adventure_entity_by_world_index} from "./adventure_ui";

const editor_root = $("#editor_ui");
const buttons_root = editor_root.FindChildTraverse("editor_buttons");
const indicator = editor_root.FindChildTraverse("editor_indicator");
const entity_panel = indicator.FindChildTraverse("editor_entity_panel");
const context_menu = indicator.FindChildTraverse("editor_context_menu");
const brushes_root = indicator.FindChildTraverse("editor_brushes");
const toolbar_root = indicator.FindChildTraverse("editor_toolbar");
const world_indicators_root = indicator.FindChildTraverse("editor_world_indicators");

const entity_buttons = entity_panel.FindChildTraverse("editor_entity_buttons");
const entity_buttons_dropdown = entity_panel.FindChildTraverse("editor_entity_dropdown");

const toolbar_buttons = toolbar_root.FindChildTraverse("editor_toolbar_buttons");
const toolbar_buttons_dropdown = toolbar_root.FindChildTraverse("editor_toolbar_dropdown");

const zone_color = rgb(64, 200, 255);

// To prevent click-through
entity_panel.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {});

export const enum Editor_Type {
    none,
    adventure,
    battleground
}

const enum Battleground_Brush_Type {
    select,
    trees,
    crop_grid,
    deployment,
    paint_grid
}

const enum Adventure_Selection_Type {
    none,
    multiple,
    entity,
    camera_restriction,
    room_exit,
}

type Adventure_Editor = {
    type: Editor_Type.adventure
    selection: Adventure_Editor_Selection
    camera_height_index: number
    room_type: Adventure_Room_Type
    room_name: string
    room_entrance_location: XYZ
    last_camera_position: XYZ
    camera_restriction_zones: UI_Camera_Restriction_Zone[]
    entrance_indicator: World_Indicator
    exits: UI_Room_Exit[]
}

type Battleground_Editor = {
    current_id: Battleground_Id
    theme: Battleground_Theme
    battleground_name: string
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
    enemy_data?: Editor_Enemy_Battleground_Data
    previous_editor?: Editor
}

type Editor_Enemy_Battleground_Data = {
    id: Adventure_World_Entity_Id
    name: string
    current_battleground_id: Battleground_Id
}

type Editor_Cell = Cell_Like & {
    particle: ParticleId
    disabled: boolean
}

type Editor = { type: Editor_Type.none } | Adventure_Editor | Battleground_Editor

type Adventure_Editor_Selection = {
    type: Adventure_Selection_Type.none
} | {
    type: Adventure_Selection_Type.entity
    id: Adventure_World_Entity_Id
    entity: EntityId
    particle: ParticleId
} | {
    type: Adventure_Selection_Type.camera_restriction
    zone: UI_Camera_Restriction_Zone
    particle: ParticleId
} | {
    type: Adventure_Selection_Type.room_exit
    exit: UI_Room_Exit
} | {
    type: Adventure_Selection_Type.multiple
    entities: {
        id: Adventure_World_Entity_Id
        entity: EntityId
        particle: ParticleId
    }[]
}

type Battleground_Brush = Battleground_Select_Brush | Battleground_Crop_Grid_Brush | Battleground_Deployment_Brush | {
    type: Battleground_Brush_Type.trees
} | {
    type: Battleground_Brush_Type.paint_grid
    outline: Rect_Outline
}

type Battleground_Select_Brush = {
    type: Battleground_Brush_Type.select
    selected: Editor_Cell[]
    selection_outline: ParticleId[]
    drag_state: Drag_State
}

type Battleground_Crop_Grid_Brush = {
    type: Battleground_Brush_Type.crop_grid
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

type UI_Camera_Restriction_Zone = {
    points: XY[]
    particles: ParticleId[]
}

type UI_Room_Exit = {
    at: XYZ
    to: Adventure_Room_Id
    name: string
    indicator: World_Indicator
}

type World_Indicator = {
    root: Panel
    text: LabelPanel
}

let pinned_context_menu_position = xyz(0, 0, 0);
let context_menu_particle: ParticleId | undefined = undefined;
export let editor: Editor = { type: Editor_Type.none };

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

function dispatch_local_editor_action(event: Editor_Action) {
    return async_local_api_request(Local_Api_Request_Type.editor_action, event);
}

function update_editor_indicator(editor: Editor) {
    indicator.style.visibility = editor.type != Editor_Type.none ? "visible" : "collapse";
}

function update_editor_camera_height(editor: Editor) {
    GameUI.SetCameraDistance(editor.type == Editor_Type.adventure ? 1200 + 200 * editor.camera_height_index : Const.map_camera_height);
}

function drop_adventure_editor_selection(editor: Adventure_Editor) {
    for (const exit of editor.exits) {
        exit.indicator.root.RemoveClass("selected");
    }

    if (editor.selection.type == Adventure_Selection_Type.entity) {
        destroy_fx(editor.selection.particle);
    }

    if (editor.selection.type == Adventure_Selection_Type.camera_restriction) {
        destroy_fx(editor.selection.particle);
    }

    if (editor.selection.type == Adventure_Selection_Type.multiple) {
        for (const entity of editor.selection.entities) {
            destroy_fx(entity.particle);
        }
    }

    editor.selection = {
        type: Adventure_Selection_Type.none
    };

    entity_buttons.RemoveAndDeleteChildren();
    entity_buttons_dropdown.RemoveAndDeleteChildren();
}

function entity_button(text: string, action: (button: Panel) => void, css_class: string = "editor_entity_button") {
    return text_button(entity_buttons, css_class, text, action);
}

function entity_dropdown_button(text: string, action: () => void) {
    return text_button(entity_buttons_dropdown, "editor_entity_dropdown_button", text, action);
}

function toolbar_dropdown_button(text: string, action: () => void) {
    return text_button(toolbar_buttons_dropdown, "toolbar_dropdown_button", text, action);
}

type Dropdown_Menu = {
    root: Panel
    highlighted_button?: Panel
}

function dropdown_menu_action(menu: Dropdown_Menu, action: (parent: Panel, close: () => void) => void) {
    return (button: Panel) => {
        menu.root.RemoveAndDeleteChildren();

        if (menu.highlighted_button) {
            menu.highlighted_button.RemoveClass("selected");
        }

        if (menu.highlighted_button != button) {
            menu.highlighted_button = button;
            menu.highlighted_button.AddClass("selected");

            action(menu.root, () => {
                menu.root.RemoveAndDeleteChildren();

                if (menu.highlighted_button) {
                    menu.highlighted_button.RemoveClass("selected");
                }

                menu.highlighted_button = undefined;
            });
        } else {
            menu.highlighted_button = undefined;
        }
    };
}

function dropdown_menu(root: Panel): Dropdown_Menu {
    return { root };
}

function create_adventure_enemy_menu_buttons(editor: Adventure_Editor, entity: Physical_Adventure_Entity, enemy: Find_By_Type<Adventure_Entity, Adventure_Entity_Type.enemy>, name: string) {
    const { creeps, id, battleground } = enemy;

    entity_button(`Battleground: #${battleground}`, () => {
        load_battleground_editor(battleground, {
            current_battleground_id: battleground,
            id: id,
            name: name
        }, editor)
    });

    const menu = dropdown_menu(entity_buttons_dropdown);

    for (let index = 0; index < creeps.length + 1; index++) {
        const creep = creeps[index];
        const text = index < creeps.length ? enum_to_string(creep) : "Add a creep";

        entity_button(text, dropdown_menu_action(menu, () => {
            for (const [name, type] of enum_names_to_values<Creep_Type>()) {
                entity_dropdown_button(name, () => {
                    creeps[index] = type;

                    api_request(Api_Request_Type.editor_action, {
                        type: Adventure_Editor_Action_Type.edit_enemy_deck,
                        entity_id: id,
                        creeps: creeps,
                        access_token: get_access_token()
                    }, () => adventure_editor_select_entity(editor, entity));
                });
            }

            entity_dropdown_button("Delete", () => {
                creeps.splice(index, 1);

                api_request(Api_Request_Type.editor_action, {
                    type: Adventure_Editor_Action_Type.edit_enemy_deck,
                    entity_id: id,
                    creeps: creeps,
                    access_token: get_access_token()
                }, () => adventure_editor_select_entity(editor, entity));
            });
        }));
    }
}

async function create_adventure_merchant_buttons(editor: Adventure_Editor, entity: Physical_Adventure_Entity, merchant: Adventure_Merchant) {
    const async_stock = async_api_request(Api_Request_Type.editor_get_merchant_stock, {
        merchant: merchant.id,
        access_token: get_access_token()
    });

    async function update_array_and_resubmit<T>(elements: T[], clicked_element: T) {
        const existing_index = elements.indexOf(clicked_element);

        if (existing_index == -1) {
            elements.push(clicked_element);
        } else {
            elements.splice(existing_index, 1);
        }

        const stock = await async_stock;

        api_request(Api_Request_Type.editor_action, {
            type: Adventure_Editor_Action_Type.set_merchant_stock,
            entity_id: merchant.id,
            stock: stock,
            access_token: get_access_token()
        }, () => {});

        return existing_index == -1;
    }

    function stock_updating_button<T>(button: Panel, elements: T[], associated_element: T) {
        button.SetHasClass("selected", elements.indexOf(associated_element) != -1)
        button.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, async () => {
            const selected = await update_array_and_resubmit(elements, associated_element);
            button.SetHasClass("selected", selected);
        });
    }

    function item_button(container: Panel, icon: string) {
        const item_button = $.CreatePanel("Image", container, "");
        item_button.AddClass("item_button");
        item_button.SetImage(icon);
        return item_button;
    }

    function hero_button(container: Panel, hero: Hero_Type) {
        const hero_button = $.CreatePanel("Image", container, "");
        hero_button.AddClass("hero_button");
        hero_button.SetImage(get_full_hero_icon_path(hero));
        return hero_button;
    }

    function wrapping_container(parent: Panel) {
        const container = $.CreatePanel("Panel", parent, "");
        container.AddClass("wrapping_container");
        return container;
    }

    const menu = dropdown_menu(entity_buttons_dropdown);

    entity_button("Heroes", dropdown_menu_action(menu, async parent => {
        const stock = await async_stock;
        const container = wrapping_container(parent);

        for (const hero of enum_values<Hero_Type>()) {
            const button = hero_button(container, hero);
            stock_updating_button(button, stock.heroes, hero);
        }
    }));

    entity_button("Creeps", dropdown_menu_action(menu, async () => {
        const stock = await async_stock;

        for (const creep of enum_values<Creep_Type>()) {
            const button = entity_dropdown_button(get_creep_name(creep), () => {});
            stock_updating_button(button, stock.creeps, creep);
        }
    }));

    entity_button("Spells", dropdown_menu_action(menu, async () => {
        const stock = await async_stock;

        for (const spell of enum_values<Spell_Id>()) {
            const button = entity_dropdown_button(get_spell_name(spell), () => {});
            stock_updating_button(button, stock.spells, spell);
        }
    }));

    entity_button("Items", dropdown_menu_action(menu, async parent => {
        const stock = await async_stock;
        const all_items = enum_values<Adventure_Item_Id>();
        const container = wrapping_container(parent);

        for (const item of all_items) {
            const button = item_button(container, get_adventure_item_icon_by_id(item));
            stock_updating_button(button, stock.items, item);
        }
    }));

    function fill_current_stock_ui(parent: Panel) {
        const stock = merchant.stock;

        const hero_container = wrapping_container(parent);
        for (const card of stock.cards) {
            if (card.type == Adventure_Merchant_Card_Type.hero) {
                hero_button(hero_container, card.hero);
            }
        }

        for (const card of stock.cards) {
            if (card.type == Adventure_Merchant_Card_Type.creep) {
                entity_dropdown_button(get_creep_name(card.creep), () => {});
            }
        }

        for (const card of stock.cards) {
            if (card.type == Adventure_Merchant_Card_Type.spell) {
                entity_dropdown_button(get_spell_name(card.spell), () => {});
            }
        }

        const item_container = wrapping_container(parent);
        for (const item of stock.items) {
            item_button(item_container, get_adventure_item_icon(item.data));
        }
    }

    const current_stock_button = entity_button("Current stock", dropdown_menu_action(menu, fill_current_stock_ui));

    entity_button("Reroll stock", async () => {
        const new_stock = await async_local_api_request(Local_Api_Request_Type.reroll_merchant_stock, { merchant: merchant.id });
        if (!new_stock.ok) return;

        merchant.stock = {
            cards: new_stock.body.cards,
            items: new_stock.body.items
        };

        if (menu.highlighted_button == current_stock_button) {
            entity_buttons_dropdown.RemoveAndDeleteChildren();
            fill_current_stock_ui(entity_buttons_dropdown);
        }
    });
}

function adventure_editor_select_entity(editor: Adventure_Editor, entity: Physical_Adventure_Entity) {
    if (editor.selection.type != Adventure_Selection_Type.none) {
        drop_adventure_editor_selection(editor);
    }

    const base = entity.base;
    const world_id = entity.world_entity_id;

    function entity_name() {
        switch (base.type) {
            case Adventure_Entity_Type.enemy: {
                return enum_to_string(base.world_model);
            }

            case Adventure_Entity_Type.item_on_the_ground: {
                return get_adventure_item_name(base.item);
            }

            case Adventure_Entity_Type.gold_bag: {
                return `${base.amount} gold`;
            }

            default: return snake_case_to_capitalized_words(enum_to_string(base.type));
        }
    }

    const name = `${entity_name()} (#${base.id})`;
    const fx = Particles.CreateParticle("particles/shop_arrow.vpcf", ParticleAttachment_t.PATTACH_OVERHEAD_FOLLOW, world_id);
    register_particle_for_reload(fx);

    const selection_label = $.CreatePanel("Label", entity_buttons, "editor_selected_entity");
    selection_label.text = `Selected: ${name}`;

    editor.selection = {
        type: Adventure_Selection_Type.entity,
        id: base.id,
        entity: world_id,
        particle: fx
    };

    if (base.type == Adventure_Entity_Type.enemy) {
        create_adventure_enemy_menu_buttons(editor, entity, base, name);
    } else if (base.type == Adventure_Entity_Type.merchant) {
        create_adventure_merchant_buttons(editor, entity, base);
    }

    entity_button("Delete", () => {
        dispatch_local_editor_action({
            type: Editor_Action_Type.delete_entity,
            entity_id: base.id
        })
    }, "editor_entity_delete_button");
}

function adventure_editor_select_entity_multiple(editor: Adventure_Editor, entity: Physical_Adventure_Entity) {
    const selected_entities = editor.selection.type == Adventure_Selection_Type.multiple ? editor.selection.entities : [];

    if (editor.selection.type == Adventure_Selection_Type.entity) {
        selected_entities.push({
            id: editor.selection.id,
            entity: editor.selection.entity,
            particle: editor.selection.particle
        });
    }

    if (editor.selection.type != Adventure_Selection_Type.none) {
        drop_adventure_editor_selection(editor);
    }

    editor.selection = {
        type: Adventure_Selection_Type.multiple,
        entities: selected_entities
    };

    selected_entities.push({
        id: entity.base.id,
        entity: entity.world_entity_id,
        particle: -1 as ParticleId
    });

    for (const selected of selected_entities) {
        selected.particle = Particles.CreateParticle("particles/shop_arrow.vpcf", ParticleAttachment_t.PATTACH_OVERHEAD_FOLLOW, selected.entity);
        register_particle_for_reload(selected.particle);
    }

    const selection_label = $.CreatePanel("Label", entity_buttons, "editor_selected_entity");
    selection_label.text = `Selected: ${selected_entities.length}`;

    entity_button("Delete", () => {
        for (const selected of selected_entities) {
            dispatch_local_editor_action({
                type: Editor_Action_Type.delete_entity,
                entity_id: selected.id
            })
        }
    }, "editor_entity_delete_button");

}

function hide_editor_context_menu() {
    context_menu.style.visibility = "collapse";

    if (context_menu_particle != undefined) {
        Particles.DestroyParticleEffect(context_menu_particle, true);
        Particles.ReleaseParticleIndex(context_menu_particle);
    }
}

function toolbar_button(text: string, action: (btn: Panel) => void) {
    return text_button(toolbar_buttons, "toolbar_button", text, action);
}

function destroy_rect_outline(rect: Rect_Outline) {
    destroy_fx(rect.bottom);
    destroy_fx(rect.left);
    destroy_fx(rect.top);
    destroy_fx(rect.right);
}

function make_rect_outline(world_origin: XYZ, from: XY, to: XY, color: RGB): Rect_Outline {
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
    const arrow_position: XYZ = xyz(
        world_min.x + (world_max.x - world_min.x) / 2,
        world_min.y + (world_max.y - world_min.y) / 2,
        world_min.z + (world_max.z - world_min.z) / 2 + 128,
    );

    Particles.SetParticleControl(facing_particle, 0, xyz_to_array(arrow_position));
    Particles.SetParticleControl(facing_particle, 2, [
        arrow_position.x + facing.x,
        arrow_position.y + facing.y,
        arrow_position.z
    ]);

    register_particle_for_reload(facing_particle);

    return facing_particle;
}

function make_new_zone(editor: Battleground_Editor, min: XY, max: XY, facing: XY): UI_Deployment_Zone {
    return {
        min: min,
        max: max,
        face: facing,
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

async function camera_restriction_zone_particles(points: XY[]): Promise<ParticleId[]> {
    return Promise.all(
        points.map(point => async_local_api_request(Local_Api_Request_Type.get_ground_z, point).then(ground => xyz(point.x, point.y, ground.ok ? ground.body.z : 0)))
    ).then(points => {
        const result: ParticleId[] = [];

        for (let index = 0; index < points.length; index++) {
            const a = points[index];
            const b = points[(index + 1) % points.length];

            const fx = Particles.CreateParticle("particles/ui/highlight_rope.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0);
            Particles.SetParticleControl(fx, 0, [a.x, a.y, a.z + 32]);
            Particles.SetParticleControl(fx, 1, [b.x, b.y, b.z + 32]);
            Particles.SetParticleControl(fx, 2, color_red);

            register_particle_for_reload(fx);

            result.push(fx);
        }

        return result;
    });
}

function update_editor_cells_outline(editor: Battleground_Editor, cells: Editor_Cell[], outline: ParticleId[], color: RGB = color_green) {
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

    const selection_label = $.CreatePanel("Label", entity_buttons, "editor_selected_entity");

    brush.selection_outline = update_editor_cells_outline(editor, brush.selected, brush.selection_outline);

    const selected = brush.selected;
    const all_empty = selected.every(cell => !editor_spawn_at_xy(editor, cell.position));

    function battleground_updating_button(text: string, action: () => void) {
        entity_button(text, () => {
            action();

            battleground_editor_update_buttons_after_selection_change(editor, brush);
            submit_editor_battleground_for_repaint(editor);
            submit_battleground_state_to_server(editor);
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
            selection_label.text = "Empty";

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
                    const type_name = enum_to_string(spawn.type);
                    selection_label.text = type_name[0].toUpperCase() + type_name.slice(1);

                    create_spawn_specific_buttons(spawn);
                }
            } else {
                const cells_with_entities = selected.reduce((counter, cell) => counter + (editor_spawn_at_xy(editor, cell.position) ? 1 : 0), 0);

                selection_label.text = `${cells_with_entities} ${cells_with_entities == 1 ? "entity" : "entities"}`;
            }

            entity_button("Delete", () => {
                for (const cell of selected) {
                    editor_remove_spawn_at(editor, cell.position);
                }

                battleground_editor_update_buttons_after_selection_change(editor, brush);
                submit_editor_battleground_for_repaint(editor);
                submit_battleground_state_to_server(editor);
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
            for (let x = zone.min.x; x <= zone.max.x; x++) {
                for (let y = zone.min.y; y <= zone.max.y; y++) {
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

function battleground_editor_set_grid_brush_selection_state(editor: Battleground_Editor, brush: Battleground_Crop_Grid_Brush, new_state: Battleground_Crop_Grid_Brush["selection"]) {
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
        entity_button("Crop grid", async () => {
            const new_world_x = editor.grid_world_origin.x + Const.battle_cell_size * selection.min.x;
            const new_world_y = editor.grid_world_origin.y + Const.battle_cell_size * selection.min.y;
            const new_world_z = await async_local_api_request(Local_Api_Request_Type.get_ground_z, { x: new_world_x, y: new_world_y });
            if (!new_world_z.ok) return;

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

            editor.grid_world_origin = { x: new_world_x, y: new_world_y, z: new_world_z.body.z };
            editor.grid_size.x = selection.max.x - selection.min.x + 1;
            editor.grid_size.y = selection.max.y - selection.min.y + 1;

            battleground_editor_recreate_cells(editor);
            battleground_editor_set_grid_brush_selection_state(editor, brush, { active: false });
            submit_editor_battleground_for_repaint(editor);
            submit_battleground_state_to_server(editor);
        });
    }
}

export function battleground_editor_filter_mouse_click(editor: Battleground_Editor, event: MouseEvent, button: MouseButton | WheelScroll) {
    const cursor = GameUI.GetCursorPosition();
    const world_position = get_screen_world_position(cursor);

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
        const set_facing = (facing: XY) => {
            selection.facing = facing;

            destroy_fx(selection.facing_particle);

            selection.facing_particle = make_zone_facing_particle(editor, selection.min, selection.max, facing);
        };

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
        case Battleground_Brush_Type.crop_grid: {
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

function adventure_editor_show_context_menu(editor: Adventure_Editor, click_world_position: XYZ) {
    const click = xy(click_world_position.x, click_world_position.y);

    function context_menu_button(text: string, action: () => void) {
        return text_button(context_menu, "context_menu_button", text, () => {
            hide_editor_context_menu();

            action();
        });
    }

    function prepare_context_menu() {
        context_menu_particle = Particles.CreateParticle("particles/ui_mouseactions/ping_waypoint.vpcf", ParticleAttachment_t.PATTACH_WORLDORIGIN, 0);
        Particles.SetParticleControl(context_menu_particle, 0, xyz_to_array(click_world_position));

        context_menu.RemoveAndDeleteChildren();
        context_menu.style.visibility = "visible";
    }

    function standard_buttons() {
        prepare_context_menu();

        context_menu_button(`Create enemy`, enemy_creation_buttons);
        context_menu_button(`Create item`, item_creation_buttons);
        context_menu_button(`Create gold bag`, () => gold_bag_buttons(10));
        context_menu_button(`Create ...`, entity_creation_buttons);

        context_menu_button(`Set entrance to here`, async () => {
            const ground = await async_local_api_request(Local_Api_Request_Type.get_ground_z, click);
            if (!ground.ok) return;

            editor.room_entrance_location = xyz(click.x, click.y, ground.body.z);

            submit_adventure_room_details_to_server(editor);
        });

        context_menu_button(`Teleport here`, () => {
            dispatch_local_editor_action({
                type: Editor_Action_Type.teleport,
                position: click
            })
        });
    }

    function item_creation_buttons() {
        prepare_context_menu();
        context_menu_button("Back", standard_buttons);

        const wrapper = $.CreatePanel("Panel", context_menu, "context_menu_item_wrapper");
        const item_container = $.CreatePanel("Panel", wrapper, "context_menu_item_container");

        function item_button(name: string, item: Adventure_Item_Id) {
            const button = $.CreatePanel("Button", item_container, "");
            button.AddClass("item");
            button.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
                $.DispatchEvent("DOTAShowTextTooltip", button, snake_case_to_capitalized_words(name));
            });

            button.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
                $.DispatchEvent("DOTAHideTextTooltip");
            });

            button.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
                hide_editor_context_menu();

                dispatch_local_editor_action({
                    type: Editor_Action_Type.create_entity,
                    definition: {
                        type: Adventure_Entity_Type.item_on_the_ground,
                        spawn_position: click,
                        spawn_facing: xy(1, 0),
                        item: item
                    }
                });
            });

            safely_set_panel_background_image(button, get_adventure_item_icon_by_id(item));
        }

        for (const [name, id] of enum_names_to_values<Adventure_Item_Id>()) {
            item_button(name, id);
        }
    }

    function enemy_creation_buttons() {
        prepare_context_menu();
        context_menu_button("Back", standard_buttons);

        for (const [creep_name, creep_type] of enum_names_to_values<Creep_Type>()) {
            context_menu_button(`Create ${creep_name}`, () => {
                dispatch_local_editor_action({
                    type: Editor_Action_Type.create_entity,
                    definition: {
                        type: Adventure_Entity_Type.enemy,
                        battleground: 0 as Battleground_Id,
                        world_model: creep_type,
                        spawn_position: click,
                        spawn_facing: xy(1, 0),
                        creeps: []
                    }
                })
            });
        }
    }

    function entity_creation_buttons() {
        prepare_context_menu();
        context_menu_button("Back", standard_buttons);

        const base = {
            spawn_position: click,
            spawn_facing: xy(1, 0),
        };

        function entity_button(name: string, definition: Adventure_Entity_Definition) {
            context_menu_button(snake_case_to_capitalized_words(name), () => {
                dispatch_local_editor_action({
                    type: Editor_Action_Type.create_entity,
                    definition: definition
                })
            });
        }

        entity_button(enum_to_string(Adventure_Entity_Type.lost_creep), {
            type: Adventure_Entity_Type.lost_creep, ...base
        });

        entity_button(enum_to_string(Adventure_Entity_Type.shrine), {
            type: Adventure_Entity_Type.shrine, ...base
        });

        context_menu_button(snake_case_to_capitalized_words(enum_to_string(Adventure_Entity_Type.merchant)), merchant_buttons);

        context_menu_button("Camera restriction zone", async () => {
            const offset = 150;
            const points = graham_scan([
                xy(click_world_position.x - offset, click_world_position.y - offset),
                xy(click_world_position.x - offset, click_world_position.y + offset),
                xy(click_world_position.x + offset, click_world_position.y + offset),
                xy(click_world_position.x + offset, click_world_position.y - offset),
            ]);

            const new_zone: UI_Camera_Restriction_Zone = {
                points: points,
                particles: await camera_restriction_zone_particles(points)
            };

            editor.camera_restriction_zones.push(new_zone);

            adventure_editor_select_camera_restriction_zone(editor, new_zone);
            submit_adventure_room_details_to_server(editor);
        });

        context_menu_button("Room exit", async () => {
            room_exit_buttons();
        });
    }

    function gold_bag_buttons(amount: number) {
        prepare_context_menu();
        context_menu_button("Back", standard_buttons);
        context_menu_button(`${amount} gold`, () => {
            dispatch_local_editor_action({
                type: Editor_Action_Type.create_entity,
                definition: {
                    type: Adventure_Entity_Type.gold_bag,
                    amount: amount,
                    spawn_position: click,
                    spawn_facing: xy(1, 0),
                }
            })
        });

        for (const change of [5, 2, 1, -1, -2, -5]) {
            context_menu_button(`${change > 0 ? "+" : ""}${change}`, () => {
                gold_bag_buttons(amount + change);
            });
        }
    }

    function merchant_buttons() {
        prepare_context_menu();
        context_menu_button("Back", entity_creation_buttons);

        for (const [name, model] of enum_names_to_values<Adventure_Merchant_Model>()) {
            context_menu_button(snake_case_to_capitalized_words(name), () => {
                dispatch_local_editor_action({
                    type: Editor_Action_Type.create_entity,
                    definition: {
                        type: Adventure_Entity_Type.merchant,
                        model: model,
                        spawn_position: click,
                        spawn_facing: xy(1, 0),
                        stock: {
                            items: [],
                            creeps: [],
                            heroes: [],
                            spells: []
                        },
                    }
                })
            });
        }
    }

    async function room_exit_buttons() {
        prepare_context_menu();
        context_menu_button("Back", entity_creation_buttons);

        const room_list = await async_api_request(Api_Request_Type.editor_list_rooms, {
            access_token: get_access_token()
        });

        for (const room of room_list.rooms) {
            context_menu_button(`To ${room.name}`, async () => {
                const ground = await async_local_api_request(Local_Api_Request_Type.get_ground_z, click);
                if (!ground.ok) return;

                const new_exit: UI_Room_Exit = {
                    at: xyz(click.x, click.y, ground.body.z),
                    indicator: create_world_indicator(`To ${room.name}`),
                    to: room.id,
                    name: room.name
                };

                editor.exits.push(new_exit);

                submit_adventure_room_details_to_server(editor);
            });
        }
    }

    const selection = editor.selection;

    if (selection.type == Adventure_Selection_Type.entity) {
        prepare_context_menu();

        context_menu_button(`Move here`, () => {
            dispatch_local_editor_action({
                type: Editor_Action_Type.set_entity_position,
                entity_id: selection.id,
                position: xy(click_world_position.x, click_world_position.y)
            });
        });

        context_menu_button(`Look here`, () => {
            const position = Entities.GetAbsOrigin(selection.entity);
            const delta = [click_world_position.x - position[0], click_world_position.y - position[1]];
            const length = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);
            const facing = length > 0 ? [delta[0] / length, delta[1] / length, 0] : [1, 0, 0];

            dispatch_local_editor_action({
                type: Editor_Action_Type.set_entity_facing,
                entity_id: selection.id,
                facing: xy(facing[0], facing[1])
            });
        });

        context_menu_button(`Duplicate here`, async () => {
            const answer = await async_api_request(Api_Request_Type.editor_get_entity_definition, {
                entity: selection.id,
                access_token: get_access_token()
            });

            answer.definition.spawn_position = xy(click_world_position.x, click_world_position.y);

            await dispatch_local_editor_action({
                type: Editor_Action_Type.create_entity,
                definition: answer.definition
            });

            drop_adventure_editor_selection(editor);
        });

    } else {
        standard_buttons();
    }
}

function find_camera_restriction_zone_under_cursor(editor: Adventure_Editor, cursor: XY) {
    to_the_next_zone:
    for (const zone of editor.camera_restriction_zones) {
        const points = zone.points;

        for (let index = 0; index < points.length; index++) {
            const this_point = points[index];
            const next_point = points[(index + 1) % points.length];
            const cross = cross_product(sub(next_point, this_point), sub(cursor, next_point));

            if (cross < 0) {
                continue to_the_next_zone;
            }
        }

        return zone;
    }
}

function graham_scan(points: XY[]) {
    const reference = (() => {
        let corner_point = points[0];

        for (const point of points) {
            if (point.y < corner_point.y) {
                corner_point = point;
            } else if (point.y == corner_point.y && point.x < corner_point.x) {
                corner_point = point;
            }
        }

        return corner_point;
    })();

    function angle_from_reference(to_what: XY) {
        const delta = sub(to_what, reference);
        return Math.atan2(delta.y, delta.x);
    }

    const sorted = points.sort((a, b) => {
        const angle_to_a = angle_from_reference(a);
        const angle_to_b = angle_from_reference(b);

        if (angle_to_a == angle_to_b) {
            const distance_to_a = len(sub(a, reference));
            const distance_to_b = len(sub(b, reference));

            return distance_to_a - distance_to_b;
        }

        return angle_to_a - angle_to_b;
    });

    const stack = [
        reference,
        sorted[1]
    ];

    for (let index = 2; index < sorted.length; index++) {
        const point = sorted[index];

        while (stack.length > 1) {
            const top = stack[stack.length - 1];
            const next_to_top = stack[stack.length - 2];
            const cross = cross_product(sub(top, next_to_top), sub(point, top));

            if (cross >= 0) {
                break;
            }

            stack.pop();
        }

        stack.push(point);
    }

    return stack;
}

function adventure_editor_select_camera_restriction_zone(editor: Adventure_Editor, zone: UI_Camera_Restriction_Zone) {
    if (editor.selection.type != Adventure_Selection_Type.none) {
        drop_adventure_editor_selection(editor);
    }

    const center = xy(
        zone.points.map(xy => xy.x).reduce((prev, curr) => prev + curr) / zone.points.length,
        zone.points.map(xy => xy.y).reduce((prev, curr) => prev + curr) / zone.points.length,
    );

    const name = `Camera restriction zone`;
    const fx = Particles.CreateParticle("particles/shop_arrow.vpcf", ParticleAttachment_t.PATTACH_WORLDORIGIN, 0);
    Particles.SetParticleControl(fx, 0, [center.x, center.y, 256]);
    register_particle_for_reload(fx);

    editor.selection = {
        type: Adventure_Selection_Type.camera_restriction,
        zone: zone,
        particle: fx
    };

    const selection_label = $.CreatePanel("Label", entity_buttons, "editor_selected_entity");
    selection_label.text = `Selected: ${name}`;

    $.CreatePanel("Label", entity_buttons, "").text = "Shift + Left click to add points";
    $.CreatePanel("Label", entity_buttons, "").text = "Shift + Right click to remove points";

    entity_button("Delete", () => {
        const zone_index = editor.camera_restriction_zones.findIndex(other => other == zone);
        if (zone_index != -1) {
            for (const particle of zone.particles) {
                destroy_fx(particle);
            }

            editor.camera_restriction_zones.splice(zone_index, 1);
            drop_adventure_editor_selection(editor);
            submit_adventure_room_details_to_server(editor);
        }
    }, "editor_entity_delete_button");
}

function adventure_editor_select_room_exit(editor: Adventure_Editor, exit: UI_Room_Exit) {
    if (editor.selection.type != Adventure_Selection_Type.none) {
        drop_adventure_editor_selection(editor);
    }

    exit.indicator.root.AddClass("selected");

    editor.selection = {
        type: Adventure_Selection_Type.room_exit,
        exit: exit
    };

    const selection_label = $.CreatePanel("Label", entity_buttons, "editor_selected_entity");
    selection_label.text = `Selected: Exit to ${exit.name}`;

    entity_button("Delete", () => {
        const exit_index = editor.exits.findIndex(other => other == exit);
        if (exit_index != -1) {
            editor.exits.splice(exit_index, 1);
            exit.indicator.root.DeleteAsync(0);
            drop_adventure_editor_selection(editor);
            submit_adventure_room_details_to_server(editor);
        }
    }, "editor_entity_delete_button");
}

// Returns if event should be consumed or not
export function adventure_editor_filter_mouse_click(editor: Adventure_Editor, event: MouseEvent, button: MouseButton | WheelScroll): boolean {
    if (event != "pressed") {
        return true;
    }

    if (button != MouseButton.LEFT && button != MouseButton.RIGHT) {
        return true;
    }

    hide_editor_context_menu();

    async function update_zone_points(zone: UI_Camera_Restriction_Zone, new_points: XY[]) {
        new_points = graham_scan(new_points);

        const new_particles = await camera_restriction_zone_particles(new_points);

        zone.points = new_points;
        zone.particles.forEach(destroy_fx);
        zone.particles = new_particles;

        submit_adventure_room_details_to_server(editor);
    }

    if (editor.selection.type == Adventure_Selection_Type.camera_restriction && GameUI.IsShiftDown()) {
        const cursor_world = get_screen_world_position(GameUI.GetCursorPosition());
        if (!cursor_world) return true;

        const cursor_xy = xy(cursor_world.x, cursor_world.y);
        const selected_zone = editor.selection.zone;

        if (button == MouseButton.LEFT) {
            let new_points = [...selected_zone.points];
            new_points.push(cursor_xy);

            update_zone_points(selected_zone, new_points);
        } else if (button == MouseButton.RIGHT) {
            let closest_point_index = -1;
            let smallest_distance = Number.MAX_SAFE_INTEGER;

            for (let index = 0; index < selected_zone.points.length; index++) {
                const point = selected_zone.points[index];
                const distance = len(sub(point, cursor_xy));

                if (distance < smallest_distance) {
                    closest_point_index = index;
                    smallest_distance = distance;
                }
            }

            if (selected_zone.points.length > 3 && closest_point_index != -1 && smallest_distance <= 200) {
                const new_points = [...selected_zone.points];
                new_points.splice(closest_point_index, 1);

                update_zone_points(selected_zone, new_points);
            }
        }

        return true;
    }

    if (button == MouseButton.LEFT) {
        const cursor = GameUI.GetCursorPosition();
        const entity_under_cursor = get_entity_under_cursor(cursor);
        if (entity_under_cursor != undefined) {
            const entity_data = find_adventure_entity_by_world_index(entity_under_cursor);

            if (entity_data) {
                if (GameUI.IsShiftDown()) {
                    adventure_editor_select_entity_multiple(editor, entity_data)
                } else {
                    adventure_editor_select_entity(editor, entity_data);
                }

                return true;
            }
        }

        const cursor_world = get_screen_world_position(cursor);

        if (cursor_world) {
            const room_exit = editor.exits.find(exit => len(sub(exit.at, cursor_world)) <= 100);

            if (room_exit) {
                adventure_editor_select_room_exit(editor, room_exit);
                return true;
            }
        }

        if (cursor_world) {
            const camera_zone = find_camera_restriction_zone_under_cursor(editor, xy(cursor_world.x, cursor_world.y));

            if (camera_zone) {
                adventure_editor_select_camera_restriction_zone(editor, camera_zone);
                return true;
            }
        }

        drop_adventure_editor_selection(editor);

        return true;
    }

    if (button == MouseButton.RIGHT) {
        const click_world_position = get_screen_world_position(GameUI.GetCursorPosition());
        if (!click_world_position) return true;

        adventure_editor_show_context_menu(editor, click_world_position);

        pinned_context_menu_position = click_world_position;
    }

    return true;
}

function update_battleground_brush_from_cursor(editor: Battleground_Editor, position: XY, pressed: boolean, shift_down: boolean) {
    const brush = editor.brush;

    switch (brush.type) {
        case Battleground_Brush_Type.deployment:
        case Battleground_Brush_Type.select:
        case Battleground_Brush_Type.crop_grid: {
            const outline_color: Record<typeof brush.type, RGB> = {
                [Battleground_Brush_Type.select]: color_green,
                [Battleground_Brush_Type.crop_grid]: color_yellow,
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

                    if (brush.type == Battleground_Brush_Type.crop_grid) {
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

        case Battleground_Brush_Type.paint_grid: {
            if (!pressed) break;

            const cell = editor_cell_by_xy(editor, position);
            if (!cell) break;

            cell.disabled = shift_down;

            battleground_editor_recreate_cells(editor);
            submit_battleground_state_to_server(editor);
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
            submit_battleground_state_to_server(editor);

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

    if (brush.type == Battleground_Brush_Type.crop_grid) {
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

    if (brush.type == Battleground_Brush_Type.paint_grid) {
        destroy_rect_outline(brush.outline);
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

function create_world_indicator(label: string): World_Indicator {
    const indicator = $.CreatePanel("Panel", world_indicators_root, "");
    indicator.AddClass("editor_world_indicator");

    const text = $.CreatePanel("Label", indicator, "text");
    text.text = label;

    $.CreatePanel("Panel", indicator, "underline");
    $.CreatePanel("Panel", indicator, "marker");

    return {
        root: indicator,
        text: text
    }
}

function periodically_update_editor_ui() {
    $.Schedule(1 / 200, periodically_update_editor_ui);

    if (editor.type == Editor_Type.adventure) {
        if (editor.selection.type == Adventure_Selection_Type.entity) {
            if (!Entities.IsValidEntity(editor.selection.entity)) {
                drop_adventure_editor_selection(editor);
            }
        }

        position_panel_over_position_in_the_world(editor.entrance_indicator.root, editor.room_entrance_location, Align_H.center, Align_V.top);

        for (const exit of editor.exits) {
            position_panel_over_position_in_the_world(exit.indicator.root, exit.at, Align_H.center, Align_V.top);
        }
    }

    if (editor.type == Editor_Type.battleground) {
        const cursor = GameUI.GetCursorPosition();
        const world_position = get_screen_world_position(cursor);

        if (editor.cell_under_cursor) {
            const should_paint_red = GameUI.IsShiftDown() &&
                (editor.brush.type == Battleground_Brush_Type.trees || editor.brush.type == Battleground_Brush_Type.paint_grid)

            Particles.SetParticleControl(editor.cell_under_cursor.particle, 2, should_paint_red ? [255, 0, 0] : [0, 255, 0]);
            Particles.SetParticleControl(editor.cell_under_cursor.particle, 3, [255, 0, 0]);
        }

        if (world_position) {
            const battle_position = world_position_to_battle_position(editor.grid_world_origin, world_position);
            const actual_cell_under_cursor = editor_cell_by_xy(editor, battle_position);

            if (actual_cell_under_cursor != editor.cell_under_cursor) {
                if (editor.cell_under_cursor) {
                    const alpha = battleground_editor_cell_alpha(editor, editor.cell_under_cursor);
                    Particles.SetParticleControl(editor.cell_under_cursor.particle, 2, [255, 255, 255]);
                    Particles.SetParticleControl(editor.cell_under_cursor.particle, 3, [ alpha, 0, 0 ]);
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
            dispatch_local_editor_action({
                type: Editor_Action_Type.set_camera,
                camera: {
                    free: true
                }
            });

            const camera_position = Game.ScreenXYToWorld(Game.GetScreenWidth() / 2, Game.GetScreenHeight() / 2);

            if (camera_position) {
                editor.last_camera_position = xyz(...camera_position);
            }

            break;
        }

        case Editor_Type.battleground: {
            dispatch_local_editor_action({
                type: Editor_Action_Type.set_camera,
                camera: {
                    free: false,
                    world_origin: editor.grid_world_origin,
                    grid_size: editor.grid_size
                }
            });

            break;
        }
    }
}

function update_state_from_editor_mode(state: Player_State, editor: Editor) {
    update_editor_indicator(editor);
    update_editor_camera_height(editor);

    if (editor.type == Editor_Type.none) {
        hide_editor_context_menu();
    }

    $.GetContextPanel().SetHasClass("in_editor", editor.type != Editor_Type.none);

    update_editor_buttons(state);
}

function update_adventure_editor_buttons(editor: Adventure_Editor) {
    editor_button("Toggle map vision", () => dispatch_local_editor_action({
        type: Editor_Action_Type.toggle_map_vision
    }));

    editor_button("Change camera height", () => {
        editor.camera_height_index = (editor.camera_height_index + 1) % 5;

        update_editor_camera_height(editor);
    });
}

async function load_battleground_editor(for_battleground: Battleground_Id, enemy?: Editor_Enemy_Battleground_Data, previous_editor?: Editor) {
    const response = await async_api_request(Api_Request_Type.editor_get_battleground, { id: for_battleground });

    enter_battleground_editor(for_battleground, response.battleground, enemy, previous_editor);
}

function fill_battleground_editor_cells(editor: Battleground_Editor, is_disabled: (xy: XY) => boolean): Editor_Cell[][] {
    const cells: Editor_Cell[][] = [];

    for (let x = 0; x < editor.grid_size.x; x++) {
        const by_x: Editor_Cell[] = [];

        for (let y = 0; y < editor.grid_size.y; y++) {
            const center = battle_position_to_world_position_center(editor.grid_world_origin, xy(x, y));
            const particle = create_cell_particle_at(center);
            const cell = {
                position: xy(x, y),
                particle: particle,
                occupants: 0,
                disabled: is_disabled(xy(x, y))
            };

            by_x.push(cell);

            register_particle_for_reload(particle);

            const alpha = battleground_editor_cell_alpha(editor, cell);

            Particles.SetParticleControl(particle, 3, [ alpha, 0, 0 ]);
        }

        cells[x] = by_x;
    }

    return cells;
}

function battleground_editor_cell_alpha(editor: Battleground_Editor, cell: Editor_Cell) {
    if (cell.disabled) {
        return 0;
    }

    if (editor.brush.type == Battleground_Brush_Type.paint_grid) {
        return 50;
    }

    return 10;
}

function battleground_editor_recreate_cells(editor: Battleground_Editor) {
    const disabled = battleground_editor_disabled_cell_indices(editor);
    battleground_editor_cleanup_cells(editor);
    editor.cells = fill_battleground_editor_cells(editor, should_cell_be_disabled(editor.grid_size, disabled));
}

function should_cell_be_disabled(grid_size: XY, disabled: Cell_Index[]): (xy: XY) => boolean {
    const index = disabled_cell_index(disabled);
    return xy => index[xy.x * grid_size.y + xy.y];
}

function battleground_editor_disabled_cell_indices(editor: Battleground_Editor): Cell_Index[] {
    const disabled_cells: Cell_Index[] = [];

    for (const by_x of editor.cells) {
        for (const cell of by_x) {
            if (cell.disabled) {
                disabled_cells.push(cell.position.x * editor.grid_size.y + cell.position.y as Cell_Index);
            }
        }
    }

    return disabled_cells;
}

function battleground_editor_cleanup_cells(editor: Battleground_Editor) {
    for (const by_x of editor.cells) {
        for (const cell of by_x) {
            destroy_fx(cell.particle);
        }
    }
}

function enter_battleground_editor(id: Battleground_Id, battleground: Battleground, enemy?: Editor_Enemy_Battleground_Data, previous_editor?: Editor) {
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
        theme: battleground.theme,
        battleground_name: battleground.name,
        cells: [],
        grid_size: xy(grid_w, grid_h),
        spawns: [],
        grid_world_origin: battleground.world_origin,
        brush: default_selection_brush,
        deployment_zones: battleground.deployment_zones,
        enemy_data: enemy,
        previous_editor: previous_editor
    };

    new_editor.cells = fill_battleground_editor_cells(new_editor, should_cell_be_disabled(battleground.grid_size, battleground.disabled_cells));

    for (const spawn of battleground.spawns) {
        editor_set_spawn_at(new_editor, spawn.at, spawn);
    }

    set_current_editor(new_editor);

    const buttons: Brush_Button[] = [];

    type Brush_Button = {
        panel: Panel
    }

    function update_brush_button_styles(current_selected: Panel) {
        for (const button of buttons) {
            button.panel.SetHasClass("selected", button.panel == current_selected);
        }
    }

    function set_brush_button(text: string, brush_maker: () => Battleground_Brush) {
        const panel = brush_button(text, () => {
            const old_brush = new_editor.brush;
            const new_brush = brush_maker();
            battleground_editor_cleanup_brush(new_editor);
            new_editor.brush = new_brush;
            update_brush_button_styles(panel);

            if (new_brush.type == Battleground_Brush_Type.crop_grid) {
                battleground_editor_set_grid_brush_selection_state(new_editor, new_brush, { active: false });
            }

            if (new_brush.type == Battleground_Brush_Type.deployment) {
                new_brush.zones = new_editor.deployment_zones.map(zone => make_new_zone(
                    new_editor,
                    xy(zone.min.x, zone.min.y),
                    xy(zone.max.x, zone.max.y),
                    xy(zone.face.x, zone.face.y)
                ));

                battleground_editor_set_deployment_brush_selection_state(new_editor, new_brush, { active: false });
            }

            if (old_brush.type == Battleground_Brush_Type.paint_grid || new_brush.type == Battleground_Brush_Type.paint_grid) {
                battleground_editor_recreate_cells(new_editor);
            }
        });

        buttons.push({
            panel: panel
        });

        return panel;
    }

    const selection = set_brush_button("Selection tool", () => default_selection_brush);

    set_brush_button("Paint trees", () => ({
        type: Battleground_Brush_Type.trees
    }));

    set_brush_button("Deployment zones", () => ({
        type: Battleground_Brush_Type.deployment,
        selection: { active: false },
        drag_state: { dragging: false },
        zones: []
    }));

    set_brush_button("Crop grid", () => ({
        type: Battleground_Brush_Type.crop_grid,
        selection: { active: false },
        drag_state: { dragging: false }
    }));

    set_brush_button("Paint grid", () => ({
        type: Battleground_Brush_Type.paint_grid,
        outline: make_rect_outline(new_editor.grid_world_origin, xy(0, 0), sub(new_editor.grid_size, xy(1, 1)), color_yellow)
    }));

    update_brush_button_styles(selection);

    async function set_enemy_battleground(enemy: Editor_Enemy_Battleground_Data, battleground: Battleground_Id) {
        await async_api_request(Api_Request_Type.editor_action, {
            type: Adventure_Editor_Action_Type.set_enemy_battleground,
            entity_id: enemy.id,
            battleground: battleground,
            access_token: get_access_token()
        });
    }

    const menu = dropdown_menu(toolbar_buttons_dropdown);

    $.CreatePanel("Label", toolbar_buttons, "").text = `Battleground #${id}`;

    const name_input = $.CreatePanel("TextEntry", toolbar_buttons, "name_input");
    name_input.text = battleground.name;
    name_input.SetPanelEvent(PanelEvent.ON_TEXT_ENTRY_CHANGE, () => {
        new_editor.battleground_name = name_input.text;

        submit_battleground_state_to_server(new_editor);
    });

    toolbar_button("New", dropdown_menu_action(menu, async (parent, close_dropdown) => {
        const locations = await async_local_api_request(Local_Api_Request_Type.list_battle_locations, {});

        if (locations.ok) {
            for (const location of locations.body) {
                toolbar_dropdown_button(`${location.name} (${enum_to_string(location.theme)})`, async () => {
                    const response = await async_api_request(Api_Request_Type.editor_create_battleground, {
                        name: "New battleground",
                        world_origin: location.origin,
                        theme: location.theme
                    });

                    cleanup_current_editor();
                    enter_battleground_editor(response.id, response.battleground, enemy, previous_editor);
                });
            }
        }

        toolbar_dropdown_button("Cancel", () => close_dropdown());
    }));

    toolbar_button("Duplicate", async () => {
        const response = await async_api_request(Api_Request_Type.editor_duplicate_battleground, { id: id });

        cleanup_current_editor();
        load_battleground_editor(response.new_id, enemy, previous_editor);
    });

    toolbar_button("Open", dropdown_menu_action(menu, async () => {
        const response = await async_api_request(Api_Request_Type.editor_list_battlegrounds, {});

        for (const bg of response.battlegrounds) {
            toolbar_dropdown_button(`${bg.name} (#${bg.id}, ${bg.size.x}x${bg.size.y})`, () => {
                cleanup_current_editor();
                load_battleground_editor(bg.id, enemy, previous_editor);
            });
        }
    }));

    toolbar_button("Delete", dropdown_menu_action(menu, async (parent, close_dropdown) => {
        toolbar_dropdown_button("Confirm", async () => {
            await async_api_request(Api_Request_Type.editor_delete_battleground, { id: id });

            if (enemy) {
                await set_enemy_battleground(enemy, 0 as Battleground_Id);
            }

            cleanup_current_editor();
            await load_battleground_editor(0 as Battleground_Id, enemy, previous_editor);
        });

        toolbar_dropdown_button("Cancel", () => close_dropdown());
    }));

    toolbar_button("Select location", dropdown_menu_action(menu, async (parent, close_dropdown) => {
        const locations = await async_local_api_request(Local_Api_Request_Type.list_battle_locations, {});

        if (locations.ok) {
            for (const location of locations.body) {
                toolbar_dropdown_button(location.name, () => {
                    new_editor.grid_world_origin = location.origin;

                    battleground_editor_recreate_cells(new_editor);
                    submit_battleground_state_to_server(new_editor);
                    submit_editor_battleground_for_repaint(new_editor);
                });
            }
        }

        toolbar_dropdown_button("Cancel", () => close_dropdown());
    }));

    toolbar_button("Select theme", dropdown_menu_action(menu, async (parent, close_dropdown) => {
        const themes = enum_names_to_values<Battleground_Theme>();
        const theme_buttons: [Battleground_Theme, Panel][] = [];

        function update_button_styles() {
            for (let [button_theme, button] of theme_buttons) {
                button.SetHasClass("selected", button_theme == new_editor.theme);
            }
        }

        for (const [name, theme] of themes) {
            const button = toolbar_dropdown_button(snake_case_to_capitalized_words(name), () => {
                new_editor.theme = theme;

                submit_battleground_state_to_server(new_editor);
                submit_editor_battleground_for_repaint(new_editor);
                update_button_styles();
            });

            theme_buttons.push([theme, button]);
        }

        toolbar_dropdown_button("Cancel", () => close_dropdown());

        update_button_styles();
    }));

    if (enemy) {
        const label = $.CreatePanel("Label", toolbar_buttons, "");
        label.text = `Editing ${enemy.name}`;

        toolbar_button(`Playtest`, () => {
            exit_editor();
            dispatch_local_editor_action({
                type: Editor_Action_Type.playtest_battleground,
                enemy: enemy.id,
                battleground: id
            })
        });

        if (enemy.current_battleground_id != id) {
            const assign_button = toolbar_button("Assign battleground", dropdown_menu_action(menu, async (parent, close_dropdown) => {
                toolbar_dropdown_button("Confirm", async () => {
                    await set_enemy_battleground(enemy, id);

                    close_dropdown();

                    enemy.current_battleground_id = id;

                    assign_button.DeleteAsync(0);
                });

                toolbar_dropdown_button("Cancel", () => close_dropdown());
            }));

            toolbar_button(`Open current`, () => {
                cleanup_current_editor();
                load_battleground_editor(enemy.current_battleground_id, enemy, previous_editor);
            });
        }
    }

    if (previous_editor != undefined && previous_editor.type == Editor_Type.adventure) {
        toolbar_button("Back to adventure", async () => {
            await enter_adventure_editor();
            await dispatch_local_editor_action({
                type: Editor_Action_Type.move_camera,
                to: previous_editor.last_camera_position
            });

            if (editor.type == Editor_Type.adventure) {
                editor.camera_height_index = previous_editor.camera_height_index;
                update_editor_camera_height(editor);

                if (enemy) {
                    const entity = find_adventure_entity_by_id(enemy.id);

                    if (entity) {
                        adventure_editor_select_entity(editor, entity);
                    }
                }
            }
        });
    }

    submit_editor_battleground_for_repaint(new_editor);
}

function set_current_editor(new_editor: Editor) {
    cleanup_current_editor();

    world_indicators_root.RemoveAndDeleteChildren();
    brushes_root.RemoveAndDeleteChildren();
    entity_buttons.RemoveAndDeleteChildren();
    entity_buttons_dropdown.RemoveAndDeleteChildren();
    toolbar_buttons.RemoveAndDeleteChildren();
    toolbar_buttons_dropdown.RemoveAndDeleteChildren();

    editor = new_editor;

    update_state_from_editor_mode(current_state, new_editor);
}

async function enter_adventure_editor(move_camera = false) {
    const room = await async_api_request(Api_Request_Type.editor_get_room_details, {
        access_token: get_access_token()
    });

    const room_list = await async_api_request(Api_Request_Type.editor_list_rooms, {
        access_token: get_access_token()
    });

    const ground = await async_local_api_request(Local_Api_Request_Type.get_ground_z, room.entrance_location);
    if (!ground.ok) return;

    if (move_camera) {
        dispatch_local_editor_action({
            type: Editor_Action_Type.move_camera,
            to: xyz(room.entrance_location.x, room.entrance_location.y, 0)
        })
    }

    const new_editor: Adventure_Editor = {
        type: Editor_Type.adventure,
        room_type: room.type,
        room_name: room.name,
        selection: { type: Adventure_Selection_Type.none },
        camera_height_index: 4,
        room_entrance_location: xyz(room.entrance_location.x, room.entrance_location.y, ground.body.z),
        last_camera_position: xyz(0, 0, 0),
        entrance_indicator: create_world_indicator(""),
        camera_restriction_zones: [],
        exits: []
    };

    set_current_editor(new_editor);

    // A hack since we delete all world indicators in set_current_editor
    new_editor.entrance_indicator = create_world_indicator("START");
    new_editor.entrance_indicator.root.AddClass("editor_room_entrance_indicator");

    new_editor.camera_restriction_zones = await Promise.all(room.camera_restriction_zones.map(async zone => {
        const new_zone: UI_Camera_Restriction_Zone = {
            points: zone.points,
            particles: await camera_restriction_zone_particles(zone.points)
        };

        return new_zone;
    }));

    new_editor.exits = await Promise.all(room.exits.map(async exit => {
        const ground = await async_local_api_request(Local_Api_Request_Type.get_ground_z, exit.at);
        const z = ground.ok ? ground.body.z : 0;

        return {
            to: exit.to,
            at: xyz(exit.at.x, exit.at.y, z),
            indicator: create_world_indicator(`To ${exit.name}`),
            name: exit.name
        }
    }));

    function editor_title() {
        return `Room #${room.id} (${enum_to_string(new_editor.room_type)})`;
    }

    const title = $.CreatePanel("Label", toolbar_buttons, "");
    title.text = editor_title();

    const name_input = $.CreatePanel("TextEntry", toolbar_buttons, "name_input");
    name_input.text = room.name;
    name_input.SetPanelEvent(PanelEvent.ON_TEXT_ENTRY_CHANGE, () => {
        new_editor.room_name = name_input.text;

        submit_adventure_room_details_to_server(new_editor);
    });

    const menu = dropdown_menu(toolbar_buttons_dropdown);

    toolbar_button("Change type", dropdown_menu_action(menu, (parent, close) => {
        for (const [name, value] of enum_names_to_values<Adventure_Room_Type>()) {
            toolbar_dropdown_button(name, () => {
                new_editor.room_type = value;
                title.text = editor_title();
                submit_adventure_room_details_to_server(new_editor);
                close();
            }).SetHasClass("selected", value == new_editor.room_type);
        }

        toolbar_dropdown_button("Cancel", close);
    }));

    $.CreatePanel("Label", toolbar_buttons, "").text = "Rooms";

    for (const room of room_list.rooms) {
        toolbar_button(room.name, async () => {
            dispatch_local_editor_action({
                type: Editor_Action_Type.enter_adventure_room,
                room_id: room.id
            }).then(() => enter_adventure_editor(true));
        });
    }
}

function cleanup_current_editor() {
    switch (editor.type) {
        case Editor_Type.battleground: {
            dispatch_local_editor_action({
                type: Editor_Action_Type.submit_battleground,
                origin: editor.grid_world_origin,
                theme: editor.theme,
                spawns: []
            });

            battleground_editor_cleanup_cells(editor);
            battleground_editor_cleanup_brush(editor);
            break;
        }

        case Editor_Type.adventure: {
            drop_adventure_editor_selection(editor);

            for (const zone of editor.camera_restriction_zones) {
                zone.particles.forEach(destroy_fx);
            }

            break;
        }
    }
}

function update_editor_buttons(state: Player_State) {
    buttons_root.RemoveAndDeleteChildren();

    const adventures = enum_names_to_values<Adventure_Id>();

    if (state == Player_State.on_global_map) {
        for (const [name, id] of adventures) {
            editor_button(`Adventure: ${name}`, () => dispatch_local_editor_action({
                type: Editor_Action_Type.start_adventure,
                adventure: id
            }));
        }
    }

    if (editor.type != Editor_Type.none) {
        editor_button("Exit editor", () => {
            exit_editor();
        });
    } else {
        editor_button("Battleground editor", () => {
            load_battleground_editor(0 as Battleground_Id, undefined, editor);
        });
    }

    if (state == Player_State.on_adventure) {
        if (editor.type == Editor_Type.adventure) {
            update_adventure_editor_buttons(editor);
        } else {
            editor_button("Adventure editor", () => {
                enter_adventure_editor();
            });
        }

        editor_button("Back to map", () => {
            dispatch_local_editor_action({
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
            name: editor.battleground_name,
            world_origin: editor.grid_world_origin,
            theme: editor.theme,
            grid_size: editor.grid_size,
            deployment_zones: editor.deployment_zones,
            spawns: flattened_spawns,
            disabled_cells: battleground_editor_disabled_cell_indices(editor)
        }
    }, () => {});
}

function submit_editor_battleground_for_repaint(editor: Battleground_Editor) {
    const flattened_spawns: Battleground_Spawn[] = [];

    for_each_editor_spawn(editor.spawns, spawn => flattened_spawns.push(spawn));
    dispatch_local_editor_action({
        type: Editor_Action_Type.submit_battleground,
        origin: editor.grid_world_origin,
        spawns: flattened_spawns,
        theme: editor.theme
    });
}

function submit_adventure_room_details_to_server(editor: Adventure_Editor) {
    api_request(Api_Request_Type.editor_action, {
        type: Adventure_Editor_Action_Type.set_room_details,
        room_type: editor.room_type,
        name: editor.room_name,
        entrance: editor.room_entrance_location,
        zones: editor.camera_restriction_zones.map(zone => ({
            points: zone.points
        })),
        exits: editor.exits.map(exit => ({
            at: xy(exit.at.x, exit.at.y),
            to: exit.to
        })),
        access_token: get_access_token()
    }, () => {});

    dispatch_local_editor_action({
        type: Editor_Action_Type.set_room_details,
        zones: editor.camera_restriction_zones,
        exits: editor.exits.map(exit => ({
            at: exit.at,
            to: exit.to
        }))
    });
}

function exit_editor() {
    set_current_editor({ type: Editor_Type.none });
}

function init_editor_ui() {
    editor_root.style.visibility = "visible";

    subscribe_to_game_net_table_key("main", "game", data => {
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