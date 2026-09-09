# 知乎黑客松人生模拟游戏：后端架构设计

状态：已确认的设计规格，等待最终文档审阅后进入实施计划。

日期：2026-09-09

## 1. 背景与目标

产品是一款围绕毕业后五年生活展开的单人人生模拟游戏。玩家不是选择一个固定职业路线并直接观看结局，而是在连续的具体情境中作出决定，让结果成为后续人生的真实前提。

核心循环为：

```text
当前生活状态
→ 出现具体情境
→ 选择“顺势发展的可能”或“意料之外的变化”
→ Situation
→ 可选的知乎经验包
→ Decision
→ Outcome
→ 写入 Facts
→ 新的生活状态
```

本设计只覆盖前端之外的系统：领域模型、状态引擎、API、数据库、AI、知乎内容、匿名会话、保存分享、真实毕业数据、测试、部署和安全。视觉设计、动画、插画、排版和最终页面实现不在本规格内。

### 核心目标

- 支持任何现实、合法、围绕毕业后五年生活的自由输入。
- 让 Game State Engine 而不是 LLM 成为人生状态的权威控制者。
- 让每次新情况都能追溯到既有 Facts、玩家 Decision 或明确的外部条件。
- 完整支持五年推进、关键 Snapshot、单一决定回溯和平行人生对照。
- 知乎经验卡有证据、有来源，外部内容失败时不阻断游戏。
- 后端无需正式前端即可通过测试或命令行完整运行一局。
- 通过 GitHub 持续集成并部署到 Vercel。
- 整局体验不设置严格的 8–10 分钟硬限制；性能目标是避免长时间空白等待，并让玩家阅读、查看知乎经验和自由输入的节奏自然伸缩。

### 非目标

- 多人、排行榜、好友或复杂角色系统。
- 人生属性 RPG、固定职业路线、大量预制剧情或无限回溯。
- 复杂知乎 OAuth 或代表其他知乎用户读取个人数据。
- 让 AI 对人生进行评分、判断正确选择或自由改写既有事实。
- 在本阶段完成最终视觉前端。

## 2. 已选择的总体方案

采用模块化单体：

```text
Next.js Route Handlers
        ↓
Application Use Cases
        ↓
Pure TypeScript Game State Engine
        ↓
Ports
   ├─ Event Repository
   ├─ AI Provider
   ├─ Zhihu Provider
   ├─ Graduation Data Repository
   └─ Clock / ID / Randomness
        ↓
Adapters
   ├─ PostgreSQL / Supabase
   ├─ OpenAI-compatible AI endpoint
   ├─ Zhihu API
   └─ Vercel runtime
```

领域核心不得导入 Next.js、数据库 SDK、AI SDK 或知乎客户端。所有外部能力通过接口注入，因此单元测试可以使用内存仓库和可预测的模拟 Provider。

不采用：

- 纯 LLM 人生模拟：缺少事实完整性和确定性。
- 大型固定剧情树：无法满足自由输入目标。
- 微服务：增加部署、鉴权和一致性成本，不适合 MVP。
- 每个领域拆成相互独立的 Vercel Function 项目：共享事务和版本管理困难。

## 3. 领域状态模型

系统只保留六类顶层状态。

### Intent

表示玩家当前准备做什么，而不是固定路线。

```text
rawText
goals[]
priorities[]
constraints[]
currentActions[]
confirmedAt
```

玩家原始文本永久保留在私有游戏记录中。AI 结构化结果必须经玩家确认才成为有效 Intent。

### Facts

表示真正发生过的事情。Facts 通过事件追加产生，不原地覆盖。

```text
id
kind
statement
occurredAt
source
causedByDecisionIds[]
dependsOnFactIds[]
externalEventId?
supersedesFactId?
```

事实修正通过新 Fact 的 `supersedesFactId` 表达。当前有效 Facts 是事件历史的派生结果。

### Decision

```text
id
situationId
availableActions[]
selectedAction
customAction?
reason?
isKeyDecision
decidedAt
```

客户端不能提交完整 Decision 对象，只能提交当前 Situation 允许的 action ID 或受限的自由文本。

### Situation

```text
id
chapter
timeLabel
triggerFactIds[]
forbiddenFactKinds[]
tensions[]
possibilities[]
concreteContext
availableActions[]
externalConditions[]
```

每个 Situation 必须声明前置事实。缺少前置事实时不能进入权威状态。

### Outcome

```text
id
decisionId
narrative
gains[]
costs[]
addedFacts[]
unresolvedConsequences[]
validation
```

Outcome 只能提出新增或修正事实，不能提交完整新状态。状态引擎验证通过后才追加事件。

### Snapshot

```text
id
gameId
eventVersion
intent
activeFactIds[]
relationshipSummary
worldContext
keyDecisionId
createdAt
```

Snapshot 是可验证事件历史的投影缓存，不是第二个事实源。若 Snapshot 与事件回放不一致，以事件历史为准并重建 Snapshot。

## 4. 事件记录与状态转换

权威事件至少包括：

```text
GAME_CREATED
INTENT_CONFIRMED
SITUATION_CREATED
DECISION_MADE
OUTCOME_RESOLVED
FACTS_ADDED
YEARS_SIMULATED
SNAPSHOT_CREATED
LIFE_FORKED
SHARE_CREATED
```

每个游戏具有单调递增的 `eventVersion`。写入要求客户端提供期望版本；版本不匹配返回可恢复的冲突错误，防止重复点击或并发请求制造两段互相冲突的历史。

每个修改请求还携带幂等键。同一游戏、同一幂等键重复请求只返回第一次结果。

状态转换过程：

1. 验证会话所有权、阶段、版本和输入大小。
2. 加载事件并投影当前状态。
3. 调用领域规则判断动作是否合法。
4. 必要时调用外部 Provider 获取候选内容。
5. 对 Provider 输出执行结构与语义验证。
6. 在同一数据库事务中追加事件并更新投影缓存。
7. 返回当前状态、此次新增事件和下一步动作。

## 5. AI 编排

AI 采用按任务拆分的 Provider 接口，不创建万能 Prompt：

```text
parseIntent()
generateSituation()
resolveOutcome()
simulateYears()
simulateCounterfactual()
buildExperienceCards()
```

每项任务拥有独立：

- system prompt 和版本号；
- 输入与输出 Schema；
- 字节、Token 和列表数量上限；
- 语义验证规则；
- 超时与最多一次修复策略；
- 明确的保守降级结果；
- 可测试的模拟实现。

### AI 权限边界

- 玩家文本和知乎文本一律视为不可信数据。
- AI 不拥有数据库、网络工具或任意 URL 访问权限。
- AI 返回的是候选结构，不直接写入 Facts。
- Prompt 只传当前任务需要的最小状态摘要。
- AI 不能删除历史事件、修改事件 ID、指定服务器时间或绕过游戏阶段。
- 日志记录任务类型、模型、Prompt 版本、耗时、Token 用量和校验结果，不记录密钥、Authorization、完整 Prompt 或原始外部响应。

### 任务定义

- `parseIntent`：将玩家原文转换为 goals、priorities、constraints 和 currentActions。
- `generateSituation`：生成两种非好坏二分的可能、具体 Situation、Actions 和知乎检索意图。
- `resolveOutcome`：根据当前状态与选定 Action 生成收益、代价和候选 Facts。
- `simulateYears`：生成 Year 2、Year 4、Year 5 的有限状态变化与下一关键决定。
- `simulateCounterfactual`：基于 Snapshot 与替换后的单一 Decision 推演另一条路径。
- `buildExperienceCards`：只基于提供的知乎证据生成经验卡。

模型名称作为部署配置，由 AI Adapter 阶段根据服务端可用模型确定；领域层不依赖具体模型。

## 6. 语义与因果验证

JSON Schema 只验证结构，领域引擎还必须验证：

- 新事件引用的 Fact、Situation、Decision 均存在且属于当前游戏。
- 需要“已发布作品”的合作机会不能在相关 Fact 缺失时发生。
- 未出现学习、实践或工作事实时不能突然获得高级能力。
- 城市、家庭、工作、收入和关系变化必须有 Decision、Prior Fact 或 External Event 作为原因。
- Outcome 不能与玩家刚做出的 Decision 直接矛盾。
- 时间只能向前推进，回溯通过新分支完成，不能修改原分支。
- AI 不得生成保证成功、人生评分或道德裁决。

AI 输出不合法时只允许一次带明确错误原因的修复。再次失败则返回可恢复错误或使用不新增重大事实的保守降级结果。

性能策略优先减少玩家空等，而不是强行压缩整局时长。知乎检索与不互相依赖的 AI 工作可以并行；只生成玩家已经选择的路径，不为所有未选 Action 预生成 Outcome。调用应具有软超时、硬超时、取消、缓存和明确的降级状态。

## 7. 五年推进与平行人生

Snapshot 保存当时完整的 `WorldContext`：

```text
city
familyContext
economicStartingPoint
skills
relationships
externalEvents
worldSeed
```

反事实分支执行规则：

1. 从关键 Decision 之前的 Snapshot 创建新 branch。
2. 保留当时 Intent、Facts、关系和已经发生的外部事件。
3. 只替换玩家选中的一个 Decision。
4. 相同宏观外部事件继续存在，但它对新路径的影响可以因适用条件不同而变化。
5. 所有新变化标记原因为 `PLAYER_DECISION`、`PRIOR_FACT`、`EXTERNAL_EVENT` 或 `MIXED_CAUSE`。
6. 原分支保持不可修改。

最终对照由因果标记和事件图计算出：

- 因该决定逐渐发生变化的；
- 两段人生始终没有改变的；
- 无法归因于玩家选择的外部变化。

AI 可以润色说明，但不能自行决定分类。

## 8. 知乎证据层

知乎能力完全位于服务端。

```text
当前 Intent / Situation
→ 生成 2–4 条检索意图
→ 调用允许的知乎接口
→ 去重与相关性筛选
→ 提取有支持作用的证据
→ 生成最多两张经验卡
→ 证据一致性检查
```

经验卡必须保存：

```text
sourceTitle
sourceAuthor
sourceUrl
evidenceText
adaptedSummary
laterOutcome
similarities[]
differences[]
provenance
```

规则：

- 请求目的地主机固定，不跟随模型或内容提供的任意地址。
- work_id 必须来自列表结果并进行字符校验和 URL path 编码。
- 限制响应大小、超时、重定向和内容类型。
- 没有足够相关的证据时不显示经验卡。
- “后来发生什么”只能写证据实际支持的内容。
- 知乎内容不能直接成为玩家 Fact。
- `ZHIHU_ORIGINAL`、`ZHIHU_ADAPTED`、`AI_SUPPLEMENT`、`GAME_SIMULATION` 必须保留在内部数据中。
- 知乎故障、限流或额度耗尽不阻断游戏主循环。

## 9. 持久化设计

建议使用标准 PostgreSQL，并以 Supabase 作为初始托管选项。应用只通过服务端数据库连接访问数据；不要求前端直接使用 Supabase Data API 或 Realtime。

核心表：

- `game_sessions`：阶段、当前分支、事件版本、匿名所有权校验值、过期时间。
- `game_branches`：原始人生与反事实人生的分支关系。
- `game_events`：只追加的权威事件记录。
- `game_snapshots`：关键版本的状态投影缓存。
- `ai_generations`：任务元数据、结构化结果、耗时和验证状态。
- `source_documents`：知乎来源、证据与来源类型。
- `experience_cards`：经验卡与来源关系。
- `graduation_statistics`：年份、样本、范围、类别、比例和来源。
- `shared_lives`：公开只读且脱敏的人生对照投影。
- `idempotency_records`：修改请求的幂等结果。

数据库约束应覆盖游戏归属、事件版本唯一性、分支关系、幂等键唯一性和只读分享记录。

## 10. 匿名会话、保存与分享

创建游戏时生成：

- 可公开返回的高熵 `sessionId`；
- 只通过 Secure、HttpOnly、SameSite Cookie 保存的高熵 owner token。

数据库只保存 owner token 的安全校验值，不保存可直接使用的原 token。所有修改接口同时校验 sessionId、owner token 和期望 eventVersion。

分享功能创建独立 `shared_lives` 投影和高熵 share slug：

- 分享接口不能返回 owner token。
- 分享读取接口不能修改原游戏。
- 分享投影采用字段 allowlist，不包含完整 Prompt、内部 AI 输出、错误详情或未明确允许公开的玩家原始文本。
- 分享可撤销并支持独立过期策略。
- 默认不通过连续数字 ID 暴露游戏数量或顺序。

会话和分享的具体保留时长作为部署配置，不影响领域模型；默认必须存在有限过期时间。

## 11. HTTP API

版本化 API：

```text
POST /api/v1/games
POST /api/v1/games/{id}/intent
POST /api/v1/games/{id}/situations
POST /api/v1/games/{id}/decisions
POST /api/v1/games/{id}/simulate-years
POST /api/v1/games/{id}/fork
GET  /api/v1/games/{id}
POST /api/v1/games/{id}/share
GET  /api/v1/shared/{slug}
GET  /api/v1/graduation-statistics
GET  /api/v1/health
```

成功响应统一包含：

```json
{
  "data": {},
  "meta": {
    "requestId": "...",
    "eventVersion": 1,
    "nextStep": "SELECT_SITUATION"
  }
}
```

错误响应统一包含稳定错误码、用户可安全展示的消息、requestId 和是否可重试。不得返回 Provider 原始错误、数据库语句、堆栈、Prompt 或凭证信息。

主要错误类别：

- 请求或 Schema 不合法；
- 会话不存在或无权访问；
- 阶段/版本冲突；
- AI 输出无效或超时；
- 知乎暂时不可用；
- 配额、并发或频率受限；
- 内部状态完整性失败。

## 12. 毕业去向数据

毕业去向面板只读取经过人工确认并录入的数据，不在玩家请求期间抓取统计网页。

每组数据必须包含：

```text
year
population
sampleSize
scope
categories[]
sourceName
sourceUrl
publishedAt
notes
```

系统不能混合不同统计口径，也不能在来源缺失时展示模拟百分比。数据接口只提供事实和来源，不根据多数人的选择向玩家推荐人生路径。

最终来源选择在第九批独立完成，未确认前接口返回“暂无已验证数据”而不是占位比例。

## 13. 安全与滥用控制

安全要求来自设计期威胁模型，主要边界为浏览器→Vercel、Vercel→AI、Vercel→知乎、Vercel→PostgreSQL、GitHub→Vercel，以及 owner token→私有游戏和 share slug→公开投影。

必须实现：

- 服务端输入字节、Token、嵌套深度和列表长度限制。
- 按 IP、匿名会话、游戏和任务类型限流。
- AI 并发限制、缓存、熔断和供应商硬预算。
- CSRF/Origin 策略、Secure Cookie 和严格授权。
- 所有出站请求目的地 allowlist、超时和响应大小限制。
- 前端 bundle、错误响应和日志的 Secret 扫描。
- Preview、Production 使用不同 Secret，最小化 GitHub/Vercel 权限。
- 日志默认不记录玩家全文、owner token、share slug、完整 Prompt 和第三方原始响应。
- 分享内容与私有游戏采用不同的数据投影。

当前设计期威胁模型是风险规划依据，不是应用已经安全的证明。应用实现后必须重新进行安全扫描和配置核查。

## 14. 测试与质量门槛

### 单元测试

- 六类状态 Schema。
- 每个合法和非法状态转换。
- Fact 追加、修正和当前有效事实投影。
- 事件回放与 Snapshot 重建。
- 反事实分支不修改原分支。
- 因果分类和时间单调性。

### 合约测试

- AI Provider 每个任务的输入输出 Schema。
- 知乎 Provider 的固定主机、限制、错误映射和来源保留。
- PostgreSQL Repository 与内存 Repository 行为一致。
- HTTP API 成功与错误格式稳定。

### 集成测试

使用模拟 AI/知乎从创建游戏跑到人生对照，覆盖重试、重复请求、版本冲突、Provider 超时和降级。

### 真实 AI 评测

维护 30–50 条不含真实个人敏感信息的测试输入，覆盖就业、升学、考公、创业、家庭、创作、Gap、多目标、模糊、矛盾和边界输入。

每次 Prompt 或模型变更评估：

- Schema 首次通过率；
- 修复后通过率；
- 因果违规率；
- 历史事实篡改率；
- 不合理能力/收入/地点跳跃；
- 重复情境；
- 成功失败价值判断；
- 平均和尾部延迟；
- Token 与费用。

### 部署验收

- GitHub CI 全部通过才能部署。
- Preview 不使用 Production Secret。
- Vercel 环境变量、函数超时、区域与日志脱敏经过检查。
- 使用生产等价配置完成一局 API smoke test。
- 完成正式安全检查后才公开提交 Demo。

## 15. 十批实施顺序

每批最多两个紧密相关的小项目；高风险模块一次只做一个。

### 第一批：契约与骨架

1. 技术契约与状态 Schema。
2. Next.js/TypeScript 工程骨架、测试和 CI。

验收：Schema、事件、错误和 API 契约可编译；质量命令在空业务骨架上通过。

### 第二批：纯状态核心

3. Game State Engine。
4. 内存事件记录、回放和 Snapshot。

验收：不连接网络与数据库即可通过测试重建人生状态和关键 Snapshot。

### 第三批：数据库

5. PostgreSQL Schema、迁移、Repository、事务、版本和幂等。

验收：内存与 PostgreSQL Repository 通过同一套行为测试。

### 第四批：AI Adapter

6. AI Provider、任务 Prompt、Schema、语义验证、修复、超时和安全日志。

验收：模拟 Provider 测试全部通过，并完成受控的真实接口连通与结构化输出验证。

### 第五批：核心游戏循环

7. Intent → Situation → Decision → Outcome → Facts。

验收：多种自由输入可以从 API 完成至少两个有因果关系的情境循环。

### 第六批：长期模拟

8. 五年推进与平行人生。

验收：同一 Snapshot 替换一个 Decision 后生成独立分支，原分支不变，人生对照可解释。

### 第七批：知乎经验

9. 知乎检索、相关性过滤、证据卡与故障降级。

验收：经验卡字段均可追溯到来源；无证据时不生成；知乎故障时游戏继续。

### 第八批：匿名保存分享

10. owner token、Cookie、过期、只读 share projection 和撤销。

验收：跨游戏越权、猜测 ID、分享写入和私有字段泄露测试均被拒绝。

### 第九批：毕业数据

11. 来源研究、人工录入格式、校验和只读统计接口。

验收：每个比例都有一致口径、年份、样本和来源；没有虚假占位数据。

### 第十批：综合交付

12. 真实 AI 评测、综合测试、Vercel 部署、安全扫描和提交前检查。

验收：完整后端流程可通过 API 重复运行，质量门槛通过，部署配置与公开 Demo 经实际验证。

## 16. 开发工作方式

- 每个批次先写独立实施计划，再开始代码。
- 先写失败测试，再写最小实现。
- 每个阶段结束运行完整相关测试并进行代码审查。
- 可以并行做只读研究、测试设计和安全审查，但不并行修改同一核心模块。
- 没有通过当前阶段验收，不进入下一阶段。
- 前端开始前，后端必须可以通过自动化测试或命令行跑出两段人生和对照 JSON。
