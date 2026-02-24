const fs = require("node:fs");
const path = require("node:path");

const pkg = require("../package.json");
const packageName = pkg.name || "package";
const changesetDir = path.resolve(__dirname, "..", ".changeset");

if (!fs.existsSync(changesetDir)) {
  fs.mkdirSync(changesetDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `auto-${timestamp}.md`;
const filepath = path.join(changesetDir, filename);

if (fs.existsSync(filepath)) {
  process.exit(0);
}

const content = `---
"${packageName}": patch
---
Auto changeset.
`;

fs.writeFileSync(filepath, content, "utf8");
console.log(`Auto-created changeset: ${path.relative(process.cwd(), filepath)}`);
