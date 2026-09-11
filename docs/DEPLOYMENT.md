# 部署说明（Vercel）

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
