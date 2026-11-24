# Sito statico protetto da password, servito da un piccolo server Node senza dipendenze.
# Le foto non sono nell'immagine: il sito le legge da Cloudflare R2.
# Variabili richieste su Coolify: SITE_PASSWORD (almeno 12 caratteri), PHOTO_BASE.
FROM node:22-alpine

WORKDIR /app
COPY server/ ./server/
COPY web/ ./web/

ENV NODE_ENV=production PORT=80
# Gira come utente non privilegiato (Docker consente comunque la porta 80 nel container).
USER node
EXPOSE 80
CMD ["node", "server/server.mjs"]
