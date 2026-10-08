"""Bundle the existing app for Apps Script; preserve the kiosk RPC iframe."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = 'https://joe4816.github.io/passkiosk/'

def script(source):
    return '<script>\n' + source.replace('</script', '<\\/script') + '\n</script>'

def build():
    html = (ROOT / 'index.html').read_text()
    # Google may use multiple wrapper frames. Detect the GitHub embedding
    # origin across the full ancestor chain rather than counting wrappers.
    flags = "window.PASSKIOSK_EMBEDDED_BRIDGE=Array.from(window.location.ancestorOrigins||[]).includes('https://joe4816.github.io');window.PASSKIOSK_NATIVE_STAFF=!window.PASSKIOSK_EMBEDDED_BRIDGE;if(window.PASSKIOSK_EMBEDDED_BRIDGE)document.documentElement.setAttribute('data-embedded','');"
    html = html.replace('<head>', '<head><base target="_top">'+script(flags))
    html = re.sub(r'<link rel="(?:manifest|icon)"[^>]+>', '', html)
    html = re.sub(r'<link rel="stylesheet"[^>]+>', '<style>html[data-embedded] body{display:none}\n'+(ROOT/'styles.css').read_text()+'</style>', html)
    sources = re.findall(r'<script defer src="([^"]+)"[^>]*></script>', html)
    html = re.sub(r'<script defer src="[^"]+"[^>]*></script>', '', html)
    js = []
    for path in sources:
        path = path.split('?')[0]
        if path == 'bridge.js':
            path = 'js/native-staff-bridge.js'
        js.append(script((ROOT/path).read_text()))
    legacy = (ROOT/'apps-script/Bridge.html').read_text()
    legacy_js = re.search(r'<script>(.*?)</script>', legacy, re.S).group(1)
    js.append(script('if(window.PASSKIOSK_EMBEDDED_BRIDGE){\n'+legacy_js+'\n}'))
    html = html.replace('</body>', '\n'.join(js)+'\n</body>')
    html = html.replace('src="assets/', 'src="'+PUBLIC+'assets/')
    html = html.replace("url('assets/", "url('"+PUBLIC+'assets/')
    html = html.replace('url("assets/', 'url("'+PUBLIC+'assets/')
    (ROOT/'apps-script/StaffBridge.html').write_text(html)
    return html

if __name__ == '__main__':
    print('Built StaffBridge.html:', len(build()), 'characters')
