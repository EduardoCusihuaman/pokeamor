/* Sensor-driven pose; matched optical material is handled separately. */
(()=>{
'use strict';
const $=s=>document.querySelector(s),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
let active=null,enabled=false,pending=false,baseline=null,lastReading=null,watchdog=0,epoch=0;
const button=$('#motion-button'),setting=$('#motion-setting'),status=$('#motion-status');
const orientation=window.DeviceOrientationEvent;
const supported=typeof orientation!=='undefined'&&window.isSecureContext!==false;
const visible=()=>document.visibilityState!=='hidden'&&!$('.sheet.open')&&!$('dialog[open]');
function ui(message){button.disabled=pending||reduce.matches||!supported;setting.disabled=button.disabled;setting.checked=enabled;button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Desactivar brillo y movimiento':'Activar brillo y movimiento');button.title=reduce.matches?'Movimiento reducido activado':!supported?'Movimiento no disponible':enabled?'Movimiento activado':'Activar brillo y movimiento';button.classList.toggle('enabled',enabled);if(message)status.textContent=message;}
// Motion and optical material are independent. No physical foil is guessed.
function applyLight(scene,x,y,energy){scene.light={x,y,energy};scene.material?.set(x,y,energy)}
function sensorLight(){if(!active||active.pressed||!lastReading||!enabled||reduce.matches||!visible())return;const x=clamp(lastReading.x/22,-1,1),y=clamp(lastReading.y/22,-1,1);active.onTilt(-y*2.2,x*2.2);applyLight(active,x,y,.48+Math.hypot(x,y)*.42)}
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
function recenter(){baseline=null;lastReading=null;if(active&&!active.pressed){active.onTilt(0,0);applyLight(active,0,0,.36)}}
function disable(message){epoch++;enabled=false;pending=false;clearTimeout(watchdog);window.removeEventListener('deviceorientation',handleOrientation);recenter();ui(message||'Podés seguir deslizando con el dedo.')}
async function enable(){if(pending||reduce.matches||!supported){ui(!supported?'Podés deslizar las cartas con el dedo.':'El efecto respeta Movimiento reducido.');return false}const ticket=++epoch;pending=true;ui();try{
 // Must stay directly inside this user gesture on Safari.
 const permission=typeof orientation.requestPermission==='function'?await orientation.requestPermission():'granted';
 if(ticket!==epoch)return false;if(permission!=='granted'){disable('Sin permiso de movimiento. Podés seguir usando el dedo.');return false}
 enabled=true;pending=false;recenter();listen();ui('Incliná suavemente el teléfono. El dedo tiene prioridad al deslizar.');
 watchdog=setTimeout(()=>{if(enabled&&!baseline)disable('No recibimos datos del sensor. Podés seguir deslizando con el dedo.')},3500);return true;
 }catch{if(ticket===epoch)disable('No pudimos activar el sensor. Podés seguir deslizando con el dedo.');return false}}
button.onclick=()=>enabled?disable():enable();setting.onchange=()=>setting.checked?enable():disable();
window.addEventListener('orientationchange',recenter);window.screen?.orientation?.addEventListener?.('change',recenter);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){window.removeEventListener('deviceorientation',handleOrientation);clearTimeout(watchdog)}else if(enabled){recenter();listen()}});
reduce.addEventListener?.('change',()=>{if(reduce.matches){disable('El efecto respeta Movimiento reducido.')}ui()});
window.addEventListener('pagehide',()=>{disable()});
window.PokeHolo={attach(card,p,{onTilt}){
 if(active)active.dispose();const scene={card,holo:false,full:0,finish:0,pressed:false,onTilt,light:{x:0,y:0,energy:.36},
 pointer(px,py){scene.pressed=true;applyLight(scene,clamp(px*2-1,-1,1),clamp(py*2-1,-1,1),.98)},
 release(){scene.pressed=false;if(enabled&&lastReading)sensorLight();else{scene.onTilt(0,0);applyLight(scene,0,0,.36)}},
 dispose(){scene.material?.dispose();if(active===scene)active=null}
 };active=scene;scene.material=window.PokeMaterial?.attach(card,p);scene.holo=!!scene.material?.supported;card.classList.add('original-surface');sensorLight();return scene
},refresh(){if(active)applyLight(active,active.light.x,active.light.y,active.light.energy);window.PokeMaterial?.refresh()},recenter,enable,disable};
ui(supported?'Activá el sensor para inclinar suavemente la carta.':'Podés deslizar las cartas con el dedo.');
})();
