# Link Trace

Turn any [Obsidian](https://obsidian.md) note into a shareable web page — publish it as a short link and see who's reading it, or export it as a standalone HTML file you can send to anyone.

**[English](#english)** · **[中文](#中文)**

---

## English

### What it does

Open a note, click the share icon in the status bar, and you get either:

- A **short share link** (e.g. `https://your-domain.com/notes/ab3`) that anyone can open in a browser — no Obsidian required — with page-view tracking.
- A **self-contained ZIP file** with the note rendered as HTML, ready to send by email or host anywhere.

You can include the note's directly linked notes (and their links, one level deeper) so readers can click through a small wiki, not just one page.

### Features

- **One-click publish** to your own Aliyun OSS or Tencent COS bucket, with the link copied to your clipboard automatically
- **Local ZIP export** — a self-contained package (HTML + CSS + images) that opens in any browser, no server needed
- **Linked notes** — optionally bundle directly-linked notes (and one level further) with working navigation between them
- **Faithful rendering** of your note's content:
  - Math via KaTeX (`$ ... $` and `$$ ... $$`)
  - Code blocks with syntax highlighting and a one-click copy button
  - Callouts with fold/unfold
  - Responsive tables
  - Image galleries with lightbox (including the [Image Cluster](https://github.com/musSpeaking/obsidian-image-layouts) `imgs` block format)
  - [Dataview](https://github.com/blacksmithgu/obsidian-dataview) queries rendered as static tables/lists
  - [Obsidian Bases](https://obsidian.md/bases) rendered as tables or cards
- **Auto-generated table of contents** sidebar with scroll tracking, collapsible on mobile
- **Status bar indicator** — the share icon turns green when the current note is published, and flags it as stale after you edit
- **Share Stats page** — a dedicated tab listing every page you've published, with total pages/views and a per-page detail view (visits over time, referrers, browsers, OS, countries, screen sizes)
- **Privacy-friendly analytics** — cookieless view tracking via a self-hosted [GoatCounter](https://www.goatcounter.com/) instance, no personal data collected
- **English / 中文** interface

### Installation

1. In Obsidian, open **Settings → Community plugins → Browse**.
2. Search for **Link Trace** and click **Install**, then **Enable**.

### Usage

#### Export a ZIP (no cloud account needed)

Click the share icon in the status bar and choose **Export as ZIP** (also available from the command palette). A `.zip` file is saved containing:

```
note-name/
├── index.html
├── style.css
└── images/
```

Unzip it and open `index.html` in any browser — everything (styles, images, math, etc.) is bundled, nothing needs a server.

#### Publish online

1. In plugin settings, pick a **Publish route** (Aliyun OSS or Tencent COS) and fill in your bucket credentials — see [Settings](#settings) below.
2. Click the share icon in the status bar and choose **Publish Note**.
3. The shareable link is copied to your clipboard automatically.

#### The share popover

Click the status bar share icon on any note to open the popover:

| Action | What it does |
| --- | --- |
| Copy link | Copies the published URL |
| Open link | Opens the published page in your browser |
| Re-publish | Re-uploads after edits (the link stays the same) — shown when the note has changed since it was last published |
| Export as ZIP | Saves a local copy |
| Stop sharing | Deletes the page from the cloud; the link stops working |

Once published, the popover also shows the page's view count, with an expandable detail view (visits trend, referrers, browsers, etc.).

#### Share Stats page

Click the bar-chart icon in the left ribbon (or run **"Open share stats page"**) to see every note you've ever published, its cumulative view count, and a link to open the note or its published page — even pages with zero views are listed.

### Settings

Open **Settings → Link Trace**:

**General**
- **Language** — interface language, 中文 or English

**Export settings**
- **Export depth** — how much to include: this note only, + direct linked notes, or + one more level of links
- **Page name length** — length of the random path segment in share links (2–6 characters); longer means a lower chance of collisions
- **Unique-note prefix compatibility** — if you use the core "Unique note creator" plugin's timestamp-prefixed filenames, this strips that prefix from the exported page title

**Publish route** — choose one cloud storage backend and fill in its credentials:

| Aliyun OSS | Tencent COS |
| --- | --- |
| Region, Bucket, Access Key ID/Secret, upload prefix, custom domain | Region, Bucket (with APPID), SecretId/SecretKey, upload prefix, custom domain |

Both require the bucket to allow public read access, and a custom domain configured so links open directly in the browser instead of triggering a download. A live preview of the resulting URL is shown as you fill these in.

### Privacy & analytics

Published pages embed a lightweight, cookieless view-count tracker via a self-hosted [GoatCounter](https://www.goatcounter.com/) instance — it collects no personal data and sets no cookies. View counts surface in the share popover and the Share Stats page.

### Requirements

- Obsidian 1.7.2 or later
- Desktop only (mobile is not supported)

---

## 中文

### 这是什么

打开一篇笔记，点击状态栏的分享图标，你就能得到：

- 一个**短链接**（例如 `https://your-domain.com/notes/ab3`），任何人用浏览器打开即可阅读，无需安装 Obsidian，并且能看到访问量。
- 一个**自包含的 ZIP 文件**，笔记已渲染为 HTML，可以直接发送或部署到任意地方。

还可以把笔记直接链接到的其他笔记（以及再深一层的链接）一起打包，读者可以在小型「迷你 wiki」里点击跳转，而不只是一篇孤立的页面。

### 功能特性

- **一键发布**到你自己的阿里云 OSS 或腾讯云 COS 存储桶，链接自动复制到剪贴板
- **本地导出为 ZIP** —— 自包含的离线包（HTML + CSS + 图片），双击即可在任意浏览器打开，无需服务器
- **关联笔记** —— 可选择把直接链接的笔记（以及再深一层）一并打包，页面间可以互相跳转
- **忠实还原笔记内容**：
  - KaTeX 数学公式（`$ ... $` 与 `$$ ... $$`）
  - 代码块语法高亮，一键复制
  - Callout 折叠/展开
  - 响应式表格
  - 图片画廊灯箱效果（支持 [Image Cluster](https://github.com/musSpeaking/obsidian-image-layouts) 的 `imgs` 代码块格式）
  - [Dataview](https://github.com/blacksmithgu/obsidian-dataview) 查询渲染为静态表格/列表
  - [Obsidian Bases](https://obsidian.md/bases) 渲染为表格或卡片
- **自动生成目录**侧边栏，滚动高亮当前章节，移动端可收起
- **状态栏图标提示** —— 已发布的笔记图标变绿，笔记被修改后会标记为「待更新」
- **分享统计页** —— 独立标签页，列出所有已发布的页面，展示总页面数/总访问量，以及每个页面的详细数据（访问趋势、来源、浏览器、操作系统、国家地区、屏幕尺寸）
- **注重隐私的访问统计** —— 基于自建 [GoatCounter](https://www.goatcounter.com/) 实例，无 Cookie、不收集个人数据
- **中文 / English** 双语界面

### 安装

1. 在 Obsidian 中打开 **设置 → 第三方插件 → 浏览**。
2. 搜索 **Link Trace**，点击 **安装**，然后 **启用**。

### 使用方法

#### 导出为 ZIP（无需云账号）

点击状态栏的分享图标，选择 **「导出为 ZIP」**（命令面板中也能找到）。会生成一个 `.zip` 文件，内容如下：

```
笔记名/
├── index.html
├── style.css
└── images/
```

解压后用浏览器打开 `index.html` 即可 —— 样式、图片、公式等都已打包好，不需要任何服务器。

#### 发布到网络

1. 在插件设置中选择 **发布路线**（阿里云 OSS 或腾讯云 COS），并填写对应的存储桶信息，参见下方的[设置](#设置)。
2. 点击状态栏分享图标，选择 **发布笔记**。
3. 分享链接会自动复制到剪贴板。

#### 分享面板

点击任意笔记状态栏的分享图标，打开面板：

| 操作 | 说明 |
| --- | --- |
| 复制链接 | 复制已发布的链接 |
| 打开链接 | 在浏览器中打开已发布页面 |
| 重新发布 | 笔记修改后重新上传（链接不变）—— 内容有变更时会提示 |
| 导出为 ZIP | 保存一份本地副本 |
| 停止分享 | 从云端删除页面，链接随即失效 |

发布后，面板还会显示该页面的访问量，点击可展开查看详细数据（访问趋势、来源等）。

#### 分享统计页

点击左侧功能区的柱状图图标（或运行 **「打开分享统计页」**），可以看到你发布过的所有笔记及其累计访问量，并能一键打开笔记或对应的分享页面 —— 即使某个页面还没有访问量，也会被列出。

### 设置

打开 **设置 → Link Trace**：

**通用**
- **语言** —— 界面语言，中文或 English

**导出设置**
- **导出层级** —— 仅当前笔记 / 含直接子页面 / 含子页面的子页面
- **页面名称长度** —— 分享链接中随机路径的长度（2–6 位），越长冲突概率越低
- **兼容 Unique 笔记前缀** —— 如果你使用核心插件「唯一笔记创建器」生成的带时间戳前缀的文件名，此选项会在导出标题中去掉该前缀

**发布路线** —— 二选一，并填写对应凭证：

| 阿里云 OSS | 腾讯云 COS |
| --- | --- |
| Region、Bucket、Access Key ID/Secret、上传前缀、自定义域名 | Region、Bucket（含 APPID）、SecretId/SecretKey、上传前缀、自定义域名 |

两者都需要将存储桶设置为公共读，并配置自定义域名，否则打开链接会触发下载而不是在浏览器中打开。填写过程中会实时预览生成的链接效果。

### 隐私与访问统计

已发布的页面会嵌入一个轻量、无 Cookie 的访问统计脚本，基于自建的 [GoatCounter](https://www.goatcounter.com/) 实例 —— 不收集任何个人数据，不设置 Cookie。访问量会显示在分享面板和分享统计页中。

### 系统要求

- Obsidian 1.7.2 或更高版本
- 仅支持桌面端（不支持移动端）

---

## License

MIT
