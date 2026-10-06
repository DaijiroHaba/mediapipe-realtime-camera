// Display-only, image-plane observations. All limits are engineering heuristics,
// not clinical cutoffs or validated probabilities. See POSTURE_AWARENESS.md.
export const AWARENESS_VERSION = '0.3.1';
const KINDS=['trunk','head','shoulder','forwardTrunk','headForward','knee'];
const emptyCurrent=()=>Object.fromEntries(KINDS.map(k=>[k,0]));
export const LIMITS = Object.freeze({
  visibility: .65, margin: .015, minTorsoPx: 48, minShoulderPx: 36,
  minFacePx: 16, shoulderTorsoMin: .45, shoulderTorsoMax: 2.2,
  hipShoulderMin: .35, hipShoulderMax: 1.7, noseOffsetMax: .4,
  shoulderDepthRatioMax: .6, hipDepthRatioMax: .6,
  trunkOn: 10, trunkOff: 6, headOn: 12, headOff: 8,
  shoulderOn: 10, shoulderOff: 6, headAgreement: 12,
  forwardTrunkOn: 15, forwardTrunkOff: 10, headForwardOn: 25, headForwardOff: 18,
  kneeOn: 35, kneeOff: 25, sideWeakVisibility: .35, sidePairProjectionMax: .35,
  sideNoseEarMinPx: 8, sideEyeRatioMax: .7, minSideNeckPx: 24, minLegSegmentPx: 40,
  tauSeconds: .12, confirmSeconds: .25, warmupSeconds: .25, minSamples: 2,
  slowIntervalSeconds: .5, minSlowSamples: 3, minFootDirectionPx: 16,
  maxGapSeconds: 2.5, maxHipSpeed: .45, maxPointSpeed: 1.4,
  maxLegSpeed: .65, maxScaleSpeed: .25,
  overlapFraction: .08, maxFindings: 2
});
const rad = 180 / Math.PI;
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const mid = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const hold = (reason,text) => ({status:'hold',reason,findings:[],text});
export function goodPoint(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    Number.isFinite(p.visibility) && p.visibility >= LIMITS.visibility &&
    (p.presence == null || (Number.isFinite(p.presence) && p.presence >= LIMITS.visibility)) &&
    p.x>=LIMITS.margin && p.x<=1-LIMITS.margin && p.y>=LIMITS.margin && p.y<=1-LIMITS.margin;
}
function lineAngle(a,b) { const [l,r]=a.x<=b.x?[a,b]:[b,a]; return Math.atan2(r.y-l.y,r.x-l.x)*rad; }
export function measurePose(points,width,height) {
  if(!(width>0 && height>0 && Number.isFinite(width+height)))return hold('dimensions','カメラの映像サイズを確認しています');
  const p=(points||[]).map(q=>q&&Number.isFinite(q.x+q.y)?{x:q.x*width,y:q.y*height}:null);
  const good=i=>goodPoint(points?.[i]);
  const shoulders=[11,12].every(good),hips=[23,24].every(good);
  const shoulder=shoulders?mid(p[11],p[12]):null,hip=hips?mid(p[23],p[24]):null;
  const shoulderWidth=shoulders?dist(p[11],p[12]):0;
  const hipWidth=hips?dist(p[23],p[24]):0;
  const torso=shoulder&&hip?dist(shoulder,hip):0;
  const depthOK=(a,b,len,limit)=>len>0&&Number.isFinite(points[a].z)&&Number.isFinite(points[b].z)&&Math.abs(points[a].z-points[b].z)*width/len<=limit;
  const eyesGood=[0,2,5].every(good),earsGood=[7,8].every(good);
  const eyesWidth=eyesGood?dist(p[2],p[5]):0,earWidth=earsGood?dist(p[7],p[8]):0;
  const eyeMid=eyesGood?mid(p[2],p[5]):null,earMid=earsGood?mid(p[7],p[8]):null;
  const projection=(a,b,c)=>Math.abs((c.x-(a.x+b.x)/2)*(b.x-a.x)+(c.y-(a.y+b.y)/2)*(b.y-a.y))/Math.max(1,dist(a,b)**2);
  // These image/z filters only reject clearly unsupported views. They do not certify camera orientation.
  const faceFront=eyesGood&&eyesWidth>=8&&projection(p[2],p[5],p[0])<=.8&&p[0].y>=eyeMid.y-eyesWidth*.4&&dist(p[0],eyeMid)<=eyesWidth*2.5&&
    (!earsGood||earWidth<LIMITS.minFacePx||projection(p[7],p[8],p[0])<=LIMITS.noseOffsetMax);
  const values={trunk:null,head:null,shoulder:null},unavailable={};
  const clipped=ids=>ids.some(i=>points?.[i]&&Number.isFinite(points[i].x+points[i].y)&&
    (points[i].x<LIMITS.margin||points[i].x>1-LIMITS.margin||points[i].y<LIMITS.margin||points[i].y>1-LIMITS.margin));
  if(!shoulders)unavailable.trunk=clipped([11,12])?'肩が画面から切れています':'肩の位置を確認できません';
  else if(!hips)unavailable.trunk=clipped([23,24])?'腰が画面から切れています':'肩と腰の位置がそろって確認できません';
  else if(torso<LIMITS.minTorsoPx||shoulderWidth<LIMITS.minShoulderPx)unavailable.trunk='上体が小さく映っているため所見を保留しています';
  else if(!faceFront)unavailable.trunk='顔と肩の位置を確認できません';
  else if(hip.y-shoulder.y<torso*.7||shoulderWidth/torso<LIMITS.shoulderTorsoMin||shoulderWidth/torso>LIMITS.shoulderTorsoMax||hipWidth/shoulderWidth<LIMITS.hipShoulderMin||hipWidth/shoulderWidth>LIMITS.hipShoulderMax||
    !depthOK(11,12,shoulderWidth,LIMITS.shoulderDepthRatioMax)||!depthOK(23,24,hipWidth,LIMITS.hipDepthRatioMax))unavailable.trunk='上体の撮影方向を確認できません';
  else values.trunk=Math.atan2(shoulder.x-hip.x,hip.y-shoulder.y)*rad;
  if(!shoulders)unavailable.shoulder=clipped([11,12])?'肩が画面から切れています':'肩の位置を確認できません';
  else if(shoulderWidth<LIMITS.minShoulderPx)unavailable.shoulder='肩の姿勢点が小さく、所見を保留しています';
  else if(!faceFront||!depthOK(11,12,shoulderWidth,LIMITS.shoulderDepthRatioMax))unavailable.shoulder='顔と肩の位置を確認できません';
  else values.shoulder=lineAngle(p[11],p[12]);
  if(!eyesGood||!earsGood)unavailable.head='顔の向きを確認できません';
  else if(earWidth<LIMITS.minFacePx||eyesWidth<8)unavailable.head='顔の姿勢点が小さく、所見を保留しています';
  else if(!faceFront||dist(p[0],earMid)>earWidth*1.5)unavailable.head='顔の向きを確認できません';
  else {
    const ears=lineAngle(p[7],p[8]),eyes=lineAngle(p[2],p[5]);
    if(Math.abs(ears-eyes)>LIMITS.headAgreement||Math.abs(ears)>=45)unavailable.head='頭の姿勢点が一致せず、所見を保留しています';
    else values.head=ears;
  }
  const available=Object.keys(values).filter(k=>values[k]!==null);
  if(!available.length)return {...hold('quality',unavailable.trunk||unavailable.head||'必要な姿勢点を確認できません'),unavailable};
  const motionScale=torso>0?torso:Math.max(36,shoulderWidth*1.25,earWidth*2.5);
  return {status:'measured',view:'front',signature:'front',hip,torso,motionScale,pixels:p,available,unavailable,
    motionIndices:[0,2,5,7,8,11,12,23,24].filter(good),legIndices:[25,26,27,28].filter(good),values};
}
export function measureSidePose(points,width,height,preferredChain=null) {
  if(!(width>0&&height>0&&Number.isFinite(width+height)))return hold('dimensions','映像サイズを確認中');
  const p=(points||[]).map(q=>q&&Number.isFinite(q.x+q.y)?{x:q.x*width,y:q.y*height}:null);
  const good=i=>goodPoint(points?.[i]);
  const weak=i=>{const q=points?.[i];return q&&Number.isFinite(q.x+q.y)&&Number.isFinite(q.visibility)&&q.visibility>=LIMITS.sideWeakVisibility&&
    (q.presence==null||Number.isFinite(q.presence)&&q.presence>=LIMITS.sideWeakVisibility)&&q.x>=LIMITS.margin&&q.x<=1-LIMITS.margin&&q.y>=LIMITS.margin&&q.y<=1-LIMITS.margin;};
  const candidates=[{name:'left',ear:7,shoulder:11,hip:23,knee:25,ankle:27},{name:'right',ear:8,shoulder:12,hip:24,knee:26,ankle:28}]
    .filter(c=>good(0)&&good(c.ear)&&good(c.shoulder)).map(c=>({...c,score:(points[c.ear].visibility+points[c.shoulder].visibility+(good(c.hip)?points[c.hip].visibility:0))/3}));
  candidates.sort((a,b)=>b.score-a.score);
  let c=candidates[0];const prior=candidates.find(q=>q.name===preferredChain);if(prior&&c.score-prior.score<.15)c=prior;
  if(!c)return hold('side_points','側面の顔・耳・肩の位置を確認できません');
  const sh=p[c.shoulder],ear=p[c.ear],hip=good(c.hip)?p[c.hip]:null;
  const neck=dist(ear,sh),torso=hip?dist(sh,hip):0,reference=torso||neck*2.5;
  const dx=p[0].x-ear.x,facing=Math.sign(dx);
  if(Math.abs(dx)<LIMITS.sideNoseEarMinPx||!facing)return hold('side_direction','体の前後方向を確認できません');
  // Profile evidence must come from both the face and body; turning only the head is insufficient.
  if([7,8].every(weak)&&p[0].x>=Math.min(p[7].x,p[8].x)-4&&p[0].x<=Math.max(p[7].x,p[8].x)+4)return hold('not_profile','側面の撮影方向を確認できません');
  if([2,5].every(weak)&&Math.abs(p[2].x-p[5].x)>Math.abs(dx)*LIMITS.sideEyeRatioMax)return hold('not_profile','側面の撮影方向を確認できません');
  const pairs=[[11,12],[23,24]].filter(pair=>pair.every(weak));
  if(!reference||!pairs.length||pairs.some(([a,b])=>Math.abs(p[a].x-p[b].x)>reference*LIMITS.sidePairProjectionMax))return hold('not_profile','斜め向きのため側面所見を保留しています');
  const heel=c.name==='left'?29:30,toe=c.name==='left'?31:32;
  const footDx=[heel,toe].every(good)?p[toe].x-p[heel].x:0;
  const footFacing=Math.abs(footDx)>=LIMITS.minFootDirectionPx?Math.sign(footDx):null;
  // Face and foot agreement is a proxy, not a measured body axis. Without agreement use screen words only.
  const axisSupported=footFacing!==null&&footFacing===facing;
  const values={forwardTrunk:null,headForward:null,knee:null},unavailable={};
  if(!hip)unavailable.forwardTrunk='肩と腰の位置がそろって確認できません';
  else if(torso<LIMITS.minTorsoPx||hip.y-sh.y<torso*.45)unavailable.forwardTrunk='上体の傾きを確認できません';
  else values.forwardTrunk=Math.atan2(facing*(sh.x-hip.x),hip.y-sh.y)*rad;
  if(neck<LIMITS.minSideNeckPx||sh.y-ear.y<neck*.2)unavailable.headForward='耳と肩の前後位置を確認できません';
  else values.headForward=Math.atan2(facing*(ear.x-sh.x),sh.y-ear.y)*rad;
  if(![c.hip,c.knee,c.ankle].every(good))unavailable.knee='股・膝・足首の位置がそろって確認できません';
  else {
    const knee=p[c.knee],ankle=p[c.ankle],thigh=dist(hip,knee),shin=dist(knee,ankle);
    if(Math.min(thigh,shin)<LIMITS.minLegSegmentPx||thigh/shin<.4||thigh/shin>2.5||ankle.y<=hip.y)unavailable.knee='脚の輪郭が不十分なため膝所見を保留しています';
    else {const a={x:hip.x-knee.x,y:hip.y-knee.y},b={x:ankle.x-knee.x,y:ankle.y-knee.y};
      const angle=180-Math.acos(Math.max(-1,Math.min(1,(a.x*b.x+a.y*b.y)/(thigh*shin))))*rad;
      if(angle>10&&(footFacing||facing)*(a.x*b.y-a.y*b.x)>0)unavailable.knee='膝の曲がる方向が不確かで、所見を保留しています';
      else values.knee=angle;}
  }
  const available=Object.keys(values).filter(k=>values[k]!==null);
  if(!available.length)return {...hold('side_quality',unavailable.forwardTrunk||unavailable.headForward),unavailable};
  return {status:'measured',view:'side',signature:`side:${c.name}:${facing}`,chain:c.name,facing,footFacing,axisSupported,hip,torso,
    motionScale:torso||Math.max(36,neck*2.5),pixels:p,values,available,unavailable,
    motionIndices:[0,c.ear,c.shoulder,c.hip].filter(good),legIndices:[c.knee,c.ankle].filter(good)};
}
export function measureObservation(points,width,height,viewMode='auto',preferredChain=null) {
  if(viewMode==='front')return measurePose(points,width,height);
  if(viewMode==='side')return measureSidePose(points,width,height,preferredChain);
  const side=measureSidePose(points,width,height,preferredChain);
  if(side.status==='measured')return side;
  const front=measurePose(points,width,height);
  return front.status==='measured'?front:{...hold('view_quality','撮影方向・必要な姿勢点を確認中'),unavailable:front.unavailable};
}
export function postureDisplayDetection(d,width,height) {
  const points=d.points||[];
  // Tracking anchors use a stable visible upper-body region, independent of hip availability.
  const usable=i=>points[i]&&Number.isFinite(points[i].x+points[i].y)&&(points[i].visibility??0)>=.5;
  const shoulders=[11,12].every(usable);
  const center=usable(0)?{x:points[0].x,y:points[0].y}:shoulders?mid(points[11],points[12]):{...d.center};
  let associationBox=d.box;
  if(shoulders){
    const sh=mid(points[11],points[12]);
    const sw=Math.max(36,Math.hypot((points[11].x-points[12].x)*width,(points[11].y-points[12].y)*height),usable(0)?Math.hypot((points[0].x-sh.x)*width,(points[0].y-sh.y)*height)*2:0);
    const top=Math.min(sh.y-sw/height*.65,usable(0)?points[0].y:sh.y);
    const x=Math.max(0,sh.x-sw/width*.8),y=Math.max(0,top);
    associationBox={x,y,w:Math.max(.001,Math.min(1,sh.x+sw/width*.8)-x),h:Math.max(.001,Math.min(1,sh.y+sw/height*.5)-y)};
  }
  return {...d,center,associationBox,countable:true};
}

function overlap(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
export function ambiguousPosePoints(people,poses) {
  const candidates=poses.map(p=>people.filter(d=>{
    const o=overlap(d.box,p.box);return o/Math.max(1e-8,d.box.w*d.box.h+p.box.w*p.box.h-o)>=.15;
  }));
  return new Set(poses.filter((p,i)=>candidates[i].length!==1||
    poses.filter((q,j)=>candidates[j].includes(candidates[i][0])).length!==1).map(p=>p.points));
}
function swept(a,b){return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.max(a.x+a.w,b.x+b.w)-Math.min(a.x,b.x),h:Math.max(a.y+a.h,b.y+b.h)-Math.min(a.y,b.y)};}
function overlapsEnough(a,b){return overlap(a,b)/Math.max(1e-8,Math.min(a.w*a.h,b.w*b.h))>LIMITS.overlapFraction;}
export function findingText(kind,sign,mirror=false,facing=1,axisSupported=true) {
  if(['forwardTrunk','headForward'].includes(kind)&&!axisSupported){const direction=sign*facing*(mirror?-1:1),side=direction>0?'右':'左';return {kind,sign:direction,facing:facing*(mirror?-1:1),text:kind==='forwardTrunk'?`横から見た上体が画面${side}へ傾いて見えます`:`頭の位置が肩より画面${side}に見えます`};}
  if(['forwardTrunk','headForward','knee'].includes(kind))return {kind,sign:kind==='knee'?(mirror?-facing:facing):sign*facing*(mirror?-1:1),facing:facing*(mirror?-1:1),text:
    kind==='forwardTrunk'?`上体が${sign>0?'前方':'後方'}へ傾いて見えます`:kind==='headForward'?`頭の位置が肩より${sign>0?'前':'後ろ'}に見えます`:'見えている膝が曲がって見えます'};
  const s=mirror?-sign:sign,side=s>0?'右':'左';
  return {kind,sign:s,text:kind==='trunk'?`上体が画面${side}へ傾いて見えます`:kind==='head'?`頭が画面${side}へ傾いて見えます`:'左右の肩に高さの差が見えます'};
}
export function neutralDescription(kind,value,facing=1,mirror=false,axisSupported=true) {
  const text={trunk:'上体の左右への傾きは小さく見えます',head:'頭の左右への傾きは小さく見えます',shoulder:'左右の肩の高さは近く見えます',
    forwardTrunk:'肩と腰の線は縦方向に近く見えます',headForward:axisSupported?'耳と肩の前後のずれは小さく見えます':'耳と肩の横方向のずれは小さく見えます',
    knee:value<=10?'股・膝・足首は伸びた並びに近く見えます':'膝の小さな曲がりは判定を保留します'}[kind];
  return {kind,sign:0,facing:facing*(mirror?-1:1),text,neutral:true};
}
function schmitt(value,old,on,off){
  if(!Number.isFinite(value))return 0;
  if(Math.abs(value)>=on)return Math.sign(value);
  if(old&&Math.sign(value)===old&&Math.abs(value)>=off)return old;
  return 0;
}
export class PostureAwareness {
  constructor(){this.reset();}
  reset(){this.states=new Map();this.previous=[];this.lastTime=null;this.size='';}
  update(tracks,time,width,height,mirror=false,viewMode='front'){
    const size=`${width}x${height}`;
    if(!Number.isFinite(time)){this.reset();return new Map(tracks.map(t=>[t.id,hold('time','映像の時刻を確認しています')]));}
    if(this.size!==size||this.lastTime!==null&&(time<=this.lastTime||time-this.lastTime>LIMITS.maxGapSeconds))this.reset();
    this.size=size;
    const dt=this.lastTime===null?0:time-this.lastTime;
    const prevById=new Map(this.previous.map(t=>[t.id,t]));
    const blocked=new Set(),overlapping=new Set();
    for(let i=0;i<tracks.length;i++)for(let j=i+1;j<tracks.length;j++){
      const a=tracks[i],b=tracks[j],pa=prevById.get(a.id),pb=prevById.get(b.id);
      if(overlapsEnough(a.box,b.box)||(pa&&pb&&overlapsEnough(swept(pa.box,a.box),swept(pb.box,b.box)))){blocked.add(a.id);blocked.add(b.id);overlapping.add(a.id);overlapping.add(b.id);}
    }
    // Reject ambiguous nearest-neighbour histories, even when the legacy counter keeps its ID.
    for(const t of tracks){
      const p=prevById.get(t.id);
      if(t.poseAssociationAmbiguous){blocked.add(t.id);continue;}
      if(!p)continue;
      const center=b=>({x:b.x+b.w/2,y:b.y+b.h/2});
      const currentCenter=t.center||center(t.box),previousCenter=p.center||center(p.box);
      const own=dist(currentCenter,previousCenter);
      for(const other of this.previous)if(other.id!==t.id&&dist(currentCenter,other.center||center(other.box))<=own+.025)blocked.add(t.id);
      const a=t.associationBox||t.box,b=p.associationBox||p.box;
      const area=a.w*a.h/(b.w*b.h||1);
      if(area<.65||area>1.55||own>.12)blocked.add(t.id);
    }
    const active=new Set(tracks.map(t=>t.id));for(const id of this.states.keys())if(!active.has(id))this.states.delete(id);
    const result=new Map();
    for(const t of tracks){
      if(blocked.has(t.id)){this.states.delete(t.id);result.set(t.id,hold('association',overlapping.has(t.id)?'人物の枠が重なり、対応を確認中です':'人物の位置変化により所見を保留しています'));continue;}
      if(!t.points?.length){this.states.delete(t.id);result.set(t.id,hold('no_pose','骨格の対応を確認中です'));continue;}
      let state=this.states.get(t.id);
      const measured=measureObservation(t.points,width,height,viewMode,state?.previous?.chain);
      if(measured.status!=='measured'){this.states.delete(t.id);result.set(t.id,measured);continue;}
      if(state?.previous?.signature!==measured.signature)state=null;
      if(!state){state={start:time,samples:0,previous:measured,values:{...measured.values},current:emptyCurrent(),pending:{},evidence:{}};this.states.set(t.id,state);}
      if(dt>0&&state.previous){
        const scale=Math.max(measured.motionScale,state.previous.motionScale,36),hipSpeed=measured.hip&&state.previous.hip?dist(measured.hip,state.previous.hip)/scale/dt:0;
        const shared=measured.motionIndices.filter(i=>state.previous.motionIndices.includes(i));
        const pointSpeed=Math.max(0,...shared.map(i=>dist(measured.pixels[i],state.previous.pixels[i])/scale/dt));
        const legs=measured.legIndices.filter(i=>state.previous.legIndices.includes(i));
        const legSpeed=Math.max(0,...legs.map(i=>dist(measured.pixels[i],state.previous.pixels[i])/scale/dt));
        const scaleSpeed=measured.torso&&state.previous.torso?Math.abs(measured.torso-state.previous.torso)/scale/dt:0;
        if(hipSpeed>LIMITS.maxHipSpeed||pointSpeed>LIMITS.maxPointSpeed||legSpeed>LIMITS.maxLegSpeed||scaleSpeed>LIMITS.maxScaleSpeed){
          state.previous=measured;state.start=time;state.samples=0;state.current=emptyCurrent();state.pending={};state.evidence={};state.axisEvidence=null;state.values={...measured.values};result.set(t.id,hold('motion','移動・動作中のため姿勢所見を保留しています'));continue;
        }
      }
      state.samples++;
      const requiredSamples=dt>=LIMITS.slowIntervalSeconds?LIMITS.minSlowSamples:LIMITS.minSamples;
      if(measured.axisSupported){state.axisEvidence??={since:time,samples:0};state.axisEvidence.samples++;}else state.axisEvidence=null;
      const axisConfirmed=!!state.axisEvidence&&state.axisEvidence.samples>=requiredSamples&&time-state.axisEvidence.since>=LIMITS.warmupSeconds;
      const alpha=dt>0?1-Math.exp(-dt/LIMITS.tauSeconds):1;
      for(const k of KINDS){
        const value=measured.values[k];
        if(value==null){state.values[k]=null;state.current[k]=0;delete state.pending[k];delete state.evidence[k];continue;}
        state.evidence[k]??={since:time,samples:0};state.evidence[k].samples++;
        state.values[k]=state.values[k]==null?value:state.values[k]+alpha*(value-state.values[k]);
        const target=schmitt(state.values[k],state.current[k],LIMITS[`${k}On`],LIMITS[`${k}Off`]);
        // A changed sign or falling below the exit boundary suppresses stale findings immediately.
        if(state.current[k]&&target!==state.current[k])state.current[k]=0;
        if(target===state.current[k])delete state.pending[k];
        else {
          if(state.pending[k]?.target!==target)state.pending[k]={target,since:time};
          if(time-state.pending[k].since>=LIMITS.confirmSeconds){state.current[k]=target;delete state.pending[k];}
        }
      }
      state.previous=measured;
      if(time-state.start<LIMITS.warmupSeconds||state.samples<requiredSamples){result.set(t.id,hold('warming','姿勢の位置関係を確認中'));continue;}
      const confirmed=k=>state.evidence[k]?.samples>=requiredSamples&&time-state.evidence[k].since>=LIMITS.warmupSeconds;
      const priority=measured.view==='side'?['forwardTrunk','knee','headForward']:['trunk','head','shoulder'];
      const iconFacing=k=>k==='knee'?(measured.footFacing??measured.facing):measured.facing;
      const findings=priority.filter(k=>state.current[k]&&confirmed(k)).slice(0,LIMITS.maxFindings).map(k=>findingText(k,state.current[k],mirror,iconFacing(k),axisConfirmed));
      const descriptions=priority.filter(k=>measured.available.includes(k)&&(!state.current[k]||!confirmed(k))).slice(0,LIMITS.maxFindings-findings.length).map(k=>state.pending[k]||!confirmed(k)?{kind:'checking',sign:0,text:'姿勢の位置関係を確認中'}:neutralDescription(k,state.values[k],iconFacing(k),mirror,axisConfirmed));
      result.set(t.id,{status:findings.length?'observed':'ready',reason:findings.length?'image_relation':'no_active_cue',findings,
        view:measured.view,descriptions,available:measured.available,unavailable:measured.unavailable,
        text:findings.length?'':descriptions[0]?.text||'必要な姿勢点を確認中'});
    }
    this.previous=tracks.map(t=>({id:t.id,box:{...t.box},center:t.center?{...t.center}:null,associationBox:t.associationBox?{...t.associationBox}:null}));this.lastTime=time;
    return result;
  }
}
