class Modifier_Stunned extends CDOTA_Modifier_Lua {
    CheckState(): { [state: number]: boolean } {
        return {
            [modifierstate.MODIFIER_STATE_STUNNED]: true
        }
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Stunned = Modifier_Stunned.prototype;