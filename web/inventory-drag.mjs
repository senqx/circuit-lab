// Pointer-based so the same gesture works with a mouse, pen, or touch.
// Only the preview moves during a drag. The circuit changes once, on drop.
export function bindInventoryDrag(tray, { preview, place, board, position, onActive=()=>{} }) {
  let drag=null, frame=0, suppressClick=false;
  const paint=()=>{
    frame=0;
    if(!drag?.ghost)return;
    const {x,y,scale,valid}=position(drag.point);
    drag.ghost.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
    drag.ghost.classList.toggle('valid',valid);
    board.classList.toggle('drop-ready',valid);
  };
  const finish=(drop=false)=>{
    if(!drag)return;
    const action=drag;drag=null;
    cancelAnimationFrame(frame);frame=0;
    action.ghost?.remove();board.classList.remove('drop-ready');
    onActive(false);
    action.button.classList.remove('dragging');
    if(action.button.hasPointerCapture(action.id))action.button.releasePointerCapture(action.id);
    if(action.ghost){
      suppressClick=true;
      if(drop&&position(action.point).valid)place(action.button,action.point);
    }
  };
  tray.addEventListener('pointerdown',e=>{
    const button=e.target.closest('[data-part]');
    if(!button||e.button!==0||drag)return;
    suppressClick=false;
    drag={button,id:e.pointerId,start:{x:e.clientX,y:e.clientY},point:e};
    button.setPointerCapture(e.pointerId);
  });
  tray.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    drag.point={clientX:e.clientX,clientY:e.clientY};
    if(!drag.ghost){
      if(Math.hypot(e.clientX-drag.start.x,e.clientY-drag.start.y)<7)return;
      drag.ghost=document.createElement('div');
      drag.ghost.className='inventory-ghost';drag.ghost.inert=true;drag.ghost.setAttribute('aria-hidden','true');
      drag.ghost.innerHTML=preview(drag.button);
      document.body.append(drag.ghost);drag.button.classList.add('dragging');
      onActive(true);
    }
    if(!frame)frame=requestAnimationFrame(paint);
  });
  tray.addEventListener('pointerup',e=>{
    if(drag?.id!==e.pointerId)return;
    drag.point={clientX:e.clientX,clientY:e.clientY};finish(true);
  });
  tray.addEventListener('pointercancel',()=>finish());
  tray.addEventListener('lostpointercapture',()=>finish());
  tray.addEventListener('click',e=>{
    if(suppressClick&&e.detail!==0){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}
  },true);
  window.addEventListener('blur',()=>finish());
  document.addEventListener('keydown',e=>{if(e.key==='Escape')finish();});
  return ()=>finish();
}
