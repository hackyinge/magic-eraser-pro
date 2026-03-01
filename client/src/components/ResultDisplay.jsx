import React, { useState, useRef } from 'react';
import { Download, CheckCircle, SplitSquareHorizontal, Eye, Film, Play, Pause, AlertTriangle } from 'lucide-react';

export function ResultDisplay({ outputUrl, originalUrl, processing, progress }) {
  const [viewMode, setViewMode] = useState('result'); // 'result' | 'compare' | 'original'
  const [isPlayingBoth, setIsPlayingBoth] = useState(false);
  const compareOrigRef = useRef(null);
  const compareOutRef = useRef(null);

  const toggleSyncPlay = () => {
    if (compareOrigRef.current && compareOutRef.current) {
      if (isPlayingBoth) {
        compareOrigRef.current.pause();
        compareOutRef.current.pause();
      } else {
        compareOrigRef.current.play();
        compareOutRef.current.play();
      }
      setIsPlayingBoth(!isPlayingBoth);
    }
  };

  // 监听视频自带控制栏导致的暂停/播放，防止按钮状态不一致
  const handleAnyPause = () => setIsPlayingBoth(false);
  const handleAnyPlay = () => setIsPlayingBoth(true);

  if (!outputUrl && !processing) return null;

  return (
    <div className="glass rounded-2xl p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-bg-emerald flex items-center justify-center shadow-lg">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">处理结果</h2>
            <p className="text-xs text-slate-400">
              {outputUrl ? '水印去除完成' : '处理中...'}
            </p>
          </div>
        </div>

        {outputUrl && (
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400">完成</span>
          </div>
        )}
      </div>

      {/* Processing state */}
      {processing && !outputUrl && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Film className="w-6 h-6 text-indigo-400" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-white mb-1">{progress?.stage || '正在处理视频...'}</p>
            <p className="text-xs text-slate-400">{progress?.message || '请稍候，这可能需要几分钟'}</p>
          </div>
          {progress?.percent > 0 && (
            <div className="w-48 h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
              <div
                className="h-full progress-bar rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              ></div>
            </div>
          )}
        </div>
      )}

      {/* Result video */}
      {outputUrl && (
        <div className="space-y-4">
          {/* View mode tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/50 border border-white/10">
            {[
              { id: 'result', label: '处理结果', icon: Eye },
              { id: 'compare', label: '对比', icon: SplitSquareHorizontal },
              { id: 'original', label: '原视频', icon: Film },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all duration-200 ${viewMode === id
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Video display */}
          {viewMode === 'compare' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative rounded-xl overflow-hidden bg-black/50 border border-white/10">
                  <video
                    ref={compareOrigRef}
                    src={originalUrl}
                    controls
                    className="w-full max-h-[500px] object-contain"
                    onPlay={handleAnyPlay}
                    onPause={handleAnyPause}
                  />
                  <div className="absolute top-2 left-2">
                    <span className="px-2 py-0.5 rounded-full bg-black/70 text-xs font-bold text-slate-300 border border-white/10">原始</span>
                  </div>
                </div>
                <div className="relative rounded-xl overflow-hidden bg-black/50 border border-emerald-500/20">
                  <video
                    ref={compareOutRef}
                    src={outputUrl}
                    controls
                    className="w-full max-h-[500px] object-contain"
                    onPlay={handleAnyPlay}
                    onPause={handleAnyPause}
                  />
                  <div className="absolute top-2 left-2">
                    <span className="px-2 py-0.5 rounded-full bg-black/70 text-xs font-bold text-emerald-300 border border-emerald-500/20">处理后</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/10">
              <video
                src={viewMode === 'original' ? originalUrl : outputUrl}
                controls
                className="w-full max-h-[500px] object-contain"
              />
              <div className="absolute top-3 left-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border backdrop-blur-sm ${viewMode === 'original'
                    ? 'bg-black/60 text-slate-300 border-white/10'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}>
                  {viewMode === 'original' ? '原始视频' : '处理完成'}
                </span>
              </div>
            </div>
          )}

          {/* Action buttons row */}
          <div className="flex items-center gap-3 mt-4">
            {viewMode === 'compare' && (
              <button
                onClick={toggleSyncPlay}
                className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] whitespace-nowrap"
              >
                {isPlayingBoth ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlayingBoth ? '全部暂停' : '同步播放'}
              </button>
            )}

            <a
              href={outputUrl}
              download
              className="flex-1 flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl gradient-bg-emerald text-white font-bold text-sm hover:opacity-90 transition-all duration-300 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-900/50 hover:scale-[1.01] active:scale-[0.99]"
            >
              <Download className="w-4 h-4" />
              下载处理后的视频
            </a>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-4 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg max-w-max mx-auto">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-300 font-medium tracking-wide">
              为保护您的隐私，该视频将在 <strong className="font-bold text-amber-200">10分钟</strong> 后从服务器销毁，请尽快下载。
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
