import { launch } from "./cdp-lib.mjs";
const O = process.env.ORIGIN ?? "http://127.0.0.1:3012";
const RAW = "我想先回家帮家里做店里的事情，同时学剪辑试着拍视频。";
const page = await launch(Number(process.env.CDP_PORT ?? 9555));
try {
  await page.emulate({ width: 1440, height: 950, dpr: 1, mobile: false });
  await page.navigate(`${O}/play`);
  await page.waitForText("用知乎账号登录，开始", 40_000);
  await page.evaluate(`localStorage.clear(); localStorage.setItem("zhihu-five-years-game:signed-in","1")`);
  await page.reload();
  await page.waitForText("开始我的五年", 40_000);
  // Record every search request body the page sends.
  await page.evaluate(`(() => {
    window.__q = [];
    const real = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : input.url;
        if (url.includes("/api/v1/zhihu/search") && init && init.body) {
          const b = JSON.parse(init.body);
          window.__q.push({ stage: b.situation ? "情境页" : "序章", queries: b.queries });
        }
      } catch {}
      return real.apply(this, arguments);
    };
  })()`);

  await page.clickButton("开始我的五年");
  await page.clickButton("帮家里经营");
  await page.clickButton("做自媒体");
  await page.fill("textarea", RAW);
  await page.clickButton("确认，迈出第一步");
  await page.waitForText("我理解的是这样，对吗？", 120_000);
  await page.clickButton("对，就是这样");
  await page.passOpeningMove();
  await page.waitForText("看看这种可能", 150_000);
  await page.clickSelector(".pair-card", 0);
  await page.waitForText("你准备怎么办？", 60_000);
  await page.clickSelector("section button.act-opt", 0);
  await page.waitForText("现在真正发生了", 150_000);
  await page.clickButton("继续");
  await page.waitForText("看看这种可能", 150_000);
  await page.clickSelector(".pair-card", 1);
  await page.waitForText("你准备怎么办？", 60_000);
  await new Promise((r) => setTimeout(r, 2500));
  console.log(await page.evaluate(`JSON.stringify(window.__q, null, 1)`));
} catch (e) { console.log("FAILED:", e.message); } finally { page.close(); }
