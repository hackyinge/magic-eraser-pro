import React, { useRef, useState, useCallback } from 'react';
import { Upload, Video, X, CheckCircle2, FileVideo, Play } from 'lucide-react';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function VideoUpload({ onFileSelect, videoFile, videoUrl }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true);
    else if (e.type === 'dragleave') setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="glass rounded-2xl p-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl gradient-bg-blue flex items-center justify-center shadow-lg">
          <FileVideo className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">上传视频</h2>
          <p className="text-xs text-slate-400">支持 MP4、MOV、AVI、MKV、WebM 等格式</p>
        </div>
      </div>

      {!videoFile ? (
        <div
          className={`relative group cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-500 p-10 text-center ${
            isDragging
              ? 'border-indigo-400 bg-indigo-500/15 scale-[1.01] shadow-lg shadow-indigo-500/20'
              : 'border-slate-700/60 hover:border-indigo-500/50 hover:bg-slate-800/30 bg-slate-900/20 hover:shadow-lg hover:shadow-indigo-500/5'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            onChange={handleChange}
            className="hidden"
          />

          {/* Upload icon */}
          <div className="relative mb-5 inline-block">
            <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-2xl group-hover:blur-3xl transition-all duration-500"></div>
            <div className="relative p-5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl border border-indigo-500/30 group-hover:border-indigo-400/50 group-hover:scale-110 transition-all duration-300">
              <Upload className={`w-10 h-10 text-indigo-400 transition-all duration-300 ${isDragging ? 'scale-110 text-indigo-300' : ''}`} />
            </div>
          </div>

          <p className="text-base font-bold text-slate-200 group-hover:text-white transition-colors mb-2">
            {isDragging ? '释放以上传视频' : '点击上传或拖拽视频至此'}
          </p>
          <p className="text-sm text-slate-500 font-medium">
            MP4 · MOV · AVI · MKV · WebM · 最大 4GB
          </p>

          {/* Corner decorations */}
          <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-indigo-500/30 rounded-tl-lg group-hover:border-indigo-400/50 transition-colors"></div>
          <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-indigo-500/30 rounded-tr-lg group-hover:border-indigo-400/50 transition-colors"></div>
          <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-indigo-500/30 rounded-bl-lg group-hover:border-indigo-400/50 transition-colors"></div>
          <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-indigo-500/30 rounded-br-lg group-hover:border-indigo-400/50 transition-colors"></div>
        </div>
      ) : (
        <div className="space-y-4 animate-slide-up">
          {/* File info bar */}
          <div className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-4 flex items-center gap-4">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none"></div>
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-indigo-500/30 rounded-xl blur-md"></div>
              <div className="relative p-3 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-xl border border-indigo-400/30">
                <Video className="w-6 h-6 text-indigo-300" />
              </div>
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <p className="text-sm font-bold text-white truncate">{videoFile.name}</p>
              <p className="text-xs text-indigo-300 font-semibold mt-0.5">{formatSize(videoFile.size)}</p>
            </div>
            <div className="flex items-center gap-2 relative z-10">
              <div className="relative">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div className="absolute inset-0 bg-emerald-400/20 rounded-full blur-md animate-pulse"></div>
              </div>
              <button
                onClick={handleClear}
                className="p-2 hover:bg-red-500/20 rounded-xl text-slate-400 hover:text-red-400 transition-all duration-300 hover:scale-110 active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Video preview */}
          {videoUrl && (
            <div className="relative rounded-2xl overflow-hidden bg-black/50 border border-white/10">
              <video
                src={videoUrl}
                controls
                className="w-full max-h-64 object-contain"
                preload="metadata"
              />
              <div className="absolute top-3 left-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
                  <Play className="w-3 h-3 text-indigo-400" />
                  <span className="text-xs font-bold text-indigo-300">预览</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
