import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Crosshair, Trash2, Plus, Square, Info, Maximize2, Minimize2 } from 'lucide-react';

export function WatermarkSelector({ videoUrl, regions, onRegionsChange, videoFile, onVideoDimensions }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [currentRect, setCurrentRect] = useState(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const COLORS = [
    'rgba(99,102,241,0.7)',
    'rgba(168,85,247,0.7)',
    'rgba(236,72,153,0.7)',
    'rgba(16,185,129,0.7)',
    'rgba(245,158,11,0.7)',
  ];

  // Compute the video content area within the element (accounts for object-contain letterboxing)
  // Returns fractions (0-1) relative to the element's CSS dimensions
  const getContentAreaFractions = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const elemW = video.clientWidth;
    const elemH = video.clientHeight;
    if (!elemW || !elemH) return null;

    const videoAspect = video.videoWidth / video.videoHeight;
    const elemAspect = elemW / elemH;

    let fracW, fracH, fracX, fracY;
    if (videoAspect > elemAspect) {
      // Video wider than element → black bars top/bottom
      fracW = 1;
      fracH = elemAspect / videoAspect;
      fracX = 0;
      fracY = (1 - fracH) / 2;
    } else {
      // Video taller → black bars left/right
      fracH = 1;
      fracW = videoAspect / elemAspect;
      fracX = (1 - fracW) / 2;
      fracY = 0;
    }

    return { fracX, fracY, fracW, fracH };
  }, []);

  // Convert mouse/touch position to video-content-relative coordinates (0-1)
  // Accounts for object-contain letterboxing so coordinates map to actual video pixels
  const getRelativePos = useCallback((e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Position within element as fraction (0-1)
    const elemFracX = (clientX - rect.left) / rect.width;
    const elemFracY = (clientY - rect.top) / rect.height;

    const area = getContentAreaFractions();
    if (area) {
      // Map element fraction to video-content fraction, clamped to [0, 1]
      const x = Math.max(0, Math.min(1, (elemFracX - area.fracX) / area.fracW));
      const y = Math.max(0, Math.min(1, (elemFracY - area.fracY) / area.fracH));
      return { x, y };
    }

    return { x: elemFracX, y: elemFracY };
  }, [getContentAreaFractions]);

  const drawRegions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Compute content area in canvas-pixel coordinates
    const area = getContentAreaFractions();
    const cStartX = area ? area.fracX * width : 0;
    const cStartY = area ? area.fracY * height : 0;
    const cW = area ? area.fracW * width : width;
    const cH = area ? area.fracH * height : height;

    // Draw grid overlay (only over video content area)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const x = cStartX + (i / 12) * cW;
      ctx.beginPath(); ctx.moveTo(x, cStartY); ctx.lineTo(x, cStartY + cH); ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const y = cStartY + (i / 8) * cH;
      ctx.beginPath(); ctx.moveTo(cStartX, y); ctx.lineTo(cStartX + cW, y); ctx.stroke();
    }

    // Draw saved regions (coordinates are video-content-relative 0-1)
    regions.forEach((region, idx) => {
      const color = COLORS[idx % COLORS.length];
      const x = cStartX + region.x * cW;
      const y = cStartY + region.y * cH;
      const w = region.width * cW;
      const h = region.height * cH;

      // Fill
      ctx.fillStyle = color.replace('0.7', '0.15');
      ctx.fillRect(x, y, w, h);

      // Border
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = color.replace('0.7', '0.9');
      ctx.font = 'bold 12px DM Sans, sans-serif';
      ctx.fillText(`区域 ${idx + 1}`, x + 6, y + 18);

      // Corner handles
      const handleSize = 8;
      ctx.fillStyle = color;
      [[x, y], [x + w - handleSize, y], [x, y + h - handleSize], [x + w - handleSize, y + h - handleSize]].forEach(([hx, hy]) => {
        ctx.fillRect(hx, hy, handleSize, handleSize);
      });
    });

    // Draw current dragging rect
    if (currentRect) {
      const x = cStartX + currentRect.x * cW;
      const y = cStartY + currentRect.y * cH;
      const w = currentRect.width * cW;
      const h = currentRect.height * cH;
      ctx.fillStyle = 'rgba(99,102,241,0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(99,102,241,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }, [regions, currentRect, getContentAreaFractions]);

  useEffect(() => {
    drawRegions();
  }, [drawRegions]);

  // Update canvas internal resolution to match container for correct aspect ratio rendering
  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
        drawRegions();
      }
    }
  }, [drawRegions]);

  const handleVideoLoad = () => {
    const video = videoRef.current;
    if (video) {
      const dims = { width: video.videoWidth, height: video.videoHeight };
      setVideoDimensions(dims);
      if (onVideoDimensions) onVideoDimensions(dims);
      // Update canvas resolution after video sizes the container
      requestAnimationFrame(updateCanvasSize);
    }
  };

  // Keep canvas in sync with container size on resize
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      updateCanvasSize();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateCanvasSize]);

  // ESC 退出全屏
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // 全屏时锁定 body 滚动
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pos = getRelativePos(e, canvas);
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentRect(null);
  }, [getRelativePos]);

  const handleMouseMove = useCallback((e) => {
    if (!isDrawing || !startPos) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pos = getRelativePos(e, canvas);
    setCurrentRect({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    });
  }, [isDrawing, startPos, getRelativePos]);

  const handleMouseUp = useCallback((e) => {
    if (!isDrawing || !startPos) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pos = getRelativePos(e, canvas);
    const newRegion = {
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    };
    if (newRegion.width > 0.01 && newRegion.height > 0.01) {
      onRegionsChange([...regions, newRegion]);
    }
    setIsDrawing(false);
    setStartPos(null);
    setCurrentRect(null);
  }, [isDrawing, startPos, regions, onRegionsChange, getRelativePos]);

  const removeRegion = (idx) => {
    onRegionsChange(regions.filter((_, i) => i !== idx));
  };

  const clearAll = () => onRegionsChange([]);

  if (!videoFile) return null;

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col p-4' : 'glass rounded-2xl p-6 animate-fade-in'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-bg-purple flex items-center justify-center shadow-lg">
            <Crosshair className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">水印区域选择</h2>
            <p className="text-xs text-slate-400">
              {isFullscreen ? '全屏精细模式 · 按 ESC 退出' : '在视频上框选水印区域'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-xs font-bold text-indigo-300">
            {regions.length} 个区域
          </span>
          {regions.length > 0 && (
            <button
              onClick={clearAll}
              className="p-2 rounded-xl hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all duration-200"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-xl hover:bg-indigo-500/15 text-slate-400 hover:text-indigo-300 transition-all duration-200"
            title={isFullscreen ? '退出全屏' : '全屏精细选择'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Hint */}
      {!isFullscreen && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-4">
          <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <p className="text-xs text-blue-300">在下方视频上拖拽鼠标框选水印位置，可添加多个区域。点击右上角全屏按钮可精细选择。</p>
        </div>
      )}

      {/* Canvas + video */}
      <div ref={containerRef} className={`relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 select-none ${isFullscreen ? 'flex-1' : ''}`}>
        <video
          ref={videoRef}
          src={videoUrl}
          className={`w-full object-contain ${isFullscreen ? 'h-full' : 'max-h-[500px]'}`}
          onLoadedMetadata={handleVideoLoad}
          preload="metadata"
        />
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          className="absolute inset-0 w-full h-full canvas-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        />

        {/* Overlay label */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 pointer-events-none">
          <Square className="w-3 h-3 text-indigo-400" />
          <span className="text-xs font-bold text-indigo-300">拖拽框选</span>
        </div>

        {/* 全屏模式右下角提示 */}
        {isFullscreen && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 pointer-events-none">
            <span className="text-xs text-slate-400">ESC 退出全屏</span>
          </div>
        )}
      </div>

      {/* Region list */}
      {regions.length > 0 && (
        <div className="mt-4 animate-slide-up">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">已选区域 ({regions.length})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {regions.map((region, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-500/30 transition-all duration-200 group"
              >
                <div
                  className="w-3 h-3 rounded flex-shrink-0"
                  style={{ backgroundColor: COLORS[idx % COLORS.length].replace('0.7', '0.8') }}
                ></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">区域 {idx + 1}</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    {videoDimensions.width > 0
                      ? `${Math.round(region.x * videoDimensions.width)}, ${Math.round(region.y * videoDimensions.height)} px`
                      : `${Math.round(region.x * 100)}%, ${Math.round(region.y * 100)}%`
                    }
                  </p>
                </div>
                <button
                  onClick={() => removeRegion(idx)}
                  className="p-1 rounded-md hover:bg-red-500/15 text-slate-400 hover:text-red-400 transition-all duration-200"
                  title="删除此区域"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {regions.length === 0 && (
        <div className="mt-4 flex items-center justify-center gap-2 py-4 rounded-xl bg-white/3 border border-dashed border-white/10">
          <Plus className="w-4 h-4 text-slate-600" />
          <span className="text-sm text-slate-600">在视频上拖拽以添加水印区域</span>
        </div>
      )}
    </div>
  );
}
