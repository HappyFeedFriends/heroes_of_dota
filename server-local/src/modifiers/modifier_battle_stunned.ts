class Modifier_Battle_Stunned extends CDOTA_Modifier_Lua {
    GetEffectName() {
        return "particles/generic_gameplay/generic_stunned.vpcf"
    }

    GetEffectAttachType() {
        return ParticleAttachment_t.PATTACH_OVERHEAD_FOLLOW
    }

    DeclareFunctions() {
        return [ modifierfunction.MODIFIER_PROPERTY_OVERRIDE_ANIMATION ]
    }

    GetOverrideAnimation() {
        return GameActivity_t.ACT_DOTA_DISABLED
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Battle_Stunned = Modifier_Battle_Stunned.prototype;