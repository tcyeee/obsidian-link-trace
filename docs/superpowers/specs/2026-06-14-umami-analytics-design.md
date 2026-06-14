# 设计方案：导出页面访问统计（Umami 自托管）

日期：2026-06-14
状态：已批准设计，待写实现计划

## 背景与目标

LinkTrace 插件的定位是「发布笔记为短链并追踪谁看过」。本次迭代落地这个追踪能力：
在导出/发布的 HTML 中嵌入第三方埋点脚本，统计外部访客对每篇笔记页面的访问情况，
并通过第三方 API 把浏览量拉回 Obsidian 内展示。

**范围**：嵌入埋点 + API 拉回展示。

**约束**：
- 国内访客浏览器要能可靠加载埋点脚本（防火墙）。
- 第三方要有读取统计数据的 API。

## 选型：Umami Cloud（免费 Hobby 档）

对比 Umami 自托管 / 百度统计 / 51.LA 后选定 **Umami**，并进一步决定先只接 **Umami Cloud 免费档**：
- API 干净：用 API Key（`x-umami-api-key` 头）打到 `api.umami.is`，`/websites/:id/stats?url=...` 按 URL 取浏览量。
- 原生按 URL 路径统计，正好用短链路径区分每篇笔记。
- 免费 Hobby 档：永久免费，3 站点、10 万事件/月、6 个月保留；API 读统计限速 50 次/15 秒（够用）。
- 零运维，不用自己搭服务。

**已知风险（防火墙）**：Cloud 的埋点脚本走 `cloud.umami.is/script.js`、API 走 `api.umami.is`，
托管在 Vercel/Cloudflare 类基建上，国内访客浏览器**加载可能不稳定甚至被墙**——脚本加载失败则该次访问
不上报，国内访客可能大面积漏统计。本迭代接受此风险；若实测漏统计严重，后续再迁自托管（届时只需扩展
鉴权与 apiBase，注入逻辑不变）。

> 待用户实测确认：免费 Hobby 档能否生成 API Key（官方文档未写死）。

## 架构总览

```
发布/导出：note → renderNote → buildHtml(注入 Umami 脚本) → uploadToOss / 本地写盘
                                                              ↓
访客浏览页面 → Umami beacon → 自托管 Umami 记录 pageview（key = 路径 /{prefix}/{noteName}）

读取：打开 ShareModal → 按 note 的 share_link 路径 → analytics.fetchPageViews()
        → GET /api/websites/:id/stats?url=path → 展示「👁 浏览 N · 访客 M」
```

新增模块 `src/analytics.ts` 封装 Umami Cloud，对外暴露两个职责清晰、可独立测试的能力：
1. `getUmamiScriptTag(cfg)` —— 纯函数，生成 `<script>` 标签字符串。
2. `fetchPageViews(settings, urlPath)` —— 走 Obsidian `requestUrl` 拉取浏览量（绕过 CORS），用 API Key 鉴权。

## 组件设计

### 1. 配置（settings.ts）

`ShareOnlineSettings` 新增字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `analyticsEnabled` | `boolean` | 总开关 |
| `umamiScriptUrl` | `string` | 默认 `https://cloud.umami.is/script.js`（即 `<script src>`） |
| `umamiWebsiteId` | `string` | Umami 后台 website UUID（即 `data-website-id`） |
| `umamiApiKey` | `string` | 读数据用的 API Key（`x-umami-api-key`） |

`umamiApiBase` 不设为用户字段，模块内常量默认 `https://api.umami.is`（后续若迁自托管再开放）。
`DEFAULT_SETTINGS` 对应补默认值（scriptUrl 给 Cloud 默认值，其余空）。设置页新增「访问统计」折叠区
（沿用现有 `opal-collapsible` 模式），包含总开关 + 上述字段输入。

认证方式：Umami Cloud 的 **API Key**，请求带 `x-umami-api-key` 头打到 `api.umami.is`。无 token 登录流程。

### 2. 埋点注入（renderer.ts + exporter.ts）

- `buildHtml(title, htmlBody, css, katexBase, analytics?)` 新增可选参数
  `analytics?: { scriptUrl: string; websiteId: string }`。
- 启用且 `scriptUrl`/`websiteId` 均非空时，在 `<head>`（紧挨 `<title>` 之后）注入：
  ```html
  <script defer src="{scriptUrl}" data-website-id="{websiteId}"></script>
  ```
  scriptUrl 与 websiteId 需做属性值转义。
- `prepareExport` 增加 analytics 参数并透传给 `buildHtml`；`exportToLocal` 与 main.ts 中的 OSS 发布
  调用方从 `settings` 构造该参数传入。
- **注入范围**：只要启用就注入到所有导出 HTML（发布 + 本地导出都注）。本地 `file://` 页面 Umami
  不会上报有效数据，但无害；真正有意义的是发布到 OSS 的页面。

### 3. 读取数据（analytics.ts）

```ts
fetchPageViews(settings, urlPath): Promise<{ pageviews: number; visitors: number } | null>
```
- 时间范围：**全部累计**。`startAt` 取一个很早的固定点（2020-01-01 的毫秒时间戳），`endAt` 取当前时间。
- 流程：`GET {apiBase}/websites/:id/stats?startAt&endAt&url={urlPath}`，请求头带 `x-umami-api-key` →
  解析 `pageviews.value` 与 `visitors.value`。
  （Cloud API 的版本前缀/确切路径在实现阶段对照官方文档核实，如 `/v1`。）
- 全程用 `requestUrl`。任意失败（网络/鉴权/未配置）返回 `null`，由调用方降级展示。
- `urlPath` 由 note 的 `share_link` 提取：取 URL 的 pathname（如 `https://x.com/notes/ab3` → `/notes/ab3`）。

### 4. 读取展示（share-modal.ts）

- 打开 ShareModal 时，对主笔记及已有 `share_link` 的子笔记，懒加载调用 `fetchPageViews`。
- 在每个笔记条目（`renderNoteItem`）上追加一个统计标签：`👁 浏览 N · 访客 M`。
- 加载中显示占位（如 `…`），返回 `null`（失败/未配置）时显示 `—`。
- 异步获取，绝不阻塞弹窗打开与原有发布/取消操作。

### 5. i18n（i18n.ts）

新增设置项标签、统计标签等文案的中英文 key。

## 错误处理

- 启用但 `scriptUrl`/`websiteId` 为空 → 静默跳过注入。
- 读取失败/网络异常/未配置/API Key 无效 → 条目显示 `—`，不弹错误、不打断弹窗。

## 测试

纯函数与纯逻辑写单元测试：
- `getUmamiScriptTag` 生成正确且属性转义。
- 从 `share_link` 提取 pathname 的逻辑（含带 query/hash、无路径等边界）。
- `fetchPageViews` 的响应解析（可对 `requestUrl` 做桩，验证 url 拼接与字段解析）。

## 决策记录

- 工具：Umami（vs 百度统计 / 51.LA）。
- 部署：先只接 Umami Cloud 免费档（接受国内访客可能漏统计的防火墙风险；后续可迁自托管）。
- 范围：嵌入 + API 拉回。
- 注入范围：发布与本地导出都注。
- 统计区间：全部累计。
- 认证：Umami Cloud API Key（`x-umami-api-key`）。
