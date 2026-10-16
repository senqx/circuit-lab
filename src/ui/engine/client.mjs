// One asynchronous interface for browsers and packaged WebView applications.
export class EngineClient {
  constructor({createWorker=()=>new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'}),timeout=30000}={}) {
    this.createWorker=createWorker;
    this.timeout=timeout;
    this.pending=new Map();
    this.sequence=0;
    this.worker=null;
  }
  request(method,data) {
    return new Promise((resolve,reject)=>{
      try {
        if(!this.worker){
          const worker=this.worker=this.createWorker();
          worker.onmessage=({data:message})=>{
            const pending=this.pending.get(message.id);
            if(!pending)return;
            clearTimeout(pending.timer);this.pending.delete(message.id);
            message.error?pending.reject(new Error(message.error)):pending.resolve(message.result);
          };
          worker.onerror=event=>{event.preventDefault();this.close(new Error('The circuit engine could not start. Reload the lab to try again.'));};
          worker.onmessageerror=()=>this.close(new Error('The circuit engine returned an unreadable result.'));
        }
        const id=++this.sequence;
        const timer=setTimeout(()=>this.close(new Error('The circuit engine took too long. Your circuit is still saved; try again.')),this.timeout);
        this.pending.set(id,{resolve,reject,timer});
        try {this.worker.postMessage({id,method,data});}
        catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
      } catch(error) {reject(error);}
    });
  }
  close(error=new Error('The circuit engine was closed.')) {
    this.worker?.terminate();this.worker=null;
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}
    this.pending.clear();
  }
}

export const engine=new EngineClient();
