// Exercise the real worker, switch drawings, and optional achievements together.
export async function curriculumChecks({send,js,wait,assert,click,screenshot}) {
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});
  const node=(id,kind,x,y)=>({id,kind,width:1,x,y});
  const wire=(from,to,input=0)=>({from,output:0,to,input});
  const lamp="document.querySelector('[data-node=\"50\"] .terminal-value')?.textContent";
  const contact="document.querySelector('[data-node=\"100\"]')?.dataset.contact";
  const record="JSON.parse(localStorage.getItem('signal-garden-v2:progress'))?.completed?.['8']";
  async function reload(fixture,resetProgress=false) {
    const source=fixture?`localStorage.setItem('signal-garden-v2:circuit:${fixture.level}',${JSON.stringify(JSON.stringify(fixture))});localStorage.setItem('signal-garden-v2:last',${JSON.stringify(JSON.stringify(fixture.level))});`:'';
    const setup=await send('Page.addScriptToEvaluateOnNewDocument',{source:source+`localStorage.setItem('signal-garden-v2:welcome','true');${resetProgress?"localStorage.setItem('signal-garden-v2:progress','{\"completed\":{}}');":''}`});
    await js('window.__oldDocument=true');await send('Page.reload');
    await wait("!window.__oldDocument && (document.body && !document.body.classList.contains('app-opening') && document.querySelector('[data-node]'))");
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.identifier});
    if(await js("document.getElementById('inspector').hidden"))await click('#task-toggle');
  }
  // Hold the worker reply: defaults must be correct during a drag and on drop,
  // before simulation can repair the initial drawing.
  await reload({version:2,level:'sandbox',inputs:[0],circuit:{nodes:[node(1,'INPUT',0,0)],wires:[]}});
  await js(`(async()=>{const {engine}=await import(new URL('engine/client.mjs',document.baseURI));
    window.__switchEngine=engine;window.__switchRequest=engine.request.bind(engine);window.__switchReplies=[];
    engine.request=async(method,data)=>{if(method==='simulate')await new Promise(resolve=>window.__switchReplies.push(resolve));return window.__switchRequest(method,data);};})()`);
  for(const [index,kind] of ['GATE','CLOSED_GATE'].entries()) {
    await js(`document.querySelector('[data-part="${kind}"]').scrollIntoView({block:'nearest'})`);
    const start=await js(`(()=>{const r=document.querySelector('[data-part="${kind}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const end=await js(`(()=>{const r=document.getElementById('canvas').getBoundingClientRect();return {x:r.x+r.width*.6,y:r.y+r.height*${index===0?0.35:0.65}}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});
    await wait("document.querySelector('.inventory-ghost .inside-contact')");
    for(const selector of ['.inventory-ghost .switch-node',`#nodes [data-node="${100+index}"]`]) {
      if(selector.startsWith('#nodes'))await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});
      await assert(`(()=>{const n=document.querySelector('${selector}'),path=n.querySelector('.inside-contact'),dot=n.querySelectorAll('.contact-dot')[1],end=path.getPointAtLength(path.getTotalLength());return n.dataset.contact==='${index}' && (Math.hypot(end.x-dot.cx.baseVal.value,end.y-dot.cy.baseVal.value)<.1)===${kind==='CLOSED_GATE'} && n.querySelector('.enable-caption').textContent==='EN ? · defaults to 0'})()`,`${kind}: ${selector.startsWith('#nodes')?'newly placed block':'drag preview'} shows its actual default bridge before simulation`);
    }
  }
  await screenshot('24-switch-defaults.png');
  await js('window.__switchEngine.request=window.__switchRequest;window.__switchReplies.forEach(resolve=>resolve())');
  for(const kind of ['GATE','CLOSED_GATE']) {
    const circuit={nodes:[node(1,'INPUT',0,0),node(100,kind,240,0),node(50,'OUTPUT',480,0)],wires:[wire(100,50)]};
    await reload({version:2,level:'sandbox',inputs:[1],circuit});
    await wait(`${contact}==='${kind==='GATE'?0:1}'`);
    await assert("document.querySelector('.enable-caption').textContent==='EN ? · defaults to 0' && document.querySelector('[data-pin=\"100:1:0\"] title').textContent.includes('?')",`${kind}: missing EN is visibly unknown with an explicit zero default`);
    await assert(`${lamp}==='${kind==='GATE'?'0':'?'}'`,`${kind}: initial contact state does not invent a missing data signal`);
    circuit.wires.push(wire(1,100));
    await reload({version:2,level:'sandbox',inputs:[1],circuit});
    await wait(`${lamp}==='${kind==='GATE'?0:1}'`);
    await assert(`${contact}==='${kind==='GATE'?0:1}'`,`${kind}: unwired control defaults to zero when data is connected`);
    circuit.nodes.push(node(101,'NOT',240,216));circuit.wires.push(wire(101,100,1));
    await reload({version:2,level:'sandbox',inputs:[1],circuit});
    await wait("document.querySelector('.enable-caption').textContent==='EN=?'");
    await assert(`${contact}==='-1' && ${lamp}==='?' && document.querySelector('.contact-caption').textContent==='Contact unknown'`,`${kind}: a connected unknown control stays unknown`);
  }
  const controlled={version:2,level:3,inputs:[0,1],circuit:{nodes:[node(1,'INPUT',0,0),node(2,'INPUT',0,216),node(100,'GATE',240,108),node(50,'OUTPUT',480,108)],wires:[wire(1,100),wire(2,100,1),wire(100,50)]}};
  await reload(controlled);await wait(`${contact}==='1' && ${lamp}==='0'`);
  await assert("document.querySelector('.contact-caption').textContent==='Closed · passes 0' && document.querySelector('.inside-contact').classList.contains('low') && document.querySelector('.inside-control').classList.contains('high') && document.querySelectorAll('.wire.high').length===1",'EN=1/D=0 closes the contact without lighting the bulb or marking the data path high');
  await screenshot('21-switch-data-enable.png');

  const mixed={version:2,level:8,inputs:[0,1],circuit:{nodes:[node(1,'INPUT',0,0),node(2,'INPUT',0,216),node(100,'NOT',216,0),node(101,'NOT',216,216),node(102,'AND',432,0),node(103,'AND',432,216),node(104,'OR',648,108),node(50,'OUTPUT',864,108)],wires:[wire(1,100),wire(2,101),wire(100,102),wire(2,102,1),wire(1,103),wire(101,103,1),wire(102,104),wire(103,104,1),wire(104,50)]}};
  await reload(mixed,true);await wait(`${lamp}==='1'`);
  await assert("document.querySelector('[data-forward]').textContent.includes('Skip') && document.querySelector('.nand-challenge').textContent.includes('4 two-input NAND gates')",'XOR separates the truth-table requirement from its optional NAND goal');
  await click('#check-button');await wait("document.getElementById('modal').open && document.getElementById('stay-button')");
  await assert("document.querySelector('[data-forward]').textContent.includes('Next') && document.querySelector('#modal-content .challenge-feedback').textContent.includes('5 other blocks')",'A correct mixed-gate XOR unlocks Next while explaining the NAND-only challenge');
  await js('window.dispatchEvent(new Event("beforeunload"))');
  await assert(`!!${record} && ${record}.bestNands===undefined`,'Mixed-gate correctness records completion without a NAND award');
  await click('#stay-button');if(await js("document.querySelector('#results-dialog').open"))await click('#close-results');await click('#learn-panel [data-design-notes]');
  await assert("document.querySelector('.book-index strong').textContent==='Circuit design' && document.getElementById('book-spread').textContent.includes('Boolean algebra') && document.getElementById('book-spread').textContent.includes('sum of products') && document.getElementById('book-spread').textContent.includes('Real chips use a mixture')",'The challenge opens the Boolean algebra, construction and simplification crash course directly');
  await click('[data-guide-spread="0"]');
  await assert("document.querySelector('.book-index strong').textContent==='How to play'",'The handbook contents can return directly to playing instructions');
  await click('[data-guide-spread="2"]');
  await assert("document.querySelector('.book-index strong').textContent==='Circuit design' && document.activeElement.getAttribute('aria-current')==='page'",'Circuit design is directly accessible from the first handbook spread');
  await screenshot('22-design-handbook.png');await click('#close-guide');

  const nand={version:2,level:8,inputs:[0,1],circuit:{nodes:[node(1,'INPUT',0,0),node(2,'INPUT',0,216),node(100,'NAND',216,108),node(101,'NAND',432,0),node(102,'NAND',432,216),node(103,'NAND',648,108),node(50,'OUTPUT',864,108)],wires:[wire(1,100),wire(2,100,1),wire(1,101),wire(100,101,1),wire(2,102),wire(100,102,1),wire(101,103),wire(102,103,1),wire(103,50)]}};
  await reload(nand);await click('#check-button');await wait("document.querySelector('#modal-content .nand-challenge.achieved')");
  await js('window.dispatchEvent(new Event("beforeunload"))');
  await assert(`${record}.bestNands===4 && document.querySelector('[data-level="8"] .lesson-bullet').textContent==='★'`,'Four NANDs earn a saved best count and a journey star');
  await screenshot('23-nand-achievement.png');await click('#stay-button');
  const larger=structuredClone(nand);larger.circuit.nodes.push(node(200,'NAND',648,324));
  await reload(larger);await click('#check-button');await wait("document.querySelector('#modal-content .challenge-feedback')");
  await assert("document.querySelector('#modal-content .challenge-feedback').textContent.includes('works with 5 NAND gates')",'Unused gates count in the checked circuit');
  await js('window.dispatchEvent(new Event("beforeunload"))');
  await assert(`${record}.bestNands===4`,'A larger valid circuit preserves the previous best');
  await click('#stay-button');await reload();
  await assert("document.querySelector('#learn-panel .challenge-best').textContent.includes('4') && document.querySelector('[data-forward]').textContent.includes('Next')",'Completion and best count survive a page reload');

  await reload({...nand,practice:true},true);await click('#check-button');await wait("document.querySelector('.test-badge.success')");
  await js('window.dispatchEvent(new Event("beforeunload"))');
  await assert(`!${record} && document.querySelector('[data-forward]').textContent.includes('Skip') && !document.getElementById('modal').open`,'Checking a worked example earns neither completion nor a NAND award');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  if(await js("document.querySelector('#results-dialog').open"))await click('#close-results');await click('#learn-panel [data-design-notes]');
  await assert("document.getElementById('modal').scrollWidth<=document.getElementById('modal').clientWidth && document.querySelectorAll('.book-page').length===1",'Design lessons show one readable page at a time in a narrow handbook');
  await click('[data-guide-spread="0"]');await click('[data-guide-spread="2"]');
  await assert("document.querySelector('.book-index strong').textContent==='Circuit design' && [...document.querySelectorAll('.book-contents button')].every(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})",'Phone readers can find the crash course directly in the handbook contents');
  await click('#close-guide');
  await assert("document.documentElement.scrollWidth<=innerWidth && !document.getElementById('check-button').disabled",'The optional challenge fits the phone task panel and keeps checking available');
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});
}
