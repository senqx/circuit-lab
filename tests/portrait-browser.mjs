// Resize a desktop browser as well as emulating touch. Layout must depend on
// available width, independently of device emulation and orientation.
export async function handbookLaunchChecks({send,js,wait,assert,screenshot,url}) {
  await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:false});
  const firstPage="document.getElementById('modal')?.open && document.querySelector('.book-return [aria-live]')?.textContent";
  try {
    for(const width of [360,700,760,761]) {
      // Leave the old document before clearing its save, so unloading cannot
      // restore it. Each navigation below is the first visit to this origin.
      await send('Page.navigate',{url:'about:blank'});await wait("location.href==='about:blank'");
      await send('Storage.clearDataForOrigin',{origin:new URL(url).origin,storageTypes:'all'});
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
      await send('Page.navigate',{url});await wait(firstPage);
      await assert(`document.querySelectorAll('.book-page').length===${width<=760?1:2} && (${firstPage})===${JSON.stringify(width<=760?'1 / 10':'1–2 / 10')} && localStorage.getItem('signal-garden-v2:welcome')===null`,`${width}px first visit automatically opens the correct number of handbook pages`);
      await assert("getComputedStyle(document.getElementById('book-spread')).gridTemplateColumns.split(' ').length===document.querySelectorAll('.book-page').length",'The initial handbook layout matches its rendered pages');
      if(width===360) {
        await screenshot('handbook-first-navigation.png');
        await wait('navigator.serviceWorker.controller');
        await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
        await js('window.__oldDocument=true');await send('Page.reload');
        await wait(`document.body && !document.body.classList.contains('app-opening') && !window.__oldDocument && (${firstPage})`);
        await assert(`document.querySelectorAll('.book-page').length===1 && (${firstPage})==='1 / 10'`,'The cached welcome handbook also starts with one page while offline');
        await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      }
    }
  } finally {
    await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await send('Page.navigate',{url:'about:blank'});
  }
}

export async function portraitChecks({send,js,wait,assert,click:pressButton,key,screenshot}) {
  const visible=selector=>`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`;
  const closed="document.getElementById('inspector').hidden";
  const value=id=>`document.querySelector('[data-node="${id}"] .terminal-value')?.textContent`;
  async function click(selector) {
    await pressButton(selector);
    await wait("!document.getElementById('inspector').getAnimations().length");
  }
  async function viewport(width,height,mobile=false) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  }
  async function closeTask() {
    if(await js("document.getElementById('task-toggle').getAttribute('aria-expanded')==='true'"))await click(await js("document.getElementById('task-toggle').hidden")?'#back-to-board':'#task-toggle');
    await wait(closed);
  }
  async function choose(id,chapter) {
    await click('#journey-nav');
    if(await js(`document.querySelector('[data-level="${id}"]').getClientRects().length===0`))await click(`[data-chapter="${chapter}"]`);
    await click(`[data-level="${id}"]`);
  }
  async function tap(selector) {
    await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
    const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id:1}})()`);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await viewport(360,640);
  const fresh=await send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
  await js('window.__oldDocument=true');
  await send('Page.reload');
  await wait("document.body && !document.body.classList.contains('app-opening') && !window.__oldDocument && document.querySelector('[data-node]') && document.getElementById('modal').open");
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:fresh.identifier});
  const bookCount="document.querySelector('.book-return [aria-live]').textContent";
  async function turn(selector) {await click(selector);await wait("!document.getElementById('modal').dataset.turning");}
  await assert(`document.querySelectorAll('.book-page').length===1 && ${bookCount}==='1 / 10' && document.getElementById('guide-next').textContent.includes('Meet the ingredients')`,'The narrow handbook shows one page and names the next individual page');
  await screenshot('handbook-single-first.png');
  await pressButton('#guide-next');
  await assert("document.querySelectorAll('.book-page').length===1 && document.querySelector('.book-page').getAnimations().some(a=>a.effect.getKeyframes().some(f=>f.transform?.startsWith('translateX(')))",'The single handbook page uses a horizontal slide instead of a spine rotation');
  await wait("!document.getElementById('modal').dataset.turning");
  await assert(`${bookCount}==='2 / 10' && document.querySelector('.book-page h2').textContent.includes('ingredients')`,'The second page replaces the first instead of appearing underneath it');
  for(const width of [760,761,900,600,320]) {
    await viewport(width,844);
    await assert(`document.querySelectorAll('.book-page').length===${width<=760?1:2} && ${bookCount}===${JSON.stringify(width<=760?'2 / 10':'1–2 / 10')} && document.getElementById('modal').scrollWidth<=document.getElementById('modal').clientWidth`,`${width}px handbook preserves the current page across its single/two-page boundary`);
    await assert(visible('#close-guide'),`${width}px handbook keeps its return action visible`);
  }
  await viewport(390,844);
  for(let page=3;page<=10;page++) {
    await turn('#guide-next');
    await assert(`document.querySelectorAll('.book-page').length===1 && ${bookCount}==='${page} / 10'`, `Narrow handbook reaches page ${page} of 10 without skipping any content`);
  }
  await assert("document.getElementById('guide-next').disabled",'The last single page disables Next');
  await turn('#guide-previous');await assert(`${bookCount}==='9 / 10'`,'Previous returns exactly one page in a narrow window');
  await click('[data-guide-spread="2"]');await assert(`${bookCount}==='5 / 10'`,'Handbook contents opens the first page of the selected topic');
  await turn('#guide-next');await screenshot('handbook-single-design.png');
  await pressButton('#guide-previous');await viewport(900,844);
  await wait("!document.getElementById('modal').dataset.turning");
  await assert("document.querySelectorAll('.book-page').length===2 && !document.getElementById('guide-next').disabled && !document.getElementById('modal').getAnimations({subtree:true}).length",'Resizing mid-turn cancels the old animation and leaves usable page controls');
  await viewport(360,640);await click('#guide-home');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await turn('#guide-next');
  await assert(`${bookCount}==='2 / 10' && !document.getElementById('modal').getAnimations({subtree:true}).length`,'Reduced motion still advances one handbook page without animation');
  await send('Emulation.setEmulatedMedia',{features:[]});
  await click('#close-guide');
  await assert(`${visible('#lesson-title')} && ${visible('#back-to-board')} && ${visible('#check-button')}`,'First portrait launch shows the mission and a visible way to build and check');
  await assert(`document.getElementById('task-toggle').hidden && ${visible('#task-label')} && !document.querySelector('#task-label button,#task-label [role=button],#task-label .task-chevron')`,'An open task has one close button and a plain title in the bottom bar');
  await click('#task-label');
  await assert("!document.getElementById('inspector').hidden && document.getElementById('task-toggle').getAttribute('aria-expanded')==='true'",'The plain task title does not act as a second close button');
  await assert('document.documentElement.scrollHeight<=innerHeight && scrollY===0','The portrait game fits the screen without page scrolling');
  await screenshot('portrait-first-task.png');
  await click('#back-to-board');await wait(closed);
  await assert(`${visible('#task-toggle')} && ${visible('#check-button')} && ${visible('#expected-button')}`,'Task, Check circuit, and Expected results are reachable without scrolling');
  await screenshot('portrait-workbench.png');

  await click('#check-button');await wait("document.querySelector('.test-badge.failure')");
  await assert("document.getElementById('results-dialog').open && !!document.querySelector('#test-panel .test-badge.failure')",'Checking an unfinished circuit opens separate grading feedback');
  await click('#close-results');await closeTask();await click('#expected-button');
  await assert(`${closed} && document.getElementById('expected-dialog').open && document.querySelectorAll('#expected-panel tbody tr').length===2 && !document.querySelector('#expected-dialog [role=tab],#expected-dialog .test-badge')`,'Expected results opens its own reference sheet without task tabs or grading feedback');
  await assert(`${visible('#expected-title')} && ${visible('#expected-done')}`,'The results title and return button stay visible');
  await screenshot('expected-reference.png');
  await key('Escape');
  await assert(`${closed} && !document.getElementById('expected-dialog').open && document.activeElement.id==='expected-button'`,'Escape closes expectations and returns focus without opening the task');
  await click('#expected-button');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await tap('#expected-panel [data-inputs="[1]"]');
  await wait(`${closed} && !document.getElementById('expected-dialog').open && ${value(1)}==='1'`);
  await assert("!document.querySelector('.workbench').inert && !document.querySelector('[data-wire]')",'Tapping a truth-table row sets the inputs and returns to the editable board');
  await tap('[data-pin="1:0:1"] .pin-dot');await tap('[data-pin="50:0:0"] .pin-dot');
  await wait(`${value(50)}==='1'`);
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await click('#check-button');await wait("document.getElementById('stay-button')");
  await click('#stay-button');await wait(closed);
  await click('[data-forward]');
  await assert("document.getElementById('task-toggle').getAttribute('aria-expanded')==='true' && document.getElementById('lesson-number').textContent.includes('02')",'The next experiment introduces its own task before building');
  await click('[data-previous]');
  await wait(`${value(50)}==='1'`);
  await assert(`${value(50)}==='1' && document.querySelector('[data-wire]')`,'Previous restores the completed circuit while showing its task');
  await closeTask();

  for(const [width,height] of [[390,844],[320,568],[768,1024],[900,700],[1000,800],[1001,800],[1080,1920],[844,390],[1280,390],[1280,720]]) {
    await viewport(width,height);
    await assert(`${visible('#task-toggle')} && ${visible('#check-button')} && ${visible('#expected-button')}`,`${width}×${height}: the primary controls stay in the viewport`);
    await assert(`document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight && ${value(50)}==='1'`,`${width}×${height}: resizing keeps the circuit and avoids page overflow`);
    await click('#task-toggle');
    await wait(visible('#lesson-title'));
    await assert(visible('#check-button'),`${width}×${height}: checking remains visible with the task open`);
    if(width<=1000)await assert("getComputedStyle(document.getElementById('inspector')).position==='absolute' && document.getElementById('task-toggle').hidden && document.getElementById('task-label').getBoundingClientRect().top>=document.querySelector('.workbench').getBoundingClientRect().bottom",`${width}×${height}: the open task keeps its title below the board without a second close button`);
    else await assert("document.getElementById('inspector').getBoundingClientRect().left>=document.querySelector('.workbench').getBoundingClientRect().right",`${width}×${height}: sufficient width keeps the task beside the workbench regardless of orientation`);
    await screenshot(`task-${width}x${height}.png`);
    await closeTask();
  }

  for(const mobile of [false,true]) {
    await viewport(800,600,mobile);await click('#task-toggle');
    await assert("getComputedStyle(document.getElementById('inspector')).position==='absolute' && document.getElementById('task-toggle').getAttribute('aria-expanded')==='true'",`800×600 uses the same task drawer with phone emulation ${mobile?'on':'off'}`);
    await closeTask();
  }

  // Saved progress suppresses the welcome book, never the new lesson's task.
  await viewport(600,1000);await js('window.dispatchEvent(new Event("pagehide"));window.__oldDocument=true');
  await send('Page.reload');
  await wait(`document.body && !document.body.classList.contains('app-opening') && !window.__oldDocument && ${value(50)}==='1'`);
  await assert("!document.getElementById('modal').open && document.getElementById('task-toggle').getAttribute('aria-expanded')==='true'",'Reloading a saved circuit in a narrow desktop window still introduces its task');
  await closeTask();

  await viewport(390,844);await choose(14,2);
  await click('#example-button');await click('#load-example');await wait(closed);
  await click('#expected-button');
  await assert("document.getElementById('expected-dialog').open && document.getElementById('task-toggle').getAttribute('aria-expanded')==='false'",'Expected results can open the separate full reference and return to the board');
  await click('#expected-done');await wait(closed);
  await assert("!document.getElementById('expected-dialog').open && document.activeElement.id==='canvas'",'Back to circuit returns to the board even when expectations were opened from the task');
  await click('#expected-button');
  await assert("document.querySelectorAll('#expected-panel tbody tr').length===16 && document.querySelector('#expected-panel .table-paging span').textContent==='1 / 16'",'Multibit expected results keep every case available through pagination');
  await click('#expected-panel [data-test-page="1"]');
  await assert("document.querySelector('#expected-panel .table-paging span').textContent==='2 / 16'",'Expected case pages work inside the separate reference sheet');
  await click('#expected-done');await click('#expected-button');
  for(let page=1;page<=10;++page)await click(`#expected-panel [data-test-page="${page}"]`);
  await click('#expected-panel [data-inputs="[10,12]"]');
  await wait(`${closed} && ${value(50)}==='8'`);
  await assert(`${value(1)}==='10' && ${value(2)}==='12'`,'Selecting a multibit example applies its actual numbers through WASM');
  await screenshot('portrait-bus-inputs.png');
  await click('#expected-button');await js("document.querySelector('#expected-panel [data-inputs=\"[0,1]\"]').focus()");await key('Enter');
  await wait(`${closed} && ${value(1)}==='0' && ${value(2)}==='1'`);
  await assert("document.activeElement===document.getElementById('canvas')",'Keyboard selection returns focus to the board with the chosen inputs');
  await click('#task-toggle');await key('Escape');await wait(closed);
  await pressButton('#task-toggle');await pressButton('#back-to-board');await pressButton('#task-toggle');
  await wait("!document.getElementById('inspector').hidden && !document.getElementById('inspector').getAnimations().length");
  await assert("document.getElementById('task-toggle').getAttribute('aria-expanded')==='true' && document.querySelector('.workbench').inert",'Rapid drawer toggles finish in a consistent visible state');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await click('#back-to-board');
  await assert(`${closed} && !document.getElementById('inspector').getAnimations().length`,'Reduced motion closes the task without an animation');
  await send('Emulation.setEmulatedMedia',{features:[]});

  await choose(20,4);await closeTask();await click('#expected-button');
  await assert("document.querySelector('#expected-panel .test-intro').textContent.includes('previous memory state') && !document.querySelector('#expected-panel [data-inputs]')",'Sequential expectations retain ordered clock steps instead of clickable independent rows');
  await click('#close-expected');await assert(visible('#tick-button'),'The memory clock stays reachable with the task collapsed');
  await click('#sandbox-nav');await wait(closed);
  await assert("document.getElementById('expected-button').hidden && document.querySelector('[data-return]') && !document.querySelector('.workbench').inert",'Free play uses the full board and keeps its return action without invented expectations');
  await js("document.getElementById('parts').scrollTop=100000");
  await assert(visible('#check-button'),'A long parts inventory scrolls independently of the primary actions');
  await click('[data-return]');await assert(visible('#lesson-title'),'Returning from free play opens the remembered task');
  await viewport(1512,982);
}
