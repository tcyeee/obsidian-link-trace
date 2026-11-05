# Link Trace

Turn any [Obsidian](https://obsidian.md) note into a shareable web page — publish it as a short link and see who's reading it, or export it as a standalone HTML file you can send to anyone.

*[中文说明](README.zh.md)*

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

## License

MIT
