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

run_tests([
    test_player_can_spawn_hero_from_hand,
    test_player_cant_spawn_hero_outside_deployment_zone,
    test_player_can_perform_a_simple_move_command,
    test_game_doesnt_end_on_matriarch_ability,
    test_game_over_when_all_enemies_die
]);
