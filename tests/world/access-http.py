#!/usr/bin/env python3
"""Exercise the built Next app against an isolated, synthetic auth service."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError, URLError
import subprocess, os, time, json, shutil, io, zipfile, hashlib
root=Path(__file__).resolve().parents[2]
web=root/'apps/web'
standalone=web/'.next/standalone/apps/web'
assert (standalone/'server.js').exists(), 'Build @nova/web first (standalone output).'
for source,target in [(web/'public',standalone/'public'),(web/'.next/static',standalone/'.next/static')]:
    shutil.copytree(source,target,dirs_exist_ok=True)
class Auth(BaseHTTPRequestHandler):
    def do_GET(self):
        token=self.headers.get('Authorization','')
        allowed=token in ('Bearer test-owner','Bearer test-tenant')
        self.send_response(200 if allowed else 401); self.send_header('Content-Type','application/json'); self.end_headers()
        self.wfile.write(json.dumps({'success':allowed,'data':{'user':{'id':'synthetic-owner' if token.endswith('owner') else 'synthetic-tenant','email':'test@example.invalid','status':'ACTIVE'},'role':'OWNER','scopes':['ops.admin'] if token.endswith('owner') else []}}).encode())
    def log_message(self,*args): pass
mock=ThreadingHTTPServer(('127.0.0.1',0),Auth)
Thread(target=mock.serve_forever,daemon=True).start()
# Choose an unused web port independently of the synthetic backend.
import socket
with socket.socket() as s: s.bind(('127.0.0.1',0)); port=s.getsockname()[1]
env={**os.environ,'PORT':str(port),'HOSTNAME':'127.0.0.1','BACKEND_URL':f'http://127.0.0.1:{mock.server_port}','NODE_ENV':'production','NOVA_PRIVATE_DESK_URL':'https://synthetic-desk.example.invalid','NOVA_PRIVATE_ATLAS_URL':'https://synthetic-atlas.example.invalid','NOVA_PRIVATE_ARCHIVES_JSON':json.dumps([{'name':'Synthetic archive','kind':'Test fixture','detail':'No personal data','href':'https://synthetic-archive.example.invalid'}])}
log=io.StringIO()
process=subprocess.Popen(['node',str(standalone/'server.js')],cwd=web,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
opener=build_opener(ProxyHandler({})); base=f'http://127.0.0.1:{port}'
checks=0
private_markers=['synthetic-desk.example.invalid','synthetic-atlas.example.invalid','synthetic-archive.example.invalid','synthetic-owner']
def fetch(path,method='GET',headers=None):
    try: response=opener.open(Request(base+path,headers=headers or {},method=method),timeout=10)
    except HTTPError as e: response=e
    return response.status,response.headers,response.read()
def check(condition,message):
    global checks
    assert condition,message
    checks+=1
try:
    for _ in range(100):
        try: fetch('/api/version'); break
        except (URLError,ConnectionError): time.sleep(.1)
    else: raise AssertionError('Next server failed to start.')
    for route in ['/','/about','/contact','/office','/products','/privacy','/start']:
        status,headers,data=fetch(route); body=data.decode()
        check(status==200,f'{route} failed')
        check(not any(x in body for x in private_markers),f'{route} exposes personal data or private destinations')
    for path in ['/world','/world/lab']:
        for cookie in [None,'nova_world_session=forged.jwt.value','nova_world_session=test-tenant']:
            status,headers,data=fetch(path,headers={'Cookie':cookie} if cookie else {})
            check(status==200 and b'PRIVATE WORKSPACE / LOCKED' in data,f'{path} gate missing')
            check(not any(x.encode() in data for x in private_markers),f'{path} leaked private props')
        check('no-store' in headers.get('Cache-Control',''),f'{path} can be cached')
    status,headers,data=fetch('/api/world/downloads/lens')
    check(status==401 and not data.startswith(b'PK'),'Anonymous package download succeeded')
    status,headers,data=fetch('/api/world/session','POST',{'Origin':'https://evil.example','Authorization':'Bearer test-owner'})
    check(status==403,'Cross-origin login succeeded')
    status,headers,data=fetch('/api/world/session','POST',{'Origin':base,'Authorization':'Bearer test-tenant'})
    check(status==403 and 'test-tenant' not in headers.get('Set-Cookie',''),'Tenant owner received private session')
    status,headers,data=fetch('/api/world/session','POST',{'Origin':base,'Authorization':'Bearer test-owner'})
    check(status==200,f'Verified owner could not enter: HTTP {status} {data.decode()}')
    cookie=headers.get('Set-Cookie','')
    check(all(s in cookie.lower() for s in ['httponly','secure','samesite=strict','path=/']),'Session protections missing')
    owner_headers={'Cookie':'nova_world_session=test-owner'}
    status,headers,data=fetch('/world',headers=owner_headers)
    check(status==200 and b'See the opening.' in data and b'synthetic-desk.example.invalid' in data,'Private desk unavailable to verified owner')
    check('no-store' in headers.get('Cache-Control',''),'Private desk cacheable')
    status,headers,data=fetch('/api/world/downloads/lens',headers=owner_headers)
    check(status==200 and data.startswith(b'PK'),'Verified download failed')
    check(hashlib.sha256(data).hexdigest()==headers.get('X-Content-SHA256'),'Package hash mismatch')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        check(all(n.startswith('Nova-Lens/') and '..' not in Path(n).parts for n in archive.namelist()),'Unsafe archive paths')
        check(json.loads(archive.read('Nova-Lens/manifest.json'))['version']=='0.2.2','Wrong Lens version')
        check('Nova-Lens/auction-core.mjs' in archive.namelist(),'Cost engine missing')
        check(b'nova-lens-watch' in archive.read('Nova-Lens/background.js'),'Watch worker missing from package')
        check(b'abackend-production' not in archive.read('Nova-Lens/background.js'),'Legacy network worker packaged')
    status,headers,data=fetch('/api/world/session','DELETE',{'Origin':base})
    check(status==200 and 'Max-Age=0' in headers.get('Set-Cookie',''),'Lock did not expire session')
    for asset in (web/'.next/static').rglob('*.js'):
        text=asset.read_text(errors='replace')
        check(not any(x in text for x in private_markers[:3]),f'Private directory leaked into client bundle {asset.name}')
    print(f'PASS: {checks} HTTP / bundle checks; public privacy, locked routes, tenant rejection, verified owner, package contents and lock.')
finally:
    process.terminate()
    try: process.wait(timeout=5)
    except subprocess.TimeoutExpired: process.kill()
    mock.shutdown(); mock.server_close()
