class Modifier_Lion_Hex extends CDOTA_Modifier_Lua {
    DeclareFunctions(): modifierfunction[] {
        return [
            modifierfunction.MODIFIER_PROPERTY_MODEL_CHANGE
        ]
    }

    GetModifierModelChange(): string {
        return "models/props_gameplay/frog.vmdl";
    }

    OnDestroy(): void {
        if (IsServer()) {
            fx_by_unit("particles/units/heroes/hero_lion/lion_spell_voodoo.vpcf", { handle: this.GetParent() })
                .release();
        }
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Lion_Hex = Modifier_Lion_Hex.prototype;