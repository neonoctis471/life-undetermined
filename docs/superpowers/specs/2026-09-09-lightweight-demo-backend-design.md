# 知乎黑客松人生游戏：轻量 Demo 后端设计

状态：用户已确认，作为后续 Demo 实施的正式范围。

日期：2026-09-09

## 1. 决策背景

原后端方案按接近正式产品的标准设计，包含 PostgreSQL、完整事件溯源、匿名账户、跨设备保存和公开分享。它的可靠性较高，但实现量超过黑客松可玩 Demo 的必要范围。

本设计将目标调整为：任何人都能通过公开的 Vercel 页面完整体验一局游戏，同时把开发时间集中在核心玩法、AI 个性化、知乎经验和最终展示质量上。

本设计替代《2026-09-09-backend-architecture-design.md》中有关数据库、完整事件溯源、账户、跨设备保存及分享系统的要求；未被本设计明确替代的核心玩法原则继续有效。

## 2. 不变的产品原则

- 核心循环仍是 `Situation → Decision → Outcome → Facts → 新状态`。
- 玩家选择的是具体处境中的应对方式，不是固定职业路线。
- AI 生成候选内容，Game State Engine 决定哪些内容成为当前事实。
- 已经发生的 Facts 不能被后续 AI 随意改写。
- 新 Situation 必须能从当前 Intent、Facts、Decision 或明确的外部变化中解释。
- “顺势发展的可能”和“意料之外的变化”都可以同时包含收益与代价，不能伪装成好坏选项。
- 保留 Intent、Facts、Decision、Situation、Outcome、Snapshot 六类游戏状态。
- 保留 `ZHIHU_ORIGINAL`、`ZHIHU_ADAPTED`、`AI_SUPPLEMENT`、`GAME_SIMULATION` 四级来源标记。
- 不对玩家人生评分，不宣布哪条人生更正确。

## 3. Demo 成功标准

公开访问者无需注册，可以在一台设备的普通浏览器中：

1. 输入并确认毕业后的初步打算；
2. 完成三个主要 `Situation → Decision → Outcome → Facts` 循环；
3. 在每个主要 Situation 中按需查看最多两张知乎经验卡；
4. 看到五年推进、同学聚会和五年纪念页；
5. 回到一个关键 Decision，体验一条平行人生；
6. 看到两段人生的差异、共同点和无法归因于玩家的外部变化；
7. 刷新页面后继续当前进度，也可以主动重新开始。

体验时长不设严格的 8–10 分钟验收线。内容完整、节奏自然、AI 等待可理解比固定时长更重要。

## 4. 总体架构

采用“浏览器轻量状态引擎 + Vercel 服务端代理”的结构：

```text
Browser
  ├─ UI
  ├─ Lightweight Game State Engine
  └─ localStorage Save
          ↓ HTTPS
Next.js Route Handlers on Vercel
  ├─ /api/v1/ai
  ├─ /api/v1/zhihu/search
  └─ /api/v1/health
          ↓
  AI Provider / Zhihu API
```

浏览器保存当前一局的权威状态；服务端只负责保护密钥、调用第三方接口、验证输入输出并返回候选内容。服务端不保存玩家游戏进度。

## 5. 轻量 Game State

一局游戏只维护一个版本化的 `GameState` 对象。它是页面之间共享的“当前真相”，至少包含：

```text
schemaVersion
gameId
currentStage
intent
facts[]
situations[]
decisions[]
outcomes[]
keyDecisionSnapshot
fiveYearLife
parallelLife
comparison
updatedAt
```

状态更新遵守单向流程：

```text
玩家操作
→ 验证当前阶段与输入
→ 生成新的 GameState
→ 保存到 localStorage
→ 下一屏读取新状态
```

现有第一批已经完成的六类 Zod Schema 和 API 契约继续复用，但实现从“数据库事件历史的投影”简化为“浏览器中的当前状态快照”。

### localStorage 规则

- 每次确认 Intent、选择 Situation、提交 Decision、接受 Outcome、完成五年推进或生成平行人生后保存。
- 页面加载时校验 `schemaVersion` 和结构；合法则恢复，不合法则安全地开始新游戏。
- “重新开始”只删除本游戏使用的固定 key，不清理网站其他数据。
- 不保存 API Key、知乎接口凭据、服务端错误详情或第三方原始响应。
- 玩家原始打算可以保存在本机，用于五年纪念页原样展示。
- localStorage 不是账户或云存档：清除浏览器数据、使用无痕窗口或更换设备后不能恢复。

## 6. AI 方案

采用“固定游戏结构 + AI 个性化”的混合方案。

固定结构负责：章节顺序、三次核心循环、可选操作数量、状态转换、关键 Decision、回溯规则和最终对照分类。

AI 负责：

- 理解并结构化自由输入；
- 根据当前状态生成两种可能和具体 Situation；
- 生成可选择的 Actions；
- 根据玩家 Decision 生成 Outcome 与候选 Facts；
- 生成有限的五年变化；
- 基于一个 Snapshot 和替换后的 Decision 生成平行人生；
- 将已经取得的知乎证据整理为经验卡。

### 单一 AI 接口

使用一个服务端入口：

```text
POST /api/v1/ai
```

请求通过 `operation` 区分任务：

```text
UNDERSTAND_INTENT
GENERATE_SITUATION
RESOLVE_OUTCOME
SIMULATE_FIVE_YEARS
SIMULATE_COUNTERFACTUAL
BUILD_EXPERIENCE_CARDS
```

每个 operation 仍有独立输入/输出 Schema、Prompt 和验证规则。统一入口只是减少 Route 和部署复杂度，不代表使用一个万能 Prompt。

### AI 安全边界

- API Key 只存在于 Vercel 服务端环境变量中，绝不进入浏览器 bundle、localStorage、Git 或响应。
- 玩家输入、知乎内容和模型输出均视为不可信数据。
- 每次请求限制文本长度、列表数量、响应大小和最长执行时间。
- 模型只能返回当前 operation 允许的 JSON 字段。
- Game State Engine 在接受候选 Facts 前检查引用、时间和基础因果规则。
- 日志不记录 API Key、完整玩家原文、完整 Prompt 或第三方原始响应。

### 失败回退

AI 调用失败、超时或输出不合法时：

1. 最多进行一次受控重试或结构修复；
2. 仍失败则返回稳定错误码；
3. 前端保留当前 GameState，不写入半成品 Facts；
4. 玩家可以点击重试；必要时使用与当前章节匹配的保守模板继续游戏。

模板只提供结构和低风险过渡，不替代正常 AI 个性化。

## 7. 知乎检索与经验卡

保留正常调用，不把知乎体验缩减为只调用一次。

- Intent 确认后可预取第一组相关经验。
- 每个主要 Situation 都可以根据当时的 Intent、Facts 和冲突重新检索。
- Demo 目标为三个主要情境，每个情境最多展示两张卡。
- 没有足够相关证据时不显示卡片，也不让 AI 编造经验。
- 知乎失败不能阻断主游戏；玩家仍可直接作出 Decision。

服务端接口为：

```text
POST /api/v1/zhihu/search
```

服务端固定允许访问的知乎接口主机，对检索词、`work_id`、响应大小、重定向、超时和内容类型进行限制。经验卡保留标题、作者、原链接、证据摘要、相似点、不同点和来源标记。“后来发生什么”只能写来源实际支持的内容。

## 8. 五年推进、Snapshot 与平行人生

Demo 只支持一条原人生和一条平行人生。

- 三次核心循环中的一个 Decision 被标记为关键决定。
- 在该决定发生前保存一个 `keyDecisionSnapshot`。
- 五年推进只生成有限节点，例如一年、三年、五年和当前生活状态，不扩写成长篇小说。
- 回溯时保留 Snapshot 中的 Intent、Facts、家庭、地点、关系、能力和当时已知外部条件。
- 只替换一个 Decision，然后生成一个月、一年、三年和五年后的简短变化。
- 原人生状态不被覆盖。

最终对照固定分为：

- 因该决定逐渐发生变化的；
- 两段人生一直没有改变的；
- 无法归因于玩家选择的外部变化。

AI 可以生成描述候选，程序根据两条路径的结构化数据校验和整理分类。

## 9. 毕业去向数据

毕业去向数据不建设数据库接口。采用仓库内经过人工确认的只读 JSON，由页面或只读模块加载。

每一组数据必须包含年份、统计人群、样本量、统计范围、分类比例、来源名称、来源链接、发布时间和口径说明。没有可靠来源时显示“暂无已验证数据”，绝不填虚假百分比，也不依据多数比例推荐玩家选择。

## 10. 明确删除的功能

本 Demo 不实现：

- PostgreSQL 或 Supabase 游戏数据库；
- 云端游戏存档和跨设备恢复；
- 登录、注册、匿名账户和 owner token；
- 分享链接、share slug、分享表、自动过期和撤销；
- 完整事件溯源、任意事件回放和通用 Snapshot 管理器；
- 多条平行分支、无限回溯和多人功能；
- 管理后台、运营统计和复杂知乎 OAuth；
- 毕业数据抓取任务或数据库接口。

公开 Vercel 地址只是让所有人进入游戏，不等于为每局游戏创建独立分享链接。

## 11. 错误处理

服务端统一响应成功数据或稳定错误对象，错误对象包含 `code`、可安全展示的 `message`、`requestId` 和 `retryable`，但不包含堆栈、上游原始响应、Prompt 或凭据。

前端遵守以下原则：

- 网络失败不清空当前进度；
- 重复点击不会追加重复 Decision 或 Outcome；
- AI 或知乎加载状态可以分别展示；
- 知乎失败时游戏继续；
- AI 关键步骤失败时停留在当前步骤并允许重试；
- 本地存档损坏时隔离损坏数据并创建新局，不能让页面永久白屏。

## 12. 测试与验收

### 单元测试

- GameState 创建、合法转换和非法阶段拒绝；
- Outcome 写入 Facts，后续 Situation 读取既有 Facts；
- Snapshot 只替换一个 Decision，原人生保持不变；
- localStorage 保存、恢复、版本不兼容和重新开始；
- 六类 Schema 与 API operation 输入输出。

### 接口测试

- AI 各 operation 的请求验证、结构化响应、超时、重试和错误脱敏；
- 知乎固定主机、输入限制、来源保留、无证据和故障降级；
- API Key 不出现在客户端产物、响应、日志或测试快照中。

### 完整流程测试

使用模拟 AI 和模拟知乎从 Intent 跑完三个情境、五年推进、Snapshot、平行人生和最终对照。随后使用受控的真实接口完成至少一局 smoke test。

### 部署验收

- GitHub CI 的 lint、typecheck、test 和 build 全部通过；
- Vercel Preview 与 Production 环境变量正确配置；
- 公开页面可在无登录状态下开始、刷新恢复、完成和重新开始；
- 浏览器网络响应和构建产物中没有第三方密钥；
- 对公开 Demo 完成一次安全检查。

## 13. 后续四批实施顺序

### 第一批：轻量 GameState 与 localStorage

实现单一 GameState、阶段转换、保存、恢复和重新开始。它是后续 AI、知乎与完整循环共同依赖的基础。

### 第二批：AI 单接口与失败回退

实现 operation 路由、Provider Adapter、结构校验、超时、重试、服务端密钥保护和保守模板。

### 第三批：知乎检索与经验卡

实现知乎服务端调用、证据筛选、来源保留、经验卡转换及非阻断降级。

### 第四批：完整游戏循环与交付

串联三个主要情境、五年推进、一个 Snapshot、一条平行人生、最终对照、毕业数据静态 JSON，并完成综合测试、Vercel 部署与安全验收。

前端视觉设计可以独立推进，但不得绕过 GameState 和服务端密钥边界。

## 14. 与已完成第一批的关系

已完成的 Next.js/TypeScript 工程骨架、测试工具、CI、健康检查、API 响应格式和六类状态 Schema 保留复用。

其中为完整事件溯源准备的事件契约可以保留为领域记录类型或暂不使用，但不继续实现数据库事件仓库、事务版本、幂等记录表和事件重建系统。后续计划以本设计的四批顺序为准，不再继续旧十批方案中的数据库与分享批次。
