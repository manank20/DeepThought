+++
title = "Configuration options"
description = "The required and optional configuration accepted by DeepThought v2."
date = 2026-01-16

[taxonomies]
categories = ["Documentation"]
tags = ["theme", "zola", "configuration"]

[extra]
toc = true
comments = false
+++

DeepThought v2 requires only `base_url`, `title`, and `theme = "DeepThought"` in a consuming site. The directory name remains `DeepThought`; the display name is `DeepThought v2`.

## Minimal consumer

```toml
base_url = "https://example.com"
title = "An example site"
theme = "DeepThought"
```

A consumer can omit every `extra` table and can also omit `build_search_index`. Search controls and search assets are rendered only when Zola builds the search index.

## Site navigation and identity

These values are optional and site-specific:

```toml
[extra]
navbar_items = [
  { code = "en", nav_items = [
    { url = "$BASE_URL/", name = "Home" },
    { url = "$BASE_URL/posts/", name = "Posts" },
  ] },
]
featured_page = "posts/post-0.md"

[extra.author]
name = "Example author"
avatar = "/images/avatar.png"

[extra.social]
email = "author@example.com"
github = "example"
twitter = "example"
mastodon_username = "@example"
mastodon_server = "mastodon.social"
```

The Mastodon username may include a leading `@`; the theme normalizes it before building the profile URL. The social component supports email, GitHub, GitLab, LinkedIn, Instagram, X/Twitter, Mastodon, Facebook, Keybase, Stack Overflow, Reddit, Discord, Behance, YouTube, Tumblr, Twitch, dev.to, Bitbucket, Medium, SoundCloud, Google Play, ORCID, Google Scholar, and an optional feed link.

`featured_page` is optional. When present, it is resolved with Zola's `get_page` function and shown as a featured post on the home section.

## Optional policy link

The theme does not require a policy page. To add a configured link, set the public URL explicitly:

```toml
[extra.policy]
label = "AI Policy"
url = "$BASE_URL/ai-policy/"
```

`$BASE_URL` is replaced in the same way as navigation URLs. The URL is rendered in article metadata and the article aside; the page itself remains the consuming site's responsibility.

## Favicon, analytics, and comments

Each nested table is optional:

```toml
[extra.favicon]
favicon_16x16 = "/icons/favicon-16x16.png"
favicon_32x32 = "/icons/favicon-32x32.png"
apple_touch_icon = "/icons/apple-touch-icon.png"
safari_pinned_tab = "/icons/safari-pinned-tab.svg"
webmanifest = "/icons/site.webmanifest"

[extra.analytics]
google = "G-XXXXXXXXXX"

[extra.commenting]
disqus = "your-shortname"
```

A page opts into comments with `comments = true` in its `[extra]` front matter. The standalone demo deliberately leaves analytics and Disqus unconfigured.

## Search and highlighting

Search requires Zola's generated index:

```toml
build_search_index = true
```

The custom accessible palette is selected by the standalone demo with a theme-relative path:

```toml
[markdown.highlighting]
theme = "github-dark-accessible"
extra_themes = ["highlighting/github-dark-accessible.json"]
```

For a consumer, Zola resolves `extra_themes` relative to the consuming configuration directory, so use `themes/DeepThought/highlighting/github-dark-accessible.json` when selecting the theme-owned file from the parent site.

## Rich-content components

Enable only the external libraries a site needs:

```toml
[extra]
katex.enabled = true
katex.auto_render = true
chart.enabled = true
mermaid.enabled = true
galleria.enabled = true

[extra.mapbox]
enabled = true
access_token = "your-public-token"
```

The supported components are `chart`, `galleria`, `katex`, `mapbox`, `mermaid`, `vimeo`, and `youtube`. Their local markup is responsive and overflow-safe. Mermaid, Chart.xkcd, Galleria, Mapbox, and KaTeX execute from third-party CDNs; network availability is outside the theme's local build guarantees.

## Pagination, table of contents, and metadata

Use normal Zola section pagination. Set `toc = true` on a page to render its heading navigation. Article metadata retains author, date, reading time, word count, categories, tags, page-specific descriptions, canonical URLs, and optional images.
