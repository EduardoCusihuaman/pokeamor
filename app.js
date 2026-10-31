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
function img(p,exact=false){
 const im=document.createElement('img'),material=p.surface?.effect==='asset-foil',cached=exact&&material?window.PokeAssets?.peekFront(p):null;im.materialSource=!!cached||!!(exact&&material&&!p.fallbackImage);im.src=cached||(material?p.fallbackImage||p.image:p.image)||fallback(p);im.alt=p.name;im.draggable=false;let usedFallback=material&&!!p.fallbackImage&&!cached;
 im.onerror=()=>{im.materialSource=false;im.parentElement?.classList.add('art-fallback');if(!usedFallback&&p.fallbackImage){usedFallback=true;im.src=p.fallbackImage}else if(im.src!==fallback(p)){im.src=fallback(p);im.parentElement?.classList.add('official')}else{im.onerror=null;im.alt=p.name+' · imagen no disponible'}};
 if(exact&&material&&p.fallbackImage&&!cached){const source=window.PokeAssets?window.PokeAssets.front(p):Promise.resolve(p.image);source.then(url=>{if(!im.isConnected)return;const front=new Image();front.decoding='async';front.onload=()=>{if(im.isConnected){im.parentElement?.classList.remove('art-fallback','official');im.materialSource=true;im.src=url}};front.src=url}).catch(()=>{})}
 return im
}
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
 try{
  if(!audio){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audio=new AC()}
  if(audio.state==='suspended')audio.resume();
  const t=audio.currentTime;
  const tone=(freq,when,dur,level,wave='sine')=>{
   const osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter();
   osc.type=wave;osc.frequency.setValueAtTime(freq,when);
   filter.type='lowpass';filter.frequency.setValueAtTime(4200,when);
   gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(level*.58,when+.008);
   gain.gain.exponentialRampToValueAtTime(.0001,when+dur);
   osc.connect(filter).connect(gain).connect(audio.destination);osc.start(when);osc.stop(when+dur+.01);
   osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect()};
  };
  if(kind==='like'){
   tone(784,t,.09,.032,'sine');tone(1175,t+.038,.12,.026,'triangle');tone(1568,t+.086,.15,.022,'sine');tone(2352,t+.105,.09,.006,'sine');
  }else if(kind==='round'){
   tone(659,t,.16,.022,'sine');tone(988,t+.07,.19,.017,'triangle');tone(1318,t+.15,.23,.012,'sine');
  }else if(kind==='lift'){
   tone(540,t,.035,.012,'sine');
  }else{
   tone(392,t,.075,.021,'sine');tone(294,t+.028,.09,.012,'triangle');
  }
 }catch{}
}
window.PokePlaySound=sound;
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
function fitCard(){const stage=$('#stage'),front=stage.querySelector('.card:not(.under):not(.exiting)'),ratio=front?.artRatio||.716;stage.style.setProperty('--card-width',Math.max(0,Math.min(stage.clientWidth-2,(stage.clientHeight-6)*ratio))+'px');window.PokeHolo?.refresh()}
new ResizeObserver(fitCard).observe($('#stage'));
function clearFeedback(){cancelAnimationFrame(frame);$('#yes').classList.remove('ready');$('#no').classList.remove('ready');document.documentElement.style.setProperty('--yes-intent','0');document.documentElement.style.setProperty('--no-intent','0')}
function makeCard(p,under=false){
 const c=document.createElement('div');c.className='card'+(under?' under':'')+(!p.image?' official':'');const artwork=img(p,true);artwork.decoding='async';const fitArt=()=>{c.materialFrontReady=!!(artwork.materialSource&&!c.classList.contains('art-fallback')&&artwork.naturalWidth>0);if(c.classList.contains('official')||!artwork.naturalWidth||!artwork.naturalHeight)return;c.artRatio=artwork.naturalWidth/artwork.naturalHeight;c.style.aspectRatio=String(c.artRatio);if(!under){fitCard();window.PokeMaterial?.refresh()}};artwork.onload=fitArt;c.append(artwork);if(artwork.complete)queueMicrotask(fitArt);
 if(under){c.setAttribute('aria-hidden','true');return c}
 c.pokemon=p;c.setAttribute('aria-label',p.name);const choice=document.createElement('div');choice.className='choice-light';c.append(choice);const stamp=document.createElement('div');stamp.className='stamp';stamp.setAttribute('aria-hidden','true');stamp.innerHTML='<svg class=heart viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"/></svg><svg class=cross viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';c.append(stamp);
 let surface=null;let start=null,dx=0,dy=0,vx=0,lastX=0,lastTime=0,lastMove=0,releaseTimer,held=false,armed=0,raf=0,previous=0;
 const position={x:0,y:0,r:0,rx:0,ry:0,s:1},velocity={x:0,y:0,r:0,rx:0,ry:0,s:0},target={...position};
 const paint=()=>{c.style.transform=`translate3d(${position.x}px,${position.y}px,0) rotate(${position.r}deg) rotateX(${position.rx}deg) rotateY(${position.ry}deg) scale(${position.s})`};
 function tick(now){const dt=Math.min((now-previous)/1000||.016,.025);previous=now;let moving=false;for(const key in position){velocity[key]+=((target[key]-position[key])*1100-velocity[key]*60)*dt;position[key]+=velocity[key]*dt;if(Math.abs(target[key]-position[key])>.001||Math.abs(velocity[key])>.01)moving=true}paint();if(moving)raf=requestAnimationFrame(tick);else{raf=0;previous=0}}
 function move(values){Object.assign(target,values);if(reducedMotion.matches){Object.assign(position,target);paint();return;}if(!raf)raf=requestAnimationFrame(tick)}
 const undercard=()=>$('#stage').querySelector('.under');
 const light=(x,y)=>{const bounds=$('#stage').getBoundingClientRect(),width=c.clientWidth,height=c.clientHeight;const px=Math.max(0,Math.min(100,(x-(bounds.left+(bounds.width-width)/2))/width*100));const py=Math.max(0,Math.min(100,(y-(bounds.top+(bounds.height-height)/2))/height*100));c.style.setProperty('--x',px+'%');c.style.setProperty('--y',py+'%');c.style.setProperty('--angle',(100+px*.4)+'deg');surface?.pointer(px/100,py/100);return{px,py}};
 const reset=()=>{held=false;armed=0;clearFeedback();move({x:0,y:0,r:0,rx:0,ry:0,s:1});stamp.style.opacity=0;stamp.classList.remove('armed');c.style.setProperty('--love','0');c.style.setProperty('--pass','0');c.classList.remove('active','lifted');surface?.release();const u=undercard();if(u){u.style.transform='';u.style.filter=''}};
 c.stopMotion=()=>{cancelAnimationFrame(raf);clearTimeout(releaseTimer);start=null;surface?.dispose()};
 c.onpointerdown=e=>{if(busy||!e.isPrimary||e.button>0)return;clearTimeout(releaseTimer);start={x:e.clientX,y:e.clientY};lastX=e.clientX;lastTime=lastMove=performance.now();dx=dy=vx=0;armed=0;held=true;c.setPointerCapture(e.pointerId);c.style.transition='none';c.classList.remove('dealt','returned');c.classList.add('active','lifted');const {px,py}=light(e.clientX,e.clientY);move({s:1.012,rx:(50-py)*.065,ry:(px-50)*.065});sound('lift')};
 c.onpointermove=e=>{if(!start)return;const now=performance.now();vx=vx*.25+((e.clientX-lastX)/Math.max(1,now-lastTime))*.75;lastX=e.clientX;lastTime=lastMove=now;dx=e.clientX-start.x;dy=e.clientY-start.y;const {px,py}=light(e.clientX,e.clientY);const threshold=Math.min(78,c.clientWidth*.21),strength=Math.min(Math.abs(dx)/threshold,1),direction=dx>0?1:-1;
 const dragX=Math.sign(dx)*(Math.min(Math.abs(dx),c.clientWidth*.7)+Math.max(0,Math.abs(dx)-c.clientWidth*.7)*.45);const drag={x:dragX,y:dy*.14-Math.min(Math.abs(dx)*.025,4),r:Math.max(-11,Math.min(11,dx/32)),rx:(50-py)*.04,ry:(px-50)*.045,s:1.008};Object.assign(target,drag);Object.assign(position,drag);for(const k in velocity)velocity[k]=0;paint();
 const newArmed=Math.abs(dx)>=threshold?direction:(Math.abs(dx)<threshold*.72||direction!==armed)?0:armed;if(newArmed&&newArmed!==armed)tactile('edge');armed=newArmed;
 stamp.classList.toggle('love',dx>0);stamp.classList.toggle('armed',armed!==0);stamp.style.setProperty('--decision-color',dx>0?'#a52e5a':'#2e647c');stamp.style.opacity=Math.abs(dx)<8?0:Math.min(1,(Math.abs(dx)-8)/(threshold*.45));stamp.style.transform=`scale(${.82+strength*.18}) rotate(${direction*-7}deg)`;
 $('#yes').classList.toggle('ready',armed===1);$('#no').classList.toggle('ready',armed===-1);document.documentElement.style.setProperty('--yes-intent',String(dx>0?strength*.8:0));document.documentElement.style.setProperty('--no-intent',String(dx<0?strength*.75:0));c.style.setProperty('--love',String(dx>0?strength:0));c.style.setProperty('--pass',String(dx<0?strength:0));
 const u=undercard();if(u&&!reducedMotion.matches){u.style.transform=`translateY(${4*(1-strength)}px) scale(${.98+strength*.02})`;u.style.filter='none'}
 };
 c.onpointerup=()=>{if(!start)return;start=null;const flick=performance.now()-lastMove<90&&Math.abs(vx)>.5&&Math.abs(dx)>28&&Math.abs(dx)>Math.abs(dy)*.65&&Math.sign(vx)===Math.sign(dx);if((armed!==0&&Math.sign(dx)===armed)||flick){c.stopMotion();clearFeedback();vote(dx>0?'yes':'no',{vx,dy})}else if(Math.abs(dx)<9&&Math.abs(dy)<9){move({s:1.018,rx:0,ry:0});releaseTimer=setTimeout(reset,160)}else reset()};
 c.onpointercancel=()=>{start=null;reset()};c.onlostpointercapture=()=>{if(start){start=null;reset()}};surface=window.PokeHolo?.attach(c,p,{onTilt:(rx,ry)=>{if(!held&&!start)move({rx,ry})}});return c
}
const warmArt=new Map();
function warmArtwork(p){const url=p.surface?.assets?.front||p.image||fallback(p);if(warmArt.has(url))return;const art=img(p,true);warmArt.set(url,art);art.decode?.().catch(()=>{});if(warmArt.size>6)warmArt.delete(warmArt.keys().next().value)}
function render(){clearFeedback();const queue=pending(),p=queue[0],n=Object.keys(state.votes).length,likes=Object.values(state.votes).filter(v=>v.value==='yes').length;$('#likes').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"/></svg><span>'+likes+'</span>';$('#open').setAttribute('aria-label','Mi colección, '+likes+' Pokémon');$('#count').textContent=n+' de '+catalog.length;$('#progress').style.width=(n/catalog.length*100)+'%';$('#undo').disabled=!state.history.length;
 window.PokeJourney?.update(catalog,state,key);const stage=$('#stage'),flights=[...stage.querySelectorAll('.exiting')].slice(-2);for(const c of stage.querySelectorAll('.card:not(.exiting)'))c.stopMotion?.();stage.replaceChildren(...flights);$('#yes').disabled=$('#no').disabled=!p;$('#name').textContent=p?p.name:'Tu colección está completa ♡';$('#art').textContent='';$('#dex').textContent='';
 if(!p){const b=document.createElement('button');b.className='pill';b.textContent='Ver mi colección';b.onclick=()=>$('#open').click();stage.append(b);return}
 setScene(p);window.PokeMaterial?.prepare(queue.slice(0,4));
 if(queue[1])stage.append(makeCard(queue[1],true));stage.append(makeCard(p));fitCard();for(const next of queue.slice(1,4))warmArtwork(next)
}
function vote(value,momentum={}){
 if(busy||!current())return;busy=true;clearFeedback();const c=$('.card:not(.under):not(.exiting)'),p=c?.pokemon||current();tactile(value==='yes'?'like':'choose');sound(value==='yes'?'like':'choose');
 state.history.push({id:p.id,previous:state.votes[p.id]||null,direction:value});state.votes[p.id]={value,card:p.card,time:Date.now()};save();
 if(c){const badge=c.querySelector('.stamp');if(badge){badge.classList.toggle('love',value==='yes');badge.classList.add('armed');badge.style.setProperty('--decision-color',value==='yes'?'#a52e5a':'#2e647c');badge.style.opacity='1';badge.style.transform='scale(1)';}c.style.setProperty(value==='yes'?'--love':'--pass','1');c.stopMotion?.();c.classList.add('exiting');c.classList.remove('lifted','dealt','returned','active');c.setAttribute('aria-hidden','true');c.style.pointerEvents='none'}
 render();const next=$('.card:not(.under):not(.exiting)');if(next)next.classList.add('dealt');signalDecision(value);window.PokeJourney?.celebrate();
 if(c){void c.offsetWidth;const duration=reducedMotion.matches?0:Math.max(125,175-Math.abs(momentum.vx||0)*22);c.style.transition=`transform ${duration}ms cubic-bezier(.22,.55,.45,1),opacity ${duration}ms ease`;c.style.transform=`translate3d(${value==='yes'?innerWidth+100:-innerWidth-100}px,${Math.max(-80,Math.min(80,(momentum.dy||0)*.4))-20}px,0) rotate(${value==='yes'?22:-22}deg) scale(1.015)`;c.style.opacity=0;setTimeout(()=>c.remove(),duration+20)}
 busy=false;
}

$('#yes').onclick=()=>vote('yes');$('#no').onclick=()=>vote('no');$('#undo').onclick=()=>{
 if(busy)return;const h=state.history.pop();if(!h)return;const direction=h.direction||state.votes[h.id]?.value||'no';
 cancelDecisionFeedback();for(const card of $('#stage').querySelectorAll('.exiting'))card.remove();
 if(h.previous)state.votes[h.id]=h.previous;else delete state.votes[h.id];tactile('choose');save();render();
 const restored=$('.card:not(.under):not(.exiting)');if(restored?.pokemon?.id===h.id){restored.style.setProperty('--return-x',((direction==='yes'?1:-1)*Math.min(innerWidth+40,560))+'px');restored.style.setProperty('--return-r',(direction==='yes'?'14':'-14')+'deg');restored.classList.add('returned')}
};document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||$('.sheet.open')||document.querySelector('dialog[open]'))return;if(e.key==='ArrowRight')vote('yes');if(e.key==='ArrowLeft')vote('no')});
function score(p){return state.ratings[p.id]?.score||1000}
let visibleCards=40,detailPokemon=null,detailChange=null,collectionCards=[];
function detailLabel(){if(!detailPokemon)return;const liked=state.votes[detailPokemon.id]?.value==='yes',button=$('#detail-choice');button.setAttribute('aria-label',liked?'Quitar de favoritos':'Agregar a favoritos');button.setAttribute('aria-pressed',String(liked));button.innerHTML='<svg viewBox="0 0 24 24" fill="'+(liked?'currentColor':'none')+'"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"/></svg>'}
let viewerScrollTimer,viewerItems=[];
function activateViewer(index){const item=viewerItems[index];if(!item)return;const {p,host,art}=item;detailPokemon=p;detailChange=null;viewerHolo?.dispose();for(const entry of viewerItems)entry.host.id='';host.id='viewer-surface';$('#card-detail').style.setProperty('--viewer-hue',p.palette?.h||325);$('#detail-position').textContent=(index+1)+' / '+viewerItems.length;$('#detail-name').textContent=p.name;host.materialFrontReady=!!art.materialSource&&art.naturalWidth>0;host.artRatio=art.naturalWidth/art.naturalHeight||.716;window.PokeMaterial?.prepare(collectionCards.slice(Math.max(0,index-1),index+3));viewerHolo=window.PokeHolo?.attach(host,p,{onTilt:()=>{}});detailOrigin=document.querySelector('.memory-card[data-pokemon="'+p.id+'"]');$('#detail-undo').hidden=true;detailLabel()}
function centerViewer(index,smooth=true){const item=viewerItems[index],box=$('#detail-art');if(!item)return;box.scrollTo?.({left:item.host.offsetLeft-(box.clientWidth-item.host.offsetWidth)/2,behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'})}
function inspectCard(p){if(!collectionCards.some(c=>c.id===p.id))collectionCards=[p];const box=$('#detail-art');clearTimeout(viewerScrollTimer);viewerHolo?.dispose();box.replaceChildren();viewerItems=collectionCards.map((card,index)=>{const host=document.createElement('div');host.className='viewer-item';const art=img(card,true);art.draggable=false;art.decoding='async';art.loading=Math.abs(index-collectionCards.indexOf(p))<=1?'eager':'lazy';host.append(art);box.append(host);art.onload=()=>{host.materialFrontReady=!!art.materialSource&&art.naturalWidth>0;if(detailPokemon?.id===card.id)window.PokeMaterial?.refresh()};host.onclick=()=>centerViewer(index);return{p:card,host,art}});if(!$('#card-detail').open)$('#card-detail').showModal();const index=collectionCards.indexOf(p);activateViewer(index);centerViewer(index,false)}
function collection(){const yes=catalog.filter(p=>state.votes[p.id]?.value==='yes');$('.collection-title').textContent=({yes:'Tus elegidos.',no:'Los que pasaste.',pending:'Por descubrir.',top:'Tus finalistas.'})[filter];$('#summary').textContent=yes.length+' elegidos';$('#team-open').disabled=yes.length<2;const hue=yes[0]?.palette?.h||325;$('#sheet').style.setProperty('--collection-accent',`hsl(${hue} 24% 45%)`);const list=filter==='all'?order.filter(p=>state.votes[p.id]):filter==='pending'?pending():filter==='top'?yes.filter(p=>state.ratings[p.id]?.played>0).sort((a,b)=>score(b)-score(a)):order.filter(p=>state.votes[p.id]?.value===filter);collectionCards=list;$('#grid').replaceChildren();$('#gallery-more').hidden=list.length<=visibleCards;if(!list.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=filter==='top'?'Tus finalistas aparecen después de los duelos.':filter==='yes'?'Tu primer flechazo empieza con una carta.':'Todavía no hay cartas acá.';$('#grid').append(empty);return}list.slice(0,visibleCards).forEach((p,i)=>{const button=document.createElement('button');button.className='tile';button.setAttribute('aria-label','Ver '+p.name);const image=img(p);image.loading='lazy';image.decoding='async';button.append(image);const name=document.createElement('b');name.textContent=p.name;button.append(name);if(filter==='top'){const rank=document.createElement('span');rank.className='rank';rank.textContent='#'+(i+1);button.append(rank)}button.onclick=()=>inspectCard(p);$('#grid').append(button)})}
$('#gallery-more').onclick=()=>{visibleCards+=40;collection()};
$('#detail-close').onclick=()=>$('#card-detail').close();
$('#detail-choice').onclick=()=>{if(!detailPokemon)return;const p=detailPokemon,before=state.votes[p.id]?clone(state.votes[p.id]):null;const after={value:before?.value==='yes'?'no':'yes',card:p.card,time:Date.now()};const record={id:p.id,previous:before};state.history.push(record);state.votes[p.id]=after;detailChange={id:p.id,before,after:JSON.stringify(after),record};save();render();collection();detailLabel();$('#detail-undo').hidden=false};
$('#detail-undo').onclick=()=>{const change=detailChange;if(!change)return;if(JSON.stringify(state.votes[change.id])!==change.after){toast('Esta elección cambió en otro dispositivo.');$('#detail-undo').hidden=true;return}if(change.before)state.votes[change.id]=change.before;else delete state.votes[change.id];const index=state.history.indexOf(change.record);if(index>=0)state.history.splice(index,1);detailChange=null;save();render();collection();detailLabel();$('#detail-undo').hidden=true};
$('#options-close').onclick=()=>showCollectionTab(true);
$('#team-open').onclick=()=>{$('#teamview').classList.add('open');window.PokeJourney?.compose()};$('#team-back').onclick=()=>$('#teamview').classList.remove('open');
$('#memories-open').onclick=()=>{if($('#collection-options').open)$('#collection-options').close();$('#sheet').classList.add('open');collection();showCollectionTab(true);window.PokeJourney?.compose()};$('#memories-back').onclick=()=>$('#memoriesview').classList.remove('open');
$('#open').onclick=()=>{filter='yes';$('#sheet').classList.add('open');collection();showCollectionTab(true);window.PokeJourney?.compose()};$('#close').onclick=()=>$('#sheet').classList.remove('open');$('#tabs').onclick=e=>{if(!e.target.dataset.filter)return;filter=e.target.dataset.filter;showCollectionTab(false);visibleCards=40;if($('#collection-options').open)$('#collection-options').close();$('#tabs').querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===e.target));collection()};
function nextPair(){const likes=catalog.filter(p=>state.votes[p.id]?.value==='yes');if(likes.length<2){toast('Elegí al menos dos Pokémon que te gusten.');return false}const candidates=[...likes].sort((a,b)=>(state.ratings[a.id]?.played||0)-(state.ratings[b.id]?.played||0));let a=candidates[Math.floor(Math.random()*Math.min(4,candidates.length))];let others=likes.filter(p=>p.id!==a.id).sort((x,y)=>Math.abs(score(x)-score(a))-Math.abs(score(y)-score(a)));let b=others[Math.floor(Math.random()*Math.min(5,others.length))];if(likes.length>2&&[a.id,b.id].sort().join()===lastPair)b=others.find(p=>p.id!==b.id)||b;pair=[a,b];lastPair=pair.map(p=>p.id).sort().join();$('#pair').replaceChildren();pair.forEach((p,i)=>{const btn=document.createElement('button');btn.append(img(p));const n=document.createElement('p');n.textContent=p.name;btn.append(n);btn.onclick=()=>duel(i);$('#pair').append(btn)});$('#duelcount').textContent=state.duels+' duelos guardados · El orden se afina con cada elección.';return true}
function duel(winner){const [a,b]=pair;const ra=score(a),rb=score(b),expected=1/(1+10**((rb-ra)/400)),actual=winner===2?.5:winner===0?1:0;for(const [p,s] of [[a,ra+28*(actual-expected)],[b,rb-28*(actual-expected)]])state.ratings[p.id]={score:s,played:(state.ratings[p.id]?.played||0)+1};state.duels++;save();nextPair()}
$('#duel').onclick=()=>{if(nextPair())$('#duelsheet').classList.add('open')};$('#endduel').onclick=()=>{$('#duelsheet').classList.remove('open');collection();window.PokeJourney?.compose()};$('#both').onclick=()=>duel(2);$('#skip').onclick=nextPair;
$('#export').onclick=()=>{const payload={version:1,state,catalog:catalog.filter(p=>state.votes[p.id]).map(p=>({id:p.id,name:p.name,card:state.votes[p.id].card,choice:state.votes[p.id].value,score:state.ratings[p.id]?.score||null}))};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mi-coleccion-pokeamor.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('#import').onclick=()=>$('#file').click();$('#file').onchange=async e=>{try{const v=JSON.parse(await e.target.files[0].text());if(v.version!==1||!v.state?.votes||!v.state?.ratings)throw Error();for(const [id,x] of Object.entries(v.state.votes)){if(!catalog.some(p=>p.id===Number(id))||!['yes','no'].includes(x.value))throw Error();state.votes[id]=x}for(const [id,x] of Object.entries(v.state.ratings))if(Number.isFinite(x.score)&&Number.isFinite(x.played))state.ratings[id]=x;state.duels=Math.max(state.duels,Number(v.state.duels)||0);save();render();collection();toast('Colección importada')}catch{toast('No se pudo leer esa colección.')}e.target.value=''};
$('#share').onclick=()=>{if($('#collection-options').open)$('#collection-options').close();$('#link').value=location.href;$('#cloudstatus').textContent=dirty?'Todavía hay cambios sin sincronizar. Conservá también una exportación.':'El enlace recupera la última colección sincronizada.';$('#sharing').showModal();if(dirty)sync()};$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Enlace copiado')}catch{$('#link').select();toast('Mantené pulsado el enlace para copiarlo.')}};$('#dismiss').onclick=()=>$('#sharing').close();
async function init(){try{catalog=await(await fetch('/catalog.json',{cache:'no-cache'})).json();const ids=[...new Set(popular)];order=[...ids.map(id=>catalog.find(p=>p.id===id)).filter(Boolean),...catalog.filter(p=>!ids.includes(p.id))];render();restore()}catch{$('#stage').innerHTML='<p>No pudimos cargar el catálogo. <a href="">Reintentar</a></p>'}}init();

function browseDetail(direction){centerViewer(collectionCards.indexOf(detailPokemon)+direction)}
$('#detail-prev').onclick=()=>browseDetail(-1);$('#detail-next').onclick=()=>browseDetail(1);
let viewerHolo=null,viewerPreview=null,viewerSettling=false,viewerEpoch=0,detailStart=null;
function moveViewer(){}
$('#detail-art').onscroll=()=>{clearTimeout(viewerScrollTimer);viewerScrollTimer=setTimeout(()=>{if(!$('#card-detail').open)return;const box=$('#detail-art'),center=box.scrollLeft+box.clientWidth/2;let nearest=0,best=Infinity;viewerItems.forEach(({host},i)=>{const distance=Math.abs(host.offsetLeft+host.offsetWidth/2-center);if(distance<best){best=distance;nearest=i}});if(viewerItems[nearest]?.p.id!==detailPokemon?.id)activateViewer(nearest)},100)};
$('#detail-art').onpointerdown=e=>{detailStart={x:e.clientX,y:e.clientY}};
$('#detail-art').onpointermove=e=>{const host=$('#viewer-surface'),r=host?.getBoundingClientRect?.();if(r)viewerHolo?.pointer((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height)};
$('#detail-art').onpointerup=e=>{if(!detailStart)return;const dx=e.clientX-detailStart.x,dy=e.clientY-detailStart.y;detailStart=null;viewerHolo?.release();if(dy>90&&dy>Math.abs(dx))closeDetail()};
$('#detail-art').onpointercancel=()=>{detailStart=null;viewerHolo?.release()};





function showCollectionTab(rounds){$('#sheet').classList.toggle('rounds-mode',rounds);$('#show-rounds').classList.toggle('selected',rounds);$('#show-liked').classList.toggle('selected',!rounds)}
$('#show-rounds').onclick=()=>{showCollectionTab(true);window.PokeJourney?.compose()};$('#show-liked').onclick=()=>showCollectionTab(false);

let detailOrigin=null;
window.PokeInspect=(p,group,tile)=>{collectionCards=group||[p];detailOrigin=tile;inspectCard(p);animateCardOrigin(false)};
function animateCardOrigin(reverse){const image=$('#viewer-surface img'),origin=detailOrigin?.querySelector?.('img');if(!image||!origin||!image.animate||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const a=origin.getBoundingClientRect(),b=image.getBoundingClientRect();if(!a.width||!b.width)return;const transform=`translate(${a.left-b.left}px,${a.top-b.top}px) scale(${a.width/b.width},${a.height/b.height})`;return image.animate(reverse?[{transform:'none'},{transform,opacity:.4}]:[{transform,opacity:.4},{transform:'none',opacity:1}],{duration:200,easing:'cubic-bezier(.2,.7,.2,1)',fill:'none'}).finished.catch(()=>{})}
function closeDetail(){const dialog=$('#card-detail');if(!dialog.open)return;viewerEpoch++;viewerSettling=false;detailStart=null;clearTimeout(viewerScrollTimer);viewerHolo?.dispose();viewerHolo=null;viewerPreview?.remove();viewerPreview=null;dialog.close();if(detailOrigin?.classList){detailOrigin.classList.add('return-highlight');setTimeout(()=>detailOrigin?.classList.remove('return-highlight'),650)}setTimeout(()=>{if(!dialog.open)render()},0)}

$('#detail-close').onclick=closeDetail;


$('#collection-settings').onclick=()=>showCollectionTab(false);

$('#card-detail').oncancel=e=>{e.preventDefault();closeDetail()};

function addViewerNeighbors(p){const i=collectionCards.findIndex(c=>c.id===p.id);for(const [offset,side] of [[-1,'left'],[1,'right']]){const neighbor=collectionCards[i+offset];if(!neighbor)continue;const button=document.createElement('button');button.className='viewer-neighbor '+side;button.setAttribute('aria-label',(offset<0?'Carta anterior: ':'Carta siguiente: ')+neighbor.name);button.append(img(neighbor));button.onpointerdown=e=>e.stopPropagation();button.onpointerup=e=>e.stopPropagation();button.onclick=e=>{e.stopPropagation();browseDetail(offset)};$('#detail-art').append(button)}}

function setAlbumDensity(detail){const sheet=$('#sheet'),groups=[...document.querySelectorAll('#round-memories .batch-group')],anchor=groups.find(el=>el.getBoundingClientRect().bottom>120),before=anchor?.getBoundingClientRect().top;sheet.classList.toggle('album-detail',detail);$('#album-overview').setAttribute('aria-pressed',String(!detail));$('#album-detail').setAttribute('aria-pressed',String(detail));if(anchor)sheet.scrollTop+=anchor.getBoundingClientRect().top-before;try{localStorage.setItem('pokeamor-album-detail',String(detail))}catch{}}
$('#album-overview').onclick=()=>setAlbumDensity(false);$('#album-detail').onclick=()=>setAlbumDensity(true);
try{if(localStorage.getItem('pokeamor-album-detail')==='true')setAlbumDensity(true)}catch{}

(()=>{const rail=$('#album-index'),control=$('#album-scrubber'),preview=$('#album-index-preview');let sections=[],selected=0,dragging=false,startY=0,startIndex=0,previewIndex=-1,hidePreviewTimer,scrollFrame=0;const previewCache=new Map();
function show(index){selected=Math.max(0,Math.min(sections.length-1,index));const section=sections[selected];if(!section)return;control.setAttribute('aria-valuenow',String(selected+1));control.setAttribute('aria-valuemax',String(sections.length));control.setAttribute('aria-valuetext',section.querySelector('h3').textContent);control.setAttribute('data-position',String(Number(section.getAttribute('data-batch'))+1));if(!dragging)rail.style.setProperty('--index-position',String(selected/Math.max(1,sections.length-1)));control.setAttribute('aria-orientation','vertical');if(preview.hidden||previewIndex===selected)return;previewIndex=selected;const images=[...section.querySelectorAll('.memory-card img')];$('#album-index-cover').src=images[0]?.src||'';$('#album-index-label').textContent='Tanda '+(Number(section.getAttribute('data-batch'))+1)+' · '+sections.length+' tandas';const cacheKey=images.map(im=>im.src).join('|');let nodes=previewCache.get(cacheKey);if(!nodes){nodes=images.map(source=>{const image=document.createElement('img');image.decoding='async';image.width=245;image.height=337;image.src=source.currentSrc||source.src;image.alt=source.alt;return image});previewCache.set(cacheKey,nodes);if(previewCache.size>8)previewCache.delete(previewCache.keys().next().value)}$('#album-index-cards').replaceChildren(...nodes)}
function fromPointer(e){const travel=Math.max(1,rail.getBoundingClientRect().height-60),value=Math.max(0,Math.min(sections.length-1,startIndex+(e.clientY-startY)/travel*(sections.length-1)));rail.style.setProperty('--index-position',String(value/Math.max(1,sections.length-1)));if(Math.abs(value-selected)>.62)show(Math.round(value));const sheet=$('#sheet'),rect=sheet.getBoundingClientRect(),lo=Math.floor(value),hi=Math.min(sections.length-1,lo+1),a=sheet.scrollTop+sections[lo].getBoundingClientRect().top-rect.top-albumInset(),b=sheet.scrollTop+sections[hi].getBoundingClientRect().top-rect.top-albumInset();sheet.scrollTo({top:a+(b-a)*(value-lo),behavior:'instant'})}
function albumInset(){const sheet=$('#sheet'),header=sheet.querySelector('.collection-header'),tabs=sheet.querySelector('.collection-switch');return Math.max(0,(header?.offsetHeight||44)+(tabs?.offsetHeight||0)+16)}


function land(){const section=sections[selected];if(!section)return;const sheet=$('#sheet'),r=sheet.getBoundingClientRect();sheet.scrollTo({top:sheet.scrollTop+section.getBoundingClientRect().top-r.top-albumInset(),behavior:'instant'});section.classList.add('index-landed');setTimeout(()=>section.classList.remove('index-landed'),600)}
control.onpointerdown=e=>{dragging=true;startY=e.clientY;startIndex=selected;rail.classList.add('scrubbing');clearTimeout(hidePreviewTimer);control.setPointerCapture(e.pointerId);preview.hidden=false;previewIndex=-1;show(selected);const h=preview.getBoundingClientRect().height||230;preview.style.top=Math.max(100,Math.min(innerHeight-h-24,innerHeight*.43-h/2))+'px';fromPointer(e)};control.onpointermove=e=>{if(dragging)fromPointer(e)};control.onpointerup=()=>{if(!dragging)return;land();dragging=false;rail.classList.remove('scrubbing');show(selected);hidePreviewTimer=setTimeout(()=>{preview.hidden=true},100)};control.onpointercancel=control.onlostpointercapture=()=>{if(!dragging)return;dragging=false;rail.classList.remove('scrubbing');preview.hidden=true};control.onkeydown=e=>{if(['ArrowDown','ArrowUp','Home','End','Enter'].includes(e.key)){e.preventDefault();show(e.key==='Home'?0:e.key==='End'?sections.length-1:selected+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0));land()}};
window.PokeAlbumIndex={refresh(){sections=[...$('#round-memories').querySelectorAll('.batch-group')];previewIndex=-1;rail.hidden=sections.length<3;if(sections.length)show(Math.min(selected,sections.length-1))}};
$('#sheet').onscroll=()=>{if(dragging||rail.hidden||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;if(dragging||rail.hidden)return;const top=$('#sheet').getBoundingClientRect().top+albumInset();let low=0,high=sections.length-1;while(low<high){const mid=Math.floor((low+high)/2);if(sections[mid].getBoundingClientRect().bottom<top)low=mid+1;else high=mid}show(low)})};

const originalTab=showCollectionTab;showCollectionTab=function(rounds){originalTab(rounds);$('#album-heading').textContent=rounds?'Tus tandas':'Ajustes y respaldo';preview.hidden=true;dragging=false;if(!rounds)rail.hidden=true;else window.PokeAlbumIndex.refresh()};
})();

$('#album-settings').onclick=()=>{const rounds=!$('#sheet').classList.contains('rounds-mode');showCollectionTab(rounds);$('#album-heading').textContent=rounds?'Tus tandas':'Ajustes y respaldo';$('#album-settings').setAttribute('aria-label',rounds?'Ajustes y respaldo':'Volver a tus tandas');if(rounds)window.PokeJourney?.compose()};

let deleteStage=0,deleteTimer;
$('#delete-all').onclick=()=>{const b=$('#delete-all');if(deleteStage===0){deleteStage=1;b.innerHTML='¿Borrar todos los Pokémon? <span>Cancelar</span>';b.setAttribute('aria-label','Confirmar borrado de toda la colección');deleteTimer=setTimeout(()=>{deleteStage=0;b.innerHTML='Borrar toda la colección <span>⌫'},4500);return}if(deleteStage===1){deleteStage=2;b.innerHTML='Tocá otra vez para borrar <span>Cancelar</span>';clearTimeout(deleteTimer);deleteTimer=setTimeout(()=>{deleteStage=0;b.innerHTML='Borrar toda la colección <span>⌫'},3000);return}if(deleteStage===2){clearTimeout(deleteTimer);localStorage.removeItem(key);location.reload()}};
