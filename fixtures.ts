import fs from "fs";
import path from "path";

export function loadFixtureJson(name: string): any {
  const p = path.join(process.cwd(), "..", "docs", "api", "examples", name);
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}
