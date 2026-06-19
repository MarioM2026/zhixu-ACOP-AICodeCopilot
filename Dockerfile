# 知墟 - AI 编程助手观测与优化平台 (ZhiXu - AI Code Copilot Observability Platform)
# 生产构建 Dockerfile

FROM node:20-alpine AS builder
WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --omit=dev=false || npm install

# 复制源代码
COPY . .

# 构建客户端
RUN npm run build:client || true

# 构建服务器（TypeScript 转 JavaScript）
RUN npm install -g typescript

# ===== 第二阶段：运行时 =====

FROM node:20-alpine
WORKDIR /app

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# 安装生产依赖
COPY package*.json ./
RUN npm ci --omit=dev

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/config ./config
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/scripts ./scripts

# 复制源代码（服务器端需要运行时使用 tsx）
COPY src ./src

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# 启动命令
CMD ["npm", "run", "start"]
