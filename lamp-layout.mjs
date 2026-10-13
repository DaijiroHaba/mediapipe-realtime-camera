// @ts-check
export const MIN_RADIUS=14,GAP=8,CURSOR_PADDING=18;
const grids={6:[3,2],12:[4,3],30:[6,5],50:[10,5]};
export function seededRandom(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function grid(count,w,h,r){
 const [cols,rows]=grids[count]||grids[30],pad=r+20;
 return Array.from({length:count},(_,id)=>({id,x:(pad+(id%cols)*(w-2*pad)/(cols-1))/w,y:(pad+Math.floor(id/cols)*(h-2*pad)/(rows-1))/h}));
}
export function geometry(points,w,h,radius){
 let separation=Infinity,edge=Infinity;
 for(let i=0;i<points.length;i++){const p=points[i];edge=Math.min(edge,p.x*w,(1-p.x)*w,p.y*h,(1-p.y)*h);for(let j=0;j<i;j++)separation=Math.min(separation,Math.hypot((p.x-points[j].x)*w,(p.y-points[j].y)*h));}
 const r=Math.max(0,Math.min(radius,separation/2-GAP/2,edge-20));
 return {radius:r,separation,valid:r>=MIN_RADIUS-1e-7,minimumRadius:MIN_RADIUS,gap:GAP};
}
/** Four corner zones + seeded rejection sampling. Not uniform randomization for research allocation. */
export function createLayout(config,w=960,h=540,seed=0){
 const count=config.lampCount??30,[cols,rows]=grids[count]||grids[30];
 const desired=Math.min(36,Math.max(MIN_RADIUS,Math.min(w,h)*.06)),pad=desired+20;
 const limit=Math.min((w-2*pad)/(cols-1),(h-2*pad)/(rows-1))/2-GAP/2;
 const gridRadius=Math.max(0,Math.min(desired,limit)),gridPoints=grid(count,w,h,Math.max(MIN_RADIUS,gridRadius));
 if(gridRadius<MIN_RADIUS)return {points:gridPoints,radius:gridRadius,valid:false,seed,reason:'画面が小さく、ランプ半径14pxと間隔8pxを確保できません'};
 if(config.placement!=='random')return {points:gridPoints,radius:gridRadius,valid:true,seed,reason:''};
 const radius=Math.max(MIN_RADIUS,Math.min(28,gridRadius*.75)),margin=radius+20,rng=seededRandom(seed),points=[];
 const minDistance=radius*2+GAP,left=margin,right=w-margin,top=margin,bottom=h-margin;
 for(let attempts=0;points.length<count&&attempts<8000;attempts++){
  const k=points.length;
  let u=rng(),v=rng();
  if(k<4){u=(k%2? .86:0)+u*.14;v=(k>=2?.86:0)+v*.14;}
  const x=left+u*(right-left),y=top+v*(bottom-top);
  if(points.every(p=>Math.hypot(x-p.x*w,y-p.y*h)>=minDistance))points.push({id:k,x:x/w,y:y/h});
 }
 if(points.length!==count)return {points:gridPoints,radius:gridRadius,valid:false,seed,reason:'この画面とseedではランダム配置を作れません。個数・画面サイズ・seedを調整してください'};
 return {points,radius,valid:true,seed,reason:''};
}
export function targetPositions(config,w=960,h=540,seed=config.seed>=0?config.seed:0){return createLayout(config,w,h,seed).points;}
export function targetLayout(config,w,h){const p=createLayout(config,w,h,config.seed>=0?config.seed:0);return {...geometry(p.points,w,h,p.radius),valid:p.valid&&geometry(p.points,w,h,p.radius).valid,reason:p.reason};}

