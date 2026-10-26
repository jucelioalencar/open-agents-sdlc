import { spawn } from 'node:child_process';

const chunks = [];
let total = 0;
for await (const chunk of process.stdin) {
  total += chunk.length;
  if (total > 2 * 1024 * 1024) {
    process.stderr.write('Solicitação de execução excede o limite de 2 MB.\n');
    process.exit(413);
  }
  chunks.push(chunk);
}

let request;
try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
catch { process.stderr.write('Solicitação de execução inválida.\n'); process.exit(400); }
if (!request || typeof request.command !== 'string' || !Array.isArray(request.args) || typeof request.cwd !== 'string') {
  process.stderr.write('Comando ou diretório de execução inválido.\n');
  process.exit(400);
}

const child = spawn(request.command, request.args.map(String), {
  cwd: request.cwd,
  env: { ...process.env, ...(request.env && typeof request.env === 'object' ? request.env : {}) },
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: false
});
child.stdout.on('data', chunk => process.stdout.write(chunk));
child.stderr.on('data', chunk => process.stderr.write(chunk));
child.once('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 127; });
child.once('close', code => { process.exitCode = code ?? 1; });
child.stdin.end(typeof request.input === 'string' ? request.input : '');
process.once('SIGTERM', () => child.kill('SIGTERM'));
process.once('SIGINT', () => child.kill('SIGINT'));
