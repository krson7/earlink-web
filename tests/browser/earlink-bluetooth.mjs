import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('node_modules/.cache/earlink-bluetooth-tests');
const profile = resolve(root, 'chrome-' + randomUUID());
const baseURL = process.env.EARLINK_TEST_URL || 'http://127.0.0.1:3000';
const chromePath = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(path => path && existsSync(path));
if (!chromePath) throw new Error('Install Chrome/Chromium or set CHROME_BIN to its executable.');
await mkdir(root, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let tabs;
  for (let i=0;i<80;i++) { try { const port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
  assert.ok(tabs?.length);
  socket = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  const pending = new Map(); let serial=0; const errors=[];
  socket.onmessage=({data})=>{const msg=JSON.parse(data);if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);const item=pending.get(msg.id);if(!item)return;pending.delete(msg.id);clearTimeout(item.timer);if(msg.error)item.reject(new Error(JSON.stringify(msg.error)));else item.resolve(msg.result);};
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout ${method}`));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  async function js(expression) { const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value; }
  async function until(expression) {for(let i=0;i<100;i++){if(await js(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error(`UI timeout ${expression}`);}
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:await readFile(new URL('./fixtures/earlink-gatt.js', import.meta.url),'utf8')});
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const cases=[];
  async function load(mode){await cdp('Page.navigate',{url:new URL('/?blecase='+mode,baseURL).href});await until(`!!document.querySelector('.device-button') && window.__ble?.mode==='${mode}'`);}
  async function click(selector){await js(`Promise.all((document.querySelector('.connect-sheet-card')?.getAnimations()??[]).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))).then(()=>true)`);const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
  const phase = p=>`document.querySelector('.connect-sheet')?.dataset.phase==='${p}'`;
  async function noFalseConnection(){assert.notEqual(await js(`document.querySelector('.device-scene').dataset.state`),'connected');assert.equal(await js(`window.__ble.presence.filter(p=>p.connected).length`),0);}
  await load('success');
  await new Promise(r=>setTimeout(r,1900));
  assert.equal(await js(`window.__ble.requests.length`),0);
  await click('.device-button');await until(phase('connecting'));
  assert.equal(await js(`window.__ble.requests.length`),1);
  assert.equal(await js(`window.__ble.requests[0].active`),true);
  assert.deepEqual(await js(`window.__ble.requests[0].options`),{filters:[{name:'EarLink'}],optionalServices:['8f3a0001-7c3b-4b8a-9f52-123456789abc']});
  await new Promise(r=>setTimeout(r,1900));await noFalseConnection();assert.ok(await js(phase('connecting')));
  await js(`window.__ble.reject('NotFoundError')`);await until(phase('idle'));await noFalseConnection();
  await click('.connect-sheet-primary');await until(`window.__ble.requests.length===2`);
  await js(`window.__ble.reject('NotAllowedError')`);await until(phase('error'));await noFalseConnection();
  cases.push('trusted first click, no automatic request, picker waits >1.6s, cancellation, retry, denial');console.log('PASS '+cases.at(-1));

  await load('hold-init');await until(`!!document.querySelector('.connect-guide-action')`);await click('.connect-guide-action');await js(`window.__ble.choose()`);
  await until(`typeof window.__ble.releaseRead==='function'`);await new Promise(r=>setTimeout(r,1900));await noFalseConnection();assert.ok(await js(phase('connecting')));
  await js(`window.__ble.releaseRead()`);await until(phase('success'));await until(`window.__ble.presence.some(p=>p.connected)`);
  assert.equal(await js(`window.__ble.presence.find(p=>p.connected).serial_number`),null);
  assert.ok(!(await js(`document.body.innerText`)).includes('EL-0001'));
  await until(`!document.querySelector('.connect-sheet')`);await click('.device-button');await until(phase('connected'));
  assert.ok(await js(`!!document.querySelector('.output-controls')`));
  await click('.output-controls-row button:nth-child(3)');await until(`window.__ble.writes.some(w=>w.uuid.includes('0003-')&&JSON.stringify(w.bytes)==='[1,4]')`);
  await js(`const s=document.querySelector('.output-controls-interval select');s.value='5000';s.dispatchEvent(new Event('change',{bubbles:true}));`);
  await until(`window.__ble.writes.some(w=>w.uuid.includes('0003-')&&JSON.stringify(w.bytes)==='[1,6,136,19]')`);
  await js(`window.__ble.device.gatt.disconnect()`);await until(phase('idle'));await until(`window.__ble.presence.some(p=>p.connected===false)`);assert.equal(await js(`document.querySelector('.device-scene').dataset.state`),'idle');assert.equal(await js(`window.__ble.presence.at(-1).connected`),false);
  cases.push('no success before status read, optional serial absent, real status controls/interval wire packets, disconnection');console.log('PASS '+cases.at(-1));

  for(const mode of ['gatt-fail','status-missing','invalid-status','notifications-fail','init-disconnect','silent-drop']){
    await load(mode);await click('.device-button');await until(phase('connecting'));await js(`window.__ble.choose()`);await until(phase('error'));await noFalseConnection();
    assert.equal(await js(`window.__ble.device.gatt.connected`),false);cases.push(mode);console.log('PASS '+mode);
  }
  await load('unsupported');await click('.device-button');await until(phase('unsupported'));assert.equal(await js(`window.__ble.requests.length`),0);await noFalseConnection();cases.push('unsupported browser');console.log('PASS unsupported browser');
  await load('remote');await click('.device-button');await until(phase('remote'));assert.equal(await js(`window.__ble.requests.length`),0);assert.match(await js(`document.querySelector('.connect-sheet-copy').innerText`),/다른 휴대폰/);cases.push('remote connection remains separate');console.log('PASS remote connection remains separate');

  await load('keyboard');await click('.device-button');await until(phase('connecting'));await js(`window.__ble.choose()`);await until(phase('success'));
  await until(`window.__ble.writes.some(w=>w.uuid.includes('0004-')&&JSON.stringify(w.bytes)==='[1,1]')`);
  assert.ok(await js(`window.__ble.writes.some(w=>w.uuid.includes('0004-')&&JSON.stringify(w.bytes)==='[1,3,0]')`));
  await until(`window.__ble.presence.some(p=>p.connected&&p.serial_number==='EL-0427')`);
  await until(`!document.querySelector('.connect-sheet')`);
  await click('.mode-card:nth-child(3)');await until(`!!document.querySelector('.chat-screen')&&window.__ble.socket?.readyState===1`);
  await new Promise(r=>setTimeout(r,100));
  await js(`window.__ble.socket.onmessage({data:JSON.stringify({type:'message',sender_id:2,content:'실제 연결 경로 확인'})});`);
  await until(`window.__ble.completed.includes('실제 연결 경로 확인')`);
  assert.equal(await js(`document.querySelectorAll('.device-delivery-notice').length`),0);
  await js(`window.__ble.nextAck=4;window.__ble.socket.onmessage({data:JSON.stringify({type:'message',sender_id:2,content:'수신 거절 확인'})});`);
  await until(`!!document.querySelector('.device-delivery-notice')`);
  await click('.device-delivery-notice button');await until(`!document.querySelector('.device-delivery-notice')`);
  assert.equal(await js(`window.__ble.completed.filter(s=>s==='수신 거절 확인').length`),2);
  cases.push('optional keyboard/serial, ready+sync, chat -> actual GATT packets -> ACK, negative ACK and retry');console.log('PASS '+cases.at(-1));
  assert.deepEqual(errors,[]);
  await writeFile(resolve(root,'production-report.json'),JSON.stringify({result:'PASS',cases,runtimeExceptions:errors,physicalHardware:'NOT TESTED',transport:'Browser-only Web Bluetooth fixture; production code has no simulator'},null,2));
  console.log(JSON.stringify({result:'PASS',scenarios:cases.length,physicalHardware:'NOT TESTED'}));
  await cdp('Browser.close');
}finally{socket?.close();chrome.kill();}
