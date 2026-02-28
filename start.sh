#!/usr/bin/env bash
# Video Watermark Remover - 启动脚本
# 检查依赖、GPU环境，并启动服务

set -euo pipefail

# ============================================================
# 颜色定义
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ============================================================
# 工具函数
# ============================================================
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
step()    { echo -e "\n${BOLD}${CYAN}==> $*${NC}"; }

print_banner() {
  echo -e "${BOLD}${CYAN}"
  echo "╔═══════════════════════════════════════════╗"
  echo "║     Video Watermark Remover  v1.0.0       ║"
  echo "║     GPU-Accelerated Processing Engine     ║"
  echo "╚═══════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ============================================================
# 1. 检查 Node.js
# ============================================================
check_node() {
  step "检查 Node.js"
  if ! command -v node &>/dev/null; then
    error "Node.js 未安装"
    echo "  修复建议："
    case "$(uname -s)" in
      Darwin) echo "    brew install node@20" ;;
      Linux)  echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs" ;;
      *)      echo "    从 https://nodejs.org 下载 LTS 安装包" ;;
    esac
    return 1
  fi

  local version
  version=$(node --version)
  local major
  major=$(echo "$version" | sed 's/v\([0-9]*\).*/\1/')
  if [ "$major" -lt 18 ]; then
    error "Node.js 版本过低: $version（需要 >= 18）"
    echo "  修复建议：升级到 Node.js 18 或更高版本"
    return 1
  fi
  success "Node.js $version"
}

# ============================================================
# 2. 检查 FFmpeg
# ============================================================
check_ffmpeg() {
  step "检查 FFmpeg"
  if ! command -v ffmpeg &>/dev/null; then
    error "FFmpeg 未安装"
    echo "  修复建议："
    case "$(uname -s)" in
      Darwin) echo "    brew install ffmpeg" ;;
      Linux)  echo "    sudo apt install -y ffmpeg" ;;
      *)      echo "    从 https://ffmpeg.org/download.html 下载并添加到 PATH" ;;
    esac
    return 1
  fi

  local version
  version=$(ffmpeg -version 2>&1 | head -1)
  success "FFmpeg: $version"
}

# ============================================================
# 3. 检查 Python
# ============================================================
check_python() {
  step "检查 Python（OpenCV 修复引擎）"
  local python_bin=""
  for bin in python3 python python3.11 python3.10 python3.9; do
    if command -v "$bin" &>/dev/null; then
      python_bin="$bin"
      break
    fi
  done

  if [ -z "$python_bin" ]; then
    warn "Python 未安装（OpenCV 修复引擎不可用，FFmpeg delogo 模式仍可使用）"
    echo "  安装建议："
    case "$(uname -s)" in
      Darwin) echo "    brew install python@3.11" ;;
      Linux)  echo "    sudo apt install -y python3 python3-pip" ;;
      *)      echo "    从 https://python.org/downloads 下载安装包" ;;
    esac
    return 0 # 非致命错误
  fi

  local py_version
  py_version=$("$python_bin" --version 2>&1)
  success "$py_version ($python_bin)"

  # 检查 OpenCV
  if "$python_bin" -c "import cv2, numpy" &>/dev/null 2>&1; then
    local cv_version
    cv_version=$("$python_bin" -c "import cv2; print(cv2.__version__)" 2>/dev/null)
    success "OpenCV $cv_version (numpy available)"
  else
    warn "OpenCV 或 NumPy 未安装"
    echo "  安装命令：$python_bin -m pip install opencv-python numpy"
  fi
}

# ============================================================
# 4. 检测 GPU 硬件编码器
# ============================================================
detect_gpu() {
  step "GPU 硬件编码器检测"

  local found_encoder=""

  # VideoToolbox (macOS)
  if [ "$(uname -s)" = "Darwin" ]; then
    if ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_videotoolbox -f null - &>/dev/null 2>&1; then
      success "Apple VideoToolbox (macOS GPU 加速) - 可用"
      found_encoder="h264_videotoolbox"
    fi
  fi

  # NVIDIA NVENC
  if ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_nvenc -f null - &>/dev/null 2>&1; then
    success "NVIDIA NVENC (GPU 加速) - 可用"
    found_encoder="${found_encoder:-h264_nvenc}"
    if command -v nvidia-smi &>/dev/null; then
      local gpu_info
      gpu_info=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1)
      info "  GPU: $gpu_info"
    fi
  fi

  # AMD AMF
  if ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_amf -f null - &>/dev/null 2>&1; then
    success "AMD AMF (GPU 加速) - 可用"
    found_encoder="${found_encoder:-h264_amf}"
  fi

  # Intel QSV
  if ffmpeg -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v h264_qsv -f null - &>/dev/null 2>&1; then
    success "Intel Quick Sync (GPU 加速) - 可用"
    found_encoder="${found_encoder:-h264_qsv}"
  fi

  if [ -z "$found_encoder" ]; then
    warn "未检测到硬件编码器，将使用 CPU 软件编码 (libx264)"
    warn "处理速度可能较慢。如需 GPU 加速，请参阅 README.md 中的安装指引"
  else
    info "主编码器: $found_encoder"
  fi
}

# ============================================================
# 5. 安装 Node.js 依赖
# ============================================================
install_deps() {
  step "安装 Node.js 依赖"
  if [ ! -d "node_modules" ]; then
    info "首次运行，安装依赖..."
    if ! npm install; then
      error "依赖安装失败"
      echo "  修复建议：检查网络连接，或手动运行 npm install"
      return 1
    fi
    success "依赖安装完成"
  else
    success "依赖已安装，跳过"
  fi
}

# ============================================================
# 6. 创建必要目录
# ============================================================
setup_dirs() {
  step "初始化目录结构"
  mkdir -p uploads output temp
  success "目录就绪: uploads/ output/ temp/"
}

# ============================================================
# 7. 检查端口占用
# ============================================================
check_port() {
  local port="${1:-3000}"
  if lsof -Pi ":$port" -sTCP:LISTEN -t &>/dev/null 2>&1; then
    warn "端口 $port 已被占用"
    echo "  修复建议：lsof -ti :$port | xargs kill -9"
    return 1
  fi
  success "端口 $port 空闲"
}

# ============================================================
# 主流程
# ============================================================
main() {
  print_banner

  local has_error=0

  check_node    || has_error=1
  check_ffmpeg  || has_error=1
  check_python  # 非致命
  detect_gpu    # 非致命
  check_port 3099 || has_error=1

  if [ "$has_error" -eq 1 ]; then
    echo ""
    error "存在必要依赖缺失，请按照上面的修复建议安装后重试。"
    exit 1
  fi

  install_deps || exit 1
  setup_dirs

  echo ""
  echo -e "${BOLD}${GREEN}所有检查通过！启动服务...${NC}"
  echo ""
  info "后端 API: http://localhost:3099"
  info "前端界面: http://localhost:5173 (运行 npm run dev 后可访问)"
  echo ""

  # 启动后端服务
  exec node server.mjs
}

main "$@"
