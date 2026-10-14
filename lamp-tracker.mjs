// @ts-check
const valid=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
const dist=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
const transform=(p,mirror)=>({x:mirror?1-p.x:p.x,y:p.y});
/** Palm anchors track hands; INDEX_FINGER_TIP (8) defines cursor position.
 * Technical guards cannot establish tip accuracy or detect all occlusion. */
export function fingerObservations(result,mirror=false){
 const points=[],reasons=[];
 for(const p of (result.landmarks||[]).slice(0,2)){
  const bases=[5,9,13,17].map(k=>p[k]),fingers=[6,7,8].map(k=>p[k]),wrist=p[0];
  // A bottom-clipped wrist alone need not reject a detected, interior index finger.
  // Require all four MCP anchors and all three index points; never invent a missing point.
  const bottomWrist=!!wrist&&Number.isFinite(wrist.x)&&Number.isFinite(wrist.y)&&wrist.x>.003&&wrist.x<.997&&wrist.y>=.997&&wrist.y<=1.15&&bases.every(q=>valid(q)&&q.x>.003&&q.x<.997&&q.y>.003&&q.y<.997)&&fingers.every(q=>valid(q)&&q.x>.003&&q.x<.997&&q.y>.003&&q.y<.997);
  const anchors=bottomWrist?bases:[wrist,...bases],required=[...anchors,...fingers];
  if(required.some(q=>!valid(q))){reasons.push('指先・手の追跡点を確認できません（映像端・遮蔽等）');continue;}
  const edge=required.some(q=>q.x<=.003||q.x>=.997||q.y<=.003||q.y>=.997);
  const palm={x:anchors.reduce((a,q)=>a+q.x,0)/anchors.length,y:anchors.reduce((a,q)=>a+q.y,0)/anchors.length};
  const reason=edge?'映像端で手の追跡点を確認中':bottomWrist?'手首が下で見切れ：検出された指先と指の付け根を使用':'';
  points.push({palm:transform(palm,mirror),tip:transform(p[8],mirror),support:bottomWrist?'mcp4':'wrist-mcp4',quality:!edge,reason});
  if(reason)reasons.push(reason);
 }
 if(!(result.landmarks||[]).length)reasons.push('手をカメラに映してください（未検出）');
 return {points,reasons};
}
export function fingerPoints(result,mirror=true){return fingerObservations(result,mirror).points;}
/** Palm-only compatibility for previous fixtures. */
export function palmPoints(result,mirror=true){
 return (result.landmarks||[]).map(p=>{
  const q=[0,5,9,13,17].map(k=>p[k]);if(q.some(a=>!valid(a)))return null;
  return transform({x:q.reduce((s,a)=>s+a.x,0)/5,y:q.reduce((s,a)=>s+a.y,0)/5},mirror);
 }).filter(Boolean).slice(0,2);
}
export class FingerTracker{
 constructor(){this.reset();}
 reset(){this.tracks=[];this.nextId=1;this.lastTime=null;}
 update(points,now,aspect=16/9,smoothing=true){
  if(this.lastTime!==null&&(now<=this.lastTime||now-this.lastTime>.2))this.reset();
  const dt=this.lastTime===null?0:now-this.lastTime;this.lastTime=now;
  if(!points.length){this.tracks=[];return [];}
  const close=points.length===2&&dist(points[0].palm,points[1].palm,aspect)<.075;
  let ambiguous=close,priors=points.map(()=>null);
  if(!ambiguous&&points.length===2&&this.tracks.length===2){
   const direct=dist(points[0].palm,this.tracks[0].raw,aspect)+dist(points[1].palm,this.tracks[1].raw,aspect);
   const reverse=dist(points[0].palm,this.tracks[1].raw,aspect)+dist(points[1].palm,this.tracks[0].raw,aspect);
   ambiguous=Math.abs(direct-reverse)<.04;
   priors=direct<=reverse?[this.tracks[0],this.tracks[1]]:[this.tracks[1],this.tracks[0]];
  }else if(!ambiguous){
   const used=new Set();priors=points.map(p=>{
    const c=this.tracks.filter(t=>!used.has(t.id)).map(t=>({t,d:dist(p.palm,t.raw,aspect)})).sort((a,b)=>a.d-b.d);
    if(c.length>1&&Math.abs(c[0].d-c[1].d)<.035)return null;
    if(c[0])used.add(c[0].t.id);return c[0]?.t||null;
   });
  }
  const output=points.map((p,i)=>{
   let prior=ambiguous?null:priors[i];
   if(prior&&prior.support!==p.support)prior=null; // anchor change needs reacquisition, not an immediate hit
   if(prior&&(dist(p.palm,prior.raw,aspect)>.25||dist(p.tip,prior.tip,aspect)>.3))prior=null;
   const speed=prior&&dt?dist(p.tip,prior.tip,aspect)/dt:0;
   // 25–50 ms engineering smoothing, weaker while moving.
   const tau=.05-.025*Math.min(1,speed/.8),alpha=dt?1-Math.exp(-dt/tau):1;
   return {id:prior?.id??String(this.nextId++),raw:p.palm,tip:p.tip,support:p.support,x:prior&&smoothing?prior.x+alpha*(p.tip.x-prior.x):p.tip.x,y:prior&&smoothing?prior.y+alpha*(p.tip.y-prior.y):p.tip.y,eligible:!!prior&&!ambiguous&&p.quality!==false,reason:p.reason||(!prior||ambiguous?'手の対応を確認中':''),smoothingOffset:prior&&smoothing?Math.hypot((prior.x+alpha*(p.tip.x-prior.x)-p.tip.x)*aspect,prior.y+alpha*(p.tip.y-prior.y)-p.tip.y):0};
  });
  this.tracks=output;return output;
 }
}
export class PalmTracker extends FingerTracker{
 update(points,now,aspect=1){return super.update(points.map(p=>({palm:p,tip:p})),now,aspect);}
}
export function selectOneCursor(tracks,preferred=null){
 const chosen=tracks.find(t=>t.id===preferred)||tracks[0];
 return {id:chosen?.id??null,cursors:chosen?[{...chosen,eligible:chosen.id===preferred&&chosen.eligible}]:[]};
}

