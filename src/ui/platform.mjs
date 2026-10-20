// Device capabilities live here; circuit editing and file formats stay shared.
export const platform={
  bindBack(){},
  shareFile:null,
  readText(key){return localStorage.getItem(key);},
  writeText(key,value){localStorage.setItem(key,value);},
  async exportFile(name,contents){
    const file=new File([contents],name,{type:'application/json'});
    if(matchMedia('(pointer:coarse)').matches&&navigator.canShare?.({files:[file]})){
      try {await navigator.share({files:[file],title:'CircuIT Lab circuit'});return true;}
      catch(error){if(error.name==='AbortError')return false;throw error;}
    }
    const url=URL.createObjectURL(file),link=document.createElement('a');
    link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    return true;
  },
  bindFileImport(onFile){
    const input=document.getElementById('import-file');
    input.onchange=()=>{const file=input.files[0];input.value='';if(file)onFile(file);};
    return ()=>input.click();
  },
  onSuspend(save){
    window.addEventListener('beforeunload',save);
    window.addEventListener('pagehide',save);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
  },
  async prepareOffline(){
    if(!('serviceWorker' in navigator)||!globalThis.isSecureContext)return;
    // Packaged apps supply their assets locally and need no service worker.
    if(!['http:','https:'].includes(location.protocol))return;
    await navigator.serviceWorker.register(new URL('./sw.js',import.meta.url),{scope:'./',updateViaCache:'none'});
  }
};
