// Builds src/app/fonts/display-subset.woff2 from the fixed copy in src/app/play/copy.ts.
//
// Requires Python with fontTools + brotli (pip install --user fonttools brotli) and a local
// copy of Noto Sans SC Black (SIL OFL 1.1), which is not committed:
//   node scripts/build-display-font.mjs <path/to/NotoSansSC-Black.otf>
//
// Only fixed copy belongs in the subset. AI-generated text must use the system font stack.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_BYTES = 100 * 1024;
const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/build-display-font.mjs <NotoSansSC-Black.otf>");
  process.exit(1);
}

const copy = readFileSync("src/app/play/copy.ts", "utf8");
const literals = [...copy.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]).join("");
const extra = "0123456789 /·—…，。？！、：；（）「」“”";
const characters = [...new Set([...literals, ...extra])].filter((character) => character.trim() || character === " ").join("");

const workdir = mkdtempSync(join(tmpdir(), "display-font-"));
const textFile = join(workdir, "characters.txt");
writeFileSync(textFile, characters, "utf8");
const output = "src/app/fonts/display-subset.woff2";

execFileSync(
  "python",
  [
    "-m",
    "fontTools.subset",
    source,
    `--text-file=${textFile}`,
    "--flavor=woff2",
    `--output-file=${output}`,
    "--no-hinting",
    "--desubroutinize",
    "--layout-features=kern,palt,vpal,locl",
    "--name-IDs=0,1,2,3,4,5,6,13,14",
  ],
  { stdio: "inherit" },
);

const bytes = statSync(output).size;
const glyphs = [...characters].filter((character) => /\p{Script=Han}/u.test(character)).length;
console.log(`${output}: ${bytes} bytes, ${characters.length} characters (${glyphs} Han)`);
if (bytes > MAX_BYTES) {
  console.error(`subset exceeds ${MAX_BYTES} bytes`);
  process.exit(1);
}
