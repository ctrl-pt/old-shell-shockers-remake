var servicesServer = 'ws://127.0.0.1:3000/services';
var servers = [{ name: s2019Practice ? 'Practice · May 2019' : 'Preservation server', id: 0 }];
function getGameServerUrl() {
  return s2019Backend || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/game');
}
