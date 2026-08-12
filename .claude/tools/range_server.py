#!/usr/bin/env python3
"""Minimal static file server with HTTP Range support, for local verification
only. Python 3.9's stdlib http.server does not support byte-range requests
(added upstream only in 3.11), which breaks HTML5 <video> seeking entirely.
This is NOT part of the shipped site — Vercel's static hosting supports Range
requests natively, so this limitation does not exist in production."""
import http.server
import os
import re
import socketserver
import sys

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.exists(path):
            self.send_error(404, "File not found")
            return None

        ctype = self.guess_type(path)
        file_size = os.path.getsize(path)
        range_header = self.headers.get("Range")

        f = open(path, "rb")
        if range_header:
            m = RANGE_RE.match(range_header)
            if m:
                start = int(m.group(1)) if m.group(1) else 0
                end = int(m.group(2)) if m.group(2) else file_size - 1
                end = min(end, file_size - 1)
                length = end - start + 1

                self.send_response(206)
                self.send_header("Content-type", ctype)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(length))
                self.end_headers()
                f.seek(start)
                return _LimitedReader(f, length)

        self.send_response(200)
        self.send_header("Content-type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(file_size))
        self.end_headers()
        return f


class _LimitedReader:
    """Wraps a file object so copyfile() only reads `remaining` bytes."""

    def __init__(self, f, remaining):
        self.f = f
        self.remaining = remaining

    def read(self, size=-1):
        if self.remaining <= 0:
            return b""
        if size < 0 or size > self.remaining:
            size = self.remaining
        data = self.f.read(size)
        self.remaining -= len(data)
        return data

    def close(self):
        self.f.close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), RangeHTTPRequestHandler) as httpd:
        print(f"Range-capable server on http://127.0.0.1:{port}")
        httpd.serve_forever()
