# 分享气泡阅读数据增强 — 设计

日期：2026-06-17

## 背景

状态栏分享气泡（`src/share-popover.ts`，`SharePopover`）当前在「已发布」状态下展示：发布状态徽标、分享链接 + 复制、发布时间、（陈旧时）重新发布提示、动作行。它**完全不读取访问数据**——访问数只在独立的「分享统计」页（`ShareStatsView`）和单页详情弹窗（`StatsDetailModal`）里出现。

本次在气泡内直接给出当前页的访问概览，让用户无需打开统计页即可一瞥数据。

## 需求

在「已发布」气泡中：

1. 显示当前页的**阅读量**，并提供一个**刷新按钮**手动更新该数字。
2. **如果有人访问**（阅读量 > 0），则显示**最近三条**——即最近 3 个有访问的日期（`日期 · 当日访问数`），并显示一个**「查看详情」**按钮，点击打开插件内置的全局「分享统计」页（`ShareStatsView`）。

## 已确认的设计决策

- **「最近三条」= 最近 3 天的访问**：取每日序列中最近的 3 个 `count > 0` 的日期，新→旧排列，每行展示「`MM-DD · N`」。（GoatCounter 当前接入方式只提供聚合数据，没有逐条访问的时间线，故落到「按日」维度。）
- **「查看详情」→ 打开全局「分享统计」页**：调用插件已有的公开方法 `activateStatsView()`（`main.ts:89`，会复用已存在的 leaf），随后关闭气泡。
- **阅读量为 0 时**：仍显示「阅读量 0」+ 刷新按钮；仅「最近三条」与「查看详情」隐藏。

## 作用范围

- 仅影响 `SharePopover.renderPublished()`（已发布状态）。
- 分析块**仅在**分析功能已完整配置（`canReadAnalytics(settings)` 为真）时渲染。未配置时整块不出现（气泡保持现状）。
- 「未发布」气泡（`renderUnpublished`）不改动。

## 布局

分析块插入在「发布时间」行之后、动作行（`opal-share-popover-actions`）之前：

```
┌─────────────────────────────┐
│ 阅读量  42            [↻]    │   ← 数字 + 刷新图标按钮
│ ───────────────────────────  │
│ 06-15 · 12                   │   ← 最近有访问的日期（仅 views>0）
│ 06-14 · 8                    │
│ 06-11 · 5                    │
│              查看详情 →       │   ← 打开 ShareStatsView（仅 views>0）
└─────────────────────────────┘
```

## 数据流

气泡进入「已发布且已配置分析」状态时（`open()` 与 `showResult()` 两条路径）：

1. 同步渲染分析块骨架：阅读量数字位先显示加载占位（`…` 或微型 spinner），刷新按钮可用。
2. 异步串行拉取（串行以规避 GoatCounter 突发限流 429），两者各自独立降级：
   - **阅读量** — 复用现有 `fetchPageViews(settings, shareLink)`，返回**全时段累计**访问数（与统计页「总浏览量」口径一致）。失败 → 数字位显示 `—`。
   - **最近活跃日** — 新增 `fetchRecentActiveDays(settings, shareLink, { days: 90, limit: 3 })`：发一次 `/stats/hits?daily=true`（90 天窗口），复用 `parseDailySeries` 解析每日序列，再经纯函数 `recentActiveDays(points, limit)` 过滤出 `count > 0` 的日期、按日期降序、取前 `limit` 条。失败或为空 → 不渲染「最近三条」列表与「查看详情」。
3. 拉取完成后就地更新分析块（数字、最近列表、查看详情按钮的显隐）。

### 刷新按钮

`[↻]` 重新执行**两个**拉取（阅读量 + 最近列表），并就地重渲染分析块。期间数字位回到加载态。

### 异步渲染安全

分析块是一个独立子 div。异步回调在写入前校验气泡仍挂载且为当前卡片（`this.el === card` 且 `card.isConnected`）——沿用 `showResult` 已有的防陈旧守卫，避免回调写到已被关闭/重渲的旧卡片上。

## 模块划分与改动文件

- **`src/analytics.ts`**（纯逻辑，禁 import obsidian）
  - 新增 `recentActiveDays(points: DailyPoint[], limit: number): DailyPoint[]`：过滤 `count > 0`，按 `day` 字符串降序，取前 `limit` 条。无副作用、可直接单测。
- **`src/analytics.test.ts`**
  - 为 `recentActiveDays` 增补单测：含 0 值过滤、排序、limit 截断、空数组。
- **`src/analytics-client.ts`**
  - 新增 `fetchRecentActiveDays(settings, shareLink, opts)`：配置/链接校验沿用现有模式（`canReadAnalytics`、`deriveApiBase`、`extractPathname`），一次 `daily=true` 请求，`parseDailySeries` + `recentActiveDays`；任意失败返回 `null`（调用方据此降级）。
- **`src/share-popover.ts`**
  - 在 `renderPublished` 中（且 `canReadAnalytics` 为真时）渲染分析块骨架 + 触发拉取 + 刷新按钮接线。
  - 「查看详情」调用 `this.plugin.activateStatsView()` 后 `this.close()`。
- **`src/i18n.ts`**（zh + en 两套并行）
  - `popover.stats.views`（"阅读量"）、`popover.stats.detail`（"查看详情"）、`popover.stats.refresh`（刷新 tooltip）；最近日行用 `MM-DD · N` 直接拼装，无需多余键。
- **`styles.css`**
  - 分析块、数字行、刷新按钮、最近日列表、查看详情链接的样式。遵循现有 `opal-share-popover-*` 命名与插件 CSS 规范（无 `!important`、6 位 hex 等，见 obsidian-plugin-lint）。

## 错误处理与降级

| 情况 | 表现 |
| --- | --- |
| 分析未配置（`canReadAnalytics` 为假） | 整个分析块不渲染 |
| 阅读量拉取失败 | 数字位显示 `—`；刷新按钮仍可重试 |
| 最近活跃日拉取失败 / 为空 | 不显示「最近三条」与「查看详情」 |
| 阅读量为 0 | 显示「阅读量 0」+ 刷新；隐藏最近列表与查看详情 |
| 气泡在拉取途中被关闭/重渲 | 异步回调因守卫校验失败而静默丢弃 |

## 测试

- 纯函数 `recentActiveDays`：vitest 单测（过滤/排序/截断/空）。
- DOM 渲染部分（气泡）按现有约定不做单测（需真实 Obsidian 宿主）。
