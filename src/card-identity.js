/* Immutable presentation identity. Catalog objects remain compatible with saved profiles. */
(()=>{'use strict';
let refs=new WeakMap(),revisionVersion='initial';const species=new Map(),prints=new Map(),locales=new Map();
function resolve(p){if(!p)return null;if(refs.has(p))return refs.get(p);
 const image=p.surface?.assets?.front||p.image||null,language=p.language||(/\/es\//.test(p.image||'')?'es':'source');
 const revision=p.resourceRevision||image||'missing',key=JSON.stringify([p.card,language,revision]);
 const thumbnail=p.image?.startsWith('https://assets.tcgdex.net/')?p.image.replace('/high.webp','/low.webp'):image;
 const ref=Object.freeze({key,print:p.card,language,revision,image,thumbnail,material:p.surface?.effect==='asset-foil'?Object.freeze({...p.surface,assets:Object.freeze({...p.surface.assets})}):null,proxy:window.PokeCardResources?.getProxy(p.card)||null});refs.set(p,ref);return ref;
}
function windowIndices(length,index){return Array.from({length:Math.min(length,index+4)-Math.max(0,index-1)},(_,i)=>Math.max(0,index-1)+i)}
function install(catalog,version){if(!Array.isArray(catalog)||!version)throw Error('Invalid catalog revision');refs=new WeakMap();species.clear();prints.clear();locales.clear();revisionVersion=version;for(const p of catalog){const ref=resolve(p);species.set(p.id,Object.freeze({id:p.id,name:p.name,principal:ref.key}));prints.set(ref.print,Object.freeze({id:ref.print}));locales.set(ref.key,ref)}}
window.PokeCards={install,getSpecies:id=>species.get(id),getPrint:id=>prints.get(id),getLocale:key=>locales.get(key),getRevision:()=>revisionVersion,resolve,key:p=>resolve(p)?.key,windowIndices};
})();
