const exec = require("child_process").execSync;

exec("npm install", { cwd: "server-remote", stdio: "inherit" });
exec("npm install", { cwd: "codegen", stdio: "inherit" });
