// Native capabilities are injected so the same behavior can be tested without a phone.
export function installNativePlatform(platform,{App,Files,Filesystem,Share,Directory,Encoding},report=()=>{}) {
  const browserSuspend=platform.onSuspend.bind(platform);
  let save=()=>{},back=()=>false,sharing=false;
  platform.prepareOffline=async()=>{};
  platform.onSuspend=callback=>{save=callback;browserSuspend(callback);};
  platform.bindBack=callback=>{back=callback;};
  platform.exportFile=async(name,contents)=>{
    save();
    const result=await Files.save({name,contents});
    return !result.cancelled;
  };
  platform.bindFileImport=onFile=>async()=>{
    save();
    try {
      const result=await Files.open();
      if(!result.cancelled)await onFile(new File([result.contents],result.name||'circuit.json',{type:'application/json'}));
    } catch(error){report(error.message||'This circuit file could not be opened.');}
  };
  platform.shareFile=async(name,contents)=>{
    if(sharing)return false;
    sharing=true;save();
    // Unique files prevent a later share from replacing data still used by a recipient.
    const path=`circuits/${Date.now()}-${name}`;
    try {
      const {uri}=await Filesystem.writeFile({path,data:contents,directory:Directory.Cache,encoding:Encoding.UTF8,recursive:true});
      await Share.share({title:'CircuIT Lab circuit',files:[uri],dialogTitle:'Share circuit'});
      return true;
    } catch(error){if(/cancel/i.test(error.message||''))return false;throw error;}
    finally{sharing=false;}
  };
  const listeners=[
    App.addListener('pause',()=>save()),
    App.addListener('appStateChange',({isActive})=>{if(!isActive)save();}),
    App.addListener('backButton',async()=>{save();if(!back())await App.exitApp();})
  ];
  // A system picker may return after Android recreates the process.
  listeners.push(App.addListener('appRestoredResult',result=>{
    if(result.pluginId==='CircuitFiles'&&result.methodName==='open'&&result.success&&!result.data?.cancelled){
      platform.restoredImport=result.data;
      document.dispatchEvent(new Event('circuit-restored-import'));
    }
  }));
  Promise.all(listeners).catch(error=>report(error.message||'Native controls could not start.'));
}
