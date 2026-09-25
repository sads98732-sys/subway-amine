import * as THREE from 'three';

/* ============================================================
   SUBWAY DASH — fan-made endless runner (Surfers-style)
   Original art + code. Mechanics researched via TinyFish:
   - 3 lanes, swipe/keys: left/right lane, up jump, down roll/slam
   - double-tap hoverboard = 1-hit shield
   - trains (static + oncoming), low barriers (jump),
     high barriers (roll), ramps onto train roofs, poles
   - coins in lines/arcs/roof-grids, magnet/jetpack/sneakers/2x
   - score scales with speed + multiplier (missions up to x30)
   ============================================================ */

const LANES = [-2.2, 0, 2.2];
const GRAVITY = -32;
const TRAIN_H = 2.3;
const TRAIN_W = 1.9;
// walkable ramp: footprint length, top meets train roof (topY = TRAIN_H+0.29)
const RAMP_LEN = 4.2;
const RAMP_TOP = TRAIN_H + 0.29;

// ---------- tiny helpers ----------
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand = (a,b)=>a+Math.random()*(b-a);
const randi = (a,b)=>Math.floor(rand(a,b+1));
const pick = arr=>arr[Math.floor(Math.random()*arr.length)];
const $ = id=>document.getElementById(id);

// ---------- audio (procedural, no assets) ----------
const AudioSys = {
  ctx:null,
  init(){ if(this.ctx) return; try{ this.ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} },
  beep(freq=440,dur=0.08,type='square',vol=0.12,slide=0){
    if(!this.ctx) return;
    const t=this.ctx.currentTime, o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),t+dur);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+dur+0.02);
  },
  coin(){ this.beep(1320,0.07,'square',0.07); setTimeout(()=>this.beep(1760,0.09,'square',0.06),45); },
  jump(){ this.beep(300,0.15,'sine',0.12,400); },
  roll(){ this.beep(220,0.18,'sawtooth',0.07,-120); },
  crash(){ this.beep(160,0.4,'sawtooth',0.2,-120); this.beep(70,0.5,'square',0.18,-30); },
  power(){ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.beep(f,0.12,'square',0.09),i*70)); },
  click(){ this.beep(600,0.05,'square',0.08); },
  horn(){ this.beep(180,0.5,'sawtooth',0.1,-40); },
};

// ---------- persistent bests ----------
const store = {
  get best(){ return parseInt(localStorage.getItem('sd_best')||'0'); },
  set best(v){ localStorage.setItem('sd_best', String(v)); },
  get totalCoins(){ return parseInt(localStorage.getItem('sd_coins')||'0'); },
  set totalCoins(v){ localStorage.setItem('sd_coins', String(v)); },
};

// ---------- three setup ----------
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, 130);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 300);
const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3a4a3a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
sun.position.set(-8, 18, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-15; sun.shadow.camera.right=15;
sun.shadow.camera.top=20; sun.shadow.camera.bottom=-30;
sun.shadow.camera.far=80;
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- canvas textures (graffiti etc, all original) ----------
function graffitiTexture(base, tag){
  const c=document.createElement('canvas'); c.width=256; c.height=128;
  const g=c.getContext('2d');
  g.fillStyle=base; g.fillRect(0,0,256,128);
  g.fillStyle='rgba(0,0,0,.18)';
  for(let i=0;i<6;i++) g.fillRect(0, 18+i*20, 256, 3);
  g.font='bold italic 44px Arial'; g.textAlign='center';
  g.lineWidth=8; g.strokeStyle='rgba(0,0,0,.7)'; g.strokeText(tag,128,82);
  g.fillStyle=pick(['#ffd23f','#ff5da2','#7CFC98','#4dd7ff','#ff7a3d']);
  g.fillText(tag,128,82);
  // spray dots
  for(let i=0;i<80;i++){ g.fillStyle=`rgba(255,255,255,${Math.random()*.5})`; g.fillRect(rand(0,256),rand(0,128),2,2); }
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
function buildingTexture(){
  const c=document.createElement('canvas'); c.width=128; c.height=256;
  const g=c.getContext('2d');
  const pal=['#e85d75','#4d96ff','#6bcb77','#ffd93d','#9d4edd','#ff6b35','#3dc1d3'];
  g.fillStyle=pick(pal); g.fillRect(0,0,128,256);
  g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(0,0,128,18);
  g.fillStyle='#ffe66d';
  for(let y=30;y<240;y+=26) for(let x=10;x<118;x+=24){
    g.fillStyle = Math.random()<.75 ? '#fff8c9' : '#2b2d42';
    g.fillRect(x,y,14,16);
  }
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}

// ---------- static world ----------
const world = new THREE.Group(); scene.add(world);
const groundMat = new THREE.MeshLambertMaterial({ color:0x4a4a52 });
const ballastMat = new THREE.MeshLambertMaterial({ color:0x5b5b66 });

// ground plane segments (recycled for texture scroll illusion — we keep static + move props instead)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 300), new THREE.MeshLambertMaterial({color:0x6b6f7a}));
ground.rotation.x=-Math.PI/2; ground.position.z=-100; ground.receiveShadow=true; scene.add(ground);

// track beds + rails + sleepers per lane
const trackGroup = new THREE.Group(); scene.add(trackGroup);
const railMat = new THREE.MeshStandardMaterial({ color:0xb8bec9, metalness:.7, roughness:.35 });
const sleeperMat = new THREE.MeshLambertMaterial({ color:0x3d2b1f });
for(const lx of LANES){
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 300), ballastMat);
  bed.position.set(lx, 0.02, -110); bed.receiveShadow=true; trackGroup.add(bed);
  for(const off of [-0.7, 0.7]){
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 300), railMat);
    rail.position.set(lx+off, 0.12, -110); trackGroup.add(rail);
  }
}
// sleepers (instanced-ish, simple meshes recycled)
const sleepers=[];
const sleeperGeo = new THREE.BoxGeometry(1.8, 0.08, 0.5);
for(let i=0;i<60;i++){
  for(const lx of LANES){
    const s=new THREE.Mesh(sleeperGeo, sleeperMat);
    s.position.set(lx, 0.06, 10 - i*2.2);
    trackGroup.add(s); sleepers.push(s);
  }
}

// side buildings + lamps + skyline (recycled)
const sideProps=[];
function makeBuilding(side){
  const h=rand(8,22), w=rand(5,9);
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,6),
    new THREE.MeshLambertMaterial({ map:buildingTexture() }));
  m.position.set(side*rand(10,22), h/2, rand(-140,10));
  scene.add(m); sideProps.push({mesh:m, speed:1});
}
for(let i=0;i<26;i++){ makeBuilding(i%2?1:-1); }
// lamp posts
const lampGeo = new THREE.CylinderGeometry(0.08,0.1,6,6);
const lampMat = new THREE.MeshLambertMaterial({color:0x222831});
const lampHeadMat = new THREE.MeshBasicMaterial({color:0xfff2a8});
for(let i=0;i<14;i++){
  for(const s of [-1,1]){
    const p=new THREE.Mesh(lampGeo,lampMat); p.position.set(s*5.2,3,-130+i*11); scene.add(p);
    const h=new THREE.Mesh(new THREE.SphereGeometry(0.28,8,8),lampHeadMat); h.position.set(s*5.2,6.1,-130+i*11); scene.add(h);
    sideProps.push({mesh:p,speed:1}); sideProps.push({mesh:h,speed:1});
  }
}
// clouds
const clouds=[];
for(let i=0;i<8;i++){
  const g=new THREE.Group();
  for(let j=0;j<3;j++){
    const s=new THREE.Mesh(new THREE.SphereGeometry(rand(1.5,3),8,8),
      new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.9}));
    s.position.set(j*2.2, rand(-.4,.4), 0); s.scale.y=.55; g.add(s);
  }
  g.position.set(rand(-30,30), rand(14,26), rand(-140,-20));
  scene.add(g); clouds.push(g);
}

// ---------- player ----------
function buildRunner(shirt=0xff5da2, pants=0x2b50ff, skin=0xf2b880){
  const g=new THREE.Group();
  const mat = c=>new THREE.MeshLambertMaterial({color:c});
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.8,0.42), mat(shirt));
  torso.position.y=1.25; torso.castShadow=true; g.add(torso); g.userData.torso=torso;
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5), mat(skin));
  head.position.y=1.95; head.castShadow=true; g.add(head); g.userData.head=head;
  const cap=new THREE.Mesh(new THREE.BoxGeometry(0.54,0.16,0.54), mat(0xe63946));
  cap.position.y=2.24; g.add(cap);
  const brim=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.06,0.3), mat(0xe63946));
  brim.position.set(0,2.18,-0.4); g.add(brim);
  const pack=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.55,0.22), mat(0x27ae60));
  pack.position.set(0,1.3,0.32); g.add(pack);
  const legL=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.85,0.3), mat(pants));
  legL.geometry.translate(0,-0.42,0); legL.position.set(-0.19,0.85,0); legL.castShadow=true; g.add(legL);
  const legR=legL.clone(); legR.position.x=0.19; g.add(legR);
  const armL=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.7,0.24), mat(shirt));
  armL.geometry.translate(0,-0.35,0); armL.position.set(-0.5,1.6,0); armL.castShadow=true; g.add(armL);
  const armR=armL.clone(); armR.position.x=0.5; g.add(armR);
  g.userData={...g.userData, legL, legR, armL, armR};
  // hoverboard
  const board=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.1,1.3),
    new THREE.MeshStandardMaterial({color:0xffd23f, emissive:0x7a5b00, emissiveIntensity:.5, metalness:.4, roughness:.4}));
  board.position.y=0.12; board.visible=false; board.castShadow=true; g.add(board); g.userData.board=board;
  // jetpack
  const jet=new THREE.Group();
  const jm=new THREE.MeshStandardMaterial({color:0x888899, metalness:.7, roughness:.3});
  for(const s of [-1,1]){
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.7,10), jm);
    tank.position.set(s*0.28,1.35,0.42); jet.add(tank);
    const flame=new THREE.Mesh(new THREE.ConeGeometry(0.13,0.7,8),
      new THREE.MeshBasicMaterial({color:s<0?0x4dd7ff:0xff9d00}));
    flame.position.set(s*0.28,0.65,0.42); flame.rotation.x=Math.PI; jet.add(flame);
    jet.userData['flame'+s]=flame;
  }
  jet.visible=false; g.add(jet); g.userData.jet=jet;
  return g;
}
const player = buildRunner();
scene.add(player);

// guard + dog (chaser)
const guard = buildRunner(0x1d3557, 0x111111, 0xe0a070);
guard.scale.setScalar(1.18); guard.position.set(0,0,4.5); guard.visible=false; scene.add(guard);
const dog = new THREE.Group();
{
  const m=new THREE.MeshLambertMaterial({color:0x8b5e34});
  const b=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.4,0.9),m); b.position.y=0.5; b.castShadow=true; dog.add(b);
  const h=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.34,0.36),m); h.position.set(0,0.85,-0.5); dog.add(h);
  dog.position.set(0.8,0,4.8); dog.visible=false; scene.add(dog);
}

// ---------- entity factories ----------
const TRAIN_COLORS = [
  ['#e63946','TURBO'], ['#2a9d8f','METRO'], ['#f4a261','RAPID'],
  ['#9d4edd','GRAFF'], ['#118ab2','CITY'], ['#ef476f','DASH'],
];
function makeTrain(len=12){
  const [base,tag]=pick(TRAIN_COLORS);
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W,TRAIN_H,len),
    new THREE.MeshLambertMaterial({ map:graffitiTexture(base,tag) }));
  body.position.y=TRAIN_H/2+0.1; body.castShadow=true; body.receiveShadow=true; g.add(body);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W+0.15,0.18,len+0.2),
    new THREE.MeshLambertMaterial({color:0x2b2d42}));
  roof.position.y=TRAIN_H+0.2; roof.castShadow=true; g.add(roof);
  const front=new THREE.Mesh(new THREE.BoxGeometry(TRAIN_W-0.2,1.4,0.4),
    new THREE.MeshLambertMaterial({color:0x111111}));
  front.position.set(0,1.0,len/2+0.1); g.add(front);
  const light=new THREE.Mesh(new THREE.SphereGeometry(0.14,8,8), new THREE.MeshBasicMaterial({color:0xfff200}));
  light.position.set(0,1.7,len/2+0.32); g.add(light);
  // wheels/bogies
  const wm=new THREE.MeshLambertMaterial({color:0x111111});
  for(let z=-len/2+1.5; z<len/2; z+=4){
    const w=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.5,1.2),wm);
    w.position.set(0,0.3,z); g.add(w);
  }
  g.userData={ kind:'train', len, w:TRAIN_W, h:TRAIN_H+0.25, moving:false, topY:TRAIN_H+0.29 };
  return g;
}
function makeBarrierLow(){
  const g=new THREE.Group();
  const stripe=document.createElement('canvas'); stripe.width=64; stripe.height=16;
  const sg=stripe.getContext('2d');
  sg.fillStyle='#ffbe0b'; sg.fillRect(0,0,64,16);
  sg.fillStyle='#111'; for(let i=-16;i<64;i+=16){ sg.beginPath(); sg.moveTo(i,16); sg.lineTo(i+8,0); sg.lineTo(i+16,0); sg.lineTo(i+8,16); sg.fill(); }
  const st=new THREE.CanvasTexture(stripe); st.colorSpace=THREE.SRGBColorSpace;
  st.wrapS=THREE.RepeatWrapping; st.repeat.x=3;
  const bar=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.55,0.35),
    new THREE.MeshLambertMaterial({map:st}));
  bar.position.y=0.75; bar.castShadow=true; g.add(bar);
  for(const s of [-1,1]){
    const leg=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.75,0.3), new THREE.MeshLambertMaterial({color:0x333333}));
    leg.position.set(s*0.9,0.38,0); g.add(leg);
  }
  g.userData={kind:'low', len:0.6, w:2.0, h:1.05, jumpOver:0.85};
  return g;
}
function makeBarrierHigh(){
  const g=new THREE.Group();
  const sign=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.9,0.3),
    new THREE.MeshLambertMaterial({color:0x06d6a0}));
  sign.position.y=1.85; sign.castShadow=true; g.add(sign);
  const txt=document.createElement('canvas'); txt.width=128; txt.height=48;
  const tg=txt.getContext('2d'); tg.fillStyle='#06d6a0'; tg.fillRect(0,0,128,48);
  tg.font='bold 26px Arial'; tg.textAlign='center'; tg.fillStyle='#073b4c'; tg.fillText('▼ ROLL ▼',64,33);
  const tt=new THREE.CanvasTexture(txt); tt.colorSpace=THREE.SRGBColorSpace;
  sign.material.map=tt;
  for(const s of [-1,1]){
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,2.4,8),
      new THREE.MeshLambertMaterial({color:0x444444}));
    pole.position.set(s*0.9,1.2,0); g.add(pole);
  }
  g.userData={kind:'high', len:0.6, w:2.0, mustRoll:true, h:2.3};
  return g;
}
function makePole(){
  const g=new THREE.Group();
  const p=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,3.2,8),
    new THREE.MeshLambertMaterial({color:0x2ec4b6}));
  p.position.y=1.6; p.castShadow=true; g.add(p);
  const sig=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.3),
    new THREE.MeshBasicMaterial({color:0xff0000}));
  sig.position.y=3.0; g.add(sig); g.userData.signal=sig;
  g.userData={kind:'block', len:0.6, w:0.6, h:3.2, signal:sig};
  return g;
}
function makeRamp(){
  // Walkable wedge: LOW edge faces the player (+z, arrives first),
  // rising toward the train (-z) with the top lip flush with the roof.
  const g=new THREE.Group();
  const slopeLen=Math.sqrt(RAMP_LEN*RAMP_LEN+RAMP_TOP*RAMP_TOP);
  const ang=Math.atan2(RAMP_TOP, RAMP_LEN); // >0 => +z end low, -z end high
  // striped deck (direction-neutral rungs so mirroring can't confuse it)
  const c=document.createElement('canvas'); c.width=64; c.height=128;
  const sg=c.getContext('2d');
  sg.fillStyle='#ffd23f'; sg.fillRect(0,0,64,128);
  sg.fillStyle='#111111';
  for(let y=8;y<128;y+=24) sg.fillRect(0,y,64,9);
  const stripeTex=new THREE.CanvasTexture(c); stripeTex.colorSpace=THREE.SRGBColorSpace;
  const deck=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.18,slopeLen),
    new THREE.MeshLambertMaterial({map:stripeTex}));
  deck.position.set(0, RAMP_TOP/2, 0);
  deck.rotation.x=ang;
  deck.castShadow=true; deck.receiveShadow=true; g.add(deck);
  // dark side skirts sell the wedge silhouette
  for(const s of [-1,1]){
    const skirt=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.6,slopeLen),
      new THREE.MeshLambertMaterial({color:0x333333}));
    skirt.position.set(s*0.95, RAMP_TOP/2-0.25, 0);
    skirt.rotation.x=ang; g.add(skirt);
  }
  // foot block under the LOW (player-side, +z) entry lip
  const foot=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.3,0.5),
    new THREE.MeshLambertMaterial({color:0x333333}));
  foot.position.set(0,0.15,RAMP_LEN/2-0.2); foot.castShadow=true; g.add(foot);
  g.userData={kind:'ramp', len:RAMP_LEN, w:1.8, top:RAMP_TOP};
  return g;
}
const coinGeo = new THREE.CylinderGeometry(0.42,0.42,0.12,18);
const coinMat = new THREE.MeshStandardMaterial({color:0xffd23f, metalness:.65, roughness:.25, emissive:0x6b4e00, emissiveIntensity:.45});
function makeCoin(){
  const m=new THREE.Mesh(coinGeo, coinMat);
  m.rotation.z=Math.PI/2; m.castShadow=true;
  m.userData={kind:'coin'};
  return m;
}
const POWER_DEFS = {
  magnet:{ color:0xff3b3b, label:'🧲', name:'MAGNET!' },
  jetpack:{ color:0x4dd7ff, label:'🚀', name:'JETPACK!' },
  sneakers:{ color:0x7CFC98, label:'👟', name:'SUPER SNEAKERS!' },
  star:{ color:0xffd23f, label:'⭐', name:'2x SCORE!' },
  board:{ color:0xff8c00, label:'🛹', name:'HOVERBOARD!' },
};
function makePowerup(type){
  const d=POWER_DEFS[type];
  const g=new THREE.Group();
  const box=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.8,0.8),
    new THREE.MeshStandardMaterial({color:d.color, emissive:d.color, emissiveIntensity:.35, roughness:.3}));
  box.castShadow=true; g.add(box);
  // floating label sprite
  const c=document.createElement('canvas'); c.width=c.height=64;
  const ctx=c.getContext('2d'); ctx.font='44px serif'; ctx.textAlign='center'; ctx.fillText(d.label,32,50);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c), transparent:true}));
  sp.scale.setScalar(0.9); sp.position.y=0.85; g.add(sp);
  g.userData={kind:'power', ptype:type, len:1, w:1, h:2, box};
  g.position.y=1.0;
  return g;
}

// ---------- game state ----------
const G = {
  state:'menu', // menu | countdown | run | over | pause
  speed:12, baseSpeed:12, maxSpeed:30,
  lane:1, x:0, y:0, vy:0, grounded:true, rolling:0, rollDur:0.72,
  onTrainTop:false,
  score:0, coins:0, keys:2, boards:1,
  mult:1, starT:0, magnetT:0, sneakT:0, jetT:0, boardT:0, shield:false,
  invinc:0, distance:0, nextSpawnZ:-40,
  jumps:0, rolls:0,
  missions:[
    { id:'coins', text:'Collect 150 coins', target:150, prog:0 },
    { id:'jump', text:'Jump 25 times', target:25, prog:0 },
    { id:'roll', text:'Roll 25 times', target:25, prog:0 },
  ],
  missionLevel:0,
  runCoins:0,
  time:0,
  dead:false,
};
const entities=[]; // {mesh, ...}

function toast(msg, ms=1400){
  const t=$('toast'); t.textContent=msg; t.classList.remove('hidden');
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.add('hidden'), ms);
}

// ---------- spawning ----------
function addEntity(mesh, lane, z){
  mesh.position.x = LANES[lane];
  mesh.position.z = z;
  scene.add(mesh);
  entities.push(mesh);
  return mesh;
}
function coinLine(lane, z, n=6, y=1.0, gap=2.0){
  for(let i=0;i<n;i++){
    const c=makeCoin(); c.position.set(LANES[lane], y, z - i*gap);
    c.userData.spin=rand(0,6); scene.add(c); entities.push(c);
  }
}
function coinArc(lane, z){
  const ys=[1.0,1.9,2.5,2.5,1.9,1.0];
  ys.forEach((y,i)=>{ const c=makeCoin(); c.position.set(LANES[lane],y,z-i*2.0); c.userData.spin=rand(0,6); scene.add(c); entities.push(c); });
}
function coinRoof(lane, z, len){
  const n=Math.floor(len/2.2);
  for(let i=0;i<n;i++){ const c=makeCoin(); c.position.set(LANES[lane],TRAIN_H+1.1,z-i*2.2); c.userData.spin=rand(0,6); scene.add(c); entities.push(c); }
}
function coinSkyRow(z, n=8){
  for(let i=0;i<n;i++) for(const l of [0,1,2]){
    const c=makeCoin(); c.position.set(LANES[l], 6+Math.sin(i*.7)*0.5, z-i*2.4);
    c.userData.spin=rand(0,6); scene.add(c); entities.push(c);
  }
}

function spawnPattern(z){
  const d = G.distance; // difficulty
  const roll = Math.random();
  const freeLane = randi(0,2);

  // early game: gentle
  if(d < 150){
    const r=Math.random();
    if(r<.3){ addEntity(makeBarrierLow(), randi(0,2), z); coinArc(freeLane, z-2); }
    else if(r<.5){ addEntity(makeBarrierHigh(), randi(0,2), z); coinLine(freeLane, z, 6); }
    else if(r<.7){ addEntity(makeTrain(randi(6,10)), randi(0,2), z-4); coinLine((randi(0,2)), z, 5); }
    else { coinLine(randi(0,2), z, 8); }
    return z - rand(22,30);
  }

  if(roll < 0.16){
    // long trains on 2 lanes + ramp on the third so you can ride the roof
    const lanes=[0,1,2];
    const rideLane=randi(0,2);
    const len=rand(12,22);
    for(const l of lanes){
      if(l===rideLane) continue;
      const t=makeTrain(len); addEntity(t, l, z-len/2);
      if(Math.random()<.6) coinRoof(l, z-2, len-3);
    }
    const train=makeTrain(len); addEntity(train, rideLane, z-len/2-4);
    // ramp sits flush against the train's near end so you run straight up onto the roof
    const trainNear=(z-len/2-4)+len/2; // == z-4
    const rampZ=trainNear+RAMP_LEN/2-0.3;
    const ramp=makeRamp(); addEntity(ramp, rideLane, rampZ);
    // coin trail guiding up the slope
    for(let i=0;i<5;i++){
      const frac=(i+0.5)/5;
      const c=makeCoin();
      c.position.set(LANES[rideLane], frac*RAMP_TOP+0.8, rampZ+RAMP_LEN/2-frac*RAMP_LEN);
      c.userData.spin=rand(0,6); scene.add(c); entities.push(c);
    }
    coinRoof(rideLane, z-6, len-3);
    coinLine(rideLane, z+10, 4);
    return z - len - rand(20,28);
  }
  if(roll < 0.32){
    // oncoming train with warning
    const l=randi(0,2);
    const t=makeTrain(rand(10,16)); t.userData.moving=true; addEntity(t, l, z-8);
    AudioSys.horn();
    for(let k=0;k<3;k++){ if(k!==l) coinLine(k, z-4-k*2, 5); }
    const b=Math.random()<.5?makeBarrierLow():makeBarrierHigh();
    addEntity(b, pick([0,1,2].filter(x=>x!==l)), z-14);
    return z - rand(30,38);
  }
  if(roll < 0.48){
    // full-width barrier wall with one gap
    const gap=randi(0,2);
    for(let l=0;l<3;l++){
      if(l===gap) continue;
      addEntity(Math.random()<.5?makeBarrierLow():makeBarrierHigh(), l, z);
    }
    coinArc(gap, z+2);
    if(Math.random()<.35){ const p=makePowerup(pick(['magnet','sneakers','star','board'])); addEntity(p, gap, z-10); }
    return z - rand(20,26);
  }
  if(roll < 0.60){
    // slalom poles
    for(let i=0;i<4;i++){
      addEntity(makePole(), (freeLane+i)%3===freeLane?(freeLane+1)%3:(freeLane+i)%3, z-i*8);
      coinLine((freeLane+i+1)%3, z-i*8, 3);
    }
    return z - 38;
  }
  if(roll < 0.72){
    // jump arcs over low barriers
    const l=randi(0,2);
    addEntity(makeBarrierLow(), l, z);
    addEntity(makeBarrierLow(), l, z-9);
    coinArc(l, z+2);
    coinLine((l+1)%3, z-4, 6);
    return z - rand(24,30);
  }
  if(roll < 0.82){
    // roll tunnel row
    for(let l=0;l<3;l++) addEntity(makeBarrierHigh(), l, z);
    coinLine(randi(0,2), z+1, 5, 0.6);
    return z - rand(20,26);
  }
  if(roll < 0.90){
    // power-up alley
    const p=makePowerup(pick(['magnet','jetpack','sneakers','star','board']));
    addEntity(p, randi(0,2), z);
    coinLine(randi(0,2), z-6, 8);
    addEntity(makeTrain(randi(8,14)), randi(0,2), z-20);
    return z - rand(28,34);
  }
  // staggered trains — fairness rule: max TWO train lanes at once, the third
  // lane is always a guaranteed escape route (coins + occasional hop/roll barrier)
  const gapLane=randi(0,2);
  for(let l=0;l<3;l++){
    if(l===gapLane) continue;
    const t=makeTrain(rand(7,13)); addEntity(t, l, z-rand(0,8));
    if(Math.random()<.5) coinRoof(l, z-4, 7);
  }
  coinLine(gapLane, z, 8);
  if(Math.random()<.4) addEntity(Math.random()<.5?makeBarrierLow():makeBarrierHigh(), gapLane, z-16);
  return z - rand(26,34);
}

// ---------- missions / multiplier ----------
function renderMissions(){
  $('missions').innerHTML = G.missions.map(m=>
    `<div class="mission ${m.prog>=m.target?'done':''}">${m.prog>=m.target?'✓ ':''}${m.text} (${Math.min(m.prog,m.target)}/${m.target})</div>`
  ).join('');
}
function missionProg(id, n=1){
  for(const m of G.missions){
    if(m.id===id && m.prog<m.target){
      m.prog+=n;
      if(m.prog>=m.target){
        G.mult=Math.min(30, G.mult+1);
        toast(`MISSION COMPLETE! Multiplier x${G.mult}`);
        AudioSys.power();
      }
    }
  }
  renderMissions();
}
function resetMissions(){
  G.mult=1; G.missionLevel=0;
  G.missions=[
    { id:'coins', text:'Collect 100 coins', target:100, prog:0 },
    { id:'jump', text:'Jump 20 times', target:20, prog:0 },
    { id:'roll', text:'Roll 20 times', target:20, prog:0 },
  ];
  const harder=[
    { id:'coins', text:'Collect 300 coins', target:300, prog:0 },
    { id:'jump', text:'Jump 40 times', target:40, prog:0 },
    { id:'roll', text:'Roll 40 times', target:40, prog:0 },
    { id:'coins', text:'Collect 600 coins', target:600, prog:0 },
  ];
  G._harder=harder; renderMissions();
}
function maybeNextMissionSet(){
  if(G.missions.every(m=>m.prog>=m.target) && G._harder && G._harder.length){
    G.missions = [G._harder.shift(), G._harder.shift()||{id:'coins',text:'Collect 500 coins',target:500,prog:0}, G._harder.shift()||{id:'jump',text:'Jump 60 times',target:60,prog:0}];
    renderMissions();
  }
}

// lay a sky-coin trail covering the whole jetpack flight, and clear the
// ground coins ahead that would be unreachable while flying at y=6
function seedSkyCoins(){
  for(let i=entities.length-1;i>=0;i--){
    const e=entities[i];
    if(e.userData.kind==='coin' && e.position.z<-4 && e.position.z>-115){
      scene.remove(e); entities.splice(i,1);
    }
  }
  const flightDist=G.speed*6+70;
  for(let zz=-2; zz>-flightDist; zz-=16) coinSkyRow(zz, 6);
}

// ---------- power-ups ----------
function activatePower(type){
  AudioSys.power();
  if(type==='magnet'){ G.magnetT=8; toast('🧲 MAGNET!'); }
  if(type==='jetpack'){
    G.jetT=6; G.vy=0; G.grounded=false;
    seedSkyCoins();
    toast('🚀 JETPACK!');
  }
  if(type==='sneakers'){ G.sneakT=9; toast('👟 SUPER SNEAKERS!'); }
  if(type==='star'){ G.starT=8; toast('⭐ 2x SCORE!'); }
  if(type==='board'){ G.boards++; toast('🛹 +1 HOVERBOARD!'); updateBoardUI(); }
  renderTimers();
}
function useBoard(){
  if(G.state!=='run') return;
  if(G.boardT>0 || G.boards<=0){ if(G.boards<=0) toast('No hoverboards! Grab one 🛹'); return; }
  G.boards--; G.boardT=12; G.shield=true;
  player.userData.board.visible=true;
  toast('🛹 HOVERBOARD — crash shield ON!');
  AudioSys.power(); updateBoardUI(); renderTimers();
}
function updateBoardUI(){ $('board-count').textContent=G.boards; $('keys').textContent=G.keys; }
function renderTimers(){
  const el=$('power-timers'); let h='';
  if(G.magnetT>0) h+=`<div class="ptimer">🧲 ${G.magnetT.toFixed(0)}s</div>`;
  if(G.jetT>0) h+=`<div class="ptimer">🚀 ${G.jetT.toFixed(0)}s</div>`;
  if(G.sneakT>0) h+=`<div class="ptimer">👟 ${G.sneakT.toFixed(0)}s</div>`;
  if(G.starT>0) h+=`<div class="ptimer">⭐ ${G.starT.toFixed(0)}s</div>`;
  if(G.boardT>0) h+=`<div class="ptimer">🛹 ${G.boardT.toFixed(0)}s</div>`;
  el.innerHTML=h;
}

// ---------- actions ----------
function doJump(){
  if(G.state!=='run') return;
  if(G.jetT>0) return;
  if(G.grounded){
    G.vy = G.sneakT>0 ? 13.5 : 10;
    G.grounded=false; G.onTrainTop=false;
    G.jumps++; missionProg('jump'); maybeNextMissionSet();
    AudioSys.jump();
  }
}
function doRoll(){
  if(G.state!=='run') return;
  if(G.jetT>0) return;
  if(!G.grounded){
    // slam: cancel jump, fast fall into roll (like the original)
    G.vy=Math.min(G.vy,-22);
  }
  if(G.rolling<=0){
    G.rolling=G.rollDur; G.rolls++; missionProg('roll'); maybeNextMissionSet();
    AudioSys.roll();
  } else G.rolling=G.rollDur; // extend
}

// ---------- collisions ----------
function playerBox(){
  const h = G.rolling>0 ? 0.9 : 1.9;
  return { x:G.x, y:G.y + h/2, z:0, hw:0.42, hh:h/2, len:0.7 };
}
function overlap(a, b){ // a player box, b entity box at z
  return Math.abs(a.x-b.x) < (a.hw+b.hw) &&
         Math.abs(a.z-b.z) < (a.len/2 + b.len/2) &&
         (a.y-a.hh) < b.top && (a.y+a.hh) > b.bottom;
}
function groundAt(x, y){
  let g=0;
  for(const e of entities){
    const u=e.userData;
    if(u.kind==='train'){
      // 1.15 (not 1.0) so adjacent train roofs overlap: switching lanes
      // across roofs can never dip into a "dead zone" and side-swipe
      if(Math.abs(e.position.z) < u.len/2+0.6 && Math.abs(x-e.position.x) < 1.15){
        if(y >= u.topY-0.55) g=Math.max(g, u.topY);
      }
    } else if(u.kind==='ramp'){
      // sloped support: low at player-side edge, high at train-side edge.
      // Ramp centre dz goes -half (first touch, h=0) -> +half (h=top)
      // as the world slides it under the player.
      const half=u.len/2, dz=e.position.z;
      if(Math.abs(dz) < half+0.8 && Math.abs(x-e.position.x) < 1.0){
        const t=clamp((half-dz)/u.len, 0, 1);
        const h=(1-t)*u.top;
        if(y >= h-0.6) g=Math.max(g, h);
      }
    }
  }
  return g;
}

let hitCooldown=0;
function checkCollisions(dt){
  if(G.invinc>0 || G.dead) return;
  const pb=playerBox();

  // coins + powers first (generous pickup)
  for(let i=entities.length-1;i>=0;i--){
    const e=entities[i], u=e.userData;
    if(u.kind==='coin'){
      let dx=e.position.x-G.x, dy=e.position.y-(G.y+1.0), dz=e.position.z;
      const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(G.magnetT>0 && dist<9 && G.jetT<=0){
        e.position.x += (G.x-e.position.x)*Math.min(1,dt*10);
        e.position.y += ((G.y+1.0)-e.position.y)*Math.min(1,dt*10);
        e.position.z += (0-e.position.z)*Math.min(1,dt*6);
      }
      if(dist<1.15){
        scene.remove(e); entities.splice(i,1);
        G.coins++; G.runCoins++; missionProg('coins'); maybeNextMissionSet();
        AudioSys.coin();
      }
    } else if(u.kind==='power'){
      if(Math.abs(e.position.z)<1.2 && Math.abs(e.position.x-G.x)<1.1 && (G.y+1)<3.2){
        const t=u.ptype; scene.remove(e); entities.splice(i,1);
        activatePower(t);
      }
    }
  }

  if(G.jetT>0) return; // flying above everything

  for(let i=entities.length-1;i>=0;i--){
    const e=entities[i], u=e.userData;
    if(u.kind==='coin'||u.kind==='power') continue;
    const dz=e.position.z;
    if(Math.abs(dz)>3) continue;
    const ex=e.position.x;

    // ramps are walkable ground (handled by groundAt) — never a collider
    if(u.kind==='ramp') continue;
    if(u.kind==='low'){
      const box={x:ex, top:1.05, bottom:0, hw:1.0, len:0.6, z:dz};
      if(overlap(pb,box)){
        // must be airborne above bar
        if((G.y) < 0.75) return die('tripped on a barrier!');
      }
      continue;
    }
    if(u.kind==='high'){
      const rolling = G.rolling>0;
      // sign occupies y 1.4..2.3 ; roll height 0.9 fits under
      const headY = G.y + (rolling?0.9:1.9);
      if(Math.abs(dz)<0.9 && Math.abs(ex-G.x)<1.0 && headY>1.35){
        return die('slammed into an overhead sign!');
      }
      continue;
    }
    if(u.kind==='train' || u.kind==='block'){
      const top = u.kind==='train' ? u.topY : u.h;
      const standingOnTop = u.kind==='train' && G.y >= top-0.55;
      if(standingOnTop) continue; // safely on the roof
      const box={x:ex, top, bottom:0, hw:(u.w||1.9)/2, len:u.len||0.6, z:dz};
      if(overlap(pb,box)) return die(u.kind==='train'?'hit a train!':'ran into a signal!');
    }
  }
}

function die(why){
  if(G.shield || G.boardT>0){
    // hoverboard saves you: smash through
    G.shield=false;
    if(G.boardT>0){ G.boardT=0; player.userData.board.visible=false; }
    G.invinc=2;
    // clear nearby killers
    for(let i=entities.length-1;i>=0;i--){
      const e=entities[i];
      if(Math.abs(e.position.z)<6 && (e.userData.kind==='train'||e.userData.kind==='block'||e.userData.kind==='low'||e.userData.kind==='high')){
        scene.remove(e); entities.splice(i,1);
      }
    }
    toast('🛹 BOARD SAVED YOU!');
    AudioSys.crash(); renderTimers();
    const f=$('stumble-flash'); f.style.opacity=1; setTimeout(()=>f.style.opacity=0,250);
    return;
  }
  AudioSys.crash();
  G.dead=true; G.state='over';
  guard.visible=true; dog.visible=true;
  setTimeout(()=>showGameOver(why), 900);
}

// ---------- flow ----------
function clearEntities(){
  for(const e of entities) scene.remove(e);
  entities.length=0;
}
function startRun(){
  AudioSys.init(); AudioSys.click();
  clearEntities();
  Object.assign(G,{ state:'countdown', speed:G.baseSpeed, lane:1, x:0, y:0, vy:0,
    grounded:true, rolling:0, score:0, coins:0, runCoins:0, starT:0, magnetT:0, sneakT:0,
    jetT:0, boardT:0, shield:false, invinc:0, distance:0, dead:false, jumps:0, rolls:0,
    keys:G.keys, boards:Math.max(1,G.boards), time:0, nextSpawnZ:-40 });
  resetMissions();
  player.userData.board.visible=false; player.userData.jet.visible=false;
  guard.visible=true; dog.visible=true; guard.position.set(0,0,4.5); dog.position.set(0.8,0,4.8);
  $('menu').classList.add('hidden'); $('gameover').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  updateBoardUI(); renderTimers(); renderMissions();
  // countdown 3-2-1-GO with inspector chase intro
  const cd=$('countdown'); cd.classList.remove('hidden');
  let n=3; cd.textContent=n;
  const iv=setInterval(()=>{
    n--;
    if(n<=0){ clearInterval(iv); cd.textContent='GO!'; AudioSys.power();
      setTimeout(()=>{ cd.classList.add('hidden'); G.state='run'; }, 500);
    } else { cd.textContent=n; AudioSys.click(); }
  }, 600);
}
function showGameOver(why){
  $('hud').classList.add('hidden');
  const go=$('gameover'); go.classList.remove('hidden');
  $('go-sub').textContent = 'You ' + why + ' The Inspector caught up…';
  $('go-score').textContent = Math.floor(G.score).toLocaleString();
  $('go-coins').textContent = G.runCoins;
  const best=Math.max(store.best, Math.floor(G.score));
  const isBest=Math.floor(G.score)>store.best;
  store.best=best; store.totalCoins=store.totalCoins+G.runCoins;
  $('go-best').textContent=best.toLocaleString();
  $('go-newbest').classList.toggle('hidden', !isBest);
  $('btn-revive').style.display = G.keys>0 ? 'block':'none';
  $('btn-revive').textContent=`🔑 REVIVE (${G.keys} key${G.keys===1?'':'s'})`;
  $('menu-best').textContent=best.toLocaleString();
  $('menu-total-coins').textContent=store.totalCoins;
}
function revive(){
  if(G.keys<=0) return;
  G.keys--; AudioSys.power();
  // clear killers around player, grant shield
  for(let i=entities.length-1;i>=0;i--){
    const e=entities[i];
    if(e.position.z>-10 && e.position.z<14){ scene.remove(e); entities.splice(i,1); }
  }
  G.dead=false; G.state='run'; G.invinc=2.5; G.boardT=5; G.shield=true;
  player.userData.board.visible=true;
  guard.visible=false; dog.visible=false;
  $('gameover').classList.add('hidden'); $('hud').classList.remove('hidden');
  toast('💪 Back on the run!'); updateBoardUI(); renderTimers();
}

// ---------- input ----------
addEventListener('keydown', e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
  if(G.state==='menu' && (e.key==='Enter'||e.key===' ')){ startRun(); return; }
  if(G.state==='over' && e.key==='Enter'){ startRun(); return; }
  if(e.key==='p'||e.key==='P'||e.key==='Escape'){
    if(G.state==='run'){ G.state='pause'; $('pause').classList.remove('hidden'); }
    else if(G.state==='pause'){ G.state='run'; $('pause').classList.add('hidden'); }
    return;
  }
  if(G.state!=='run') return;
  switch(e.key){
    case 'ArrowLeft': case 'a': case 'A': G.lane=clamp(G.lane-1,0,2); AudioSys.click(); break;
    case 'ArrowRight': case 'd': case 'D': G.lane=clamp(G.lane+1,0,2); AudioSys.click(); break;
    case 'ArrowUp': case 'w': case 'W': doJump(); break;
    case 'ArrowDown': case 's': case 'S': doRoll(); break;
    case 'h': case 'H': useBoard(); break;
    case ' ': // space = jump, double-space handled via board button; single space jumps
      if(e.repeat) break;
      const now=performance.now();
      if(now-(G._lastSpace||0)<280){ useBoard(); G._lastSpace=0; }
      else { G._lastSpace=now; doJump(); }
      break;
  }
});

// touch swipes
let tsX=0,tsY=0,tsT=0,lastTap=0;
canvas.addEventListener('touchstart', e=>{
  AudioSys.init();
  const t=e.changedTouches[0]; tsX=t.clientX; tsY=t.clientY; tsT=performance.now();
},{passive:true});
canvas.addEventListener('touchend', e=>{
  const t=e.changedTouches[0];
  const dx=t.clientX-tsX, dy=t.clientY-tsY, adx=Math.abs(dx), ady=Math.abs(dy);
  const now=performance.now();
  if(G.state==='menu'){ startRun(); return; }
  if(G.state!=='run') return;
  if(Math.max(adx,ady)<24){
    // tap: jump; double-tap: board
    if(now-lastTap<300){ useBoard(); lastTap=0; }
    else { lastTap=now; setTimeout(()=>{ if(lastTap!==0){ doJump(); lastTap=0; } },310); }
    return;
  }
  if(adx>ady){ G.lane=clamp(G.lane+(dx>0?1:-1),0,2); }
  else if(dy<0){ doJump(); }
  else { doRoll(); }
  e.preventDefault();
},{passive:false});
// mouse swipe (desktop testing)
let mDown=null;
canvas.addEventListener('mousedown', e=>{ mDown={x:e.clientX,y:e.clientY}; });
addEventListener('mouseup', e=>{
  if(!mDown || G.state!=='run'){ mDown=null; return; }
  const dx=e.clientX-mDown.x, dy=e.clientY-mDown.y;
  if(Math.abs(dx)<10&&Math.abs(dy)<10){ doJump(); }
  else if(Math.abs(dx)>Math.abs(dy)){ G.lane=clamp(G.lane+(dx>0?1:-1),0,2); }
  else if(dy<0) doJump(); else doRoll();
  mDown=null;
});

$('btn-start').onclick=startRun;
$('btn-restart').onclick=startRun;
$('btn-revive').onclick=revive;
$('btn-menu').onclick=()=>{ $('gameover').classList.add('hidden'); $('menu').classList.remove('hidden'); G.state='menu'; guard.visible=false; dog.visible=false; };
$('btn-pause').onclick=()=>{ if(G.state==='run'){ G.state='pause'; $('pause').classList.remove('hidden'); } };
$('btn-resume').onclick=()=>{ G.state='run'; $('pause').classList.add('hidden'); };
$('btn-quit').onclick=()=>{ $('pause').classList.add('hidden'); $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); G.state='menu'; };
$('btn-board').onclick=useBoard;
$('menu-best').textContent=store.best.toLocaleString();
$('menu-total-coins').textContent=store.totalCoins;

// ---------- animation helpers ----------
let runPhase=0;
function animatePlayer(dt){
  const u=player.userData;
  runPhase += dt * (8 + G.speed*0.55);
  const targetX=LANES[G.lane];
  G.x += (targetX-G.x)*Math.min(1,dt*12);
  player.position.x=G.x;

  if(G.jetT>0){
    G.y += (6-G.y)*Math.min(1,dt*3);
    player.position.y=G.y;
    player.rotation.x=-0.25;
    u.jet.visible=true;
    u.legL.rotation.x=Math.sin(runPhase*.5)*0.4-0.5; u.legR.rotation.x=-Math.sin(runPhase*.5)*0.4-0.5;
    u.armL.rotation.x=-2.6; u.armR.rotation.x=-2.6; // holding jetpack
  } else {
    u.jet.visible=false;
    player.rotation.x=0;
    // vertical physics
    if(!G.grounded){
      G.vy += GRAVITY*dt;
      G.y += G.vy*dt;
      const gnd=groundAt(G.x, G.y);
      if(G.y<=gnd && G.vy<=0){ G.y=gnd; G.vy=0; G.grounded=true; if(gnd>0.1) G.onTrainTop=true; }
      if(G.y<0){ G.y=0; G.vy=0; G.grounded=true; }
    } else {
      const gnd=groundAt(G.x, G.y+0.3);
      if(Math.abs(gnd-G.y)>0.05){
        if(gnd<G.y-0.1){ G.grounded=false; } // ran off train edge
        else { G.y=gnd; }
      }
    }
    player.position.y=G.y;
    if(G.rolling>0){
      G.rolling-=dt;
      player.scale.set(1.15,0.55,1.15);
      player.rotation.x=-0.6;
      u.legL.rotation.x=u.legR.rotation.x=0; u.armL.rotation.x=u.armR.rotation.x=0;
    } else {
      player.scale.set(1,1,1);
      if(!G.grounded){
        player.rotation.x = G.vy>0 ? -0.18 : 0.25;
        // tuck legs when rising with sneakers
        const tuck = G.sneakT>0?0.9:0.4;
        u.legL.rotation.x=-tuck; u.legR.rotation.x=0.3;
        u.armL.rotation.x=-2.4; u.armR.rotation.x=-2.4;
      } else {
        player.rotation.x=0;
        u.legL.rotation.x=Math.sin(runPhase)*0.95;
        u.legR.rotation.x=-Math.sin(runPhase)*0.95;
        u.armL.rotation.x=-Math.sin(runPhase)*0.8;
        u.armR.rotation.x=Math.sin(runPhase)*0.8;
        player.position.y=G.y+Math.abs(Math.sin(runPhase))*0.08;
      }
    }
  }
  // lean into lane switches
  const lean=clamp((targetX-G.x)*0.4,-0.5,0.5);
  player.rotation.z=-lean;
  player.rotation.y=lean*0.7;
  // board glow pulse
  u.board.visible = G.boardT>0;
  if(u.board.visible) u.board.position.y=0.12+Math.sin(performance.now()*0.01)*0.03;
  // invinc blink
  player.visible = !(G.invinc>0 && Math.floor(performance.now()/120)%2===0) || G.dead;
}

// ---------- main loop ----------
const clock=new THREE.Clock();
let timerTick=0;

function update(dt){
  G.time+=dt;
  if(G.state!=='run') return;

  // speed ramp (like the original: faster = more points)
  G.speed=Math.min(G.maxSpeed, G.speed+dt*0.22);
  const move=G.speed*dt;
  G.distance+=move;

  // score
  const rate=G.speed*(G.starT>0?2:1)*G.mult;
  G.score+=rate*dt*10;
  maybeNextMissionSet();

  // timers
  const wasJet=G.jetT>0;
  for(const k of ['starT','magnetT','sneakT','jetT','boardT']) if(G[k]>0) G[k]-=dt;
  if(wasJet && G.jetT<=0){
    // jetpack ended: falling back to the tracks — brief grace so the
    // landing spot can't insta-kill
    G.vy=0; G.invinc=Math.max(G.invinc,1.5);
  }
  if(G.boardT<=0 && !G.shield) player.userData.board.visible=false;
  if(G.boardT<=0) G.shield = G.shield && false; // shield consumed with board
  // keep shield while board active
  if(G.boardT>0) G.shield=true;
  if(G.invinc>0) G.invinc-=dt;
  timerTick+=dt; if(timerTick>0.25){ timerTick=0; renderTimers(); }

  // spawn ahead
  while(G.nextSpawnZ>-140){
    if(G.jetT>0){ coinSkyRow(G.nextSpawnZ, 6); G.nextSpawnZ-=30; }
    else G.nextSpawnZ=spawnPattern(G.nextSpawnZ);
  }
  G.nextSpawnZ+=move;

  // move entities toward camera
  for(let i=entities.length-1;i>=0;i--){
    const e=entities[i], u=e.userData;
    let v=move;
    if(u.moving) v+=14*dt; // oncoming trains
    e.position.z+=v;
    if(u.kind==='coin'){ e.rotation.x+=(dt*4); e.position.y+=(Math.sin(G.time*3+e.position.z)*0.002); }
    if(u.kind==='power'&&u.box){ u.box.rotation.y+=dt*2; u.box.position.y=Math.sin(G.time*3)*0.12; }
    if(u.signal) u.signal.material.color.setHex(Math.floor(G.time*4)%2?0xff0000:0x550000);
    if(e.position.z>16){ scene.remove(e); entities.splice(i,1); }
  }

  // recycle sleepers / props
  for(const s of sleepers){ s.position.z+=move; if(s.position.z>12) s.position.z-=132; }
  for(const p of sideProps){ p.mesh.position.z+=move; if(p.mesh.position.z>15){ p.mesh.position.z-=155; if(p.mesh.geometry&&p.mesh.geometry.type==='BoxGeometry'&&p.mesh.position.y>4){ p.mesh.material.map=buildingTexture(); } } }
  for(const c of clouds){ c.position.z+=move*0.15; if(c.position.z>20) c.position.z=-150; }

  animatePlayer(dt);
  checkCollisions(dt);

  // guard runs behind at start / on revive gap
  if(guard.visible){
    guard.position.x += (G.x-guard.position.x)*dt*3;
    guard.position.z = G.dead ? guard.position.z - move*1.5 : guard.position.z + move*0.15;
    dog.position.x=guard.position.x+0.8; dog.position.z=guard.position.z+0.3;
    const gp=guard.userData;
    if(gp.legL){ gp.legL.rotation.x=Math.sin(runPhase+1)*0.9; gp.legR.rotation.x=-Math.sin(runPhase+1)*0.9; }
    if(G.time>4 && !G.dead){ guard.visible=false; dog.visible=false; }
    if(G.dead){ if(guard.position.z<0.8){ guard.position.z=0.8; dog.position.z=1.1; } }
  }

  // camera follows player lane slightly + jetpack height
  const camTX=G.x*0.45;
  camera.position.x += (camTX-camera.position.x)*Math.min(1,dt*5);
  camera.position.y += (((G.jetT>0?7.5:4.6)+G.y*0.25)-camera.position.y)*Math.min(1,dt*4);
  camera.position.z=7.2;
  camera.lookAt(G.x*0.6, 1.6+G.y*0.35, -8);

  // HUD
  $('score').textContent=Math.floor(G.score).toLocaleString();
  $('mult').textContent='x'+G.mult+(G.starT>0?' ⭐':'');
  $('coins').textContent=G.coins;
}

function loop(){
  requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(), 0.05);
  if(G.state==='menu'||G.state==='over'||G.state==='pause'){
    // idle scene motion
    const t=performance.now()*0.0002;
    camera.position.set(Math.sin(t)*1.5, 4.6, 7.2);
    camera.lookAt(0,1.6,-8);
    runPhase+=dt*8;
    player.position.set(0,Math.abs(Math.sin(runPhase))*0.06,0);
    player.userData.legL.rotation.x=Math.sin(runPhase)*0.5;
    player.userData.legR.rotation.x=-Math.sin(runPhase)*0.5;
    if(G.state==='over'){ // guard catches player
      guard.position.z += (0.8-guard.position.z)*Math.min(1,dt*3);
      dog.position.z=guard.position.z+0.3;
    }
    renderer.render(scene,camera);
    return;
  }
  update(dt);
  renderer.render(scene,camera);
}

// init camera + first coins for menu backdrop
camera.position.set(0,4.6,7.2);
coinLine(1,-20,8);
loop();
