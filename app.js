import {VERSION,MODEL_THRESHOLDS,Tracker,poseDetection,combineDetections,modeFeatures,interestRegion,angle2D,visible,EDGES,csv} from './core.mjs?v=1.3.0';
import {CanvasRecorder} from './recorder.mjs';
import {openVideo,seekVideo} from './file-video.mjs';
import {PostureAwareness,LIMITS,AWARENESS_VERSION,ambiguousPosePoints} from './posture-awareness.mjs?v=0.1.0';
import {drawAwareness} from './posture-overlay.mjs?v=0.1.0';
const awareness=new PostureAwareness();
let observations=new Map(),lastTracks=[],awarenessStaleTimer=null;
const awarenessOn=()=>document.getElementById('displayMode').value==='awareness'&&modeFeatures(document.getElementById('mode').value).pose;
const $=id=>document.getElementById(id), video=$('video'), canvas=$('canvas'), ctx=canvas.getContext('2d');
const snapshot=document.createElement('canvas'), snap=snapshot.getContext('2d');
let worker=null,stream=null,running=false,busy=false,starting=false,generation=0,timer=null,watchdog=null,cancelInit=null;
let tracker=new Tracker(),events=[],coordinates=[],session=null,lastFrame=-Infinity,lastVideoTime=-1,frames=0,firstFrame=null,lastResultTime=null;
let fileSource=null,fileController=null,nextFileFrame=0,fileTiming=null;
const locked=['mode','camera','maxPeople','posePeople','axis','line','dwell','radius','interestRegion','log','joint','minAngle','maxAngle','fps','inputMode','videoFile'];
const eventNames={A_to_B:'通過 A → B',B_to_A:'通過 B → A',stop_start:'立ち止まり開始（推定）',interest_candidate:'関心候補（連続立ち止まり・一時ID初回）'};
const palette=['#39ecc0','#ffd364','#ff91bb','#8bceff','#d9b0ff','#ffffff'];
let recordingSession=null;
const recording=new CanvasRecorder({onUpdate:updateRecordingStatus,onComplete:info=>{
  info.filename=`realtime_${info.started_at.replaceAll(/[:.]/g,'-')}_${recordingSession?.features.pose?'landmarked':'person_boxes'}${info.error?'_partial':''}.webm`;
  recordingSession?.recordings.push({...info});
  if(info.error)message(`録画を停止しました: ${info.error}`);
  else if(['duration_limit','size_limit'].includes(info.stop_reason))message(`録画上限に達したため録画を停止しました。「動画を保存」で端末へ保存できます。${running?'カメラ計測は継続しています。':'カメラは停止中です。'}`);
}});
function message(text){$('message').textContent=text;}
function controls(active){for(const id of locked)$(id).disabled=active;$('start').disabled=active||recording.state==='stopping';$('stop').disabled=!active;$('reset').disabled=active;$('refresh').disabled=active;syncMode();updateRecordingStatus();}
function config(){return {axis:$('axis').value,line:Number($('line').value)/100,dwell:Number($('dwell').value),radius:Number($('radius').value),countingEnabled:modeFeatures($('mode').value).traffic,region:interestRegion($('interestRegion').value)};}
function syncMode(){const f=modeFeatures($('mode').value);$('stats').dataset.mode=f.traffic?'multi':'single';$('trafficSettings').hidden=!f.traffic;$('eventSection').hidden=!f.traffic;$('interestNote').hidden=!f.traffic;$('angleSettings').hidden=!f.pose||awarenessOn();$('feedback').hidden=!f.pose||awarenessOn();$('displayMode').disabled=!f.pose;$('awarenessNote').hidden=!awarenessOn();$('boxes').disabled=awarenessOn();$('maxPeople').disabled=running||starting;$('posePeopleSetting').hidden=$('mode').value!=='combined';$('maxPeopleLabel').textContent=f.traffic?'最大人物枠人数':'最大ランドマーク人数';$('skeleton').disabled=!f.pose;$('log').disabled=running||starting||!f.pose;$('peopleSettingNote').textContent=running||starting?'人数とモードの変更には、いったんカメラを停止してください。':'人数・モードはカメラ停止中に変更できます。2人を写す場合は2人以上を選択してください。';$('engineNote').textContent=f.traffic?'人流は人物検出モデルの枠中心で計数します。骨格の検出数とは一致しない場合があります。':'人物枠は姿勢点の範囲です。顔認識枠ではありません。脚が映らない場合は部分検出です。';updateLineLegend();}
function setPeopleOptions(){const traffic=modeFeatures($('mode').value).traffic,previous=$('maxPeople').value;const values=traffic?[1,2,4,6,8,12,20]:[1,2,4];$('maxPeople').replaceChildren(...values.map(n=>new Option(`${n}人${n>4?'（試行）':''}`,String(n))));$('maxPeople').value=values.includes(Number(previous))?previous:traffic?'12':'4';}
function updateLineLegend(){const f=modeFeatures($('mode').value),c=running?tracker.config:config(),mirror=$('mirror').checked;$('lineLegend').hidden=!f.traffic;const sides=c.axis==='x'?(mirror?'A＝画面の右、B＝画面の左（左右反転中）':'A＝画面の左、B＝画面の右'):'A＝画面の上、B＝画面の下';$('lineLegend').textContent=`通過計数：${sides}。人物枠の中心が線を越えた回数を計数します。${$('showLine').checked?'':'線は非表示ですが、計数は継続します。'}`;$('interestNote').textContent=`関心候補は対象範囲内で連続${c.dwell}秒以上立ち止まった一時IDです。注視・関心そのものは判定しません。IDが変わると同じ人を再計数する可能性があります。`;}
function updateRecordingStatus(){
  const state=recording.state,active=state==='recording';$('recordStatus').dataset.state=state;
  $('recordStatusIcon').src=active?'vendor/icons/video.svg':'vendor/icons/video-off.svg';
  $('recordStatusText').textContent=active?`録画中 ${Math.floor(recording.elapsed/60)}:${String(Math.floor(recording.elapsed)%60).padStart(2,'0')}`:state==='stopping'?'録画停止・保存準備中':'録画していません';
  $('screenRecordStatus').textContent=$('recordStatusText').textContent;$('screenRecordStatus').dataset.recording=String(active);
  $('recordButtonIcon').src=active?'vendor/icons/square.svg':'vendor/icons/video.svg';$('recordButtonText').textContent=active?'録画を停止':'録画を開始';$('record').title=active?'録画を停止して端末内で動画を生成':'表示中の人物枠・ランドマークを含む映像の録画を開始';
  $('record').setAttribute('aria-label',active?'録画を停止':'録画を開始');
  $('record').disabled=state==='stopping'||(!active&&(!running||frames<1||!recording.supported||$('inputMode').value==='video'));$('record').dataset.recording=String(active);
  const cameraActive=running||starting;$('screenCamera').querySelector('img').src=`vendor/icons/${cameraActive?'camera-off':'camera'}.svg`;$('screenCamera').title=cameraActive?'カメラを停止':'カメラを開始';$('screenCamera').setAttribute('aria-label',$('screenCamera').title);$('screenCamera').disabled=state==='stopping'&&!cameraActive;
  $('saveRecording').disabled=state!=='idle'||!recording.blob;$('start').disabled=starting||running||state==='stopping';
  $('recordDetail').textContent=active?'映像を録画中です。音声は記録せず、この端末内に保持しています。':state==='stopping'?'録画は停止しました。動画ファイルを準備しています。':!recording.supported?'このブラウザではWebM録画に対応していません。Chrome / Edgeで使用してください。':recording.blob?`録画停止済み・${(recording.blob.size/1024/1024).toFixed(1)} MB。「動画を保存」で保存してください。録画の再開は自動では行いません。`:'録画はOFFです。録画開始を押した場合だけ映像を記録します。音声なし・端末内保存。';
  if($('inputMode').value==='video'&&state==='idle')$('recordDetail').textContent='既存動画はフレーム単位で解析します。再録画せず、JSON・CSVで結果を保存します。';
}
function toggleRecording(){
  if(recording.state==='recording'){recording.stop('manual');return;}
  if(!running||frames<1||$('inputMode').value==='video')return;
  if(recording.blob&&!recording.saved&&!confirm('前回の録画が未保存です。前回分を破棄して新しく録画しますか？'))return;
  try{recordingSession=session;recording.start(canvas);}catch(error){message(`録画を開始できません: ${error.message}`);}
}
function clearSession(){clearTimeout(awarenessStaleTimer);awareness.reset();observations=new Map();lastTracks=[];tracker=new Tracker(config());events=[];coordinates=[];session=null;frames=0;firstFrame=null;lastFrame=-Infinity;lastVideoTime=-1;lastResultTime=null;updateStats([]);$('angle').textContent='--°';$('cue').textContent='カメラ停止中';$('cue').dataset.inrange='false';const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=3;cell.textContent='記録はありません';row.append(cell);$('events').replaceChildren(row);for(const id of ['export','coordCsv','eventCsv'])$(id).disabled=true;$('logState').textContent='座標記録は録画とは別設定です。イベントは最大10,000件。音声は記録しません。';}
async function refreshCameras(){
  if(!navigator.mediaDevices){message('HTTPS または localhost で開いてください。カメラAPIを利用できません。');return;}
  try{const previous=$('camera').value,devices=await navigator.mediaDevices.enumerateDevices();$('camera').replaceChildren(new Option('既定のカメラ',''));devices.filter(d=>d.kind==='videoinput').forEach((d,i)=>$('camera').add(new Option(d.label||`カメラ ${i+1}（開始後に名称表示）`,d.deviceId)));if([...$('camera').options].some(o=>o.value===previous))$('camera').value=previous;}
  catch(error){message(`カメラ一覧を取得できません: ${error.message}`);}
}
function initWorker(numPoses,token){
  return new Promise((resolve,reject)=>{
    const w=new Worker('./pose-worker.js?v=1.3.0');worker=w;
    const timeout=setTimeout(()=>reject(new Error('モデル初期化が45秒以内に完了しませんでした。vendor・modelsの配置を確認してください。')),45000);
    const rejectInit=error=>{clearTimeout(timeout);reject(error);};cancelInit=()=>rejectInit(new Error('開始を中止しました。'));
    w.onerror=e=>{if(token!==generation)return;const error=new Error(`推定エンジンを起動できません。ライブラリ配置・ブラウザを確認してください。${e.message||''}`);if(starting)rejectInit(error);else fail(error);};
    w.onmessage=({data})=>{
      if(token!==generation)return;
      if(data.type==='ready'){clearTimeout(timeout);cancelInit=null;resolve(data.delegate);}
      else if(data.type==='error'){const error=new Error(data.message);if(starting)rejectInit(error);else fail(error);}
      else if(data.type==='result'){clearTimeout(watchdog);if(running){consume(data);if(fileSource){session.frame_timing.push(fileTiming);nextFileFrame++;$('fileProgress').value=nextFileFrame/session.source.total_samples;$('fileProgressText').textContent=`${nextFileFrame} / ${session.source.total_samples} フレーム・動画時刻 ${fileTiming.mediaTime.toFixed(3)}秒`;}busy=false;schedule(token);}}
    };
    w.postMessage({type:'init',numPoses,maxPeople:Number($('maxPeople').value),mode:$('mode').value});
  });
}
async function start(){
  if(running||starting||recording.state==='stopping')return;
  const fromFile=$('inputMode').value==='video',file=$('videoFile').files[0];
  if(fromFile&&!file){message('解析する動画を選択してください。');return;}
  if(!fromFile&&!navigator.mediaDevices?.getUserMedia){message('Chrome / Edge で HTTPS または localhost のURLを開いてください。');return;}
  const c=config(),min=Number($('minAngle').value),max=Number($('maxAngle').value);
  if(!Number.isFinite(c.dwell)||c.dwell<3||c.dwell>60||!Number.isFinite(min)||!Number.isFinite(max)||min<0||max>180||min>max){message('連続立ち止まり秒数（3〜60）と角度の上下限（0〜180）を確認してください。');return;}
  if(session&&!confirm('新しいセッションを開始すると現在のログを消去します。必要な結果は保存済みですか？'))return;
  clearSession();$('fileProgress').value=0;$('fileProgressText').textContent='準備中';starting=true;const token=++generation;controls(true);$('state').textContent='モデル準備中';message('ローカルの推定モデルを読み込んでいます。映像は外部へ送信しません。');
  try{
    const delegate=await initWorker($('mode').value==='combined'?Number($('posePeople').value):Number($('maxPeople').value),token);
    if(token!==generation)return;
    $('state').textContent=fromFile?'動画読み込み中':'カメラ接続中';
    if(fromFile){fileController=new AbortController();const loaded=await openVideo(file,fileController.signal,video);if(token!==generation){loaded.close();return;}fileSource=loaded;nextFileFrame=0;}
    else{const deviceId=$('camera').value;
      const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{...(deviceId?{deviceId:{exact:deviceId}}:{}),width:{ideal:960},height:{ideal:540},frameRate:{ideal:30}}});
      if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;video.srcObject=stream;await video.play();if(token!==generation)return;
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(running)fail(new Error('カメラ接続が終了しました。USB接続を確認してください。'));},{once:true});
    }
    canvas.width=snapshot.width=video.videoWidth;canvas.height=snapshot.height=video.videoHeight;
    starting=false;running=true;$('empty').hidden=true;$('state').textContent=`計測中 / ${delegate}`;$('state').dataset.active='true';
    const features=modeFeatures($('mode').value);
    session={app_version:VERSION,started_at:new Date().toISOString(),mode:$('mode').value,features,max_people:Number($('maxPeople').value),num_poses:features.pose?Number($('mode').value==='combined'?$('posePeople').value:$('maxPeople').value):0,requested_fps:Number($('fps').value),delegate,width:canvas.width,height:canvas.height,tracking:tracker.config,coordinate_system:'unmirrored source image; x/right, y/down; normalized; z is model-relative depth',angle:{joint:$('joint').value,min,max,definition:'2D inner angle in aspect-corrected pixel coordinates, straight=180deg'},coordinate_logging:features.pose&&$('log').checked,coordinates_truncated:false,events_truncated:false,processed_frames:0,detected_frames:0,limitations:['Temporary IDs may switch or expire; not unique-person counts.','Stops are box-center image displacement, not physical immobility.','Stationary >= threshold is only an interest candidate, not gaze or psychological interest.','Not a medical assessment.']};
    session.model={name:'pose_landmarker_full',tasks_vision_version:'0.10.21',confidence_thresholds:MODEL_THRESHOLDS,landmark_visibility_threshold:.5};
    session.model.pose_enabled=features.pose;session.model.person_detector_enabled=features.traffic;session.model.person_detector={name:'efficientdet_lite0',category:'person',score_threshold:.5};
    session.interest_definition={threshold_seconds:c.dwell,region:c.region,region_setting:$('interestRegion').value,position:'person bounding-box center',movement_tolerance_normalized:c.radius,denominator:'temporary IDs seen inside region',numerator:'temporary IDs with a continuous stationary episode inside region',deduplication:'once per continuous temporary ID per session; ID expiry can double count',actual_interest_validated:false};
    session.posture_awareness={version:AWARENESS_VERSION,enabled_at_start:awarenessOn(),settings_changes:[],thresholds:LIMITS,threshold_basis:'engineering display heuristics; not clinical cutoffs',coordinates:'aspect-corrected source 2D; direction is displayed screen left/right',validation:'SYNTHETIC_SOFTWARE_ONLY; field accuracy and learning benefit unvalidated',findings_saved:false};
    session.recordings=[];session.recording_policy={automatic:false,audio:false,max_seconds:recording.maxSeconds,max_bytes_approximate:recording.maxBytes,server_upload:false};
    session.source=fromFile?{type:'video',filename:file.name,bytes:file.size,last_modified:file.lastModified,duration_s:fileSource.duration,total_samples:Math.ceil(fileSource.duration*session.requested_fps),sample_limit:3000,timing:'REQUESTED_SOURCE_SAMPLE_TIME_NOT_PROCESSING_TIME',counting_timestamp:'requestedTime',decoded_timestamp:'mediaTime in frame_timing; quantization depends on source frame rate'}:{type:'camera'};session.frame_timing=[];session.completion='RUNNING';
    session.tracking_rules={method:'greedy nearest center; countable state must match',gate:'maximum normalized center distance per match',maxGap:'seconds before temporary ID expires',deadBand:'normalized half-width about counting line',missing_detection:'reset crossing side and stop timer',counts:'crossing events and temporary-ID interest candidates, not unique people'};
    $('export').disabled=false;message(fromFile?'動画解析中です。通過・立ち止まりは元動画の時刻で判定します。動画の再録画は行いません。':'計測中です。カメラを固定し、全身が入るようにしてください。終了するには「停止」を押してください。');if(!fromFile)await refreshCameras();schedule(token);
  }catch(error){if(token===generation)fail(error);}
}
function schedule(token){clearTimeout(timer);timer=setTimeout(()=>capture(token),fileSource?0:Math.max(0,1000/Number($('fps').value)-(performance.now()-lastFrame)));}
async function capture(token){
  if(!running||busy||token!==generation)return;
  if(document.hidden){stop();message('非表示になったためカメラを停止しました。再開は新しいセッションになります。');return;}
  if(!fileSource&&(video.readyState<2||video.currentTime===lastVideoTime)){timer=setTimeout(()=>capture(token),30);return;}
  if(fileSource&&(nextFileFrame>=session.source.total_samples||nextFileFrame>=3000)){const reason=nextFileFrame>=session.source.total_samples?'COMPLETE':'FRAME_LIMIT';stop(reason);message(reason==='COMPLETE'?'動画解析が完了しました。JSON・CSVを保存できます。':'3,000フレームで停止しました。解析済みのJSON・CSVを保存できます。');return;}
  busy=true;lastVideoTime=video.currentTime;lastFrame=performance.now();
  try{
    if(fileSource){fileTiming=await seekVideo(video,nextFileFrame/session.requested_fps,fileController.signal);if(!running||token!==generation)return;lastFrame=fileTiming.requestedTime*1000;}
    snap.drawImage(video,0,0,snapshot.width,snapshot.height);
    const bitmap=await createImageBitmap(snapshot);
    if(!running||token!==generation){bitmap.close();return;}
    watchdog=setTimeout(()=>fail(new Error('推定処理が15秒以内に完了しないため停止しました。人数・推定頻度を下げて再開してください。')),15000);
    worker.postMessage({type:'frame',time:lastFrame,bitmap},[bitmap]);
  }catch(error){if(token===generation)fail(error);}
}
function stop(reason='USER_STOP'){
  clearTimeout(awarenessStaleTimer);
  const preserve=!!fileSource&&['COMPLETE','FRAME_LIMIT'].includes(reason);
  recording.stop('camera_stop');
  generation++;running=false;starting=false;busy=false;clearTimeout(timer);clearTimeout(watchdog);cancelInit?.();cancelInit=null;worker?.terminate();worker=null;
  stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;fileController?.abort();fileController=null;fileSource?.close();fileSource=null;
  if(session&&session.completion==='RUNNING')session.completion=reason;
  if(session&&!session.ended_at)session.ended_at=new Date().toISOString();
  if(!preserve){awareness.reset();observations=new Map();lastTracks=[];}
  controls(false);$('state').textContent=reason==='COMPLETE'?'動画解析完了':reason==='FRAME_LIMIT'?'フレーム上限で停止':'停止中';$('state').dataset.active='false';$('speed').textContent='0.0 fps';if(!preserve){$('empty').hidden=false;ctx.clearRect(0,0,canvas.width,canvas.height);snap.clearRect(0,0,snapshot.width,snapshot.height);$('angle').textContent='--°';$('cue').textContent='停止中';$('cue').dataset.inrange='false';$('people').textContent='0';$('stopped').textContent='0';$('bodyStatus').textContent='映像停止中です。';}updateScreenMetrics();
}
function fail(error){if(session){session.error=String(error.message);session.completion='ERROR';}stop();message(`停止しました: ${error.message} （動画形式、カメラの許可、vendor/modelsの配置も確認してください）`);}
function consume(data){
  if(firstFrame===null)firstFrame=data.time;
  const time=(data.time-firstFrame)/1000;
  if(lastResultTime!==null&&time-lastResultTime>tracker.config.maxGap){session.tracking_gap_count=(session.tracking_gap_count||0)+1;message('処理間隔が0.75秒を超えました。一時IDの継続と自動計数が成立しにくい状態です。最大人数を減らすか、より高速なPCで確認してください。');}
  lastResultTime=time;
  const poses=(data.landmarks||[]).map(poseDetection).filter(Boolean),features=session.features;
  const detections=features.traffic?(features.pose?combineDetections(data.people||[],poses):(data.people||[])):poses;
  if(features.pose&&features.traffic){const ambiguous=ambiguousPosePoints(data.people||[],poses);for(const d of detections)d.poseAssociationAmbiguous=ambiguous.has(d.points);}
  const result=tracker.update(detections,time);
  lastTracks=result.tracks;
  clearTimeout(awarenessStaleTimer);
  if(awarenessOn()){observations=awareness.update(result.tracks,time,canvas.width,canvas.height,$('mirror').checked);
    awarenessStaleTimer=setTimeout(()=>{if(running&&awarenessOn()){awareness.reset();observations=new Map(lastTracks.map(t=>[t.id,{findings:[],text:'映像の更新を確認中'}]));render(lastTracks);}},800);
  }else {awareness.reset();observations=new Map();}
  frames++;session.processed_frames=frames;if(detections.length)session.detected_frames++;
  session.elapsed_seconds=Number(time.toFixed(3));
  for(const event of result.events){if(events.length<10000)events.push(event);else session.events_truncated=true;}
  if(session.coordinate_logging){
    for(const t of result.tracks){
      if(coordinates.length+ t.points.length>60000){session.coordinates_truncated=true;break;}
      t.points.forEach((p,i)=>coordinates.push([Number(time.toFixed(3)),t.id,i,p.x,p.y,p.z,p.visibility??null]));
    }
  }
  if(session.coordinates_truncated||session.events_truncated)$('logState').textContent='記録上限に達しました。一部ログは省略されています。要約のtruncatedフラグを確認してください。';
  $('coordCsv').disabled=!coordinates.length;$('eventCsv').disabled=!events.length;
  $('speed').textContent=`${time>0?((frames-1)/time).toFixed(1):'0.0'} fps`;
  updateStats(result.tracks);render(result.tracks);updateRecordingStatus();
  const full=result.tracks.filter(t=>t.fullBody).length,withPose=result.tracks.filter(t=>t.points.length>0);
  $('bodyStatus').textContent=!result.tracks.length?'人物を検出していません。照明とカメラの画角を確認してください。':!features.pose?`人物枠 ${result.tracks.length}人（推定）。骨格・注視は推定していません。`:features.traffic?`人物枠 ${result.tracks.length}人 / 骨格対応 ${withPose.length}人 / 全身検出 ${full}人。枠に対応しない骨格は計数に使用しません。`:`全身検出 ${full}人 / 部分検出 ${result.tracks.length-full}人。頭と両足が入る画角で使用してください。`;
  const p=features.pose&&withPose.length===1?withPose[0].points:null;
  const angle=p?angle2D(p,$('joint').value,canvas.width,canvas.height):null;
  $('angle').textContent=angle===null?'--°':`${angle.toFixed(1)}°`;
  const inrange=angle!==null&&angle>=session.angle.min&&angle<=session.angle.max;
  $('cue').dataset.inrange=String(inrange);
  $('cue').textContent=withPose.length>1?'動作の目安は骨格が1人だけ検出されたときに表示':angle===null?'関節が十分に見えていません':inrange?'設定した範囲内です':`現在は設定範囲（${session.angle.min}〜${session.angle.max}°）の外です`;
  if(result.events.length){$('events').replaceChildren();for(const e of events.slice(-8).reverse()){const tr=document.createElement('tr');for(const val of [e.time.toFixed(1),`#${e.id}`,eventNames[e.type]]){const td=document.createElement('td');td.textContent=val;tr.append(td);}$('events').append(tr);}}
}
function updateScreenMetrics(){const f=modeFeatures($('mode').value),c=running?tracker.config:config();const sides=c.axis==='x'?($('mirror').checked?'A=右・B=左':'A=左・B=右'):'A=上・B=下';$('screenMetrics').textContent=`検出 ${$('people').textContent}人${f.traffic?` / ${sides} / 通過 A→B ${tracker.forward}回・B→A ${tracker.reverse}回 / 関心候補 ${tracker.interestPeople}人相当 / 候補率 ${tracker.interestRate===null?'--':tracker.interestRate.toFixed(1)}%`:''}`;}
function updateStats(tracks){$('people').textContent=tracks.length;$('stopped').textContent=tracks.filter(t=>t.still).length;$('forward').textContent=tracker.forward;$('reverse').textContent=tracker.reverse;$('eligiblePeople').textContent=tracker.eligiblePeople;$('interestPeople').textContent=tracker.interestPeople;$('interestRate').textContent=tracker.interestRate===null?'--':tracker.interestRate.toFixed(1);$('stopTotal').textContent=`立ち止まり開始 ${tracker.stopEvents} 回`;updateScreenMetrics();}
function render(tracks){
  const w=canvas.width,h=canvas.height,mirror=$('mirror').checked,x=v=>(mirror?1-v:v)*w,y=v=>v*h;
  ctx.save();if(mirror){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(snapshot,0,0,w,h);ctx.restore();
  ctx.lineWidth=3;ctx.font='16px sans-serif';
  for(const t of tracks){
    const color=palette[(t.id-1)%palette.length];ctx.strokeStyle=color;ctx.fillStyle=color;
    if(modeFeatures($('mode').value).pose&&$('skeleton').checked){ctx.beginPath();for(const [a,b] of EDGES)if(visible(t.points[a])&&visible(t.points[b])){ctx.moveTo(x(t.points[a].x),y(t.points[a].y));ctx.lineTo(x(t.points[b].x),y(t.points[b].y));}ctx.stroke();for(const p of t.points)if(visible(p)){ctx.beginPath();ctx.arc(x(p.x),y(p.y),3,0,2*Math.PI);ctx.fill();}}
    if($('boxes').checked||awarenessOn()){const b=t.box,bx=Math.min(x(b.x),x(b.x+b.w)),by=awarenessOn()?Math.min(h,Math.max(22,y(b.y)+24)):Math.max(22,y(b.y));ctx.strokeRect(bx,y(b.y),b.w*w,b.h*h);const label=awarenessOn()?`#${t.id}`:`#${t.id} ${t.points.length?(t.fullBody?'全身':'部分骨格'):'人物枠'}${t.still?' / 関心候補':''}${!t.countable?' / 腰未検出':''}`;const labelWidth=Math.min(w,Math.max(80,b.w*w),ctx.measureText(label).width+14),lx=Math.max(0,Math.min(bx,w-labelWidth));ctx.fillStyle='#152523';ctx.fillRect(lx,by-22,labelWidth,22);ctx.fillStyle=color;ctx.fillText(label,lx+6,by-6,Math.max(1,labelWidth-12));}
  }
  if(modeFeatures($('mode').value).traffic&&$('showLine').checked){
    const c=tracker.config;ctx.strokeStyle='#ffe08a';ctx.lineWidth=2;ctx.setLineDash([9,7]);ctx.beginPath();if(c.axis==='x'){ctx.moveTo(x(c.line),0);ctx.lineTo(x(c.line),h);}else{ctx.moveTo(0,y(c.line));ctx.lineTo(w,y(c.line));}ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ffe08a';ctx.strokeStyle='#162122';ctx.lineWidth=4;
  }
  if(modeFeatures($('mode').value).traffic&&$('interestRegion').value==='center'){const r=tracker.config.region;ctx.strokeStyle='#86c9ff';ctx.lineWidth=2;ctx.setLineDash([4,5]);ctx.strokeRect(Math.min(x(r.x),x(r.x+r.w)),y(r.y),r.w*w,r.h*h);ctx.setLineDash([]);}
  if(awarenessOn())drawAwareness(ctx,tracks,observations,w,h,mirror);
  if(recording.state==='recording'){ctx.fillStyle='#a81227';ctx.fillRect(Math.max(0,w-160),h-35,160,35);ctx.fillStyle='#fff';ctx.font='bold 16px sans-serif';ctx.fillText(`REC 録画中 ${Math.floor(recording.elapsed)}秒`,Math.max(4,w-150),h-12);}
  recording.captureFrame();
}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const name=suffix=>`realtime_${session?.started_at.replaceAll(/[:.]/g,'-')||'session'}_${suffix}`;
function saveRecording(){if(!recording.blob||recording.state!=='idle')return;download(recording.info.filename,recording.blob,recording.blob.type);recording.markSaved();}
$('record').addEventListener('click',toggleRecording);$('saveRecording').addEventListener('click',saveRecording);
$('start').addEventListener('click',start);$('stop').addEventListener('click',()=>{stop();message('カメラを停止しました。必要な結果を端末に保存できます。');});$('refresh').addEventListener('click',refreshCameras);
$('reset').addEventListener('click',()=>{if(!running&&!starting&&(!session||confirm('現在のカウントと未保存ログを消去しますか？'))){clearSession();message('カウントとログをリセットしました。');}});
$('export').addEventListener('click',()=>{if(session)download(name('summary.json'),JSON.stringify({...session,exported_at:new Date().toISOString(),counts:{A_to_B:tracker.forward,B_to_A:tracker.reverse,stop_start:tracker.stopEvents,interest_candidate_temporary_ids:tracker.interestPeople,eligible_temporary_ids:tracker.eligiblePeople,interest_candidate_rate_percent:tracker.interestRate},event_rows:events.length,coordinate_rows:coordinates.length},null,2),'application/json');});
$('eventCsv').addEventListener('click',()=>download(name('events.csv'),csv([['経過秒','一時ID','イベント','連続立ち止まり_秒','閾値_秒'],...events.map(e=>[Number(e.time.toFixed(3)),e.id,eventNames[e.type],e.dwell_seconds?.toFixed(3)??'',e.threshold_seconds??''])]),'text/csv;charset=utf-8'));
$('coordCsv').addEventListener('click',()=>download(name('coordinates.csv'),csv([['経過秒','一時ID','ランドマーク番号','x_正規化','y_正規化','z_相対深度','visibility'],...coordinates]),'text/csv;charset=utf-8'));
$('fps').addEventListener('input',()=>$('fpsLabel').textContent=`${$('fps').value} fps`);$('line').addEventListener('input',()=>$('lineLabel').textContent=`${$('line').value}%`);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(running||starting)){stop();message('タブが非表示になったためカメラと録画を停止しました。完了後に動画を保存できます。');}});window.addEventListener('pagehide',stop);
window.addEventListener('beforeunload',event=>{if(recording.state!=='idle'||(recording.blob&&!recording.saved)){event.preventDefault();event.returnValue='';}});
$('mode').addEventListener('change',()=>{if(!running&&!starting){if(session&&!confirm('モード変更で現在のログをリセットします。必要な結果は保存済みですか？')){$('mode').value=session.mode;return;}setPeopleOptions();$('maxPeople').value=$('mode').value==='single'?'1':'12';clearSession();}syncMode();});$('mirror').addEventListener('change',()=>{updateLineLegend();resetAwarenessDisplay('mirror');});$('showLine').addEventListener('change',updateLineLegend);$('axis').addEventListener('change',updateLineLegend);$('dwell').addEventListener('input',updateLineLegend);
function resetAwarenessDisplay(reason){
  awareness.reset();observations=new Map();clearTimeout(awarenessStaleTimer);
  if(session)session.posture_awareness?.settings_changes.push({elapsed_seconds:session.elapsed_seconds||0,reason,enabled:awarenessOn(),mirror:$('mirror').checked});
  syncMode();if(lastTracks.length&&$('empty').hidden)render(lastTracks);
}
$('displayMode').addEventListener('change',()=>resetAwarenessDisplay('display_mode'));
async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if($('viewer').requestFullscreen)await $('viewer').requestFullscreen();else throw new Error('このブラウザでは全画面表示を利用できません。Chrome / Edgeを使用してください。');}catch(error){message(`全画面表示: ${error.message}`);}}
document.addEventListener('fullscreenchange',()=>{const active=document.fullscreenElement===$('viewer');$('fullscreen').setAttribute('aria-pressed',String(active));$('fullscreen').setAttribute('aria-label',active?'全画面を終了':'全画面表示');$('fullscreen').title=active?'全画面を終了（Escでも終了）':'全画面表示';$('fullscreenIcon').src=`vendor/icons/${active?'minimize':'maximize'}.svg`;updateRecordingStatus();updateScreenMetrics();});
$('fullscreen').addEventListener('click',toggleFullscreen);$('screenCamera').addEventListener('click',()=>running||starting?stop():start());
if(location.protocol==='file:')message('ファイルを直接開かず、公開先のHTTPS URLから開いてください。ローカル確認の起動方法はREADMEを参照してください。');
function inputUI(){const file=$('inputMode').value==='video';$('videoInput').hidden=!file;$('cameraInput').hidden=file;$('fileProgressArea').hidden=!file;$('start').textContent=file?'動画解析を開始':'カメラを開始';$('refresh').hidden=file;$('recordDetail').textContent=file?'既存動画はフレーム単位で解析します。再録画は行わず、結果をJSON・CSVで保存します。':'録画はOFFです。';updateRecordingStatus();}
$('inputMode').addEventListener('change',inputUI);inputUI();syncMode();updateRecordingStatus();refreshCameras();
