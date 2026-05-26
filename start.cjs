// start.cjs — точка входу для хостингу (cPanel Node.js App)
// cPanel запускає: node start.cjs
// PORT призначається автоматично через cPanel і передається як env var
const { spawn } = require('child_process');
const path = require('path');

const child = spawn(
  process.execPath,
  [path.join(__dirname, 'dist/index.js')],
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
