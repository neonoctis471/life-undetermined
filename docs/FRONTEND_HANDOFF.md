# 《人生未定式》前端重做交接文档

给接手重做前端的人。后端、状态机、AI 与知乎管线已经全部跑通并上线，**这次只重做表现层**。

读完这份文档你应该能回答三个问题：这个游戏在玩什么、状态由谁说了算、每一屏该调什么接口。

---

## 0. 三十秒摘要

- **前端是一个纯客户端应用。** 整局游戏的状态存在浏览器的 `localStorage` 里，由一个**跑在浏览器里**的状态机（Game State Engine）管理。
- **后端是无状态的。** 两个接口：`/api/v1/ai` 和 `/api/v1/zhihu/search`。它们不存任何东西，只是带密钥的代理 + 校验器。刷新页面靠 localStorage 恢复，不靠服务端。
- **AI 和知乎只提供候选内容。** 状态机是权威。AI 返回的东西必须先过状态机校验才能进入玩家的人生。
- 技术栈：Next.js 16（App Router）+ React 19 + TypeScript + zod v4 + vitest。没有 CSS 框架，没有动效库，没有状态管理库。

---

## 1. 这是什么游戏

知乎黑客松参赛作品。一句话：**把知乎网友真实走过的人生经验，
变成你可以亲自验证、对照和讨论的平行人生。**

玩家填写刚毕业时的打算 → 经历三个具体情境，每次做一个决定 → 决定产生结果，结果写进"真正发生过的事" → 五年后同学聚会，看自己走出了什么生活 → **回到第四年那个关键决定，换一个选择，再走一遍** → 两段人生并排对照。

结尾那句话是整个作品的立意：

> 没有哪一种人生能够证明另一种人生是错的。

**这决定了很多设计约束**：不做评分、不做等级、不做成就、不判对错。任何"你赢了/你做对了"的表达都是错的。

单局目标时长 **8–10 分钟**。

---

## 2. 你的边界

### 可以完全重做

- 所有页面、组件、CSS、动效、字体、配色、布局、文案排版
- 交互形式（只要不改变业务步骤的顺序）
- 加载与等待的呈现方式
- 组件拆分方式、目录结构（`src/app/` 下）

### 绝对不要动

| 目录 / 文件 | 是什么 |
|---|---|
| `src/contracts/` | 六类领域 Schema（Intent / Fact / Decision / Situation / Outcome / Snapshot）与 API 信封 |
| `src/game-state/` | 状态机、一致性校验、localStorage 存档 |
| `src/ai/` | AI 两层 Schema、normalize、提示词、重试与降级 |
| `src/zhihu/` | 知乎检索、过滤、排序、卡片生成 |
| `src/app/api/` | 两个路由 |
| `src/config/server-env.ts` | 服务端环境变量校验 |
| `src/game/` | `flow.ts`（流程辅助）、`key-snapshot.ts`（关键决定快照）、`labels.ts` |

**如果你的视觉方案需要改这些，先提出来，不要自己改。** 改错一处，整局会在某一步静默卡死或者存档读不出来。

### 不要改变的业务顺序

玩家完成任务的步骤顺序是固定的（见第 5 节的阶段表）。你可以重新编排视觉呈现、合并或拆分屏幕的呈现方式，但**不能重排流程**，也不能跳过某一步。

---

## 3. 本地跑起来

```bash
npm install
cp .env.local.example .env.local   # 如果没有这个文件，见下面的变量清单
npm run dev                        # http://localhost:3000 → 自动跳到 /play
```

`.env.local` 需要这几个变量（**问项目所有者要值，不要自己编，不要提交**）：

```
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai-next.com     # 不带 /v1，代码会补
OPENAI_MODEL_FAST=gpt-4.1
OPENAI_MODEL_DEEP=gpt-4.1
ZHIHU_ACCESS_SECRET=...
```

这些变量**全部只在服务端读取**，没有 `NEXT_PUBLIC_` 前缀，不会进客户端 bundle。**任何时候都不要把它们移到客户端，不要写进代码、文档、日志或测试。**

质量命令（改完都要过）：

```bash
npm run lint
npm run typecheck
npm run test:run     # 目前 220 个测试
npm run build
```

---

## 4. 架构：谁说了算

```
浏览器
├── React 组件（你要重做的部分）
├── GameStateStore ── localStorage["zhihu-five-years-game:v1"]
│   └── Game State Engine  ← 权威。所有状态变更必须经过它
└── fetch
     ├── POST /api/v1/ai            → AI 候选内容（无状态）
     └── POST /api/v1/zhihu/search  → 真实知乎经验卡（无状态）
```

**关键理解：AI 返回的东西不是状态，是候选。**

流程永远是：

1. 调接口拿到候选（比如一个 Situation、一个 Outcome）
2. 把候选交给状态机：`store.dispatch({ type: "...", ... })`
3. 状态机校验通过 → 写入 localStorage → React 重新渲染
4. 校验不通过 → 抛 `GameStateError` → **这一步没有写入**，你要给玩家一个提示和重试入口

状态机会拒绝的例子：Outcome 没有带任何事实、Outcome 引用的不是最新的 Decision、第 7 个月的情境凭空出现了需要前置经历的机会、关键决定的快照缺失。**这些拒绝是功能，不是 bug。**

### 状态机的用法

```ts
import { getGameStore, engineDeps, useGameState } from "@/app/play/client-store";

const state = useGameState();          // React hook，null 表示还没初始化（SSR / 首次挂载）
getGameStore().dispatch(action);       // 会抛异常，必须 try/catch
getGameStore().getState();             // 同步读最新状态
getGameStore().reset();                // 重新开始
```

`dispatch` 抛异常时**不要吞掉**，要让玩家看到"这一步没有保存，可以重试"。

---

## 5. 状态机：阶段与 dispatch 时机

这是整份文档最重要的一节。`state.currentStage` 的取值与推进顺序：

| 阶段 | 含义 | 推进它的 action | 前端在这一步要做的事 |
|---|---|---|---|
| `CREATED` | 刚开局 | `CONFIRM_INTENT` | 开场 → 填打算 → 调 `UNDERSTAND_INTENT` → 给玩家确认 → dispatch |
| `INTENT_CONFIRMED` | 打算已确认 | `ADD_SITUATION` | 调 `GENERATE_SITUATION`(DAY_8)，展示两种可能，玩家选一种后 dispatch |
| `SITUATION_READY` | 情境已展开 | `RECORD_DECISION` | 展示情境与可选行动（并行展示知乎卡），玩家选定后 dispatch |
| `DECISION_RECORDED` | 决定已记录 | `APPLY_OUTCOME` | 调 `RESOLVE_OUTCOME`，拿到结果后 dispatch |
| `OUTCOME_RESOLVED` | 结果已写入 | `ADD_SITUATION` 或 `SET_FIVE_YEAR_LIFE` | 展示结果与新写入的事实。**还没满三轮就回到 `ADD_SITUATION`**；满三轮则调 `SIMULATE_LIFE(FIVE_YEARS)` |
| `LONG_TERM_READY` | 五年人生已生成 | （自动）`REUNION_READY` | 五年加速转场 |
| `REUNION_READY` | 聚会页 | `OPEN_FORK` | 聚会与五年纪念页，玩家点"回到这个决定" |
| `FORK_READY` | 回溯已开启 | `SET_PARALLEL_LIFE` → **仍停在 `FORK_READY`** | 展示关键决定的替代选项，玩家选定后调 `SIMULATE_LIFE(COUNTERFACTUAL)` |
| `FORK_READY` | 平行人生已生成 | `SET_COMPARISON` | 同一个阶段。写入对照数据后才前进 |
| `COMPARISON_READY` | 对照页 | `COMPLETE` | 两段人生并排 |
| `COMPLETED` | 结束 | — | 结语 |

**三个最容易踩的坑：**

1. **`SET_PARALLEL_LIFE` 之后阶段不变，仍是 `FORK_READY`。** 不要用阶段变化来判断平行人生是否已生成，要看 `state.parallelLife !== null`。
2. **主循环恰好三轮**（`DAY_8` / `MONTH_7` / `YEAR_4`），由 `state.outcomes.length` 决定下一章。`MAX_MAIN_SITUATIONS = 3`。
3. **第三轮（`YEAR_4`）的那个 Decision 必须标记为关键决定，并同时传入 Snapshot。** `RECORD_DECISION` 的 `keyDecisionSnapshot` 参数只在这一次需要。用 `src/game/key-snapshot.ts` 的 `buildKeyDecisionSnapshot(state)` 生成，不要自己拼。判断是不是这一轮用 `src/game/flow.ts` 的 `isKeyDecisionTurn(state)`。

`src/game/flow.ts` 里还有几个现成的辅助函数，直接用，不要重写：`nextChapter`、`previousChoices`、`choiceSummaries`、`keyDecisionContext`、`snapshotFacts`、`toIntentCandidate`、`buildDecision`、`keyChoiceSummary`。

---

## 6. 后端 API 完整契约

### 通用信封

成功：

```jsonc
{
  "data": { /* 见下 */ },
  "meta": {
    "requestId": "uuid",
    "eventVersion": 0,
    "nextStep": "SUBMIT_INTENT | CONFIRM_INTENT | SELECT_SITUATION | MAKE_DECISION | REVIEW_OUTCOME | SIMULATE_YEARS | SELECT_KEY_DECISION | REVIEW_COMPARISON | FINISHED",
    "phase": "可选"
  }
}
```

失败（HTTP 4xx/5xx）：

```jsonc
{
  "error": {
    "code": "INVALID_REQUEST | AI_TIMEOUT | AI_INVALID_OUTPUT | ZHIHU_UNAVAILABLE | RATE_LIMITED | INTERNAL_ERROR | ...",
    "message": "不超过 300 字的安全文案，绝不含提示词或密钥",
    "requestId": "uuid",
    "retryable": true
  }
}
```

`retryable` 为 `true` 时，UI 应该给一个重试按钮；为 `false` 时不要让玩家反复撞墙。

两个接口都接受 `X-Game-Id` 请求头（用 `state.gameId`），仅用于服务端日志聚合每局的上游调用次数。**建议保留**。

### `POST /api/v1/ai`

请求体 `{ "operation": ..., "input": ... }`，四种 operation：

**1. `UNDERSTAND_INTENT`** — 理解玩家的打算

```ts
input: {
  rawText: string;          // 玩家原话，非空，≤1200 字
  selectedPlans: string[];  // ≤12 条，每条 ≤40 字
  selectedValues: string[]; // ≤12 条，每条 ≤40 字；会兜底成 Intent.priorities
}
// data: { operation, generation: "AI" | "FALLBACK", result: { summary, intent, searchQueries } }
```

`result.intent` 是一个 **IntentCandidate**（没有 `confirmedAt`）。dispatch 时你要补上时间戳：

```ts
dispatch({ type: "CONFIRM_INTENT", intent: { ...candidate, confirmedAt: new Date().toISOString() } });
```

`result.searchQueries` 拿去喂知乎接口，**不要展示给玩家**。

**2. `GENERATE_SITUATION`** — 生成同一时间点的两种可能

```ts
input: {
  chapter: "DAY_8" | "MONTH_7" | "YEAR_4";
  intent: IntentCandidate;
  facts: Fact[];            // ≤64
  previousChoices: string[];
}
// data.result: { chapter, possibilities: [2], variants: { MOMENTUM: {...}, UNEXPECTED: {...} } }
```

**一次调用同时返回两种可能各自的完整情境**，所以玩家选择"看看这种可能"时**不需要再发请求**，直接用对应的 variant。这是刻意的设计，别改成两次调用。

**3. `RESOLVE_OUTCOME`** — 决定之后发生了什么

```ts
input: {
  intent: IntentCandidate;
  situation: Situation;
  possibilityId: string;
  actionId: string;
  customAction?: string;
  facts: Fact[];
}
// data.result: ResolvedOutcome
```

**4. `SIMULATE_LIFE`** — 长期推演

```ts
input: {
  mode: "FIVE_YEARS" | "COUNTERFACTUAL";
  intent: Intent;
  facts: Fact[];
  choices: string[];
  // COUNTERFACTUAL 还要：snapshot、replacedDecision 等，见 src/ai/contracts.ts
}
// data.result: { timeline, currentState, reunionAnswer, commemorativeFacts, comparison? }
```

**每个 data 都有 `generation: "AI" | "FALLBACK"`。** `FALLBACK` 表示上游不可用、用了保守模板。UI 应该诚实标出来（现在是一个小 tag），不要假装是 AI 生成的。

### `POST /api/v1/zhihu/search`

```ts
{
  intent: IntentCandidate;
  situation: { timeLabel, concreteContext, tensions } | null;  // 序章传 null
  queries: string[];  // 1-3 条，必须至少 1 条，否则 400
}
// data: { source: "ZHIHU" | "AI_SUPPLEMENT" | "NONE", cards: Card[] }  // 最多 2 张
```

知乎卡（`provenance: "ZHIHU_ADAPTED" | "ZHIHU_ORIGINAL"`）：

```ts
{ provenance, id, title, authorName, url, contentType, excerpt,
  relevance: number | null,   // 0-10，模型打分
  conditions: string[], whatTheyDid: string | null, whatHappened: string | null,
  similarities: string[], differences: string[], voteUpCount: number }
```

AI 补充卡（`provenance: "AI_SUPPLEMENT"`）：`{ provenance, label, points: string[] }`——**视觉上必须和知乎卡明显不同**，见第 8 节。

### `GET /api/v1/health`

返回 200 + `{"data":{"status":"ok",...}}`。部署验收用。

---

## 7. 真实延迟：等待是设计对象，不是缺陷

线上实测（gpt-4.1 经中转，单局全流程 60–150 秒）：

| 调用 | 典型 | 见过的最差 |
|---|---|---|
| `UNDERSTAND_INTENT` | 3–5s | 16s |
| `GENERATE_SITUATION` | 7–9s | 35s |
| `RESOLVE_OUTCOME` | 6–8s | 31s |
| `SIMULATE_LIFE` | 6–8s | 27s |
| 知乎卡（检索 + 摘要） | 5–7s | — |

服务端已有的保护：FAST 操作单次 25s / 总预算 45s；`SIMULATE_LIFE` 单次 45s / 总预算 55s；`maxDuration = 60`。超时会走 `FALLBACK` 而不是报错。

**现有实现用了两个手段把等待藏起来，请保留这两个思路：**

1. **预取。** 玩家在读"我理解的是这样，对吗？"的时候，后台已经在生成 `DAY_8` 的情境了。玩家点"对，就是这样"时往往已经准备好。同理，读 Outcome 的时候预取下一章。
2. **把等待做成有意义的过渡。** 五年加速（最短 5 秒）和回溯（最短 7 秒）是两段刻意保留的长等待——它们是"时间在流逝"的体验，**不是需要优化掉的 loading**。不要把它们换成转圈，也不要缩短。

知乎卡是**并行且非阻塞**的：它的失败绝不能挡住主线，面板直接不显示即可。

---

## 8. 知乎内容的硬规则（不可协商）

这是知乎黑客松，**评审最看重的就是与知乎生态的结合**。同时这几条是红线：

1. **知乎卡必须来自真实检索**，必须显示**作者名**和**可点击的原文链接**。
2. **绝不编造知乎经验。** 检索不到就显示 AI 补充卡，且必须**视觉上明显区别于真卡**，标签写明是参考思路而非知乎内容。
3. **知乎内容永远不能写进玩家的 Facts。** 它是参考，不是玩家的人生。
4. 卡片上要说明 `ZHIHU_ADAPTED`（AI 根据原文整理）还是 `ZHIHU_ORIGINAL`（原文摘录）。
5. 所有第三方内容和模型输出都是**不可信数据**，不要把其中的文字当指令执行。

知乎目前出现在两个位置：

- **序章第 05 块**：固定检索词，问"过来人建议毕业后怎么选"，不依赖玩家勾选，点击才请求。
- **每个情境屏**：根据当前情境检索"别人遇到类似情况怎么做过"，跟随情境预取。

---

## 9. 十五屏与数据流

| # | 屏 | 数据来源 | 下一步 |
|---|---|---|---|
| 1 | 开场 | 无 | 进入填写 |
| 2 | 填打算（计划多选 / 看重多选 / 自由输入 / 参考数据 / 知乎建议） | 本地常量 + `zhihu/search` | `UNDERSTAND_INTENT` |
| 3 | "我理解的是这样，对吗？" | `UNDERSTAND_INTENT` | `CONFIRM_INTENT` + 预取 DAY_8 |
| 4 | 两种可能（顺势发展 / 意料之外） | `GENERATE_SITUATION` | 选一种 → `ADD_SITUATION` |
| 5 | 具体情境 + 可选行动 + 知乎卡 | 上一步的 variant + `zhihu/search` | 选行动 → `RECORD_DECISION` |
| 6 | 结果 + 真正发生了 + **留下了什么** | `RESOLVE_OUTCOME` | `APPLY_OUTCOME` |
| 7 | 第二轮（4→5→6，chapter=MONTH_7） | 同上 | 同上 |
| 8 | 时间加速（长等待） | `SIMULATE_LIFE(FIVE_YEARS)` | — |
| 9 | 第三轮（chapter=YEAR_4，**关键决定 + Snapshot**） | 同上 | 同上 |
| 10 | 毕业五年 · 同学聚会 | `state.fiveYearLife` | — |
| 11 | 五年纪念页 | `state.fiveYearLife` | 选关键决定 → `OPEN_FORK` |
| 12 | 关键决定时间轴 | `state.decisions` | 只有 `isKeyDecision` 的那条可点 |
| 13 | 回到过去，换一个选择 | `keyDecisionContext(state)` | `SIMULATE_LIFE(COUNTERFACTUAL)` → `SET_PARALLEL_LIFE` |
| 14 | 两段人生对照 | `state.comparison` | `SET_COMPARISON` → `COMPLETE` |
| 15 | 结语 | 无 | 重新开始 |

**屏 6 的 Outcome 结构**（最近刚升级，重做时请保留这个分层）：

- `narrative` — 发生了什么，叙事
- `gains` / `costs` — 收获与代价
- `addedFacts` — **「现在真正发生了」**，客观事实，硬状态
- `unresolvedConsequences` — 仍然没有答案
- `reflection?` — **「这件事，在你身上留下了什么」**，软状态，可选

`reflection` 每条：`{ kind, content, horizon, evidenceFactIndexes }`。

- `kind` 九种：`METHOD` 处理事情的方式 / `PERSPECTIVE` 新的视角 / `SELF_KNOWLEDGE` 对自己的了解 / `RELATIONSHIP` 人际与沟通 / `REALITY` 现实经验 / `RESOURCE` 资源与机会 / `COST` 付出的代价 / `EXPOSED` 暴露出的问题 / `FIRST_TIME` 第一次。中文标签在 `src/game/labels.ts` 的 `REFLECTION_LABELS`。
- `horizon` 三层：`IMMEDIATE` 当下得到的 / `LASTING` 慢慢留下的 / `POSSIBLE` 以后可能影响你的。**`POSSIBLE` 那层在视觉上要比另外两层"退后一步"**（现在用斜体 + 更浅的墨色），因为它还没有发生。
- **`reflection` 可能不存在**（旧存档、模型没话说、上游降级）。缺失时整块不渲染，**不要显示空标题**。
- `evidenceFactIndexes` 指向这条 Outcome 自己的 `addedFacts` 下标，只用于追溯，**不要展示给玩家**。

**Facts 和 Reflection 的权限完全不同：** Facts 是硬状态，后续剧情可以直接依赖；Reflection 是软状态，只能被参考，不能当成玩家的固定特质。UI 上也要区分开，不要混成一个列表。

---

## 10. 失败与降级，必须处理的状态

| 情况 | 现象 | UI 必须怎么做 |
|---|---|---|
| AI 超时 / 上游不可用 | `generation: "FALLBACK"` | 正常渲染，同时诚实标出是保守模板 |
| AI 返回非法结构 | 500 + `AI_INVALID_OUTPUT` | 可重试 |
| 知乎不可用 | `source: "NONE"` 或接口失败 | **面板静默不显示**，绝不挡住主线 |
| 知乎无匹配 | `cards: []` | 同上 |
| 状态机拒绝 | `dispatch` 抛 `GameStateError` | 提示"这一步没有写入，可以重试或重新开始" |
| localStorage 不可用 | 自动降级为内存存储 | 不用特别处理，但别假设刷新一定能恢复 |
| 旧存档缺新字段 | 字段为 `undefined` | 所有新字段都要当作可选来读 |
| 玩家中途刷新 | 从 localStorage 恢复到当前阶段 | **必须能正确恢复到对应的屏** |

最后一条要认真测：进度恢复是这个游戏最容易做坏的地方。

---

## 11. 可访问性与性能底线

- 桌面和手机都必须可用，**手机是主要验收环境**（评审大概率用手机看）。
- 键盘可操作、焦点态可见、文字对比度够。
- 尊重 `prefers-reduced-motion`：现有实现下，背景动画会停、指针视差整套不挂载。
- 如果用重型视觉技术（Canvas / WebGL），必须有降级策略。现有背景装置有三档（按 CPU 核数、内存、视口宽度选档）并带帧率监控自动降级。
- **大陆可访问**：不要用 Google Fonts、不要用被墙的 CDN。中文字体要自托管子集。

---

## 12. 部署

Vercel，项目 `neonoctis471s-projects/twice`，**没有接 Git 集成，从本地 CLI 部署**。

- 对外地址：`https://indeterminate.eilnoctis.com`（生产）
- 阶段验收：`https://preview.eilnoctis.com`（指向最新 preview）
- 纪律：**改造期间只做 preview 部署**，手机验收通过后才 `vercel deploy --prod`。生产在任何时刻都必须是完整可玩的版本。
- Production 和 Preview 各有一套环境变量，名字相同，都只经 stdin 写入。

详见 `docs/DEPLOYMENT.md`（包含一个本机主机名含中文导致 Vercel CLI 崩溃的坑及其解法）。

---

## 13. 现有前端里可以直接拿走的东西

重做不代表全扔。这几块是花了时间验证过的：

- `src/app/play/client-store.ts` — 状态机与 React 的接线，**建议原样保留**
- `src/app/play/ai-client.ts` / `zhihu-client.ts` — 接口封装 + 响应校验，**建议原样保留**
- `src/app/play/page.tsx` 里的**编排逻辑**（什么时候调什么、什么时候 dispatch、预取时机、session token 防竞态）——界面可以全重做，但这套编排是对的，重写容易漏掉预取和竞态处理
- `src/app/play/plans.ts`、`graduation-stats.ts` — 序章的选项数据与带来源标注的真实统计数字
- `src/app/play/field/` — GameState 驱动的线场画布（如果新方案不要，可以整个删掉）
- `scripts/build-serif-font.mjs`、`build-display-font.mjs` — 中文字体子集构建

`page.tsx` 里有一个叫 `session` 的 ref，每次重开/改主意时自增，用来丢弃已经作废的异步响应。**重做时一定要保留这个机制**，否则玩家改打算后旧响应会把新状态覆盖掉。

---

## 14. 验收清单

功能：

- [ ] 完整一局能从开场点到结语，三次 Outcome 的 `validation` 都是 `ACCEPTED`
- [ ] 中途刷新，能从 localStorage 恢复到正确的屏
- [ ] 关键决定回溯能正常开启，平行人生和对照都生成
- [ ] 知乎卡是真卡，带作者名和可点链接
- [ ] AI 降级时页面正常，并诚实标注
- [ ] 知乎失败时主线不受影响
- [ ] 旧存档（没有 `reflection`）能正常打开
- [ ] 重复快速点击不会产生重复状态

质量：

- [ ] `npm run lint` / `typecheck` / `test:run` / `build` 全过
- [ ] 手机上完整跑一局
- [ ] 浏览器控制台无报错
- [ ] 构建产物、接口响应、日志里都搜不到密钥

内容：

- [ ] 没有分数、等级、成就、经验条
- [ ] 没有"你赢了 / 你做对了"这类判断
- [ ] 知乎卡与 AI 补充卡视觉上能一眼区分

---

## 15. 参考文档

| 文件 | 内容 |
|---|---|
| `docs/GAME_DESIGN.md` | 完整玩法设计与十五屏原始设计稿 |
| `docs/CLAUDE_CODE_BACKEND_HANDOFF.md` | 后端设计（§1–5 有效） |
| `docs/BACKEND_HANDOFF_V2.md` | 后端设计（取代上文 §6/7/8/10） |
| `docs/DEPLOYMENT.md` | 部署、域名、环境变量、密钥轮换 |
| `docs/zhihu-skill-notes.md` | 知乎接口的使用说明 |
| `docs/design/reference-06-prototype.html` | 一份可以直接在浏览器打开的视觉原型 |

**看代码的顺序建议**：`src/contracts/game/` → `src/game-state/engine.ts` → `src/app/play/page.tsx`。看完这三处，整个数据流就清楚了。

---

## 16. 最后：三件最容易做错的事

1. **把 AI 返回的内容直接当成状态用，绕过状态机。** 会导致一致性校验失效，玩家的人生里出现互相矛盾的事实。
2. **把等待当成缺陷优化掉。** 五年加速和回溯是体验的一部分，删掉它们游戏就少了两次情绪节点。
3. **用评分、等级、成就来"增强游戏感"。** 这和作品的立意直接冲突——它想说的是没有哪一种人生能证明另一种是错的。
