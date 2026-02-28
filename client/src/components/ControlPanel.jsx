import React from 'react';
import { MousePointer2, Image as ImageIcon, FastForward, Cpu, Trash2, Cpu as GpuIcon } from 'lucide-react';

export function ControlPanel({ drawMode, setDrawMode, options, setOptions, regions, onClearRegions, onProcess }) {
  const PROCESS_METHODS = [
    { id: 'ffmpeg', name: 'FFmpeg 原生 (快)', desc: '极速，适合纯色背景' },
    { id: 'TELEA', name: 'AI Inpaint - Telea (一般)', desc: '经典算法，适合简单纹理' },
    { id: 'NS', name: 'AI Inpaint - Navier-Stokes', desc: '基于流体力学，纹理保留好' },
    { id: 'LAMA', name: 'AI 模型 - Lama (慢/高清)', desc: '深度学习，大面积遮挡修复首选' },
    { id: 'PROPAINTER', name: 'AI 视频 - ProPainter (极慢)', desc: '时序AI，完美保持运动连贯性' }
  ];

  return (
    <div className="glass rounded-2xl p-6 h-full flex flex-col">
      <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
        <Cpu className="w-5 h-5 text-indigo-400" />
        处理控制台
      </h3>

      {/* 框选工具 */}
      <div className="mb-6">
        <label className="block text-sm font-bold text-slate-300 uppercase tracking-widest mb-3">
          区域选择
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDrawMode('rect')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all duration-200 ${
              drawMode === 'rect'
                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-indigo-400'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <MousePointer2 className="w-4 h-4" />
            矩形框选
          </button>
          <button
            onClick={onClearRegions}
            disabled={regions.length === 0}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all duration-200 ${
              regions.length === 0
                ? 'bg-white/5 text-slate-600 cursor-not-allowed'
                : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 ring-1 ring-red-500/50'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            清除所有
          </button>
        </div>
      </div>

      {/* 处理引擎选择 */}
      <div className="mb-6 flex-1">
        <label className="block text-sm font-bold text-slate-300 uppercase tracking-widest mb-3">
          去水印引擎
        </label>
        <div className="space-y-2">
          {PROCESS_METHODS.map((method) => (
            <button
              key={method.id}
              onClick={() => {
                const methodType = method.id === 'ffmpeg' ? 'ffmpeg' : 
                                  (method.id === 'TELEA' || method.id === 'NS') ? 'inpaint' : 
                                  method.id.toLowerCase();
                setOptions({ 
                  ...options, 
                  method: methodType,
                  algorithm: method.id !== 'ffmpeg' ? method.id : undefined
                });
              }}
              className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                (options.method === 'ffmpeg' && method.id === 'ffmpeg') ||
                (options.method !== 'ffmpeg' && options.algorithm === method.id)
                  ? 'bg-indigo-500/15 border-indigo-500/50 text-white shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                  : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5 hover:border-white/10'
              }`}
            >
              <div className="font-bold mb-0.5 flex items-center gap-2">
                {method.id === 'ffmpeg' ? <FastForward className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                {method.name}
              </div>
              <div className="text-xs opacity-60 font-medium">{method.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* GPU 批处理动态选项 (新加的核心功能) */}
      <div className="mb-6">
        <label className="flex items-center justify-between text-sm font-bold text-slate-300 uppercase tracking-widest mb-3">
          <span>AI 并发批处理 (Batch)</span>
          <span className="flex items-center gap-1 text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
            <GpuIcon className="w-3 h-3" /> GPU 加速
          </span>
        </label>
        <div className="bg-black/20 rounded-xl p-4 border border-white/5">
          <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
            <span>低显存 (2)</span>
            <span className="text-indigo-400 font-black">{options.batchSize || 8} 帧</span>
            <span>旗舰级 (32)</span>
          </div>
          <input 
            type="range" 
            min="1" 
            max="32" 
            step="1"
            value={options.batchSize || 8}
            onChange={(e) => setOptions({...options, batchSize: parseInt(e.target.value)})}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none"
            disabled={options.method === 'ffmpeg'}
          />
          <p className="text-[10px] text-slate-400 mt-3 font-medium leading-relaxed">
            {options.method === 'ffmpeg' 
              ? '当前为 FFmpeg 硬件直接渲染，无需设置并发流。'
              : '建议高性能 PC 调整至 16-32 榨干显存，轻薄本保持 4-8 避免报错。'}
          </p>
        </div>
      </div>

      {/* 底部按钮 */}
      <button
        onClick={onProcess}
        disabled={regions.length === 0}
        className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all duration-300 ${
          regions.length > 0
            ? 'gradient-bg-purple text-white hover:opacity-90 shadow-lg shadow-indigo-500/25 active:scale-[0.98]'
            : 'bg-white/5 text-slate-600 cursor-not-allowed'
        }`}
      >
        {regions.length > 0 ? '开始去除水印' : '请先框选区域'}
      </button>
    </div>
  );
}
