/**
 * WAGE Society — Three.js Particle System + Portal
 * Homepage only. Runs on layout.ejs canvas.
 * Performance-guarded: reduces particle/ring counts on low-end devices,
 * pauses RAF when tab is hidden, caps devicePixelRatio at 2.
 * Portal: ring geometry with raycaster click → camera fly-through → /play
 */
(function () {
  'use strict';

  var canvas = document.getElementById('wage-canvas');
  if (!canvas) return;
  if (!document.body.classList.contains('homepage')) return;

  // ── Guards ───────────────────────────────────────────────────────────────────
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  var isLowEnd = (navigator.hardwareConcurrency || 4) < 4;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var MAX_PARTICLES = isMobile ? 60 : isLowEnd ? 120 : 280;
  var STAR_COUNT    = isMobile ? 80  : 200;
  var PORTAL_Z      = 12;        // portal sits ahead of initial camera
  var PORTAL_RADIUS = isMobile ? 2.2 : 3.0;

  // ── WebGL fallback ──────────────────────────────────────────────────────────
  var gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
  if (!gl) {
    document.body.classList.add('no-webgl-hero');
    canvas.style.cssText += ';background:transparent!important;';

    // Inject CSS-only portal ring
    var ring = document.createElement('div');
    ring.className = 'css-portal-ring';

    // Inject floating CSS particles
    var particlesDiv = document.createElement('div');
    particlesDiv.className = 'css-particles';
    var particleColors = ['#F59E0B', '#06B6D4', '#8B5CF6', '#FCD34D'];
    for (var pi = 0; pi < 40; pi++) {
      var p = document.createElement('div');
      p.className = 'css-particle';
      p.style.cssText = [
        'left:' + (Math.random() * 100) + '%;',
        'top:' + (Math.random() * 100) + '%;',
        'background:' + particleColors[Math.floor(Math.random() * particleColors.length)] + ';',
        'animation-delay:' + (Math.random() * 6) + 's;',
        'animation-duration:' + (4 + Math.random() * 4) + 's;',
        'opacity:0;',
      ].join('');
      particlesDiv.appendChild(p);
    }

    canvas.parentElement.appendChild(ring);
    canvas.parentElement.appendChild(particlesDiv);
    return;
  }

  // ── Colors ───────────────────────────────────────────────────────────────────
  var GOLD   = 0xF59E0B;
  var CYAN    = 0x06B6D4;
  var PURPLE  = 0x8B5CF6;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function rrng(min, max) { return min + Math.random() * (max - min); }
  function easeInOut(t)    { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  // ── Scene ───────────────────────────────────────────────────────────────────
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 40;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: !isMobile });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;

  // Generated artwork uses black edges so additive blending preserves the
  // transparent canvas while retaining luminous texture detail.
  var textureLoader = new THREE.TextureLoader();
  function loadSceneTexture(url) {
    return textureLoader.load(url, function (texture) {
      texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    });
  }

  var portalTexture = loadSceneTexture('/images/three/portal-energy-core.png');
  var backdropTexture = !isMobile
    ? loadSceneTexture('/images/three/creator-network-nebula.png')
    : null;

  var networkBackdrop = null;
  if (backdropTexture) {
    var backdropMaterial = new THREE.MeshBasicMaterial({
      map: backdropTexture,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    networkBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), backdropMaterial);
    networkBackdrop.position.set(12, 0, -75);
    networkBackdrop.renderOrder = -10;
    scene.add(networkBackdrop);
  }

  // ── Lighting ─────────────────────────────────────────────────────────────────
  var ambientLight = new THREE.AmbientLight(0x111111, 1);
  scene.add(ambientLight);

  var portalGlow = new THREE.PointLight(0xF59E0B, 2.5, 60);
  portalGlow.position.set(0, 0, PORTAL_Z + 1);
  scene.add(portalGlow);

  var rimLight = new THREE.PointLight(0x06B6D4, 0.8, 80);
  rimLight.position.set(-20, 10, -10);
  scene.add(rimLight);

  // ── Star Field ────────────────────────────────────────────────────────────────
  var starPos = new Float32Array(STAR_COUNT * 3);
  for (var si = 0; si < STAR_COUNT; si++) {
    starPos[si * 3]     = (Math.random() - 0.5) * 800;
    starPos[si * 3 + 1] = (Math.random() - 0.5) * 600;
    starPos[si * 3 + 2] = (Math.random() - 0.5) * 400 - 100;
  }
  var starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  var starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: isMobile ? 0.8 : 1.2,
    transparent: true, opacity: 0.6,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  var stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ── Particles ────────────────────────────────────────────────────────────────
  var pos  = new Float32Array(MAX_PARTICLES * 3);
  var cols = new Float32Array(MAX_PARTICLES * 3);
  var vels = [];

  var colorOptions = [
    new THREE.Color(GOLD),
    new THREE.Color(CYAN),
    new THREE.Color(PURPLE),
    new THREE.Color(GOLD).lerp(new THREE.Color(CYAN), 0.5),
  ];

  for (var pi = 0; pi < MAX_PARTICLES; pi++) {
    pos[pi * 3]     = rrng(-70, 70);
    pos[pi * 3 + 1] = rrng(-50, 50);
    pos[pi * 3 + 2] = rrng(-30, 30);
    vels.push({ x: rrng(-0.015, 0.015), y: rrng(-0.01, 0.01), z: rrng(-0.005, 0.005) });
    var c = colorOptions[Math.floor(Math.random() * colorOptions.length)];
    cols[pi * 3]     = c.r;
    cols[pi * 3 + 1] = c.g;
    cols[pi * 3 + 2] = c.b;
  }

  var pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('color',    new THREE.BufferAttribute(cols, 3));
  var pMat = new THREE.PointsMaterial({
    size: isMobile ? 0.4 : 0.6,
    vertexColors: true, transparent: true, opacity: 0.7,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  var particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  // ── Glow Lines ────────────────────────────────────────────────────────────────
  if (!isMobile) {
    for (var li = 0; li < 12; li++) {
      var lp = new Float32Array(6);
      lp[0] = rrng(-60, 60); lp[1] = rrng(-40, 40); lp[2] = rrng(-20, 20);
      lp[3] = lp[0] + rrng(-20, 20); lp[4] = lp[1] + rrng(-15, 15); lp[5] = lp[2] + rrng(-10, 10);
      var lGeo = new THREE.BufferGeometry();
      lGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
      var lMat = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false });
      scene.add(new THREE.Line(lGeo, lMat));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PORTAL RING
  // ══════════════════════════════════════════════════════════════════════════

  // Outer ring (gold)
  var ringGeo = new THREE.TorusGeometry(PORTAL_RADIUS, 0.18, 16, 60);
  var ringMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9 });
  var ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.z = PORTAL_Z;

  // Inner glow ring
  var innerRingGeo = new THREE.TorusGeometry(PORTAL_RADIUS * 0.88, 0.08, 8, 48);
  var innerRingMat = new THREE.MeshBasicMaterial({ color: 0xFCD34D, transparent: true, opacity: 0.5 });
  var innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
  innerRing.position.z = PORTAL_Z + 0.05;

  // Textured energy core behind the procedural torus geometry.
  var portalCoreMat = new THREE.MeshBasicMaterial({
    map: portalTexture,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  var portalCore = new THREE.Mesh(
    new THREE.PlaneGeometry(PORTAL_RADIUS * 2.35, PORTAL_RADIUS * 2.35),
    portalCoreMat
  );
  portalCore.position.z = PORTAL_Z - 0.08;

  // Orbiting particle ring
  var ringParticles = null;
  if (!isMobile) {
    var rpCount = 36;
    var rpPositions = new Float32Array(rpCount * 3);
    for (var ri = 0; ri < rpCount; ri++) {
      var angle = (ri / rpCount) * Math.PI * 2;
      rpPositions[ri * 3]     = Math.cos(angle) * PORTAL_RADIUS;
      rpPositions[ri * 3 + 1] = Math.sin(angle) * PORTAL_RADIUS;
      rpPositions[ri * 3 + 2] = 0;
    }
    var rpGeo = new THREE.BufferGeometry();
    rpGeo.setAttribute('position', new THREE.BufferAttribute(rpPositions, 3));
    var rpMat = new THREE.PointsMaterial({ color: GOLD, size: 0.25, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    ringParticles = new THREE.Points(rpGeo, rpMat);
    ringParticles.position.z = PORTAL_Z;
  }

  // Portal group
  var portalGroup = new THREE.Group();
  portalGroup.add(portalCore, ring, innerRing);
  if (ringParticles) portalGroup.add(ringParticles);
  portalGroup.position.set(0, 0, PORTAL_Z);
  scene.add(portalGroup);

  // ── Raycaster + cursor ────────────────────────────────────────────────────────
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var isPortalAnimating = false;
  var isHoveringPortal = false;
  var baseParticleSpeed = 1;

  function onMouseMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObject(portalGroup, true);
    var hovering = hits.length > 0 && !isPortalAnimating;
    canvas.style.cursor = hovering ? 'pointer' : 'default';
    isHoveringPortal = hovering;
  }
  canvas.addEventListener('mousemove', onMouseMove, { passive: true });

  // ── Portal fly-through ────────────────────────────────────────────────────────
  function triggerPortalFlyThrough() {
    if (isPortalAnimating) return;
    isPortalAnimating = true;
    canvas.style.cursor = 'default';
    canvas.removeEventListener('mousemove', onMouseMove);

    var startZ   = camera.position.z;
    var peakZ    = startZ - 28;
    var duration = prefersReducedMotion ? 0 : 800;
    var startTime = performance.now();

    var overlay = document.createElement('div');
    overlay.id = 'wage-portal-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '9998',
      background: '#F59E0B', opacity: '0', pointerEvents: 'none',
      transition: 'opacity ' + (duration * 0.5) + 'ms ease-in-out',
    });
    document.body.appendChild(overlay);

    function flyStep(now) {
      var elapsed = now - startTime;
      var t = Math.min(elapsed / duration, 1);

      if (t <= 0.6) {
        camera.position.z = startZ - (startZ - peakZ) * easeInOut(t / 0.6);
      } else {
        camera.position.z = peakZ - (peakZ - (peakZ - 8)) * easeInOut((t - 0.6) / 0.4);
      }

      if (t >= 0.5 && t <= 0.85) {
        overlay.style.opacity = Math.min(easeInOut((t - 0.5) / 0.35) * 0.95, 0.95).toFixed(3);
      } else if (t > 0.85) {
        overlay.style.opacity = '0.95';
      }

      if (t < 1) {
        requestAnimationFrame(flyStep);
      } else {
        document.body.style.transition = 'opacity 300ms ease-in-out';
        document.body.style.opacity = '0';
        setTimeout(function () { window.location.href = '/'; }, 300);
      }
    }

    requestAnimationFrame(flyStep);
  }

  canvas.addEventListener('click', function (e) {
    if (isPortalAnimating) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObject(portalGroup, true);
    if (hits.length > 0) triggerPortalFlyThrough();
  });

  // Keyboard accessibility
  canvas.addEventListener('keydown', function (e) {
    if (isPortalAnimating) return;
    if (e.key === 'Enter' || e.key === ' ') {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      var hits = raycaster.intersectObject(portalGroup, true);
      if (hits.length > 0) { e.preventDefault(); triggerPortalFlyThrough(); }
    }
  });
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-label', 'Enter WAGE World — 3D portal to the WAGE game experience');

  // ── HUD data fetch ────────────────────────────────────────────────────────────
  function updateHUD() {
    fetch('/api/homepage-stats')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var el = document.getElementById('hud-creators-live');
        if (el && data.live_now != null) el.textContent = data.live_now;
        el = document.getElementById('hud-network-size');
        if (el && data.member_count != null) {
          el.textContent = data.member_count >= 1000
            ? Math.round(data.member_count / 1000 * 10) / 10 + 'k'
            : data.member_count;
        }
        el = document.getElementById('hud-streams-active');
        if (el && data.active_streams != null) el.textContent = data.active_streams;
      })
      .catch(function () { /* silent — HUD keeps showing last/default value */ });
  }
  updateHUD();
  setInterval(updateHUD, 30000);

  // ── Mouse parallax ────────────────────────────────────────────────────────────
  var mouseX = 0, mouseY = 0;
  var tCamX = 0, tCamY = 0;

  document.addEventListener('mousemove', function (e) {
    mouseX = (e.clientX / window.innerWidth  - 0.5) * 5;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 3;
  }, { passive: true });

  // ── Resize ────────────────────────────────────────────────────────────────────
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }, { passive: true });

  // ── RAF with tab-visibility guard ────────────────────────────────────────────
  var rafId = null;
  var isVisible = !document.hidden;

  document.addEventListener('visibilitychange', function () {
    isVisible = !document.hidden;
    if (isVisible && !rafId) animate();
  });

  function respawnParticle(i) {
    var i3 = i * 3;
    var edge = Math.floor(Math.random() * 6);
    if (edge === 0) {       pos[i3] = rrng(-70,70);     pos[i3+1] = 50;  pos[i3+2] = rrng(-30,30); }
    else if (edge === 1) {  pos[i3] = rrng(-70,70);     pos[i3+1] = -50; pos[i3+2] = rrng(-30,30); }
    else if (edge === 2) {  pos[i3] = -70; pos[i3+1] = rrng(-50,50); pos[i3+2] = rrng(-30,30); }
    else if (edge === 3) {  pos[i3] = 70;  pos[i3+1] = rrng(-50,50); pos[i3+2] = rrng(-30,30); }
    else if (edge === 4) {  pos[i3] = rrng(-70,70); pos[i3+1] = rrng(-50,50); pos[i3+2] = 30; }
    else {                  pos[i3] = rrng(-70,70); pos[i3+1] = rrng(-50,50); pos[i3+2] = -30; }
  }

  // ── Animation loop ───────────────────────────────────────────────────────────
  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!isVisible) return;

    var now = performance.now() * 0.001; // seconds

    // Glow light pulses — brighter on hover
    portalGlow.intensity = isHoveringPortal
      ? 4.0 + 1.5 * Math.sin(now * 2)
      : 2.0 + 0.8 * Math.sin(now * 1.5);

    // Portal ring pulse + rotation + scale pulse (1.0→1.02, 3s loop)
    if (!isPortalAnimating) {
      var pulse = 0.7 + 0.3 * Math.sin(now * 3);
      ringMat.opacity = pulse;
      innerRingMat.opacity = pulse * 0.6;
      portalCoreMat.opacity = 0.62 + pulse * 0.18;
      portalCore.rotation.z -= 0.0015;
      portalGroup.rotation.z += 0.004;
      // Scale pulse: ease in-out between 1.0 and 1.02
      var scalePulse = 1 + 0.02 * (0.5 * (1 + Math.sin(now * (Math.PI * 2 / 3) - Math.PI / 2)));
      portalGroup.scale.set(scalePulse, scalePulse, scalePulse);
      if (ringParticles) ringParticles.rotation.z -= 0.008;
    }

    // Particle drift — accelerate on hover
    var speedMult = isHoveringPortal ? 2.5 : 1;
    for (var i = 0; i < MAX_PARTICLES; i++) {
      pos[i*3]     += vels[i].x * speedMult;
      pos[i*3 + 1] += vels[i].y * speedMult;
      pos[i*3 + 2] += vels[i].z * speedMult;
      if (pos[i*3] < -72 || pos[i*3] > 72 || pos[i*3+1] > 52 || pos[i*3+1] < -52 || pos[i*3+2] > 32 || pos[i*3+2] < -32) {
        respawnParticle(i);
      }
    }
    pGeo.attributes.position.needsUpdate = true;

    // Smooth camera parallax
    tCamX += (mouseX - tCamX) * 0.04;
    tCamY += (mouseY - tCamY) * 0.04;
    camera.position.x = tCamX;
    camera.position.y = -tCamY;

    // Scene rotation
    particles.rotation.y += 0.0003;
    stars.rotation.y      += 0.00005;
    if (networkBackdrop) {
      networkBackdrop.rotation.z += 0.00004;
      networkBackdrop.material.opacity = 0.17 + 0.035 * Math.sin(now * 0.18);
    }

    renderer.render(scene, camera);
  }

  animate();

})();
