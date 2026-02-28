/**
 * 驱动安装指引模块
 * 提供各平台的GPU驱动、FFmpeg、Python/OpenCV安装步骤和验证命令
 */

export const installGuides = {
  /**
   * FFmpeg安装指引
   */
  ffmpeg: {
    darwin: {
      title: 'macOS - 安装 FFmpeg',
      steps: [
        '安装 Homebrew（如果未安装）：/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        '安装 FFmpeg：brew install ffmpeg',
        '验证安装：ffmpeg -version',
      ],
      verify: 'ffmpeg -version',
    },
    linux: {
      title: 'Linux - 安装 FFmpeg',
      steps: [
        'Ubuntu/Debian: sudo apt update && sudo apt install -y ffmpeg',
        'CentOS/RHEL: sudo yum install -y epel-release && sudo yum install -y ffmpeg',
        'Arch Linux: sudo pacman -S ffmpeg',
        '验证安装：ffmpeg -version',
      ],
      verify: 'ffmpeg -version',
    },
    win32: {
      title: 'Windows - 安装 FFmpeg',
      steps: [
        '方式1（推荐）：使用 winget 安装：winget install ffmpeg',
        '方式2：从 https://ffmpeg.org/download.html 下载预编译包',
        '解压到 C:\\ffmpeg，将 C:\\ffmpeg\\bin 添加到系统 PATH 环境变量',
        '重启终端，验证安装：ffmpeg -version',
      ],
      verify: 'ffmpeg -version',
    },
  },

  /**
   * Python 安装指引
   */
  python: {
    darwin: {
      title: 'macOS - 安装 Python 3',
      steps: [
        '方式1（推荐）：brew install python@3.11',
        '方式2：从 https://python.org/downloads 下载安装包',
        '安装 OpenCV 和 NumPy：pip3 install opencv-python numpy',
        '验证：python3 -c "import cv2; print(cv2.__version__)"',
      ],
      verify: 'python3 --version',
    },
    linux: {
      title: 'Linux - 安装 Python 3',
      steps: [
        'Ubuntu/Debian: sudo apt install -y python3 python3-pip python3-opencv',
        'CentOS/RHEL: sudo yum install -y python3 python3-pip',
        '安装依赖：pip3 install opencv-python numpy',
        '验证：python3 -c "import cv2; print(cv2.__version__)"',
      ],
      verify: 'python3 --version',
    },
    win32: {
      title: 'Windows - 安装 Python 3',
      steps: [
        '从 https://python.org/downloads 下载 Python 3.11+ 安装程序',
        '安装时勾选 "Add Python to PATH"',
        '安装 OpenCV：pip install opencv-python numpy',
        '验证：python -c "import cv2; print(cv2.__version__)"',
      ],
      verify: 'python --version',
    },
  },

  /**
   * NVIDIA CUDA / NVENC 驱动安装指引
   */
  nvidia: {
    darwin: {
      title: 'macOS - NVIDIA GPU（不支持）',
      steps: [
        'macOS 不支持 NVIDIA CUDA（Apple 于 2019 年停止支持）',
        '建议使用 Apple VideoToolbox 硬件加速（自动检测，无需额外安装）',
        '如需 NVIDIA 加速，请使用 Linux 或 Windows 系统',
      ],
      verify: null,
    },
    linux: {
      title: 'Linux - 安装 NVIDIA CUDA 驱动',
      steps: [
        '添加 NVIDIA 仓库：sudo add-apt-repository ppa:graphics-drivers/ppa && sudo apt update',
        '安装驱动（推荐最新稳定版）：sudo apt install -y nvidia-driver-535',
        '安装 CUDA Toolkit：sudo apt install -y cuda-toolkit-12-3',
        '安装 FFmpeg（含 NVENC 支持）：sudo apt install -y ffmpeg',
        '验证 NVIDIA 驱动：nvidia-smi',
        '验证 NVENC 可用：ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_nvenc -f null -',
      ],
      verify: 'nvidia-smi',
    },
    win32: {
      title: 'Windows - 安装 NVIDIA CUDA 驱动',
      steps: [
        '从 https://www.nvidia.com/drivers 下载并安装最新 Game Ready 或 Studio 驱动',
        '从 https://developer.nvidia.com/cuda-downloads 下载 CUDA Toolkit 12.x',
        '安装 FFmpeg（含 NVENC）：从 https://ffmpeg.org/download.html 下载含 GPU 支持的版本',
        '验证驱动：nvidia-smi',
        '验证 NVENC：ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_nvenc -f null -',
      ],
      verify: 'nvidia-smi',
    },
  },

  /**
   * AMD AMF 驱动安装指引
   */
  amd: {
    darwin: {
      title: 'macOS - AMD GPU',
      steps: [
        'macOS 使用 Apple VideoToolbox 加速，AMD GPU 无需额外驱动',
        '系统会自动使用 VideoToolbox 进行硬件加速编码',
      ],
      verify: null,
    },
    linux: {
      title: 'Linux - 安装 AMD ROCm 驱动',
      steps: [
        '添加 ROCm 仓库：sudo echo "deb [arch=amd64] https://repo.radeon.com/rocm/apt/5.7/ jammy main" | sudo tee /etc/apt/sources.list.d/rocm.list',
        '安装驱动：sudo apt update && sudo apt install -y rocm-dev',
        '安装带 AMF 支持的 FFmpeg：sudo apt install -y ffmpeg',
        '验证：ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_amf -f null -',
      ],
      verify: 'rocm-smi',
    },
    win32: {
      title: 'Windows - 安装 AMD 驱动',
      steps: [
        '从 https://www.amd.com/en/support 下载并安装最新 Adrenalin 驱动',
        '下载含 AMF 支持的 FFmpeg：https://ffmpeg.org/download.html',
        '将 FFmpeg 的 bin 目录添加到 PATH',
        '验证：ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_amf -f null -',
      ],
      verify: null,
    },
  },

  /**
   * Intel Quick Sync 驱动安装指引
   */
  intel: {
    darwin: {
      title: 'macOS - Intel GPU',
      steps: [
        'macOS 使用 Apple VideoToolbox 加速，Intel GPU 无需额外驱动',
        '系统会自动使用 VideoToolbox 进行硬件加速编码',
      ],
      verify: null,
    },
    linux: {
      title: 'Linux - 安装 Intel Media Driver（QSV）',
      steps: [
        '安装 Intel Media Driver：sudo apt install -y intel-media-va-driver-non-free libmfx1',
        '安装 VA-API 工具：sudo apt install -y vainfo',
        '安装含 QSV 支持的 FFmpeg：sudo apt install -y ffmpeg',
        '验证 VA-API：vainfo',
        '验证 QSV：ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_qsv -f null -',
      ],
      verify: 'vainfo',
    },
    win32: {
      title: 'Windows - Intel Quick Sync',
      steps: [
        'Quick Sync 内置于 Intel 核显驱动，通常已随系统安装',
        '从 https://www.intel.com/content/www/us/en/download-center/home.html 更新到最新显卡驱动',
        '安装含 QSV 支持的 FFmpeg：https://ffmpeg.org/download.html',
        '验证：ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_qsv -f null -',
      ],
      verify: null,
    },
  },

  /**
   * Node.js 安装指引
   */
  nodejs: {
    darwin: {
      title: 'macOS - 安装 Node.js',
      steps: [
        '方式1（推荐）：brew install node@20',
        '方式2：从 https://nodejs.org 下载 LTS 安装包',
        '方式3：使用 nvm：curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && nvm install 20',
        '验证：node --version && npm --version',
      ],
      verify: 'node --version',
    },
    linux: {
      title: 'Linux - 安装 Node.js',
      steps: [
        '使用 NodeSource 仓库（推荐）：curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -',
        'sudo apt install -y nodejs',
        '验证：node --version && npm --version',
      ],
      verify: 'node --version',
    },
    win32: {
      title: 'Windows - 安装 Node.js',
      steps: [
        '从 https://nodejs.org 下载 LTS（20.x）安装包',
        '运行安装程序，保持默认选项',
        '验证：node --version && npm --version',
      ],
      verify: 'node --version',
    },
  },
};

/**
 * 获取当前平台的安装指引
 * @param {string} tool - 工具名称 ('ffmpeg' | 'python' | 'nvidia' | 'amd' | 'intel' | 'nodejs')
 * @returns {object} 安装指引对象
 */
export const getGuide = (tool) => {
  const platform = process.platform; // 'darwin' | 'linux' | 'win32'
  const guide = installGuides[tool];
  if (!guide) return null;
  return guide[platform] || guide['linux']; // 默认使用Linux指引
};

/**
 * 获取所有工具的当前平台安装指引
 */
export const getAllGuides = () => {
  return Object.keys(installGuides).reduce((acc, tool) => {
    acc[tool] = getGuide(tool);
    return acc;
  }, {});
};
