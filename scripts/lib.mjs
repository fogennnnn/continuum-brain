/** Shared helper: read ruleset files for gates. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "rules");

export function readRulesInputs() {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((file) => ({
    file,
    rules: JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")),
  }));
}
