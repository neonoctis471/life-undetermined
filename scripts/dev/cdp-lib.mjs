// Minimal CDP driver for headless Edge; reads DOM text only (no screenshots).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join } from "node:path";

// Throwaway browser profiles and screenshots; .tmp/ is gitignored.
const SCRATCH = fileURLToPath(new URL("../../.tmp/", import.meta.url));
mkdirSync(SCRATCH, { recursive: true });
// Override with EDGE_PATH when Edge lives somewhere else.
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launch(port = 9333) {
  const profile = mkdtempSync(join(SCRATCH, "edge-profile-"));
  const browser = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--disable-extensions", "--disable-component-extensions-with-background-pages", "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 80 && !targets; i += 1) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); }
  }
  const page = targets.find((target) => target.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

  let seq = 0;
  const pending = new Map();
  const problems = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === "Runtime.exceptionThrown") problems.push(`PAGE EXCEPTION: ${String(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 300)}`);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") problems.push(`CONSOLE ERROR: ${msg.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300)}`);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const text = () => evaluate("document.body ? document.body.innerText : ''");
  const waitForText = async (needle, timeoutMs = 90_000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if ((await text()).includes(needle)) return Date.now() - start;
      await sleep(250);
    }
    throw new Error(`timeout waiting for "${needle}"; page text:\n${(await text()).slice(0, 1500)}`);
  };
  const clickButton = async (label, nth = 0) => {
    // The poster UI nests decorative arrows (↗ ↺) and line breaks inside buttons,
    // so compare with whitespace and those glyphs stripped from both sides.
    // Also strips the ＋ / − expander glyphs the collapsible panels append.
    const norm = `((s) => (s || "").replace(/[\\s\\u2197\\u21ba\\u2192\\u2190\\u2191\\u2193\\u00b7\\uff0b\\uff0d\\u2212]/g, ""))`;
    const ok = await evaluate(`(() => { const n = ${norm}; const want = n(${JSON.stringify(label)}); const b = [...document.querySelectorAll("button")].filter((x) => (n(x.innerText) === want || n(x.getAttribute("aria-label")) === want) && !x.disabled)[${nth}]; if (!b) return false; b.click(); return true; })()`);
    if (!ok) throw new Error(`button not found: ${label}\n${(await text()).slice(0, 800)}`);
  };
  const clickSelector = async (selector, nth = 0) => {
    const ok = await evaluate(`(() => { const b = document.querySelectorAll(${JSON.stringify(selector)})[${nth}]; if (!b) return false; b.click(); return true; })()`);
    if (!ok) throw new Error(`selector not found: ${selector}`);
  };
  const fill = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return el.value.length; })()`);
  const section = () => evaluate(`[...document.querySelectorAll("section")].map((s) => s.innerText).join("\\n---\\n")`);

  // Opens a brand-new game: clears local state, passes the opening screen, lands on the plan input.
  const enterFresh = async (url) => {
    await send("Page.navigate", { url });
    await waitForText("人生未定式");
    await evaluate("localStorage.clear()");
    await send("Page.reload");
    const start = Date.now();
    while (Date.now() - start < 30_000) {
      const current = await text();
      if (current.includes("毕业了，你准备怎样开始？")) return;
      if (current.includes("开始我的五年")) {
        await clickButton("开始我的五年");
        await waitForText("毕业了，你准备怎样开始？");
        return;
      }
      await sleep(250);
    }
    throw new Error("could not reach the plan input");
  };
  /* A relative path lands in .tmp/, so no script has to know where it is running from. */
  const capture = async (file) => {
    const target = isAbsolute(file) ? file : join(SCRATCH, file);
    mkdirSync(dirname(target), { recursive: true });
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(target, Buffer.from(data, "base64"));
  };
  const emulate = ({ width, height, dpr = 1, mobile = false }) =>
    send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });

  await send("Page.enable");
  await send("Runtime.enable");
  /*
   * Act 1 now asks which thing to do first before the two possibilities. The
   * screen is skipped when the model only offered one option, so this waits a
   * moment, picks the first option if it is there, and otherwise moves on.
   */
  const passOpeningMove = async (timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const here = await evaluate(`!!document.querySelector(".act-list .act-opt") && !!document.querySelector(".display-title")?.textContent?.includes("先从哪件事开始")`);
      if (here === true) {
        await evaluate(`document.querySelectorAll(".act-list .act-opt")[0].click()`);
        return true;
      }
      // The pair screen is already up: this run never had an opening move to make.
      if ((await evaluate(`document.body.innerText.includes("看看这种可能")`)) === true) return false;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return false;
  };

  return {
    send, evaluate, text, waitForText, clickButton, clickSelector, fill, section, problems, enterFresh, capture, emulate, passOpeningMove,
    navigate: (url) => send("Page.navigate", { url }),
    reload: () => send("Page.reload"),
    close: () => { ws.close(); browser.kill(); },
  };
}
