import json
from pathlib import Path
p=Path(__file__).parent
prefix='const HTML='+json.dumps((p/'page.html').read_text())+';\nconst JS='+json.dumps((p/'app.js').read_text())+';\nconst HOLO='+json.dumps((p/'holo.js').read_text())+';\nconst ASSET_JS='+json.dumps((p/'material-assets.js').read_text())+';\nconst MATERIAL_JS='+json.dumps((p/'material-renderer.js').read_text())+';\nconst MATERIALS='+(p/'materials.json').read_text()+';\nconst CATALOG='+ (p/'catalog.json').read_text()+';\n'
worker=r'''
const materialInflight=new Map();
const response=(body,status=200,extra={})=>new Response(body,{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...extra}});
export default {async fetch(request,env,ctx){
const u=new URL(request.url);
if(u.pathname.startsWith('/api/session/')){
const id=u.pathname.slice(13);if(!/^[a-f0-9]{64}$/.test(id))return response('{}',400);
if(!env.BUCKET)return response('{"error":"storage_unavailable"}',503);
const key='sessions/'+id+'.json';
try{
if(request.method==='GET'){const obj=await env.BUCKET.get(key);return obj?response(await obj.text(),200,{'ETag':obj.httpEtag}):response('{}',404)}
if(request.method==='PUT'){
if(request.headers.get('Origin')!==u.origin)return response('{}',403);
const body=await request.text();if(body.length>1500000)return response('{}',413);let v;try{v=JSON.parse(body)}catch{return response('{}',400)}
if(!v||typeof v.votes!=='object'||!v.votes||typeof v.ratings!=='object'||!Array.isArray(v.history)||!Number.isFinite(v.revision)||!Number.isFinite(v.duels))return response('{}',400);
for(const [n,x] of Object.entries(v.votes))if(!/^\d+$/.test(n)||Number(n)<1||Number(n)>1025||!x||!['yes','no'].includes(x.value))return response('{}',400);
for(const [n,x] of Object.entries(v.ratings))if(!/^\d+$/.test(n)||!x||!Number.isFinite(x.score)||!Number.isFinite(x.played))return response('{}',400);
if(!request.headers.has('If-Match')&&!request.headers.has('If-None-Match'))return response('{}',428);
const obj=await env.BUCKET.put(key,body,{onlyIf:request.headers,httpMetadata:{contentType:'application/json'}});return obj?response('{"saved":true}',200,{'ETag':obj.httpEtag}):response('{}',412)
}return response('{}',405)
}catch{return response('{"error":"storage_unavailable"}',503)}
}
if(request.method!=='GET'&&request.method!=='HEAD')return response('{}',405);
if(MATERIALS[u.pathname]){
 const source=MATERIALS[u.pathname],key='material-cache'+u.pathname;
 const headers={'Content-Type':source.contentType,'Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'};
 const cache=typeof caches!=='undefined'?caches.default:null,cacheRequest=new Request(u.origin+u.pathname);
 const defer=p=>{if(ctx?.waitUntil)ctx.waitUntil(p.catch(()=>{}));else p.catch(()=>{})};
 try{
  if(cache){const hit=await cache.match(cacheRequest);if(hit){const result=new Response(request.method==='HEAD'?null:hit.body,hit);result.headers.set('X-Material-Cache','edge');return result}}
  let pending=materialInflight.get(key);
  if(!pending){pending=(async()=>{
   if(env.BUCKET){const cached=await env.BUCKET.get(key);if(cached)return {bytes:await cached.arrayBuffer(),headers:{...headers,'X-Material-Cache':'r2',...(cached.httpEtag?{'ETag':cached.httpEtag}:{})}}}
   const upstream=await fetch(source.url,{headers:{'User-Agent':'Pokeamor/1.0 (+https://pokeamor-cartas.h4lconn.chatgpt.site)','Accept':'image/png'},signal:AbortSignal.timeout(12000)});
   if(!upstream.ok||Number(upstream.headers.get('Content-Length')||0)>8388608)return {error:'material_unavailable'};
   const bytes=await upstream.arrayBuffer(),signature=new Uint8Array(bytes,0,Math.min(8,bytes.byteLength));
   if(bytes.byteLength<24||bytes.byteLength>8388608||signature.join(',')!=='137,80,78,71,13,10,26,10')return {error:'invalid_material'};
   if(env.BUCKET){const put=env.BUCKET.put(key,bytes,{httpMetadata:{contentType:source.contentType}}).catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(put);else await put}
   return {bytes,headers:{...headers,'X-Material-Cache':'origin'}};
  })();materialInflight.set(key,pending);if(ctx?.waitUntil)ctx.waitUntil(pending.catch(()=>{}));pending.finally(()=>{if(materialInflight.get(key)===pending)materialInflight.delete(key)}).catch(()=>{})}
  const loaded=await pending;if(loaded.error)return response(JSON.stringify({error:loaded.error}),502);
  const result=new Response(loaded.bytes,{headers:loaded.headers});if(cache)defer(cache.put(cacheRequest,result.clone()));
  return request.method==='HEAD'?new Response(null,{status:result.status,headers:result.headers}):result;
 }catch{return response('{"error":"material_unavailable"}',502)}
}

const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
if(u.pathname==='/catalog.json')return new Response(JSON.stringify(CATALOG),{headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-cache'}});
if(u.pathname==='/material-assets.js')return new Response(ASSET_JS,{headers:{...headers,'Content-Type':'text/javascript','Cache-Control':'no-cache'}});
if(u.pathname==='/material-renderer.js')return new Response(MATERIAL_JS,{headers:{...headers,'Content-Type':'text/javascript','Cache-Control':'no-cache'}});
if(u.pathname==='/holo.js')return new Response(HOLO,{headers:{...headers,'Content-Type':'text/javascript','Cache-Control':'no-cache'}});
if(u.pathname==='/app.js')return new Response(JS,{headers:{...headers,'Content-Type':'text/javascript','Cache-Control':'no-cache'}});
if(u.pathname!=='/')return new Response('Not found',{status:404});
return new Response(HTML,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}})
}};
'''
(p/'worker/index.js').write_text(prefix+worker)
