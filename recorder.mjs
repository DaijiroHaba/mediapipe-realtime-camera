export class CanvasRecorder {
  constructor({onUpdate=()=>{},onComplete=()=>{},maxSeconds=180,maxBytes=64*1024*1024}={}) {
    Object.assign(this,{onUpdate,onComplete,maxSeconds,maxBytes});
    this.state='idle';this.blob=null;this.saved=true;this.info=null;
  }
  get supported(){return typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function'&&['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].some(t=>MediaRecorder.isTypeSupported(t));}
  get elapsed(){return this.state==='recording'||this.state==='stopping'?(performance.now()-this.startedMono)/1000:0;}
  emit(){this.onUpdate({state:this.state,elapsed:this.elapsed,blob:this.blob,info:this.info,supported:this.supported});}
  start(canvas){
    if(this.state!=='idle')throw new Error('録画の終了処理が完了するまでお待ちください。');
    if(!this.supported)throw new Error('このブラウザではWebM録画に対応していません。Chrome / Edgeを使用してください。');
    const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    let recordingStream;
    try{
      recordingStream=canvas.captureStream(15);
      const frameTrack=recordingStream.getVideoTracks()[0];
      const media=new MediaRecorder(recordingStream,{mimeType,videoBitsPerSecond:2000000});
      this.media=media;this.recordingStream=recordingStream;this.frameTrack=frameTrack;this.chunks=[];this.bytes=0;this.reason='manual';this.error=null;this.blob=null;this.saved=false;this.info=null;
      this.startedAt=new Date().toISOString();this.startedMono=performance.now();this.stoppedAt=null;this.durationSeconds=null;
      this.finished=new Promise(resolve=>{this.resolveFinished=resolve;});
      media.addEventListener('dataavailable',e=>{if(this.media!==media||this.state==='idle')return;if(e.data.size){this.chunks.push(e.data);this.bytes+=e.data.size;if(this.bytes>=this.maxBytes&&this.state==='recording')this.stop('size_limit');}});
      media.addEventListener('error',e=>{if(this.media!==media||this.state==='idle')return;this.error=String(e.error?.message||'録画エラー');this.stop('error');});
      media.addEventListener('stop',()=>{if(this.media===media)this.finish();},{once:true});
      media.start(1000);this.state='recording';this.durationTimer=setTimeout(()=>this.stop('duration_limit'),this.maxSeconds*1000);this.clock=setInterval(()=>this.emit(),500);this.emit();this.captureFrame();
    }catch(error){recordingStream?.getTracks().forEach(t=>t.stop());this.state='idle';this.emit();throw error;}
  }
  captureFrame(){if(this.state==='recording')this.frameTrack?.requestFrame?.();}
  stop(reason='manual'){
    if(this.state==='idle')return Promise.resolve(this.info);
    if(this.state==='stopping')return this.finished;
    this.reason=reason;this.stoppedAt=new Date().toISOString();this.durationSeconds=this.elapsed;this.state='stopping';clearTimeout(this.durationTimer);clearInterval(this.clock);this.emit();
    this.finalizeTimer=setTimeout(()=>{this.error=this.error||'録画終了処理がタイムアウトしました。保存映像は不完全な可能性があります。';this.finish();},5000);
    try{if(this.media.state!=='inactive')this.media.stop();else this.finish();}catch(error){this.error=String(error.message);this.finish();}
    return this.finished;
  }
  finish(){
    if(this.state==='idle')return;
    clearTimeout(this.finalizeTimer);clearTimeout(this.durationTimer);clearInterval(this.clock);this.recordingStream?.getTracks().forEach(t=>t.stop());
    this.blob=this.chunks?.length?new Blob(this.chunks,{type:this.media.mimeType||'video/webm'}):null;this.chunks=[];
    if(!this.blob)this.error=this.error||'録画フレームが得られませんでした。カメラ映像を表示した状態で再試行してください。';
    this.info={started_at:this.startedAt,ended_at:this.stoppedAt||new Date().toISOString(),duration_seconds:Number((this.durationSeconds??this.elapsed).toFixed(3)),mime_type:this.media.mimeType,bytes:this.blob?.size||0,stop_reason:this.reason,status:this.error?'partial_or_failed':this.blob?'ready':'empty',error:this.error,audio:false,source:'landmarked display canvas, including current mirror and display settings'};
    const resolve=this.resolveFinished;this.state='idle';this.onComplete(this.info);this.emit();resolve?.(this.info);
  }
  markSaved(){this.saved=true;}
  discard(){if(this.state!=='idle')throw new Error('録画中は破棄できません。');this.blob=null;this.info=null;this.saved=true;this.emit();}
}
