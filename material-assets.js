/* Small, shared lookahead cache. Card changes do not restart useful downloads. */
(()=>{
'use strict';
const entries=new Map(),limit=16*1024*1024,maxEntries=20;let running=0,bytes=0,clock=0,pinned=new Set();
const valid=path=>typeof path==='string'&&path.startsWith('/materials/')&&!path.includes('..');
function trim(){for(const [path,e] of [...entries].sort((a,b)=>a[1].used-b[1].used)){if(bytes<=limit&&entries.size<=maxEntries)break;if(e.state!=='ready'||pinned.has(path))continue;bytes-=e.blob.size;if(e.url)URL.revokeObjectURL(e.url);entries.delete(path)}}
function pump(){
 while(running<4){const e=[...entries.values()].filter(e=>e.state==='queued').sort((a,b)=>a.priority-b.priority||a.used-b.used)[0];if(!e)break;
  e.state='loading';running++;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  fetch(e.path,{cache:'force-cache',signal:controller.signal,priority:e.priority===0?'high':'low'}).then(async response=>{if(!response.ok)throw Error('material unavailable');const blob=await response.blob();if(blob.size>8388608||!blob.type.startsWith('image/'))throw Error('invalid material');e.blob=blob;e.state='ready';bytes+=blob.size;e.resolve(blob)}).catch(error=>{entries.delete(e.path);e.reject(error)}).finally(()=>{clearTimeout(timeout);running--;trim();pump()});
 }
}
function enqueue(path,priority=0){if(!valid(path))return Promise.reject(Error('invalid material path'));let e=entries.get(path);if(e){e.used=++clock;e.priority=Math.min(e.priority,priority);pump();return e.promise}
 e={path,priority,state:'queued',used:++clock};e.promise=new Promise((resolve,reject)=>Object.assign(e,{resolve,reject}));entries.set(path,e);return e.promise
}
function getBlob(path,priority=0){if(window.PokeResources)return window.PokeResources.getBlob(path,priority);const promise=enqueue(path,priority);pump();return promise}
function peekFront(p){if(window.PokeResources)return window.PokeResources.peek(p.surface.assets.front);const e=entries.get(p.surface.assets.front);if(e?.state!=='ready')return null;e.used=++clock;return e.url||(e.url=URL.createObjectURL(e.blob))}
async function front(p){if(window.PokeResources)return window.PokeResources.front(p);await getBlob(p.surface.assets.front,0);const url=peekFront(p);if(!url)throw Error('material evicted');return url}
function prepare(cards,withFoil=true){if(window.PokeResources){window.PokeResources.plan('materials',cards.slice(0,2));for(const [i,p] of cards.slice(0,1).entries())if(withFoil)for(const name of ['foil',...(p.surface.etched?['etch']:[])])if(valid(p.surface.assets[name]))window.PokeResources.getBlob(p.surface.assets[name],30+i).catch(()=>{});return}
 const constrained=typeof navigator!=='undefined'&&navigator.connection?.saveData;const upcoming=cards.slice(0,constrained?1:4),paths=new Set();
 upcoming.forEach((p,index)=>{const assets=p.surface.assets;for(const name of ['front',...(withFoil?['foil',...(p.surface.etched?['etch']:[])]:[])]){const path=assets[name];if(!valid(path))continue;paths.add(path);enqueue(path,index===0?0:10+index).catch(()=>{})}});pinned=paths;
 // Drop obsolete queued work, retaining in-flight downloads for undo/reuse.
 for(const [path,e] of entries)if(e.state==='queued'&&!paths.has(path)){entries.delete(path);e.reject(Error('outside lookahead'))}
 trim();pump();
}
window.PokeAssets={getBlob,front,peekFront,prepare};
})();
