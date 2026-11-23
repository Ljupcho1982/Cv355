import * as THREE from '/vendor/three.module.min.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

$('#year').textContent = new Date().getFullYear();
requestAnimationFrame(() => document.documentElement.classList.add('loaded'));

/* =========================================================
   1. 3D FLIGHT-NETWORK GLOBE
   ========================================================= */
const scroll = { y: 0, p: 0 };        // p = 0..1 across the page
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

function initScene() {
  const canvas = $('#scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 0, 9);

  const R = 2.4;
  const root = new THREE.Group();   // moved by scroll
  const tilt = new THREE.Group();   // tilted toward the Balkans
  const spin = new THREE.Group();   // slow rotation
  root.add(tilt); tilt.add(spin); scene.add(root);

  const HOME = { lat: 41.99, lon: 21.43 }; // Skopje
  spin.rotation.y = THREE.MathUtils.degToRad(-(HOME.lon + 90));
  tilt.rotation.x = THREE.MathUtils.degToRad(HOME.lat * 0.75);

  const toVec = (lat, lon, r = R) => {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const th = THREE.MathUtils.degToRad(lon + 180);
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
  };

  // --- cheap 3D value noise for stylised "continents"
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    let r = 0;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++)
      r += hash(ix + i, iy + j, iz + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
    return r;
  };
  const fbm = (p) => noise(p.x * 1.3, p.y * 1.3, p.z * 1.3) * 0.6 + noise(p.x * 3, p.y * 3, p.z * 3) * 0.3 + noise(p.x * 7, p.y * 7, p.z * 7) * 0.1;

  // --- dotted sphere (fibonacci)
  const N = innerWidth < 700 ? 9000 : 16000;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), land = new Float32Array(N);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = golden * i;
    v.set(Math.cos(t) * r, y, Math.sin(t) * r);
    const isLand = fbm(v.clone().addScalar(3.1)) > 0.47 ? 1 : 0;
    v.multiplyScalar(R);
    pos.set([v.x, v.y, v.z], i * 3);
    size[i] = isLand ? 2.6 : 1.2;
    land[i] = isLand;
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dotGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  dotGeo.setAttribute('aLand', new THREE.BufferAttribute(land, 1));
  const dotMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPR: { value: renderer.getPixelRatio() }, uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: `
      attribute float aSize; attribute float aLand;
      uniform float uPR; uniform float uTime;
      varying float vLand; varying float vFacing; varying float vY;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 n = normalize(normalMatrix * normalize(position));
        vFacing = dot(n, normalize(-mv.xyz));
        vLand = aLand; vY = normalize(position).y;
        float tw = aLand > .5 ? 1.0 + .25*sin(uTime*2.0 + position.x*9.0) : 1.0;
        gl_PointSize = aSize * tw * uPR * (9.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uFade;
      varying float vLand; varying float vFacing; varying float vY;
      void main(){
        float d = length(gl_PointCoord - .5);
        if (d > .5) discard;
        float a = smoothstep(.5, .0, d);
        vec3 ocean = vec3(.16,.35,.75);
        vec3 landC = mix(vec3(.37,.91,1.0), vec3(.65,.48,1.0), vY*.5+.5);
        vec3 c = mix(ocean, landC, vLand);
        float facing = smoothstep(-.15, .6, vFacing);
        float alpha = a * facing * mix(.3, 1.0, vLand) * uFade;
        gl_FragColor = vec4(c, alpha);
      }`
  });
  spin.add(new THREE.Points(dotGeo, dotMat));

  // --- atmosphere (fresnel glow)
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.18, 64, 64),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uFade: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uFade; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(clamp(1.0 - abs(dot(vN, vV)), 0., 1.), 2.2);
          float rim = smoothstep(0.0, 1.0, f) * smoothstep(1.0, .55, f);
          gl_FragColor = vec4(mix(vec3(.16,.59,1.), vec3(.65,.48,1.), f), rim * .85 * uFade); }`
    })
  );
  tilt.add(atmo);

  // --- flight arcs
  const C = {
    SKP: [41.99, 21.43], OHD: [41.11, 20.80], BTL: [41.03, 21.33], DOH: [25.29, 51.53], DXB: [25.20, 55.27],
    IST: [41.01, 28.98], VIE: [48.21, 16.37], FRA: [50.11, 8.68], LHR: [51.50, -0.12], CDG: [48.86, 2.35],
    FCO: [41.90, 12.50], ZRH: [47.37, 8.54], BRU: [50.85, 4.35], YUL: [45.50, -73.57], JFK: [40.70, -74.0],
    ATH: [37.98, 23.73], BUD: [47.50, 19.04], WAW: [52.23, 21.01], CAI: [30.04, 31.24], MAD: [40.42, -3.70],
    AMS: [52.37, 4.90], SIN: [1.35, 103.8], DEL: [28.61, 77.21]
  };
  const routes = [
    ['SKP','DOH'],['SKP','IST'],['SKP','VIE'],['SKP','FRA'],['SKP','LHR'],['SKP','ZRH'],['SKP','BRU'],['SKP','FCO'],
    ['SKP','DXB'],['OHD','AMS'],['SKP','WAW'],['SKP','YUL'],['DOH','SIN'],['DOH','DEL'],['IST','JFK'],['ATH','CAI'],
    ['VIE','CDG'],['FRA','MAD'],['BUD','LHR'],['DOH','LHR'],['BTL','ATH'],['SKP','BUD'],['DXB','JFK']
  ];
  const arcs = [];
  const SEG = 80;
  routes.forEach(([a, b], i) => {
    const p0 = toVec(...C[a], R * 1.005), p2 = toVec(...C[b], R * 1.005);
    const dist = p0.distanceTo(p2);
    const mid = p0.clone().add(p2).multiplyScalar(.5).normalize().multiplyScalar(R + dist * 0.45);
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
    const pts = curve.getPoints(SEG);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const t = new Float32Array(SEG + 1); for (let k = 0; k <= SEG; k++) t[k] = k / SEG;
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uHead: { value: 0 }, uFade: { value: 1 }, uCol: { value: new THREE.Color(i % 3 === 0 ? 0xa77bff : i % 3 === 1 ? 0x2997ff : 0x5ee7ff) } },
      vertexShader: `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uHead; uniform float uFade; uniform vec3 uCol; varying float vT;
        void main(){ float tail = .45; float d = uHead - vT;
          float a = (d >= 0. && d <= tail) ? pow(1. - d/tail, 1.6) : 0.;
          float base = .07;
          gl_FragColor = vec4(uCol, max(a, base) * uFade); }`
    });
    spin.add(new THREE.Line(g, m));
    arcs.push({ curve, m, speed: 0.12 + Math.random() * 0.1, offset: Math.random() * 1.5 });
  });

  // plane "heads" + city markers
  const heads = new Float32Array(arcs.length * 3);
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute('position', new THREE.BufferAttribute(heads, 3));
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(160,210,255,.8)'); gr.addColorStop(1, 'rgba(41,151,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const headMat = new THREE.PointsMaterial({ size: 0.22, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  spin.add(new THREE.Points(headGeo, headMat));

  const cityPos = Object.values(C).flatMap(([la, lo]) => toVec(la, lo, R * 1.01).toArray());
  const cityGeo = new THREE.BufferGeometry();
  cityGeo.setAttribute('position', new THREE.Float32BufferAttribute(cityPos, 3));
  const cityMat = new THREE.PointsMaterial({ size: 0.12, map: glowTex, color: 0x9fd4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  spin.add(new THREE.Points(cityGeo, cityMat));

  // home pulse ring (Skopje)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.075, 48),
    new THREE.MeshBasicMaterial({ color: 0x5ee7ff, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const home = toVec(HOME.lat, HOME.lon, R * 1.012);
  ring.position.copy(home); ring.lookAt(home.clone().multiplyScalar(2));
  spin.add(ring);

  // --- starfield
  const SN = 2600, sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) {
    const r = 30 + Math.random() * 60, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    sp.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.12, color: 0xaecbff, transparent: true, opacity: .7, depthWrite: false }));
  scene.add(stars);

  // --- resize
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.position.z = w < 700 ? 12 : 9;
  };
  addEventListener('resize', resize); resize();

  // --- loop
  const clock = new THREE.Clock();
  let running = true;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { clock.getDelta(); tick(); } });
  const mobile = () => innerWidth < 860;

  function tick() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    dotMat.uniforms.uTime.value = t;

    // spin & pointer parallax
    if (!reduceMotion) spin.rotation.y += dt * 0.04;
    pointer.x = lerp(pointer.x, pointer.tx, 0.05); pointer.y = lerp(pointer.y, pointer.ty, 0.05);
    root.rotation.y = pointer.x * 0.25; root.rotation.x = pointer.y * 0.15;

    // scroll choreography: hero -> globe slides right & recedes -> returns centre for contact
    const p = scroll.p;
    const out = clamp(p / 0.12);                      // leaving the hero
    const back = clamp((p - 0.9) / 0.1);              // reaching the end
    const side = mobile() ? 0 : 2.6;
    root.position.x = lerp(lerp(0, side, out), 0, back);
    root.position.y = lerp(lerp(-0.2, mobile() ? 1.2 : 0, out), -0.2, back);
    const s = lerp(lerp(1, 0.82, out), 1, back);
    root.scale.setScalar(s);
    const fade = lerp(lerp(1, mobile() ? 0.35 : 0.6, out), 1, back);
    dotMat.uniforms.uFade.value = fade; atmo.material.uniforms.uFade.value = fade;
    spin.rotation.z = p * 0.6;

    arcs.forEach(a => {
      a.m.uniforms.uFade.value = fade;
      a.m.uniforms.uHead.value = reduceMotion ? 1 : ((t * a.speed + a.offset) % 1.6);
    });
    arcs.forEach((a, i) => {
      const h = Math.min(a.m.uniforms.uHead.value, 1);
      const pt = a.curve.getPoint(h);
      heads.set(a.m.uniforms.uHead.value <= 1 ? [pt.x, pt.y, pt.z] : [0, 1e4, 0], i * 3);
    });
    headGeo.attributes.position.needsUpdate = true;

    const pulse = (t * 0.6) % 1;
    ring.scale.setScalar(1 + pulse * 3); ring.material.opacity = (1 - pulse) * fade;

    stars.rotation.y = t * 0.005 + p * 0.4;
    camera.position.y = -p * 0.6;
    camera.lookAt(0, -p * 0.6, 0);

    renderer.render(scene, camera);
    if (!reduceMotion || t < 0.1) requestAnimationFrame(tick);
  }
  tick();
  if (reduceMotion) { addEventListener('scroll', () => requestAnimationFrame(() => renderer.render(scene, camera))); }
}

try { initScene(); }
catch (e) {
  console.warn('WebGL unavailable, using static background', e);
  $('#scene').style.background = 'radial-gradient(circle at 50% 40%, #0b2a55, #000 60%)';
}

/* =========================================================
   2. SCROLL-DRIVEN UI
   ========================================================= */
const bar = $('.progress span');
const nav = $('#nav');
let lastY = 0;

// Statement: split into words
const scrub = $('#scrub');
scrub.innerHTML = scrub.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span> `).join('');
const words = $$('.w', scrub);
const statement = $('.statement');

const projects = $('#projects');
const track = $('#track');

function onScroll() {
  const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
  scroll.y = y; scroll.p = max > 0 ? y / max : 0;
  bar.style.transform = `scaleX(${scroll.p})`;

  nav.classList.toggle('hide', y > lastY && y > 400);
  lastY = y;

  if (!reduceMotion) {
    // word highlight
    const r = statement.getBoundingClientRect();
    const sp = clamp((-r.top) / (r.height - innerHeight) * 1.15);
    const lit = Math.round(sp * words.length);
    words.forEach((w, i) => w.classList.toggle('on', i < lit));

    // horizontal projects
    const pr = projects.getBoundingClientRect();
    const pp = clamp((-pr.top) / (pr.height - innerHeight));
    const dist = track.scrollWidth - innerWidth;
    track.style.transform = `translate3d(${-pp * Math.max(0, dist)}px,0,0)`;
  }
}
addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
addEventListener('resize', onScroll);
onScroll();

// Reveal on view
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });
$$('.reveal').forEach(el => io.observe(el));

// Pointer: globe parallax + 3D tilt cards + photo sheen
addEventListener('pointermove', (e) => {
  pointer.tx = (e.clientX / innerWidth) * 2 - 1;
  pointer.ty = (e.clientY / innerHeight) * 2 - 1;
}, { passive: true });

if (!reduceMotion && matchMedia('(hover: hover)').matches) {
  [...$$('.tilt'), $('#photoCard')].forEach(el => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.transition = 'transform .15s ease-out';
      el.style.transform = `perspective(1000px) rotateY(${(x - .5) * 10}deg) rotateX(${(.5 - y) * 10}deg) translateZ(10px)`;
      el.style.setProperty('--mx', `${x * 100}%`); el.style.setProperty('--my', `${y * 100}%`);
    });
    el.addEventListener('pointerleave', () => {
      el.style.transition = 'transform .9s cubic-bezier(.16,1,.3,1)';
      el.style.transform = '';
    });
  });
}
