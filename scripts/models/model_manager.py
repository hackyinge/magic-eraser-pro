#!/usr/bin/env python3
"""
模型下载与缓存管理器
自动下载 STTN / LAMA / PROPAINTER 预训练权重到 ~/.cache/watermark-models/
"""

import os
import sys
import json
import hashlib
import urllib.request
import shutil

DEFAULT_CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "watermark-models")

# 模型注册表：算法 -> 模型文件信息
MODEL_REGISTRY = {
    "STTN": {
        "filename": "sttn_inpaint.pth",
        "url": "https://huggingface.co/hyzhou/STTN/resolve/main/sttn.pth",
        "sha256": None,  # 跳过校验（首次部署时）
        "size_mb": 85,
        "description": "STTN - Spatial-Temporal Transformer for video inpainting",
    },
    "LAMA": {
        "filename": "lama_big_lama.pth",
        "url": "https://huggingface.co/smartywu/big-lama/resolve/main/big-lama.pt",
        "sha256": None,
        "size_mb": 200,
        "description": "LaMa - Large Mask Inpainting with Fourier Convolutions",
    },
    "PROPAINTER": {
        "filename": "propainter.pth",
        "url": "https://huggingface.co/camenduru/ProPainter/resolve/main/ProPainter.pth",
        "sha256": None,
        "size_mb": 300,
        "description": "ProPainter - Propagation-based video inpainting with dual-domain attention",
    },
}


def get_cache_dir():
    """获取模型缓存目录"""
    cache_dir = os.environ.get("WATERMARK_MODEL_DIR", DEFAULT_CACHE_DIR)
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def get_model_path(algorithm):
    """获取指定算法的模型文件路径"""
    if algorithm not in MODEL_REGISTRY:
        raise ValueError(f"Unknown algorithm: {algorithm}. Available: {list(MODEL_REGISTRY.keys())}")
    info = MODEL_REGISTRY[algorithm]
    return os.path.join(get_cache_dir(), info["filename"])


def is_model_downloaded(algorithm):
    """检查模型是否已下载"""
    model_path = get_model_path(algorithm)
    return os.path.exists(model_path) and os.path.getsize(model_path) > 1024 * 1024  # > 1MB


def download_model(algorithm, on_progress=None):
    """
    下载指定算法的预训练模型
    on_progress: 回调函数 (downloaded_bytes, total_bytes)
    """
    if algorithm not in MODEL_REGISTRY:
        raise ValueError(f"Unknown algorithm: {algorithm}")

    info = MODEL_REGISTRY[algorithm]
    model_path = get_model_path(algorithm)
    temp_path = model_path + ".tmp"

    if is_model_downloaded(algorithm):
        return model_path

    print(json.dumps({
        "type": "info",
        "message": f"Downloading {algorithm} model ({info['size_mb']}MB)...",
        "url": info["url"],
    }), flush=True)

    try:
        req = urllib.request.Request(info["url"], headers={"User-Agent": "watermark-remover/1.0"})
        with urllib.request.urlopen(req, timeout=300) as response:
            total_size = int(response.headers.get("Content-Length", 0))
            downloaded = 0
            block_size = 1024 * 1024  # 1MB

            with open(temp_path, "wb") as f:
                while True:
                    chunk = response.read(block_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if on_progress:
                        on_progress(downloaded, total_size)
                    if total_size > 0:
                        pct = round(downloaded / total_size * 100)
                        print(json.dumps({
                            "type": "download_progress",
                            "algorithm": algorithm,
                            "progress": pct,
                            "downloaded_mb": round(downloaded / 1024 / 1024, 1),
                            "total_mb": round(total_size / 1024 / 1024, 1),
                        }), flush=True)

        # 校验文件大小
        file_size = os.path.getsize(temp_path)
        if file_size < 1024 * 1024:
            os.remove(temp_path)
            raise RuntimeError(f"Downloaded file too small ({file_size} bytes), likely corrupted")

        # SHA256 校验（如果有）
        if info["sha256"]:
            sha = hashlib.sha256()
            with open(temp_path, "rb") as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    sha.update(chunk)
            if sha.hexdigest() != info["sha256"]:
                os.remove(temp_path)
                raise RuntimeError(f"SHA256 mismatch for {algorithm}")

        shutil.move(temp_path, model_path)
        print(json.dumps({
            "type": "info",
            "message": f"{algorithm} model downloaded successfully",
        }), flush=True)
        return model_path

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise RuntimeError(f"Failed to download {algorithm} model: {e}") from e


def get_all_model_status():
    """获取所有模型的状态"""
    status = {}
    for algo, info in MODEL_REGISTRY.items():
        model_path = get_model_path(algo)
        downloaded = is_model_downloaded(algo)
        status[algo] = {
            "downloaded": downloaded,
            "size_mb": info["size_mb"],
            "description": info["description"],
            "path": model_path if downloaded else None,
        }
    return status


def cleanup_models():
    """清理所有已下载的模型缓存"""
    cache_dir = get_cache_dir()
    if os.path.exists(cache_dir):
        shutil.rmtree(cache_dir)
        print(f"Cleaned model cache: {cache_dir}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Model Manager")
    parser.add_argument("--status", action="store_true", help="Show all model status")
    parser.add_argument("--download", choices=list(MODEL_REGISTRY.keys()), help="Download specific model")
    parser.add_argument("--cleanup", action="store_true", help="Remove all cached models")
    args = parser.parse_args()

    if args.status:
        print(json.dumps(get_all_model_status(), indent=2))
    elif args.download:
        path = download_model(args.download)
        print(f"Model ready at: {path}")
    elif args.cleanup:
        cleanup_models()
    else:
        parser.print_help()
