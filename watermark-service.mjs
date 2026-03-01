/**
 * 水印去除服务
 * 支持两种模式：FFmpeg delogo（快速）和 Python OpenCV inpaint（高质量）
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { detectHardwareEncoder } from "./engines/ffmpeg-engine.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const UPLOAD_DIR = path.join(__dirname, "temp-uploads");
export const OUTPUT_DIR = path.join(__dirname, "temp-outputs");

// 确保临时目录存在
[UPLOAD_DIR, OUTPUT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * 通用命令执行（带进度回调）
 */
const runCommandWithProgress = (command, args, onProgress) => {
  return new Promise((resolve, reject) => {
    console.log('\n-------------------------------------------------------------');
    console.log('[API] New Task Started:\nExecuting: ${command} ${args.join(" ")}');
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      if (onProgress) onProgress({ type: "stdout", data: text });
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      // FFmpeg outputs progress to stderr
      if (onProgress) onProgress({ type: "stderr", data: text });
    });

    child.on("close", (code) => {
      console.log('Task finished with code:', code);
      console.log('-------------------------------------------------------------\n');
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command failed (code ${code}): ${stderr.slice(-500)}`));
      }
    });

    child.on("error", (err) => reject(err));
  });
};

/**
 * 清理临时文件
 */
export const cleanupFiles = (files) => {
  files.forEach((file) => {
    if (file && fs.existsSync(file)) {
      try {
        fs.rmSync(file, { recursive: true, force: true });
        console.log(`Deleted temp file: ${file}`);
      } catch (e) {
        console.error(`Failed to delete ${file}:`, e.message);
      }
    }
  });
};

/**
 * 解析 FFmpeg 进度信息
 * FFmpeg stderr 输出格式: frame=  10 fps= 25 q=28.0 size=    100kB time=00:00:01.00 bitrate= 800.0kbits/s speed=1.0x
 */
const parseFFmpegProgress = (text, totalDuration) => {
  const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
  if (!timeMatch) return null;

  const hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2]);
  const seconds = parseFloat(timeMatch[3]);
  const currentTime = hours * 3600 + minutes * 60 + seconds;

  const fpsMatch = text.match(/fps=\s*([\d.]+)/);
  const speedMatch = text.match(/speed=\s*([\d.]+)x/);

  const progress = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  return {
    currentTime,
    fps: fpsMatch ? parseFloat(fpsMatch[1]) : null,
    speed: speedMatch ? parseFloat(speedMatch[1]) : null,
    progress: Math.round(progress),
  };
};

/**
 * 获取视频时长（秒）
 */
const getVideoDuration = async (inputPath) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn("ffprobe", [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        inputPath,
      ]);
      let stdout = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.on("close", (code) => {
        console.log('Task finished with code:', code);
        console.log('-------------------------------------------------------------\n');
        if (code === 0) resolve(stdout);
        else reject(new Error("ffprobe failed"));
      });
      child.on("error", reject);
    });

    const data = JSON.parse(result);
    return parseFloat(data.format?.duration || "0");
  } catch {
    return 0;
  }
};

/**
 * FFmpeg delogo 模式水印去除（快速）
 * 使用 delogo filter 对指定区域进行模糊/插值处理
 * 支持一次传入多个区域进行处理
 */
export const removeWatermarkFFmpeg = async (inputPath, outputPath, regions, onProgress) => {
  // 获取视频时长用于计算进度
  const duration = await getVideoDuration(inputPath);

  const hwEncoder = await detectHardwareEncoder();
  console.log(`Using encoder: ${hwEncoder}`);

  // 将所有区域映射为独立的 delogo 滤镜，并使用逗号在视频流滤镜上进行串联
  const delogoFilter = regions
    .map(r => `delogo=x=${r.x}:y=${r.y}:w=${r.width}:h=${r.height}`)
    .join(',');

  const encoderArgs = buildEncoderArgsForService(hwEncoder);

  const args = [
    "-i", inputPath,
    "-vf", delogoFilter,
    "-c:a", "copy",          // 音频不重新编码
    ...encoderArgs,
    "-movflags", "+faststart",
    "-y", outputPath,
  ];

  let lastProgress = 0;
  await runCommandWithProgress("ffmpeg", args, (event) => {
    if (event.type === "stderr" && onProgress) {
      const progress = parseFFmpegProgress(event.data, duration);
      if (progress && progress.progress !== lastProgress) {
        lastProgress = progress.progress;
        onProgress({
          stage: "processing",
          method: "ffmpeg-delogo",
          encoder: hwEncoder,
          progress: progress.progress,
          currentTime: progress.currentTime,
          totalDuration: duration,
          fps: progress.fps,
          speed: progress.speed,
        });
      }
    }
  });
};

/**
 * 根据硬件编码器构建编码参数
 */
const buildEncoderArgsForService = (encoder) => {
  switch (encoder) {
    case "h264_videotoolbox":
      return [
        "-c:v", "h264_videotoolbox",
        "-b:v", "8M",
        "-pix_fmt", "yuv420p",
        "-allow_sw", "1",
        "-realtime", "0",
      ];
    case "h264_nvenc":
      return [
        "-c:v", "h264_nvenc",
        "-preset", "p4",
        "-cq", "18",
        "-pix_fmt", "yuv420p",
        "-gpu", "0",
      ];
    case "h264_amf":
      return [
        "-c:v", "h264_amf",
        "-quality", "quality",
        "-rc", "cqp",
        "-qp_i", "18",
        "-qp_p", "18",
        "-pix_fmt", "yuv420p",
      ];
    case "h264_qsv":
      return [
        "-c:v", "h264_qsv",
        "-preset", "faster",
        "-global_quality", "18",
        "-pix_fmt", "yuv420p",
      ];
    default: // libx264 CPU fallback
      return [
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-threads", "0",
      ];
  }
};

/**
 * Python OpenCV inpaint 模式水印去除（高质量）
 * 调用 scripts/inpaint_video.py
 */
export const removeWatermarkInpaint = async (inputPath, outputPath, regions, options, onProgress) => {
  const algorithm = options?.algorithm || "TELEA";
  const scriptPath = path.join(__dirname, "scripts", "inpaint_video.py");

  if (!fs.existsSync(scriptPath)) {
    throw new Error("Python inpaint script not found. Please ensure scripts/inpaint_video.py exists.");
  }

  const pythonCmd = options?.pythonCmd || "python3";
  const args = [
    scriptPath,
    "--input", inputPath,
    "--output", outputPath,
    "--regions", JSON.stringify(regions),
    "--algorithm", algorithm,
  ];

  await runCommandWithProgress(pythonCmd, args, (event) => {
    if (event.type === "stdout" && onProgress) {
      // Python script outputs JSON progress lines
      const lines = event.data.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.type === "progress") {
            onProgress({
              stage: "processing",
              method: "python-inpaint",
              progress: data.progress,
              currentFrame: data.current_frame,
              totalFrames: data.total_frames,
              algorithm,
            });
          }
        } catch {
          // Non-JSON output, ignore
        }
      }
    }
  });
};

/**
 * 自动检测水印区域（基于静态帧分析）
 * 返回可能的水印区域列表（置信度排序）
 */
export const detectWatermarkRegions = async (inputPath) => {
  // 提取视频第一帧进行分析
  const framePath = path.join(UPLOAD_DIR, `frame-${Date.now()}.png`);

  try {
    await runCommandWithProgress("ffmpeg", [
      "-i", inputPath,
      "-vframes", "1",
      "-f", "image2",
      "-y", framePath,
    ]);

    // 简单的边角区域检测策略（常见水印位置）
    // 真实场景中可调用 Python 脚本进行更精确的检测
    const probeResult = await new Promise((resolve, reject) => {
      const child = spawn("ffprobe", [
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-select_streams", "v:0",
        inputPath,
      ]);
      let stdout = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.on("close", (code) => {
        console.log('Task finished with code:', code);
        console.log('-------------------------------------------------------------\n');
        if (code === 0) resolve(stdout);
        else reject(new Error("ffprobe failed"));
      });
      child.on("error", reject);
    });

    const data = JSON.parse(probeResult);
    const stream = data.streams?.[0];
    const videoWidth = stream?.width || 1920;
    const videoHeight = stream?.height || 1080;

    // 返回常见水印位置建议
    const commonRegions = [
      {
        id: "top-left",
        label: "左上角",
        x: 10,
        y: 10,
        width: Math.round(videoWidth * 0.2),
        height: Math.round(videoHeight * 0.1),
        confidence: 0.6,
      },
      {
        id: "top-right",
        label: "右上角",
        x: Math.round(videoWidth * 0.75),
        y: 10,
        width: Math.round(videoWidth * 0.2),
        height: Math.round(videoHeight * 0.1),
        confidence: 0.7,
      },
      {
        id: "bottom-right",
        label: "右下角",
        x: Math.round(videoWidth * 0.75),
        y: Math.round(videoHeight * 0.88),
        width: Math.round(videoWidth * 0.2),
        height: Math.round(videoHeight * 0.1),
        confidence: 0.8,
      },
      {
        id: "bottom-left",
        label: "左下角",
        x: 10,
        y: Math.round(videoHeight * 0.88),
        width: Math.round(videoWidth * 0.2),
        height: Math.round(videoHeight * 0.1),
        confidence: 0.5,
      },
      {
        id: "bottom-center",
        label: "底部中央",
        x: Math.round(videoWidth * 0.35),
        y: Math.round(videoHeight * 0.9),
        width: Math.round(videoWidth * 0.3),
        height: Math.round(videoHeight * 0.08),
        confidence: 0.6,
      },
    ];

    return {
      videoWidth,
      videoHeight,
      suggestions: commonRegions.sort((a, b) => b.confidence - a.confidence),
      note: "Auto-detection provides common watermark positions. Manual selection recommended for accuracy.",
    };
  } finally {
    cleanupFiles([framePath]);
  }
};

/**
 * 主处理函数：SSE 推送进度版本
 * 在 Express 路由中使用，通过 SSE 向前端推送进度
 */
export const processWatermarkRemoval = async (req, res) => {
  const inputPath = req.file?.path;

  if (!inputPath) {
    return res.status(400).json({ error: "No video file uploaded" });
  }

  let regions = [];
  try {
    // 兼容前端传来的单对象 region，也兼容传来的数组 regions
    if (req.body.regions) {
      regions = typeof req.body.regions === "string"
        ? JSON.parse(req.body.regions)
        : req.body.regions;
    } else if (req.body.region) {
      const parsed = typeof req.body.region === "string"
        ? JSON.parse(req.body.region)
        : req.body.region;
      regions = [parsed];
    }

    if (!Array.isArray(regions) || regions.length === 0) {
      throw new Error("No regions provided");
    }

    // 校验每个区域
    regions.forEach((r, idx) => {
      if (r.x === undefined || r.y === undefined ||
        r.width === undefined || r.height === undefined) {
        throw new Error(`Invalid region at index ${idx}`);
      }
    });
  } catch (error) {
    cleanupFiles([inputPath]);
    return res.status(400).json({
      error: "Invalid regions parameter. Expected JSON array of: {x, y, width, height}",
    });
  }

  const method = req.body.method || "ffmpeg"; // "ffmpeg" | "inpaint"
  const algorithm = req.body.algorithm || "TELEA"; // for inpaint: TELEA or NS
  const quality = req.body.quality || "quality";
  const outputExt = path.extname(inputPath) || ".mp4";
  const outputFilename = `watermark-removed-${Date.now()}${outputExt}`;
  const outputPath = path.join(OUTPUT_DIR, outputFilename);

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent({ type: "start", method, regions, timestamp: Date.now() });

    const onProgress = (progress) => {
      sendEvent({ type: "progress", ...progress });
    };

    if (method === "inpaint") {
      await removeWatermarkInpaint(inputPath, outputPath, regions, { algorithm }, onProgress);
    } else {
      await removeWatermarkFFmpeg(inputPath, outputPath, regions, onProgress);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error("Output file was not created");
    }

    const stats = fs.statSync(outputPath);
    const downloadUrl = `/api/download/${outputFilename}`;

    sendEvent({
      type: "complete",
      success: true,
      downloadUrl,
      outputFilename,
      fileSize: stats.size,
      method,
      timestamp: Date.now(),
    });

    res.end();
  } catch (error) {
    console.error("Watermark removal failed:", error.message);
    sendEvent({
      type: "error",
      error: error.message,
      timestamp: Date.now(),
    });
    res.end();
    cleanupFiles([outputPath]);
  } finally {
    // 10分钟后自动清理输入和输出文件，保护隐私及节省空间 (600,000 ms)
    setTimeout(() => {
      cleanupFiles([inputPath]);
      if (fs.existsSync(outputPath)) {
        cleanupFiles([outputPath]);
      }
    }, 600000);
  }
};
