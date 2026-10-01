const express = require("express");
const path = require("path");
const cors = require("cors");
const { nanoid } = require("nanoid");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// SQLite Database Setup
const db = new sqlite3.Database(path.join(__dirname, "urls.db"), (err) => {
  if (err) console.error("Database error:", err);
  else console.log("✅ Connected to SQLite database");
});

// Create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shortCode TEXT UNIQUE NOT NULL,
      originalUrl TEXT NOT NULL,
      shortUrl TEXT NOT NULL,
      clicks INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shortCode TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      userAgent TEXT,
      referer TEXT,
      ipAddress TEXT,
      FOREIGN KEY(shortCode) REFERENCES urls(shortCode)
    )
  `);
});

// Validate URL
function isValidUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

// Get base URL
function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

// Get client IP
function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0] || req.connection.remoteAddress;
}

// POST /api/shorten - Create short URL
app.post("/api/shorten", (req, res) => {
  const { url, customCode } = req.body;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: "Please provide a valid http/https URL." });
  }

  let shortCode = customCode || nanoid(6);

  if (customCode && !/^[a-zA-Z0-9_-]{3,20}$/.test(customCode)) {
    return res.status(400).json({ error: "Custom code must be 3-20 alphanumeric characters." });
  }

  const baseUrl = getBaseUrl(req);
  const shortUrl = `${baseUrl}/${shortCode}`;

  db.run(
    "INSERT INTO urls (shortCode, originalUrl, shortUrl) VALUES (?, ?, ?)",
    [shortCode, url, shortUrl],
    function (err) {
      if (err) {
        if (err.code === "SQLITE_CONSTRAINT") {
          return res.status(409).json({ error: "This short code is already taken." });
        }
        return res.status(500).json({ error: "Database error" });
      }

      res.status(201).json({
        id: this.lastID,
        shortCode,
        shortUrl,
        originalUrl: url,
        clicks: 0,
        createdAt: new Date().toISOString()
      });
    }
  );
});

// GET /api/urls - Get all URLs
app.get("/api/urls", (req, res) => {
  db.all("SELECT * FROM urls ORDER BY createdAt DESC", (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows || []);
  });
});

// GET /api/urls/:code - Get specific URL with stats
app.get("/api/urls/:code", (req, res) => {
  const { code } = req.params;

  db.get("SELECT * FROM urls WHERE shortCode = ?", [code], (err, urlRow) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }

    if (!urlRow) {
      return res.status(404).json({ error: "URL not found." });
    }

    db.all("SELECT * FROM clicks WHERE shortCode = ? ORDER BY timestamp DESC", [code], (err, clicks) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        ...urlRow,
        stats: clicks || []
      });
    });
  });
});

// DELETE /api/urls/:code - Delete URL
app.delete("/api/urls/:code", (req, res) => {
  const { code } = req.params;

  db.run("DELETE FROM urls WHERE shortCode = ?", [code], function (err) {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "URL not found." });
    }

    db.run("DELETE FROM clicks WHERE shortCode = ?", [code], (err) => {
      if (err) console.error("Error deleting clicks:", err);
      res.json({ message: "URL deleted successfully." });
    });
  });
});

// GET /api/stats - Get overall statistics
app.get("/api/stats", (req, res) => {
  db.get("SELECT COUNT(*) as totalUrls, SUM(clicks) as totalClicks FROM urls", (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }
    res.json({
      totalUrls: row.totalUrls || 0,
      totalClicks: row.totalClicks || 0
    });
  });
});

// GET /:code - Redirect to original URL
app.get("/:code", (req, res) => {
  const { code } = req.params;

  db.get("SELECT * FROM urls WHERE shortCode = ?", [code], (err, row) => {
    if (err || !row) {
      return res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
    }

    // Increment clicks
    db.run("UPDATE urls SET clicks = clicks + 1 WHERE shortCode = ?", [code]);

    // Log click
    const ipAddress = getClientIp(req);
    const userAgent = req.get("user-agent") || "Unknown";
    const referer = req.get("referer") || "Direct";

    db.run(
      "INSERT INTO clicks (shortCode, userAgent, referer, ipAddress) VALUES (?, ?, ?, ?)",
      [code, userAgent, referer, ipAddress],
      (err) => {
        if (err) console.error("Error logging click:", err);
      }
    );

    res.redirect(row.originalUrl);
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.listen(PORT, () => {
  console.log(`✨ URL Shortener running on http://localhost:${PORT}`);
});

module.exports = app;
