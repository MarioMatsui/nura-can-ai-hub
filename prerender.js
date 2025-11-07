import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const toAbsolute = (p) => path.resolve(__dirname, p);

// 1) Read built client index.html as template
const templatePath = toAbsolute("dist/index.html");
if (!fs.existsSync(templatePath)) {
  throw new Error("dist/index.html not found. Run `npm run build:client` first.");
}
const template = fs.readFileSync(templatePath, "utf-8");

// 2) Import SSR renderer (output of build:server)
const ssrEntry = toAbsolute("dist/server/entry-server.js");
if (!fs.existsSync(ssrEntry)) {
  throw new Error("dist/server/entry-server.js not found. Run `npm run build:server` first.");
}
const { render } = await import(url.pathToFileURL(ssrEntry).href);
if (typeof render !== "function") {
  throw new Error("SSR entry does not export a `render(url)` function.");
}

// 3) Only prerender HOME
const routesToPrerender = ["/"];

try {
  for (const urlPath of routesToPrerender) {
    const appHtml = await render(urlPath);
    const html = template.replace("<!--app-html-->", appHtml ?? "");
    const filePath = toAbsolute("dist/index.html");
    fs.writeFileSync(filePath, html);
    console.log("✅ pre-rendered:", filePath);
  }
} catch (err) {
  console.error("❌ prerender failed:", err);
  process.exit(1);
}
