# 部署说明（Vercel）

## 当前线上

- 作品名：《人生未定式》
- 对外 Demo 地址：https://indeterminate.eilnoctis.com （生产；所有对外材料一律用这个地址）
- 阶段验收地址：https://preview.eilnoctis.com （指向最新 preview 部署，公开可访问）
- `eilnoctis.com` 与 `www.eilnoctis.com`：仍绑在本项目上，不做重定向、暂不解绑；比赛结束后腾给个人站
- 备用地址：https://twice-eta.vercel.app（`*.vercel.app` 在中国大陆直连会被重置，仅供代理环境使用）
- Vercel 项目：`neonoctis471s-projects/twice`，CLI 从本地文件部署，未接 Git 集成
- DNS（DNSPod）：`@ A 76.76.21.21`，`www / indeterminate / preview` 均 CNAME 指向 `cname.vercel-dns.com`。记录值要逐字符核对：写错（例如 `came.verve-dns.com`）时 Vercel 证书签发会失败，域名直接 ERR_CONNECTION_CLOSED，而 Vercel 后台只显示 Invalid Configuration。
- Primary Domain 只能在 Vercel 控制台 Project → Settings → Domains 点「Set as Primary Domain」。REST API 没有这个能力：域名接口只有 add / list / get / verify / move，`PATCH /v9/projects/twice/domains/<domain>` 带 `{"primary":true}` 被拒。

本机主机名含中文，Vercel CLI 会因非 ASCII 请求头崩溃。运行 CLI 前用 `NODE_OPTIONS=--require <ascii-hostname.cjs>` 只为 CLI 进程改写 `os.hostname()`。

## 前端改造期间的部署纪律

- 改造期间只做 preview 部署（`vercel deploy`，不带 `--prod`），并用 `vercel alias set <preview-url> preview.eilnoctis.com` 挂到预览域名；DNSPod 记录 `preview CNAME cname.vercel-dns.com`。
- 每个阶段在 preview.eilnoctis.com 验收通过后，才允许 `vercel deploy --prod`。eilnoctis.com 在任何时刻都必须是完整可玩的版本。
- Preview 与 Production 各有一套环境变量，名称相同，都只经 stdin 写入。
- 项目 `twice` 已关闭 Vercel Authentication（`ssoProtection: null`），preview 部署与生产一样公开，否则 preview.eilnoctis.com 会被登录页拦住，手机无法验收。需要恢复时：`vercel api /v9/projects/twice -X PATCH --input -`，请求体 `{"ssoProtection":{"deploymentType":"all_except_custom_domains"}}`。

## 轮换 AI Key（9/13 提交前）

**Production 和 Preview 两套环境变量都要换**，只换 Production 会让 preview.eilnoctis.com 继续使用旧 Key。换完两边各重新部署一次，再各跑一局验证。

## 环境变量（只配在 Vercel 后台或 `vercel env`，绝不上传 `.env.local`）

| 名称 | 说明 |
|---|---|
| `OPENAI_API_KEY` | 仅服务端。公开部署前先轮换（旧 Key 曾出现在聊天中） |
| `OPENAI_BASE_URL` | `https://api.openai-next.com`（不带 `/v1`，代码会自动补） |
| `OPENAI_MODEL_FAST` | `gpt-4.1` |
| `OPENAI_MODEL_DEEP` | `gpt-4.1`（实测 SIMULATE_LIFE 约 6.6s；gpt-5.4 在该中转上偏慢） |
| `ZHIHU_ACCESS_SECRET` | 仅服务端，知乎经验卡使用 |

这些名字都没有 `NEXT_PUBLIC_` 前缀，只在 Route Handler 中读取，不会进入客户端 bundle。

## 函数时长

`src/app/api/v1/ai/route.ts` 声明了 `maxDuration = 60`。服务端内部：FAST 操作单次调用 25s、总预算 45s；`SIMULATE_LIFE` 单次 45s、总预算 55s，均低于 60s。

## 命令行部署

```powershell
npx vercel login                 # 交互式登录，一次即可
npx vercel link                  # 在仓库根目录关联或创建项目
npx vercel env add OPENAI_API_KEY production      # 按提示粘贴值；其余变量同理
npx vercel deploy --prod
```

`.vercelignore` 已排除 `.env*`、`.secrets`、`.next`、`node_modules`、`coverage`、`.worktrees`、`.superpowers`。

## 部署后验收

1. `GET /api/v1/health` 返回 200。
2. 打开 `/`（会跳到 `/play`），完整玩一局：三次 Outcome 正常返回，五年人生与平行人生都出现，最后到结局页。
3. 在 Vercel 函数日志里确认没有 `FUNCTION_INVOCATION_TIMEOUT`；`[ai] ... outcome=` 日志只含操作名、次数和耗时，不含提示词或密钥。
4. 中途刷新页面，进度能从 localStorage 恢复。
