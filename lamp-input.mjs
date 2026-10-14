// @ts-check
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** Crop is specified in the mirrored display's source coordinates, not a scoring fence. */
export function inputFrame(config){
 if(config.mapMode!=='comfortable')return {left:0,top:0,width:1,height:1};
 const width=config.width,height=config.height;
 return {left:clamp(config.cx-width/2,0,1-width),top:clamp(config.cy-height/2,0,1-height),width,height};
}
/** One affine transform for raw, unmirrored landmarks AND the uncropped video element.
 * Preserve aspect: contain in ordinary mode, cover in fullscreen.
 * Both video and points use the same crop; never shift a fingertip to an edge. */
export function viewTransform(config,w,h,sourceWidth=960,sourceHeight=540){
 if(![w,h,sourceWidth,sourceHeight].every(v=>Number.isFinite(v)&&v>0))throw Error('表示寸法が不正です');
 const crop=inputFrame(config),scale=(config.displayFit==='cover'?Math.max:Math.min)(w/(sourceWidth*crop.width),h/(sourceHeight*crop.height)),mirror=config.mirror===true;
 const content={width:sourceWidth*crop.width*scale,height:sourceHeight*crop.height*scale,left:0,top:0};
 content.left=(w-content.width)/2;content.top=(h-content.height)/2;
 const a=mirror?-scale:scale,d=scale,e=content.left+(mirror?1-crop.left:-crop.left)*sourceWidth*scale,f=content.top-crop.top*sourceHeight*scale;
 return {crop,content,sourceWidth,sourceHeight,w,h,mirror,scale,a,d,e,f,matrix:`matrix(${a},0,0,${d},${e},${f})`};
}
export function projectPoint(point,view){
 const x=(view.a*point.x*view.sourceWidth+view.e)/view.w,y=(view.d*point.y*view.sourceHeight+view.f)/view.h;
 const orientedX=view.mirror?1-point.x:point.x,u=(orientedX-view.crop.left)/view.crop.width,v=(point.y-view.crop.top)/view.crop.height;
 const inSource=Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1;
 const visible=inSource&&u>=-1e-9&&u<=1+1e-9&&v>=-1e-9&&v<=1+1e-9&&x>=-1e-9&&x<=1+1e-9&&y>=-1e-9&&y<=1+1e-9;
 const direction=[u<0||x<0?'←':u>1||x>1?'→':'',v<0||y<0?'↑':v>1||y>1?'↓':''].filter(Boolean).join('');
 return {x,y,visible,inRange:visible,direction};
}
export function mapCursor(cursor,config,w,h,sourceWidth=960,sourceHeight=540){
 const point=projectPoint(cursor,viewTransform(config,w,h,sourceWidth,sourceHeight));
 return {...cursor,...point,eligible:cursor.eligible&&point.visible};
}
/** Mouse coordinates already refer to the board's inner content box; do not clamp. */
export function mouseCursor(cursor,_w,_h){return {...cursor,visible:true,inRange:true,direction:''};}
