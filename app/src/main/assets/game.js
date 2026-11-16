/* Геворк Бильярдинский 4.0 — TCL Android TV. Local-only, zero third-party JS libraries. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const cv = $('table'), ctx = cv.getContext('2d');
const W=1600,H=820,L=116,R=1484,T=116,B=704,RAD=15.2,POCKET_RADIUS=32;
const pockets=[[L,T],[(L+R)/2,T],[R,T],[L,B],[(L+R)/2,B],[R,B]];
const poolColors=['#ffffff','#f3c927','#2458b5','#d52e37','#7130a6','#e88c21','#287f50','#9c3d26','#141417'];
const names=['ГЕВОРКИУС','МАРИО'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(x,y)=>Math.hypot(x,y);
const unit=(x,y)=>{const d=dist(x,y)||1;return [x/d,y/d];};
const labelName=i=> names[i]+(i===1&&playerMode==='one'?' · ПК':'');
const SAVE='gevork_billiardinsky_v4', OLD_SAVE='gevork_billiardinsky_v3';
const MAX_SPIN=1;
const POCKET_NAMES=['верхняя левая','верхняя средняя','верхняя правая','нижняя левая','нижняя средняя','нижняя правая'];
let balls=[],kind='russian',playerMode='two',menuStep='players',menuPlayerMode='two',screen='menu',modal='',callbacks=[],menuIndex=0,modalIndex=0;
let active=0,groups=[null,null],scores=[0,0],phase='aim',seconds=60,angle=0,spin=0,power=0,charging=false,chargeAt=0;
let shot=null,moving=false,finished=false,selectedPocket=0,pendingCall=false,lowTick=-1,aiAt=0,aimAt=0;
let shotEffect=null,cueId=0,trainingTask=null,trainingLayout=null,trainingIndex=0,chargeAngle=0,chargeSpin=0,guideFrozen=null,aimKey='',aimKeyAt=0,aimKeyTick=0,spinKey='',spinKeyAt=0,spinKeyTick=0,spinLong=false;
let guideCache=null,guideKey='',guideLast=0,toastDeadline=0,toastText='',lastFrame=0,strokeAt=0;
let currentWorld=null,saveQueued=false,notifications=[];
let musicOn=(localStorage.getItem('gevork_music')??'1')==='1',soundsOn=(localStorage.getItem('gevork_fx')??'1')==='1',audioContext=null;
const musicFiles=['club-lounge.mp3','night-yerevan.mp3','velvet-blues.mp3','soft-jazz.mp3'];
const musicNames=['Классический лаунж','Ночной Ереван','Бархатный блюз','Мягкий джаз'];
let musicIndex=clamp(Number(localStorage.getItem('gevork_music_track')||0)||0,0,musicFiles.length-1);
let lastBallFX=0,lastRailFX=0,lastRollFX=0;
const isComputer=()=>kind!=='training'&&playerMode==='one'&&active===1;
const striker=()=>balls.find(b=>b.id===cueId)||balls.find(b=>b.on)||balls[0];
const availableRussian=()=>balls.filter(b=>b.on).sort((a,b)=>a.id-b.id);
const group=b=> b.id===0?'cue':b.id===8?'black':b.id<=7?'solid':'stripe';
const ballColor=id=>poolColors[id===0?0:id>8?id-8:id];
function audio(){try{if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();return audioContext;}catch(_){return null;}}
function chirp(freq=480,time=.07,amp=.04,shape='sine'){const a=audio();if(!a||!soundsOn)return;const o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type=shape;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(45,freq*.52),t+time);g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+time);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+time+.005);}
function noise(duration,amp,cutoff){const a=audio();if(!a||!soundsOn)return;const n=a.createBuffer(1,Math.ceil(a.sampleRate*duration),a.sampleRate),arr=n.getChannelData(0);for(let i=0;i<arr.length;i++)arr[i]=Math.random()*2-1;const s=a.createBufferSource(),lo=a.createBiquadFilter(),g=a.createGain();s.buffer=n;lo.type='lowpass';lo.frequency.value=cutoff;g.gain.setValueAtTime(amp,a.currentTime);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+duration);s.connect(lo);lo.connect(g);g.connect(a.destination);s.start();}
function fx(type,intensity=1){if(!soundsOn)return;const now=performance.now();const v=clamp(intensity,.1,1.7);
 if(type==='cue'){chirp(185,.12,.072*v,'triangle');noise(.037,.026*v,1700);}
 else if(type==='ball'&&now-lastBallFX>30){lastBallFX=now;chirp(520,.085,.057*v,'sine');chirp(900,.035,.013*v,'triangle');}
 else if(type==='rail'&&now-lastRailFX>65){lastRailFX=now;chirp(180,.11,.055*v,'triangle');noise(.055,.021*v,500);}
 else if(type==='pocket'){chirp(115,.26,.11,'triangle');noise(.18,.046,420);}
 else if(type==='roll'&&now-lastRollFX>280){lastRollFX=now;noise(.11,.012*v,290);}
 else if(type==='tick')chirp(1000,.05,.045,'sine');
 else if(type==='win'){chirp(640,.25,.07);setTimeout(()=>chirp(810,.3,.065),130);}
 else if(type==='tap')chirp(440,.045,.023);
}
function syncMusic(){
 const el=$('music');if(!el)return;
 const wanted=musicFiles[musicIndex];
 if(el.getAttribute('src')!==wanted){el.pause();el.setAttribute('src',wanted);el.load();}
 el.volume=.17;
 if(musicOn&&screen==='game'&&!modal){const p=el.play();if(p?.catch)p.catch(()=>{});}else el.pause();
}

function save(){
 if(finished||kind==='training')return;
 try{localStorage.setItem(SAVE,JSON.stringify({balls,kind,playerMode,active,groups,scores,phase,seconds,angle,spin,selectedPocket,cueId,finished:false}));}catch(_){}
}

function load(){try{
 const raw=localStorage.getItem(SAVE)||localStorage.getItem(OLD_SAVE),s=JSON.parse(raw);
 if(!s||s.finished||!Array.isArray(s.balls)||s.balls.length!==16||s.kind==='training')return false;
 kind=s.kind||'eight';playerMode=s.playerMode||'two';active=s.active||0;groups=s.groups||[null,null];scores=s.scores||[0,0];
 balls=s.balls.map(b=>({...b,vx:0,vy:0,spin:0}));cueId=kind==='russian'?(s.cueId??0):0;
 if(!striker()?.on)selectRussian(1);
 phase=s.phase==='moving'?'aim':s.phase;seconds=clamp(s.seconds||60,1,60);angle=s.angle||0;spin=s.spin||0;selectedPocket=s.selectedPocket??0;
 finished=false;charging=false;moving=false;trainingTask=null;currentWorld=null;screen='game';$('menu').classList.remove('active');$('game').classList.add('active');invalidateGuide();hud();syncMusic();
 if(isComputer())aiAt=performance.now()+1300;return true;
 }catch(e){console.warn('Save unavailable',e);return false;}}

function showMenu(){screen='menu';charging=false;moving=false;currentWorld=null;$('game').classList.remove('active');$('menu').classList.add('active');closeModal();menuStep='players';menuIndex=0;renderMenu();syncMusic();}
function menuButtons(entries){const root=$('menu-actions');root.innerHTML='';entries.forEach((e,i)=>{const b=document.createElement('button');b.type='button';b.className='action'+(i?' secondary':'');b.textContent=e[0];b.onclick=()=>{menuIndex=i;fx('tap');audio();e[1]();};root.appendChild(b);});menuIndex=clamp(menuIndex,0,entries.length-1);focusMenu();}
function renderMenu(){
 if(menuStep==='players'){
  $('menu-eyebrow').textContent='БИЛЬЯРДНЫЙ КЛУБ · 4.0';$('menu-tag').textContent='Выбери, кто играет';
  menuButtons([['1 игрок · против компьютера',()=>choosePlayers('one')],['2 игрока · на одном ТВ',()=>choosePlayers('two')],...(localStorage.getItem(SAVE)||localStorage.getItem(OLD_SAVE)?[['Продолжить прошлую партию',()=>load()]]:[]),['Правила игр',()=>rules(false)],['Звук и музыка',()=>settings(false)]]);
 }else{
  $('menu-eyebrow').textContent=menuPlayerMode==='one'?'ИГРА С КОМПЬЮТЕРОМ':'ИГРА ВДВОЁМ';$('menu-tag').textContent='Выбери вид бильярда';
  menuButtons([['Русский бильярд · свободная пирамида',()=>startGame('russian',menuPlayerMode)],['Пул · восьмёрка',()=>startGame('eight',menuPlayerMode)],['🎯 Тренировка · один точный удар',()=>startGame('training','solo')],['← Назад к выбору игроков',()=>{menuStep='players';menuIndex=0;renderMenu();}]]);
 }
}

function choosePlayers(m){menuPlayerMode=m;menuStep='games';menuIndex=0;renderMenu();}
function focusMenu(){[...$('menu-actions').querySelectorAll('button')].forEach((b,i)=>b.classList.toggle('focused',i===menuIndex));}
function focusModal(){[...$('modalActions').querySelectorAll('button')].forEach((b,i)=>b.classList.toggle('focused',i===modalIndex));}
function menuMove(dir){let list=modal?[...$('modalActions').querySelectorAll('button')]:[...$('menu-actions').querySelectorAll('button')];if(!list.length)return;if(modal){modalIndex=(modalIndex+dir+list.length)%list.length;focusModal();}else{menuIndex=(menuIndex+dir+list.length)%list.length;focusMenu();}fx('tap');}
function menuChoose(){const list=[...$('menu-actions').querySelectorAll('button')];list[menuIndex]?.click();}
function showModal(id,title,body,labels,fns,winning=false){modal=id;callbacks=fns||[];modalIndex=0;$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modalActions').innerHTML='';labels.forEach((t,i)=>{const b=document.createElement('button');b.className='action'+(i?' secondary':'');b.textContent=t;b.onclick=()=>{fx('tap');callbacks[i]?.();};$('modalActions').append(b);});$('overlay').classList.toggle('win',winning);$('overlay').classList.add('active');focusModal();syncMusic();}
function closeModal(){$('overlay').classList.remove('active');$('overlay').classList.remove('win');modal='';callbacks=[];syncMusic();}
function pause(){if(screen!=='game'||finished)return;if(modal==='pause'){closeModal();return;}if(modal)return;charging=false;power=0;showModal('pause','Пауза','<p>Время и движение шаров остановлены.</p>',['Продолжить','Правила','Звук и музыка','Новая партия','Главное меню'],[closeModal,()=>rules(true),()=>settings(true),()=>showModal('confirm','Начать заново?','<p>Текущая партия будет сброшена.</p>',['Начать заново','Назад'],[()=>startGame(kind,playerMode),()=>{closeModal();pause();}]),()=>{save();showMenu();}]);}
function rules(inGame){
 const text=`<p><b>Русский бильярд · свободная пирамида (домашний вариант).</b> Можно бить любым оставшимся шаром по любому другому. После правильного касания другого шара каждый забитый шар, включая ударный, приносит очко. Первый с 8 очками побеждает.</p>
 <p><b>Пул «восьмёрка».</b> Игроки распределяют сплошные 1–7 и полосатые 9–15 по первому законно забитому шару. После своей группы закажите одну из шести луз и забейте чёрную 8 именно туда. Преждевременная восьмёрка возвращается на стол и даёт сопернику свободный биток (домашнее правило).</p>
 <p><b>Тренировка.</b> Один удар: забить отмеченный шар в подсвеченную лузу. Удача — новое случайное решаемое задание. Промах — тот же расклад для повторной попытки. Без ограничения времени.</p>
 <p><b>Пульт:</b> ←/→ коротко — точность 0,12°, удерживай — быстрое вращение кия. В пуле ↑/↓ — накат и оттяжка; в русском ↑/↓ коротко — смена бьющего шара, удержание — накат/оттяжка. Удерживай OK для силы, отпусти для удара. Во время набора силы прицел неподвижен. «Назад» — пауза.</p>
 <p class="small">Два вектора показывают направление до первого события и следующий отскок или движение прицельного шара. Это геометрия направления, а не гарантия достижения цели при слабом ударе.</p>`;
 showModal('rules','Правила клуба',text,['Понятно'],[()=>{closeModal();if(inGame)pause();}]);
}

function settings(inGame){
 const h=`<p>Фоновая музыка: <b>${musicOn?'включена':'выключена'}</b><br>Мелодия: <b>${musicNames[musicIndex]}</b><br>Звуки игры: <b>${soundsOn?'включены':'выключены'}</b></p><p class="small">4 спокойных инструментальных оформления. Музыку и эффекты можно переключать независимо.</p>`;
 showModal('settings','Звук клуба',h,['Музыка: '+(musicOn?'выключить':'включить'),'Следующая мелодия: '+musicNames[(musicIndex+1)%musicNames.length],'Эффекты: '+(soundsOn?'выключить':'включить'),'Назад'],[
 ()=>{musicOn=!musicOn;localStorage.setItem('gevork_music',musicOn?'1':'0');settings(inGame);},
 ()=>{musicIndex=(musicIndex+1)%musicFiles.length;localStorage.setItem('gevork_music_track',''+musicIndex);settings(inGame);},
 ()=>{soundsOn=!soundsOn;localStorage.setItem('gevork_fx',soundsOn?'1':'0');settings(inGame);},
 ()=>{closeModal();if(inGame)pause();}
 ]);
}

function note(msg,ms=1700){toastText=msg;const t=$('toast');t.textContent=msg;t.classList.add('show');toastDeadline=performance.now()+ms;}
function makeBall(id,x,y){return {id,x,y,vx:0,vy:0,on:true,spin:0,roll:0};}
function rack(){balls=[makeBall(0,420,410)];const arrangement=kind==='eight'?[1,9,2,10,8,11,3,12,4,13,5,14,6,7,15]:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];let index=0;for(let row=0;row<5;row++)for(let j=0;j<=row;j++){let id=arrangement[index++];balls.push(makeBall(id,1005+row*RAD*1.77,410+(j-row/2)*(RAD*2+.4)));}}
function startGame(k,m){
 kind=k;playerMode=m;groups=[null,null];scores=[0,0];active=0;seconds=60;angle=0;spin=0;power=0;charging=false;moving=false;phase='aim';selectedPocket=0;pendingCall=false;shot=null;finished=false;currentWorld=null;cueId=0;trainingTask=null;guideFrozen=null;
 if(kind==='training'){trainingIndex=0;newTraining();}else rack();
 screen='game';$('menu').classList.remove('active');$('game').classList.add('active');closeModal();invalidateGuide();
 note(k==='eight'?'Разбивка · играем в восьмёрку':k==='russian'?'Свободная пирамида · выбери бьющий шар':'ТРЕНИРОВКА · один точный удар',2200);save();hud();syncMusic();
}

function canBlack(i){return kind==='eight'&&groups[i]!==null&&!balls.some(b=>b.on&&group(b)===groups[i]);}
function legalFirst(){return kind==='russian'?'object':canBlack(active)?'black':groups[active]||'open';}
function changeTurn(){active=1-active;seconds=60;spin=0;power=0;charging=false;lowTick=-1;selectedPocket=0;cueId=kind==='russian'&&balls.some(b=>b.on&&b.id===cueId)?cueId:0;
 if(kind==='russian'&&!striker()?.on)selectRussian(1);
 invalidateGuide();if(isComputer())aiAt=performance.now()+1200;}

function colorGroup(g){return g==='solid'?'Сплошные · 1–7':g==='stripe'?'Полосатые · 9–15':'Группы не выбраны';}
function hud(){
 if(screen!=='game')return;
 const countGroup=g=>balls.filter(b=>!b.on&&group(b)===g).length;
 for(let i=0;i<2;i++){
  const p=$('p'+i);p.classList.toggle('current',active===i&&kind!=='training');
  if(kind==='training'){
   $('n'+i).textContent=i===0?'ГЕВОРКИУС':'ТРЕНИРОВКА';$('s'+i).textContent=i===0?String(trainingIndex):'∞';
   $('t'+i).textContent=i===0?'Заданий выполнено':trainingTask?'Шар №'+trainingTask.targetId+' → луза '+(trainingTask.pocket+1):'Один удар';
   $('badge'+i).textContent=i===0?'● ТВОЙ УДАР':'';
   p.classList.toggle('current',i===0);
  }else{
   $('s'+i).textContent=kind==='russian'?scores[i]:groups[i]?countGroup(groups[i]):'0';
   $('t'+i).textContent=kind==='russian'?'Из 8 для победы':canBlack(i)?'ЗАБИТЬ ЧЁРНУЮ ВОСЬМЁРКУ':colorGroup(groups[i]);
   $('n'+i).textContent=labelName(i);$('badge'+i).textContent=active===i?'● СЕЙЧАС ХОДИТ':'';
  }
 }
 if(kind==='training'){$('time').textContent='∞';$('timer').classList.remove('low');$('timer').querySelector('.label').textContent='БЕЗ ТАЙМЕРА';}
 else{const t=Math.max(0,Math.ceil(seconds));$('time').textContent=String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');$('timer').classList.toggle('low',seconds<=10);$('timer').querySelector('.label').textContent='НА УДАР';}
 $('powerFill').style.width=(power*100).toFixed(1)+'%';
 $('spin').textContent=spin>.02?`Накат +${Math.round(spin*100)}% · после удара вперёд`:spin<-.02?`Оттяжка ${Math.round(spin*100)}% · после удара назад`:'Без вращения · накат ↑ / оттяжка ↓';
 $('status').textContent=kind==='training'?`ЗАДАНИЕ ${trainingIndex+1}: шар №${trainingTask?.targetId||1} → луза №${(trainingTask?.pocket||0)+1} · только один удар`:phase==='place'?'СВОБОДНЫЙ БИТОК · стрелки — положение · OK — подтвердить':phase==='call'?`ЗАКАЖИ ЛУЗУ №${selectedPocket+1} · ← → выбирают · OK подтвердить`:isComputer()?'МАРИО рассчитывает удар…':kind==='russian'?`БЬЁТ ШАР №${cueId+1} · ↑↓ выбрать шар / держать — вращение · ←→ быстрый прицел`:'← → быстрый прицел · ↑ ↓ вращение · OK сила';
 $('power-title').textContent=charging?'СИЛА '+Math.round(power*100)+'%':'СИЛА';
}

function freePosition(x,y,arr=balls){x=clamp(x,L+RAD+3,R-RAD-3);y=clamp(y,T+RAD+3,B-RAD-3);if(!arr.some(b=>b.on&&b.id!==0&&dist(b.x-x,b.y-y)<RAD*2+3))return[x,y];for(let d=8;d<600;d+=17)for(let a=0;a<Math.PI*2;a+=.24){const u=clamp(x+d*Math.cos(a),L+RAD+3,R-RAD-3),v=clamp(y+d*Math.sin(a),T+RAD+3,B-RAD-3);if(!arr.some(b=>b.on&&b.id!==0&&dist(b.x-u,b.y-v)<RAD*2+3))return[u,v];}return[420,410];}
function place(dx,dy){const b=balls[0],p=freePosition(b.x+dx*12,b.y+dy*12);b.x=p[0];b.y=p[1];invalidateGuide();}
function confirmPlace(){phase=canBlack(active)?'call':'aim';selectedPocket=0;seconds=60;note(phase==='call'?'Выбери лузу для восьмёрки':'Биток установлен · прицелься',1600);invalidateGuide();save();}
function choosePocket(n){selectedPocket=(selectedPocket+n+6)%6;fx('tap');}
function confirmPocket(){phase='aim';note('Заказана луза №'+(selectedPocket+1),1300);invalidateGuide();save();}
function beginCharge(){
 if(phase!=='aim'||moving||charging||modal||finished||isComputer())return;
 charging=true;chargeAt=performance.now();power=0;chargeAngle=angle;chargeSpin=spin;
 guideFrozen=prediction(performance.now());audio();
}

function shotSpeed(f){return 190+2550*Math.pow(clamp(f,0,1),.93);}
function launch(f){
 const b=striker();if(!b||!b.on||moving)return;
 const p=clamp(f,.02,1),v=shotSpeed(p),dx=Math.cos(angle),dy=Math.sin(angle);
 b.vx=dx*v;b.vy=dy*v;b.spin=spin;b.roll=0;
 shot={player:active,kind,cueId,legal:legalFirst(),blackReady:canBlack(active),call:selectedPocket,firstContact:null,railAfter:false,potted:[],pocketMap:{},blackPocket:-1,cuePocket:false};
 currentWorld={balls,shot};moving=true;phase='moving';charging=false;power=0;strokeAt=performance.now();shotEffect={x:b.x,y:b.y,a:angle};guideCache=null;guideFrozen=null;fx('cue',.4+p);
}

function release(){if(charging){const p=Math.max(power,.055);charging=false;angle=chargeAngle;spin=chargeSpin;if(screen==='game'&&!modal)launch(p);}}

function stepWorld(w,dt,isReal){const arr=w.balls,ss=w.shot;let any=false;const sub=Math.max(2,Math.ceil(dt*260)),dd=dt/sub;
 for(let st=0;st<sub;st++){
  for(let b of arr){if(!b.on)continue;const speed=dist(b.vx,b.vy);if(speed<8){b.vx=b.vy=0;continue;}any=true;
   // Wool cloth: a short slide phase followed by rolling resistance; spin fades with friction.
   const slowing=(b.id===0&&Math.abs(b.spin)>.25?255:230)*dd;
   const v=Math.max(0,speed-slowing),scale=v/speed;
   b.vx*=scale;b.vy*=scale;b.spin*=Math.exp(-.40*dd);
   b.x+=b.vx*dd;b.y+=b.vy*dd;
   let pocketIndex=-1;for(let i=0;i<6;i++)if(dist(b.x-pockets[i][0],b.y-pockets[i][1])<POCKET_RADIUS-1){pocketIndex=i;break;}
   if(pocketIndex>=0){b.on=false;b.vx=b.vy=0;ss.potted.push(b.id);if(ss.pocketMap)ss.pocketMap[b.id]=pocketIndex;if(b.id===(ss.cueId??0))ss.cuePocket=true;if(b.id===8)ss.blackPocket=pocketIndex;if(isReal)fx('pocket');continue;}
   let rail=false;const restitution=.87;
   if(b.x<L+RAD){b.x=L+RAD;b.vx=Math.abs(b.vx)*restitution;rail=true;}
   if(b.x>R-RAD){b.x=R-RAD;b.vx=-Math.abs(b.vx)*restitution;rail=true;}
   if(b.y<T+RAD){b.y=T+RAD;b.vy=Math.abs(b.vy)*restitution;rail=true;}
   if(b.y>B-RAD){b.y=B-RAD;b.vy=-Math.abs(b.vy)*restitution;rail=true;}
   if(rail){if(ss.firstContact!==null)ss.railAfter=true;if(isReal)fx('rail',clamp(speed/1500,.2,1.3));}
  }
  for(let i=0;i<arr.length;i++){const a=arr[i];if(!a.on)continue;
   for(let j=i+1;j<arr.length;j++){const b=arr[j];if(!b.on)continue;let dx=b.x-a.x,dy=b.y-a.y,d=dist(dx,dy);if(d>=RAD*2)continue;if(d<.001){dx=RAD*2;dy=0;d=RAD*2;}
    const nx=dx/d,ny=dy/d,depth=RAD*2-d;
    a.x-=nx*(depth*.50+.01);a.y-=ny*(depth*.50+.01);b.x+=nx*(depth*.50+.01);b.y+=ny*(depth*.50+.01);
    const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(rel>=0)continue;
    const restitution=.945,impulse=-(1+restitution)*rel*.5;
    a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
    const shotCue=ss.cueId??0,isCue=(a.id===shotCue||b.id===shotCue),first=isCue&&ss.firstContact===null;
    if(first){const target=a.id===shotCue?b:a;ss.firstContact=target.id;
     // Topspin/follow and backspin/draw of the cue after the FIRST object-ball impact.
     const cue=a.id===shotCue?a:b;const sign=a.id===shotCue?1:-1;
     const impact=Math.abs(rel),gain=cue.spin*impact*.52;
     cue.vx+=nx*sign*gain;cue.vy+=ny*sign*gain;
     cue.spin*=.2;
    }
    if(isReal&&-rel>40)fx('ball',clamp(-rel/850,.22,1.5));
   }
  }
 }
 return any&&arr.some(b=>b.on&&dist(b.vx,b.vy)>8);
}
function resetCue(){const cue=balls[0];cue.on=true;cue.vx=cue.vy=0;cue.spin=0;const q=freePosition(420,410);cue.x=q[0];cue.y=q[1];}
function replaceEight(){const b=balls.find(q=>q.id===8),spots=[[800,410],[860,410],[740,410],[800,470],[800,350],[680,410]];let p=spots.find(q=>!balls.some(x=>x.on&&x!==b&&dist(x.x-q[0],x.y-q[1])<RAD*2+4));if(!p)p=freePosition(800,410);b.x=p[0];b.y=p[1];b.vx=b.vy=0;b.on=true;}
function respawnBall(id){
 const b=balls.find(q=>q.id===id);if(!b)return;
 b.on=true;b.vx=b.vy=0;b.spin=0;const p=freePosition(800,410);b.x=p[0];b.y=p[1];
}
function selectRussian(direction){
 const list=availableRussian();if(!list.length)return;
 const n=list.findIndex(b=>b.id===cueId);cueId=list[(n+direction+list.length)%list.length].id;
 spin=0;invalidateGuide();
}
function win(winner){finished=true;localStorage.removeItem(SAVE);fx('win');const h='<img class="win-photo" src="dad.jpg" alt="Геворк"><p class="win-congrats"><b>Геворк Бильярдинский поздравляет '+labelName(winner)+'!</b></p><p>Играй чаще — и когда-нибудь станешь таким же мастером, как сам Геворк!</p>';
 showModal('win','ПОБЕДА · '+labelName(winner),h,['Сыграть ещё','В главное меню'],[()=>startGame(kind,playerMode),showMenu],true);}
function scoreShot(){
 moving=false;currentWorld=null;phase='aim';const ss=shot;
 if(kind==='training'){
  const success=ss.pocketMap?.[trainingTask.targetId]===trainingTask.pocket&&!ss.cuePocket;
  if(success){trainingIndex++;try{localStorage.setItem('gevork_training_best',Math.max(trainingIndex,Number(localStorage.getItem('gevork_training_best')||0)).toString());}catch(_){}
   note('МОЛОДЕЦ! · УДАР ТОЧНЫЙ · СЛЕДУЮЩЕЕ ЗАДАНИЕ',2200);newTraining();}
  else{balls=trainingLayout.map(b=>({...b,vx:0,vy:0,spin:0}));cueId=0;spin=0;note('НЕ ЗАБИЛ · ПОПРОБУЙ ЕЩЁ РАЗ',1600);}
  seconds=60;power=0;charging=false;invalidateGuide();hud();return;
 }
 const firstId=ss.firstContact;let foul=false,successful=false,message='';
 if(kind==='russian'){
  foul=firstId===null;
  if(foul){ // Respot incorrectly potted balls; there is no penalty ball-in-hand in free pyramid.
   ss.potted.forEach(id=>respawnBall(id));
   changeTurn();message='ШТРАФ · НЕ БЫЛО КАСАНИЯ';
  }else if(ss.potted.length){scores[active]+=ss.potted.length;successful=true;message='МОЛОДЕЦ';}
  else{changeTurn();message='НЕ ЗАБИЛ';}
  if(scores[active]>=8){win(active);return;}
  if(!balls.some(b=>b.on&&b.id===cueId))selectRussian(1);
 }else{
  const got=ss.potted.filter(id=>id!==0&&id!==8);
  const first=firstId===null?'none':group(balls.find(b=>b.id===firstId));
  const badFirst=first==='none'||(ss.legal==='black'&&first!=='black')||(ss.legal==='open'&&first==='black')||(ss.legal!=='open'&&ss.legal!=='black'&&first!==ss.legal);
  const badRail=!got.length&&ss.blackPocket<0&&!ss.railAfter;
  foul=ss.cuePocket||badFirst||badRail;
  if(ss.blackPocket>=0){if(ss.blackReady&&!foul&&ss.call===ss.blackPocket){win(active);return;}foul=true;replaceEight();message='ШТРАФ · восьмёрка не по правилам';}
  if(!foul&&groups[active]===null&&got.length){const g=group(balls.find(b=>b.id===got[0]));groups[active]=g;groups[1-active]=g==='solid'?'stripe':'solid';}
  successful=!foul&&got.some(id=>group(balls.find(b=>b.id===id))===groups[active]);
  if(foul){message=message||'ШТРАФ · '+(ss.cuePocket?'биток в лузе':badFirst?'неправильный первый шар':'нет борта или лузы');changeTurn();resetCue();phase='place';}
  else if(successful){message='МОЛОДЕЦ';}
  else{changeTurn();message='НЕ ЗАБИЛ';}
 }
 seconds=60;lowTick=-1;charging=false;power=0;spin=0;angle=0;
 if(phase==='aim'&&canBlack(active)){phase='call';selectedPocket=0;}
 invalidateGuide();note(message+(message==='НЕ ЗАБИЛ'?` · ХОДИТ ${labelName(active)}`:message==='МОЛОДЕЦ'?` · ${labelName(active)} ИГРАЕТ ЕЩЁ`:` · ХОДИТ ${labelName(active)}`),2000);
 if(isComputer())aiAt=performance.now()+1600;save();hud();
}

function movePhysics(dt){if(!currentWorld)return;const still=stepWorld(currentWorld,dt,true);if(still){const cue=balls[0];if(performance.now()-lastRollFX>450&&balls.some(b=>b.on&&dist(b.vx,b.vy)>130))fx('roll',.7);}else scoreShot();}
// Predict only two simple geometric segments. The predicted direction never depends on charge power.
// Physics collision centers are RAD*2 apart; cushions stop ball centers at L/R/T/B plus radius.
function traceEvent(x,y,dx,dy,mover,exclude=[]){
 const radius=RAD*2,eps=0.00001;
 let best=Infinity,event=null;
 for(const b of balls){
  if(!b.on||b.id===mover||exclude.includes(b.id))continue;
  const bx=b.x-x,by=b.y-y,proj=bx*dx+by*dy,perp2=bx*bx+by*by-proj*proj;
  if(proj<=0||perp2>=radius*radius)continue;
  const t=proj-Math.sqrt(Math.max(0,radius*radius-perp2));
  if(t>=eps&&t<best){best=t;event={type:'ball',ball:b};}
 }
 const rails=[{t:dx<0?(L+RAD-x)/dx:Infinity,nx:1,ny:0,wall:'left'},
              {t:dx>0?(R-RAD-x)/dx:Infinity,nx:-1,ny:0,wall:'right'},
              {t:dy<0?(T+RAD-y)/dy:Infinity,nx:0,ny:1,wall:'top'},
              {t:dy>0?(B-RAD-y)/dy:Infinity,nx:0,ny:-1,wall:'bottom'}];
 for(const q of rails)if(q.t>=0&&q.t<best){best=q.t;event={type:'rail',nx:q.nx,ny:q.ny,wall:q.wall};}
 // The same pocket aperture as stepWorld(): ball center enters a circle of POCKET_RADIUS-1.
 const pr=POCKET_RADIUS-1;
 for(let i=0;i<pockets.length;i++){
  const pp=pockets[i],px=pp[0]-x,py=pp[1]-y,along=px*dx+py*dy,perp2=px*px+py*py-along*along;
  if(perp2>=pr*pr||along<=0)continue;
  const t=Math.max(eps,along-Math.sqrt(Math.max(0,pr*pr-perp2)));
  if(t<best){best=t;event={type:'pocket',pocket:i};}
 }
 if(!event)return null;
 const impact=[x+dx*best,y+dy*best];
 return {...event,t:best,impact,end:event.type==='pocket'?pockets[event.pocket].slice():impact};
}
function makePrediction(){
 const c=striker();if(!c||!c.on)return null;
 const dx=Math.cos(angle),dy=Math.sin(angle),first=traceEvent(c.x,c.y,dx,dy,c.id);
 if(!first)return null;
 const firstEnd=first.end;
 let second=null,secondaryKind='',firstObj=null;
 if(first.type==='ball'){
  const hit=first.ball,n=unit(hit.x-first.impact[0],hit.y-first.impact[1]);
  const next=traceEvent(hit.x,hit.y,n[0],n[1],hit.id,[c.id]);
  if(next){second=[[hit.x,hit.y],next.end];secondaryKind='object';}
  firstObj=[hit.x,hit.y];
 }else if(first.type==='rail'){
  const rx=first.nx? -dx:dx,ry=first.ny?-dy:dy;
  const next=traceEvent(first.impact[0]+rx*.1,first.impact[1]+ry*.1,rx,ry,c.id);
  if(next){second=[first.impact,next.end];secondaryKind='rebound';}
 }
 return {primary:[[c.x,c.y],firstEnd],secondary:second,secondaryKind,firstObj,firstType:first.type,firstPocket:first.pocket??null,firstBallId:first.ball?.id??null};
}
function invalidateGuide(){guideCache=null;guideKey='';guideFrozen=null;}
function prediction(now){
 if(screen!=='game'||phase!=='aim'||isComputer()||moving||modal)return null;
 if(charging&&guideFrozen)return guideFrozen;
 const key=[Math.round(angle*100000),cueId,kind,balls.filter(b=>b.on).map(b=>`${b.id}:${Math.round(b.x*10)}:${Math.round(b.y*10)}`).join(';')].join('|');
 if(guideCache&&guideKey===key)return guideCache;
 guideLast=now;guideKey=key;guideCache=makePrediction();return guideCache;
}
// Training generator: sample a direct/angled shot, and verify its solution with the real dynamics.
// Only verified, repeatable layouts are shown to the player; same layout persists after a miss.
function trainingCandidate(){
 const index=Math.floor(Math.random()*6),pp=pockets[index],mid=[(L+R)/2,(T+B)/2],center=unit(mid[0]-pp[0],mid[1]-pp[1]);
 const angleIn=Math.atan2(center[1],center[0])+(Math.random()-.5)*.48;
 const tdir=[Math.cos(angleIn),Math.sin(angleIn)],d=175+Math.random()*190;
 const tx=pp[0]+tdir[0]*d,ty=pp[1]+tdir[1]*d;
 if(tx<L+RAD*4||tx>R-RAD*4||ty<T+RAD*4||ty>B-RAD*4)return null;
 const toward=unit(pp[0]-tx,pp[1]-ty),ghost=[tx-toward[0]*RAD*2,ty-toward[1]*RAD*2];
 const cut=(Math.random()-.5)*.17,ang=Math.atan2(toward[1],toward[0])+cut,heading=[Math.cos(ang),Math.sin(ang)],len=155+Math.random()*250;
 const cx=ghost[0]-heading[0]*len,cy=ghost[1]-heading[1]*len;
 if(cx<L+RAD*4||cx>R-RAD*4||cy<T+RAD*4||cy>B-RAD*4)return null;
 const targetId=1+Math.floor(Math.random()*7);
 const layout=[makeBall(0,cx,cy),makeBall(targetId,tx,ty)];
 // Extra balls appear off the required solution corridor; they add variety without blocking it.
 const extra=Math.floor(Math.random()*3);
 for(let j=0;j<extra;j++)for(let tr=0;tr<50;tr++){
  const x=L+75+Math.random()*(R-L-150),y=T+75+Math.random()*(B-T-150);
  const closeToGuide=(a,b,c,d)=>{const vx=c-a,vy=d-b,len2=vx*vx+vy*vy,frac=clamp(((x-a)*vx+(y-b)*vy)/len2,0,1);return dist(x-(a+frac*vx),y-(b+frac*vy))<RAD*5;};
  if(layout.some(b=>dist(x-b.x,y-b.y)<RAD*5)||closeToGuide(cx,cy,tx,ty)||closeToGuide(tx,ty,pp[0],pp[1]))continue;
  layout.push(makeBall(9+j,x,y));break;
 }
 return {layout,index,targetId,angle:Math.atan2(ghost[1]-cy,ghost[0]-cx),force:.79};
}
function validateTraining(candidate){
 const copy=candidate.layout.map(b=>({...b}));const cue=copy[0],v=shotSpeed(candidate.force);
 cue.vx=Math.cos(candidate.angle)*v;cue.vy=Math.sin(candidate.angle)*v;
 const ss={cueId:0,firstContact:null,railAfter:false,potted:[],pocketMap:{},blackPocket:-1,cuePocket:false};
 const world={balls:copy,shot:ss};
 for(let t=0;t<1350;t++){if(!stepWorld(world,1/120,false))break;}
 return ss.pocketMap[candidate.targetId]===candidate.index&&!ss.cuePocket&&ss.firstContact===candidate.targetId;
}
function newTraining(){
 let chosen=null;
 for(let k=0;k<130;k++){const c=trainingCandidate();if(c&&validateTraining(c)){chosen=c;break;}}
 if(!chosen){ // Fixed fallback, also checked using the same dynamics.
  chosen={layout:[makeBall(0,800,330),makeBall(1,800,550)],index:4,targetId:1,angle:Math.PI/2,force:.8};
  if(!validateTraining(chosen))console.warn('Training fallback requires calibration');
 }
 balls=chosen.layout.map(b=>({...b}));trainingLayout=chosen.layout.map(b=>({...b}));
 trainingTask={targetId:chosen.targetId,pocket:chosen.index,solutionAngle:chosen.angle,solutionForce:chosen.force};
 cueId=0;phase='aim';angle=0;spin=0;charging=false;power=0;seconds=60;selectedPocket=chosen.index;invalidateGuide();
}
function path(points,color,width=3,dashed=[9,7]){if(points.length<2)return;ctx.save();ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dashed);ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();ctx.restore();}
function round(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.lineWidth=2;ctx.strokeStyle=stroke;ctx.stroke();}}
function drawBall(b){const sh=ctx.createRadialGradient(b.x+5,b.y+7,2,b.x+5,b.y+7,RAD+10);sh.addColorStop(0,'#0009');sh.addColorStop(1,'#0000');ctx.beginPath();ctx.arc(b.x+5,b.y+7,RAD+10,0,Math.PI*2);ctx.fillStyle=sh;ctx.fill();ctx.save();ctx.beginPath();ctx.arc(b.x,b.y,RAD,0,2*Math.PI);ctx.clip();let gr=ctx.createRadialGradient(b.x-6,b.y-7,1,b.x,b.y,RAD+3);gr.addColorStop(0,'#fff');gr.addColorStop(.27,kind==='russian'?'#faf9ee':'#f5f1df');gr.addColorStop(1,'#a0a5a0');ctx.fillStyle=gr;ctx.fillRect(b.x-RAD,b.y-RAD,RAD*2,RAD*2);
 if((kind==='eight'||kind==='training')&&b.id!==0){ctx.fillStyle=ballColor(b.id);if(b.id>8)ctx.fillRect(b.x-RAD,b.y-RAD*.58,RAD*2,RAD*1.16);else ctx.fillRect(b.x-RAD,b.y-RAD,RAD*2,RAD*2);ctx.beginPath();ctx.arc(b.x,b.y,7.3,0,2*Math.PI);ctx.fillStyle='#fffdf3';ctx.fill();ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#171818';ctx.fillText(''+b.id,b.x,b.y+.6);}
 if(kind==='russian'){ctx.fillStyle='#806234';ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(''+(b.id+1),b.x,b.y);}
 ctx.beginPath();ctx.ellipse(b.x-6,b.y-8,4.7,2.8,-.5,0,2*Math.PI);ctx.fillStyle='#ffffff80';ctx.fill();ctx.restore();ctx.beginPath();ctx.arc(b.x,b.y,RAD,0,Math.PI*2);ctx.strokeStyle='#777a7066';ctx.lineWidth=1;ctx.stroke();}
function tableDraw(now){
 ctx.clearRect(0,0,W,H);
 round(14,16,1572,788,51,'#17100d','#664c32');round(28,30,1544,760,43,'#59391e','#b99359');round(48,50,1504,720,28,'#132f20','#0d140e');round(L-28,T-27,R-L+56,B-T+54,20,'#08452c','#a68e59');
 const g=ctx.createLinearGradient(0,T,0,B);g.addColorStop(0,'#237a4d');g.addColorStop(.5,'#17683e');g.addColorStop(1,'#105431');round(L,T,R-L,B-T,3,g);
 ctx.save();ctx.globalAlpha=.04;for(let x=L;x<R;x+=5){ctx.fillStyle='#fff';ctx.fillRect(x,T,1,B-T);}ctx.restore();
 for(let i=0;i<6;i++){const x=L+(R-L)*i/5;for(const y of [T-43,B+43]){ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();ctx.fillStyle='#d9b77c';ctx.fill();}}
 const showCall=kind==='eight'&&canBlack(active)&&(phase==='call'||phase==='aim'),showTraining=kind==='training';
 pockets.forEach((p,i)=>{
  ctx.beginPath();ctx.arc(p[0],p[1],POCKET_RADIUS,0,2*Math.PI);ctx.fillStyle='#020605';ctx.fill();ctx.lineWidth=7;ctx.strokeStyle='#745235';ctx.stroke();
  if(showCall||showTraining){
   const highlighted=showTraining?i===trainingTask?.pocket:i===selectedPocket;
   if(highlighted){const pulse=1+Math.sin(now/220)*.08;ctx.beginPath();ctx.arc(p[0],p[1],(POCKET_RADIUS+11)*pulse,0,2*Math.PI);ctx.lineWidth=6;ctx.strokeStyle=showTraining?'#8ef0ef':'#ffe087';ctx.stroke();}
   ctx.font='bold 23px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=highlighted?'#fff2ae':'#abaaa0';ctx.fillText(String(i+1),p[0],p[1]);
  }
 });
 const cue=striker();
 if(phase==='aim'&&cue?.on&&!isComputer()&&!modal){
  const pred=prediction(now);
  if(pred?.primary)path(pred.primary,'#fff1bcfa',4,[12,7]);
  if(pred?.secondary)path(pred.secondary,pred.secondaryKind==='object'?'#8ceceaf5':'#f7b979f5',3.7,[10,7]);
  if(pred?.firstObj){ctx.beginPath();ctx.arc(pred.firstObj[0],pred.firstObj[1],RAD+5,0,Math.PI*2);ctx.strokeStyle='#a2fff1a6';ctx.lineWidth=2.4;ctx.stroke();}
  if(pred?.secondary){const last=pred.secondary[1];ctx.beginPath();ctx.arc(last[0],last[1],5,0,Math.PI*2);ctx.fillStyle='#fff4c1';ctx.fill();}
 }
 if(moving&&shotEffect&&now-strokeAt<210){const t=clamp((now-strokeAt)/210,0,1),a=shotEffect.a,dx=Math.cos(a),dy=Math.sin(a);ctx.save();ctx.globalAlpha=1-t;const qx=shotEffect.x-dx*(RAD+45-45*t),qy=shotEffect.y-dy*(RAD+45-45*t);ctx.beginPath();ctx.moveTo(qx-dx*185,qy-dy*185);ctx.lineTo(qx,qy);ctx.strokeStyle='#d3a46b';ctx.lineWidth=8;ctx.lineCap='round';ctx.stroke();ctx.restore();}
 for(const b of balls)if(b.on)drawBall(b);
 if(kind==='training'&&trainingTask){
  const target=balls.find(b=>b.id===trainingTask.targetId&&b.on);
  if(target){ctx.beginPath();ctx.arc(target.x,target.y,RAD+11,0,2*Math.PI);ctx.strokeStyle='#ffcf78';ctx.lineWidth=3.4;ctx.stroke();ctx.fillStyle='#ffdf8c';ctx.font='bold 18px Arial';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText('ЦЕЛЬ',target.x,target.y-29);}
 }
 if(phase==='place'&&cue?.on){ctx.beginPath();ctx.arc(cue.x,cue.y,RAD+15,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle='#ffdb83';ctx.stroke();}
 if(phase==='aim'&&cue?.on&&!isComputer()&&!modal){
  ctx.beginPath();ctx.arc(cue.x,cue.y,RAD+11,0,2*Math.PI);ctx.lineWidth=3.2;ctx.strokeStyle='#f4cf81';ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);
  if(kind==='russian'){ctx.font='bold 16px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffe0a7';ctx.fillText('БЬЁМ',cue.x,cue.y-50);}
  if(Math.abs(spin)>.02){ctx.font='bold 17px Arial';ctx.fillStyle='#ffda8c';ctx.textAlign='center';ctx.fillText(spin>0?'НАКАТ ↑':'ОТТЯЖКА ↓',cue.x,cue.y-33);}
  const dx=Math.cos(angle),dy=Math.sin(angle),cueBack=200;
  const ex=cue.x-dx*(RAD+45+power*48),ey=cue.y-dy*(RAD+45+power*48);
  const strokeProgress=now-strokeAt<250?Math.sin(Math.PI*clamp((now-strokeAt)/250,0,1))*28:0;
  const sx=ex+dx*strokeProgress,sy=ey+dy*strokeProgress;
  ctx.beginPath();ctx.moveTo(sx-dx*cueBack+6,sy-dy*cueBack+6);ctx.lineTo(sx+6,sy+6);ctx.strokeStyle='#0008';ctx.lineWidth=12;ctx.stroke();
  const grad=ctx.createLinearGradient(sx-dx*cueBack,sy-dy*cueBack,sx,sy);grad.addColorStop(0,'#503121');grad.addColorStop(.7,'#b98d53');grad.addColorStop(1,'#eee4c7');
  ctx.beginPath();ctx.moveTo(sx-dx*cueBack,sy-dy*cueBack);ctx.lineTo(sx,sy);ctx.strokeStyle=grad;ctx.lineWidth=8;ctx.lineCap='round';ctx.stroke();ctx.lineCap='butt';
 }
}

function aiTargets(){const g=legalFirst();return balls.filter(b=>b.on&&b.id!==0&&(kind==='russian'?true:g==='open'?b.id!==8:g==='black'?b.id===8:group(b)===g));}
function lineClear(ax,ay,bx,by,exclude){const dx=bx-ax,dy=by-ay,d=dist(dx,dy);if(d<.1)return true;const ux=dx/d,uy=dy/d;return !balls.some(b=>b.on&&!exclude.includes(b.id)&&(()=>{const x=b.x-ax,y=b.y-ay,p=clamp(x*ux+y*uy,0,d);return dist(x-ux*p,y-uy*p)<RAD*2.12;})());}
function aiPlan(){
 const candidates=(kind==='russian'?availableRussian():[balls[0]]).filter(b=>b?.on);const options=[];
 for(const cue of candidates){
  for(const b of balls){if(!b.on||b.id===cue.id||(kind==='eight'&&!aiTargets().includes(b)))continue;
   for(let i=0;i<6;i++){
    const p=pockets[i],t=unit(p[0]-b.x,p[1]-b.y),ghost=[b.x-t[0]*RAD*2,b.y-t[1]*RAD*2];
    if(ghost[0]<L+RAD||ghost[0]>R-RAD||ghost[1]<T+RAD||ghost[1]>B-RAD)continue;
    if(!lineClear(cue.x,cue.y,ghost[0],ghost[1],[cue.id,b.id]))continue;
    if(!lineClear(b.x,b.y,p[0],p[1],[b.id,cue.id]))continue;
    const n=unit(ghost[0]-cue.x,ghost[1]-cue.y),cut=n[0]*t[0]+n[1]*t[1];if(cut<.45)continue;
    const dc=dist(cue.x-ghost[0],cue.y-ghost[1]),dp=dist(p[0]-b.x,p[1]-b.y);
    options.push({cueId:cue.id,angle:Math.atan2(n[1],n[0]),force:clamp(.22+dc/2400+dp/5000,.32,.87),pocket:i,quality:cut*1.9-dc/1900-dp/2000+(Math.random()-.5)*.08});
   }
  }
 }
 options.sort((a,b)=>b.quality-a.quality);
 if(options.length){const p=options[Math.random()<.78?0:Math.min(options.length-1,Math.floor(Math.random()*Math.min(options.length,4)))];return{...p,angle:p.angle+(Math.random()-.5)*(.018+Math.random()*.014)};}
 const cue=candidates[0]||balls[0],target=balls.filter(b=>b.on&&b.id!==cue.id)[0];
 return{cueId:cue.id,angle:target?Math.atan2(target.y-cue.y,target.x-cue.x)+(Math.random()-.5)*.05:0,force:.60,pocket:0};
}

function aiAction(now){if(!isComputer()||screen!=='game'||modal||moving||finished||now<aiAt)return;if(phase==='place'){const cue=balls[0];let candidate=freePosition(360,410);for(let i=0;i<12;i++){const p=freePosition(290+Math.random()*990,180+Math.random()*460);if(!balls.some(b=>b.on&&b.id!==0&&dist(b.x-p[0],b.y-p[1])<RAD*2+2)){candidate=p;break;}}cue.x=candidate[0];cue.y=candidate[1];confirmPlace();aiAt=now+800;return;}
 const plan=aiPlan();if(phase==='call'){selectedPocket=plan.pocket;confirmPocket();aiAt=now+850;return;}if(phase==='aim'){cueId=plan.cueId;angle=plan.angle;spin=(Math.random()-.5)*.25;launch(plan.force);}}
function timeUp(){if(moving||kind==='training')return;charging=false;power=0;changeTurn();phase=canBlack(active)?'call':'aim';note('ВРЕМЯ ВЫШЛО · Сейчас '+labelName(active),2100);save();}

function arrow(k){
 if(phase==='place'){if(k==='ArrowUp')place(0,-1);if(k==='ArrowDown')place(0,1);if(k==='ArrowLeft')place(-1,0);if(k==='ArrowRight')place(1,0);return;}
 if(phase==='call'){if(k==='ArrowLeft'||k==='ArrowUp')choosePocket(-1);else choosePocket(1);return;}
 if(phase!=='aim')return;
 if(k==='ArrowLeft'||k==='ArrowRight'){
  angle+=(k==='ArrowLeft'?-1:1)*(.12*Math.PI/180);angle=(angle+Math.PI*2)%(Math.PI*2);invalidateGuide();
 }else if(k==='ArrowUp'||k==='ArrowDown'){
  if(kind==='russian')return;
  spin=clamp(spin+(k==='ArrowUp'?.06:-.06),-MAX_SPIN,MAX_SPIN);invalidateGuide();
 }
}
const downKeys=new Set();
function back(){
 if(modal==='pause'){closeModal();return;}
 if(modal==='rules'||modal==='settings'){const was=screen==='game';closeModal();if(was)pause();return;}
 if(modal){closeModal();return;}
 if(screen==='game'){pause();return;}
 if(menuStep==='games'){menuStep='players';menuIndex=0;renderMenu();}
}
function keyHandler(e,down){
 const k=e.key;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','Escape','Backspace','MediaPlayPause','BrowserBack'].includes(k))e.preventDefault();
 if(!down){
  const wasHeld=downKeys.has(k);downKeys.delete(k);
  if(k==='Enter'||k===' ')release();
  if(kind==='russian'&&phase==='aim'&&screen==='game'&&!charging&&!modal&&wasHeld&&spinKey===k&&!spinLong){
   selectRussian(k==='ArrowUp'?-1:1);note('БЬЮЩИЙ ШАР №'+(cueId+1),650);
  }
  if(aimKey===k)aimKey='';if(spinKey===k){spinKey='';spinLong=false;}
  return;
 }
 if(['Escape','Backspace','MediaPlayPause','BrowserBack'].includes(k)){if(!e.repeat)back();return;}
 if(modal||screen==='menu'){
  if(k.startsWith('Arrow')){if(!e.repeat)menuMove(k==='ArrowUp'||k==='ArrowLeft'?-1:1);}
  else if((k==='Enter'||k===' ')&&!e.repeat){audio();if(modal)callbacks[modalIndex]?.();else menuChoose();}
  return;
 }
 if(screen!=='game'||moving||finished||isComputer())return;
 if(k==='Enter'||k===' '){if(e.repeat||downKeys.has(k))return;downKeys.add(k);
  if(phase==='place')confirmPlace();else if(phase==='call')confirmPocket();else beginCharge();return;
 }
 if(charging)return;
 if(k.startsWith('Arrow')){
  if(downKeys.has(k))return;
  downKeys.add(k);const now=performance.now();
  if(phase==='aim'&&(k==='ArrowLeft'||k==='ArrowRight')){aimKey=k;aimKeyAt=now;aimKeyTick=now;}
  if(phase==='aim'&&(k==='ArrowUp'||k==='ArrowDown')){spinKey=k;spinKeyAt=now;spinKeyTick=now;spinLong=false;}
  arrow(k);
 }
}
function frame(now){
 if(!lastFrame)lastFrame=now;const dt=clamp((now-lastFrame)/1000,0,.048);lastFrame=now;
 if(screen==='game'&&!modal&&!finished){
  if(charging){power=clamp((now-chargeAt)/1550,0,1);}
  else if(moving)movePhysics(dt);
  else{
   if(phase==='aim'){
    if(aimKey&&downKeys.has(aimKey)&&now-aimKeyAt>250){
     // A short tap is exactly 0.12°. Holding quickly sweeps the cue, independent of TV key-repeat rate.
     const t=(now-aimKeyAt-250)/1000,speed=42+Math.min(105,100*t); // degrees/second
     angle+=Math.PI/180*speed*dt*(aimKey==='ArrowLeft'?-1:1);
     angle=(angle+Math.PI*2)%(Math.PI*2);invalidateGuide();
    }
    if(spinKey&&downKeys.has(spinKey)&&now-spinKeyAt>(kind==='russian'?390:270)){
     spinLong=true;
     spin=clamp(spin+(spinKey==='ArrowUp'?1:-1)*dt*1.05,-MAX_SPIN,MAX_SPIN);
     invalidateGuide();
    }
   }
   if(phase==='place')for(const key of downKeys){if(key.startsWith('Arrow')){const dx=key==='ArrowLeft'?-1:key==='ArrowRight'?1:0,dy=key==='ArrowUp'?-1:key==='ArrowDown'?1:0;place(dx*dt*22,dy*dt*22);}}
   if(kind!=='training'){
    seconds-=dt;
    if(seconds<=10&&Math.ceil(seconds)!==lowTick){lowTick=Math.ceil(seconds);if(lowTick>=0)fx('tick');}
    if(seconds<=0)timeUp();else aiAction(now);
   }
  }
  hud();tableDraw(now);
  if(toastDeadline&&now>toastDeadline){$('toast').classList.remove('show');toastDeadline=0;}
 }
 requestAnimationFrame(frame);
}
window.addEventListener('keydown',e=>keyHandler(e,true),true);
window.addEventListener('keyup',e=>keyHandler(e,false),true);
window.addEventListener('blur',()=>{downKeys.clear();aimKey='';spinKey='';charging=false;power=0;guideFrozen=null;if(screen==='game'&&!modal&&!finished)pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='game'&&!modal&&!finished)pause();});
let pointerId=null;
cv.addEventListener('pointerdown',e=>{if(screen!=='game'||modal||moving||finished||isComputer())return;const rc=cv.getBoundingClientRect(),x=(e.clientX-rc.left)*W/rc.width,y=(e.clientY-rc.top)*H/rc.height,c=striker();if(phase==='place'){const p=freePosition(x,y);c.x=p[0];c.y=p[1];return;}if(phase==='call'){selectedPocket=pockets.map((p,i)=>[i,dist(p[0]-x,p[1]-y)]).sort((a,b)=>a[1]-b[1])[0][0];confirmPocket();return;}angle=Math.atan2(y-c.y,x-c.x);invalidateGuide();pointerId=e.pointerId;beginCharge();});
window.addEventListener('pointerup',e=>{if(pointerId===e.pointerId){pointerId=null;release();}});
// Small inspection hooks for deterministic automated tests; not exposed in the game UI.
window.__GEVORK_TEST__={getState:()=>({kind,playerMode,active,groups,scores,phase,seconds,angle,spin,power,charging,cueId,selectedPocket,trainingIndex,trainingTask,balls:balls.map(b=>({...b})),first:shot?.firstContact}),startGame,makePrediction,arrow,scoreShot,launch,newTraining,validateTraining,traceEvent,selectRussian,stepWorld};
requestAnimationFrame(frame);
showMenu();
})();
