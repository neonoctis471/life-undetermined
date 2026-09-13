# 知乎黑客松 Skill 接入笔记

## 已读取资料

- 官方压缩包：`<素材目录>\zhihu-cli-skill-0.5.3-beta.20260904115023.zip`
- Skill：`zhihu`
- Skill 版本：`0.5.3-beta.20260904115023`
- CLI 最低版本：`0.5.0-beta.20260826061344`
- 资料核对日期：黑客松主资料为 2026-09-03，OAuth 资料为 2026-09-04

本笔记是对官方资料的项目内摘要。比赛规则和接口可能变化，提交前仍需以活动页和当时的官方资料为准。

## 这个 Skill 是什么

它是知乎开放平台的 Agent Skill，核心执行入口是官方 `zhihu-cli`。它可以：

- 搜索知乎内容和全网内容；
- 获取知乎热榜；
- 调用知乎直答；
- 读取 Access Secret 所属账号的创作、关注和收藏；
- 列出、检索和上传知乎知识库；
- 查询开放 API 当日额度；
- 指导知乎黑客松作品规划、OAuth 接入、开发和交付。

日常查询优先使用 CLI；开发 Web 产品时，按官方 HTTP API、黑客松内容 API 和 OAuth 文档在后端接入。

## 后续怎样使用

当前只完成资料读取和配置记录，尚未安装 CLI，也没有联网验证任何凭证或消耗知乎接口额度。

需要启用 CLI 时：

1. 从官方 Skill 目录执行 `scripts/run.ps1 status` 做无副作用检查。
2. 若未安装，得到明确授权后执行 `scripts/setup.ps1`。CLI 安装到用户目录，不修改 PATH。
3. 使用 setup/status 返回的绝对 `binary_path`，不要调用 PATH 中来源不明的同名程序。
4. 通过标准输入执行 `<CLI> auth set --secret-stdin`，让官方 CLI 在线验证并保存 Access Secret。
5. 用 `<CLI> capabilities` 和具体命令的 `--help` 确认当前版本实际能力。

常用命令：

```text
<CLI> search zhihu --query "问题" --count 10
<CLI> search global --query "问题" --count 10
<CLI> hot --limit 20
<CLI> answer --query "问题"
<CLI> me contents --type all --limit 20
<CLI> knowledge search --query "问题" --scope personal --limit 10
<CLI> quota
```

## 游戏赛道可直接使用的黑客松内容 API

以下四个比赛专用接口当前不需要 Access Secret、OAuth 或 Authorization Header：

```text
GET https://api.zhihu.com/km-indep-home/hackathon/v2/story/list
GET https://api.zhihu.com/km-indep-home/hackathon/v2/story/{work_id}
GET https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/list
GET https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/{work_id}
```

列表常见字段有 `work_id`、`title`、`artwork`、`tab_artwork`、`description` 和 `labels`；详情常见字段有 `chapter_name`、`author_name`、`author_avatar`、`labels`、`introduction` 和 `content`。

实现时应从列表取得 `work_id`，校验并进行 URL path 编码；固定访问 `api.zhihu.com`；兼容字段缺失和新增字段；保留作者与来源归属。这是本届赛事专用能力，不应当成长期稳定 API。

## OAuth 与后端边界

只有游戏需要让其他玩家使用知乎账号登录，或读取经玩家授权的创作、关注、收藏时，才需要 OAuth：

1. 活动页面创建项目后取得 OAuth `app_id` 和 `app_key`。
2. 浏览器跳转到 `https://openapi.zhihu.com/authorize`，回调主要接收 `authorization_code`。
3. 后端 POST `https://openapi.zhihu.com/access_token` 换取 OAuth access token。
4. 调用用户数据 API 时，后端同时发送开放平台 Access Secret 和该用户的 OAuth token。

`app_id`、`app_key`、OAuth token 和开放平台 Access Secret 是不同凭证。所有秘密只应留在后端或部署平台 Secret Store，不能进入前端包、URL、日志、截图、演示视频或代码仓库。

## 已记录的本地配置

- 知乎开放平台 Access Secret：已加密保存为 `.secrets/zhihu-access-secret.dpapi`
- AI API Key：已加密保存为 `.secrets/openai-next-api-key.dpapi`
- AI Base URL：`https://api.openai-next.com`
- 运行时环境变量约定：`ZHIHU_ACCESS_SECRET`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`

加密文件使用当前 Windows 用户的 DPAPI，只能由同一 Windows 用户在本机解密。部署时不要复制这些文件，应在部署平台重新配置 Secret。

本地 PowerShell 开发前可在项目根目录执行：

```powershell
. .\scripts\Import-LocalSecrets.ps1
```

该命令只把凭证载入当前 PowerShell 进程的环境变量，不输出凭证值。

## 当前赛事节点

- 报名与组队：2026-08-15 至 2026-09-13 00:00
- 作品提交：2026-09-13 10:00 至 2026-09-15 10:00
- 必交：可公开运行的线上 Demo、产品说明或计划书
- 选交：GitHub/Gitee 仓库、演示视频

提交前必须验证线上核心流程、错误降级、额度耗尽处理、OAuth 回调一致性，并检查所有凭证没有泄露。
