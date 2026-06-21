# 知墟 - AI 编程助手观测与优化平台 (ZhiXu ACOP)
# 生产构建 Dockerfile
# 多阶段构建：前端构建 + TypeScript 编译 + 运行时

# ============= 阶段 1: 前端构建 =============
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY package*.json ./
RUN npm install

COPY src/client/src ./src
COPY src/client/index.html ./
COPY src/client/vite.config.ts ./
COPY src/client/tsconfig.json ./
COPY src/shared ./src/shared

RUN npm run build:client

# ============= 阶段 2: TypeScript 编译 =============
FROM node:20-alpine AS ts-compiler
WORKDIR /app
COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

# 编译 TypeScript → JavaScript（服务器）
RUN npx tsc -p tsconfig.server.json --outDir dist/server || \
    npx esbuild src/server/index.ts --platform=node --bundle --outfile=dist/server/index.js --packages=external || true

# ============= 阶段 3: 生产运行时 =============
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV TZ=Asia/Shanghai

# 安装运行时依赖（不包含 devDependencies）
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# 复制前端构建产物
COPY --from=frontend-builder /app/frontend/dist ./dist

# 复制服务器源代码（使用 tsx 在运行时编译）
COPY src ./src
COPY tsconfig.json ./

# 创建数据目录（volume 挂载点）
RUN mkdir -p /app/data /app/logs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# 使用 tsx 运行（无需预编译，支持热重载）
CMD ["npx", "tsx", "src/server/index.ts"]
