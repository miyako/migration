"""Pixel-level checks for external SVG version symbols in all browser engines."""
from functools import partial
from http.server import ThreadingHTTPServer
from io import BytesIO
from tempfile import TemporaryDirectory
from threading import Thread

from PIL import Image
from playwright.sync_api import sync_playwright

from browser_check import Handler, PALETTE, ROOT
from tools.publish import publish


def assert_icon(icon, foreground, background, border):
    image = Image.open(BytesIO(icon.screenshot())).convert("RGB")
    for (x, y), color in (((440, 500), foreground), ((512, 240), background),
                          ((512, 80), border)):
        pixel = image.getpixel((int(x * image.width / 1024), int(y * image.height / 1024)))
        expected = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
        assert all(abs(a - b) <= 2 for a, b in zip(pixel, expected)), (
            icon.get_attribute("id"), (x, y), pixel, expected)


def check_browser(browser, base):
    context = browser.new_context(locale="en")
    context.add_init_script("Object.defineProperty(navigator, 'gpu', {value: undefined})")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base)
    page.wait_for_selector("[data-change-id]")
    for theme in ("light", "dark", "system"):
        page.select_option("#theme", theme)
        for system in ("light", "dark") if theme == "system" else (theme,):
            page.emulate_media(color_scheme=system)
            for width in (1280, 375):
                page.set_viewport_size({"width": width, "height": 1000})
                for version, color in PALETTE.items():
                    page.select_option("#source-version", version)
                    assert_icon(page.locator("#source-icon"),
                                color if version == "v21" else "#FFFFFF",
                                "#FFFFFF" if version == "v21" else color,
                                color if version == "v21" else "#FFFFFF")
                for version in ("v21", "latest"):
                    page.select_option("#target-version", version)
                    assert_icon(page.locator("#target-icon"), PALETTE["v21"],
                                "#FFFFFF", PALETTE["v21"])
    assert not errors, errors
    context.close()


def main():
    with TemporaryDirectory() as directory:
        publish(ROOT / "site", directory)
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=directory))
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                for name in ("chromium", "firefox", "webkit"):
                    browser = getattr(playwright, name).launch(headless=True)
                    try:
                        check_browser(browser, f"http://127.0.0.1:{server.server_port}/migration/")
                        print(f"{name}: glyph, background and ring pixels passed in both selectors, "
                              "all themes and desktop/mobile layouts.")
                    finally:
                        browser.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    main()
