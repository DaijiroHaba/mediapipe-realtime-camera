// @ts-check
/** Same-origin camera coordination; no images or persistent storage. */
export class CameraLease{
 constructor(onLost){
  this.onLost=onLost;this.ticket=null;
  this.channel=typeof BroadcastChannel==='function'?new BroadcastChannel('mediapipe-camera-owner-v1'):null;
  this.channel?.addEventListener('message',({data})=>{
   if(!this.ticket||data?.type!=='claim'||!Number.isFinite(data.time)||typeof data.id!=='string')return;
   const newer=data.time>this.ticket.time||(data.time===this.ticket.time&&data.id>this.ticket.id);
   if(newer){this.ticket=null;this.onLost();}else this.channel?.postMessage({type:'claim',...this.ticket});
  });
 }
 claim(){this.ticket={time:Date.now(),id:crypto.randomUUID()};this.channel?.postMessage({type:'claim',...this.ticket});}
 release(){this.ticket=null;}
 close(){this.release();this.channel?.close();}
}

