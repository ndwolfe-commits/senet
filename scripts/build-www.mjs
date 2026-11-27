// Copies the web game into www/, the folder the iPhone app is built from.
import { cpSync, rmSync, mkdirSync } from "node:fs";
rmSync("www", { recursive: true, force: true });
mkdirSync("www");
for (const item of ["index.html", "style.css", "src", "vendor", "fonts", "manifest.webmanifest", "icon-180.png", "icon-512.png", "film.mp4", "film-poster.jpg", "version.json"]) {
  cpSync(item, `www/${item}`, { recursive: true });
}
console.log("www/ ready");
