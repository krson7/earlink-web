import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChrome } from './helpers/chrome.mjs';

const root = resolve('node_modules/.cache/earlink-live-tests');
const baseURL = process.env.EARLINK_TEST_URL || 'http://127.0.0.1:3100';
const apiURL = process.env.EARLINK_TEST_API_URL || 'http://127.0.0.1:3180';
const cells = [26,35,18,8,46]; // 한글
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const cases = [], pages = [];
await mkdir(root, {recursive:true});
assert.equal((await (await fetch(`${apiURL}/__test__/health`)).json()).isolated_database, true);
const fixture = await readFile(new URL('./fixtures/earlink-gatt.js',import.meta.url),'utf8');
const speechFixture = `(() => {
  const q = window.__ble;
  q.spoken = []; q.cancelled = 0;
  Object.defineProperty(window, 'speechSynthesis', {configurable:true, value:{
    speak(utterance) { q.spoken.push(utterance.text); utterance.onstart?.(); setTimeout(()=>utterance.onend?.(),20); },
    cancel() { q.cancelled++; }
  }});
  window.SpeechRecognition = class {
    start() { q.recognition = this; }
    stop() { this.onend?.(); }
    abort() { this.onend?.(); }
  };
  // The chat integration does not require a camera or downloaded ML model.
  Object.defineProperty(navigator, 'mediaDevices', {configurable:true, value:undefined});
})();`;
let chrome;
const pass = name => { cases.push(name); console.log('PASS '+name); };
try {
  chrome = await launchChrome(root);
  async function createPage(card, relay = false) {
    const page = await chrome.newPage(); pages.push(page);
    await page.cdp('Page.addScriptToEvaluateOnNewDocument',{source:fixture+'\n'+speechFixture});
    await page.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await page.cdp('Page.navigate',{url:new URL('/?blecase=keyboard-live',baseURL).href});
    await page.until(`!!document.querySelector('.device-button') && !!window.__ble`);
    // Next's development toolbar otherwise covers the bottom-left microphone.
    await page.js(`(()=>{const style=document.createElement('style');style.textContent='nextjs-portal { display: none !important; }';document.head.append(style);})()`);
    if (relay) {
      await page.click('.device-button'); await page.js(`window.__ble.choose()`);
      await page.until(`document.querySelector('.connect-sheet')?.dataset.phase==='success'`);
      await page.until(`!document.querySelector('.connect-sheet')`);
    } else {
      await page.until(`document.querySelector('.device-scene')?.dataset.state==='connected'`);
      assert.equal(await page.js(`!!document.querySelector('.connect-guide-action, .connect-guide-backdrop, .connect-sheet')`),false);
      assert.equal(await page.js(`window.__ble.requests.length`),0);
    }
    await page.click(`.mode-card:nth-child(${card})`);
    await page.until(`window.__ble.received.some(e=>e.type==='capabilities') && !!document.querySelector('.chat-screen')`);
    if (relay) await page.until(`window.__ble.writes.some(w=>w.uuid.includes('0004-')&&JSON.stringify(w.bytes)==='[1,3,1]')`);
    return page;
  }
  const relay = await createPage(3,true), voice = await createPage(1), sign = await createPage(2);
  const peers = [voice, sign];
  const id = await relay.js(`Number(window.__ble.socket.url.split('/').at(-1))`);
  assert.equal(new Set(await Promise.all(pages.map(p=>p.js(`window.__ble.socket.url`)))).size,3);
  pass('one phone reports BLE presence; second and third phones join without pairing or a connection guide via the real API');

  const bubbleCount = (page,text) => page.js(`[...document.querySelectorAll('.message-bubble:not(.typing-bubble)')].filter(e=>e.innerText===${JSON.stringify(text)}).length`);
  async function waitMessage(page,text) {
    await page.until(`[...document.querySelectorAll('.message-bubble:not(.typing-bubble)')].some(e=>e.innerText===${JSON.stringify(text)})`);
  }
  async function allTyping(active) {
    for (const peer of pages) await peer.until(`${active ? '!!' : '!'}document.querySelector('.braille-typing')`);
  }
  async function sendBraille(requestId, draft = cells) {
    await relay.js(`window.__ble.emitKeyboard(${JSON.stringify(draft)},${requestId},${JSON.stringify(draft)})`);
    await relay.until(`window.__ble.writes.some(w=>w.uuid.includes('0004-')&&w.bytes[1]===2&&w.bytes[2]===${requestId % 256})`);
  }
  await relay.js(`window.__ble.emitKeyboard([8])`);
  await allTyping(true);
  for (const page of pages) {
    await page.until(`document.querySelector('.braille-live-text')?.innerText==='ㄱ'`);
    assert.equal(await page.js(`document.querySelectorAll('.braille-typing').length`),1);
    assert.equal(await page.js(`document.querySelectorAll('.chat-screen textarea').length`),1,'only the selected mode composer is present');
    assert.equal(await page.js(`document.querySelectorAll('.message-scroll textarea, .message-scroll input, .message-scroll button, .message-scroll [contenteditable="true"]').length`),0,'received braille has no input controls');
    assert.equal(await page.js(`document.querySelector('.braille-typing')?.dataset.sender`),'other');
    const bubbleHeight = await page.js(`document.querySelector('.typing-bubble').getBoundingClientRect().height`);
    assert.ok(bubbleHeight < 64, `one-line typing bubble should be compact, got ${bubbleHeight}px`);
  }
  assert.equal(await voice.js(`window.__ble.spoken.length`),0);
  assert.equal(await relay.js(`window.__ble.completed.length`),0);
  pass('unfinished braille appears once as live left text on every phone, without a braille composer, speech or display output');

  await relay.js(`window.__ble.emitKeyboard([])`);await allTyping(false);
  await relay.js(`window.__ble.emitKeyboard(${JSON.stringify(cells)})`);await allTyping(true);
  for (const page of pages) await page.until(`document.querySelector('.braille-live-text')?.innerText==='한글'`);
  await relay.js(`window.__ble.emitKeyboard(${JSON.stringify(cells.slice(0,3))})`);
  for (const page of pages) await page.until(`document.querySelector('.braille-live-text')?.innerText==='한'`);
  await relay.js(`window.__ble.emitKeyboard(${JSON.stringify(cells)})`);
  await sendBraille(31);
  for (const page of pages) {
    await waitMessage(page,'한글'); assert.equal(await bubbleCount(page,'한글'),1);
    assert.equal(await page.js(`!![...document.querySelectorAll('.message-bubble:not(.typing-bubble)')].find(e=>e.innerText==='한글')?.classList.contains('mine')`),false);
  }
  await allTyping(false);
  await voice.until(`window.__ble.spoken.includes('한글')`);
  assert.equal(await relay.js(`window.__ble.completed.includes('한글')`),false);
  await sendBraille(31);await pause(200);
  for (const page of pages) assert.equal(await bubbleCount(page,'한글'),1);
  pass('clear stops typing; one BLE send becomes one real room broadcast, one voice reading and no display echo');

  await relay.js(`window.__ble.emitKeyboard(${JSON.stringify(cells)})`);
  await sendBraille(36);
  for (const page of pages) await page.until(`[...document.querySelectorAll('.message-bubble:not(.typing-bubble)')].filter(e=>e.innerText==='한글').length===2`);
  pass('another physical keyboard send appends a second left bubble on every participant');

  await relay.js(`window.__ble.emitKeyboard([8])`);await allTyping(true);
  for (let index=1;index<=7;index++) {
    await pause(1100);
    await relay.js(`window.__ble.emitKeyboard(${JSON.stringify(Array(index+1).fill(8))})`);
    for (const peer of peers) assert.equal(await peer.js(`!!document.querySelector('.braille-typing')`),true);
  }
  await pause(5500);await allTyping(true);
  await relay.js(`window.__ble.emitKeyboard([])`);await allTyping(false);
  pass('live drafts survive editing and pauses; erasing clears them on every participant');

  await relay.click('.composer textarea');
  await relay.cdp('Input.insertText',{text:'일반 텍스트 회귀 확인'});
  await relay.click('.composer .send-button');
  await waitMessage(relay,'일반 텍스트 회귀 확인');
  assert.equal(await relay.js(`[...document.querySelectorAll('.message-bubble.mine')].some(e=>e.innerText==='일반 텍스트 회귀 확인')`),true);
  for (const peer of peers) await waitMessage(peer,'일반 텍스트 회귀 확인');
  assert.equal(await sign.js(`!!document.querySelector('.braille-typing')`),false);
  await relay.until(`window.__ble.completed.includes('일반 텍스트 회귀 확인')`);
  await voice.until(`window.__ble.spoken.includes('일반 텍스트 회귀 확인')`);
  pass('ordinary text still broadcasts, plays speech and reaches the braille display without a typing bubble');

  // Identical text from the two people must preserve ownership and output.
  await relay.click('.composer textarea');
  await relay.cdp('Input.insertText',{text:'한글'});
  await relay.click('.composer .send-button');
  await relay.until(`[...document.querySelectorAll('.message-bubble.mine')].some(e=>e.innerText==='한글')`);
  await relay.until(`window.__ble.completed.filter(text=>text==='한글').length===1`);
  pass('identical content from the screen user remains right aligned and reaches the braille display');

  await voice.click('.mic-button');
  await voice.until(`!!window.__ble.recognition && document.querySelector('.mic-button')?.getAttribute('aria-pressed')==='true'`);
  await voice.js(`window.__ble.recognition.onresult({results:[[{transcript:'음성 입력 회귀 확인'}]]})`);
  await voice.until(`document.querySelector('.composer textarea')?.value==='음성 입력 회귀 확인'`);
  const speechBefore = await voice.js(`window.__ble.spoken.length`);
  await sendBraille(32);
  await voice.until(`[...document.querySelectorAll('.message-bubble:not(.typing-bubble)')].filter(e=>e.innerText==='한글').length===4`);
  assert.equal(await voice.js(`window.__ble.spoken.length`),speechBefore,'microphone holds speech');
  await voice.click('.composer .send-button');
  for (const page of pages) await waitMessage(page,'음성 입력 회귀 확인');
  await voice.until(`window.__ble.spoken.length>${speechBefore}`);
  await voice.until(`document.querySelector('.composer textarea').value===''`);
  assert.equal(await voice.js(`window.__ble.recognition.onresult`),null);
  await relay.until(`window.__ble.completed.includes('음성 입력 회귀 확인')`);
  pass('voice recognition callback, send, stale-result cancellation and microphone speech hold are preserved');

  await relay.js(`window.__ble.emitKeyboard(${JSON.stringify(cells)})`);await allTyping(true);
  await voice.until(`document.querySelector('.braille-live-text')?.innerText==='한글'`);
  await voice.js(`new Promise(resolve=>setTimeout(()=>{document.querySelector('.message-scroll').scrollTo({top:999999,behavior:'instant'});resolve(true)},350))`);
  const screenshot = await voice.cdp('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(root,'chat-braille-preview.png'),Buffer.from(screenshot.data,'base64'));
  await relay.js(`window.__ble.emitKeyboard([])`);await allTyping(false);

  await voice.js(`window.__ble.oldRecognition=window.__ble.recognition`);
  await voice.click('.mic-button');
  await voice.until(`window.__ble.recognition!==window.__ble.oldRecognition && document.querySelector('.mic-button')?.getAttribute('aria-pressed')==='true'`);
  await voice.js(`window.__ble.oldRecognition.onend?.();window.__ble.oldRecognition.onerror?.({error:'network'})`);
  await pause(100);
  assert.equal(await voice.js(`document.querySelector('.mic-button')?.getAttribute('aria-pressed')`),'true','old recognition end must not stop a new recording');
  assert.ok(!(await voice.js(`document.body.innerText`)).includes('음성 인식 서버에 연결하지 못했어요.'),'stale speech errors must not affect new recording');
  await voice.click('.mic-button');
  pass('late end/error events from an old microphone session cannot stop or corrupt a new session');

  // Closing the actual server socket exercises the production reconnect path.
  await relay.js(`window.__ble.emitKeyboard([8])`);await allTyping(true);
  const oldSocket = await relay.js(`window.__ble.oldSocket=window.__ble.socket;true`);
  assert.equal(oldSocket,true);
  for (const peer of peers) await peer.js(`window.__ble.stopsBeforeDisconnect=window.__ble.received.filter(e=>e.type==='typing'&&!e.active).length`);
  assert.equal((await (await fetch(`${apiURL}/__test__/close/${id}`,{method:'POST'})).json()).closed,true);
  for (const peer of peers) await peer.until(`window.__ble.received.filter(e=>e.type==='typing'&&!e.active).length>window.__ble.stopsBeforeDisconnect`);
  assert.equal(await relay.js(`document.querySelector('.braille-live-text')?.innerText`),'ㄱ','hardware draft survives a temporary chat disconnect');
  await relay.until(`window.__ble.socket!==window.__ble.oldSocket && window.__ble.socket.readyState===1`);
  await relay.until(`window.__ble.received.filter(e=>e.type==='capabilities').length>=2`);
  await pause(100);
  await relay.js(`window.__ble.emitKeyboard([8,35])`);await allTyping(true);
  await sendBraille(33);await allTyping(false);
  for (const page of pages) await page.until(`[...document.querySelectorAll('.message-bubble:not(.typing-bubble)')].filter(e=>e.innerText==='한글').length===5`);
  pass('real server disconnect clears typing, reconnects, negotiates support and resumes exactly-once braille submission');

  await relay.js(`window.__ble.emitKeyboard([8]);window.__ble.savedDevice=window.__ble.device`);await allTyping(true);
  await relay.click('.back-button');await allTyping(false);
  await relay.until(`!!document.querySelector('.mode-card')`);
  await relay.click('.mode-card:nth-child(2)');
  await relay.until(`window.__ble.socket.readyState===1 && !!document.querySelector('.sign-camera')`);
  await relay.until(`window.__ble.received.filter(e=>e.type==='capabilities').length>=3`);
  assert.equal(await relay.js(`window.__ble.device===window.__ble.savedDevice && window.__ble.device.gatt.connected && window.__ble.requests.length===1`),true);
  await sendBraille(34);for (const peer of peers) await peer.until(`[...document.querySelectorAll('.message-bubble:not(.typing-bubble)')].filter(e=>e.innerText==='한글').length===6`);
  pass('switching the connection owner to sign mode keeps BLE connected and sends to existing voice/sign peers');

  await relay.js(`window.__ble.emitKeyboard([8])`);await allTyping(true);
  // Delayed release must not make the relay mistake its own old lease for a peer.
  await relay.js(`window.__ble.disconnectDelay=800;window.__ble.device.gatt.disconnect()`);await allTyping(false);
  for (const peer of peers) await peer.until(`!!document.querySelector('.device-status .connection-dot.offline')`);
  await relay.click('.device-status');await relay.until(`document.querySelector('.connect-sheet')?.dataset.phase==='connecting'`);
  await relay.js(`window.__ble.choose()`);await relay.until(`document.querySelector('.connect-sheet')?.dataset.phase==='success'`);
  await relay.until(`!document.querySelector('.connect-sheet')`);
  for (const peer of peers) await peer.until(`!!document.querySelector('.device-status .connection-dot.online')`);
  await sendBraille(35);for (const peer of peers) await peer.until(`[...document.querySelectorAll('.message-bubble:not(.typing-bubble)')].filter(e=>e.innerText==='한글').length===7`);
  pass('BLE disconnect removes peer status and reconnect restores keyboard relay in sign mode');

  // A small viewport must still leave the conversation and send controls usable.
  const layouts = [];
  for (const height of [844,667,568]) {
    await relay.cdp('Emulation.setDeviceMetricsOverride',{width:360,height,deviceScaleFactor:1,mobile:true});
    await pause(100);
    layouts.push(await relay.js(`(()=>{const chat=document.querySelector('.message-list').getBoundingClientRect(),composer=document.querySelector('.composer-stack').getBoundingClientRect();return {height:innerHeight,chatHeight:chat.height,buttonBottom:composer.bottom,bodyWidth:document.body.scrollWidth,width:innerWidth}})()`));
  }
  for (const layout of layouts) {
    assert.ok(layout.chatHeight>=80,JSON.stringify(layout));
    assert.ok(layout.buttonBottom<=layout.height,JSON.stringify(layout));
    assert.ok(layout.bodyWidth<=layout.width,JSON.stringify(layout));
  }
  pass('sign-mode layouts at 360px width and 844/667/568px height keep chat and the selected mode composer visible');

  for (const page of pages) assert.deepEqual(page.errors,[]);
  const report = {result:'PASS',cases,layouts,runtimeExceptions:[],transport:'Real HTTP join, SQLite participant validation and real FastAPI room WebSockets across 3 browser pages',fixtures:'BLE GATT and browser speech callbacks; camera deliberately unavailable',physicalHardware:'NOT TESTED',cameraModelAccuracy:'NOT TESTED'};
  await writeFile(resolve(root,'live-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({result:'PASS',scenarios:cases.length}));
} catch(error) {
  const diagnostics = [];
  for (const page of pages) {
    try { diagnostics.push(await page.js(`({url:location.href,text:document.body.innerText,mic:document.querySelector('.mic-button')?.outerHTML,recognition:typeof window.SpeechRecognition,sent:window.__ble?.sent,received:window.__ble?.received,writes:window.__ble?.writes.slice(-10)})`)); }
    catch { /* Closed target. */ }
  }
  await writeFile(resolve(root,'live-failure.json'),JSON.stringify({error:String(error),passed:cases,diagnostics},null,2));
  throw error;
} finally { await chrome?.close(); }
