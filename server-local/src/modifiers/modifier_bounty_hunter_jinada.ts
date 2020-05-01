class Modifier_Bounty_Hunter_Jinada extends CDOTA_Modifier_Lua {
    GetStatusEffectName(): string {
        return "particles/units/heroes/hero_bounty_hunter/status_effect_bounty_hunter_jinda_slow.vpcf";
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Bounty_Hunter_Jinada = Modifier_Bounty_Hunter_Jinada.prototype;