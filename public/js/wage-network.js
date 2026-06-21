/**
 * WAGE Society — 3D Holographic Referral Network Graph
 * Runs on /dashboard. Renders a network of referral connections in Three.js.
 * Falls back to CSS diagram if WebGL unavailable.
 */
(function () {
  'use strict';

  var WAGENetwork = window.WAGENetwork || {};

  // ── Colors ──────────────────────────────────────────────────────────────────
  var GOLD   = 0xF59E0B;
  var CYAN   = 0x06B6D4;
  var PURPLE = 0x8B5CF6;

  // ── Guards ──────────────────────────────────────────────────────────────────
  function isLowEnd() { return (navigator.hardwareConcurrency || 4) < 4; }
  function isMobile() { return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent); }
  function isReducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // ── WebGL check ───────────────────────────────────────────────────────────────
  function hasWebGL(canvas) {
    try { return !!(canvas.getContext('webgl') || canvas.getContext('webgl2')); }
    catch (e) { return false; }
  }

  // ── Main init ────────────────────────────────────────────────────────────────
  WAGENetwork.init = function (canvas, referralNodes, currentUserName) {
    if (!canvas) return;
    if (!hasWebGL(canvas)) { showCSSFallback(canvas, referralNodes); return; }

    var nodes = referralNodes || [];
    var userName = currentUserName || 'You';

    var isMobileBrowser = isMobile();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    // ── Scene setup ────────────────────────────────────────────────────────────
    var scene = new THREE.Scene();
    var W = canvas.clientWidth || 800;
    var H = canvas.clientHeight || 400;
    canvas.width = W;
    canvas.height = H;

    var camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 1000);
    camera.position.set(0, 8, 22);
    camera.lookAt(0, 0, 0);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: !isMobileBrowser });
    renderer.setSize(W, H);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    // Lighting
    var ambientLight = new THREE.AmbientLight(0x111133, 1.5);
    scene.add(ambientLight);

    var goldLight = new THREE.PointLight(GOLD, 1.5, 80);
    goldLight.position.set(0, 5, 5);
    scene.add(goldLight);

    var cyanLight = new THREE.PointLight(CYAN, 0.8, 60);
    cyanLight.position.set(-10, -3, 5);
    scene.add(cyanLight);

    var purpleLight = new THREE.PointLight(PURPLE, 0.5, 50);
    purpleLight.position.set(10, -3, 5);
    scene.add(purpleLight);

    // ── Center node (current user) ─────────────────────────────────────────────
    var centerGeo = new THREE.SphereGeometry(isMobileBrowser ? 0.9 : 1.1, 24, 24);
    var centerMat = new THREE.MeshPhongMaterial({
      color: GOLD, emissive: GOLD, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.95, shininess: 120,
    });
    var centerNode = new THREE.Mesh(centerGeo, centerMat);
    centerNode.userData = { label: userName, tier: 'you', referralCount: nodes.length };
    scene.add(centerNode);

    // Gold ring halo around center
    var haloGeo = new THREE.TorusGeometry(1.6, 0.05, 8, 48);
    var haloMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.5 });
    var halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 2.2;
    scene.add(halo);

    // ── Satellite nodes (referrals) ────────────────────────────────────────────
    var MAX_NODES = 50;
    var nodeMeshes = [];
    var edgeLines = [];

    var nodeCount = Math.min(nodes.length, MAX_NODES);
    var RING1_COUNT = nodeCount;

    for (var i = 0; i < nodeCount; i++) {
      var node = nodes[i];
      var angle = (i / nodeCount) * Math.PI * 2;
      var ringRadius = isMobileBrowser ? 5 : 8;
      var yOff = (Math.random() - 0.5) * 2;

      var x = Math.cos(angle) * ringRadius;
      var z = Math.sin(angle) * ringRadius;
      var y = yOff;

      var color = node.ring === 2 ? PURPLE : CYAN;
      var geo = new THREE.SphereGeometry(isMobileBrowser ? 0.45 : 0.55, 16, 16);
      var mat = new THREE.MeshPhongMaterial({
        color: color, emissive: color, emissiveIntensity: 0.25,
        transparent: true, opacity: 0.85, shininess: 100,
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.userData = { label: node.label || node.username || 'Referral', tier: node.tier || 'free', referralCount: node.referralCount || 0, basePos: { x: x, y: y, z: z } };
      scene.add(mesh);
      nodeMeshes.push(mesh);

      // Edge: center → node
      var edgeGeo = new THREE.BufferGeometry();
      var edgeVerts = new Float32Array([0, 0, 0, x, y, z]);
      edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeVerts, 3));
      var edgeMat = new THREE.LineBasicMaterial({
        color: color, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      var line = new THREE.Line(edgeGeo, edgeMat);
      scene.add(line);
      edgeLines.push(line);
    }

    // ── Orbiting ring particles ─────────────────────────────────────────────────
    var orbitParticles = null;
    if (!isMobileBrowser && !isLowEnd()) {
      var rpCount = 48;
      var rpPos = new Float32Array(rpCount * 3);
      for (var ri = 0; ri < rpCount; ri++) {
        var a = (ri / rpCount) * Math.PI * 2;
        rpPos[ri * 3]     = Math.cos(a) * 3.5;
        rpPos[ri * 3 + 1] = 0;
        rpPos[ri * 3 + 2] = Math.sin(a) * 3.5;
      }
      var rpGeo = new THREE.BufferGeometry();
      rpGeo.setAttribute('position', new THREE.BufferAttribute(rpPos, 3));
      var rpMat = new THREE.PointsMaterial({
        color: GOLD, size: 0.12, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      orbitParticles = new THREE.Points(rpGeo, rpMat);
      scene.add(orbitParticles);
    }

    // ── Mouse parallax ─────────────────────────────────────────────────────────
    var mouseX = 0, mouseY = 0;
    var targetCamX = 0, targetCamY = 0;

    document.addEventListener('mousemove', function (e) {
      mouseX = (e.clientX / window.innerWidth  - 0.5) * 6;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 4;
    }, { passive: true });

    // ── Raycaster for hover ─────────────────────────────────────────────────────
    var raycaster = new THREE.Raycaster();
    var mouseVec = new THREE.Vector2();
    var tooltip = document.getElementById('network-tooltip');
    var hoveredMesh = null;

    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseVec, camera);
      var hits = raycaster.intersectObjects([centerNode].concat(nodeMeshes));
      if (hits.length > 0) {
        var obj = hits[0].object;
        if (obj !== hoveredMesh) {
          hoveredMesh = obj;
          var ud = obj.userData;
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
          tooltip.style.top  = (e.clientY - rect.top  - 12) + 'px';
          tooltip.innerHTML = '<div class="nt-name">' + ud.label + '</div><div class="nt-tier">' + ud.tier + ' · ' + ud.referralCount + ' referrals</div>';
          canvas.style.cursor = 'pointer';
        } else {
          tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
          tooltip.style.top  = (e.clientY - rect.top  - 12) + 'px';
        }
      } else {
        if (hoveredMesh) {
          hoveredMesh = null;
          tooltip.style.display = 'none';
          canvas.style.cursor = 'default';
        }
      }
    });

    canvas.addEventListener('mouseleave', function () {
      hoveredMesh = null;
      if (tooltip) tooltip.style.display = 'none';
      canvas.style.cursor = 'default';
    });

    // ── Resize ─────────────────────────────────────────────────────────────────
    window.addEventListener('resize', function () {
      var W2 = canvas.clientWidth;
      var H2 = canvas.clientHeight;
      if (!W2 || !H2) return;
      canvas.width = W2; canvas.height = H2;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });

    // ── Visibility guard ──────────────────────────────────────────────────────
    var rafId = null;
    var isVisible = true;

    document.addEventListener('visibilitychange', function () {
      isVisible = !document.hidden;
      if (isVisible && !rafId) animate();
    });

    // ── Animation ──────────────────────────────────────────────────────────────
    var startTime = performance.now();
    var reducedMotion = isReducedMotion();

    function animate() {
      rafId = requestAnimationFrame(animate);
      if (!isVisible) return;

      var now = performance.now() * 0.001;
      var t = now - startTime * 0.001;

      // Smooth camera parallax
      targetCamX += (mouseX - targetCamX) * 0.04;
      targetCamY += (mouseY - targetCamY) * 0.04;
      if (!reducedMotion) {
        camera.position.x += (targetCamX - camera.position.x) * 0.04;
        camera.position.y += (-targetCamY - camera.position.y) * 0.04;
      }
      camera.lookAt(0, 0, 0);

      // Pulse center
      var pulse = 0.88 + 0.12 * Math.sin(now * 1.8);
      centerMat.opacity = pulse;
      centerMat.emissiveIntensity = 0.3 + 0.2 * Math.sin(now * 2);
      halo.rotation.z += reducedMotion ? 0 : 0.003;
      haloMat.opacity = 0.3 + 0.2 * Math.sin(now * 1.5);

      // Satellite orbit (subtle drift)
      if (!reducedMotion) {
        var orbitSpeed = 0.015;
        for (var ni = 0; ni < nodeMeshes.length; ni++) {
          var nm = nodeMeshes[ni];
          var bp = nm.userData.basePos;
          var a = Math.atan2(bp.z, bp.x) + orbitSpeed * (0.8 + Math.sin(ni) * 0.2);
          var r = Math.sqrt(bp.x * bp.x + bp.z * bp.z);
          nm.position.x = Math.cos(a) * r;
          nm.position.z = Math.sin(a) * r;
          nm.position.y = bp.y + 0.3 * Math.sin(now + ni * 0.4);

          // Update edge line
          var el = edgeLines[ni];
          if (el) {
            var attr = el.geometry.attributes.position;
            attr.setXYZ(1, nm.position.x, nm.position.y, nm.position.z);
            attr.needsUpdate = true;
          }
        }
      }

      // Orbit particles
      if (orbitParticles) {
        orbitParticles.rotation.y += reducedMotion ? 0 : 0.005;
        orbitParticles.rotation.x = 0.2 * Math.sin(now * 0.3);
        var rpp = orbitParticles.geometry.attributes.position;
        for (var pi = 0; pi < 48; pi++) {
          var pa = (pi / 48) * Math.PI * 2 + now * 0.3;
          rpp.setXYZ(pi, Math.cos(pa) * 3.5, Math.sin(now * 0.5 + pi * 0.3) * 0.3, Math.sin(pa) * 3.5);
        }
        rpp.needsUpdate = true;
      }

      // Edge pulse
      for (var ei = 0; ei < edgeLines.length; ei++) {
        edgeLines[ei].material.opacity = 0.15 + 0.15 * Math.sin(now * 2 + ei * 0.4);
      }

      // Gold light pulse
      goldLight.intensity = 1.2 + 0.6 * Math.sin(now * 1.5);

      renderer.render(scene, camera);
    }

    animate();
  };

  // ── CSS Fallback ─────────────────────────────────────────────────────────────
  function showCSSFallback(canvas, nodes) {
    var wrap = canvas.parentElement;
    canvas.style.display = 'none';
    var count = nodes ? nodes.length : 0;
    var html = '<div class="css-network-wrap">';
    if (count > 0) {
      html += '<div class="css-network-diagram">';
      html += '<div class="css-node css-node-center"><span class="css-node-icon">⭐</span><span class="css-node-label">You</span></div>';
      var cx = ['20%', '50%', '80%'];
      var cy = ['25%', '50%', '75%'];
      nodes.slice(0, 9).forEach(function (n, i) {
        var x = cx[i % 3];
        var y = cy[Math.floor(i / 3)];
        html += '<div class="css-node css-node-satellite" style="left:' + x + ';top:' + y + ';"><span class="css-node-icon">👤</span><span class="css-node-label">' + (n.label || n.username || 'Ref') + '</span></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="css-network-empty"><div class="css-network-empty-icon">🎁</div><div class="css-network-empty-title">No referrals yet</div><div class="css-network-empty-sub">Share your link above to grow your network</div></div>';
    }
    html += '</div>';
    var el = document.createElement('div');
    el.className = 'css-network-fallback';
    el.innerHTML = html;
    wrap.appendChild(el);
  }

  window.WAGENetwork = WAGENetwork;

})();