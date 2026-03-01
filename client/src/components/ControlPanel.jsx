import React from 'react';
import { MousePointer2, Image as ImageIcon, FastForward, Cpu, Trash2 } from 'lucide-react';

export function ControlPanel({ drawMode, setDrawMode, options, setOptions, regions, onClearRegions, onProcess }) {
  const PROCESS_METHODS = [
    { id: 'ffmpeg', name: 'FFmpeg 原生 (快)', desc: '极速，适合纯色背景' },
    { id: 'TELEA', name: 'AI Inpaint - Telea (一般)', desc: '经典算法，适合简单纹理' },
    { id: 'NS', name: 'AI Inpaint - Navier-Stokes', desc: '基于流体力学，纹理保留好' }
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
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all duration-200 ${drawMode === 'rect'
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
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all duration-200 ${regions.length === 0
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
                const methodType = method.id === 'ffmpeg' ? 'ffmpeg' : 'inpaint';
                setOptions({
                  ...options,
                  method: methodType,
                  algorithm: methodType === 'inpaint' ? method.id : undefined
                });
              }}
              className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${(options.method === 'ffmpeg' && method.id === 'ffmpeg') ||
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



      {/* 底部按钮 */}
      <button
        onClick={onProcess}
        disabled={regions.length === 0}
        className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all duration-300 ${regions.length > 0
          ? 'gradient-bg-purple text-white hover:opacity-90 shadow-lg shadow-indigo-500/25 active:scale-[0.98]'
          : 'bg-white/5 text-slate-600 cursor-not-allowed'
          }`}
      >
        {regions.length > 0 ? '开始去除水印' : '请先框选区域'}
      </button>
    </div>
  );
}
