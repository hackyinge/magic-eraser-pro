import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const removeWatermarkAI = async ({
  inputPath,
  outputPath,
  regions, // 接收支持多框的 regions 数组
  algorithm = 'LAMA',
  quality = 'high',
  batchSize = 8,
  onProgress
}) => {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '..', 'scripts', 'ai_watermark_remover.py');

    if (!fs.existsSync(pythonScript)) {
      return reject(new Error('AI Python entry point missing.'));
    }

    // 将 regions 数组转为 JSON 字符串传给 Python
    const args = [
      pythonScript,
      '--input', inputPath,
      '--output', outputPath,
      '--regions', JSON.stringify(regions),
      '--algorithm', algorithm,
      '--quality', quality,
      '--batch-size', String(batchSize)
    ];

    console.log(`[AI Engine] Firing AI inference: python ${args.join(' ')}`);
    const child = spawn('python', args);

    let stderr = '';

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.type === 'progress' && onProgress) {
            onProgress({
              stage: 'ai_inference',
              method: `ai-${algorithm.toLowerCase()}`,
              progress: json.progress,
              currentFrame: json.current_frame,
              totalFrames: json.total_frames,
              fps: json.fps_speed
            });
          } else if (json.type === 'error') {
            console.error('[AI Engine Fatal]', json.message);
            reject(new Error(`AI Error: ${json.message}`));
          } else if (json.type === 'info') {
            console.log(`[AI Engine Init] ${json.message}`);
          }
        } catch (e) {
          console.log(`[Python] ${line}`);
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        const errDesc = stderr.length > 0 ? stderr.slice(-300) : 'Unknown python crash';
        reject(new Error(`AI engine exited with code ${code}. ${errDesc}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
};
