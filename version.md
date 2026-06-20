# LinkTrace — 更新日志

> 一键将 Obsidian 笔记发布为网页，生成可分享的链接。
> Publish your Obsidian notes as a webpage with one click and share via link.

---

## Version 0.1.11

- Added Tencent Cloud COS as a storage provider you can publish to, alongside Alibaba Cloud OSS, selectable in settings
- Added a publish destination selector so you can choose where each note is published
- Changed updating a published note to also re-upload its linked sub-notes, keeping them in sync

- 新增腾讯云 COS 作为可发布的存储服务，与阿里云 OSS 并列，可在设置中选择
- 新增发布目标选择器，可为每篇笔记选择发布到哪个存储
- 更新已发布笔记时改为同时重新上传其关联子笔记，保持同步

## Version 0.1.10

- Added a redesigned share popover card (replacing the old share modal) with a live progress bar that shows rendering and per-page upload/delete steps while publishing, updating, or unpublishing
- Added a 14-day visit trend chart and expandable visitor breakdowns (referrers, browsers, and more) to the share popover, served instantly from a session cache so reopening no longer flickers

- 新增重新设计的分享气泡卡片（取代旧的分享弹窗），发布、更新、取消发布时显示实时进度条，呈现渲染与各页面的上传/删除步骤
- 分享气泡新增近 14 天访问趋势图与可展开的访客来源细分（来源、浏览器等），并借助会话缓存即时展示，重新打开不再闪烁

## Version 0.1.9

- Fixed the ZIP export so page files are written as correct binary data, ensuring the downloaded archive is always valid

- 修复 ZIP 导出，页面文件以正确的二进制数据写入，确保下载的压缩包始终有效

## Version 0.1.8

- Changed local export to download a self-contained ZIP archive instead of writing files to a folder you pick — no more native folder dialog, and the export-path setting has been removed
- Changed the minimum required Obsidian version to 1.7.2

- 本地导出改为下载自包含的 ZIP 压缩包，不再写入手动选择的文件夹——移除了原生文件夹选择框与导出路径设置项
- 最低 Obsidian 版本要求改为 1.7.2

## Version 0.1.7

- Added a dedicated Share Stats page (ribbon icon + "Open share stats" command) listing every published page and its cumulative view count
- Added view count and recent activity to the share popover so you can see how a page is doing at a glance
- Changed the analytics backend to a self-hosted, privacy-friendly GoatCounter instance; the analytics API token is now optional
- Added support for all three Obsidian Bases views (list, table, cards) when rendering `.base` embeds
- Fixed code blocks inside task list items overflowing the page width on exported pages

- 新增独立的「分享统计」页面（功能区图标 +「打开分享统计」命令），集中列出每个已发布页面及其累计访问量
- 分享卡片新增访问量与近期活动展示，一眼掌握页面表现
- 分析后端改为自托管、隐私友好的 GoatCounter 实例；分析 API token 现为可选项
- 渲染 `.base` 嵌入时支持全部三种 Obsidian Bases 视图（列表、表格、卡片）
- 修复任务列表项内代码块在导出页面中超出页面宽度的问题

## Version 0.1.6

- Added Umami Cloud analytics: published pages can track page views, and view counts show in the share modal
- Added a status-bar share popover — click the status-bar icon to publish, update, unpublish, export, or open the link from one card
- Added stale detection: the status-bar icon flags when a published note has changed since it was last shared, with a one-click update
- Changed the share popover's copy button to give in-panel feedback (a check icon) instead of a toast notification
- Changed the published time to show in 24-hour format (YYYY-MM-DD HH:mm:ss) beneath the share link

- 新增 Umami Cloud 分析：已发布页面可统计访问量，分享弹窗中展示浏览次数
- 新增状态栏分享卡片——点击状态栏图标即可在一个卡片内发布、更新、停止分享、导出或打开链接
- 新增过期检测：已发布笔记内容变动后，状态栏图标会提示，并支持一键更新
- 分享卡片的复制按钮改为在卡片内显示勾选反馈，不再弹出通知
- 发布时间改为以 24 小时制（YYYY-MM-DD HH:mm:ss）显示在链接下方

## Version 0.1.5

- Fixed Shell Execution submission-bot warning by stubbing transitive `address` and `win-release` dependencies of ali-oss with implementations that avoid `child_process`
- 修复发布机器人"Shell Execution"警告：为 ali-oss 传递依赖 `address` 和 `win-release` 创建不依赖 `child_process` 的 stub 实现

## Version 0.1.4

- Fixed settings panel reloading by extracting an internal `buildUI()` method to avoid calling the deprecated `display()` recursively
- 修复设置面板重载逻辑，提取内部 `buildUI()` 方法，避免递归调用已废弃的 `display()`

## Version 0.1.3

- Fixed plugin display name from "LinkTrace" to "Link Trace"
- 修复插件显示名称，从 "LinkTrace" 更正为 "Link Trace"

## Version 0.1.2

- Improved reliability of frontmatter reading with stricter type handling
- 改进前置元数据读取的可靠性，采用更严格的类型处理

## Version 0.1.1

- One-click publish current note as a shareable webpage link
- Export note as local HTML folder
- Auto-generate table of contents for notes with headings
- Renders math (KaTeX), Mermaid diagrams, code blocks, callouts, tables, and images
- Mermaid diagrams support zoom toggle for oversized charts
- Image gallery view for multi-image blocks
- Linked notes can be batch-published or unpublished together via share modal
- Configurable page link length (2–6 chars) to control short-code size
- Fixed OSS link generation, credential validation, and unpublish modal appearance

- 一键将当前笔记发布为可分享的网页链接
- 支持导出为本地 HTML 文件夹
- 含标题的笔记自动生成目录导航
- 支持数学公式、Mermaid 图表、代码块、Callout、表格、图片渲染
- Mermaid 图表支持缩放切换，适配超宽图表
- 支持多图画廊展示
- 新增分享弹窗，支持批量发布或停止分享关联笔记
- 新增页面链接长度设置（2–6 位），控制生成链接短码的字符数
- 修复 OSS 链接生成、凭证校验与停止分享弹窗样式问题
