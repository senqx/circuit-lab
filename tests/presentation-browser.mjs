import {connectBrowser} from './cdp.mjs';
const b=await connectBrowser(process.argv[3]);
const {send,js,wait,assert,click,screenshot}=b;
try {
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
 await send('Page.navigate',{url:process.argv[2]});
 await wait("!!document.querySelector('#guide-button svg')");
 await js("localStorage.clear();location.reload()");
 await wait("document.querySelector('#modal')?.open && !document.body.classList.contains('app-opening')");
 await assert("document.querySelector('#modal').dataset.kind==='handbook' && !document.querySelector('#learn-tab') && !document.querySelector('#test-tab')",'First launch reveals handbook; task tabs are removed');
 await screenshot('opening-handbook.png');
 const before=await js("document.querySelector('.book-eyebrow').textContent");
 async function swipe(dx,dy=0){const p=await js("(()=>{const r=document.querySelector('#book-spread').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+80}})()");await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+dx,y:p.y+dy,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await b.delay(650);}
 await swipe(-110);
 await assert(`document.querySelector('.book-eyebrow').textContent!==${JSON.stringify(before)}`,'Swipe left turns forward');
 await swipe(110);
 await assert(`document.querySelector('.book-eyebrow').textContent===${JSON.stringify(before)}`,'Swipe right turns back');
 await swipe(8,75);
 await assert(`document.querySelector('.book-eyebrow').textContent===${JSON.stringify(before)}`,'Vertical movement does not turn pages');
 await click('#close-guide');await click('#back-to-board');
 await assert("!!document.querySelector('#task-toggle .task-chevron path') && !document.querySelector('#learn-panel table')",'Task uses a vector chevron and has no truth table');
 await click('#expected-button');
 await assert("!!document.querySelector('#expected-panel table') && !document.querySelector('#expected-panel .test-badge')",'Expected results contains its independent table');
 await click('#expected-done');await click('#check-button');
 await wait("document.querySelector('#results-dialog').open");
 await assert("!!document.querySelector('#results-dialog .test-badge') && !document.querySelector('#inspector #test-panel')",'Failed check displays grading outside the task panel');
 await click('#close-results');
 await click('#zoom-in');await click('#zoom-in');await click('#zoom-in');
 await screenshot('zoomed-vector-board.png');
 await assert("getComputedStyle(document.querySelector('#diagram')).willChange==='auto' && !!document.querySelector('#nodes svg, #nodes path')",'Board retains SVG geometry without forced compositing');
 await assert("!"+JSON.stringify(b.errors.length),'No JavaScript exceptions');
} finally {b.close();}
