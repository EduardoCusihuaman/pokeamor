/* TCGL per-print foil and etching textures from Malie.io. Original renderer. */
(()=>{
'use strict';
const kinds={FLAT_SILVER:0,SV_HOLO:1,SUN_PILLAR:2,SV_ULTRA:3};
const reduce=matchMedia('(prefers-reduced-motion: reduce)');let engine=null,current=null;
function isSupported(s,id){return !!(s&&s.status==='material-matched'&&s.effect==='asset-foil'&&s.provider==='malie.io'&&s.language==='es-ES'&&s.cardId===id&&Object.hasOwn(kinds,s.type)&&s.assets?.foil?.startsWith('/materials/')&&s.assets?.front?.startsWith('/materials/')&&(!s.etched||s.assets?.etch?.startsWith('/materials/')))}
const visible=()=>document.visibilityState!=='hidden'&&!document.querySelector('.sheet.open')&&!document.querySelector('dialog[open]');
const vertex=`attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
const fragment=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_mask;
uniform sampler2D u_etch;
uniform vec2 u_texel;
uniform vec2 u_light;
uniform float u_energy;
uniform float u_kind;
uniform float u_etched;
const float TAU=6.2831853;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float heightAt(vec2 uv){vec4 t=texture2D(u_etch,uv);return lum(t.rgb)*t.a;}
void main(){
 vec2 uv=vec2(v_uv.x,1.-v_uv.y);
 vec4 plate=texture2D(u_mask,uv);
 float coverage=lum(plate.rgb)*plate.a;
 if(coverage<.006){gl_FragColor=vec4(0.);return;}
 // Derivatives come from this printing's actual etched image, not procedural grain.
 vec2 gradient=vec2(heightAt(uv+vec2(u_texel.x,0.))-heightAt(uv-vec2(u_texel.x,0.)),heightAt(uv+vec2(0.,u_texel.y))-heightAt(uv-vec2(0.,u_texel.y)));
 vec3 normal=normalize(vec3(gradient*8.*u_etched,1.));
 vec3 light=normalize(vec3(u_light*.9,1.35));
 vec3 halfVector=normalize(light+vec3(0.,0.,1.));
 float spec=pow(max(0.,dot(normal,halfVector)),mix(28.,76.,u_etched));
 bool diagonal=u_kind>1.5&&u_kind<2.5;
 vec2 axis=diagonal?normalize(vec2(.7,.7)):vec2(0.,1.);
 float frequency=u_kind>2.5?2.3:diagonal?3.4:5.4;
 float phase=dot(uv,axis)*frequency+dot(u_light,vec2(.64,.43))+dot(normal.xy,vec2(.17,.21));
 vec3 spectral=.5+.5*cos(TAU*(phase+vec3(.0,.333,.666)));
 if(u_kind<.5)spectral=vec3(.8,.84,.9);
 float band=pow(.5+.5*sin(TAU*phase),4.);
 float facet=spec*(.4+.6*band);
 vec3 color=mix(.04+spectral*.68,vec3(.96,.97,1.),facet*.58);
 // The source plate preserves printed text and selects the real reflective areas.
 float alpha=clamp(coverage*u_energy*(.12+band*.31+facet*.3),0.,.48);
 gl_FragColor=vec4(color*alpha,alpha);
}`;
async function decode(path,signal){const r=await fetch(path,{signal,cache:'force-cache'});if(!r.ok)throw Error('material unavailable');const b=await r.blob();if(b.size>8388608||!b.type.startsWith('image/'))throw Error('invalid material');if(typeof createImageBitmap==='function'){const image=await createImageBitmap(b);if(signal.aborted){image.close();throw Error('cancelled')}return image}return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(b);const abort=()=>{image.src='';URL.revokeObjectURL(url);reject(Error('cancelled'))};signal.addEventListener('abort',abort,{once:true});image.onload=()=>{signal.removeEventListener('abort',abort);URL.revokeObjectURL(url);resolve(image)};image.onerror=()=>{signal.removeEventListener('abort',abort);URL.revokeObjectURL(url);reject(Error('decode failed'))};image.src=url})}
function createEngine(){
 const canvas=document.createElement('canvas');canvas.className='material-canvas';canvas.setAttribute('aria-hidden','true');let gl;
 try{gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'low-power'})}catch{return null}if(!gl)return null;
 let program,buffer,loc,flat,ready=false,pair=null,controller=null,serial=0,frame=0,available=false;
 let target={x:0,y:0,energy:.22},smooth={...target};
 function compile(type,src){const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);throw Error('compile failed')}return shader}
 function texture(image){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);if(image)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));return t}
 function init(){try{const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('link failed');buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);loc={position:gl.getAttribLocation(program,'a_position')};for(const n of ['mask','etch','texel','light','energy','kind','etched'])loc[n]=gl.getUniformLocation(program,'u_'+n);flat=texture(null);available=true;return true}catch{available=false;return false}}
 if(!init())return null;
 function pause(){cancelAnimationFrame(frame);frame=0}
 function cleanup(){controller?.abort();controller=null;serial++;ready=false;pause();if(pair&&available){gl.deleteTexture(pair.mask);if(pair.etch!==flat)gl.deleteTexture(pair.etch)}pair=null;canvas.parentElement?.classList.remove('has-material');canvas.remove()}
 function draw(){frame=0;if(!ready||!pair||!current||!current.card.materialFrontReady||reduce.matches||!visible()||!available)return;
  const card=current.card,w=Math.max(1,Math.min(640,Math.round(card.clientWidth*Math.min(window.devicePixelRatio||1,1.5)))),h=Math.max(1,Math.round(w/(card.artRatio||.716)));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}gl.viewport(0,0,w,h);let settling=false;
  for(const k of ['x','y','energy']){smooth[k]+=(target[k]-smooth[k])*.25;if(Math.abs(smooth[k]-target[k])>.002)settling=true}
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(loc.position);gl.vertexAttribPointer(loc.position,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,pair.mask);gl.uniform1i(loc.mask,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,pair.etch);gl.uniform1i(loc.etch,1);
  gl.uniform2f(loc.texel,1/pair.width,1/pair.height);gl.uniform2f(loc.light,smooth.x,smooth.y);gl.uniform1f(loc.energy,smooth.energy);gl.uniform1f(loc.kind,kinds[current.surface.type]);gl.uniform1f(loc.etched,current.surface.etched?1:0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  if(settling)frame=requestAnimationFrame(draw);
 }
 const api={attach(scene){cleanup();if(!available||reduce.matches)return;const generation=serial;controller=new AbortController();const signal=controller.signal;const names=['foil',...(scene.surface.etched?['etch']:[])];Promise.allSettled(names.map(n=>decode(scene.surface.assets[n],signal))).then(results=>{
  const loaded=results.filter(r=>r.status==='fulfilled').map(r=>r.value);if(generation!==serial||current!==scene||results.some(r=>r.status==='rejected')||!available){loaded.forEach(i=>i.close?.());return}
  try{pair={mask:texture(loaded[0]),etch:loaded[1]?texture(loaded[1]):flat,width:loaded[1]?.width||loaded[0].width,height:loaded[1]?.height||loaded[0].height};ready=true;scene.card.append(canvas);scene.card.classList.add('has-material');api.set(scene.light)}catch{cleanup()}finally{loaded.forEach(i=>i.close?.())}
 })},set(input){target={...input};if(!frame&&visible())frame=requestAnimationFrame(draw)},pause,detach:cleanup,refresh(){if(current)api.set(current.light)}};
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cleanup();available=false;current?.card.classList.remove('has-material')});canvas.addEventListener('webglcontextrestored',()=>{if(init()&&current)api.attach(current)});
 return api;
}
function acquire(){if(engine===null)engine=createEngine()||false;return engine||null}
window.PokeMaterial={isSupported,attach(card,p){if(!isSupported(p.surface,p.card)||reduce.matches)return{supported:false,set(){},dispose(){}};if(current)current.dispose();const scene={card,surface:p.surface,light:{x:0,y:0,energy:.22},supported:true,set(x,y,energy){scene.light={x,y,energy};if(current===scene)engine&&engine.set(scene.light)},dispose(){if(current===scene){engine&&engine.detach();current=null}card.classList.remove('has-material')}};current=scene;acquire()?.attach(scene);return scene},refresh(){engine&&engine.refresh()},pause(){engine&&engine.pause()}};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')engine&&engine.pause();else engine&&engine.refresh()});window.addEventListener('pagehide',()=>engine&&engine.pause());window.addEventListener('pageshow',()=>engine&&engine.refresh());reduce.addEventListener?.('change',()=>{if(reduce.matches){engine&&engine.detach();current?.card.classList.remove('has-material')}else if(current)acquire()?.attach(current)});
})();
