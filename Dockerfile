# ==========================================
# 阶段 1：构建前端
# ==========================================
FROM node:18-bullseye AS frontend-builder
WORKDIR /app

# npm 使用淘宝镜像加速
RUN npm config set registry https://registry.npmmirror.com

# 安装前端依赖
COPY client/package*.json ./client/
RUN cd client && npm install

# 拷贝前端代码并构建
COPY client/ ./client/
RUN cd client && npm run build

# ==========================================
# 阶段 2：构建后端及运行环境
# ==========================================
FROM node:18-bullseye-slim
WORKDIR /app

# 修改 APT 为阿里云源并安装系统环境 (FFmpeg, Python, OpenCV)
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
    sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-opencv \
    && rm -rf /var/lib/apt/lists/*

# npm 使用淘宝镜像并安装后端代码 (只装生产依赖)
RUN npm config set registry https://registry.npmmirror.com
COPY package*.json ./
RUN npm install --production

# 拷贝后端源代码及脚本
COPY . .

# 从 builder 阶拷贝编译好的静态资源文件
COPY --from=frontend-builder /app/client/dist ./dist

# 暴露后端 API 与前端静态代理的同一端口
EXPOSE 3099

# 启动服务器
CMD ["npm", "start"]
