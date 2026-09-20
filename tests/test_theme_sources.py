"""Source-level contract checks for the reusable DeepThought v2 theme."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "templates"


class ThemeSourceTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_theme_identity_and_local_assets_are_v2(self):
        metadata = self.read("theme.toml")
        base = self.read("templates/base.html")
        css = self.read("static/site.css")
        self.assertIn('name = "DeepThought v2"', metadata)
        self.assertIn("site.css", base)
        self.assertNotIn("deep-thought.css", base)
        self.assertNotIn("fontawesome", base.lower())
        self.assertNotIn("bulma", base.lower())
        self.assertIn('[data-theme="dark"]', css)

    def test_reusable_sources_contain_no_site_identity_or_content_paths(self):
        paths = list(TEMPLATES.rglob("*.html")) + [ROOT / "static/js/site.js"]
        source = "\n".join(path.read_text(encoding="utf-8") for path in paths)
        for forbidden in ("goto-statement", "@/ai-policy.md"):
            self.assertNotIn(forbidden, source)

    def test_optional_contract_and_conditional_search_are_present(self):
        base = self.read("templates/base.html")
        home = self.read("templates/index.html")
        page = self.read("templates/page.html")
        for marker in ("config.extra.favicon?.", "config.extra.analytics?.", "config.extra.social?.", "config.extra.author?.", "config.extra.commenting?."):
            self.assertIn(marker, base + home + page)
        self.assertIn("config.extra.featured_page", home)
        self.assertIn("config.extra.policy?.url", base + page)
        self.assertIn("config.build_search_index", base)
        self.assertIn("get_page(path=config.extra.featured_page)", home)
        self.assertIn("replace(from='$BASE_URL', to=config.base_url)", base)

    def test_editorial_templates_have_no_cards_or_icon_font_dependencies(self):
        for path in TEMPLATES.rglob("*.html"):
            source = path.read_text(encoding="utf-8")
            self.assertNotIn('class="box"', source, str(path))
            self.assertNotIn("fa-", source, str(path))
            self.assertNotIn("is-flex", source, str(path))
            self.assertNotIn("is-justify-content-center", source, str(path))
            self.assertNotIn("is-align-items-center", source, str(path))

    def test_static_surface_is_motion_free_and_overflow_safe(self):
        css = self.read("static/site.css")
        script = self.read("static/js/site.js")
        for marker in ("68ch", "overflow-x: auto", "--surface", "--ink", "@media (max-width"):
            self.assertIn(marker, css)
        self.assertNotIn("box-shadow", css)
        for value in re.findall(r"(?i)\b(?:transition|animation|scroll-behavior)\s*:\s*([^;]+)", css):
            self.assertTrue(value.strip().lower().startswith("none"), value)
        self.assertNotIn("requestAnimationFrame", script)
        self.assertIn("localStorage", script)
        self.assertIn("elasticlunr", script)

    def test_optional_component_initializers_require_real_apis(self):
        script = self.read("static/js/site.js")
        self.assertIn('typeof mermaid.initialize === "function"', script)
        self.assertIn('Galleria.run("#galleria-" + index, { transition: "none" });', script)

    def test_rich_content_shortcodes_use_semantic_theme_classes(self):
        for name in ("chart", "galleria", "katex", "mapbox", "mermaid", "vimeo", "youtube"):
            source = self.read(f"templates/shortcodes/{name}.html")
            self.assertNotIn("mb-6", source, name)
            self.assertNotIn("is-flex", source, name)
        self.assertTrue((ROOT / "highlighting/github-dark-accessible.json").is_file())

    def test_portable_zola_resolution_is_not_machine_specific(self):
        source = self.read("tests/test_rendered_theme.py") + self.read("tests/test_minimal_consumer.py")
        self.assertNotIn("/nix/store/", source)
        self.assertIn('os.environ.get("ZOLA")', source)
        self.assertIn('shutil.which("zola")', source)


if __name__ == "__main__":
    unittest.main()
