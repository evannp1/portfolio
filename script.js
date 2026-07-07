/* =====================================================================
   PROJETS — accordéon dépliable au clic (approche max-height JS)
===================================================================== */
(function(){
  const triggers = document.querySelectorAll('.project-trigger');
  if(triggers.length === 0) return;

  triggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const project = trigger.closest('.project');
      const detail  = project.querySelector('.project-detail');
      const hint    = project.querySelector('.project-hint');
      const isOpen  = trigger.getAttribute('aria-expanded') === 'true';

      if(isOpen){
        // fermeture
        trigger.setAttribute('aria-expanded', 'false');
        detail.classList.remove('is-open');
        if(hint) hint.classList.remove('is-hidden');
      } else {
        // ouverture
        trigger.setAttribute('aria-expanded', 'true');
        detail.classList.add('is-open');
        if(hint) hint.classList.add('is-hidden');
      }
    });
  });

  // Empêche les clics dans la zone détail de refermer l'accordéon
  document.querySelectorAll('.project-detail').forEach(detail => {
    detail.addEventListener('click', e => e.stopPropagation());
  });
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

  /* ---------- Teinte du fond dérivant selon la section au scroll ---------- */
  // Chaque section a une teinte cible (RGB de base) ; on interpole en douceur
  // entre la teinte de la section précédente et celle de la section suivante
  // selon la position de scroll, puis on lisse encore dans le temps (pas de saut).
  const SECTION_TINTS = [
    { id: 'top',            rgb: [0, 170, 235] },
    { id: 'about',          rgb: [0, 190, 215] },
    { id: 'skills',         rgb: [15, 205, 195] },
    { id: 'projects',       rgb: [30, 220, 175] },
    { id: 'veille',         rgb: [55, 200, 200] },
    { id: 'parcours',       rgb: [40, 185, 215] },
    { id: 'certifications', rgb: [60, 175, 225] },
    { id: 'contact',        rgb: [80, 170, 230] },
  ];
  const sectionEls = SECTION_TINTS
    .map(s => ({ ...s, el: document.getElementById(s.id) }))
    .filter(s => s.el);

  let currentTint = [0, 170, 235];
  let targetTint = [0, 170, 235];

  function updateTargetTint(){
    if(sectionEls.length === 0) return;
    const viewCenter = window.scrollY + window.innerHeight * 0.4;

    // trouve les deux sections encadrant le centre de vue, interpole entre elles
    let prev = sectionEls[0];
    let next = sectionEls[sectionEls.length - 1];
    for(let i = 0; i < sectionEls.length; i++){
      const top = sectionEls[i].el.offsetTop;
      if(top <= viewCenter){ prev = sectionEls[i]; }
      if(top >= viewCenter && i > 0){ next = sectionEls[i]; break; }
      next = sectionEls[i];
    }
    if(prev === next){
      targetTint = prev.rgb;
      return;
    }
    const prevTop = prev.el.offsetTop;
    const nextTop = next.el.offsetTop;
    const span = Math.max(1, nextTop - prevTop);
    const localT = Math.max(0, Math.min(1, (viewCenter - prevTop) / span));
    targetTint = [
      prev.rgb[0] + (next.rgb[0] - prev.rgb[0]) * localT,
      prev.rgb[1] + (next.rgb[1] - prev.rgb[1]) * localT,
      prev.rgb[2] + (next.rgb[2] - prev.rgb[2]) * localT,
    ];
  }

  window.addEventListener('scroll', updateTargetTint, { passive: true });
  window.addEventListener('resize', updateTargetTint);
  updateTargetTint();

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
    // dérive douce de la teinte courante vers la teinte cible de la section visible
    currentTint[0] += (targetTint[0] - currentTint[0]) * 0.02;
    currentTint[1] += (targetTint[1] - currentTint[1]) * 0.02;
    currentTint[2] += (targetTint[2] - currentTint[2]) * 0.02;

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
    // variation horizontale existante (gauche -> droite), modulée par la teinte de section
    const r = Math.round(currentTint[0] * (0.55 + t*0.45));
    const g = Math.round(currentTint[1] * (0.85 + t*0.15));
    const b = Math.round(currentTint[2] * (1.0 - t*0.18));
    return [
      Math.max(0, Math.min(255, r)),
      Math.max(0, Math.min(255, g)),
      Math.max(0, Math.min(255, b)),
    ];
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
          const opacity = (1 - dist/MAX_DIST) * 0.13;
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
        const glowR = n.type === 'point' ? 8 : 13;
        const grad = ctx.createRadialGradient(x,y,0,x,y,glowR);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.28*pulse})`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x,y,glowR,0,Math.PI*2);
        ctx.fill();
      }

      const strokeColor = `rgba(${cr},${cg},${cb},0.55)`;

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

      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.65)`;
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


/* =====================================================================
   NAV ACTIVE + BARRE DE PROGRESSION SCROLL
===================================================================== */
(function(){
  const progressBar    = document.getElementById('scrollProgress');
  const navLinks       = document.querySelectorAll('nav.links a[data-nav]');
  const currentSection = document.getElementById('navCurrentSection');

  // sections à observer — dans l'ordre d'apparition dans la page
  const SECTION_IDS = ['top','about','skills','projects','veille','parcours','certifications','contact'];

  const sections = SECTION_IDS
    .map(id => document.getElementById(id))
    .filter(Boolean);

  const navMap = {};
  navLinks.forEach(a => { navMap[a.dataset.nav] = a; });

  function setActive(id){
    navLinks.forEach(a => a.classList.remove('nav-active'));
    const activeLink = navMap[id];
    if(activeLink){
      activeLink.classList.add('nav-active');
      if(currentSection) currentSection.textContent = '/ ' + activeLink.textContent.trim();
    } else {
      if(currentSection) currentSection.textContent = '';
    }
  }

  function onScroll(){
    // --- barre de progression ---
    const scrollTop  = window.scrollY;
    const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
    const pct        = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
    if(progressBar) progressBar.style.width = pct + '%';

    // --- section active ---
    // on cherche la dernière section dont le haut est au-dessus du milieu de l'écran
    const trigger = scrollTop + window.innerHeight * 0.35;
    let activeId = null;

    for(const sec of sections){
      if(sec.offsetTop <= trigger){
        activeId = sec.id;
      }
    }
    setActive(activeId);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll(); // init au chargement
})();
