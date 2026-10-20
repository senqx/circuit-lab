import {connectBrowser} from './cdp.mjs';
const b=await connectBrowser(process.argv[3]);const {send,js,wait,assert,click}=b;
try {
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Storage.clearDataForOrigin',{origin:new URL(process.argv[2]).origin,storageTypes:'service_workers,cache_storage'});
 await send('Page.navigate',{url:process.argv[2]});await wait("document.body && !document.body.classList.contains('app-opening') && !!document.querySelector('[data-node]')");
 await js("(async()=>{const {handleBack}=await import('/app.js');window.__back=handleBack;const {platform}=await import('/platform.mjs');platform.shareFile=async(name,contents)=>{window.__shared=JSON.parse(contents);return true;};platform.exportFile=async(name,contents)=>{window.__exported=JSON.parse(contents);return true;};document.querySelector('#share-button').hidden=false;})()");
 if(await js("document.querySelector('#modal').open"))await click('#close-guide');
 await click('#guide-button');await js('window.__back()');
 await assert("!document.querySelector('#modal').open",'Native Back closes handbook');
 await click('#journey-nav');await js('window.__back()');
 await assert("!document.querySelector('#journey-sidebar').classList.contains('open')",'Native Back closes journey drawer');
 await js('window.__back()');await b.delay(250);
 await assert("document.querySelector('#inspector').hidden",'Native Back folds the task panel');
 await click('#expected-button');await js('window.__back()');
 await assert("!document.querySelector('#expected-dialog').open",'Native Back closes expected results');
 await click('#share-button');await wait('!!window.__shared');
 await assert("window.__shared.version===2 && !!window.__shared.circuit.nodes",'Share uses the existing portable circuit format');
 await click('#export-button');await wait('!!window.__exported');
 await assert("JSON.stringify(window.__shared)===JSON.stringify(window.__exported)",'Save and Share export the same circuit');
 await assert('window.__back()===false','Back on the unobstructed board permits app exit');

} finally{b.close();}
