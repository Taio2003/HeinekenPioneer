// Server del sito: serve i file di web/ solo a chi ha fatto login con la password.
// Nessuna dipendenza esterna. Variabili d'ambiente:
//   SITE_PASSWORD  password di accesso (obbligatoria, almeno 12 caratteri)
//   PHOTO_BASE     indirizzo delle foto su R2 con il percorso segreto (obbligatoria)
//   PORT           porta (predefinita 80)
//   COOKIE_INSECURE=1  solo per prove in locale senza https

import { createHmac, createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../web");
const LOGIN_PAGE = await readFile(path.join(HERE, "login.html"), "utf8");

const { SITE_PASSWORD, PHOTO_BASE } = process.env;
const PORT = Number(process.env.PORT || 80);
const SECURE = process.env.COOKIE_INSECURE !== "1";
if (!SITE_PASSWORD || SITE_PASSWORD.length < 12) fail("Imposta SITE_PASSWORD (almeno 12 caratteri).");
if (!/^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9._-]+)*$/.test(PHOTO_BASE || "")) fail("PHOTO_BASE non valido (es. https://foto.example.it/<percorso>).");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/* ---------- Sessione ---------- */

const COOKIE = "hnk_session";
const SESSION_DAYS = 30;
// La chiave dipende dalla password: cambiandola su Coolify tutte le sessioni aperte decadono.
const KEY = scryptSync(SITE_PASSWORD, "hnk-foto-session-v1", 32);
const PASSWORD_DIGEST = createHash("sha256").update(SITE_PASSWORD).digest();

const sign = (value) => createHmac("sha256", KEY).update(value).digest("base64url");

function newSession() {
  const expires = Date.now() + SESSION_DAYS * 864e5;
  return `${expires}.${sign(String(expires))}`;
}

function validSession(req) {
  const raw = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [expires, mac] = raw.slice(COOKIE.length + 1).split(".");
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(expires));
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieHeader(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE ? "; Secure" : ""}`;
}

function checkPassword(input) {
  const digest = createHash("sha256").update(String(input)).digest();
  return timingSafeEqual(digest, PASSWORD_DIGEST);
}

/* ---------- Limite ai tentativi sbagliati ---------- */

const WINDOW = 15 * 60 * 1000;
const MAX_PER_IP = 10;
const MAX_GLOBAL = 200;
const failures = new Map(); // ip -> [timestamp…]
let globalFailures = [];

const clientIp = (req) =>
  req.headers["cf-connecting-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;

function blocked(ip) {
  const now = Date.now();
  const mine = (failures.get(ip) || []).filter((t) => now - t < WINDOW);
  failures.set(ip, mine);
  return mine.length >= MAX_PER_IP;
}

// Con molti errori complessivi i tentativi vengono solo rallentati, mai bloccati:
// un malintenzionato non deve poter chiudere fuori gli ospiti che hanno la password.
function underAttack() {
  const now = Date.now();
  globalFailures = globalFailures.filter((t) => now - t < WINDOW);
  return globalFailures.length >= MAX_GLOBAL;
}

// Tutti i controlli della password passano in fila, uno alla volta: al massimo 4 al secondo,
// 1 al secondo durante un attacco. Il tetto vale anche con richieste parallele da molti indirizzi.
const MAX_QUEUE = 100;
let queue = Promise.resolve();
let waiting = 0;

function throttledCheck(input) {
  if (waiting >= MAX_QUEUE) return Promise.resolve(null); // fila piena: "riprova tra poco"
  waiting++;
  const result = queue.then(async () => {
    const ok = checkPassword(input);
    await new Promise((r) => setTimeout(r, underAttack() ? 1000 : 250));
    return ok;
  });
  queue = result.catch(() => {}).finally(() => waiting--);
  return result;
}

function recordFailure(ip) {
  const now = Date.now();
  failures.set(ip, [...(failures.get(ip) || []), now]);
  globalFailures.push(now);
}

// Il tentativo si conta prima del controllo (così non si aggira inviandone tanti insieme)
// e si annulla se la password era giusta o se non è stato controllato.
function undoLastFailure(ip) {
  const list = failures.get(ip);
  if (list?.length) list.pop();
  globalFailures.pop();
}

const inFlight = new Set(); // un solo tentativo in corso per indirizzo

setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of failures) if (!list.some((t) => now - t < WINDOW)) failures.delete(ip);
}, WINDOW).unref();

/* ---------- Risposte ---------- */

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

// File visibili anche prima del login: servono solo alla pagina di accesso.
const PUBLIC = new Set(["/assets/logo.svg", "/assets/logo-animato.svg", "/assets/favicon.svg"]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function loginPage(res, status, { error = "", next = "/" } = {}) {
  const html = LOGIN_PAGE.replace("{{ERROR}}", error ? `<p class="error" role="alert">${error}</p>` : "")
    .replace("{{ERROR_CLASS}}", error ? "has-error" : "")
    .replace("{{NEXT}}", escapeAttr(next));
  send(res, status, html, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
}

const escapeAttr = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Dopo il login si torna solo a percorsi interni del sito.
const safeNext = (n) => (typeof n === "string" && /^\/(?!\/)[A-Za-z0-9/_.-]*$/.test(n) ? n : "/");

async function serveFile(req, res, urlPath) {
  let file = urlPath === "/" ? "/index.html" : urlPath;
  if (/^\/c\/[^/]+\/?$/.test(urlPath)) file = "/cartella.html";
  let decoded;
  try {
    decoded = decodeURIComponent(file);
  } catch {
    return send(res, 400, "Richiesta non valida");
  }
  const abs = path.resolve(WEB, `.${decoded}`);
  if (!abs.startsWith(WEB + path.sep)) return send(res, 404, "Non trovato");

  let info;
  try {
    info = await stat(abs);
  } catch {
    return send(res, 404, "Non trovato", { "Content-Type": "text/plain; charset=utf-8" });
  }
  if (!info.isFile()) return send(res, 404, "Non trovato");

  const ext = path.extname(abs).toLowerCase();
  // "private": solo il browser di chi ha fatto login può tenerli in cache, Cloudflare no.
  const cache = ext === ".html" ? "private, no-cache" : "private, max-age=3600";
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": PUBLIC.has(urlPath) ? "public, max-age=86400" : cache,
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(abs).pipe(res);
}

class TooLarge extends Error {}

// Il modulo di login è minuscolo: oltre il limite si smette di leggere e si chiude la connessione.
function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers["content-length"] || 0) > limit) return reject(new TooLarge());
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) {
        req.removeAllListeners("data");
        reject(new TooLarge());
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/* ---------- Server ---------- */

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;

    if (p === "/login" && req.method === "POST") {
      const ip = clientIp(req);
      const form = new URLSearchParams(await readBody(req));
      const next = safeNext(form.get("next"));
      if (blocked(ip) || inFlight.has(ip)) {
        return loginPage(res, 429, { error: "Troppi tentativi. Riprova tra qualche minuto.", next });
      }
      inFlight.add(ip);
      recordFailure(ip);
      let ok;
      try {
        ok = await throttledCheck(form.get("password") || "");
      } finally {
        inFlight.delete(ip);
      }
      if (ok === null) {
        undoLastFailure(ip);
        return loginPage(res, 503, { error: "Troppe richieste in questo momento. Riprova tra poco.", next });
      }
      if (!ok) return loginPage(res, 401, { error: "Password non corretta.", next });
      undoLastFailure(ip);
      failures.delete(ip);
      return send(res, 303, "", { Location: next, "Set-Cookie": cookieHeader(newSession(), SESSION_DAYS * 86400), "Cache-Control": "no-store" });
    }

    if (p === "/logout") {
      return send(res, 303, "", { Location: "/", "Set-Cookie": cookieHeader("", 0), "Cache-Control": "no-store" });
    }

    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Metodo non consentito", { Allow: "GET, HEAD" });

    if (PUBLIC.has(p)) return await serveFile(req, res, p);

    if (!validSession(req)) {
      // Le pagine mostrano il login; i file (js, css, configurazione) restano semplicemente negati.
      const isPage = p === "/" || p === "/login" || /^\/c\/[^/]+\/?$/.test(p) || p.endsWith(".html");
      if (isPage) return loginPage(res, 401, { next: p === "/login" ? safeNext(url.searchParams.get("next")) : p });
      return send(res, 401, "Accesso richiesto", { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    }

    if (p === "/login") return send(res, 303, "", { Location: safeNext(url.searchParams.get("next")) });

    // Indirizzo segreto delle foto: solo dopo il login e mai in cache.
    if (p === "/assets/env.js") {
      return send(res, 200, `window.BF_ENV = { PHOTO_BASE: ${JSON.stringify(PHOTO_BASE)} };\n`, {
        "Content-Type": TYPES[".js"],
        "Cache-Control": "no-store",
      });
    }

    // await: un errore qui finisce nel catch invece di far cadere il processo.
    return await serveFile(req, res, p);
  } catch (err) {
    if (err instanceof TooLarge) {
      send(res, 413, "Richiesta troppo grande", { Connection: "close" });
      return req.destroy();
    }
    console.error(err);
    if (!res.headersSent) send(res, 500, "Errore");
    else res.end();
  }
});

server.listen(PORT, () => console.log(`Sito in ascolto sulla porta ${PORT}`));
