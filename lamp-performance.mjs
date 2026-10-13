// @ts-check
/** In-memory software timings, not physical camera-to-display latency. */
export class LampPerformance{
 constructor(){this.reset();}
 reset(){this.samples=[];this.arrivals=[];this.cameraFrames=[];this.submitted=0;this.rejected=0;this.busySkipped=0;this.delegate='未接続';this.settings={};this.gameSamples=[];this.gameFrames=[];}
 trim(a,now){while(a.length&&a[0]<now-3000)a.shift();}
 cameraFrame(now){this.cameraFrames.push(now);this.trim(this.cameraFrames,now);}
 recordGame(ms,now){this.gameSamples.push(ms);if(this.gameSamples.length>180)this.gameSamples.shift();this.gameFrames.push(now);this.trim(this.gameFrames,now);}
 submit(){this.submitted++;}
 consume({submittedAt,receivedAt,inferenceMs,bitmapMs=0,accepted=true}){
  const latencyMs=receivedAt-submittedAt;if(!Number.isFinite(latencyMs)||latencyMs<0)return;
  this.samples.push({latencyMs,inferenceMs:Number.isFinite(inferenceMs)?inferenceMs:null,bitmapMs});if(this.samples.length>90)this.samples.shift();
  this.arrivals.push(receivedAt);this.trim(this.arrivals,receivedAt);if(!accepted)this.rejected++;
 }
 snapshot(now){
  this.trim(this.arrivals,now);this.trim(this.cameraFrames,now);this.trim(this.gameFrames,now);
  const percentile=(key,p)=>{const a=this.samples.map(s=>s[key]).filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.ceil(a.length*p)-1]:null;};
  const fps=a=>a.length>1?(a.length-1)*1000/(a.at(-1)-a[0]):0;
  const gs=[...this.gameSamples].sort((a,b)=>a-b);
  return {gameFps:fps(this.gameFrames),gameP95:gs.length?gs[Math.ceil(gs.length*.95)-1]:null,delegate:this.delegate,settings:this.settings,cameraObservedFps:fps(this.cameraFrames),inferenceFps:fps(this.arrivals),inferenceP50:percentile('inferenceMs',.5),inferenceP95:percentile('inferenceMs',.95),softwareP95:percentile('latencyMs',.95),bitmapP95:percentile('bitmapMs',.95),submitted:this.submitted,rejected:this.rejected,busySkipped:this.busySkipped,samples:this.samples.length};
 }
}

