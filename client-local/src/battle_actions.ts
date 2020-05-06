import {
    battle,
    selection,
    control_panel,
    is_unit_selection,
    receive_battle_deltas,
    Hover_Type,
    Hover_State_Cell,
    Hover_State_Unit,
} from "./battle_ui";

import {get_access_token, api_request} from "./interop";

export function take_battle_action(action: Turn_Action, success_callback?: () => void) {
    $.Msg("Take action ", action);

    const request = {
        access_token: get_access_token(),
        action: action
    };

    api_request(Api_Request_Type.take_battle_action, request, response => {
        if (success_callback) {
            success_callback();
        }

        receive_battle_deltas(response.previous_head, response.deltas);
    });
}

function try_emit_random_hero_sound(unit: Unit, supplier: (sounds: Hero_Sounds) => string[]) {
    if (unit.supertype == Unit_Supertype.hero) {
        emit_random_sound(supplier(hero_sounds_by_hero_type(unit.type)));
    }
}

// 24 - silenced
// 25 - can't move
// 30 - can't be attacked
// 41 - can't attack
// 46 - target out of range
// 48 - can't target that
// 62 - secret shop not in range
// 63 - not enough gold
// 74 - can't act
// 75 - muted
// 77 - target immune to magic
// 80 - custom "message" argument
function native_error(reason: number): Error_Reason {
    return { reason: reason };
}

function player_act_error_reason(error: Action_Error<Player_Action_Error>): Error_Reason {
    switch (error.kind) {
        case Player_Action_Error.not_your_turn: return custom_error("It's not your turn just yet");
        case Player_Action_Error.other: return custom_error("Error");
    }
}

function act_on_unit_error_reason(error: Action_Error<Act_On_Unit_Error>): Error_Reason {
    switch (error.kind) {
        case Act_On_Unit_Error.out_of_the_game: return custom_error("This unit is not targetable");
        case Act_On_Unit_Error.dead: return native_error(20);
        case Act_On_Unit_Error.other: return custom_error("Error");
    }
}

function act_on_owned_unit_error_reason(error: Action_Error<Act_On_Owned_Unit_Error>): Error_Reason {
    switch (error.kind) {
        case Act_On_Owned_Unit_Error.not_owned: return custom_error("Unit not owned");
    }
}

function order_unit_error_reason(error: Action_Error<Order_Unit_Error>): Error_Reason {
    switch (error.kind) {
        case Order_Unit_Error.other: return custom_error("Error");
        case Order_Unit_Error.unit_has_already_acted_this_turn: return custom_error("Unit has already acted this turn");
        case Order_Unit_Error.stunned: return custom_error("Stunned");
    }
}

function ability_use_error_reason(error: Action_Error<Ability_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Ability_Use_Error.other: return custom_error("Error");
        case Ability_Use_Error.no_charges: return custom_error("Ability has no more charges");
        case Ability_Use_Error.not_learned_yet: return native_error(16);
        case Ability_Use_Error.silenced: return native_error(24);
        case Ability_Use_Error.disarmed: return custom_error("Disarmed");
        case Ability_Use_Error.unusable: return custom_error("Ability not usable");
    }
}

function ground_target_ability_use_error_reason(error: Action_Error<Ground_Target_Ability_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Ground_Target_Ability_Use_Error.other: return custom_error("Error");
        case Ground_Target_Ability_Use_Error.not_in_range: return custom_error("Target out of range");
    }
}

function unit_target_ability_use_error_reason(error: Action_Error<Unit_Target_Ability_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Unit_Target_Ability_Use_Error.other: return custom_error("Error");
        case Unit_Target_Ability_Use_Error.not_in_range: return custom_error("Target out of range");
        case Unit_Target_Ability_Use_Error.invisible: return custom_error("Target is invisible");
        case Unit_Target_Ability_Use_Error.cant_target_allies: return custom_error("Ability can't target allies");
    }
}

function move_order_error_reason(error: Action_Error<Move_Order_Error>): Error_Reason {
    switch (error.kind) {
        case Move_Order_Error.not_enough_move_points: return custom_error("Not enough move points");
        case Move_Order_Error.path_not_found: return custom_error("Can't move here");
        case Move_Order_Error.rooted: return custom_error("Can't move while rooted");
        case Move_Order_Error.other: return custom_error("Error");
    }
}

export function card_use_error_reason(error: Action_Error<Card_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Card_Use_Error.other: return custom_error("Error");
        case Card_Use_Error.has_used_a_card_this_turn: return custom_error("Already used a card this turn");
    }
}

function hero_card_use_error_reason(error: Action_Error<Hero_Card_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Hero_Card_Use_Error.other: return custom_error("Error");
        case Hero_Card_Use_Error.cell_occupied: return custom_error("Occupied");
        case Hero_Card_Use_Error.not_in_deployment_zone: return custom_error("Not in deployment zone");
    }
}

function spell_target_unit_error_reason(error: Action_Error<Spell_Target_Unit_Error>): Error_Reason {
    switch (error.kind) {
        case Spell_Target_Unit_Error.other: return custom_error("Error");
        case Spell_Target_Unit_Error.not_a_hero: return custom_error("Can only target heroes");
        case Spell_Target_Unit_Error.not_an_ally: return custom_error("Can only target allies");
        case Spell_Target_Unit_Error.out_of_the_game: return custom_error("Target out of the game");
        case Spell_Target_Unit_Error.invisible: return custom_error("Target is invisible");
    }
}

function unit_target_spell_use_error_reason(error: Action_Error<Unit_Target_Spell_Card_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Unit_Target_Spell_Card_Use_Error.other: return custom_error("Error");
    }
}

function ground_target_spell_use_error_reason(error: Action_Error<Ground_Target_Spell_Card_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Ground_Target_Spell_Card_Use_Error.other: return custom_error("Error");
    }
}

function no_target_spell_use_error_reason(error: Action_Error<No_Target_Spell_Card_Use_Error>): Error_Reason {
    switch (error.kind) {
        case No_Target_Spell_Card_Use_Error.other: return custom_error("Error");
    }
}

function rune_pickup_error_reason(error: Action_Error<Rune_Pickup_Order_Error>): Error_Reason {
    switch (error.kind) {
        case Rune_Pickup_Order_Error.other: return custom_error("Error");
        case Rune_Pickup_Order_Error.not_a_hero: return custom_error("Only heroes can pick up runes");
    }
}

function use_shop_error_reason(error: Action_Error<Use_Shop_Error>): Error_Reason {
    switch (error.kind) {
        case Use_Shop_Error.other: return custom_error("Error");
        case Use_Shop_Error.not_a_hero: return custom_error("Only heroes can buy items");
        case Use_Shop_Error.not_in_shop_range: return custom_error("Not in shop range");
    }
}

function purchase_item_error_reason(error: Action_Error<Purchase_Item_Error>): Error_Reason {
    switch (error.kind) {
        case Purchase_Item_Error.other: return custom_error("Error");
        case Purchase_Item_Error.not_enough_gold: return custom_error("Not enough gold");
    }
}

// Return type is for 'return show_action_error_ui' syntax sugar
export function show_action_error_ui<T>(error: Action_Error<T>, supplier: (error: Action_Error<T>) => Error_Reason): undefined {
    show_error_ui(supplier(error));
    return;
}

function show_ability_use_error_ui(caster: Unit, ability_id: Ability_Id, error: Action_Error<Ability_Use_Error>): undefined {
    show_action_error_ui(error, ability_use_error_reason);

    if (error.kind == Ability_Use_Error.silenced) {
        const row = control_panel.unit_rows.find(row => row.unit_id == caster.id);
        if (!row) return;

        const button = row.ability_buttons.find(button => button.ability == ability_id);
        if (!button) return;

        animate_immediately(button.overlay, "animate_silence_try");
    }
}

export function show_player_action_error_ui(error: Action_Error<Player_Action_Error>): undefined {
    if (error.kind == Player_Action_Error.not_your_turn && is_unit_selection(selection)) {
        (() => {
            const act_on_unit_permission = authorize_act_on_known_unit(battle, selection.unit);
            if (!act_on_unit_permission.ok) return;

            const act_on_owned_unit_permission = authorize_act_on_owned_unit({ ok: true, battle: battle, player: battle.this_player }, act_on_unit_permission);
            if (!act_on_owned_unit_permission.ok) return;

            try_emit_random_hero_sound(selection.unit, sounds => sounds.not_yet);
        })();
    }

    show_action_error_ui(error, player_act_error_reason);

    return;
}

function authorized_act_on_owned_unit_with_error_ui(unit: Unit): Act_On_Owned_Unit_Permission | undefined {
    const player_act_permission = authorize_action_by_player(battle, battle.this_player);
    if (!player_act_permission.ok) return show_player_action_error_ui(player_act_permission);

    const act_on_unit_permission = authorize_act_on_known_unit(battle, unit);
    if (!act_on_unit_permission.ok) return show_action_error_ui(act_on_unit_permission, act_on_unit_error_reason);

    const act_on_owned_unit_permission = authorize_act_on_owned_unit(player_act_permission, act_on_unit_permission);
    if (!act_on_owned_unit_permission.ok) return show_action_error_ui(act_on_owned_unit_permission, act_on_owned_unit_error_reason);

    return act_on_owned_unit_permission;
}

function authorize_unit_order_with_error_ui(unit: Unit): Order_Unit_Permission | undefined {
    const act_on_owned_unit_permission = authorized_act_on_owned_unit_with_error_ui(unit);
    if (!act_on_owned_unit_permission) return;

    const order_permission = authorize_order_unit(act_on_owned_unit_permission);
    if (!order_permission.ok) return show_action_error_ui(order_permission, order_unit_error_reason);

    return order_permission;
}

export function authorize_ability_use_with_error_ui(unit: Unit, ability: Ability): Ability_Use_Permission | undefined {
    const order_permission = authorize_unit_order_with_error_ui(unit);
    if (!order_permission) return;

    const ability_use = authorize_ability_use(order_permission, ability.id);
    if (!ability_use.ok) return show_ability_use_error_ui(order_permission.unit, ability.id, ability_use);

    return ability_use;
}

function highlight_ability_range(unit: Unit, targeting: Ability_Targeting) {
    const cell_index_to_highlight: boolean[] = [];

    for (const cell of battle.grid.cells) {
        const index = grid_cell_index(battle.grid, cell.position);

        if (ability_targeting_fits(battle, targeting, unit.position, cell.position)) {
            cell_index_to_highlight[index] = true;
        }
    }

    highlight_outline_temporarily(battle.grid, cell_index_to_highlight, color_red, 0.2);
}

export function try_use_no_target_ability(unit: Unit, ability: Ability_No_Target): boolean {
    const ability_select_permission = authorize_ability_use_with_error_ui(unit, ability);
    if (!ability_select_permission) return false;

    if (ability == unit.attack) {
        try_emit_random_hero_sound(unit, sounds => sounds.attack);
    }

    take_battle_action({
        type: Action_Type.use_no_target_ability,
        unit_id: unit.id,
        ability_id: ability.id
    });

    return true;
}

export function try_use_ground_target_ability(unit: Unit, ability: Ability_Ground_Target, at_position: XY, highlight_ground_on_error = false): boolean {
    const ability_select_permission = authorize_ability_use_with_error_ui(unit, ability);
    if (!ability_select_permission) return false;

    const ability_use_permission = authorize_ground_target_ability_use(ability_select_permission, at_position);

    if (ability_use_permission.ok) {
        if (ability == unit.attack) {
            try_emit_random_hero_sound(unit, sounds => sounds.attack);
        }

        take_battle_action({
            type: Action_Type.ground_target_ability,
            unit_id: unit.id,
            ability_id: ability.id,
            to: at_position
        });

        return true;
    } else {
        show_action_error_ui(ability_use_permission, ground_target_ability_use_error_reason);

        if (highlight_ground_on_error && ability_use_permission.kind == Ground_Target_Ability_Use_Error.not_in_range) {
            highlight_ability_range(unit, ability.targeting);
        }

        return false;
    }
}

export function try_use_unit_targeted_ability(unit: Unit, ability: Ability_Unit_Target, cursor_entity_unit?: Unit, highlight_ground_on_error = false): boolean {
    const ability_select_permission = authorize_ability_use_with_error_ui(unit, ability);
    if (!ability_select_permission) return false;

    function try_emit_ability_voice_line() {
        if (ability == unit.attack) {
            try_emit_random_hero_sound(unit, sounds => sounds.attack);
        }
    }

    if (!cursor_entity_unit) {
        show_error_ui(custom_error("Select a target"));
        return false;
    }

    const act_on_target_permission = authorize_act_on_known_unit(battle, cursor_entity_unit);
    if (!act_on_target_permission.ok) {
        show_action_error_ui(act_on_target_permission, act_on_unit_error_reason);
        return false;
    }

    const ability_use_permission = authorize_unit_target_ability_use(ability_select_permission, act_on_target_permission);

    if (ability_use_permission.ok) {
        try_emit_ability_voice_line();
        take_battle_action({
            type: Action_Type.unit_target_ability,
            unit_id: unit.id,
            ability_id: ability.id,
            target_id: cursor_entity_unit.id
        });

        return true;
    } else {
        show_action_error_ui(ability_use_permission, unit_target_ability_use_error_reason);

        if (highlight_ground_on_error && ability_use_permission.kind == Unit_Target_Ability_Use_Error.not_in_range) {
            highlight_ability_range(unit, ability.targeting);
        }

        return false;
    }
}

function highlight_move_path(unit: Unit, to: XY, costs: Cost_Population_Result) {
    const path = find_path_from_populated_costs(battle, costs, unit.position, to);
    if (!path) return;

    const cell_index_to_highlight: boolean[] = [];

    for (const point of path) {
        cell_index_to_highlight[grid_cell_index(battle.grid, point)] = true;
    }

    highlight_outline_temporarily(battle.grid, cell_index_to_highlight, color_green, 0.5);
    square_click_particle(battle.grid, to, color_green);
}

function highlight_cells_where_unit_can_move_to(unit: Unit, costs: Cost_Population_Result) {
    const outline: boolean[] = [];

    for (const cell of battle.grid.cells) {
        const index = grid_cell_index(battle.grid, cell.position);

        if (costs.cell_index_to_cost[index] != undefined && costs.cell_index_to_cost[index] <= unit.move_points) {
            outline[index] = true;
        }
    }

    highlight_outline_temporarily(battle.grid, outline, color_green, 0.3);
}

function process_move_permission_error(unit: Unit, costs: Cost_Population_Result, error: Action_Error<Move_Order_Error>) {
    if (error.kind == Move_Order_Error.not_enough_move_points || error.kind == Move_Order_Error.path_not_found) {
        highlight_cells_where_unit_can_move_to(unit, costs);
    }

    return show_action_error_ui(error, move_order_error_reason);
}

export function try_order_unit_to_pick_up_rune(unit: Unit, rune: Rune) {
    const order_permission = authorize_unit_order_with_error_ui(unit);
    if (!order_permission) return;

    const rune_pickup_permission = authorize_rune_pickup_order(order_permission, rune.id);
    if (!rune_pickup_permission.ok) return show_action_error_ui(rune_pickup_permission, rune_pickup_error_reason);

    const costs = populate_unit_path_costs(battle, unit, true);
    const move_permission = authorize_move_order_from_costs(order_permission, rune.position, costs);
    if (!move_permission.ok) return process_move_permission_error(unit, costs, move_permission);

    try_emit_random_hero_sound(unit, sounds => sounds.move);
    highlight_move_path(unit, rune.position, costs);

    take_battle_action({
        type: Action_Type.pick_up_rune,
        rune_id: rune.id,
        unit_id: unit.id
    });
}

export function try_order_unit_to_move(unit: Unit, move_where: XY) {
    const order_permission = authorize_unit_order_with_error_ui(unit);
    if (!order_permission) return;

    const costs = populate_unit_path_costs(battle, unit, false);
    const move_permission = authorize_move_order_from_costs(order_permission, move_where, costs);
    if (!move_permission.ok) return process_move_permission_error(unit, costs, move_permission);

    try_emit_random_hero_sound(unit, sounds => sounds.move);
    highlight_move_path(unit, move_where, costs);

    take_battle_action({
        type: Action_Type.move,
        to: move_where,
        unit_id: unit.id
    });
}

type Use_Spell_Action = Action_Use_Ground_Target_Spell | Action_Use_Unit_Target_Spell | Action_Use_No_Target_Spell

function try_use_card_spell(spell: Card_Spell, hover: Hover_State_Unit | Hover_State_Cell, action_permission: Player_Action_Permission, card_use_permission: Card_Use_Permission): Use_Spell_Action | undefined {
    switch (spell.spell_type) {
        case Spell_Type.unit_target: {
            const target = (() => {
                if (hover.type == Hover_Type.cell) {
                    return unit_at(battle, hover.cell);
                } else {
                    return hover.unit;
                }
            })();

            if (!target) {
                show_error_ui(custom_error("Select a target"));
                return;
            }

            const spell_use_permission = authorize_unit_target_spell_use(card_use_permission);
            if (!spell_use_permission.ok) return show_action_error_ui(spell_use_permission, unit_target_spell_use_error_reason);

            const spell_use_on_unit_permission = authorize_known_unit_target_for_spell_card_use(spell_use_permission, target);
            if (!spell_use_on_unit_permission.ok) return show_action_error_ui(spell_use_on_unit_permission, spell_target_unit_error_reason);

            if (!authorize_spell_use_buyback_check(spell_use_on_unit_permission)) return show_error_ui(custom_error("Not enough gold"));

            return {
                type: Action_Type.use_unit_target_spell_card,
                card_id: spell.id,
                unit_id: target.id,
            };
        }

        case Spell_Type.ground_target: {
            if (hover.type != Hover_Type.cell) {
                show_error_ui(custom_error("Select a target"));
                return;
            }

            const spell_use_permission = authorize_ground_target_spell_use(card_use_permission);
            if (!spell_use_permission.ok) return show_action_error_ui(spell_use_permission, ground_target_spell_use_error_reason);

            return {
                type: Action_Type.use_ground_target_spell_card,
                card_id: spell.id,
                at: hover.cell
            };
        }

        case Spell_Type.no_target: {
            const spell_use_permission = authorize_no_target_card_spell_use(card_use_permission);
            if (!spell_use_permission.ok) return show_action_error_ui(spell_use_permission, no_target_spell_use_error_reason);

            return {
                type: Action_Type.use_no_target_spell_card,
                card_id: spell.id
            }
        }

        default: unreachable(spell);
    }
}

export function try_use_card(card: Card, hover: Hover_State_Unit | Hover_State_Cell) {
    const action_permission = authorize_action_by_player(battle, battle.this_player);
    if (!action_permission.ok) return show_player_action_error_ui(action_permission);

    const card_use_permission = authorize_card_use(action_permission, card.id);
    if (!card_use_permission.ok) return show_action_error_ui(card_use_permission, card_use_error_reason);

    switch (card.type) {
        case Card_Type.hero: {
            if (hover.type != Hover_Type.cell) return;

            const hero_card_use_permission = authorize_hero_card_use(card_use_permission, hover.cell);
            if (!hero_card_use_permission.ok) return show_action_error_ui(hero_card_use_permission, hero_card_use_error_reason);

            take_battle_action({
                type: Action_Type.use_hero_card,
                card_id: card.id,
                at: hover.cell
            });

            return true;
        }

        case Card_Type.existing_hero: {
            if (hover.type != Hover_Type.cell) return;

            const hero_card_use_permission = authorize_existing_hero_card_use(card_use_permission, hover.cell);
            if (!hero_card_use_permission.ok) return show_action_error_ui(hero_card_use_permission, hero_card_use_error_reason);

            take_battle_action({
                type: Action_Type.use_existing_hero_card,
                card_id: card.id,
                at: hover.cell
            });

            return true;
        }

        case Card_Type.spell: {
            const action = try_use_card_spell(card, hover, action_permission, card_use_permission);

            if (action) {
                take_battle_action(action);
            }

            break;
        }

        case Card_Type.unknown: {
            return;
        }

        default: unreachable(card);
    }
}

export function try_purchase_item(unit: Unit, shop: Shop, item_id: Item_Id, success_callback: () => void) {
    const act_on_owned_unit_permission = authorized_act_on_owned_unit_with_error_ui(unit);
    if (!act_on_owned_unit_permission) return;

    const use_shop_permission = authorize_shop_use(act_on_owned_unit_permission, shop.id);
    if (!use_shop_permission.ok) return show_action_error_ui(use_shop_permission, use_shop_error_reason);

    const purchase_permission = authorize_item_purchase(use_shop_permission, item_id);
    if (!purchase_permission.ok) return show_action_error_ui(purchase_permission, purchase_item_error_reason);

    Game.EmitSound("General.Buy");

    take_battle_action({
        type: Action_Type.purchase_item,
        unit_id: unit.id,
        shop_id: shop.id,
        item_id: item_id
    }, success_callback);
}