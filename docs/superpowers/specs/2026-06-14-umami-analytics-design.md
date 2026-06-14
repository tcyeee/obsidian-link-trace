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

## 选型：Umami（自托管）

对比 Umami 自托管 / 百度统计 / 51.LA 后选定 **Umami 自托管**：
- API 最干净：`POST /api/auth/login` 拿 token，`/api/websites/:id/stats?url=...` 直接按 URL 取浏览量。
- 原生按 URL 路径统计，正好用短链路径区分每篇笔记。
- 开源、隐私友好、数据完全在自己手里。
- 自托管在阿里云（ECS/函数计算），脚本与 API 都从国内域名走，防火墙无忧。
- 代价：需自己运维一个 Umami 服务（Node + 数据库），用户已有阿里云基建，托管成本低。

> Umami 实例的搭建由用户自行完成，不属于本插件代码范围。插件只负责：注入脚本、读取数据。

## 架构总览

```
发布/导出：note → renderNote → buildHtml(注入 Umami 脚本) → uploadToOss / 本地写盘
                                                              ↓
访客浏览页面 → Umami beacon → 自托管 Umami 记录 pageview（key = 路径 /{prefix}/{noteName}）

读取：打开 ShareModal → 按 note 的 share_link 路径 → analytics.fetchPageViews()
        → GET /api/websites/:id/stats?url=path → 展示「👁 浏览 N · 访客 M」
```

新增模块 `src/analytics.ts` 封装 Umami，对外暴露两个职责清晰、可独立测试的能力：
1. `getUmamiScriptTag(cfg)` —— 纯函数，生成 `<script>` 标签字符串。
2. `fetchPageViews(settings, urlPath, range)` —— 走 Obsidian `requestUrl` 拉取浏览量（绕过 CORS）。

## 组件设计

### 1. 配置（settings.ts）

`ShareOnlineSettings` 新增字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `analyticsEnabled` | `boolean` | 总开关 |
| `umamiScriptUrl` | `string` | 如 `https://stats.example.com/script.js`（即 `<script src>`） |
| `umamiWebsiteId` | `string` | Umami 后台 website UUID（即 `data-website-id`） |
| `umamiApiBase` | `string` | API 基址，如 `https://stats.example.com`；若留空从 `umamiScriptUrl` 推导（去掉 `/script.js`） |
| `umamiUsername` | `string` | 读数据时登录用户名 |
| `umamiPassword` | `string` | 读数据时登录密码 |

`DEFAULT_SETTINGS` 对应补默认空值。设置页新增「访问统计」折叠区（沿用现有 `opal-collapsible` 模式），
包含总开关 + 上述字段输入。

认证方式：自托管 Umami 通用的 `POST /api/auth/login`（用户名+密码 → JWT），token 内存缓存，
遇 401 重登一次。不依赖仅 Cloud 提供的 API Key。

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
- 流程：确保 token（缓存命中直接用，否则 `POST /api/auth/login`）→
  `GET /api/websites/:id/stats?startAt&endAt&url={urlPath}` →
  解析 `pageviews.value` 与 `visitors.value`。
- 全程用 `requestUrl`。任意失败（网络/认证/未配置）返回 `null`，由调用方降级展示。
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
- 读取失败/网络异常/未配置 → 条目显示 `—`，不弹错误、不打断弹窗。
- token 过期（401）→ 清缓存重登一次，仍失败则降级为 `null`。

## 测试

纯函数与纯逻辑写单元测试：
- `getUmamiScriptTag` 生成正确且属性转义。
- 从 `share_link` 提取 pathname 的逻辑（含带 query/hash、无路径等边界）。
- `fetchPageViews` 的响应解析（可对 `requestUrl` 做桩，验证 url 拼接与字段解析）。

## 决策记录

- 工具：Umami 自托管（vs 百度统计 / 51.LA）。
- 范围：嵌入 + API 拉回。
- 注入范围：发布与本地导出都注。
- 统计区间：全部累计。
- 认证：用户名+密码登录拿 JWT。
