let landmarker,detector,features,personDetection;
self.onmessage=async ({data})=>{
  try {
    if(data.type==='init'){
      // The WASM loader uses importScripts, which requires a classic Worker.
      const {FilesetResolver,PoseLandmarker,ObjectDetector}=await import('./vendor/vision_bundle.mjs');
      const core=await import('./core.mjs?v=1.2.0');
      const {MODEL_THRESHOLDS,modeFeatures}=core;personDetection=core.personDetection;
      features=modeFeatures(data.mode||'single');
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
      const delegates=[];
      async function create(Task,model,options,label,preferred='GPU'){
        const config={baseOptions:{modelAssetPath:new URL(model,self.location.href).href,delegate:preferred},runningMode:'VIDEO',...options};
        try{const task=await Task.createFromOptions(files,config);delegates.push(`${label}:${preferred}`);return task;}
        catch(error){if(preferred==='CPU')throw error;config.baseOptions.delegate='CPU';const task=await Task.createFromOptions(files,config);delegates.push(`${label}:CPU`);return task;}
      }
      if(features.pose)landmarker=await create(PoseLandmarker,'./models/pose_landmarker_full.task',{numPoses:Math.min(4,Math.max(1,data.numPoses)),...MODEL_THRESHOLDS},'骨格');
      if(features.traffic)detector=await create(ObjectDetector,'./models/efficientdet_lite0_int8.tflite',{maxResults:Math.min(20,Math.max(1,data.maxPeople||4)),scoreThreshold:.5,categoryAllowlist:['person']},'人物','CPU');
      self.postMessage({type:'ready',delegate:delegates.join(' / ')});
    }else if(data.type==='frame'){
      try{
        const landmarks=features.pose?landmarker.detectForVideo(data.bitmap,data.time).landmarks:[];
        const people=features.traffic?detector.detectForVideo(data.bitmap,data.time).detections.map(d=>personDetection(d,data.bitmap.width,data.bitmap.height)).filter(Boolean):[];
        self.postMessage({type:'result',time:data.time,landmarks,people});
      }
      finally{data.bitmap.close();}
    }
  }catch(error){self.postMessage({type:'error',message:String(error.message||error)});}
};
