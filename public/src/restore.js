/* Changes are confined to retired services and preservation quality-of-life. */
shell2019.run(`
  fetchTwitchStreams=function(){};
  fetchHouseAds=function(){houseAds={big:[],small:[],houseAdPercentChance:0};houseAdsLoaded=true};
  loadBannerAd=function(){};loadMultisizeAd=function(){};loadSmallAd=function(){};
  loadBigAd=function(){};hideMultisizeBannerAd=function(){};
  playVideoAd=function(){joinGame()};
  listenForOneSignalNotifications=function(){};sendOneSignalTags=function(){};
  selectedServer=0;
  playerAccount.hideAds=true;
  if(s2019Practice)inviteFriends=function(){notify('Practice runs in this browser. For shared games, run or connect to the included multiplayer server.',6000)};
  window.preservationControls=window.createShellInput({
    getPlayer:function(){return me},
    getBindings:function(){return inputToControlMap||{}},
    canControl:function(){return !!(me&&me.playing&&!chatting&&inGame&&
      document.getElementById('gameMenu').style.display==='none'&&
      document.getElementById('settingsContainer').style.display!=='block'&&
      document.getElementById('alert').style.display!=='block')},
    action:function(control,pressed){
      if(!me)return;
      if(CONTROL[control]&&control!=='fire'&&control!=='jump'){
        if(pressed)me.controlKeys|=CONTROL[control];else me.controlKeys&=~CONTROL[control];
        me.stateBuffer[me.stateIdx].controlKeys=me.controlKeys;return;
      }
      if(control==='jump'&&pressed&&me.playing&&me.jump()){
        var message=new Comm.output(1);message.packInt8(CommCode.jump);ws.send(message.buffer);
      }else if(control==='fire'){if(pressed)me.pullTrigger();else me.releaseTrigger()}
      else if(control==='scope'){
        if(pressed){if(settings.holdToAim||!me.actor.scope)me.actor.scopeIn();else me.actor.scopeOut()}
        else if(settings.holdToAim)me.actor.scopeOut();
      }else if(control==='reload'&&pressed)me.reload();
      else if(control==='weapon'&&pressed)me.swapWeapon(me.weaponIdx===0?1:0);
      else if(control==='grenade'){
        if(pressed&&!grenadePowerUp&&me.canSwapOrReload()&&me.grenadeCount>0){grenadePowerUp=true;grenadeThrowPower=-.15}
        else if(!pressed&&grenadePowerUp){grenadePowerUp=false;document.getElementById('grenadeThrowContainer').style.visibility='hidden';me.throwGrenade(grenadeThrowPower)}
      }
    },
    clear:function(){if(me){me.controlKeys=0;me.releaseTrigger()}grenadePowerUp=false;lastKey=null},
    look:function(dx,dy){
      if(!me)return;var sensitivity=.0005*settings.mouseSensitivity+.001;
      if(me.actor.scope)sensitivity*=.3;
      me.yaw=Math.radAdd(me.yaw,dx*sensitivity);
      me.pitch=Math.clamp(me.pitch+dy*settings.mouseInvert*sensitivity,-1.5,1.5);
    },
    showGame:function(){
      document.getElementById('gameMenu').style.display='none';
      document.getElementById('deathBox').style.display='none';
      document.getElementById('weaponBox').style.display='block';
      document.getElementById('health').style.display='block';
      document.getElementById('killTicker').style.display='block';
      document.getElementById('playerList').style.display='block';
      document.getElementById('cornerButtons').style.display='none';
      doFirstPersonCamera();reticle.show();addCanvasListeners();
    },
    pause:function(){showGameMenu()},
    onFallback:function(){notify('Move the mouse over the game to look. Press Escape for the menu.',5000)}
  });
  var archivedRespawn=Player.prototype.respawn;
  Player.prototype.respawn=function(x,y,z){archivedRespawn.call(this,x,y,z);if(this.id===meId)window.preservationControls.activate()};
  var archivedUpdateLogic=updateLogic;
  updateLogic=function(){
    archivedUpdateLogic();window.preservationControls.publish();
    // Opt-in QA reads completed render transforms, without forcing a matrix update.
    if(typeof parsedUrl!=='undefined'&&parsedUrl.query.diagnostics&&gameScene&&!gameScene.preservationDiagnostics){
      gameScene.preservationDiagnostics=true;
      gameScene.onAfterRenderObservable.add(function(){
        function point(v){return {x:v.x,y:v.y,z:v.z}}
        canvas.dataset.renderState=JSON.stringify({
          frame:gameScene.getRenderId(),camera:point(camera.globalPosition),
          players:players.filter(function(p){return p&&p.actor}).map(function(p){
            var a=p.actor;
            return {id:p.id,local:p.id===meId,playing:p.playing,position:point(p),
              root:point(a.mesh.position),body:point(a.bodyMesh.getWorldMatrix().getTranslation()),
              eye:point(a.eye.getWorldMatrix().getTranslation()),
              name:a.nameSprite?point(a.nameSprite.position):null,
              visibleScene:a.mesh.getScene()===gameScene&&a.head.getScene()===gameScene&&a.eye.getScene()===gameScene};
          })
        });
      });
    }
  };
`);
const archivedPlay = extern.respawn;
extern.respawn = function () {
  if (shell2019.getState().me?.playing) { window.preservationControls.activate(); window.preservationControls.requestCapture(); }
  else archivedPlay();
};
const originalLoad = window.onload;
window.onload = function (event) {
  originalLoad?.call(window, event);
  shell2019.run(`if(canvas)window.preservationControls.bind(canvas)`);
  const footer = document.getElementById('footerlinks');
  if (footer) {
    const link = document.createElement('a'); link.href = '/preservation.html'; link.target = '_blank';
    link.textContent = ' · May 2019 preservation'; footer.append(link);
  }
  const balance = document.getElementById('currentBalanceContainer');
  if (balance) balance.title = 'Progress is saved on this browser';
};
extern.openLoginDialog = function () {
  shell2019.run(`openAlertDialog('Local profile','Your loadout and settings are saved on this browser. Original online accounts and purchases are unavailable in this preservation.',{label:'OK',onclick:closeAlertDialog})`);
};
for (const action of ['showBuyEggs','openBuyPassDialog','buyChickenNuggetProduct']) {
  extern[action] = function () { shell2019.run(`openAlertDialog('Preservation edition','The 2019 shop is preserved for reference. Real purchases are disabled.',{label:'OK',onclick:closeAlertDialog})`); };
}
window.addEventListener('pagehide', () => {
  try {
    const state = shell2019.getState().playerAccount;
    localStorage.setItem('shell2019.loadout', JSON.stringify({ classIdx: state.classIdx, colorIdx: state.colorIdx,
      primaryIds: state.pickedWeapons.map(pair => pair[0].id), secondaryIds: state.pickedWeapons.map(pair => pair[1].id),
      hatId: state.hatItem?.id, stampId: state.stampItem?.id }));
  } catch {}
});
shell2019.run(`
  try { var saved=JSON.parse(localStorage.getItem('shell2019.loadout'));
    if(saved){playerAccount.setClass(saved.classIdx);playerAccount.colorIdx=saved.colorIdx||0;
      saved.primaryIds.forEach(function(id,c){var item=catalog.findItemById(id);if(item)playerAccount.pickedWeapons[c][0]=item});
      saved.secondaryIds.forEach(function(id,c){var item=catalog.findItemById(id);if(item)playerAccount.pickedWeapons[c][1]=item});
      playerAccount.hatItem=catalog.findItemById(saved.hatId);playerAccount.stampItem=catalog.findItemById(saved.stampId);
    }
  }catch(e){console.warn('Stored loadout could not be read',e)}
`);
