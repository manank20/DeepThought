+++
title = "A small, observable example"
description = "A compact demo post for the typography-first DeepThought v2 surface."
date = 2026-01-15

[taxonomies]
categories = ["Examples"]
tags = ["zola", "writing", "systems"]

[extra]
toc = true
comments = true
+++

DeepThought v2 is intentionally quiet: readable prose, predictable structure, and no ornamental cards competing with the text.

<!-- more -->

## Start with a tight loop

A useful demo should show the things a real site needs without turning the homepage into a component showroom. The theme keeps code, tables, links, and long prose inside the reading column while allowing each local block to scroll when it must.

```c
// Keep the failure observable before changing the implementation.
static int retries_left = 3;

while (retries_left-- > 0) {
    if (probe_backend() == 0) {
        return 0;
    }
}

return -1;
```

## A table that stays local

| Signal | Meaning |
| --- | --- |
| Build | Templates and content compile together |
| Check | Local links and routes are validated |
| Browser | Responsive behavior is exercised at real widths |

The [configuration guide](/docs/config-options/) documents optional features, while the [extended shortcode examples](/docs/extended-shortcodes/) show the rich-content components.

### A nested heading

The table of contents is generated only when `toc = true` is present in page front matter. Comments are also page-level opt-in; the demo deliberately does not configure a Disqus shortname.
