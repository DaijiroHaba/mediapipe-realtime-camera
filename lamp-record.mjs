// @ts-check
// Game observations only. No camera images, landmark series or person identifiers.
export const RECORD_VERSION='lamp-observation/1.1';
export const SCORE_VERSION='hit10/1.0';
export const SCORE_FORMULA='score = extinguished * 10';
export const MISSING='NA';
export function quantile(values,p){
 const a=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;
 const at=(a.length-1)*p,lo=Math.floor(at);return a[lo]+(a[Math.ceil(at)]-a[lo])*(at-lo);
}
const copy=v=>JSON.parse(JSON.stringify(v));
const region=(x,y)=>['上','中','下'][Math.min(2,Math.floor(y*3))]+['左','中央','右'][Math.min(2,Math.floor(x*3))];
const sum=(a,key)=>a.reduce((n,r)=>n+(r[key]??0),0);
const duration=(a,kind)=>a.filter(s=>s.kind===kind).reduce((n,s)=>n+s.wall_end_s-s.wall_start_s,0);
export function aggregate(record){
 const tasks=record.tasks,hits=tasks.filter(t=>t.outcome==='extinguished'),expired=tasks.filter(t=>t.outcome==='expired').length;
 const unresolved=tasks.filter(t=>t.outcome==='unresolved').length,pending=tasks.filter(t=>t.outcome==='pending').length;
 const denominator=hits.length+expired,response=hits.map(t=>t.response_ms).filter(Number.isFinite),q1=quantile(response,.25),q3=quantile(response,.75);
 const targets=record.conditions.positions.map(p=>{
  const a=tasks.filter(t=>t.target_id===p.id),h=a.filter(t=>t.outcome==='extinguished').length,e=a.filter(t=>t.outcome==='expired').length;
  return {target_id:p.id,x:p.x,y:p.y,region:region(p.x,p.y),issued:a.length,extinguished:h,expired:e,unresolved:a.filter(t=>t.outcome==='unresolved').length,pending:a.filter(t=>t.outcome==='pending').length,denominator:h+e,success_rate:h+e?h/(h+e):null,status:a.length?'出題あり':'未出題'};
 });
 const quality=record.quality,frameCount=sum(quality,'frames'),accepted=sum(quality,'accepted'),inference=quality.flatMap(q=>q.inference_ms),software=quality.flatMap(q=>q.software_ms);
 const analysisWindow=quality.reduce((n,q)=>n+(q.first_s!==null&&q.last_s>q.first_s?q.last_s-q.first_s:0),0);
 const fpsNumerator=quality.reduce((n,q)=>n+(q.first_s!==null&&q.last_s>q.first_s?Math.max(0,q.frames-1):0),0);
 const pq=record.player_quality??{frames:0,accepted:0,first_s:null,last_s:null,inference_ms:[]};
 const activeSeconds=duration(record.clock,'active'),trackingSeconds=duration(record.clock,'tracking'),manualSeconds=duration(record.clock,'manual'),technicalSeconds=duration(record.clock,'technical');
 return {player_pose_frames:pq.frames,player_pose_accepted_frames:pq.accepted,player_pose_fps:pq.observed_seconds>0?pq.intervals/pq.observed_seconds:null,player_pose_inference_median_ms:quantile(pq.inference_ms,.5),player_pose_inference_p95_ms:quantile(pq.inference_ms,.95),schema_version:RECORD_VERSION,session_id:record.session_id,app_version:record.app_version,mode:record.mode,status:record.status,go_wall_s:record.go_wall_s,end_wall_s:record.end_wall_s,score_version:SCORE_VERSION,score_formula:SCORE_FORMULA,score:hits.length*10,issued:tasks.length,extinguished:hits.length,expired,unresolved,pending,success_denominator:denominator,success_rate:denominator?hits.length/denominator:null,success_missing_reason:denominator?null:'no_resolved_tasks',response_median_ms:quantile(response,.5),response_q1_ms:q1,response_q3_ms:q3,response_iqr_ms:q1===null?null:q3-q1,response_samples:response.length,response_missing_reason:response.length?null:'no_successes',active_seconds:activeSeconds,go_to_end_seconds:record.go_wall_s===null||record.end_wall_s===null?null:record.end_wall_s-record.go_wall_s,manual_stop_seconds:manualSeconds,tracking_hold_seconds:trackingSeconds,technical_stop_seconds:technicalSeconds,clock_missing_reason:record.go_wall_s===null?'go_not_reached':null,analysis_frames:frameCount,accepted_frames:accepted,rejected_frames:frameCount-accepted,effective_analysis_fps:analysisWindow?fpsNumerator/analysisWindow:null,analysis_fps_missing_reason:analysisWindow?null:record.conditions.input==='mouse'?'mouse_input_no_ai':'insufficient_analysis_samples',inference_median_ms:quantile(inference,.5),inference_p95_ms:quantile(inference,.95),inference_samples:inference.length,inference_missing_reason:inference.length?null:record.conditions.input==='mouse'?'mouse_input_no_ai':'no_valid_inference_timings',software_samples:software.length,software_missing_reason:software.length?null:record.conditions.input==='mouse'?'mouse_input_no_ai':'no_valid_software_timings',software_p95_ms:quantile(software,.95),quality,targets,conditions:record.conditions,condition_changes:record.condition_changes};
}
export class LampRecord{
 constructor({version,practice,now,conditions}){
  this.session_id=globalThis.crypto.randomUUID();this.app_version=version;this.mode=practice?'practice':'game30';this.status='in_progress';this.origin_s=now;this.go_wall_s=null;this.end_wall_s=null;this.conditions=copy(conditions);this.tasks=[];this.clock=[];this.condition_changes=[];this.quality=[];this.player_quality={frames:0,accepted:0,first_s:null,last_s:null,previous_s:null,observed_seconds:0,intervals:0,inference_ms:[]};this.closed=false;
 }
 go(now){if(this.go_wall_s===null){this.go_wall_s=now-this.origin_s;this.openQuality(now);}}
 openQuality(now){
  this.quality.push({start_s:now-this.origin_s,end_s:null,delegate:this.conditions.delegate??'未接続',frames:0,accepted:0,first_s:null,last_s:null,inference_ms:[],software_ms:[]});
 }
 segment(from,to,gameFrom,gameTo,kind,reason){
  if(this.closed||this.go_wall_s===null||to<=from)return;
  const row={wall_start_s:from-this.origin_s,wall_end_s:to-this.origin_s,game_start_s:gameFrom,game_end_s:gameTo,kind,reason};
  const previous=this.clock.at(-1);
  if(previous&&previous.kind===kind&&previous.reason===reason&&Math.abs(previous.wall_end_s-row.wall_start_s)<1e-8){previous.wall_end_s=row.wall_end_s;previous.game_end_s=gameTo;}
  else this.clock.push(row);
 }
 light(t,now,elapsed,w,h){
  const task={activation_id:`${this.session_id}:${this.tasks.length+1}`,target_id:t.id,x:t.x,y:t.y,region:region(t.x,t.y),board_width_px:w,board_height_px:h,lit_game_s:elapsed,lit_wall_s:now-this.origin_s,expires_game_s:t.expiresAt,resolved_game_s:null,resolved_wall_s:null,outcome:'pending',response_ms:null,missing_reason:'not_resolved'};
  this.tasks.push(task);return task;
 }
 resolve(task,outcome,now,elapsed,reason=null){
  if(!task||task.outcome!=='pending')return false;
  task.outcome=outcome;task.resolved_game_s=elapsed;task.resolved_wall_s=now-this.origin_s;
  task.response_ms=outcome==='extinguished'?(elapsed-task.lit_game_s)*1000:null;
  task.missing_reason=outcome==='extinguished'?null:reason??outcome;return true;
 }
 sample({now,inferenceMs,softwareMs,accepted,delegate}){
  if(this.closed||this.go_wall_s===null)return;
  let q=this.quality.at(-1);if(q.end_s!==null){this.openQuality(now);q=this.quality.at(-1);}
  const wall=now-this.origin_s;q.delegate=delegate;q.frames++;q.accepted+=Number(accepted);q.first_s??=wall;q.last_s=wall;
  if(Number.isFinite(inferenceMs))q.inference_ms.push(inferenceMs);
  if(Number.isFinite(softwareMs)&&softwareMs>=0)q.software_ms.push(softwareMs);
 }
 playerSample({now,inferenceMs,accepted}){if(this.closed||this.go_wall_s===null)return;const q=this.player_quality,wall=now-this.origin_s;if(q.previous_s!==null){q.observed_seconds+=wall-q.previous_s;q.intervals++;}q.previous_s=wall;q.frames++;q.accepted+=Number(accepted);q.first_s??=now-this.origin_s;q.last_s=now-this.origin_s;if(Number.isFinite(inferenceMs))q.inference_ms.push(inferenceMs);}
 closeQuality(now){this.player_quality.previous_s=null;const q=this.quality.at(-1);if(q&&q.end_s===null)q.end_s=now-this.origin_s;}
 screen(now,w,h,radius,displayFit='contain'){
  if(this.closed)return;
  const last=this.condition_changes.at(-1),row={wall_s:now-this.origin_s,board_width_px:w,board_height_px:h,hit_radius_px:radius,display_fit:displayFit};
  if(!last||last.board_width_px!==w||last.board_height_px!==h||last.hit_radius_px!==radius||last.display_fit!==displayFit)this.condition_changes.push(row);
 }
 runtime(now,camera,delegate){if(this.closed)return;this.condition_changes.push({wall_s:now-this.origin_s,camera_actual:copy(camera),delegate});}
 finish(now,elapsed,status){
  if(this.closed)return;this.end_wall_s=now-this.origin_s;this.status=status;
  for(const t of this.tasks)this.resolve(t,'unresolved',now,elapsed,status);
  this.closeQuality(now);this.closed=true;
 }
 snapshot(){return copy({session_id:this.session_id,app_version:this.app_version,mode:this.mode,status:this.status,go_wall_s:this.go_wall_s,end_wall_s:this.end_wall_s,conditions:this.conditions,tasks:this.tasks,clock:this.clock,quality:this.quality,player_quality:this.player_quality,condition_changes:this.condition_changes});}
}
// RFC4180, UTF-8 BOM for Japanese Excel. Null is explicit NA, never zero-imputed.
export function csv(rows,columns){
 const cell=value=>{
  const v=value===null||value===undefined?MISSING:typeof value==='object'?JSON.stringify(value):String(value);
  const safe=/^[=+@\-\t\r]/.test(v)&&typeof value==='string'?`'${v}`:v;
  return '"'+safe.replaceAll('"','""')+'"';
 };
 return '\uFEFF'+[columns.map(cell).join(','),...rows.map(row=>columns.map(c=>cell(row[c])).join(','))].join('\r\n')+'\r\n';
}
export function resultCSVs(record){
 const s=aggregate(record),{quality,targets,conditions,condition_changes,...session}=s;
 const summaryRows=[{row_type:'session',...session,conditions_json:conditions,condition_changes_json:condition_changes},...targets.map(t=>({row_type:'target',session_id:s.session_id,mode:s.mode,...t}))];
 const summaryColumns=[...new Set(summaryRows.flatMap(Object.keys))];
 const eventRows=[...record.tasks.map(t=>({row_type:'activation',session_id:s.session_id,mode:s.mode,...t})),...record.clock.map((c,i)=>({row_type:'clock_interval',session_id:s.session_id,mode:s.mode,interval_id:i+1,...c})),...quality.map((q,i)=>({row_type:'quality',session_id:s.session_id,mode:s.mode,quality_segment:i+1,wall_start_s:q.start_s,wall_end_s:q.end_s,delegate:q.delegate,analysis_frames:q.frames,accepted_frames:q.accepted,analysis_first_s:q.first_s,analysis_last_s:q.last_s,inference_samples:q.inference_ms.length,inference_median_ms:quantile(q.inference_ms,.5),inference_p95_ms:quantile(q.inference_ms,.95),inference_samples_ms_json:q.inference_ms,software_samples_ms_json:q.software_ms})),...condition_changes.map(c=>({row_type:'screen_change',session_id:s.session_id,mode:s.mode,...c}))];
 if(record.player_quality){const q=record.player_quality;eventRows.push({row_type:'player_quality',session_id:s.session_id,mode:s.mode,analysis_frames:q.frames,accepted_frames:q.accepted,analysis_first_s:q.first_s,analysis_last_s:q.last_s,analysis_window_seconds:q.observed_seconds,analysis_intervals:q.intervals,inference_samples:q.inference_ms.length,inference_samples_ms_json:q.inference_ms});}
 const eventColumns=['row_type','session_id','mode','activation_id','target_id','x','y','region','board_width_px','board_height_px','lit_game_s','lit_wall_s','expires_game_s','resolved_game_s','resolved_wall_s','outcome','response_ms','missing_reason','interval_id','wall_start_s','wall_end_s','game_start_s','game_end_s','kind','reason','quality_segment','delegate','analysis_frames','accepted_frames','analysis_first_s','analysis_last_s','inference_samples','inference_median_ms','inference_p95_ms','inference_samples_ms_json','software_samples_ms_json','wall_s','hit_radius_px','display_fit','camera_actual','player_event','selection_epoch','analysis_window_seconds','analysis_intervals'];
 return {summary:csv(summaryRows,summaryColumns),events:csv(eventRows,eventColumns),summaryRows,eventRows};
}
