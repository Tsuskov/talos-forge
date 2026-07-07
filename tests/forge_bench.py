# Misst Decode-tok/s im Browser für Q4_0 und F32 (bestes von 3 Läufen, n=200).
import re, sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8741/"
RUNS = 3

def measure(page):
    best = 0.0
    for i in range(RUNS):
        page.fill("#prompt", "The old smith")
        page.fill("#n", "200")
        page.fill("#temp", "0.8")
        page.fill("#seed", str(100 + i))
        page.click("#forgeBtn")
        page.wait_for_function("document.getElementById('stats').textContent !== ''", timeout=120000)
        stats = page.text_content("#stats")
        tps = float(re.search(r"([\d.]+) tok/s", stats).group(1))
        best = max(best, tps)
    return best

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(URL)
    page.wait_for_selector("#composer.on", timeout=120000)
    q4 = measure(page)
    page.click("#swapBtn")
    page.wait_for_selector("#composer.on", timeout=120000)
    f32 = measure(page)
    browser.close()

print(f"Q4_0: {q4:.0f} tok/s   F32: {f32:.0f} tok/s")
