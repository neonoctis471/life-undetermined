# 人生未定式 · Life, Undetermined

> 把知乎网友真实走过的人生经验，变成你可以亲自验证、对照和讨论的平行人生。

**在线体验 → https://indeterminate.eilnoctis.com**
单局约 8–10 分钟，手机可玩，无需注册登录。

2026 知乎黑客松 · 游戏赛道参赛作品。

---

## 这是什么

一个关于「毕业后该怎么选」的互动叙事游戏。

你做三次选择——第 8 天、第 7 个月、第 4 年——看着它们长成五年的人生；然后**回到其中任意一次决定**，换一个做法，把两段人生并排放在一起看。

每一次要做决定的时刻，都能调出知乎上过来人的**真实回答**：带作者、带原问题、带可点击的原文链接。

它不给答案，也不评判哪条路更好。整个作品里没有分数、等级、徽章或经验条——一旦有了分数，「哪条路更好」就有了答案，而这个作品的全部主张是它没有。

📄 **完整产品说明：[docs/PRODUCT.md](docs/PRODUCT.md)**

---

## 本地运行

需要 Node.js >= 20.9。

```bash
npm ci
npm run dev          # http://127.0.0.1:3000 ，根路径会跳到 /play
```

服务端需要下列环境变量（写在 `.env.local`，**不要提交**）：

```text
OPENAI_BASE_URL       # OpenAI 兼容接口地址
OPENAI_API_KEY
OPENAI_MODEL_FAST
OPENAI_MODEL_DEEP
ZHIHU_ACCESS_SECRET   # 知乎经验检索
```

这些名字都没有 `NEXT_PUBLIC_` 前缀，只在服务端 Route Handler 里读取，不会进入客户端产物。

缺少配置时 AI 相关接口会走保守模板降级，界面会如实标注「保守模板（AI 暂不可用）」。

## 质量命令

```bash
npm run lint
npm run typecheck
npm run test:run     # 18 个测试文件，228 个测试
npm run build
```

---

## 架构要点

**客户端是权威，后端是无状态的。** 整局 GameState 存在浏览器 `localStorage`，状态机跑在浏览器里；两个 API 路由只是带密钥的代理与校验器。刷新恢复靠本地存档，不依赖服务端会话。

**AI 只提供候选内容，状态机才能改变权威状态。** 模型输出先用宽松 schema 接住，经规范化补齐 ID、时间戳与因果证据，再由严格的领域 schema 做最终闸门；过不了就拒绝写入。

**回溯靠决策前快照。** 每次决定被记录时同时保存一份快照（当时的打算 + 当时已发生的全部事实），三次决定三份快照。回到第 8 天时，第 7 个月和第 4 年的事实必须**不存在**而不是被忽略——引擎会校验这一点。

```
src/contracts/   领域契约（zod）
src/game-state/  状态机与不变式
src/game/        流程助手、快照构建
src/ai/          提示词、两层规范化、降级模板
src/zhihu/       知乎经验检索与排序
src/app/api/     两个无状态路由
src/app/play/    界面
```

## 技术栈

Next.js 16（App Router）· React 19 · TypeScript · zod v4 · Vitest
无 CSS 框架、无动画库、无状态管理库。部署在 Vercel。

---

## 内容来源与声明

- 知乎卡片均来自真实检索结果，保留作者、原标题与原文链接。
- AI 补充的参考思路**明确标注「AI 参考思路 · 非知乎内容」**，不冒充真人经验。
- 毕业去向数据只使用可核实来源的公开调查数字，并标注年份、调查名称与来源链接；拿不到合规来源时显示「暂无已验证数据」，不编造百分比。
- 游戏不收集账号，不上传个人信息。

字体为 Noto Sans SC / Noto Serif SC 子集，遵循 SIL Open Font License（见 `src/app/fonts/OFL.txt`）。
