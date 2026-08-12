// Yerel geliştirme sunucusu — SADECE local test için, deploy edilmez.
// Statik dosyaları servis eder + /api/*.js dosyalarını Vercel serverless
// fonksiyon imzasıyla (module.exports = async (req, res) => {}) çalıştırır.
// Kullanım: node --env-file=.env.local .claude/tools/dev-server.js [port]

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..", "..");
const PORT = Number(process.argv[2]) || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function handleApi(req, res, pathname) {
  const modulePath = path.join(ROOT, "api", pathname.replace(/^\/api\//, "") + ".js");
  if (!modulePath.startsWith(path.join(ROOT, "api"))) return send(res, 400, "bad path");
  if (!fs.existsSync(modulePath)) return send(res, 404, "not found");

  delete require.cache[require.resolve(modulePath)];
  const handler = require(modulePath);

  const rawBody = req.method === "POST" ? await readBody(req) : "";
  let parsedBody = rawBody;
  if (rawBody && (req.headers["content-type"] || "").includes("application/json")) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }
  }

  const vercelReq = Object.assign(req, { body: parsedBody });
  const vercelRes = Object.assign(res, {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.setHeader("Content-Type", "application/json; charset=utf-8");
      this.end(JSON.stringify(obj));
    },
  });

  try {
    await handler(vercelReq, vercelRes);
  } catch (err) {
    console.error("api handler error:", err);
    if (!res.headersSent) send(res, 500, JSON.stringify({ error: "internal_error" }), { "Content-Type": "application/json" });
  }
}

function serveStatic(req, res, pathname) {
  let filePath = decodeURIComponent(pathname);
  if (filePath.endsWith("/")) filePath += "index.html";
  const fullPath = path.join(ROOT, filePath);
  if (!fullPath.startsWith(ROOT)) return send(res, 400, "bad path");

  fs.stat(fullPath, (statErr, stat) => {
    if (statErr || !stat.isFile()) return send(res, 404, "Not found");
    const ext = path.extname(fullPath);
    const contentType = MIME[ext] || "application/octet-stream";

    // Range support — required for <video> seeking/scrubbing (hero-scrub.js).
    // Mirrors .claude/tools/range_server.py, which the static-site config uses.
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? Math.min(parseInt(match[2], 10), stat.size - 1) : stat.size - 1;
      res.writeHead(206, {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1,
      });
      fs.createReadStream(fullPath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": stat.size,
    });
    fs.createReadStream(fullPath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url.pathname);
  } else {
    serveStatic(req, res, url.pathname);
  }
});

server.listen(PORT, () => {
  console.log(`Yerel geliştirme sunucusu: http://localhost:${PORT}`);
});
