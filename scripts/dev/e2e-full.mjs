// Full game through the real UI: intent → 3 chapters → five years → fork → comparison → end.
import { launch } from "./cdp-lib.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const RAW = "我想先回家帮家里做店里的事情，同时学剪辑试着拍视频。如果几个月还是没什么感觉，我可能会再找工作。";
const STORE_KEY = "zhihu-five-years-game:v1";

const page = await launch(Number(process.env.CDP_PORT ?? 9333));
const log = (...args) => console.log(...args);
const excerpt = (text, n = 220) => text.replace(/\s+/g, " ").slice(0, n);
const startedAt = Date.now();

try {
  await page.enterFresh(`${ORIGIN}/play`);

  await page.clickButton("帮家里经营");
  await page.clickButton("做自媒体");
  await page.fill("textarea", RAW);
  await page.clickButton("确认，迈出第一步");
  log(`intent: ${await page.waitForText("我理解的是这样，对吗？")}ms`);
  await page.clickButton("对，就是这样");
  await page.passOpeningMove();

  for (const [index, pick] of [1, 0, 1].entries()) {
    const ms = await page.waitForText("看看这种可能", 120_000);
    await page.clickSelector(".pair-card", pick);
    await page.waitForText("你准备怎么办？");
    await page.clickSelector("section button.act-opt", 0);
    const sawEcho = (await page.text()).includes("你决定：");
    const outcomeMs = await page.waitForText("现在真正发生了", 90_000);
    log(`chapter ${index + 1}: possibilities ${ms}ms, outcome ${outcomeMs}ms (echo ${sawEcho})`);
    if (index < 2) await page.clickButton("继续");
  }

  let t0 = Date.now();
  await page.clickButton("五年以后");
  const sawAcceleration = (await page.text()).includes("时间继续向前");
  await page.waitForText("毕业五年 · 同学聚会", 120_000);
  log(`\nfive years: reunion after ${Date.now() - t0}ms (acceleration screen shown: ${sawAcceleration})`);
  const reunion = await page.text();
  log(`reunion: ${excerpt(reunion.split("“你现在平时都在做什么？”")[1] ?? "", 160)}`);
  log(`memorial: ${excerpt(reunion.split("真正发生过的事情：")[1] ?? "", 300)}`);

  await page.clickButton("回到这个决定");
  await page.waitForText("这一次，换成");
  t0 = Date.now();
  await page.clickSelector("section button.act-opt", 0);
  const sawRewind = (await page.text()).includes("时间倒回去");
  // The colophon also says "两段人生" during the fork, so wait for the comparison's own subtitle.
  await page.waitForText("最后的比较不是哪个更好", 120_000);
  log(`\ncounterfactual: comparison after ${Date.now() - t0}ms (rewind screen shown: ${sawRewind})`);
  const comparison = await page.text();
  log(`comparison: ${excerpt(comparison.split("最后的比较不是哪个更好")[1] ?? "", 500)}`);

  await page.reload();
  await page.waitForText("最后的比较不是哪个更好");
  log("reload restored the comparison; replacement named:", !(await page.text()).includes("「另一种选择」"));

  await page.clickButton("结束");
  await page.waitForText("没有哪一种人生能够证明另一种人生是错的");
  const stored = await page.evaluate(`(() => { const s = JSON.parse(localStorage.getItem("${STORE_KEY}")); return { gameId: s.gameId, stage: s.currentStage, facts: s.facts.length, validations: s.outcomes.map((o) => o.validation), timeline: s.fiveYearLife.timeline.length, parallel: s.parallelLife.timeline.length, comparison: [s.comparison.changedByDecision.length, s.comparison.unchanged.length, s.comparison.external.length] }; })()`);
  log("\nfinal state:", JSON.stringify(stored));
  log(`total wall time: ${Math.round((Date.now() - startedAt) / 1000)}s`);
  log(page.problems.length ? `\nPROBLEMS:\n${page.problems.join("\n")}` : "no page exceptions or console errors");
} catch (error) {
  log("E2E FAILED:", error.message);
  if (page.problems.length) log(page.problems.join("\n"));
  process.exitCode = 1;
} finally {
  page.close();
}
