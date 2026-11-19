import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestJson, ApiError } from '../src/lib/api.ts';
import { getWebSocketUrl } from '../src/lib/websocket-url.ts';
import { GET, POST, PUT } from '../src/app/api/backend/[...path]/route.ts';

function setEnv(t, key, value) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
}

test('mobile HTTP stays on the website origin and network errors are actionable', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/backend/rooms/join');
    assert.equal(options.method, 'POST');
    assert.equal(options.cache, 'no-store');
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(requestJson('/rooms/join', {method:'POST'}), error =>
    error instanceof ApiError && error.status === 0 && !error.message.includes('Failed to fetch'));
});

test('HTTP proxy preserves backend status, empty 204 and unavailable backend errors', async t => {
  setEnv(t, 'FASTAPI_HTTP_BASE_URL', 'http://127.0.0.1:3180/');
  let mode = 'ok';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.startsWith('http://127.0.0.1:3180/rooms/'));
    assert.equal(options.cache, 'no-store');
    if (mode === 'offline') throw new TypeError('fetch failed');
    if (options.method === 'PUT') return new Response(null, {status:204});
    return Response.json({detail:'방이 닫혔습니다.'}, {status:409});
  });
  const context = endpoint => ({params:Promise.resolve({path:['rooms',endpoint]})});
  const request = method => new Request('http://web.test/api/backend/rooms/device', {method});
  assert.equal((await PUT(request('PUT'), context('device'))).status, 204);
  const conflict = await POST(request('POST'), context('join'));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).detail, '방이 닫혔습니다.');
  mode = 'offline';
  const failed = await GET(request('GET'), context('device'));
  assert.equal(failed.status, 502);
  assert.ok((await failed.json()).detail.includes('대화 서버'));
  assert.equal((await GET(request('GET'), context('../private'))).status, 404);
});

test('chat and sign sockets share a mobile-safe endpoint including HTTPS', t => {
  globalThis.window = {location:{origin:'https://earlink.test'}};
  t.after(() => { delete globalThis.window; });
  setEnv(t, 'NEXT_PUBLIC_FASTAPI_WS_BASE_URL', '');
  for (const value of ['', 'ws://localhost:8000', 'ws://127.0.0.1:8000']) {
    process.env.NEXT_PUBLIC_FASTAPI_WS_BASE_URL = value;
    assert.equal(getWebSocketUrl('/ws/rooms/QA/2'), 'wss://earlink.test/ws/rooms/QA/2');
    assert.equal(getWebSocketUrl('/ws/translate/QA/2'), 'wss://earlink.test/ws/translate/QA/2');
  }
  process.env.NEXT_PUBLIC_FASTAPI_WS_BASE_URL = 'wss://api.earlink.test';
  assert.equal(getWebSocketUrl('/ws/rooms/QA/2'), 'wss://api.earlink.test/ws/rooms/QA/2');
});
