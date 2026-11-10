/* Optional, immutable resources. No request occurs until a loader is called. */
(()=>{
'use strict';
let manifest=window.POKE_CARD_RESOURCES;const slots={alternatives:{status:'idle'},proxies:{status:'idle'}};
function validate(kind,d,expected=manifest){
 if(d?.schema!==1||d.dataVersion!==expected.dataVersion)throw Error('Versión de recursos incompatible');
 if(kind==='alternatives'){
  if(!d.pokemon||typeof d.pokemon!=='object')throw Error('Alternativas inválidas');
  for(const [id,rows] of Object.entries(d.pokemon))if(!/^\d+$/.test(id)||!Array.isArray(rows)||rows.length>3||rows.some(r=>!Array.isArray(r)||r.length!==4||r.some(x=>typeof x!=='string')||!r[1].startsWith('https://')))throw Error('Alternativa inválida');
 }else{
  if(!Array.isArray(d.sets)||d.sets.some(s=>typeof s!=='string')||!d.prints)throw Error('Proxies inválidos');
  for(const r of Object.values(d.prints))if(!Array.isArray(r)||r.length!==3||!Number.isInteger(r[0])||!d.sets[r[0]]||typeof r[1]!=='string'||typeof r[2]!=='string')throw Error('Proxy inválido');
 }
 return d;
}
function load(kind){const s=slots[kind];if(s.data)return Promise.resolve(s.data);if(s.promise)return s.promise;s.status='loading';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 s.promise=fetch(manifest[kind],{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('No se pudo cargar el recurso');return r.json()}).then(d=>{s.data=validate(kind,d);s.status='ready';return s.data}).catch(e=>{s.status='error';throw e}).finally(()=>{clearTimeout(timer);s.promise=null});return s.promise;
}
function installBundle(bundle){const next=bundle?.manifest;if(next?.schema!==1||typeof next.dataVersion!=='string'||!Array.isArray(bundle.catalog))throw Error('Invalid resource bundle');if(new Set(bundle.catalog.map(p=>p.id)).size!==bundle.catalog.length||bundle.catalog.some(p=>!Number.isInteger(p.id)||typeof p.card!=='string'||typeof p.image!=='string'))throw Error('Invalid catalog');const alternatives=validate('alternatives',bundle.alternatives,next),proxies=validate('proxies',bundle.proxies,next);manifest=next;for(const [kind,data] of Object.entries({alternatives,proxies}))slots[kind]={data,status:'ready'};window.POKE_CARD_RESOURCES=next}
window.PokeCardResources={installBundle,loadAlternatives:()=>load('alternatives'),loadProxies:()=>load('proxies'),getAlternatives:id=>slots.alternatives.data?.pokemon[id]||[],getProxy:id=>{const d=slots.proxies.data,r=d?.prints[id];return r?{set:d.sets[r[0]],number:r[1],name:r[2]}:null},getStatus:()=>({alternatives:slots.alternatives.status,proxies:slots.proxies.status})};
})();
