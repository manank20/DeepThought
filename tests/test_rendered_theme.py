"""Rendered standalone-demo checks for DeepThought v2."""
from html.parser import HTMLParser
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def zola_command():
    configured = os.environ.get("ZOLA")
    if configured:
        command = Path(configured)
        if not command.is_file():
            raise AssertionError(f"ZOLA points to a missing executable: {configured}")
        return str(command)
    discovered = shutil.which("zola")
    if discovered:
        return discovered
    raise AssertionError("Zola 0.23.6+ is required; set ZOLA or put zola on PATH")


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []
        self.scripts = []
        self.stylesheets = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "a" and values.get("href"):
            self.hrefs.append(values["href"])
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"])
        if tag == "link" and values.get("rel") == "stylesheet":
            self.stylesheets.append(values.get("href", ""))


class RenderedThemeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempdir = tempfile.TemporaryDirectory(prefix="deepthought-v2-rendered-")
        cls.output = Path(cls.tempdir.name) / "public"
        result = subprocess.run(
            [zola_command(), "build", "--force", "--output-dir", str(cls.output)],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        if result.returncode:
            cls.tempdir.cleanup()
            raise AssertionError(f"standalone Zola build failed:\n{result.stdout}\n{result.stderr}")

    @classmethod
    def tearDownClass(cls):
        cls.tempdir.cleanup()

    def rendered(self, relative):
        path = self.output / relative
        self.assertTrue(path.is_file(), f"missing rendered file: {relative}")
        return path.read_text(encoding="utf-8")

    def test_demo_identity_and_configured_links_render(self):
        home = self.rendered("index.html")
        parser = LinkParser()
        parser.feed(home)
        self.assertIn("DeepThought v2", home)
        self.assertIn("/posts/post-0/", parser.hrefs)
        self.assertTrue(any(href.endswith("/policy/") for href in parser.hrefs))
        self.assertIn("site.css", "\n".join(parser.stylesheets))
        self.assertIn("js/site.js", "\n".join(parser.scripts))
        self.assertNotIn("googletagmanager", home)
        self.assertNotIn("disqus.com", home)

    def test_pages_have_canonical_metadata_and_optional_policy(self):
        article = self.rendered("posts/post-0/index.html")
        self.assertIn('property="og:url"', article)
        self.assertIn("https://deepthought-theme.netlify.app/posts/post-0/", article)
        self.assertIn('class="article-meta"', article)
        sidebar = article.split('<aside ', 1)[1].split('</aside>', 1)[0]
        self.assertNotIn('/policy/', sidebar)
        self.assertIn('<details class="desktop-toc" open>', sidebar)
        self.assertIn('<summary aria-label="Toggle contents"><span>Contents</span></summary>', sidebar)
        self.assertLess(article.index('<aside '), article.index('<article class="reading-column"'))
        self.assertIn('href="https://deepthought-theme.netlify.app/policy/"', article)

    def test_mobile_contents_is_collapsed_between_header_and_body(self):
        article = self.rendered("posts/post-0/index.html")
        marker = '<details class="mobile-toc">'
        self.assertIn(marker, article)
        start = article.index(marker)
        self.assertLess(article.index('</header>', article.index('<article ')), start)
        self.assertLess(start, article.index('<div class="prose">'))
        disclosure = article[start:article.index('</details>', start)]
        self.assertIn('<summary>On this page</summary>', disclosure)
        self.assertIn('#start-with-a-tight-loop', disclosure)
        self.assertNotIn('/policy/', disclosure)

    def test_taxonomies_and_rich_content_are_rendered(self):
        tags = self.rendered("tags/index.html")
        categories = self.rendered("categories/index.html")
        rich = self.rendered("docs/extended-shortcodes/index.html")
        self.assertIn('class="taxonomy-page"', tags)
        self.assertIn('class="taxonomy-page"', categories)
        for marker in ('class="mermaid rich-diagram"', 'class="rich-chart"', 'class="map rich-map"', 'class="galleria rich-gallery"', 'class="video-embed youtube"', 'class="video-embed vimeo"'):
            self.assertIn(marker, rich, marker)
        self.assertIn('class="katex"', rich)
        for marker in ("katex@0.15.1", "mermaid@8.13.5", "chart.xkcd@1.1.13", "galleria@1.6.1"):
            self.assertIn(marker, rich, marker)

    def test_custom_highlighting_is_selected_and_visible(self):
        config = (ROOT / "config.toml").read_text(encoding="utf-8")
        self.assertIn('extra_themes = ["highlighting/github-dark-accessible.json"]', config)
        source = self.rendered("posts/post-0/index.html")
        self.assertIn("style=", source)
        self.assertIn("#8B949E", source)


if __name__ == "__main__":
    unittest.main()
