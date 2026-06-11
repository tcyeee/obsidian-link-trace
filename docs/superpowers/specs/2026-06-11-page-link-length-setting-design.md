# 页面名称长度设置

**日期:** 2026-06-11

## 背景

发布笔记时，插件通过 `Math.random().toString(36).slice(2, 9)` 生成 7 位随机路径名（如 `k3m9pq2`）作为 OSS 文件夹名和对外链接的路径段。用户希望能自行控制这个长度，在链接简短性与唯一性之间取得平衡。

## 需求

- 设置范围：最小 2，最大 6，默认 3
- UI：下拉菜单，每个选项标注可生成的唯一页面数量（36^n）
- 更改后立即生效于下一次发布；已有链接不受影响

## 设计

### 1. 数据层 (`src/settings.ts`)

`ShareOnlineSettings` 新增字段：

```ts
pageLinkLength: number;  // 默认 3，范围 2-6
```

`DEFAULT_SETTINGS` 添加 `pageLinkLength: 3`。

### 2. 设置 UI (`src/settings.ts`)

在「导出设置」分组下新增 `addDropdown`：

- 选项：`2`、`3`、`4`、`5`、`6`
- 每项 label 格式：`3 — 约 46,656 个唯一页面`（`(36**n).toLocaleString()`）
- onChange 保存到 `plugin.settings.pageLinkLength`

### 3. 生成逻辑 (`src/exporter.ts`)

`prepareExport` 新增可选参数 `pageLinkLength = 3`：

```ts
export async function prepareExport(
  app, vault, file, existingName?, pageLinkLength = 3
)
```

将 `.slice(2, 9)` 改为 `.slice(2, 2 + pageLinkLength)`。

`exportToLocal` 同样透传 `pageLinkLength` 给内部的 `prepareExport` 调用。

### 4. 调用方 (`main.ts`)

- `doPublish` 两处 `prepareExport` 调用传入 `this.settings.pageLinkLength`
- `exportToLocal` 调用传入 `this.settings.pageLinkLength`

## 容量参考

| 长度 | 唯一页面数 |
|------|-----------|
| 2 | 1,296 |
| 3 | 46,656 |
| 4 | 1,679,616 |
| 5 | 60,466,176 |
| 6 | 2,176,782,336 |
