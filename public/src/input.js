/* Input ownership is independent of Pointer Lock: embedded browsers may refuse it. */
(function (root) {
  function keyName(event) {
    if (event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space') return 'SPACE';
    if (event.key && event.key !== 'Unidentified') return event.key.toUpperCase();
    return (event.code || '').replace(/^Key|^Digit/, '').toUpperCase();
  }
  function editable(target) {
    return target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '');
  }
  root.createShellInput = function (adapter, environment = root) {
    const doc = environment.document;
    const held = new Map();
    let canvas, active = false, fallback = false, lastPointer = null, nativeCapture;
    let fallbackNotified = false;
    const ready = () => active && adapter.canControl();
    const consume = event => { event.preventDefault?.(); event.stopImmediatePropagation?.(); };
    function publish() {
      if (!canvas) return;
      const player = adapter.getPlayer();
      const state = player ? { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch,
        keys: player.controlKeys, playing: player.playing ? 1 : 0 } : {};
      state.active = ready() ? 1 : 0;
      for (const [name, value] of Object.entries(state)) {
        const text = typeof value === 'number' ? String(Math.round(value * 1e6) / 1e6) : String(value);
        const key = 'player' + name[0].toUpperCase() + name.slice(1);
        if (canvas.dataset[key] !== text) canvas.dataset[key] = text;
      }
    }
    function down(name) {
      const action = adapter.getBindings()[name];
      if (!action) return false;
      if (!held.has(name)) { held.set(name, action); adapter.action(action, true); }
      publish(); return true;
    }
    function up(name) {
      const action = held.get(name);
      if (!action) return false;
      held.delete(name); adapter.action(action, false); publish(); return true;
    }
    function clear() {
      for (const action of held.values()) adapter.action(action, false);
      held.clear(); adapter.clear(); lastPointer = null; publish();
    }
    function focus() { canvas?.focus({ preventScroll: true }); }
    function activate() {
      if (!adapter.getPlayer()?.playing) return;
      active = true; adapter.showGame(); focus(); publish();
      if (fallback && !fallbackNotified) {
        fallbackNotified = true; adapter.onFallback?.();
      }
    }
    function unavailable() { fallback = true; if (!active) activate(); }
    function requestCapture() {
      if (!nativeCapture) { unavailable(); return; }
      try { const pending = nativeCapture(); pending?.catch(unavailable); }
      catch { unavailable(); }
    }
    function keyDown(event) {
      if (!ready() || editable(event.target)) return;
      if (event.key === 'Escape') {
        consume(event); active = false; clear(); adapter.pause();
        if (doc.pointerLockElement) doc.exitPointerLock?.();
        return;
      }
      if (down(keyName(event))) consume(event);
    }
    function keyUp(event) { if (up(keyName(event))) consume(event); }
    function mouseDown(event) {
      if (!ready()) return;
      focus(); lastPointer = { x: event.clientX, y: event.clientY };
      down('MOUSE ' + event.button); consume(event);
    }
    function mouseUp(event) { if (up('MOUSE ' + event.button)) consume(event); }
    function mouseMove(event) {
      if (!ready()) { lastPointer = null; return; }
      let dx = 0, dy = 0;
      if (doc.pointerLockElement === canvas) {
        dx = event.movementX || 0; dy = event.movementY || 0;
      } else if (lastPointer) {
        dx = event.clientX - lastPointer.x; dy = event.clientY - lastPointer.y;
      }
      lastPointer = { x: event.clientX, y: event.clientY };
      if (Number.isFinite(dx) && Number.isFinite(dy)) adapter.look(dx, dy);
      publish(); consume(event);
    }
    function wheel(event) {
      if (!ready()) return;
      const name = event.deltaY < 0 ? 'WHEEL UP' : 'WHEEL DOWN';
      down(name); up(name); consume(event);
    }
    doc.addEventListener('keydown', keyDown, true);
    doc.addEventListener('keyup', keyUp, true);
    doc.addEventListener('mouseup', mouseUp, true);
    doc.addEventListener('focusin', event => { if (editable(event.target)) clear(); });
    doc.addEventListener('pointerlockerror', unavailable);
    doc.addEventListener('pointerlockchange', () => {
      if (doc.pointerLockElement === canvas) { fallback = false; activate(); }
      else if (!fallback && active) { active = false; clear(); adapter.pause(); }
    });
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) clear(); });
    environment.addEventListener('blur', clear);
    return {
      activate, publish, requestCapture, clear,
      bind(element) {
        if (canvas === element) return;
        canvas = element; canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', 'Game view');
        nativeCapture = canvas.requestPointerLock?.bind(canvas);
        canvas.requestPointerLock = requestCapture;
        canvas.addEventListener('mousedown', mouseDown, true);
        canvas.addEventListener('mousemove', mouseMove, true);
        canvas.addEventListener('wheel', wheel, { capture: true, passive: false });
        canvas.addEventListener('mouseleave', () => { lastPointer = null; });
        publish();
      },
    };
  };
})(globalThis);
