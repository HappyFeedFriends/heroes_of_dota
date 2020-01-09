const exec = require("child_process").execSync;
const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});

const base = { stdio: "inherit" };

exec("npm install -g less", base);

exec("npm ci", { cwd: "server-remote", ...base });
exec("npm ci", { cwd: "codegen", ...base });

// TODO don't do this if -nodota is specified
readline.question(`Input steam folder`, steam => {
    readline.close();

    const dota_folder = `${steam}/steamapps/common/dota 2 beta`;
    const game_folder = `${dota_folder}/game/dota_addons/heroes_of_dota`;
    const content_folder = `${dota_folder}/content/dota_addons/heroes_of_dota`;

    // TODO rename dist/content and dist/game
    // TODO mklink /J dist/content ${content_folder}
    // TODO mklink /J dist/game ${game_folder}
    // TODO move all files from renamed dist/content and dist/game back
    // TODO delete old dist/content dist/game

    // TODO ${dota_folder}/game/bin/win64/resource_compiler dist/content/maps/main.vmap
});

exec("node compile-battle-sim", base);
exec("node compile-everything", base);
exec("node compile-panorama", base);