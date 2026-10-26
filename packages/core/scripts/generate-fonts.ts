import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseBdf } from "../src/fonts/bdf.ts";

const fontsDir = join(import.meta.dirname, "../fonts");
const outputDir = join(import.meta.dirname, "../src/fonts/generated");

function isIncluded(code: number): boolean {
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
}

function getIdentifier(name: string): string {
  return name.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
}

const files = (await readdir(fontsDir)).filter((file) => file.endsWith(".bdf")).toSorted();
const exports = await Promise.all(
  files.map(async (file) => {
    const name = basename(file, ".bdf");
    const font = parseBdf(await readFile(join(fontsDir, file), "utf8"), name);
    const glyphs = Object.fromEntries(
      Object.entries(font.glyphs).filter(([code]) => isIncluded(Number(code))),
    );
    const identifier = getIdentifier(name);
    const data = JSON.stringify({ ...font, glyphs });
    await writeFile(
      join(outputDir, `${name}.ts`),
      `import type { BitmapFont } from "../bdf.ts";\n\nexport const ${identifier}: BitmapFont = ${data};\n`,
    );
    return `export { ${identifier} } from "./${name}.ts";`;
  }),
);

await writeFile(join(outputDir, "index.ts"), `${exports.join("\n")}\n`);
