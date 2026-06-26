import * as THREE from 'three';
import { gsap } from '/vendor/gsap/index.js';
import { createNoise2D } from '/vendor/simplex-noise/dist/esm/simplex-noise.js';

const canvas = document.getElementById('wageworld-canvas');
const loading = document.querySelector('[data-wageworld-loading]');
const loadingQuote = document.querySelector('[data-loading-quote]');
const focusLabel = document.querySelector('[data-focus-label]');
const focusValue = document.querySelector('[data-focus-value]');
const resourceValue = document.querySelector('[data-resource-value]');
const districtButtons = Array.from(document.querySelectorAll('[data-district]'));
const moveButtons = Array.from(document.querySelectorAll('[data-move]'));
const settingsToggle = document.querySelector('[data-settings-toggle]');
const settingsMenu = document.querySelector('[data-settings-menu]');
const settingsClose = document.querySelector('[data-settings-close]');
const settingsInputs = Array.from(document.querySelectorAll('[data-setting]'));
const resetPlayerButton = document.querySelector('[data-reset-player]');
const fullscreenButton = document.querySelector('[data-fullscreen]');
const characterToggle = document.querySelector('[data-character-toggle]');
const characterMenu = document.querySelector('[data-character-menu]');
const characterClose = document.querySelector('[data-character-close]');
const characterInputs = Array.from(document.querySelectorAll('[data-character]'));
const characterResetButton = document.querySelector('[data-character-reset]');
const worldRoot = document.querySelector('.wageworld');
const loginPrompt = document.querySelector('[data-login-prompt]');
const interactPrompt = document.querySelector('[data-interact-prompt]');
const chatLog = document.querySelector('[data-chat-log]');
const chatForm = document.querySelector('[data-chat-form]');
const chatInput = document.querySelector('[data-chat-input]');
const voiceToggle = document.querySelector('[data-voice-toggle]');
const commsStatus = document.querySelector('[data-comms-status]');
const voiceInputSelect = document.querySelector('[data-voice-input]');
const voiceOutputSelect = document.querySelector('[data-voice-output]');
const bootstrap = window.WAGEWORLD_BOOTSTRAP || {};

if (!canvas) throw new Error('WageWorld canvas not found');

const isMobile = window.matchMedia('(max-width: 760px)').matches;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const noise2D = createNoise2D();
const worldSize = 72;
const worldLimit = worldSize * 0.47;

let lastFrameTime = performance.now() * 0.001;
let elapsedTime = 0;

const loadingQuotes = [
  'We all gotta eat.',
  'This is gonna be epic.',
  'Setting the table.',
  'Booting up the creator city.',
  'Opening the doors.',
  'Loading the village.',
];
let loadingQuoteIndex = 0;
const loadingQuoteTimer = setInterval(() => {
  if (!loadingQuote) return;
  loadingQuoteIndex = (loadingQuoteIndex + 1) % loadingQuotes.length;
  loadingQuote.textContent = loadingQuotes[loadingQuoteIndex];
}, 1400);

const maps = new Map([
  ['Spawn House', { position: new THREE.Vector3(0, 0, 0), status: 'Home spawn', requiresAuth: false }],
  ['Creator Plaza', { position: new THREE.Vector3(0, 0, 0), status: 'Village center', requiresAuth: true }],
  ['Market Row', { position: new THREE.Vector3(19, 0, -13), status: 'Shops open', requiresAuth: true }],
  ['Live Arena', { position: new THREE.Vector3(-20, 0, -11), status: 'Stage live', requiresAuth: true }],
  ['Guild Tower', { position: new THREE.Vector3(-17, 0, 17), status: 'Guides ready', requiresAuth: true }],
  ['Reward Works', { position: new THREE.Vector3(18, 0, 16), status: 'Rewards minting', requiresAuth: true }],
]);

const districts = new Map([
  ['Spawn House', { position: new THREE.Vector3(0, 0, 0), color: 0xf59e0b, status: 'Home spawn' }],
  ['Creator Plaza', { position: new THREE.Vector3(0, 0, 0), color: 0xf59e0b, status: 'Village center' }],
  ['Market Row', { position: new THREE.Vector3(19, 0, -13), color: 0xf59e0b, status: 'Shops open' }],
  ['Live Arena', { position: new THREE.Vector3(-20, 0, -11), color: 0x18c7d5, status: 'Stage live' }],
  ['Guild Tower', { position: new THREE.Vector3(-17, 0, 17), color: 0x8b5cf6, status: 'Guides ready' }],
  ['Reward Works', { position: new THREE.Vector3(18, 0, 16), color: 0x22c55e, status: 'Rewards minting' }],
]);

const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
};

const worldState = {
  focus: 'Spawn House',
  currentMap: 'Spawn House',
  currentMapId: 'home',
  isAuthenticated: !!bootstrap.isAuthenticated,
  earnings: 12840,
  speed: 7,
  cameraSensitivity: 0.006,
  gamepadSensitivity: 2.8,
  followDistance: 10,
  followHeight: 7,
  cameraMode: 'firstPerson',
  npcEnergy: prefersReducedMotion ? 0 : 1,
  masterVolume: 0.85,
  voiceVolume: 0.9,
  showChat: true,
  controllerEnabled: true,
  controllerDeadzone: 0.16,
  invertY: false,
};

const comms = {
  id: null,
  ws: null,
  voiceEnabled: false,
  localStream: null,
  inputDeviceId: '',
  outputDeviceId: '',
  peers: new Map(),
  nearby: [],
  lastPresenceSent: 0,
};

const defaultCharacter = {
  name: 'Creator',
  skin: '#ffc69d',
  shirt: '#f59e0b',
  pants: '#253047',
  hat: '#111318',
  backpack: '#22c55e',
};

const characterState = loadCharacter();

const cameraRig = {
  yaw: Math.PI,
  pitch: -0.12,
  dragging: false,
  activePointerId: null,
  lastX: 0,
  lastY: 0,
};

const interactables = [];
const colliders = [];
let activeInteractable = null;
let dialogueUntil = 0;
let activeMapId = 'home';
const mapConfig = {
  home: {
    label: 'Spawn House',
    status: 'Home spawn',
    bounds: { minX: -13.4, maxX: 13.4, minZ: -12.4, maxZ: 12.4 },
    spawn: new THREE.Vector3(0, 0, 4.3),
  },
  hub: {
    label: 'Creator Plaza',
    status: 'Village center',
    bounds: { minX: -worldLimit, maxX: worldLimit, minZ: -worldLimit, maxZ: worldLimit },
    spawn: new THREE.Vector3(0, 0, 5.2),
  },
};

function addCollider(x, z, radius, label = 'object') {
  colliders.push({ x, z, radius, label, mapId: activeMapId });
}

function addObjectCollider(object, radius, label = object.userData?.kind || 'object') {
  object.userData.collider = { radius, label };
  addCollider(object.position.x, object.position.z, radius, label);
}

function addToActiveMap(object) {
  object.userData.mapId = activeMapId;
  mapGroups[activeMapId].add(object);
  return object;
}

function loadCharacter() {
  try {
    const saved = JSON.parse(localStorage.getItem('wageworld.character') || '{}');
    return { ...defaultCharacter, ...saved };
  } catch (_) {
    return { ...defaultCharacter };
  }
}

function saveCharacter() {
  localStorage.setItem('wageworld.character', JSON.stringify(characterState));
}

function setMaterialColor(material, value) {
  material.color.set(value);
  if (material.emissive) material.emissive.set(0x000000);
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isMobile,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x8ecae6, 1);
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9d6e5);
scene.fog = new THREE.Fog(0xa9d6e5, 52, 118);

const mapGroups = {
  home: new THREE.Group(),
  hub: new THREE.Group(),
};
mapGroups.home.name = 'Home Map';
mapGroups.hub.name = 'Hub Map';
scene.add(mapGroups.home, mapGroups.hub);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 240);
camera.position.set(0, 9, 13);

const sun = new THREE.DirectionalLight(0xfff0c7, 3.2);
sun.position.set(-24, 36, 18);
sun.castShadow = !isMobile;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -48;
sun.shadow.camera.right = 48;
sun.shadow.camera.top = 48;
sun.shadow.camera.bottom = -48;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdff8ff, 0x6c8f46, 1.55));

const mat = {
  grass: new THREE.MeshStandardMaterial({ color: 0x75b957, roughness: 0.92 }),
  path: new THREE.MeshStandardMaterial({ color: 0xd4a15d, roughness: 0.86 }),
  water: new THREE.MeshStandardMaterial({ color: 0x3aa6c8, roughness: 0.28, metalness: 0.05, transparent: true, opacity: 0.82 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.72 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x4f2f1b, roughness: 0.76 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x99a1a6, roughness: 0.8 }),
  roofGold: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.55 }),
  roofCyan: new THREE.MeshStandardMaterial({ color: 0x18c7d5, roughness: 0.55 }),
  roofGreen: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.55 }),
  roofViolet: new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.55 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.7 }),
  black: new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.62 }),
  floor: new THREE.MeshStandardMaterial({ color: 0xb58a5a, roughness: 0.82 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xf5e6c8, roughness: 0.78 }),
  bed: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.64 }),
  blanket: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.7 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.35, emissive: 0x063d18, emissiveIntensity: 0.55 }),
  playerBody: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.52 }),
  playerHead: new THREE.MeshStandardMaterial({ color: 0xffc69d, roughness: 0.6 }),
  playerPants: new THREE.MeshStandardMaterial({ color: 0x253047, roughness: 0.68 }),
  reward: new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.3, metalness: 0.55, emissive: 0x5b3100, emissiveIntensity: 0.35 }),
};

function terrainHeight(x, z) {
  const softHills = noise2D(x * 0.045, z * 0.045) * 0.32;
  const detail = noise2D(x * 0.13, z * 0.13) * 0.08;
  const plaza = Math.max(0, 1 - Math.hypot(x, z) / 13);
  return (softHills + detail) * (1 - plaza * 0.9);
}

function groundHeight(x, z, mapId = activeMapId) {
  return mapId === 'home' ? 0.12 : terrainHeight(x, z);
}

function setGroundY(object, lift = 0) {
  object.position.y = groundHeight(object.position.x, object.position.z, object.userData?.mapId || activeMapId) + lift;
}

function makeTerrain() {
  const geometry = new THREE.PlaneGeometry(worldSize, worldSize, isMobile ? 72 : 118, isMobile ? 72 : 118);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = terrainHeight(x, z);
    position.setY(i, y);
    const shade = 0.88 + noise2D(x * 0.28, z * 0.28) * 0.08;
    color.setRGB(0.42 * shade, 0.72 * shade, 0.32 * shade);
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const grass = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  grass.receiveShadow = true;
  addToActiveMap(grass);
}

function makePath(width, length, x, z, rotation = 0) {
  const path = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, length), mat.path);
  path.position.set(x, terrainHeight(x, z) + 0.045, z);
  path.rotation.y = rotation;
  path.receiveShadow = true;
  addToActiveMap(path);
}

function makeRiver() {
  const group = new THREE.Group();
  for (let i = -7; i <= 7; i += 1) {
    const x = i * 5.2;
    const z = 10 + Math.sin(i * 0.8) * 4.6;
    const water = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.08, 5.1), mat.water);
    water.position.set(x, terrainHeight(x, z) + 0.04, z);
    water.rotation.y = Math.sin(i * 0.45) * 0.22;
    water.receiveShadow = true;
    group.add(water);
  }
  addToActiveMap(group);
}

function makeTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.24 * scale, 1.4 * scale, 8), mat.wood);
  trunk.position.y = 0.7 * scale;
  trunk.castShadow = true;
  tree.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({ color: scale > 1.05 ? 0x3f9b46 : 0x4caf50, roughness: 0.72 });
  for (let i = 0; i < 3; i += 1) {
    const crown = new THREE.Mesh(new THREE.SphereGeometry((0.8 - i * 0.08) * scale, 14, 10), leafMat);
    crown.position.set((i - 1) * 0.18 * scale, (1.5 + i * 0.42) * scale, (i % 2) * 0.18 * scale);
    crown.castShadow = true;
    tree.add(crown);
  }

  tree.position.set(x, 0, z);
  setGroundY(tree);
  addToActiveMap(tree);
  addCollider(x, z, 0.72 * scale, 'tree');
}

function makeFence(x, z, length, rotation = 0) {
  const group = new THREE.Group();
  for (let i = 0; i < length; i += 1) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.16), mat.darkWood);
    post.position.set((i - length / 2) * 1.1, 0.4, 0);
    post.castShadow = true;
    group.add(post);
  }
  const railA = new THREE.Mesh(new THREE.BoxGeometry(length * 1.1, 0.12, 0.12), mat.darkWood);
  railA.position.y = 0.55;
  const railB = railA.clone();
  railB.position.y = 0.28;
  group.add(railA, railB);
  group.position.set(x, terrainHeight(x, z), z);
  group.rotation.y = rotation;
  addToActiveMap(group);
}

function makeHouse(name, x, z, roofMaterial) {
  const house = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.1, 2.6, 3.5), mat.cream);
  base.position.y = 1.45;
  base.castShadow = true;
  base.receiveShadow = true;
  house.add(base);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.7, 4), roofMaterial);
  roof.position.y = 3.55;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.35, 0.08), mat.darkWood);
  door.position.set(0, 0.78, 1.79);
  house.add(door);

  const sign = makeBillboard(name, roofMaterial.color.getHex(), 2.6, 0.72);
  sign.position.set(0, 3.15, 2.05);
  house.add(sign);

  house.position.set(x, 0, z);
  setGroundY(house);
  addToActiveMap(house);
  addCollider(x, z, 2.9, name);
  return house;
}

function makeBillboard(text, colorHex, width = 4.2, height = 1) {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 512;
  textureCanvas.height = 128;
  const ctx = textureCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(17, 19, 24, 0.88)';
  roundRect(ctx, 18, 22, 476, 84, 16);
  ctx.fill();
  ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 38px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(width, height, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeStall(x, z, colorMaterial) {
  const stall = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1, 1.4), mat.wood);
  counter.position.y = 0.6;
  counter.castShadow = true;
  stall.add(counter);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 2), colorMaterial);
  roof.position.y = 1.55;
  roof.castShadow = true;
  stall.add(roof);
  stall.position.set(x, 0, z);
  setGroundY(stall);
  addToActiveMap(stall);
  addCollider(x, z, 2.1, 'stall');
}

function makeStage(x, z) {
  const stage = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.65, 20), mat.black);
  deck.position.y = 0.38;
  deck.castShadow = true;
  deck.receiveShadow = true;
  stage.add(deck);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.1, 0.18), mat.roofCyan);
  screen.position.set(0, 2.35, -2.6);
  screen.castShadow = true;
  stage.add(screen);
  const lightA = new THREE.PointLight(0x18c7d5, 3, 14);
  lightA.position.set(-2.5, 3.2, 0);
  const lightB = new THREE.PointLight(0xf59e0b, 2.4, 12);
  lightB.position.set(2.5, 3.2, 0);
  stage.add(lightA, lightB);
  stage.position.set(x, 0, z);
  setGroundY(stage);
  addToActiveMap(stage);
  addCollider(x, z, 5.4, 'stage');
}

function makeTower(x, z) {
  const tower = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.1, 6.5, 8), mat.stone);
  base.position.y = 3.4;
  base.castShadow = true;
  tower.add(base);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.8, 8), mat.roofViolet);
  roof.position.y = 8.1;
  roof.castShadow = true;
  tower.add(roof);
  tower.position.set(x, 0, z);
  setGroundY(tower);
  addToActiveMap(tower);
  addCollider(x, z, 3.2, 'tower');
}

function makeRewardMachine(x, z) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3), mat.black);
  base.position.y = 1.3;
  base.castShadow = true;
  group.add(base);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 10, 44), mat.reward);
  wheel.position.set(0, 1.6, 1.56);
  group.add(wheel);
  const light = new THREE.PointLight(0x22c55e, 3, 10);
  light.position.y = 3;
  group.add(light);
  group.userData.wheel = wheel;
  group.position.set(x, 0, z);
  setGroundY(group);
  addToActiveMap(group);
  addCollider(x, z, 2.6, 'reward machine');
  return group;
}

function makeSpawnHouse() {
  const house = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(26, 0.22, 24), mat.floor);
  floor.position.y = 0.03;
  floor.receiveShadow = true;
  house.add(floor);

  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(26, 3.8, 0.3), mat.wall);
  wallBack.position.set(0, 1.95, -12);
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.8, 24), mat.wall);
  wallLeft.position.set(-13, 1.95, 0);
  const wallRight = wallLeft.clone();
  wallRight.position.x = 13;
  const wallFrontLeft = new THREE.Mesh(new THREE.BoxGeometry(10.1, 3.8, 0.3), mat.wall);
  wallFrontLeft.position.set(-7.95, 1.95, 12);
  const wallFrontRight = wallFrontLeft.clone();
  wallFrontRight.position.x = 7.95;
  const wallFrontTop = new THREE.Mesh(new THREE.BoxGeometry(5, 1.35, 0.3), mat.wall);
  wallFrontTop.position.set(0, 3.23, 12);
  const dividerA = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.7, 10.5), mat.wall);
  dividerA.position.set(-2.6, 1.43, -6.4);
  const dividerB = new THREE.Mesh(new THREE.BoxGeometry(9.9, 2.7, 0.24), mat.wall);
  dividerB.position.set(7.95, 1.43, -1.7);
  const dividerC = new THREE.Mesh(new THREE.BoxGeometry(7.7, 2.7, 0.24), mat.wall);
  dividerC.position.set(-6.45, 1.43, 1.6);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(17.8, 4.6, 4), mat.roofGold);
  roof.position.set(0, 5.32, 0);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  const windowA = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 0.08), mat.water);
  windowA.position.set(-8.4, 2.0, 12.18);
  const windowB = windowA.clone();
  windowB.position.x = 8.4;
  const windowC = windowA.clone();
  windowC.position.set(13.18, 2.0, -5.4);
  windowC.rotation.y = Math.PI / 2;
  const windowD = windowC.clone();
  windowD.position.z = 5.2;
  house.add(wallBack, wallLeft, wallRight, wallFrontLeft, wallFrontRight, wallFrontTop, dividerA, dividerB, dividerC, roof, windowA, windowB, windowC, windowD);

  const doorPivot = new THREE.Group();
  doorPivot.position.set(-1.05, 0.1, 12.2);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.7, 0.16), mat.darkWood);
  door.position.set(1.05, 1.35, 0);
  door.castShadow = true;
  doorPivot.add(door);
  doorPivot.userData.kind = 'door';
  doorPivot.userData.prompt = 'Front door: open it and step into the WageWorld hub.';
  doorPivot.userData.action = 'Use door';
  doorPivot.userData.isOpen = false;
  doorPivot.userData.destinationMapId = 'hub';
  house.add(doorPivot);

  const rug = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.06, 4.2), mat.path);
  rug.position.set(0, 0.18, 6.5);
  house.add(rug);

  const bed = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.55, 2.55), mat.bed);
  frame.position.y = 0.42;
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.25, 1.62), mat.blanket);
  blanket.position.set(0, 0.82, 0.22);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.24, 0.58), mat.cream);
  pillow.position.set(0, 0.95, -0.72);
  bed.add(frame, blanket, pillow);
  bed.position.set(-8.2, 0.15, -7.0);
  bed.userData.kind = 'bed';
  bed.userData.prompt = 'Bed: this is your current spawn point. Later, permitted beds can become your respawn location.';
  bed.userData.action = 'Set spawn point';
  house.add(bed);

  const desk = new THREE.Group();
  const table = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.24, 1.65), mat.wood);
  table.position.y = 1.05;
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.05, 0.12), mat.screen);
  monitor.position.set(0, 1.72, -0.52);
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.38), mat.black);
  keyboard.position.set(0, 1.22, 0.18);
  desk.add(table, monitor, keyboard);
  desk.position.set(7.8, 0.15, -7.2);
  desk.userData.kind = 'computer';
  desk.userData.prompt = worldState.isAuthenticated
    ? 'Computer: WAGE Society tools will open here inside WageWorld.'
    : 'Computer: log in for saved progress, subscriptions, private spaces, and creator tools. Guests can still explore.';
  desk.userData.action = worldState.isAuthenticated ? 'Open tools' : 'Log in';
  house.add(desk);

  const wardrobe = new THREE.Group();
  const closet = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.35, 1.05), mat.darkWood);
  closet.position.y = 1.58;
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(1.42, 2.36, 0.08), mat.water);
  mirror.position.set(0, 1.72, 0.48);
  wardrobe.add(closet, mirror);
  wardrobe.position.set(-9.7, 0.15, 5.8);
  wardrobe.userData.kind = 'character';
  wardrobe.userData.prompt = 'Wardrobe: change your character here. Future cosmetics can unlock paid looks and avatars.';
  wardrobe.userData.action = 'Edit character';
  house.add(wardrobe);

  const loginZone = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 1.9, 32),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.62, side: THREE.DoubleSide })
  );
  loginZone.rotation.x = -Math.PI / 2;
  loginZone.position.set(7.8, 0.22, -5.8);
  house.add(loginZone);

  const sofa = new THREE.Group();
  const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.72, 1.45), mat.roofGreen);
  sofaBase.position.y = 0.55;
  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.05, 0.28), mat.roofGreen);
  sofaBack.position.set(0, 1.02, -0.72);
  sofa.add(sofaBase, sofaBack);
  sofa.position.set(4.5, 0.15, 4.6);
  house.add(sofa);

  house.position.set(0, 0, 0);
  addToActiveMap(house);
  interactables.push(bed, desk, wardrobe, doorPivot);
  [bed, desk, wardrobe, doorPivot].forEach((item) => {
    item.userData.mapId = activeMapId;
  });
  addObjectCollider(bed, 2.2, 'bed');
  addObjectCollider(desk, 2.05, 'computer');
  addObjectCollider(wardrobe, 1.65, 'wardrobe');
  addCollider(-13.15, 0, 0.9, 'left wall');
  addCollider(13.15, 0, 0.9, 'right wall');
  addCollider(0, -12.15, 0.9, 'back wall');
  addCollider(-7.95, 12.15, 4.7, 'front wall');
  addCollider(7.95, 12.15, 4.7, 'front wall');
  addCollider(-2.6, -6.4, 0.8, 'room divider');
  addCollider(7.95, -1.7, 0.8, 'room divider');
  addCollider(-6.45, 1.6, 0.8, 'room divider');
  addCollider(4.5, 4.6, 2.3, 'sofa');
  return { house, bed, computer: desk, wardrobe };
}

function makePlayer() {
  const player = new THREE.Group();
  const playerMaterials = {
    skin: mat.playerHead.clone(),
    shirt: mat.playerBody.clone(),
    pants: mat.playerPants.clone(),
    hat: mat.black.clone(),
    backpack: mat.roofGreen.clone(),
  };

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.7, 6, 12), playerMaterials.shirt);
  body.position.y = 1.0;
  body.castShadow = true;
  player.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 12), playerMaterials.skin);
  head.position.y = 1.62;
  head.castShadow = true;
  player.add(head);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), playerMaterials.hat);
  cap.position.y = 1.8;
  cap.rotation.x = -0.16;
  player.add(cap);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.2), playerMaterials.backpack);
  backpack.position.set(0, 1.02, -0.33);
  player.add(backpack);

  player.userData.limbs = [];
  [['armL', -0.44, 1.04], ['armR', 0.44, 1.04], ['legL', -0.18, 0.43], ['legR', 0.18, 0.43]].forEach(([name, x, y]) => {
    const limb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, name.startsWith('leg') ? 0.43 : 0.38, 4, 8),
      name.startsWith('leg') ? playerMaterials.pants : playerMaterials.skin
    );
    limb.name = name;
    limb.position.set(x, y, 0);
    limb.castShadow = true;
    player.add(limb);
    player.userData.limbs.push(limb);
  });

  player.position.copy(mapConfig.home.spawn);
  player.rotation.y = 0;
  player.userData.materials = playerMaterials;
  player.userData.parts = { body, head, cap, backpack };
  setGroundY(player);
  scene.add(player);
  return player;
}

function makeGuideNpc(name, x, z, color, message) {
  const npc = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.7, 5, 10), material);
  body.position.y = 0.96;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), mat.playerHead);
  head.position.y = 1.55;
  head.castShadow = true;
  npc.add(body, head);
  npc.position.set(x, 0, z);
  setGroundY(npc);
  npc.userData = {
    kind: 'guide',
    name,
    message,
    prompt: `${name}: Press E to talk.`,
    action: 'Talk',
    phase: Math.random() * Math.PI * 2,
  };
  addToActiveMap(npc);
  interactables.push(npc);
  return npc;
}

function makePickup(x, z) {
  const pickup = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 18), mat.reward);
  coin.rotation.x = Math.PI / 2;
  coin.castShadow = true;
  pickup.add(coin);
  const glow = new THREE.PointLight(0xffd166, 1.6, 5);
  pickup.add(glow);
  pickup.position.set(x, 0, z);
  setGroundY(pickup, 1.1);
  pickup.userData.coin = coin;
  addToActiveMap(pickup);
  return pickup;
}

function makeCloud(x, y, z, scale = 1) {
  const cloud = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  for (let i = 0; i < 5; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry((0.65 + Math.random() * 0.42) * scale, 12, 8), cloudMat);
    puff.position.set((i - 2) * 0.65 * scale, Math.sin(i) * 0.18 * scale, (i % 2) * 0.18 * scale);
    cloud.add(puff);
  }
  cloud.position.set(x, y, z);
  addToActiveMap(cloud);
  return cloud;
}

function buildWorld() {
  activeMapId = 'home';
  const spawnHouse = makeSpawnHouse();

  activeMapId = 'hub';
  makeTerrain();
  makeRiver();
  makePath(2.2, 50, 0, 0, 0);
  makePath(2.2, 50, 0, 0, Math.PI / 2);
  makePath(1.45, 48, 0, 0, Math.PI / 4);
  makePath(1.45, 48, 0, 0, -Math.PI / 4);

  makeHouse('Creator Home', 4.8, 4.5, mat.roofGold);
  makeHouse('Market Row', 20, -13, mat.roofGold);
  makeHouse('Reward Works', 18, 16, mat.roofGreen);
  makeStage(-20, -11);
  makeTower(-17, 17);
  const rewardMachine = makeRewardMachine(13, 18);

  makeStall(15.2, -17, mat.roofGold);
  makeStall(22.8, -9.2, mat.roofGold);
  makeFence(6, 8, 8, 0);
  makeFence(-8, -18, 9, Math.PI / 2);
  makeFence(23, 4, 7, 0.3);

  for (let i = 0; i < 55; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 18 + Math.random() * 17;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.abs(x) < 5 || Math.abs(z) < 5) continue;
    makeTree(x, z, 0.78 + Math.random() * 0.6);
  }

  const guides = [
    makeGuideNpc('Guide', 7, -1.5, 0x18c7d5, 'Use the computer to log in or keep exploring as a guest.'),
    makeGuideNpc('Builder', 22, -15, 0xf59e0b, 'Market Row will hold shops, tools, and rentable creator spaces.'),
    makeGuideNpc('Coach', -20, -7, 0x22c55e, 'The Live Arena will host streams, events, and creator sessions.'),
    makeGuideNpc('Archivist', -17, 14, 0x8b5cf6, 'Guild Tower explains referrals, memberships, and permissions.'),
  ];
  guides.forEach((guide) => addObjectCollider(guide, 0.9, 'guide'));

  const pickups = [
    makePickup(-2.5, -7),
    makePickup(8, -12),
    makePickup(17, -8),
    makePickup(-19, -16),
    makePickup(-13, 13),
    makePickup(22, 19),
    makePickup(4, 16),
  ];

  const clouds = [
    makeCloud(-21, 22, -25, 1.5),
    makeCloud(18, 25, -28, 1.2),
    makeCloud(28, 19, 15, 1.1),
  ];

  activeMapId = 'home';
  mapGroups.home.visible = true;
  mapGroups.hub.visible = false;
  return { guides, pickups, clouds, rewardMachine, spawnHouse };
}

const worldObjects = buildWorld();
const player = makePlayer();
applyCharacterToPlayer();
switchMap('home', mapConfig.home.spawn, false);

window.WageWorldDebug = {
  getPlayer() {
    return {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      rotationY: player.rotation.y,
      cameraYaw: cameraRig.yaw,
      cameraPitch: cameraRig.pitch,
      cameraMode: worldState.cameraMode,
      currentMap: worldState.currentMap,
      currentMapId: worldState.currentMapId,
      visibleMaps: Object.fromEntries(Object.entries(mapGroups).map(([id, group]) => [id, group.visible])),
      character: { ...characterState },
    };
  },
};

function applyCharacterToPlayer() {
  if (!player?.userData?.materials) return;
  setMaterialColor(player.userData.materials.skin, characterState.skin);
  setMaterialColor(player.userData.materials.shirt, characterState.shirt);
  setMaterialColor(player.userData.materials.pants, characterState.pants);
  setMaterialColor(player.userData.materials.hat, characterState.hat);
  setMaterialColor(player.userData.materials.backpack, characterState.backpack);
}

function syncCharacterInputs() {
  characterInputs.forEach((input) => {
    const key = input.dataset.character;
    if (characterState[key] == null) return;
    input.value = characterState[key];
  });
}

function updateHud(name = worldState.focus) {
  const district = districts.get(name) || Array.from(districts.values()).find((item) => item.status === mapConfig[worldState.currentMapId]?.status);
  worldState.focus = name;
  if (focusLabel) focusLabel.textContent = name;
  if (focusValue) focusValue.textContent = district?.status || 'Exploring';
  if (resourceValue) resourceValue.textContent = `$${worldState.earnings.toLocaleString()}`;
  districtButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.district === name));
}

function updateLoginPrompt() {
  if (!loginPrompt) return;
  loginPrompt.hidden = worldState.isAuthenticated;
}

function nearestDistrict() {
  if (worldState.currentMapId === 'home') return 'Spawn House';
  let bestName = 'Creator Plaza';
  let bestDistance = Infinity;
  districts.forEach((district, name) => {
    if (name === 'Spawn House') return;
    const distance = player.position.distanceTo(district.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = name;
    }
  });
  return bestName;
}

function switchMap(mapId, destination = mapConfig[mapId]?.spawn, animate = true) {
  const map = mapConfig[mapId];
  if (!map) return;
  worldState.currentMapId = mapId;
  worldState.currentMap = map.label;
  Object.entries(mapGroups).forEach(([id, group]) => {
    group.visible = id === mapId;
  });
  const target = (destination || map.spawn).clone();
  const complete = () => {
    player.userData.mapId = mapId;
    player.position.copy(target);
    setGroundY(player);
    updateHud(map.label);
  };
  if (animate) {
    gsap.to(player.position, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: 0.35,
      ease: 'power2.inOut',
      onUpdate: () => setGroundY(player),
      onComplete: complete,
    });
  } else {
    complete();
  }
}

function teleportToDistrict(name) {
  const district = districts.get(name);
  if (!district) return;
  if (name === 'Spawn House') {
    switchMap('home', mapConfig.home.spawn);
    return;
  }
  if (worldState.currentMapId !== 'hub') {
    switchMap('hub', districts.get(name)?.position.clone().add(new THREE.Vector3(0, 0, 4.8)) || mapConfig.hub.spawn);
    return;
  }
  const destination = district.position.clone().add(new THREE.Vector3(0, 0, 4.8));
  const start = player.position.clone();
  gsap.to(player.position, {
    x: destination.x,
    z: destination.z,
    duration: 0.55,
    ease: 'power2.inOut',
    onUpdate: () => setGroundY(player),
    onComplete: () => {
      player.position.copy(destination);
      setGroundY(player);
      worldState.currentMap = name;
      updateHud(name);
    },
  });
  player.rotation.y = Math.atan2(destination.x - start.x, destination.z - start.z);
}

function isTypingTarget(target) {
  return !!target?.closest?.('input, textarea, select, button, [contenteditable="true"], .ww-settings, .ww-character');
}

districtButtons.forEach((button) => {
  button.addEventListener('click', () => teleportToDistrict(button.dataset.district));
});

function openSettings() {
  if (!settingsMenu || !settingsToggle) return;
  settingsMenu.hidden = false;
  settingsToggle.setAttribute('aria-expanded', 'true');
  worldRoot?.classList.add('ww-menu-open');
  if (characterMenu && characterToggle) {
    characterMenu.hidden = true;
    characterToggle.setAttribute('aria-expanded', 'false');
  }
}

function closeSettings() {
  if (!settingsMenu || !settingsToggle) return;
  settingsMenu.hidden = true;
  settingsToggle.setAttribute('aria-expanded', 'false');
  if (characterMenu?.hidden !== false) worldRoot?.classList.remove('ww-menu-open');
}

settingsToggle?.addEventListener('click', () => {
  if (!settingsMenu) return;
  if (settingsMenu.hidden) openSettings();
  else closeSettings();
});

settingsClose?.addEventListener('click', closeSettings);

function openCharacterMenu() {
  if (!characterMenu) return;
  syncCharacterInputs();
  characterMenu.hidden = false;
  characterToggle?.setAttribute('aria-expanded', 'true');
  worldRoot?.classList.add('ww-menu-open');
  closeSettings();
}

function closeCharacterMenu() {
  if (!characterMenu) return;
  characterMenu.hidden = true;
  characterToggle?.setAttribute('aria-expanded', 'false');
  if (settingsMenu?.hidden !== false) worldRoot?.classList.remove('ww-menu-open');
}

characterToggle?.addEventListener('click', () => {
  if (!characterMenu) return;
  if (characterMenu.hidden) openCharacterMenu();
  else closeCharacterMenu();
});

characterClose?.addEventListener('click', closeCharacterMenu);

characterInputs.forEach((input) => {
  const key = input.dataset.character;
  if (!key) return;
  input.value = characterState[key] || defaultCharacter[key] || '';
  input.addEventListener('input', () => {
    characterState[key] = input.value || defaultCharacter[key];
    applyCharacterToPlayer();
    saveCharacter();
  });
});

characterResetButton?.addEventListener('click', () => {
  Object.assign(characterState, defaultCharacter);
  applyCharacterToPlayer();
  saveCharacter();
  syncCharacterInputs();
});

settingsInputs.forEach((input) => {
  const key = input.dataset.setting;
  const applyValue = () => {
    if (input.type === 'checkbox') {
      worldState[key] = input.checked;
      return;
    }
    if (input.tagName === 'SELECT') {
      worldState[key] = input.value;
      return;
    }
    worldState[key] = Number(input.value);
    if (key === 'voiceVolume' || key === 'masterVolume') {
      comms.peers.forEach((peer) => {
        peer.audio.volume = worldState.voiceVolume * worldState.masterVolume;
      });
    }
  };
  applyValue();
  input.addEventListener('input', applyValue);
});

resetPlayerButton?.addEventListener('click', () => {
  switchMap(worldState.currentMapId, mapConfig[worldState.currentMapId]?.spawn || mapConfig.home.spawn);
  closeSettings();
});

fullscreenButton?.addEventListener('click', () => {
  const root = document.querySelector('.wageworld');
  if (!document.fullscreenElement) {
    root?.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

function appendChatMessage(message) {
  if (!chatLog) return;
  const row = document.createElement('div');
  row.className = 'ww-chat-message';
  const name = document.createElement('strong');
  name.textContent = message.self ? 'You' : (message.name || 'Nearby');
  row.append(name, document.createTextNode(`: ${message.text}`));
  chatLog.appendChild(row);
  while (chatLog.children.length > 40) chatLog.firstElementChild?.remove();
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setCommsStatus(text) {
  if (commsStatus) commsStatus.textContent = text;
}

async function refreshVoiceDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((device) => device.kind === 'audioinput');
  const outputs = devices.filter((device) => device.kind === 'audiooutput');

  if (voiceInputSelect) {
    const current = voiceInputSelect.value || comms.inputDeviceId;
    voiceInputSelect.innerHTML = '<option value="">Default microphone</option>';
    inputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      voiceInputSelect.appendChild(option);
    });
    voiceInputSelect.value = current;
    comms.inputDeviceId = voiceInputSelect.value;
  }

  if (voiceOutputSelect) {
    const current = voiceOutputSelect.value || comms.outputDeviceId;
    voiceOutputSelect.innerHTML = '<option value="">Default speaker</option>';
    outputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Speaker ${index + 1}`;
      voiceOutputSelect.appendChild(option);
    });
    voiceOutputSelect.value = current;
    comms.outputDeviceId = voiceOutputSelect.value;
  }
}

function connectComms() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/wageworld-live`);
  comms.ws = ws;

  ws.addEventListener('open', () => {
    setCommsStatus('Nearby chat connected. Voice is proximity based.');
    sendPresence(true);
  });

  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (_) {
      return;
    }
    if (message.type === 'welcome') {
      comms.id = message.id;
      sendPresence(true);
    } else if (message.type === 'nearby') {
      comms.nearby = message.peers || [];
      setCommsStatus(`${comms.nearby.length} nearby. Chat radius ${message.chatRadius}m. Voice radius ${message.voiceRadius}m.`);
      syncVoicePeers();
    } else if (message.type === 'chat') {
      appendChatMessage(message);
    } else if (message.type === 'peer-left') {
      closeVoicePeer(message.id);
    } else if (message.type === 'voice-offer') {
      handleVoiceOffer(message);
    } else if (message.type === 'voice-answer') {
      handleVoiceAnswer(message);
    } else if (message.type === 'voice-ice') {
      handleVoiceIce(message);
    }
  });

  ws.addEventListener('close', () => {
    setCommsStatus('Nearby chat disconnected. Reconnecting...');
    setTimeout(connectComms, 2500);
  });
}

function sendLive(payload) {
  if (!comms.ws || comms.ws.readyState !== WebSocket.OPEN) return;
  comms.ws.send(JSON.stringify(payload));
}

function sendPresence(force = false) {
  const now = performance.now();
  if (!force && now - comms.lastPresenceSent < 500) return;
  comms.lastPresenceSent = now;
  sendLive({
    type: 'presence',
    name: characterState.name,
    map: worldState.currentMap,
    x: player.position.x,
    z: player.position.z,
    voice: comms.voiceEnabled,
  });
}

chatForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput?.value.trim();
  if (!text) return;
  sendLive({ type: 'chat', text });
  chatInput.value = '';
});

async function enableVoice() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setCommsStatus('Voice is not available in this browser.');
    return;
  }
  comms.localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: comms.inputDeviceId ? { exact: comms.inputDeviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  comms.voiceEnabled = true;
  await refreshVoiceDevices();
  voiceToggle?.classList.add('is-on');
  voiceToggle?.setAttribute('aria-pressed', 'true');
  if (voiceToggle) voiceToggle.textContent = 'Voice On';
  sendPresence(true);
  syncVoicePeers();
}

function disableVoice() {
  comms.voiceEnabled = false;
  comms.localStream?.getTracks().forEach((track) => track.stop());
  comms.localStream = null;
  Array.from(comms.peers.keys()).forEach(closeVoicePeer);
  voiceToggle?.classList.remove('is-on');
  voiceToggle?.setAttribute('aria-pressed', 'false');
  if (voiceToggle) voiceToggle.textContent = 'Voice Off';
  sendPresence(true);
}

voiceToggle?.addEventListener('click', async () => {
  try {
    if (comms.voiceEnabled) disableVoice();
    else await enableVoice();
  } catch (err) {
    setCommsStatus(`Voice permission failed: ${err.message}`);
  }
});

voiceInputSelect?.addEventListener('change', async () => {
  comms.inputDeviceId = voiceInputSelect.value;
  if (comms.voiceEnabled) {
    disableVoice();
    await enableVoice();
  }
});

voiceOutputSelect?.addEventListener('change', () => {
  comms.outputDeviceId = voiceOutputSelect.value;
  comms.peers.forEach((peer) => {
    if (peer.audio.setSinkId && comms.outputDeviceId) {
      peer.audio.setSinkId(comms.outputDeviceId).catch(() => {});
    }
  });
});

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const audio = new Audio();
  audio.autoplay = true;
  audio.volume = worldState.voiceVolume * worldState.masterVolume;
  if (audio.setSinkId && comms.outputDeviceId) {
    audio.setSinkId(comms.outputDeviceId).catch(() => {});
  }
  pc.ontrack = (event) => {
    audio.srcObject = event.streams[0];
  };
  pc.onicecandidate = (event) => {
    if (event.candidate) sendLive({ type: 'voice-ice', to: peerId, data: event.candidate });
  };
  comms.localStream?.getTracks().forEach((track) => pc.addTrack(track, comms.localStream));
  comms.peers.set(peerId, { pc, audio });
  return pc;
}

function closeVoicePeer(peerId) {
  const peer = comms.peers.get(peerId);
  if (!peer) return;
  peer.pc.close();
  peer.audio.remove();
  comms.peers.delete(peerId);
}

async function syncVoicePeers() {
  if (!comms.voiceEnabled || !comms.localStream || !comms.id) return;
  const nearbyIds = new Set(comms.nearby.map((peer) => peer.id));
  Array.from(comms.peers.keys()).forEach((peerId) => {
    if (!nearbyIds.has(peerId)) closeVoicePeer(peerId);
  });
  for (const peer of comms.nearby) {
    if (comms.peers.has(peer.id)) continue;
    if (comms.id > peer.id) continue;
    const pc = createPeerConnection(peer.id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendLive({ type: 'voice-offer', to: peer.id, data: offer });
  }
}

async function handleVoiceOffer(message) {
  if (!comms.voiceEnabled || !comms.localStream) return;
  const pc = comms.peers.get(message.from)?.pc || createPeerConnection(message.from);
  await pc.setRemoteDescription(message.data);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendLive({ type: 'voice-answer', to: message.from, data: answer });
}

async function handleVoiceAnswer(message) {
  const pc = comms.peers.get(message.from)?.pc;
  if (!pc) return;
  await pc.setRemoteDescription(message.data);
}

async function handleVoiceIce(message) {
  const pc = comms.peers.get(message.from)?.pc;
  if (!pc || !message.data) return;
  await pc.addIceCandidate(message.data);
}

const keyMap = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
};

window.addEventListener('keydown', (event) => {
  if (isTypingTarget(event.target)) return;
  const key = keyMap[event.code];
  if (!key) return;
  keys[key] = true;
  event.preventDefault();
});

window.addEventListener('keyup', (event) => {
  const key = keyMap[event.code];
  if (!key) return;
  keys[key] = false;
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') closeSettings();
  if (event.code === 'Escape') closeCharacterMenu();
  if (event.code === 'KeyV' && !isTypingTarget(event.target)) {
    cycleCameraMode();
    event.preventDefault();
  }
  if (event.code === 'KeyE' && !isTypingTarget(event.target)) {
    activateInteractable();
  }
});

moveButtons.forEach((button) => {
  const move = button.dataset.move;
  const down = (event) => {
    event.preventDefault();
    if (move === 'up') keys.forward = true;
    if (move === 'down') keys.backward = true;
    if (move === 'left') keys.left = true;
    if (move === 'right') keys.right = true;
  };
  const up = (event) => {
    event.preventDefault();
    if (move === 'up') keys.forward = false;
    if (move === 'down') keys.backward = false;
    if (move === 'left') keys.left = false;
    if (move === 'right') keys.right = false;
  };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('pointerleave', up);
});

function rotateCamera(deltaX, deltaY) {
  cameraRig.yaw -= deltaX * worldState.cameraSensitivity;
  cameraRig.pitch += deltaY * worldState.cameraSensitivity * (worldState.invertY ? 1 : -1);
  cameraRig.pitch = THREE.MathUtils.clamp(cameraRig.pitch, -1.15, 0.95);
}

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

canvas.addEventListener('pointerdown', (event) => {
  const isTouch = event.pointerType === 'touch';
  const isRightMouse = event.pointerType === 'mouse' && event.button === 2;
  if (!isTouch && !isRightMouse) return;
  cameraRig.dragging = true;
  cameraRig.activePointerId = event.pointerId;
  cameraRig.lastX = event.clientX;
  cameraRig.lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener('pointermove', (event) => {
  if (!cameraRig.dragging || event.pointerId !== cameraRig.activePointerId) return;
  rotateCamera(event.clientX - cameraRig.lastX, event.clientY - cameraRig.lastY);
  cameraRig.lastX = event.clientX;
  cameraRig.lastY = event.clientY;
  event.preventDefault();
});

function endCameraDrag(event) {
  if (event.pointerId !== cameraRig.activePointerId) return;
  cameraRig.dragging = false;
  cameraRig.activePointerId = null;
}

canvas.addEventListener('pointerup', endCameraDrag);
canvas.addEventListener('pointercancel', endCameraDrag);

function readGamepad() {
  if (!worldState.controllerEnabled) return { x: 0, z: 0, sprint: false };
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find(Boolean);
  if (!pad) return { x: 0, z: 0, sprint: false };
  const deadzone = worldState.controllerDeadzone;
  const axis = (value) => (Math.abs(value) > deadzone ? value : 0);
  const moveX = axis(pad.axes[0] || 0);
  const moveZ = axis(pad.axes[1] || 0);
  const lookX = axis(pad.axes[2] || 0);
  const lookY = axis(pad.axes[3] || 0);
  if (lookX || lookY) {
    cameraRig.yaw -= lookX * worldState.gamepadSensitivity * 0.016;
    cameraRig.pitch += lookY * worldState.gamepadSensitivity * 0.012 * (worldState.invertY ? 1 : -1);
    cameraRig.pitch = THREE.MathUtils.clamp(cameraRig.pitch, -1.15, 0.95);
  }
  return {
    x: moveX,
    z: moveZ,
    sprint: !!(pad.buttons[10]?.pressed || pad.buttons[0]?.pressed),
  };
}

function setCameraMode(mode) {
  const modes = ['firstPerson', 'thirdPersonBack', 'thirdPersonFront'];
  worldState.cameraMode = modes.includes(mode) ? mode : 'firstPerson';
  const cameraModeInput = settingsInputs.find((input) => input.dataset.setting === 'cameraMode');
  if (cameraModeInput && cameraModeInput.value !== worldState.cameraMode) cameraModeInput.value = worldState.cameraMode;
}

function cycleCameraMode() {
  const modes = ['firstPerson', 'thirdPersonBack', 'thirdPersonFront'];
  const nextIndex = (modes.indexOf(worldState.cameraMode) + 1) % modes.length;
  setCameraMode(modes[nextIndex]);
}

function resolveCollisions(previousPosition) {
  const playerRadius = 0.42;
  for (const collider of colliders.filter((item) => item.mapId === worldState.currentMapId)) {
    const dx = player.position.x - collider.x;
    const dz = player.position.z - collider.z;
    const distance = Math.hypot(dx, dz);
    const minDistance = playerRadius + collider.radius;
    if (distance < minDistance) {
      player.position.x = previousPosition.x;
      player.position.z = previousPosition.z;
      setGroundY(player);
      return;
    }
  }
}

function updateInteractionPrompt() {
  if (performance.now() < dialogueUntil) return;
  let nearest = null;
  let best = Infinity;
  interactables.filter((item) => item.userData.mapId === worldState.currentMapId).forEach((item) => {
    const distance = player.position.distanceTo(item.getWorldPosition(new THREE.Vector3()));
    if (distance < best && distance < 3.1) {
      best = distance;
      nearest = item;
    }
  });
  activeInteractable = nearest;
  if (!interactPrompt) return;
  if (!nearest) {
    interactPrompt.hidden = true;
    interactPrompt.textContent = '';
    return;
  }
  const action = nearest.userData.action || 'Interact';
  interactPrompt.hidden = false;
  interactPrompt.textContent = `${action}: ${nearest.userData.prompt || ''} Press E.`;
}

function activateInteractable() {
  if (!activeInteractable) return;
  const kind = activeInteractable.userData.kind;
  if (kind === 'character') {
    openCharacterMenu();
  } else if (kind === 'computer') {
    if (worldState.isAuthenticated) {
      openSettings();
    } else {
      window.location.href = '/login?next=/wageworld';
    }
  } else if (kind === 'bed') {
    localStorage.setItem('wageworld.spawnPoint', JSON.stringify({
      map: worldState.currentMap,
      x: player.position.x,
      z: player.position.z,
    }));
    if (interactPrompt) interactPrompt.textContent = 'Spawn point set to this bed.';
  } else if (kind === 'door') {
    activeInteractable.userData.isOpen = !activeInteractable.userData.isOpen;
    gsap.to(activeInteractable.rotation, {
      y: activeInteractable.userData.isOpen ? -Math.PI * 0.55 : 0,
      duration: 0.35,
      ease: 'power2.out',
      onComplete: () => {
        if (activeInteractable.userData.destinationMapId && activeInteractable.userData.isOpen) {
          switchMap(activeInteractable.userData.destinationMapId, mapConfig[activeInteractable.userData.destinationMapId]?.spawn);
        }
      },
    });
  } else if (kind === 'guide') {
    if (interactPrompt) {
      interactPrompt.hidden = false;
      interactPrompt.textContent = `${activeInteractable.userData.name}: ${activeInteractable.userData.message}`;
      dialogueUntil = performance.now() + 6000;
    }
  }
}

function movePlayer(delta) {
  player.rotation.y = cameraRig.yaw + Math.PI;
  const gamepad = readGamepad();
  const horizontalInput = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) + gamepad.x;
  const forwardInput = ((keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)) - gamepad.z;
  const input = new THREE.Vector3(
    horizontalInput,
    0,
    forwardInput
  );

  const moving = input.lengthSq() > 0;
  if (moving) {
    const previousPosition = player.position.clone();
    if (input.lengthSq() > 1) input.normalize();
    const forward = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
    const right = new THREE.Vector3(Math.cos(player.rotation.y), 0, -Math.sin(player.rotation.y));
    const movement = forward.multiplyScalar(input.z).add(right.multiplyScalar(input.x));
    const speed = worldState.speed * (keys.sprint || gamepad.sprint ? 1.45 : 1);
    player.position.addScaledVector(movement, speed * delta);
    const bounds = mapConfig[worldState.currentMapId]?.bounds || mapConfig.hub.bounds;
    player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
    setGroundY(player);
    resolveCollisions(previousPosition);
  }

  const walk = moving ? Math.sin(elapsedTime * (keys.sprint || gamepad.sprint ? 16 : 11)) : 0;
  player.position.y += Math.abs(walk) * 0.045;
  player.userData.limbs.forEach((limb, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    limb.rotation.x = walk * side * 0.55;
  });
}

function updateCamera(delta) {
  player.rotation.y = cameraRig.yaw + Math.PI;
  const eyeTarget = player.position.clone().add(new THREE.Vector3(0, 1.58, 0));
  player.visible = worldState.cameraMode !== 'firstPerson';

  if (worldState.cameraMode === 'firstPerson') {
    const desired = player.position.clone().add(new THREE.Vector3(0, 1.58, 0));
    camera.position.lerp(desired, 1 - Math.pow(0.0004, delta));
    const lookTarget = desired.clone().add(new THREE.Vector3(
      -Math.sin(cameraRig.yaw) * Math.cos(cameraRig.pitch),
      -Math.sin(cameraRig.pitch),
      -Math.cos(cameraRig.yaw) * Math.cos(cameraRig.pitch)
    ));
    camera.lookAt(lookTarget);
    return;
  }

  const frontMode = worldState.cameraMode === 'thirdPersonFront';
  const yawOffset = frontMode ? Math.PI : 0;
  const horizontal = Math.cos(cameraRig.pitch) * worldState.followDistance;
  const desired = new THREE.Vector3(
    player.position.x + Math.sin(cameraRig.yaw + yawOffset) * horizontal,
    player.position.y + worldState.followHeight + Math.abs(Math.sin(cameraRig.pitch)) * 6,
    player.position.z + Math.cos(cameraRig.yaw + yawOffset) * horizontal
  );
  camera.position.lerp(desired, 1 - Math.pow(0.002, delta));
  camera.lookAt(eyeTarget);
}

function updateGuides() {
  worldObjects.guides.forEach((npc) => {
    npc.position.y = terrainHeight(npc.position.x, npc.position.z) + Math.sin(elapsedTime * 2 + npc.userData.phase) * 0.035;
    npc.lookAt(player.position.x, npc.position.y, player.position.z);
  });
}

function updatePickups() {
  worldObjects.pickups.forEach((pickup) => {
    if (!pickup.visible) return;
    pickup.rotation.y += 0.035;
    pickup.userData.coin.rotation.z += 0.05;
    pickup.position.y = terrainHeight(pickup.position.x, pickup.position.z) + 1.1 + Math.sin(elapsedTime * 2.3 + pickup.position.x) * 0.12;
    if (pickup.position.distanceTo(player.position) < 1.25) {
      pickup.visible = false;
      worldState.earnings += 125;
      if (resourceValue) resourceValue.textContent = `$${worldState.earnings.toLocaleString()}`;
    }
  });
}

function animateWorld(delta) {
  if (worldObjects.rewardMachine?.userData.wheel) {
    worldObjects.rewardMachine.userData.wheel.rotation.z += delta * 1.8;
  }
  worldObjects.clouds.forEach((cloud, index) => {
    cloud.position.x += delta * (0.7 + index * 0.15);
    if (cloud.position.x > 46) cloud.position.x = -46;
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
});

function animate() {
  const now = performance.now() * 0.001;
  const delta = Math.min(now - lastFrameTime, 0.033);
  lastFrameTime = now;
  elapsedTime += delta;

  movePlayer(delta);
  updateCamera(delta);
  updateGuides(delta);
  updatePickups();
  animateWorld(delta);
  updateInteractionPrompt();
  updateLoginPrompt();
  sendPresence();

  const currentDistrict = nearestDistrict();
  if (currentDistrict !== worldState.focus) updateHud(currentDistrict);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(() => {
  if (loading) loading.classList.add('is-hidden');
  clearInterval(loadingQuoteTimer);
  refreshVoiceDevices().catch(() => {});
  connectComms();
  animate();
});
