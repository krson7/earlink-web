(() => {
  const mode = new URL(location.href).searchParams.get('blecase') || 'success';
  const live = mode === 'keyboard-live';
  const uuid = n => `8f3a000${n}-7c3b-4b8a-9f52-123456789abc`;
  const q = window.__ble = { mode, requests: [], presence: [], writes: [], stages: [], completed: [], sent: [], received: [], nextAck: 1 };
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, options = {}) => {
    if (live && q.disconnectDelay && String(input).includes('/rooms/device') &&
        options.method === 'PUT' && !JSON.parse(options.body).connected) {
      return new Promise(resolve => setTimeout(resolve, q.disconnectDelay)).then(() => originalFetch(input, options));
    }
    if (!live && String(input).includes('/rooms/device')) {
      if (options.method === 'PUT') q.presence.push(JSON.parse(options.body));
      else q.presenceChecks = (q.presenceChecks || 0) + 1;
      if (mode === 'presence-missing' && !q.presenceRestored) return Promise.resolve(Response.json({detail:'Not Found'}, {status:404}));
      if (mode === 'presence-slow') return new Promise(resolve => setTimeout(() => resolve(Response.json({connected:true,serial_number:'EL-REMOTE'})), 3500));
      const remote = q.remoteConnected ?? (mode === 'remote' || mode === 'join-offline');
      return Promise.resolve(Response.json({ connected: remote, serial_number: remote ? 'EL-REMOTE' : null }));
    }
    if (mode === 'join-offline' && String(input).includes('/rooms/join')) return Promise.reject(new TypeError('Failed to fetch'));
    if (!live && String(input).includes('/rooms/join')) return Promise.resolve(new Response(JSON.stringify({ participant_id: 1, room_id: 1, room_code: 'QA', accessibility_mode: JSON.parse(options.body).accessibility_mode, joined_at: new Date().toISOString() }), { status: 200 }));
    return originalFetch(input, options);
  };
  const NativeSocket = window.WebSocket;
  window.WebSocket = class extends NativeSocket {
    constructor(url, protocols) {
      if (!live && String(url).includes('/ws/rooms/')) {
        const socket = { readyState: 0, send(text) {
          q.sent.push(text);
          let payload;
          try { payload = JSON.parse(text); } catch { /* Plain chat. */ }
          const event = payload?.type === 'typing'
            ? { ...payload, sender_id: 1 }
            : { type: 'message', sender_id: 1, content: payload?.type === 'message' ? payload.content : text,
                ...(payload?.source === 'braille' ? { source: 'braille' } : {}) };
          setTimeout(() => socket.onmessage?.({ data: JSON.stringify(event) }), 0);
        }, close() { this.readyState = 3; }, addEventListener() {}, removeEventListener() {} };
        q.socket = socket;
        setTimeout(() => {
          socket.readyState = 1; socket.onopen?.();
          if (mode !== 'keyboard-legacy') socket.onmessage?.({ data: JSON.stringify({ type: 'capabilities', braille_events: true, braille_drafts: true }) });
        }, 20);
        return socket;
      }
      super(url, protocols);
      if (live && String(url).includes('/ws/rooms/')) {
        q.socket = this;
        this.addEventListener('message', event => q.received.push(JSON.parse(event.data)));
      }
    }
    send(data) {
      if (this === q.socket) q.sent.push(data);
      super.send(data);
    }
  };
  if (mode === 'unsupported') {
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: undefined });
    return;
  }
  function makeDevice() {
    const device = new EventTarget();
    device.id = 'qa-earlink-device'; device.name = 'EarLink';
    const state = new EventTarget();
    const raw = new Uint8Array(16); raw.set([1, 15]);
    const view = new DataView(raw.buffer);
    view.setUint16(8, 1, true); view.setUint16(10, 2, true); view.setUint16(14, 3000, true);
    state.value = view;
    state.emit = () => state.dispatchEvent(new Event('characteristicvaluechanged'));
    state.startNotifications = async () => {
      q.stages.push('notifications');
      if (mode === 'notifications-fail') throw new DOMException('Notification setup failed', 'NetworkError');
      return state;
    };
    state.readValue = async () => {
      q.stages.push('read-status');
      if (mode === 'hold-init') await new Promise(resolve => { q.releaseRead = resolve; });
      if (mode === 'init-disconnect') device.gatt.disconnect();
      if (mode === 'invalid-status') return new DataView(new Uint8Array([9]).buffer);
      return state.value;
    };
    state.writeValueWithResponse = async bytes => {
      const b = [...bytes]; q.writes.push({ uuid: uuid(3), bytes: b });
      if (b[1] === 4) raw[1] &= ~2;
      if (b[1] === 5) raw[1] |= 2;
      if (b[1] === 6) view.setUint16(14, b[2] | b[3] << 8, true);
      state.emit();
    };
    const text = { writeValueWithResponse: async bytes => {
      const b = [...bytes]; q.writes.push({ uuid: uuid(2), bytes: b });
      if (b[3] === 1) q.payload = [];
      if (b[3] === 2) q.payload.push(...b.slice(8));
      if (b[3] === 3) {
        q.completed.push(new TextDecoder().decode(new Uint8Array(q.payload)));
        view.setUint16(2, b[4] | b[5] << 8, true); raw[4] = q.nextAck; q.nextAck = 1;
        state.emit();
      }
    } };
    const keyboard = new EventTarget();
    keyboard.startNotifications = async () => keyboard;
    let revision = 0, cells = [], pending = [], requestId = 0;
    q.bootId = q.bootId || (Math.floor(Math.random() * 0xffffffff) + 1);
    q.emitKeyboard = (draft, id = 0, original = []) => {
      cells = [...draft]; pending = [...original]; requestId = id; revision++;
      const begin = new Uint8Array(19), view = new DataView(begin.buffer);
      begin.set([1, 1]); view.setUint32(2, q.bootId, true); view.setUint32(6, revision, true);
      view.setUint32(10, id, true); view.setUint16(14, cells.length, true); view.setUint16(16, pending.length, true);
      const frames = [begin], all = [...cells, ...pending];
      for (let offset = 0; offset < all.length; offset += 12) {
        const packet = new Uint8Array(8 + Math.min(12, all.length - offset));
        packet.set([1, 2]); const dv = new DataView(packet.buffer);
        dv.setUint32(2, revision, true); dv.setUint16(6, offset, true); packet.set(all.slice(offset, offset + 12), 8);
        frames.push(packet);
      }
      const end = new Uint8Array([1, 3, 0, 0, 0, 0]); new DataView(end.buffer).setUint32(2, revision, true); frames.push(end);
      for (const frame of frames) {
        keyboard.value = new DataView(frame.buffer);
        keyboard.dispatchEvent(new Event('characteristicvaluechanged'));
      }
    };
    keyboard.writeValueWithResponse = async bytes => {
      const b = [...bytes]; q.writes.push({ uuid: uuid(4), bytes: b });
      if (b[1] === 1) q.emitKeyboard(cells, requestId, pending);
      if (b[1] === 4) q.emitKeyboard(cells, ++q.requestSequence, cells);
      if (b[1] === 2 && requestId === new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(2, true)) {
        if (!q.holdKeyboardAck) q.emitKeyboard(b[6] === 1 ? cells.slice(pending.length) : cells);
      }
    };
    const serial = { readValue: async () => {
      if (mode === 'silent-drop') device.gatt.connected = false;
      return new DataView(new TextEncoder().encode('EL-0427').buffer);
    } };
    const service = { getCharacteristic: async id => {
      q.stages.push('characteristic:' + id);
      if (id === uuid(2)) return text;
      if (id === uuid(3) && mode !== 'status-missing') return state;
      if (id === uuid(4) && mode.startsWith('keyboard')) return keyboard;
      if (id === uuid(5) && (mode.startsWith('keyboard') || mode === 'silent-drop')) return serial;
      throw new DOMException('Characteristic missing', 'NotFoundError');
    } };
    device.gatt = {
      connected: false,
      connect: async () => {
        q.stages.push('gatt-connect');
        if (mode === 'gatt-fail') throw new DOMException('GATT connection failed', 'NetworkError');
        device.gatt.connected = true; return device.gatt;
      },
      getPrimaryService: async id => {
        if (id !== uuid(1)) throw new Error('Wrong service UUID');
        return service;
      },
      disconnect: () => {
        if (!device.gatt.connected) return;
        device.gatt.connected = false;
        device.dispatchEvent(new Event('gattserverdisconnected'));
      },
    };
    q.device = device;
    q.requestSequence = 100;
    return device;
  }
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {
    requestDevice(options) {
      q.requests.push({ options, active: navigator.userActivation.isActive });
      return new Promise((resolve, reject) => {
        q.choose = () => resolve(makeDevice());
        q.reject = name => reject(new DOMException('Picker dismissed or denied', name));
      });
    },
  } });
})();
