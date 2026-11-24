// Cuts the raster Heineken Pioneer logo into pieces and writes logo-animato.svg, logo.svg, favicon.svg.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire("F:/BOLTONFOTO/tools/package.json");
const sharp = require("sharp");
const SRC = "X:/2026 EVENTI/HEINEKEN PIONEER/2.a HNK_EB_Primary Logo_Stacked_withHNKLogo_Colour_RGB.png";
const OUT = process.argv[2];
const SCALE = 0.5; // pixel density of embedded pieces vs. source pixels
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const DOTS = [[3178, 1249.5], [2719, 1585], [3439, 1921]]; // centres of the light-green full stops, r = 32.5
const DOT_COLOR = "#7ab800";

// Words layer without the dots (dots become vector circles that pop in).
const noDots = Buffer.from(data);
for (const [cx, cy] of DOTS)
  for (let y = Math.floor(cy - 40); y <= cy + 40; y++)
    for (let x = Math.floor(cx - 40); x <= cx + 40; x++) {
      const i = (y * W + x) * 4;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= 40 * 40 && noDots[i] > 80 && noDots[i + 2] < 30) noDots[i + 3] = 0;
    }
// Sanity: no light-green pixel may survive in the words layer.
for (let i = 0; i < noDots.length; i += 4) if (noDots[i + 3] > 0 && noDots[i] > 100 && noDots[i + 1] > 160 && noDots[i + 2] < 30) {
  const p = i / 4; if (p % W > 1650) throw new Error(`dot pixel left at ${p % W},${Math.floor(p / W)}`);
}

async function piece(buf, [x0, y0, x1, y1], scale = SCALE) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const png = await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: x0, top: y0, width: w, height: h })
    .resize(Math.round(w * scale))
    .png({ palette: true, quality: 90, effort: 10 })
    .toBuffer();
  return { x: x0, y: y0, w, h, href: "data:image/png;base64," + png.toString("base64") };
}
const img = (p, cls = "") => `<image${cls ? ` class="${cls}"` : ""} x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" href="${p.href}"/>`;

const emblem = await piece(data, [695, 960, 1638, 1850]);
const brand = await piece(data, [1634, 766, 2205, 899]);
const lines = [[963, 1281], [1298, 1617], [1634, 1953]];
const words = await Promise.all(lines.map(([a, b]) => piece(noDots, [1662, a, 3400, b])));

const VB = "675 746 2817 1228"; // trimmed logo + 20 px margin
const AR = "2817 / 1228";
const circles = (cls) => DOTS.map(([cx, cy], i) => `<circle${cls ? ` class="${cls}" style="animation-delay:${(1.05 + i * 0.14).toFixed(2)}s"` : ""} cx="${cx}" cy="${cy}" r="32.5" fill="${DOT_COLOR}"/>`).join("");

const animated = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" role="img" aria-label="Heineken – Pioneer. Grow. Together.">
<style>
svg{overflow:visible}
.em{transform-box:fill-box;transform-origin:50% 50%;animation:h-em .9s cubic-bezier(.34,1.45,.5,1) both}
.br{animation:h-br .6s cubic-bezier(.16,1,.3,1) .25s both}
.w{animation:h-rise .6s cubic-bezier(.16,1,.3,1) both}
.dot{transform-box:fill-box;transform-origin:50% 50%;animation:h-pop .45s cubic-bezier(.34,1.8,.5,1) both}
@keyframes h-em{from{transform:scale(.3) rotate(-144deg);opacity:0}40%{opacity:1}}
@keyframes h-br{from{transform:translateY(-60px);opacity:0}}
@keyframes h-rise{from{transform:translateY(340px)}}
@keyframes h-pop{from{transform:scale(0)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs>${words.map((p, i) => `<clipPath id="h-l${i}"><rect x="${p.x - 10}" y="${p.y - 2}" width="${p.w + 20}" height="${p.h + 4}"/></clipPath>`).join("")}</defs>
${img(emblem, "em")}
${img(brand, "br")}
${words.map((p, i) => `<g clip-path="url(#h-l${i})"><g class="w" style="animation-delay:${(0.3 + i * 0.12).toFixed(2)}s">${img(p)}</g></g>`).join("\n")}
${circles("dot")}
</svg>
`;
writeFileSync(`${OUT}/logo-animato.svg`, animated);

// Bar logo: same colours, the bar is white.
const whole = await piece(data, [675, 746, 3491, 1973], 0.25);
writeFileSync(`${OUT}/logo.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" role="img" aria-label="Heineken – Pioneer. Grow. Together.">${img(whole)}</svg>\n`);

// Favicon: the emblem on a white rounded square.
const fav = await piece(data, [695, 960, 1638, 1850], 0.14);
const side = 1100, fx = 1166.5 - side / 2, fy = 1405 - side / 2;
writeFileSync(`${OUT}/favicon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fx} ${fy} ${side} ${side}"><rect x="${fx}" y="${fy}" width="${side}" height="${side}" rx="220" fill="#fff"/>${img(fav)}</svg>\n`);
console.log("aspect", AR);
