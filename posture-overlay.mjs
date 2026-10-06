// Original vector pictograms. No font-glyph dependencies and no diagnostic colors.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const intersects=(a,b)=>a.x<b.x+b.w+4&&a.x+a.w+4>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y;
export function layoutCards(items,width,height){
  const placed=[];
  for(const item of items){
    const w=Math.min(width-8,item.w),h=Math.min(height-8,item.h);
    const x=clamp(item.anchor.x-w/2,4,width-w-4),top=clamp(item.anchor.y-h-8,4,height-h-4);
    const candidates=[{x,y:top}];
    for(let y=top-h-6;y>=4;y-=h+6)candidates.push({x,y});
    candidates.push({x,y:clamp(item.anchor.y+8,4,height-h-4)});
    for(let y=4;y+h<=height-4;y+=h+6)for(let gx=4;gx+w<=width-4;gx+=w+6)candidates.push({x:gx,y});
    const free=candidates.filter(c=>!placed.some(p=>intersects({...c,w,h},p)));
    // Prefer above the person's box. Only use inside/below placement at an image edge or when crowded.
    const cost=c=>(c.y+h>item.anchor.y-4?10000:0)+Math.hypot(c.x+w/2-item.anchor.x,c.y+h-item.anchor.y);
    free.sort((a,b)=>cost(a)-cost(b));
    const pos=free[0]||candidates[0];
    placed.push({...item,...pos,w,h,crowded:!free.length});
  }
  return placed;
}
export function drawPostureIcon(ctx,kind,sign,x,y,size){
  ctx.save();ctx.translate(x,y);ctx.scale(size/32,size/32);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';
  const line=(...pts)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
  const circle=(x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();};
  if(kind==='trunk'){circle(16+sign*6,6,3);line([16+sign*5,10],[16,24],[10,30]);line([16,24],[23,30]);line([8+sign*5,14],[24+sign*5,14]);}
  else if(kind==='head'){ctx.save();ctx.translate(16,10);ctx.rotate(sign*.32);ctx.beginPath();ctx.ellipse(0,0,6,8,0,0,Math.PI*2);ctx.stroke();line([-3,-1],[3,-1]);ctx.restore();line([16,19],[16,25]);line([5,28],[10,23],[22,23],[27,28]);}
  else if(kind==='shoulder'){circle(16,6,4);line([16,11],[16,26]);line([4,17-sign*4],[28,17+sign*4]);circle(4,17-sign*4,2);circle(28,17+sign*4,2);}
  else {circle(16,16,11);line([12,13],[16,10],[20,13],[20,16],[16,19],[16,21]);circle(16,25,.6);}
  ctx.restore();
}
function linesFor(ctx,text,maxWidth){
  const lines=[];let line='';for(const ch of text){if(line&&ctx.measureText(line+ch).width>maxWidth){lines.push(line);line=ch;}else line+=ch;}if(line)lines.push(line);return lines;
}
export function drawAwareness(ctx,tracks,observations,width,height,mirror){
  const scale=clamp(width/960,.65,2),font=16*scale,lineHeight=21*scale,icon=30*scale;
  const compact=tracks.length>6,cardWidth=Math.min(width-8,(compact?230:340)*scale),pad=10*scale;
  ctx.save();ctx.font=`600 ${font}px system-ui, "Yu Gothic", sans-serif`;
  const items=tracks.map(t=>{
    const value=observations.get(t.id)||{text:'姿勢を確認中',findings:[]};
    const sourceRows=value.findings.length?value.findings:[{kind:'checking',sign:0,text:value.text}];
    const rows=sourceRows.map(row=>({...row,lines:linesFor(ctx,row.text,cardWidth-icon-pad*3)}));
    const rowsHeight=rows.reduce((n,row)=>n+Math.max(icon,row.lines.length*lineHeight)+8*scale,0);
    return {id:t.id,rows,w:cardWidth,h:rowsHeight+25*scale,
      anchor:{x:(mirror?1-t.box.x-t.box.w/2:t.box.x+t.box.w/2)*width,y:t.box.y*height}};
  });
  const cards=layoutCards(items,width,height);
  // Leader lines are drawn first, and ID numbers are repeated on each box and card.
  ctx.strokeStyle='#b9e1ef';ctx.lineWidth=1.5*scale;
  for(const c of cards){ctx.beginPath();ctx.moveTo(clamp(c.anchor.x,1,width-1),clamp(c.anchor.y,1,height-1));ctx.lineTo(c.x+c.w/2,c.y+c.h/2);ctx.stroke();}
  for(const c of cards){
    ctx.fillStyle='rgba(13,36,48,.94)';ctx.strokeStyle='#a9dbe8';ctx.lineWidth=1.2*scale;
    ctx.beginPath();ctx.roundRect(c.x,c.y,c.w,c.h,7*scale);ctx.fill();ctx.stroke();
    ctx.fillStyle='#b7dbe5';ctx.font=`600 ${12*scale}px system-ui, "Yu Gothic", sans-serif`;
    ctx.fillText(`#${c.id}  いまの見え方`,c.x+pad,c.y+16*scale);
    let y=c.y+24*scale;
    for(const row of c.rows){
      ctx.strokeStyle='#a6e8d6';drawPostureIcon(ctx,row.kind,row.sign,c.x+pad,y,icon);
      ctx.fillStyle='#f4fbff';ctx.font=`600 ${font}px system-ui, "Yu Gothic", sans-serif`;
      row.lines.forEach((line,i)=>ctx.fillText(line,c.x+pad*2+icon,y+font+i*lineHeight));
      y+=Math.max(icon,row.lines.length*lineHeight)+8*scale;
    }
  }
  ctx.restore();return cards;
}
