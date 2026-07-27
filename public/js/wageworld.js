import * as THREE from 'three';
import { gsap } from '/vendor/gsap/index.js';
import { createNoise2D } from '/vendor/simplex-noise/dist/esm/simplex-noise.js';

const canvas = document.getElementById('wageworld-canvas');
const loading = document.querySelector('[data-wageworld-loading]');
const loadingQuote = document.querySelector('[data-loading-quote]');
const focusLabel = document.querySelector('[data-focus-label]');
const focusValue = document.querySelector('[data-focus-value]');
const resourceValue = document.querySelector('[data-resource-value]');
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
const interactPrompt = document.querySelector('[data-interact-prompt]');
const chatLog = document.querySelector('[data-chat-log]');
const chatForm = document.querySelector('[data-chat-form]');
const chatInput = document.querySelector('[data-chat-input]');
const voiceToggle = document.querySelector('[data-voice-toggle]');
const commsStatus = document.querySelector('[data-comms-status]');
const voiceIndicator = document.querySelector('[data-voice-indicator]');
const voiceLevelFill = voiceIndicator?.querySelector('.ww-voice-level-fill');
const voiceInputSelect = document.querySelector('[data-voice-input]');
const voiceOutputSelect = document.querySelector('[data-voice-output]');
const inventoryToggle = document.querySelector('[data-inventory-toggle]');
const inventoryMenu = document.querySelector('[data-inventory-menu]');
const inventoryClose = document.querySelector('[data-inventory-close]');
const inventoryList = document.querySelector('[data-inventory-list]');
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
  ['Hotel Suites', { position: new THREE.Vector3(14, 0, 10), status: 'Private hotel', requiresAuth: true }],
  ['Live Arena', { position: new THREE.Vector3(-20, 0, -11), status: 'Stage live', requiresAuth: true }],
  ['Guild Tower', { position: new THREE.Vector3(-17, 0, 17), status: 'Guides ready', requiresAuth: true }],
  ['Reward Works', { position: new THREE.Vector3(18, 0, 16), status: 'Rewards minting', requiresAuth: true }],
]);

const districts = new Map([
  ['Spawn House', { position: new THREE.Vector3(0, 0, 0), color: 0xf59e0b, status: 'Home spawn' }],
  ['Creator Plaza', { position: new THREE.Vector3(0, 0, 0), color: 0xf59e0b, status: 'Village center' }],
  ['Market Row', { position: new THREE.Vector3(19, 0, -13), color: 0xf59e0b, status: 'Shops open' }],
  ['Hotel Suites', { position: new THREE.Vector3(14, 0, 10), color: 0x8b5cf6, status: 'Private hotel' }],
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
  tokenBalance: Number(bootstrap.tokenBalance || 0),
  tokenSymbol: 'WAGE',
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
  invertY: true,
};

const localClaimedPickups = new Set(JSON.parse(localStorage.getItem('wageworld.claimedPickups') || '[]'));

const inventoryState = {
  items: JSON.parse(localStorage.getItem('wageworld.inventory') || '[]'),
};

function saveInventory() {
  localStorage.setItem('wageworld.inventory', JSON.stringify(inventoryState.items));
}

function addInventoryItem(item) {
  if (!item || !item.id) return;
  if (inventoryState.items.some((existing) => existing.id === item.id)) return;
  inventoryState.items.unshift(item);
  saveInventory();
  renderInventory();
}

function removeInventoryItem(itemId) {
  inventoryState.items = inventoryState.items.filter((item) => item.id !== itemId);
  saveInventory();
  renderInventory();
}

function renderInventory() {
  if (!inventoryList) return;
  inventoryList.innerHTML = '';
  if (!inventoryState.items.length) {
    inventoryList.innerHTML = '<div class="ww-inventory-empty">You are not carrying any items.</div>';
    return;
  }

  inventoryState.items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'ww-inventory-item';

    const info = document.createElement('div');
    info.className = 'ww-inventory-item-info';

    const title = document.createElement('div');
    title.className = 'ww-inventory-item-name';
    title.textContent = item.name || 'Unknown item';

    const meta = document.createElement('div');
    meta.className = 'ww-inventory-item-meta';
    const details = [];
    if (item.description) details.push(item.description);
    if (item.amount != null) details.push(`${item.amount} ${item.amount === 1 ? 'unit' : 'units'}`);
    if (item.type) details.push(item.type);
    meta.textContent = details.filter(Boolean).join(' · ') || 'Carried item';

    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'ww-inventory-item-actions';
    const drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'ww-setting-action';
    drop.textContent = 'Drop';
    drop.addEventListener('click', () => removeInventoryItem(item.id));
    actions.append(drop);

    row.append(info, actions);
    inventoryList.append(row);
  });
}

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
  audioContext: null,
  analyser: null,
  microphoneSource: null,
  voiceData: null,
  voiceLevel: 0,
  isSpeaking: false,
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
  market: {
    label: 'Market Row',
    status: 'Market shops',
    bounds: { minX: -11.5, maxX: 11.5, minZ: -8.5, maxZ: 8.5 },
    spawn: new THREE.Vector3(0, 0, 4.5),
  },
  hotel: {
    label: 'Hotel Suites',
    status: 'Private hotel',
    bounds: { minX: -10.5, maxX: 10.5, minZ: -7.5, maxZ: 9.5 },
    spawn: new THREE.Vector3(0, 0, 4.5),
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

function formatTokenBalance(value = worldState.tokenBalance) {
  return `${Math.max(0, Number(value || 0)).toLocaleString()} ${worldState.tokenSymbol}`;
}

function updateTokenHud() {
  if (resourceValue) resourceValue.textContent = formatTokenBalance();
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
  market: new THREE.Group(),
  hotel: new THREE.Group(),
};
mapGroups.home.name = 'Home Map';
mapGroups.hub.name = 'Hub Map';
mapGroups.market.name = 'Market Map';
mapGroups.hotel.name = 'Hotel Map';
scene.add(mapGroups.home, mapGroups.hub, mapGroups.market, mapGroups.hotel);

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
  trim: new THREE.MeshStandardMaterial({ color: 0x2f3a45, roughness: 0.68 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.32, metalness: 0.62 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9bd8ff, roughness: 0.16, metalness: 0.03, transparent: true, opacity: 0.62 }),
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
  fruitRed: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.52 }),
  fruitBlue: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.52 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.58 }),
};

function terrainHeight(x, z) {
  const softHills = noise2D(x * 0.045, z * 0.045) * 0.32;
  const detail = noise2D(x * 0.13, z * 0.13) * 0.08;
  const plaza = Math.max(0, 1 - Math.hypot(x, z) / 13);
  return (softHills + detail) * (1 - plaza * 0.9);
}

function groundHeight(x, z, mapId = activeMapId) {
  return mapId === 'home' || mapId === 'market' || mapId === 'hotel' ? 0.12 : terrainHeight(x, z);
}

function setGroundY(object, lift = 0) {
  object.position.y = groundHeight(object.position.x, object.position.z, object.userData?.mapId || activeMapId) + lift;
}

function makeBox(width, height, depth, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCylinder(radiusTop, radiusBottom, height, material, x = 0, y = 0, z = 0, segments = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
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

function createDoorPortal(x, z, rotation, destinationMapId, promptText, colliderLabel) {
  const doorPivot = new THREE.Group();
  doorPivot.position.set(x, 0.1, z);
  doorPivot.rotation.y = rotation;

  const door = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.7, 0.16), mat.darkWood);
  door.position.set(1.05, 1.35, 0);
  door.castShadow = true;
  doorPivot.add(door);

  const header = makeBox(2.4, 0.23, 0.18, mat.trim, 1.05, 2.55, 0);
  doorPivot.add(header);

  doorPivot.userData.kind = 'door';
  doorPivot.userData.prompt = promptText;
  doorPivot.userData.action = 'Use door';
  doorPivot.userData.isOpen = false;
  doorPivot.userData.destinationMapId = destinationMapId;
  doorPivot.userData.mapId = activeMapId;

  interactables.push(doorPivot);
  addCollider(x, z, 1.4, colliderLabel || `door to ${destinationMapId}`);
  return doorPivot;
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
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.26 * scale, 1.55 * scale, 14), mat.wood);
  trunk.position.y = 0.7 * scale;
  trunk.castShadow = true;
  tree.add(trunk);

  for (let i = 0; i < 3; i += 1) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * scale, 0.075 * scale, 0.95 * scale, 8), mat.wood);
    branch.position.set((i - 1) * 0.22 * scale, (1.12 + i * 0.18) * scale, 0.04 * scale);
    branch.rotation.z = (i - 1) * 0.58;
    branch.rotation.x = 0.42;
    branch.castShadow = true;
    tree.add(branch);
  }

  const leafMat = new THREE.MeshStandardMaterial({ color: scale > 1.05 ? 0x3f9b46 : 0x4caf50, roughness: 0.72 });
  for (let i = 0; i < 5; i += 1) {
    const crown = new THREE.Mesh(new THREE.SphereGeometry((0.72 - Math.min(i, 2) * 0.05) * scale, 18, 14), leafMat);
    crown.position.set((i - 1) * 0.18 * scale, (1.5 + i * 0.42) * scale, (i % 2) * 0.18 * scale);
    crown.castShadow = true;
    tree.add(crown);
  }

  if (scale > 1.05) {
    for (let i = 0; i < 3; i += 1) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 10, 8), i % 2 ? mat.fruitRed : mat.reward);
      fruit.position.set((i - 1) * 0.42 * scale, (2.0 + i * 0.3) * scale, 0.32 * scale);
      fruit.castShadow = true;
      tree.add(fruit);
    }
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

  const trimTop = makeBox(4.36, 0.16, 0.18, mat.trim, 0, 2.76, 1.84);
  const trimBottom = makeBox(4.28, 0.14, 0.18, mat.trim, 0, 0.18, 1.84);
  house.add(trimTop, trimBottom);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.35, 0.08), mat.darkWood);
  door.position.set(0, 0.78, 1.79);
  house.add(door);
  const doorFrame = makeBox(1.02, 1.55, 0.12, mat.trim, 0, 0.86, 1.84);
  const doorCutout = makeBox(0.74, 1.25, 0.14, mat.darkWood, 0, 0.78, 1.91);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mat.metal);
  knob.position.set(0.27, 0.8, 1.98);
  house.add(doorFrame, doorCutout, knob);

  [-1.35, 1.35].forEach((wx) => {
    const frame = makeBox(0.88, 0.72, 0.12, mat.trim, wx, 1.55, 1.86);
    const glass = makeBox(0.66, 0.5, 0.13, mat.glass, wx, 1.55, 1.94);
    const crossA = makeBox(0.72, 0.05, 0.14, mat.trim, wx, 1.55, 2.02);
    const crossB = makeBox(0.05, 0.58, 0.14, mat.trim, wx, 1.55, 2.03);
    house.add(frame, glass, crossA, crossB);
  });

  const stepA = makeBox(1.7, 0.18, 0.62, mat.stone, 0, 0.1, 2.18);
  const stepB = makeBox(2.15, 0.14, 0.72, mat.stone, 0, -0.02, 2.58);
  const chimney = makeBox(0.42, 1.1, 0.42, mat.darkWood, -1.35, 4.18, -0.6);
  house.add(stepA, stepB, chimney);

  const sign = makeBillboard(name, roofMaterial.color.getHex(), 2.6, 0.72);
  sign.position.set(0, 3.15, 2.05);
  house.add(sign);

  const awning = makeBox(4.4, 0.2, 0.5, mat.trim, 0, 2.16, 1.78);
  house.add(awning);

  house.position.set(x, 0, z);
  setGroundY(house);
  addToActiveMap(house);
  addCollider(x, z, 2.9, name);
  return house;
}

function makeMarketRoom() {
  const room = new THREE.Group();
  const floor = makeBox(24, 0.18, 18, mat.floor, 0, 0.09, 0);
  room.add(floor);

  const wallBack = makeBox(24, 4.8, 0.3, mat.wall, 0, 2.4, -8.9);
  const wallFront = makeBox(24, 4.8, 0.3, mat.wall, 0, 2.4, 8.9);
  const wallLeft = makeBox(0.3, 4.8, 18, mat.wall, -11.85, 2.4, 0);
  const wallRight = wallLeft.clone();
  wallRight.position.x = 11.85;
  room.add(wallBack, wallFront, wallLeft, wallRight);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(24.4, 0.65, 18.4), mat.roofGold);
  roof.position.set(0, 5.1, 0);
  roof.castShadow = true;
  room.add(roof);

  const canopy = makeBox(24, 0.2, 2.1, mat.roofGold, 0, 4.5, -6.8);
  const canopy2 = makeBox(24, 0.2, 2.1, mat.roofGold, 0, 4.5, 6.8);
  room.add(canopy, canopy2);

  const marketSign = makeBillboard('Market Hall', 0xf59e0b, 4.2, 1.1);
  marketSign.position.set(0, 3.95, 8.15);
  room.add(marketSign);

  for (let i = -3; i <= 3; i += 3) {
    const stall = new THREE.Group();
    const counter = makeBox(4.6, 0.9, 1.4, mat.wood, 0, 0.45, 0);
    const canopy = makeBox(4.8, 0.18, 2.4, mat.roofCyan, 0, 1.45, 0);
    const poleL = makeCylinder(0.08, 0.08, 1.8, mat.metal, -2.2, 0.9, 0.68, 12);
    const poleR = makeCylinder(0.08, 0.08, 1.8, mat.metal, 2.2, 0.9, 0.68, 12);
    stall.add(counter, canopy, poleL, poleR);
    stall.position.set(-7, 0, i);
    stall.userData.kind = 'stall';
    stall.userData.prompt = 'Browse the market stalls.';
    stall.userData.action = 'Browse';
    interactables.push(stall);
    room.add(stall);
    addCollider(-7, i, 1.8, 'market stall');
  }

  for (let i = -3; i <= 3; i += 3) {
    const stall = new THREE.Group();
    const counter = makeBox(4.6, 0.9, 1.4, mat.wood, 0, 0.45, 0);
    const canopy = makeBox(4.8, 0.18, 2.4, mat.roofGreen, 0, 1.45, 0);
    const poleL = makeCylinder(0.08, 0.08, 1.8, mat.metal, -2.2, 0.9, 0.68, 12);
    const poleR = makeCylinder(0.08, 0.08, 1.8, mat.metal, 2.2, 0.9, 0.68, 12);
    stall.add(counter, canopy, poleL, poleR);
    stall.position.set(7, 0, i);
    stall.userData.kind = 'stall';
    stall.userData.prompt = 'Browse the market stalls.';
    stall.userData.action = 'Browse';
    interactables.push(stall);
    room.add(stall);
    addCollider(7, i, 1.8, 'market stall');
  }

  const backDoor = createDoorPortal(0, 8.1, Math.PI, 'hub', 'Exit to Creator Plaza', 'market exit');
  room.add(backDoor);
  room.userData.mapId = activeMapId;
  room.position.set(0, 0, 0);
  addToActiveMap(room);
  addCollider(0, 0, 10.5, 'market walls');
}

function makeHotelRoom() {
  const hotel = new THREE.Group();
  const floor = makeBox(20, 0.18, 16, mat.floor, 0, 0.09, 0);
  hotel.add(floor);

  const wallBack = makeBox(20, 5.2, 0.3, mat.wall, 0, 2.6, -7.9);
  const wallFront = makeBox(20, 5.2, 0.3, mat.wall, 0, 2.6, 7.9);
  const wallLeft = makeBox(0.3, 5.2, 16, mat.wall, -9.85, 2.6, 0);
  const wallRight = wallLeft.clone();
  wallRight.position.x = 9.85;
  hotel.add(wallBack, wallFront, wallLeft, wallRight);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.65, 16.4), mat.roofViolet);
  roof.position.set(0, 5.4, 0);
  roof.castShadow = true;
  hotel.add(roof);

  const reception = new THREE.Group();
  const desk = makeBox(6.2, 1.05, 1.6, mat.wood, 0, 0.53, 5.5);
  const deskTop = makeBox(6.2, 0.12, 1.6, mat.trim, 0, 1.01, 5.5);
  reception.add(desk, deskTop);
  const regSign = makeBillboard('Register for Private Suites', 0x8b5cf6, 4.2, 0.9);
  regSign.position.set(0, 2.35, 5.2);
  reception.add(regSign);
  hotel.add(reception);

  for (let i = 0; i < 3; i += 1) {
    const roomSuite = new THREE.Group();
    const suiteFloor = makeBox(5.4, 0.18, 4.2, mat.path, 0, 0.09, -1.2 + i * -5.4);
    const bed = makeBox(2.4, 0.45, 1.4, mat.blanket, 0, 0.42, -1.2 + i * -5.4);
    const wardrobe = makeBox(1.1, 2.3, 0.8, mat.darkWood, 1.7, 1.2, -1.2 + i * -5.4);
    roomSuite.add(suiteFloor, bed, wardrobe);
    const suiteDoor = createDoorPortal(8.5, -1.2 + i * -5.4, -Math.PI / 2, 'hotel', 'Enter suite', 'hotel suite door');
    suiteDoor.position.set(8.5, 0, -1.2 + i * -5.4);
    roomSuite.add(suiteDoor);
    addCollider(8.5, -1.2 + i * -5.4, 1.3, 'suite door');
    hotel.add(roomSuite);
  }

  const lobbySign = makeBillboard('Hotel Suites', 0x8b5cf6, 4.2, 0.9);
  lobbySign.position.set(0, 3.8, 6.2);
  hotel.add(lobbySign);
  const backDoor = createDoorPortal(0, 7.7, Math.PI, 'hub', 'Exit to Creator Plaza', 'hotel exit');
  hotel.add(backDoor);

  hotel.position.set(0, 0, 0);
  addToActiveMap(hotel);
  addCollider(0, 0, 9.5, 'hotel walls');
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
  const shelf = makeBox(3.2, 0.12, 1.35, mat.darkWood, 0, 1.13, 0);
  stall.add(shelf);
  for (let i = 0; i < 5; i += 1) {
    const stripe = makeBox(0.78, 0.24, 2.1, i % 2 ? mat.cream : colorMaterial, -1.56 + i * 0.78, 1.62, 0);
    stall.add(stripe);
  }
  const poleL = makeCylinder(0.05, 0.05, 1.8, mat.metal, -1.82, 0.9, 0.78, 10);
  const poleR = makeCylinder(0.05, 0.05, 1.8, mat.metal, 1.82, 0.9, 0.78, 10);
  stall.add(poleL, poleR);
  for (let i = 0; i < 8; i += 1) {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), i % 2 ? mat.fruitRed : mat.fruitBlue);
    fruit.position.set(-1.35 + (i % 4) * 0.9, 1.28, -0.24 + Math.floor(i / 4) * 0.45);
    fruit.castShadow = true;
    stall.add(fruit);
  }
  const crate = makeBox(0.86, 0.5, 0.58, mat.darkWood, 1.18, 0.34, 0.98);
  stall.add(crate);
  stall.position.set(x, 0, z);
  setGroundY(stall);
  addToActiveMap(stall);
  addCollider(x, z, 2.1, 'stall');
}

function makeStage(x, z) {
  const stage = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.65, 36), mat.black);
  deck.position.y = 0.38;
  deck.castShadow = true;
  deck.receiveShadow = true;
  stage.add(deck);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.1, 0.18), mat.roofCyan);
  screen.position.set(0, 2.35, -2.6);
  screen.castShadow = true;
  stage.add(screen);
  const frameTop = makeBox(6.4, 0.18, 0.18, mat.metal, 0, 4.05, -2.52);
  const frameL = makeBox(0.18, 3.6, 0.18, mat.metal, -3.25, 2.35, -2.52);
  const frameR = makeBox(0.18, 3.6, 0.18, mat.metal, 3.25, 2.35, -2.52);
  const speakerL = makeBox(0.78, 1.25, 0.62, mat.black, -4.0, 1.0, -0.85);
  const speakerR = makeBox(0.78, 1.25, 0.62, mat.black, 4.0, 1.0, -0.85);
  stage.add(frameTop, frameL, frameR, speakerL, speakerR);
  [-1.8, 0, 1.8].forEach((lx) => {
    const lamp = makeCylinder(0.18, 0.24, 0.28, mat.metal, lx, 3.86, -2.25, 16);
    lamp.rotation.x = Math.PI / 2;
    const glow = new THREE.PointLight(lx === 0 ? 0xf59e0b : 0x18c7d5, 1.8, 8);
    glow.position.set(lx, 3.65, -1.85);
    stage.add(lamp, glow);
  });
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
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.1, 6.5, 16), mat.stone);
  base.position.y = 3.4;
  base.castShadow = true;
  tower.add(base);
  for (let i = 0; i < 3; i += 1) {
    const ring = makeCylinder(2.6 - i * 0.18, 2.8 - i * 0.18, 0.16, mat.trim, 0, 1.35 + i * 1.8, 0, 16);
    tower.add(ring);
  }
  for (let i = 0; i < 4; i += 1) {
    const window = makeBox(0.44, 0.82, 0.08, mat.glass, Math.sin(i * Math.PI / 2) * 2.52, 3.2, Math.cos(i * Math.PI / 2) * 2.52);
    window.rotation.y = i * Math.PI / 2;
    tower.add(window);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.8, 16), mat.roofViolet);
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
  const glass = makeBox(2.2, 1.28, 0.12, mat.glass, 0, 1.62, 1.62);
  const tray = makeBox(2.7, 0.28, 0.5, mat.metal, 0, 0.58, 1.72);
  group.add(glass, tray);
  for (let i = 0; i < 5; i += 1) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), i % 2 ? mat.roofGreen : mat.reward);
    button.position.set(-1.35 + i * 0.68, 1.03, 1.76);
    button.castShadow = true;
    group.add(button);
  }
  const antenna = makeCylinder(0.025, 0.035, 0.9, mat.metal, 1.55, 2.95, 0, 8);
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat.reward);
  antennaTip.position.set(1.55, 3.45, 0);
  group.add(antenna, antennaTip);
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

function makeBench(x, z, rotation = 0) {
  const bench = new THREE.Group();
  bench.add(makeBox(2.2, 0.18, 0.56, mat.wood, 0, 0.82, 0));
  bench.add(makeBox(2.2, 0.18, 0.18, mat.wood, 0, 1.18, -0.32));
  [-0.82, 0.82].forEach((lx) => {
    bench.add(makeBox(0.14, 0.8, 0.14, mat.metal, lx, 0.42, -0.18));
    bench.add(makeBox(0.14, 0.68, 0.14, mat.metal, lx, 0.36, 0.22));
  });
  bench.position.set(x, 0, z);
  bench.rotation.y = rotation;
  setGroundY(bench);
  addToActiveMap(bench);
  addCollider(x, z, 1.2, 'bench');
  return bench;
}

function makeStreetLamp(x, z, rotation = 0) {
  const lamp = new THREE.Group();
  lamp.add(makeCylinder(0.06, 0.08, 3.0, mat.metal, 0, 1.5, 0, 12));
  lamp.add(makeCylinder(0.26, 0.34, 0.16, mat.metal, 0, 0.08, 0, 16));
  const head = makeBox(0.56, 0.44, 0.56, mat.glass, 0, 3.06, 0);
  const cap = makeCylinder(0.22, 0.34, 0.18, mat.darkWood, 0, 3.38, 0, 16);
  const glow = new THREE.PointLight(0xffd166, 1.55, 9);
  glow.position.set(0, 3.03, 0);
  lamp.add(head, cap, glow);
  lamp.position.set(x, 0, z);
  lamp.rotation.y = rotation;
  setGroundY(lamp);
  addToActiveMap(lamp);
  addCollider(x, z, 0.42, 'street lamp');
  return lamp;
}

function makePlanter(x, z, rotation = 0) {
  const planter = new THREE.Group();
  planter.add(makeBox(1.35, 0.54, 0.78, mat.darkWood, 0, 0.34, 0));
  for (let i = 0; i < 5; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), i % 2 ? mat.roofGreen : mat.grass);
    leaf.position.set(-0.48 + i * 0.24, 0.74 + Math.sin(i) * 0.08, 0.02 + (i % 2) * 0.16);
    leaf.castShadow = true;
    planter.add(leaf);
  }
  planter.position.set(x, 0, z);
  planter.rotation.y = rotation;
  setGroundY(planter);
  addToActiveMap(planter);
  addCollider(x, z, 0.9, 'planter');
  return planter;
}

function makeBarrelStack(x, z, rotation = 0) {
  const stack = new THREE.Group();
  [[0, 0.38, 0], [0.42, 0.38, 0.12], [-0.42, 0.38, 0.08], [0.02, 0.9, 0.08]].forEach(([bx, by, bz]) => {
    const barrel = makeCylinder(0.28, 0.3, 0.72, mat.wood, bx, by, bz, 18);
    barrel.rotation.z = Math.PI / 2;
    stack.add(barrel);
    stack.add(makeCylinder(0.285, 0.285, 0.04, mat.metal, bx - 0.28, by, bz, 18));
    stack.add(makeCylinder(0.285, 0.285, 0.04, mat.metal, bx + 0.28, by, bz, 18));
  });
  stack.position.set(x, 0, z);
  stack.rotation.y = rotation;
  setGroundY(stack);
  addToActiveMap(stack);
  addCollider(x, z, 1.05, 'barrels');
  return stack;
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

function makePickup(id, x, z, amount = 25) {
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
  pickup.userData.pickupId = id;
  pickup.userData.amount = amount;
  pickup.visible = !localClaimedPickups.has(id);
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
  makeHouse('Market Entrance', 20, -13, mat.roofGold);
  makeHouse('Reward Works', 18, 16, mat.roofGreen);
  makeHouse('Hotel Lobby', 10, 11, mat.roofViolet);
  makeStage(-20, -11);
  makeTower(-17, 17);
  const rewardMachine = makeRewardMachine(13, 18);

  makeStall(15.2, -17, mat.roofGold);
  makeStall(22.8, -9.2, mat.roofGold);
  makeBench(-4.2, 7.4, Math.PI * 0.08);
  makeBench(5.4, -6.6, -Math.PI * 0.18);
  makeBench(11.8, 8.6, Math.PI * 0.72);
  makeStreetLamp(-7.5, 6.5);
  makeStreetLamp(8.2, 6.7);
  makeStreetLamp(10.8, -8.4);
  makeStreetLamp(-11.4, -7.6);
  makePlanter(-2.8, 4.6, Math.PI * 0.12);
  makePlanter(3.0, 4.2, -Math.PI * 0.14);
  makePlanter(18.2, -18.4, Math.PI * 0.2);
  makeBarrelStack(17.9, -10.4, Math.PI * 0.28);
  makeBarrelStack(24.5, -14.2, -Math.PI * 0.18);
  makeFence(6, 8, 8, 0);
  makeFence(-8, -18, 9, Math.PI / 2);
  makeFence(23, 4, 7, 0.3);

  const marketDoor = createDoorPortal(20, -9.5, Math.PI, 'market', 'Enter Market Hall', 'Market entrance');
  const hotelDoor = createDoorPortal(10, 8.9, Math.PI * 0.5, 'hotel', 'Enter Hotel Suites', 'Hotel entrance');
  addToActiveMap(marketDoor);
  addToActiveMap(hotelDoor);

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
    makePickup('hub-token-01', -2.5, -7),
    makePickup('hub-token-02', 8, -12),
    makePickup('hub-token-03', 17, -8),
    makePickup('hub-token-04', -19, -16),
    makePickup('hub-token-05', -13, 13),
    makePickup('hub-token-06', 22, 19),
    makePickup('hub-token-07', 4, 16),
  ];

  const clouds = [
    makeCloud(-21, 22, -25, 1.5),
    makeCloud(18, 25, -28, 1.2),
    makeCloud(28, 19, 15, 1.1),
  ];

  activeMapId = 'market';
  makeMarketRoom();

  activeMapId = 'hotel';
  makeHotelRoom();

  activeMapId = 'home';
  mapGroups.home.visible = true;
  mapGroups.hub.visible = false;
  mapGroups.market.visible = false;
  mapGroups.hotel.visible = false;
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
  updateTokenHud();
}

async function loadTokenBalance() {
  try {
    const response = await fetch('/api/wageworld/rewards/balance', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const data = await response.json();
    worldState.isAuthenticated = !!data.authenticated;
    worldState.tokenSymbol = data.tokenSymbol || 'WAGE';
    worldState.tokenBalance = Number(data.balance || 0);
    updateTokenHud();
  } catch (_) {
    updateTokenHud();
  }
}

async function claimPickupReward(pickup) {
  const pickupId = pickup.userData.pickupId;
  if (!pickupId || localClaimedPickups.has(pickupId)) return;

  pickup.visible = false;

  if (!worldState.isAuthenticated) {
    addInventoryItem({
      id: pickupId,
      type: 'WAGE tokens',
      name: `WAGE Token +${pickup.userData.amount || 25}`,
      amount: Number(pickup.userData.amount || 25),
      description: 'Collected from the world',
    });

    localClaimedPickups.add(pickupId);
    localStorage.setItem('wageworld.claimedPickups', JSON.stringify([...localClaimedPickups]));
    worldState.tokenBalance += Number(pickup.userData.amount || 25);
    updateTokenHud();
    return;
  }

  try {
    const response = await fetch('/api/wageworld/rewards/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pickupId }),
    });
    if (response.status === 401) {
      worldState.isAuthenticated = false;
      localClaimedPickups.add(pickupId);
      localStorage.setItem('wageworld.claimedPickups', JSON.stringify([...localClaimedPickups]));
      worldState.tokenBalance += Number(pickup.userData.amount || 25);
      updateTokenHud();
      return;
    }
    if (!response.ok) throw new Error('Claim failed');
    const data = await response.json();
    addInventoryItem({
      id: pickupId,
      type: 'WAGE tokens',
      name: `WAGE Token +${pickup.userData.amount || 25}`,
      amount: Number(pickup.userData.amount || 25),
      description: 'Collected from the world',
    });
    worldState.tokenSymbol = data.tokenSymbol || worldState.tokenSymbol;
    worldState.tokenBalance = Number(data.balance ?? worldState.tokenBalance);
    localClaimedPickups.add(pickupId);
    localStorage.setItem('wageworld.claimedPickups', JSON.stringify([...localClaimedPickups]));
    updateTokenHud();
  } catch (_) {
    pickup.visible = true;
    updateTokenHud();
  }
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
  return !!target?.closest?.('input, textarea, select, button, [contenteditable="true"], .ww-settings, .ww-character, .ww-inventory');
}

function openSettings() {
  if (!settingsMenu || !settingsToggle) return;
  unlockPointer();
  settingsMenu.hidden = false;
  settingsToggle.setAttribute('aria-expanded', 'true');
  worldRoot?.classList.add('ww-menu-open');
  if (characterMenu && characterToggle) {
    characterMenu.hidden = true;
    characterToggle.setAttribute('aria-expanded', 'false');
  }
  closeInventoryMenu();
}

function closeSettings() {
  if (!settingsMenu || !settingsToggle) return;
  settingsMenu.hidden = true;
  settingsToggle.setAttribute('aria-expanded', 'false');
  if (characterMenu?.hidden !== false && inventoryMenu?.hidden !== false) worldRoot?.classList.remove('ww-menu-open');
}

settingsToggle?.addEventListener('click', () => {
  if (!settingsMenu) return;
  if (settingsMenu.hidden) openSettings();
  else closeSettings();
});

settingsClose?.addEventListener('click', closeSettings);

function openCharacterMenu() {
  if (!characterMenu) return;
  unlockPointer();
  syncCharacterInputs();
  characterMenu.hidden = false;
  characterToggle?.setAttribute('aria-expanded', 'true');
  worldRoot?.classList.add('ww-menu-open');
  closeSettings();
  closeInventoryMenu();
}

function closeCharacterMenu() {
  if (!characterMenu) return;
  characterMenu.hidden = true;
  characterToggle?.setAttribute('aria-expanded', 'false');
  if (settingsMenu?.hidden !== false && inventoryMenu?.hidden !== false) worldRoot?.classList.remove('ww-menu-open');
}

characterToggle?.addEventListener('click', () => {
  if (!characterMenu) return;
  if (characterMenu.hidden) openCharacterMenu();
  else closeCharacterMenu();
});

characterClose?.addEventListener('click', closeCharacterMenu);

function openInventoryMenu() {
  if (!inventoryMenu) return;
  unlockPointer();
  inventoryMenu.hidden = false;
  inventoryToggle?.setAttribute('aria-expanded', 'true');
  worldRoot?.classList.add('ww-menu-open');
  closeSettings();
  closeCharacterMenu();
  renderInventory();
}

function closeInventoryMenu() {
  if (!inventoryMenu) return;
  inventoryMenu.hidden = true;
  inventoryToggle?.setAttribute('aria-expanded', 'false');
  if (settingsMenu?.hidden !== false && characterMenu?.hidden !== false) worldRoot?.classList.remove('ww-menu-open');
}

inventoryToggle?.addEventListener('click', () => {
  if (!inventoryMenu) return;
  if (inventoryMenu.hidden) openInventoryMenu();
  else closeInventoryMenu();
});

inventoryClose?.addEventListener('click', closeInventoryMenu);

function toggleInventoryMenu() {
  if (!inventoryMenu) return;
  if (inventoryMenu.hidden) openInventoryMenu();
  else closeInventoryMenu();
}

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
    voiceInputSelect.disabled = inputs.length === 0;
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
    voiceOutputSelect.disabled = outputs.length === 0;
  }
}

function createVoiceAnalyser() {
  if (!comms.localStream) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  comms.audioContext = comms.audioContext || new AudioCtx();
  comms.microphoneSource = comms.audioContext.createMediaStreamSource(comms.localStream);
  comms.analyser = comms.audioContext.createAnalyser();
  comms.analyser.fftSize = 2048;
  comms.analyser.smoothingTimeConstant = 0.92;
  comms.microphoneSource.connect(comms.analyser);
  comms.voiceData = new Uint8Array(comms.analyser.fftSize);
  comms.voiceLevelSmoothed = 0;
  comms.isSpeaking = false;
}

function destroyVoiceAnalyser() {
  if (comms.analyser) {
    comms.analyser.disconnect();
    comms.analyser = null;
  }
  if (comms.microphoneSource) {
    comms.microphoneSource.disconnect();
    comms.microphoneSource = null;
  }
  if (comms.audioContext) {
    comms.audioContext.close().catch(() => {});
    comms.audioContext = null;
  }
  comms.voiceData = null;
  comms.voiceLevel = 0;
  comms.voiceLevelSmoothed = 0;
  comms.isSpeaking = false;
}

function updateVoiceActivity() {
  if (!comms.analyser || !comms.voiceData) return;
  comms.analyser.getByteTimeDomainData(comms.voiceData);
  let sum = 0;
  for (let i = 0; i < comms.voiceData.length; i += 1) {
    const sample = (comms.voiceData[i] - 128) / 128;
    sum += sample * sample;
  }
  comms.voiceLevel = Math.sqrt(sum / comms.voiceData.length);
  const level = Math.max(0, comms.voiceLevel - 0.01);
  comms.voiceLevelSmoothed = Math.max(0, comms.voiceLevelSmoothed * 0.88 + level * 0.12);
  comms.isSpeaking = comms.voiceLevelSmoothed > 0.04;
}

function updateVoiceIndicator() {
  if (!voiceIndicator) return;

  if (!comms.voiceEnabled) {
    voiceIndicator.classList.remove('is-on', 'is-active');
    if (voiceLevelFill) voiceLevelFill.style.width = '0%';
    return;
  }

  updateVoiceActivity();
  voiceIndicator.classList.add('is-on');
  if (comms.isSpeaking) {
    voiceIndicator.classList.add('is-active');
  } else {
    voiceIndicator.classList.remove('is-active');
  }

  const normalizedLevel = Math.min(1, comms.voiceLevelSmoothed * 2.5);
  if (voiceLevelFill) {
    voiceLevelFill.style.width = `${Math.round(normalizedLevel * 100)}%`;
    voiceLevelFill.style.opacity = normalizedLevel > 0 ? '1' : '0.4';
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
  createVoiceAnalyser();
  await refreshVoiceDevices();
  voiceToggle?.classList.add('is-on');
  voiceToggle?.setAttribute('aria-pressed', 'true');
  if (voiceToggle) voiceToggle.textContent = 'Voice On';
  updateVoiceIndicator();
  sendPresence(true);
  syncVoicePeers();
  updateVoiceIndicator();
}

function disableVoice() {
  comms.voiceEnabled = false;
  comms.localStream?.getTracks().forEach((track) => track.stop());
  comms.localStream = null;
  destroyVoiceAnalyser();
  Array.from(comms.peers.keys()).forEach(closeVoicePeer);
  voiceToggle?.classList.remove('is-on');
  voiceToggle?.setAttribute('aria-pressed', 'false');
  if (voiceToggle) voiceToggle.textContent = 'Voice Off';
  updateVoiceIndicator();
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
  KeyA: 'right',
  ArrowLeft: 'right',
  KeyD: 'left',
  ArrowRight: 'left',
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
  if (event.code === 'ControlLeft') {
    unlockPointer();
    event.preventDefault();
    return;
  }
  if (event.code === 'Escape') closeSettings();
  if (event.code === 'Escape') closeCharacterMenu();
  if (event.code === 'Tab' && !isTypingTarget(event.target)) {
    toggleInventoryMenu();
    event.preventDefault();
    return;
  }
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

function isPointerLocked() {
  return document.pointerLockElement === canvas;
}

function lockPointer() {
  if (isMobile || isPointerLocked() || worldRoot?.classList.contains('ww-menu-open')) return;
  canvas.requestPointerLock?.();
}

function unlockPointer() {
  if (isPointerLocked()) document.exitPointerLock?.();
}

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

canvas.addEventListener('pointerdown', (event) => {
  const isTouch = event.pointerType === 'touch';
  const isMouse = event.pointerType === 'mouse';
  if (isMouse) {
    lockPointer();
    event.preventDefault();
    return;
  }
  if (!isTouch) return;
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

document.addEventListener('mousemove', (event) => {
  if (!isPointerLocked()) return;
  rotateCamera(event.movementX, event.movementY);
});

function readGamepad() {
  if (!worldState.controllerEnabled) return { x: 0, z: 0, sprint: false };
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find(Boolean);
  if (!pad) return { x: 0, z: 0, sprint: false };
  const deadzone = worldState.controllerDeadzone;
  const axis = (value) => (Math.abs(value) > deadzone ? value : 0);
  const moveX = -axis(pad.axes[0] || 0);
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
  const gamepad = readGamepad();
  const horizontalInput = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) + gamepad.x;
  const forwardInput = ((keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)) - gamepad.z;
  const input = new THREE.Vector3(
    horizontalInput,
    0,
    forwardInput
  );
  const controlYaw = cameraRig.yaw + Math.PI;
  const shouldRotate = Math.abs(forwardInput) >= Math.abs(horizontalInput) || Math.abs(forwardInput) > 0.05;
  if (shouldRotate) player.rotation.y = controlYaw;

  const moving = input.lengthSq() > 0;
  if (moving) {
    const previousPosition = player.position.clone();
    if (input.lengthSq() > 1) input.normalize();
    const forward = new THREE.Vector3(Math.sin(controlYaw), 0, Math.cos(controlYaw));
    const right = new THREE.Vector3(Math.cos(controlYaw), 0, -Math.sin(controlYaw));
    const movement = forward.multiplyScalar(input.z).add(right.multiplyScalar(input.x));
    const speed = worldState.speed * (keys.sprint || gamepad.sprint ? 1.45 : 1);
    player.position.addScaledVector(movement, speed * delta);
    const bounds = mapConfig[worldState.currentMapId]?.bounds || mapConfig.hub.bounds;
    player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
    setGroundY(player);
    resolveCollisions(previousPosition);
  }

  const movingBackward = forwardInput < -0.001 && Math.abs(horizontalInput) < 0.1;
  const walkFrequency = keys.sprint || gamepad.sprint ? 16 : 11;
  const walk = moving ? Math.sin(elapsedTime * walkFrequency) : 0;
  player.position.y += Math.abs(walk) * (movingBackward ? 0.02 : 0.045);
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
      claimPickupReward(pickup);
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
  updateVoiceIndicator();
  sendPresence();

  const currentDistrict = nearestDistrict();
  if (currentDistrict !== worldState.focus) updateHud(currentDistrict);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(async () => {
  if (loading) loading.classList.add('is-hidden');
  clearInterval(loadingQuoteTimer);
  updateTokenHud();
  loadTokenBalance();
  await refreshVoiceDevices().catch(() => {});
  connectComms();
  await enableVoice().catch(() => {});
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
  animate();
});
