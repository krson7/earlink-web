import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function attach(url, pageTarget = true) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map(), errors = [];
  let nextId = 0;
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 15000);
    pending.set(id, {resolve, reject, timer});
    socket.send(JSON.stringify({id, method, params}));
  });
  async function js(expression) {
    const result = await cdp('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function until(expression, timeout = 12000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await js(expression)) return;
      await pause(100);
    }
    throw new Error(`UI timeout ${expression}`);
  }
  async function click(selector) {
    await cdp('Page.bringToFront');
    await js(`Promise.all((document.querySelector('.connect-sheet-card')?.getAnimations()??[]).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))).then(()=>true)`);
    const point = await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing element');el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await cdp('Input.dispatchMouseEvent', {type:'mousePressed',button:'left',clickCount:1,...point});
    await cdp('Input.dispatchMouseEvent', {type:'mouseReleased',button:'left',clickCount:1,...point});
  }
  if (pageTarget) {
    await cdp('Page.enable');
    await cdp('Runtime.enable');
  }
  return {cdp, js, until, click, errors, close: () => socket.close()};
}

export async function launchChrome(root) {
  const executable = [process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(path => path && existsSync(path));
  if (!executable) throw new Error('Chrome/Chromium required');
  const profile = resolve(root, 'chrome-' + randomUUID());
  await mkdir(profile, {recursive:true});
  const processHandle = spawn(executable, ['--headless=new','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], {windowsHide:true,stdio:'ignore'});
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]; break; }
    catch { await pause(100); }
  }
  if (!port) { processHandle.kill(); throw new Error('Chrome did not start'); }
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = await attach(version.webSocketDebuggerUrl, false), pages = [];
  async function newPage() {
    const {targetId} = await browser.cdp('Target.createTarget', {url:'about:blank'});
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = await attach(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
    pages.push(page);
    return page;
  }
  return {newPage, async close() {
    for (const page of pages) page.close();
    await browser.cdp('Browser.close').catch(() => {});
    browser.close();
    processHandle.kill();
  }};
}
