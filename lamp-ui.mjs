// @ts-check
import {LampGame,GAME_VERSION} from './lamp-game.mjs?v=0.5.5';
import {FingerTracker,fingerObservations,selectOneCursor} from './lamp-tracker.mjs?v=0.5.5';
import {LampPerformance} from './lamp-performance.mjs?v=0.5.5';
import {CameraLease} from './camera-lease.mjs';
import {mapCursor,mouseCursor,viewTransform} from './lamp-input.mjs?v=0.5.5';
import {mountResults} from './lamp-result-ui.mjs?v=0.5.5';
import {mountLampScreen} from './lamp-screen.mjs?v=0.5.5';
const $=id=>/** @type {any} */(document.getElementById(id));
const showText=(n,v)=>{if(n.textContent!==v)n.textContent=v;};
const MAX_RESULT_AGE_MS=200; // engineering freshness limit; not a clinical threshold
export function mountLampGame({standalone=false}={}){
 const viewer=$('viewer'),aside=document.querySelector('aside');
 const panel=document.createElement('section');panel.id='lampPanel';panel.hidden=true;
 panel.innerHTML=`<p class="lamp-intro">両人差し指ランプ消灯デモ ${GAME_VERSION}｜まず座位で、無理なく届く配置を確認してください</p>
 <div class="lamp-controls"><button id="lampPrepare">準備</button><button id="lampPractice">練習</button><button id="lampStart" class="primary">30秒を開始</button><button id="lampPause">一時停止</button><button id="lampResume">再開</button><button id="lampEnd">終了</button><button id="lampStop">停止・カメラ終了</button><button id="lampReset">リセット</button></div>
 <label id="lampStandingLabel" class="check" hidden><input id="lampStandingReady" type="checkbox"><span id="lampStandingText">立位：足を動かさず届く配置・姿勢・周囲・必要時の見守りを確認</span></label>
 <p id="lampReadyStatus" class="lamp-ready-status" role="status"></p><div id="lampLayoutActions" class="lamp-controls" hidden><button id="lampTryGrid">同じ個数で整列に変更</button><button id="lampTryFewer">12個に変更</button></div>
 <p id="lampStatus" role="status">マウスでも操作できます。まず準備を押してください。</p>
 <div id="lampBoard" class="lamp-board" tabindex="0" aria-label="人差し指カーソルの中心が点灯円へ外から入ると消灯します"><video id="lampVideo" playsinline muted aria-hidden="true"></video><div id="lampBottomBand" aria-hidden="true"><span>手が映るための下の余白</span></div><div id="lampTargets"></div><div id="lampCursor1" class="lamp-cursor" hidden></div><div id="lampCursor2" class="lamp-cursor second" hidden></div><div id="lampCue" class="lamp-cue" role="status" aria-live="polite" hidden><strong id="lampCueText"></strong></div></div>
 <p id="lampInputStatus" class="lamp-input-status" role="status"><span id="lampInputHint"></span><small id="lampCueHold"></small></p><p id="lampLayout" class="lamp-layout" role="status"></p><div class="lamp-metrics" id="lampMetrics"></div>
 <section id="lampResults" class="lamp-results" hidden></section>
 <details class="lamp-diagnostics" open><summary>処理の速さ（端末内で計測）</summary><p id="lampPerformance"></p><p class="note">撮影・モニター表示を含む全遅延ではありません。解析fpsと指先の揺れを併せて確認してください。</p></details>
 <p class="note">操作は映像上の2D進入です。応答時間は機器・推論・表示・移動・平滑化の遅延を含み、停止期間を除きます。反射神経・看護能力・診断・治療効果の尺度ではありません。手の対応が曖昧な間は採点を止め、全手が使えない間は時計・出題・失効も止めます。</p>`;
 viewer.append(panel);
 const settings=document.createElement('section');settings.id='lampSettings';settings.hidden=true;
 settings.innerHTML=`<h2>ランプゲーム設定</h2>
 <label>操作入力<select id="lampInput"><option value="mouse">マウス（カメラ不要）</option><option value="hand">両人差し指（カメラ）</option></select></label>
 <label>カメラ<select id="lampCamera"><option value="">既定のカメラ</option></select></label><button id="lampRefresh">カメラ一覧を更新</button>
 <label>使用する手<select id="lampHands"><option value="both">両手</option><option value="one">片手（カーソル1個）</option></select></label>
 <label>配置するランプ<select id="lampCount"><option value="30">30個（6列×5行）</option><option value="50">50個（10列×5行）</option><option value="12">12個（4列×3行）</option><option value="6">6個（3列×2行）</option></select></label>
 <label>下側のランプ余白 <output id="lampBottomValue">16%</output><input id="lampBottomReserve" type="range" min="0" max="35" step="1" value="16"></label><p class="note">下端のランプに指先を合わせたとき、手首が撮影範囲から出ないための余白です。16%は実装上の仮設定です。カメラ位置と手の大きさに合わせて準備中に調整してください。指先カーソルや映像の位置は変えません。</p>
 <label>配置方式<select id="lampPlacement"><option value="grid">整列</option><option value="random">ランダム（開始時に固定）</option></select></label><label>配置seed（空欄＝毎回生成）<input id="lampSeed" type="number" min="0" max="4294967295" step="1" placeholder="検証時だけ数値を指定"></label><label>姿勢<select id="lampPosture"><option value="seated">座位（初期設定）</option><option value="standing">立位・足位置固定</option><option value="stepping">立位・移動あり（全身で操作）</option></select></label>
 <p id="lampSafety" class="note">安定した椅子で、無理なく届く範囲を準備で調整してください。痛みや疲れがあれば中止してください。</p>
 
 <label>点灯方式<select id="lampPattern"><option value="sequential">基本：1つずつ</option><option value="timed">定期：上限1〜4個</option></select></label>
 <label>レベル（新点灯の間隔）<select id="lampLevel"><option value="3">ゆっくり：3秒</option><option value="2" selected>標準：2秒</option><option value="1.25">速め：1.25秒</option><option value=".5">0.5秒</option><option value=".25">0.25秒</option></select></label>
 <label>点灯の失効時間<select id="lampLifetime"><option value="1">1秒</option><option value="2">2秒</option><option value="4">4秒</option><option value="6" selected>6秒</option><option value="10">10秒</option></select></label>
 <label>同時点灯数の上限<select id="lampMax"><option value="1">1個</option><option value="2" selected>2個</option><option value="3">3個</option><option value="4">4個</option></select></label>
 <label>映像と操作点<select id="lampMapMode"><option value="image">通常：映像全体と指先を一致</option><option value="comfortable">座位補助：映像と指先を一緒に拡大</option></select></label><label>指先の平滑化<select id="lampSmoothing"><option value="off">なし（既定・直接追従）</option><option value="light">軽い平滑化（揺れ軽減・追従遅れあり）</option></select></label><p class="note">全画面では映像と指先を同じ比率で拡大し、画面に合わない部分を切り抜きます。切り抜き外の手では採点しません。座位補助は映像の一部も同じように拡大します。少ない動きで届く場合がありますが、カメラ位置に依存し、切り抜き外の指は画面に表示されません。カメラには映る位置で、拡大範囲を調整してください。</p><div id="lampCropSettings" hidden><label>座位補助の拡大範囲・横幅<input id="lampWidth" type="range" min="18" max="80" value="48"></label><label>座位補助の拡大範囲・縦幅<input id="lampHeight" type="range" min="15" max="80" value="46"></label>
 <label>拡大範囲の左右<input id="lampCx" type="range" min="25" max="75" value="50"></label><label>拡大範囲の上下<input id="lampCy" type="range" min="30" max="70" value="56"></label>
 </div><label class="check"><input id="lampMirror" type="checkbox" checked>手と映像を左右反転</label><label class="check"><input id="lampPreview" type="checkbox" checked>カメラのライブ映像を重ねる</label>
 <details><summary>速さの比較設定</summary><label>解析の目標頻度<select id="lampFps"><option value="30">30 fps（目標）</option><option value="15">15 fps（比較用）</option></select></label>
 <label>カメラ要求解像度<select id="lampResolution"><option value="960x540">960×540（基本）</option><option value="640x360">640×360（速度比較）</option><option value="1280x720">1280×720（画質比較）</option></select></label>
 <label>解析エンジン<select id="lampDelegate"><option value="auto">GPU優先・失敗時CPU</option><option value="CPU">CPU（比較用）</option></select></label><p class="note">基本は960×540・目標30fps・平滑化なし。GPUとCPUの速さは端末で比較してください。設定は実施前に変更します。640×360は比較用で、指先の揺れや欠測が増える場合は基本へ戻してください。高fps・高解像度が精度の向上を保証するものではありません。</p></details>
 <p class="note">両人差し指をカメラに見せ、点灯円の外から入れてください。円内への進入が当たり範囲です。指先を検出できないときに掌へ自動切替しません。先端の点が操作点です。番号1／2と丸／三角は追跡用で、本人の左右ではありません。録画・ランドマーク保存・外部送信はありません。結果CSVは本人が保存を押した場合だけ出力します。</p>`;
 aside.append(settings);
 const board=$('lampBoard'),video=$('lampVideo'),game=new LampGame(),tracker=new FingerTracker(),perf=new LampPerformance();
 const results=mountResults($('lampResults'));
 for(let i=1;i<=2;i++)$(`lampCursor${i}`).innerHTML=`<svg aria-hidden="true" viewBox="-10 -10 42 46"><path class="pointer-hand" d="M-3 6V0Q-3-4 0-4T3 0V13L5 10Q7 8 9 11L11 10Q14 9 15 12L17 12Q21 13 21 18L20 27Q19 32 15 32H8Q5 32 3 28L-4 17Q-6 13-3 12L1 17V6Z"/>${i===1?'<circle class="tip-dot" cx="0" cy="0" r="4"/>':'<path class="tip-dot" d="M0-5L5 4H-5Z"/>'}<circle class="tip-center" cx="0" cy="0" r="1"/></svg><span class="cursor-number">${i}</span><span class="cursor-hold">保留</span>`;
 let deviceRequest=0;
 let active=false,prepared=false,stream=null,worker=null,generation=0,busy=false,raf=null,videoCallback=null,pendingCancel=null,watchdog=null;
 let lastCapture=-Infinity,lastVideo=-1,lastObservedVideo=-1,latestFrameTime=-1,lastHands=-Infinity,lastSubmitted=0,cursors=[],mouse=null,firstHand=null;
 let sourceTracks=[],observationReasons=[],videoTransformKey='';
 let connecting=false,cameraReady=false,cameraText='停止中',trackingText='マウス待機',lastSlow=-Infinity,layoutKey='',targetNodes=[],slots=[null,null],wasLocked=false;
 const nowMs=()=>performance.now(),time=()=>nowMs()/1000,size=()=>{const r=board.getBoundingClientRect();return {w:r.width-2*board.clientLeft||960,h:r.height-2*board.clientTop||540};};
 const config=()=>({mirror:$('lampMirror').checked,smoothing:$('lampSmoothing').value==='light',placement:$('lampPlacement').value,seed:$('lampSeed').value===''?-1:Number($('lampSeed').value),mapMode:$('lampMapMode').value,posture:$('lampPosture').value==='seated'?'seated':'standing',movementMode:$('lampPosture').value==='stepping'?'stepping':'fixed',bottomReserve:Number($('lampBottomReserve').value)/100,pattern:$('lampPattern').value,lampCount:Number($('lampCount').value),interval:Number($('lampLevel').value),lifetime:Number($('lampLifetime').value),maxActive:Number($('lampMax').value),width:Number($('lampWidth').value)/100,height:Number($('lampHeight').value)/100,cx:Number($('lampCx').value)/100,cy:Number($('lampCy').value)/100});
 const isScreen=()=>active&&document.fullscreenElement===viewer;
 const viewConfig=()=>({...game.config,displayFit:isScreen()?'cover':'contain'});
 const resetGame=()=>{const {w,h}=size();if(game.record&&!game.record.closed)game.finish(time(),'reset_canceled');game.reset(config(),w,h);layoutKey='';};
 const setStatus=s=>showText($('lampStatus'),s);
 const lease=new CameraLease(()=>{game.pause(time(),'camera_lease');releaseCamera();setStatus('別の画面でカメラを開始したため停止しました。');render(true);});
 const lockedIds=['lampInput','lampSmoothing','lampCount','lampPlacement','lampSeed','lampBottomReserve','lampMapMode','lampPosture','lampPattern','lampLevel','lampLifetime','lampMax','lampWidth','lampHeight','lampCx','lampCy','lampHands','lampMirror','lampCamera','lampStandingReady','lampFps','lampResolution','lampDelegate','lampRefresh'];
 function releaseCamera(){
  game.record?.closeQuality(time());generation++;connecting=false;cameraReady=false;pendingCancel?.();pendingCancel=null;clearTimeout(watchdog);watchdog=null;
  if(videoCallback!==null&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(videoCallback);videoCallback=null;
  worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;
  busy=false;sourceTracks=[];observationReasons=[];lastHands=-Infinity;lastCapture=-Infinity;lastVideo=-1;lastObservedVideo=-1;latestFrameTime=-1;cursors=[];slots=[null,null];tracker.reset();firstHand=null;cameraText='停止中';lease.release();
 }
 async function refreshCameras(){
  if(!navigator.mediaDevices?.enumerateDevices)return;
  const request=++deviceRequest,token=generation;
  try{const selected=$('lampCamera').value,devices=await navigator.mediaDevices.enumerateDevices();
   if(!active||request!==deviceRequest||token!==generation)return;
   $('lampCamera').replaceChildren(new Option('既定のカメラ',''));devices.filter(d=>d.kind==='videoinput').forEach((d,i)=>$('lampCamera').add(new Option(d.label||`カメラ ${i+1}（接続後に名称表示）`,d.deviceId)));
   if([...$('lampCamera').options].some(o=>o.value===selected))$('lampCamera').value=selected;
  }catch{if(active&&request===deviceRequest&&token===generation)setStatus('カメラ一覧を取得できませんでした。既定のカメラで試してください。');}
 }
 async function sendFrame(stamp){
  const mediaTime=video.requestVideoFrameCallback?latestFrameTime:video.currentTime;
  if(!active||!cameraReady||!worker||!stream||busy||video.readyState<2||mediaTime<0||mediaTime===lastVideo)return;
  if(stamp-lastCapture<1000/Number($('lampFps').value)-2)return;
  const token=generation;busy=true;lastCapture=stamp;lastSubmitted=stamp;lastVideo=mediaTime;perf.submit(stamp);
  try{
   const bitmap=await createImageBitmap(video);
   // releaseCamera owns generation changes and resets busy; this bitmap belongs to the old camera.
   if(token!==generation||!worker){bitmap.close();return;}
   clearTimeout(watchdog);watchdog=setTimeout(()=>{if(token===generation){game.pause(time(),'analysis_timeout');releaseCamera();setStatus('解析が応答しないため停止しました。準備から再接続できます。');render(true);}},perf.samples.length?3000:15000);
   worker.postMessage({type:'frame',bitmap,time:stamp,sourceMediaTime:mediaTime,bitmapMs:nowMs()-stamp},[bitmap]);
  }catch(e){if(token===generation){busy=false;game.input([],time(),size().w,size().h);setStatus('映像フレームを取得できませんでした。');}}
 }
 function pumpVideo(token){
  if(!video.requestVideoFrameCallback)return;
  videoCallback=video.requestVideoFrameCallback((stamp,metadata)=>{
   videoCallback=null;if(token!==generation||!cameraReady)return;
   latestFrameTime=Number.isFinite(metadata?.mediaTime)?metadata.mediaTime:video.currentTime;
   perf.cameraFrame(stamp);if(busy)perf.busySkipped++;else void sendFrame(nowMs());
   pumpVideo(token);
  });
 }
 async function camera(){
  if(worker&&stream&&cameraReady)return true;if(connecting)return false;
  releaseCamera();const token=generation;connecting=true;cameraText='接続・モデル準備中';perf.reset();lease.claim();
  setStatus('カメラを許可してください。マイクは使いません。');render(true);
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Chrome / EdgeでlocalhostまたはHTTPSから開いてください');
   const device=$('lampCamera').value||$('camera')?.value,[width,height]=$('lampResolution').value.split('x').map(Number);
   const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{...(device?{deviceId:{exact:device}}:{}),width:{ideal:width},height:{ideal:height},frameRate:{ideal:30}}});
   if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return false;}
   stream=acquired;video.srcObject=stream;await video.play();if(token!==generation)return false;
   const s=stream.getVideoTracks()[0].getSettings();perf.settings={width:s.width??video.videoWidth,height:s.height??video.videoHeight,frameRate:s.frameRate??null};
   updateVideoGeometry();
   stream.getVideoTracks()[0].addEventListener('ended',()=>{if(token===generation){game.pause(time(),'camera_ended');releaseCamera();setStatus('カメラ接続が終了しました。');render(true);}},{once:true});
   worker=new Worker(new URL('./lamp-worker.js',import.meta.url));const current=worker;
   await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('手モデルを30秒以内に準備できませんでした')),30000);
    pendingCancel=()=>{clearTimeout(timeout);reject(Error('準備を停止しました'));};
    current.onmessage=({data})=>{if(token!==generation)return;if(data.type==='ready'){clearTimeout(timeout);pendingCancel=null;perf.delegate=data.delegate;cameraText=`手推論 ${data.delegate}`;resolve(null);}else if(data.type==='error'){clearTimeout(timeout);pendingCancel=null;reject(Error(data.message));}};
    current.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};current.postMessage({type:'init',delegate:$('lampDelegate').value});
   });
   if(token!==generation)return false;
   current.onmessage=({data})=>{
    if(token!==generation)return;busy=false;clearTimeout(watchdog);watchdog=null;
    if(data.type==='error'){game.pause(time(),'analysis_error');releaseCamera();setStatus('手の解析が停止しました。マウス代替を利用できます。');render(true);return;}
    if(data.type!=='hands')return;
    const stamp=nowMs(),submittedAt=Number.isFinite(data.time)?data.time:lastSubmitted,accepted=stamp-submittedAt<=MAX_RESULT_AGE_MS;
    perf.consume({submittedAt,receivedAt:stamp,inferenceMs:data.inferenceMs,bitmapMs:data.bitmapMs,accepted});
    if(game.state==='playing')game.record?.sample({now:stamp/1000,inferenceMs:data.inferenceMs,softwareMs:stamp-submittedAt,accepted,delegate:perf.delegate});
    const {w,h}=size();
    if(!accepted){cursors=[];tracker.reset();game.input([],stamp/1000,w,h);trackingText='解析が遅れています・判定保留';lastHands=-Infinity;render(true);void sendFrame(nowMs());return;}
    lastHands=submittedAt/1000;
    const observation=fingerObservations(data,false);observationReasons=observation.reasons;
    let tracks=tracker.update(observation.points,stamp/1000,video.videoWidth/video.videoHeight,game.config.smoothing);
    if($('lampHands').value==='one'){const selected=selectOneCursor(tracks,firstHand);firstHand=selected.id;tracks=selected.cursors;}
    sourceTracks=tracks;updateMappedCursors();
    game.input(cursors,stamp/1000,w,h);
    // Apply the result now; do not add another RAF of cursor delay. No extrapolation.
    renderCursors();perf.cursorWritten(stamp,nowMs());
    // A newer camera frame may already exist while inference was busy.
    // sendFrame still enforces one in-flight frame, distinct mediaTime and target fps.
    void sendFrame(nowMs());
   };
   current.onerror=()=>{if(token===generation){game.pause(time(),'model_error');releaseCamera();setStatus('手モデルが停止しました。');render(true);}};
   cameraReady=true;connecting=false;game.record?.runtime(time(),perf.settings,perf.delegate);pumpVideo(token);void refreshCameras();
   setStatus('両人差し指をカメラに見せ、点灯円の外から入れてください。');render(true);return true;
  }catch(e){if(token===generation){releaseCamera();setStatus(`準備できませんでした：${e.message}。マウスでも操作できます。`);render(true);}return false;}
 }
 async function prepare(){
  if(connecting)return false;resetGame();prepared=false;mouse=null;sourceTracks=[];cursors=[];slots=[null,null];tracker.reset();firstHand=null;
  if($('lampInput').value==='hand'){if(!await camera())return false;}else{releaseCamera();board.style.aspectRatio='16 / 9';}
  resetGame();prepared=true;setStatus($('lampInput').value==='mouse'?'準備完了。マウスで配置を確認してください。':'指先カーソルと配置を確認してください。');render(true);return true;
 }
 function updateVideoGeometry(){
  const cfg=config(),f=cfg.mapMode==='comfortable'?{width:cfg.width,height:cfg.height}:{width:1,height:1};
  const aspect=(video.videoWidth||960)*f.width/((video.videoHeight||540)*f.height);
  board.style.aspectRatio=String(aspect);board.style.setProperty('--lamp-aspect',String(aspect));videoTransformKey='';
 }
 function updateMappedCursors(){
  const {w,h}=size();cursors=sourceTracks.map(t=>mapCursor(t,viewConfig(),w,h,video.videoWidth||960,video.videoHeight||540));
  const usable=cursors.filter(t=>t.eligible).length,hidden=cursors.filter(t=>!t.visible);
  const reasons=[...observationReasons,...cursors.filter(t=>t.visible&&!t.eligible).map(t=>t.reason),...hidden.map(t=>'表示外 '+t.direction+(isScreen()?'：全画面の切り抜き内へ手を映してください':'：座位補助の拡大範囲を調整'))].filter(Boolean);
  trackingText=`人差し指 ${sourceTracks.length}個／採点可能 ${usable}個${reasons.length?'｜'+[...new Set(reasons)].join('／'):''}`;
 }
 function layout(){const {w,h}=size();return game.layout(w,h);}
 async function begin(practice){
  if(connecting)return;
  if($('lampPosture').value!=='seated'&&!$('lampStandingReady').checked){setStatus('立位の配置と周囲を確認してください。');return;}
  if(!prepared&&!await prepare())return;
  if(!layout().valid){setStatus('配置間隔が不足しています。画面を広げるか、ランプを12個／6個に減らしてください。無理に到達範囲を広げないでください。');render(true);return;}
  if($('lampInput').value==='hand'&&!cameraReady){if(!await camera())return;}
  if(!active)return;
  game.context={fullscreen:isScreen(),display_fit:viewConfig().displayFit,input:$('lampInput').value,hands:$('lampHands').value,frame_pipeline:'latest-only/result-driven/0.5.2',camera_requested:$('lampInput').value==='hand'?$('lampResolution').value:null,camera_actual:$('lampInput').value==='hand'?{...perf.settings}:null,camera_selection:$('lampInput').value==='hand'?($('lampCamera').value?'selected':'default'):'not_used',analysis_target_fps:$('lampInput').value==='hand'?Number($('lampFps').value):null,delegate:$('lampInput').value==='hand'?perf.delegate:'not_used',delegate_requested:$('lampDelegate').value,preview:$('lampPreview').checked,video_width_px:$('lampInput').value==='hand'?video.videoWidth:null,video_height_px:$('lampInput').value==='hand'?video.videoHeight:null};
  const {w,h}=size();const started=practice?game.start(time(),true,w,h):game.beginCountdown(time(),w,h);
  if(!started){setStatus(game.layout(w,h).reason);render(true);return;}
  setStatus(practice?'練習中。無理なく届く範囲で試してください。':'3 → 2 → 1 → Goで開始します。手／マウスの入力がない間はカウントダウンも止まります。');render(true);
 }
 function renderCursors(){
  slots=slots.map(id=>cursors.some(c=>c.id===id)?id:null);for(const c of cursors)if(!slots.includes(c.id)){const i=slots.indexOf(null);if(i>=0)slots[i]=c.id;}
  for(let i=0;i<2;i++){const n=$(`lampCursor${i+1}`),c=cursors.find(t=>t.id===slots[i]);n.hidden=!c||c.visible===false;
   if(c){const left=`${c.x*100}%`,top=`${c.y*100}%`;if(n.style.left!==left)n.style.left=left;if(n.style.top!==top)n.style.top=top;n.classList.toggle('checking',!c.eligible);n.classList.toggle('flip-x',c.x>.88);n.classList.toggle('flip-y',c.y>.85);n.dataset.eligible=String(c.eligible);n.dataset.track=c.id;const scoring=game.cursors.find(t=>t.id===c.id);n.dataset.scoreX=scoring?String(scoring.x):'';n.dataset.scoreY=scoring?String(scoring.y):'';}
   showText(n.querySelector('.cursor-number'),$('lampInput').value==='mouse'?'M':String(i+1));n.setAttribute('aria-label',`追跡${i+1} ${c?.eligible?'採点可能':'保留'}`);
  }
 }
 function render(force=false){
  const stamp=nowMs(),{w,h}=size(),geometry=game.layout(w,h),count=game.targets.length;
  if(targetNodes.length!==count){
   targetNodes=game.targets.map(t=>{const n=document.createElement('div');n.className='lamp-target';n.dataset.id=String(t.id);return n;});
   $('lampTargets').replaceChildren(...targetNodes);layoutKey='';$('lampBoard').setAttribute('aria-label',`${count}個のランプ。人差し指カーソル中心が点灯円へ外から入ると消灯します`);
  }
  const key=[w,h,game.config.bottomReserve,viewConfig().displayFit,game.config.width,game.config.height,game.config.cx,game.config.cy,count,game.revision].join('/');
  if(key!==layoutKey){layoutKey=key;
   $('lampBottomBand').hidden=game.config.bottomReserve===0;$('lampBottomBand').style.height=`${game.config.bottomReserve*100}%`;showText($('lampBottomValue'),`${Math.round(game.config.bottomReserve*100)}%`);game.record?.screen(stamp/1000,w,h,geometry.radius,viewConfig().displayFit);
   game.targets.forEach((t,i)=>{const n=targetNodes[i];n.style.left=`${t.x*100}%`;n.style.top=`${t.y*100}%`;n.style.width=n.style.height=`${geometry.radius*2}px`;});
   board.classList.toggle('layout-invalid',!geometry.valid);
   showText($('lampLayout'),geometry.valid?`${count}個配置・${game.config.placement==='random'?'ランダム':'整列'}・seed ${game.seedUsed}｜★点灯・✓消灯・番号だけは待機｜円の範囲が当たり判定`:geometry.reason+'。開始できません。全画面表示・個数を減らす・ランダムならseed変更を試してください。');
  }
  game.targets.forEach((t,i)=>{const n=targetNodes[i],state=t.active?'点灯':t.outcome;
   if(n.dataset.state===state)return;n.dataset.state=state;n.classList.toggle('lit',t.active);
   showText(n,`${i+1}${t.active?' ★':t.outcome==='消灯'?' ✓':''}`);n.setAttribute('aria-label',`標的${i+1} ${state}`);n.title=`標的${i+1} ${state}`;
  });
  renderCursors();
  const cue=game.cue(stamp/1000),cueNode=$('lampCue'),cueKey=cue.kind+'/'+cue.text;
  if(cueNode.dataset.cue!==cueKey){lastSlow=-Infinity;cueNode.dataset.cue=cueKey;cueNode.dataset.transitions=String(Number(cueNode.dataset.transitions||0)+1);cueNode.dataset.kind=cue.kind;showText($('lampCueText'),cue.text);}
  cueNode.hidden=!cue.text;showText($('lampCueHold'),['countdown','playing','paused'].includes(game.state)?(game.state==='paused'?'一時停止・時計停止':!game.tracking?'入力待ち・時計停止':''):'');
  const view=viewTransform(viewConfig(),w,h,video.videoWidth||960,video.videoHeight||540),videoKey=[view.matrix,view.sourceWidth,view.sourceHeight].join('/');
  if(videoKey!==videoTransformKey){videoTransformKey=videoKey;video.style.width=`${view.sourceWidth}px`;video.style.height=`${view.sourceHeight}px`;video.style.transform=view.matrix;board.dataset.view=JSON.stringify({a:view.a,d:view.d,e:view.e,f:view.f,w,h,sourceWidth:view.sourceWidth,sourceHeight:view.sourceHeight});}
  $('lampCropSettings').hidden=$('lampMapMode').value!=='comfortable';
  if(!force&&stamp-lastSlow<200)return;lastSlow=stamp;
  video.hidden=$('lampInput').value!=='hand'||!$('lampPreview').checked;
  showText($('lampInputHint'),trackingText);
  const s=game.summary(),remaining=Math.max(0,game.config.duration-game.elapsed),phase={ready:'準備',countdown:'開始前',playing:game.practice?'練習':'実施中',paused:'一時停止',ended:'終了'}[game.state];
  showText($('lampMetrics'),`${phase}${['playing','countdown'].includes(game.state)&&!game.tracking?'（入力待ち・時計停止）':''}｜${game.practice?'練習':`残り ${remaining.toFixed(1)}秒`}｜得点 ${s.score}点｜出題 ${s.issued}｜消灯 ${s.extinguished}｜失効 ${s.expired}｜残灯 ${s.remaining}｜観測応答時間中央値 ${s.response_median_ms===null?'—':`${Math.round(s.response_median_ms)} ms`}（${s.response_samples}件）`);
  results.update(game.lastResult,game.state==='ended'||game.state==='ready');
  screen.update({state:game.state,score:s.score,remaining,practice:game.practice,tracking:game.tracking,hasResult:!!game.lastResult,inputHint:trackingText});
  const p=perf.snapshot(stamp),gameInfo=`画面更新 ${p.gameFps.toFixed(1)} fps｜ゲーム更新＋DOM書込 p95 ${p.gameP95===null?'—':p.gameP95.toFixed(2)+' ms'}`,fmt=v=>v===null?'—':`${v.toFixed(1)} ms`;
  showText($('lampPerformance'),$('lampInput').value==='mouse'?`マウス入力・手AI停止｜${gameInfo}`:`${p.delegate}｜カメラ設定 ${p.settings.width??'—'}×${p.settings.height??'—'} / ${p.settings.frameRate??'—'} fps｜映像更新 ${p.cameraObservedFps.toFixed(1)} fps｜解析結果 ${p.inferenceFps.toFixed(1)} fps（目標${$('lampFps').value}）｜推論 中央値 ${fmt(p.inferenceP50)}・p95 ${fmt(p.inferenceP95)}｜取得開始→結果受領 p95 ${fmt(p.softwareP95)}｜結果後→次取得 p95 ${fmt(p.captureIdleP95)}｜結果受領→カーソル書込 p95 ${fmt(p.cursorWriteP95)}｜画像取得 p95 ${fmt(p.bitmapP95)}｜古い結果の保留 ${p.rejected}件｜${gameInfo}`);
  const locked=['countdown','playing','paused'].includes(game.state)||connecting;
  if(force||locked!==wasLocked){for(const id of lockedIds)$(id).disabled=locked;wasLocked=locked;}
  for(const id of ['lampPrepare','lampPractice','lampStart'])$(id).disabled=locked;
  const safe=$('lampPosture').value==='seated'||$('lampStandingReady').checked;
  const reasons=[];
  if(connecting)reasons.push('カメラ・手モデルを準備中です');
  if(!safe)reasons.push('立位では、上の確認チェックを選ぶと開始できます。配置変更後は再確認してください。安全に届く配置と周囲を確認してください');
  if(!geometry.valid)reasons.push(geometry.reason+'。整列への変更・個数を減らす・全画面表示を試してください');
  showText($('lampReadyStatus'),reasons.length?'開始できない理由：'+reasons.join('／'):['countdown','playing','paused'].includes(game.state)?'実施中の条件は固定です。停止・再開・終了を選べます。':'開始できます。練習または30秒を開始を選んでください。');
  $('lampReadyStatus').dataset.ready=String(!reasons.length);
  $('lampLayoutActions').hidden=geometry.valid||locked;
  $('lampTryGrid').hidden=$('lampPlacement').value!=='random';
  $('lampTryGrid').disabled=$('lampTryFewer').disabled=locked;
  $('lampTryFewer').hidden=Number($('lampCount').value)<=6;
  showText($('lampTryFewer'),Number($('lampCount').value)>12?'12個に変更':'6個に変更');
  $('lampPractice').disabled=locked||!safe||!geometry.valid;
  $('lampStart').disabled=(locked&&!game.practice)||connecting||!safe||!geometry.valid;
  $('lampPause').disabled=!['playing','countdown'].includes(game.state);$('lampResume').disabled=game.state!=='paused'||!geometry.valid||connecting;
  $('lampEnd').disabled=!['countdown','playing','paused'].includes(game.state);
  showText($('lampStart'),game.state==='ended'?'もう一度30秒':'30秒を開始');
  if(active){showText($('state'),`ランプ ${GAME_VERSION} / ${cameraText}`);showText($('speed'),trackingText);}
 }
 function loop(){
  if(!active)return;const loopStarted=nowMs(),now=time(),{w,h}=size();
  if($('lampInput').value==='mouse'){cursors=mouse?[mouseCursor({id:'mouse',...mouse,eligible:true},w,h)]:[];game.input(cursors,now,w,h);trackingText=mouse?'マウス操作':'マウス待機';}
  else{
   if(now-lastHands>MAX_RESULT_AGE_MS/1000){sourceTracks=[];cursors=[];tracker.reset();game.input([],now,w,h);if(!trackingText.includes('解析が遅れ'))trackingText='手をカメラに映してください・追跡待ち';}
   if(cameraReady&&!video.requestVideoFrameCallback&&video.readyState>=2&&video.currentTime!==lastObservedVideo){lastObservedVideo=video.currentTime;perf.cameraFrame(nowMs());if(busy)perf.busySkipped++;else void sendFrame(nowMs());}
   if(!layout().valid)game.input([],now,w,h);game.tick(time(),w,h);
  }
  render();perf.recordGame(nowMs()-loopStarted,nowMs());raf=requestAnimationFrame(loop);
 }
 function reset(){prepared=false;releaseCamera();mouse=null;board.style.aspectRatio='16 / 9';board.style.setProperty('--lamp-aspect',String(16/9));videoTransformKey='';resetGame();setStatus('リセットしました。準備から再開できます。');render(true);}
 $('lampPrepare').onclick=prepare;$('lampPractice').onclick=()=>begin(true);$('lampStart').onclick=()=>begin(false);
 $('lampPause').onclick=()=>{game.pause(time());render(true);};$('lampEnd').onclick=()=>{game.finish(time());render(true);};
 $('lampResume').onclick=async()=>{if(connecting||!layout().valid)return;if($('lampInput').value==='hand'&&!await camera())return;tracker.reset();sourceTracks=[];cursors=[];slots=[null,null];game.resume(time());setStatus('再開しました。点灯円の外から入れてください。');render(true);};
 $('lampStop').onclick=()=>{const {w,h}=size();game.stop(time(),w,h);releaseCamera();setStatus(game.state==='ready'?'開始前のカウントダウンを中止しました。':'停止しました。再開で続けられます。');render(true);};$('lampReset').onclick=reset;$('lampInput').onchange=reset;
 for(const id of ['lampCount','lampPlacement','lampSeed','lampBottomReserve','lampSmoothing','lampMapMode','lampPosture','lampPattern','lampLevel','lampLifetime','lampMax','lampWidth','lampHeight','lampCx','lampCy'])$(id).addEventListener('input',()=>{
  if(id==='lampPosture'&&$('lampPosture').value!=='seated'){$('lampWidth').value=String(Math.min(28,Number($('lampWidth').value)));$('lampHeight').value=String(Math.min(20,Number($('lampHeight').value)));}
  $('lampStandingLabel').hidden=$('lampPosture').value==='seated';
  showText($('lampStandingText'),$('lampPosture').value==='stepping'?'立位・移動あり：移動範囲・足元・周囲の障害物・見守りの必要性を確認':'立位・足位置固定：足を動かさず届く配置・姿勢・周囲・必要時の見守りを確認');$('lampStandingReady').checked=false;prepared=false;updateVideoGeometry();resetGame();mouse=null;tracker.reset();sourceTracks=[];cursors=[];slots=[null,null];
  showText($('lampSafety'),$('lampPosture').value==='stepping'?'立位・移動あり：身体を移動させて操作できます。移動範囲と足元、周囲、見守りの必要性を確認してください。手が撮影範囲外なら採点できません。足の動きや転倒リスクは評価しません。':$('lampPosture').value!=='seated'?'立位・足位置固定：足を動かさず届く範囲で、姿勢・周囲・必要時の見守りを確認してください。カメラは安全性を保証しません。':'座位：安定した椅子で無理なく届く配置を確認。痛みや疲れがあれば中止してください。');render(true);
 });
 for(const id of ['lampFps','lampResolution','lampDelegate','lampCamera','lampHands','lampMirror'])$(id).addEventListener('change',reset);
 for(const id of ['lampPractice','lampStart'])$(id).setAttribute('aria-describedby','lampReadyStatus');
 $('lampTryGrid').onclick=()=>{if(['countdown','playing','paused'].includes(game.state)||connecting)return;$('lampPlacement').value='grid';$('lampPlacement').dispatchEvent(new Event('input'));setStatus('整列へ変更しました。立位では配置を確認してからチェックを選んでください。');};
 $('lampTryFewer').onclick=()=>{if(['countdown','playing','paused'].includes(game.state)||connecting)return;$('lampCount').value=Number($('lampCount').value)>12?'12':'6';$('lampCount').dispatchEvent(new Event('input'));setStatus('ランプ数を変更しました。立位では配置を確認してからチェックを選んでください。');};
 $('lampStandingReady').onchange=()=>render(true);$('lampPreview').onchange=()=>render(true);$('lampRefresh').onclick=refreshCameras;
 board.onpointermove=e=>{if($('lampInput').value!=='mouse')return;const r=board.getBoundingClientRect();mouse={x:(e.clientX-r.left-board.clientLeft)/size().w,y:(e.clientY-r.top-board.clientTop)/size().h};};
 board.onpointerleave=()=>{mouse=null;};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){game.pause(time(),'page_hidden');game.cancelCue();releaseCamera();setStatus('画面が非表示になったため停止しました。');render(true);}});
 window.addEventListener('pagehide',()=>{game.finish(time(),'screen_changed');game.cancelCue();releaseCamera();results.revoke();});
 video.addEventListener('resize',()=>{if(video.videoWidth&&video.videoHeight)updateVideoGeometry();});
 let resizeKey='';function resizeBoard(){if(!active||!board.clientWidth)return;const {w,h}=size(),key=w+'/'+h;if(key===resizeKey)return;resizeKey=key;
  // A changed display must not score a stationary old coordinate against a moved target.
  mouse=null;sourceTracks=[];cursors=[];slots=[null,null];tracker.reset();game.input([],time(),w,h);
  if(game.state==='ready')resetGame();if(!layout().valid&&['countdown','playing','paused'].includes(game.state)){game.finish(time(),'layout_invalid');releaseCamera();setStatus('画面の配置間隔が不足したため終了しました。結果は保持しています。画面サイズや個数を調整してください。');}render(true);}
 window.addEventListener('resize',resizeBoard);if(typeof ResizeObserver==='function')new ResizeObserver(resizeBoard).observe(board);
 const screen=mountLampScreen({viewer,panel,settings,onOpen:()=>{if(['countdown','playing'].includes(game.state)){game.pause(time(),'manual_panel');setStatus('設定・成績を開いたため一時停止しました。閉じた後に再開を選んでください。');render(true);}},onChange:()=>{resizeKey='';videoTransformKey='';resizeBoard();render(true);}});
 const api={setActive(value){if(active===value)return;active=value;panel.hidden=settings.hidden=!value;screen.setActive(value);
  if(value){resetGame();setStatus('画面全体のランプ。両人差し指をカメラに見せて操作できます。');render(true);raf=requestAnimationFrame(loop);void refreshCameras();}
  else{cancelAnimationFrame(raf);const {w,h}=size();game.finish(time(),'screen_changed');game.cancelCue();releaseCamera();results.revoke();}},summary:()=>game.summary()};
 if(standalone)api.setActive(true);return api;
}

