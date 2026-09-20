+++
title = "Theme extension"
description = "Extending DeepThought v2 without copying the whole theme."
date = 2026-01-17

[taxonomies]
categories = ["Documentation"]
tags = ["theme", "zola"]

[extra]
toc = true
comments = false
+++

DeepThought v2 follows [Zola's theme extension mechanisms](https://www.getzola.org/documentation/themes/extending-a-theme/). Keep site-specific content and configuration in the consuming site; override a template or static asset only when the generic theme contract is not enough.

<!-- more -->

## Replacing a template

All theme templates can be replaced by creating a file at the same relative path in the consumer's `templates/` directory. The theme install identifier remains `DeepThought` even though its display name is `DeepThought v2`.

## Extending a block

If a complete replacement is unnecessary, extend the theme template and redefine a block:

{% raw %}
```tera
{% extends "DeepThought/templates/base.html" %}

{% block analytics %}
  {# Add site-specific analytics, or call the normal implementation. #}
{% endblock analytics %}
```
{% endraw %}

The reusable base exposes these blocks:

| Template | Block | Purpose |
| --- | --- | --- |
| `base.html` | `title` | Page title |
| `base.html` | `meta_links` | Canonical and Open Graph URL links |
| `base.html` | `meta_content` | Page-specific metadata |
| `base.html` | `analytics` | Optional analytics |
| `base.html` | `header` | Additional header content |
| `base.html` | `content` | Main page content |
| `base.html` | `search` | Search dialog |
| `base.html` | `pagination` | Section pagination |
| `base.html` | `comment` | Page comments |
| `base.html` | `footer` | Footer |
| `base.html` | `custom_js` | Page-specific scripts |
| `base.html` | `user_custom_js` | Site-specific scripts |

## Static overrides

A consuming site's `static/site.css` or `static/js/site.js` can intentionally override the theme assets through Zola's normal lookup rules. Keep overrides focused; the v2 surface has no Bulma dependency, icon-font dependency, Sass payload, motion declarations, or card surface to preserve.

## Highlighting exception

Highlighting `extra_themes` is resolved from the directory containing the consuming `config.toml`, not through the theme's static lookup. Use this path in a parent site:

```toml
[markdown.highlighting]
theme = "github-dark-accessible"
extra_themes = ["themes/DeepThought/highlighting/github-dark-accessible.json"]
```

## Rich components

The theme registers the `chart`, `galleria`, `katex`, `mapbox`, `mermaid`, `vimeo`, and `youtube` components from `templates/shortcodes/`. Their markup can be replaced in a consumer when a site needs different providers or accessibility copy.
