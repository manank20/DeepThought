+++
title = "Welcome to DeepThought v2"
description = "A compact tour of the typography-first demo."
date = 2026-01-18

[taxonomies]
categories = ["Documentation"]
tags = ["theme", "zola", "markdown"]

[extra]
comments = false
+++

This is a small example post for DeepThought v2. It exercises ordinary Markdown, syntax-highlighted code, tables, long links, and the quiet article layout used by the standalone demo.

<!-- more -->

## Lists and headings

- unordered lists remain ordinary list content
- nested content stays inside the reading measure

1. ordered lists are readable
2. headings create the optional table of contents

## Code

```rust
// The comments are deliberately visible in the accessible highlighting palette.
fn answer(input: &str) -> Result<&str, &'static str> {
    if input.is_empty() {
        return Err("empty input");
    }
    Ok(input)
}
```

## Links and tables

[Read the configuration guide](/docs/config-options/) for the complete contract. A table is allowed to be wider than the prose measure and receives local horizontal overflow rather than widening the document.

| Feature | Configuration |
| --- | --- |
| Search | `build_search_index = true` |
| Featured post | `extra.featured_page` |
| Policy link | `extra.policy.url` |

## Rich content

The [extended shortcode examples](/docs/extended-shortcodes/) demonstrate Mermaid, Chart.xkcd, Galleria, Mapbox, video embeds, and KaTeX. Third-party CDN execution is optional and may be blocked in offline builds; the theme still emits bounded local markup.
