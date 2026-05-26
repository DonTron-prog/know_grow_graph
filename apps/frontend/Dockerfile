FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=development

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/pi-agent/package.json apps/pi-agent/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps/backend apps/backend
COPY apps/frontend apps/frontend
COPY apps/pi-agent apps/pi-agent
COPY packages packages
COPY fixtures fixtures

EXPOSE 5173
CMD ["pnpm", "--filter", "@know-grow/frontend", "start"]
