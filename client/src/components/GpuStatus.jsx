import React, { useState } from 'react';
import { Cpu, AlertTriangle, CheckCircle, Terminal, Copy, Check, ChevronDown, ChevronUp, Zap, Monitor } from 'lucide-react';

export function GpuStatus({ gpuStatus, loading }) {
  const [copiedCmd, setCopiedCmd] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const copyToClipboard = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCmd(key);
      setTimeout(() => setCopiedCmd(null), 2000);
    } catch {
      // fallback
    }
  };

  if (loading) {
    return (
      <div className="glass rounded-2xl p-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl gradient-bg-purple flex items-center justify-center animate-pulse">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">GPU 环境检测</h2>
            <p className="text-xs text-slate-400">正在检测中...</p>
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-4 bg-slate-700/50 rounded animate-pulse" style={{ width: `${70 + i * 10}%` }}></div>
          ))}
        </div>
      </div>
    );
  }

  if (!gpuStatus) return null;

  // Backend returns: { platform, gpus, ffmpeg, python, recommendations, detectedAt }
  // Derive gpuAvailable from gpus array and ffmpeg working encoders
  const gpus = gpuStatus.gpus || [];
  const workingEncoders = gpuStatus.ffmpeg?.workingEncoders || [];
  const gpuAvailable = gpus.length > 0 || workingEncoders.length > 0;
  const gpuInfo = gpus;
  // recommendations is array of { type, category, message, installCommands }
  const recommendations = gpuStatus.recommendations || [];
  const missingDrivers = recommendations.map(r => ({
    name: r.message,
    description: r.category,
  }));
  // Merge all installCommands from recommendations into one object
  const installCommands = recommendations.reduce((acc, r) => {
    if (r.installCommands) Object.assign(acc, r.installCommands);
    return acc;
  }, {});

  return (
    <div className={`glass rounded-2xl p-6 animate-fade-in border ${gpuAvailable ? 'border-emerald-500/20' : 'border-amber-500/20'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${gpuAvailable ? 'gradient-bg-emerald glow-emerald' : 'gradient-bg-orange'}`}>
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">GPU 环境状态</h2>
            <p className={`text-xs font-semibold ${gpuAvailable ? 'text-emerald-400' : 'text-amber-400'}`}>
              {gpuAvailable ? '加速就绪' : '需要配置'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all duration-200"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Status badge */}
      <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl mb-4 ${gpuAvailable ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
        {gpuAvailable ? (
          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
        )}
        <div>
          <p className={`text-sm font-bold ${gpuAvailable ? 'text-emerald-300' : 'text-amber-300'}`}>
            {gpuAvailable ? 'GPU 加速已启用' : '未检测到 GPU 加速'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {gpuAvailable ? '将使用 GPU 硬件加速处理视频' : '将回退到 CPU 软件处理模式（速度较慢）'}
          </p>
        </div>
      </div>

      {/* GPU info list */}
      {gpuAvailable && gpuInfo && gpuInfo.length > 0 && (
        <div className="space-y-2 mb-4">
          {gpuInfo.map((gpu, idx) => (
            <div key={idx} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
              <div className="w-7 h-7 rounded-lg gradient-bg-blue flex items-center justify-center flex-shrink-0">
                <Monitor className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{gpu.name || `GPU ${idx + 1}`}</p>
                {gpu.memory && gpu.memory !== 'N/A' && (
                  <p className="text-xs text-slate-400">显存: {gpu.memory}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-300">{gpu.type || 'CUDA'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Missing drivers warning */}
      {missingDrivers && missingDrivers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-bold">缺少以下驱动</span>
          </div>
          {missingDrivers.map((driver, idx) => (
            <div key={idx} className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm font-semibold text-amber-300">{driver.name}</p>
              {driver.description && (
                <p className="text-xs text-slate-400 mt-0.5">{driver.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Install commands (expanded) */}
      {expanded && installCommands && Object.keys(installCommands).length > 0 && (
        <div className="mt-4 space-y-3 animate-slide-up">
          <div className="flex items-center gap-2 text-slate-300">
            <Terminal className="w-4 h-4" />
            <span className="text-sm font-bold">安装命令</span>
          </div>
          {Object.entries(installCommands).map(([platform, cmds]) => (
            <div key={platform} className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{platform}</p>
              {(Array.isArray(cmds) ? cmds : [cmds]).map((cmd, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900/60 border border-white/10 group">
                  <code className="flex-1 text-xs text-indigo-300 font-mono truncate">{cmd}</code>
                  <button
                    onClick={() => copyToClipboard(cmd, `${platform}-${idx}`)}
                    className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition-all duration-200"
                  >
                    {copiedCmd === `${platform}-${idx}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
