/**
 * 视频水印去除服务 - 主入口
 * Express API 服务，端口 3099
 */

import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { detectGPUEnvironment, getInstallGuide } from "./gpu-detector.mjs";
import swaggerUi from "swagger-ui-express";
import swaggerJsDoc from "swagger-jsdoc";
import {
  processWatermarkRemoval,
  detectWatermarkRegions,
  cleanupFiles,
  UPLOAD_DIR,
  OUTPUT_DIR,
} from "./watermark-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3099;

// ==========================================
// 中间件配置
// ==========================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务 (前端构建产物)
const distDir = path.join(__dirname, "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

// ==========================================
// 文件上传配置
// ==========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /video\/(mp4|avi|mov|mkv|webm|flv|wmv|m4v)|application\/octet-stream/;
    const allowed = allowedTypes.test(file.mimetype) ||
      /\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v)$/i.test(file.originalname);
    if (allowed) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ==========================================
// Swagger 文档配置
// ==========================================

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Magic Eraser Pro API",
      version: "2.0.0",
      description: "GPU 加速的智能水印去除服务 API，支持 FFmpeg、OpenCV、STTN、LAMA、ProPainter 多种算法",
    },
    servers: [{ url: `http://localhost:${PORT}` }],
  },
  apis: ["./server.mjs"],
};
const swaggerSpec = swaggerJsDoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "Watermark Remover API Docs",
}));

// ==========================================
// GPU 状态缓存
// ==========================================

let gpuStatusCache = null;
let gpuStatusCacheTime = 0;
const GPU_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ==========================================
// API 路由
// ==========================================

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: 健康检查
 *     description: 返回服务运行状态、端口、运行时长等基本信息
 *     tags: [System]
 *     responses:
 *       200:
 *         description: 服务正常运行
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 service:
 *                   type: string
 *                 port:
 *                   type: number
 *                 timestamp:
 *                   type: string
 *                 uptime:
 *                   type: number
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "video-watermark-remover",
    port: PORT,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
});

/**
 * @openapi
 * /api/gpu-status:
 *   get:
 *     summary: GPU 环境状态
 *     description: 返回平台、GPU、FFmpeg、Python 环境信息，支持 5 分钟缓存
 *     tags: [System]
 *     parameters:
 *       - in: query
 *         name: refresh
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: 强制刷新缓存
 *     responses:
 *       200:
 *         description: GPU 环境信息
 *       500:
 *         description: 检测失败
 */
app.get("/api/gpu-status", async (req, res) => {
  try {
    const now = Date.now();
    const forceRefresh = req.query.refresh === "true";

    // 使用缓存（5分钟内有效）
    if (!forceRefresh && gpuStatusCache && now - gpuStatusCacheTime < GPU_CACHE_TTL) {
      return res.json({ ...gpuStatusCache, cached: true });
    }

    console.log("Detecting GPU environment...");
    const status = await detectGPUEnvironment();
    gpuStatusCache = status;
    gpuStatusCacheTime = now;

    res.json({ ...status, cached: false });
  } catch (error) {
    console.error("GPU detection failed:", error.message);
    res.status(500).json({ error: "GPU detection failed", details: error.message });
  }
});

/**
 * @openapi
 * /api/detect-watermark:
 *   post:
 *     summary: 自动检测水印位置
 *     description: 上传视频文件，返回可能的水印区域列表（按置信度排序）
 *     tags: [Watermark]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: 检测到的水印区域列表
 *       400:
 *         description: 未上传文件
 *       500:
 *         description: 检测失败
 */
app.post("/api/detect-watermark", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video file uploaded" });
  }

  const inputPath = req.file.path;
  try {
    const regions = await detectWatermarkRegions(inputPath);
    res.json(regions);
  } catch (error) {
    console.error("Watermark detection failed:", error.message);
    res.status(500).json({ error: "Detection failed", details: error.message });
  } finally {
    // Clean up after detection
    setTimeout(() => cleanupFiles([inputPath]), 3000);
  }
});

/**
 * @openapi
 * /api/remove-watermark:
 *   post:
 *     summary: 去除水印（SSE 流式响应）
 *     description: 上传视频并指定水印区域，通过 SSE 流式推送处理进度
 *     tags: [Watermark]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [video, region]
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *               region:
 *                 type: string
 *                 description: JSON 字符串，格式 {x, y, width, height}
 *                 example: '{"x":10,"y":10,"width":200,"height":50}'
 *               method:
 *                 type: string
 *                 enum: [ffmpeg, inpaint, sttn, lama, propainter]
 *                 default: ffmpeg
 *               algorithm:
 *                 type: string
 *                 enum: [TELEA, NS]
 *                 description: 仅 inpaint 模式有效
 *               quality:
 *                 type: string
 *                 enum: [quality, speed, balanced]
 *                 default: quality
 *                 description: AI 算法质量模式（sttn/lama/propainter 有效）
 *     responses:
 *       200:
 *         description: SSE 流，依次推送 start / progress / complete / error 事件
 */
app.post("/api/remove-watermark", upload.single("video"), processWatermarkRemoval);

/**
 * @openapi
 * /api/download/{filename}:
 *   get:
 *     summary: 下载处理后的视频
 *     tags: [Watermark]
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 视频文件流
 *       400:
 *         description: 非法文件名
 *       404:
 *         description: 文件不存在或已过期
 */
app.get("/api/download/:filename", (req, res) => {
  const filename = req.params.filename;

  // 安全检查：防止路径穿越
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const filePath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found or expired" });
  }

  res.download(filePath, filename, (err) => {
    if (!err) {
      // 下载完成后延迟删除
      setTimeout(() => cleanupFiles([filePath]), 86400000);
    }
  });
});

/**
 * @openapi
 * /api/ai-status:
 *   get:
 *     summary: AI 算法可用性状态
 *     description: 返回 STTN、LAMA、ProPainter 等 AI 算法的安装和可用状态
 *     tags: [System]
 *     responses:
 *       200:
 *         description: AI 算法状态
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                 algorithms:
 *                   type: object
 */
app.get("/api/ai-status", async (req, res) => {
  try {
    const { getAIStatus } = await import("./engines/ai-engine.mjs");
    const status = await getAIStatus();
    res.json(status);
  } catch (error) {
    res.json({
      available: false,
      error: error.message,
      algorithms: {},
    });
  }
});

/**
 * @openapi
 * /api/install-guide/{driver}:
 *   get:
 *     summary: 获取驱动/依赖安装指引
 *     tags: [System]
 *     parameters:
 *       - in: path
 *         name: driver
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ffmpeg, nvidia, opencv, torch, python]
 *     responses:
 *       200:
 *         description: 安装指引内容
 *       404:
 *         description: 未知驱动类型
 */
app.get("/api/install-guide/:driver", (req, res) => {
  const { driver } = req.params;
  const guide = getInstallGuide(driver);

  if (guide.error) {
    return res.status(404).json(guide);
  }

  res.json(guide);
});

// ==========================================
// 前端路由回退 (SPA)
// ==========================================

app.get("*", (req, res) => {
  const indexPath = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      service: "video-watermark-remover",
      status: "running",
      message: "Frontend not built yet. Run: npm run build",
      api: {
        health: "GET /api/health",
        gpuStatus: "GET /api/gpu-status",
        detectWatermark: "POST /api/detect-watermark",
        removeWatermark: "POST /api/remove-watermark",
        download: "GET /api/download/:filename",
        installGuide: "GET /api/install-guide/:driver",
      },
    });
  }
});

// ==========================================
// 错误处理
// ==========================================

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large. Maximum 2GB allowed." });
  }
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// ==========================================
// 启动服务
// ==========================================

app.listen(PORT, () => {
  console.log(`
Video Watermark Remover Service Started
========================================
Port:    ${PORT}
PID:     ${process.pid}

API Endpoints:
  GET  /api/health                    - Health check
  GET  /api/gpu-status                - GPU environment status
  GET  /api/ai-status                 - AI algorithm availability
  POST /api/detect-watermark          - Auto-detect watermark regions
  POST /api/remove-watermark          - Remove watermark (SSE stream)
  GET  /api/download/:filename        - Download processed video
  GET  /api/install-guide/:driver     - Installation guide
  GET  /api-docs                      - Swagger API documentation

Temp dirs:
  Uploads: ${UPLOAD_DIR}
  Outputs: ${OUTPUT_DIR}
========================================
  `);
});

export default app;
