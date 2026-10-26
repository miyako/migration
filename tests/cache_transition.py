"""Real HTTP-cache deployment checks, shared by the optional browser suite."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import hashlib
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from threading import Thread


class ReleaseHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.server.requests.append(self.path)
        self.directory = str(self.server.release)
        if not self.path.startswith("/migration/"):
            self.send_error(404)
            return
        self.path = self.path.removeprefix("/migration")
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "max-age=600")
        super().end_headers()

    def log_message(self, *args):
        pass


def transition(browser, root, target, expect_failure, previous=None):
    with TemporaryDirectory() as directory:
        old = Path(directory)
        for name in ("index.html", "app.mjs", "logic.mjs", "styles.css"):
            content = subprocess.check_output(
                ["git", "show", f"fc6054b:site/{name}"], cwd=root)
            (old / name).write_bytes(content)
        (old / "data").mkdir()
        (old / "data/catalog.json").write_bytes((root / "site/data/catalog.json").read_bytes())
        server = ThreadingHTTPServer(("127.0.0.1", 0), ReleaseHandler)
        server.release, server.requests = previous or old, []
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        context = browser.new_context()
        context.add_init_script("Object.defineProperty(navigator, 'gpu', {value: undefined})")
        try:
            page = context.new_page()
            errors, responses = [], []
            page.on("pageerror", lambda error: errors.append(error.stack or str(error)))
            page.on("response", lambda response: responses.append(response))
            base = f"http://127.0.0.1:{server.server_port}/migration/"
            page.goto(base)
            page.wait_for_selector("#change-list .card")
            assert not errors, errors
            assert any(r.url.endswith("/app.mjs") and
                       r.headers.get("cache-control") == "max-age=600" for r in responses)
            primed_app = next(r for r in responses if r.url.endswith("/app.mjs")).body()
            server.release = target
            server.requests.clear()
            responses.clear()
            cached, requests = [], {}
            cdp = context.new_cdp_session(page)
            cdp.send("Network.enable")
            cdp.on("Network.requestWillBeSent", lambda event:
                   requests.update({event["requestId"]: event["request"]["url"]}))
            cdp.on("Network.requestServedFromCache", lambda event:
                   cached.append(event["requestId"]))
            # A new navigation URL fetches new markup without invalidating fresh modules.
            navigation = page.goto(base + "?navigation=next")
            assert navigation.status == 200
            assert navigation.body() == (target / "index.html").read_bytes()
            page.wait_for_load_state("networkidle")
            if expect_failure:
                assert any("replaceChildren" in error and "renderCoverage" in error
                           for error in errors), errors
                assert "/migration/app.mjs" not in server.requests, server.requests
                assert any(requests[r].endswith("/app.mjs") for r in cached), (cached, requests)
                reused_app = next(r for r in responses if r.url.endswith("/app.mjs"))
                assert reused_app.body() == primed_app
                assert page.locator("#coverage").count() == 0
                print("Reproduced: new HTML + HTTP-cached fc6054b app.mjs; "
                      "replaceChildren pageerror, no app.mjs network request.")
                print(f"  Cached {reused_app.url} SHA256={hashlib.sha256(primed_app).hexdigest()}")
            else:
                page.wait_for_selector("[data-change-id]")
                assert not errors, errors
                assert any("/assets/" in path and path.endswith("/app.mjs")
                           for path in server.requests), server.requests
                assert any("/assets/" in path and path.endswith("/logic.mjs")
                           for path in server.requests), server.requests
                assert any("/assets/" in path and path.endswith("/styles.css")
                           for path in server.requests), server.requests
                app_path = page.locator('script[type="module"]').get_attribute("src")
                release = app_path.removesuffix("/app.mjs").removeprefix("./")
                for name in ("app.mjs", "logic.mjs", "styles.css", "4d.svg", "data/catalog.json"):
                    response = next(r for r in responses if r.url == base + release + "/" + name)
                    assert response.status == 200
                    assert response.body() == (target / release / name).read_bytes()
                print(f"  Loaded {base}{release}/app.mjs "
                      f"SHA256={hashlib.sha256((target / release / 'app.mjs').read_bytes()).hexdigest()}")
                cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
                page.reload()
                page.wait_for_selector("[data-change-id]")
                assert not errors, errors
                print("Fixed transition: fresh release-scoped app/logic/styles, "
                      "startup and cache-disabled hard reload without pageerrors.")
        finally:
            context.close()
            server.shutdown()
            server.server_close()
            thread.join()
