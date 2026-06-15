# LinkTrace — 更新日志

> 一键将 Obsidian 笔记发布为网页，生成可分享的链接。
> Publish your Obsidian notes as a webpage with one click and share via link.

---

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
