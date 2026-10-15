// @ts-check
// Ephemeral geometric association, NOT biometric identity or clinical measurement.
export const PLAYER_VERSION='upper-body-wrist/0.6.0';
export const PLAYER_LIMITS={poseAgeMs:350,poseIntervalMs:125,confirmMs:400,confirmSamples:3,maxPoses:4,handEdge:.003};
const good=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&(p.visibility??1)>=.55&&(p.presence??1)>=.55;
const distance=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function describePlayer(points,index,aspect=16/9){
 if(!good(points?.[11])||!good(points?.[12]))return null;
 const a=points[11],b=points[12],scale=distance(a,b,aspect);
 if(scale<.07)return null;
 const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},visible=points.filter(good);
 const box={left:clamp(Math.min(...visible.map(p=>p.x))-.04,0,1),top:clamp(Math.min(...visible.map(p=>p.y))-.06,0,1),right:clamp(Math.max(...visible.map(p=>p.x))+.04,0,1),bottom:clamp(Math.max(...visible.map(p=>p.y))+.06,0,1)};
 return {index,center,scale,box,wrists:[points[15],points[16]].map(p=>good(p)?{x:p.x,y:p.y}:null)};
}
/** Required visible MCP/index points must be inside the actual analysis image,
 * not merely inside the source image after crop remapping. Wrist ownership is
 * checked separately against Pose; bottom-wrist support rules remain unchanged. */
export function handInsideAnalysis(hand){
 return [5,9,13,17,6,7,8].every(i=>{const p=hand?.[i],e=PLAYER_LIMITS.handEdge;return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>e&&p.x<1-e&&p.y>e&&p.y<1-e;});
}
export function remapHands(landmarks,crop={left:0,top:0,width:1,height:1}){
 return landmarks.map(hand=>hand.map(p=>({...p,x:crop.left+p.x*crop.width,y:crop.top+p.y*crop.height})));
}
export class PlayerLock{
 constructor(){this.reset();}
 reset(){this.epoch=(this.epoch??0)+1;this.state='unselected';this.people=[];this.selected=null;this.lastPose=-Infinity;this.selectedAt=0;this.samples=0;this.aspect=16/9;this.reason='準備後、映像の候補からプレイヤーを選んでください';this.atCapacity=false;}
 lose(reason){if(this.state!=='lost')this.epoch++;this.state='lost';this.reason=reason+'。プレイヤーを選び直してください';this.selected=null;}
 update(poses,stamp,aspect=16/9){
  if(!Number.isFinite(stamp)||stamp<=this.lastPose)return false;
  const gap=stamp-this.lastPose;this.lastPose=stamp;this.aspect=aspect;
  this.people=poses.map((p,i)=>describePlayer(p,i,aspect)).filter(Boolean);this.atCapacity=poses.length>=PLAYER_LIMITS.maxPoses;
  if(this.atCapacity){this.lose('人物候補の上限です（最大4人）。画面内の人数を減らしてください');return false;}
  if(!['pending','locked'].includes(this.state))return true;
  if(gap>PLAYER_LIMITS.poseAgeMs){this.lose('人物確認が途切れました');return false;}
  const previous=this.selected,rank=this.people.map(person=>({person,cost:distance(previous.center,person.center,aspect)/previous.scale+Math.abs(Math.log(person.scale/previous.scale))})).sort((a,b)=>a.cost-b.cost);
  const best=rank[0],second=rank[1];
  if(!best||best.cost>.65||best.person.scale/previous.scale<.65||best.person.scale/previous.scale>1.55||second&&second.cost-best.cost<.35){this.lose('プレイヤーの対応を確認できません');return false;}
  const overlapping=this.people.some(p=>p!==best.person&&distance(p.center,best.person.center,aspect)<.65*Math.min(p.scale,best.person.scale));
  if(overlapping){this.lose('人物が重なっています');return false;}
  this.selected=best.person;this.samples++;return true;
 }
 fresh(now){return Number.isFinite(now)&&now>=this.lastPose&&now-this.lastPose<=PLAYER_LIMITS.poseAgeMs;}
 choose(index,now){
  const p=this.people.find(p=>p.index===index);
  if(!p||!this.fresh(now)||this.atCapacity)return false;
  this.epoch++;this.selected=p;this.selectedAt=now;this.samples=1;this.state='pending';this.reason='選んだ人を確認中（約0.4秒）。枠を確認して「この人に決定」を押してください';return true;
 }
 canConfirm(now){return this.state==='pending'&&this.fresh(now)&&now-this.selectedAt>=PLAYER_LIMITS.confirmMs&&this.samples>=PLAYER_LIMITS.confirmSamples;}
 confirm(now){if(!this.canConfirm(now))return false;this.state='locked';this.reason='プレイヤー限定：選択した人の手だけを確認します';return true;}
 ready(now){return this.state==='locked'&&this.fresh(now)&&!this.atCapacity;}
 expire(now){if(['locked','pending'].includes(this.state)&&now-this.lastPose>PLAYER_LIMITS.poseAgeMs)this.lose('人物確認が遅れています');}
 crop(){
  if(!this.selected)return {left:0,top:0,width:1,height:1};
  const p=this.selected,b=p.box,padX=Math.max(.12,p.scale/this.aspect*.65),padY=Math.max(.12,p.scale*.45);
  const left=clamp(b.left-padX,0,1),right=clamp(b.right+padX,0,1),top=clamp(b.top-padY,0,1),bottom=clamp(b.bottom+padY,0,1);
  return {left,top,width:Math.max(.1,right-left),height:Math.max(.1,bottom-top)};
 }
 filterHands(landmarks,captureStamp,now=captureStamp){
  if(!this.ready(now)||Math.abs(captureStamp-this.lastPose)>PLAYER_LIMITS.poseAgeMs)return {landmarks:[],reason:this.state==='locked'?'人物確認の更新待ち':this.reason};
  const me=this.selected,others=this.people.filter(p=>p.index!==me.index),candidates=[];let withheld=0;
  for(const hand of landmarks){
   const wrist=hand?.[0];if(!wrist||!Number.isFinite(wrist.x)||!Number.isFinite(wrist.y)){withheld++;continue;}
   const own=me.wrists.map((p,i)=>({i,d:p?distance(wrist,p,this.aspect):Infinity})).sort((a,b)=>a.d-b.d),best=own[0];
   if(!Number.isFinite(best.d)||best.d>Math.max(.055,me.scale*.42)){withheld++;continue;}
   // No handedness labels or landmark-order assumptions; refuse a close alternative.
   const otherNear=others.some(p=>p.wrists.some(w=>w&&distance(wrist,w,this.aspect)<best.d+Math.max(.035,me.scale*.18))||p.wrists.some(w=>!w)&&distance(wrist,p.center,this.aspect)<p.scale*1.6);
   if(otherNear||own[1].d-best.d<Math.max(.025,me.scale*.12)){withheld++;continue;}
   candidates.push({hand,wristIndex:best.i});
  }
  const accepted=candidates.filter(c=>candidates.filter(q=>q.wristIndex===c.wristIndex).length===1).map(c=>c.hand);
  return {landmarks:accepted,reason:accepted.length?'':withheld||candidates.length?'手が重なるか、選択した人の手と確認できません・採点保留':'選択した人の手をカメラに映してください'};
 }
}
