import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { VideoUpload } from './components/VideoUpload';
import { WatermarkSelector } from './components/WatermarkSelector';
import { GpuStatus } from './components/GpuStatus';
import { ControlPanel } from './components/ControlPanel';
import { ResultDisplay } from './components/ResultDisplay';

function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [regions, setRegions] = useState([]);
  const [drawMode, setDrawMode] = useState('rect');
  const [videoDimensions, setVideoDimensions] = useState(null);

  // GPU 状态
  const [gpuStatus, setGpuStatus] = useState(null);
  const [gpuLoading, setGpuLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(false);

  // 处理引擎选项
  const [options, setOptions] = useState({
    method: 'ffmpeg',
    algorithm: undefined,
    quality: 'high',
    batchSize: 8,
  });

  // 处理状态
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [outputUrl, setOutputUrl] = useState(null);

  // 启动时检测 GPU 环境 & 服务器状态
  useEffect(() => {
    const checkServer = async () => {
      try {
        const res = await fetch('/api/gpu-status');
        if (res.ok) {
          const data = await res.json();
          setGpuStatus(data);
          setServerOnline(true);
        }
      } catch {
        setServerOnline(false);
      } finally {
        setGpuLoading(false);
      }
    };
    checkServer();
  }, []);

  // 选取视频文件
  const handleFileSelect = (file) => {
    if (!file) {
      setVideoFile(null);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl('');
      setRegions([]);
      setOutputUrl(null);
      setProgress(null);
      return;
    }
    setVideoFile(file);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setRegions([]);
    setOutputUrl(null);
    setProgress(null);
  };

  // 开始处理
  const handleProcess = async () => {
    if (!videoFile || regions.length === 0) return;

    setIsProcessing(true);
    setProgress({ stage: '上传中...', percent: 0 });
    setOutputUrl(null);

    const formData = new FormData();
    formData.append('video', videoFile);

    // 将 0-1 归一化坐标转回像素坐标 (支持多选区域)
    const vw = videoDimensions?.width || 1920;
    const vh = videoDimensions?.height || 1080;

    // 如果只有一个区域，为了兼容现有后端可传单对象或数组。这里统一传数组。
    const formattedRegions = regions.map(r => ({
      x: Math.round(r.x * vw),
      y: Math.round(r.y * vh),
      width: Math.round(r.width * vw),
      height: Math.round(r.height * vh),
    }));

    formData.append('regions', JSON.stringify(formattedRegions));

    formData.append('method', options.method);
    if (options.algorithm) formData.append('algorithm', options.algorithm);
    formData.append('quality', options.quality);
    if (options.batchSize) formData.append('batchSize', String(options.batchSize));

    try {
      const response = await fetch('/api/remove-watermark', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(await response.text() || '处理请求失败');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n').filter(Boolean);

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'progress') {
              setProgress({
                stage: data.stage || '处理中...',
                message: data.method ? `引擎: ${data.method}` : undefined,
                percent: data.progress ?? 0,
                fps: data.fps,
                speed: data.speed,
              });
            } else if (data.type === 'complete') {
              setOutputUrl(data.downloadUrl);
              setIsProcessing(false);
              setProgress(null);
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }
    } catch (error) {
      alert(`处理出错: ${error.message}`);
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleClearRegions = () => setRegions([]);

  return (
    <div className="min-h-screen text-slate-300 font-sans selection:bg-indigo-500/30">
      <Header serverOnline={serverOnline} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧主区域 */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {!videoFile ? (
              <VideoUpload onFileSelect={handleFileSelect} videoFile={videoFile} videoUrl={videoUrl} />
            ) : (
              <WatermarkSelector
                videoUrl={videoUrl}
                videoFile={videoFile}
                regions={regions}
                onRegionsChange={setRegions}
                onVideoDimensions={setVideoDimensions}
              />
            )}

            <ResultDisplay
              outputUrl={outputUrl}
              originalUrl={videoUrl}
              processing={isProcessing}
              progress={progress}
            />
          </div>

          {/* 右侧控制面板 */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <GpuStatus gpuStatus={gpuStatus} loading={gpuLoading} />

            <ControlPanel
              drawMode={drawMode}
              setDrawMode={setDrawMode}
              options={options}
              setOptions={setOptions}
              regions={regions}
              onClearRegions={handleClearRegions}
              onProcess={handleProcess}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
