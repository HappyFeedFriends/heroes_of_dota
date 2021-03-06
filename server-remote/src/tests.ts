import {do_assert, run_tests, test_battle} from "./test_framework";
import {load_all_adventures} from "./adventures";
import {load_all_battlegrounds} from "./battleground";

function test_load_all_adventures() {
    const ok = load_all_adventures();

    do_assert(0, ok, "Expected adventure loading to succeed");
}

function test_load_all_battlegrounds() {
    const ok = load_all_battlegrounds();

    do_assert(0, ok, "Expected battleground loading to succeed");
}

function test_battle_with_ally_and_enemy(hero: Hero_Type, at: XY) {
    const battle = test_battle();
    const ally = battle.for_test_player().spawn_hero(hero, at);
    battle.for_enemy_player().spawn_creep(Creep_Type.lane_creep, xy(7, 7));

    return [battle, ally] as const;
}

function test_player_can_spawn_hero_from_hand() {
    const battle = test_battle();

    battle.for_test_player().spawn_creep(Creep_Type.lane_creep, xy(5, 5));
    battle.for_enemy_player().spawn_creep(Creep_Type.lane_creep, xy(6, 5));

    const spawn_at = xy(0, 0);
    const hero = Hero_Type.dark_seer;

    battle.start();

    battle
        .for_test_player()
        .draw_hero_card(hero)
        .use(spawn_at);

    battle.for_test_player()
        .hero_by_type(hero)
        .assert_found();
}

function test_player_cant_spawn_hero_outside_deployment_zone() {
    const battle = test_battle();
    const spawn_at = xy(3, 3);
    const hero = Hero_Type.dark_seer;

    battle
        .for_test_player()
        .draw_hero_card(hero)
        .use(spawn_at);

    battle
        .for_test_player()
        .hero_by_type(hero)
        .assert_not_found();
}

function test_player_can_perform_a_simple_move_command() {
    const move_target = xy(3, 1);
    const [battle, hero] = test_battle_with_ally_and_enemy(Hero_Type.dark_seer, xy(1, 1));

    battle.start();

    hero
        .order_move(xy(3, 1))
        .assert()
        .is_at(move_target);
}

function test_hero_can_pick_up_rune() {
    const [battle, hero] = test_battle_with_ally_and_enemy(Hero_Type.dark_seer, xy(1, 1));
    const rune = battle.spawn_rune(Rune_Type.haste, xy(2, 2));
    battle.start();

    hero.order_pick_up_rune(rune);
    hero.assert().has_modifier(Modifier_Id.rune_haste);
}

function test_hero_cant_move_on_rune() {
    const hero_at = xy(1, 1);
    const [battle, hero] = test_battle_with_ally_and_enemy(Hero_Type.dark_seer, hero_at);
    const rune_at = xy(2, 1);
    hero.assert().has_move_points(3);

    battle.spawn_rune(Rune_Type.haste, rune_at);
    battle.start();

    hero.order_move(rune_at);
    hero.assert().is_at(hero_at);
}

function test_hero_cant_go_through_rune_to_pick_up_another_one() {
    const hero_at = xy(1, 1);
    const rune_one_at = xy(2, 1);
    const rune_two_at = xy(3, 1);

    const [battle, hero] = test_battle_with_ally_and_enemy(Hero_Type.dark_seer, hero_at);

    hero.assert().has_move_points(3);

    battle.spawn_rune(Rune_Type.haste, rune_one_at);
    const rune_two = battle.spawn_rune(Rune_Type.haste, rune_two_at);

    battle.start();

    hero.order_pick_up_rune(rune_two);
    hero.assert().is_at(hero_at);
}

function test_hero_can_phase_through_units() {
    const battle = test_battle();
    const hero_at = xy(1, 1);
    const unit_at = xy(2, 1);
    const hero_to = xy(3, 1);
    const hero = battle.for_test_player().spawn_hero(Hero_Type.dark_seer, hero_at);
    hero.apply_modifier({ id: Modifier_Id.item_phase_boots, move_bonus: 0 });
    hero.assert().has_move_points(3);

    battle.for_enemy_player().spawn_creep(Creep_Type.lane_creep, unit_at);
    battle.start();

    hero.order_move(hero_to);
    hero.assert().is_at(hero_to).has_move_points(1);
}

function test_hero_cant_go_on_another_unit_even_if_phased() {
    const battle = test_battle();
    const hero_at = xy(1, 1);
    const unit_at = xy(2, 1);
    const hero = battle.for_test_player().spawn_hero(Hero_Type.dark_seer, hero_at);
    hero.apply_modifier({ id: Modifier_Id.item_phase_boots, move_bonus: 0 });
    hero.assert().has_move_points(3);

    battle.for_enemy_player().spawn_creep(Creep_Type.lane_creep, unit_at);
    battle.start();

    hero.order_move(unit_at);
    hero.assert().is_at(hero_at);
}

function test_hero_can_phase_through_units_only() {
    const hero_at = xy(1, 1);
    const shop_at = xy(2, 1);
    const hero_to = xy(3, 1);
    const [battle, hero] = test_battle_with_ally_and_enemy(Hero_Type.dark_seer, hero_at);
    hero.apply_modifier({ id: Modifier_Id.item_phase_boots, move_bonus: 0 });
    hero.assert().has_move_points(3);
    battle.spawn_shop([], shop_at);
    battle.start();
    hero.order_move(hero_to);
    hero.assert().is_at(hero_at);
}

function test_game_doesnt_end_on_matriarch_ability() {
    const battle = test_battle();
    const hero = battle.for_test_player().spawn_hero(Hero_Type.mirana, xy(1, 1));
    const matriarch = battle.for_enemy_player().spawn_creep(Creep_Type.spider_matriarch, xy(3, 1));

    battle.start();

    hero.apply_modifier({ id: Modifier_Id.attack_damage, bonus: 100 });
    hero.order_cast_unit_target(Ability_Id.basic_attack, matriarch.unit);

    battle.for_enemy_player().creep_by_type(Creep_Type.spiderling).assert_found();
    battle.assert().is_not_over();
}

function test_game_doesnt_end_on_matriarch_ability_simple() {
    const battle = test_battle();

    battle.for_test_player()
        .spawn_hero(Hero_Type.dark_seer, xy(1, 1));

    const creep = battle.for_enemy_player()
        .spawn_creep(Creep_Type.spider_matriarch, xy(2, 2));

    battle.start();
    creep.kill();

    battle.for_enemy_player().creep_by_type(Creep_Type.spiderling).assert_found();
    battle.assert().is_not_over();
}

function test_game_over_when_all_enemies_die() {
    const battle = test_battle();

    const first_hero = battle.for_test_player().spawn_hero(Hero_Type.luna, xy(1, 1));
    const second_hero = battle.for_test_player().spawn_hero(Hero_Type.mirana, xy(1, 2));

    const first_enemy = battle.for_enemy_player().spawn_creep(Creep_Type.lane_creep, xy(2, 1));
    const second_enemy = battle.for_enemy_player().spawn_creep(Creep_Type.lane_creep, xy(2, 2));

    battle.start();

    first_hero.apply_modifier({ id: Modifier_Id.attack_damage, bonus: 100 });
    second_hero.apply_modifier({ id: Modifier_Id.attack_damage, bonus: 100 });

    first_hero.order_cast_unit_target(Ability_Id.basic_attack, first_enemy.unit);
    second_hero.order_cast_unit_target(Ability_Id.basic_attack, second_enemy.unit);

    first_enemy.assert().is_dead();
    second_enemy.assert().is_dead();
    battle.assert().is_over();
    battle.for_test_player().assert().has_won();
}

function test_game_over_when_all_enemies_die_simple() {
    const battle = test_battle();

    battle.for_test_player()
        .spawn_hero(Hero_Type.dark_seer, xy(1, 1));

    const enemies = [
        battle.for_enemy_player().spawn_creep(Creep_Type.lane_creep, xy(2, 2)),
        battle.for_enemy_player().spawn_creep(Creep_Type.lane_creep, xy(3, 3))
    ];

    battle.start();

    enemies.forEach(enemy => enemy.kill());

    battle.assert().is_over();
    battle.for_test_player().assert().has_won();
}

function test_ember_spirit_fire_remnant_ability_swap_working_correctly() {
    const [battle, hero] = test_battle_with_ally_and_enemy(Hero_Type.ember_spirit, xy(1, 1));
    hero.set_level(3);

    battle.start();

    hero.assert()
        .has_ability(Ability_Id.ember_fire_remnant)
        .has_benched_ability(Ability_Id.ember_activate_fire_remnant);

    hero.order_cast_on_ground(Ability_Id.ember_fire_remnant, xy(2, 1));

    hero.assert()
        .has_ability(Ability_Id.ember_activate_fire_remnant)
        .has_benched_ability(Ability_Id.ember_fire_remnant);

    battle.next_turn();
    battle.next_turn();

    hero.order_cast_no_target(Ability_Id.ember_activate_fire_remnant);

    hero.assert()
        .has_ability(Ability_Id.ember_fire_remnant)
        .has_benched_ability(Ability_Id.ember_activate_fire_remnant);
}

function test_health_modifiers_increase_current_health_along_with_maximum() {
    const battle = test_battle();
    const hero = battle.for_test_player().spawn_hero(Hero_Type.dark_seer, xy(1, 1));
    const starting_health = hero.unit.health;
    const bonus = 5;

    const health_modifier = hero.apply_modifier({
        id: Modifier_Id.health,
        bonus: bonus
    });

    hero.assert()
        .has_max_health(starting_health + bonus)
        .has_health(starting_health + bonus);

    hero.remove_modifier(health_modifier);

    hero.assert()
        .has_max_health(starting_health)
        .has_health(starting_health);
}

function test_health_modifiers_decrease_health_properly() {
    const battle = test_battle();
    const hero = battle.for_test_player().spawn_hero(Hero_Type.dark_seer, xy(1, 1));
    const starting_health = 3;
    const bonus = 5;

    hero.set_health(starting_health);

    hero.assert().has_health(starting_health);

    const health_modifier = hero.apply_modifier({
        id: Modifier_Id.health,
        bonus: bonus
    });

    hero.assert().has_health(starting_health + bonus);
    hero.remove_modifier(health_modifier);
    hero.assert().has_health(starting_health + bonus);
}

function test_pocket_tower_attacks_at_the_end_of_the_turn() {
    const battle = test_battle();

    battle.for_test_player().spawn_hero(Hero_Type.dark_seer, xy(0, 0));

    const enemy = battle.for_enemy_player().spawn_hero(Hero_Type.pudge, xy(5, 5));

    let expected_health = enemy.unit.health;

    battle.start();
    battle.for_test_player().draw_spell_card(Spell_Id.pocket_tower).use_at(xy(6, 6));

    enemy.assert().has_health(expected_health);

    const tower = battle.for_test_player().creep_by_type(Creep_Type.pocket_tower).assert_found();

    battle.next_turn();

    expected_health -= get_attack_damage(tower.unit);
    enemy.assert().has_health(expected_health);

    battle.next_turn();

    expected_health -= get_attack_damage(tower.unit);
    enemy.assert().has_health(expected_health);
}

function test_eul_scepter_modifier_on_enemy() {
    const battle = test_battle();

    battle.for_test_player().spawn_hero(Hero_Type.dark_seer, xy(0, 0));

    const enemy = battle.for_enemy_player().spawn_hero(Hero_Type.pudge, xy(5, 5));

    battle.start();

    enemy.assert().doesnt_have_modifier(Modifier_Id.spell_euls_scepter);
    battle.for_test_player().draw_spell_card(Spell_Id.euls_scepter).use_on(enemy);
    enemy.assert().has_modifier(Modifier_Id.spell_euls_scepter);
    battle.for_test_player().end_turn();

    enemy.assert().has_modifier(Modifier_Id.spell_euls_scepter);
    battle.for_enemy_player().end_turn();

    enemy.assert().doesnt_have_modifier(Modifier_Id.spell_euls_scepter);
}

function test_eul_scepter_modifier_on_ally() {
    const battle = test_battle();
    const ally = battle.for_test_player().spawn_hero(Hero_Type.dark_seer, xy(0, 0));

    battle.for_enemy_player().spawn_hero(Hero_Type.pudge, xy(5, 5));

    battle.start();

    ally.assert().doesnt_have_modifier(Modifier_Id.spell_euls_scepter);
    battle.for_test_player().draw_spell_card(Spell_Id.euls_scepter).use_on(ally);
    ally.assert().has_modifier(Modifier_Id.spell_euls_scepter);
    battle.for_test_player().end_turn();

    ally.assert().has_modifier(Modifier_Id.spell_euls_scepter);
    battle.for_enemy_player().end_turn();

    ally.assert().doesnt_have_modifier(Modifier_Id.spell_euls_scepter);
}

function test_game_ends_in_a_draw_if_all_units_die() {
    const battle = test_battle();
    const ally = battle.for_test_player().spawn_hero(Hero_Type.skywrath_mage, xy(0, 0))
        .set_health(1)
        .set_level(3);

    const enemy = battle.for_enemy_player().spawn_hero(Hero_Type.pudge, xy(1, 0))
        .set_health(1);

    battle.start();

    ally.order_cast_on_ground(Ability_Id.skywrath_mystic_flare, xy(0, 0));

    ally.assert().is_dead();
    enemy.assert().is_dead();
    battle.assert().is_over().was_a_draw();
}

function test_pathing_is_blocked_by_units() {
    const battle = test_battle();
    const ally_at = xy(0, 0);
    const enemy_at = xy(0, 1);
    const ally = battle.for_test_player().spawn_hero(Hero_Type.skywrath_mage, ally_at);
    const enemy = battle.for_enemy_player().spawn_hero(Hero_Type.luna, enemy_at);
    const enemy_to = xy(1, 1);
    const ally_to = xy(1, 0);

    battle.start();
    battle.for_test_player().end_turn();

    enemy.assert().is_at(enemy_at);
    enemy.order_move(ally_at);
    enemy.assert().is_at(enemy_at);
    enemy.order_move(enemy_to);
    enemy.assert().is_at(enemy_to);

    battle.for_enemy_player().end_turn();

    ally.assert().is_at(ally_at);
    ally.order_move(enemy_to);
    ally.assert().is_at(ally_at);
    ally.order_move(ally_to);
    ally.assert().is_at(ally_to);
}

function test_shaker_fissure_expires_correctly() {
    const [battle, ally] = test_battle_with_ally_and_enemy(Hero_Type.earthshaker, xy(1, 1));

    battle.start();

    battle.assert()
        .grid_free_at(xy(2, 1))
        .grid_free_at(xy(3, 1))
        .grid_free_at(xy(4, 1))
        .grid_free_at(xy(5, 1));

    ally.order_cast_on_ground(Ability_Id.shaker_fissure, xy(2, 1));

    battle.assert()
        .grid_blocked_at(xy(2, 1))
        .grid_blocked_at(xy(3, 1))
        .grid_blocked_at(xy(4, 1))
        .grid_blocked_at(xy(5, 1));

    battle.for_test_player().end_turn();

    battle.assert()
        .grid_blocked_at(xy(2, 1))
        .grid_blocked_at(xy(3, 1))
        .grid_blocked_at(xy(4, 1))
        .grid_blocked_at(xy(5, 1));

    battle.for_enemy_player().end_turn();

    battle.assert()
        .grid_free_at(xy(2, 1))
        .grid_free_at(xy(3, 1))
        .grid_free_at(xy(4, 1))
        .grid_free_at(xy(5, 1));
}

function test_shaker_enchant_totem_can_be_used_any_number_of_times() {
    const [battle, ally] = test_battle_with_ally_and_enemy(Hero_Type.earthshaker, xy(1, 1));
    battle.start();

    ally.set_level(2);

    const big_enemy = battle.for_enemy_player().spawn_hero(Hero_Type.dark_seer, xy(1, 2));

    let target_health = 100;

    big_enemy.apply_modifier({ id: Modifier_Id.health, bonus: target_health - big_enemy.unit.health });
    big_enemy.assert().has_health(target_health);

    const attack = get_attack_damage(ally.unit);

    for (let index = 0; index < 5; index++) {
        ally.set_ability_charges(Ability_Id.shaker_enchant_totem, 1);

        ally.assert()
            .has_ability(Ability_Id.basic_attack)
            .has_benched_ability(Ability_Id.shaker_enchant_totem_attack);

        ally.order_cast_no_target(Ability_Id.shaker_enchant_totem);

        ally.assert()
            .has_ability(Ability_Id.shaker_enchant_totem_attack)
            .has_benched_ability(Ability_Id.basic_attack)
            .has_modifier(Modifier_Id.shaker_enchant_totem_caster)
            .has_attack_damage(attack * 2);

        ally.order_cast_unit_target(Ability_Id.shaker_enchant_totem_attack, big_enemy.unit);

        ally.assert()
            .doesnt_have_modifier(Modifier_Id.shaker_enchant_totem_caster);

        target_health -= attack * 2;

        big_enemy.assert()
            .has_health(target_health);

        battle.next_turn();
        battle.next_turn();
    }
}

function test_hero_can_buy_shop_item() {
    const [battle, ally] = test_battle_with_ally_and_enemy(Hero_Type.earthshaker, xy(1, 1));
    battle.start();

    const player = battle.for_test_player();
    const item = Item_Id.armlet;
    const shop = battle.spawn_shop([ item ], xy(2, 2));

    player.assert().has_gold(0);
    player.change_gold(20);

    ally.order_purchase_item(shop, item);

    player.assert().has_gold(20 - item_gold_cost(item));

    ally.assert().has_modifier(Modifier_Id.item_armlet);
}

function test_hero_cant_buy_shop_item_out_of_range() {
    const hero_at = xy(1, 1);
    const [battle, ally] = test_battle_with_ally_and_enemy(Hero_Type.earthshaker, hero_at);
    battle.start();

    const player = battle.for_test_player();
    const item = Item_Id.armlet;
    const shop = battle.spawn_shop([ item ], xy(hero_at.x + Const.shop_range + 1, hero_at.y + Const.shop_range + 1));

    player.assert().has_gold(0);
    player.change_gold(20);

    ally.order_purchase_item(shop, item);

    player.assert().has_gold(20);

    ally.assert().doesnt_have_modifier(Modifier_Id.item_armlet);
}

function test_hero_cant_buy_shop_item_no_gold() {
    const [battle, ally] = test_battle_with_ally_and_enemy(Hero_Type.earthshaker, xy(1, 1));
    battle.start();

    const player = battle.for_test_player();
    const item = Item_Id.armlet;
    const shop = battle.spawn_shop([ item ], xy(2, 2));

    player.assert().has_gold(0);
    ally.order_purchase_item(shop, item);
    player.assert().has_gold(0);
    ally.assert().doesnt_have_modifier(Modifier_Id.item_armlet);
}

function test_poison_deals_damage_at_the_end_of_each_turn() {
    const [battle, ally] = test_battle_with_ally_and_enemy(Hero_Type.earthshaker, xy(1, 1));
    battle.start();

    const start_health = ally.unit.health;
    const damage = 3;

    ally.apply_modifier({ id: Modifier_Id.veno_venomous_gale, poison_applied: damage, move_reduction: 0 });
    ally.assert().has_health(start_health);

    battle.next_turn();
    ally.assert().has_health(start_health - damage);

    battle.next_turn();
    ally.assert().has_health(start_health - damage - damage);

    battle.next_turn();
    ally.assert().has_health(start_health - damage - damage - damage);
}

function test_poison_deals_damage_at_the_end_of_turn_before_expiring() {
    const [battle, ally] = test_battle_with_ally_and_enemy(Hero_Type.earthshaker, xy(1, 1));
    battle.start();

    const start_health = ally.unit.health;
    const damage = 3;

    ally.apply_modifier({ id: Modifier_Id.veno_venomous_gale, poison_applied: damage, move_reduction: 0 }, 1);
    ally.assert().has_health(start_health);

    battle.next_turn();
    ally.assert().has_health(start_health - damage);

    battle.next_turn();
    ally.assert().has_health(start_health - damage - damage);

    battle.next_turn();
    ally.assert().has_health(start_health - damage - damage).doesnt_have_modifier(Modifier_Id.veno_venomous_gale);
}

function test_aura_modifier() {
    const battle = test_battle();

    const aura_carrier = battle.for_test_player().spawn_hero(Hero_Type.earthshaker, xy(1, 1));
    const ally_in_range = battle.for_test_player().spawn_hero(Hero_Type.mirana, xy(2, 2));
    const ally_not_in_range = battle.for_test_player().spawn_hero(Hero_Type.dragon_knight, xy(4, 4));

    const enemy_in_range = battle.for_enemy_player().spawn_hero(Hero_Type.luna, xy(0, 0));
    const enemy_not_in_range = battle.for_enemy_player().spawn_hero(Hero_Type.luna, xy(5, 5));

    const fixed_attack = 10;
    const expected_bonus = 5;

    for (const hero of [aura_carrier, ally_in_range, ally_not_in_range, enemy_in_range, enemy_not_in_range]) {
        const attack = get_attack_damage(hero.unit);
        hero.apply_modifier({ id: Modifier_Id.attack_damage, bonus: fixed_attack - attack });
        hero.assert().has_attack_damage(fixed_attack);
    }

    aura_carrier.apply_modifier({
        id: Modifier_Id.aura,
        selector: {
            rectangle_distance: 2,
            flags: {
                [Aura_Selector_Flag.allies]: true,
                [Aura_Selector_Flag.enemies]: false
            }
        },
        modifier: { id: Modifier_Id.attack_damage, bonus: expected_bonus }
    });

    aura_carrier.assert().has_attack_damage(fixed_attack + expected_bonus);
    ally_in_range.assert().has_attack_damage(fixed_attack + expected_bonus);
    ally_not_in_range.assert().has_attack_damage(fixed_attack);
    enemy_in_range.assert().has_attack_damage(fixed_attack);
    enemy_not_in_range.assert().has_attack_damage(fixed_attack);
}

function test_aura_depends_on_distance() {
    const [battle, carrier] = test_battle_with_ally_and_enemy(Hero_Type.earthshaker, xy(1, 1));
    const ally = battle.for_test_player().spawn_hero(Hero_Type.mirana, xy(2, 1));

    const fixed_attack = 10;
    const expected_bonus = 5;

    const attack = get_attack_damage(ally.unit);
    ally.apply_modifier({ id: Modifier_Id.attack_damage, bonus: fixed_attack - attack });
    ally.assert().has_attack_damage(fixed_attack);

    battle.start();

    carrier.apply_modifier({
        id: Modifier_Id.aura,
        selector: {
            rectangle_distance: 2,
            flags: {
                [Aura_Selector_Flag.allies]: true,
                [Aura_Selector_Flag.enemies]: false
            }
        },
        modifier: { id: Modifier_Id.attack_damage, bonus: expected_bonus }
    });


    ally.assert().has_attack_damage(fixed_attack + expected_bonus);
    ally.order_move(xy(3, 1));
    ally.assert().has_attack_damage(fixed_attack + expected_bonus);
    ally.order_move(xy(4, 1));
    ally.assert().has_attack_damage(fixed_attack);
    ally.order_move(xy(3, 1));
    ally.assert().has_attack_damage(fixed_attack + expected_bonus);
}

function test_aura_is_disabled_on_death() {
    const [battle, carrier] = test_battle_with_ally_and_enemy(Hero_Type.earthshaker, xy(1, 1));
    const ally = battle.for_test_player().spawn_hero(Hero_Type.mirana, xy(2, 1));
    const attack = get_attack_damage(ally.unit);

    const fixed_attack = 10;
    const expected_bonus = 5;

    ally.apply_modifier({ id: Modifier_Id.attack_damage, bonus: fixed_attack - attack });
    ally.assert().has_attack_damage(fixed_attack);

    carrier.apply_modifier({
        id: Modifier_Id.aura,
        selector: {
            rectangle_distance: 2,
            flags: {
                [Aura_Selector_Flag.allies]: true,
                [Aura_Selector_Flag.enemies]: false
            }
        },
        modifier: { id: Modifier_Id.attack_damage, bonus: expected_bonus }
    });

    ally.assert().has_attack_damage(fixed_attack + expected_bonus);
    carrier.kill();
    ally.assert().has_attack_damage(fixed_attack);
}

function test_quicksand_exhausts_all_movement_points() {
    const [battle, ally] = test_battle_with_ally_and_enemy(Hero_Type.luna, xy(1, 1));
    const spell = battle.for_test_player().draw_spell_card(Spell_Id.quicksand);

    battle.start();

    spell.use_at(ally.unit.position);
    ally.assert().has_move_points(4);

    ally.order_move(xy(1, 2));
    ally.assert().is_at(xy(1, 2));
    ally.assert().has_move_points(0);

    ally.order_move(xy(1, 3));
    ally.assert().is_at(xy(1, 2));
}

run_tests([
    test_load_all_adventures,
    test_load_all_battlegrounds,
    test_player_can_spawn_hero_from_hand,
    test_player_cant_spawn_hero_outside_deployment_zone,
    test_player_can_perform_a_simple_move_command,
    test_hero_can_pick_up_rune,
    test_hero_cant_move_on_rune,
    test_hero_can_phase_through_units,
    test_hero_can_phase_through_units_only,
    test_hero_cant_go_through_rune_to_pick_up_another_one,
    test_hero_cant_go_on_another_unit_even_if_phased,
    test_game_doesnt_end_on_matriarch_ability,
    test_game_doesnt_end_on_matriarch_ability_simple,
    test_game_over_when_all_enemies_die,
    test_game_over_when_all_enemies_die_simple,
    test_game_ends_in_a_draw_if_all_units_die,
    test_ember_spirit_fire_remnant_ability_swap_working_correctly,
    test_health_modifiers_increase_current_health_along_with_maximum,
    test_health_modifiers_decrease_health_properly,
    test_pocket_tower_attacks_at_the_end_of_the_turn,
    test_eul_scepter_modifier_on_enemy,
    test_eul_scepter_modifier_on_ally,
    test_pathing_is_blocked_by_units,
    test_shaker_fissure_expires_correctly,
    test_shaker_enchant_totem_can_be_used_any_number_of_times,
    test_hero_can_buy_shop_item,
    test_hero_cant_buy_shop_item_out_of_range,
    test_hero_cant_buy_shop_item_no_gold,
    test_poison_deals_damage_at_the_end_of_each_turn,
    test_poison_deals_damage_at_the_end_of_turn_before_expiring,
    test_aura_modifier,
    test_aura_depends_on_distance,
    test_aura_is_disabled_on_death,
    test_quicksand_exhausts_all_movement_points
]);
