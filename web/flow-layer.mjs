// Presentation only. Native transform animations run on the compositor;
// JavaScript updates paths only when geometry, signals, or the camera change.
export class FlowLayer {
  constructor(element) {
    this.element=element;this.routes=new Map();this.camera={x:0,y:0,scale:1,width:0,height:0};
    this.paused=false;this.inView=true;this.epoch=document.timeline.currentTime||0;
    this.reduced=matchMedia('(prefers-reduced-motion:reduce)');
    this.reduced.addEventListener('change',()=>this.refresh());
    document.addEventListener('visibilitychange',()=>this.refresh());
    new IntersectionObserver(entries=>{this.inView=entries.at(-1).isIntersecting;this.refresh();}).observe(element.parentElement);
  }
  setRoute(key,route) {
    const previous=this.routes.get(key);if(previous?.path===route.path)return;
    const points=route.points,lengths=[0];
    for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
    const length=lengths.at(-1),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    this.remove(key);
    const r={path:route.path,active:previous?.active||false,dots:[],length,
      left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys),
      frames:points.map((p,i)=>({transform:`translate3d(${p.x}px,${p.y}px,0)`,offset:length?lengths[i]/length:0}))};
    this.routes.set(key,r);this.update(r);
  }
  setActive(key,active) {const r=this.routes.get(key);if(r&&r.active!==active){r.active=active;this.update(r);}}
  remove(key) {const r=this.routes.get(key);if(r){for(const d of r.dots){d.animation.cancel();d.element.remove();}this.routes.delete(key);}}
  setCamera(camera,width,height) {
    this.camera={...camera,width,height};
    this.element.style.transform=`translate3d(${-camera.x*camera.scale}px,${-camera.y*camera.scale}px,0) scale(${camera.scale})`;
    this.refresh();
  }
  setPaused(paused) {this.paused=paused;this.refresh();}
  refresh() {for(const r of this.routes.values())this.update(r);}
  update(r) {
    const {x,y,scale,width,height}=this.camera;
    const visible=r.active&&r.length>0&&r.right>=x&&r.left<=x+width/scale&&r.bottom>=y&&r.top<=y+height/scale;
    if(!visible){for(const d of r.dots){d.animation.cancel();d.element.remove();}r.dots=[];return;}
    if(!r.dots.length) {
      const count=Math.max(1,Math.min(3,Math.ceil(r.length/160))),duration=r.length/60*1000;
      for(let i=0;i<count;i++) {
        const element=document.createElement('i');element.className='flow-dot';this.element.append(element);
        const animation=element.animate(r.frames,{duration,iterations:Infinity,easing:'linear'});
        animation.startTime=this.epoch-i*duration/count;
        r.dots.push({element,animation});
      }
    }
    const running=!this.paused&&!this.reduced.matches&&!document.hidden&&this.inView;
    for(const d of r.dots)if(running?d.animation.playState!=='running':d.animation.playState!=='paused')running?d.animation.play():d.animation.pause();
  }
}
