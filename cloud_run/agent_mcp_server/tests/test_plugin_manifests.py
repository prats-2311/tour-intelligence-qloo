"""The Claude Code plugin manifests are valid JSON with the fields the plugin system needs."""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def _load(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return json.load(f)


def test_marketplace_manifest():
    m = _load(".claude-plugin", "marketplace.json")
    assert m["name"] == "tour-intelligence-qloo" and m["owner"]["name"]
    [p] = m["plugins"]
    assert p["name"] == "tour-intel" and p["source"] == "./plugins/tour-intel" and p["description"]
    assert os.path.isdir(os.path.join(ROOT, p["source"]))


def test_plugin_manifest():
    p = _load("plugins", "tour-intel", ".claude-plugin", "plugin.json")
    assert p["name"] == "tour-intel" and p["version"] == "0.1.0" and p["license"] == "MIT"
    assert p["description"] and p["author"]["name"] and p["homepage"].startswith("https://")


def test_mcp_config_points_at_the_public_server():
    s = _load("plugins", "tour-intel", ".mcp.json")["mcpServers"]["tour-intel"]
    assert s["type"] == "http" and s["url"].startswith("https://") and s["url"].endswith("/mcp")


def test_skill_has_frontmatter_and_names_only_real_tools():
    path = os.path.join(ROOT, "plugins", "tour-intel", "skills", "plan-tour", "SKILL.md")
    text = open(path, encoding="utf-8").read()
    fm = re.match(r"---\nname: plan-tour\ndescription: (.+)\n---\n", text)
    assert fm and len(fm.group(1)) > 40
    import insight_tools  # noqa: F401  (tool names below must exist in main)
    import agent_mcp_server_main as main
    registered = set(main.registered_tool_names())
    named = set(re.findall(r"`((?:find|get|suggest|rank)_[a-z_]+)", text))
    assert named and named <= registered, named - registered
