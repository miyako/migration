"""Optional real-Chrome regression checks; no browser packages ship with the site."""
import argparse
from copy import deepcopy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from shutil import copytree
import subprocess
import sys
from threading import Thread
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright
from cache_transition import transition

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.publish import publish

CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
PALETTE = {"v16": "#8331AE", "v17": "#3E8B93", "v18": "#EB8E5F",
           "v19": "#5682DF", "v20": "#E23089", "v21": "#3B69E9"}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not self.path.startswith("/migration/"):
            self.send_error(404)
            return
        self.path = self.path.removeprefix("/migration")
        super().do_GET()

    def log_message(self, *args):
        pass


def check(page, condition, message):
    assert page.evaluate(condition), message


def ids(page):
    return page.locator("[data-change-id]").evaluate_all("(cards) => cards.map(c => c.dataset.changeId)")


def controls(page):
    return page.evaluate("""() => ({
      mode: document.querySelector('#browse-mode').value,
      source: document.querySelector('#source-version').value,
      target: document.querySelector('#target-version').value,
      query: document.querySelector('#search').value,
      sort: document.querySelector('#sort').value,
      language: document.querySelector('#language').value,
      theme: document.querySelector('#theme').value,
      platforms: [...document.querySelectorAll('[name=platforms]:checked')].map(c => c.value),
      modules: [...document.querySelectorAll('[name=modules]:checked')].map(c => c.value)
    })""")


def projected_records(catalog, source="v16", target="v21"):
    script = """import {filterChanges, projectChangeForPath} from './site/logic.mjs';
      let input = ''; for await (const chunk of process.stdin) input += chunk;
      const {catalog, source, target} = JSON.parse(input);
      const records = catalog.changes.map(change =>
        projectChangeForPath(change, catalog.sources, source, target, catalog.latest)).filter(Boolean);
      console.log(JSON.stringify(filterChanges(records, {source, target}, catalog.latest)));"""
    result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT,
                            input=json.dumps({"catalog": catalog, "source": source, "target": target}),
                            text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def run(base, screenshots, published):
    catalog = json.loads((ROOT / "site/data/catalog.json").read_text())
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=str(CHROME) if CHROME.exists() else None, headless=True)
        transition(browser, ROOT, ROOT / "site", expect_failure=True)
        transition(browser, ROOT, published, expect_failure=False)
        with TemporaryDirectory() as directory:
            source, next_release = Path(directory) / "source", Path(directory) / "published"
            copytree(ROOT / "site", source)
            # A logic-only future release must also invalidate the importing app and CSS.
            with (source / "logic.mjs").open("a") as stream:
                stream.write("\n// Next-release cache regression fixture.\n")
            publish(source, next_release)
            transition(browser, ROOT, next_release, expect_failure=False, previous=published)
        context = browser.new_context(viewport={"width": 1280, "height": 1000}, locale="en")
        # Exercise deterministic keyword UX without downloading a WebGPU model.
        context.add_init_script("Object.defineProperty(navigator, 'gpu', {value: undefined})")
        page = context.new_page()
        errors, failed = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("requestfailed", lambda request: failed.append(request.url))
        page.goto(base)
        page.wait_for_selector("[data-change-id]")
        cdp = context.new_cdp_session(page)
        cdp.send("Network.enable")
        cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
        page.reload()
        page.wait_for_selector("[data-change-id]")
        cdp.send("Network.setCacheDisabled", {"cacheDisabled": False})
        severity = {"blocking": 0, "high": 1, "medium": 2, "low": 3, "unknown": 4}
        assert len(catalog["changes"]) == 202
        assert catalog["coverage"]["atomic_changes"] == 276
        # The default v16 -> v21 interval must not newly cross v14 disabling.
        expected = [c["id"] for c in projected_records(catalog)]
        assert "chg-removed-graph-table" not in expected
        assert "chg-group-bundled-php-modules" not in expected
        assert ids(page) == expected
        assert ids(page)[:3] == ["chg-colon-identifiers", "chg-cs-class-assignment-check",
                               "chg-group-v19-compiler-settings"]
        assert page.input_value("#browse-mode") == "upgrade"
        assert not page.locator(".references").evaluate("el => el.open")
        before = controls(page)
        page.locator(".references > summary").click()
        assert controls(page) == before
        english_urls = {s["url"] for s in catalog["sources"] if s["language"] == "en"}
        assert set(page.locator("#reference-list a").evaluate_all(
            "links => links.map(link => link.href)")) == english_urls
        assert page.locator("#reference-list a").count() == 58
        assert page.locator("#reference-list a").evaluate_all(
            "links => links.every(link => link.textContent === link.href && "
            "link.target === '_blank' && link.rel === 'noopener noreferrer')")
        assert page.locator("#result-count").inner_text() == (
            "190 entries match this upgrade and filters · 202 in catalog")
        page.select_option("#target-version", "latest")
        assert len(ids(page)) == 199
        assert page.locator("#result-count").inner_text() == (
            "199 entries match this upgrade and filters · 202 in catalog")
        page.select_option("#source-version", "v21")
        page.select_option("#target-version", "v21")
        assert page.locator("#version-warning").is_visible()
        before = controls(page)
        page.select_option("#browse-mode", "catalog")
        assert all(controls(page)[key] == before[key] for key in before if key != "mode")
        assert len(ids(page)) == 202
        assert set(ids(page)) == {c["id"] for c in catalog["changes"]}
        assert page.locator("#result-count").inner_text() == "202 entries shown · 202 in catalog"
        assert page.locator("#source-version").is_disabled()
        assert page.locator("#target-version").is_disabled()
        assert page.locator("#catalog-note").is_visible()
        assert not page.locator("#version-warning").is_visible()
        assert page.locator(".path-evidence-warning").count() == 0
        for query, entity in (
            ("_o_GRAPH TABLE", "chg-removed-graph-table"),
            ("chg-bundled-php-zip-removal", "chg-group-bundled-php-modules"),
            ("chg-icu-20-1-client-server-pair", "chg-icu-20-1-client-server-pair"),
        ):
            page.fill("#search", query)
            assert ids(page) == [entity]
            assert page.locator(".evidence-list > li").count() > 0
            page.locator(".card > details").first.locator(":scope > summary").click()
            if entity == "chg-group-bundled-php-modules":
                assert "Before target release" in page.locator(".card dl").inner_text()
                assert "20 R3" in page.locator(".card dl").inner_text()
            if entity == "chg-icu-20-1-client-server-pair":
                assert "Applies only to target releases" in page.locator(".card dl").inner_text()
                assert "20.1" in page.locator(".card dl").inner_text()
        page.select_option("#sort", "complexity")
        page.select_option("#browse-mode", "upgrade")
        assert page.input_value("#source-version") == "v21"
        assert page.input_value("#target-version") == "v21"
        assert page.input_value("#sort") == "complexity"
        assert page.input_value("#search") == "chg-icu-20-1-client-server-pair"
        assert ids(page) == []
        assert page.locator("#source-version").is_enabled()
        assert page.locator("#target-version").is_enabled()
        assert page.locator("#version-warning").is_visible()
        assert not page.locator("#catalog-note").is_visible()
        page.select_option("#browse-mode", "catalog")
        for group in ("platforms", "modules"):
            page.locator(f'[data-group="{group}"][data-select="none"]').click()
            assert ids(page) == []
            assert page.locator("#reference-list a").count() == 58
            assert set(page.locator("#reference-list a").evaluate_all(
                "links => links.map(link => link.href)")) == english_urls
            page.locator(f'[data-group="{group}"][data-select="all"]').click()
            assert ids(page) == ["chg-icu-20-1-client-server-pair"]
        page.click("#reset")
        assert page.input_value("#browse-mode") == "catalog"
        assert len(ids(page)) == 202
        for locale in ("en", "fr", "de", "es", "ja"):
            page.select_option("#language", locale)
            assert page.input_value("#browse-mode") == "catalog"
            assert len(ids(page)) == 202
            assert "202" in page.locator("#result-count").inner_text()
            assert page.locator("#catalog-note").is_visible()
            assert "catalogNote" not in page.locator("#catalog-note").inner_text()
            sources = [s for s in catalog["sources"] if s["language"] == locale]
            assert page.locator(".references").evaluate("el => el.open")
            assert page.locator("#reference-list a").count() == len(sources)
            assert set(page.locator("#reference-list a").evaluate_all(
                "links => links.map(link => link.href)")) == {s["url"] for s in sources}
            for source in sources:
                item = page.locator(f'[data-reference-id="{source["id"]}"]')
                assert source["title"] in item.inner_text()
                assert source["edition"] in item.inner_text()
            page.set_viewport_size({"width": 320, "height": 1000})
            check(page, "() => document.documentElement.scrollWidth <= innerWidth",
                  f"No catalog-mode overflow: {locale}")
        page.reload()
        page.wait_for_selector("[data-change-id]")
        assert page.input_value("#browse-mode") == "upgrade"
        assert page.input_value("#language") == "ja"
        page.select_option("#language", "en")
        page.set_viewport_size({"width": 1280, "height": 1000})
        assert ids(page) == expected
        page.select_option("#source-version", "v18")
        page.select_option("#target-version", "v19")
        for query, entity in (
            ("chg-v19-compiler-unicode-methods", "chg-group-v19-compiler-settings"),
            ("entitySelection.average()", "chg-group-empty-entity-aggregates"),
            ("chg-base64-decode-ok", "chg-group-base64-status"),
            ("chg-base64-invalid-blob-empty", "chg-base64-invalid-blob-empty"),
            ("chg-standard-xpath-option", "chg-standard-xpath-option"),
        ):
            page.fill("#search", query)
            assert ids(page) == [entity]
        page.select_option("#source-version", "v19")
        assert ids(page) == []
        page.select_option("#target-version", "v20")
        for query in ("chg-macos-text-lf-option", "chg-macos-xml-lf-option",
                      "chg-text-no-bom-option", "chg-xml-no-bom-option",
                      "chg-windows-directwrite-option", "chg-new-field-null-mapping-default"):
            page.fill("#search", query)
            assert ids(page) == [query]
        page.fill("#search", "chg-new-field-null-mapping-default")
        for locale in ("fr", "de", "es", "ja"):
            page.select_option("#language", locale)
            assert ids(page) == ["chg-new-field-null-mapping-default"]
            assert page.locator(".summary-caveat").count() == 1
        page.select_option("#language", "en")
        # Real upgrade searches over the populated publication, not a fixture.
        page.select_option("#source-version", "v17")
        page.select_option("#target-version", "v18")
        page.fill("#search", "_o_XSLT APPLY TRANSFORMATION")
        assert ids(page) == ["chg-group-xslt-processing"]
        page.fill("#search", "chg-removed-xslt-set-parameter")
        assert ids(page) == ["chg-group-xslt-processing"]
        page.select_option("#target-version", "v20")
        page.select_option("#source-version", "v18")
        page.fill("#search", "_o_NO TRACE")
        assert ids(page) == ["chg-removed-no-trace"]
        page.select_option("#source-version", "v19")
        assert ids(page) == []  # Not newly crossed when already at the removal bucket.
        page.fill("#search", "PHP")
        assert ids(page) == ["chg-group-bundled-php-modules"]
        page.fill("#search", "chg-bundled-php-zip-removal")
        assert ids(page) == ["chg-group-bundled-php-modules"]
        page.fill("#search", "PHP")
        assert "chg-group-xslt-processing" not in ids(page)
        page.select_option("#source-version", "v20")
        page.fill("#search", "PDFCreator")
        assert ids(page) == ["chg-pdfcreator-driver-deprecation"]  # Continuing, not removed.
        page.select_option("#source-version", "v16")
        page.select_option("#target-version", "v21")
        page.fill("#search", "_o_GRAPH TABLE")
        assert ids(page) == []
        page.fill("#search", "_o_CREATE USER FORM")
        assert ids(page) == ["chg-group-user-forms"]
        page.select_option("#source-version", "v20")
        assert ids(page) == ["chg-group-user-forms"]  # Still a deprecation, not a removal.
        page.fill("#search", "13.4")
        assert "chg-http-automatic-variable-assignment" in ids(page)
        page.select_option("#source-version", "v16")
        page.select_option("#target-version", "v17")
        page.fill("#search", "FTP_Progress")
        assert ids(page) == ["chg-group-ftp-progress"]
        page.fill("#search", "_o_AP FULL SCREEN")
        assert ids(page) == ["chg-group-4d-pack-migration"]
        page.select_option("#target-version", "v21")
        page.fill("#search", "OBJET FIXER ACTIVATION")
        assert "chg-group-button-enabled-state" in ids(page)
        # Word matching spans authored prose; the exact stable ID isolates the entity.
        page.fill("#search", "chg-removed-enable-button")
        assert ids(page) == ["chg-group-button-enabled-state"]
        page.fill("#search", "")
        assert ids(page) == expected
        assert page.locator("#sort option").all_text_contents() == ["Severity", "Complexity"]
        assert page.get_by_role("group", name="Platform", exact=True).count() == 1
        assert page.get_by_role("group", name="Topics", exact=True).count() == 1
        check(page, r"""() => {
          const v = document.querySelector('.version-selectors').getBoundingClientRect();
          const f = document.querySelector('.toolbar').getBoundingClientRect();
          return v.bottom < f.top &&
            document.querySelector('#source-version').offsetHeight >
            document.querySelector('#search').offsetHeight;
        }""", "Versions must precede filters and have larger controls")
        check(page, "() => !document.querySelector('#coverage, .view-nav, .scope-notice')",
              "No operational dashboards or scope banners")
        assert "Candidate" not in page.locator("body").inner_text()
        # Verify every version color, not merely the presence of the icon.
        for version, color in PALETTE.items():
            page.select_option("#source-version", version)
            actual = page.locator("#source-icon").evaluate(
                "el => getComputedStyle(el).color")
            rgb = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
            assert actual == f"rgb{rgb}"
            assert page.input_value("#source-version") == version
        page.select_option("#target-version", "latest")
        assert "21 R4" in page.locator("#target-version option:checked").inner_text()
        assert page.locator("#target-icon").evaluate("el => getComputedStyle(el).color") == "rgb(59, 105, 233)"
        page.select_option("#source-version", "v19")
        page.fill("#search", "PHP")
        page.select_option("#sort", "complexity")
        # Scope isolation assertions compare every unrelated control's exact state.
        for group in ("platforms", "modules"):
            other = "modules" if group == "platforms" else "platforms"
            for action in ("none", "all"):
                before = controls(page)
                page.locator(f'[data-group="{group}"][data-select="{action}"]').click()
                after = controls(page)
                for key in ("source", "target", "query", "sort", "language", "theme", other):
                    assert after[key] == before[key], (group, action, key, before, after)
                count = page.locator(f'[name="{group}"]:checked').count()
                assert count == (0 if action == "none" else page.locator(f'[name="{group}"]').count())
                if action == "none":
                    assert ids(page) == []
                    assert page.locator(".empty").is_visible()
            checkbox = page.locator(f'[name="{group}"]').first
            before = controls(page)
            checkbox.uncheck()
            after = controls(page)
            assert all(after[key] == before[key] for key in before if key != group)
            checkbox.check()
        before = controls(page)
        page.click("#reset")
        after = controls(page)
        assert all(after[key] == before[key] for key in ("source", "target", "language", "theme"))
        assert after["query"] == "" and after["sort"] == "severity"
        # Unknown platform facts remain eligible with either OS, without a third toggle.
        page.locator('[data-group=platforms][data-select=none]').click()
        assert ids(page) == []
        page.locator('[name=platforms][value=windows]').check()
        assert {"chg-colon-identifiers", "chg-internal-php-interpreter-removal",
                "chg-project-save-list-call"} <= set(ids(page))
        assert "chg-pdfcreator-driver-deprecation" in ids(page)
        assert "chg-group-macos-native-connectors" not in ids(page)
        page.locator('[name=platforms][value=windows]').uncheck()
        page.locator('[name=platforms][value=macos]').check()
        assert {"chg-colon-identifiers", "chg-internal-php-interpreter-removal",
                "chg-project-save-list-call"} <= set(ids(page))
        assert "chg-pdfcreator-driver-deprecation" not in ids(page)
        page.click("#reset")
        page.select_option("#source-version", "v16")
        page.select_option("#target-version", "v21")
        page.locator("[data-change-id]").first.get_by_text("Evidence", exact=True).click()
        assert page.locator(".evidence-list a").first.is_visible()
        assert page.locator(".evidence-list a").first.get_attribute("href").startswith("https://")
        assert page.locator(".summary-caveat").count() == len(ids(page))
        labels = {"en": ("Filters", "Complexity"), "fr": ("Filtres", "Complexité"),
                  "de": ("Filter", "Komplexität"), "es": ("Filtros", "Complejidad"),
                  "ja": ("フィルター", "対応の難易度")}
        source_languages = {s["id"]: s["language"] for s in catalog["sources"]}
        resource_group = next(c for c in projected_records(catalog) if c["id"] == "chg-group-legacy-resource-commands")
        # Reproduce the reported live path, checking real citation editions, not only IDs.
        page.select_option("#source-version", "v17")
        page.select_option("#target-version", "v18")
        for query in ("chg-numeric-standard-actions", "chg-removed-xslt-apply-transformation"):
            page.fill("#search", query)
            assert len(ids(page)) == 1
            source_ids = page.locator(".evidence-list > li").evaluate_all(
                "items => items.map(item => item.dataset.sourceId)")
            assert source_ids
            assert all(next(s for s in catalog["sources"] if s["id"] == sid)["edition"].split(".")[0]
                       in ("17", "18") for sid in source_ids), source_ids
            assert any("v18-" in sid for sid in source_ids), source_ids
        page.fill("#search", "chg-removed-enable-button")
        assert ids(page) == []  # 18 R2 belongs to the next major interval.
        page.select_option("#source-version", "v16")
        page.select_option("#target-version", "v17")
        page.fill("#search", "chg-cpu-priority-settings")
        assert ids(page) == ["chg-cpu-priority-settings"]
        assert page.locator(".evidence-list").count() == 0
        warning = page.locator('[data-evidence-disposition="unresolved"]')
        assert warning.is_visible() and warning.inner_text() != "pathEvidenceUnavailable"
        page.select_option("#target-version", "latest")
        page.select_option("#source-version", "v21")
        assert not page.locator("#version-warning").is_visible()
        for identifier in ("chg-json-validate-schema-version", "chg-legacy-network-layer-removal",
                           "chg-rest-entityset-release-post"):
            page.fill("#search", identifier)
            assert identifier in ids(page), identifier
        page.fill("#search", "chg-internal-php-interpreter-removal")
        assert ids(page) == []
        page.select_option("#target-version", "v21")
        page.fill("#search", "chg-json-validate-schema-version")
        assert ids(page) == []
        page.select_option("#source-version", "v20")
        page.select_option("#target-version", "latest")
        for identifier in ("chg-time-negative-expression", "chg-open-datastore-password-default",
                           "chg-tls-authentication-branch-fixes"):
            page.fill("#search", identifier)
            assert ids(page) == [identifier]
        page.fill("#search", "chg-icu-77-index-rebuild")
        page.select_option("#language", "de")
        assert ids(page) == ["chg-icu-77-index-rebuild"]
        shown = page.locator(".evidence-list > li").evaluate_all(
            "items => items.map(item => [item.dataset.sourceId,item.dataset.blockId,item.dataset.sourceLanguage])")
        assert len({sid for sid, _, _ in shown}) >= 2
        assert all(language == "en" for _, _, language in shown)
        # Actual old singleton and curated-group conditions/rationales in all locales.
        page.select_option("#source-version", "v16")
        page.select_option("#target-version", "v21")
        by_id = {c["id"]: c for c in catalog["changes"]}
        for locale in ("fr", "ja", "de", "es", "en"):
            page.select_option("#language", locale)
            for identifier in ("chg-colon-identifiers", "chg-group-legacy-resource-commands",
                               "chg-project-save-list-call", "chg-project-standalone-designer-identity",
                               "chg-project-users-blob-export", "chg-label-template-64bit-compatibility",
                               "chg-project-deployed-users-preservation"):
                page.fill("#search", identifier)
                card = page.locator(f'[data-change-id="{identifier}"]')
                card.locator(":scope > details").first.locator(":scope > summary").click()
                text = card.locator("dl").inner_text()
                localized = by_id[identifier]["localizations"][locale]
                assert all(condition in text for condition in localized["conditions"])
                assert localized["action_basis"] in text
                if locale != "en":
                    assert "After successful opening" not in text
                    assert "Editorial recommendation derived" not in text
                    assert "One feature migration with a shared remediation" not in text
                if identifier in {"chg-project-standalone-designer-identity", "chg-project-users-blob-export",
                                   "chg-label-template-64bit-compatibility", "chg-project-deployed-users-preservation"}:
                    shown = card.locator(".evidence-list > li").evaluate_all(
                        "items => items.map(item => [item.dataset.sourceId,item.dataset.sourceLanguage])")
                    assert shown and all(sid.startswith("kb-") and language == "en" for sid, language in shown)
                    links = card.locator(".evidence-list a").evaluate_all("links => links.map(a => a.href)")
                    assert links and all(link.startswith("https://kb.4d.com/assetid=") for link in links)
                    assert "(PDF p." in card.locator(".evidence-list").text_content()
        page.select_option("#language", "en")
        page.fill("#search", "")
        shown_kb = page.locator(".evidence-list > li").evaluate_all(
            "items => [...new Set(items.map(item => item.dataset.sourceId).filter(id => id.startsWith('kb-')))]")
        assert set(shown_kb) == {s["id"] for s in catalog["sources"] if s["family"] == "original-kb-technote"}
        page.select_option("#source-version", "v17")
        page.select_option("#target-version", "v18")
        for identifier in ("chg-project-save-list-call", "chg-project-standalone-designer-identity"):
            page.fill("#search", identifier)
            assert ids(page) == [identifier]
            assert page.locator(".evidence-list > li").evaluate_all(
                "items => items.every(item => !item.dataset.sourceId.startsWith('kb-'))")
        assert page.locator('[data-evidence-disposition="unresolved"]').is_visible()
        page.select_option("#source-version", "v16")
        page.select_option("#target-version", "v21")
        page.fill("#search", "")
        obsolete_details = (
            "Supporting details retain their original language.",
            "Les détails complémentaires conservent leur langue d’origine.",
            "Ergänzende Details bleiben in ihrer Originalsprache.",
            "Los detalles complementarios conservan su idioma original.",
            "補足の詳細は原文の言語で表示します。",
        )
        for locale, (filters, complexity_label) in labels.items():
            page.select_option("#language", locale)
            assert page.locator('[name=platforms]').evaluate_all(
                "(boxes) => boxes.map(box => box.value)") == ["windows", "macos"]
            assert page.locator('[name=platforms][value=linux], [name=platforms][value=unknown]').count() == 0
            other_label = {"en": "Other", "fr": "Autres", "de": "Sonstige",
                           "es": "Otros", "ja": "その他"}[locale]
            topic = page.locator('[name=modules][value=unknown]')
            assert topic.locator("..").inner_text() == other_label
            before = controls(page)
            page.locator('[data-group=modules][data-select=none]').click()
            topic.check()
            assert all(controls(page)[key] == before[key] for key in
                       ("source", "target", "query", "sort", "platforms"))
            assert set(ids(page)) == {record["id"] for record in projected_records(catalog)
                                     if record["modules"] == ["unknown"]}
            page.locator('[data-group=modules][data-select=all]').click()
            assert not any(sentence in page.locator("body").text_content() for sentence in obsolete_details)
            for query in ("DELETE RESOURCE", "SUPPRIMER RESSOURCE"):
                before = controls(page)
                page.fill("#search", query)
                assert "chg-group-legacy-resource-commands" in ids(page)
                card = page.locator('[data-change-id="chg-group-legacy-resource-commands"]')
                authored = card.evaluate("""card => {
                  const copy = card.cloneNode(true);
                  copy.querySelectorAll('.evidence-list').forEach(el => el.remove());
                  return copy.textContent;
                }""")
                assert ("_o_SUPPRIMER RESSOURCE" if locale == "fr" else "_o_DELETE RESOURCE") in authored
                assert ("_o_DELETE RESOURCE" if locale == "fr" else "_o_SUPPRIMER RESSOURCE") not in authored
                expected = [e for e in resource_group["evidence"] if source_languages[e["source_id"]] == locale]
                displayed = card.locator(".evidence-list > li").evaluate_all(
                    "items => items.map(item => [item.dataset.sourceId, item.dataset.blockId, item.dataset.sourceLanguage])")
                assert displayed
                assert displayed == [[e["source_id"], e["block_id"], locale] for e in expected]
                assert all(controls(page)[key] == before[key] for key in before if key != "query")
            page.fill("#search", "")
            assert page.locator(".evidence-list > li").evaluate_all(
                f"items => items.every(item => item.dataset.sourceLanguage === '{locale}' || item.dataset.sourceLanguage === 'en')")
            assert page.locator("html").get_attribute("lang") == locale
            assert page.locator("#filters-heading").inner_text() == filters
            assert page.locator("#sort option[value=complexity]").inner_text() == complexity_label
            for theme in ("light", "dark"):
                page.select_option("#theme", theme)
                assert page.locator("html").get_attribute("data-theme") == theme
                check(page, """() => {
                  const luminance = color => {
                    const channels = color.match(/\\d+/g).slice(0, 3).map(
                      x => +x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
                    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
                  };
                  return [...document.querySelectorAll('button')].every(el => {
                    const style = getComputedStyle(el);
                    const a = luminance(style.color), b = luminance(style.backgroundColor);
                    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5;
                  });
                }""", f"Button text contrast: {locale}/{theme}")
                for width in (1280, 375, 320):
                    page.set_viewport_size({"width": width, "height": 1000})
                    check(page, "() => document.documentElement.scrollWidth <= innerWidth",
                          f"No horizontal overflow: {locale}/{theme}/{width}")
                    check(page, """() => [...document.querySelectorAll('input,select')].every(
                      el => el.labels.length && el.labels[0].textContent.trim()) &&
                      [...document.querySelectorAll('button')].every(
                      el => el.textContent.trim() && el.getAttribute('aria-label') !== '')""",
                          f"Accessible control names: {locale}")
                    assert page.locator(".version-direction").get_attribute("aria-label")
                if screenshots and locale in ("en", "ja"):
                    page.screenshot(path=str(screenshots / f"{locale}-{theme}-mobile.png"), full_page=True)
            before = controls(page)
            page.reload()
            page.wait_for_selector("[data-change-id]")
            assert page.input_value("#language") == before["language"]
            assert page.input_value("#theme") == before["theme"]
        page.select_option("#language", "en")
        page.select_option("#theme", "light")
        page.set_viewport_size({"width": 1280, "height": 1000})
        if screenshots:
            page.screenshot(path=str(screenshots / "en-light-desktop.png"), full_page=True)
        # Exercise actual render/sort using explicitly documented test-only classifications.
        fixture = deepcopy(catalog)
        fixture["changes"] = []
        for identifier, level, severity in (
                ("unknown", "unknown", "blocking"), ("complex", "complex", "high"),
                ("moderate", "moderate", "low"), ("simple-b", "simple", "high"),
                ("simple-a", "simple", "high"), ("severity-unknown", "unknown", "unknown")):
            record = deepcopy(catalog["changes"][0])
            record.pop("members", None)
            record.update(id=identifier, member_ids=[identifier],
                          criticality=severity, platforms=["windows"],
                          complexity={"level": level, "basis": "Test-only documented procedure.",
                                      "evidence_source_ids": [record["evidence"][0]["source_id"]]})
            fixture["changes"].append(record)
        # A deliberately synthetic modern-style entry has German summary text but
        # only English source evidence; summary language must not drive selection.
        english_support = [e for e in resource_group["evidence"] if source_languages[e["source_id"]] == "en"][:2]
        fixture["changes"][0].update(evidence=deepcopy(english_support), modules=["unknown"],
                                     platforms=["unknown"])
        fixture["changes"][0]["identifiers"].append("fixture-modern-english-only")
        page.route("**/data/catalog.json", lambda route: route.fulfill(json=fixture))
        page.reload()
        page.wait_for_selector("[data-change-id]")
        assert ids(page) == ["unknown", "complex", "simple-a", "simple-b", "moderate", "severity-unknown"]
        before = controls(page)
        page.select_option("#sort", "complexity")
        assert ids(page) == ["simple-a", "simple-b", "moderate", "complex", "unknown", "severity-unknown"]
        after = controls(page)
        assert all(before[key] == after[key] for key in before if key != "sort")
        assert "Simple" in page.locator(".card").first.inner_text()
        assert "Unknown last" in page.locator("#sort-hint").inner_text()
        page.select_option("#sort", "severity")
        assert ids(page)[0] == "unknown" and ids(page)[-1] == "severity-unknown"
        fixture["changes"][0].pop("complexity")
        page.reload()
        page.wait_for_selector("[data-change-id]")
        assert "Complexity: Unknown" in page.locator(".card").first.inner_text()
        page.fill("#search", "fixture-modern-english-only")
        page.select_option("#language", "de")
        assert ids(page) == ["unknown"]
        assert page.locator(".evidence-list > li").evaluate_all(
            "items => items.length === 2 && items.every(item => item.dataset.sourceLanguage === 'en')")
        page.locator('[data-group=modules][data-select=none]').click()
        page.locator('[name=modules][value=unknown]').check()
        assert ids(page) == ["unknown"]
        page.locator('[data-group=modules][data-select=all]').click()
        fixture["changes"][0]["evidence"] = [
            e for e in resource_group["evidence"] if source_languages[e["source_id"]] == "fr"][:1]
        page.reload()
        page.wait_for_selector("[data-change-id]")
        page.fill("#search", "fixture-modern-english-only")
        assert ids(page) == ["unknown"]
        assert page.locator(".evidence-list").count() == 0
        page.locator(".card > details").last.locator(":scope > summary").click()
        assert "Keine Belege in dieser Sprache oder auf Englisch verfügbar." in page.locator(".card").inner_text()
        fixture["changes"][0]["evidence"] = deepcopy(english_support)
        page.select_option("#language", "en")
        page.fill("#search", "")
        # Source errors stay contextual to evidence; invalid data and fetch failures are explicit.
        source = next(s for s in fixture["sources"] if s["id"] == fixture["changes"][0]["evidence"][0]["source_id"])
        source["fetch"].update(status="failed", error="Test source unavailable")
        page.reload()
        page.wait_for_selector("[data-change-id]")
        assert page.get_by_text("Test source unavailable", exact=True).first.is_visible()
        assert page.get_by_text("This source could not be checked.", exact=False).first.is_visible()
        fixture["changes"][0]["complexity"] = {"level": "invented"}
        page.reload()
        page.wait_for_selector("#message.error")
        assert ids(page) == []
        page.locator(".references > summary").click()
        assert page.locator("#reference-list a").count() == 0
        assert "could not be loaded" in page.locator("#reference-list").inner_text()
        page.unroute("**/data/catalog.json")
        page.route("**/data/catalog.json", lambda route: route.fulfill(status=503, body="Unavailable"))
        with page.expect_response("**/data/catalog.json") as failed_response:
            page.reload()
        # The app rejects the status before consuming this deliberately failed
        # response. Let its body finish before the next test navigates away.
        assert failed_response.value.body() == b"Unavailable"
        page.wait_for_selector("#message.error")
        assert "reload" in page.locator("#message").inner_text()
        assert ids(page) == []
        page.unroute("**/data/catalog.json")
        page.add_init_script("Storage.prototype.setItem = () => { throw new Error('Denied'); }")
        page.reload()
        page.wait_for_selector("[data-change-id]")
        page.select_option("#language", "en")
        assert "preferences" in page.locator("#message.error").inner_text()
        assert errors == [], errors
        assert failed == [], failed
        context.close()
        browser.close()
    print("Browser checks passed: /migration/, hierarchy, scoped controls, sort, unknowns, "
          "5 locales, themes, mobile, version icons, persistence and errors.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--url", help="Verify an already deployed site against the same local publication inputs")
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory() as directory:
        published = Path(directory)
        publish(ROOT / "site", published)
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=published))
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            run(args.url or f"http://127.0.0.1:{server.server_port}/migration/", args.screenshots, published)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
