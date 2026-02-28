/**
 * FFmpeg水印去除引擎
 * 封装delogo滤镜、硬件编码器自动选择、视频元信息提取和处理进度解析
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// 硬件编码器缓存
let cachedHWEncoder = null;

/**
 * 执行命令（返回Promise）
 */
const runCommand = (command, args, onProgress = null) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      // FFmpeg进度信息输出到stderr
      if (onProgress) {
        parseProgress(chunk, onProgress);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}\n${stderr}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
};

/**
 * 解析FFmpeg进度信息
 * FFmpeg stderr输出格式: frame=  123 fps= 30 q=28.0 size=    512kB time=00:00:04.10 bitrate=1024.0kbits/s speed=1.0x
 */
const parseProgress = (chunk, onProgress) => {
  const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+\.\d+)/);
  const fpsMatch = chunk.match(/fps=\s*([\d.]+)/);
  const speedMatch = chunk.match(/speed=\s*([\d.]+)x/);
  const sizeMatch = chunk.match(/size=\s*(\d+)kB/);
  const frameMatch = chunk.match(/frame=\s*(\d+)/);

  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const seconds = parseFloat(timeMatch[3]);
    const currentSeconds = hours * 3600 + minutes * 60 + seconds;

    onProgress({
      currentSeconds,
      fps: fpsMatch ? parseFloat(fpsMatch[1]) : null,
      speed: speedMatch ? parseFloat(speedMatch[1]) : null,
      sizeKB: sizeMatch ? parseInt(sizeMatch[1]) : null,
      frame: frameMatch ? parseInt(frameMatch[1]) : null,
    });
  }
};

/**
 * 检测可用硬件编码器
 * 优先级：VideoToolbox (macOS) > NVENC (NVIDIA) > AMF (AMD) > QSV (Intel) > libx264
 */
export const detectHardwareEncoder = async () => {
  if (cachedHWEncoder !== null) return cachedHWEncoder;

  const encodersToTest = [
    { name: 'h264_videotoolbox', platform: 'darwin', desc: 'Apple VideoToolbox' },
    { name: 'h264_nvenc',        platform: 'all',    desc: 'NVIDIA NVENC' },
    { name: 'h264_amf',          platform: 'all',    desc: 'AMD AMF' },
    { name: 'h264_qsv',          platform: 'all',    desc: 'Intel Quick Sync' },
  ];

  for (const encoder of encodersToTest) {
    if (encoder.platform !== 'all' && process.platform !== encoder.platform) continue;

    try {
      await runCommand('ffmpeg', [
        '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.1',
        '-c:v', encoder.name, '-f', 'null', '-',
      ]);
      console.log(`Hardware encoder detected: ${encoder.desc} (${encoder.name})`);
      cachedHWEncoder = encoder.name;
      return encoder.name;
    } catch {
      // 继续测试下一个
    }
  }

  console.log('No hardware encoder available, falling back to libx264');
  cachedHWEncoder = 'libx264';
  return 'libx264';
};

/**
 * 重置编码器缓存（测试用）
 */
export const resetEncoderCache = () => {
  cachedHWEncoder = null;
};

/**
 * 获取视频元信息（通过ffprobe）
 */
export const getVideoInfo = async (inputPath) => {
  const { stdout } = await runCommand('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ]);

  const info = JSON.parse(stdout);
  const videoStream = info.streams?.find((s) => s.codec_type === 'video');
  const audioStream = info.streams?.find((s) => s.codec_type === 'audio');
  const format = info.format;

  // 解析帧率（可能是分数形式如"30000/1001"）
  let fps = null;
  if (videoStream?.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    fps = den ? num / den : num;
  }

  // 解析时长
  const duration = parseFloat(format?.duration || videoStream?.duration || 0);

  return {
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    fps: fps ? Math.round(fps * 100) / 100 : null,
    duration,
    durationFormatted: formatDuration(duration),
    codec: videoStream?.codec_name ?? null,
    pixelFormat: videoStream?.pix_fmt ?? null,
    bitrate: format?.bit_rate ? Math.round(parseInt(format.bit_rate) / 1000) : null, // kbps
    fileSize: format?.size ? parseInt(format.size) : null, // bytes
    audioCodec: audioStream?.codec_name ?? null,
    hasAudio: !!audioStream,
    container: format?.format_name ?? null,
  };
};

/**
 * 格式化时长为 HH:MM:SS
 */
const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
};

/**
 * 构建硬件编码器参数
 */
const buildEncoderArgs = (encoder, quality, outputPath) => {
  const crfVal = quality === 'low' ? '28' : quality === 'medium' ? '23' : '18';

  switch (encoder) {
    case 'h264_videotoolbox': {
      const bitrateMap = { low: '2M', medium: '5M', high: '10M' };
      return [
        '-c:v', 'h264_videotoolbox',
        '-b:v', bitrateMap[quality] || '5M',
        '-pix_fmt', 'yuv420p',
        '-allow_sw', '1',
        '-realtime', '0',
        '-y', outputPath,
      ];
    }
    case 'h264_nvenc':
      return [
        '-c:v', 'h264_nvenc',
        '-preset', 'p4',
        '-cq', crfVal,
        '-pix_fmt', 'yuv420p',
        '-gpu', '0',
        '-y', outputPath,
      ];
    case 'h264_amf':
      return [
        '-c:v', 'h264_amf',
        '-quality', quality === 'low' ? 'speed' : quality === 'high' ? 'quality' : 'balanced',
        '-rc', 'cqp',
        '-qp_i', crfVal,
        '-qp_p', crfVal,
        '-pix_fmt', 'yuv420p',
        '-y', outputPath,
      ];
    case 'h264_qsv':
      return [
        '-c:v', 'h264_qsv',
        '-preset', 'faster',
        '-global_quality', crfVal,
        '-pix_fmt', 'yuv420p',
        '-y', outputPath,
      ];
    default: // libx264
      return [
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', crfVal,
        '-preset', 'faster',
        '-threads', '0',
        '-y', outputPath,
      ];
  }
};

/**
 * 使用FFmpeg delogo滤镜去除水印
 *
 * @param {object} options
 * @param {string} options.inputPath   - 输入视频路径
 * @param {string} options.outputPath  - 输出视频路径
 * @param {Array}  options.regions     - 水印区域列表 [{x, y, w, h}, ...]
 * @param {string} [options.quality]   - 输出质量: 'low' | 'medium' | 'high'
 * @param {Function} [options.onProgress] - 进度回调 ({currentSeconds, fps, speed, ...})
 * @param {number} [options.totalDuration] - 视频总时长（秒），用于计算百分比
 */
export const removeWatermarkFFmpeg = async ({
  inputPath,
  outputPath,
  regions,
  quality = 'high',
  onProgress = null,
  totalDuration = null,
}) => {
  if (!regions || regions.length === 0) {
    throw new Error('At least one watermark region must be specified');
  }

  // 构建delogo滤镜链（支持多区域）
  // 格式: delogo=x=10:y=10:w=100:h=50
  const delogoFilters = regions.map((r) => {
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const w = Math.round(r.w);
    const h = Math.round(r.h);
    return `delogo=x=${x}:y=${y}:w=${w}:h=${h}`;
  });

  // 多区域通过逗号串联
  const filterChain = delogoFilters.join(',');

  const hwEncoder = await detectHardwareEncoder();
  const encoderArgs = buildEncoderArgs(hwEncoder, quality, outputPath);

  const progressCallback = onProgress && totalDuration
    ? (prog) => {
        const percent = Math.min(100, Math.round((prog.currentSeconds / totalDuration) * 100));
        onProgress({ ...prog, percent });
      }
    : onProgress;

  const args = [
    '-i', inputPath,
    '-vf', filterChain,
    ...encoderArgs,
  ];

  // 如果有音频，复制音频流
  // encoderArgs末尾已包含-y outputPath，需要在其前面插入音频参数
  const outputIdx = args.indexOf('-y');
  args.splice(outputIdx, 0, '-c:a', 'copy');

  console.log(`Starting watermark removal with encoder: ${hwEncoder}`);
  console.log(`Filter: ${filterChain}`);

  await runCommand('ffmpeg', args, progressCallback);

  return { encoder: hwEncoder, filterChain };
};

/**
 * 快速预览去水印效果（截取单帧）
 *
 * @param {object} options
 * @param {string} options.inputPath  - 输入视频路径
 * @param {string} options.outputPath - 输出图片路径（jpg）
 * @param {Array}  options.regions    - 水印区域列表
 * @param {number} [options.timestamp] - 截取时间点（秒），默认1秒
 */
export const previewWatermarkRemoval = async ({
  inputPath,
  outputPath,
  regions,
  timestamp = 1,
}) => {
  const delogoFilters = regions.map((r) =>
    `delogo=x=${Math.round(r.x)}:y=${Math.round(r.y)}:w=${Math.round(r.w)}:h=${Math.round(r.h)}`
  );
  const filterChain = delogoFilters.join(',');

  await runCommand('ffmpeg', [
    '-ss', String(timestamp),
    '-i', inputPath,
    '-vf', filterChain,
    '-frames:v', '1',
    '-q:v', '2',
    '-y', outputPath,
  ]);
};
