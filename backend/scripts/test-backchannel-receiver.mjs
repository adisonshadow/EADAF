// 测试用 back-channel logout 接收器：把收到的 logout_token 追加到文件并回 200
import http from 'node:http';
import { appendFileSync } from 'node:fs';

const PORT = Number(process.argv[2] || 4111);
const OUT = process.argv[3] || '/tmp/bc-receiver.log';

http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const params = new URLSearchParams(body);
    const token = params.get('logout_token') || '';
    appendFileSync(OUT, `${JSON.stringify({ at: new Date().toISOString(), path: req.url, token })}\n`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
}).listen(PORT, () => console.log(`[receiver] http://localhost:${PORT} → ${OUT}`));
