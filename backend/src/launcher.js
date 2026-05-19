import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🚀 Starting Sportz Server...');
const server = spawn('node', [path.join(__dirname, 'index.js')], { stdio: 'inherit' });

console.log('🚀 Starting Sportz Live Match Worker...');
const worker = spawn('node', [path.join(__dirname, '..', 'workers', 'liveMatchWorker.js')], { stdio: 'inherit' });

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code || 0);
});

worker.on('exit', (code) => {
  console.log(`Worker exited with code ${code}`);
  process.exit(code || 0);
});
