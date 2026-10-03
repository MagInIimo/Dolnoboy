import http.server
import pathlib
import sys
import urllib.parse

root = pathlib.Path(sys.argv[1]).resolve()
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8787

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)

    def do_GET(self):
        request_path = urllib.parse.urlsplit(self.path).path
        if '--qa' in sys.argv and request_path in ('/', '/index.html', '/qa-bundle.js'):
            if request_path == '/qa-bundle.js':
                content = (root.parent / 'tmp/qa/qa-bundle.js').read_bytes()
                mime = 'application/javascript; charset=utf-8'
            else:
                content = (root / 'index.html').read_text(encoding='utf-8').replace('src="app.js"', 'src="/qa-bundle.js"').encode('utf-8')
                mime = 'text/html; charset=utf-8'
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        if urllib.parse.urlsplit(self.path).path == '/sdk.js':
            fixture = root.parent / 'tools' / 'sdk-fixture.js'
            content = fixture.read_bytes() if fixture.exists() and '--mock-sdk' in sys.argv else b'void 0;'
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        if len(args) > 1 and str(args[1]) not in ('200', '304'):
            super().log_message(fmt, *args)

class GameServer(http.server.ThreadingHTTPServer):
    request_queue_size = 64

print(f'Serving {root} on http://127.0.0.1:{port}', flush=True)
GameServer(('127.0.0.1', port), Handler).serve_forever()
