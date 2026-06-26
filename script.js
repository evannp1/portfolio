/* =====================================================================
   BOOT SCREEN — séquence de démarrage façon terminal ctOS
===================================================================== */
(function(){
  const bootScreen = document.getElementById('bootScreen');
  const bootLog = document.getElementById('bootLog');
  const bootFill = document.getElementById('bootFill');
  const bootPercent = document.getElementById('bootPercent');
  const bootStatus = document.getElementById('bootStatus');
  const bootIp = document.getElementById('bootIp');
  const siteWrap = document.getElementById('siteWrap');

  if(!bootScreen){ return; }

  document.body.classList.add('is-booting');

  const LOG_LINES = [
    { t: 'init kernel module net_topo.sys', ok:true },
    { t: 'mounting /dev/sisr0 ... interface réseau détectée', ok:true },
    { t: 'scan plage IP 10.4.20.0/24', ok:true },
    { t: 'handshake passerelle 10.4.20.1', ok:true },
    { t: 'résolution DNS sisr.local', ok:true },
    { t: 'vérification certificat TLS', ok:true },
    { t: 'chargement table de routage OSPF', ok:true },
    { t: 'synchronisation VLAN 10 / 20 / 99', ok:true },
    { t: 'analyse topologie : 64 nœuds détectés', ok:true },
    { t: 'pare-feu pfSense — règles actives', ok:true },
    { t: 'latence moyenne : 4ms', ok:true },
    { t: 'tentative intrusion bloquée — port 22', warn:true },
    { t: 'chiffrement canal établi (AES-256)', ok:true },
    { t: 'chargement profil utilisateur lucas@sisr', ok:true },
    { t: 'compilation interface graphique', ok:true },
    { t: 'accès accordé', ok:true },
  ];

  function randomIp(){
    return `IP ${10+Math.floor(Math.random()*180)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
  }

  let lineIndex = 0;
  let progress = 0;
  const totalDuration = 2600; // ms approx
  const stepDelay = totalDuration / LOG_LINES.length;

  function appendLine(){
    if(lineIndex >= LOG_LINES.length) return;
    const item = LOG_LINES[lineIndex];
    const div = document.createElement('div');
    div.className = 'ln' + (item.ok ? ' ok' : '') + (item.warn ? ' warn' : '');
    div.textContent = `> ${item.t}`;
    bootLog.appendChild(div);
    // garde seulement les dernières lignes visibles
    while(bootLog.children.length > 7){ bootLog.removeChild(bootLog.firstChild); }
    lineIndex++;
  }

  const ipInterval = setInterval(()=>{ if(bootIp) bootIp.textContent = randomIp(); }, 180);

  const statusLabels = ['INITIALISATION','CONNEXION RÉSEAU','AUTHENTIFICATION','CHARGEMENT INTERFACE'];

  const logTimer = setInterval(()=>{
    appendLine();
    progress = Math.min(100, Math.round((lineIndex/LOG_LINES.length)*100));
    if(bootFill) bootFill.style.width = progress + '%';
    if(bootPercent) bootPercent.textContent = progress + '%';
    if(bootStatus){
      const idx = Math.min(statusLabels.length-1, Math.floor((progress/100)*statusLabels.length));
      bootStatus.textContent = statusLabels[idx];
    }
    if(lineIndex >= LOG_LINES.length){
      clearInterval(logTimer);
      clearInterval(ipInterval);
      setTimeout(finishBoot, 380);
    }
  }, stepDelay);

  function finishBoot(){
    bootScreen.classList.add('boot-done');
    document.body.classList.remove('is-booting');
    if(siteWrap) siteWrap.classList.add('wrap-visible');
    setTimeout(()=>{ if(bootScreen.parentNode){ bootScreen.style.display = 'none'; } }, 700);
  }

  // sécurité : si quelque chose bloque, on force la fin après 6s max
  setTimeout(()=>{
    if(!bootScreen.classList.contains('boot-done')){
      clearInterval(logTimer); clearInterval(ipInterval);
      finishBoot();
    }
  }, 6000);
})();


/* =====================================================================
   FOND RESEAU INTERACTIF — topologie informatique enrichie
===================================================================== */
(function(){
  const canvas = document.getElementById('netCanvas');
  const ctx = canvas.getContext('2d');
  let W, H, DPR;

  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  resize();
  window.addEventListener('resize', resize);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Génération des nœuds ---------- */
  // Densité augmentée + plusieurs "types" de nœuds (style topologie réseau)
  const NODE_COUNT = Math.max(70, Math.min(160, Math.floor((window.innerWidth*window.innerHeight)/11000)));
  const nodes = [];

  const TYPES = ['point','point','point','router','switch','point','point','server'];

  for(let i=0;i<NODE_COUNT;i++){
    const type = TYPES[Math.floor(Math.random()*TYPES.length)];
    nodes.push({
      x: Math.random()*W,
      y: Math.random()*H,
      ox: 0, oy:0,
      vx: (Math.random()-0.5)*0.05,
      vy: (Math.random()-0.5)*0.05,
      r: type === 'point' ? Math.random()*1.4 + 0.9 : (Math.random()*1.2 + 2.6),
      glow: type !== 'point' || Math.random() > 0.88,
      type: type,
      pulsePhase: Math.random()*Math.PI*2,
      pulseSpeed: 0.015 + Math.random()*0.02
    });
  }

  const MAX_DIST = Math.min(165, Math.max(110, W/10));
  const mouse = {x: W/2, y: H/2, active:false};

  window.addEventListener('mousemove', (e)=>{
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
  });
  window.addEventListener('mouseleave', ()=>{ mouse.active = false; });
  window.addEventListener('touchmove', (e)=>{
    if(e.touches[0]){ mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; mouse.active = true; }
  }, {passive:true});

  const REPEL_RADIUS = 170;
  const REPEL_STRENGTH = 28;

  /* ---------- Paquets de données voyageant sur les liaisons ---------- */
  // On précalcule les arêtes "actives" à chaque frame ; les packets choisissent
  // une arête existante et glissent de a -> b avant de réapparaître ailleurs.
  const packets = [];
  const PACKET_COUNT = Math.round(NODE_COUNT / 5);

  function spawnPacket(edgeList){
    if(edgeList.length === 0) return null;
    const edge = edgeList[Math.floor(Math.random()*edgeList.length)];
    return { a: edge.a, b: edge.b, t: 0, speed: 0.006 + Math.random()*0.01 };
  }

  function step(){
    for(const n of nodes){
      n.x += n.vx; n.y += n.vy;
      if(n.x < -20) n.x = W+20; if(n.x > W+20) n.x = -20;
      if(n.y < -20) n.y = H+20; if(n.y > H+20) n.y = -20;

      let tox = 0, toy = 0;
      if(mouse.active){
        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const dist = Math.sqrt(dx*dx + dy*dy) + 0.001;
        if(dist < REPEL_RADIUS){
          const force = (1 - dist/REPEL_RADIUS) * REPEL_STRENGTH;
          tox = (dx/dist) * force;
          toy = (dy/dist) * force;
        }
      }
      n.ox += (tox - n.ox) * 0.08;
      n.oy += (toy - n.oy) * 0.08;
      n.pulsePhase += n.pulseSpeed;
    }
  }

  function colorAt(x){
    const t = Math.max(0, Math.min(1, x / W));
    const r = Math.round(0 + t*29);
    const g = Math.round(150 + t*93);
    const b = Math.round(225 - t*40);
    return [r,g,b];
  }

  function drawRouterIcon(x,y,size,strokeStyle){
    // petit carré + croix, façon icône équipement réseau
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(x-size, y-size, size*2, size*2);
    ctx.beginPath();
    ctx.moveTo(x-size, y); ctx.lineTo(x+size, y);
    ctx.moveTo(x, y-size); ctx.lineTo(x, y+size);
    ctx.stroke();
    ctx.restore();
  }

  function drawServerIcon(x,y,size,strokeStyle){
    // petites barres horizontales empilées, façon rack serveur
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 0.9;
    for(let i=-1;i<=1;i++){
      ctx.strokeRect(x-size, y + i*size*0.9 - size*0.3, size*2, size*0.6);
    }
    ctx.restore();
  }

  function draw(){
    ctx.clearRect(0,0,W,H);

    const edges = [];

    // lignes entre nœuds proches
    for(let i=0;i<nodes.length;i++){
      const a = nodes[i];
      const ax = a.x + a.ox, ay = a.y + a.oy;
      for(let j=i+1;j<nodes.length;j++){
        const b = nodes[j];
        const bx = b.x + b.ox, by = b.y + b.oy;
        const dx = ax-bx, dy = ay-by;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if(dist < MAX_DIST){
          const opacity = (1 - dist/MAX_DIST) * 0.24;
          const [r,g,b2] = colorAt(ax);
          ctx.strokeStyle = `rgba(${r},${g},${b2},${opacity})`;
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.moveTo(ax,ay);
          ctx.lineTo(bx,by);
          ctx.stroke();
          edges.push({a, b});
        }
      }
    }

    // alimente la file de paquets si besoin
    while(packets.length < PACKET_COUNT && edges.length > 0){
      const p = spawnPacket(edges);
      if(p) packets.push(p);
    }

    // dessine + avance les paquets de données
    for(let i = packets.length - 1; i >= 0; i--){
      const p = packets[i];
      p.t += p.speed;
      if(p.t >= 1){
        packets.splice(i,1);
        continue;
      }
      const ax = p.a.x + p.a.ox, ay = p.a.y + p.a.oy;
      const bx = p.b.x + p.b.ox, by = p.b.y + p.b.oy;
      const px = ax + (bx-ax)*p.t;
      const py = ay + (by-ay)*p.t;
      const [r,g,b] = colorAt(px);
      ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
      ctx.beginPath();
      ctx.arc(px,py,1.6,0,Math.PI*2);
      ctx.fill();
    }

    // nœuds
    for(const n of nodes){
      const x = n.x + n.ox, y = n.y + n.oy;
      const [cr,cg,cb] = colorAt(x);
      const pulse = n.type !== 'point' ? (0.5 + Math.sin(n.pulsePhase)*0.5) : 1;

      if(n.glow){
        const glowR = n.type === 'point' ? 13 : 20;
        const grad = ctx.createRadialGradient(x,y,0,x,y,glowR);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.5*pulse})`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x,y,glowR,0,Math.PI*2);
        ctx.fill();
      }

      const strokeColor = `rgba(${cr},${cg},${cb},0.85)`;

      if(n.type === 'router'){
        drawRouterIcon(x,y,n.r+1.4,strokeColor);
      } else if(n.type === 'switch'){
        // petit losange
        ctx.save();
        ctx.strokeStyle = strokeColor; ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y-n.r-1.8); ctx.lineTo(x+n.r+1.8, y);
        ctx.lineTo(x, y+n.r+1.8); ctx.lineTo(x-n.r-1.8, y);
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      } else if(n.type === 'server'){
        drawServerIcon(x,y,n.r+1.2,strokeColor);
      }

      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.92)`;
      ctx.beginPath();
      ctx.arc(x,y,n.r,0,Math.PI*2);
      ctx.fill();
    }
  }

  function loop(){
    if(!reduceMotion){ step(); }
    draw();
    requestAnimationFrame(loop);
  }
  loop();
})();
