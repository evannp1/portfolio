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

  // Génération des nœuds
  const NODE_COUNT = Math.max(40, Math.min(85, Math.floor((window.innerWidth*window.innerHeight)/22000)));
  const nodes = [];
  for(let i=0;i<NODE_COUNT;i++){
    nodes.push({
      x: Math.random()*W,
      y: Math.random()*H,
      ox: 0, oy:0, // offset courant (animation souris)
      vx: (Math.random()-0.5)*0.06,
      vy: (Math.random()-0.5)*0.06,
      r: Math.random()*1.6 + 1,
      glow: Math.random() > 0.85 // certains nœuds plus lumineux
    });
  }

  const MAX_DIST = Math.min(180, Math.max(120, W/9));
  const mouse = {x: W/2, y: H/2, active:false};

  window.addEventListener('mousemove', (e)=>{
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
  });
  window.addEventListener('mouseleave', ()=>{ mouse.active = false; });
  window.addEventListener('touchmove', (e)=>{
    if(e.touches[0]){ mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; mouse.active = true; }
  }, {passive:true});

  const REPEL_RADIUS = 160;
  const REPEL_STRENGTH = 26;

  function step(){
    // déplacement de fond très lent (vie ambiante)
    for(const n of nodes){
      n.x += n.vx; n.y += n.vy;
      if(n.x < -20) n.x = W+20; if(n.x > W+20) n.x = -20;
      if(n.y < -20) n.y = H+20; if(n.y > H+20) n.y = -20;

      // cible d'offset en fonction de la souris (repousse les nœuds proches)
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
      // lissage (easing) vers la cible -> mouvement fluide, pas saccadé
      n.ox += (tox - n.ox) * 0.08;
      n.oy += (toy - n.oy) * 0.08;
    }
  }

  function draw(){
    ctx.clearRect(0,0,W,H);

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
          const opacity = (1 - dist/MAX_DIST) * 0.22;
          // dégradé de couleur selon position horizontale (bleu -> teal), comme la réf
          const t = (ax / W);
          const r = Math.round(0 + t*29);
          const g = Math.round(140 + t*93);
          const b2 = Math.round(220 - t*38);
          ctx.strokeStyle = `rgba(${r},${g},${b2},${opacity})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(ax,ay);
          ctx.lineTo(bx,by);
          ctx.stroke();
        }
      }
    }

    // nœuds
    for(const n of nodes){
      const x = n.x + n.ox, y = n.y + n.oy;
      const t = x / W;
      const cr = Math.round(0 + t*29);
      const cg = Math.round(190 + t*43);
      const cb = Math.round(255 - t*44);

      if(n.glow){
        const grad = ctx.createRadialGradient(x,y,0,x,y,14);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.55)`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x,y,14,0,Math.PI*2);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.9)`;
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
