class Modifier_Battle_Invisible extends CDOTA_Modifier_Lua {
    DeclareFunctions() {
        return [ modifierfunction.MODIFIER_PROPERTY_INVISIBILITY_LEVEL ]
    }

    GetModifierInvisibilityLevel(): number {
        return Math.min(this.GetElapsedTime(), 1.0)
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Battle_Invisible = Modifier_Battle_Invisible.prototype;