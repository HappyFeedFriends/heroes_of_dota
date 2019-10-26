class Modifier_Map_Unit extends CDOTA_Modifier_Lua {
    CheckState(): { [state: number]: boolean } {
        return {
            [modifierstate.MODIFIER_STATE_NO_HEALTH_BAR]: true,
            [modifierstate.MODIFIER_STATE_DISARMED]: true,
            [modifierstate.MODIFIER_STATE_FLYING_FOR_PATHING_PURPOSES_ONLY]: true
        }
    }

    DeclareFunctions(): modifierfunction[] {
        return [
            modifierfunction.MODIFIER_PROPERTY_IGNORE_MOVESPEED_LIMIT
        ];
    }

    GetModifierIgnoreMovespeedLimit(): 0 | 1 {
        return 1;
    }

    GetAttributes(): DOTAModifierAttribute_t {
        return DOTAModifierAttribute_t.MODIFIER_ATTRIBUTE_PERMANENT;
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Map_Unit = Modifier_Map_Unit.prototype;