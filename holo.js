/* Original procedural foil overlay. One reusable WebGL surface, no artwork textures. */
(()=>{
'use strict';
const $=s=>document.querySelector(s),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const vertex=`attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
const fragment=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;uniform vec2 u_light;uniform float u_energy;uniform float u_full;
float random(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
void main(){
 vec2 uv=vec2(v_uv.x,1.-v_uv.y),p=uv-.5;
 float sweep=dot(p,normalize(vec2(.7,.4)))+dot(u_light,vec2(.32,.2));
 float band=exp(-pow(sweep*10.,2.));
 vec2 lamp=vec2(.5)+u_light*.45;
 float glare=exp(-dot(uv-lamp,uv-lamp)*18.);
 vec3 rainbow=.5+.5*cos(6.2831853*(sweep*1.9+vec3(.0,.33,.67)));
 vec3 pearl=mix(vec3(.98,.95,1.),rainbow,.45);
 vec2 grid=uv*vec2(170.,235.),cell=fract(grid)-.5;
 float grain=random(floor(grid));
 float fleck=step(.983,grain)*exp(-dot(cell,cell)*65.)*pow(band,2.);
 float art=smoothstep(.07,.11,uv.x)*(1.-smoothstep(.89,.93,uv.x))*smoothstep(.12,.17,uv.y)*(1.-smoothstep(.55,.61,uv.y));
 float full=smoothstep(.02,.09,uv.y)*(1.-smoothstep(.9,.97,uv.y));
 float mask=mix(art,full,u_full);
 float alpha=clamp((band*.22+glare*.17+fleck*.6)*u_energy*mask,0.,.38);
 vec3 color=mix(pearl,vec3(1.),clamp(glare*.6+fleck,0.,1.));
 gl_FragColor=vec4(color*alpha,alpha);
}`;
let active=null,engine=null,enabled=false,pending=false,baseline=null,lastReading=null,watchdog=0,epoch=0;
const button=$('#motion-button'),setting=$('#motion-setting'),status=$('#motion-status');
const orientation=window.DeviceOrientationEvent;
const supported=typeof orientation!=='undefined'&&window.isSecureContext!==false;
const visible=()=>document.visibilityState!=='hidden'&&!$('.sheet.open')&&!$('dialog[open]');
function ui(message){button.disabled=pending||reduce.matches||!supported;setting.disabled=button.disabled;setting.checked=enabled;button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Desactivar brillo con movimiento':'Activar brillo con movimiento');button.title=reduce.matches?'Movimiento reducido activado':!supported?'El brillo responde al toque':enabled?'Brillo con movimiento activado':'Activar brillo con movimiento';button.classList.toggle('enabled',enabled);if(message)status.textContent=message;}
function createEngine(){
 const canvas=document.createElement('canvas');canvas.className='holo-canvas';canvas.setAttribute('aria-hidden','true');
 let gl;try{gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'})}catch{return null}if(!gl)return null;
 let program=null,buffer=null,locations=null,frame=0,available=false,destroyed=false,last={x:0,y:0,energy:.24,full:0},output={...last};
 function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);throw Error('foil shader unavailable')}return shader}
 function init(){try{const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('foil link failed');buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);locations={position:gl.getAttribLocation(program,'a_position'),light:gl.getUniformLocation(program,'u_light'),energy:gl.getUniformLocation(program,'u_energy'),full:gl.getUniformLocation(program,'u_full')};available=true;return true}catch{available=false;return false}}
 if(!init())return null;
 function draw(){frame=0;if(destroyed||!available||!active?.holo||reduce.matches||!visible())return;
  const c=active.card,dpr=Math.min(window.devicePixelRatio||1,1.5),width=Math.max(1,Math.min(640,Math.round(c.clientWidth*dpr))),height=Math.max(1,Math.round(width/(c.artRatio||.716)));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}gl.viewport(0,0,width,height);
  let settling=false;for(const k of ['x','y','energy']){output[k]+=(last[k]-output[k])*.25;if(Math.abs(last[k]-output[k])>.002)settling=true}output.full=last.full;
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(locations.position);gl.vertexAttribPointer(locations.position,2,gl.FLOAT,false,0,0);gl.uniform2f(locations.light,output.x,output.y);gl.uniform1f(locations.energy,output.energy);gl.uniform1f(locations.full,output.full);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  if(settling)frame=requestAnimationFrame(draw);
 }
 const api={get available(){return available},attach(scene){if(!available||destroyed)return;scene.card.append(canvas);scene.card.classList.add('has-shader');api.update(scene.light.x,scene.light.y,scene.light.energy,scene.full)},update(x,y,energy,full){last={x,y,energy,full};if(!frame&&visible())frame=requestAnimationFrame(draw)},pause(){cancelAnimationFrame(frame);frame=0},detach(){api.pause();canvas.parentElement?.classList.remove('has-shader');canvas.remove()},dispose(){destroyed=true;api.detach();if(available){gl.deleteBuffer(buffer);gl.deleteProgram(program)}canvas.remove()}};
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();available=false;api.pause();active?.card.classList.remove('has-shader')});
 canvas.addEventListener('webglcontextrestored',()=>{if(!destroyed&&init()&&active?.holo)api.attach(active)});
 return api;
}
function getEngine(){if(engine===null)engine=createEngine()||false;return engine||null}
function applyLight(scene,x,y,energy){scene.light={x,y,energy};scene.card.style.setProperty('--x',((x+1)*50)+'%');scene.card.style.setProperty('--y',((y+1)*50)+'%');scene.card.style.setProperty('--angle',(115+x*22)+'deg');scene.card.classList.toggle('sensor-lit',enabled&&!scene.pressed);if(scene.holo&&active===scene&&!reduce.matches){const renderer=getEngine();if(renderer?.available){if(!scene.card.classList.contains('has-shader'))renderer.attach(scene);renderer.update(x,y,energy,scene.full)}}}
function sensorLight(){if(!active||active.pressed||!lastReading||!enabled||reduce.matches||!visible())return;const x=clamp(lastReading.x/22,-1,1),y=clamp(lastReading.y/22,-1,1);active.onTilt(-y*2.2,x*2.2);applyLight(active,x,y,.3+Math.hypot(x,y)*.62)}
function handleOrientation(event){if(!enabled||reduce.matches||document.visibilityState==='hidden'||typeof event.beta!=='number'||typeof event.gamma!=='number'||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return;
 clearTimeout(watchdog);const angle=(window.screen?.orientation?.angle||window.orientation||0)*Math.PI/180;
 const reading={x:event.gamma*Math.cos(angle)+event.beta*Math.sin(angle),y:event.beta*Math.cos(angle)-event.gamma*Math.sin(angle)};
 if(!visible()){baseline=reading;lastReading={x:0,y:0};return}
 if(!baseline)baseline=reading;
 const wrap=n=>((n+180)%360+360)%360-180;
 const next={x:wrap(reading.x-baseline.x),y:wrap(reading.y-baseline.y)};
 if(!lastReading)lastReading=next;else{lastReading.x+=(next.x-lastReading.x)*.22;lastReading.y+=(next.y-lastReading.y)*.22}sensorLight();
}
function listen(){window.removeEventListener('deviceorientation',handleOrientation);window.addEventListener('deviceorientation',handleOrientation,{passive:true})}
function recenter(){baseline=null;lastReading=null;if(active&&!active.pressed){active.onTilt(0,0);applyLight(active,0,0,.24)}}
function disable(message){epoch++;enabled=false;pending=false;clearTimeout(watchdog);window.removeEventListener('deviceorientation',handleOrientation);recenter();active?.card.classList.remove('sensor-lit');ui(message||'El brillo sigue respondiendo al toque.')}
async function enable(){if(pending||reduce.matches||!supported){ui(!supported?'El brillo responde al toque en este dispositivo.':'El efecto respeta Movimiento reducido.');return false}const ticket=++epoch;pending=true;ui();try{
 // Must stay directly inside this user gesture on Safari.
 const permission=typeof orientation.requestPermission==='function'?await orientation.requestPermission():'granted';
 if(ticket!==epoch)return false;if(permission!=='granted'){disable('Sin permiso de movimiento. Podés seguir usando el dedo.');return false}
 enabled=true;pending=false;recenter();listen();ui('Incliná suavemente el teléfono. El dedo tiene prioridad al deslizar.');
 watchdog=setTimeout(()=>{if(enabled&&!baseline)disable('No recibimos datos del sensor. El brillo sigue al toque.')},3500);return true;
 }catch{if(ticket===epoch)disable('No pudimos activar el sensor. El brillo sigue al toque.');return false}}
button.onclick=()=>enabled?disable():enable();setting.onchange=()=>setting.checked?enable():disable();
window.addEventListener('orientationchange',recenter);window.screen?.orientation?.addEventListener?.('change',recenter);
document.addEventListener('visibilitychange',()=>{engine&&engine.pause();if(document.visibilityState==='hidden'){window.removeEventListener('deviceorientation',handleOrientation);clearTimeout(watchdog)}else if(enabled){recenter();listen()}});
reduce.addEventListener?.('change',()=>{if(reduce.matches){disable('El efecto respeta Movimiento reducido.');engine&&engine.pause()}ui()});
window.addEventListener('pagehide',()=>{disable();engine&&engine.dispose();engine=null});
window.PokeHolo={attach(card,p,{onTilt}){
 if(active)active.dispose();const scene={card,holo:!!p.holo,full:p.special||/ultra|vmax|secret/i.test(p.rarity||'')?1:0,pressed:false,onTilt,light:{x:0,y:0,energy:.24},
 pointer(px,py){scene.pressed=true;applyLight(scene,clamp(px*2-1,-1,1),clamp(py*2-1,-1,1),.78)},
 release(){scene.pressed=false;if(enabled&&lastReading)sensorLight();else{scene.onTilt(0,0);applyLight(scene,0,0,.24)}},
 dispose(){if(active===scene){engine&&engine.detach();active=null}card.classList.remove('has-shader','sensor-lit')}
 };active=scene;if(scene.holo&&!reduce.matches)getEngine()?.attach(scene);sensorLight();return scene
},refresh(){if(active)applyLight(active,active.light.x,active.light.y,active.light.energy)},recenter,enable,disable};
ui(supported?'Activá el sensor para que el reflejo acompañe al teléfono.':'En este dispositivo el brillo sigue al dedo.');
})();
