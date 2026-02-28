#!/usr/bin/env python3
"""
视频水印修复脚本（OpenCV inpaint）
支持 TELEA 和 NS 两种算法，逐帧处理视频水印区域
支持 GPU 加速：检测 torch.cuda / torch.mps 可用性
"""

import argparse
import sys
import json
import os
import cv2
import numpy as np


def print_progress(current_frame, total_frames):
    """输出 JSON 格式进度供 Node.js 读取"""
    progress = round(current_frame / total_frames * 100) if total_frames > 0 else 0
    data = {
        "type": "progress",
        "current_frame": current_frame,
        "total_frames": total_frames,
        "progress": progress,
    }
    print(json.dumps(data), flush=True)


def detect_gpu():
    """检测可用 GPU 加速后端"""
    gpu_info = {"cuda": False, "mps": False, "device": "cpu"}
    try:
        import torch
        if torch.cuda.is_available():
            gpu_info["cuda"] = True
            gpu_info["device"] = "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            gpu_info["mps"] = True
            gpu_info["device"] = "mps"
    except ImportError:
        pass
    return gpu_info


def detect_hw_encoder():
    """检测最优 FFmpeg 硬件编码器"""
    import subprocess
    # 按优先级测试编码器
    encoders = [
        ("h264_videotoolbox", ["-f", "lavfi", "-i", "color=black:s=64x64:d=0.1",
                               "-c:v", "h264_videotoolbox", "-f", "null", "-"]),
        ("h264_nvenc", ["-f", "lavfi", "-i", "color=black:s=64x64:d=0.1",
                        "-c:v", "h264_nvenc", "-f", "null", "-"]),
        ("h264_amf", ["-f", "lavfi", "-i", "color=black:s=64x64:d=0.1",
                      "-c:v", "h264_amf", "-f", "null", "-"]),
        ("h264_qsv", ["-f", "lavfi", "-i", "color=black:s=64x64:d=0.1",
                      "-c:v", "h264_qsv", "-f", "null", "-"]),
    ]
    for name, cmd in encoders:
        try:
            result = subprocess.run(
                ["ffmpeg", "-hide_banner", "-y"] + cmd,
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                return name
        except Exception:
            continue
    return "libx264"


def build_encoder_args(encoder):
    """根据编码器构建 FFmpeg 编码参数列表"""
    if encoder == "h264_videotoolbox":
        return ["-c:v", "h264_videotoolbox", "-b:v", "8M", "-allow_sw", "1", "-realtime", "0"]
    elif encoder == "h264_nvenc":
        return ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "18"]
    elif encoder == "h264_amf":
        return ["-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", "18", "-qp_p", "18"]
    elif encoder == "h264_qsv":
        return ["-c:v", "h264_qsv", "-preset", "faster", "-global_quality", "18"]
    else:
        return ["-c:v", "libx264", "-preset", "fast", "-crf", "18"]


def create_mask(frame_shape, regions):
    """创建水印区域遮罩（支持多个区域）"""
    mask = np.zeros(frame_shape[:2], dtype=np.uint8)
    for region in regions:
        x, y = int(region['x']), int(region['y'])
        w, h = int(region['width']), int(region['height'])
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(frame_shape[1], x + w), min(frame_shape[0], y + h)
        mask[y1:y2, x1:x2] = 255
    return mask


def inpaint_frame(frame, mask, algorithm, inpaint_radius=3):
    """对单帧进行 inpaint 修复"""
    if algorithm == "NS":
        method = cv2.INPAINT_NS
    else:
        method = cv2.INPAINT_TELEA

    return cv2.inpaint(frame, mask, inpaint_radius, method)


def process_video(input_path, output_path, regions, algorithm, inpaint_radius=3):
    """逐帧处理视频，去除水印"""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(json.dumps({"type": "error", "error": f"Cannot open video: {input_path}"}), flush=True)
        sys.exit(1)

    # 获取视频属性
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # 创建输出视频写入器
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (frame_width, frame_height))

    if not out.isOpened():
        print(json.dumps({"type": "error", "error": f"Cannot create output: {output_path}"}), flush=True)
        cap.release()
        sys.exit(1)

    # 创建固定遮罩（水印区域不变则只需创建一次）
    frame_shape = (frame_height, frame_width)
    mask = create_mask(frame_shape, regions)

    gpu_info = detect_gpu()
    print(json.dumps({
        "type": "info",
        "total_frames": total_frames,
        "fps": fps,
        "resolution": f"{frame_width}x{frame_height}",
        "algorithm": algorithm,
        "gpu": gpu_info,
    }), flush=True)

    current_frame = 0
    report_interval = max(1, total_frames // 100)  # 每1%报告一次进度

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # inpaint 修复当前帧
            repaired = inpaint_frame(frame, mask, algorithm, inpaint_radius)
            out.write(repaired)

            current_frame += 1
            if current_frame % report_interval == 0 or current_frame == total_frames:
                print_progress(current_frame, total_frames)

    finally:
        cap.release()
        out.release()

    # 使用 FFmpeg 重新封装（保留音轨 + 正确容器格式）
    temp_output = output_path + ".temp.mp4"
    os.rename(output_path, temp_output)

    # 检测最优硬件编码器
    hw_encoder = detect_hw_encoder()

    import subprocess
    try:
        encode_args = build_encoder_args(hw_encoder)
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", temp_output,        # 处理后的视频（无音频）
                "-i", input_path,         # 原始视频（取音频）
                *encode_args,
                "-c:a", "copy",
                "-map", "0:v:0",
                "-map", "1:a:0?",         # 可选音轨
                "-movflags", "+faststart",
                "-pix_fmt", "yuv420p",
                output_path,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            # FFmpeg 合并失败，直接使用无音频版本
            os.rename(temp_output, output_path)
        else:
            os.remove(temp_output)
    except Exception:
        if os.path.exists(temp_output):
            os.rename(temp_output, output_path)

    print(json.dumps({"type": "complete", "output": output_path}), flush=True)


def main():
    parser = argparse.ArgumentParser(description="Video watermark inpaint removal")
    parser.add_argument("--input", required=True, help="Input video path")
    parser.add_argument("--output", required=True, help="Output video path")
    parser.add_argument("--regions", required=True, help="JSON string array of watermark regions")
    parser.add_argument(
        "--algorithm",
        choices=["TELEA", "NS"],
        default="TELEA",
        help="Inpaint algorithm: TELEA (fast) or NS (Navier-Stokes, smoother)",
    )
    parser.add_argument(
        "--inpaint-radius",
        type=int,
        default=3,
        help="Inpaint neighborhood radius (default: 3)",
    )

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(json.dumps({"type": "error", "error": f"Input file not found: {args.input}"}), flush=True)
        sys.exit(1)

    # 确保输出目录存在
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    process_video(
        input_path=args.input,
        output_path=args.output,
        regions=json.loads(args.regions),
        algorithm=args.algorithm,
        inpaint_radius=args.inpaint_radius,
    )


if __name__ == "__main__":
    main()
