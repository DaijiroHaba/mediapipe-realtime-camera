// Display-only, image-plane observations. All limits are engineering heuristics,
// not clinical cutoffs or validated probabilities. See POSTURE_AWARENESS.md.
export const AWARENESS_VERSION = '0.1.0';
export const LIMITS = Object.freeze({
  visibility: .8, margin: .015, minTorsoPx: 70, minShoulderPx: 60,
  minFacePx: 24, shoulderTorsoMin: .65, shoulderTorsoMax: 2,
  hipShoulderMin: .45, hipShoulderMax: 1.4, noseOffsetMax: .22,
  shoulderDepthRatioMax: .35, hipDepthRatioMax: .35,
  trunkOn: 10, trunkOff: 6, headOn: 12, headOff: 8,
  shoulderOn: 10, shoulderOff: 6, headAgreement: 12,
  tauSeconds: .22, confirmSeconds: .45, warmupSeconds: .65,
  maxGapSeconds: .55, maxHipSpeed: .45, maxPointSpeed: 1.4,
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
  if(!(width>0 && height>0 && Number.isFinite(width+height)))return hold('dimensions','姿勢を確認中');
  if(![11,12,23,24].every(i=>goodPoint(points?.[i])))return hold('body_visibility','肩と腰が見える位置で試してください');
  const p=points.map(q=>q?{x:q.x*width,y:q.y*height}:null);
  const shoulder=mid(p[11],p[12]),hip=mid(p[23],p[24]),torso=dist(shoulder,hip);
  const shoulderWidth=dist(p[11],p[12]),hipWidth=dist(p[23],p[24]);
  if(torso<LIMITS.minTorsoPx||shoulderWidth<LIMITS.minShoulderPx)return hold('small','もう少し近くで試してください');
  if(hip.y-shoulder.y<torso*.7)return hold('orientation','正面を向いて試してください');
  const face=[0,2,5,7,8];
  if(!face.every(i=>goodPoint(points[i])))return hold('face_visibility','顔と両肩が見える向きで試してください');
  const earMid=mid(p[7],p[8]),earWidth=dist(p[7],p[8]);
  // Image geometry and relative z are rejection cues only. They do not certify a frontal view.
  const depthOK=(a,b,len)=>Number.isFinite(points[a].z)&&Number.isFinite(points[b].z)&&
    Math.abs(points[a].z-points[b].z)*width/len<=LIMITS.shoulderDepthRatioMax;
  const noseOffset=dist(p[0],earMid)/earWidth;
  const eyesWidth=dist(p[2],p[5]);
  if(earWidth<LIMITS.minFacePx||eyesWidth<12)return hold('small_face','顔が見える距離で試してください');
  // Nose is normally below the ear midpoint: use projection onto the ear axis for yaw rejection.
  const earAxis={x:(p[8].x-p[7].x)/earWidth,y:(p[8].y-p[7].y)/earWidth};
  const noseLateral=Math.abs((p[0].x-earMid.x)*earAxis.x+(p[0].y-earMid.y)*earAxis.y)/earWidth;
  if(shoulderWidth/torso<LIMITS.shoulderTorsoMin||shoulderWidth/torso>LIMITS.shoulderTorsoMax||
    hipWidth/shoulderWidth<LIMITS.hipShoulderMin||hipWidth/shoulderWidth>LIMITS.hipShoulderMax||
    noseLateral>LIMITS.noseOffsetMax||noseOffset>1||
    !depthOK(11,12,shoulderWidth)||!depthOK(23,24,hipWidth))return hold('view','正面を向いて試してください');
  if(earMid.y>=shoulder.y||Math.abs(earMid.x-shoulder.x)>shoulderWidth*.8)return hold('geometry','姿勢を確認中');
  const ears=lineAngle(p[7],p[8]),eyes=lineAngle(p[2],p[5]);
  const head=Math.abs(ears-eyes)<=LIMITS.headAgreement&&Math.abs(ears)<45?ears:null;
  return {status:'measured',hip,torso,pixels:p,legIndices:[25,26,27,28].filter(i=>goodPoint(points[i])),
    values:{trunk:Math.atan2(shoulder.x-hip.x,hip.y-shoulder.y)*rad,
      head,shoulder:lineAngle(p[11],p[12])}};
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
export function findingText(kind,sign,mirror=false) {
  const s=mirror?-sign:sign,side=s>0?'右':'左';
  return {kind,sign:s,text:kind==='trunk'?`上体が画面${side}へ傾いて見えます`:kind==='head'?`頭が画面${side}へ傾いて見えます`:'左右の肩に高さの差が見えます'};
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
  update(tracks,time,width,height,mirror=false){
    const size=`${width}x${height}`;
    if(!Number.isFinite(time)){this.reset();return new Map(tracks.map(t=>[t.id,hold('time','姿勢を確認中')]));}
    if(this.size!==size||this.lastTime!==null&&(time<=this.lastTime||time-this.lastTime>LIMITS.maxGapSeconds))this.reset();
    this.size=size;
    const dt=this.lastTime===null?0:time-this.lastTime;
    const prevById=new Map(this.previous.map(t=>[t.id,t]));
    const blocked=new Set();
    for(let i=0;i<tracks.length;i++)for(let j=i+1;j<tracks.length;j++){
      const a=tracks[i],b=tracks[j],pa=prevById.get(a.id),pb=prevById.get(b.id);
      if(overlapsEnough(a.box,b.box)||(pa&&pb&&overlapsEnough(swept(pa.box,a.box),swept(pb.box,b.box)))){blocked.add(a.id);blocked.add(b.id);}
    }
    // Reject ambiguous nearest-neighbour histories, even when the legacy counter keeps its ID.
    for(const t of tracks){
      const p=prevById.get(t.id);
      if(t.poseAssociationAmbiguous){blocked.add(t.id);continue;}
      if(!p)continue;
      const center=b=>({x:b.x+b.w/2,y:b.y+b.h/2});
      const own=dist(center(t.box),center(p.box));
      for(const other of this.previous)if(other.id!==t.id&&dist(center(t.box),center(other.box))<=own+.025)blocked.add(t.id);
      const area=t.box.w*t.box.h/(p.box.w*p.box.h||1);
      if(area<.65||area>1.55||own>.12)blocked.add(t.id);
    }
    const active=new Set(tracks.map(t=>t.id));for(const id of this.states.keys())if(!active.has(id))this.states.delete(id);
    const result=new Map();
    for(const t of tracks){
      if(blocked.has(t.id)){this.states.delete(t.id);result.set(t.id,hold('association','人の重なり・対応を確認中'));continue;}
      if(!t.points?.length){this.states.delete(t.id);result.set(t.id,hold('no_pose','骨格を確認中'));continue;}
      const measured=measurePose(t.points,width,height);
      if(measured.status!=='measured'){this.states.delete(t.id);result.set(t.id,measured);continue;}
      let state=this.states.get(t.id);
      if(!state){state={start:time,previous:measured,values:{...measured.values},current:{trunk:0,head:0,shoulder:0},pending:{}};this.states.set(t.id,state);}
      if(dt>0&&state.previous){
        const scale=Math.max(measured.torso,state.previous.torso),hipSpeed=dist(measured.hip,state.previous.hip)/scale/dt;
        const pointSpeed=Math.max(...[0,2,5,7,8,11,12,23,24].map(i=>dist(measured.pixels[i],state.previous.pixels[i])/scale/dt));
        const legs=measured.legIndices.filter(i=>state.previous.legIndices.includes(i));
        const legSpeed=Math.max(0,...legs.map(i=>dist(measured.pixels[i],state.previous.pixels[i])/scale/dt));
        const scaleSpeed=Math.abs(measured.torso-state.previous.torso)/scale/dt;
        if(hipSpeed>LIMITS.maxHipSpeed||pointSpeed>LIMITS.maxPointSpeed||legSpeed>LIMITS.maxLegSpeed||scaleSpeed>LIMITS.maxScaleSpeed){
          this.states.delete(t.id);result.set(t.id,hold('motion','動きを確認中・ゆっくり試してください'));continue;
        }
      }
      const alpha=dt>0?1-Math.exp(-dt/LIMITS.tauSeconds):1;
      for(const k of ['trunk','head','shoulder']){
        const value=measured.values[k];
        if(value===null){state.values[k]=null;state.current[k]=0;delete state.pending[k];continue;}
        state.values[k]=state.values[k]===null?value:state.values[k]+alpha*(value-state.values[k]);
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
      if(time-state.start<LIMITS.warmupSeconds){result.set(t.id,hold('warming','姿勢を確認中'));continue;}
      const findings=['trunk','head','shoulder'].filter(k=>state.current[k]).slice(0,LIMITS.maxFindings).map(k=>findingText(k,state.current[k],mirror));
      result.set(t.id,{status:findings.length?'observed':'ready',reason:findings.length?'image_relation':'no_active_cue',findings,
        text:findings.length?'':measured.values.head===null?'頭の向きを確認中':'姿勢を変えて表示を試してみましょう'});
    }
    this.previous=tracks.map(t=>({id:t.id,box:{...t.box}}));this.lastTime=time;
    return result;
  }
}
