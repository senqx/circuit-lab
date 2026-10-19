// Exercise the generated mobile entry and shared WASM UI in Chrome.
// Android WebView, OS lifecycle, and native dialogs still need device testing.
import { connectBrowser } from './cdp.mjs';
import { rewireChecks } from './rewire-browser.mjs';

const url = process.argv[2];
if (!url) throw new Error('Pass the URL serving dist/mobile, followed by the Chrome debug URL.');
const browser = await connectBrowser(process.argv[3]);
const { send, js, wait, assert, click, pin, errors, close } = browser;
const output = "document.querySelector('[data-node=\"50\"] .terminal-value')?.textContent";

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'all' });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url });
  await wait("document.body && !document.body.classList.contains('app-opening') && document.querySelector('[data-node]') && document.getElementById('modal').open");
  await assert("document.querySelectorAll('.book-page').length===1 && document.querySelector('.book-return [aria-live]').textContent==='1 / 8'", 'The packaged welcome handbook starts with one page on a narrow screen');
  await click('#close-guide');
  await assert("document.getElementById('task-toggle').hidden && !document.getElementById('task-label').hidden && document.getElementById('back-to-board').getBoundingClientRect().bottom<=innerHeight", 'The packaged task has one visible close action');
  await click('#back-to-board');await wait("document.getElementById('inspector').hidden");
  await click('#expected-button');
  await assert("document.getElementById('expected-dialog').open && !document.querySelector('#expected-dialog [role=tab]') && document.querySelectorAll('#expected-panel tbody tr').length===2", 'Packaged expected results open separately from the task');
  await click('#expected-done');await wait("document.getElementById('inspector').hidden");await browser.delay(200);
  await assert("document.querySelector('script[src=\"native.mjs\"]')", 'The packaged app loads through the native entry');
  await assert("navigator.serviceWorker.getRegistrations().then(items=>items.length===0)", 'Packaged assets do not register the web service worker');
  await assert('document.documentElement.scrollWidth<=innerWidth', 'The mobile bundle fits the phone viewport');
  await pin(1, 0, 1);
  await pin(50, 0, 0);
  await click('[data-toggle="1"] rect');
  await wait(`${output}==='1'`);
  await js('window.dispatchEvent(new Event("pagehide"))');
  await assert("JSON.parse(localStorage.getItem('signal-garden-v2:circuit:1')).inputs[0]===1", 'Suspending flushes the pending save through the shared adapter');
  await js('window.__oldDocument=true');
  await send('Page.reload');
  await wait(`document.body && !document.body.classList.contains('app-opening') && !window.__oldDocument && ${output}==='1'`);
  await assert('!document.getElementById("modal").open', 'The packaged entry restores saved work after reloading');
  await click('#back-to-board');await wait("document.getElementById('inspector').hidden");
  await click('#export-button');
  await assert("document.getElementById('toast').textContent.includes('not available in this mobile preview')", 'The core-only preview reports unsupported export instead of claiming a file was saved');

  const results = await js(`(async()=>{
    const {engine}=await import(new URL('engine/client.mjs',document.baseURI));
    const catalog=await engine.request('catalog');let cases=0;
    for(const level of catalog.levels){
      const circuit=await engine.request('reference',{level:level.id});
      const result=await engine.request('check',{circuit,level:level.id});
      if(!result.passed)throw Error(level.title+': '+result.error);
      cases+=result.total;
    }
    return {lessons:catalog.levels.length,cases};
  })()`);
  if (results.lessons !== 24 || results.cases !== 2458) throw new Error(JSON.stringify(results));
  console.log('PASS The mobile bundle checks all 24 lessons / 2,458 cases through the shared WebAssembly worker');
  await send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 982, deviceScaleFactor: 1, mobile: false });
  await rewireChecks(browser);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Mobile bundle browser checks passed; physical-device checks remain separate.');
} finally {
  close();
}
