// The inventory and workbench share these gate silhouettes and pin positions.
export function gateDrawing(key) {
  key=({NOT4:'NOT',AND4:'AND'}[key]||key);
  const body={
    NOT:'M32 30 110 72 32 114Z',
    AND:'M32 30H72A42 42 0 0 1 72 114H32Z',
    NAND:'M32 30H66A42 42 0 0 1 66 114H32Z',
    OR:'M26 30Q50 72 26 114Q88 114 120 72Q88 30 26 30Z',
    XOR:'M32 30Q56 72 32 114Q90 114 120 72Q90 30 32 30Z'
  }[key];
  if(!body)return '';
  const edge=key==='OR'?37:key==='XOR'?43:32;
  const leads=key==='NOT'?'M0 72H32M122 72H144':`M0 60H${edge}M0 84H${edge}M${key==='NAND'?120:key==='AND'?114:120} 72H144`;
  return `<path class="gate-leads" d="${leads}"/><path class="gate-body" d="${body}"/>${key==='NOT'||key==='NAND'?`<circle class="gate-body" cx="${key==='NOT'?116:114}" cy="72" r="6"/>`:''}${key==='XOR'?'<path class="gate-leads" d="M20 30Q44 72 20 114"/>':''}`;
}
export function glyph(key) {
  const gate=gateDrawing(key);
  if(gate)return `<svg viewBox="0 20 144 104" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${gate}</svg>`;
  key=({MUX4:'MUX',BIT:'DFF',REG4:'DFF',HALF:'ADD',FULL:'ADD',ADD4:'ADD',SWITCH:'GATE'}[key]||key);
  const lines = {
    GATE:'<path d="M2 18h10m18 0h12M12 18 29 6M21 28V19"/><circle cx="12" cy="18" r="2"/><circle cx="30" cy="18" r="2"/>',
    CLOSED_GATE:'<path d="M2 18h10m18 0h12M12 18H30M21 28V24"/><circle cx="12" cy="18" r="2"/><circle cx="30" cy="18" r="2"/><circle cx="21" cy="21" r="2"/>',
    MUX:'<path d="M4 7h8M4 21h8M12 2l20 7v10l-20 7ZM32 14h9M22 28v-5"/>',
    DEMUX:'<path d="M3 14h9M12 9l20-7v24l-20-7ZM32 7h9M32 21h9M22 28v-5"/>',
    ADD:'<rect x="10" y="3" width="24" height="22"/><path d="M2 8h8M2 20h8M34 8h8M34 20h8M16 14h12M22 8v12"/>',
    DFF:'<path d="M3 8h8M3 22h8m0-19h24v22H11ZM11 18l5 4-5 3M35 8h8"/>',
    SPLIT4:'<path d="M2 14h17M19 2v24M19 3h23M19 10h23M19 18h23M19 25h23"/>',
    PACK4:'<path d="M2 3h23M2 10h23M2 18h23M2 25h23M25 2v24M25 14h17"/>',

    NMOS:'<path d="M5 14h11m0-8v16m4-16v16m0-13h12V3m-12 16h12v6"/>',
    PMOS:'<path d="M4 14h8m5-8v16m4-16v16m0-13h11V3m-11 16h11v6"/><circle cx="14" cy="14" r="2.5"/>',
    HIGH:'<path d="M21 24V5m-6 6 6-6 6 6M13 3h16"/>',
    LOW:'<path d="M21 3v13m-9 0h18m-14 4h10m-7 4h4"/>',
    PULLDOWN:'<path d="M4 14h8l3-5 4 10 4-10 4 10 3-5h8"/>',
    JOIN:'<path d="M4 5h8l9 9H38M4 23h8l9-9"/><circle cx="21" cy="14" r="2"/>',
    INPUT:'<path d="M3 4h26l11 10-11 10H3Z"/><text x="17" y="18" text-anchor="middle" fill="currentColor" stroke="none" font-size="12">1</text>',
    OUTPUT:'<path d="M18 22h8m-8 3h8m-4 0v3M17 19c0-4-5-5-5-10a10 10 0 0 1 20 0c0 5-5 6-5 10Z"/>',
  };
  const label=({COUNT4:'PC',ZERO4:'=0',RAM2:'RAM',ALU4:'ALU',DECODE2:'DEC',CPU4:'CPU'}[key]||key).replace(/[^A-Z0-9=]/g,'');
  const drawing=lines[key]||`<rect x="7" y="3" width="30" height="22" rx="1"/><path d="M1 8h6M1 20h6M37 8h6M37 20h6"/><text x="22" y="17" text-anchor="middle" fill="currentColor" stroke="none" font-family="monospace" font-size="7">${label}</text>`;
  return `<svg viewBox="0 0 44 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawing}</svg>`;
}
