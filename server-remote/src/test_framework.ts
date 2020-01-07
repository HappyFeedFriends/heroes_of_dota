import {Battle_Record, make_battle_record, submit_battle_deltas, try_take_turn_action} from "./battle";
import {performance} from "perf_hooks";
import {Random} from "./random";
import {import_battle_sim} from "./server";

type Test = () => void;

type Test_Result = {
    ok: true
    name: string
} | {
    ok: false
    name: string
    error: any
}

const bright = "\x1b[1m";
const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const reset = "\x1b[0m";

import_battle_sim();

export function test_battle() {
    return new Test_Battle();
}

function do_assert(index: number, condition: boolean, message: string) {
    if (!condition) {
        throw `Assert chain #${index} failed. ${message}`;
    }
}

class Test_Battle {
    battle: Battle_Record;
    assert_index: number;

    constructor() {
        this.battle = make_test_battle();
        this.assert_index = 1;
    }

    for_test_player() {
        return new For_Player(this, this.battle.players[0]);
    }

    for_enemy_player() {
        return new For_Player(this, this.battle.players[1]);
    }

    start() {
        submit_battle_deltas(this.battle, [{
            type: Delta_Type.game_start,
        }]);

        return this;
    }
}

class For_Player {
    test: Test_Battle;
    player: Battle_Player;

    constructor(test: Test_Battle, player: Battle_Player) {
        this.test = test;
        this.player = player;
    }

    end_turn() {
        try_take_turn_action(this.test.battle, this.player, {
            type: Action_Type.end_turn
        });

        return this;
    }

    draw_hero_card(hero: Hero_Type) {
        const id = this.test.battle.id_generator() as Card_Id;

        submit_battle_deltas(this.test.battle, [{
            type: Delta_Type.draw_hero_card,
            card_id: id,
            player_id: this.player.id,
            hero_type: hero
        }]);

        return new For_Player_Hero_Card(this.test, this.player, id);
    }

    draw_spell_card(spell: Spell_Id) {
        const id = this.test.battle.id_generator() as Card_Id;

        submit_battle_deltas(this.test.battle, [{
            type: Delta_Type.draw_spell_card,
            card_id: id,
            player_id: this.player.id,
            spell_id: spell
        }]);

        return new For_Player_Spell_Card(this.test, this.player, id);
    }

    spawn_hero(hero: Hero_Type, at: XY) {
        const id = this.test.battle.id_generator() as Unit_Id;

        submit_battle_deltas(this.test.battle, [{
            type: Delta_Type.hero_spawn,
            hero_type: hero,
            at_position: at,
            health: hero_definition_by_type(hero).health,
            owner_id: this.player.id,
            unit_id: id
        }]);

        const unit = find_unit_by_id(this.test.battle, id);
        if (!unit) throw "Hero spawn failed";

        return new For_Player_Hero(this.test, this.player, unit);
    }

    spawn_creep(creep: Creep_Type, at: XY) {
        const id = this.test.battle.id_generator() as Unit_Id;

        submit_battle_deltas(this.test.battle, [{
            type: Delta_Type.creep_spawn,
            creep_type: creep,
            at_position: at,
            health: creep_definition_by_type(creep).health,
            owner_id: this.player.id,
            unit_id: id
        }]);

        const unit = find_unit_by_id(this.test.battle, id);
        if (!unit) throw "Creep spawn failed";

        return new For_Player_Unit(this.test, this.player, unit);
    }
}

class For_Player_Hero_Card {
    test: Test_Battle;
    player: Battle_Player;
    card_id: Card_Id;

    constructor(test: Test_Battle, player: Battle_Player, card_id: Card_Id) {
        this.test = test;
        this.player = player;
        this.card_id = card_id;
    }

    id() {
        return this.card_id;
    }

    use(at: XY) {
        try_take_turn_action(this.test.battle, this.player, {
            type: Action_Type.use_hero_card,
            card_id: this.card_id,
            at: at
        });

        return this;
    }
}

class For_Player_Spell_Card {
    test: Test_Battle;
    player: Battle_Player;
    card_id: Card_Id;

    constructor(test: Test_Battle, player: Battle_Player, card_id: Card_Id) {
        this.test = test;
        this.player = player;
        this.card_id = card_id;
    }

    id() {
        return this.card_id;
    }

    use_at(at: XY) {
        try_take_turn_action(this.test.battle, this.player, {
            type: Action_Type.use_ground_target_spell_card,
            card_id: this.card_id,
            at: at
        });

        return this;
    }
}

class For_Player_Unit {
    test: Test_Battle;
    player: Battle_Player;
    unit: Unit;

    constructor(test: Test_Battle, player: Battle_Player, unit: Unit) {
        this.test = test;
        this.player = player;
        this.unit = unit;
    }

    set_health(value: number) {
        submit_battle_deltas(this.test.battle, [{
            type: Delta_Type.health_change,
            source_unit_id: this.unit.id,
            target_unit_id: this.unit.id,
            new_value: value,
            value_delta: 0
        }]);

        return this;
    }

    apply_modifier(modifier: Modifier, duration?: number) {
        const id = this.test.battle.id_generator() as Modifier_Handle_Id;

        submit_battle_deltas(this.test.battle, [{
            type: Delta_Type.modifier_applied,
            unit_id: this.unit.id,
            application: {
                modifier_handle_id: id,
                modifier: modifier,
                duration: duration
            }
        }]);

        return id;
    }

    remove_modifier(handle_id: Modifier_Handle_Id) {
        submit_battle_deltas(this.test.battle, [{
            type: Delta_Type.modifier_removed,
            modifier_handle_id: handle_id
        }]);

        return this;
    }

    kill() {
        this.set_health(0);
        return this;
    }

    order_move(to: XY) {
        try_take_turn_action(this.test.battle, this.player, {
            type: Action_Type.move,
            unit_id: this.unit.id,
            to: to
        });

        return this;
    }

    order_cast_no_target(ability: Ability_Id) {
        try_take_turn_action(this.test.battle, this.player, {
            type: Action_Type.use_no_target_ability,
            unit_id: this.unit.id,
            ability_id: ability
        });

        return this;
    }

    order_cast_on_ground(ability: Ability_Id, at: XY) {
        try_take_turn_action(this.test.battle, this.player, {
            type: Action_Type.ground_target_ability,
            unit_id: this.unit.id,
            ability_id: ability,
            to: at
        });

        return this;
    }

    assert(): Assert_For_Player_Unit {
        return new Assert_For_Player_Unit(this.test, this.player, this.unit);
    }
}

class For_Player_Hero extends For_Player_Unit {
    constructor(test: Test_Battle, player: Battle_Player, unit: Unit) {
        super(test, player, unit);
    }

    set_level(level: number) {
        submit_battle_deltas(this.test.battle, [{
            type: Delta_Type.level_change,
            unit_id: this.unit.id,
            new_level: level
        }]);

        return this;
    }
}

class Assert_For_Player_Unit {
    player: Battle_Player;
    unit: Unit;
    index: number;

    constructor(test: Test_Battle, player: Battle_Player, unit: Unit) {
        this.player = player;
        this.unit = unit;
        this.index = test.assert_index++;
    }

    has_ability(id: Ability_Id) {
        do_assert(this.index, !!find_unit_ability(this.unit, id), `Failed to find ability '${enum_to_string(id)}' on unit`);

        return this;
    }

    has_benched_ability_bench(id: Ability_Id) {
        if (!this.unit.ability_bench.find(ability => ability.id == id)) {
            do_assert(this.index, false, `Failed to find benched ability '${enum_to_string(id)}' on unit`);
        }

        return this;
    }

    has_health(expected: number) {
        do_assert(this.index, this.unit.health == expected, `Expected ${expected} health, actual ${this.unit.health}`);

        return this;
    }

    has_max_health(expected: number) {
        do_assert(this.index, get_max_health(this.unit) == expected, `Expected ${expected} max health, actual ${get_max_health(this.unit)}`);

        return this;
    }
}

export function run_tests(tests: Test[]) {
    const all_start_at = performance.now();

    console.log(`Running ${clr(green, tests.length)} tests`);

    function clr(color: string, s: any): string {
        return `${bright}${color}${s}${reset}`;
    }

    let failed = 0;

    for (const test of tests) {
        const start_at = performance.now();
        const result = run_test(test);
        const time = performance.now() - start_at;
        const time_string = time.toFixed(1);

        if (result.ok) {
            console.log(`${clr(green, "✓")} ${test.name} (${time_string}ms)`);
        } else {
            failed++;

            console.log(`${clr(red, "✗")} ${test.name} (${time_string}ms) ${clr(red, "ERROR")} ${result.error}`);

            if (result.error instanceof Error) {
                console.log(result.error.stack);
            }
        }
    }

    console.log(`Ran ${clr(yellow, tests.length)} tests, ${clr(green, tests.length - failed)} passed, ${clr(red, failed)} failed`);

    const total_time_string = (performance.now() - all_start_at).toFixed(1);

    if (failed == 0) {
        console.log(`${clr(green, "TESTS PASSED")} (${total_time_string}ms)`);

        process.exit(0);
    } else {
        console.log(`${clr(red, "TESTS FAILED")} (${total_time_string}ms)`);

        process.exit(1);
    }
}

function run_test(test: Test): Test_Result {
    try {
        test();

        return {
            ok: true,
            name: test.name
        }
    } catch (error) {
        return {
            ok: false,
            name: test.name,
            error: error
        }
    }
}

export function make_test_battle() {
    let id = 0;

    const id_generator = () => id++;

    function test_player(): Battle_Player {
        return {
            id: id_generator() as Battle_Player_Id,
            deployment_zone: {
                min: { x: 0, y: 0 },
                max: { x: 1, y: 1},
                face: { x: 1, y: 0 }
            },
            gold: 0,
            has_used_a_card_this_turn: false,
            hand: [],
            map_entity: {
                type: Map_Entity_Type.player,
                player_id: 0 as Player_Id
            }
        };
    }

    return make_battle_record(0 as Battle_Id, id_generator, new Random(Math.random), [
        test_player(),
        test_player()
    ], { x: 10, y: 10 }, { x: 0, y: 0, z: 0 });
}