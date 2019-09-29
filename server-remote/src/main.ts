import {start_server} from "./server";

console.log("Starting server");

const args = process.argv.slice(2);

let dev = false;
let random_seed = Math.round(Math.random() * Number.MAX_SAFE_INTEGER);

if (args.length > 0) {
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];

        if (arg == "dev") {
            dev = true;
        }

        if (arg == "seed") {
            random_seed = parseInt(args[index + 1]);
        }
    }
}

start_server(dev, random_seed);
