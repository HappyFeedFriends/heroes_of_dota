type Hero_Sounds = {
    file: string
    spawn: string[]
    move: string[]
    kill: string[]
    deny: string[]
    pain: string[]
    attack: string[]
    not_yet: string[]
    level_up: string[]
    purchase: string[]
    thanks: string[]
}

function hero_sounds_by_hero_type(hero_type: Hero_Type): Hero_Sounds {
    function range(prefix: string, last_num: number): string[] {
        const sounds: string[] = [];

        for (let index = 1; index <= last_num; index++) {
            sounds.push(`${prefix}_${index < 10 ? "0" + index : index}`);
        }

        return sounds;
    }

    switch (hero_type) {
        // @ts-ignore
        case Hero_Type.ursa: return {

        };

        // @ts-ignore
        case Hero_Type.sniper: return {

        };

        case Hero_Type.pudge: return {
            file: "soundevents/voscripts/game_sounds_vo_pudge.vsndevts",
            spawn: range("pudge_pud_spawn", 11),
            move: range("pudge_pud_move", 17),
            attack: range("pudge_pud_attack", 16),
            level_up: range("pudge_pud_level", 11),
            kill: range("pudge_pud_kill", 11),
            deny: range("pudge_pud_deny", 12),
            not_yet: range("pudge_pud_notyet", 3),
            pain: range("pudge_pud_pain", 7),
            purchase: range("pudge_pud_purch", 5),
            thanks: range("pudge_pud_thanks", 3)
        };

        case Hero_Type.tidehunter: return {
            file: "soundevents/voscripts/game_sounds_vo_tidehunter.vsndevts",
            spawn: range("tidehunter_tide_spawn", 9),
            move: range("tidehunter_tide_move", 9),
            attack: range("tidehunter_tide_attack", 11),
            level_up: range("tidehunter_tide_level", 25),
            kill: range("tidehunter_tide_kill", 12),
            deny: range("tidehunter_tide_deny", 8),
            not_yet: range("tidehunter_tide_notyet", 9),
            pain: range("tidehunter_tide_pain", 5),
            purchase: range("tidehunter_tide_purch", 3),
            thanks: range("tidehunter_tide_thanks", 2)
        };

        case Hero_Type.luna: return {
            file: "soundevents/voscripts/game_sounds_vo_luna.vsndevts",
            spawn: range("luna_luna_spawn", 4),
            move: range("luna_luna_move", 20),
            attack: range("luna_luna_attack", 28),
            level_up: range("luna_luna_levelup", 10),
            kill: range("luna_luna_kill", 11),
            deny: range("luna_luna_deny", 13),
            not_yet: range("luna_luna_notyet", 9),
            pain: range("luna_luna_pain", 11),
            purchase: range("luna_luna_purch", 3),
            thanks: range("luna_luna_thanks", 3)
        };

        case Hero_Type.skywrath_mage: return {
            file: "soundevents/voscripts/game_sounds_vo_skywrath_mage.vsndevts",
            spawn: range("skywrath_mage_drag_spawn", 4),
            move: range("skywrath_mage_drag_move", 22),
            attack: range("skywrath_mage_drag_attack", 14),
            level_up: range("skywrath_mage_drag_levelup", 10),
            kill: range("skywrath_mage_drag_kill", 12),
            deny: range("skywrath_mage_drag_deny", 16),
            not_yet: range("skywrath_mage_drag_notyet", 9),
            pain: range("skywrath_mage_drag_pain", 9),
            purchase: range("skywrath_mage_drag_purch", 3),
            thanks: range("skywrath_mage_drag_thanks", 2)
        };

        case Hero_Type.dragon_knight: return {
            // TODO dragon form
            file: "soundevents/voscripts/game_sounds_vo_dragon_knight.vsndevts",
            spawn: range("dragon_knight_drag_spawn", 4),
            move: range("dragon_knight_drag_move", 13),
            attack: range("dragon_knight_drag_attack", 10),
            level_up: range("dragon_knight_drag_level", 7),
            kill: range("dragon_knight_drag_kill", 13),
            deny: range("dragon_knight_drag_deny", 9),
            not_yet: range("dragon_knight_drag_notyet", 9),
            pain: range("dragon_knight_drag_pain", 8),
            purchase: range("dragon_knight_drag_purch", 3),
            thanks: range("dragon_knight_drag_thanks", 3)
        };

        case Hero_Type.lion: return {
            file: "soundevents/voscripts/game_sounds_vo_lion.vsndevts",
            spawn: range("lion_lion_spawn", 6),
            move: range("lion_lion_move", 13),
            attack: range("lion_lion_attack", 14),
            level_up: range("lion_lion_level", 7),
            kill: range("lion_lion_kill", 11),
            deny: range("lion_lion_deny", 10),
            not_yet: range("lion_lion_notyet", 10),
            pain: range("lion_lion_pain", 10),
            purchase: range("lion_lion_purc", 3),
            thanks: range("lion_lion_thanks", 2)
        };

        case Hero_Type.mirana: return {
            file: "soundevents/voscripts/game_sounds_vo_mirana.vsndevts",
            spawn: range("mirana_mir_spawn", 12),
            move: range("mirana_mir_move", 17),
            attack: range("mirana_mir_attack", 11),
            level_up: range("mirana_mir_levelup", 6),
            kill: range("mirana_mir_kill", 17),
            deny: range("mirana_mir_deny", 19),
            not_yet: range("mirana_mir_notyet", 9),
            pain: range("mirana_mir_pain", 10),
            purchase: range("mirana_mir_purch", 3),
            thanks: range("mirana_mir_thanks", 2)
        };

        case Hero_Type.vengeful_spirit: return {
            file: "soundevents/voscripts/game_sounds_vo_vengefulspirit.vsndevts",
            spawn: range("vengefulspirit_vng_spawn", 7),
            move: range("vengefulspirit_vng_move", 17),
            attack: range("vengefulspirit_vng_attack", 15),
            level_up: range("vengefulspirit_vng_levelup", 5),
            kill: range("vengefulspirit_vng_kill", 5),
            deny: range("vengefulspirit_vng_deny", 4),
            not_yet: range("vengefulspirit_vng_notyet", 9),
            pain: range("vengefulspirit_vng_pain", 5),
            purchase: range("vengefulspirit_vng_purch", 2),
            thanks: range("vengefulspirit_vng_thanks", 2)
        };

        case Hero_Type.dark_seer: return {
            file: "soundevents/voscripts/game_sounds_vo_dark_seer.vsndevts",
            spawn: range("dark_seer_dkseer_spawn", 5),
            move: range("dark_seer_dkseer_move", 13),
            attack: range("dark_seer_dkseer_attack", 11),
            level_up: range("dark_seer_dkseer_levelup", 8),
            kill: range("dark_seer_dkseer_kill", 13),
            deny: range("dark_seer_dkseer_deny", 8),
            not_yet: range("dark_seer_dkseer_notyet", 9),
            pain: range("dark_seer_dkseer_pain", 11),
            purchase: range("dark_seer_dkseer_purch", 3),
            thanks: range("dark_seer_dkseer_thanks", 2)
        };

        case Hero_Type.ember_spirit: return {
            file: "soundevents/voscripts/game_sounds_vo_ember_spirit.vsndevts",
            spawn: range("ember_spirit_embr_spawn", 7),
            move: range("ember_spirit_embr_move", 26),
            attack: range("ember_spirit_embr_attack", 10),
            level_up: range("ember_spirit_embr_levelup", 21),
            kill: range("ember_spirit_embr_kill", 20),
            deny: range("ember_spirit_embr_deny", 22),
            not_yet: range("ember_spirit_embr_notyet", 9),
            pain: range("ember_spirit_embr_pain", 10),
            purchase: [
                "ember_spirit_embr_purch_01",
                "ember_spirit_embr_purch_02",
                "ember_spirit_embr_purch_04"
            ],
            thanks: range("ember_spirit_embr_thanks_", 2)
        };

        case Hero_Type.earthshaker: return {
            file: "soundevents/voscripts/game_sounds_vo_earthshaker.vsndevts",
            spawn: range("earthshaker_erth_spawn", 6),
            move: range("earthshaker_erth_move", 17),
            attack: range("earthshaker_erth_attack", 8),
            level_up: range("earthshaker_erth_level", 9),
            kill: range("earthshaker_erth_kill", 11),
            deny: range("earthshaker_erth_deny", 5),
            not_yet: range("earthshaker_erth_notyet", 6),
            pain: range("earthshaker_erth_pain", 10),
            purchase: range("earthshaker_erth_purch", 3),
            thanks: range("earthshaker_erth_thanks", 3),
        };

        case Hero_Type.venomancer: return {
            file: "soundevents/voscripts/game_sounds_vo_venomancer.vsndevts",
            spawn: range("venomancer_venm_spawn", 4),
            move: range("venomancer_venm_move", 17),
            attack: range("venomancer_venm_attack", 11),
            level_up: range("venomancer_venm_level", 11),
            kill: range("venomancer_venm_kill", 16),
            deny: range("venomancer_venm_deny", 19),
            not_yet: range("venomancer_venm_notyet", 9),
            pain: range("venomancer_venm_pain", 5),
            purchase: range("venomancer_venm_purch", 3),
            thanks: range("venomancer_venm_thanks", 2),
        };

        case Hero_Type.bounty_hunter: return {
            file: "soundevents/voscripts/game_sounds_vo_bounty_hunter.vsndevts",
            spawn: range("bounty_hunter_bount_spawn", 4),
            move: range("bounty_hunter_bount_move", 19),
            attack: range("bounty_hunter_bount_attack", 14),
            level_up: range("bounty_hunter_bount_level", 11),
            kill: range("bounty_hunter_bount_kill", 20),
            deny: range("bounty_hunter_bount_deny", 13),
            not_yet: range("bounty_hunter_bount_notyet", 9),
            pain: range("bounty_hunter_bount_pain", 10),
            purchase: range("bounty_hunter_bount_purch", 3),
            thanks: range("bounty_hunter_bount_thanks", 2),
        }

        // ^".*
    }
}

function get_hero_dota_name(type: Hero_Type): string {
    switch (type) {
        case Hero_Type.sniper: return "sniper";
        case Hero_Type.pudge: return "pudge";
        case Hero_Type.ursa: return "ursa";
        case Hero_Type.tidehunter: return "tidehunter";
        case Hero_Type.luna: return "luna";
        case Hero_Type.skywrath_mage: return "skywrath_mage";
        case Hero_Type.dragon_knight: return "dragon_knight";
        case Hero_Type.lion: return "lion";
        case Hero_Type.mirana: return "mirana";
        case Hero_Type.vengeful_spirit: return "vengefulspirit";
        case Hero_Type.dark_seer: return "dark_seer";
        case Hero_Type.ember_spirit: return "ember_spirit";
        case Hero_Type.earthshaker: return "earthshaker";
        case Hero_Type.venomancer: return "venomancer";
        case Hero_Type.bounty_hunter: return "bounty_hunter";
    }
}
