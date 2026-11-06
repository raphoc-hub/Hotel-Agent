// The web server: serves the pages in public/ and the API routes.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { runAgent } from "./agent.js";

const PORT = 3000;
const PUBLIC_DIR = path.join(import.meta.dirname, "..", "public");
const REQUESTS_FILE = path.join(import.meta.dirname, "..", "data", "requests.json");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendFile(res, fileName) {
  const filePath = path.join(PUBLIC_DIR, fileName);
  // Only serve files that are inside public/
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  const type = CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(filePath).pipe(res);
}

// Read the request body and parse it as JSON.
async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || "{}");
}

async function handleMessage(req, res) {
  let fields;
  try {
    fields = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "The request was not valid JSON." });
  }

  const name = String(fields.name || "").trim();
  const email = String(fields.email || "").trim();
  const message = String(fields.message || "").trim();
  if (!name || !email || !message) {
    return sendJson(res, 400, { error: "Please fill in your name, e-mail and message." });
  }

  try {
    // The guest sees only the model's final text.
    const { reply } = await runAgent({ name, email, message });
    sendJson(res, 200, { reply });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "Sorry, something went wrong. Please try again in a moment." });
  }
}

// Staff page data: every request, newest first.
function handleRequests(res) {
  try {
    const rows = JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf8"));
    sendJson(res, 200, rows.reverse());
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "data/requests.json could not be read. It must contain a JSON array." });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/message") {
    return handleMessage(req, res);
  }
  if (req.method === "GET") {
    if (url.pathname === "/api/requests") return handleRequests(res);
    if (url.pathname === "/") return sendFile(res, "index.html");
    if (url.pathname === "/staff") return sendFile(res, "staff.html");
    return sendFile(res, url.pathname.slice(1));
  }
  res.writeHead(405, { "Content-Type": "text/plain" });
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Hotel Estrella is running at http://localhost:${PORT}`);
});
