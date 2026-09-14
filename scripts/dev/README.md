# 浏览器端到端验证工具

这个项目**没有 React 测试**（`src/test/` 全是纯逻辑与 schema），UI 的正确性只能靠真实浏览器验证。
这里是一套用 CDP 驱动无头 Edge 的脚本。

## 先决条件

- Microsoft Edge（默认路径 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，可用 `EDGE_PATH` 覆盖）
- 本地起一个生产构建：`npm run build && npx next start -p 3012`
- **本地请求要绕开系统代理**：`export NO_PROXY='*' no_proxy='*'`

## 用法

```bash
node scripts/dev/e2e-opening.mjs                                       # 手机 390，打本地 3012
WIDE=1 node scripts/dev/e2e-opening.mjs                                # 桌面 1440
ORIGIN=https://indeterminate.eilnoctis.com node scripts/dev/e2e-full.mjs   # 打线上
CDP_PORT=9600 node scripts/dev/e2e-full.mjs                            # 同时跑多个时换端口
```

截图与临时浏览器配置都落在仓库根的 `.tmp/`（已 gitignore）。

## 文件

| 文件 | 用途 |
|---|---|
| `cdp-lib.mjs` | 驱动核心。`enterFresh` / `clickButton` / `clickSelector` / `fill` / `waitForText` / `evaluate` / `capture` / `emulate` / `passOpeningMove` |
| `e2e-full.mjs` | 完整一局 |
| `e2e-opening.mjs` | 第一幕之前的「先从哪件事开始」缓冲页 |
| `check-queries-sent.mjs` | 拦截并打印客户端发出的检索请求体 |
| `probe-queries.mjs` | 直接打知乎检索接口，量各级过滤器筛掉多少 |
| `env-local.mjs` | 读 `.env.local`（只在本地探测里用；**绝不打印密钥原值**） |
| `ascii-hostname.cjs` | Vercel CLI 的主机名 shim，见 `docs/CODEX_HANDOFF.md` |

## 写新脚本时注意

`page.capture("xxx.png")` 传相对路径即可，会自动落到 `.tmp/`。

第一幕现在多了一个缓冲页，**点完「对，就是这样」之后必须加一行**，否则脚本会卡住：

```js
await page.clickButton("对，就是这样");
await page.passOpeningMove();   // 有缓冲页就点第一个选项，没有就跳过
await page.waitForText("看看这种可能", 150_000);
```
