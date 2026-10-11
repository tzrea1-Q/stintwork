import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const directory = new URL("../workflows/", import.meta.url);
const entries = readdirSync(directory)
  .filter((name) => name.endsWith(".yaml"))
  .sort()
  .map((name) => {
    const text = readFileSync(new URL(name, directory), "utf8")
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${");
    return `  ${name.slice(0, -5)}: \`${text}\`,`;
  });
writeFileSync(
  new URL("../src/bundled-workflows.ts", import.meta.url),
  `export const bundledWorkflowYaml = {\n${entries.join("\n")}\n};\n`,
);
