FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.mobile.json ./
COPY src ./src
COPY mobile ./mobile
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV HOST=0.0.0.0 PORT=8787 NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY --from=build /workspace/lib ./lib
COPY --from=build /workspace/mobile-dist ./mobile-dist
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O - http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "lib/relay/cli.js"]
