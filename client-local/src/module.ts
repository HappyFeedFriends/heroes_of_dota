type Module = {
    name: string,
    dependencies: Dependency[],
    exported: Record<string, any>,
    execute: () => void
}

type Dependency = {
    name: string
    setter: (value: any) => void
}

type System_Definition = {
    setters: Array<(value: any) => void>,
    execute: () => void
}

type Exporter = (name: string, value: any) => void

const systems: Module[] = [];

const System = {
    register: function(dependency_names: string[], callback: (exporter: Exporter) => System_Definition) {
        const system_exports: Record<string, any> = {};

        const exporter: Exporter = (name, exported) => {
            system_exports[name] = exported;
        };

        const system = callback(exporter);

        const stack = new Error().stack;
        if (!stack) throw "FATAL ERROR: could not obtain module name";

        const called_from_start = stack.lastIndexOf("\\") + 1;
        const called_from_end = stack.lastIndexOf(".");
        const called_from = stack.substring(called_from_start, called_from_end);

        $.Msg("Registering module ", called_from);

        const dependencies: Dependency[] = [];
        const dependency_setters = system.setters;

        for (let index = 0; index < dependency_names.length; index++) {
            dependencies[index] = {
                name: dependency_names[index],
                setter: dependency_setters[index]
            }
        }

        systems.push({
            name: called_from,
            dependencies: dependencies,
            exported: system_exports,
            execute: system.execute
        });
    }
};

$.Schedule(0, () => {
    for (const system of systems) {
        $.Msg("Resolving module ", system.name);

        for (const dependency of system.dependencies) {
            const resolved = systems.find(system => `./${system.name}` === dependency.name);

            if (!resolved) {
                throw `Unresolved dependency: ${dependency.name} in module ${system.name}`;
            }

            $.Msg("\tLoading dependency: ", dependency.name);

            dependency.setter(resolved.exported);
        }
    }

    for (const system of systems) {
        $.Msg("Initializing ", system.name);
        system.execute();
    }
});