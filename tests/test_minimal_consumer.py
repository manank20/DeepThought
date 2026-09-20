"""Build a consumer that supplies no optional theme configuration."""
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


class MinimalConsumerTests(unittest.TestCase):
    def test_minimal_consumer_builds_without_optional_extra_or_search(self):
        with tempfile.TemporaryDirectory(prefix="deepthought-v2-minimal-") as temporary:
            site = Path(temporary)
            (site / "content/posts").mkdir(parents=True)
            (site / "themes").mkdir()
            shutil.copytree(
                ROOT,
                site / "themes/DeepThought",
                ignore=shutil.ignore_patterns(".git", "public", "tests", "__pycache__"),
            )
            (site / "config.toml").write_text(
                'base_url = "https://minimal.example"\n'
                'title = "Minimal consumer"\n'
                'theme = "DeepThought"\n',
                encoding="utf-8",
            )
            (site / "content/_index.md").write_text(
                '+++\ntitle = "Minimal home"\n+++\n\nA minimal home.\n',
                encoding="utf-8",
            )
            (site / "content/posts/_index.md").write_text(
                '+++\ntitle = "Posts"\n+++\n',
                encoding="utf-8",
            )
            (site / "content/posts/one.md").write_text(
                '+++\ntitle = "One post"\ndate = 2026-01-01\n+++\n\nOne post.\n',
                encoding="utf-8",
            )
            output = site / "public"
            result = subprocess.run(
                [zola_command(), "build", "--force", "--output-dir", str(output)],
                cwd=site,
                text=True,
                capture_output=True,
            )
            self.assertEqual(0, result.returncode, f"minimal consumer failed:\n{result.stdout}\n{result.stderr}")
            home = (output / "index.html").read_text(encoding="utf-8")
            article = (output / "posts/one/index.html").read_text(encoding="utf-8")
            self.assertNotIn('id="nav-search"', home)
            self.assertNotIn("search_index", home)
            self.assertNotIn("elasticlunr", home)
            self.assertNotIn("ai-policy", home + article)
            self.assertNotIn("undefined", home.lower() + article.lower())
            self.assertIn("Minimal consumer", home)
            self.assertIn("One post", article)


if __name__ == "__main__":
    unittest.main()
