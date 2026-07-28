import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { fetchMetadata } from '../src/metadata.js';

// Served over a real loopback server rather than a mocked fetch, so this
// exercises the actual redirect, status and decoding paths.
let server, base;

const pages = {
  '/full': `<html><head><title>Un t&iacute;tulo</title>
      <meta name="description" content="una descripcion">
      <meta property="og:image" content="/img/portada.jpg">
    </head><body><img src="a.png"><img src="https://cdn.example/b.png"></body></html>`,
  '/no-meta-description': `<html><head><title>T</title></head><body>
      <p>corto</p>
      <p>${'x'.repeat(150)}</p>
    </body></html>`,
  '/latin1': null, // written as raw latin1 bytes below
  '/notfound': null,
  '/redirect': null,
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url;
    if (url === '/notfound'){
      res.writeHead(404); res.end('nope'); return;
    }
    if (url === '/redirect'){
      res.writeHead(302, { Location: '/full' }); res.end(); return;
    }
    if (url === '/latin1'){
      // "Ación" with the accented char as a raw 0xF3 byte
      const body = Buffer.concat([
        Buffer.from('<html><head><title>Aci'),
        Buffer.from([0xf3]),
        Buffer.from('n</title></head><body></body></html>'),
      ]);
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(body); return;
    }
    if (pages[url]){
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(pages[url]); return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise(resolve => server.close(resolve)));

describe('fetchMetadata', () => {
  it('extracts title, description and og:image', async () => {
    const meta = await fetchMetadata(`${base}/full`);
    expect(meta.title).toBe('Un título');
    expect(meta.description).toBe('una descripcion');
    expect(meta.image).toBe(`${base}/img/portada.jpg`);
  });

  it('resolves relative image urls against the page url', async () => {
    const meta = await fetchMetadata(`${base}/full`);
    expect(meta.images).toContain(`${base}/a.png`);
    expect(meta.images).toContain('https://cdn.example/b.png');
  });

  it('falls back to the first long paragraph when there is no meta description', async () => {
    const meta = await fetchMetadata(`${base}/no-meta-description`);
    expect(meta.description).toBe('x'.repeat(150));
  });

  it('decodes the body as latin1, matching the old request behaviour', async () => {
    // Byte 0xF3 must arrive as U+00F3, which is what correctorBruto expects
    // to see for pages that are genuinely UTF-8.
    const meta = await fetchMetadata(`${base}/latin1`);
    expect(meta.title).toBe('Ación');
  });

  it('follows redirects and reports the final url', async () => {
    const meta = await fetchMetadata(`${base}/redirect`);
    expect(meta.url).toBe(`${base}/full`);
    expect(meta.title).toBe('Un título');
  });

  it('rejects on a non-200 response', async () => {
    await expect(fetchMetadata(`${base}/notfound`)).rejects.toThrow(/404/);
  });

  it('rejects when the request times out', async () => {
    const slow = http.createServer(() => { /* never responds */ });
    await new Promise(resolve => slow.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${slow.address().port}/`;
    await expect(fetchMetadata(url, { timeout: 100 })).rejects.toThrow();
    await new Promise(resolve => slow.close(resolve));
  });
});
