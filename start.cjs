// start.cjs - entrypoint for hosting environments such as cPanel Node.js App
// cPanel runs: node start.cjs
// PORT is typically assigned by the platform and passed via env vars / CLI args
const { spawn } = require('child_process');
const path = require('path');

const child = spawn(
  process.execPath,
  [path.join(__dirname, 'dist/index.js'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('Failed to start mail-telegram-bot:', err);
  process.exit(1);
});
