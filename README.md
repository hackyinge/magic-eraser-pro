# Video Watermark Remover

GPU加速视频水印去除工具，支持框选水印区域、实时预览、多GPU硬件加速。

## 功能特性

- **双引擎支持**：FFmpeg delogo滤镜（快速）+ OpenCV inpainting（高质量修复）
- **GPU硬件加速**：自动检测并使用最优编码器
- **多区域水印**：支持同时框选和去除多个水印区域
- **实时进度**：WebSocket推送处理进度
- **驱动安装引导**：内置各平台GPU驱动安装指引

## 系统要求

| 组件 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | 18+ | 后端运行时 |
| FFmpeg | 4.0+ | 视频处理核心 |
| Python | 3.8+ | OpenCV引擎（可选） |
| opencv-python | 4.0+ | 高质量修复（可选） |

## GPU兼容性矩阵

| GPU类型 | macOS | Linux | Windows | 编码器 |
|---------|-------|-------|---------|--------|
| Apple Silicon / Intel Mac | ✅ | - | - | h264_videotoolbox |
| NVIDIA GeForce/RTX/GTX | - | ✅ | ✅ | h264_nvenc |
| AMD Radeon | - | ✅ | ✅ | h264_amf |
| Intel 核显（第6代+） | - | ✅ | ✅ | h264_qsv |
| 无GPU / 回退 | ✅ | ✅ | ✅ | libx264 (CPU) |

## 快速开始

```bash
# 1. 克隆项目
git clone <repo-url>
cd video-watermark-remover

# 2. 复制环境配置
cp .env.example .env

# 3. 一键启动（自动检查依赖、GPU、安装npm包）
chmod +x start.sh
./start.sh

# 4. 另开终端启动前端开发服务器
npm run dev
```

浏览器访问 http://localhost:5173

## 手动安装

```bash
# 安装Node.js依赖
npm install

# 安装Python依赖（OpenCV引擎）
pip3 install opencv-python numpy

# 启动后端
node server/index.mjs

# 启动前端（另一个终端）
npm run dev
```

## Docker部署

```bash
# 构建镜像
docker build -t video-watermark-remover .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/data \
  --name watermark-remover \
  video-watermark-remover

# 访问服务
open http://localhost:3000
```

## GPU加速安装指引

### macOS - Apple VideoToolbox（内置，无需安装）
```bash
brew install ffmpeg
# 验证
ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_videotoolbox -f null -
```

### Linux - NVIDIA NVENC
```bash
# 安装驱动
sudo apt install -y nvidia-driver-535
# 验证
nvidia-smi
ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_nvenc -f null -
```

### Linux - Intel QSV
```bash
sudo apt install -y intel-media-va-driver-non-free libmfx1 ffmpeg
vainfo
```

### Windows - NVIDIA / AMD
从官方下载最新驱动，配合含GPU支持的FFmpeg即可自动启用。

## API文档

### POST /api/process
上传视频并去除水印。

**请求（multipart/form-data）：**
```
video        File     视频文件
regions      JSON     水印区域数组 [{x,y,w,h}, ...]
engine       string   'ffmpeg' | 'opencv'（默认 'ffmpeg'）
quality      string   'low' | 'medium' | 'high'（默认 'high'）
```

**响应：**
```json
{
  "jobId": "abc123",
  "status": "processing"
}
```

### GET /api/jobs/:jobId
查询任务状态。

**响应：**
```json
{
  "jobId": "abc123",
  "status": "done",
  "progress": 100,
  "downloadUrl": "/api/download/abc123",
  "encoder": "h264_videotoolbox"
}
```

### GET /api/gpu-status
获取当前GPU检测结果。

**响应：**
```json
{
  "encoder": "h264_videotoolbox",
  "platform": "darwin",
  "available": ["h264_videotoolbox"]
}
```

### GET /api/install-guides/:tool
获取指定工具的安装指引（tool: ffmpeg | python | nvidia | amd | intel）。

## 项目结构

```
video-watermark-remover/
├── engines/
│   ├── ffmpeg-engine.mjs    # FFmpeg delogo引擎
│   └── opencv-engine.mjs    # OpenCV inpainting引擎
├── server/
│   └── index.mjs            # Express后端API
├── scripts/
│   └── inpaint.py           # Python OpenCV处理脚本
├── src/                     # React前端
│   ├── components/
│   ├── pages/
│   └── main.jsx
├── install-guides.mjs       # 安装指引数据
├── start.sh                 # 一键启动脚本
├── vite.config.js
├── postcss.config.js
├── Dockerfile
├── .env.example
└── README.md
```

## 许可证

MIT
