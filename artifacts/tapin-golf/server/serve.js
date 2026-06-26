const http = require("http");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const staticBuildDir = path.join(projectRoot, "static-build");
const PORT = parseInt(process.env.PORT || "26107", 10);

const CONTENT_TYPES = {
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === "/" || url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "TapIn Golf Expo" }));
    return;
  }

  // Expo manifest endpoint — Expo Go requests this to load the app
  if (url.pathname === "/manifest") {
    const platform = req.headers["expo-platform"] || "ios";
    const manifestPath = path.join(staticBuildDir, platform, "manifest.json");

    if (!fs.existsSync(manifestPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No build found. Run build first." }));
      return;
    }

    const manifest = fs.readFileSync(manifestPath, "utf-8");
    res.writeHead(200, {
      "Content-Type": "application/json",
      "expo-protocol-version": "0",
      "expo-sfv-version": "0",
      "cache-control": "no-store",
    });
    res.end(manifest);
    return;
  }

  // Serve static files from static-build directory
  const reqPath = url.pathname;
  const filePath = path.resolve(staticBuildDir, "." + reqPath);

  // Security: prevent path traversal outside staticBuildDir
  if (!filePath.startsWith(staticBuildDir + path.sep) && filePath !== staticBuildDir) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found", path: reqPath }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`TapIn Golf Expo server listening on port ${PORT}`);
});

server.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});
