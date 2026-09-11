# 后端接力说明 v2（48 小时冲刺版）

> 本文**取代** `docs/CLAUDE_CODE_BACKEND_HANDOFF.md` 中的第 6、7、8、10 节。
> 第 1～5 节（项目是什么、六类状态、已完成的第一批、代码地图、不做的功能）**继续有效，原样遵守**。
>
> 现在时间：2026-09-11。提交通道 09-13 10:00 开启，09-15 10:00 截止。
> **交付物是一个陌生人打开链接能玩完的网页，不是一套测试。**

---

## 0. 最高优先级：三条纪律

1. **竖切，不是分层。** 不允许出现「后端全做完再做前端」。每半天都必须有一个能在浏览器里点的东西。
2. **09-14 晚必须有已部署、能完整跑完一局的版本。** 之后只改视觉和文案，不碰引擎。
3. **不要再按「先写失败测试再最小实现」推进。** 第一批已有 140 个测试，够了。本次只给两处写测试：`normalize()` 和引擎的 Fact 校验。其余靠一个端到端 happy path 兜底。

---

## 1. 开工前 30 分钟：两个必须先跑的验证

这两件事的结果会改变实现方式，**在写任何代码之前完成**。

### 1.1 AI 接口连通性

```bash
curl -sS https://api.openai-next.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" | head -c 2000
```

必须确认并记录下来：

- 实际可用的 model 名称（写进 `OPENAI_MODEL` 环境变量，**不要在领域代码里硬编码**）
- 是否支持 `response_format: { type: "json_object" }`
- 一次典型结构化输出的真实耗时（决定后面的分档策略）

选两个模型：`OPENAI_MODEL_FAST`（情境、结果）和 `OPENAI_MODEL_DEEP`（五年模拟）。如果只有一个可用，就都用它。

### 1.2 知乎检索连通性

```bash
# 主路线：真实社区回答
curl -sS -G 'https://developer.zhihu.com/api/v1/content/zhihu_search' \
  --data-urlencode 'Query=毕业 回家 帮父母做生意' \
  -d 'Count=5' \
  -H "Authorization: Bearer $ZHIHU_ACCESS_SECRET" \
  -H "X-Request-Timestamp: $(date +%s)" | head -c 3000
```

看返回的 `Data.Items[]` 里 `Title` / `ContentText` / `Url` 是否真的相关。**这是知乎经验卡的主数据源。**

赛事接口 `api.zhihu.com/km-indep-home/hackathon/v2/story|knowledge/list` 作为**次要**来源，免鉴权，可以拉一次看看池子内容；如果里面有贴合毕业/职业主题的，再纳入检索范围，否则本次不用。

---

## 2. 知乎内容使用规则（硬约束，不可协商）

黑客松规则禁止用假数据冒充知乎真实经验。违反 = 初审出局。

| 来源标记 | 什么情况 | 卡片长什么样 |
|---|---|---|
| `ZHIHU_ADAPTED` | `zhihu_search` 真实返回，AI 把 `ContentText` 压缩成卡片 | 知乎样式，**必带作者名 + 可点击原文链接** |
| `AI_SUPPLEMENT` | 检索无结果或超时 | **视觉上完全不同的样式**，明确标注「参考思路 · 非知乎内容」 |

铁律：

- AI **不得**生成「某位知乎用户曾经……」这类内容。它只能对**本次真实取回的文本**做摘要和对比。
- 卡片上的「后来发生什么」只能来自检索文本实际支持的内容；文本没写，就留空，不补。
- 知乎内容**永远不能**写入玩家的 Facts。它是参考资料，不是玩家经历。
- 每个情境最多 2 张卡。检索失败不阻断主线，静默降级。
- 出站主机固定 `developer.zhihu.com` / `api.zhihu.com`，不接受模型给出的任何 URL。

---

## 3. AI 接口：`POST /api/v1/ai`

### 3.1 operation 砍到四个

| operation | 说明 | 模型档 |
|---|---|---|
| `UNDERSTAND_INTENT` | 玩家自由输入 → 结构化 Intent 候选 | FAST |
| `GENERATE_SITUATION` | Intent + Facts + chapter → 具体情境 + 两种可能 + 可选行动 | FAST |
| `RESOLVE_OUTCOME` | Situation + Decision → 结果叙述 + 候选 Facts | FAST |
| `SIMULATE_LIFE` | `mode: "FIVE_YEARS" \| "COUNTERFACTUAL"`，**共用一套实现和提示词骨架** | DEEP |

**删掉 `BUILD_EXPERIENCE_CARDS` 这个独立 operation。** 经验卡走 `/api/v1/zhihu/search` 内部直接调一次 FAST 模型做摘要即可，不单独建 operation。

### 3.2 两层 Schema（本次最关键的改动）

现有域 schema 全是 `.strict()` + `uuid` + `min(1)` + `z.literal("顺势发展的可能")`。**直接拿去校验 AI 输出，一定会频繁失败**，而失败就掉进保守模板，演示时看起来就像内容是写死的。

必须分两层：

```
AiDraft*Schema        宽松层：不 strict、无 id、无时间戳、数组不设 min、超长只截断不拒绝
      ↓
normalize()           服务端补 uuid / ISO 时间戳 / 固定标题 / 裁剪数组 / 填默认值
      ↓
现有域 Schema          严格层，最终闸门
```

具体规则：

- **模型永远不生成 UUID、不生成时间戳、不生成固定标题字符串。** 这些全部由 `normalize()` 注入。
- **引用既有 Fact 时用下标，不用 id。** 提示词里把 facts 编号列出：
  ```
  已发生的事实：
  [1] 完成第一条店铺视频
  [2] 第一次与家人协商固定拍摄时间
  [3] 家人愿意暂时配合，但仍未完全理解
  ```
  模型返回 `triggerFactIndexes: [1, 3]`，服务端映射回真 id。越界下标直接丢弃，不报错。
- `possibilities` 模型只给两段文案，`kind`（MOMENTUM / UNEXPECTED）、`id`、`title` 由服务端补齐。
- `availableActions` 模型只给 label 数组，id 服务端生成，末尾固定追加一条「我有自己的办法」（CUSTOM_PLACEHOLDER）。
- 数组不足下限时由 `normalize()` 补默认项，**不要因为少一项就整个拒绝**。

只有 `normalize()` 之后仍无法通过严格 schema，才算失败 → 一次重试 → 仍失败才用 fallback 模板。

### 3.3 延迟策略（10 分钟的游戏，必须做）

一局有 8 次 LLM 往返。不处理的话纯等待接近两分钟。

1. **预取**：玩家在「我理解的是这样，对吗？」这一屏确认时，后台**已经**在生成 DAY_8 情境。玩家点「对，就是这样」内容应当立即出现。同理，展示 Outcome 时预取下一章情境。
2. **分档**：情境/结果用 FAST，只有 `SIMULATE_LIFE` 用 DEEP。
3. **把「时间加速」那一屏变成真正的 loading**：年份向前推进的动画播放期间，后台正在跑 `SIMULATE_LIFE(FIVE_YEARS)`。这是设计和工程天然对齐的地方，务必利用。
4. 所有 AI 调用设 25s 超时。

### 3.4 安全边界（沿用原文，不放松）

- API Key 绝不进入 `NEXT_PUBLIC_*`、客户端 bundle、响应体、日志、测试快照。
- 错误响应不得包含 prompt、上游响应、堆栈、凭证。
- 限制输入长度与数组数量；玩家自由输入按不可信数据处理。
- AI 失败不得产生半条 Decision / Outcome / Fact。
- Provider 必须可注入模拟实现；默认测试不调用真实付费接口。

### 3.5 目录

```
src/ai/contracts.ts              AiDraft* 宽松 schema
src/ai/normalize.ts              ← 本次最重要的文件，必须有测试
src/ai/prompts.ts
src/ai/provider.ts               接口 + 可注入
src/ai/openai-compatible.ts      原生 fetch，不引 SDK
src/ai/fallbacks.ts
src/app/api/v1/ai/route.ts
src/zhihu/                       检索 + 排序 + 卡片转换
src/app/api/v1/zhihu/search/route.ts
```

---

## 4. 执行顺序（按这个走，不要按批次走）

### 阶段 A — 09-11 今晚：打通一条最细的链路

1. 跑完第 1 节的两个 curl，把 model 名和检索可用性确认下来
2. `AiDraft` + `normalize()` + provider + `/api/v1/ai`，**只实现 `UNDERSTAND_INTENT` 和 `GENERATE_SITUATION`**
3. 一个 `/play` 页面，**丑没关系**，能做到：输入打算 → 看到 AI 理解结果 → 看到 DAY_8 的两种可能

**验收：浏览器里真的能点，真的调到了真 AI。** 达不到这个就不要睡。

### 阶段 B — 09-12：闭合循环 + 长期模拟

1. `RESOLVE_OUTCOME` → Facts 写入引擎 → 三轮 DAY_8 / MONTH_7 / YEAR_4 循环跑通
2. 第三轮某个 Decision 标记为关键决定，存 Snapshot
3. `SIMULATE_LIFE` 两个 mode → 五年纪念页 + 平行人生 + 对照
4. 知乎经验卡接进 Situation（并行请求，不阻断）
5. 毕业去向静态 JSON：**必须有真实来源**（年份 / 样本量 / 统计范围 / 来源名 / 来源 URL / 口径）。找不到可靠一致的来源，就显示「暂无已验证数据」，**绝不填假百分比**

**验收：一局能从开场一路点到两段人生对照页。**

### 阶段 C — 09-13 上午：先交一版

1. 部署 Vercel，拿到公网地址，环境变量配好
2. **09-13 10:00 通道一开就提交**，哪怕界面还丑
3. 产品说明写完（见第 6 节要点）
4. 之后全部时间给前端视觉，提交内容随时可更新

---

## 5. 什么绝对不做

沿用原文第 5 节，另外补充：

- 不为这次冲刺再写大规模单元测试
- 不重构第一批的状态引擎（除非有测试证明它真的错了）
- 不做知乎 OAuth（Demo 不需要登录）
- 不引入新的大型依赖
- 不做多条平行人生、不做无限回溯

---

## 6. 产品说明必须讲清的六点

初审看这个。写的时候围绕：

1. 核心创作思路和目标用户
2. 用户如何完成核心体验
3. 整体技术方案 —— **重点写「AI 只产候选，确定性状态引擎才是权威」**：后续情境的 `triggerFactIds` 必须指向更早的 Fact，由代码强制校验。别人的因果是声称的，你的是强制的，这是本作品最硬的技术点
4. 用了哪些知乎开放能力（`zhihu_search` + 赛事内容接口）
5. 与知乎社区生态的契合点 —— 真实经验在具体决策时刻出现，不替玩家做决定
6. 对社区用户的实际价值

---

## 7. 凭证

```
OPENAI_API_KEY      仅服务端
OPENAI_BASE_URL     https://api.openai-next.com
OPENAI_MODEL_FAST
OPENAI_MODEL_DEEP
ZHIHU_ACCESS_SECRET 仅服务端
```

**AI Key 曾在聊天中出现，按已泄露处理：公开部署前轮换一次，新 Key 只配到 Vercel 环境变量。**

绝不写入代码、Markdown、测试、Git、终端回显、前端环境变量。

---

## 8. 可直接粘贴给 Claude Code 的启动指令

```text
你接手「知乎黑客松五年人生游戏」的后端冲刺。距离提交只剩约 48 小时，
交付物是一个陌生人打开链接能玩完的网页，不是一套测试。

先完整阅读 docs/BACKEND_HANDOFF_V2.md，它取代了旧 handoff 的第 6、7、8、10 节；
旧 handoff 的第 1～5 节仍然有效。再读 docs/GAME_DESIGN.md 和现有代码。

不要从 master 开始。第一批已完成代码在分支 codex/backend-foundation，
基线提交 a3c2d1a。不要重做第一批，不要恢复数据库、登录、分享或事件溯源。

按 V2 文档第 4 节的「阶段 A / B / C」推进，不要按旧的批次推进。
今晚必须达成阶段 A 验收：浏览器里能输入打算、看到 AI 理解、看到两种可能，
且调用的是真实 AI 接口。

三条硬约束：
1. AI 输出走两层 schema（宽松 draft → normalize 补 id/时间戳 → 严格域 schema）。
   模型永远不生成 UUID、时间戳、固定标题；引用 Fact 用下标不用 id。
2. 知乎经验卡只能来自 zhihu_search 真实返回，必带作者和原文链接。
   检索不到就显示样式完全不同、标注「非知乎内容」的 AI 卡。
   绝不生成虚构的知乎经历，绝不把知乎内容写进玩家 Facts。
3. 密钥不进客户端 bundle、响应、日志、测试快照。

先执行 V2 文档第 1 节的两个连通性 curl，把可用 model 名和知乎检索结果报告给我，
然后直接开始阶段 A。遇到真实阻塞就明确报告，不要伪造成功。
```
