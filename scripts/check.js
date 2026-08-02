const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const directories = ["src", "public/js", "scripts", "test"];
const files = [];

function collect(directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return;

  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(relative);
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(relative);
  }
}

for (const directory of directories) collect(directory);

let failed = false;

for (const file of files) {
  const isBrowserModule = file.startsWith(path.join("public", "js"));
  const result = isBrowserModule
    ? spawnSync(process.execPath, ["--input-type=module", "--check"], {
        cwd: root,
        input: fs.readFileSync(path.join(root, file)),
        encoding: "utf8"
      })
    : spawnSync(process.execPath, ["--check", file], {
        cwd: root,
        encoding: "utf8"
      });

  if (result.status !== 0) {
    failed = true;
    console.error(`\nSyntax error in ${file}:\n${result.stderr || result.stdout}`);
  }
}

for (const jsonFile of ["package.json", "package-lock.json"]) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, jsonFile), "utf8"));
  } catch (error) {
    failed = true;
    console.error(`Invalid ${jsonFile}: ${error.message}`);
  }
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} JavaScript files and project JSON files.`);
