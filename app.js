const $=s=>document.querySelector(s);let catalog=[],order=[],filter='yes',busy=false,pair=[],lastPair='',syncTimer,toastTimer;
const q=new URLSearchParams(location.hash.slice(1)),token=q.get('s')||localStorage.getItem('pokeamor-token')||crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');localStorage.setItem('pokeamor-token',token);history.replaceState(null,'','#s='+token);const key='pokeamor-'+token;
let state;try{state=JSON.parse(localStorage.getItem(key))}catch{}state=state||{votes:{},ratings:{},duels:0,history:[],revision:0};state.voteTimes=state.voteTimes||{};state.ratingTimes=state.ratingTimes||{};
let etag=null,cloudReady=false,dirty=localStorage.getItem(key+'-pending')==='1',syncing=false,restoring=null,retryDelay=1200,refreshTimer;
const clone=v=>JSON.parse(JSON.stringify(v));let observedVotes=clone(state.votes),observedRatings=clone(state.ratings);
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600)}
function persist(){try{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem(key+'-pending',dirty?'1':'0');return true}catch{$('#save').textContent='No se pudo guardar';return false}}
function trackChanges(){for(const [field,observed,times] of [['votes',observedVotes,state.voteTimes],['ratings',observedRatings,state.ratingTimes]])for(const id of new Set([...Object.keys(observed),...Object.keys(state[field])]))if(JSON.stringify(observed[id])!==JSON.stringify(state[field][id]))times[id]=Math.max(Date.now(),(times[id]||0)+1);observedVotes=clone(state.votes);observedRatings=clone(state.ratings)}
function save(){trackChanges();state.revision++;dirty=true;if(persist())$('#save').textContent='Guardado en este iPhone';else toast('Exportá tu colección para conservarla.');clearTimeout(syncTimer);syncTimer=setTimeout(sync,700)}
function refreshAfterMerge(){clearTimeout(refreshTimer);if($('.card.active')){refreshTimer=setTimeout(refreshAfterMerge,150);return}render();if($('#sheet').classList.contains('open'))collection()}
function mergeRemote(remote){
 const votes={},voteTimes={},ratings={},ratingTimes={},local=state;
 for(const id of new Set([...Object.keys(local.votes),...Object.keys(remote.votes||{}),...Object.keys(local.voteTimes),...Object.keys(remote.voteTimes||{})])){
  const lt=local.voteTimes[id]||local.votes[id]?.time||0,rt=remote.voteTimes?.[id]||remote.votes?.[id]?.time||0;
  const takeRemote=rt>lt||(!local.votes[id]&&!lt),value=takeRemote?remote.votes?.[id]:local.votes[id];if(value)votes[id]=value;voteTimes[id]=Math.max(lt,rt);
 }
 for(const id of new Set([...Object.keys(local.ratings),...Object.keys(remote.ratings||{})])){
  const lt=local.ratingTimes[id]||0,rt=remote.ratingTimes?.[id]||0;
  const takeRemote=rt>lt||(!lt&&!rt&&(remote.ratings?.[id]?.played||0)>(local.ratings[id]?.played||0));
  const value=takeRemote?remote.ratings[id]:local.ratings[id];if(value)ratings[id]=value;ratingTimes[id]=Math.max(lt,rt);
 }
 const changed=JSON.stringify(local.votes)!==JSON.stringify(votes);
 state={...local,votes,voteTimes,ratings,ratingTimes,duels:Math.max(local.duels,remote.duels||0),revision:Math.max(local.revision,remote.revision||0)+1};observedVotes=clone(votes);observedRatings=clone(ratings);dirty=true;persist();if(changed)refreshAfterMerge();
}
async function readRemote(){const r=await fetch('/api/session/'+token,{cache:'no-store'});if(!r.ok&&r.status!==404)throw Error('read failed');etag=r.ok?r.headers.get('ETag'):null;if(r.ok){const remote=await r.json();mergeRemote(remote)}}
async function restore(){if(restoring)return restoring;restoring=(async()=>{try{await readRemote();cloudReady=true;retryDelay=1200;if(dirty)await sync();else $('#save').textContent='Colección sincronizada'}catch{$('#save').textContent='Guardado en este iPhone';clearTimeout(syncTimer);syncTimer=setTimeout(restore,retryDelay);retryDelay=Math.min(retryDelay*2,30000)}finally{restoring=null}})();return restoring}
async function sync(){
 if(!cloudReady||syncing||!dirty)return;syncing=true;clearTimeout(syncTimer);let failed=false;
 try{
  for(let attempts=0;dirty&&attempts<4;attempts++){
   const snapshot=JSON.stringify(state),r=await fetch('/api/session/'+token,{method:'PUT',headers:{'Content-Type':'application/json',...(etag?{'If-Match':etag}:{'If-None-Match':'*'})},body:snapshot});
   if(r.status===412){await readRemote();continue}
   if(!r.ok)throw Error('write failed');etag=r.headers.get('ETag');if(snapshot===JSON.stringify(state))dirty=false;persist();$('#save').textContent=dirty?'Guardado en este iPhone':'Colección sincronizada';retryDelay=1200;
  }
 }catch{failed=true;$('#save').textContent='Guardado local · sin conexión'}finally{syncing=false;if(dirty){clearTimeout(syncTimer);syncTimer=setTimeout(sync,failed?retryDelay:700);if(failed)retryDelay=Math.min(retryDelay*2,30000)}}
}
window.addEventListener('online',()=>{if(cloudReady)sync();else restore()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty)sync()});
const popular=[658,448,778,6,197,700,445,384,282,94,133,25,151,143,38,196,149,249,248,257,722,330,359,405,447,763,471,470,134,135,136,3,9,39,35,175,131,181,393,653,16,54,27,37,58,77,79,83,92,96,104,113,123,129,132,147,150,155,158,172,183,194,195,200,215,216,228,230,243,244,245,251,252,255,258,280,302,303,304,333,334,349,350,355,359,363,380,381,385,387,390,403,425,427,443,447,468,475,479,487,491,492,495,498,501,570,571,572,573,607,609,610,612,635,650,653,656,674,677,704,705,706,710,714,715,719,725,728,744,745,753,754,759,761,764,771,774,777,789,791,792,800,807,810,813,816,831,835,848,849,854,855,856,858,868,869,872,873,885,887,888,889,906,909,912,921,924,925,926,927,928,935,936,937,938,939,950,951,952,957,958,959,963,964,970,971,972,974,975,978,979,980,981,982,983,1000,1007,1008,1017,1024,1025];
const fallback=p=>'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/'+p.id+'.png';
function img(p){const im=document.createElement('img');im.src=p.image||fallback(p);im.alt=p.name;im.draggable=false;im.onerror=()=>{if(im.src!==fallback(p)){im.src=fallback(p);im.parentElement?.classList.add('official')}else{im.onerror=null;im.alt=p.name+' · imagen no disponible'}};return im}
function pending(){return order.filter(p=>!state.votes[p.id])}function current(){return pending()[0]}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let frame=0,audio=null,lastTactile=0;
const feel={sound:localStorage.getItem('pokeamor-sound')==='true',touch:localStorage.getItem('pokeamor-touch')!=='false'};
function tactile(kind='choose'){
 if(!feel.touch||reducedMotion.matches||performance.now()-lastTactile<65)return;lastTactile=performance.now();
 try{if(typeof navigator.vibrate==='function'&&navigator.vibrate(kind==='edge'?5:kind==='like'?12:8))return;
 // Best-effort WebKit native-switch activation, in the originating user gesture.
 // Safari controls whether a physical pulse is emitted; selection never relies on it.
 const input=$('#haptic-native');if(input&&'switch' in input)$('#haptic-trigger').click();}catch{}
}
function sound(kind='choose'){
 if(!feel.sound||reducedMotion.matches)return;
 try{if(!audio){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audio=new AC()}if(audio.state==='suspended')audio.resume();
 const t=audio.currentTime,duration=kind==='lift'?.032:.048,buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),out=buffer.getChannelData(0);
 for(let i=0;i<out.length;i++)out[i]=(Math.random()*2-1)*Math.pow(1-i/out.length,2);
 const src=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();src.buffer=buffer;filter.type='bandpass';filter.frequency.value=kind==='like'?2600:kind==='lift'?1400:1900;filter.Q.value=.65;gain.gain.value=kind==='lift'?.022:.045;src.connect(filter).connect(gain).connect(audio.destination);src.start(t);src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect()};
 }catch{}
}
$('#sound-setting').checked=feel.sound;$('#touch-setting').checked=feel.touch;
$('#sound-setting').onchange=e=>{feel.sound=e.target.checked;localStorage.setItem('pokeamor-sound',String(feel.sound));sound('like')};
$('#touch-setting').onchange=e=>{feel.touch=e.target.checked;localStorage.setItem('pokeamor-touch',String(feel.touch))};
let ambientSide=0,lastPalette='',pulseTimer;
function setScene(p){
 const palette=p.palette||{h:210,s:20,v:40},h=palette.h,comp=(h+180)%360,triad=(h+120)%360;
 const key=[h,palette.s,palette.v].join(':');if(key===lastPalette)return;lastPalette=key;
 document.documentElement.style.setProperty('--card-paper',`hsl(${h} 35% 95%)`);
 const saturation=Math.max(28,Math.min(52,palette.s*.65)),a=$('#ambient-a'),b=$('#ambient-b'),next=ambientSide? a:b,old=ambientSide?b:a;ambientSide=1-ambientSide;
 next.style.background=`radial-gradient(ellipse at 50% 40%,hsl(${h} ${saturation}% 84% / .5),transparent 72%),radial-gradient(ellipse at 100% 90%,hsl(${triad} 48% 89% / .4),transparent 65%),linear-gradient(150deg,hsl(${comp} 42% 97%),hsl(${h} 45% 94%))`;
 next.style.opacity='1';old.style.opacity='0';
}
function pulseCollection(){const button=$('#open');button.classList.remove('bump');void button.offsetWidth;button.classList.add('bump')}
$('#decision-glow .sigil.yes').onanimationend=e=>{if(e.target===e.currentTarget&&e.animationName==='heart-to-collection'&&$('#decision-glow').classList.contains('confirm-yes')&&!reducedMotion.matches)pulseCollection()};
function cancelDecisionFeedback(){clearTimeout(pulseTimer);$('#decision-glow').classList.remove('confirm-yes','confirm-no');$('#open').classList.remove('bump')}
function signalDecision(value){
 const glow=$('#decision-glow'),stage=$('#stage').getBoundingClientRect(),collection=$('#open').getBoundingClientRect();
 const x=stage.left+stage.width*.5,y=stage.top+stage.height*.53;
 glow.style.setProperty('--origin-x',x+'px');glow.style.setProperty('--origin-y',y+'px');
 glow.style.setProperty('--travel-x',(collection.left+collection.width/2-x)+'px');glow.style.setProperty('--travel-y',(collection.top+collection.height/2-y)+'px');
 clearTimeout(pulseTimer);glow.classList.remove('confirm-yes','confirm-no');void glow.offsetWidth;glow.classList.add(value==='yes'?'confirm-yes':'confirm-no');pulseTimer=setTimeout(()=>glow.classList.remove('confirm-yes','confirm-no'),800)
}
function fitCard(){const stage=$('#stage'),front=stage.querySelector('.card:not(.under):not(.exiting)'),ratio=front?.artRatio||.716;stage.style.setProperty('--card-width',Math.max(0,Math.min(stage.clientWidth-2,(stage.clientHeight-6)*ratio))+'px')}
new ResizeObserver(fitCard).observe($('#stage'));
function clearFeedback(){cancelAnimationFrame(frame);$('#yes').classList.remove('ready');$('#no').classList.remove('ready');document.documentElement.style.setProperty('--yes-intent','0');document.documentElement.style.setProperty('--no-intent','0')}
function makeCard(p,under=false){
 const c=document.createElement('div');c.className='card'+(under?' under':'')+(!p.image?' official':'');const artwork=img(p);artwork.decoding='async';const fitArt=()=>{if(c.classList.contains('official')||!artwork.naturalWidth||!artwork.naturalHeight)return;c.artRatio=artwork.naturalWidth/artwork.naturalHeight;c.style.aspectRatio=String(c.artRatio);if(!under)fitCard()};artwork.onload=fitArt;c.append(artwork);if(artwork.complete)queueMicrotask(fitArt);
 if(under){c.setAttribute('aria-hidden','true');return c}
 c.pokemon=p;c.setAttribute('aria-label',p.name);const foil=document.createElement('div');foil.className='foil';if(p.holo)c.append(foil);const glint=document.createElement('div');glint.className='glint';c.append(glint);const choice=document.createElement('div');choice.className='choice-light';c.append(choice);const stamp=document.createElement('div');stamp.className='stamp';stamp.setAttribute('aria-hidden','true');stamp.innerHTML='<svg class=heart viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-9-5.5-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-9 12-9 12Z"/></svg><svg class=cross viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';c.append(stamp);
 let start=null,dx=0,dy=0,vx=0,lastX=0,lastTime=0,lastMove=0,releaseTimer,held=false,armed=0,raf=0,previous=0;
 const position={x:0,y:0,r:0,rx:0,ry:0,s:1},velocity={x:0,y:0,r:0,rx:0,ry:0,s:0},target={...position};
 const paint=()=>{c.style.transform=`translate3d(${position.x}px,${position.y}px,0) rotate(${position.r}deg) rotateX(${position.rx}deg) rotateY(${position.ry}deg) scale(${position.s})`};
 function tick(now){const dt=Math.min((now-previous)/1000||.016,.025);previous=now;let moving=false;for(const key in position){velocity[key]+=((target[key]-position[key])*1100-velocity[key]*60)*dt;position[key]+=velocity[key]*dt;if(Math.abs(target[key]-position[key])>.001||Math.abs(velocity[key])>.01)moving=true}paint();if(moving)raf=requestAnimationFrame(tick);else{raf=0;previous=0}}
 function move(values){Object.assign(target,values);if(reducedMotion.matches)return;if(!raf)raf=requestAnimationFrame(tick)}
 const undercard=()=>$('#stage').querySelector('.under');
 const light=(x,y)=>{const bounds=$('#stage').getBoundingClientRect(),width=c.clientWidth,height=c.clientHeight;const px=Math.max(0,Math.min(100,(x-(bounds.left+(bounds.width-width)/2))/width*100));const py=Math.max(0,Math.min(100,(y-(bounds.top+(bounds.height-height)/2))/height*100));c.style.setProperty('--x',px+'%');c.style.setProperty('--y',py+'%');c.style.setProperty('--angle',(100+px*.4)+'deg');return{px,py}};
 const reset=()=>{held=false;armed=0;clearFeedback();move({x:0,y:0,r:0,rx:0,ry:0,s:1});stamp.style.opacity=0;stamp.classList.remove('armed');c.style.setProperty('--love','0');c.style.setProperty('--pass','0');c.classList.remove('active','lifted');const u=undercard();if(u){u.style.transform='';u.style.filter=''}};
 c.stopMotion=()=>{cancelAnimationFrame(raf);clearTimeout(releaseTimer);start=null};
 c.onpointerdown=e=>{if(busy||!e.isPrimary||e.button>0)return;clearTimeout(releaseTimer);start={x:e.clientX,y:e.clientY};lastX=e.clientX;lastTime=lastMove=performance.now();dx=dy=vx=0;armed=0;held=true;c.setPointerCapture(e.pointerId);c.style.transition='none';c.classList.remove('dealt','returned');c.classList.add('active','lifted');const {px,py}=light(e.clientX,e.clientY);move({s:1.012,rx:(50-py)*.065,ry:(px-50)*.065});sound('lift')};
 c.onpointermove=e=>{if(!start)return;const now=performance.now();vx=(e.clientX-lastX)/Math.max(1,now-lastTime);lastX=e.clientX;lastTime=lastMove=now;dx=e.clientX-start.x;dy=e.clientY-start.y;const {px,py}=light(e.clientX,e.clientY);const threshold=Math.min(78,c.clientWidth*.21),strength=Math.min(Math.abs(dx)/threshold,1),direction=dx>0?1:-1;
 move({x:dx,y:dy*.18-Math.min(Math.abs(dx)*.035,5),r:dx/26,rx:(50-py)*.055,ry:(px-50)*.065,s:1.012});
 const newArmed=Math.abs(dx)>=threshold?direction:(Math.abs(dx)<threshold*.72||direction!==armed)?0:armed;if(newArmed&&newArmed!==armed)tactile('edge');armed=newArmed;
 stamp.classList.toggle('love',dx>0);stamp.classList.toggle('armed',armed!==0);stamp.style.setProperty('--decision-color',dx>0?'#a52e5a':'#2e647c');stamp.style.opacity=Math.abs(dx)<8?0:Math.min(1,(Math.abs(dx)-8)/(threshold*.45));stamp.style.transform=`scale(${.82+strength*.18}) rotate(${direction*-7}deg)`;
 $('#yes').classList.toggle('ready',armed===1);$('#no').classList.toggle('ready',armed===-1);document.documentElement.style.setProperty('--yes-intent',String(dx>0?strength*.8:0));document.documentElement.style.setProperty('--no-intent',String(dx<0?strength*.75:0));c.style.setProperty('--love',String(dx>0?strength:0));c.style.setProperty('--pass',String(dx<0?strength:0));
 const u=undercard();if(u&&!reducedMotion.matches){u.style.transform=`translateY(${4*(1-strength)}px) scale(${.98+strength*.02})`;u.style.filter='none'}
 };
 c.onpointerup=()=>{if(!start)return;start=null;const flick=performance.now()-lastMove<90&&Math.abs(vx)>.5&&Math.abs(dx)>28&&Math.abs(dx)>Math.abs(dy)*.65&&Math.sign(vx)===Math.sign(dx);if((armed!==0&&Math.sign(dx)===armed)||flick){c.stopMotion();clearFeedback();vote(dx>0?'yes':'no',{vx,dy})}else if(Math.abs(dx)<9&&Math.abs(dy)<9){move({s:1.018,rx:0,ry:0});releaseTimer=setTimeout(reset,160)}else reset()};
 c.onpointercancel=()=>{start=null;reset()};c.onlostpointercapture=()=>{if(start){start=null;reset()}};return c
}
function render(){clearFeedback();const queue=pending(),p=queue[0],n=Object.keys(state.votes).length,likes=Object.values(state.votes).filter(v=>v.value==='yes').length;$('#likes').textContent='♡ '+likes;$('#open').setAttribute('aria-label','Mi colección, '+likes+' Pokémon');$('#count').textContent=n+' de '+catalog.length;$('#progress').style.width=(n/catalog.length*100)+'%';$('#undo').disabled=!state.history.length;
 const stage=$('#stage'),flights=[...stage.querySelectorAll('.exiting')].slice(-2);for(const c of stage.querySelectorAll('.card:not(.exiting)'))c.stopMotion?.();stage.replaceChildren(...flights);$('#yes').disabled=$('#no').disabled=!p;$('#name').textContent=p?p.name:'Tu colección está completa ♡';$('#art').textContent='';$('#dex').textContent='';
 if(!p){const b=document.createElement('button');b.className='pill';b.textContent='Ver mi colección';b.onclick=()=>$('#open').click();stage.append(b);return}
 setScene(p);
 if(queue[1])stage.append(makeCard(queue[1],true));stage.append(makeCard(p));fitCard();for(const next of queue.slice(1,7)){const i=new Image();i.src=next.image||fallback(next)}
}
function vote(value,momentum={}){
 if(busy||!current())return;busy=true;clearFeedback();const c=$('.card:not(.under):not(.exiting)'),p=c?.pokemon||current();tactile(value==='yes'?'like':'choose');sound(value==='yes'?'like':'choose');
 state.history.push({id:p.id,previous:state.votes[p.id]||null,direction:value});state.votes[p.id]={value,card:p.card,time:Date.now()};save();
 if(c){const badge=c.querySelector('.stamp');if(badge){badge.classList.toggle('love',value==='yes');badge.classList.add('armed');badge.style.setProperty('--decision-color',value==='yes'?'#a52e5a':'#2e647c');badge.style.opacity='1';badge.style.transform='scale(1)';}c.style.setProperty(value==='yes'?'--love':'--pass','1');c.stopMotion?.();c.classList.add('exiting');c.classList.remove('lifted','dealt','returned','active');c.setAttribute('aria-hidden','true');c.style.pointerEvents='none'}
 render();const next=$('.card:not(.under):not(.exiting)');if(next)next.classList.add('dealt');signalDecision(value);
 if(c){void c.offsetWidth;const duration=reducedMotion.matches?0:Math.max(145,205-Math.abs(momentum.vx||0)*25);c.style.transition=`transform ${duration}ms cubic-bezier(.22,.55,.45,1),opacity ${duration}ms ease`;c.style.transform=`translate3d(${value==='yes'?innerWidth+100:-innerWidth-100}px,${Math.max(-80,Math.min(80,(momentum.dy||0)*.4))-20}px,0) rotate(${value==='yes'?22:-22}deg) scale(1.015)`;c.style.opacity=0;setTimeout(()=>c.remove(),duration+20)}
 busy=false;
}

$('#yes').onclick=()=>vote('yes');$('#no').onclick=()=>vote('no');$('#undo').onclick=()=>{
 if(busy)return;const h=state.history.pop();if(!h)return;const direction=h.direction||state.votes[h.id]?.value||'no';
 cancelDecisionFeedback();for(const card of $('#stage').querySelectorAll('.exiting'))card.remove();
 if(h.previous)state.votes[h.id]=h.previous;else delete state.votes[h.id];tactile('choose');save();render();
 const restored=$('.card:not(.under):not(.exiting)');if(restored?.pokemon?.id===h.id){restored.style.setProperty('--return-x',((direction==='yes'?1:-1)*Math.min(innerWidth+40,560))+'px');restored.style.setProperty('--return-r',(direction==='yes'?'14':'-14')+'deg');restored.classList.add('returned')}
};document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||$('.sheet.open')||$('#sharing').open)return;if(e.key==='ArrowRight')vote('yes');if(e.key==='ArrowLeft')vote('no')});
function score(p){return state.ratings[p.id]?.score||1000}function collection(){const yes=catalog.filter(p=>state.votes[p.id]?.value==='yes');$('#summary').textContent=`${yes.length} Pokémon que te gustan · ${Object.keys(state.votes).length} descubiertos · ${state.duels} duelos. Podés seguir cuando quieras.`;let list=filter==='pending'?pending():filter==='top'?yes.filter(p=>state.ratings[p.id]?.played>0).sort((a,b)=>score(b)-score(a)):order.filter(p=>state.votes[p.id]?.value===filter);$('#grid').replaceChildren();if(!list.length){$('#grid').innerHTML='<p class="muted">'+(filter==='top'?'Hacé algunos duelos para descubrir tus finalistas.':'Todavía no hay Pokémon acá.')+'</p>';return}list.forEach((p,i)=>{const b=document.createElement('button');b.className='tile';const im=img(p);im.loading='lazy';b.append(im);const name=document.createElement('b');name.textContent=p.name;b.append(name);if(filter==='top'){const r=document.createElement('span');r.className='rank';r.textContent='#'+(i+1);b.append(r);const s=document.createElement('small');s.textContent=state.ratings[p.id].played+' comparaciones';b.append(s)}b.onclick=()=>{const before=state.votes[p.id]||null;state.history.push({id:p.id,previous:before});state.votes[p.id]={value:before?.value==='yes'?'no':'yes',card:p.card,time:Date.now()};save();render();collection();toast(p.name+(state.votes[p.id].value==='yes'?' añadido ♡':' movido a Pasé'))};$('#grid').append(b)})}
$('#open').onclick=()=>{$('#sheet').classList.add('open');collection()};$('#close').onclick=()=>$('#sheet').classList.remove('open');$('#tabs').onclick=e=>{if(!e.target.dataset.filter)return;filter=e.target.dataset.filter;$('#tabs').querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===e.target));collection()};
function nextPair(){const likes=catalog.filter(p=>state.votes[p.id]?.value==='yes');if(likes.length<2){toast('Elegí al menos dos Pokémon que te gusten.');return false}const candidates=[...likes].sort((a,b)=>(state.ratings[a.id]?.played||0)-(state.ratings[b.id]?.played||0));let a=candidates[Math.floor(Math.random()*Math.min(4,candidates.length))];let others=likes.filter(p=>p.id!==a.id).sort((x,y)=>Math.abs(score(x)-score(a))-Math.abs(score(y)-score(a)));let b=others[Math.floor(Math.random()*Math.min(5,others.length))];if(likes.length>2&&[a.id,b.id].sort().join()===lastPair)b=others.find(p=>p.id!==b.id)||b;pair=[a,b];lastPair=pair.map(p=>p.id).sort().join();$('#pair').replaceChildren();pair.forEach((p,i)=>{const btn=document.createElement('button');btn.append(img(p));const n=document.createElement('p');n.textContent=p.name;btn.append(n);btn.onclick=()=>duel(i);$('#pair').append(btn)});$('#duelcount').textContent=state.duels+' duelos guardados · El orden se afina con cada elección.';return true}
function duel(winner){const [a,b]=pair;const ra=score(a),rb=score(b),expected=1/(1+10**((rb-ra)/400)),actual=winner===2?.5:winner===0?1:0;for(const [p,s] of [[a,ra+28*(actual-expected)],[b,rb-28*(actual-expected)]])state.ratings[p.id]={score:s,played:(state.ratings[p.id]?.played||0)+1};state.duels++;save();nextPair()}
$('#duel').onclick=()=>{if(nextPair())$('#duelsheet').classList.add('open')};$('#endduel').onclick=()=>{$('#duelsheet').classList.remove('open');collection()};$('#both').onclick=()=>duel(2);$('#skip').onclick=nextPair;
$('#export').onclick=()=>{const payload={version:1,state,catalog:catalog.filter(p=>state.votes[p.id]).map(p=>({id:p.id,name:p.name,card:state.votes[p.id].card,choice:state.votes[p.id].value,score:state.ratings[p.id]?.score||null}))};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mi-coleccion-pokeamor.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('#import').onclick=()=>$('#file').click();$('#file').onchange=async e=>{try{const v=JSON.parse(await e.target.files[0].text());if(v.version!==1||!v.state?.votes||!v.state?.ratings)throw Error();for(const [id,x] of Object.entries(v.state.votes)){if(!catalog.some(p=>p.id===Number(id))||!['yes','no'].includes(x.value))throw Error();state.votes[id]=x}for(const [id,x] of Object.entries(v.state.ratings))if(Number.isFinite(x.score)&&Number.isFinite(x.played))state.ratings[id]=x;state.duels=Math.max(state.duels,Number(v.state.duels)||0);save();render();collection();toast('Colección importada')}catch{toast('No se pudo leer esa colección.')}e.target.value=''};
$('#share').onclick=()=>{$('#link').value=location.href;$('#cloudstatus').textContent=dirty?'Todavía hay cambios sin sincronizar. Conservá también una exportación.':'El enlace recupera la última colección sincronizada.';$('#sharing').showModal();if(dirty)sync()};$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Enlace copiado')}catch{$('#link').select();toast('Mantené pulsado el enlace para copiarlo.')}};$('#dismiss').onclick=()=>$('#sharing').close();
async function init(){try{catalog=await(await fetch('/catalog.json',{cache:'no-cache'})).json();const ids=[...new Set(popular)];order=[...ids.map(id=>catalog.find(p=>p.id===id)).filter(Boolean),...catalog.filter(p=>!ids.includes(p.id))];render();restore()}catch{$('#stage').innerHTML='<p>No pudimos cargar el catálogo. <a href="">Reintentar</a></p>'}}init();
