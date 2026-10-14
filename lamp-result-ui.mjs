// @ts-check
import {aggregate,resultCSVs} from './lamp-record.mjs?v=0.5.5';
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const ms=v=>v===null?'算出できません':`${v.toFixed(1)} ms`;
const seconds=v=>v===null?'未開始':`${v.toFixed(2)} 秒`;
export const RESULT_STATUS={completed:'30秒完遂',early_ended:'途中終了',practice_ended:'練習終了',before_go_canceled:'開始前中止',reset_canceled:'リセットによる中止',screen_changed:'画面切替による中止',layout_invalid:'配置不足による途中終了'};
export function mountResults(container){
 let displayed=null,urls=[];
 function revoke(){urls.forEach(URL.revokeObjectURL);urls=[];}
 function update(record,visible){
  container.hidden=!visible||!record;if(!visible||!record||displayed===record)return;
  displayed=record;revoke();const s=aggregate(record),c=s.conditions;
  const posture=c.posture==='seated'?'座位':c.posture==='standing'?'立位':'未記録',movement=c.movementMode==='stepping'?'移動あり':c.movementMode==='fixed'?'移動なし（足位置固定）':'未記録';
  const reserve=Number.isFinite(c.bottomReserve)?(c.bottomReserve*100).toFixed(0)+'%':'未記録',screen=c.fullscreen===true?'全画面':c.fullscreen===false?'通常画面':'未記録',fit=c.display_fit==='cover'?'拡大・切り抜き':c.display_fit==='contain'?'映像全体・余白あり':'未記録';
  const success=s.success_rate===null?'算出できません':`${(s.success_rate*100).toFixed(1)}%`;
  const positionRows=s.targets.map(t=>`<tr><th>標的${t.target_id+1}（${esc(t.region)}）</th><td>${t.x.toFixed(3)}, ${t.y.toFixed(3)}</td><td>${t.issued}</td><td>${t.extinguished}</td><td>${t.expired}</td><td>${t.unresolved}</td><td>${t.issued?t.denominator?'消灯 '+t.extinguished+' / '+t.denominator:'算出できません（分母0）':'未出題'}</td></tr>`).join('');
  container.innerHTML=`<h2>今回の結果 <small>${s.mode==='practice'?'練習':'30秒ゲーム'}・${RESULT_STATUS[s.status]??esc(s.status)}</small></h2>
  <p class="lamp-result-score"><strong>${s.score}</strong> 点 <span>消灯 ${s.extinguished}個 × 10点</span></p>
  <p id="lampResultCounts">消灯 ${s.extinguished}｜失効 ${s.expired}｜終了時未解決 ${s.unresolved}｜出題 ${s.issued}</p>
  <p id="lampResultSuccess">成功率 ${success}（消灯 ${s.extinguished} / 消灯＋失効 ${s.success_denominator}）</p>
  <p id="lampResultResponse">観測応答時間 中央値 ${ms(s.response_median_ms)}｜四分位範囲 ${s.response_q1_ms===null?'算出できません':ms(s.response_q1_ms)+' ～ '+ms(s.response_q3_ms)+'（幅 '+ms(s.response_iqr_ms)+'）'}｜成功 ${s.response_samples}件</p>
  <p class="note">終了時の未解決・中止した課題は成功率に含めません。点灯から有効な消灯までのゲーム内時間です。機器・AI・表示・移動・平滑化を含み、停止期間は除きます。真の反射神経や臨床反応時間ではありません。</p>
  <details id="lampResultDetails"><summary>課題条件・画面位置別の結果・測定品質（医療者向け）</summary>
  <p id="lampResultClocks">ゲーム稼働 ${seconds(s.active_seconds)}｜Goから終了 ${seconds(s.go_to_end_seconds)}｜手動停止 ${seconds(s.manual_stop_seconds)}｜追跡保留 ${seconds(s.tracking_hold_seconds)}｜技術的停止 ${seconds(s.technical_stop_seconds)}</p>
  <p class="note">ゲーム稼働時間は実際の運動時間ではありません。追跡保留は、有効で新しい入力がなく時計を止めた時間です。交差・遮蔽・検出不足・表示外等を含み、原因を映像から確定していません。</p>
  <p>${c.lampCount}個・${c.placement==='random'?'ランダム':'整列'}・seed ${c.layout_seed}｜${c.pattern==='timed'?'定期点灯 '+c.interval+'秒間隔':'1つずつ（消灯後0.3秒）'}｜失効 ${c.lifetime}秒｜設定上限 ${c.maxActive}個（1つずつは実効上限1個）</p>
  <p id="lampResultMovement">姿勢設定 ${posture}｜移動設定 ${movement}｜下側のランプ余白 ${reserve}｜開始時の画面 ${screen}｜開始時の映像 ${fit}</p>
  <p>入力 ${c.input==='mouse'?'マウス':'人差し指先'}｜手の設定 ${c.hands==='one'?'片手':'両手'}｜鏡像 ${c.mirror?'ON':'OFF'}｜${c.mapMode==='comfortable'?'座位補助（映像と指先を同時拡大）':c.display_fit==='cover'?'通常（全画面では映像の一部を切り抜き）':'通常（映像全体）'}｜平滑化 ${c.smoothing?'あり':'なし'}｜画面 ${c.board_width_px.toFixed(1)}×${c.board_height_px.toFixed(1)} px｜途中の画面・条件記録 ${s.condition_changes.length}件</p>
  <p>カメラ実設定 ${c.camera_actual?.width??'—'}×${c.camera_actual?.height??'—'} / ${c.camera_actual?.frameRate??'—'} fps｜要求 ${esc(c.camera_requested??'—')}｜目標解析 ${c.analysis_target_fps??'—'} fps｜${esc(c.delegate??'未使用')}｜アプリ ${esc(s.app_version)}</p>
  <p id="lampResultQuality">実効解析 ${s.effective_analysis_fps===null?'算出できません':s.effective_analysis_fps.toFixed(1)+' fps'}｜受領 ${s.analysis_frames}件・鮮度基準内 ${s.accepted_frames}件・古い結果 ${s.rejected_frames}件｜推論 中央値 ${ms(s.inference_median_ms)}・p95 ${ms(s.inference_p95_ms)}（${s.inference_samples}件）｜取得開始→結果受領 p95 ${ms(s.software_p95_ms)}</p>
  <p class="note">解析fpsは受領結果の間隔から、手動・技術的停止ごとの区間を分けて算出します。鮮度基準内でも、指の位置や本人の左右が正しいことを保証しません。マウス入力には手AIの値がありません。</p>
  <div class="lamp-result-table"><table><thead><tr><th>画面位置</th><th>正規化 x, y</th><th>出題</th><th>消灯</th><th>失効</th><th>未解決</th><th>成功の分母</th></tr></thead><tbody>${positionRows}</tbody></table></div>
  <p class="note">xは画面左0→右1、yは上0→下1。画面座標は実測距離ではありません。追跡番号は本人の左右・患側を表しません。消灯数は身体運動の反復数、得点は臨床効果を表しません。</p></details>
  <button id="lampSaveResult" type="button">結果を保存（CSV 2ファイル）</button><p id="lampSaveStatus" class="note">この結果はメモリー内だけにあります。保存を押したときだけ、氏名・映像・ランドマークを含まないCSVを作成します。対応ブラウザーでは保存先フォルダーを選びます。その他はブラウザーのダウンロード先へ保存します。</p><div id="lampDownloadLinks" hidden></div>
  <details class="lamp-csv-help"><summary>CSVの列・単位・算式</summary><p>集計CSV：row_type=sessionは全体、targetは標的別。score=extinguished×10（hit10/1.0）。success_rate=extinguished/(extinguished+expired)、0～1。未解決を分母から除きます。課題CSV：activationは1回の点灯、clock_intervalは時計区間、qualityは処理品質、screen_changeは画面・条件変更です。</p><p>activation_idは再点灯ごとに新しくなります。*_game_sは停止を除くゲーム秒、*_wall_sはセッション作成時を0とする単調実時間秒、*_msはミリ秒、*_pxは画面ピクセルです。response_msは消灯時のみ。失効予定はexpires_game_s、実際の判定更新時刻はresolved_game_sです。失効と接触が同じ更新では失効を優先します。NAは欠測／非該当、missing_reason等に理由を併記。中央値・四分位は線形補間（type 7）、p95も同方式です。条件・実配置はconditions_json、途中変更はcondition_changes_jsonに保持します。movementModeはfixed／stepping、bottomReserveは画面高に対する割合0～0.35、fullscreenは開始時の全画面設定、display_fitはcontain（全体表示）／cover（切り抜き）です。途中の画面切替はscreen_changeとcondition_changes_jsonで確認してください。</p><p>停止区間kindはactive／manual／tracking／technical。セッションIDは毎回ランダムで本人を識別しません。永続履歴・自動送信・自動保存はありません。前回との改善比較や臨床評価は行いません。</p></details>`;
  container.querySelector('#lampSaveResult').addEventListener('click',async()=>{
   const button=/** @type {HTMLButtonElement} */(container.querySelector('#lampSaveResult')),status=container.querySelector('#lampSaveStatus');
   button.disabled=true;revoke();const links=container.querySelector('#lampDownloadLinks');links.replaceChildren();
   // One explicit folder selection grants writing these two anonymous CSVs only.
   const picker=/** @type {any} */(window).showDirectoryPicker,written=[],attempted=[];let partialMessage='';
   if(typeof picker==='function'){
    try{
     const directory=await picker.call(window,{mode:'readwrite'}),data=resultCSVs(record);
     for(const key of ['summary','events']){attempted.push(key);const handle=await directory.getFileHandle(`lamp_${s.mode}_${s.session_id}_${key}.csv`,{create:true});const writable=await handle.createWritable();await writable.write(data[key]);await writable.close();written.push(key);}
     status.textContent='選択したフォルダーに、集計CSVと課題イベントCSVの2ファイルを保存しました。';button.disabled=false;return;
    }catch(error){
     if(error.name==='AbortError'){status.textContent=written.length?'一部保存：集計CSVは保存済み、課題イベントCSVの保存を中止しました。書込中のファイルは完成していない可能性があります。結果を保存で再試行できます。':attempted.length?'保存を中止しました。書込を試みたファイルの完成は確認できません。結果はメモリー内に残っています。':'保存を中止しました。結果はメモリー内に残っています。';button.disabled=false;return;}
     partialMessage=written.length?'一部保存：集計CSVは保存済み。課題イベントCSVのフォルダー書込に失敗しました。':'フォルダー保存の完了を確認できませんでした。';
    }
   }
   links.removeAttribute('hidden');const data=resultCSVs(record);
   let requested=0;for(const [key,label] of [['summary','集計CSV'],['events','課題イベントCSV']]){if(written.includes(key))continue;requested++;
    const url=URL.createObjectURL(new Blob([data[key]],{type:'text/csv;charset=utf-8'}));urls.push(url);
    const a=document.createElement('a');a.href=url;a.download=`lamp_${s.mode}_${s.session_id}_${key}.csv`;a.textContent=label+'を保存';links.append(a);a.click();
   }
   status.textContent=partialMessage+`${requested}ファイルのダウンロードを要求しました。ブラウザーが止めた場合は、下のリンクを押してください。保存済みのファイルと合わせて2つのCSVを確認してください。`;button.disabled=false;
  });
 }
 return {update,revoke};
}
