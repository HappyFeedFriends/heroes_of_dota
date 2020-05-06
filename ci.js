const { compile, copy_shared_code } = require("./compiler");

(async () => {
    let ok = await compile("server-remote");

    copy_shared_code("server-remote/dist");

    if (!ok) process.exit(1);
})();