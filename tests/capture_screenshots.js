"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const output = path.resolve(process.argv[2] || process.env.SITE_OUTPUT || "public");
const screenshotDir = path.resolve(
  process.env.SCREENSHOT_DIR || path.join(__dirname, "..", "screenshots"),
);
const screenshotRoute = process.env.SITE_SCREENSHOT_ROUTE || "/";
const port = Number(process.env.PORT || 8867);

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
  }[extension] || "application/octet-stream";
}

function detectSiteOrigin(root) {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const match = index.match(/(?:href|src)="(https?:\/\/[^\"]+)\/(?:site\.css|js\/site\.js)"/);
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

function pngDimensions(file) {
  const data = fs.readFileSync(file);
  assert.strictEqual(data.readUInt32BE(0), 0x89504e47, `${file} is a PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function main() {
  assert.ok(fs.existsSync(output), `rendered output does not exist: ${output}`);
  fs.mkdirSync(screenshotDir, { recursive: true });
  const { server, base } = await startServer(output);
  const siteOrigin = detectSiteOrigin(output);
  let browser;
  const screenshots = [];
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
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
    for (const [name, width, height] of [["mobile", 390, 844], ["desktop", 1440, 1000]]) {
      await page.setViewportSize({ width, height });
      for (const theme of ["light", "dark"]) {
        await page.goto(`${base}${screenshotRoute}`, { waitUntil: "domcontentloaded" });
        await page.evaluate(value => localStorage.setItem("theme", value), theme);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(100);
        const state = await page.evaluate(() => ({
          theme: document.documentElement.dataset.theme,
          overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
          visibleIdentity: document.body.textContent.includes("DeepThought v2"),
        }));
        assert.strictEqual(state.theme, theme, `${name}/${theme} screenshot uses requested theme`);
        assert.strictEqual(state.overflow, false, `${name}/${theme} screenshot has no page overflow`);
        assert.strictEqual(state.visibleIdentity, true, `${name}/${theme} screenshot contains the demo identity`);
        const file = path.join(screenshotDir, `deepthought-v2-${name}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: false });
        const dimensions = pngDimensions(file);
        assert.deepStrictEqual(dimensions, { width, height }, `${name}/${theme} screenshot dimensions`);
        assert.ok(fs.statSync(file).size > 0, `${file} is non-empty`);
        screenshots.push({ file, width, height, theme, state, bytes: fs.statSync(file).size });
      }
    }
    await browser.close();
    console.log(JSON.stringify({ output, screenshotDir, screenshotRoute, screenshots }, null, 2));
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
