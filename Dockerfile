# ============================================================
# Stage 1: 构建前端
# ============================================================
FROM node:20-slim AS frontend-builder

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --include=dev

# 复制源码并构建
COPY . .
RUN npm run build

# ============================================================
# Stage 2: 生产运行镜像
# ============================================================
FROM node:20-slim AS runner

# 安装 FFmpeg 和 Python（含 OpenCV 依赖）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-dev \
    # OpenCV 系统依赖
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1-mesa-glx \
    # 清理缓存
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
RUN pip3 install --no-cache-dir opencv-python-headless numpy

WORKDIR /app

# 仅安装生产依赖
COPY package*.json ./
RUN npm ci --omit=dev

# 复制服务器代码
COPY server/ ./server/
COPY engines/ ./engines/
COPY scripts/ ./scripts/
COPY install-guides.mjs ./

# 复制前端构建产物
COPY --from=frontend-builder /app/dist ./dist

# 创建上传/输出目录（使用 volume 挂载）
RUN mkdir -p /data/uploads /data/output /data/temp

# 环境变量
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads \
    OUTPUT_DIR=/data/output

# 数据目录作为 volume
VOLUME ["/data"]

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server/index.mjs"]
