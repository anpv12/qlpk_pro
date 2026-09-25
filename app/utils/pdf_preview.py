import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright


STATIC_ROOT = Path(__file__).resolve().parents[1] / 'static'
ORIGIN = 'https://pdf.qlpk.invalid'
MAX_HTML_BYTES = 8 * 1024 * 1024


def static_asset(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'pdf.qlpk.invalid':
        return None
    path = unquote(parsed.path)
    if not path.startswith('/static/'):
        return None
    candidate = (STATIC_ROOT / path[len('/static/'):]).resolve()
    if not candidate.is_relative_to(STATIC_ROOT) or not candidate.is_file():
        return None
    if candidate.suffix.lower() not in {'.css', '.png', '.jpg', '.jpeg', '.svg', '.woff2', '.woff', '.ttf'}:
        return None
    return candidate


def prepare_html(html):
    if not isinstance(html, str) or not html.strip() or len(html.encode()) > MAX_HTML_BYTES:
        raise ValueError('Tài liệu PDF rỗng hoặc vượt quá 8 MB')
    soup = BeautifulSoup(html, 'html.parser')
    for element in soup.select('script, base, iframe, object, embed, meta[http-equiv], .action-buttons'):
        element.decompose()
    for element in soup.find_all(True):
        for attribute in list(element.attrs):
            if attribute.lower().startswith('on'):
                del element[attribute]
    for link in soup.select('link[href]'):
        href = link['href']
        if 'bootstrap@5.3.2/dist/css/bootstrap.min.css' in href:
            link['href'] = '/static/vendor/pdf/bootstrap.min.css'
        elif urlsplit(href).netloc:
            link.decompose()
    for element in soup.select('[src], link[href]'):
        attribute = 'src' if element.has_attr('src') else 'href'
        value = element[attribute]
        if urlsplit(value).path.startswith('/static/'):
            element[attribute] = urlsplit(value).path
    return str(soup)


def render_pdf(html):
    html = prepare_html(html)
    with sync_playwright() as runtime:
        executable = os.environ.get('QLPK_PDF_BROWSER_PATH')
        browser = runtime.chromium.launch(executable_path=executable, headless=True)
        try:
            context = browser.new_context(service_workers='block')
            page = context.new_page()
            page.set_default_timeout(15000)

            def handle_resource(route):
                if route.request.url == ORIGIN + '/document':
                    route.fulfill(status=200, content_type='text/html; charset=utf-8', body=html, headers={
                        'Content-Security-Policy': "default-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'"
                    })
                    return
                asset = static_asset(route.request.url)
                if asset:
                    route.fulfill(status=200, content_type=mimetypes.guess_type(str(asset))[0] or 'application/octet-stream', body=asset.read_bytes())
                else:
                    route.abort()

            context.route('**/*', handle_resource)
            page.goto(ORIGIN + '/document', wait_until='load')
            page.add_style_tag(content='''
                @font-face { font-family: Roboto; src: url('/static/vendor/pdf/roboto-vietnamese-400-normal.woff2') format('woff2'); unicode-range: U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB; }
                @font-face { font-family: Roboto; src: url('/static/vendor/pdf/roboto-latin-400-normal.woff2') format('woff2'); unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
            ''')
            page.evaluate((STATIC_ROOT / 'vendor/pdf/JsBarcode.all.min.js').read_text())
            page.evaluate('''async () => {
                document.querySelectorAll('.barcode-svg').forEach(svg => {
                    const code = svg.dataset.barcode || (svg.id.startsWith('barcode-') ? svg.id.slice(8) : '');
                    if (code) window.JsBarcode(svg, code, {format: 'CODE128', width: 1.5, height: 35, displayValue: false, margin: 0});
                });
                await document.fonts.ready;
                await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => null)));
                if (Array.from(document.querySelectorAll('img[data-required-print-asset]')).some(image => !image.naturalWidth)) {
                    throw new Error('Thiếu mã QR xác thực');
                }
            }''')
            return page.pdf(format='A4', print_background=True, prefer_css_page_size=True)
        finally:
            browser.close()


if __name__ == '__main__':
    import sys
    sys.stdout.buffer.write(render_pdf(sys.stdin.read()))
