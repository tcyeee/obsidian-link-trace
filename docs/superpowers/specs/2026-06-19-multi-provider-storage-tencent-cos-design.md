# 多 provider 存储 + 腾讯云 COS 支持 — 设计文档

日期：2026-06-19

## 背景与目标

Link Trace 当前把发布目标硬编码为阿里云 OSS。本次新增**腾讯云 COS**作为可选发布目标，并把存储层重构成可扩展的多 provider 架构。

坚果云（WebDAV）经讨论后**本次不做**：它走 WebDAV、公开分享链接是文件预览/下载页而非可直接渲染 HTML 的原始网页地址，与本插件「短链接 → 渲染页面 + GoatCounter 统计」的核心模型不兼容。架构搭好后未来如有合适方案再加。

## 关键决策

- **Provider 选择方式**：设置页单选「当前 provider」（阿里云 / 腾讯云），两家凭证各自保存。发布 / 更新 / 下线都走当前选中的那家。**不做**「发布时临时选择」。
- **COS 接入方式**：用 Obsidian 的 `requestUrl` 手写 COS REST API + HMAC-SHA1 签名，**不引入** `cos-nodejs-sdk-v5`。理由：bundle 不变大、无需新增构建打桩；签名是纯函数，可单测保证正确性。依赖 node `crypto`（桌面端可用，本插件已是 desktop-only）。

## 架构：抽出 BlobStore 抽象层

现状：`src/publish/oss.ts` 把两类逻辑混在一起：

1. **provider 无关的业务流程**：KaTeX 自托管（从 CDN 拉取、幂等 HEAD 检查、版本化路径）、页面路径布局（`{prefix}/{name}` 扁平 HTML + `{prefix}/{name}/images/` 图片目录）、gzip、缓存头策略、列举已发布短名。
2. **阿里云具体调用**：`put` / `head` / `list` / `delete` / `deleteMulti`、公开 URL 拼接。

腾讯云只在第 2 类不同。因此引入薄抽象 `BlobStore`，把第 2 类隔离，第 1 类统一复用。

### BlobStore 接口

```ts
interface BlobStore {
  put(key: string, body: Buffer, opts: {
    mime: string;
    cacheControl: string;
    contentEncoding?: string;   // "gzip"
  }): Promise<void>;
  head(key: string): Promise<boolean>;        // 对象是否存在（KaTeX 幂等检查）
  listNames(prefix: string): Promise<Set<string>>;  // 已发布短名去重
  listKeys(prefix: string): Promise<string[]>;      // 删除整个 images 目录用
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
  publicBaseUrl(): string;     // 不含尾斜杠，拼短链接用（含自定义域名逻辑）
}
```

### 模块划分

```
src/publish/
  storage.ts                 provider 无关业务流程 + getStore(settings) 选择器
  stores/
    aliyun-store.ts          BlobStore 实现，包装现有 ali-oss 调用
    tencent-store.ts         BlobStore 实现，requestUrl + COS REST
    tencent-sign.ts          COS HMAC-SHA1 签名（纯函数，单测）
```

- `storage.ts` 在 `BlobStore` 之上实现并导出（替换原 `oss.ts` 对外 API）：
  - `getStore(settings): BlobStore` —— 按 `settings.storageProvider` 返回对应实现。
  - `katexBaseUrl(settings): string`
  - `ensureKatexAssets(settings): Promise<void>`
  - `listPublishedNames(settings): Promise<Set<string>>`
  - `uploadPage(settings, vault, noteName, html, images): Promise<string>`
  - `deletePage(settings, noteName): Promise<void>`
- **简化**：现有 `uploadToOss` 与 `uploadSubNoteToOss` 实现完全相同，合并为单个 `uploadPage`。
- 原 `oss.ts` 内的常量（KaTeX 版本/CDN、`HTML_CACHE`/`IMAGE_CACHE`/`IMMUTABLE_CACHE`、`getMimeType`）移入 `storage.ts` 复用。
- 删除 `src/publish/oss.ts`（其阿里云调用迁入 `aliyun-store.ts`）。

## main.ts 改动

`main.ts` 不再 import `./src/publish/oss`，改 import `./src/publish/storage`：

- `listPublishedNames(this.settings)` —— 签名不变。
- `katexBaseUrl(this.settings)` / `ensureKatexAssets(this.settings)` —— 不变。
- `uploadToOss(...)` 和 `uploadSubNoteToOss(...)` 两处调用 → 统一改为 `uploadPage(...)`。
- `deleteFromOss(...)` → `deletePage(...)`。

发布 / 下线 / 更新的编排逻辑、进度条、frontmatter 状态（`share_link` / `share_time` / `share_hash`）全部不变。`extractNoteName` 不变（短名仍是 URL 最后一段）。

## 设置项

`ShareOnlineSettings` 新增：

```ts
storageProvider: "aliyun" | "tencent";   // 默认 "aliyun"
cosSecretId: string;
cosSecretKey: string;
cosBucket: string;     // 形如 name-1250000000（含 APPID）
cosRegion: string;     // 如 ap-guangzhou
cosPrefix: string;     // 默认 "notes"
cosDomain: string;     // 可选自定义/CDN 域名
```

阿里云字段（`oss*`）保持不变，**无需数据迁移**。`DEFAULT_SETTINGS` 补齐新字段默认值（`storageProvider: "aliyun"`，COS 字段空串，`cosPrefix: "notes"`）。

设置页 UI：

- 顶部「通用」区新增一个下拉「当前存储」单选 provider，切换后 `buildUI()` 重渲染。
- 阿里云、腾讯云各为一个并列可折叠分区（`details.opal-collapsible`），与当前 OSS 分区同款。
- URL 预览（`buildPreviewUrl`）跟随当前选中 provider：
  - 阿里云：`https://{bucket}.{region}.aliyuncs.com` 或自定义域名。
  - 腾讯云：`https://{bucket}.cos.{region}.myqcloud.com` 或自定义域名。
- 腾讯云字段：region / bucket / SecretId（password）/ SecretKey（password）/ prefix / 自定义域名，与阿里云分区结构对应。
- 新增 i18n key（`core/i18n.ts`）：provider 选择标签、腾讯云各字段名与说明、COS callout 文案。

## 腾讯云 COS 实现细节

### 公开 URL

- 默认：`https://{cosBucket}.cos.{cosRegion}.myqcloud.com`
- 自定义域名：`cosDomain`（去尾斜杠）
- `publicBaseUrl()` = `{origin}/{prefix}`（prefix 去尾斜杠）

### 需要的 COS REST 操作

| 操作 | HTTP | 说明 |
|------|------|------|
| 上传对象 | `PUT /{key}` | 带 `Content-Type`、`Cache-Control`、可选 `Content-Encoding: gzip` |
| 对象是否存在 | `HEAD /{key}` | KaTeX 幂等检查；404 → 不存在 |
| 列举对象 | `GET /?prefix=&delimiter=/&marker=&max-keys=` | 解析 XML 的 `<Contents><Key>` 与 `<CommonPrefixes><Prefix>`，支持 `<IsTruncated>`/`<NextMarker>` 翻页 |
| 删除对象 | `DELETE /{key}` | |
| 批量删除 | `POST /?delete` | XML body 列出 keys；删除 images 目录用 |

XML 解析用轻量正则/`DOMParser` 提取所需字段（与 ali-oss 返回结构对齐，仅需 key 列表与 prefix 列表）。

### COS 签名算法（`tencent-sign.ts`）

腾讯云 COS Authorization 头：

```
q-sign-algorithm=sha1&q-ak={SecretId}&q-sign-time={t0};{t1}&q-key-time={t0};{t1}
&q-header-list={headers}&q-url-param-list={params}&q-signature={signature}
```

计算步骤：

1. `SignKey = HMAC-SHA1(SecretKey, "{t0};{t1}")` → hex
2. `HttpString = "{method-lower}\n{url-path}\n{url-param-string}\n{header-string}\n"`
   （param/header 均按 key 字典序、URL-encode、`k=v` 用 `&` 连接，key 全小写）
3. `StringToSign = "sha1\n{t0};{t1}\n" + SHA1(HttpString) + "\n"`
4. `Signature = HMAC-SHA1(SignKey, StringToSign)` → hex

`t0`/`t1` 为签名有效期起止 Unix 秒。纯函数 `buildCosAuthorization({ method, pathname, query, headers, secretId, secretKey, now, expiresSec })`。

## 测试

- `src/publish/stores/tencent-sign.test.ts`：用腾讯官方文档的固定输入向量（固定 SecretId/SecretKey/时间戳/请求）校验 `buildCosAuthorization` 输出与文档示例一致。
- `storage.ts` 路径布局与 `getMimeType` 等纯逻辑沿用现有行为，必要时补充轻量单测；不新增 DOM 渲染测试（与现有约定一致，`renderNote` 类不单测）。
- 现有 `note-hash` / `analytics` / `base-renderer` 测试不受影响。

## 不在本次范围

- 坚果云 / WebDAV 支持。
- 「发布时临时选择 provider」交互。
- 跨 provider 迁移已发布页面。
