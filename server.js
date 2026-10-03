import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = normalize(join(root, relative));
  if (!filePath.startsWith(root)) {
    response.writeHead(403); response.end("Forbidden"); return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain" }); response.end("Not found");
  }
}).listen(port, () => console.log(`Admin Hub running at http://localhost:${port}/`));
