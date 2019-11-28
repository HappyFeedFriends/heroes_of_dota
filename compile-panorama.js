const performance = require('perf_hooks').performance;

const start_time = performance.now();

const exec = require("child_process").exec;
const read_dir = require("fs").readdir;
const copy = require("fs").copyFileSync;
const create_dir = require("fs").mkdirSync;
const exists = require("fs").existsSync;
const relative = require("path").relative;
const dirname = require("path").dirname;
const stat = require("fs").statSync;
const project_dir = process.cwd();
const panorama_folder = `${project_dir}/dist/content/panorama`;
const layout_folder = `${panorama_folder}/layout/custom_game`;
const styles_folder = `${panorama_folder}/styles/custom_game`;
const images_folder = `${panorama_folder}/images/custom_game`;

if (!exists(layout_folder)) {
    create_dir(layout_folder, { recursive: true });
}

if (!exists(styles_folder)) {
    create_dir(styles_folder, { recursive: true });
}

function try_for_each_file(dir, callback) {
    read_dir(dir, (err, files) => {
        if (err) {
            console.error(err);
            return;
        }

        files.forEach(name => {
            const path = `${dir}/${name}`;

            if (stat(path).isDirectory()) {
                try_for_each_file(path, callback);
            } else {
                callback(path, name);
            }
        });
    });
}

try_for_each_file("client-local/styles", (path, file_name) => {
    const just_name = file_name.substr(0, file_name.lastIndexOf("."));

    console.log(`Compiling ${file_name}`);
    exec(`lessc ${path} ${styles_folder}/${just_name}.css`, (err, stdio, stderr) => {
        if (err) {
            console.error(`exec error: ${error}`);
            return;
        }

        if (stdio.length > 0) console.log(stdio);
        if (stderr.length > 0) console.error(stderr);
    });
});

try_for_each_file("client-local/layout", (path, file_name) => {
    console.log(`Copying ${file_name}`);

    copy(path, `${layout_folder}/${file_name}`);
});

try_for_each_file("client-local/images", (path, file_name) => {
    const relative_path = relative("client-local/images", path);
    const target_file = `${images_folder}/${relative_path}`;
    const target_dir = dirname(target_file);

    if (!exists(target_dir)) {
        create_dir(target_dir, { recursive: true });
    }

    console.log(`Copying ${relative_path}`);

    copy(path, target_file);
});

process.on("exit", () => {
    console.log(`Finished in ${Number((performance.now() - start_time) / 1000).toFixed(2)}s`);
});