"""Attempt Render blueprint deploy if dashboard session exists."""

from __future__ import annotations

import sys
import time

from playwright.sync_api import sync_playwright

REPO = "https://github.com/zeiasyed/oc-web-previews"
URL = f"https://render.com/deploy?repo={REPO.replace(':', '%3A')}"


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
        time.sleep(3)
        print("url:", page.url)
        print("title:", page.title())
        body = page.inner_text("body")[:2000]
        print("body:", body)
        if "sign in" in body.lower() or "log in" in body.lower():
            print("NEEDS_LOGIN", file=sys.stderr)
            browser.close()
            return 2
        # Try to click through blueprint apply if visible
        for label in ("Apply", "Create Blueprint", "Deploy Blueprint", "Deploy"):
            btn = page.get_by_role("button", name=label)
            if btn.count():
                btn.first.click(timeout=5000)
                print(f"clicked {label}")
                break
        time.sleep(10)
        print("final url:", page.url)
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
