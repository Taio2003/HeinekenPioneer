# Galleria Heineken Pioneer

Galleria foto protetta da password: sito statico servito da un piccolo server Node, foto su Cloudflare R2.
Stesso codice di Bolton, Dugongo, Veronelli, Nido e Orio, ma bucket R2, password, dominio e deploy propri.
Repository: https://github.com/Taio2003/HeinekenPioneer

```
web/        sito statico (logo e colori "Heineken – Pioneer. Grow. Together.")
server/     server Node con login, senza dipendenze
tools/      logo-pezzi.mjs: rigenera i tre SVG del logo dal PNG
Dockerfile  immagine per Coolify
```

Logo e colori: barra **bianca** con il logo a colori (verde scuro Heineken `#205527` per testi e pulsanti),
puntini verde chiaro `#7ab800`. Sotto il logo il fondo è sempre bianco (barra, intro, pagina di accesso); il logo resta com'è.
Sorgente: `X:\2026 EVENTI\HEINEKEN PIONEER\2.a HNK_EB_Primary Logo_Stacked_withHNKLogo_Colour_RGB.png` (solo raster).

- `web/assets/logo-animato.svg`: pezzi PNG del logo dentro un SVG. La stella entra ruotando, "HEINEKEN" scende,
  PIONEER / GROW / TOGETHER salgono una riga alla volta, poi i tre puntini (cerchi vettoriali) compaiono a scatto.
  Dura circa 1,6 s; l'intro si chiude da sola a 2,4 s (`app.js`).
- `web/assets/logo.svg` (barra, a colori) e `favicon.svg` (solo la stella su quadrato bianco).
- Per rigenerarli: dalla cartella `tools/` del repository Bolton (serve `sharp`)
  `node ../heineken/tools/logo-pezzi.mjs ../heineken/web/assets`.

## 1. Cloudflare R2

1. **Bucket**: dashboard Cloudflare → R2 → *Create bucket* → nome `heinekenaperitop`, *Location*: giurisdizione **EU**
   (se lo crei senza, lascia vuoto `R2_JURISDICTION` nel `.env`).
2. **Dominio pubblico**: bucket → *Settings* → *Custom Domains* → *Connect Domain*.
3. **CORS**: bucket → *Settings* → *CORS Policy* → incolla il contenuto di `tools/r2-cors.json` (repository Bolton).
4. **Token**: R2 → *Manage R2 API Tokens* → *Create API Token* → permesso **Object Read & Write**, *Apply to specific
   buckets only* → `heinekenaperitop`. Copia `.env.example` in `.env` (questa cartella) e compila account, chiavi,
   `R2_JURISDICTION=eu` e un percorso segreto `R2_PREFIX` (stringa lunga e casuale). Il `.env` non va mai nel repository.

## 2. Pubblicare le foto

Dalla cartella `tools/` del repository Bolton (contiene lo script e le sue dipendenze):

```bash
ENV_FILE=../heineken/.env node publish.mjs --dir "X:\2026 EVENTI\HEINEKEN PIONEER" --title "Heineken Pioneer" --zip-all
```

Usa **solo** il `.env` di Heineken: lo script cancella dal bucket le cartelle che non trova in `--dir`,
quindi con il `.env` di un altro cliente svuoterebbe il suo archivio.

- Una sola cartella, `FOTO` (203 foto, 2 GB): sul sito si chiama "FOTO". Per un altro nome rinomina la cartella su X:
  e aggiorna la chiave in `copertine.json`. Il PNG del logo accanto viene ignorato.
- Copertina: `copertine.json` nella cartella evento → `Heineken_Aperitop_2`.
- ZIP: la cartella ha il suo (*Scarica cartella*) e `--zip-all` crea anche quello dell'intero archivio (*Scarica tutto*).
- Si può rilanciare: salta le foto già caricate, aggiunge le nuove, toglie quelle rimosse.

Prova in locale: `node publish.mjs --local ../heineken/web/_r2 --dir "X:\2026 EVENTI\HEINEKEN PIONEER" --title "Prova" --zip-all`,
poi `npx serve heineken/web -l 3005`.

## 3. Coolify

1. *New Resource* → *Public/Private Repository* (privato: tramite la GitHub App) → repository della galleria, branch `main`.
2. Build pack **Dockerfile**, *Base Directory* `/`, porta **80**.
3. Dominio del sito.
4. Variabili d'ambiente (senza, il container non parte):
   - `SITE_PASSWORD` – password per gli ospiti, almeno 12 caratteri;
   - `PHOTO_BASE` – `https://<dominio R2>/<R2_PREFIX del .env>`, senza slash finale.
5. *Deploy*. Per cambiare password: modifica `SITE_PASSWORD` e *Redeploy* (le sessioni aperte decadono).
