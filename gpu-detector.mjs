/**
 * GPU 环境检测模块
 * 检测操作系统、GPU、FFmpeg硬件编码器支持、Python环境
 */

import { spawn } from "child_process";
import os from "os";

/**
 * 执行命令并返回输出
 */
const runCommand = (command, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on("error", (err) => reject(err));
  });
};

/**
 * 安全执行命令（失败时返回null而不是抛出异常）
 */
const tryCommand = async (command, args, options = {}) => {
  try {
    return await runCommand(command, args, options);
  } catch {
    return null;
  }
};

/**
 * 检测平台信息
 */
const detectPlatform = () => {
  const platform = process.platform;
  const arch = process.arch;
  const release = os.release();

  const platformMap = {
    darwin: "macOS",
    linux: "Linux",
    win32: "Windows",
  };

  return {
    os: platformMap[platform] || platform,
    platform,
    arch,
    release,
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + "GB",
  };
};

/**
 * 检测 macOS Metal GPU（通过 system_profiler）
 */
const detectMacGPUs = async () => {
  const gpus = [];
  const result = await tryCommand("system_profiler", ["SPDisplaysDataType", "-json"]);
  if (!result) return gpus;

  try {
    const data = JSON.parse(result.stdout);
    const displays = data.SPDisplaysDataType || [];
    for (const display of displays) {
      gpus.push({
        vendor: "Apple/AMD/Intel",
        name: display.sppci_model || display._name || "Unknown GPU",
        type: "Metal",
        memory: display.sppci_vram || display.sppci_vram_shared || "N/A",
        available: true,
      });
    }
  } catch {
    // JSON parse failed, try text output
    const textResult = await tryCommand("system_profiler", ["SPDisplaysDataType"]);
    if (textResult) {
      const matches = textResult.stdout.match(/Chipset Model: (.+)/g) || [];
      for (const match of matches) {
        gpus.push({
          vendor: "Apple",
          name: match.replace("Chipset Model: ", "").trim(),
          type: "Metal",
          available: true,
        });
      }
    }
  }

  return gpus;
};

/**
 * 检测 NVIDIA GPU（通过 nvidia-smi）
 */
const detectNvidiaGPUs = async () => {
  const gpus = [];
  const result = await tryCommand("nvidia-smi", [
    "--query-gpu=name,memory.total,driver_version",
    "--format=csv,noheader,nounits",
  ]);

  if (!result) return gpus;

  const lines = result.stdout.trim().split("\n").filter(Boolean);
  for (const line of lines) {
    const parts = line.split(", ");
    gpus.push({
      vendor: "NVIDIA",
      name: parts[0]?.trim() || "NVIDIA GPU",
      type: "CUDA",
      memory: parts[1] ? parts[1].trim() + "MB" : "N/A",
      driverVersion: parts[2]?.trim() || "N/A",
      available: true,
    });
  }

  return gpus;
};

/**
 * 检测 AMD GPU（通过 rocm-smi 或系统信息）
 */
const detectAMDGPUs = async () => {
  const gpus = [];
  const result = await tryCommand("rocm-smi", ["--showproductname"]);
  if (result) {
    const matches = result.stdout.match(/GPU\[\d+\].*?: (.+)/g) || [];
    for (const match of matches) {
      gpus.push({
        vendor: "AMD",
        name: match.replace(/GPU\[\d+\].*?: /, "").trim(),
        type: "ROCm",
        available: true,
      });
    }
  }
  return gpus;
};

/**
 * 检测 Intel GPU（通过 vainfo 或系统信息）
 */
const detectIntelGPUs = async () => {
  const gpus = [];
  const result = await tryCommand("vainfo", []);
  if (result && result.stdout.includes("VA-API")) {
    gpus.push({
      vendor: "Intel",
      name: "Intel GPU (VA-API)",
      type: "VAAPI/QSV",
      available: true,
    });
  }
  return gpus;
};

/**
 * 检测所有可用 GPU
 */
const detectGPUs = async (platform) => {
  const gpus = [];

  if (platform === "darwin") {
    const macGPUs = await detectMacGPUs();
    gpus.push(...macGPUs);
  } else if (platform === "linux" || platform === "win32") {
    const [nvidiaGPUs, amdGPUs, intelGPUs] = await Promise.all([
      detectNvidiaGPUs(),
      detectAMDGPUs(),
      detectIntelGPUs(),
    ]);
    gpus.push(...nvidiaGPUs, ...amdGPUs, ...intelGPUs);
  }

  // Windows also check NVIDIA
  if (platform === "win32") {
    const nvidiaGPUs = await detectNvidiaGPUs();
    if (nvidiaGPUs.length > 0) gpus.push(...nvidiaGPUs);
  }

  return gpus;
};

/**
 * 检测 FFmpeg 可用硬件加速方案
 */
const detectFFmpegHWAccels = async () => {
  const result = await tryCommand("ffmpeg", ["-hwaccels", "-hide_banner"]);
  if (!result) return [];

  const lines = result.stdout.split("\n");
  const hwaccels = [];
  let inList = false;

  for (const line of lines) {
    if (line.trim() === "Hardware acceleration methods:") {
      inList = true;
      continue;
    }
    if (inList && line.trim()) {
      hwaccels.push(line.trim());
    }
  }

  return hwaccels;
};

/**
 * 检测 FFmpeg 可用编码器（重点是硬件编码器）
 */
const detectFFmpegEncoders = async () => {
  const result = await tryCommand("ffmpeg", ["-encoders", "-hide_banner"]);
  if (!result) return { all: [], hardware: [] };

  const hwEncoderPatterns = [
    "h264_videotoolbox", "hevc_videotoolbox",
    "h264_nvenc", "hevc_nvenc", "av1_nvenc",
    "h264_amf", "hevc_amf",
    "h264_qsv", "hevc_qsv", "vp9_qsv", "av1_qsv",
    "h264_vaapi", "hevc_vaapi", "vp9_vaapi", "av1_vaapi",
  ];

  const lines = result.stdout.split("\n");
  const hardware = [];

  for (const line of lines) {
    for (const pattern of hwEncoderPatterns) {
      if (line.includes(pattern)) {
        hardware.push(pattern);
        break;
      }
    }
  }

  return { hardware };
};

/**
 * 测试具体编码器是否真正可用
 */
const testEncoder = async (encoderName) => {
  const result = await tryCommand("ffmpeg", [
    "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.1",
    "-c:v", encoderName, "-f", "null", "-", "-hide_banner", "-loglevel", "error",
  ]);
  return result !== null;
};

/**
 * 检测可用的硬件编码器（实际测试）
 */
const detectWorkingHWEncoders = async (platform) => {
  const encodersToTest = [];

  if (platform === "darwin") {
    encodersToTest.push(
      { name: "h264_videotoolbox", desc: "Apple VideoToolbox H.264" },
      { name: "hevc_videotoolbox", desc: "Apple VideoToolbox HEVC" }
    );
  }

  encodersToTest.push(
    { name: "h264_nvenc", desc: "NVIDIA NVENC H.264" },
    { name: "hevc_nvenc", desc: "NVIDIA NVENC HEVC" },
    { name: "h264_amf", desc: "AMD AMF H.264" },
    { name: "h264_qsv", desc: "Intel Quick Sync H.264" },
    { name: "h264_vaapi", desc: "VAAPI H.264 (Linux)" }
  );

  const results = await Promise.all(
    encodersToTest.map(async (enc) => ({
      ...enc,
      working: await testEncoder(enc.name),
    }))
  );

  return results.filter((e) => e.working);
};

/**
 * 检测 Python 环境
 */
const detectPython = async () => {
  // Try python3 first, then python
  const pythonCmds = ["python3", "python"];
  let pythonResult = null;
  let pythonCmd = null;

  for (const cmd of pythonCmds) {
    const result = await tryCommand(cmd, ["--version"]);
    if (result) {
      pythonResult = result;
      pythonCmd = cmd;
      break;
    }
  }

  if (!pythonResult) {
    return {
      available: false,
      version: null,
      opencv: false,
      torch: false,
      torchCuda: false,
      torchMPS: false,
    };
  }

  const version = (pythonResult.stdout + pythonResult.stderr).match(/Python (\d+\.\d+\.\d+)/)?.[1] || "unknown";

  // Check opencv
  const opencvResult = await tryCommand(pythonCmd, [
    "-c", "import cv2; print(cv2.__version__)",
  ]);

  // Check torch
  const torchResult = await tryCommand(pythonCmd, [
    "-c",
    "import torch; print(torch.__version__); print('cuda:' + str(torch.cuda.is_available())); print('mps:' + str(hasattr(torch.backends, 'mps') and torch.backends.mps.is_available()))",
  ]);

  let torchVersion = null;
  let torchCuda = false;
  let torchMPS = false;

  if (torchResult) {
    const lines = torchResult.stdout.trim().split("\n");
    torchVersion = lines[0]?.trim() || null;
    torchCuda = lines[1]?.includes("True") || false;
    torchMPS = lines[2]?.includes("True") || false;
  }

  return {
    available: true,
    cmd: pythonCmd,
    version,
    opencv: opencvResult !== null,
    opencvVersion: opencvResult?.stdout?.trim() || null,
    torch: torchResult !== null,
    torchVersion,
    torchCuda,
    torchMPS,
  };
};

/**
 * 根据检测结果生成安装建议
 */
const generateRecommendations = (platform, gpus, python, hwEncoders) => {
  const recommendations = [];

  // FFmpeg not found
  const ffmpegCheck = recommendations;

  // Python recommendations
  if (!python.available) {
    recommendations.push({
      type: "warning",
      category: "python",
      message: "Python not found. High-quality inpaint mode requires Python.",
      installCommands: {
        macOS: "brew install python3",
        Linux: "sudo apt-get install python3 python3-pip",
        Windows: "winget install Python.Python.3",
      },
    });
  } else if (!python.opencv) {
    recommendations.push({
      type: "info",
      category: "opencv",
      message: "opencv-python not found. Required for high-quality inpaint mode.",
      installCommands: {
        all: `${python.cmd || "pip3"} install opencv-python`,
      },
    });
  }

  if (python.available && !python.torch) {
    recommendations.push({
      type: "info",
      category: "torch",
      message: "PyTorch not found. Optional for GPU-accelerated processing.",
      installCommands: {
        macOS: "pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cpu",
        Linux_CUDA: "pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu121",
        Windows_CUDA: "pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu121",
      },
    });
  }

  // GPU recommendations
  if (gpus.length === 0) {
    recommendations.push({
      type: "info",
      category: "gpu",
      message: "No dedicated GPU detected. Processing will use CPU (slower).",
    });
  }

  // Hardware encoder recommendations
  if (hwEncoders.length === 0) {
    if (platform === "darwin") {
      recommendations.push({
        type: "info",
        category: "encoder",
        message: "No hardware encoders available. Install FFmpeg with VideoToolbox support.",
        installCommands: {
          macOS: "brew install ffmpeg",
        },
      });
    } else if (platform === "linux") {
      recommendations.push({
        type: "info",
        category: "encoder",
        message: "No hardware encoders available. For NVIDIA, install ffmpeg with NVENC support.",
        installCommands: {
          Linux_NVIDIA: "sudo apt-get install ffmpeg nvidia-cuda-toolkit",
          Linux_AMD: "sudo apt-get install ffmpeg vainfo libva-dev",
        },
      });
    }
  }

  return recommendations;
};

/**
 * 主函数：完整 GPU 环境检测
 */
export const detectGPUEnvironment = async () => {
  const platformInfo = detectPlatform();
  const { platform } = platformInfo;

  console.log(`Detecting GPU environment on ${platformInfo.os}...`);

  const [gpus, ffmpegHWAccels, ffmpegEncoders, workingHWEncoders, python] =
    await Promise.all([
      detectGPUs(platform),
      detectFFmpegHWAccels(),
      detectFFmpegEncoders(),
      detectWorkingHWEncoders(platform),
      detectPython(),
    ]);

  // Check FFmpeg availability
  const ffmpegResult = await tryCommand("ffmpeg", ["-version"]);
  const ffmpegAvailable = ffmpegResult !== null;
  const ffmpegVersion = ffmpegResult?.stdout?.split("\n")[0]?.match(/ffmpeg version ([\S]+)/)?.[1] || null;

  const recommendations = generateRecommendations(platform, gpus, python, workingHWEncoders);

  return {
    platform: platformInfo,
    gpus,
    ffmpeg: {
      available: ffmpegAvailable,
      version: ffmpegVersion,
      hwaccels: ffmpegHWAccels,
      encoders: ffmpegEncoders.hardware,
      workingEncoders: workingHWEncoders,
    },
    python,
    recommendations,
    detectedAt: new Date().toISOString(),
  };
};

/**
 * 获取驱动安装指引
 */
export const getInstallGuide = (driver) => {
  const guides = {
    ffmpeg: {
      title: "FFmpeg Installation Guide",
      description: "FFmpeg is required for video processing",
      steps: {
        macOS: [
          "Install Homebrew: /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"",
          "Install FFmpeg: brew install ffmpeg",
          "Verify: ffmpeg -version",
        ],
        Linux: [
          "Update packages: sudo apt-get update",
          "Install FFmpeg: sudo apt-get install ffmpeg",
          "Verify: ffmpeg -version",
        ],
        Windows: [
          "Download from: https://ffmpeg.org/download.html",
          "Extract to C:\\ffmpeg",
          "Add C:\\ffmpeg\\bin to PATH",
          "Verify: ffmpeg -version",
        ],
      },
    },
    nvidia: {
      title: "NVIDIA CUDA Driver Installation Guide",
      description: "Required for NVIDIA GPU hardware acceleration",
      steps: {
        Linux: [
          "Add NVIDIA repo: sudo add-apt-repository ppa:graphics-drivers/ppa",
          "Update: sudo apt-get update",
          "Install driver: sudo apt-get install nvidia-driver-535",
          "Install CUDA toolkit: sudo apt-get install nvidia-cuda-toolkit",
          "Reboot: sudo reboot",
          "Verify: nvidia-smi",
        ],
        Windows: [
          "Download NVIDIA driver from: https://www.nvidia.com/drivers",
          "Run installer and follow steps",
          "Download CUDA toolkit from: https://developer.nvidia.com/cuda-downloads",
          "Verify: nvidia-smi",
        ],
      },
    },
    opencv: {
      title: "OpenCV Python Installation Guide",
      description: "Required for high-quality inpaint watermark removal",
      steps: {
        all: [
          "Ensure Python 3.8+ is installed: python3 --version",
          "Install opencv-python: pip3 install opencv-python",
          "Verify: python3 -c \"import cv2; print(cv2.__version__)\"",
        ],
      },
    },
    torch: {
      title: "PyTorch Installation Guide",
      description: "Optional: enables GPU-accelerated processing",
      steps: {
        macOS_MPS: [
          "Install PyTorch with MPS support: pip3 install torch torchvision",
          "Verify MPS: python3 -c \"import torch; print(torch.backends.mps.is_available())\"",
        ],
        Linux_CUDA: [
          "Install PyTorch with CUDA: pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu121",
          "Verify CUDA: python3 -c \"import torch; print(torch.cuda.is_available())\"",
        ],
        CPU_only: [
          "Install PyTorch CPU-only: pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cpu",
        ],
      },
    },
    python: {
      title: "Python Installation Guide",
      description: "Required for high-quality inpaint mode",
      steps: {
        macOS: [
          "Install via Homebrew: brew install python3",
          "Or download from: https://www.python.org/downloads/",
          "Verify: python3 --version",
        ],
        Linux: [
          "Install: sudo apt-get install python3 python3-pip",
          "Verify: python3 --version",
        ],
        Windows: [
          "Download from: https://www.python.org/downloads/",
          "Run installer (check 'Add to PATH')",
          "Verify: python --version",
        ],
      },
    },
  };

  return guides[driver] || { error: `Unknown driver: ${driver}`, available: Object.keys(guides) };
};
