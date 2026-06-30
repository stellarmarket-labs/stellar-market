import fs from "fs";
import path from "path";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "dist" || entry.name === "node_modules") {
        return [];
      }
      return walk(fullPath);
    }
    return entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("backend source hygiene", () => {
  it("contains no console statements in runtime source files", () => {
    const root = path.resolve(__dirname, "..");
    const files = walk(root).filter((file) => !file.includes("__tests__"));
    const matches = files.flatMap((file) => {
      const content = fs.readFileSync(file, "utf8");
      return content.match(/console\.(log|error|warn)/g)?.map((match) => `${file}:${match}`) ?? [];
    });

    expect(matches).toEqual([]);
  });
});
