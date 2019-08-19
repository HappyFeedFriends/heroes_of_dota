type Modifier_Activity_Override_Params = {
    activity: GameActivity_t
    duration?: number
}

class Modifier_Activity_Override extends CDOTA_Modifier_Lua {
    OnCreated(params: table): void {
        if (IsServer()) {
            const parameters = params as Modifier_Activity_Override_Params;

            this.SetStackCount(parameters.activity);
        }
    }

    DeclareFunctions(): modifierfunction[] {
        return [ modifierfunction.MODIFIER_PROPERTY_OVERRIDE_ANIMATION ];
    }

    GetOverrideAnimation(): GameActivity_t {
        return this.GetStackCount();
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Activity_Override = Modifier_Activity_Override.prototype;