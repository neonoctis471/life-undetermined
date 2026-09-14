import { launch } from "./cdp-lib.mjs";
const O = process.env.ORIGIN ?? "http://127.0.0.1:3012";
const RAW = "我想先回家帮家里做店里的事情，同时学剪辑试着拍视频。";
const W = process.env.WIDE === "1";
const page = await launch(Number(process.env.CDP_PORT ?? 9563));
const show = (l, v) => console.log(String(l).padEnd(34), v);
try {
  await page.emulate(W ? { width: 1440, height: 1000, dpr: 1, mobile: false } : { width: 390, height: 844, dpr: 2, mobile: true });
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await page.navigate(`${O}/play`);
  await page.waitForText("用知乎账号登录，开始", 40_000);
  await page.evaluate(`localStorage.clear(); localStorage.setItem("zhihu-five-years-game:signed-in","1")`);
  await page.reload();
  await page.waitForText("开始我的五年", 40_000);
  await page.clickButton("开始我的五年");
  await page.clickButton("帮家里经营");
  await page.clickButton("做自媒体");
  await page.fill("textarea", RAW);
  await page.clickButton("确认，迈出第一步");
  await page.waitForText("我理解的是这样，对吗？", 120_000);
  show("确认页「可以先做的第一步」条数", await page.evaluate(`(() => { const b=[...document.querySelectorAll(".confirm-block")].find(x=>x.textContent.includes("可以先做的第一步")); return b ? b.querySelectorAll("li").length : "没找到这个区块"; })()`));

  await page.clickButton("对，就是这样");
  await page.waitForText("先从哪件事开始？", 30_000);
  show("缓冲页出现", true);
  show("标题", await page.evaluate(`document.querySelector(".display-title")?.textContent`));
  show("眉题", await page.evaluate(`document.querySelector(".eyebrow")?.innerText.replace(/\s+/g," ").trim()`));
  const opts = JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll(".act-list .act-label")].map(x=>x.textContent))`));
  show("选项", JSON.stringify(opts, null, 0));
  show("进度条高亮在", await page.evaluate(`document.querySelector('.journey-track li[aria-current="step"] .journey-stop')?.textContent`));
  show("横向滚动", await page.evaluate(`document.documentElement.scrollWidth > window.innerWidth`));
  await page.capture(`shots/opening-${W ? "desktop" : "phone"}.png`);

  const picked = opts[0];
  await page.evaluate(`document.querySelectorAll(".act-list .act-opt")[0].click()`);
  await page.waitForText("看看这种可能", 180_000);
  show("选完进入两种可能", true);
  const scene = await page.evaluate(`[...document.querySelectorAll(".pair-summary")].map(x=>x.textContent).join(" / ")`);
  console.log(`\n你选的开局动作：${picked}`);
  console.log(`第一幕两种可能：${scene}\n`);
  console.log(page.problems.length ? `PROBLEMS:\n${page.problems.join("\n")}` : "no page exceptions or console errors");
} catch (e) { console.log("FAILED:", e.message); } finally { page.close(); }
