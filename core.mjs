export const VERSION = '1.1.0';
export const MODEL_THRESHOLDS={minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5};
export const JOINTS = { leftElbow: [11,13,15], rightElbow: [12,14,16], leftKnee: [23,25,27], rightKnee: [24,26,28] };
export const EDGES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[27,31],[28,30],[30,32],[28,32]];
export function visible(p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .5; }
export function angle2D(points, joint, width, height) {
  const indices = JOINTS[joint];
  if (!indices || !indices.every(i => visible(points[i]))) return null;
  const [a,b,c] = indices.map(i => ({x:points[i].x*width,y:points[i].y*height}));
  const u={x:a.x-b.x,y:a.y-b.y}, v={x:c.x-b.x,y:c.y-b.y};
  const den=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);
  return den > 1e-8 ? Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/den)))*180/Math.PI : null;
}
export function poseDetection(points) {
  const good=points.filter(visible);
  if(good.length<4) return null;
  const xs=good.map(p=>p.x), ys=good.map(p=>p.y);
  const raw={left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};
  const face=points.slice(0,11).filter(visible);
  const headPadding=face.length>=3?Math.max(.015,(Math.max(...face.map(p=>p.y))-Math.min(...face.map(p=>p.y)))*.65):.01;
  const left=Math.max(0,Math.min(1,raw.left-.025)),top=Math.max(0,Math.min(1,raw.top-headPadding));
  const right=Math.max(left,Math.min(1,raw.right+.025)),bottom=Math.max(top,Math.min(1,raw.bottom+.02));
  const box={x:left,y:top,w:right-left,h:bottom-top};
  const hips=[points[23],points[24]];
  const countable=hips.every(visible);
  const center=countable?{x:(hips[0].x+hips[1].x)/2,y:(hips[0].y+hips[1].y)/2}:{x:box.x+box.w/2,y:box.y+box.h/2};
  const inFrame=p=>visible(p)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
  const headVisible=points.slice(0,11).some(inFrame);
  const shouldersVisible=[11,12].every(i=>inFrame(points[i]));
  const feetVisible=[27,29,31].some(i=>inFrame(points[i]))&&[28,30,32].some(i=>inFrame(points[i]));
  const fullBody=headVisible&&shouldersVisible&&[23,24].every(i=>inFrame(points[i]))&&feetVisible;
  return {points,box,center,countable,fullBody,headPaddingEstimated:face.length>=3};
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class Tracker {
  constructor({axis='x',line=.5,dwell=3,radius=.03,maxGap=.75,gate=.18,deadBand=.035,countingEnabled=true}={}) {
    this.config={axis,line,dwell,radius,maxGap,gate,deadBand,countingEnabled}; this.reset();
  }
  reset(){this.tracks=[];this.nextId=1;this.forward=0;this.reverse=0;this.stopEvents=0;this.lastTime=-Infinity;}
  update(detections,time){
    if(!Number.isFinite(time)||time<=this.lastTime) return {tracks:[],events:[]};
    this.lastTime=time;
    const c=this.config, events=[];
    this.tracks=this.tracks.filter(t=>time-t.lastSeen<=c.maxGap);
    // Nearest-center matching is deliberately conservative, not biometric re-identification.
    const pairs=[];
    this.tracks.forEach(t=>detections.forEach((d,i)=>{const cost=distance(t.center,d.center);if(cost<c.gate&&t.countable===d.countable)pairs.push({t,i,cost});}));
    pairs.sort((a,b)=>a.cost-b.cost);
    const usedT=new Set(), usedD=new Set(), matches=new Map();
    for(const p of pairs)if(!usedT.has(p.t.id)&&!usedD.has(p.i)){usedT.add(p.t.id);usedD.add(p.i);matches.set(p.i,p.t);}
    for(const t of this.tracks)if(!usedT.has(t.id)){t.side=0;t.anchor=null;t.still=false;t.since=time;}
    const active=detections.map((d,i)=>{
      let t=matches.get(i);
      if(!t){t={id:this.nextId++,side:0,anchor:null,since:time,still:false};this.tracks.push(t);}
      Object.assign(t,d,{lastSeen:time});
      if(!d.countable||!c.countingEnabled){t.side=0;t.still=false;t.anchor=null;return t;}
      const delta=d.center[c.axis]-c.line, side=delta< -c.deadBand?-1:delta>c.deadBand?1:0;
      if(side&&t.side&&side!==t.side){const type=side===1?'A_to_B':'B_to_A';if(side===1)this.forward++;else this.reverse++;events.push({time,id:t.id,type});}
      if(side)t.side=side;
      if(!t.anchor||distance(t.anchor,d.center)>c.radius){t.anchor={...d.center};t.since=time;t.still=false;}
      else if(!t.still&&time-t.since>=c.dwell){t.still=true;this.stopEvents++;events.push({time,id:t.id,type:'stop_start'});}
      return t;
    });
    return {tracks:active,events};
  }
}
export function csv(rows){
  const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s)&&typeof v!=='number')s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}
