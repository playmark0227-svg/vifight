import http.server
import os

PORT = 8080
DIRECTORY = "/Users/kuboayumu/Desktop/claude/ViFight"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

os.chdir(DIRECTORY)
with http.server.HTTPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
