const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const GARDEN_FILE = path.join(DATA_DIR, "garden.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

// Ensure data directory and default files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(GARDEN_FILE)) {
  fs.writeFileSync(GARDEN_FILE, JSON.stringify([
    {
      id: "blossom-seed-01",
      title: "Welcome Blossom 🌸",
      timestamp: new Date().toISOString(),
      stage: "BLOSSOM",
      gesture: "Left Pinch Complete",
      notes: "First inaugural flower bloomed in the digital garden."
    }
  ], null, 2), "utf-8");
}

if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
    zoomThreshold: 0.45,
    pinchSensitivity: 0.45,
    growthSpeed: 0.06,
    soundEnabled: true,
    mirrorCamera: true,
    visualizationMode: "both" // 'hand', 'center', 'both'
  }, null, 2), "utf-8");
}

// MIME types dictionary
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// Helper: send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

// Helper: parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
      // Cap at 15MB for base64 image snapshots
      if (body.length > 15 * 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  // --- REST API ENDPOINTS ---
  if (pathname === "/api/status" && req.method === "GET") {
    return sendJson(res, 200, {
      status: "online",
      service: "Blossom Flower Fullstack Service",
      version: "1.0.0",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  }

  if (pathname === "/api/garden" && req.method === "GET") {
    try {
      const data = JSON.parse(fs.readFileSync(GARDEN_FILE, "utf-8"));
      return sendJson(res, 200, data);
    } catch (err) {
      return sendJson(res, 500, { error: "Failed to read garden storage" });
    }
  }

  if (pathname === "/api/garden" && req.method === "POST") {
    try {
      const payload = await parseBody(req);
      const data = JSON.parse(fs.readFileSync(GARDEN_FILE, "utf-8"));
      const newEntry = {
        id: "blossom-" + Date.now(),
        title: payload.title || "Blooming Rose " + (data.length + 1),
        timestamp: new Date().toISOString(),
        stage: payload.stage || "BLOSSOM",
        snapshotUrl: payload.snapshotUrl || null,
        stats: payload.stats || {},
        notes: payload.notes || ""
      };
      data.unshift(newEntry);
      fs.writeFileSync(GARDEN_FILE, JSON.stringify(data, null, 2), "utf-8");
      return sendJson(res, 201, { success: true, item: newEntry });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || "Failed to save blossom" });
    }
  }

  if (pathname.startsWith("/api/garden/") && req.method === "DELETE") {
    const id = pathname.replace("/api/garden/", "");
    try {
      let data = JSON.parse(fs.readFileSync(GARDEN_FILE, "utf-8"));
      const initialLength = data.length;
      data = data.filter(item => item.id !== id);
      if (data.length === initialLength) {
        return sendJson(res, 404, { error: "Item not found" });
      }
      fs.writeFileSync(GARDEN_FILE, JSON.stringify(data, null, 2), "utf-8");
      return sendJson(res, 200, { success: true, deletedId: id });
    } catch (err) {
      return sendJson(res, 500, { error: "Failed to delete item" });
    }
  }

  if (pathname === "/api/settings" && req.method === "GET") {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      return sendJson(res, 200, settings);
    } catch (err) {
      return sendJson(res, 500, { error: "Failed to load settings" });
    }
  }

  if (pathname === "/api/settings" && req.method === "POST") {
    try {
      const payload = await parseBody(req);
      let settings = {};
      if (fs.existsSync(SETTINGS_FILE)) {
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      }
      const updated = Object.assign(settings, payload);
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
      return sendJson(res, 200, { success: true, settings: updated });
    } catch (err) {
      return sendJson(res, 400, { error: "Failed to save settings" });
    }
  }

  // --- STATIC FILE SERVING ---
  const safeRelativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, safeRelativePath);
  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("404 Not Found");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🌸 Blossom Flower Full-Stack Server Running!`);
  console.log(`🌐 Localhost URL: http://localhost:${PORT}`);
  console.log(`📡 API Status:    http://localhost:${PORT}/api/status`);
  console.log(`🌺 Garden API:    http://localhost:${PORT}/api/garden`);
  console.log(`⚙️  Settings API:  http://localhost:${PORT}/api/settings`);
  console.log(`====================================================`);
});
