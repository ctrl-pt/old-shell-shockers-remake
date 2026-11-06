/* Connection and invitation helpers shared by the public website and local host. */
(function (root) {
  function backendUrl(value, securePage) {
    if (!value) return '';
    var url = new URL(value);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Invalid multiplayer server address');
    if (securePage && url.protocol !== 'wss:') throw new Error('This page needs a secure wss:// multiplayer server');
    return url.href;
  }
  function gameCode(server, id, key) {
    if (![server, id, key].every(Number.isInteger) || server < 0 || server > 35 || id < 1 || id > 46655 || key < 0 || key > 1295) throw new Error('Invalid room code');
    return server.toString(36) + id.toString(36).padStart(3, '0') + key.toString(36).padStart(2, '0');
  }
  function inviteUrl(page, backend, code, mode) {
    var url = new URL(page);
    url.search = ''; url.hash = code || '';
    if (backend) url.searchParams.set('server', backendUrl(backend, url.protocol === 'https:'));
    if ([0, 1, 2].includes(mode)) url.searchParams.set('mode', String(mode));
    return url.href;
  }
  root.shellNetwork = { backendUrl: backendUrl, gameCode: gameCode, inviteUrl: inviteUrl };
})(globalThis);
