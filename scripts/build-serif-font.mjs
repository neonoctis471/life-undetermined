// Builds src/app/fonts/serif-subset.woff2 — the narration face.
//
// Unlike the display subset, this one cannot be built from a fixed string list:
// it renders AI-generated prose, whose glyphs cannot be enumerated in advance.
// So it carries the GB2312 level-1 set (3755 characters, ~99.7% of modern
// Chinese by frequency) plus Latin and punctuation. Anything outside it falls
// back to the system serif stack, which is why layout.tsx loads this with
// display:swap and preload:false — it must never block first paint.
//
// Requires Python with fontTools + brotli, and a copy of Noto Serif SC (SIL OFL
// 1.1). Windows ships one at C:/Windows/Fonts/NotoSerifSC-VF.ttf:
//   node scripts/build-serif-font.mjs [path/to/NotoSerifSC-VF.ttf]
import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_SOURCE = "C:/Windows/Fonts/NotoSerifSC-VF.ttf";
const source = process.argv[2] ?? DEFAULT_SOURCE;

/** GB2312 level 1: the 3755 most common hanzi, in one contiguous byte block. */
function gb2312Level1() {
  const decoder = new TextDecoder("gb2312");
  const characters = [];
  for (let high = 0xb0; high <= 0xd7; high += 1) {
    for (let low = 0xa1; low <= 0xfe; low += 1) {
      if (high === 0xd7 && low > 0xf9) break;
      const decoded = decoder.decode(new Uint8Array([high, low]));
      if (decoded && decoded !== "\ufffd") characters.push(decoded);
    }
  }
  return characters;
}

const latin = [...Array(95)].map((_, index) => String.fromCharCode(32 + index));
const punctuation = [..."·—…、。，？！：；（）〈〉《》「」『』【】“”‘’～＝％＋－×÷°"];
const characters = [...new Set([...gb2312Level1(), ...latin, ...punctuation])].join("");

const workdir = mkdtempSync(join(tmpdir(), "serif-font-"));
const staticFont = join(workdir, "static.ttf");
const textFile = join(workdir, "characters.txt");
const output = "src/app/fonts/serif-subset.woff2";

// The source is a variable font; subsetting it directly would keep the whole
// weight axis. Pin it to Regular first.
console.log(`instancing ${source} at wght=400 …`);
execFileSync("python", ["-m", "fontTools.varLib.instancer", source, "wght=400", "-o", staticFont], { stdio: "inherit" });

writeFileSync(textFile, characters, "utf8");
console.log(`subsetting ${characters.length} characters …`);
execFileSync(
  "python",
  [
    "-m",
    "fontTools.subset",
    staticFont,
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
const han = [...characters].filter((character) => /\p{Script=Han}/u.test(character)).length;
console.log(`${output}: ${(bytes / 1024).toFixed(0)} KB, ${characters.length} characters (${han} Han)`);
if (bytes > MAX_BYTES) {
  console.error(`subset exceeds ${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB`);
  process.exit(1);
}
