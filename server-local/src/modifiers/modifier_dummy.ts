class Modifier_Dummy extends CDOTA_Modifier_Lua {
    CheckState(): { [state: number]: boolean } {
        return {
            [modifierstate.MODIFIER_STATE_NO_HEALTH_BAR]: true,
            [modifierstate.MODIFIER_STATE_DISARMED]: true,
            [modifierstate.MODIFIER_STATE_INVULNERABLE]: true,
            [modifierstate.MODIFIER_STATE_UNSELECTABLE]: true,
            [modifierstate.MODIFIER_STATE_NO_UNIT_COLLISION]: true,
            [modifierstate.MODIFIER_STATE_FLYING_FOR_PATHING_PURPOSES_ONLY]: true
        }
    }

    GetAttributes(): DOTAModifierAttribute_t {
        return DOTAModifierAttribute_t.MODIFIER_ATTRIBUTE_PERMANENT;
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Dummy = Modifier_Dummy.prototype;