import fs from "fs";
import path from "path";
export function loadFixtureJson(name) {
    const p = path.join(process.cwd(), name);
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
}
