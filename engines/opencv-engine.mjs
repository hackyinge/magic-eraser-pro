/**
 * OpenCV修复引擎 - Node.js封装层
 * 调用Python脚本执行基于OpenCV的视频修复（inpainting）
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Python脚本路径
const PYTHON_SCRIPT = path.join(__dirname, '..', 'scripts', 'inpaint_video.py');

/**
 * 执行Python脚本
 * @param {string} pythonBin  - Python可执行文件路径
 * @param {string[]} args     - 脚本参数
 * @param {Function} onProgress - 进度回调
 */
const runPython = (pythonBin, args, onProgress = null) => {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      // Python脚本通过stdout输出JSON进度
      if (onProgress) {
        chunk.split('\n').forEach((line) => {
          line = line.trim();
          if (!line) return;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'progress') onProgress(msg);
          } catch {
            // 非JSON行忽略
          }
        });
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Python script failed (code ${code})\n${stderr}`));
      }
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`Python not found: ${pythonBin}. Please install Python 3.8+`));
      } else {
        reject(err);
      }
    });
  });
};

/**
 * 检测可用的Python可执行文件
 */
export const detectPython = async () => {
  const candidates = ['python3', 'python', 'python3.11', 'python3.10', 'python3.9'];
  for (const bin of candidates) {
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(bin, ['--version']);
        child.on('close', (code) => (code === 0 ? resolve() : reject()));
        child.on('error', reject);
      });
      return bin;
    } catch {
      continue;
    }
  }
  return null;
};

/**
 * 检查OpenCV Python依赖是否已安装
 */
export const checkOpenCVDeps = async () => {
  const pythonBin = await detectPython();
  if (!pythonBin) {
    return { available: false, reason: 'Python not found' };
  }

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(pythonBin, [
        '-c',
        'import cv2, numpy; print(cv2.__version__)',
      ]);
      let stdout = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.on('close', (code) => (code === 0 ? resolve(stdout.trim()) : reject()));
      child.on('error', reject);
    });
    return { available: true, pythonBin };
  } catch {
    return {
      available: false,
      reason: 'opencv-python or numpy not installed',
      installCmd: `${pythonBin} -m pip install opencv-python numpy`,
    };
  }
};

/**
 * 使用OpenCV inpainting去除水印
 *
 * @param {object} options
 * @param {string} options.inputPath     - 输入视频路径
 * @param {string} options.outputPath    - 输出视频路径
 * @param {Array}  options.regions       - 水印区域列表 [{x, y, w, h}, ...]
 * @param {string} [options.method]      - 修复算法: 'telea' | 'ns' (默认 'telea')
 * @param {number} [options.radius]      - 修复半径（像素，默认3）
 * @param {Function} [options.onProgress] - 进度回调
 */
export const removeWatermarkOpenCV = async ({
  inputPath,
  outputPath,
  regions,
  method = 'telea',
  radius = 3,
  onProgress = null,
}) => {
  const deps = await checkOpenCVDeps();
  if (!deps.available) {
    throw new Error(
      `OpenCV dependencies not available: ${deps.reason}` +
      (deps.installCmd ? `\nInstall with: ${deps.installCmd}` : '')
    );
  }

  if (!fs.existsSync(PYTHON_SCRIPT)) {
    throw new Error(`Python inpaint script not found: ${PYTHON_SCRIPT}`);
  }

  // 序列化区域参数为JSON字符串传给Python
  const regionsJson = JSON.stringify(regions);

  const args = [
    PYTHON_SCRIPT,
    '--input', inputPath,
    '--output', outputPath,
    '--regions', regionsJson,
    '--method', method,
    '--radius', String(radius),
  ];

  console.log(`Starting OpenCV inpainting with method: ${method}, radius: ${radius}`);
  await runPython(deps.pythonBin, args, onProgress);

  return { method, radius };
};

/**
 * 使用OpenCV生成单帧预览
 *
 * @param {object} options
 * @param {string} options.inputPath   - 输入视频路径
 * @param {string} options.outputPath  - 输出图片路径（jpg）
 * @param {Array}  options.regions     - 水印区域列表
 * @param {number} [options.timestamp] - 截取时间点（秒），默认1
 * @param {string} [options.method]    - 修复算法
 */
export const previewOpenCVRemoval = async ({
  inputPath,
  outputPath,
  regions,
  timestamp = 1,
  method = 'telea',
}) => {
  const deps = await checkOpenCVDeps();
  if (!deps.available) {
    throw new Error(`OpenCV dependencies not available: ${deps.reason}`);
  }

  const regionsJson = JSON.stringify(regions);
  const args = [
    PYTHON_SCRIPT,
    '--input', inputPath,
    '--output', outputPath,
    '--regions', regionsJson,
    '--method', method,
    '--preview-only',
    '--timestamp', String(timestamp),
  ];

  await runPython(deps.pythonBin, args);
};
