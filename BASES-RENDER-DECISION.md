# Bases 渲染方案决策记录

> 状态：**已决策 —— 不做技术迁移，保留手写引擎**
> 日期：2026-06-16
> 调查分支：`explore/bases-native-render`（spike 代码已清理）

## 背景

插件把 Markdown 笔记渲染为静态 HTML 发布到 OSS。其中 `.base`（Obsidian Bases）
嵌入由 `src/base-renderer.ts` **手写解析**：自带表达式求值、过滤器、formula
引擎，复制了 Obsidian Bases 的查询语义。

该手写引擎**目前工作正常**，能产出干净的静态 list / table / cards。

担忧点：手写引擎会**持续落后于 Obsidian 真实的 Bases**，每次官方加功能都要重新
实现 + 重新测试，长期脆弱。

由此提出问题：**能否改用 Obsidian 官方渲染，快照其 DOM 输出，从而退役手写引擎？**

## 调查方法

在 Obsidian（1.13.1）内注册临时诊断命令，用发布管线同样的方式
（`MarkdownRenderer.render` 渲染 `![[X.base]]` 到脱离文档的 detached 元素）
对 vault 里全部 59 个 base 实测，统计「结果数 vs 实际渲染行数」，并 dump 真实 DOM。

## 关键发现

### 1. 没有「无头查询」的公开 API

`QueryController` 在 typings 里类体为空、无公开构造函数；`BasesView` 构造函数是
`protected`。官方唯一入口 `registerBasesView()` 只在真实 Bases 叶子里被回调。
拿不到「传一个 .base 路径 → 得到 entries + 求值结果」的能力。
唯一可复用的只有 `MarkdownRenderer` 渲染 `![[X.base]]` 后的 DOM 快照。

### 2. detached 渲染可行，但三种视图命运分化

| 视图 | 能否快照原生输出 | 证据 |
|---|---|---|
| **list**  | ✅ 可以 | 全部行渲染（如 25/25），内链/值齐全，仅需剥绝对定位样式 |
| **cards** | ✅ 可以 | 全部卡片渲染（46→47、32→33，+1 为隐藏测量幽灵卡需剥） |
| **table** | ❌ **不行** | 5 个大表全部死死卡在 **18 行**（64→18, 48→18, 36→18, 26→18, 24→18） |

table 用 **滚动事件驱动的硬虚拟化**：只渲染视口内 ~18 行，且单元格内容也要滚动到
才懒加载（那 18 个 `.bases-tr` 内部全是空 div）。给容器撑高（实测 60000px）
无法触发其 scroll / IntersectionObserver。CSS 手段救不回来。

```html
<!-- listening-1.base，64 results 的真实快照：容器高度正确，tbody 只有 18 个空 tr -->
<div class="bases-table-container" style="height: 1920px;">  <!-- 64×30px，高度对 -->
  <div class="bases-tbody" style="height: 1920px;">
    <div class="bases-tr" style="top: 0px;"></div>           <!-- 仅 18 个，且为空 -->
    ...
```

## 决策：不迁移

**关键推论**：table 救不回 → table 必须保留手写 → table 需要完整的查询/过滤/formula
引擎 → **那段最脆弱、最容易漂移的核心代码无论如何都删不掉**。迁移的全部动机落空。

因此：

- **「部分迁移」（list/cards 走原生）是净负**：新增一套原生 DOM 后处理 +
  三套 Bases 私有 class 的 CSS + 内链改写 + 剥定位样式/幽灵卡，却**没移除任何
  脆弱代码**，反而变成两套并行渲染系统，维护面更大。
- 原生输出本身对静态发布也不友好：交互工具栏要剥、绝对定位要拆、内链是
  `<span data-href>` 非真 `<a>`。它是为编辑器交互设计的，不是为导出设计的。
- 现状是可用的 working state，CSS 完全可控。无理由用它换一个「一半能换、一半
  更复杂、整体没变干净」的系统。

## 后续建议（非迁移）

用原生渲染解决最初的「漂移」担忧，但**不动生产渲染路线**：

- **原生 list/cards 输出可当测试预言机（oracle）**：在 vitest 里渲染原生
  list/cards，断言手写引擎算出的 filter / sort / formula 结果与 Obsidian 一致，
  低成本锁住漂移风险。这是值得做的那件事，而非重写渲染。

## 复现

调查用的诊断命令见分支 `explore/bases-native-render` 历史中的 `src/bases-spike.ts`
（已从工作区清理）。核心做法：`MarkdownRenderer.render(app, "![[X.base]]", el, …)`
→ 轮询 result-count 标签稳定 → 统计 `.bases-list-item` / `.bases-cards-item` /
`.bases-tr` 数量与 result count 对比。
