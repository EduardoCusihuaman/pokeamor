/* Immutable presentation identity. Catalog objects remain compatible with saved profiles. */
(()=>{'use strict';
const refs=new WeakMap();
function resolve(p){if(!p)return null;if(refs.has(p))return refs.get(p);
 const image=p.surface?.assets?.front||p.image||null,language=p.language||(/\/es\//.test(p.image||'')?'es':'source');
 const revision=p.resourceRevision||image||'missing',key=JSON.stringify([p.card,language,revision]);
 const thumbnail=p.image?.startsWith('https://assets.tcgdex.net/')?p.image.replace('/high.webp','/low.webp'):image;
 const ref=Object.freeze({key,print:p.card,language,revision,image,thumbnail,material:p.surface?.effect==='asset-foil'?p.surface:null});refs.set(p,ref);return ref;
}
function windowIndices(length,index){return Array.from({length:Math.min(length,index+4)-Math.max(0,index-1)},(_,i)=>Math.max(0,index-1)+i)}
window.PokeCards={resolve,key:p=>resolve(p)?.key,windowIndices};
})();
