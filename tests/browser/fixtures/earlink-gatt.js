(() => {
  const mode = new URL(location.href).searchParams.get('blecase') || 'success';
  const uuid = n => `8f3a000${n}-7c3b-4b8a-9f52-123456789abc`;
  const q = window.__ble = { mode, requests: [], presence: [], writes: [], stages: [], completed: [], nextAck: 1 };
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, options = {}) => {
    if (String(input).includes('/rooms/device')) {
      if (options.method === 'PUT') q.presence.push(JSON.parse(options.body));
      return Promise.resolve(new Response(JSON.stringify({ connected: mode === 'remote', serial_number: mode === 'remote' ? 'EL-REMOTE' : null }), { status: 200 }));
    }
    if (String(input).includes('/rooms/join')) return Promise.resolve(new Response(JSON.stringify({ participant_id: 1, room_id: 1, room_code: 'QA', accessibility_mode: JSON.parse(options.body).accessibility_mode, joined_at: new Date().toISOString() }), { status: 200 }));
    return originalFetch(input, options);
  };
  const NativeSocket = window.WebSocket;
  window.WebSocket = class extends NativeSocket {
    constructor(url, protocols) {
      if (String(url).includes('/ws/rooms/')) {
        const socket = { readyState: 0, send() {}, close() { this.readyState = 3; }, addEventListener() {}, removeEventListener() {} };
        q.socket = socket;
        setTimeout(() => { socket.readyState = 1; socket.onopen?.(); }, 20);
        return socket;
      }
      super(url, protocols);
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
    keyboard.writeValueWithResponse = async bytes => { q.writes.push({ uuid: uuid(4), bytes: [...bytes] }); };
    const serial = { readValue: async () => {
      if (mode === 'silent-drop') device.gatt.connected = false;
      return new DataView(new TextEncoder().encode('EL-0427').buffer);
    } };
    const service = { getCharacteristic: async id => {
      q.stages.push('characteristic:' + id);
      if (id === uuid(2)) return text;
      if (id === uuid(3) && mode !== 'status-missing') return state;
      if (id === uuid(4) && mode === 'keyboard') return keyboard;
      if (id === uuid(5) && ['keyboard', 'silent-drop'].includes(mode)) return serial;
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
