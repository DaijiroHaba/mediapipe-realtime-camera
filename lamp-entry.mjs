import {mountLampGame} from './lamp-ui.mjs?v=0.6.0';
mountLampGame({standalone:true});
const viewer=document.getElementById('viewer'),button=document.getElementById('fullscreen');
button.addEventListener('click',async()=>{
 try{if(document.fullscreenElement)await document.exitFullscreen();else await viewer.requestFullscreen();}
 catch{document.getElementById('lampStatus').textContent='全画面表示を利用できません。Chrome / Edgeで画面を広げてください。';}
});
document.addEventListener('fullscreenchange',()=>{button.textContent=document.fullscreenElement?'全画面を終了':'全画面表示';button.setAttribute('aria-pressed',String(!!document.fullscreenElement));});

