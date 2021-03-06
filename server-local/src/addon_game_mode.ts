require("reflection");
require("reflected")
require("game_loop");
require("global_map");
require("adventure");
require("battle_visualiser");
require("scheduler");
require("requests");
require("unit_defs");
require("particles");
require("modifier_logic");
require("hero_sounds");
require("editor");

function Activate() { main(); }
function Precache(context: CScriptPrecacheContext) {
    function precache_model_and_log(model_scale: [string, number]) {
        PrecacheModel(model_scale[0], context);
        print("Preaching", model_scale[0])
    }

    for (const hero_type of enum_values<Hero_Type>()) {
        const hero_name = get_hero_dota_name(hero_type);
        const unit_name = hero_type_to_dota_unit_name(hero_type);

        PrecacheUnitByNameSync(unit_name, context);
        PrecacheResource("soundfile", hero_sounds_by_hero_type(hero_type).file, context);
        PrecacheResource("soundfile", `soundevents/game_sounds_heroes/game_sounds_${hero_name}.vsndevts`, context);

        const spec = get_hero_ranged_attack_spec(hero_type);

        if (spec) {
            PrecacheResource("particle", spec.particle_path, context);
        }

        print("Precaching", unit_name);
    }

    for (const creep_type of enum_values<Creep_Type>()) {
        precache_model_and_log([creep_traits_by_type(creep_type).model, 1]);
    }

    for (const npc_type of enum_values<Npc_Type>()) {
        const definition = get_npc_definition(npc_type);
        precache_model_and_log([definition.model, definition.scale]);
    }

    for (const id of enum_values<Adventure_Item_Id>()) {
        precache_model_and_log([adventure_item_id_to_model(id), 1]);
    }

    precache_model_and_log(monster_type_to_model_and_scale());

    PrecacheResource("soundfile", "soundevents/custom_game/game_sounds.vsndevts", context);
    PrecacheResource("soundfile", "soundevents/game_sounds_creeps.vsndevts", context);
    PrecacheResource("soundfile", "soundevents/game_sounds_ui_imported.vsndevts", context);
}