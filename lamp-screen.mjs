// @ts-check
/** Fullscreen presentation only. Keep the original controls/settings and their event handlers. */
export function mountLampScreen({viewer,panel,settings,onChange,onOpen}){
 const top=document.createElement('div');top.id='lampTop';
 const board=panel.querySelector('#lampBoard');
 while(panel.firstChild&&panel.firstChild!==board)top.append(panel.firstChild);
 panel.prepend(top);
 const controls=top.querySelector('.lamp-controls');
 const menu=document.createElement('button');menu.id='lampScreenMenu';menu.textContent='設定・案内';
 const resultButton=document.createElement('button');resultButton.id='lampScreenResult';resultButton.textContent='成績';
 const exit=document.createElement('button');exit.id='lampScreenExit';exit.textContent='全画面を終了';
 controls.append(menu,resultButton,exit);
 const hud=document.createElement('div');hud.id='lampScreenHud';hud.setAttribute('role','status');panel.append(hud);
 const drawer=document.createElement('div');drawer.id='lampScreenDrawer';drawer.hidden=true;drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-label','ゲーム設定・成績');
 const closeButton=document.createElement('button');closeButton.textContent='閉じてランプ画面へ';closeButton.id='lampScreenClose';drawer.append(closeButton);
 const settingsPane=document.createElement('div'),resultsPane=document.createElement('div');drawer.append(settingsPane,resultsPane);viewer.append(drawer);
 const originals=[settings,panel.querySelector('#lampResults'),panel.querySelector('.lamp-diagnostics'),panel.querySelector('#lampLayout')];
 const homes=originals.map(node=>{const marker=document.createComment('fullscreen return');node.before(marker);return {node,marker};});
 let active=false,full=false,previousState='',returnFocus=null;
 function close(){drawer.hidden=true;panel.inert=false;if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;}
 function open(mode){if(!full)return;onOpen();returnFocus=document.activeElement;settingsPane.hidden=mode!=='settings';resultsPane.hidden=mode!=='results';drawer.hidden=false;panel.inert=true;closeButton.focus();}
 function sync(){
  const next=active&&document.fullscreenElement===viewer;
  if(next===full)return;full=next;close();viewer.classList.toggle('lamp-screen',full);viewer.scrollTop=0;
  if(full){settingsPane.append(originals[0],originals[2],originals[3]);resultsPane.append(originals[1]);}
  else for(const {node,marker}of homes)marker.after(node);
  previousState='';onChange();
 }
 menu.onclick=()=>open('settings');resultButton.onclick=()=>open('results');closeButton.onclick=close;
 exit.onclick=()=>{if(document.fullscreenElement===viewer)void document.exitFullscreen();};
 for(const id of ['lampPractice','lampStart'])panel.querySelector('#'+id).addEventListener('click',close);
 document.addEventListener('fullscreenchange',sync);
 drawer.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const nodes=Array.from(drawer.querySelectorAll('button,input,select,summary,a[href]'),n=>/** @type {any} */(n)).filter(n=>!n.disabled&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});
 return {setActive(value){active=value;sync();},update({state,score,remaining,practice,tracking,hasResult,inputHint}){resultButton.disabled=!hasResult;const text=`${practice?'練習':`残り ${remaining.toFixed(1)}秒`}｜${score}点｜${state==='paused'?'一時停止':!tracking&&['countdown','playing'].includes(state)?'入力待ち・時計停止｜'+inputHint:tracking?'指先操作中':inputHint||'待機'}`;if(hud.textContent!==text)hud.textContent=text;if(full&&state==='ended'&&previousState!=='ended'&&hasResult)open('results');previousState=state;}};
}
