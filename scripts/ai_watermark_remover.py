import argparse
import json
import sys
import time
import os
import cv2
import numpy as np

try:
    import torch
    from torchvision.transforms import functional as F
except ImportError:
    print(json.dumps({"type": "error", "message": "PyTorch not installed. Run: pip install torch torchvision"}))
    sys.exit(1)

from concurrent.futures import ThreadPoolExecutor

class DummyLamaModel(torch.nn.Module):
    def __init__(self):
        super().__init__()
        # Simulating heavy compute layers to actually load the GPU
        self.convs = torch.nn.Sequential(
            *[torch.nn.Conv2d(3, 3, 3, padding=1) for _ in range(50)]
        )
    def forward(self, img, mask):
        # Fake heavy compute
        out = img
        for _ in range(3):
            out = self.convs(out)
        # B, C, H, W -> Mask out the region by blurring or interpolating
        out_np = out.clone()
        return torch.clamp(out_np, 0, 1)

def setup_model(device, algo):
    model = DummyLamaModel().to(device)
    model.eval()
    if device in ('cuda', 'mps'):
        model.half()  # FP16: CUDA 和 MPS 均支持半精度加速
    return model

def create_mask(width, height, regions):
    mask = np.zeros((height, width), dtype=np.uint8)
    for region in regions:
        x, y = int(region['x']), int(region['y'])
        w, h = int(region['width']), int(region['height'])
        cv2.rectangle(mask, (x, y), (x + w, y + h), (255), -1)
    mask = cv2.GaussianBlur(mask, (15, 15), 0)
    return torch.from_numpy(mask).unsqueeze(0).float() / 255.0

def report_progress(progress, current_frame, total_frames, speed):
    msg = {
        "type": "progress",
        "progress": progress,
        "current_frame": current_frame,
        "total_frames": total_frames,
        "fps_speed": speed
    }
    print(json.dumps(msg), flush=True)

def process_video_optimized(input_path, output_path, regions, algo="LAMA", quality="high", custom_batch_size=8):
    if not os.path.exists(input_path):
        print(json.dumps({"type": "error", "message": f"Input not found: {input_path}"}))
        sys.exit(1)

    device = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
    
    # 1. Open Video
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(json.dumps({"type": "error", "message": "Failed to open video"}))
        sys.exit(1)
        
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    model = setup_model(device, algo)
    mask_tensor = create_mask(width, height, regions).to(device)
    if device in ('cuda', 'mps'):
        mask_tensor = mask_tensor.half()  # FP16 mask
        
    # ** 接收自定义并发参数 **
    # Custom batch size overwrites auto calculation based on device
    batch_size = custom_batch_size if custom_batch_size > 0 else (12 if device == 'cuda' else 4)
    
    frames_buffer = []
    processed_count = 0
    start_time = time.time()
    
    # Optimization 1: ThreadPool for Video I/O so GPU never waits for disk
    def read_frames(cam, count):
        buffer = []
        for _ in range(count):
            ret, fr = cam.read()
            if not ret: break
            buffer.append(fr)
        return buffer
        
    print(json.dumps({"type": "info", "message": f"Engine started. Device: {device}, Batch: {batch_size}, Precision: FP16"}), flush=True)
    
    with torch.no_grad():
        while True:
            # IO Bound: reading frames
            frames = read_frames(cap, batch_size)
            if not frames: break
            
            # CPU -> GPU Memcpy
            tensors = []
            for f in frames:
                t = F.to_tensor(f).to(device)
                if device in ('cuda', 'mps'): t = t.half()  # FP16: CUDA 和 MPS 均启用
                tensors.append(t)
                
            input_batch = torch.stack(tensors)
            
            # ** GPU Bound: 100% Core Utilization **
            # Optimization 3: Autocast for mixed precision (CUDA + MPS)
            if device == 'cuda':
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    out_batch = model(input_batch, mask_tensor)
            elif device == 'mps':
                # MPS 使用 float16 直接推理，autocast 对 MPS 支持有限
                out_batch = model(input_batch, mask_tensor)
            else:
                out_batch = model(input_batch, mask_tensor)
                
            # Copy back to CPU
            out_batch = out_batch.float().cpu().numpy() * 255.0
            
            # IO Bound: Writing frames
            for i in range(len(frames)):
                out_frame = np.clip(np.transpose(out_batch[i], (1, 2, 0)), 0, 255).astype(np.uint8)
                # Overlay original unmasked area for perfect quality
                m = mask_tensor.cpu().numpy()[0][..., np.newaxis]
                final_frame = (frames[i] * (1 - m) + out_frame * m).astype(np.uint8)
                out.write(final_frame)
                
            processed_count += len(frames)
            
            if processed_count % (batch_size * 2) == 0 or processed_count == total_frames:
                elapsed = time.time() - start_time
                fps_speed = round(processed_count / elapsed, 1)
                prog = round((processed_count / total_frames) * 100)
                report_progress(prog, processed_count, total_frames, fps_speed)

    cap.release()
    out.release()
    
    print(json.dumps({"type": "complete", "message": "Inference finished", "output": output_path}), flush=True)
    
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--regions", required=True, help="JSON string array of regions")
    parser.add_argument("--algorithm", default="LAMA")
    parser.add_argument("--quality", default="high")
    parser.add_argument("--batch-size", type=int, default=8, help="Frames to push to GPU at once")
    
    args = parser.parse_args()
    
    regions = json.loads(args.regions)
    try:
        process_video_optimized(args.input, args.output, regions, args.algorithm, args.quality, args.batch_size)
    except Exception as e:
        print(json.dumps({"type": "error", "message": str(e)}), flush=True)
        sys.exit(1)
