import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChrome } from './helpers/chrome.mjs';

const root = resolve('node_modules/.cache/earlink-presence-tests');
const baseURL = process.env.EARLINK_TEST_URL || 'http://127.0.0.1:3100';
const apiURL = process.env.EARLINK_TEST_API_URL || 'http://127.0.0.1:3180';
assert.equal((await (await fetch(`${apiURL}/__test__/health`)).json()).isolated_database, true);
assert.equal((await fetch(`${apiURL}/__test__/reset-presence`, { method: 'POST' })).status, 200);
await mkdir(root, { recursive: true });
const fixture = await readFile(new URL('./fixtures/earlink-gatt.js', import.meta.url), 'utf8');
const chrome = await launchChrome(root);
const pages = [];
let stage = 'opening visitors';
async function visitor() {
  const page = await chrome.newPage();
  pages.push(page);
  await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: fixture + `\nObject.defineProperty(navigator,'mediaDevices',{configurable:true,value:undefined});`,
  });
  await page.cdp('Page.navigate', { url: `${baseURL}/?blecase=keyboard-live` });
  await page.until(`document.querySelector('.connect-sheet')?.dataset.phase==='idle'`);
  return page;
}
async function sharedConnection(page) {
  await page.until(`document.querySelector('.device-scene')?.dataset.state==='connected'`, 10_000);
  await page.until(`!document.querySelector('.connect-sheet') && !document.querySelector('.mode-card').disabled`);
}

try {
  const second = await visitor();
  const third = await visitor();
  const owner = await visitor();
  stage = 'injecting report failure';
  await owner.js(`window.__ble.failPresenceReports=1`);
  stage = 'opening Bluetooth picker';
  await owner.click('.connect-sheet-primary');
  stage = 'choosing device';
  await owner.js(`window.__ble.choose()`);
  stage = 'waiting for BLE connection';
  await owner.until(`document.querySelector('.connect-sheet')?.dataset.phase==='success'`);
  // Both waiting visitors must recover before the old 20-second heartbeat.
  for (const peer of [second, third]) {
    await sharedConnection(peer);
    assert.equal(await peer.js(`window.__ble.requests.length`), 0);
  }
  console.log('PASS failed first connection report retries promptly; second and third visitors skip pairing');

  const report = await owner.js(`window.__ble.presence.find(p=>p.connected)`);
  // Simulate a server lease lost while the owner phone was suspended.
  assert.equal((await fetch(`${apiURL}/rooms/device`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...report, connected: false }),
  })).status, 204);
  for (const peer of [second, third]) {
    await peer.until(`document.querySelector('.connect-sheet')?.dataset.phase==='idle'`);
  }
  const before = await owner.js(`window.__ble.presence.filter(p=>p.connected).length`);
  await owner.js(`window.dispatchEvent(new Event('focus'))`);
  await owner.until(`window.__ble.presence.filter(p=>p.connected).length>${before}`, 3_000);
  for (const peer of [second, third]) {
    await sharedConnection(peer);
  }
  console.log('PASS owner phone focus immediately renews shared presence without pairing again');

  for (const [index, page] of pages.entries()) {
    // Hidden tabs may pause CSS animations; finish the entry animation before clicking.
    await page.js(`document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).forEach(a=>a.finish())`);
    await page.click(`.mode-card:nth-child(${index + 1})`);
    await page.until(`!!document.querySelector('.chat-screen') && window.__ble.socket?.readyState===1`);
  }
  await owner.click('.composer textarea');
  await owner.cdp('Input.insertText', { text: '세 기기 다중 소통 확인' });
  await owner.click('.composer .send-button');
  for (const page of pages) {
    await page.until(`[...document.querySelectorAll('.message-bubble')].some(e=>e.innerText==='세 기기 다중 소통 확인')`);
    assert.deepEqual(page.errors, []);
  }
  assert.equal(await owner.js(`window.__ble.requests.length`), 1);
  console.log('PASS three visitors join the same room and exchange a real WebSocket message with one BLE pairing');
} catch (error) {
  console.error('Failed stage:', stage);
  for (const page of pages) {
    console.error(await page.js(`({text:document.body.innerText,sheet:document.querySelector('.connect-sheet')?.className,fixture:!!window.__ble,errors:${JSON.stringify(page.errors)}})`));
  }
  throw error;
} finally {
  await chrome.close();
  await fetch(`${apiURL}/__test__/reset-presence`, { method: 'POST' });
}
