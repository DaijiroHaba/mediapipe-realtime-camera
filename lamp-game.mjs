// @ts-check
import {createLayout,geometry} from './lamp-layout.mjs?v=0.6.0';
import {LampRecord,aggregate} from './lamp-record.mjs?v=0.6.0';
export {targetPositions,targetLayout} from './lamp-layout.mjs?v=0.6.0';
/** @typedef {{id:string,x:number,y:number,eligible:boolean,visible?:boolean}} Cursor */
export const GAME_VERSION='0.6.0';
export const DEFAULT_GAME={duration:30,interval:2,lifetime:6,maxActive:2,pattern:'sequential',lampCount:30,placement:'grid',seed:-1,mapMode:'image',mirror:true,smoothing:false,width:.48,height:.46,cx:.5,cy:.56,posture:'seated',movementMode:'fixed',bottomReserve:.16};
/** @typedef {typeof DEFAULT_GAME} GameSettings */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** @param {Partial<GameSettings>} [input] */
export function settings(input={}){
 const p={...DEFAULT_GAME,...input};
 for(const k of ['duration','interval','lifetime','maxActive','lampCount','seed','width','height','cx','cy','bottomReserve'])if(!Number.isFinite(p[k]))throw Error(`設定 ${k} が不正です`);
 return {...p,bottomReserve:clamp(p.bottomReserve,0,.35),lampCount:[6,12,30,50].includes(p.lampCount)?p.lampCount:30,placement:p.placement==='random'?'random':'grid',seed:p.seed<0?-1:Math.floor(clamp(p.seed,0,4294967295)),mirror:p.mirror===true,smoothing:p.smoothing===true,mapMode:p.mapMode==='comfortable'?'comfortable':'image',duration:clamp(p.duration,10,60),interval:clamp(p.interval,.25,5),lifetime:clamp(p.lifetime,1,15),maxActive:Math.round(clamp(p.maxActive,1,4)),width:clamp(p.width,.18,.8),height:clamp(p.height,.15,.8),cx:clamp(p.cx,.2,.8),cy:clamp(p.cy,.25,.75),pattern:p.pattern==='timed'?'timed':'sequential',posture:p.posture==='standing'?'standing':'seated',movementMode:p.posture==='standing'&&p.movementMode==='stepping'?'stepping':'fixed'};
}
export function median(values){if(!values.length)return null;const v=[...values].sort((a,b)=>a-b),m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;}
export class LampGame{
 /** @param {Partial<GameSettings>} [config] */
 constructor(config={},random=()=>Math.random()){this.random=random;this.config=settings(config);this.revision=0;this.record=null;this.lastResult=null;this.context={input:'unspecified'};this.reset(config);}
 /** @param {Partial<GameSettings>} [config] */
 reset(config=this.config,w=960,h=540){
  if(this.record&&!this.record.closed)this.complete(this.lastWall??0,'reset_canceled');
  this.record=null;this.pauseReason='manual_pause';
  this.config=settings(config);this.seedUsed=this.config.seed>=0?this.config.seed:Math.floor(clamp(this.random(),0,.9999999999999999)*4294967296);
  this.plan=createLayout(this.config,w,h,this.seedUsed);this.revision++;this.layoutCache=null;
  this.targets=this.plan.points.map(p=>({...p,active:false,contact:false,armed:false,litAt:0,expiresAt:0,outcome:'待機',activation:null}));
  this.goUntil=-Infinity;this.state='ready';this.resumePhase='playing';this.practice=false;this.elapsed=0;this.preElapsed=0;this.lastWall=null;this.inputWall=-Infinity;this.tracking=false;this.cursors=[];this.responses=[];this.issued=0;this.hits=0;this.expired=0;this.nextSpawn=0;this.lastTarget=-1;
 }
 newRecord(now,w,h){this.record=new LampRecord({version:GAME_VERSION,practice:this.practice,now,conditions:{...this.config,...this.context,layout_seed:this.seedUsed,positions:this.plan.points,board_width_px:w,board_height_px:h,hit_radius_px:this.radius(w,h),coordinate_version:'shared-video-transform/0.5.4-contain-cover',input_definition:'landmark8 displayed entry; tracking identifiers are not body sides',interval_definition:this.config.pattern==='sequential'?'one active; after hit 0.3 s; configured interval applies only to timed mode':'scheduled interval; no backlog'}});this.record.screen(now,w,h,this.radius(w,h),this.context.display_fit??'contain');}
 start(now,practice=false,w=960,h=540){if(this.record&&!this.record.closed)this.finish(now);this.reset(this.config,w,h);if(!this.layout(w,h).valid)return false;this.state='playing';this.practice=practice;this.lastWall=now;this.newRecord(now,w,h);this.record.go(now);return true;}
 beginCountdown(now,w=960,h=540){if(this.record&&!this.record.closed)this.finish(now);this.reset(this.config,w,h);if(!this.layout(w,h).valid)return false;this.state='countdown';this.lastWall=now;this.newRecord(now,w,h);return true;}
 pause(now,reason='manual_pause'){this.advance(now,this.tracking);if(['playing','countdown'].includes(this.state)){this.resumePhase=this.state;this.state='paused';this.pauseReason=reason;this.record?.closeQuality(now);}this.tracking=false;this.cursors=[];}
 resume(now){if(this.state!=='paused')return;this.advance(now,false);this.state=this.resumePhase;this.lastWall=now;if(this.record&&this.record.go_wall_s!==null)this.record.openQuality(now);this.tracking=false;this.inputWall=-Infinity;this.cursors=[];for(const t of this.targets){t.contact=true;t.armed=false;}}
 cancelCue(){this.goUntil=-Infinity;}
 stop(now,w=960,h=540){this.cancelCue();if(this.state==='countdown'||(this.state==='paused'&&this.resumePhase==='countdown')){this.finish(now,'before_go_canceled');this.reset(this.config,w,h);}else this.pause(now,'manual_camera_stop');}
 complete(now,status){if(!this.record||this.record.closed)return;this.record.finish(now,this.elapsed,status);this.lastResult=this.record.snapshot();}
 finish(now,status=null){
  // Canceling before Go must not advance across the countdown boundary and start a run.
  if(this.record?.go_wall_s===null&&(this.state==='countdown'||this.state==='paused'&&this.resumePhase==='countdown')){
   if(!Number.isFinite(now)||now<(this.lastWall??now))throw Error('時刻が不正です');
   this.lastWall=now;this.cancelCue();this.complete(now,status??'before_go_canceled');this.state='ended';this.tracking=false;return;
  }
  this.advance(now,this.tracking);this.cancelCue();if(['playing','countdown','paused'].includes(this.state)){this.complete(now,status??(this.practice?'practice_ended':'early_ended'));this.state='ended';}this.tracking=false;
 }
 advance(now,ready){
  if(!Number.isFinite(now))throw Error('時刻が不正です');if(this.lastWall!==null&&now<this.lastWall)throw Error('時刻が逆転しました');
  const from=this.lastWall??now,dt=now-from,elapsedBefore=this.elapsed,clockRunning=this.tracking&&ready;
  let intervalEnd=now;
  if(clockRunning){if(this.state==='countdown')this.preElapsed+=dt;else if(this.state==='playing'){this.elapsed+=dt;if(!this.practice&&this.elapsed>=this.config.duration){intervalEnd=from+this.config.duration-elapsedBefore;this.elapsed=this.config.duration;}}}
  if(['playing','paused'].includes(this.state)){
   const kind=this.state==='paused'?(this.pauseReason.startsWith('manual')?'manual':'technical'):clockRunning?'active':'tracking';
   this.record?.segment(from,intervalEnd,elapsedBefore,this.elapsed,kind,kind==='active'?'valid_input':kind==='tracking'?'no_usable_fresh_input':this.pauseReason);
  }
  this.lastWall=now;this.tracking=ready;
  if(this.state==='countdown'&&this.preElapsed>=3-1e-9){this.preElapsed=3;this.state='playing';this.elapsed=0;this.goUntil=now+.65;this.record?.go(now);}
  if(this.state!=='playing')return;
  if(ready)for(const t of this.targets)if(t.active&&this.elapsed>=t.expiresAt){t.active=false;t.outcome='失効';this.expired++;this.record?.resolve(t.activation,'expired',intervalEnd,this.elapsed);}
  if(!this.practice&&this.elapsed>=this.config.duration-1e-9){this.elapsed=this.config.duration;this.complete(intervalEnd,'completed');this.state='ended';this.tracking=false;return;}
 }
 cue(now=this.lastWall??0){
  const phase=this.state==='paused'?this.resumePhase:this.state;
  if(phase==='countdown')return {text:String(Math.max(1,3-Math.floor(this.preElapsed+1e-9))),kind:'start'};
  if(this.state==='ended')return {text:'終了',kind:'finish'};
  if(phase==='playing'&&!this.practice&&now<this.goUntil)return {text:'Go',kind:'go'};
  const remaining=Math.max(0,this.config.duration-this.elapsed);
  if(phase==='playing'&&!this.practice&&remaining<=5&&remaining>0)return {text:String(Math.max(1,Math.ceil(remaining-1e-9))),kind:'final'};
  return {text:'',kind:''};
 }
 layout(w,h){
  const key=[w,h,this.revision].join('/');
  if(this.layoutCache?.key!==key){const g=geometry(this.plan.points,w,h,this.plan.radius);this.layoutCache={key,value:{...g,valid:this.plan.valid&&g.valid,reason:this.plan.reason||(!g.valid?'配置間隔が不足しています':'')}};}
  return this.layoutCache.value;
 }
 radius(w,h){return this.layout(w,h).radius;}
 inside(c,t,w,h){const dx=(c.x-t.x)*w,dy=(c.y-t.y)*h,r=this.radius(w,h);return dx*dx+dy*dy<=r*r;}
 spawn(w,h){
  if(this.state!=='playing'||!this.tracking||this.elapsed<this.nextSpawn||!this.layout(w,h).valid)return;
  const active=this.targets.filter(t=>t.active).length,cap=this.config.pattern==='sequential'?1:this.config.maxActive;
  if(this.config.pattern==='sequential'&&active)return;if(this.config.pattern==='timed')this.nextSpawn=this.elapsed+this.config.interval;if(active>=cap)return;
  const options=this.targets.filter(t=>!t.active&&t.id!==this.lastTarget);if(!options.length)return;
  const t=options[Math.floor(clamp(this.random(),0,.999999)*options.length)];
  t.active=true;t.litAt=this.elapsed;t.expiresAt=this.elapsed+this.config.lifetime;t.outcome='点灯';t.contact=this.cursors.some(c=>this.inside(c,t,w,h));t.armed=!t.contact;this.issued++;this.lastTarget=t.id;
  t.activation=this.record?.light(t,this.lastWall,this.elapsed,w,h);
 }
 input(cursors,now,w=960,h=540){
  this.cursors=cursors.filter(c=>c.visible!==false&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&c.x>=0&&c.x<=1&&c.y>=0&&c.y<=1);this.inputWall=now;
  const ready=this.layout(w,h).valid&&this.cursors.some(c=>c.eligible),regained=!this.tracking&&ready;this.advance(now,ready);
  // A newly valid hand already on a lit target is not a fresh entry.
  if(regained)for(const t of this.targets)if(t.active&&this.cursors.some(c=>this.inside(c,t,w,h))){t.contact=true;t.armed=false;}
  for(const t of this.targets){const inside=this.cursors.some(c=>this.inside(c,t,w,h)),entering=this.cursors.some(c=>c.eligible&&this.inside(c,t,w,h));
   if(!inside)t.armed=true;
   if(this.state==='playing'&&ready&&t.active&&entering&&!t.contact&&t.armed){t.active=false;t.outcome='消灯';this.record?.resolve(t.activation,'extinguished',now,this.elapsed);this.hits++;this.responses.push((this.elapsed-t.litAt)*1000);if(this.config.pattern==='sequential')this.nextSpawn=this.elapsed+.3;}
   t.contact=inside;
  }this.spawn(w,h);
 }
 tick(now,w=960,h=540){this.advance(now,this.tracking&&now-this.inputWall<=.5&&this.layout(w,h).valid);this.spawn(w,h);}
 summary(){return {version:GAME_VERSION,state:this.state,practice:this.practice,score:this.hits*10,active_seconds:this.elapsed,countdown_seconds:this.preElapsed,placement:this.config.placement,lamp_count:this.config.lampCount,layout_seed:this.seedUsed,issued:this.issued,extinguished:this.hits,expired:this.expired,remaining:this.targets.filter(t=>t.active).length,response_median_ms:median(this.responses),response_samples:this.responses.length,definition:'2D displayed cursor entry; camera/inference/display/movement/smoothing included; paused and pre-countdown periods excluded; not a clinical scale'};}
 result(){return this.lastResult?aggregate(this.lastResult):null;}
}



