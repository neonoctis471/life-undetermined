import { env } from "./env-local.mjs";

// Queries shaped like the ones GENERATE_SITUATION produces for a situation.
const QUERIES = [
  "跨专业求职作品集准备",
  "作品集赶工还是打磨",
  "面试邀约与作品集冲突",
  "毕业后自媒体内容方向",
  "自媒体运营地点与家人相处",
  "帮家里看店同时做自媒体",
  "毕业第一年熬夜赶简历",
  "应届生要不要放弃面试机会",
];

async function search(q) {
  const url = new URL("https://developer.zhihu.com/api/v1/content/zhihu_search");
  url.searchParams.set("Query", q);
  url.searchParams.set("Count", "10");
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.ZHIHU_ACCESS_SECRET}`, "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)) },
    });
    const body = await res.json();
    return { http: res.status, code: body?.Code, items: body?.Data?.Items ?? [] };
  } catch (e) {
    return { http: "ERR", code: e.message, items: [] };
  }
}

// Keywords for a 跨专业求职 intent — only lexicon terms the player's text contained.
const INTENT_KEYWORDS = ["跨专业", "求职", "找工作"];

for (const q of QUERIES) {
  const r = await search(q);
  const usable = r.items.filter((i) => String(i.ContentText ?? "").length >= 100);
  const passGate = usable.filter((i) => {
    const hay = `${i.Title ?? ""}\n${i.ContentText ?? ""}`.toLowerCase();
    return INTENT_KEYWORDS.some((k) => hay.includes(k.toLowerCase()));
  });
  console.log(
    `${q.padEnd(16)} http=${r.http} code=${r.code} 返回=${String(r.items.length).padStart(2)} 正文够长=${String(usable.length).padStart(2)} 过关键词闸门=${String(passGate.length).padStart(2)}`,
  );
}
