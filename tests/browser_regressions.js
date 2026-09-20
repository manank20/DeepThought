"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const output = path.resolve(process.argv[2] || process.env.SITE_OUTPUT || "public");
const port = Number(process.env.PORT || 8865);

const route = (name, fallback) => process.env[name] || fallback;
const routes = [
  ["home", route("SITE_HOME_ROUTE", "/")],
  ["posts", route("SITE_POSTS_ROUTE", "/posts/")],
  ["article", route("SITE_ARTICLE_ROUTE", "/posts/post-0/")],
  ["tags", route("SITE_TAGS_ROUTE", "/tags/")],
  ["tag", route("SITE_TAG_ROUTE", "/tags/theme/")],
  ["categories", route("SITE_CATEGORIES_ROUTE", "/categories/")],
  ["category", route("SITE_CATEGORY_ROUTE", "/categories/documentation/")],
  ["policy", route("SITE_POLICY_ROUTE", "/policy/")],
  ["404", route("SITE_404_ROUTE", "/404.html")],
];
const articleRoute = route("SITE_ARTICLE_ROUTE", "/posts/post-0/");
const policyRoute = route("SITE_POLICY_ROUTE", "/policy/");
const searchTerm = process.env.SITE_SEARCH_TERM || "observable";
const searchExpectedRoute = process.env.SITE_SEARCH_EXPECTED_ROUTE || articleRoute;
const richRoute = process.env.SITE_RICH_CHECK === "0"
  ? ""
  : (process.env.SITE_RICH_ROUTE || "/docs/extended-shortcodes/");
const resultsPath = path.resolve(
  process.env.BROWSER_RESULTS || "/tmp/deepthought-v2-browser-results.json",
);

function contentType(file) {
  const extension = path.extname(file).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".pdf": "application/pdf",
  }[extension] || "application/octet-stream";
}

function detectSiteOrigin(root) {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const match = index.match(/(?:href|src)=\"(https?:\/\/[^\"]+)\/(?:site\.css|js\/site\.js)\"/);
  return match ? new URL(match[1]).origin : null;
}

function startServer(root) {
  const resolvedRoot = path.resolve(root);
  const server = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      let relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
      if (!relative || relative.endsWith("/")) {
        relative += "index.html";
      }
      const file = path.resolve(resolvedRoot, relative);
      if (file !== resolvedRoot && !file.startsWith(resolvedRoot + path.sep)) {
        response.writeHead(403);
        response.end("forbidden");
        return;
      }
      fs.readFile(file, (error, data) => {
        if (error) {
          response.writeHead(error.code === "ENOENT" ? 404 : 500);
          response.end(error.code === "ENOENT" ? "not found" : "server error");
          return;
        }
        response.writeHead(200, { "Content-Type": contentType(file) });
        response.end(data);
      });
    } catch (error) {
      response.writeHead(400);
      response.end("bad request");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

async function fulfillFromOutput(requestRoute, root, pathname) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!relative || relative.endsWith("/")) {
    relative += "index.html";
  }
  const resolvedRoot = path.resolve(root);
  const file = path.resolve(resolvedRoot, relative);
  if (file !== resolvedRoot && !file.startsWith(resolvedRoot + path.sep)) {
    await requestRoute.fulfill({ status: 403, body: "forbidden" });
    return;
  }
  try {
    const body = fs.readFileSync(file);
    await requestRoute.fulfill({ status: 200, contentType: contentType(file), body });
  } catch (error) {
    await requestRoute.fulfill({ status: error.code === "ENOENT" ? 404 : 500, body: error.code === "ENOENT" ? "not found" : "server error" });
  }
}

function parseRgb(value) {
  const match = String(value).match(/rgba?\(([^)]+)\)/);
  assert.ok(match, `expected an RGB color, got ${value}`);
  const channels = match[1].split(/[, ]+/).filter(Boolean).slice(0, 3).map(Number);
  assert.strictEqual(channels.length, 3, `expected three RGB channels, got ${value}`);
  return channels;
}

function relativeLuminance(value) {
  return parseRgb(value)
    .map(channel => channel / 255)
    .map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((luminance, channel, index) => luminance + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

async function readPageShape(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const main = document.querySelector("main");
    const article = document.querySelector(".reading-column");
    const prose = document.querySelector(".prose");
    const taxonomy = document.querySelector(".taxonomy-page");
    const computed = element => element ? getComputedStyle(element) : null;
    const rect = element => element ? (() => {
      const box = element.getBoundingClientRect();
      return { x: box.x, right: box.right, width: box.width, top: box.top, height: box.height };
    })() : null;
    const animated = [...document.querySelectorAll("*")].filter(element => {
      const style = getComputedStyle(element);
      return style.animationName !== "none" ||
        style.transitionDuration.split(",").some(value => parseFloat(value) > 0) ||
        style.scrollBehavior === "smooth";
    }).slice(0, 20).map(element => ({
      tag: element.tagName,
      className: element.className,
      animation: computed(element).animationName,
      transition: computed(element).transitionDuration,
      scroll: computed(element).scrollBehavior,
    }));
    const codeBlocks = [...document.querySelectorAll(".prose pre")].map(block => {
      const style = computed(block);
      return {
        background: style.backgroundColor,
        foreground: style.color,
        tokens: [...block.querySelectorAll("span[style]")].map(token => ({
          color: computed(token).color,
          text: token.textContent,
        })),
      };
    });
    return {
      url: location.href,
      theme: root.dataset.theme || "",
      viewport: innerWidth,
      scrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      overflow: root.scrollWidth > innerWidth || body.scrollWidth > innerWidth,
      main: rect(main),
      article: rect(article),
      aside: rect(document.querySelector(".article-aside")),
      mobileToc: rect(document.querySelector(".mobile-toc")),
      articleHeader: rect(document.querySelector(".article-header")),
      sidebarPolicyLinks: document.querySelectorAll('.article-aside a[href$="/policy/"], .article-aside a[href$="/ai-policy/"]').length,
      prose: rect(prose),
      taxonomy: rect(taxonomy),
      proseMaxWidth: prose ? computed(prose).maxWidth : null,
      articleBoxShadow: article ? computed(article).boxShadow : null,
      bodyFont: computed(body).fontFamily,
      animated,
      codeBlocks,
      singularCount: document.body.textContent.includes("1 post"),
      pluralSingularTypo: document.body.textContent.includes("1 posts"),
      landmarks: {
        header: !!document.querySelector("header.site-header"),
        main: !!document.querySelector("main#main-content"),
        footer: !!document.querySelector("footer.site-footer"),
      },
    };
  });
}

function assertShape(shape, name, width) {
  assert.ok(shape.landmarks.header, `${name} has a site header`);
  assert.ok(shape.landmarks.main, `${name} has a main landmark`);
  assert.ok(shape.landmarks.footer, `${name} has a site footer`);
  assert.strictEqual(shape.overflow, false, `${name} has no document overflow at ${width}px`);
  assert.deepStrictEqual(shape.animated, [], `${name} has no animation, transition, or smooth scrolling`);
  assert.ok(shape.bodyFont && !/Times New Roman/i.test(shape.bodyFont), `${name} uses the theme sans stack`);
  assert.strictEqual(shape.sidebarPolicyLinks, 0, `${name} has no sidebar policy link`);
  if (shape.aside && shape.article) {
    if (width > 736) {
      assert.ok(shape.aside.right <= shape.article.x, `${name} sidebar is left of the article`);
      if (shape.mobileToc) assert.strictEqual(shape.mobileToc.width, 0, `${name} mobile disclosure hidden on desktop`);
    } else {
      assert.strictEqual(shape.aside.width, 0, `${name} desktop sidebar is hidden on mobile`);
      if (shape.mobileToc) {
        assert.ok(shape.mobileToc.width > 0, `${name} mobile contents is visible`);
        assert.ok(shape.mobileToc.top >= shape.articleHeader.top + shape.articleHeader.height, `${name} contents follows metadata`);
        assert.ok(shape.mobileToc.top + shape.mobileToc.height <= shape.prose.top, `${name} contents precedes prose`);
      }
    }
  }
  if (shape.articleBoxShadow !== null) {
    assert.strictEqual(shape.articleBoxShadow, "none", `${name} article has no card shadow`);
  }
}

async function exerciseSearch(page, base, report) {
  await page.goto(`${base}${routes[0][1]}`, { waitUntil: "domcontentloaded" });
  const opener = page.locator("#nav-search");
  if (await opener.count() === 0) {
    report.functional.search = { skipped: true, reason: "build_search_index is disabled" };
    return;
  }

  const backgroundBefore = await page.evaluate(() => [...document.body.children]
    .filter(element => element.id !== "search-modal")
    .map(element => ({ inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") })));
  await opener.click();
  const opened = await page.evaluate(() => ({
    active: document.activeElement.id,
    hidden: document.querySelector("#search-modal").hidden,
    overflow: document.documentElement.style.overflow,
    backgroundInert: [...document.body.children]
      .filter(element => element.id !== "search-modal")
      .every(element => element.inert),
  }));
  assert.strictEqual(opened.active, "search", "search input receives focus");
  assert.strictEqual(opened.hidden, false, "search modal opens");
  assert.strictEqual(opened.overflow, "hidden", "search locks background scroll");
  assert.strictEqual(opened.backgroundInert, true, "search makes background inert");

  await page.locator("#search").fill(searchTerm);
  await page.locator(".search-result a").first().waitFor();
  const results = await page.locator(".search-result a").evaluateAll(links => links.map(link => ({
    text: link.textContent.trim(),
    href: link.href,
  })));
  const expected = new URL(searchExpectedRoute, base).pathname;
  const matchingIndex = results.findIndex(result => new URL(result.href).pathname === expected);
  assert.ok(matchingIndex >= 0, `search results contain expected route ${expected}`);

  await page.locator(".search-result a").nth(matchingIndex).focus();
  await page.keyboard.press("Tab");
  const afterTab = await page.evaluate(() => ({
    active: document.activeElement.id,
    insideDialog: !!document.activeElement.closest('[role="dialog"]'),
  }));
  assert.strictEqual(afterTab.insideDialog, true, "search focus remains inside the dialog");
  assert.strictEqual(afterTab.active, "search-close", "Tab cycles from last result to close control");
  await page.keyboard.press("Shift+Tab");
  assert.strictEqual(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true);

  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => ({
    active: document.activeElement.id,
    hidden: document.querySelector("#search-modal").hidden,
    overflow: document.documentElement.style.overflow,
    background: [...document.body.children]
      .filter(element => element.id !== "search-modal")
      .map(element => ({ inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") })),
  }));
  assert.strictEqual(closed.hidden, true, "Escape closes search");
  assert.strictEqual(closed.active, "nav-search", "search restores focus to opener");
  assert.strictEqual(closed.overflow, "", "search restores scroll state");
  assert.deepStrictEqual(closed.background, backgroundBefore, "search restores background accessibility state");

  await opener.click();
  await page.locator("#search").fill(searchTerm);
  await page.locator(".search-result a").nth(matchingIndex).click();
  await page.waitForTimeout(50);
  assert.strictEqual(new URL(page.url()).pathname, expected, "search result navigates to the expected route");
  report.functional.search = { opened, results, afterTab, closed, expectedRoute: expected };
}

async function exerciseThemePersistence(page, base, report) {
  await page.goto(`${base}${routes[0][1]}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#dark-mode").click();
  const afterToggle = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    stored: localStorage.getItem("theme"),
    pressed: document.querySelector("#dark-mode").getAttribute("aria-pressed"),
  }));
  assert.strictEqual(afterToggle.theme, "dark", "theme toggle selects dark mode");
  assert.strictEqual(afterToggle.stored, "dark", "theme toggle persists dark mode");
  await page.goto(`${base}${routes[1][1]}`, { waitUntil: "domcontentloaded" });
  const afterNavigation = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.strictEqual(afterNavigation, "dark", "dark mode persists across navigation");
  await page.reload({ waitUntil: "domcontentloaded" });
  const afterReload = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    pressed: document.querySelector("#dark-mode").getAttribute("aria-pressed"),
  }));
  assert.strictEqual(afterReload.theme, "dark", "dark mode persists across reload");
  assert.strictEqual(afterReload.pressed, "true", "dark mode button state matches persistence");
  report.functional.theme = { afterToggle, afterNavigation, afterReload };
}

async function exerciseMobileNavigation(page, base, report) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}${routes[0][1]}`, { waitUntil: "domcontentloaded" });
  const mobile = page.locator(".site-nav__mobile");
  await mobile.locator("summary").click();
  const result = await page.evaluate(() => {
    const details = document.querySelector(".site-nav__mobile");
    const box = document.querySelector(".site-nav__mobile-panel").getBoundingClientRect();
    return {
      open: details.open,
      panel: { x: box.x, right: box.right, width: box.width },
      links: [...details.querySelectorAll("a")].map(link => link.textContent.trim()),
    };
  });
  assert.strictEqual(result.open, true, "mobile navigation opens");
  assert.ok(result.panel.x >= 0 && result.panel.right <= 390, "mobile navigation stays in the viewport");
  assert.ok(result.links.length > 0, "mobile navigation contains links");
  report.functional.mobileNavigation = result;
}

async function exerciseArticle(page, base, report) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}${articleRoute}`, { waitUntil: "domcontentloaded" });
  const desktop = await page.evaluate(() => {
    const prose = document.querySelector(".prose").getBoundingClientRect();
    const column = document.querySelector(".reading-column").getBoundingClientRect();
    const toc = [...document.querySelectorAll(".toc-list a")].map(link => ({
      href: link.href,
      targetExists: !!document.querySelector(new URL(link.href).hash),
    }));
    return {
      prose: { x: prose.x, width: prose.width },
      column: { x: column.x, width: column.width },
      toc,
      comments: !!document.querySelector("#disqus_thread"),
    };
  });
  assert.ok(desktop.prose.width > 0, "article prose is visible on desktop");
  assert.ok(desktop.toc.every(item => item.targetExists), "article TOC targets exist");
  const desktopToc = page.locator(".desktop-toc");
  if (await desktopToc.count()) {
    assert.strictEqual(await desktopToc.evaluate(el => el.open), true, "desktop contents starts expanded");
    const expanded = await page.evaluate(() => {
      const layout = document.querySelector(".reading-layout").getBoundingClientRect();
      const aside = document.querySelector(".article-aside").getBoundingClientRect();
      const article = document.querySelector(".reading-column").getBoundingClientRect();
      return { layout: { x: layout.x, width: layout.width }, aside: { width: aside.width }, article: { x: article.x, width: article.width } };
    });
    await desktopToc.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.strictEqual(await desktopToc.evaluate(el => el.open), false, "keyboard collapses desktop contents");
    const collapsed = await page.evaluate(() => {
      const layout = document.querySelector(".reading-layout").getBoundingClientRect();
      const aside = document.querySelector(".article-aside").getBoundingClientRect();
      const article = document.querySelector(".reading-column").getBoundingClientRect();
      return { layout: { x: layout.x, width: layout.width }, aside: { width: aside.width }, article: { x: article.x, width: article.width } };
    });
    assert.ok(collapsed.aside.width <= 44, "collapsed sidebar becomes a narrow control");
    assert.ok(collapsed.layout.width < expanded.layout.width, "collapsed layout releases sidebar width");
    assert.ok(collapsed.article.x < expanded.article.x, "article recenters into released left space");
    assert.ok(Math.abs(collapsed.article.width - expanded.article.width) < 1, "reading width stays stable");
    await desktopToc.locator("summary").click();
    assert.strictEqual(await desktopToc.evaluate(el => el.open), true, "click expands desktop contents");
  }
  const firstToc = page.locator(".article-aside .toc-list a").first();
  if (await firstToc.count()) {
    const tocHref = await firstToc.getAttribute("href");
    await firstToc.click();
    assert.strictEqual(new URL(page.url()).hash, new URL(tocHref).hash, "TOC links navigate to headings");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}${articleRoute}`, { waitUntil: "domcontentloaded" });
  const mobileToc = page.locator(".mobile-toc");
  assert.strictEqual(await mobileToc.count(), 1, "article has mobile contents");
  assert.strictEqual(await mobileToc.evaluate(el => el.open), false, "contents starts collapsed");
  await mobileToc.locator("summary").focus();
  await page.keyboard.press("Enter");
  assert.strictEqual(await mobileToc.evaluate(el => el.open), true, "keyboard opens contents");
  await mobileToc.locator("summary").click();
  assert.strictEqual(await mobileToc.evaluate(el => el.open), false, "tap closes contents");
  await mobileToc.locator("summary").click();
  const mobileLink = mobileToc.locator("a").first();
  const mobileHref = await mobileLink.getAttribute("href");
  await mobileLink.click();
  assert.strictEqual(new URL(page.url()).hash, new URL(mobileHref).hash, "mobile contents navigates to heading");
  const overflowStress = await page.evaluate(() => {
    const prose = document.querySelector(".prose");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = "x".repeat(320);
    pre.appendChild(code);
    prose.appendChild(pre);
    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th>Column A</th><th>Column B</th><th>Column C</th></tr></thead><tbody><tr><td style=\"white-space:nowrap\">" + "wide-value-".repeat(40) + "</td><td>two</td><td>three</td></tr></tbody>";
    prose.appendChild(table);
    return {
      viewport: innerWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      pre: { clientWidth: pre.clientWidth, scrollWidth: pre.scrollWidth, overflowX: getComputedStyle(pre).overflowX },
      table: { clientWidth: table.clientWidth, scrollWidth: table.scrollWidth, overflowX: getComputedStyle(table).overflowX },
    };
  });
  assert.strictEqual(overflowStress.rootScrollWidth, 390, "mobile article remains within the viewport under overflow stress");
  assert.strictEqual(overflowStress.pre.overflowX, "auto", "long code scrolls locally");
  assert.strictEqual(overflowStress.table.overflowX, "auto", "wide tables scroll locally");
  report.functional.article = { desktop, overflowStress };
}

async function exerciseRichContent(page, base, report) {
  if (!richRoute) {
    report.functional.richContent = { skipped: true };
    return;
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}${richRoute}`, { waitUntil: "domcontentloaded" });
  const rich = await page.evaluate(() => ({
    diagrams: document.querySelectorAll(".rich-diagram").length,
    charts: document.querySelectorAll(".rich-chart").length,
    maps: document.querySelectorAll(".rich-map").length,
    galleries: document.querySelectorAll(".rich-gallery").length,
    videos: document.querySelectorAll(".video-embed").length,
    videoOverflow: [...document.querySelectorAll(".video-embed")].some(element => element.scrollWidth > element.clientWidth),
    localOverflow: document.documentElement.scrollWidth > innerWidth,
  }));
  for (const key of ["diagrams", "charts", "maps", "galleries", "videos"]) {
    assert.ok(rich[key] > 0, `rich-content demo renders ${key}`);
  }
  assert.strictEqual(rich.videoOverflow, false, "video components fit their local containers");
  assert.strictEqual(rich.localOverflow, false, "rich-content page has no document overflow");
  report.functional.richContent = rich;
}

async function exercisePolicy(page, base, report) {
  await page.goto(`${base}${policyRoute}`, { waitUntil: "domcontentloaded" });
  const policy = await page.evaluate(() => ({
    text: document.querySelector("article.prose")?.textContent.trim() || "",
    metaPolicy: [...document.querySelectorAll(".article-meta a, .article-aside__policy")].map(link => link.href),
  }));
  assert.strictEqual(policy.text, "", "policy page body remains empty");
  report.functional.policy = policy;
}

async function main() {
  assert.ok(fs.existsSync(output), `rendered output does not exist: ${output}`);
  const { server, base } = await startServer(output);
  const siteOrigin = detectSiteOrigin(output);
  const report = { output, siteOrigin, routes, matrix: [], functional: {}, console: [], pageErrors: [], localFailures: [] };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route("**/*", async requestRoute => {
      const requestUrl = new URL(requestRoute.request().url());
      if (requestUrl.hostname === "127.0.0.1") {
        return requestRoute.continue();
      }
      if (siteOrigin && requestUrl.origin === siteOrigin) {
        return fulfillFromOutput(requestRoute, output, requestUrl.pathname);
      }
      return requestRoute.abort("blockedbyclient");
    });
    const page = await context.newPage();
    page.on("console", message => {
      if (message.type() === "error") {
        report.console.push({ url: page.url(), text: message.text() });
      }
    });
    page.on("pageerror", error => report.pageErrors.push({ url: page.url(), error: String(error) }));
    page.on("response", response => {
      const responseUrl = new URL(response.url());
      if (responseUrl.hostname === "127.0.0.1" && response.status() >= 400) {
        report.localFailures.push({ url: response.url(), status: response.status() });
      }
    });

    const viewports = [["mobile", 390, 844], ["tablet", 768, 1024], ["desktop", 1440, 1000]];
    for (const [viewportName, width, height] of viewports) {
      await page.setViewportSize({ width, height });
      for (const [name, relative] of routes) {
        for (const theme of ["light", "dark"]) {
          await page.goto(`${base}${relative}`, { waitUntil: "domcontentloaded" });
          await page.evaluate(value => localStorage.setItem("theme", value), theme);
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForTimeout(25);
          const shape = await readPageShape(page);
          assert.strictEqual(shape.theme, theme, `${name} uses the requested ${theme} theme`);
          assertShape(shape, `${name}/${theme}`, width);
          report.matrix.push({ viewport: viewportName, width, height, page: name, theme, ...shape });
        }
      }
    }

    await exerciseMobileNavigation(page, base, report);
    await exerciseSearch(page, base, report);
    await exerciseThemePersistence(page, base, report);
    await exerciseArticle(page, base, report);
    await exerciseRichContent(page, base, report);
    await exercisePolicy(page, base, report);

    assert.strictEqual(report.matrix.length, 54, "responsive matrix covers 9 pages x 3 viewports x 2 themes");
    assert.deepStrictEqual(report.pageErrors, [], "browser pages have no JavaScript errors");
    assert.deepStrictEqual(report.localFailures, [], "browser output has no local HTTP failures");
    fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      output,
      matrixCases: report.matrix.length,
      localFailures: report.localFailures.length,
      pageErrors: report.pageErrors.length,
      consoleErrors: report.console.length,
      resultsPath,
      functional: report.functional,
    }, null, 2));
    await browser.close();
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await closeServer(server);
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
