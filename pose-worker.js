let landmarker;
self.onmessage=async ({data})=>{
  try {
    if(data.type==='init'){
      // The WASM loader uses importScripts, which requires a classic Worker.
      const {FilesetResolver,PoseLandmarker}=await import('./vendor/vision_bundle.mjs');
      const {MODEL_THRESHOLDS}=await import('./core.mjs');
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
      const options={baseOptions:{modelAssetPath:new URL('./models/pose_landmarker_full.task',self.location.href).href,delegate:'GPU'},runningMode:'VIDEO',numPoses:data.numPoses,...MODEL_THRESHOLDS};
      let delegate='GPU';
      try{landmarker=await PoseLandmarker.createFromOptions(files,options);}
      catch{delegate='CPU';options.baseOptions.delegate='CPU';landmarker=await PoseLandmarker.createFromOptions(files,options);}
      self.postMessage({type:'ready',delegate});
    }else if(data.type==='frame'){
      try{const result=landmarker.detectForVideo(data.bitmap,data.time);self.postMessage({type:'result',time:data.time,landmarks:result.landmarks});}
      finally{data.bitmap.close();}
    }
  }catch(error){self.postMessage({type:'error',message:String(error.message||error)});}
};
