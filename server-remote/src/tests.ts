import {run_tests, test_battle} from "./test_framework";
import {import_battle_sim} from "./server";

import_battle_sim();

function test_player_can_spawn_hero_from_hand() {
    const battle = test_battle();
    const spawn_at = xy(0, 0);
    const hero = Hero_Type.dark_seer;

    battle
        .for_test_player()
        .draw_hero_card(hero)
        .use(spawn_at);

    const spawned = battle.battle.units.find(unit => xy_equal(unit.position, spawn_at) && unit.supertype == Unit_Supertype.hero && unit.type == hero);

    if (!spawned) {
        throw "Not found";
    }
}

function test_player_cant_spawn_hero_outside_deployment_zone() {
    const battle = test_battle();
    const spawn_at = xy(3, 3);
    const hero = Hero_Type.dark_seer;

    battle
        .for_test_player()
        .draw_hero_card(hero)
        .use(spawn_at);

    const spawned = battle.battle.units.find(unit => xy_equal(unit.position, spawn_at) && unit.supertype == Unit_Supertype.hero && unit.type == hero);

    if (spawned) {
        throw "Shouldn't be able to take this action";
    }
}

function test_player_can_perform_a_simple_move_command() {
    const battle = test_battle();
    const move_target = xy(3, 1);
    const hero = battle.for_test_player()
        .spawn_hero(Hero_Type.dark_seer, xy(1, 1))
        .order_move(xy(3, 1));

    if (!xy_equal(hero.unit.position, move_target)) {
        throw "Unit hasn't moved";
    }
}

function test_game_doesnt_end_on_matriarch_ability() {
    const battle = test_battle();

    battle.for_test_player()
        .spawn_hero(Hero_Type.dark_seer, xy(1, 1));

    const creep = battle.for_enemy_player()
        .spawn_creep(Creep_Type.spider_matriarch, xy(2, 2));

    battle.start();
    creep.kill();

    if (!battle.battle.units.some(unit => unit.supertype == Unit_Supertype.creep && unit.type == Creep_Type.spiderling)) {
        throw "Spiderlings not spawned";
    }

    if (battle.battle.has_finished) {
        throw "Battle shouldn't be over";
    }
}

function test_game_over_when_all_enemies_die() {
    const battle = test_battle();

    battle.for_test_player()
        .spawn_hero(Hero_Type.dark_seer, xy(1, 1));

    const enemies = [
        battle.for_enemy_player().spawn_creep(Creep_Type.lane_creep, xy(2, 2)),
        battle.for_enemy_player().spawn_creep(Creep_Type.lane_creep, xy(3, 3))
    ];

    battle.start();

    enemies.forEach(enemy => enemy.kill());

    if (!battle.battle.has_finished) {
        throw "Battle should be over";
    }
}

function test_ember_spirit_fire_remnant_ability_swap_working_correctly() {
    const battle = test_battle();
    const hero = battle.for_test_player()
        .spawn_hero(Hero_Type.ember_spirit, xy(1, 1))
        .set_level(3);

    hero.assert()
        .has_ability(Ability_Id.ember_fire_remnant)
        .has_benched_ability_bench(Ability_Id.ember_activate_fire_remnant);

    hero.order_cast_on_ground(Ability_Id.ember_fire_remnant, xy(2, 1));

    hero.assert()
        .has_ability(Ability_Id.ember_activate_fire_remnant)
        .has_benched_ability_bench(Ability_Id.ember_fire_remnant);

    battle.for_test_player().end_turn();
    battle.for_enemy_player().end_turn();

    hero.order_cast_no_target(Ability_Id.ember_activate_fire_remnant);

    hero.assert()
        .has_ability(Ability_Id.ember_fire_remnant)
        .has_benched_ability_bench(Ability_Id.ember_activate_fire_remnant);
}

function test_health_modifiers_increase_current_health_along_with_maximum() {
    const battle = test_battle();
    const hero = battle.for_test_player().spawn_hero(Hero_Type.dark_seer, xy(1, 1));
    const starting_health = hero.unit.health;
    const bonus = 5;

    const health_modifier = hero.apply_modifier({
        id: Modifier_Id.item_belt_of_strength,
        health: bonus
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
        id: Modifier_Id.item_belt_of_strength,
        health: bonus
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

    const tower = battle.battle.units.find(unit => unit.supertype == Unit_Supertype.creep && unit.type == Creep_Type.pocket_tower);

    if (!tower) {
        throw "Pocket tower not spawned";
    }

    battle.for_test_player().end_turn();

    expected_health -= get_attack_damage(tower);
    enemy.assert().has_health(expected_health);

    battle.for_enemy_player().end_turn();

    expected_health -= get_attack_damage(tower);
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

run_tests([
    test_player_can_spawn_hero_from_hand,
    test_player_cant_spawn_hero_outside_deployment_zone,
    test_player_can_perform_a_simple_move_command,
    test_game_doesnt_end_on_matriarch_ability,
    test_game_over_when_all_enemies_die,
    test_ember_spirit_fire_remnant_ability_swap_working_correctly,
    test_health_modifiers_increase_current_health_along_with_maximum,
    test_health_modifiers_decrease_health_properly,
    test_pocket_tower_attacks_at_the_end_of_the_turn,
    test_eul_scepter_modifier_on_enemy,
    test_eul_scepter_modifier_on_ally
]);
