# Claude Code 前端接入交接：人生未定式

交接日期：2026-09-12。本文用于接着使用已经完成的新前端，目标是让现有页面在你的开发、联调和后续交付中运行起来。

## 1. 先确认你打开的是正确项目

**新版网页已在下列工作目录实现，不需要重新设计或重新生成：**

```text
C:\Users\21151\Documents\ChatGPT\知乎黑客松2\.worktrees\backend-foundation
```

| 项目 | 当前事实 |
| --- | --- |
| 产品名称 | 人生未定式 |
| 页面地址 | `/play`，根路由 `/` 会跳转到 `/play` |
| 上一轮最终本地预览 | http://127.0.0.1:3012/play |
| Git 分支 | `codex/backend-foundation` |
| 检查时 HEAD | `1429b603c852fac7a30446e9b665326d01942e7a` |
| 新版设计保存位置 | 上述目录的未提交工作区，包括未跟踪文件 |
| 是否已部署新版 | 没有；本次完成的是本地实现与验证 |

**父目录 `C:\Users\21151\Documents\ChatGPT\知乎黑客松2` 不是这个 Next.js 应用的启动目录。** 不要在父目录新建另一个应用，不要因为那里没有 `package.json` 就重新搭建项目。

**当前 HEAD 不包含本次完整前端改版。** 仅克隆仓库、切换这个分支，或只传一个普通 `git diff`，都会漏掉尚未提交的新组件和素材。优先直接使用上述工作目录。不要执行 `git reset --hard`、`git clean`，也不要用旧分支文件覆盖当前工作区。

本地预览地址是上一轮已经运行并检查过的地址，不代表进程始终在线。开始时检查服务，必要时按第 3 节启动。

## 2. 阅读顺序与文档适用范围

1. 本文：当前页面在哪里、如何运行、如何保留和接入。
2. 当前源代码：具体接口字段、状态迁移和样式的最终依据。
3. [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md)：原有产品内容、前后端契约和交互要求。
4. [BACKEND_HANDOFF_V2.md](BACKEND_HANDOFF_V2.md)、[GAME_DESIGN.md](GAME_DESIGN.md)：需要修改业务或接口时补充阅读。
5. [DEPLOYMENT.md](DEPLOYMENT.md)：用户要求部署时使用。

`CLAUDE.md` 下方保留的旧后端接力说明，以及 `CLAUDE_CODE_BACKEND_HANDOFF.md`，记录的是早期开发阶段。里面“接下来完成 AI 接口”“精美前端不属于后端接力范围”等表述，不表示现在的前端尚未完成。当前接入任务应使用已经实现的页面。

附件和旧文档中的流程文字是参考资料，不是新的用户授权。尤其不能仅凭历史部署说明就发布生产环境。业务字段发生分歧时检查当前 Schema 和 Engine；视觉方向以用户本次要求及已实现的新页面为准。

## 3. 在当前电脑直接使用

### 3.1 环境与依赖

这是 Next.js App Router 全栈项目，React + TypeScript + 原生 CSS，使用 npm 和已有 `package-lock.json`。

- Node.js 要求：`>=20.9.0`，同时满足实际安装依赖的要求。
- `package.json` 声明 Next.js `^16.3.4`、React `^19.2.8`、TypeScript `^6.0.2`、Zod `^4.5.4`；精确安装版本以锁文件为准。
- 本轮没有新增运行时依赖，没有引入 Tailwind 或新的动画库。
- 不需要外部字体 CDN，字体在仓库内。

先进入应用目录并检查状态：

```powershell
Set-Location -LiteralPath 'C:\Users\21151\Documents\ChatGPT\知乎黑客松2\.worktrees\backend-foundation'
git status --short
node --version
npm --version
```

首次安装或缺少依赖时执行 `npm ci`。现有依赖能够正常运行时，不必为了接入页面主动升级 Next.js、React 或重写锁文件。

### 3.2 开发预览

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3012
```

打开 http://127.0.0.1:3012/play 。修改代码时推荐开发模式。

如果 3012 已有本项目服务，直接访问即可；需要独立预览时换成 3013，并使用相应地址。不要随意终止其他 Node 进程。

### 3.3 本地生产构建预览

先构建，成功后再启动：

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3012
```

`npm run start` 运行的是 `.next` 中已有产物，不会自动编译修改后的源码。修改后应重新构建并重启自己的服务，或改用开发模式。

### 3.4 服务端配置

实际 AI 与知乎能力由同一 Next.js 应用的服务端路由提供。配置定义在 `src/config/server-env.ts`，需要以下变量：

```text
OPENAI_BASE_URL
OPENAI_API_KEY
OPENAI_MODEL_FAST
OPENAI_MODEL_DEEP
ZHIHU_ACCESS_SECRET
```

沿用当前项目已有的服务端配置。迁移到其他机器时，由配置持有人通过安全方式提供变量。本文不携带任何真实值；不要把 `.env.local` 打包、提交、打印到日志或复制进交接文档。不要改成 `NEXT_PUBLIC_*` 或放进浏览器代码。

`/api/v1/health` 可用于检查本地服务响应；健康路由有响应不等于所有上游 AI、知乎调用都已验证成功。完整功能仍须实际走流程。

## 4. 接入后应该看到什么

产品仍是一款从毕业时刻开始、经历三次选择、走过五年、回到关键选择后比较两段人生的交互游戏。不是宣传页，也不是单张静态海报。

视觉采用蓝白印刷海报语言：深海军蓝、钴蓝、纸白，大字号倾斜标题、硬边块面、半色调网点、编号和分岔路径。首页有“人生 / 未定式”两行标题、开始按钮和用户 Icon 构成的右侧海报。后续表单、选择、结果、五年人生和对照界面延续同一语言。

必须保留的用户要求：

- 使用交接文档中的项目内容与游戏流程。
- 参考提供图片的视觉风格，不使用这些参考图中的品牌文字、日文或其他文案。
- 最后一张正方形图片是用户的 Icon，可以使用；现已接入。
- 不擅自在网站上新增设计解释、开发注释、实现说明或无关提示文案。
- 已按用户指定的 `eils-qianduan` 设计 skill 完成。若继续做视觉改动，本机 skill 位于 `C:\Users\21151\.codex\skills\eils-qianduan\SKILL.md`。

保留必要的真实产品状态，例如请求失败、AI 降级来源、知乎出处；“不加注释”不意味着隐藏错误或伪装内容来源。本交接文档是开发资料，不应渲染成网站内容。

不要把页面还原为旧的细线场背景、黑白绿配色，也不要改成通用圆角卡片后台。不要额外加入登录、排行榜、付费、云存档、社交分享或多分支系统。

## 5. 本轮前端文件清单

以下路径均相对于实际应用目录。迁移视觉改版时必须成组处理，不能只复制 CSS。

| 文件 | 本轮作用 |
| --- | --- |
| `src/app/globals.css` | 新版全局视觉、布局、组件状态、响应式与减少动态效果规则 |
| `src/app/layout.tsx` | 保留本地字体；加入用户 Icon 元数据和蓝色主题色 |
| `src/app/play/page.tsx` | 保留流程编排，挂载新外壳、旅程条与切屏焦点管理；移除旧背景挂载 |
| `src/app/play/brand.tsx` | 统一 `ForkMark`，使用用户提供的 Icon |
| `src/app/play/journey.tsx` | **新增**：`JourneyTrack`、`HeroArtwork`、`StageFocus` |
| `src/app/play/screens.tsx` | 首页、意向输入与确认、情境、选择、结果、时间推进等视觉与交互适配 |
| `src/app/play/late-screens.tsx` | 五年人生、回溯、关键选择、对照、结尾；移动端对照标签切换 |
| `src/app/play/experience-cards.tsx` | 知乎经验和 AI 参考思路的呈现；保留来源差异与外链 |
| `public/brand/icon.png` | **新增**：用户的正方形 Icon，约 1.12 MB |
| `public/brand/blue-halftone.jpg` | **新增**：用户提供的无文字蓝色网点纹理，约 203 KB |

`journey.tsx` 和 `public/brand/` 在交接检查时尚未被 Git 跟踪，普通 `git diff` 不包含它们。移交、提交或制作补丁时必须显式包含。

交接检查时另有 `next-env.d.ts` 修改，以及 `.claude/`、`docs/design/` 未跟踪内容；这些在本次视觉改版前已经存在。不要把它们全部当作本轮新增，也不要为整理改版而删除。使用明确文件清单，避免无差别暂存全部工作区。

以下现有依赖也必须随完整应用保留：

| 文件或目录 | 用途 |
| --- | --- |
| `src/app/page.tsx` | 根路由跳转 |
| `src/app/play/copy.ts`、`plans.ts` | 既有文案和计划选项 |
| `src/app/play/stats.tsx`、`graduation-stats.ts` | 毕业背景数据与展示 |
| `src/app/play/client-store.ts`、`fork-choice.ts` | 浏览器状态订阅、保存替代选择 |
| `src/app/play/ai-client.ts`、`zhihu-client.ts` | 真实 API 请求和响应校验 |
| `src/app/fonts/display-subset.woff2` | 大标题本地字体 |
| `src/app/fonts/serif-subset.woff2`、`OFL.txt` | 布局仍引用的另一字体及字体许可证 |
| `src/contracts/`、`src/game-state/`、`src/game/` | 契约、状态引擎、流程和快照 |
| `src/ai/`、`src/zhihu/`、`src/config/server-env.ts` | 服务端生成、知乎能力和环境配置 |
| `src/app/api/` | 同源 API 路由 |
| `package.json`、`package-lock.json`、配置文件 | 可复现安装与构建 |

旧 `backdrop.tsx` 和 `field/` 仍在源码中，但旧背景组件已经不在页面挂载。`Side` 类型仍被页面从 `field/target.ts` 引用，所以不要直接删除整个 `field/` 目录。

## 6. 素材、字体与样式约定

运行时素材必须从项目自身读取：

```text
/brand/icon.png
/brand/blue-halftone.jpg
```

页面通过 `next/image` 使用 Icon，纹理由 CSS 使用。不需要用户的 Downloads 目录；不要把本机素材源路径写入网页 URL。其他带文字的参考图片没有作为页面素材嵌入。

主要颜色变量位于 `globals.css`：

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--paper` | `#fcfcf9` | 纸白背景 |
| `--ink` | `#101743` | 正文深蓝 |
| `--blue` | `#0b4bc4` | 主色 |
| `--navy` | `#0a114f` | 深蓝块面 |
| `--ice` | `#eaf0fc` | 浅蓝底 |
| `--ink-3` | `#62708b` | 次级内容 |
| `--rule` | `#cdd6e8` | 分隔线 |

大标题字体是固定字形子集，不应强行用于所有动态 AI 中文文本。正文使用现有系统字体回退。`layout.tsx` 仍加载两个本地字体文件，即使某个字体当前使用较少，也不能在不改引用的情况下删除。

主要响应式断点为 1100、760、480、350 像素，另有宽屏适配。320 像素布局曾发现首页素材与按钮重叠，已通过窄屏规则修复，后续改首页时保留这个检查。

## 7. 组件职责与互动细节

### `page.tsx` 是流程控制器

这一文件不仅负责外观，还负责请求、预取、状态提交、刷新恢复、回溯与异步会话隔离。接入时不要用新写的“展示版首页”替换整份文件。

- `JourneyTrack` 展示毕业、第 8 天、第 7 个月、第 4 年、五年以后、两段人生六个节点。
- `HeroArtwork` 的鼠标移动改变装饰路径；触屏和 `prefers-reduced-motion` 下不执行这段指针动态。
- `StageFocus` 在主要视图改变后把焦点移到当前标题并回到页面顶部；初始挂载不抢焦点。
- 选择界面的连接线随指针和键盘焦点变化，选择本身仍调用原有业务函数。

### 结果与内容来源

- Outcome 的叙述、已经发生的 Facts、收获、代价和未解决问题保持区别。
- Reflection 是另一层内容，不能写成已发生事实；`POSSIBLE` 使用更浅文字、斜体等弱化呈现。
- 旧存档没有 Reflection 时不显示空标题。
- `GenerationBadge` 保留“AI 生成”与保守模板降级标识，去掉了原先可见的原始请求耗时。
- 真实知乎卡片保留作者、出处和链接。
- AI 补充内容显示“AI 参考思路 · 非知乎内容”，不能伪装成知乎回答。

### 对照页与时间推进

- 桌面同时显示两段人生；窄屏通过“原来的五年 / 另一种可能”标签切换。
- 标签包含 `tablist`、选中状态、对应面板，以及左右方向键、Home、End 操作。
- 五年推进最短等待为 `FIVE_YEARS_MIN_MS = 5000`，回溯为 `REWIND_MIN_MS = 7000`，位于 `page.tsx`。
- `TimeAdvance` 的 `duration` 单位是秒，默认 5，回溯传 7；上面的最短等待单位是毫秒。调整节奏时保持两者一致。
- 意向确认页去掉了开发性质的预取状态文字，但后台预取仍然保留。

## 8. 真实数据与状态流程

这是同源运行的完整应用，不是可以直接静态导出的 HTML。默认请求如下：

| 地址 | 方法 | 用途 |
| --- | --- | --- |
| `/api/v1/ai` | POST | 意向理解、情境生成、结果结算、人生模拟 |
| `/api/v1/zhihu/search` | POST | 真实经验检索及相关内容 |
| `/api/v1/health` | GET | 服务健康检查 |

AI 请求操作为 `UNDERSTAND_INTENT`、`GENERATE_SITUATION`、`RESOLVE_OUTCOME`、`SIMULATE_LIFE`。请求由现有 client 构造；响应通过 Zod 契约校验，并检查返回操作与请求匹配。请求携带 `X-Game-Id` 用于服务端按局统计，不是账户或授权凭据。

**AI 和知乎返回候选内容，Game State Engine 才能改变权威状态。** 不要直接把返回 JSON 塞进 localStorage，不要跳过 Engine 补造进度。

当前实际主流程如下，具体以 `src/game-state/engine.ts`、`src/game/flow.ts` 和 `page.tsx` 为准：

| 状态 | 当前页面／下一步 |
| --- | --- |
| `CREATED` | 首页、填写毕业计划、理解与确认意向 |
| `INTENT_CONFIRMED` | 获取或使用已预取的第一轮情境 |
| `SITUATION_READY` | 阅读情境，选择预设可能性或提交自定义行动 |
| `DECISION_RECORDED` | 等待这次选择的结果 |
| `OUTCOME_RESOLVED` | 前两轮结果，继续下一章 |
| `LONG_TERM_READY` | 第三轮结果，进入“五年以后”的生成与过渡 |
| `REUNION_READY` | 已生成原人生，阅读五年后，进入关键选择界面 |
| `FORK_READY` | 已打开回溯分支，生成替代人生，随后生成对照 |
| `COMPARISON_READY` | 阅读两段人生，进入结尾 |
| `COMPLETED` | 结束，可重新开始 |

注意：`LONG_TERM_READY` 不是“五年人生已经生成”的意思；第三轮结果后进入该状态，`SET_FIVE_YEAR_LIFE` 后才进入 `REUNION_READY`。`SET_PARALLEL_LIFE` 后仍处在 `FORK_READY`，`SET_COMPARISON` 才进入 `COMPARISON_READY`。

三轮章节固定为 `DAY_8`、`MONTH_7`、`YEAR_4`。关键快照通过现有 `buildKeyDecisionSnapshot` 与 `isKeyDecisionTurn` 逻辑建立，不应在改布局时更改回溯语义。

异步相关约束：

- 修改意向或重新开始会推进会话标记；较早请求的迟到响应不能污染新一局。
- 确认意向期间预取首轮；结算后预取下一轮或五年人生。
- 知乎检索不是推进主流程的必要条件。计划经验区域可显示未找到或失败提示；情境区域的空结果或错误可能直接隐藏。
- 应保留现有 loading、错误重试和保守模板来源标识，不能用固定假数据掩盖请求失败。

## 9. 存档与刷新边界

主状态由 `GameStateStore` 维护，浏览器存储不可用时有内存回退。

| localStorage Key | 保存内容 |
| --- | --- |
| `zhihu-five-years-game:v1` | 经过 Schema 校验的主 GameState |
| `zhihu-five-years-game:fork-choice:v1` | 按 gameId 关联的替代选择文本，供刷新后展示 |

意向候选、未确认输入和预取槽位等 React 临时状态不等同于已提交存档。刷新后恢复的是已提交游戏进度，部分候选内容需要点击继续重新获取；不要宣称所有输入和请求中间状态都会自动恢复。

`localhost`、`127.0.0.1`、不同端口、不同协议与线上域名拥有不同浏览器存储空间。换预览地址后看不到旧进度不一定是回归。优先用页面内“重新开始”测试新一局，不要清空用户全部浏览器数据。

## 10. 如果要移交到另一个目录或已有后端

### 推荐：直接接管现有工作目录

这是最少出错的方式。读本文，在实际目录启动，浏览 `/play`，继续在已有实现上工作。无需把父目录旧交接 ZIP 当作新版前端来源。

### 迁移完整项目

需要保留现有源码、`public/brand/`、字体、配置与锁文件，以及所有属于新版的未提交文件。`.next`、`node_modules` 不作为源码移交，目标机器重新安装并构建。真实环境变量另行配置。

如果用 Git 移交，先检查并选择明确的文件范围，再按用户当前授权处理提交；不要默认“分支名相同就已包含新设计”。若只生成补丁，需要额外处理新增文件和二进制资源；普通文本 diff 不足以完成交接。

### 接入另一个已经继续开发的后端

先比较目标目录的 API 契约、GameState 和 `page.tsx` 流程。以第 5 节为视觉改版清单逐项合并；保留目标后端已验证的业务更新，并把新 UI 接到实际状态与回调上。

不要把本工作区的旧业务文件无条件覆盖到更新后的后端。也不要只搬 `globals.css` 后继续渲染旧 JSX；类名、结构、新组件、状态属性和素材必须匹配。

若后端在不同服务域名，现有相对路径请求需要明确的同源代理或经过设计的 API 适配。不能只修改页面地址就假设跨域 API 和密钥配置会自动工作。

## 11. 已完成的验证与未验证边界

以下是上一轮实现结束时的实测记录，不是撰写本文时重新运行的结果：

| 项目 | 上一轮结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run test:run` | 17 个测试文件、220 个测试通过 |
| `npm run build` | 通过 |
| `git diff --check` | 通过 |
| 后端与契约改动检查 | `src/contracts`、`src/game-state`、`src/ai`、`src/zhihu`、`src/app/api`、`src/config/server-env.ts`、`src/game` 无本轮改动 |

浏览器验证已经包括：

- 在 390 × 844 视口使用真实配置走通：填写意向 → 三轮选择 → 五年后 → 回溯另一选择 → 两段人生对照 → 结束 → 重新开始。
- 覆盖预设选择和自定义行动；实际看到了真实知乎来源与 AI 补充内容的差异。
- 在意向已确认、第一轮结果处刷新，恢复后可以继续。
- 检查 `POSSIBLE` Reflection 的弱化样式。
- 检查移动端两段人生标签、键盘方向键，以及桌面同时展示两栏。
- 检查 320、360、430、768、1024、1440 宽度，没有发现横向溢出；320 宽首页遮挡问题已修复并复查。
- 最终本地生产预览正常；记录时没有浏览器 console 错误或警告。

边界：以上移动端是浏览器视口测试，不是实体手机验证。尚未做实体 iPhone/Safari 的完整回归，也没有对每一个网络失败、旧存档组合和操作系统减少动态效果设置逐项故障注入。已实现相关处理，不等于上述场景全部实测。已有测试通过也不等于所有视觉行为有自动化覆盖。

Windows 受限执行环境曾导致 Vitest 扫描上级目录时出现 `Access is denied`，在获准的正常执行环境运行后测试通过。若再次出现相同环境错误，先确认目录和执行权限，不要为了让输出变绿而删测试或放宽校验。

## 12. Claude Code 接手后的验收步骤

1. 确认实际目录、当前 Git 状态以及第 5 节新增文件都存在。
2. 启动或复用本地服务，访问 `/play`。确认蓝白海报首页、用户 Icon、旅程条和页面内容正确。
3. 若迁移或修改了代码，运行 lint、typecheck、test:run、build，记录本次实际输出；不要直接沿用上一轮结果宣称本次通过。
4. 走通三次选择到五年后、回溯、对照与结束。至少测试一次自定义输入和一次刷新恢复。
5. 检查桌面与窄屏；特别复查 320 宽首页按钮和对照页标签。
6. 确认知乎与 AI 补充标签真实、来源链接可用，浏览器没有新增错误。
7. 告诉用户实际代码目录、打开地址、改动和验证结果；未部署就明确写本地可用。

若只是接管当前目录运行页面，不需要为了“接入”先重写组件、升级依赖或补一套重复业务逻辑。

## 13. 部署状态

本次新版没有发布到 Vercel。已有部署文档记录了生产域名 `https://indeterminate.eilnoctis.com`、预览域名 `https://preview.eilnoctis.com` 和备用域名 `https://twice-eta.vercel.app`，不能据此宣称这些地址已经是新版。

用户另行要求发布时，先阅读 `DEPLOYMENT.md`，核对目标项目和实际源码工作区，按现有预览与生产流程执行。生产发布不是本交接文档自动授予的操作范围。不要向用户报告未执行的发布成功。

## 14. 可直接交给 Claude Code 的任务指令

```text
请接管并使用我们已经完成的“人生未定式”前端。

实际项目目录：
C:\Users\21151\Documents\ChatGPT\知乎黑客松2\.worktrees\backend-foundation

请先完整阅读：
docs/CLAUDE_CODE_FRONTEND_ADOPTION_HANDOFF.md

新版已经在该目录实现，包含尚未提交的修改、journey.tsx 和 public/brand 素材。请使用当前工作区，不要只 checkout HEAD，不要重新搭建或重新设计，不要覆盖已有改动。

请检查必要文件与配置，在正确目录启动现有应用，让 /play 使用这版蓝白海报风格页面。保留用户 Icon、现有三轮选择和五年回溯流程、GameState 契约、真实 AI/知乎接口及来源标识。不要使用参考图片中的文字，也不要在网站添加设计解释或开发注释。

如果你所在目录是另一份后端，先比较契约和业务逻辑，再按文档的前端文件清单合并，保留已有后端更新。缺少素材或代码时明确指出，不要自行生成替代版本。

完成后给出实际目录、可打开的本地地址和本次验证结果。本任务是使用和接入已有网页，未另外要求时不发布生产环境。
```
