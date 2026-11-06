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
  var preservationDragLook=false;
  var originalMouseMove=onCanvasMouseMove;
  onCanvasMouseMove=function(event){
    if(!preservationDragLook || document.pointerLockElement){originalMouseMove(event);return}
    if(me&&me.playing&&event.buttons){var mult=.0005*settings.mouseSensitivity+.001;
      if(me.actor.scope)mult*=.3;me.yaw=Math.radAdd(me.yaw,event.movementX*mult);
      me.pitch=Math.clamp(me.pitch+event.movementY*settings.mouseInvert*mult,-1.5,1.5)}
  };
  function enterDragLook(){
    if(!me)return;preservationDragLook=true;
    document.getElementById('gameMenu').style.display='none';
    document.getElementById('deathBox').style.display='none';
    document.getElementById('weaponBox').style.display='block';
    document.getElementById('health').style.display='block';
    document.getElementById('killTicker').style.display='block';
    document.getElementById('playerList').style.display='block';
    document.getElementById('cornerButtons').style.display='none';
    doFirstPersonCamera();reticle.show();addCanvasListeners();
    notify('Mouse capture is unavailable here. Hold a mouse button and drag to look. Press Escape for the menu.',6000);
  }
  document.addEventListener('pointerlockerror',enterDragLook);
`);
const originalLoad = window.onload;
window.onload = function (event) {
  originalLoad?.call(window, event);
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
