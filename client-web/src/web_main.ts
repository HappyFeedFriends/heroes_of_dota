type Mouse_State = {
    clicked: boolean
    button: number
    x: number
    y: number
};

type Game_Base = {
    ctx: CanvasRenderingContext2D
    canvas_width: number
    canvas_height: number
    access_token: string
    requested_player_state_at: number
    requested_chat_at: number
    mouse: Mouse_State
    player_id: Player_Id
    any_button_clicked_this_frame: boolean
    chat_messages: string[]
    layout_stack: Layout[]
}

type Game_Not_Logged_In = Game_Base & {
    state: Player_State.not_logged_in
}

type Game_On_Adventure = Game_Base & {
    state: Player_State.on_adventure
    rooms: Array<{
        id: Adventure_Room_Id
        name: string
    }>
    room_entities: Adventure_Entity[]
}

type Game_On_Global_Map = Game_Base & {
    state: Player_State.on_global_map
    nearby_entities: Map_Entity[]
    battles: Battle_Info[]
    refreshed_nearby_players_at: number
    refreshed_battles_at: number
}

type Game_In_Battle = Game_Base & {
    state: Player_State.in_battle
    battle: Battle
    battle_id: Battle_Id
    battle_player_id: Battle_Player_Id
    requested_battle_deltas_at: number
    selection: Selection_State
    battle_log: Colored_Line[]
    spectating: boolean
    ai_data: Debug_AI_Data | undefined
    show_ai_data: boolean
    disabled_cells: Record<number, boolean>
}

type Game = Game_In_Battle | Game_On_Global_Map | Game_On_Adventure | Game_Not_Logged_In;

const enum Selection_Type {
    none,
    card,
    unit,
    ability
}

type No_Selection = {
    type: Selection_Type.none
}

type Card_Selection = {
    type: Selection_Type.card
    card_id: Card_Id
}

type Unit_Selection = {
    type: Selection_Type.unit
    unit_id: Unit_Id
}

type Ability_Selection = {
    type: Selection_Type.ability
    unit_id: Unit_Id
    ability_id: Ability_Id
}

type Selection_State = No_Selection | Card_Selection | Unit_Selection | Ability_Selection;

declare const enum Button_State {
    default = 0,
    hovered = 1,
    clicked = 2
}

type Map_Player = {
    type: Map_Entity_Type.player
    id: Player_Id
    name: string
}

type Map_NPC = {
    type: Map_Entity_Type.npc
    id: Npc_Id
    npc_type: Npc_Type
}

type Map_Entity = Map_Player | Map_NPC

type Image_Resource = {
    img: HTMLImageElement
    loaded: boolean
}

type Colored_String = {
    color: string
    text: string
}

const enum Layout_Type {
    vertical,
    horizontal
}

type Layout = {
    type: Layout_Type
    cursor: XY
}

type Colored_Line = Array<Colored_String>

let game: Game;

const player_name_cache: Record<number, string> = {};
const image_cache: Map<string, Image_Resource> = new Map();
const cell_size = 36;

declare function embed_base64(from_path: string): string;

function image_from_url(url: string): Image_Resource {
    const resource = image_cache.get(url);

    if (resource) {
        return resource;
    }

    const new_resource: Image_Resource = {
        img: new Image(),
        loaded: false
    };

    new_resource.img.onload = () => new_resource.loaded = true;
    new_resource.img.src = url;

    image_cache.set(url, new_resource);

    return new_resource;
}

function rune_image(type: Rune_Type): Image_Resource {
    function rune_type_to_base64_image(): string {
        switch (type) {
            case Rune_Type.haste: return embed_base64("images/rune_haste.png");
            case Rune_Type.bounty: return embed_base64("images/rune_bounty.png");
            case Rune_Type.double_damage: return embed_base64("images/rune_double_damage.png");
            case Rune_Type.regeneration: return embed_base64("images/rune_regeneration.png");
        }
    }

    return image_from_url(`data:image/png;base64,${rune_type_to_base64_image()}`)
}

async function api_request<T extends Api_Request_Type>(type: T, data: Find_Request<T>): Promise<Find_Response<T>> {
    const response = await fetch("api" + type, {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        credentials: "same-origin",
        redirect: "follow",
        referrer: "no-referrer",
        body: JSON.stringify(data),
    });

    return await response.json() as Find_Response<T>;
}

function get_or_request_player_name(game: Game, player_id: Player_Id): string {
    const cached_name = player_name_cache[player_id];

    if (cached_name) {
        return cached_name;
    }

    async_get_player_name(game, player_id);

    return "...";
}


async function async_get_player_name(game: Game, player_id: Player_Id): Promise<string> {
    const cached_name = player_name_cache[player_id];

    if (cached_name) {
        return cached_name;
    }

    const result = await api_request(Api_Request_Type.get_player_name, { access_token: game.access_token, player_id: player_id });

    player_name_cache[player_id] = result.name;

    return result.name;
}

async function take_battle_action(game: Game_In_Battle, action: Turn_Action) {
    const response = await api_request(Api_Request_Type.take_battle_action, {
        access_token: game.access_token,
        action: action
    });

    receive_battle_deltas(game, response.previous_head, response.deltas);
}

function contains(x: number, y: number, sx: number, sy: number, width: number, height: number) {
    return x >= sx && y >= sy && x < sx + width && y < sy + height;
}

function on_entity_clicked(state: Game, entity: Map_Entity) {
    switch (entity.type) {
        case Map_Entity_Type.player: {
            api_request(Api_Request_Type.attack_player, {
                dedicated_server_key: "",
                access_token: state.access_token,
                target_player_id: entity.id
            });

            break;
        }

        case Map_Entity_Type.npc: {
            api_request(Api_Request_Type.attack_npc, {
                dedicated_server_key: "",
                access_token: state.access_token,
                target_npc_id: entity.id
            });

            break;
        }

        default: unreachable(entity);
    }
}

function button_behavior(top_left_x: number, top_left_y: number, width: number, height: number): Button_State {
    const hovered = contains(game.mouse.x, game.mouse.y, top_left_x, top_left_y, width, height);

    if (hovered) {
        if (was_button_clicked(0)) {
            game.any_button_clicked_this_frame = true;

            return Button_State.clicked;
        } else {
            return Button_State.hovered;
        }
    }

    return Button_State.default;
}

function do_button(text: string, top_left_x: number, top_left_y: number, font_size_px: number, padding: number): Button_State {
    const ctx = game.ctx;

    ctx.font = `${font_size_px}px Open Sans`;

    const text_width = ctx.measureText(text).width;
    const button_width = padding + text_width + padding;
    const button_height = padding + font_size_px + padding;

    const state = button_behavior(top_left_x, top_left_y, button_width, button_height);

    ctx.fillStyle = state == Button_State.hovered ? "#a4c7c2" : "#d0d0d0";
    ctx.fillRect(top_left_x, top_left_y, button_width, button_height);

    ctx.fillStyle = "black";
    ctx.fillText(text, top_left_x + padding, top_left_y + padding + font_size_px / 2);

    return state;
}

function button(text: string) {
    const padding = 8;
    const font_size_px = 18;
    const xy = layout_cursor();
    const state = do_button(text, xy.x, xy.y, font_size_px, padding) == Button_State.clicked;
    push_size(padding + font_size_px + padding);
    return state;
}

function draw_entity_list(game: Game_On_Global_Map) {
    push_layout(Layout_Type.vertical);

    for (const entity of game.nearby_entities) {
        const entity_name = entity.type == Map_Entity_Type.npc ? enum_to_string(entity.npc_type) : entity.name;

        if (button(entity_name)) {
            on_entity_clicked(game, entity);
        }

        push_size(4);
    }

    pop_layout();
}

function drop_selection(game: Game_In_Battle) {
    game.selection = { type: Selection_Type.none };
}

function was_button_clicked(button: number) {
    return game.mouse.button == button && game.mouse.clicked;
}

function draw_header(game: Game) {
    const ctx = game.ctx;
    const font_size_px = 20;

    ctx.font = `${font_size_px}px Open Sans`;
    ctx.fillStyle = "black";

    if (game.state != Player_State.not_logged_in) {
        const name = get_or_request_player_name(game, game.player_id);
        ctx.fillText(`${name}: ${enum_to_string(game.state)}`, 30, 30);
    } else {
        ctx.fillText(enum_to_string(game.state), 30, 30);
    }

    push_size(font_size_px + 8);
}

async function accept_chat_messages(game: Game, messages: Chat_Message[]) {
    for (const message of messages) {
        const name = await async_get_player_name(game, message.from_player_id);

        game.chat_messages.push(`${name}: ${message.message}`);
    }
}

async function check_and_try_refresh_battles(game: Game_On_Global_Map, time: number) {
    if (time - game.refreshed_battles_at < 1000) {
        return;
    }

    game.refreshed_battles_at = time;

    const response = await api_request(Api_Request_Type.query_battles, {
        access_token: game.access_token
    });

    game.battles = response.battles;
}

async function check_and_try_refresh_nearby_players(game: Game_On_Global_Map, time: number) {
    if (time - game.refreshed_nearby_players_at < 1000) {
        return;
    }

    game.refreshed_nearby_players_at = time;

    const response = await api_request(Api_Request_Type.query_entity_movement, {
        dedicated_server_key: "",
        access_token: game.access_token
    });

    for (const player of response.players) {
        await async_get_player_name(game, player.id);
    }

    const players = response.players.map(entity => {
        const player: Map_Player = {
            type: Map_Entity_Type.player,
            id: entity.id,
            name: get_or_request_player_name(game, entity.id)
        };

        return player;
    });

    const neutrals = response.neutrals.map(entity => {
        const npc: Map_NPC = {
            type: Map_Entity_Type.npc,
            npc_type: entity.type,
            id: entity.id
        };

        return npc;
    });

    game.nearby_entities = [...players, ...neutrals];
}

async function check_and_try_request_player_state(state: Game, time: number) {
    if (time - state.requested_player_state_at < 1000) {
        return
    }

    state.requested_player_state_at = time;

    const player_data = await api_request(Api_Request_Type.get_player_state, {
        access_token: state.access_token
    });

    if (player_data.state != game.state) {
        // Don't force server state while spectating
        if (game.state == Player_State.in_battle && game.spectating) {
            return;
        }

        game = await game_from_state(player_data, game);

        if (game.state == Player_State.in_battle) {
            for (const player of game.battle.players) {
                if (player.map_entity.type == Map_Entity_Type.player) {
                    await async_get_player_name(game, player.map_entity.player_id);
                }
            }

            game.ai_data = await api_request(Api_Request_Type.get_debug_ai_data, {});
        }
    }
}

async function check_and_try_request_chat(state: Game, time: number) {
    if (time - state.requested_chat_at < 1000) {
        return
    }

    state.requested_chat_at = time;

    const response = await api_request(Api_Request_Type.pull_chat_messages, {
        access_token: state.access_token
    });

    accept_chat_messages(state, response.messages);
}

async function check_and_try_request_battle_deltas(game: Game_In_Battle, time: number) {
    if (time - game.requested_battle_deltas_at < 1000) {
        return;
    }

    const head_before = game.battle.delta_head;

    game.requested_battle_deltas_at = time;

    const response = await api_request(Api_Request_Type.query_battle_deltas, {
        access_token: game.access_token,
        battle_id: game.battle_id,
        since_delta: head_before
    });

    receive_battle_deltas(game, head_before, response.deltas);
}

function receive_battle_deltas(game: Game_In_Battle, head_before_merge: number, deltas: Delta[]) {
    const battle = game.battle;

    if (deltas.length == 0) {
        return;
    }

    console.log(`Received ${deltas.length} new deltas`);

    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    for (; battle.delta_head < battle.deltas.length; battle.delta_head++) {
        const delta = battle.deltas[battle.delta_head];

        if (!delta) {
            break;
        }

        let line = delta_to_colored_line(game, delta);

        if (line) {
            game.battle_log.push(line);
        }

        collapse_delta(battle, delta);
        drain_battle_event_queue(battle);
    }
}

function on_cell_right_clicked(game: Game_In_Battle, player: Battle_Player, x: number, y: number) {
    switch (game.selection.type) {
        case Selection_Type.card: {
            const zone = player.deployment_zone;

            if (x < zone.max.x && x >= zone.min.x && y < zone.max.y && y >= zone.min.y) {
                take_battle_action(game, {
                    type: Action_Type.use_hero_card,
                    at: {x: x, y: y},
                    card_id: game.selection.card_id
                })
            }

            break;
        }

        case Selection_Type.unit: {
            const selected_unit = find_unit_by_id(game.battle, game.selection.unit_id);
            const right_clicked_unit = unit_at(game.battle, xy(x, y));
            const right_clicked_rune = rune_at(game.battle, xy(x, y));

            if (!selected_unit) {
                break;
            }

            if (right_clicked_unit) {
                if (selected_unit.attack && selected_unit.attack.type == Ability_Type.target_ground) {
                    if (ability_targeting_fits(game.battle, selected_unit.attack.targeting, selected_unit.position, xy(x, y))) {
                        take_battle_action(game, {
                            type: Action_Type.ground_target_ability,
                            unit_id: selected_unit.id,
                            ability_id: selected_unit.attack.id,
                            to: xy(x, y)
                        });
                    }
                }
            } else if (right_clicked_rune) {
                const can_go = can_find_path_and_go(game.battle, selected_unit, xy(x, y), selected_unit.move_points, true);

                if (can_go) {
                    take_battle_action(game, {
                        type: Action_Type.pick_up_rune,
                        unit_id: selected_unit.id,
                        rune_id: right_clicked_rune.id
                    });
                }
            } else {
                const can_go = can_find_path_and_go(game.battle, selected_unit, xy(x, y), selected_unit.move_points);

                if (can_go) {
                    take_battle_action(game, {
                        type: Action_Type.move,
                        unit_id: selected_unit.id,
                        to: xy(x, y)
                    });
                }
            }

            break;
        }
    }
}

function is_unit_selection(selection: Selection_State): selection is (Unit_Selection | Ability_Selection) {
    return selection.type == Selection_Type.unit || selection.type == Selection_Type.ability;
}

function on_cell_selected(game: Game_In_Battle, x: number, y: number) {
    const unit_in_cell = unit_at(game.battle, xy(x, y));

    if (game.selection.type == Selection_Type.ability) {
        const selected = find_unit_by_id(game.battle, game.selection.unit_id);

        if (selected) {
            const ability = find_unit_ability(selected, game.selection.ability_id);

            if (ability && (ability.type == Ability_Type.target_unit || ability.type == Ability_Type.target_ground)) {
                const can_be_cast = ability_targeting_fits(game.battle, ability.targeting, selected.position, xy(x, y));

                if (ability.type == Ability_Type.target_unit && unit_in_cell && can_be_cast) {
                    take_battle_action(game, {
                        type: Action_Type.unit_target_ability,
                        ability_id: ability.id,
                        unit_id: selected.id,
                        target_id: unit_in_cell.id
                    });

                    game.selection = {
                        type: Selection_Type.unit,
                        unit_id: selected.id
                    };
                }

                if (ability.type == Ability_Type.target_ground && can_be_cast) {
                    take_battle_action(game, {
                        type: Action_Type.ground_target_ability,
                        ability_id: ability.id,
                        unit_id: selected.id,
                        to: xy(x, y)
                    });

                    game.selection = {
                        type: Selection_Type.unit,
                        unit_id: selected.id
                    };
                }

                return;
            }
        }
    }

    if (unit_in_cell) {
        game.selection = {
            type: Selection_Type.unit,
            unit_id: unit_in_cell.id
        }
    } else {
        drop_selection(game);
    }
}

function get_hero_name(type: Hero_Type): string {
    switch (type) {
        case Hero_Type.vengeful_spirit: return "vengefulspirit";
        default: return enum_to_string(type);
    }
}

function can_find_path_and_go(battle: Battle, unit: Unit, to: XY, maximum_distance: number, ignore_runes = false): boolean {
    const path = can_find_path(battle, unit, to, unit_pathing_flags(unit, ignore_runes));

    if (path.found) {
        return path.cost <= maximum_distance;
    }

    return false;
}

function highlight_cells_unit_can_go_to(battle: Battle, unit: Unit) {
    const xy = unit.position;
    const min_x = Math.max(0, xy.x - unit.move_points);
    const min_y = Math.max(0, xy.y - unit.move_points);
    const max_x = Math.max(battle.grid.size.x, xy.x + unit.move_points);
    const max_y = Math.max(battle.grid.size.y, xy.y + unit.move_points);

    for (let x = min_x; x < max_x; x++) {
        for (let y = min_y; y < max_y; y++) {
            const can_go = can_find_path_and_go(battle, unit, {x: x, y: y}, unit.move_points);

            if (can_go) {
                game.ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
                game.ctx.fillRect(x * cell_size, y * cell_size, cell_size, cell_size);
            }
        }
    }
}

function highlight_cells_for_ability(battle: Battle, unit: Unit, ability: Ability_Active) {
    for (let x = 0; x < battle.grid.size.x; x++) {
        for (let y = 0; y < battle.grid.size.y; y++) {
            if (ability.type == Ability_Type.no_target) {
                if (area_selector_fits(battle, ability.selector, unit.position, unit.position, xy(x, y))) {
                    game.ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
                    game.ctx.fillRect(x * cell_size, y * cell_size, cell_size, cell_size);
                }
            } else {
                if (ability_targeting_fits(battle, ability.targeting, unit.position, xy(x, y))) {
                    game.ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
                    game.ctx.fillRect(x * cell_size, y * cell_size, cell_size, cell_size);
                }
            }
        }
    }
}

function highlight_cells_for_ability_selector(battle: Battle, from_position: XY, to_position: XY, selector: Ability_Area_Selector) {
    for (let x = 0; x < battle.grid.size.x; x++) {
        for (let y = 0; y < battle.grid.size.y; y++) {
            if (area_selector_fits(battle, selector, from_position, to_position, xy(x, y))) {
                game.ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
                game.ctx.fillRect(x * cell_size, y * cell_size, cell_size, cell_size);
            }
        }
    }
}

namespace clr {
    export function txt(text: string, color: string): Colored_String {
        return {
            text: text,
            color: color
        }
    }

    export function plain(text: string): Colored_String {
        return {
            text: text,
            color: "black"
        }
    }

    export function player_color(player_id: Battle_Player_Id, alpha: number) {
        if (game.state == Player_State.in_battle) {
            if (game.spectating) {
                const colors = [
                    `rgba(255, 180, 36, ${alpha})`,
                    `rgba(0, 124, 255, ${alpha})`,
                    `rgba(0, 255, 0, ${alpha})`
                ];

                const index = game.battle.players.findIndex(player => player.id == player_id);

                return colors[index];
            } else {
                return game.battle_player_id == player_id ? `rgba(0, 255, 0, ${alpha})` : `rgba(255, 0, 0, ${alpha})`;
            }
        }

        return "black";
    }

    export function player_name(player: Battle_Player): Colored_String {
        switch (player.map_entity.type) {
            case Map_Entity_Type.player: return txt(player_name_cache[player.id], player_color(player.id, 0.8));

            case Map_Entity_Type.adventure_enemy: {
                return txt(enum_to_string(player.map_entity.world_model), player_color(player.id, 0.8));
            }

            case Map_Entity_Type.npc: {
                return txt(enum_to_string(player.map_entity.npc_type), player_color(player.id, 0.8));
            }
        }
    }

    export function hero_type_by_name(type: Hero_Type, player_id: Battle_Player_Id) {
        return txt(enum_to_string(type), player_color(player_id, 0.8))
    }

    export function unit_name(unit: Unit): Colored_String {
        switch (unit.supertype) {
            case Unit_Supertype.monster: {
                return txt("creep", "red");
            }

            case Unit_Supertype.creep: {
                return txt(enum_to_string(unit.type), player_color(unit.owner.id, 0.8))
            }

            case Unit_Supertype.hero: {
                return hero_type_by_name(unit.type, unit.owner.id);
            }
        }
    }

    export function source_name(source: Source): Colored_String {
        switch (source.type) {
            case Source_Type.none: return txt("none", "gray");
            case Source_Type.unit: return unit_name(source.unit);
            case Source_Type.item: return txt(enum_to_string(source.item_id), "gray");
            case Source_Type.player: return player_name(source.player);
            case Source_Type.modifier: return txt(enum_to_string(source.applied.modifier.id), "gray");
            case Source_Type.adventure_item: return txt(enum_to_string(source.item_id), "gray");
        }
    }

    export function ability_name(ability: Ability) {
        return txt(enum_to_string(ability.id), "gray");
    }

    export function card_name(card: Card) {
        switch (card.type) {
            case Card_Type.hero: return txt(enum_to_string(card.hero_type), "gray");
            case Card_Type.spell: return txt(enum_to_string(card.spell_id), "gray");
        }

        return plain("Unknown");
    }

}

function delta_to_colored_line(game: Game_In_Battle, delta: Delta): Colored_Line | undefined {
    switch (delta.type) {
        case Delta_Type.gold_change: {
            const player = find_player_by_id(game.battle, delta.player_id);

            if (!player) break;

            return [
                clr.player_name(player),
                clr.plain(delta.change > 0 ? " earns " : " loses "),
                clr.txt(delta.change.toString(), "gold"),
                clr.plain(" gold")
            ];
        }

        case Delta_Type.use_card: {
            const player = find_player_by_id(game.battle, delta.player_id);

            if (!player) break;

            const card = find_player_card_by_id(player, delta.card_id);

            if (!card) break;

            switch (card.type) {
                case Card_Type.hero: return [
                    clr.player_name(player),
                    clr.plain(" summons "),
                    clr.hero_type_by_name(card.hero_type, delta.player_id)
                ];

                default: break;
            }

            break;
        }

        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);

            if (!unit) break;

            return [
                clr.unit_name(unit),
                clr.plain(` moves to ${delta.to_position.x}:${delta.to_position.y}`)
            ]
        }

        case Delta_Type.use_unit_target_ability: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);
            const target = find_unit_by_id(game.battle, delta.target_unit_id);

            if (!unit) break;
            if (!target) break;

            const ability = find_unit_ability(unit, delta.ability_id);

            if (!ability) break;

            return [
                clr.unit_name(unit),
                clr.plain(" uses "),
                clr.ability_name(ability),
                clr.plain(" on "),
                clr.unit_name(target)
            ]
        }

        case Delta_Type.use_no_target_ability:
        case Delta_Type.use_ground_target_ability: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);

            if (!unit) break;

            const ability = find_unit_ability(unit, delta.ability_id);

            if (!ability) break;

            return [
                clr.unit_name(unit),
                clr.plain(" uses "),
                clr.ability_name(ability)
            ]
        }

        case Delta_Type.use_no_target_spell: {
            const player = find_player_by_id(game.battle, delta.player_id);

            if (!player) break;

            return [
                clr.player_name(player),
                clr.plain(" uses "),
                clr.txt(enum_to_string(delta.spell_id), "gray")
            ]
        }

        case Delta_Type.use_unit_target_spell: {
            const player = find_player_by_id(game.battle, delta.player_id);
            const target = find_unit_by_id(game.battle, delta.target_id);

            if (!player) break;
            if (!target) break;

            return [
                clr.player_name(player),
                clr.plain(" uses "),
                clr.txt(enum_to_string(delta.spell_id), "gray"),
                clr.plain(" on "),
                clr.unit_name(target)
            ]
        }

        case Delta_Type.rune_pick_up: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);
            const rune = find_rune_by_id(game.battle, delta.rune_id);

            if (!unit) break;
            if (!rune) break;

            return [
                clr.unit_name(unit),
                clr.plain(" picks up "),
                clr.txt(enum_to_string(rune.type), "gray"),
                clr.plain(" rune")
            ]
        }

        case Delta_Type.ability_effect_applied: {
            const id: Ability_Id = delta.effect.ability_id;

            return [
                clr.txt(enum_to_string(id), "gray"),
                clr.plain(" triggers")
            ]
        }

        case Delta_Type.modifier_effect_applied: {
            const id = delta.modifier_id;

            return [
                clr.txt(enum_to_string(id), "gray"),
                clr.plain(" triggers")
            ]
        }

        case Delta_Type.end_turn: {
            return [
                clr.txt("Next turn", "gray")
            ]
        }

        case Delta_Type.level_change: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);

            if (!unit) break;

            return [
                clr.unit_name(unit),
                clr.plain(" is now level "),
                clr.txt(delta.new_level.toString(), "gray")
            ]
        }

        case Delta_Type.modifier_removed: {
            for (const unit of game.battle.units) {
                for (const applied of unit.modifiers) {
                    if (applied.handle_id == delta.modifier_handle_id) {
                        return [
                            clr.unit_name(unit),
                            clr.plain(" loses "),
                            clr.txt(enum_to_string(applied.modifier.id), "gray"),
                            clr.plain(" modifier")
                        ];
                    }
                }
            }

            break;
        }

        case Delta_Type.purchase_item: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);

            if (!unit) break;

            return [
                clr.unit_name(unit),
                clr.plain(" purchases "),
                clr.txt(enum_to_string(delta.item_id), "gray"),
                clr.plain( " for "),
                clr.txt(delta.gold_cost.toString(), "gold"),
                clr.plain(" gold")
            ];
        }

        case Delta_Type.equip_item: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);

            if (!unit) break;

            return [
                clr.unit_name(unit),
                clr.plain(" equips "),
                clr.txt(enum_to_string(delta.item_id), "gray")
            ];
        }

        case Delta_Type.game_over: {
            const lines = [clr.plain("Game over!")];

            if (delta.result.draw) {
                lines.push(clr.plain(" Draw!"));
            } else {
                const player = find_player_by_id(game.battle, delta.result.winner_player_id);

                if (player) {
                    lines.push(
                        clr.plain(" "),
                        clr.player_name(player),
                        clr.plain(" won")
                    );
                }
            }

            return lines;
        }

        /* TODO repurpose this for modifiers
        case Delta_Type.unit_field_change: {
            const source = find_unit_by_id(game.battle, delta.source_unit_id);
            const target = find_unit_by_id(game.battle, delta.target_unit_id);

            if (!source) break;
            if (!target) break;

            function delta_string(value: number) {
                if (value >= 0) {
                    return `+${value}`;
                } else {
                    return `${value}`;
                }
            }

            if (source == target) {
                return [
                    clr.unit_name(source),
                    clr.plain("'s "),
                    clr.txt(enum_to_string(delta.field), "gray"),
                    clr.plain(" changes to "),
                    clr.txt(delta.new_value.toString(), "gray"),
                    clr.plain(` (${delta_string(delta.value_delta)})`)
                ]
            } else {
                return [
                    clr.unit_name(source),
                    clr.plain(" changes "),
                    clr.unit_name(target),
                    clr.plain("'s "),
                    clr.txt(enum_to_string(delta.field), "gray"),
                    clr.plain(" to "),
                    clr.txt(delta.new_value.toString(), "gray"),
                    clr.plain(` (${delta_string(delta.value_delta)})`)
                ]
            }
        }*/
    }

    return undefined;
}

async function process_battle_events_to_log(log: Colored_Line[], event: Battle_Event) {
    switch (event.type) {
        case Battle_Event_Type.health_changed: {
            const { source, target, change, dead } = event;

            if (change.value_delta > 0) {
                log.push([
                    clr.source_name(source),
                    clr.plain(" restores "),
                    clr.txt(change.value_delta.toString(), "gray"),
                    clr.plain(" health to "),
                    clr.unit_name(target)
                ]);
            } else if (change.value_delta < 0) {
                log.push([
                    clr.unit_name(target),
                    clr.plain(" takes "),
                    clr.txt((-change.value_delta).toString(), "gray"),
                    clr.plain(" damage from "),
                    clr.source_name(source)
                ]);
            }

            if (dead) {
                log.push([
                    clr.unit_name(target),
                    clr.plain(" dies")
                ]);
            }

            break;
        }

        case Battle_Event_Type.modifier_applied: {
            const { target, modifier } = event;

            const lines = [
                clr.source_name(modifier.source),
                clr.plain(" applies "),
                clr.txt(enum_to_string(modifier.modifier.id), "gray"),
                clr.plain(" to "),
                clr.unit_name(target)
            ];

            if (modifier.duration_remaining != undefined) {
                lines.push(
                    clr.plain(" for "),
                    clr.txt(modifier.duration_remaining.toString(), "gray"),
                    clr.plain(" turns")
                );
            }

            log.push(lines);

            break;
        }

        case Battle_Event_Type.card_added_to_hand: {
            log.push([
                clr.player_name(event.player),
                clr.plain(" draws "),
                clr.card_name(event.card)
            ]);

            break;
        }
    }
}

function draw_battle_log(game: Game_In_Battle) {
    const ctx = game.ctx;
    const lines = game.battle_log;

    const how_many_lines_to_show = 20;
    const starting_index = Math.max(lines.length - how_many_lines_to_show, 0);

    const font_height = 16;

    push_layout(Layout_Type.vertical);

    ctx.font = `${font_height}px Open Sans`;

    for (let index = 0; index < how_many_lines_to_show && index < lines.length; index++) {
        const line = lines[starting_index + index];

        push_layout(Layout_Type.horizontal);

        for (const string of line) {
            const width = ctx.measureText(string.text).width;
            const cursor = layout_cursor();

            ctx.fillStyle = string.color;
            ctx.fillText(string.text, cursor.x, cursor.y);

            push_size(width);
        }

        pop_layout();

        push_size(font_height + 4);
    }

    pop_layout();
}

function draw_grid(game: Game_In_Battle, player?: Battle_Player, highlighted_ability?: Ability_Active) {
    const ctx = game.ctx;

    const grid_size = game.battle.grid.size;
    const cursor = layout_cursor();

    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.translate(cursor.x, cursor.y);

    for (let x = 0; x < grid_size.x; x++) {
        for (let y = 0; y < grid_size.y; y++) {
            const index = grid_cell_index_raw(game.battle.grid, x, y);
            if (index == undefined) continue;

            const is_disabled = game.disabled_cells[index];

            if (!is_disabled) {
                ctx.strokeRect(x * cell_size, y * cell_size, cell_size, cell_size);
            }
        }
    }

    if (player && game.selection.type == Selection_Type.card) {
        const zone = player.deployment_zone;

        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 3;
        ctx.strokeRect(
            zone.min.x * cell_size,
            zone.min.y * cell_size,
            (zone.max.x - zone.min.x) * cell_size,
            (zone.max.y - zone.min.y) * cell_size
        );
    }

    let hovered_cell: XY | undefined;

    for (let x = 0; x < grid_size.x; x++) {
        for (let y = 0; y < grid_size.y; y++) {
            const hovered = contains(
                game.mouse.x,
                game.mouse.y,
                cursor.x + x * cell_size,
                cursor.y + y * cell_size,
                cell_size,
                cell_size
            );

            if (hovered) {
                if (was_button_clicked(0)) {
                    on_cell_selected(game, x, y);

                    game.any_button_clicked_this_frame = true;
                } else if (was_button_clicked(2) && player) {
                    on_cell_right_clicked(game, player, x, y);

                    game.any_button_clicked_this_frame = true;
                } else {
                    ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
                    ctx.fillRect(x * cell_size, y * cell_size, cell_size, cell_size);
                }

                hovered_cell = xy(x, y);
            }
        }
    }

    ctx.fillStyle = "black";

    const icon_size = cell_size * 0.75;
    const icon_offset = (cell_size - icon_size) / 2;

    for (const unit of game.battle.units) {
        if (unit.dead) continue;

        const xy = unit.position;

        if (is_unit_selection(game.selection) && game.selection.unit_id == unit.id) {
            ctx.strokeStyle = "green";
            ctx.lineWidth = 4;
            ctx.strokeRect(xy.x * cell_size, xy.y * cell_size, cell_size, cell_size);

            if (highlighted_ability && unit.abilities.indexOf(highlighted_ability) != -1) {
                highlight_cells_for_ability(game.battle, unit, highlighted_ability);
            } else {
                if (game.selection.type == Selection_Type.ability) {
                    const ability_id = game.selection.ability_id;
                    const ability = find_unit_ability(unit, ability_id);

                    if (ability && ability.type != Ability_Type.passive) {
                        if (ability.type == Ability_Type.target_unit || ability.type == Ability_Type.target_ground) {
                            if (hovered_cell && ability_targeting_fits(game.battle, ability.targeting, unit.position, hovered_cell)) {
                                highlight_cells_for_ability_selector(game.battle, unit.position, hovered_cell, ability.targeting.selector);
                            } else {
                                highlight_cells_for_ability(game.battle, unit, ability);
                            }
                        } else {
                            highlight_cells_for_ability(game.battle, unit, ability);
                        }
                    }
                } else {
                    if (!unit.has_taken_an_action_this_turn) {
                        highlight_cells_unit_can_go_to(game.battle, unit);
                    }
                }
            }
        }

        const unit_color = (alpha: number) => {
            if (unit.supertype == Unit_Supertype.monster) {
                return `rgba(255, 0, 0, ${alpha})`;
            } else {
                return clr.player_color(unit.owner.id, alpha);
            }
        };

        if (unit.has_taken_an_action_this_turn) {
            ctx.fillStyle = "rgba(255, 255, 0, 0.2)";
        } else {
            ctx.fillStyle = unit_color(0.2);
        }

        ctx.fillRect(xy.x * cell_size, xy.y * cell_size, cell_size, cell_size);

        if (unit.supertype == Unit_Supertype.hero) {
            const image = image_from_url(`http://cdn.dota2.com/apps/dota2/images/heroes/${get_hero_name(unit.type)}_icon.png`);

            if (image.loaded) {
                ctx.drawImage(
                    image.img,
                    0, 0,
                    image.img.width, image.img.height,
                    xy.x * cell_size + icon_offset,
                    xy.y * cell_size + icon_offset,
                    icon_size,
                    icon_size
                );
            }
        }

        const text = unit.health.toString();
        const shadow_color = unit_color(1);

        // Health
        {
            ctx.font = "12px Open Sans";
            ctx.lineWidth = 2;
            ctx.strokeStyle = shadow_color;
            ctx.shadowColor = shadow_color;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowBlur = 4;
            ctx.strokeText(text, xy.x * cell_size, xy.y * cell_size);

            ctx.shadowBlur = 0;
            ctx.fillStyle = "#fff";
            ctx.fillText(text, xy.x * cell_size, xy.y * cell_size);
        }

        // Level
        if (unit.supertype == Unit_Supertype.hero) {
            for (let index = 0; index < Math.min(unit.level, Const.max_unit_level); index++) {
                ctx.lineWidth = 1;
                ctx.strokeStyle = "black";
                ctx.shadowColor = "black";
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowBlur = 4;

                const radius = 3;

                const pip_x = xy.x * cell_size + index * radius + 2;
                const pip_y = xy.y * cell_size + cell_size;

                ctx.beginPath();
                ctx.arc(pip_x, pip_y, radius, 0, Math.PI * 2);
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.fillStyle = "yellow";

                ctx.beginPath();
                ctx.arc(pip_x, pip_y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    for (const rune of game.battle.runes) {
        const image = rune_image(rune.type);
        const xy = rune.position;

        if (is_unit_selection(game.selection)) {
            const unit = find_unit_by_id(game.battle, game.selection.unit_id);

            if (unit) {
                const can_go = can_find_path_and_go(game.battle, unit, xy, unit.move_points, true);

                if (can_go) {
                    game.ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
                    game.ctx.fillRect(xy.x * cell_size, xy.y * cell_size, cell_size, cell_size);
                }
            }
        }

        if (image.loaded) {
            ctx.drawImage(
                image.img,
                0, 0,
                image.img.width, image.img.height,
                xy.x * cell_size + icon_offset,
                xy.y * cell_size + icon_offset,
                icon_size,
                icon_size
            );
        }
    }

    for (const shop of game.battle.shops) {
        const image = image_from_url(`data:image/png;base64,${embed_base64("images/shop.png")}`);

        if (image.loaded) {
            ctx.drawImage(
                image.img,
                0, 0,
                image.img.width, image.img.height,
                shop.position.x * cell_size + icon_offset,
                shop.position.y * cell_size + icon_offset,
                icon_size,
                icon_size
            );
        }
    }

    for (const tree of game.battle.trees) {
        const image = image_from_url(`data:image/png;base64,${embed_base64("images/tree.png")}`);

        if (image.loaded) {
            ctx.drawImage(
                image.img,
                0, 0,
                image.img.width, image.img.height,
                tree.position.x * cell_size + icon_offset,
                tree.position.y * cell_size + icon_offset,
                icon_size,
                icon_size
            );
        }
    }

    if (game.show_ai_data && game.ai_data) {
        const ai = game.ai_data;

        function padded_hex(num: number, len: number) {
            const str = num.toString(16);
            return "0".repeat(len - str.length) + str;
        }

        ctx.fillStyle = "black";

        if (is_unit_selection(game.selection)) {
            ctx.font = "10px Open Sans";

            for (const debug of ai.unit_debug) {
                if (debug.unit_id == game.selection.unit_id) {
                    for (const cmd of debug.cmds) {
                        ctx.fillStyle = "#" + padded_hex(cmd.clr, 6);
                        ctx.strokeStyle = "#" + padded_hex(cmd.clr, 6);
                        ctx.lineWidth = 2;

                        switch (cmd.type) {
                            case Debug_Draw_Cmd_Type.circle: {
                                const half_r = cmd.r / 2;

                                ctx.beginPath();
                                ctx.arc(cmd.x + half_r, cmd.y + half_r, half_r, 0, Math.PI * 2);
                                ctx.fill();

                                break;
                            }

                            case Debug_Draw_Cmd_Type.line: {
                                ctx.beginPath();
                                ctx.moveTo(cmd.x1, cmd.y1);
                                ctx.lineTo(cmd.x2, cmd.y2);
                                ctx.stroke();
                                break;
                            }

                            case Debug_Draw_Cmd_Type.rect: {
                                ctx.fillRect(cmd.x1, cmd.y1, cmd.x2 - cmd.x1, cmd.y2 - cmd.y1);
                                break;
                            }

                            case Debug_Draw_Cmd_Type.text: {
                                ctx.fillText(cmd.text, cmd.x, cmd.y);

                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    ctx.translate(-cursor.x, -cursor.y);

    push_size(grid_size.x * cell_size);
}

function draw_card_list(game: Game_In_Battle, player: Battle_Player) {
    push_layout(Layout_Type.vertical);

    for (let index = 0; index < player.hand.length; index++) {
        const card = player.hand[index];
        const top_left = {
            ...layout_cursor()
        };

        switch (card.type) {
            case Card_Type.existing_hero: {
                button("Existing hero card");
                break;
            }

            case Card_Type.hero: {
                if (button(enum_to_string(card.hero_type))) {
                    game.selection = {
                        type: Selection_Type.card,
                        card_id: card.id
                    }
                }

                break;
            }

            case Card_Type.spell: {
                button(enum_to_string(card.spell_id));
                break;
            }

            case Card_Type.unknown: {
                button("Unknown card");
                break;
            }

            default: unreachable(card);
        }

        if (game.selection.type == Selection_Type.card && game.selection.card_id == card.id) {
            const ctx = game.ctx;

            ctx.strokeStyle = "green";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(top_left.x, top_left.y);
            ctx.lineTo(top_left.x, top_left.y + 30);
            ctx.stroke();
        }

        push_size(4);
    }

    pop_layout();
}

function draw_battle_list(global_map: Game_On_Global_Map) {
    const battles = global_map.battles.slice();

    if (battles.length > 10) {
        battles.splice(0, battles.length - 10);
    }

    function entity_name(participant: Battle_Participant_Info): string {
        const entity = participant.map_entity;
        switch (entity.type) {
            case Map_Entity_Type.player: return get_or_request_player_name(game, entity.player_id);

            case Map_Entity_Type.adventure_enemy: {
                return enum_to_string(entity.world_model);
            }

            case Map_Entity_Type.npc: {
                return enum_to_string(entity.npc_type);
            }
        }
    }

    push_layout(Layout_Type.vertical);

    for (const battle of battles) {
        const text = `Spectate ${entity_name(battle.participants[0])} vs ${entity_name(battle.participants[1])}`;

        if (button(text)) {
            game_from_state({
                battleground_theme: Battleground_Theme.forest,
                battleground_environment: Environment.day,
                battle_world_origin: { x: 0, y: 0, z: 0 },
                state: Player_State.in_battle,
                battle_id: battle.id,
                battle_player_id: -1 as Battle_Player_Id,
                grid_size: battle.grid_size,
                participants: battle.participants,
                random_seed: battle.random_seed,
                disabled_cell_indices: []
            }, game).then(new_game => {
                game = new_game;

                if (game.state == Player_State.in_battle) {
                    game.spectating = true;

                    api_request(Api_Request_Type.get_debug_ai_data, {}).then(data => {
                        if (game.state == Player_State.in_battle) {
                            game.ai_data = data;
                        }
                    })
                }
            });
        }

        push_size(4);
    }

    pop_layout();
}

function draw_adventure_list() {
    const adventures = enum_names_to_values<Adventure_Id>();

    push_layout(Layout_Type.vertical);

    for (const [name, adventure] of adventures) {
        if (button(`Adventure: ${name}`)) {
            api_request(Api_Request_Type.start_adventure, {
                adventure_id: adventure,
                access_token: game.access_token,
                dedicated_server_key: ""
            });
        }

        push_size(4);
    }

    pop_layout();
}

function draw_room_list(game: Game_On_Adventure) {
    push_layout(Layout_Type.vertical);

    for (const room of game.rooms) {
        if (button(`To ${room.name}`)) {
            api_request(Api_Request_Type.enter_adventure_room, {
                room_id: room.id,
                access_token: game.access_token,
                dedicated_server_key: ""
            }).then(room => {
                game.room_entities = room.entities;
            })
        }

        push_size(4);
    }

    pop_layout();
}

function draw_room_entity_list(game: Game_On_Adventure) {
    push_layout(Layout_Type.vertical);

    for (const entity of game.room_entities) {
        const name = entity.type == Adventure_Entity_Type.enemy ?
            `Enemy: ${enum_to_string(entity.world_model)}` :
            enum_to_string(entity.type);

        if (button(name)) {
            if (entity.type == Adventure_Entity_Type.enemy) {
                api_request(Api_Request_Type.start_adventure_enemy_fight, {
                    enemy_entity_id: entity.id,
                    access_token: game.access_token,
                    dedicated_server_key: ""
                });
            }
        }

        push_size(4);
    }

    pop_layout();
}

function draw_chat(game: Game) {
    const ctx = game.ctx;
    const lines = game.chat_messages;

    const how_many_lines_to_show = 20;
    const starting_index = Math.max(lines.length - how_many_lines_to_show, 0);

    const font_height = 16;

    ctx.font = `${font_height}px Open Sans`;
    ctx.fillStyle = "black";

    push_layout(Layout_Type.vertical);

    for (let index = 0; index < how_many_lines_to_show && index < lines.length; index++) {
        const line = lines[starting_index + index];
        const cursor = layout_cursor();

        ctx.fillText(line, cursor.x, cursor.y);

        push_size(font_height + 4);
    }

    pop_layout();
}

function draw_ability_list(game: Game_In_Battle, unit: Unit): Ability_Active | undefined {
    let ability_highlighted: Ability_Active | undefined;

    push_layout(Layout_Type.vertical);

    for (let index = 0; index < unit.abilities.length; index++) {
        const ability = unit.abilities[index];
        const needs_targeting = ability.type == Ability_Type.target_ground || ability.type == Ability_Type.target_unit;

        const cursor = layout_cursor();

        const ability_name = enum_to_string(ability.id);
        const button_text = ability.type != Ability_Type.passive ? `${ability_name} (${ability.charges_remaining})` : ability_name;

        const state = do_button(button_text, cursor.x, cursor.y, 14, 6);

        if (state == Button_State.clicked) {
            if (needs_targeting) {
                game.selection = {
                    type: Selection_Type.ability,
                    unit_id: unit.id,
                    ability_id: ability.id
                }
            } else if (ability.type == Ability_Type.no_target) {
                take_battle_action(game, {
                    type: Action_Type.use_no_target_ability,
                    unit_id: unit.id,
                    ability_id: ability.id
                });
            }
        } else if (state == Button_State.hovered) {
            if (ability.type != Ability_Type.passive) {
                ability_highlighted = ability;
            }
        }

        if (game.selection.type == Selection_Type.ability && game.selection.ability_id == ability.id) {
            const ctx = game.ctx;

            ctx.strokeStyle = "green";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cursor.x, cursor.y);
            ctx.lineTo(cursor.x, cursor.y + 24);
            ctx.stroke();
        }

        push_size(24);
        push_size(4);
    }

    pop_layout();

    return ability_highlighted;
}

function layout_cursor() {
    return game.layout_stack[game.layout_stack.length - 1].cursor;
}

function push_layout(type: Layout_Type) {
    const current = game.layout_stack[game.layout_stack.length - 1];

    game.layout_stack.push({
        type: type,
        cursor: xy(current.cursor.x, current.cursor.y)
    })
}

function pop_layout() {
    game.layout_stack.pop();
}

function push_size(size: number) {
    const current = game.layout_stack[game.layout_stack.length - 1];

    switch (current.type) {
        case Layout_Type.horizontal: {
            current.cursor.x += size;
            break;
        }

        case Layout_Type.vertical: {
            current.cursor.y += size;
            break;
        }

        default: unreachable(current.type);
    }
}

function do_one_frame(time: number) {
    const ctx = game.ctx;

    game.layout_stack = [{
        type: Layout_Type.vertical,
        cursor: xy(30, 30)
    }];

    ctx.clearRect(0, 0, game.canvas_width, game.canvas_height);
    ctx.textBaseline = "middle";

    draw_header(game);

    push_layout(Layout_Type.horizontal);

    switch (game.state) {
        case Player_State.not_logged_in: {
            push_layout(Layout_Type.vertical);

            const logins: [string, string][] = [
                ["Mister Guy", "3637"],
                ["Dogster", "1337"]
            ];

            for (const [name, id] of logins) {
                if (button(`Login as ${name}`)) {
                    api_request(Api_Request_Type.authorize_steam_user, {
                        dedicated_server_key: "",
                        steam_id: id,
                        steam_user_name: name
                    }).then(auth => {
                        game.access_token = auth.token;
                        game.player_id = auth.id;

                        check_and_try_request_player_state(game, time);
                    });
                }

                push_size(4);
            }

            pop_layout();

            break;
        }

        case Player_State.on_global_map: {
            push_layout(Layout_Type.horizontal);
            draw_adventure_list(); push_size(250);
            draw_entity_list(game); push_size(250);
            draw_battle_list(game); push_size(250);
            pop_layout();

            check_and_try_refresh_nearby_players(game, time);
            check_and_try_refresh_battles(game, time);

            break;
        }

        case Player_State.on_adventure: {
            push_layout(Layout_Type.horizontal);
            draw_room_list(game); push_size(250);
            draw_room_entity_list(game); push_size(250);
            pop_layout();

            break;
        }

        case Player_State.in_battle: {
            const this_player = find_player_by_id(game.battle, game.battle_player_id);

            push_layout(Layout_Type.vertical);
            push_size(100);

            push_layout(Layout_Type.horizontal);

            let highlighted_ability: Ability_Active | undefined;

            if (is_unit_selection(game.selection)) {
                const selected_unit = find_unit_by_id(game.battle, game.selection.unit_id);

                if (selected_unit) {
                    highlighted_ability = draw_ability_list(game, selected_unit);
                }
            }

            push_size(300);
            draw_grid(game, this_player, highlighted_ability);
            push_size(20);

            push_layout(Layout_Type.vertical); {
                if (button("End turn")) {
                    const battle = game;

                    take_battle_action(game, {
                        type: Action_Type.end_turn
                    })
                        .then(() => api_request(Api_Request_Type.get_debug_ai_data, {}))
                        .then(ai_data => battle.ai_data = ai_data);

                    drop_selection(game);
                }

                push_size(4);

                if (game.ai_data) {
                    if (button(`AI data${game.show_ai_data ? ' ✓' : ''}`)) {
                        game.show_ai_data = !game.show_ai_data;
                    }
                }

                if (this_player) {
                    push_size(40);
                    draw_card_list(game, this_player);
                }

                pop_layout();
                push_size(200);
            }

            draw_battle_log(game);

            if (was_button_clicked(0) && !game.any_button_clicked_this_frame) {
                drop_selection(game);
            }

            pop_layout();
            pop_layout();

            check_and_try_request_battle_deltas(game, time);

            break;
        }
    }

    if (game.state != Player_State.not_logged_in) {
        check_and_try_request_player_state(game, time);
        check_and_try_request_chat(game, time);
    }

    pop_layout();

    push_size(500);
    draw_chat(game);

    game.mouse.clicked = false;
    game.any_button_clicked_this_frame = false;
}

function start_animation_frame_loop(time: number) {
    requestAnimationFrame(time => start_animation_frame_loop(time));

    do_one_frame(time);
}

function fix_canvas_dpi_scale(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    const width = canvas.width;
    const height = canvas.height;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const backingStoreRatio = 1; //context.backingStorePixelRatio || 1
    const ratio = devicePixelRatio / backingStoreRatio;

    if (devicePixelRatio !== backingStoreRatio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;

        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    } else {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = '';
        canvas.style.height = '';
    }

    context.scale(ratio, ratio);
}

async function game_from_state(player_state: Player_State_Data, game_base: Game_Base): Promise<Game> {
    switch (player_state.state) {
        case Player_State.in_battle: {
            const battle_log: Colored_Line[] = [];
            const battle: Battle = {
                ...make_battle(player_state.participants.map(make_battle_player), player_state.grid_size.width, player_state.grid_size.height),
                receive_event: (battle: Battle, event: Battle_Event) => {
                    process_battle_events_to_log(battle_log, event);
                },
            };

            fill_grid(battle, player_state.disabled_cell_indices);

            return {
                ...game_base,
                state: player_state.state,
                requested_battle_deltas_at: Number.MIN_SAFE_INTEGER,
                battle: battle,
                battle_id: player_state.battle_id,
                battle_player_id: player_state.battle_player_id,
                selection: { type: Selection_Type.none },
                battle_log: battle_log,
                spectating: false,
                ai_data: undefined,
                show_ai_data: false,
                disabled_cells: disabled_cell_index(player_state.disabled_cell_indices)
            };
        }

        case Player_State.on_global_map: {
            return {
                ...game_base,
                state: player_state.state,
                nearby_entities: [],
                battles: [],
                refreshed_nearby_players_at: Number.MIN_SAFE_INTEGER,
                refreshed_battles_at: Number.MIN_SAFE_INTEGER
            };
        }

        case Player_State.on_adventure: {
            return {
                ...game_base,
                state: player_state.state,
                rooms: (await api_request(Api_Request_Type.editor_list_rooms, {
                    access_token: game.access_token
                })).rooms,
                room_entities: player_state.room.entities
            };
        }

        case Player_State.not_logged_in: {
            return {
                ...game_base,
                state: player_state.state
            };
        }
    }
}

async function start_game() {
    const canvas_element = document.getElementById("canvas");
    const input_element = document.getElementById("text_input");

    if (!canvas_element || !input_element) {
        throw "Malformed page";
    }

    const canvas = (canvas_element as HTMLCanvasElement);
    const input = (input_element as HTMLInputElement);
    const context = canvas.getContext("2d");

    if (!context) {
        throw "Unable to create draw context";
    }

    fix_canvas_dpi_scale(canvas, context);

    game = await game_from_state({ state: Player_State.not_logged_in }, {
        canvas_width: canvas.width,
        canvas_height: canvas.height,
        ctx: context,
        access_token: "",
        requested_player_state_at: Number.MIN_SAFE_INTEGER,
        requested_chat_at: Number.MIN_SAFE_INTEGER,
        any_button_clicked_this_frame: false,
        chat_messages: [],
        mouse: {
            x: 0,
            y: 0,
            button: 0,
            clicked: false
        },
        player_id: -1 as Player_Id,
        layout_stack: []
    });

    const cursor_position_on_canvas = (event: MouseEvent) => {
        const transform = context.getTransform().inverse();

        const rect = canvas.getBoundingClientRect();
        const scale_x = canvas.width / rect.width;
        const scale_y = canvas.height / rect.height;

        return transform.transformPoint({
            x: (event.clientX - rect.left) * scale_x,
            y: (event.clientY - rect.top) * scale_y
        });
    };

    canvas.addEventListener("mousedown", event => {
        const real_position = cursor_position_on_canvas(event);

        game.mouse = {
            clicked: true,
            x: real_position.x,
            y: real_position.y,
            button: event.button
        };
    });

    canvas.addEventListener("mousemove", event => {
        const real_position = cursor_position_on_canvas(event);

        game.mouse.x = real_position.x;
        game.mouse.y = real_position.y;
    });

    canvas.addEventListener("contextmenu", event => event.preventDefault());

    input.addEventListener("keyup", event => {
        if (event.code == "Enter") {
            const message = input.value;

            if (message.startsWith("-") && game.state == Player_State.in_battle) {
                api_request(Api_Request_Type.battle_cheat, {
                    access_token: game.access_token,
                    cheat: message.substring(1),
                    selected_unit_id: game.selection.type == Selection_Type.unit ? game.selection.unit_id : -1 as Unit_Id
                });
            } else {
                api_request(Api_Request_Type.submit_chat_message, {
                    access_token: game.access_token,
                    message: message
                }).then(response => {
                    accept_chat_messages(game, response.messages);
                });
            }

            input.value = "";
            event.preventDefault();
        }
    });

    start_animation_frame_loop(0);
}