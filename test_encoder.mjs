import { spawn } from "child_process";

const runCommand = (command, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
    
    child.on("error", (err) => resolve({ error: err.message }));
  });
};

async function test() {
  const result = await runCommand("ffmpeg", [
    "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.1",
    "-c:v", "h264_nvenc", "-f", "null", "-", "-hide_banner", "-loglevel", "error"
  ]);
  console.log("Result:", result);
}
test();
