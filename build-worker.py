import json
from pathlib import Path
p=Path(__file__).parent
prefix='const HTML='+json.dumps((p/'page.html').read_text())+';\nconst JS='+json.dumps((p/'app.js').read_text())+';\nconst HOLO='+json.dumps((p/'holo.js').read_text())+';\nconst CATALOG='+ (p/'catalog.json').read_text()+';\n'
worker=r'''
const response=(body,status=200,extra={})=>new Response(body,{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...extra}});
export default {async fetch(request,env){
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
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
if(u.pathname==='/catalog.json')return new Response(JSON.stringify(CATALOG),{headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-cache'}});
if(u.pathname==='/holo.js')return new Response(HOLO,{headers:{...headers,'Content-Type':'text/javascript','Cache-Control':'no-cache'}});
if(u.pathname==='/app.js')return new Response(JS,{headers:{...headers,'Content-Type':'text/javascript','Cache-Control':'no-cache'}});
if(u.pathname!=='/')return new Response('Not found',{status:404});
return new Response(HTML,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}})
}};
'''
(p/'worker/index.js').write_text(prefix+worker)
