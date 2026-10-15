let task;
self.onmessage=async({data})=>{try{
 if(data.type==='init'){
  const {FilesetResolver,HandLandmarker}=await import('./vendor/vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
  const options={baseOptions:{modelAssetPath:new URL('./models/hand_landmarker.task',self.location.href).href,delegate:data.delegate==='CPU'?'CPU':'GPU'},runningMode:'VIDEO',numHands:data.playerLock?4:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6};
  try{task=await HandLandmarker.createFromOptions(files,options);}catch(e){if(options.baseOptions.delegate==='CPU')throw e;options.baseOptions.delegate='CPU';task=await HandLandmarker.createFromOptions(files,options);}
  self.postMessage({type:'ready',delegate:options.baseOptions.delegate});
 }else if(data.type==='frame'){
  try{const started=performance.now(),result=task.detectForVideo(data.bitmap,data.time);
   self.postMessage({type:'hands',time:data.time,inferenceMs:performance.now()-started,bitmapMs:data.bitmapMs,landmarks:result.landmarks,crop:data.crop,playerEpoch:data.playerEpoch});
  }finally{data.bitmap.close();}
 }
}catch(e){self.postMessage({type:'error',message:String(e.message||e)});}};

