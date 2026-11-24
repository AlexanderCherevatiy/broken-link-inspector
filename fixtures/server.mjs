import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const pages = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/stop.html', 'stop.html'],
  ['/permissions.html', 'permissions.html'], ['/dns.html', 'dns.html'],
]);
const codes = new Map([
  ['ok', 200], ['no-content', 204], ['missing', 404], ['gone', 410],
  ['auth', 401], ['forbidden', 403], ['rate-limit', 429], ['error', 503], ['landing', 200],
]);

export function fixtureServer(inspect = () => {}) {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const method = request.method;
    inspect({ pathname, method, range: request.headers.range, cookie: request.headers.cookie });
    response.setHeader('Cache-Control', 'no-store');
    const page = pages.get(pathname);
    if (page) {
      const html = await readFile(new URL(page, import.meta.url));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
      return;
    }
    const endpoint = pathname.replace(/^\/targets\//, '');
    if (codes.has(endpoint)) {
      response.writeHead(codes.get(endpoint)).end('Fixture response');
    } else if (endpoint === 'redirect') {
      response.writeHead(302, { location: '/targets/landing?via=redirect' }).end();
    } else if (endpoint === 'fallback') {
      if (method === 'HEAD') response.writeHead(405, { allow: 'GET' }).end();
      else if (request.headers.range === 'bytes=0-0') {
        response.writeHead(206, { 'content-range': 'bytes 0-0/1024', 'content-length': 1 }).end('x');
      } else response.writeHead(400).end();
    } else if (endpoint === 'large') {
      if (method === 'HEAD') response.writeHead(501).end();
      else {
        response.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': 32 * 1024 * 1024,
          'x-content-type-options': 'nosniff',
        });
        response.write('x');
        const slowBody = setInterval(() => response.write('x'), 100);
        response.on('close', () => clearInterval(slowBody));
      }
    } else if (endpoint === 'slow' || endpoint.startsWith('delay/')) {
      const timer = setTimeout(() => response.writeHead(200).end('Slow response'), 10_000);
      response.on('close', () => clearTimeout(timer));
    } else if (endpoint === 'disconnect') {
      request.socket.destroy();
    } else {
      response.writeHead(404).end('Unknown fixture');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.FIXTURE_PORT ?? 4173);
  fixtureServer().listen(port, '127.0.0.1', () => {
    console.log('Status fixtures: http://127.0.0.1:' + port + '/');
    console.log('Stop / reload:   http://127.0.0.1:' + port + '/stop.html');
    console.log('Permissions:     http://127.0.0.1:' + port + '/permissions.html');
  });
}
