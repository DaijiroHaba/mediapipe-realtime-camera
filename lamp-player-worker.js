// Classic worker for the existing local Pose model; no images leave the device.
let task;
self.onmessage=async({data})=>{try{
 if(data.type==='init'){
  const {FilesetResolver,PoseLandmarker}=await import('./vendor/vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
  const options={baseOptions:{modelAssetPath:new URL('./models/pose_landmarker_full.task',self.location.href).href,delegate:data.delegate==='CPU'?'CPU':'GPU'},runningMode:'VIDEO',numPoses:4,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6,outputSegmentationMasks:false};
  try{task=await PoseLandmarker.createFromOptions(files,options);}catch(e){if(options.baseOptions.delegate==='CPU')throw e;options.baseOptions.delegate='CPU';task=await PoseLandmarker.createFromOptions(files,options);}
  self.postMessage({type:'ready',delegate:options.baseOptions.delegate});
 }else if(data.type==='frame'){
  try{const start=performance.now(),result=task.detectForVideo(data.bitmap,data.time);self.postMessage({type:'poses',time:data.time,inferenceMs:performance.now()-start,landmarks:result.landmarks});}finally{data.bitmap.close();}
 }
}catch(e){self.postMessage({type:'error',message:String(e.message||e)});}};
