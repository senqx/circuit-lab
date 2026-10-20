import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installNativePlatform} from '../platforms/capacitor/native-platform.mjs';
function setup(){
 const events={},calls=[],platform={onSuspend:save=>{platform.browserSave=save;}};
 const App={addListener:async(name,fn)=>{events[name]=fn;return {};},exitApp:async()=>calls.push('exit')};
 const Files={save:async data=>{calls.push(['save',data]);return {cancelled:false};},open:async()=>({contents:'{"version":2}',name:'test.json'})};
 const Filesystem={writeFile:async data=>{calls.push(['write',data]);return {uri:'file:///cache/test.json'};}};
 const Share={share:async data=>calls.push(['share',data])};
 installNativePlatform(platform,{App,Files,Filesystem,Share,Directory:{Cache:'CACHE'},Encoding:{UTF8:'utf8'}});
 return {events,calls,platform,Files,Share};
}
test('native pause and Back flush saves; handled Back does not exit',async()=>{
 const {events,calls,platform}=setup();let saved=0;
 platform.onSuspend(()=>saved++);platform.bindBack(()=>true);
 events.pause();events.appStateChange({isActive:false});await events.backButton();
 assert.equal(saved,3);assert.deepEqual(calls,[]);
 platform.bindBack(()=>false);await events.backButton();assert.deepEqual(calls,['exit']);
});
test('save/open cancellation leaves the circuit untouched',async()=>{
 const {platform,Files}=setup();let imports=0;
 Files.save=async()=>({cancelled:true});Files.open=async()=>({cancelled:true});
 assert.equal(await platform.exportFile('test.json','{}'),false);
 await platform.bindFileImport(()=>imports++)();assert.equal(imports,0);
});
test('sharing writes UTF8 JSON to cache and passes only its URI',async()=>{
 const {platform,calls}=setup();assert.equal(await platform.shareFile('test.json','{"a":1}'),true);
 assert.equal(calls[0][1].data,'{"a":1}');assert.equal(calls[0][1].directory,'CACHE');
 assert.deepEqual(calls[1][1].files,['file:///cache/test.json']);
});
test('cancelled share returns false; errors remain visible',async()=>{
 const {platform,Share}=setup();Share.share=async()=>{throw Error('Share canceled');};
 assert.equal(await platform.shareFile('test.json','{}'),false);
 Share.share=async()=>{throw Error('No provider');};
 await assert.rejects(platform.shareFile('test.json','{}'),/No provider/);
});
