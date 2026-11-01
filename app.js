const $=s=>document.querySelector(s);let catalog=[],order=[],filter='yes',busy=false,pair=[],lastPair='',syncTimer,toastTimer,debugCatalog=false;const debugSelected=new Set(),debugPrints=new Map();let debugAlternatives=false;
const q=new URLSearchParams(location.hash.slice(1)),token=q.get('s')||localStorage.getItem('pokeamor-token')||crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');localStorage.setItem('pokeamor-token',token);history.replaceState(null,'','#s='+token);const key='pokeamor-'+token;
let state;try{state=JSON.parse(localStorage.getItem(key))}catch{}state=state||{votes:{},ratings:{},duels:0,history:[],revision:0};state.voteTimes=state.voteTimes||{};state.ratingTimes=state.ratingTimes||{};
let etag=null,cloudReady=false,dirty=localStorage.getItem(key+'-pending')==='1',syncing=false,restoring=null,retryDelay=1200,refreshTimer;
const clone=v=>JSON.parse(JSON.stringify(v));let observedVotes=clone(state.votes),observedRatings=clone(state.ratings);
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600)}
function fallbackPersist(){try{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem(key+'-pending',dirty?'1':'0');return true}catch{$('#save').textContent='No se pudo guardar';return false}}
function persist(){clearTimeout(diskTimer);diskTimer=setTimeout(()=>{if(!profileDB){fallbackPersist();return}try{const tx=profileDB.transaction('profiles','readwrite');tx.objectStore('profiles').put({state,dirty},key);tx.oncomplete=()=>{$('#save').textContent='Guardado en este iPhone'};tx.onerror=()=>fallbackPersist()}catch{fallbackPersist()}},100);return true}

function trackChanges(){for(const [field,observed,times] of [['votes',observedVotes,state.voteTimes],['ratings',observedRatings,state.ratingTimes]])for(const id of new Set([...Object.keys(observed),...Object.keys(state[field])]))if(JSON.stringify(observed[id])!==JSON.stringify(state[field][id]))times[id]=Math.max(Date.now(),(times[id]||0)+1);observedVotes=clone(state.votes);observedRatings=clone(state.ratings)}
function save(change){scheduleEngine();if(change?.votes){for(const id of change.votes){state.voteTimes[id]=Math.max(Date.now(),(state.voteTimes[id]||0)+1);if(state.votes[id])observedVotes[id]=clone(state.votes[id]);else delete observedVotes[id]}}else trackChanges();state.revision++;dirty=true;if(persist())$('#save').textContent='Guardando…';else toast('Exportá tu colección para conservarla.');clearTimeout(syncTimer);syncTimer=setTimeout(sync,700)}
function refreshAfterMerge(){clearTimeout(refreshTimer);if($('.card.active')){refreshTimer=setTimeout(refreshAfterMerge,150);return}render();if($('#sheet').classList.contains('open'))collection()}
function mergeRemote(remote){
 if(state.resetAt&&(state.resetAt>(remote.resetAt||0))){dirty=true;return}
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
 const comparisons=[...new Map([...(remote.comparisons||[]),...(local.comparisons||[])].map(e=>[e.id,e])).values()].filter(e=>!(remote.comparisonDeleted||{})[e.id]&&!(local.comparisonDeleted||{})[e.id]);
 const refinementSchedule=(remote.refinementSchedule?.time||0)>(local.refinementSchedule?.time||0)?remote.refinementSchedule:local.refinementSchedule;
 state={...local,comparisons,comparisonDeleted:{...(remote.comparisonDeleted||{}),...(local.comparisonDeleted||{})},refinementSchedule,encounters:{...(remote.encounters||{}),...(local.encounters||{})},votes,voteTimes,ratings,ratingTimes,duels:Math.max(local.duels,remote.duels||0),revision:Math.max(local.revision,remote.revision||0)+1};observedVotes=clone(votes);observedRatings=clone(ratings);dirty=true;persist();scheduleEngine();if(changed)refreshAfterMerge();
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
function pending(){return adaptiveQueue()}function current(){return pending()[0]}
const roundCounter=$('#round-progress');if(roundCounter&&$('#open')&&!roundCounter.closest('#app>header'))$('#app>header').insertBefore(roundCounter,$('#open'));
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
 document.documentElement.style.setProperty('--journey-hue',String(h));const key=[h,palette.s,palette.v].join(':');if(key===lastPalette)return;lastPalette=key;
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
 const c=document.createElement('div');c.pokemon=p;c.className='card'+(under?' under':'')+(!p.image?' official':'');const source=warmArt.get(p.surface?.assets?.front||p.image||fallback(p));const artwork=source?.complete&&source.naturalWidth?source:img(p,true);warmArt.delete(p.surface?.assets?.front||p.image||fallback(p));artwork.decoding='async';const fitArt=()=>{c.materialFrontReady=!!(artwork.materialSource&&!c.classList.contains('art-fallback')&&artwork.naturalWidth>0);if(c.classList.contains('official')||!artwork.naturalWidth||!artwork.naturalHeight)return;c.artRatio=artwork.naturalWidth/artwork.naturalHeight;c.style.aspectRatio=String(c.artRatio);if(!under){fitCard();window.PokeMaterial?.refresh()}};artwork.onload=fitArt;c.append(artwork);if(artwork.complete)queueMicrotask(fitArt);
 c.activate=()=>{if(c.activated)return;c.activated=true;under=false;c.classList.remove('under');c.style.transform='';c.style.filter='';c.removeAttribute('aria-hidden');
 c.pokemon=p;c.setAttribute('aria-label',p.name);const choice=document.createElement('div');choice.className='choice-light';c.append(choice);const stamp=document.createElement('div');stamp.className='stamp';stamp.setAttribute('aria-hidden','true');stamp.innerHTML='<svg class=heart viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"/></svg><svg class=cross viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';c.append(stamp);
 let surface=null;let start=null,dx=0,dy=0,vx=0,lastX=0,lastTime=0,lastMove=0,releaseTimer,held=false,armed=0,raf=0,previous=0;
 const position={x:0,y:0,r:0,rx:0,ry:0,s:1},velocity={x:0,y:0,r:0,rx:0,ry:0,s:0},target={...position};
 const paint=()=>{c.style.transform=`translate3d(${position.x}px,${position.y}px,0) rotate(${position.r}deg) rotateX(${position.rx}deg) rotateY(${position.ry}deg) scale(${position.s})`};
 function tick(now){const dt=Math.min((now-previous)/1000||.016,.025);previous=now;let moving=false;for(const key in position){velocity[key]+=((target[key]-position[key])*1100-velocity[key]*60)*dt;position[key]+=velocity[key]*dt;if(Math.abs(target[key]-position[key])>.001||Math.abs(velocity[key])>.01)moving=true}paint();if(moving)raf=requestAnimationFrame(tick);else{raf=0;previous=0}}
 function move(values){Object.assign(target,values);if(reducedMotion.matches){Object.assign(position,target);paint();return;}if(!raf)raf=requestAnimationFrame(tick)}
 const undercard=()=>$('#stage').querySelector('.under');
 const light=(x,y)=>{const bounds=$('#stage').getBoundingClientRect(),width=c.clientWidth,height=c.clientHeight;const px=Math.max(0,Math.min(100,(x-(bounds.left+(bounds.width-width)/2))/width*100));const py=Math.max(0,Math.min(100,(y-(bounds.top+(bounds.height-height)/2))/height*100));c.style.setProperty('--x',px+'%');c.style.setProperty('--y',py+'%');c.style.setProperty('--angle',(100+px*.4)+'deg');surface?.pointer(px/100,py/100);return{px,py}};
 const reset=()=>{held=false;armed=0;clearFeedback();move({x:0,y:0,r:0,rx:0,ry:0,s:1});stamp.style.opacity=0;stamp.classList.remove('armed');c.style.setProperty('--love','0');c.style.setProperty('--pass','0');c.classList.remove('active','lifted');surface?.release();const u=undercard();if(u){u.style.transform='';u.style.filter=''}};
 c.setUnder=()=>{c.stopMotion();under=true;c.activated=false;c.classList.add('under');c.setAttribute('aria-hidden','true');for(const n of c.querySelectorAll('.choice-light,.stamp'))n.remove()};
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
 c.onpointercancel=()=>{start=null;reset()};c.onlostpointercapture=()=>{if(start){start=null;reset()}};surface=window.PokeHolo?.attach(c,p,{onTilt:(rx,ry)=>{if(!held&&!start)move({rx,ry})}});};if(under)c.setAttribute('aria-hidden','true');else c.activate();return c
}
const warmArt=new Map();
function warmArtwork(p){const url=p.surface?.assets?.front||p.image||fallback(p);if(warmArt.has(url))return;const art=img(p,true);warmArt.set(url,art);art.addEventListener?.('load',()=>{if(typeof scheduleEvents==='function')scheduleEvents()},{once:true});art.decode?.().catch(()=>{});if(warmArt.size>24)warmArt.delete(warmArt.keys().next().value)}
function render(){clearFeedback();const queue=pending(),p=queue[0],n=Object.keys(state.votes).length,likes=Object.values(state.votes).filter(v=>v.value==='yes').length;$('#likes').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"/></svg><span>'+likes+'</span>';$('#open').setAttribute('aria-label','Mi colección, '+likes+' Pokémon');$('#count').textContent=n+' de '+catalog.length;const seenCounter=$('#album-seen');if(seenCounter){seenCounter.textContent=likes+' / '+catalog.length;seenCounter.setAttribute('aria-label',likes+' de '+catalog.length+' Pokémon te gustan')}$('#progress').style.width=(n/catalog.length*100)+'%';$('#undo').disabled=!state.history.length;
 window.PokeJourney?.update(catalog,state,key);const stage=$('#stage'),flights=[...stage.querySelectorAll('.exiting')].slice(-2);$('#yes').disabled=$('#no').disabled=!p;$('#name').textContent=p?p.name:'Tu colección está completa ♡';$('#art').textContent=p?.reencounter?'Otra mirada':'';$('#dex').textContent='';
 updateCompletedNavigation();
 if(!p){for(const c of stage.querySelectorAll('.card'))c.stopMotion?.();stage.replaceChildren();if(discoveryComplete()&&!inlinePair){$('#sheet').classList.add('open');showCollectionTab(true);window.PokeJourney?.compose()}return}
 setScene(p);window.PokeMaterial?.prepare(queue.slice(0,4));
 reconcileDeck(stage,queue,flights);fitCard();for(const next of queue.slice(1,4))warmArtwork(next)
}
function vote(value,momentum={}){
 if(busy||!current())return;busy=true;clearFeedback();const c=$('.card:not(.under):not(.exiting)'),p=c?.pokemon||current();tactile(value==='yes'?'like':'choose');sound(value==='yes'?'like':'choose');
 if(p.reencounter){state.refinementSchedule={...(state.refinementSchedule||{}),nextSeen:Object.keys(state.votes).length+28,time:Date.now()};const event={id:p.id,card:p.card,value,time:Date.now(),checkpoint:p.checkpoint};state.encounters=state.encounters||{};state.encounters[event.card+':'+event.checkpoint]=event;state.history.push({id:p.id,direction:value,encounterKey:event.card+':'+event.checkpoint});activeEncounter=null}else{state.history.push({id:p.id,previous:state.votes[p.id]||null,direction:value});state.votes[p.id]={value,card:p.card,time:Date.now()}}save({votes:p.reencounter?[]:[p.id]});
 if(!p.reencounter&&value==='yes'&&Object.values(state.votes).filter(v=>v.value==='yes').length%15===0)state.refinementSchedule={...(state.refinementSchedule||{}),nextSeen:Math.max(Object.keys(state.votes).length+8,state.refinementSchedule?.nextSeen||0),time:Date.now()};
 if(c){const badge=c.querySelector('.stamp');if(badge){badge.classList.toggle('love',value==='yes');badge.classList.add('armed');badge.style.setProperty('--decision-color',value==='yes'?'#a52e5a':'#2e647c');badge.style.opacity='1';badge.style.transform='scale(1)';}c.style.setProperty(value==='yes'?'--love':'--pass','1');c.stopMotion?.();c.classList.add('exiting');c.classList.remove('lifted','dealt','returned','active');c.setAttribute('aria-hidden','true');c.style.pointerEvents='none'}
 render();const next=$('.card:not(.under):not(.exiting)');if(next)next.classList.add('dealt');signalDecision(value);window.PokeJourney?.celebrate();
 if(c){void c.offsetWidth;const duration=reducedMotion.matches?0:Math.max(125,175-Math.abs(momentum.vx||0)*22);c.style.transition=`transform ${duration}ms cubic-bezier(.22,.55,.45,1),opacity ${duration}ms ease`;c.style.transform=`translate3d(${value==='yes'?innerWidth+100:-innerWidth-100}px,${Math.max(-80,Math.min(80,(momentum.dy||0)*.4))-20}px,0) rotate(${value==='yes'?22:-22}deg) scale(1.015)`;c.style.opacity=0;setTimeout(()=>c.remove(),duration+20)}
 busy=false;scheduleEvents();
}

$('#yes').onclick=()=>vote('yes');$('#no').onclick=()=>vote('no');$('#undo').onclick=()=>{
 if(busy)return;const h=state.history.pop();if(!h)return;const direction=h.direction||state.votes[h.id]?.value||'no';
 cancelDecisionFeedback();for(const card of $('#stage').querySelectorAll('.exiting'))card.remove();
 if(h.encounterKey){delete state.encounters[h.encounterKey];activeEncounter=null}else if(h.previous)state.votes[h.id]=h.previous;else delete state.votes[h.id];if(!h.encounterKey){adaptiveIds=[h.id,...adaptiveIds.filter(id=>id!==h.id)]}adaptiveBlock='';tactile('choose');save();render();
 const restored=$('.card:not(.under):not(.exiting)');if(restored?.pokemon?.id===h.id){restored.style.setProperty('--return-x',((direction==='yes'?1:-1)*Math.min(innerWidth+40,560))+'px');restored.style.setProperty('--return-r',(direction==='yes'?'14':'-14')+'deg');restored.classList.add('returned')}
};document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||$('.sheet.open')||document.querySelector('dialog[open]'))return;if(e.key==='ArrowRight')vote('yes');if(e.key==='ArrowLeft')vote('no')});
function score(p){return window.PokePreference?1000+174*window.PokePreference.model(state).score(p.id):1000}
let visibleCards=40,detailPokemon=null,detailChange=null,collectionCards=[];
function detailLabel(){if(!detailPokemon)return;const button=$('#detail-choice');if(debugCatalog){const selected=debugSelected.has(detailPokemon.card);button.textContent=selected?'Quitar de proxies':'Agregar a proxies';button.setAttribute('aria-label',selected?'Quitar '+detailPokemon.name+' de proxies':'Agregar '+detailPokemon.name+' a proxies');button.setAttribute('aria-pressed',String(selected));return}const liked=state.votes[detailPokemon.id]?.value==='yes';button.setAttribute('aria-label',liked?'Quitar de favoritos':'Agregar a favoritos');button.setAttribute('aria-pressed',String(liked));button.innerHTML='<svg viewBox="0 0 24 24" fill="'+(liked?'currentColor':'none')+'"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2c0 6.5-8.8 11.7-8.8 11.7S3.2 15.3 3.2 8.8Z"/></svg>'}
let viewerScrollTimer,viewerItems=[];
function activateViewer(index){const item=viewerItems[index];if(!item)return;const {p,host,art}=item;detailPokemon=p;detailChange=null;viewerHolo?.dispose();for(const entry of viewerItems)entry.host.id='';host.id='viewer-surface';$('#card-detail').style.setProperty('--viewer-hue',p.palette?.h||325);$('#detail-position').textContent=(index+1)+' / '+viewerItems.length;$('#detail-name').textContent=p.name;host.materialFrontReady=!!art.materialSource&&art.naturalWidth>0;host.artRatio=art.naturalWidth/art.naturalHeight||.716;window.PokeMaterial?.prepare(collectionCards.slice(Math.max(0,index-1),index+3));viewerHolo=window.PokeHolo?.attach(host,p,{onTilt:()=>{}});detailOrigin=document.querySelector('.memory-card[data-pokemon="'+p.id+'"]');$('#detail-undo').hidden=true;detailLabel()}
function centerViewer(index,smooth=true){const item=viewerItems[index],box=$('#detail-art');if(!item)return;box.scrollTo?.({left:item.host.offsetLeft-(box.clientWidth-item.host.offsetWidth)/2,behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'})}
function inspectCard(p){if(!collectionCards.some(c=>c.id===p.id))collectionCards=[p];const box=$('#detail-art');clearTimeout(viewerScrollTimer);viewerHolo?.dispose();box.replaceChildren();viewerItems=collectionCards.map((card,index)=>{const host=document.createElement('div');host.className='viewer-item';const art=img(card,true);art.draggable=false;art.decoding='async';art.loading=Math.abs(index-collectionCards.indexOf(p))<=1?'eager':'lazy';host.append(art);box.append(host);art.onload=()=>{host.materialFrontReady=!!art.materialSource&&art.naturalWidth>0;if(detailPokemon?.id===card.id)window.PokeMaterial?.refresh()};host.onclick=()=>centerViewer(index);return{p:card,host,art}});if(!$('#card-detail').open)$('#card-detail').showModal();const index=collectionCards.indexOf(p);activateViewer(index);centerViewer(index,false)}
function collection(){const yes=catalog.filter(p=>state.votes[p.id]?.value==='yes');$('.collection-title').textContent=debugCatalog?(debugAlternatives?'Ilustraciones alternativas':'Catálogo completo'):({yes:'Tus elegidos.',no:'Los que pasaste.',pending:'Por descubrir.',top:'Tus finalistas.'})[filter];$('#summary').textContent=debugCatalog?(debugAlternatives?debugCatalogCards().length:catalog.length)+' cartas · modo depuración':yes.length+' elegidos';$('#team-open').disabled=yes.length<2;const hue=yes[0]?.palette?.h||325;$('#sheet').style.setProperty('--collection-accent',`hsl(${hue} 24% 45%)`);const list=debugCatalog?debugCatalogCards():filter==='all'?order.filter(p=>state.votes[p.id]):filter==='pending'?pending():filter==='top'?yes.filter(p=>state.ratings[p.id]?.played>0).sort((a,b)=>score(b)-score(a)):order.filter(p=>state.votes[p.id]?.value===filter);collectionCards=list;$('#grid').replaceChildren();$('#gallery-more').hidden=list.length<=visibleCards;if(!list.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=filter==='top'?'Tus finalistas aparecen después de los duelos.':filter==='yes'?'Tu primer flechazo empieza con una carta.':'Todavía no hay cartas acá.';$('#grid').append(empty);return}list.slice(0,visibleCards).forEach((p,i)=>{const button=document.createElement('button');button.className='tile';button.setAttribute('aria-label','Ver '+p.name);const image=img(p);image.loading='lazy';image.decoding='async';button.append(image);const name=document.createElement('b');name.textContent=p.name;button.append(name);if(debugCatalog){const meta=document.createElement('small');meta.textContent=[p.card,p.rarity].filter(Boolean).join(' · ');button.append(meta)}if(filter==='top'){const rank=document.createElement('span');rank.className='rank';rank.textContent='#'+(i+1);button.append(rank)}if(debugCatalog){const mark=document.createElement('span');mark.className='debug-select '+(debugSelected.has(p.card)?'selected':'');mark.textContent=debugSelected.has(p.card)?'✓':'+';mark.setAttribute('aria-label',debugSelected.has(p.card)?'Quitar de proxies':'Agregar a proxies');mark.onclick=e=>{e.stopPropagation();toggleDebugSelection(p);mark.classList.toggle('selected',debugSelected.has(p.card));mark.textContent=debugSelected.has(p.card)?'✓':'+'};button.append(mark)}button.onclick=()=>inspectCard(p);$('#grid').append(button)})}
$('#gallery-more').onclick=()=>{visibleCards+=40;collection()};
$('#detail-close').onclick=()=>$('#card-detail').close();
$('#detail-choice').onclick=()=>{if(!detailPokemon)return;if(debugCatalog){toggleDebugSelection(detailPokemon);detailLabel();if(debugCatalog)collection();return}const p=detailPokemon,before=state.votes[p.id]?clone(state.votes[p.id]):null;const after={value:before?.value==='yes'?'no':'yes',card:p.card,time:Date.now()};const record={id:p.id,previous:before};state.history.push(record);state.votes[p.id]=after;detailChange={id:p.id,before,after:JSON.stringify(after),record};save();render();collection();detailLabel();$('#detail-undo').hidden=false};
$('#detail-undo').onclick=()=>{const change=detailChange;if(!change)return;if(JSON.stringify(state.votes[change.id])!==change.after){toast('Esta elección cambió en otro dispositivo.');$('#detail-undo').hidden=true;return}if(change.before)state.votes[change.id]=change.before;else delete state.votes[change.id];const index=state.history.indexOf(change.record);if(index>=0)state.history.splice(index,1);detailChange=null;save();render();collection();detailLabel();$('#detail-undo').hidden=true};
$('#options-close').onclick=()=>showCollectionTab(true);
$('#team-open').onclick=()=>{$('#teamview').classList.add('open');window.PokeJourney?.compose()};$('#team-back').onclick=()=>$('#teamview').classList.remove('open');
$('#memories-open').onclick=()=>{if($('#collection-options').open)$('#collection-options').close();$('#sheet').classList.add('open');showCollectionTab(true);window.PokeJourney?.compose()};$('#memories-back').onclick=()=>$('#memoriesview').classList.remove('open');
$('#open').onclick=()=>{filter='yes';$('#sheet').classList.add('open');showCollectionTab(true);window.PokeJourney?.compose()};$('#close').onclick=()=>{if(debugCatalog){debugCatalog=false;$('#debug-card-tabs')?.remove();$('#collection-settings').disabled=false;$('#sheet').classList.remove('debug-mode');$('#collection-options').style.display='';$('#collection-settings').textContent='Ajustes y respaldo';showCollectionTab(true);return}if(discoveryComplete()){beginManualRefinement();return}$('#sheet').classList.remove('open')};$('#tabs').onclick=e=>{if(!e.target.dataset.filter)return;filter=e.target.dataset.filter;showCollectionTab(false);visibleCards=40;if($('#collection-options').open)$('#collection-options').close();$('#tabs').querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===e.target));collection()};
function nextPair(){const likes=catalog.filter(p=>state.votes[p.id]?.value==='yes');if(likes.length<2){toast('Elegí al menos dos Pokémon que te gusten.');return false}const candidates=[...likes].sort((a,b)=>(state.ratings[a.id]?.played||0)-(state.ratings[b.id]?.played||0));let a=candidates[Math.floor(Math.random()*Math.min(4,candidates.length))];let others=likes.filter(p=>p.id!==a.id).sort((x,y)=>Math.abs(score(x)-score(a))-Math.abs(score(y)-score(a)));let b=others[Math.floor(Math.random()*Math.min(5,others.length))];if(likes.length>2&&[a.id,b.id].sort().join()===lastPair)b=others.find(p=>p.id!==b.id)||b;pair=[a,b];lastPair=pair.map(p=>p.id).sort().join();$('#pair').replaceChildren();pair.forEach((p,i)=>{const btn=document.createElement('button');btn.append(img(p));const n=document.createElement('p');n.textContent=p.name;btn.append(n);btn.onclick=()=>duel(i);$('#pair').append(btn)});$('#duelcount').textContent=state.duels+' duelos guardados · El orden se afina con cada elección.';return true}
function duel(winner){const [a,b]=pair;const ra=score(a),rb=score(b),expected=1/(1+10**((rb-ra)/400)),actual=winner===2?.5:winner===0?1:0;for(const [p,s] of [[a,ra+28*(actual-expected)],[b,rb-28*(actual-expected)]])state.ratings[p.id]={score:s,played:(state.ratings[p.id]?.played||0)+1};state.duels++;save();nextPair()}
$('#duel').onclick=()=>{if(nextPair())$('#duelsheet').classList.add('open')};$('#endduel').onclick=()=>{$('#duelsheet').classList.remove('open');collection();window.PokeJourney?.compose()};$('#both').onclick=()=>duel(2);$('#skip').onclick=nextPair;
$('#export').onclick=()=>{const payload={version:1,state,catalog:catalog.filter(p=>state.votes[p.id]).map(p=>({id:p.id,name:p.name,card:state.votes[p.id].card,choice:state.votes[p.id].value,score:state.ratings[p.id]?.score||null}))};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mi-coleccion-pokeamor.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('#import').onclick=()=>$('#file').click();$('#file').onchange=async e=>{try{const v=JSON.parse(await e.target.files[0].text());if(v.version!==1||!v.state?.votes||!v.state?.ratings)throw Error();for(const [id,x] of Object.entries(v.state.votes)){if(!catalog.some(p=>p.id===Number(id))||!['yes','no'].includes(x.value))throw Error();state.votes[id]=x}for(const [id,x] of Object.entries(v.state.ratings))if(Number.isFinite(x.score)&&Number.isFinite(x.played))state.ratings[id]=x;state.duels=Math.max(state.duels,Number(v.state.duels)||0);save();render();collection();toast('Colección importada')}catch{toast('No se pudo leer esa colección.')}e.target.value=''};
$('#share').onclick=()=>{if($('#collection-options').open)$('#collection-options').close();$('#link').value=location.href;$('#cloudstatus').textContent=dirty?'Todavía hay cambios sin sincronizar. Conservá también una exportación.':'El enlace recupera la última colección sincronizada.';$('#sharing').showModal();if(dirty)sync()};$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Enlace copiado')}catch{$('#link').select();toast('Mantené pulsado el enlace para copiarlo.')}};$('#dismiss').onclick=()=>$('#sharing').close();
async function init(){try{catalog=await(await fetch('/catalog.json',{cache:'no-cache'})).json();const ids=[...new Set(popular)];order=[...ids.map(id=>catalog.find(p=>p.id===id)).filter(Boolean),...catalog.filter(p=>!ids.includes(p.id))];await restoreLocalProfile();startEngine();render();restore()}catch{$('#stage').innerHTML='<p>No pudimos cargar el catálogo. <a href="">Reintentar</a></p>'}}init();

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


$('#collection-settings').onclick=()=>{if(debugCatalog){if(window.PokeCardResources.getStatus().proxies==='error')loadDebugProxies();else $('#debug-copy').click();return}showCollectionTab(false)};
function updateProxyControls(){const status=window.PokeCardResources.getStatus().proxies,ready=status==='ready';$('#debug-copy').disabled=!ready;const button=$('#collection-settings');if(debugCatalog){button.disabled=status==='loading';button.textContent=status==='loading'?'Preparando códigos…':status==='error'?'Reintentar códigos':'Copiar seleccionadas · '+debugSelected.size}}
function loadDebugProxies(){updateProxyControls();const promise=window.PokeCardResources.loadProxies();updateProxyControls();promise.then(updateProxyControls).catch(()=>{updateProxyControls();toast('No se pudieron cargar los códigos. Tocá Reintentar.')})}
function toggleDebugSelection(p){if(!p.card){toast('Esta imagen no tiene una impresión exportable');return}debugPrints.set(p.card,{pokemonId:p.id,printId:p.card,name:p.name});if(debugSelected.has(p.card))debugSelected.delete(p.card);else debugSelected.add(p.card);$('#debug-selected-count').textContent=debugSelected.size+' seleccionadas';updateProxyControls()}
function debugProxyText(selection,prints,lookup){const selected=[...selection].map(id=>prints.get(id));if(selected.some(p=>!p))throw Error('Selección inválida');selected.sort((a,b)=>a.pokemonId-b.pokemonId||a.printId.localeCompare(b.printId));const missing=selected.filter(p=>!lookup(p.printId));if(missing.length)throw Error(missing.length+' sin código de Limitless: '+missing.map(p=>p.name+' ('+p.printId+')').join(', '));return selected.map(p=>{const r=lookup(p.printId);return '1 '+r.name+' '+r.set+' '+r.number}).join('\n')}
function manualProxyCopy(text){let dialog=$('#proxy-copy-fallback');if(!dialog){dialog=document.createElement('dialog');dialog.id='proxy-copy-fallback';const field=document.createElement('textarea');field.readOnly=true;field.setAttribute('aria-label','Listado para Limitless');field.style.cssText='width:100%;min-height:180px';const close=document.createElement('button');close.textContent='Listo';close.onclick=()=>dialog.close();dialog.append(field,close);document.body.append(dialog)}dialog.querySelector('textarea').value=text;dialog.showModal();dialog.querySelector('textarea').select();toast('Mantené pulsado el listado para copiarlo')}
$('#debug-copy').onclick=()=>{if(!debugSelected.size){toast('Seleccioná al menos una carta');return}if(window.PokeCardResources.getStatus().proxies!=='ready'){loadDebugProxies();return}let text;try{text=debugProxyText(debugSelected,debugPrints,window.PokeCardResources.getProxy)}catch(error){toast(error.message);return}try{navigator.clipboard.writeText(text).then(()=>toast(debugSelected.size+' cartas copiadas para Limitless')).catch(()=>manualProxyCopy(text))}catch{manualProxyCopy(text)}};
function debugCatalogCards(){const sorted=[...catalog].sort((a,b)=>a.id-b.id);return debugAlternatives?sorted.flatMap(p=>window.PokeCardResources.getAlternatives(p.id).map(row=>makeAlternativeCard(p,row))):sorted}
function debugTabs(){let tabs=$('#debug-card-tabs');if(tabs)return;tabs=document.createElement('div');tabs.id='debug-card-tabs';tabs.className='tools';for(const [label,alternatives] of [['Principales',false],['Alternativas',true]]){const button=document.createElement('button');button.className='pill';button.textContent=label;button.setAttribute('aria-pressed',String(debugAlternatives===alternatives));button.onclick=async()=>{if(alternatives){button.disabled=true;try{await window.PokeCardResources.loadAlternatives()}catch{toast('No se pudieron cargar las alternativas. Tocá para reintentar.');return}finally{button.disabled=false}}if(!debugCatalog)return;debugAlternatives=alternatives;for(const b of tabs.children)b.setAttribute('aria-pressed',String(b===button));collection()};tabs.append(button)}$('#grid').before(tabs)}
$('#debug-catalog').onclick=()=>{debugCatalog=true;debugAlternatives=false;$('#debug-card-tabs')?.remove();$('#sheet').classList.add('open','debug-mode');showCollectionTab(false);$('#collection-options').style.display='none';visibleCards=catalog.length;debugTabs();collection();loadDebugProxies()};
$('#close').addEventListener('click',()=>{if(!debugCatalog)return;debugCatalog=false;$('#debug-card-tabs')?.remove();$('#collection-settings').disabled=false;$('#sheet').classList.remove('debug-mode');$('#collection-options').style.display='';showCollectionTab(true)});

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

const originalTab=showCollectionTab;showCollectionTab=function(rounds){originalTab(rounds);$('#album-heading').textContent=rounds?'Tu colección':'Ajustes y respaldo';preview.hidden=true;dragging=false;if(!rounds)rail.hidden=true;else window.PokeAlbumIndex.refresh()};
})();

$('#album-settings').onclick=()=>{const rounds=!$('#sheet').classList.contains('rounds-mode');showCollectionTab(rounds);$('#album-heading').textContent=rounds?'Tu colección':'Ajustes y respaldo';$('#album-settings').setAttribute('aria-label',rounds?'Ajustes y respaldo':'Volver a tus tandas');if(rounds)window.PokeJourney?.compose()};

let deleteStage=0,deleteTimer;
async function resetCollection(){
 clearTimeout(deleteTimer);clearTimeout(syncTimer);clearTimeout(diskTimer);syncing=false;
 const revision=(state.revision||0)+1;
 alternateGeneration++;alternateBusy=false;preparedEncounter=null;activeEncounter=null;alternativeRetry=false;alternativeResourceAttempts=0;alternativeRetryAt=0;alternateFailures.clear();clearTimeout(alternateTimer);alternateTimer=null;
 state={votes:{},ratings:{},duels:0,history:[],comparisons:[],comparisonDeleted:{},encounters:{},voteTimes:{},ratingTimes:{},refinementSchedule:null,revision,resetAt:Date.now()};
 observedVotes={};observedRatings={};dirty=true;etag=null;
 localStorage.removeItem(key);localStorage.removeItem(key+'-pending');localStorage.removeItem(key+'-journey');localStorage.removeItem(key+'-alternates');
 try{profileDB?.transaction('profiles','readwrite').objectStore('profiles').delete(key)}catch{}
 if(cloudReady)await sync();
 $('#sheet').classList.remove('open');showCollectionTab(true);deleteStage=0;const b=$('#delete-all');b.innerHTML='Borrar toda la colección <span>⌫';b.setAttribute('aria-label','Borrar toda la colección');render();toast('Colección borrada');
}
$('#delete-all').onclick=()=>{const b=$('#delete-all');if(deleteStage===0){deleteStage=1;b.innerHTML='¿Borrar todos los Pokémon? <span>Cancelar</span>';b.setAttribute('aria-label','Confirmar borrado de toda la colección');deleteTimer=setTimeout(()=>{deleteStage=0;b.innerHTML='Borrar toda la colección <span>⌫'},4500);return}if(deleteStage===1){deleteStage=2;b.innerHTML='Tocá otra vez para borrar <span>Cancelar</span>';clearTimeout(deleteTimer);deleteTimer=setTimeout(()=>{deleteStage=0;b.innerHTML='Borrar toda la colección <span>⌫'},3000);return}resetCollection()};

// Small local content model. Community votes are a prior, not personal affinity.
let adaptiveIds=[],adaptiveBlock='',activeEncounter=null,alternateBusy=false,alternateGeneration=0,preparedEncounter=null,alternativeRetry=false,alternativeResourceAttempts=0,alternativeRetryAt=0;
const alternateFailures=new Map();
try{localStorage.removeItem(key+'-alternates')}catch{}
function makeAlternativeCard(p,row){return {id:p.id,name:p.name,traits:p.traits,palette:p.palette,communityVotes2020:p.communityVotes2020,card:row[0],image:row[1],fallbackImage:row[1],rarity:row[2],artist:row[3],surface:null,reencounter:true}}
function alternateCandidate(){const recent=new Set(state.history.slice(-10).map(h=>h.id)),events=Object.values(state.encounters||{});const eligible=catalog.filter(p=>state.votes[p.id]?.value==='yes'&&!recent.has(p.id)&&window.PokeCardResources.getAlternatives(p.id).length).sort((a,b)=>events.filter(e=>e.id===a.id).length-events.filter(e=>e.id===b.id).length||a.id-b.id);for(const p of eligible){const rows=window.PokeCardResources.getAlternatives(p.id).filter(r=>r[0]!==p.card&&(alternateFailures.get(r[0])||0)<Date.now()).slice().sort((a,b)=>Math.max(0,...events.filter(e=>e.card===a[0]).map(e=>e.time))-Math.max(0,...events.filter(e=>e.card===b[0]).map(e=>e.time)));if(rows.length)return makeAlternativeCard(p,rows[0])}return null}
function preferenceFeatures(p){return p.traits||[]}
function adaptiveQueue(){
 const unseen=order.filter(p=>!state.votes[p.id]);if(!catalog.some(p=>p.traits?.length))return unseen;
 const likes=Object.values(state.votes).filter(v=>v.value==='yes').length,n=Object.keys(state.votes).length;
 const block=Math.floor(n/20)+':'+Math.floor(likes/15);
 if(engineWorker){if(!adaptiveIds.length)adaptiveIds=order.map(p=>p.id);if(eventBoundary&&engineResult){const locked=adaptiveIds.filter(id=>!state.votes[id]).slice(0,3);adaptiveIds=[...locked,...engineResult.ids.filter(id=>!locked.includes(id)&&!state.votes[id])];engineResult=null}}else if(block!==adaptiveBlock||!adaptiveIds.length){
  const locked=adaptiveIds.filter(id=>!state.votes[id]).slice(0,3);
  const evidence=new Map();
  for(const p of catalog){const v=state.votes[p.id];if(!v)continue;for(const f of preferenceFeatures(p)){const e=evidence.get(f)||[0,0];e[0]+=v.value==='yes'?1:0;e[1]++;evidence.set(f,e)}}
  for(const event of Object.values(state.encounters||{})){const p=catalog.find(p=>p.id===event.id);if(!p)continue;for(const f of preferenceFeatures(p)){const e=evidence.get(f)||[0,0];e[0]+=event.value==='yes'?.5:0;e[1]+=.5;evidence.set(f,e)}}
  const prior=p=>p.communityVotes2020?Math.log1p(p.communityVotes2020)/Math.log1p(140559):.45;
  for(const p of catalog){const r=state.ratings?.[p.id];if(!r?.played)continue;const weight=Math.min(1.5,r.played*.2),preference=1/(1+10**((1000-r.score)/400));for(const f of preferenceFeatures(p)){const e=evidence.get(f)||[0,0];e[0]+=preference*weight;e[1]+=weight;evidence.set(f,e)}}
  const affinity=p=>{const fs=preferenceFeatures(p);return fs.length?fs.reduce((sum,f)=>{const e=evidence.get(f)||[0,0];return sum+(e[0]+2)/(e[1]+4)},0)/fs.length:.5};
  const confidence=Math.min(.75,n/100);
  const score=p=>confidence*affinity(p)+(1-confidence)*prior(p);
  const ranked=unseen.filter(p=>!locked.includes(p.id)).sort((a,b)=>score(b)-score(a)||a.id-b.id);
  const diverse=[...ranked].sort((a,b)=>((a.id*2654435761+n*97)>>>0)-((b.id*2654435761+n*97)>>>0));
  const popular=[...ranked].sort((a,b)=>prior(b)-prior(a)||a.id-b.id);
  const used=new Set(locked),ids=[...locked];let slot=0;
  while(ids.length<unseen.length){const list=slot%20<12?ranked:slot%20<17?diverse:popular;const next=list.find(p=>!used.has(p.id));if(!next)break;used.add(next.id);ids.push(next.id);slot++}
  adaptiveIds=ids;adaptiveBlock=block;
 }
 // Prepare alternatives asynchronously; never block the next normal card.
 const checkpoint=Math.floor(likes/30);
 const done=Object.values(state.encounters||{}).some(e=>e.checkpoint===checkpoint);
 if(eventBoundary&&!inlinePair&&checkpoint>0&&!done&&!activeEncounter&&n>=(state.refinementSchedule?.nextSeen||20)){
  const ready=preparedEncounter;
  if(ready?.status==='ready'&&ready.generation===alternateGeneration&&state.votes[ready.pokemonId]?.value==='yes'&&state.history.slice(-10).every(h=>h.id!==ready.pokemonId)){warmArt.set(ready.pokemon.image,ready.image);activeEncounter={...ready.pokemon,checkpoint};preparedEncounter=null}

 }
 if(!alternateBusy&&likes>=6)scheduleAlternate();
 const by=new Map(catalog.map(p=>[p.id,p])),queue=adaptiveIds.filter(id=>!state.votes[id]).map(id=>by.get(id)).filter(Boolean);
 return activeEncounter?[activeEncounter,...queue]:queue;
}
async function prepareAlternate(){
 if(alternateBusy||activeEncounter||Date.now()<alternativeRetryAt||(window.PokeCardResources.getStatus().alternatives==='error'&&alternativeResourceAttempts>=2)||Object.values(state.votes).filter(v=>v.value==='yes').length<6)return;
 if(preparedEncounter){if(state.votes[preparedEncounter.pokemonId]?.value==='yes'&&state.history.slice(-10).every(h=>h.id!==preparedEncounter.pokemonId))return;preparedEncounter=null}
 const generation=alternateGeneration;alternateBusy=true;
 try{if(window.PokeCardResources.getStatus().alternatives!=='ready')alternativeResourceAttempts++;await window.PokeCardResources.loadAlternatives();if(generation!==alternateGeneration)return;
 const p=alternateCandidate();if(!p)return;const ready=preparedEncounter={pokemonId:p.id,printId:p.card,status:'loading',generation,pokemon:p};
 const im=new Image();im.decoding='async';await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{im.src='';reject(Error('Image timeout'))},15000);im.onload=()=>{clearTimeout(timer);im.naturalWidth?resolve():reject(Error('Invalid image'))};im.onerror=()=>{clearTimeout(timer);reject(Error('Image unavailable'))};im.src=p.image});if(im.decode)await im.decode();
 if(generation!==alternateGeneration||preparedEncounter!==ready)return;ready.status='ready';ready.image=im;warmArt.set(p.image,im);
 }catch{if(generation===alternateGeneration){if(preparedEncounter)alternateFailures.set(preparedEncounter.printId,Date.now()+300000);preparedEncounter=null;if(!alternativeRetry){alternativeRetry=true;alternativeRetryAt=Date.now()+30000;setTimeout(()=>{if(generation===alternateGeneration)scheduleAlternate()},30000)}}}finally{if(generation===alternateGeneration)alternateBusy=false}
}

$('#refine-favorites').onclick=()=>{if(nextPair())$('#duelsheet').classList.add('open')};

$('#front-refine').onclick=()=>{if(nextPair())$('#duelsheet').classList.add('open')};


// Refinement is a single event in the same card stage.
let inlinePair=null,inlineBusy=false,queuedPair=null,eventBoundary=false;
const eventLayer=document.createElement('div');eventLayer.id='refinement-event';eventLayer.hidden=true;
eventLayer.setAttribute('role','group');eventLayer.setAttribute('aria-label','¿Cuál te gusta más?');
const pairBox=$('#pair'),equalTools=$('#both').parentElement;
eventLayer.append(pairBox,equalTools);$('#stage').append(eventLayer);
const refineIcon=$('#front-refine').innerHTML;
function eventSeen(){return Object.keys(state.votes).length}
function finishRefinement(skipped=false){
 if(!inlinePair)return;
 state.refinementSchedule={lastSeen:eventSeen(),nextSeen:eventSeen()+(skipped?40:26+(state.duels%10)),started:true,time:Date.now()};
 inlineBusy=true;queuedPair=null;eventLayer.classList.add('event-leaving');setTimeout(()=>{inlinePair=null;inlineBusy=false;eventLayer.classList.remove('event-leaving');save();render()},reducedMotion.matches?0:170);
}
function startRefinement(manual=false){
 if(inlinePair||busy)return false;
 const likes=catalog.filter(p=>state.votes[p.id]?.value==='yes');
 if(likes.length<2){if(manual)toast('Elegí al menos dos favoritos.');return false}
 const log=state.comparisons||[];
 const selected=window.PokePreference.pair(catalog,state);if(!selected)return false;const [a,b]=selected;
 // Automatic events never interrupt to download an image.
 if(!manual&&![a,b].every(p=>{const im=warmArt.get(p.surface?.assets?.front||p.image||fallback(p));return im?.complete&&im.naturalWidth>0})){for(const p of [a,b]){warmArtwork(p);const im=warmArt.get(p.surface?.assets?.front||p.image||fallback(p));im?.addEventListener('load',scheduleEvents,{once:true})}return false}
 const prepared=Math.random()<.5?[a,b]:[b,a];if(!manual){queuedPair=prepared;return true}queuedPair=null;inlinePair=prepared;
 $('#sheet').classList.remove('open');$('#duelsheet').classList.remove('open');render();return true;
}
function paintRefinement(){
 const n=eventSeen(),likes=Object.values(state.votes).filter(v=>v.value==='yes').length;
 scheduleEvents();
 const stage=$('#stage');stage.append(eventLayer);eventLayer.hidden=!inlinePair;
 $('#app').classList.toggle('refining',!!inlinePair);
 $('#front-refine').innerHTML=inlinePair?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 6 6 6-6 6m10-12v12"/></svg>':refineIcon;
 $('#front-refine').setAttribute('aria-label',inlinePair?'Saltar comparación':'Afinar mis favoritos');
 if(!inlinePair)return;
 for(const c of stage.querySelectorAll('.card')){if(c.activated)c.setUnder?.();c.hidden=true}
 const pairSignature=inlinePair.map(p=>p.id+':'+p.card).join('|');if(pairBox.dataset.signature===pairSignature)return;pairBox.dataset.signature=pairSignature;pairBox.replaceChildren();inlinePair.forEach((p,i)=>{const b=document.createElement('button');b.setAttribute('aria-label','Prefiero '+p.name);b.append(img(p,true));b.onclick=()=>chooseRefinement(i);pairBox.append(b)});
}
function chooseRefinement(winner){
 if(!inlinePair||inlineBusy)return;inlineBusy=true;
 const ids=inlinePair.map(p=>p.id),before=clone(state.ratings),previousSchedule=clone(state.refinementSchedule||{});
 const [a,b]=inlinePair,ra=score(a),rb=score(b),expected=1/(1+10**((rb-ra)/400)),actual=winner===2?.5:winner===0?1:0;
 for(const [p,v] of [[a,ra+28*(actual-expected)],[b,rb-28*(actual-expected)]])state.ratings[p.id]={score:v,played:(state.ratings[p.id]?.played||0)+1};
 const event={id:crypto.randomUUID(),ids,winner,time:Date.now()};
 state.comparisons=state.comparisons||[];state.comparisons.push(event);state.duels++;
 state.history.push({refinement:true,eventId:event.id,ratings:before,previousSchedule,ids});
 adaptiveBlock='';sound('like');tactile('like');
 [...pairBox.children].forEach((b,i)=>{b.classList.toggle('chosen',winner===2||winner===i);b.classList.toggle('unchosen',winner!==2&&winner!==i)});
 setTimeout(()=>finishRefinement(),reducedMotion.matches?0:150);
}
const renderDiscovery=render;render=function(){if(eventBoundary&&queuedPair&&!activeEncounter&&eventSeen()>=(state.refinementSchedule?.nextSeen||20)){inlinePair=queuedPair;queuedPair=null}renderDiscovery();paintRefinement()};
const voteDiscovery=vote;vote=function(...args){if(!inlinePair)voteDiscovery(...args)};
const undoDiscovery=$('#undo').onclick;
$('#undo').onclick=()=>{
 if(inlineBusy)return;
 if(inlinePair){inlinePair=null;state.refinementSchedule={...(state.refinementSchedule||{}),nextSeen:eventSeen()+10};render();return}
 const h=state.history.at(-1);
 if(!h?.refinement){undoDiscovery();return}
 state.history.pop();state.ratings=h.ratings;state.duels=Math.max(0,state.duels-1);state.comparisonDeleted={...(state.comparisonDeleted||{}),[h.eventId]:Date.now()};state.comparisons=(state.comparisons||[]).filter(e=>e.id!==h.eventId);state.refinementSchedule=h.previousSchedule;adaptiveBlock='';
 inlinePair=h.ids.map(id=>catalog.find(p=>p.id===id));save();render();
};
$('#both').onclick=()=>chooseRefinement(2);
$('#front-refine').onclick=()=>inlinePair?finishRefinement(true):startRefinement(true);
$('#refine-favorites').onclick=()=>startRefinement(true);
$('#duel').onclick=()=>startRefinement(true);

// One coordinator evaluates events after the gesture, image loads and restoration.
let eventTimer,eventPauseUntil=0;
function scheduleEvents(){clearTimeout(eventTimer);eventTimer=setTimeout(runEvents,210)}
function runEvents(){
 if(busy||inlinePair||document.hidden||$('.card.active')||$('.sheet.open')||document.querySelector('dialog[open]'))return;
 const n=eventSeen(),likes=Object.values(state.votes).filter(v=>v.value==='yes').length;
 
 if(n<20||likes<6||n<eventPauseUntil||n<(state.refinementSchedule?.nextSeen||20)||activeEncounter)return;
 if(!queuedPair)startRefinement(false);
}
const seenLabel=document.createElement('span');seenLabel.id='discovery-count';$('#app').append(seenLabel);
const originalRender=render;render=function(){
 originalRender();const n=eventSeen();seenLabel.textContent=n+' / '+catalog.length;seenLabel.setAttribute('aria-label',n+' de '+catalog.length+' Pokémon descubiertos');
 $('#app').classList.toggle('another-look',!!activeEncounter&&!inlinePair);
 if(!n&&!localStorage.getItem(key+'-introduced')&&!reducedMotion.matches){const c=$('#stage .card:not(.under)');c?.classList.add('first-gesture')}
};
const recordVote=vote;vote=function(value,...rest){
 if(inlinePair||busy)return;const before=eventSeen(),wasEncounter=!!current()?.reencounter;
 localStorage.setItem(key+'-introduced','1');$('#stage .first-gesture')?.classList.remove('first-gesture');
 const front=$('#stage .card:not(.under):not(.exiting)');const art=front?.querySelector('img');if(art?.complete&&art.naturalWidth)window.PokeJourney?.remember?.(front.pokemon,art);
 eventBoundary=true;try{recordVote(value,...rest)}finally{eventBoundary=false}const n=eventSeen();if(n<=before&&!wasEncounter)return;
 state.experience=state.experience||{milestones:{},metrics:{}};const xp=state.experience;xp.milestones=xp.milestones||{};xp.metrics=xp.metrics||{};
 xp.metrics.newDecisions=(xp.metrics.newDecisions||0)+(n>before?1:0);xp.metrics.startedAt=xp.metrics.startedAt||Date.now();xp.metrics.lastAt=Date.now();
 if(value==='yes'&&Object.values(state.votes).filter(v=>v.value==='yes').length%15===0){eventPauseUntil=n+8;state.refinementSchedule={...(state.refinementSchedule||{}),nextSeen:Math.max(n+8,state.refinementSchedule?.nextSeen||0),time:Date.now()}}
 const milestone=n===20||n>0&&n%50===0;
 if(milestone&&!xp.milestones[n]){xp.milestones[n]=true;seenLabel.classList.remove('discovery-milestone');void seenLabel.offsetWidth;seenLabel.classList.add('discovery-milestone');if(!wasEncounter)sound('round');}
 persist();scheduleEvents();
};
$('#stage').addEventListener('pointerdown',()=>{$('#stage .first-gesture')?.classList.remove('first-gesture')},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleEvents()});

window.PokeOpenBatch=function(ids){
 $('#open').click();showCollectionTab(true);window.PokeJourney?.compose();
 requestAnimationFrame(()=>{const tile=document.querySelector('.memory-card[data-pokemon="'+ids[0]+'"]'),section=tile?.closest('.batch-group');if(!section)return;const sheet=$('#sheet'),header=sheet.querySelector('header');sheet.scrollTo({top:sheet.scrollTop+section.getBoundingClientRect().top-sheet.getBoundingClientRect().top-(header?.getBoundingClientRect().height||50)-12,behavior:'instant'});section.classList.add('return-highlight');setTimeout(()=>section.classList.remove('return-highlight'),850)});
};

// Optional short refinement session; automatic encounters remain single choices.
let manualSession=null;
const manualIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="7" height="12" rx="2" transform="rotate(-10 6 13)"/><rect x="13" y="7" width="7" height="12" rx="2" transform="rotate(10 16 13)"/><path d="m12 2 .8 2.2L15 5l-2.2.8L12 8l-.8-2.2L9 5l2.2-.8Z"/></svg>';
const oldPaintRefinement=paintRefinement;
paintRefinement=function(){oldPaintRefinement();const b=$('#front-refine');if(manualSession){b.innerHTML='<span class="refine-dots" aria-hidden="true">'+Array.from({length:manualSession.target},(_,i)=>'<i class="'+(i<manualSession.done?'filled':'')+'"></i>').join('')+'</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';b.setAttribute('aria-label','Salir del afinador, '+manualSession.done+' de '+manualSession.target)}else if(!inlinePair)b.innerHTML=manualIcon};
function beginManualRefinement(){const count=catalog.filter(p=>state.votes[p.id]?.value==='yes').length;if(count<2){toast('Elegí al menos dos favoritos.');return}manualSession={done:0,target:Math.min(3,count*(count-1)/2),used:new Set()};startRefinement(true)}
const singleFinishRefinement=finishRefinement;
finishRefinement=function(skipped=false){if(manualSession&&!skipped){manualSession.used.add(inlinePair.map(p=>p.id).sort((a,b)=>a-b).join(':'));manualSession.done++;if(manualSession.done<manualSession.target){inlinePair=null;inlineBusy=false;startRefinement(true);return}sound('round')}manualSession=null;singleFinishRefinement(skipped)};
const singleStartRefinement=startRefinement;
startRefinement=function(manual=false){const ok=singleStartRefinement(manual);if(ok&&manualSession&&inlinePair){const likes=catalog.filter(p=>state.votes[p.id]?.value==='yes');if(manualSession.used.has(inlinePair.map(p=>p.id).sort((a,b)=>a-b).join(':'))){let replacement=null;for(let i=0;i<likes.length&&!replacement;i++)for(let j=i+1;j<likes.length;j++)if(!manualSession.used.has([likes[i].id,likes[j].id].sort((a,b)=>a-b).join(':'))){replacement=[likes[i],likes[j]];break}if(replacement){inlinePair=replacement;render()}else{manualSession=null;singleFinishRefinement()}}for(const p of inlinePair||[])warmArtwork(p)}return ok};
$('#front-refine').onclick=()=>{if(inlineBusy)return;if(inlinePair)finishRefinement(true);else beginManualRefinement()};
$('#refine-favorites').onclick=beginManualRefinement;$('#duel').onclick=beginManualRefinement;

let engineWorker=null,engineResult=null,engineTimer,engineRevision=0,engineSent=null;
function startEngine(){try{engineWorker=new Worker('/recommender.js');engineWorker.onmessage=({data})=>{if(data.error){engineWorker.terminate();engineWorker=null;return}if(data.revision!==engineRevision)return;engineResult=data;window.PokeEngineStats={computeMs:data.ms,observations:data.observations,model:'online-logistic-v1'};};engineWorker.onerror=()=>{engineWorker?.terminate();engineWorker=null};engineWorker.postMessage({type:'init',catalog:catalog.map(({id,traits,communityVotes2020})=>({id,traits,communityVotes2020})),state:(engineSent=clone(engineState())),revision:++engineRevision})}catch{engineWorker=null}}
function engineState(){return {votes:state.votes,encounters:state.encounters,comparisons:state.comparisons}}
function scheduleEngine(){clearTimeout(engineTimer);engineTimer=setTimeout(()=>{if(!engineWorker)return;const next=clone(engineState()),votes={};for(const id of new Set([...Object.keys(engineSent?.votes||{}),...Object.keys(next.votes)]))if(JSON.stringify(engineSent?.votes?.[id])!==JSON.stringify(next.votes[id]))votes[id]=next.votes[id]||null;engineWorker.postMessage({type:'delta',votes,encounters:next.encounters,comparisons:next.comparisons,revision:++engineRevision});engineSent=next},160)}

let profileDB=null,diskTimer;
async function restoreLocalProfile(){return new Promise(resolve=>{let done=false;const finish=()=>{if(!done){done=true;resolve()}};setTimeout(finish,900);try{const req=indexedDB.open('pokeamor-profiles',1);req.onupgradeneeded=()=>req.result.createObjectStore('profiles');req.onerror=finish;req.onsuccess=()=>{profileDB=req.result;if(done)return;const read=profileDB.transaction('profiles').objectStore('profiles').get(key);read.onsuccess=()=>{const record=read.result;if(record?.state&&(record.state.revision||0)>=(state.revision||0)){state=record.state;dirty=record.dirty;observedVotes=clone(state.votes);observedRatings=clone(state.ratings)}finish()};read.onerror=finish}}catch{finish()}})}
window.addEventListener('pagehide',()=>{clearTimeout(diskTimer);fallbackPersist()});

function reconcileDeck(stage,queue,flights){
 const existing=[...stage.querySelectorAll('.card:not(.exiting)')];
 const key=p=>p.id+':'+p.card;
 const take=(p,under)=>{let c=existing.find(c=>key(c.pokemon)===key(p));if(!c)c=makeCard(p,under);c.hidden=false;if(under&&c.activated)c.setUnder?.();if(!under)c.activate?.();return c};
 const front=take(queue[0],false),back=queue[1]?take(queue[1],true):null;
 for(const c of existing)if(c!==front&&c!==back){c.stopMotion?.();c.remove()}
 for(const c of stage.querySelectorAll('.exiting'))if(!flights.includes(c))c.remove();
 // insertBefore moves existing nodes without rebuilding their artwork or listeners.
 if(back)stage.insertBefore(back,stage.firstChild);
 if(front.parentElement!==stage)stage.append(front);
}
let alternateTimer;
function scheduleAlternate(){if(alternateTimer)return;alternateTimer=setTimeout(()=>{alternateTimer=null;if(!busy&&!$('.card.lifted')){const generation=alternateGeneration;const run=()=>{if(generation===alternateGeneration)prepareAlternate()};if(window.requestIdleCallback)window.requestIdleCallback(run,{timeout:1500});else setTimeout(run,250)}else scheduleAlternate()},450)}

function discoveryComplete(){return catalog.length>0&&catalog.every(p=>!!state.votes[p.id])}
function updateCompletedNavigation(){
 const complete=discoveryComplete(),button=$('#close');
 button.classList.toggle('refine-entry',complete);
 button.innerHTML=complete?manualIcon:'←';
 button.setAttribute('aria-label',complete?'Afinar mis favoritos':'Volver a las cartas');
 button.disabled=complete&&catalog.filter(p=>state.votes[p.id]?.value==='yes').length<2;
}
