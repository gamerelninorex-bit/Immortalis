# IMMORTALIS phone bridge — an ISOLATED service image. Build context: the repository root.
#   docker build -f apps/phone/Dockerfile -t immortalis-phone .
# It runs the unchanged engine/operator/referee code behind the mobile-browser front end. It calls no model, holds no secret in the image
# and refuses to start unless every secret is supplied by the environment (see docs/phone-bridge.md).
FROM node:22.22.2-slim
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production \
    IMMORTALIS_DATA_DIR=/data \
    IMMORTALIS_TRANSPORT=proxy
# /data is a persistent volume mounted by the host (Railway Volume or `docker run -v`); the image declares none.
COPY apps/phone/entrypoint.sh /usr/local/bin/immortalis-phone-entrypoint
RUN chmod 0755 /usr/local/bin/immortalis-phone-entrypoint
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/immortalis-phone-entrypoint"]
