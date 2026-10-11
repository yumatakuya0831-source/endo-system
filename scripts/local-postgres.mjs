import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const localDir = path.join(root, ".local-postgres");
const dataDir = path.join(localDir, "data");
const configPath = path.join(localDir, "config.json");
const port = 5433;

function run(command, args, env = process.env, { allowedExitCodes = [0], stdio = "inherit" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio });
    child.once("error", reject);
    child.once("exit", (code) => allowedExitCodes.includes(code) ? resolve(code) : reject(new Error(`${path.basename(command)} exited with code ${code}`)));
  });
}

async function start(config) {
  const status = await run(path.join(config.binDir, "pg_ctl.exe"), ["-D", dataDir, "status"], process.env, {
    allowedExitCodes: [0, 3], stdio: "ignore",
  });
  if (status === 0) {
    console.log(`PostgreSQLはすでに起動しています（127.0.0.1:${config.port}）。`);
    return;
  }
  await run(path.join(config.binDir, "pg_ctl.exe"), [
    "-D", dataDir, "-l", path.join(localDir, "postgres.log"), "-w", "-t", "30",
    "-o", `-h 127.0.0.1 -p ${config.port}`, "start",
  ]);
}

try {
  const action = process.argv[2];
  if (action === "setup") {
    try {
      await readFile(configPath);
      throw new Error("Local database already initialized. Use npm run db:start.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const portProbe = createServer();
    await new Promise((resolve, reject) => {
      portProbe.once("error", reject);
      portProbe.listen(port, "127.0.0.1", () => portProbe.close(resolve));
    });
    const installDir = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "PostgreSQL");
    const versions = (await readdir(installDir)).filter((entry) => /^\d+$/.test(entry)).sort((a, b) => Number(b) - Number(a));
    if (!versions.length) throw new Error("PostgreSQL binaries are not installed.");
    const config = {
      binDir: path.join(installDir, versions[0], "bin"),
      port,
      adminPassword: randomBytes(32).toString("hex"),
    };
    await mkdir(localDir, { recursive: true });
    const passwordFile = path.join(localDir, "init-password");
    await writeFile(passwordFile, config.adminPassword, { flag: "wx", mode: 0o600 });
    try {
      await run(path.join(config.binDir, "initdb.exe"), [
        "-D", dataDir, "-U", "postgres", "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C", `--pwfile=${passwordFile}`,
      ]);
    } finally {
      await unlink(passwordFile);
    }
    await writeFile(configPath, JSON.stringify(config), { flag: "wx", mode: 0o600 });
    await start(config);
    await run(process.execPath, [path.join(root, "scripts", "setup-postgres.mjs")], {
      ...process.env, ENDO_SETUP_ADMIN_PASSWORD: config.adminPassword, ENDO_SETUP_PORT: String(config.port),
    });
    console.log("Local PostgreSQL is ready. Restart npm run dev, then sign in as admin / admin.");
  } else if (action === "start" || action === "stop") {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (action === "start") await start(config);
    else await run(path.join(config.binDir, "pg_ctl.exe"), ["-D", dataDir, "-w", "-t", "30", "-m", "fast", "stop"]);
  } else {
    throw new Error("Use setup, start, or stop.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
