#!/usr/bin/env python3
"""Dev server that tells the browser never to cache.

Plain `python3 -m http.server` sends no cache headers, so Chrome happily
reuses ES modules across edits and you end up testing stale code.
"""
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', PORT), NoCache) as httpd:
    print(f'serving on http://localhost:{PORT}')
    httpd.serve_forever()
