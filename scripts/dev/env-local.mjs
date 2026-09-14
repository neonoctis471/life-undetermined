import { readFileSync } from "node:fs";


export function loadEnv() {
  const env = {};
  for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
/* Anything here is masked out of every line these scripts print. */
const secrets = [env.OPENAI_API_KEY, env.ZHIHU_ACCESS_SECRET, env.ZHIHU_OAUTH_APP_KEY, env.VERCEL_OIDC_TOKEN].filter(Boolean);

export function redact(text) {
  let out = String(text);
  for (const s of secrets) out = out.split(s).join("***");
  return out;
}

export function log(...args) {
  console.log(redact(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")));
}

export { env };
