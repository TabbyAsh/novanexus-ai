"""Browser integration test; default uses real localhost hosting and browser APIs.
NOVA_DOM_ADAPTERS=1 explicitly selects an offline DOM-only test with storage/crypto
adapters. Adapter mode does NOT verify native persistence, crypto or navigation.
Run from repo root: python tests/auction-desk/browser.smoke.py
Requires the Playwright Python package and Chromium (or PLAYWRIGHT_CHROMIUM_PATH).
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json
import os
import shutil
import tempfile
import hashlib
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'apps/web/public'
ADAPTER_MODE = os.environ.get('NOVA_DOM_ADAPTERS') == '1'
server = None
if not ADAPTER_MODE:
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_): pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(PUBLIC)))
    Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/tools/auction-desk/index.html'
ASSETS = PUBLIC / 'tools/auction-desk'
core = (ASSETS / 'core.mjs').read_text()
core = core.replace('export async function ', 'async function ').replace('export function ', 'function ').replace('export const ', 'const ')
desk = (ASSETS / 'desk.mjs').read_text(); desk = desk[desk.index('const KEY ='):]
html = (ASSETS / 'index.html').read_text().replace('<script type="module" src="./desk.mjs"></script>', '<script type="module">' + core + '\n' + desk + '</script>')

def load(page, saved=None):
    if not ADAPTER_MODE:
        page.goto(url)
        return
    if not getattr(page, '_nova_digest_exposed', False):
        page.expose_function('__testDigest', lambda data: list(hashlib.sha256(bytes(data)).digest()))
        page._nova_digest_exposed = True
    adapter = r"""<script>
    // TEST ADAPTERS ONLY: browser navigation is restricted in this build environment.
    const __store = new Map();
    const __saved = SAVED_DATA;
    if (__saved !== null) __store.set('nova:auction-desk:v1', __saved);
    Object.defineProperty(window, 'localStorage', {configurable: true, value: {
      getItem: k => __store.has(k) ? __store.get(k) : null,
      setItem: (k,v) => __store.set(k,String(v)), removeItem:k=>__store.delete(k)
    }});
    Object.defineProperty(crypto, 'randomUUID', {configurable: true, value: () => {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
      const h = Array.from(b, v=>v.toString(16).padStart(2,'0')).join('');
      return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
    }});
    Object.defineProperty(crypto, 'subtle', {configurable:true, value: {
      digest: async (_,data) => Uint8Array.from(await window.__testDigest(Array.from(new Uint8Array(data)))).buffer
    }});
    </script>""".replace('SAVED_DATA', json.dumps(saved))
    # Wrap the adapter in a scope so set_content can reconstruct the DOM again.
    adapter = adapter.replace('<script>', '<script>{').replace('</script>', '}</script>')
    page.set_content(html.replace('<body>', '<body>' + adapter), wait_until='load')
    page.wait_for_function("document.querySelector('#save-status').textContent !== 'Loading workspace…'")

checks = []
def passed(name):
    checks.append(name)
    print(f'PASS: {name}', flush=True)

try:
    with sync_playwright() as p:
        executable = os.environ.get('PLAYWRIGHT_CHROMIUM_PATH') or shutil.which('chromium')
        browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page = context.new_page()
        errors = []
        requests = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: requests.append(r.url))
        load(page)
        expect(page.locator('#status')).to_have_text('NEEDS DATA')
        expect(page.locator('#ceiling')).to_have_text('Unknown')
        expect(page.locator('#lock')).to_be_disabled()
        expect(page.locator('#history')).to_contain_text('No locked forecasts')
        passed('empty start: no fake activity or fabricated values')
        screenshot_dir = os.environ.get('NOVA_SCREENSHOT_DIR')
        if screenshot_dir:
            Path(screenshot_dir).mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(Path(screenshot_dir) / 'auction-desk-empty-desktop.png'), full_page=True)
        page.locator('#title').fill('SYNTHETIC TEST <img src=x onerror="window.pwned=1">')
        page.locator('#auctionUrl').fill('https://example.test/auction/1')
        page.locator('#capitalLimit').fill('1000')
        page.locator('#minimumProfit').fill('20')
        page.get_by_role('button', name='Add item', exact=True).click()
        page.get_by_label('Description / identity', exact=True).fill('SYNTHETIC item')
        page.get_by_label('LOW / unit ($)', exact=True).fill('200')
        page.get_by_label('MID / unit ($)', exact=True).fill('300')
        page.get_by_label('HIGH / unit ($)', exact=True).fill('400')
        page.get_by_label('Evidence reference(s): source URL, vault record, photo ID or source hash', exact=True).fill('fixture:test-not-market-evidence')
        for field in page.locator('#cost-fields input').all(): field.fill('0')
        page.locator('#cost-bid').fill('100')
        page.locator('#taxBase').select_option('bid+premium')
        expect(page.locator('#ceiling')).to_have_text('$180.00')
        expect(page.locator('#status')).to_have_text('HUMAN REVIEW')
        passed('real input events calculate the expected low-case ceiling')
        page.locator('#cost-cleanup').fill('')
        expect(page.locator('#ceiling')).to_have_text('Unknown')
        expect(page.locator('#lock')).to_be_disabled()
        page.locator('#cost-cleanup').fill('0')
        passed('blank cost immediately removes calculated ceiling and disables locking')
        page.locator('#lock').click()
        expect(page.locator('#history .record')).to_have_count(1)
        assert page.evaluate('window.pwned') is None
        assert page.locator('#history img').count() == 0
        passed('forecast locks; injected markup is displayed as text, never executed')
        page.get_by_label('HIGH / unit ($)', exact=True).fill('500')
        stored = page.evaluate('JSON.parse(localStorage.getItem("nova:auction-desk:v1"))')
        assert stored['forecasts'][0]['input']['items'][0]['high'] == 400
        load(page, page.evaluate('localStorage.getItem("nova:auction-desk:v1")'))
        expect(page.get_by_label('HIGH / unit ($)', exact=True)).to_have_value('500')
        expect(page.locator('#history .record')).to_have_count(1)
        passed('DOM reconstruction restores adapter-stored draft without mutating locked inputs')
        page.locator('#outcome-status').select_option('won')
        page.locator('#outcome-winningBid').fill('100')
        page.locator('#outcome-grossSales').fill('280')
        page.locator('#outcome-totalCashCost').fill('150')
        page.locator('#outcome-ownerHours').fill('2')
        page.locator('#outcome-finalized').check()
        page.locator('#record-outcome').click()
        expect(page.locator('#learning')).to_contain_text('1 reconciled wins')
        expect(page.locator('#learning')).to_contain_text('$130.00')
        passed('actual outcomes drive realized profit and forecast-error record')
        page.locator('#lock').click()
        expect(page.locator('#message')).to_contain_text('already has an outcome')
        expect(page.locator('#history .record')).to_have_count(1)
        passed('known outcome cannot be recycled as a new prospective forecast')
        with page.expect_download() as download:
            page.locator('#export').click()
        exported = json.loads(Path(download.value.path()).read_text())
        assert len(exported['forecasts']) == 1 and len(exported['outcomes']) == 1
        corrupt = json.loads(json.dumps(exported))
        corrupt['forecasts'][0]['input']['costs']['bid'] += 1
        page.locator('#import-file').set_input_files({'name': 'tampered.json', 'mimeType': 'application/json', 'buffer': json.dumps(corrupt).encode()})
        expect(page.locator('#message')).to_contain_text('hash mismatch')
        assert len(page.evaluate('JSON.parse(localStorage.getItem("nova:auction-desk:v1")).forecasts')) == 1
        passed('export is real JSON; tampered import fails without replacing good state')
        fresh_context = browser.new_context(viewport={'width': 390, 'height': 844})
        fresh = fresh_context.new_page()
        load(fresh)
        fresh.on('dialog', lambda dialog: dialog.accept())
        fresh.locator('#import-file').set_input_files({'name': 'ledger.json', 'mimeType': 'application/json', 'buffer': json.dumps(exported).encode()})
        expect(fresh.locator('#history .record')).to_have_count(1)
        expect(fresh.locator('#learning')).to_contain_text('1 reconciled wins')
        assert fresh.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        passed('fresh adapted DOM imports history; mobile layout fits viewport')
        fresh.locator('#cost-buyerPremiumPct').fill('101')
        expect(fresh.locator('#status')).to_have_text('INVALID')
        expect(fresh.locator('#lock')).to_be_disabled()
        passed('out-of-range costs cannot be locked from the UI')
        fresh.evaluate('localStorage.setItem("nova:auction-desk:v1", "BROKEN ORIGINAL DATA")')
        load(fresh, fresh.evaluate('localStorage.getItem("nova:auction-desk:v1")'))
        expect(fresh.locator('#save-status')).to_contain_text('autosave paused')
        fresh.get_by_role('button', name='Add item', exact=True).click()
        assert fresh.evaluate('localStorage.getItem("nova:auction-desk:v1")') == 'BROKEN ORIGINAL DATA'
        passed('corrupted saved data is preserved, not overwritten with an empty ledger')
        fresh_context.close()
        assert not errors, errors
        assert all(r.startswith('blob:') or (not ADAPTER_MODE and r.startswith(f'http://127.0.0.1:{server.server_port}/')) for r in requests), requests
        passed('no page JavaScript errors or network requests under explicit test adapters')
        mobile = browser.new_context(viewport={'width': 390, 'height': 844})
        mp = mobile.new_page(); load(mp)
        if screenshot_dir: mp.screenshot(path=str(Path(screenshot_dir) / 'auction-desk-empty-mobile.png'), full_page=True)
        mobile.close(); context.close(); browser.close()
    print(json.dumps({'passed': len(checks), 'checks': checks, 'data': 'SYNTHETIC TEST FIXTURES ONLY', 'mode': 'dom_adapters' if ADAPTER_MODE else 'native_browser', 'limitations': 'In-memory storage, Python SHA adapter; native navigation/storage/crypto not exercised' if ADAPTER_MODE else 'Local static hosting; full Next.js application and live providers not exercised'}, indent=2))
finally:
    if server:
        server.shutdown()
        server.server_close()
