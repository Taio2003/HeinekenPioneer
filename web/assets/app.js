// Frontend statico: legge site.json e i manifest delle cartelle direttamente da R2.
const { R2_PUBLIC_URL } = window.BF_CONFIG;
const R2 = R2_PUBLIC_URL.replace(/\/$/, "");

const $ = (sel) => document.querySelector(sel);
const r2url = (key) => `${R2}/${key.split("/").map(encodeURIComponent).join("/")}`;
const plural = (n, one, many) => `${n.toLocaleString("it-IT")} ${n === 1 ? one : many}`;

function formatBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString("it-IT", { maximumFractionDigits: i >= 3 ? 1 : 0 })} ${u[i]}`;
}

async function getJSON(key) {
  const res = await fetch(r2url(key), { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} ${key}`);
  return res.json();
}

function toast(msg, ms = 4000) {
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

function triggerDownload(href, name) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

/* ---------- Caricamento progressivo e comparsa ---------- */

// Il riquadro mostra un segnaposto animato finché l'immagine non è arrivata, poi la sfuma.
function fadeInWhenLoaded(img, holder) {
  holder.classList.add("loading");
  const done = () => {
    holder.classList.remove("loading");
    holder.classList.add("loaded");
  };
  if (img.complete && img.naturalWidth) done();
  else {
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", () => holder.classList.remove("loading"), { once: true });
  }
}

// Gli elementi compaiono quando entrano nello schermo, a cascata per gruppo visibile.
const revealObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries, observer) => {
          entries
            .filter((e) => e.isIntersecting)
            .forEach((e, i) => {
              e.target.style.setProperty("--d", `${Math.min(i, 10) * 45}ms`);
              e.target.classList.add("in");
              observer.unobserve(e.target);
            });
        },
        { rootMargin: "0px 0px -4% 0px" }
      )
    : null;

function revealOnScroll(el) {
  if (!revealObserver) return;
  el.classList.add("reveal-item");
  revealObserver.observe(el);
}

function photoIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>';
  return svg;
}

// Gli ZIP sono pesanti: il link chiede conferma prima di avviare il download.
function confirmZip(link, title, text) {
  const dialog = $("#confirm-zip");
  link.addEventListener("click", (e) => {
    e.preventDefault();
    $("#confirm-title").textContent = title;
    $("#confirm-text").textContent = text;
    dialog.showModal();
  });
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "ok") triggerDownload(link.href, "");
    dialog.returnValue = "";
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close("cancel");
  });
}

/* ---------- Intro ---------- */

// La classe "intro" è messa da uno script inline in <head> (prima visita della sessione).
// L'SVG animato parte da solo al caricamento e finisce in circa 1,6 s; poco dopo l'overlay sfuma.
function runIntro() {
  const root = document.documentElement;
  const overlay = $("#intro");
  if (!root.classList.contains("intro") || !overlay) return false;
  let done = false;
  function finish() {
    if (done) return;
    done = true;
    try {
      sessionStorage.setItem("hnk-intro", "1");
    } catch {}
    root.classList.add("reveal");
    setTimeout(() => root.classList.remove("intro"), 600);
  }
  overlay.addEventListener("click", finish);
  setTimeout(finish, 2400);
  return true;
}

/* ---------- Home: cartelle ---------- */

async function initHome() {
  const introPlayed = runIntro();
  const status = $("#status");
  let site;
  try {
    site = await getJSON("site.json");
  } catch {
    status.textContent = "Nessuna foto disponibile al momento.";
    return;
  }
  document.title = `${site.title} – Foto`;

  const total = site.folders.reduce((s, f) => s + f.count, 0);
  $("#totals").textContent = `${plural(site.folders.length, "cartella", "cartelle")} · ${plural(total, "foto", "foto")}`;

  if (site.zip) {
    const zip = $("#zip-all");
    zip.href = r2url(site.zip.key);
    zip.title = `Archivio completo · ${formatBytes(site.zip.size)}`;
    zip.querySelector(".label").textContent = `Scarica tutto · ${formatBytes(site.zip.size)}`;
    zip.setAttribute("aria-label", `Scarica tutto, ${formatBytes(site.zip.size)}`);
    zip.hidden = false;
    confirmZip(
      zip,
      "Scaricare tutte le foto?",
      `Verrà scaricato un archivio ZIP con ${plural(total, "foto", "foto")} in alta risoluzione ` +
        `(${formatBytes(site.zip.size)}). Su rete mobile può richiedere molto tempo.`
    );
  }

  const grid = $("#folders");
  for (const f of site.folders) {
    const a = document.createElement("a");
    a.className = "folder";
    a.href = `/c/${encodeURIComponent(f.slug)}`;
    a.append(photoIcon());
    if (f.cover) {
      const img = new Image();
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = r2url(f.cover.thumb);
      img.style.objectPosition = f.cover.pos || "50% 50%";
      img.srcset = `${r2url(f.cover.thumb)} ${f.cover.tw}w, ${r2url(f.cover.medium)} ${f.cover.mw}w`;
      // Copertina ritagliata (orizzontale o verticale): chiede la versione grande per restare nitida.
      img.sizes = "(max-width: 760px) 100vw, 50vw";
      a.append(img);
      fadeInWhenLoaded(img, a);
    }
    const cap = document.createElement("span");
    cap.className = "folder-cap";
    const name = document.createElement("span");
    name.className = "folder-name";
    name.textContent = f.name;
    const count = document.createElement("span");
    count.className = "folder-count";
    count.textContent = f.date || plural(f.count, "foto", "foto");
    cap.append(name, count);
    a.append(cap);
    a.style.setProperty("--k", Math.min(grid.children.length, 12));
    grid.append(a);
    if (!introPlayed) revealOnScroll(a);
  }
}

/* ---------- Cartella ---------- */

function currentSlug() {
  const m = location.pathname.match(/^\/c\/([^/]+)/);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(location.search).get("c");
}

async function initFolder() {
  const slug = currentSlug();
  const status = $("#status");

  let site, manifest;
  try {
    [site, manifest] = await Promise.all([getJSON("site.json"), getJSON(`folders/${slug}/manifest.json`)]);
  } catch {
    $("#folder-name").textContent = "Cartella non trovata";
    status.textContent = "Controlla il link o torna all'elenco delle cartelle.";
    return;
  }

  const photos = manifest.photos;
  const totalBytes = photos.reduce((s, p) => s + (p.size || 0), 0);
  document.title = `${manifest.name} – ${site.title}`;
  $("#folder-name").textContent = manifest.name;
  $("#folder-meta").textContent = `${plural(photos.length, "foto", "foto")} · ${formatBytes(totalBytes)}`;

  if (manifest.zip) {
    const zip = $("#zip-folder");
    zip.href = r2url(manifest.zip.key);
    zip.querySelector(".label").textContent = `Scarica cartella · ${formatBytes(manifest.zip.size)}`;
    zip.setAttribute("aria-label", `Scarica la cartella, ${formatBytes(manifest.zip.size)}`);
    zip.hidden = false;
    confirmZip(
      zip,
      `Scaricare la cartella «${manifest.name}»?`,
      `Verrà scaricato un archivio ZIP con ${plural(photos.length, "foto", "foto")} in alta risoluzione ` +
        `(${formatBytes(manifest.zip.size)}). Su rete mobile può richiedere molto tempo.`
    );
  }

  createFolderSheet(site.folders, slug);

  const gallery = $("#gallery");
  const frag = document.createDocumentFragment();
  photos.forEach((p, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile";
    btn.dataset.index = i;
    btn.setAttribute("aria-label", `Foto ${i + 1} di ${photos.length}`);
    const img = new Image();
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";
    img.width = p.tw;
    img.height = p.th;
    img.src = r2url(p.thumb);
    const check = document.createElement("span");
    check.className = "check";
    check.setAttribute("aria-hidden", "true");
    check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';
    btn.append(img, check);
    fadeInWhenLoaded(img, btn);
    frag.append(btn);
  });
  gallery.append(frag);
  gallery.querySelectorAll(".tile").forEach(revealOnScroll);

  const lightbox = createLightbox(photos, manifest.name);

  gallery.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    const i = Number(tile.dataset.index);
    lightbox.open(i);
  });
}

function createFolderSheet(folders, currentSlug) {
  const sheet = $("#folder-sheet");
  const list = $("#sheet-list");
  for (const f of folders) {
    const a = document.createElement("a");
    a.className = "sheet-item";
    a.href = `/c/${encodeURIComponent(f.slug)}`;
    if (f.slug === currentSlug) a.setAttribute("aria-current", "page");
    const thumb = document.createElement("span");
    thumb.className = "sheet-thumb";
    if (f.cover) {
      const img = new Image();
      img.alt = "";
      img.loading = "lazy";
      img.src = r2url(f.cover.thumb);
      img.style.objectPosition = f.cover.pos || "50% 50%";
      thumb.append(img);
    }
    const text = document.createElement("span");
    text.className = "sheet-text";
    const name = document.createElement("strong");
    name.textContent = f.name;
    const count = document.createElement("span");
    count.textContent = f.date || plural(f.count, "foto", "foto");
    text.append(name, count);
    const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    check.setAttribute("viewBox", "0 0 24 24");
    check.setAttribute("class", "icon sheet-check");
    check.setAttribute("aria-hidden", "true");
    check.innerHTML = '<path d="M5 12l5 5 9-10"/>';
    a.append(thumb, text, check);
    list.append(a);
  }

  const button = $("#folder-switch");
  const desktop = matchMedia("(min-width: 761px)");
  button.addEventListener("click", () => {
    // Su desktop il pannello è una tendina sotto il nome; su mobile sale dal basso (solo CSS).
    if (desktop.matches) {
      const r = button.getBoundingClientRect();
      sheet.style.top = `${r.bottom + 10}px`;
      sheet.style.left = `${Math.max(16, Math.min(r.left - 12, window.innerWidth - 400))}px`;
      sheet.style.maxHeight = `${window.innerHeight - r.bottom - 32}px`;
    } else {
      sheet.style.removeProperty("top");
      sheet.style.removeProperty("left");
      sheet.style.removeProperty("max-height");
    }
    sheet.showModal();
    list.querySelector("[aria-current]")?.scrollIntoView({ block: "center" });
  });
  sheet.querySelector(".sheet-close").addEventListener("click", () => sheet.close());
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) sheet.close();
  });
}

function createLightbox(photos, folderName) {
  const lb = $("#lightbox");
  const img = lb.querySelector(".lb-stage img");
  const count = $("#lb-count");
  const name = $("#lb-name");
  const info = $("#lb-info");
  const dl = $("#lb-download");
  $("#lb-folder").textContent = folderName;
  let index = 0;
  let lastFocus = null;

  // dir: 1 = avanti, -1 = indietro, 0 = apertura. La nuova foto entra sfumando dal lato giusto.
  function show(i, dir = 0) {
    index = (i + photos.length) % photos.length;
    const p = photos[index];
    img.classList.remove("shown");
    img.style.setProperty("--from", `${dir * 32}px`);
    img.onload = () => requestAnimationFrame(() => img.classList.add("shown"));
    img.src = r2url(p.medium);
    if (img.complete && img.naturalWidth) img.onload();
    count.textContent = `${index + 1} / ${photos.length}`;
    name.textContent = p.name;
    info.textContent = `Originale · ${p.w} × ${p.h} · ${formatBytes(p.size)}`;
    dl.href = r2url(p.original);
    dl.download = p.name;
    // Precarica la successiva e la precedente.
    for (const j of [index + 1, index - 1]) {
      new Image().src = r2url(photos[(j + photos.length) % photos.length].medium);
    }
  }

  function open(i) {
    lastFocus = document.activeElement;
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    show(i);
    lb.querySelector(".lb-close").focus();
  }

  function close() {
    lb.hidden = true;
    img.removeAttribute("src");
    document.body.style.overflow = "";
    lastFocus?.focus();
  }

  lb.querySelector(".lb-close").addEventListener("click", close);
  lb.querySelector(".lb-prev").addEventListener("click", () => show(index - 1, -1));
  lb.querySelector(".lb-next").addEventListener("click", () => show(index + 1, 1));
  lb.querySelector(".lb-stage").addEventListener("click", (e) => {
    if (e.target !== img) close();
  });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") show(index - 1, -1);
    else if (e.key === "ArrowRight") show(index + 1, 1);
  });

  // Swipe su mobile: orizzontale cambia foto, verso il basso chiude.
  let startX = null;
  let startY = null;
  lb.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    startX = e.clientX;
    startY = e.clientY;
  });
  lb.addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
  });

  return { open };
}


if (document.body.dataset.page === "home") initHome();
else if (document.body.dataset.page === "folder") initFolder();
