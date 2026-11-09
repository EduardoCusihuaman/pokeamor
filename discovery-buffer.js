/* One presentation per upcoming encounter. Download cache remains shared across screens. */
(()=>{'use strict';
function create({key,prepare,max=5,pixelBudget=16*1024*1024}){const entries=new Map();let sequence=0;
 function get(p){const k=key(p);let e=entries.get(k);if(e?.status==='released'){entries.delete(k);e=null}if(!e){e=prepare(p);e.used=++sequence;entries.set(k,e)}return e}
 function reconcile(queue){const keep=new Set();let pixels=0;for(const [i,p] of queue.slice(0,max).entries()){const e=entries.get(key(p)),cost=e?.image.naturalWidth*e?.image.naturalHeight*4||2*1024*1024;if(i>=3&&pixels+cost>pixelBudget)break;keep.add(key(p));pixels+=cost;get(p)}for(const [k,e] of entries)if(!keep.has(k)){entries.delete(k);if(e.owner==='buffer')e.release()}}
 function take(p,owner){const e=get(p);e.transferTo(owner,owner==='front'?0:1);return e}
 function invalidate(p){const e=entries.get(key(p));if(e?.owner==='buffer')e.release();entries.delete(key(p))}
 function snapshot(queue){let readyPrefix=0;for(const p of queue){if(entries.get(key(p))?.status!=='ready')break;readyPrefix++}return{entries:entries.size,readyPrefix}}
 return{get,take,reconcile,invalidate,snapshot};
}
window.PokeDiscoveryBuffer={create};
})();
