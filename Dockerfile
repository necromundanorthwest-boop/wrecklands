FROM node:24.19.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node data ./data
COPY --chown=node:node index.html style.css ./
RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 WRECKLANDS_DB=/data/rooms.sqlite
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "const p=process.env.PORT||3000; fetch('http://127.0.0.1:'+p+'/api/content').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server/server.js"]
