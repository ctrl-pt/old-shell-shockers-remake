/* Compatibility for the retired commercial services. No external accounts or tracking. */
var version = '0.20.1-era';
var firebase = null;
var isFromEU = false;
var noAdBlock = true;
var ga = function () {};
var fbq = function () {};
var OneSignal = [];
var aiptag = { cmd: { player: [], display: [] }, consented: false };
var aipPlayer = function () {};
var googletag = { cmd: [] };
var useAdManager = false;
var s2019Params = new URLSearchParams(location.search);
var parsedUrl = { root: location.origin + location.pathname, hash: location.hash.slice(1) || undefined, query: {} };
for (const [key, value] of s2019Params) parsedUrl.query[key] = value === '' ? true : !isNaN(value) ? Number(value) : value;
var uuid = 255;
var s2019Backend = s2019Params.get('server') || localStorage.getItem('shell2019.server') || '';
var s2019Practice = s2019Params.has('practice') || (!s2019Backend && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname));
localStorage.setItem('lastVersionPlayed', version);
if (!localStorage.getItem('gameType')) localStorage.setItem('gameType', '0');
if (!localStorage.getItem('lastUsername')) localStorage.setItem('lastUsername', 'Player');
if (s2019Practice) {
  window.WebSocket = class PreservationSocket {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3;
    readyState = 0;
    constructor(url) {
      this.url = url;
      setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 0);
    }
    send(data) {
      const bytes = new Uint8Array(data);
      if (bytes[0] === 16) {
        setTimeout(() => this.deliver(new Uint8Array([16])), 0);
        return;
      }
      if (!this.session && bytes[0] === 15) {
        this.pending = window.getPreservationRoom(bytes).then(({ room, session }) => {
          if (this.readyState !== 1) return;
          this.room = room; this.session = session;
          session.socket = { send: payload => this.deliver(payload), close: (code, reason) => this.close(code, reason) };
          room.join(session);
        }).catch(error => { console.error(error); this.onerror?.(error); this.close(1011, error.message); });
      } else if (this.pending) this.pending.then(() => { if (this.session) this.room.receive(this.session, bytes); });
    }
    deliver(data) {
      if (this.readyState !== 1) return;
      const copy = new Uint8Array(data);
      setTimeout(() => this.onmessage?.({ data: copy.buffer }), 0);
    }
    close(code = 1000, reason = '') {
      if (this.readyState === 3) return;
      this.readyState = 3;
      if (this.session) this.room?.leave(this.session);
      setTimeout(() => this.onclose?.({ code, reason }), 0);
    }
  };
  window.getPreservationRoom = async bytes => {
    if (!window.preservationModules) window.preservationModules = Promise.all([
      import('./room.mjs'), import('./world.mjs'), new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = 'src/headless.js';
        script.onload = resolve; script.onerror = reject; document.head.append(script);
      }),
    ]);
    const [{ Room, readJoin }, { buildWorld }] = await window.preservationModules;
    const core = window.createShellCore();
    const request = readJoin(core, bytes);
    const mapIndex = request.joinType === 23 ? request.mapIndex : Math.floor(Math.random() * core.minMaps.length);
    const model = await fetch('models/map.babylon').then(r => r.json());
    const world = await buildWorld(core, mapIndex, model);
    const room = new Room(core, world, { id: 1, key: 1, mapIndex, mode: request.mode, bots: 5 });
    const session = room.makeSession(request);
    return { room, session };
  };
}
