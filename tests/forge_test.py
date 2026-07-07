# E2E-Test: Weiterschmieden setzt die Session exakt fort (KV-Cache + RNG).
# Beweis: seed=42, 32 Tokens am Stück == 16 Tokens + Weiterschmieden(16).
import sys, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8741/"

def new_page(browser):
    page = browser.new_page()
    page.on("pageerror", lambda e: print("PAGE ERROR:", e))
    page.goto(URL)
    page.wait_for_selector("#composer.on", timeout=120000)
    return page

def run_forge(page, prompt, n, seed):
    page.fill("#prompt", prompt)
    page.fill("#n", str(n))
    page.fill("#temp", "0.8")
    page.fill("#seed", str(seed))
    page.click("#forgeBtn")
    page.wait_for_function("document.getElementById('stats').textContent !== ''", timeout=120000)
    return page.text_content("#gen"), page.text_content("#echo"), page.text_content("#stats")

def continue_forge(page):
    before = page.text_content("#gen")
    t0 = time.time()
    page.click("#againBtn")
    page.wait_for_function(
        f"document.getElementById('gen').textContent.length > {len(before)}", timeout=120000)
    first_chunk_ms = (time.time() - t0) * 1000
    page.wait_for_function("document.getElementById('stats').textContent !== ''", timeout=120000)
    return before, page.text_content("#gen"), page.text_content("#stats"), first_chunk_ms

with sync_playwright() as p:
    browser = p.chromium.launch()

    p1 = new_page(browser)
    ref_gen, _, ref_stats = run_forge(p1, "Der alte Schmied", 32, 42)
    print("Referenz (n=32):", repr(ref_gen))
    print("Stats Referenz :", ref_stats)

    # Langer Prompt: Prefill-Fortschritt muss sichtbar werden (echoHot füllt
    # sich) und die Stats müssen die Prefill-Zeit ausweisen.
    long_prompt = "The smith struck the glowing iron upon the anvil. " * 8
    p1.fill("#prompt", long_prompt)
    p1.fill("#n", "4")
    p1.fill("#seed", "7")
    hot_seen = p1.evaluate("""() => new Promise((res) => {
      const hot = document.getElementById('echoHot');
      const obs = new MutationObserver(() => {
        const len = hot.textContent.length;
        if (len > 0 && len < %d) { obs.disconnect(); res(len); }
      });
      obs.observe(hot, { childList: true, characterData: true, subtree: true });
      document.getElementById('forgeBtn').click();
      setTimeout(() => { obs.disconnect(); res(-1); }, 60000);
    })""" % len(long_prompt))
    p1.wait_for_function("document.getElementById('stats').textContent !== ''", timeout=120000)
    long_stats = p1.text_content("#stats")
    hot_after = p1.text_content("#echoHot")
    print("Stats langer Prompt:", long_stats)
    print("Partieller Glüh-Stand gesehen:", hot_seen, "Zeichen")

    # Modell-Wechsel: Standard ist Q4_0, der Chip-Link lädt F32 und zurück.
    chips_q4 = p1.text_content("#chips")
    p1.click("#swapBtn")
    p1.wait_for_selector("#composer.on", timeout=120000)
    chips_f32 = p1.text_content("#chips")
    f32_gen, _, f32_stats = run_forge(p1, "Der alte Schmied", 8, 42)
    print("Chips Q4 :", chips_q4)
    print("Chips F32:", chips_f32)
    print("F32-Lauf :", repr(f32_gen), "·", f32_stats)
    p1.close()

    p2 = new_page(browser)
    half_gen, half_echo, _ = run_forge(p2, "Der alte Schmied", 16, 42)
    print("Hälfte   (n=16):", repr(half_gen))
    before, after, stats2, ms = continue_forge(p2)
    print("Fortgesetzt    :", repr(after))
    print(f"Erster Chunk nach Weiterschmieden: {ms:.0f} ms")
    print("Stats Lauf 2   :", stats2)
    echo_after = page_echo = p2.text_content("#echo")

    browser.close()

ok = True
def check(cond, name):
    global ok
    print(("PASS: " if cond else "FAIL: ") + name)
    ok = ok and cond

check(after.startswith(before), "Text wird angehängt, nicht ersetzt")
check(after == ref_gen, "16+16 fortgesetzt == 32 am Stück (RNG/KV-Kontinuität)")
check(half_echo == "Der alte Schmied" and echo_after == "Der alte Schmied", "Prompt-Echo unverändert")
check("Prefill" in long_stats, "Stats weisen Prefill-Zeit aus")
check("Q4_0 ·" in chips_q4 and "F32 laden" in chips_q4, "Standard-Modell ist Q4_0 mit F32-Link")
check("F32 ·" in chips_f32 and "Q4_0 laden" in chips_f32, "Wechsel auf F32 klappt")
check(len(f32_gen) > 0 and "tok/s" in f32_stats, "F32-Modell generiert nach dem Wechsel")
check("Prefill" not in stats2, "Fortsetzung ohne Prefill (kein Prefill in Stats)")
check(hot_seen > 0, "Prefill-Glühen partiell sichtbar (echoHot füllt sich)")
check(hot_after == "", "Echo kühlt nach dem Lauf wieder ab")
sys.exit(0 if ok else 1)
