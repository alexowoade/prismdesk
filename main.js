import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import QRCode from 'qrcode';

// ============================================================================
// 1. WEB AUDIO ENGINE (mono, deterministic procedural synthesis)
// ============================================================================
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.lastRatchetStep = 0;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  playRatchetTick(pitchFactor = 1.0) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180 * pitchFactor, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.045);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }
  playMagneticSnap() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 1046.5].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      gain.gain.setValueAtTime(0.13, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.28);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.3);
    });
  }
  playStressAlert() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.linearRampToValueAtTime(155, now + 0.22);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }
}
const sound = new AudioEngine();

// ============================================================================
// 2. CANDIDATE ALLOY DATABASE & CALIBRATED AGMA / LEWIS PHYSICS ENGINE
// ============================================================================
const ALLOY_CANDIDATES = [
  {
    id: 'al-6061',
    name: '6061-T6 Aerospace Aluminum',
    yieldMpa: 276,
    densityFactor: 0.35,
    thermalLimitC: 130,
    unitCostUsd: 24.0,
    colorHex: 0x93c5fd
  },
  {
    id: 'aisi-4140-worn',
    name: 'AISI 4140 Alloy Steel (Worn -0.42mm)',
    yieldMpa: 415,
    densityFactor: 1.0,
    thermalLimitC: 180,
    unitCostUsd: 38.0,
    colorHex: 0xcbd5e1
  },
  {
    id: 'ss-17-4ph',
    name: '17-4PH Hardened Stainless',
    yieldMpa: 620,
    densityFactor: 1.02,
    thermalLimitC: 210,
    unitCostUsd: 64.0,
    colorHex: 0x94a3b8
  },
  {
    id: 'inconel-718',
    name: 'Inconel 718 Nickel Superalloy',
    yieldMpa: 1035,
    densityFactor: 1.08,
    thermalLimitC: 650,
    unitCostUsd: 142.0,
    colorHex: 0xfbbf24
  },
  {
    id: 'ti-6al-4v',
    name: 'Ti-6Al-4V Grade 5 Titanium',
    yieldMpa: 880,
    densityFactor: 0.61,
    thermalLimitC: 350,
    unitCostUsd: 86.5,
    colorHex: 0x10b981
  }
];

function computePartPhysics(partData, inputTorqueNm, inputRpm) {
  const pitchRadiusM = (partData.diaMm / 1000) * 0.5;
  const faceWidthM = partData.faceWidthMm / 1000;
  const teeth = partData.teeth || 16;
  const moduleM = (partData.diaMm / 1000) / teeth;

  const torqueShare = partData.torqueShare || 0.33;
  const localTorqueNm = inputTorqueNm * torqueShare;
  const Ft = localTorqueNm / Math.max(pitchRadiusM, 0.012);

  const lewisY = Math.max(0.22, 0.484 - 2.87 / teeth);
  const pitchLineVel = (inputRpm * Math.PI * (partData.diaMm / 1000)) / 60;
  const Kv = 1.0 + pitchLineVel * 0.085;
  const wearAbsMm = Math.abs(partData.wearMm || 0);
  const Kw = 1.0 + wearAbsMm * 1.01;

  const rawStressMpa = (Ft * Kv * Kw) / (faceWidthM * moduleM * lewisY * 1e6);
  const bendingStressMpa = rawStressMpa * (partData.stressMultiplier || 1.0);
  const safetyFactor = partData.yieldMpa / Math.max(bendingStressMpa, 1.0);

  const frictionLossWatts = localTorqueNm * (inputRpm / 9.5488) * (0.018 + wearAbsMm * 0.3078);
  const tempC = 28.0 + frictionLossWatts * 0.0227;

  let status = 'nominal';
  if (safetyFactor < 1.0 || tempC > 105) status = 'critical';
  else if (safetyFactor < 1.50 || tempC > 75) status = 'moderate';

  return {
    Ft: Math.round(Ft),
    bendingStressMpa: Number(bendingStressMpa.toFixed(1)),
    safetyFactor: Number(safetyFactor.toFixed(2)),
    tempC: Number(tempC.toFixed(1)),
    status
  };
}

// ============================================================================
// 3. SCENE, CAMERA, RENDERER & WORKBENCH RIG
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 30);
camera.position.set(0, 1.24, 0.54);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.92, -0.32);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minDistance = 0.35;
controls.maxDistance = 1.65;

scene.add(new THREE.AmbientLight(0xdbeafe, 0.88));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(1.2, 2.4, 1.0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const rimLight = new THREE.PointLight(0x38bdf8, 2.5, 4);
rimLight.position.set(-0.9, 1.4, -0.8);
scene.add(rimLight);

const workbenchRig = new THREE.Group();
scene.add(workbenchRig);

const envGroup = new THREE.Group();
workbenchRig.add(envGroup);

const deskMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 0.04, 0.9),
  new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.15 })
);
deskMesh.position.set(0, 0.73, -0.35);
deskMesh.receiveShadow = true;
envGroup.add(deskMesh);

const deskGrid = new THREE.GridHelper(1.55, 31, 0x38bdf8, 0x334155);
deskGrid.position.set(0, 0.751, -0.35);
deskGrid.material.transparent = true;
deskGrid.material.opacity = 0.38;
envGroup.add(deskGrid);

const radiusRing = new THREE.Mesh(
  new THREE.RingGeometry(0.58, 0.595, 64),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
);
radiusRing.rotation.x = -Math.PI / 2;
radiusRing.position.set(0, 0.752, -0.32);
workbenchRig.add(radiusRing);

// ============================================================================
// 4. PROCEDURAL 3D MECHANICAL GEAR GENERATOR
// ============================================================================
function createProceduralGear({
  innerRadius = 0.02,
  outerRadius = 0.06,
  teeth = 16,
  thickness = 0.028,
  color = 0x94a3b8,
  metalness = 0.82,
  roughness = 0.25
}) {
  const shape = new THREE.Shape();
  const toothDepth = (outerRadius - innerRadius) * 0.28;
  const baseRadius = outerRadius - toothDepth;
  const step = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.22;
    const a2 = a0 + step * 0.32;
    const a3 = a0 + step * 0.68;
    const a4 = a0 + step * 0.78;

    const p0 = new THREE.Vector2(Math.cos(a0) * baseRadius, Math.sin(a0) * baseRadius);
    const p1 = new THREE.Vector2(Math.cos(a1) * baseRadius, Math.sin(a1) * baseRadius);
    const p2 = new THREE.Vector2(Math.cos(a2) * outerRadius, Math.sin(a2) * outerRadius);
    const p3 = new THREE.Vector2(Math.cos(a3) * outerRadius, Math.sin(a3) * outerRadius);
    const p4 = new THREE.Vector2(Math.cos(a4) * baseRadius, Math.sin(a4) * baseRadius);

    if (i === 0) shape.moveTo(p0.x, p0.y);
    else shape.lineTo(p0.x, p0.y);
    shape.lineTo(p1.x, p1.y);
    shape.lineTo(p2.x, p2.y);
    shape.lineTo(p3.x, p3.y);
    shape.lineTo(p4.x, p4.y);
  }
  shape.closePath();

  const holePath = new THREE.Path();
  holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, false);
  shape.holes.push(holePath);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.0025,
    bevelThickness: 0.0025
  });
  geo.center();

  const mat = new THREE.MeshPhysicalMaterial({ color, metalness, roughness, clearcoat: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ============================================================================
// 5. BUILD THE 10-PART INDUSTRIAL PLANETARY GEARBOX ASSEMBLY
// ============================================================================
const assemblyRoot = new THREE.Group();
assemblyRoot.position.set(0, 0.98, -0.32);
workbenchRig.add(assemblyRoot);

const parts = [];
const conduitLines = [];

function registerPart(mesh, metadata) {
  mesh.userData = {
    ...metadata,
    assembledPos: metadata.assembledPos.clone(),
    explodedPos: metadata.explodedPos.clone(),
    initialColor: mesh.material.color.getHex(),
    originalColor: mesh.material.color.getHex(),
    initialYieldMpa: metadata.yieldMpa,
    initialWearMm: metadata.wearMm,
    initialMassKg: metadata.massKg,
    initialCostUsd: metadata.costUsd,
    initialMatName: metadata.materialName,
    quarantined: false,
    upgraded: false,
    physics: { Ft: 0, bendingStressMpa: 0, safetyFactor: 2.0, tempC: 35, status: 'nominal' }
  };
  mesh.position.copy(metadata.assembledPos);
  assemblyRoot.add(mesh);
  parts.push(mesh);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    metadata.assembledPos,
    metadata.assembledPos
  ]);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.0 });
  const line = new THREE.Line(lineGeo, lineMat);
  assemblyRoot.add(line);
  conduitLines.push({ line, part: mesh });
  return mesh;
}

// 1. Outer Ring Stator Housing -- explodedPos.y lowered to 0.03 so it never blocks the Wall Board
registerPart(
  createProceduralGear({ innerRadius: 0.115, outerRadius: 0.145, teeth: 28, thickness: 0.055, color: 0x475569 }),
  {
    id: 'PG-01',
    name: 'Outer Ring Stator Housing',
    materialName: 'Cast Ductile Iron',
    yieldMpa: 550,
    teeth: 28,
    faceWidthMm: 55,
    diaMm: 290.0,
    wearMm: 0.01,
    torqueShare: 0.45,
    stressMultiplier: 9.12,
    massKg: 1.45,
    costUsd: 68.0,
    assembledPos: new THREE.Vector3(0, 0, 0),
    explodedPos: new THREE.Vector3(0, 0.03, -0.16)
  }
);

registerPart(
  createProceduralGear({ innerRadius: 0.016, outerRadius: 0.048, teeth: 14, thickness: 0.036, color: 0xeab308 }),
  {
    id: 'PG-02',
    name: 'High-Torque Sun Drive Gear',
    materialName: 'Phosphor Bronze C544',
    yieldMpa: 510,
    teeth: 14,
    faceWidthMm: 36,
    diaMm: 96.0,
    wearMm: 0.03,
    torqueShare: 0.55,
    stressMultiplier: 1.43,
    massKg: 0.52,
    costUsd: 44.0,
    spinSpeed: 2.4,
    assembledPos: new THREE.Vector3(0, 0, 0.005),
    explodedPos: new THREE.Vector3(0, 0, 0.0)
  }
);

const planetAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
const planetOrbitRadius = 0.078;
const planetConfigs = [
  {
    id: 'PG-03A',
    name: 'Planet Gear A (Upper)',
    wearMm: 0.02,
    yieldMpa: 480,
    stressMultiplier: 1.11,
    color: 0x94a3b8,
    explodedOffset: new THREE.Vector3(0, 0.14, 0.09)
  },
  {
    id: 'PG-03B',
    name: 'Planet Gear B [WEAR BOTTLENECK]',
    wearMm: -0.42,
    yieldMpa: 415,
    stressMultiplier: 2.211,
    color: 0xcbd5e1,
    explodedOffset: new THREE.Vector3(-0.22, -0.06, 0.11)
  },
  {
    id: 'PG-03C',
    name: 'Planet Gear C (Right)',
    wearMm: -0.14,
    yieldMpa: 415,
    stressMultiplier: 1.66,
    color: 0x94a3b8,
    explodedOffset: new THREE.Vector3(0.22, -0.06, 0.11)
  }
];

let faultyPlanetGear = null;
planetConfigs.forEach((cfg, idx) => {
  const angle = planetAngles[idx];
  const px = Math.sin(angle) * planetOrbitRadius;
  const py = Math.cos(angle) * planetOrbitRadius;
  const gear = createProceduralGear({ innerRadius: 0.012, outerRadius: 0.035, teeth: 11, thickness: 0.032, color: cfg.color });
  const p = registerPart(gear, {
    id: cfg.id,
    name: cfg.name,
    materialName: 'AISI 4140 Alloy Steel',
    yieldMpa: cfg.yieldMpa,
    teeth: 11,
    faceWidthMm: 32,
    diaMm: 64.0,
    wearMm: cfg.wearMm,
    torqueShare: 0.34,
    stressMultiplier: cfg.stressMultiplier,
    massKg: 0.64,
    costUsd: 38.0,
    spinSpeed: -3.2,
    assembledPos: new THREE.Vector3(px, py, 0.005),
    explodedPos: cfg.explodedOffset
  });
  if (cfg.id === 'PG-03B') faultyPlanetGear = p;
});

const shaftGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18, 24);
shaftGeo.rotateX(Math.PI / 2);
registerPart(
  new THREE.Mesh(shaftGeo, new THREE.MeshPhysicalMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.2 })),
  {
    id: 'PG-04',
    name: 'Splined Input Drive Shaft',
    materialName: '17-4PH Stainless Steel',
    yieldMpa: 725,
    teeth: 18,
    faceWidthMm: 45,
    diaMm: 30.0,
    wearMm: 0.0,
    torqueShare: 0.5,
    stressMultiplier: 0.363,
    massKg: 0.42,
    costUsd: 32.0,
    spinSpeed: 2.4,
    assembledPos: new THREE.Vector3(0, 0, -0.08),
    explodedPos: new THREE.Vector3(0, -0.14, -0.28)
  }
);

registerPart(
  new THREE.Mesh(
    new THREE.TorusGeometry(0.078, 0.011, 16, 36),
    new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, metalness: 0.75, roughness: 0.3 })
  ),
  {
    id: 'PG-05',
    name: 'Planetary Carrier Spider Cage',
    materialName: '7075-T6 Billet Aluminum',
    yieldMpa: 503,
    teeth: 20,
    faceWidthMm: 28,
    diaMm: 156.0,
    wearMm: -0.08,
    torqueShare: 0.48,
    stressMultiplier: 2.13,
    massKg: 0.45,
    costUsd: 49.0,
    spinSpeed: 0.8,
    assembledPos: new THREE.Vector3(0, 0, 0.028),
    explodedPos: new THREE.Vector3(0, 0.05, 0.20)
  }
);

registerPart(
  new THREE.Mesh(
    new THREE.RingGeometry(0.055, 0.135, 32),
    new THREE.MeshPhysicalMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide })
  ),
  {
    id: 'PG-06',
    name: 'Front Retention Seal Flange',
    materialName: 'Anodized 6061 Aluminum',
    yieldMpa: 276,
    teeth: 24,
    faceWidthMm: 18,
    diaMm: 270.0,
    wearMm: 0.0,
    torqueShare: 0.15,
    stressMultiplier: 3.94,
    massKg: 0.26,
    costUsd: 15.0,
    assembledPos: new THREE.Vector3(0, 0, 0.038),
    explodedPos: new THREE.Vector3(0, -0.09, 0.28)
  }
);

registerPart(
  new THREE.Mesh(
    new THREE.TorusGeometry(0.042, 0.009, 14, 28),
    new THREE.MeshPhysicalMaterial({ color: 0xcbd5e1, metalness: 0.95, roughness: 0.15 })
  ),
  {
    id: 'PG-07',
    name: 'Rear Needle Roller Bearing',
    materialName: '52100 Chrome Bearing Steel',
    yieldMpa: 680,
    teeth: 22,
    faceWidthMm: 24,
    diaMm: 84.0,
    wearMm: 0.01,
    torqueShare: 0.25,
    stressMultiplier: 1.63,
    massKg: 0.16,
    costUsd: 12.0,
    spinSpeed: -1.5,
    assembledPos: new THREE.Vector3(0, 0, -0.032),
    explodedPos: new THREE.Vector3(-0.15, 0.09, -0.14)
  }
);

registerPart(
  new THREE.Mesh(
    new THREE.TorusGeometry(0.118, 0.005, 10, 24),
    new THREE.MeshPhysicalMaterial({ color: 0xf59e0b, metalness: 0.88, roughness: 0.22 })
  ),
  {
    id: 'PG-08',
    name: 'M8 Torque Retention Bolt Ring',
    materialName: 'Grade 8 Alloy Fasteners',
    yieldMpa: 890,
    teeth: 24,
    faceWidthMm: 16,
    diaMm: 236.0,
    wearMm: 0.0,
    torqueShare: 0.20,
    stressMultiplier: 6.20,
    massKg: 0.10,
    costUsd: 8.0,
    assembledPos: new THREE.Vector3(0, 0, 0.044),
    explodedPos: new THREE.Vector3(0.06, 0.17, 0.18)
  }
);

// ============================================================================
// 6. DESK QUARANTINE TRAY, SPATIAL AGENT ("PULSE") & RAISED WALL BOM BLUEPRINT
// ============================================================================
const trayGroup = new THREE.Group();
trayGroup.position.set(0.38, 0.755, -0.28);
workbenchRig.add(trayGroup);

const trayPad = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.014, 0.26),
  new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x0284c7, emissiveIntensity: 0.3, roughness: 0.3 })
);
trayGroup.add(trayPad);

const wallCanvas = document.createElement('canvas');
wallCanvas.width = 1024;
wallCanvas.height = 560;
const wallCtx = wallCanvas.getContext('2d');
const wallTexture = new THREE.CanvasTexture(wallCanvas);

// Raised to y = 1.46 so the bottom edge (1.195m) sits completely above the exploded outer ring gear
const wallBoard = new THREE.Mesh(
  new THREE.PlaneGeometry(0.98, 0.53),
  new THREE.MeshBasicMaterial({ map: wallTexture, transparent: true })
);
wallBoard.position.set(0, 1.46, -0.78);
workbenchRig.add(wallBoard);

const qrCanvas = document.createElement('canvas');
qrCanvas.width = 512;
qrCanvas.height = 512;
const qrTexture = new THREE.CanvasTexture(qrCanvas);
const qrPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(0.32, 0.32),
  new THREE.MeshBasicMaterial({ map: qrTexture, transparent: false })
);
qrPlane.position.set(0.72, 1.48, -0.77);
qrPlane.visible = false;
workbenchRig.add(qrPlane);

const qrBacking = new THREE.Mesh(
  new THREE.PlaneGeometry(0.36, 0.36),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false })
);
qrBacking.position.set(0.72, 1.48, -0.775);
qrBacking.visible = false;
workbenchRig.add(qrBacking);

const qrLabelCanvas = document.createElement('canvas');
qrLabelCanvas.width = 512;
qrLabelCanvas.height = 64;
const qrLabelCtx = qrLabelCanvas.getContext('2d');
qrLabelCtx.fillStyle = '#0f172a';
qrLabelCtx.fillRect(0, 0, 512, 64);
qrLabelCtx.fillStyle = '#e2e8f0';
qrLabelCtx.font = 'bold 34px system-ui, sans-serif';
qrLabelCtx.textAlign = 'center';
qrLabelCtx.textBaseline = 'middle';
qrLabelCtx.fillText('SCAN  ->  AUDIT MANIFEST', 256, 34);
const qrLabelTexture = new THREE.CanvasTexture(qrLabelCanvas);
const qrLabelPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(0.32, 0.04),
  new THREE.MeshBasicMaterial({ map: qrLabelTexture, transparent: false })
);
qrLabelPlane.position.set(0.72, 1.67, -0.77);
qrLabelPlane.visible = false;
workbenchRig.add(qrLabelPlane);

const agentOrbGroup = new THREE.Group();
agentOrbGroup.position.set(0.38, 1.05, -0.28);
workbenchRig.add(agentOrbGroup);

const orbCore = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.032, 2),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true })
);
agentOrbGroup.add(orbCore);

const orbInner = new THREE.Mesh(
  new THREE.SphereGeometry(0.018, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xa855f7 })
);
agentOrbGroup.add(orbInner);

const scanCone = new THREE.Mesh(
  new THREE.ConeGeometry(0.11, 0.24, 24, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.0, side: THREE.DoubleSide })
);
scanCone.position.y = -0.13;
agentOrbGroup.add(scanCone);

// ============================================================================
// 7. STATIONARY WRIST PANELS + ANIMATED 3D HANDS + FACE-ON CALIPER BADGE
// ============================================================================
const wristButtons3D = [];

function createWristActionButton(label, hexColor, yOffset, actionId, wristSide) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 112;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 112);
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 104);
  ctx.fillStyle = hexColor;
  ctx.fillRect(4, 4, 16, 104);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 35px Inter, system-ui, sans-serif';
  ctx.fillText(label, 30, 68);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.148, 0.030, 0.026),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  mesh.position.set(0, yOffset, 0.02);
  mesh.rotation.x = -0.14;
  mesh.userData = {
    wristAction: actionId,
    wristSide: wristSide || 'left',
    lastPokeTime: 0,
    activeUntil: 0
  };
  wristButtons3D.push(mesh);
  return mesh;
}

const leftWristPanel = new THREE.Group();
leftWristPanel.add(createWristActionButton('1. PRISM STRESS', '#38bdf8', 0.145, 'prism', 'left'));
leftWristPanel.add(createWristActionButton('2. CALIPER WEAR', '#f59e0b', 0.109, 'caliper', 'left'));
leftWristPanel.add(createWristActionButton('3. QUARANTINE', '#f43f5e', 0.073, 'quarantine', 'left'));
leftWristPanel.add(createWristActionButton('4. TI-6AL-4V FIX', '#10b981', 0.037, 'replace', 'left'));
leftWristPanel.add(createWristActionButton('5. TOUR NEXT', '#a855f7', 0.001, 'tour-next', 'left'));
leftWristPanel.add(createWristActionButton('6. TOUR PREV', '#a855f7', -0.035, 'tour-prev', 'left'));
workbenchRig.add(leftWristPanel);

const rightWristPanel = new THREE.Group();
rightWristPanel.add(createWristActionButton('TORQUE +20', '#f59e0b', 0.145, 'torque-up', 'right'));
rightWristPanel.add(createWristActionButton('TORQUE -20', '#f59e0b', 0.109, 'torque-down', 'right'));
rightWristPanel.add(createWristActionButton('RPM +100', '#38bdf8', 0.073, 'rpm-up', 'right'));
rightWristPanel.add(createWristActionButton('RPM -100', '#38bdf8', 0.037, 'rpm-down', 'right'));
rightWristPanel.add(createWristActionButton('EXPORT JSON', '#10b981', 0.001, 'export', 'right'));
rightWristPanel.add(createWristActionButton('EXIT XR (ESC)', '#f43f5e', -0.035, 'exit-xr', 'right'));
workbenchRig.add(rightWristPanel);

function createArticulatedHand(side) {
  const handGroup = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.85,
    roughness: 0.25,
    metalness: 0.3
  });

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.020, 0.074), mat);
  handGroup.add(palm);

  const thumbTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x34d399 })
  );
  thumbTip.position.set(side === 'left' ? 0.036 : -0.036, 0.006, -0.042);
  handGroup.add(thumbTip);

  const indexFinger = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.007, 0.048, 12),
    mat
  );
  indexFinger.rotation.x = Math.PI / 2;
  indexFinger.position.set(side === 'left' ? 0.020 : -0.020, 0.008, -0.052);
  handGroup.add(indexFinger);

  const indexTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.013, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x10b981 })
  );
  indexTip.position.set(side === 'left' ? 0.020 : -0.020, 0.008, -0.078);
  handGroup.add(indexTip);

  handGroup.userData = { thumbTip, indexTip };
  workbenchRig.add(handGroup);
  return handGroup;
}

const leftHand = createArticulatedHand('left');
const rightHand = createArticulatedHand('right');

// Glowing contact ring that flashes on the face of whichever 3D wrist button is poked
// Glowing contact ring that flashes on the face of whichever 3D wrist button is poked or dwelled
const pokeContactRing = new THREE.Mesh(
  new THREE.RingGeometry(0.022, 0.032, 32),
  new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, depthTest: false })
);
pokeContactRing.renderOrder = 1001;
pokeContactRing.visible = false;
workbenchRig.add(pokeContactRing);

const pokeAnim = {
  active: false,
  handSide: 'right',
  targetLocalPos: new THREE.Vector3(),
  startTime: 0,
  durationMs: 550
};

function triggerVisualFingerPoke(btnMesh) {
  if (!btnMesh) return;
  workbenchRig.updateMatrixWorld(true);
  const worldPos = new THREE.Vector3();
  btnMesh.getWorldPosition(worldPos);
  const localPos = workbenchRig.worldToLocal(worldPos);

  pokeAnim.handSide = btnMesh.userData.wristSide === 'left' ? 'right' : 'left';
  pokeAnim.targetLocalPos.copy(localPos);
  pokeAnim.startTime = performance.now();
  pokeAnim.durationMs = 550;
  pokeAnim.active = true;
  btnMesh.userData.activeUntil = performance.now() + 550;
}

// 3D Finger Vernier Caliper
const caliperGroup = new THREE.Group();
caliperGroup.visible = false;
caliperGroup.renderOrder = 999;
workbenchRig.add(caliperGroup);

const caliperBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.0035, 0.0035, 0.095, 16),
  new THREE.MeshBasicMaterial({ color: 0x00ffcc, depthTest: false })
);
caliperBeam.rotation.z = Math.PI / 2;
caliperBeam.renderOrder = 999;
caliperGroup.add(caliperBeam);

const caliperCanvas = document.createElement('canvas');
caliperCanvas.width = 640;
caliperCanvas.height = 180;
const cCtx = caliperCanvas.getContext('2d');
const caliperTex = new THREE.CanvasTexture(caliperCanvas);
const caliperBadge = new THREE.Mesh(
  new THREE.PlaneGeometry(0.30, 0.084),
  new THREE.MeshBasicMaterial({
    map: caliperTex,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false
  })
);
caliperBadge.position.set(0.05, 0.078, 0.02);
caliperBadge.renderOrder = 1000;
caliperGroup.add(caliperBadge);

function updateCaliperBadge(text1, text2, isPass) {
  cCtx.clearRect(0, 0, 640, 180);
  cCtx.fillStyle = 'rgba(2, 6, 23, 0.96)';
  cCtx.fillRect(0, 0, 640, 180);
  cCtx.strokeStyle = isPass ? '#10b981' : '#f43f5e';
  cCtx.lineWidth = 8;
  cCtx.strokeRect(4, 4, 632, 172);
  cCtx.fillStyle = '#38bdf8';
  cCtx.font = 'bold 26px Inter, system-ui, sans-serif';
  cCtx.fillText(text1, 22, 62);
  cCtx.fillStyle = isPass ? '#10b981' : '#f43f5e';
  cCtx.font = 'bold 28px Inter, system-ui, sans-serif';
  cCtx.fillText(text2, 22, 126);
  caliperTex.needsUpdate = true;
}

// ============================================================================
// 8. DETERMINISTIC STATE, CANDIDATE REJECTION AUDIT & LIVE TELEMETRY
// ============================================================================
const state = {
  explodeFactor: 0.0,
  targetExplode: 0.0,
  torqueNm: 420,
  rpm: 1800,
  prismStressMode: false,
  caliperActive: false,
  quarantined: false,
  upgraded: false,
  selectedPart: faultyPlanetGear,
  glassesFov: false,
  highContrast: false,
  tourStep: -1,
  lastCandidateAudit: []
};

const promptEl = document.getElementById('gesture-prompt');
const sliderExplode = document.getElementById('slider-explode');
const explodeValEl = document.getElementById('explode-val');

const promptCanvas = document.createElement('canvas');
promptCanvas.width = 1024;
promptCanvas.height = 96;
const promptCtx = promptCanvas.getContext('2d');
const promptTex = new THREE.CanvasTexture(promptCanvas);
const promptBillboard = new THREE.Mesh(
  new THREE.PlaneGeometry(0.98, 0.092),
  new THREE.MeshBasicMaterial({ map: promptTex, transparent: true, side: THREE.DoubleSide })
);
promptBillboard.position.set(0, 1.79, -0.78);
promptBillboard.visible = false;
workbenchRig.add(promptBillboard);

function setPrompt(html) {
  promptEl.innerHTML = html;
  const text = html.replace(/<[^>]*>/g, '');
  promptCtx.clearRect(0, 0, 1024, 96);
  promptCtx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  promptCtx.fillRect(0, 0, 1024, 96);
  promptCtx.strokeStyle = '#38bdf8';
  promptCtx.lineWidth = 5;
  promptCtx.strokeRect(3, 3, 1018, 90);
  promptCtx.fillStyle = '#f8fafc';
  promptCtx.font = 'bold 27px Inter, system-ui, sans-serif';
  promptCtx.fillText(text.slice(0, 96), 22, 58, 980);
  promptTex.needsUpdate = true;
}
setPrompt(promptEl.innerHTML);

function evaluateCandidateAlloys(targetPart) {
  const unitBudgetCapUsd = 95.0;
  const minSafetyFactor = 1.50;

  return ALLOY_CANDIDATES.map((cand) => {
    const simulatedWorn = {
      ...targetPart.userData,
      yieldMpa: cand.yieldMpa,
      wearMm: targetPart.userData.initialWearMm
    };
    const simulatedFresh = {
      ...targetPart.userData,
      yieldMpa: cand.yieldMpa,
      wearMm: 0.0
    };
    const sim = computePartPhysics(simulatedWorn, state.torqueNm, state.rpm);
    const simFresh = computePartPhysics(simulatedFresh, state.torqueNm, state.rpm);
    let passed = true;
    let reason = `PASS (SF ${sim.safetyFactor}x Worn -> ${simFresh.safetyFactor}x Fresh | $${cand.unitCostUsd.toFixed(0)})`;

    if (sim.safetyFactor < minSafetyFactor) {
      passed = false;
      reason = `REJECT: SF ${sim.safetyFactor} < ${minSafetyFactor} (${sim.bendingStressMpa} MPa > Yield)`;
    } else if (sim.tempC > cand.thermalLimitC) {
      passed = false;
      reason = `REJECT: Mesh ${sim.tempC}C > ${cand.thermalLimitC}C Limit`;
    } else if (cand.unitCostUsd > unitBudgetCapUsd) {
      passed = false;
      reason = `REJECT: $${cand.unitCostUsd} exceeds $${unitBudgetCapUsd} BOM Cap`;
    }
    return { ...cand, sim, simFresh, passed, reason };
  });
}

function runDeterministicPhysicsSweep(forceWall = false) {
  let peakStress = 0;
  let worstPart = parts[0];
  let totalMass = 0;
  let totalCost = 0;

  parts.forEach((p) => {
    const res = computePartPhysics(p.userData, state.torqueNm, state.rpm);
    p.userData.physics = res;
    totalMass += p.userData.massKg;
    totalCost += p.userData.costUsd;

    if (res.bendingStressMpa > peakStress) {
      peakStress = res.bendingStressMpa;
      worstPart = p;
    }

    if (state.prismStressMode) {
      const stressColor =
        res.status === 'critical' ? 0xf43f5e : res.status === 'moderate' ? 0xf59e0b : 0x6366f1;
      p.material.color.setHex(stressColor);
      p.material.emissive.setHex(stressColor);
      p.material.emissiveIntensity = res.status === 'critical' ? 0.65 : 0.24;
      p.material.transparent = true;
      p.material.opacity = 0.88;
    } else {
      p.material.color.setHex(p.userData.originalColor);
      p.material.emissive.setHex(p.userData.upgraded ? 0x059669 : 0x000000);
      p.material.emissiveIntensity = p.userData.upgraded ? 0.3 : 0.0;
      p.material.transparent = false;
      p.material.opacity = 1.0;
    }
  });

  const activePart = state.selectedPart || faultyPlanetGear;
  const ap = activePart.userData;
  const phys = ap.physics;

  document.getElementById('active-part-tag').textContent = `${ap.id} (${ap.diaMm}mm)`;
  document.getElementById('physics-readout').innerHTML =
    `Ft = 2.T/d = ${phys.Ft.toLocaleString()} N @ ${state.torqueNm} Nm<br/>` +
    `sigma_b (Lewis) = <strong>${phys.bendingStressMpa} MPa</strong> (Yield: ${ap.yieldMpa} MPa)<br/>` +
    `Safety Factor (SF) = <strong>${phys.safetyFactor}x</strong> [${phys.safetyFactor >= 1.5 ? 'PASS' : 'FAIL < 1.50'}]<br/>` +
    `Mesh Temp = ${phys.tempC}C | Wear = ${ap.wearMm.toFixed(2)}mm`;

  const anyCritical = parts.some((pt) => pt.userData.physics.status === 'critical');
  const dotEl = document.getElementById('health-dot');
  dotEl.classList.toggle('warn', anyCritical);
  document.getElementById('health-text').textContent = anyCritical
    ? `OVERLOAD: ${worstPart.userData.id} (SF ${worstPart.userData.physics.safetyFactor}x @ ${state.torqueNm}Nm)`
    : `ALL 10 PARTS NOMINAL (MIN SF ${faultyPlanetGear.userData.physics.safetyFactor}x FRESH)`;

  const peakEl = document.getElementById('peak-stress');
  peakEl.textContent = `${peakStress.toFixed(0)} MPa`;
  peakEl.style.color = anyCritical ? '#f43f5e' : '#10b981';

  document.getElementById('slider-torque').value = state.torqueNm;
  document.getElementById('torque-val').textContent = `${state.torqueNm} Nm`;
  document.getElementById('slider-rpm').value = state.rpm;
  document.getElementById('rpm-val').textContent = `${state.rpm}`;
  document.getElementById('bom-mass').textContent = `${totalMass.toFixed(2)} kg`;
  document.getElementById('bom-cost').textContent = `$${totalCost.toFixed(2)}`;

  state.lastCandidateAudit = evaluateCandidateAlloys(faultyPlanetGear);
  const auditListEl = document.getElementById('candidate-audit-list');
  auditListEl.innerHTML = state.lastCandidateAudit
    .map(
      (c) => `
      <div class="audit-item ${c.passed ? 'pass' : 'reject'}">
        <span>${c.id.toUpperCase()}</span>
        <span>${
          c.passed
            ? `WINNER: SF ${c.sim.safetyFactor}x Worn &rarr; ${c.simFresh.safetyFactor}x Fresh ($${c.unitCostUsd})`
            : `X SF ${c.sim.safetyFactor}x ($${c.unitCostUsd})`
        }</span>
      </div>`
    )
    .join('');

  if (state.caliperActive) {
    const tolPass = Math.abs(ap.wearMm) <= 0.10 && phys.status !== 'critical';
    updateCaliperBadge(
      `CALIPER ${ap.id} // OD: ${ap.diaMm.toFixed(1)}mm | TOL: +/-0.10mm`,
      `WEAR: ${ap.wearMm.toFixed(2)}mm [${tolPass ? 'PASS' : 'OUT OF TOL'}] | SF: ${phys.safetyFactor}x`,
      tolPass
    );
  }

  updateWallBOMBoard(totalMass, totalCost, forceWall);
}

let lastWallDraw = 0;
function updateWallBOMBoard(totalMass, totalCost, force = false) {
  const now = performance.now();
  if (!force && now - lastWallDraw < 66) return;
  lastWallDraw = now;
  const ctx = wallCtx;
  ctx.clearRect(0, 0, 1024, 560);

  const anyCrit = parts.some((p) => p.userData.physics.status === 'critical');
  ctx.fillStyle = state.highContrast ? '#000000' : 'rgba(8, 15, 32, 0.94)';
  ctx.fillRect(0, 0, 1024, 560);
  ctx.strokeStyle = anyCrit ? '#f43f5e' : '#10b981';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 1008, 544);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 25px Inter, sans-serif';
  ctx.fillText(
    `PRISMDESK // ISO 6336 LIVE TELEMETRY (LOAD: ${state.torqueNm} Nm @ ${state.rpm} RPM)`,
    30,
    46
  );

  ctx.fillStyle = anyCrit ? '#f43f5e' : '#10b981';
  ctx.font = 'bold 20px Inter, sans-serif';
  const bPhys = faultyPlanetGear.userData.physics;
  ctx.fillText(
    anyCrit
      ? `CRITICAL BOTTLENECK: PG-03B LEWIS STRESS ${bPhys.bendingStressMpa} MPa > YIELD (${bPhys.safetyFactor}x SF)`
      : `VERIFIED NOMINAL: TI-6AL-4V GRADE 5 INSTALLED (SF ${bPhys.safetyFactor}x FRESH | TEMP ${bPhys.tempC}C)`,
    30,
    82
  );

  const headers = ['PART ID', 'COMPONENT', 'ALLOY SPEC', 'LEWIS s_b / SF', 'TEMP / WEAR', 'COST'];
  const colX = [30, 145, 415, 635, 805, 925];
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 17px Inter, sans-serif';
  headers.forEach((h, i) => ctx.fillText(h, colX[i], 124));

  const displayParts = [parts[0], parts[1], parts[2], parts[3], parts[4], parts[6]];
  ctx.font = '18px Inter, sans-serif';
  displayParts.forEach((p, idx) => {
    const u = p.userData;
    const ph = u.physics;
    const y = 166 + idx * 44;
    const rowColor =
      ph.status === 'critical' ? '#f43f5e' : u.upgraded ? '#10b981' : ph.status === 'moderate' ? '#f59e0b' : '#e2e8f0';

    if (ph.status === 'critical' || u.upgraded) {
      ctx.fillStyle = u.upgraded ? 'rgba(16, 185, 129, 0.16)' : 'rgba(244, 63, 94, 0.18)';
      ctx.fillRect(24, y - 24, 976, 36);
    }
    ctx.fillStyle = rowColor;
    ctx.fillText(u.id, colX[0], y);
    ctx.fillText(u.name.slice(0, 25), colX[1], y);
    ctx.fillText(u.materialName.slice(0, 21), colX[2], y);
    ctx.fillText(`${ph.bendingStressMpa}MPa (${ph.safetyFactor}x)`, colX[3], y);
    ctx.fillText(`${ph.tempC}C | ${u.wearMm.toFixed(2)}mm`, colX[4], y);
    ctx.fillText(`$${u.costUsd.toFixed(2)}`, colX[5], y);
  });

  // Compact audit line with explicit maxWidth = 964 so WINNER is never clipped at the right border
  const auditLine = state.lastCandidateAudit
    .map((c) => {
      const short = c.name.split(' ')[0];
      if (c.passed) {
        return `WINNER: ${short} (${c.sim.safetyFactor}x Worn -> ${c.simFresh.safetyFactor}x Fresh)`;
      }
      if (c.unitCostUsd > 95) {
        return `${short} ($${c.unitCostUsd.toFixed(0)}>$95)`;
      }
      return `${short} (${c.sim.safetyFactor}x)`;
    })
    .join(' | ');
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.fillText(`AUDIT: ${auditLine}`, 30, 468, 964);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 21px Inter, sans-serif';
  ctx.fillText(
    `10-PART MASS: ${totalMass.toFixed(2)} kg   |   DETERMINISTIC BOM TOTAL: $${totalCost.toFixed(2)}`,
    30,
    512
  );

  wallTexture.needsUpdate = true;
}

// ============================================================================
// 9. INTERACTION ACTIONS & EXPORT AUDIT MANIFEST
// ============================================================================
function setExplodeTarget(val) {
  state.targetExplode = THREE.MathUtils.clamp(val, 0, 1);
  sliderExplode.value = Math.round(state.targetExplode * 100);
  explodeValEl.textContent = `${Math.round(state.targetExplode * 100)}%`;
}

function togglePrismStress(forceState) {
  const wasOn = state.prismStressMode;
  state.prismStressMode = forceState !== undefined ? forceState : !state.prismStressMode;
  document.getElementById('btn-prism').classList.toggle('active', state.prismStressMode);
  if (!wasOn && state.prismStressMode) sound.playStressAlert();
  runDeterministicPhysicsSweep(true);
}

function toggleCaliper(forceState) {
  const wasOn = state.caliperActive;
  state.caliperActive = forceState !== undefined ? forceState : !state.caliperActive;
  document.getElementById('btn-caliper').classList.toggle('active', state.caliperActive);
  caliperGroup.visible = state.caliperActive;
  if (!wasOn && state.caliperActive) sound.playRatchetTick(1.4);
  if (state.caliperActive && state.targetExplode < 0.65) setExplodeTarget(0.85);
  runDeterministicPhysicsSweep(true);
  if (state.caliperActive) {
    const ap = (state.selectedPart || faultyPlanetGear).userData;
    setPrompt(
      `Finger Vernier Caliper Active on ${ap.id}: OD ${ap.diaMm.toFixed(1)}mm | Tooth Wear ${ap.wearMm.toFixed(2)}mm (Tolerance +/-0.10mm)`
    );
  }
}

function dropFaultyGearToDesk() {
  if (!faultyPlanetGear) return;
  if (state.targetExplode < 0.5) setExplodeTarget(0.85);
  state.quarantined = true;
  faultyPlanetGear.userData.quarantined = true;
  state.selectedPart = faultyPlanetGear;
  document.getElementById('btn-quarantine').classList.add('active');
  sound.playMagneticSnap();

  workbenchRig.attach(faultyPlanetGear);
  scanCone.material.opacity = 0.32;
  runDeterministicPhysicsSweep(true);
  setPrompt(
    'Spatial Agent ("Pulse"): Running 5-Alloy Candidate Rejection Audit on quarantined Planet Gear B...'
  );
}

function spawnAndSnapTitaniumReplacement() {
  if (!faultyPlanetGear) return;
  const winner = ALLOY_CANDIDATES.find((c) => c.id === 'ti-6al-4v');
  state.quarantined = false;
  state.upgraded = true;

  const u = faultyPlanetGear.userData;
  u.quarantined = false;
  u.upgraded = true;
  u.materialName = winner.name;
  u.yieldMpa = winner.yieldMpa;
  u.wearMm = 0.0;
  u.massKg = Number((u.initialMassKg * winner.densityFactor).toFixed(2));
  u.costUsd = winner.unitCostUsd;
  u.originalColor = winner.colorHex;

  assemblyRoot.attach(faultyPlanetGear);
  scanCone.material.opacity = 0.0;
  document.getElementById('btn-quarantine').classList.remove('active');
  document.getElementById('btn-replace').classList.add('active');

  sound.playMagneticSnap();
  runDeterministicPhysicsSweep(true);
  setPrompt(
    `Ti-6Al-4V Grade 5 Installed: Worn Drop-In SF 1.72x -> Fresh SF ${u.physics.safetyFactor}x, mass -39%, 4 alloys rejected!`
  );
}

function resetFullWorkbenchState(preserveLoads = false) {
  state.upgraded = false;
  state.quarantined = false;
  if (!preserveLoads) {
    state.torqueNm = 420;
    state.rpm = 1800;
    document.getElementById('slider-torque').value = 420;
    document.getElementById('torque-val').textContent = '420 Nm';
    document.getElementById('slider-rpm').value = 1800;
    document.getElementById('rpm-val').textContent = '1800';
  }

  const u = faultyPlanetGear.userData;
  u.quarantined = false;
  u.upgraded = false;
  u.materialName = u.initialMatName;
  u.yieldMpa = u.initialYieldMpa;
  u.wearMm = u.initialWearMm;
  u.massKg = u.initialMassKg;
  u.costUsd = u.initialCostUsd;
  u.originalColor = u.initialColor;

  assemblyRoot.attach(faultyPlanetGear);
  scanCone.material.opacity = 0.0;
  document.getElementById('btn-quarantine').classList.remove('active');
  document.getElementById('btn-replace').classList.remove('active');

  togglePrismStress(false);
  toggleCaliper(false);
  setExplodeTarget(0);
  runDeterministicPhysicsSweep(true);
}

function exportEngineeringAuditJSON() {
  if (qrPlane.visible) {
    qrPlane.visible = false;
    qrLabelPlane.visible = false;
    qrBacking.visible = false;
    setPrompt('QR manifest hidden.');
    return;
  }
  const manifest = {
    application: 'PrismDesk Spatial CAD & Deterministic BOM Workbench (v8.9.5)',
    timestamp: new Date().toISOString(),
    operatingConditions: {
      inputTorqueNm: state.torqueNm,
      inputSpeedRpm: state.rpm,
      gearboxRatio: '3.00:1'
    },
    components: parts.map((p) => ({
      partId: p.userData.id,
      name: p.userData.name,
      material: p.userData.materialName,
      pitchDiameterMm: p.userData.diaMm,
      toothWearMm: p.userData.wearMm,
      massKg: p.userData.massKg,
      unitCostUsd: p.userData.costUsd,
      iso6336Telemetry: p.userData.physics
    })),
    candidateRejectionAuditTrail: state.lastCandidateAudit
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prismdesk-iso6336-audit-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const f = INITIAL_FAULT;
  const qrPayload = JSON.stringify({
    app: 'PrismDesk',
    part: 'Planet Gear B (AISI 4140, worn -0.42mm)',
    fault: `${f.bendingStressMpa.toFixed(1)} MPa / SF ${f.safetyFactor.toFixed(2)} / ${f.tempC.toFixed(0)}C`,
    fix: 'Ti-6Al-4V',
    result: 'SF 1.72 Worn -> SF 2.45 Fresh / 39C / -39% mass',
    cost: '$86.50 (cap $95)',
    load: `${state.torqueNm} Nm / ${state.rpm} RPM`
  });
  QRCode.toCanvas(qrCanvas, qrPayload, { width: 512, margin: 2, errorCorrectionLevel: 'M' }, (err) => {
    if (err) {
      setPrompt('QR generation failed -- JSON download still succeeded.');
      return;
    }
    qrTexture.needsUpdate = true;
    qrPlane.visible = true;
    qrLabelPlane.visible = true;
    qrBacking.visible = true;
    setPrompt('Exported ISO 6336 Audit JSON! Scannable QR manifest on wall board -- tap EXPORT again to hide.');
  });
}

const TOUR_STEPS = ['assemble', 'explode', 'prism', 'caliper', 'quarantine', 'replace', 'final'];
function startTour() {
  resetFullWorkbenchState(false);
  applyTourStep(0);
}
function applyTourStep(n) {
  state.tourStep = Math.max(0, Math.min(TOUR_STEPS.length - 1, n));
  resetFullWorkbenchState(true);
  const step = TOUR_STEPS[state.tourStep];
  if (state.tourStep >= 1) setExplodeTarget(1.0);
  if (state.tourStep >= 2) togglePrismStress(true);
  if (state.tourStep >= 3) toggleCaliper(true);
  if (state.tourStep >= 4) dropFaultyGearToDesk();
  if (state.tourStep >= 5) spawnAndSnapTitaniumReplacement();
  if (step === 'final') {
    toggleCaliper(false);
    togglePrismStress(false);
    setExplodeTarget(0);
  }
  const actionMap = {
    assemble: 'tour-next',
    explode: 'tour-next',
    prism: 'prism',
    caliper: 'caliper',
    quarantine: 'quarantine',
    replace: 'replace',
    final: 'tour-next'
  };
  const matchingBtn = wristButtons3D.find((b) => b.userData.wristAction === actionMap[step]);
  if (matchingBtn) triggerVisualFingerPoke(matchingBtn);

  setPrompt(`Guided Tour ${state.tourStep + 1}/${TOUR_STEPS.length}: ${step.toUpperCase()} -- use TOUR NEXT / PREV or Wrist Panel.`);
  document.getElementById('btn-tour').classList.add('active');
  document.getElementById('btn-tour-next').disabled = state.tourStep >= TOUR_STEPS.length - 1;
  document.getElementById('btn-tour-prev').disabled = state.tourStep <= 0;
}
function tourNext() { applyTourStep(state.tourStep < 0 ? 0 : state.tourStep + 1); }
function tourPrev() { applyTourStep(state.tourStep <= 0 ? 0 : state.tourStep - 1); }

function adjustTorque(deltaNm) {
  state.torqueNm = Math.max(80, Math.min(600, state.torqueNm + deltaNm));
  document.getElementById('slider-torque').value = state.torqueNm;
  document.getElementById('torque-val').textContent = `${state.torqueNm} Nm`;
  sound.playRatchetTick(deltaNm > 0 ? 1.25 : 0.85);
  runDeterministicPhysicsSweep(true);
  setPrompt(`Live AGMA Load Updated: Input Torque = ${state.torqueNm} Nm @ ${state.rpm} RPM`);
}

function adjustRpm(deltaRpm) {
  state.rpm = Math.max(300, Math.min(3600, state.rpm + deltaRpm));
  document.getElementById('slider-rpm').value = state.rpm;
  document.getElementById('rpm-val').textContent = `${state.rpm}`;
  sound.playRatchetTick(deltaRpm > 0 ? 1.3 : 0.9);
  runDeterministicPhysicsSweep(true);
  setPrompt(`Live Thermal Speed Updated: Shaft Speed = ${state.rpm} RPM @ ${state.torqueNm} Nm`);
}

const lastActionTimeById = new Map();
function executeWristAction(actionId, btnMesh = null, fromHandPoke = false) {
  const now = performance.now();
  const prevTime = lastActionTimeById.get(actionId) || 0;
  if (now - prevTime < (fromHandPoke ? 25 : 220)) return;
  lastActionTimeById.set(actionId, now);

  // Reset dwell timer so the next gaze-dwell test always starts cleanly at 0% amber
  gazeDwellStartMs = now;
  gazeDwellLatched = false;

  // Trigger WebXR controller haptics + Web Vibration fallback
  const session = renderer.xr.getSession && renderer.xr.getSession();
  if (session && session.inputSources) {
    for (const src of session.inputSources) {
      const act = src.gamepad && src.gamepad.hapticActuators && src.gamepad.hapticActuators[0];
      if (act && typeof act.pulse === 'function') {
        try { act.pulse(0.65, 35); } catch (_) {}
      }
    }
  }
  if (navigator.vibrate) {
    try { navigator.vibrate(25); } catch (_) {}
  }

  const targetBtn = btnMesh || wristButtons3D.find((b) => b.userData.wristAction === actionId);
  if (targetBtn) triggerVisualFingerPoke(targetBtn);

  if (actionId === 'prism') togglePrismStress();
  else if (actionId === 'caliper') toggleCaliper();
  else if (actionId === 'quarantine') dropFaultyGearToDesk();
  else if (actionId === 'replace') spawnAndSnapTitaniumReplacement();
  else if (actionId === 'tour-next') tourNext();
  else if (actionId === 'tour-prev') tourPrev();
  else if (actionId === 'torque-up') adjustTorque(20);
  else if (actionId === 'torque-down') adjustTorque(-20);
  else if (actionId === 'rpm-up') adjustRpm(100);
  else if (actionId === 'rpm-down') adjustRpm(-100);
  else if (actionId === 'export') exportEngineeringAuditJSON();
  else if (actionId === 'exit-xr' && renderer.xr.isPresenting) {
    xrSessionEnding = true;
    const s = renderer.xr.getSession();
    if (s) s.end();
  }
}

// ============================================================================
// 10. RAYCAST HELPERS & CAPTURE-PHASE POINTER INTERACTION (2D & XR)
// ============================================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.32);
let draggedPart = null;
let xrEntryGuardUntil = 0;
let hoveredWristBtn = null;
let lastHoveredWristBtn = null;
let lastHoverTimestamp = 0;
let lastTourAdvanceMs = 0;

let gazeDwellTarget = null;
let gazeDwellStartMs = 0;
let gazeDwellLatched = false;
let gazeDwellCompletedAt = 0;
const GAZE_DWELL_MS = 1350;

// Direction-Reversal & Right-Edge State Machine for 3D Finger Pokes
const handPokeLatch = { left: null, right: null };
const handPokeArmed = { left: false, right: false };
const handPokeAnchor = { left: new THREE.Vector3(), right: new THREE.Vector3() };
const handPokePeakPos = { left: new THREE.Vector3(), right: new THREE.Vector3() };
const handPokePeakDist = { left: 0, right: 0 };
const handPokeEdgeZone = { left: 0, right: 0 };

let xrSessionEnding = false;
let wasXrPresenting = false;

const LOCAL_BTN_RAY_BOX = new THREE.Box3(
  new THREE.Vector3(-0.082, -0.0175, -0.022),
  new THREE.Vector3(0.082, 0.0175, 0.022)
);
const _invBtnMat = new THREE.Matrix4();
const _localRay = new THREE.Ray();
const _boxHitPt = new THREE.Vector3();
const _zeroVec = new THREE.Vector3(0, 0, 0);

function findWristButtonAlongRay(origin, dir) {
  raycaster.set(origin, dir);
  let closestBtn = null;
  let bestScore = Infinity;

  for (const btn of wristButtons3D) {
    _invBtnMat.copy(btn.matrixWorld).invert();
    _localRay.copy(raycaster.ray).applyMatrix4(_invBtnMat);
    // Undo hover scale (1.16x, 1.20x) so expanded buttons never shadow adjacent buttons
    _localRay.origin.multiply(btn.scale);
    _localRay.direction.multiply(btn.scale).normalize();

    if (_localRay.intersectBox(LOCAL_BTN_RAY_BOX, _boxHitPt)) {
      _localRay.closestPointToPoint(_zeroVec, _boxHitPt);
      const score = Math.abs(_boxHitPt.y) * 2.5 + Math.abs(_boxHitPt.x) * 0.35;
      if (score < bestScore) {
        bestScore = score;
        closestBtn = btn;
      }
    }
  }
  return closestBtn;
}

function findWristButtonPokedByPoint(worldFingerPos) {
  const localPt = new THREE.Vector3();
  let bestBtn = null;
  let bestLocalPt = null;
  let bestDist = Infinity;

  for (const btn of wristButtons3D) {
    localPt.copy(worldFingerPos);
    btn.worldToLocal(localPt);
    // Restore true physical meters (undo 1.16x / 1.20x hover scale)
    localPt.multiply(btn.scale);

    // Full width (+/-0.092m X), vertical pitch (+/-0.020m Y), and deep Z (+/-0.068m)
    // so rotated panel right-edge pokes and big Z pull-backs stay cleanly tracked
    if (Math.abs(localPt.x) <= 0.092 && Math.abs(localPt.y) <= 0.020 && Math.abs(localPt.z) <= 0.068) {
      const d = Math.abs(localPt.y) * 2.2 + Math.abs(localPt.z) * 0.35;
      if (d < bestDist) {
        bestDist = d;
        bestBtn = btn;
        bestLocalPt = localPt.clone();
      }
    }
  }
  return bestBtn ? { btn: bestBtn, localPt: bestLocalPt } : null;
}

function getActiveMonoCamera() {
  if (!renderer.xr.isPresenting) return camera;
  const xrCam = renderer.xr.getCamera();
  if (xrCam.cameras && xrCam.cameras.length > 0) {
    xrCam.cameras[0].updateMatrixWorld(true);
    return xrCam.cameras[0];
  }
  xrCam.updateMatrixWorld(true);
  return xrCam;
}

let pointerDownPos = { x: 0, y: 0 };

window.addEventListener(
  'pointerdown',
  (e) => {
    if (performance.now() < xrEntryGuardUntil) return;
    if (e.target !== renderer.domElement) return;

    pointerDownPos = { x: e.clientX, y: e.clientY };
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const activeCam = getActiveMonoCamera();
    raycaster.setFromCamera(pointer, activeCam);

    const hitBtn = findWristButtonAlongRay(raycaster.ray.origin, raycaster.ray.direction);
    if (hitBtn) {
      executeWristAction(hitBtn.userData.wristAction, hitBtn);
      return;
    }

    const partHits = raycaster.intersectObjects(parts, false);
    if (partHits.length > 0) {
      const part = partHits[0].object;
      state.selectedPart = part;
      sound.playRatchetTick(1.25);
      if (state.targetExplode < 0.35) setExplodeTarget(0.85);
      toggleCaliper(true);

      if (part === faultyPlanetGear && !renderer.xr.isPresenting) {
        draggedPart = part;
        controls.enabled = false;
      }
    }
  },
  { capture: true }
);

window.addEventListener(
  'pointermove',
  (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (!draggedPart) return;
    raycaster.setFromCamera(pointer, camera);
    const hitPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
      workbenchRig.attach(draggedPart);
      draggedPart.position.copy(hitPoint);
    }
  },
  { capture: true }
);

window.addEventListener(
  'pointerup',
  () => {
    if (!draggedPart) return;
    const distToTray = draggedPart.position.distanceTo(trayGroup.position);
    if (distToTray < 0.35) {
      dropFaultyGearToDesk();
    } else if (!draggedPart.userData.quarantined) {
      assemblyRoot.attach(draggedPart);
      draggedPart.position
        .copy(draggedPart.userData.assembledPos)
        .lerp(draggedPart.userData.explodedPos, state.explodeFactor);
    }
    draggedPart = null;
    controls.enabled = true;
  },
  { capture: true }
);

// ============================================================================
// 11. UI LISTENERS, TORQUE/RPM SLIDERS & WEBXR SESSION MANAGEMENT
// ============================================================================
sliderExplode.addEventListener('input', (e) => setExplodeTarget(parseFloat(e.target.value) / 100));
sliderExplode.addEventListener('change', (e) => e.target.blur());

document.getElementById('slider-torque').addEventListener('input', (e) => {
  state.torqueNm = parseFloat(e.target.value);
  document.getElementById('torque-val').textContent = `${state.torqueNm} Nm`;
  runDeterministicPhysicsSweep(true);
  setPrompt(`Live AGMA Load Updated: Input Torque = ${state.torqueNm} Nm @ ${state.rpm} RPM`);
});
document.getElementById('slider-torque').addEventListener('change', (e) => e.target.blur());

document.getElementById('slider-rpm').addEventListener('input', (e) => {
  state.rpm = parseFloat(e.target.value);
  document.getElementById('rpm-val').textContent = `${state.rpm}`;
  runDeterministicPhysicsSweep(true);
  setPrompt(`Live Thermal Speed Updated: Shaft Speed = ${state.rpm} RPM @ ${state.torqueNm} Nm`);
});
document.getElementById('slider-rpm').addEventListener('change', (e) => e.target.blur());

document.getElementById('btn-prism').addEventListener('click', () => executeWristAction('prism'));
document.getElementById('btn-caliper').addEventListener('click', () => executeWristAction('caliper'));
document.getElementById('btn-quarantine').addEventListener('click', () => executeWristAction('quarantine'));
document.getElementById('btn-replace').addEventListener('click', () => executeWristAction('replace'));
document.getElementById('btn-export').addEventListener('click', () => executeWristAction('export'));

document.getElementById('btn-fov').addEventListener('click', (e) => {
  state.glassesFov = !state.glassesFov;
  e.currentTarget.classList.toggle('active', state.glassesFov);
  document.getElementById('glasses-fov').style.display = state.glassesFov ? 'block' : 'none';
});

document.getElementById('btn-contrast').addEventListener('click', (e) => {
  state.highContrast = !state.highContrast;
  e.currentTarget.classList.toggle('active', state.highContrast);
  runDeterministicPhysicsSweep(true);

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec && state.highContrast) {
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.onresult = (ev) => {
      const cmd = ev.results[ev.results.length - 1][0].transcript.toLowerCase();
      if (cmd.includes('explode')) setExplodeTarget(0.9);
      if (cmd.includes('collapse')) setExplodeTarget(0.0);
      if (cmd.includes('prism') || cmd.includes('stress')) togglePrismStress(true);
      if (cmd.includes('measure') || cmd.includes('caliper')) toggleCaliper(true);
      if (cmd.includes('drop') || cmd.includes('quarantine')) dropFaultyGearToDesk();
      if (cmd.includes('replace') || cmd.includes('titanium')) spawnAndSnapTitaniumReplacement();
    };
    try { rec.start(); } catch (_) {}
  }
});

document.getElementById('btn-passthrough').addEventListener('click', async (e) => {
  const video = document.getElementById('webcam-bg');
  if (video.style.display === 'block') {
    video.style.display = 'none';
    envGroup.visible = true;
    e.currentTarget.classList.remove('active');
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      video.style.display = 'block';
      envGroup.visible = false;
      e.currentTarget.classList.add('active');
    } catch (_) {
      envGroup.visible = !envGroup.visible;
    }
  }
});

let xrRigAligned = false;
let traySnappedToPlane = false;
let xrHitTestSource = null;
let xrSessionStartTime = 0;
const prevGamepadPressed = new Map();

const xrLaserLines = [0, 1].map(() => {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -0.75)
  ]);
  const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false });
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  line.renderOrder = 999;
  scene.add(line);
  return line;
});

// High-visibility dwell/gaze reticle ring (11mm inner, 20mm outer radius)
const xrReticle = new THREE.Mesh(
  new THREE.RingGeometry(0.011, 0.020, 32),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, depthTest: false })
);
xrReticle.renderOrder = 1002;
xrReticle.visible = false;
scene.add(xrReticle);

const dwellArcCanvas = document.createElement('canvas');
dwellArcCanvas.width = 256;
dwellArcCanvas.height = 256;
const dwellArcCtx = dwellArcCanvas.getContext('2d');
const dwellArcTex = new THREE.CanvasTexture(dwellArcCanvas);
const xrDwellArcMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.068, 0.068),
  new THREE.MeshBasicMaterial({ map: dwellArcTex, transparent: true, side: THREE.DoubleSide, depthTest: false })
);
xrDwellArcMesh.renderOrder = 1006;
xrDwellArcMesh.visible = false;
scene.add(xrDwellArcMesh);

// Amber face-glow overlay: a transparent amber plane 1.5mm in front of the
// hovered wrist button face during dwell charging. material.color alone
// cannot brighten the dark canvas texture (multiply can only darken), so
// this additive overlay is what makes the face visibly glow amber.
const xrFaceGlowMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.148, 0.030),
  new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false })
);
xrFaceGlowMesh.renderOrder = 1003;
xrFaceGlowMesh.visible = false;
scene.add(xrFaceGlowMesh);

function updateDwellProgressArc(progress, isComplete = false) {
  dwellArcCtx.clearRect(0, 0, 256, 256);
  const cx = 128, cy = 128, r = 96;
  dwellArcCtx.beginPath();
  dwellArcCtx.arc(cx, cy, r, 0, Math.PI * 2);
  dwellArcCtx.strokeStyle = 'rgba(245, 158, 11, 0.28)';
  dwellArcCtx.lineWidth = 18;
  dwellArcCtx.stroke();

  const clamped = Math.max(0.02, Math.min(1.0, progress));
  dwellArcCtx.beginPath();
  dwellArcCtx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + clamped * Math.PI * 2, false);
  dwellArcCtx.strokeStyle = isComplete ? '#10b981' : '#f59e0b';
  dwellArcCtx.lineWidth = 22;
  dwellArcCtx.lineCap = 'round';
  dwellArcCtx.stroke();
  dwellArcTex.needsUpdate = true;
}

function snapWorkbenchToDeskHeight(deskY, sourceTag = 'Real Desk') {
  const clampedDeskY = THREE.MathUtils.clamp(deskY, 0.48, 1.05);
  workbenchRig.position.y = clampedDeskY - 0.73;
  workbenchRig.updateMatrixWorld(true);
  trayGroup.position.set(0.38, 0.755, -0.28);
  envGroup.visible = false;
  radiusRing.visible = false;
  traySnappedToPlane = true;
  sound.playMagneticSnap();
  setPrompt(
    `Quarantine tray snapped to real desk (desk y=${clampedDeskY.toFixed(2)}m, tray surface y=${(clampedDeskY + 0.025).toFixed(3)}m [${sourceTag}]).`
  );
}
window.simulateDeskPlaneSnap = (deskY = 0.74) => snapWorkbenchToDeskHeight(deskY, 'Emulator Plane Test');

function alignWorkbenchRigToHeadset(xrCam) {
  const camPos = new THREE.Vector3();
  const camQuat = new THREE.Quaternion();
  xrCam.getWorldPosition(camPos);
  xrCam.getWorldQuaternion(camQuat);

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
  forward.y = 0;
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();

  const yaw = Math.atan2(-forward.x, -forward.z);
  workbenchRig.rotation.set(0, yaw, 0);

  const localEye = new THREE.Vector3(0, 1.18, 0.54).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  workbenchRig.position.copy(camPos).sub(localEye);
  workbenchRig.updateMatrixWorld(true);
}

function onXrSelect(e) {
  const now = performance.now();
  if (now < xrEntryGuardUntil) return;

  // 1. Raycast from triggering inputSource (Controller Trigger or Hand Pinch Ray)
  const refSpace = renderer.xr.getReferenceSpace();
  if (e && e.frame && refSpace && e.inputSource && e.inputSource.targetRaySpace) {
    const rayPose = e.frame.getPose(e.inputSource.targetRaySpace, refSpace);
    if (rayPose) {
      const origin = new THREE.Vector3().copy(rayPose.transform.position);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(rayPose.transform.orientation);
      const hitBtn = findWristButtonAlongRay(origin, dir);
      if (hitBtn) {
        executeWristAction(hitBtn.userData.wristAction, hitBtn);
        return;
      }
      raycaster.set(origin, dir);
      const partHits = raycaster.intersectObjects(parts, false);
      if (partHits.length > 0) {
        state.selectedPart = partHits[0].object;
        sound.playRatchetTick(1.25);
        if (state.targetExplode < 0.35) setExplodeTarget(0.85);
        toggleCaliper(true);
        return;
      }
    }
  }

  // 2. Fallback to currently hovered wrist button
  const targetBtn =
    hoveredWristBtn || (now - lastHoverTimestamp < 1200 ? lastHoveredWristBtn : null);
  if (targetBtn) {
    executeWristAction(targetBtn.userData.wristAction, targetBtn);
    return;
  }

  // 3. Bare-hand open-air pinch-to-advance
  if (e && e.type === 'select' && e.inputSource && e.inputSource.hand) {
    if (now - lastTourAdvanceMs < 600) return;
    lastTourAdvanceMs = now;
    tourNext();
  }
}

// Deterministic 2D camera, hand-pose, & scene restoration after exiting WebXR
function restore2DCameraAndWorkbench() {
  const btnXr = document.getElementById('btn-xr');
  if (btnXr) {
    btnXr.textContent = 'Enter Quest MR';
    btnXr.classList.remove('active');
  }
  xrRigAligned = false;
  hoveredWristBtn = null;
  lastHoveredWristBtn = null;
  gazeDwellTarget = null;
  gazeDwellLatched = false;
  handPokeLatch.left = null;
  handPokeLatch.right = null;

  // Cancel any in-flight 4.5s poke animation so no blue hand/ring stays raised in 2D
  pokeAnim.active = false;
  pokeContactRing.visible = false;

  if (xrHitTestSource) {
    try { xrHitTestSource.cancel(); } catch (_) {}
    xrHitTestSource = null;
  }
  prevGamepadPressed.clear();
  xrReticle.visible = false;
  xrLaserLines.forEach((l) => { l.visible = false; });

  workbenchRig.position.set(0, 0, 0);
  workbenchRig.rotation.set(0, 0, 0);
  workbenchRig.scale.set(1, 1, 1);
  workbenchRig.updateMatrixWorld(true);

  leftWristPanel.position.set(-0.165, 0.90, -0.12);
  rightWristPanel.position.set(0.175, 0.90, -0.12);
  leftWristPanel.rotation.set(0, 0.18, 0);
  rightWristPanel.rotation.set(0, -0.18, 0);
  leftHand.position.copy(leftWristPanel.position).add(new THREE.Vector3(0, -0.06, 0.03));
  rightHand.position.copy(rightWristPanel.position).add(new THREE.Vector3(0, -0.06, 0.03));
  leftHand.rotation.copy(leftWristPanel.rotation);
  rightHand.rotation.copy(rightWristPanel.rotation);

  envGroup.visible = true;
  deskMesh.material.transparent = false;
  deskMesh.material.opacity = 1.0;
  deskGrid.material.opacity = 0.38;
  trayGroup.position.set(0.38, 0.755, -0.28);
  radiusRing.visible = true;
  promptBillboard.visible = false;

  camera.fov = 65;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.up.set(0, 1, 0);
  camera.position.set(0, 1.24, 0.54);
  camera.lookAt(0, 0.92, -0.32);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  controls.enabled = true;
  controls.target.set(0, 0.92, -0.32);
  controls.update();
}

function cleanupXrSessionState() {
  xrSessionEnding = true;
  restore2DCameraAndWorkbench();
  requestAnimationFrame(() => {
    restore2DCameraAndWorkbench();
    requestAnimationFrame(() => {
      xrSessionEnding = false;
      restore2DCameraAndWorkbench();
    });
  });
}

renderer.xr.addEventListener('sessionend', cleanupXrSessionState);

function bindSessionListeners(session) {
  session.addEventListener('select', onXrSelect);
  session.addEventListener('squeezestart', onXrSelect);
  session.addEventListener('end', cleanupXrSessionState);

  session.requestReferenceSpace('viewer').then((viewerSpace) => {
    if (session.requestHitTestSource) {
      session.requestHitTestSource({ space: viewerSpace }).then((source) => {
        xrHitTestSource = source;
      }).catch(() => {});
    }
  }).catch(() => {});
}

document.getElementById('btn-xr').addEventListener('click', async () => {
  if (!navigator.xr) {
    setPrompt('WebXR not detected in this browser -- running in Interactive 3D Desktop Workbench mode.');
    return;
  }
  if (renderer.xr.isPresenting) {
    xrSessionEnding = true;
    const activeSession = renderer.xr.getSession();
    if (activeSession) await activeSession.end();
    restore2DCameraAndWorkbench();
    return;
  }
  renderer.xr.setReferenceSpaceType('local-floor');
  xrSessionEnding = false;
  xrRigAligned = false;
  hoveredWristBtn = null;
  lastHoveredWristBtn = null;
  gazeDwellTarget = null;
  gazeDwellLatched = false;
  handPokeLatch.left = null;
  handPokeLatch.right = null;
  prevGamepadPressed.clear();
  xrEntryGuardUntil = performance.now() + 500;
  xrSessionStartTime = performance.now();

  workbenchRig.position.set(0, 0.42, -0.54);
  workbenchRig.rotation.set(0, 0, 0);

  try {
    const session = await navigator.xr.requestSession('immersive-ar', {
      optionalFeatures: ['local-floor', 'hand-tracking', 'plane-detection', 'hit-test']
    });
    await renderer.xr.setSession(session);
    bindSessionListeners(session);
    const btnXr = document.getElementById('btn-xr');
    btnXr.textContent = 'Exit Quest MR';
    btnXr.classList.add('active');
    envGroup.visible = true;
    deskMesh.material.transparent = true;
    deskMesh.material.opacity = 0.35;
    deskGrid.material.opacity = 0.15;
    traySnappedToPlane = false;
    setPrompt('Quest MR Active: Poke, Pinch-Ray, Trigger, or Gaze-Dwell 1.3s on any button (R recenter, P snap desk).');
  } catch (_) {
    try {
      const vrSession = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'hand-tracking']
      });
      await renderer.xr.setSession(vrSession);
      bindSessionListeners(vrSession);
      const btnXr = document.getElementById('btn-xr');
      btnXr.textContent = 'Exit Quest MR';
      btnXr.classList.add('active');
      envGroup.visible = true;
      setPrompt('Quest VR Active: Poke, Pinch-Ray, Trigger, or Gaze-Dwell 1.3s on any button (R recenter, ESC exit).');
    } catch (_) {
      restore2DCameraAndWorkbench();
      setPrompt('WebXR session unavailable -- running in Interactive 3D Desktop Workbench mode.');
    }
  }
});

document.getElementById('btn-tour').addEventListener('click', () => startTour());
document.getElementById('btn-tour-next').addEventListener('click', () => executeWristAction('tour-next'));
document.getElementById('btn-tour-prev').addEventListener('click', () => executeWristAction('tour-prev'));

// Guards text/number inputs (including inside Emulator Shadow DOMs) while allowing main-page range sliders
// to never hijack ArrowLeft / ArrowRight tour navigation
function isEventFromInputOrEmulatorUI(e) {
  const isTextControl = (el) => {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
    if (tag === 'INPUT') {
      const inShadow = Boolean(el.getRootNode && el.getRootNode().host);
      // Block all inputs inside Emulator Shadow DOM, or non-range inputs in main DOM
      return inShadow || el.type !== 'range';
    }
    return false;
  };

  const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
  for (const node of path) {
    if (isTextControl(node)) return true;
  }
  let active = document.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return isTextControl(active);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && renderer.xr.isPresenting) {
    xrSessionEnding = true;
    const s = renderer.xr.getSession();
    if (s) s.end();
    restore2DCameraAndWorkbench();
    return;
  }
  if (isEventFromInputOrEmulatorUI(e)) return;

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    executeWristAction('tour-next');
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    executeWristAction('tour-prev');
  } else if (e.key === '+' || e.key === '=') {
    executeWristAction('torque-up');
  } else if (e.key === '-' || e.key === '_') {
    executeWristAction('torque-down');
  } else if (e.key === ']') {
    executeWristAction('rpm-up');
  } else if (e.key === '[') {
    executeWristAction('rpm-down');
  } else if (e.key === 'e' || e.key === 'E') {
    executeWristAction('export');
  } else if ((e.key === 'p' || e.key === 'P') && renderer.xr.isPresenting) {
    snapWorkbenchToDeskHeight(0.74, 'Emulator 0.74m Plane');
  } else if ((e.key === 'r' || e.key === 'R') && renderer.xr.isPresenting) {
    alignWorkbenchRigToHeadset(renderer.xr.getCamera());
    setPrompt('Workbench recentered directly in front of your headset view.');
  }
});

function updateRealWebXRHands(xrFrame) {
  const session = renderer.xr.getSession();
  if (!session || !xrFrame || !xrFrame.getJointPose) return false;
  const refSpace = renderer.xr.getReferenceSpace();
  if (!refSpace) return false;

  leftWristPanel.position.set(-0.155, 0.88, -0.02);
  rightWristPanel.position.set(0.155, 0.88, -0.02);
  leftWristPanel.rotation.set(0, 0.26, 0);
  rightWristPanel.rotation.set(0, -0.26, 0);
  workbenchRig.updateMatrixWorld(true);

  let leftPinching = false;
  let rightPinching = false;
  let trackedHands = 0;

  for (const source of session.inputSources) {
    if (!source.hand) continue;
    const side = source.handedness === 'left' ? 'left' : 'right';
    const wristSpace = source.hand.get('wrist');
    const thumbSpace = source.hand.get('thumb-tip');
    const indexSpace = source.hand.get('index-finger-tip');
    if (!wristSpace || !thumbSpace || !indexSpace) continue;

    const wristPose = xrFrame.getJointPose(wristSpace, refSpace);
    const thumbPose = xrFrame.getJointPose(thumbSpace, refSpace);
    const indexPose = xrFrame.getJointPose(indexSpace, refSpace);
    if (!wristPose || !thumbPose || !indexPose) continue;

    trackedHands++;
    const iPos = new THREE.Vector3().copy(indexPose.transform.position);
    const tPos = new THREE.Vector3().copy(thumbPose.transform.position);
    const localIndexPos = workbenchRig.worldToLocal(iPos.clone());

    const targetHand = side === 'left' ? leftHand : rightHand;
    targetHand.position.set(
      localIndexPos.x + (side === 'left' ? -0.020 : 0.020),
      localIndexPos.y - 0.008,
      localIndexPos.z + 0.078
    );
    targetHand.rotation.set(0, 0, 0);

    const pinchDist = tPos.distanceTo(iPos);
    const isPinching = pinchDist < 0.028;
    if (side === 'left' && isPinching) leftPinching = true;
    if (side === 'right' && isPinching) rightPinching = true;

    const pokeHit = findWristButtonPokedByPoint(iPos);
    if (pokeHit) {
      const { btn: pokedBtn, localPt } = pokeHit;
      const edgeZone = localPt.x >= 0.035 ? 1 : localPt.x <= -0.035 ? -1 : 0;

      if (handPokeLatch[side] !== pokedBtn) {
        // 1. First entry into button: fire once and record anchor
        handPokeLatch[side] = pokedBtn;
        handPokeArmed[side] = false;
        handPokeAnchor[side].copy(iPos);
        handPokePeakPos[side].copy(iPos);
        handPokePeakDist[side] = 0;
        handPokeEdgeZone[side] = edgeZone;
        executeWristAction(pokedBtn.userData.wristAction, pokedBtn, true);
      } else {
        const dzFromAnchor = iPos.z - handPokeAnchor[side].z;
        const dxFromAnchor = iPos.x - handPokeAnchor[side].x;
        const distFromAnchor = iPos.distanceTo(handPokeAnchor[side]);

        // 2. Direct Right-Edge / Left-Edge poke (moving from center |x| < 3.0cm to edge |x| >= 3.5cm):
        //    Fires immediately once when predominantly lateral (|dx| > |dz| and |dx| >= 3.5cm)
        if (
          edgeZone !== 0 &&
          handPokeEdgeZone[side] === 0 &&
          Math.abs(localPt.x) >= 0.035 &&
          Math.abs(dxFromAnchor) >= 0.032 &&
          Math.abs(dzFromAnchor) <= 0.012
        ) {
          handPokeEdgeZone[side] = edgeZone;
          handPokeArmed[side] = false;
          handPokeAnchor[side].copy(iPos);
          handPokePeakPos[side].copy(iPos);
          handPokePeakDist[side] = 0;
          executeWristAction(pokedBtn.userData.wristAction, pokedBtn, true);
        } else if (edgeZone === 0 && handPokeEdgeZone[side] !== 0 && !handPokeArmed[side]) {
          // Silent re-center after an outer-edge poke
          handPokeEdgeZone[side] = 0;
          handPokeAnchor[side].copy(iPos);
          handPokePeakPos[side].copy(iPos);
          handPokePeakDist[side] = 0;
        } else if (!handPokeArmed[side]) {
          // 3. Leg 1 (out-move in X, Y, or Z >= 5.5mm): arm Leg 2 without firing on out-move
          if (distFromAnchor >= 0.0055 || Math.abs(dzFromAnchor) >= 0.0055) {
            handPokeArmed[side] = true;
            handPokePeakPos[side].copy(iPos);
            handPokePeakDist[side] = distFromAnchor;
          }
        } else {
          // 4. Leg 2 (return stroke from peak excursion in X, Y, or Z):
          const vecOut = handPokePeakPos[side].clone().sub(handPokeAnchor[side]);
          const vecFromPeak = iPos.clone().sub(handPokePeakPos[side]);
          const returnDist = vecFromPeak.length();
          const zPushInward = handPokePeakPos[side].z - iPos.z;
          const closerToAnchor = handPokePeakDist[side] - distFromAnchor;

          if (distFromAnchor > handPokePeakDist[side] && vecFromPeak.dot(vecOut) >= 0) {
            // Still moving further out on Leg 1: update peak turning point
            handPokePeakPos[side].copy(iPos);
            handPokePeakDist[side] = distFromAnchor;
          } else if (
            (returnDist >= 0.0045 && (vecFromPeak.dot(vecOut) < -0.00001 || closerToAnchor >= 0.0035)) ||
            zPushInward >= 0.0045
          ) {
            // Reversed direction back toward button on Leg 2: fire ONCE and re-anchor!
            handPokeArmed[side] = false;
            handPokeAnchor[side].copy(iPos);
            handPokePeakPos[side].copy(iPos);
            handPokePeakDist[side] = 0;
            handPokeEdgeZone[side] = edgeZone;
            executeWristAction(pokedBtn.userData.wristAction, pokedBtn, true);
          }
        }
      }
    } else {
      handPokeLatch[side] = null;
      handPokeArmed[side] = false;
      handPokePeakDist[side] = 0;
      handPokeEdgeZone[side] = 0;
    }

    if (!traySnappedToPlane && isPinching && iPos.y >= 0.55 && iPos.y <= 0.84 && !pokeHit) {
      snapWorkbenchToDeskHeight(iPos.y, 'Hand-Touch Desk Calibration');
    }
  }

  if (leftPinching && rightPinching) {
    const spread = leftHand.position.distanceTo(rightHand.position);
    setExplodeTarget((spread - 0.16) / 0.42);
  }
  return trackedHands > 0;
}

runDeterministicPhysicsSweep(true);
const INITIAL_FAULT = computePartPhysics(faultyPlanetGear.userData, 420, 1800);

// ============================================================================
// 12. MAIN 60/90 FPS RENDER & ANIMATION LOOP
// ============================================================================
const clock = new THREE.Clock();

renderer.setAnimationLoop((timestamp, xrFrame) => {
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  const now = performance.now();

  state.explodeFactor = THREE.MathUtils.lerp(state.explodeFactor, state.targetExplode, dt * 6.0);
  const currentStep = Math.floor(state.explodeFactor * 12);
  if (currentStep !== sound.lastRatchetStep) {
    sound.lastRatchetStep = currentStep;
    sound.playRatchetTick(0.8 + state.explodeFactor * 0.6);
  }

  // Detect exact frame transition from XR -> 2D so WebXRManager never leaves the 2D camera in headset pose
  if (wasXrPresenting && !renderer.xr.isPresenting) {
    wasXrPresenting = false;
    xrSessionEnding = false;
    restore2DCameraAndWorkbench();
  } else if (renderer.xr.isPresenting) {
    wasXrPresenting = true;
  }

  // Align workbenchRig on first valid XR frame (never during session teardown)
  if (renderer.xr.isPresenting && xrFrame && !xrRigAligned && !xrSessionEnding) {
    const xrCam = renderer.xr.getCamera();
    const camPos = new THREE.Vector3();
    xrCam.getWorldPosition(camPos);
    if (camPos.lengthSq() > 0.0001) {
      alignWorkbenchRigToHeadset(xrCam);
      xrRigAligned = true;
    }
  }

  // Scene Understanding Path A: WebXR detectedPlanes
  if (xrFrame && xrFrame.detectedPlanes && !traySnappedToPlane && renderer.xr.isPresenting && xrFrame.session.mode === 'immersive-ar') {
    const refSpace = renderer.xr.getReferenceSpace();
    if (refSpace) {
      const xrCam = renderer.xr.getCamera();
      const camPos = new THREE.Vector3();
      xrCam.getWorldPosition(camPos);
      for (const plane of xrFrame.detectedPlanes) {
        if (plane.orientation && plane.orientation !== 'horizontal') continue;
        const pose = xrFrame.getPose(plane.planeSpace, refSpace);
        if (!pose) continue;
        const p = pose.transform.position;
        const horizDistFromUser = Math.hypot(p.x - camPos.x, p.z - camPos.z);
        if (p.y >= 0.52 && p.y <= 0.98 && horizDistFromUser < 1.45) {
          snapWorkbenchToDeskHeight(p.y, 'Quest AR Plane');
          break;
        }
      }
    }
  }

  // Scene Understanding Path B: Live WebXR Hit-Test fallback
  if (xrFrame && xrHitTestSource && !traySnappedToPlane && renderer.xr.isPresenting && now - xrSessionStartTime > 1200) {
    const refSpace = renderer.xr.getReferenceSpace();
    if (refSpace) {
      const hitResults = xrFrame.getHitTestResults(xrHitTestSource);
      for (const hit of hitResults) {
        const pose = hit.getPose(refSpace);
        if (!pose) continue;
        const y = pose.transform.position.y;
        if (y >= 0.55 && y <= 0.95) {
          snapWorkbenchToDeskHeight(y, 'Quest AR Hit-Test');
          break;
        }
      }
    }
  }

  const hasRealHands = xrFrame ? updateRealWebXRHands(xrFrame) : false;
  if (!hasRealHands) {
    if (renderer.xr.isPresenting) {
      leftWristPanel.position.set(-0.155, 0.88, -0.02);
      rightWristPanel.position.set(0.155, 0.88, -0.02);
      leftWristPanel.rotation.set(0, 0.26, 0);
      rightWristPanel.rotation.set(0, -0.26, 0);
    } else {
      leftWristPanel.position.set(-0.165, 0.90, -0.12);
      rightWristPanel.position.set(0.175, 0.90, -0.12);
      leftWristPanel.rotation.set(0, 0.18, 0);
      rightWristPanel.rotation.set(0, -0.18, 0);
    }

    const leftHome = leftWristPanel.position.clone().add(new THREE.Vector3(0, -0.06, 0.03));
    const rightHome = rightWristPanel.position.clone().add(new THREE.Vector3(0, -0.06, 0.03));
    leftHand.position.copy(leftHome);
    rightHand.position.copy(rightHome);
    leftHand.rotation.copy(leftWristPanel.rotation);
    rightHand.rotation.copy(rightWristPanel.rotation);

    if (pokeAnim.active) {
      const progress = (now - pokeAnim.startTime) / pokeAnim.durationMs;
      if (progress >= 1.0) {
        pokeAnim.active = false;
        pokeContactRing.visible = false;
      } else {
        const reach = progress < 0.05 ? (progress / 0.05) : progress < 0.92 ? 1.0 : (1.0 - (progress - 0.92) / 0.08);
        const pokingHand = pokeAnim.handSide === 'left' ? leftHand : rightHand;
        const startPos = pokeAnim.handSide === 'left' ? leftHome : rightHome;
        const tipOffset = new THREE.Vector3(
          pokeAnim.handSide === 'left' ? -0.020 : 0.020,
          -0.008,
          0.088
        );
        const targetPalmPos = pokeAnim.targetLocalPos.clone().add(tipOffset);
        pokingHand.position.lerpVectors(startPos, targetPalmPos, reach);
        pokingHand.position.z += Math.sin(progress * Math.PI) * 0.035;

        pokeContactRing.visible = reach > 0.55;
        pokeContactRing.position.copy(pokeAnim.targetLocalPos).add(new THREE.Vector3(0, 0, 0.018));
        const pulseScale = 0.8 + reach * 0.5;
        pokeContactRing.scale.set(pulseScale, pulseScale, 1);
      }
    } else {
      pokeContactRing.visible = false;
    }
  }

  hoveredWristBtn = null;
  xrLaserLines.forEach((l) => { l.visible = false; });
  xrReticle.visible = renderer.xr.isPresenting;

  if (renderer.xr.isPresenting && xrFrame) {
    workbenchRig.updateMatrixWorld(true);
    const activeCam = getActiveMonoCamera();
    const camPos = new THREE.Vector3();
    const camQuat = new THREE.Quaternion();
    activeCam.getWorldPosition(camPos);
    activeCam.getWorldQuaternion(camQuat);

    const gazeDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
    xrReticle.position.copy(camPos).addScaledVector(gazeDir, 0.48);
    xrReticle.quaternion.copy(camQuat);

    const refSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (session && refSpace) {
      let laserIdx = 0;
      for (const source of session.inputSources) {
        // Skip bare/emulated hands here so parked virtual hands never hijack gaze/pointer dwell
        if (source.hand) continue;
        let sourceHitBtn = null;
        if (source.targetRaySpace) {
          const rayPose = xrFrame.getPose(source.targetRaySpace, refSpace);
          if (rayPose) {
            const origin = new THREE.Vector3().copy(rayPose.transform.position);
            const quat = new THREE.Quaternion().copy(rayPose.transform.orientation);
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);

            sourceHitBtn = findWristButtonAlongRay(origin, dir);
            if (sourceHitBtn) {
              hoveredWristBtn = sourceHitBtn;
            }

            if (source.targetRayMode === 'tracked-pointer' && laserIdx < 2) {
              const line = xrLaserLines[laserIdx++];
              line.visible = true;
              line.position.copy(origin);
              line.quaternion.copy(quat);
              line.material.color.setHex(sourceHitBtn ? 0x10b981 : 0x38bdf8);
            }
          }
        }

        if (source.gamepad && source.gamepad.buttons) {
          const isPressed = source.gamepad.buttons.some((b) => b && (b.pressed || b.value > 0.5));
          const key = source.handedness || laserIdx;
          const wasPressed = prevGamepadPressed.get(key) || false;
          if (isPressed && !wasPressed && now >= xrEntryGuardUntil) {
            const btnToFire = sourceHitBtn || hoveredWristBtn;
            if (btnToFire) executeWristAction(btnToFire.userData.wristAction, btnToFire);
          }
          prevGamepadPressed.set(key, isPressed);
        }
      }
    }

    if (!hoveredWristBtn) {
      hoveredWristBtn = findWristButtonAlongRay(camPos, gazeDir);
    }

    if (!hoveredWristBtn) {
      raycaster.setFromCamera(pointer, activeCam);
      hoveredWristBtn = findWristButtonAlongRay(raycaster.ray.origin, raycaster.ray.direction);
    }

    if (hoveredWristBtn) {
      lastHoveredWristBtn = hoveredWristBtn;
      lastHoverTimestamp = now;
    }

    if (hoveredWristBtn) {
      const btnWorldPos = new THREE.Vector3();
      const btnWorldQuat = new THREE.Quaternion();
      hoveredWristBtn.getWorldPosition(btnWorldPos);
      hoveredWristBtn.getWorldQuaternion(btnWorldQuat);
      const normalOffset = new THREE.Vector3(0, 0, 0.026).applyQuaternion(btnWorldQuat);
      xrReticle.position.copy(btnWorldPos).add(normalOffset);
      xrReticle.quaternion.copy(btnWorldQuat);

      xrDwellArcMesh.position.copy(xrReticle.position);
      xrDwellArcMesh.quaternion.copy(btnWorldQuat);
      xrDwellArcMesh.visible = true;
      const faceOffset = new THREE.Vector3(0, 0, 0.0145).applyQuaternion(btnWorldQuat);
      xrFaceGlowMesh.position.copy(btnWorldPos).add(faceOffset);
      xrFaceGlowMesh.quaternion.copy(btnWorldQuat);
      xrFaceGlowMesh.visible = true;

      if (
        gazeDwellTarget !== hoveredWristBtn ||
        (gazeDwellLatched && gazeDwellCompletedAt > 0 && now - gazeDwellCompletedAt > 650)
      ) {
        gazeDwellTarget = hoveredWristBtn;
        gazeDwellStartMs = now;
        gazeDwellLatched = false;
        gazeDwellCompletedAt = 0;
        hoveredWristBtn.userData.activeUntil = 0;
      }

      const localBtnPos = workbenchRig.worldToLocal(btnWorldPos.clone());
      pokeContactRing.visible = true;
      pokeContactRing.position.copy(localBtnPos).add(new THREE.Vector3(0, 0, 0.018));
      pokeContactRing.rotation.copy(hoveredWristBtn.parent.rotation);

      if (!gazeDwellLatched) {
        const dwellProgress = Math.min((now - gazeDwellStartMs) / GAZE_DWELL_MS, 1.0);
        const s = 0.25 + dwellProgress * 2.35;
        xrReticle.scale.set(s, s, 1);
        xrReticle.material.color.setHex(0xf59e0b);
        pokeContactRing.material.color.setHex(0xf59e0b);
        pokeContactRing.scale.set(s, s, 1);
        updateDwellProgressArc(dwellProgress, false);
        xrFaceGlowMesh.material.color.setHex(0xf59e0b);
        xrFaceGlowMesh.material.opacity = 0.12 + dwellProgress * 0.30;

        if (dwellProgress >= 1.0) {
          gazeDwellLatched = true;
          gazeDwellCompletedAt = now;
          xrReticle.scale.set(1.6, 1.6, 1);
          xrReticle.material.color.setHex(0x10b981);
          pokeContactRing.material.color.setHex(0x10b981);
          pokeContactRing.scale.set(1.6, 1.6, 1);
          updateDwellProgressArc(1.0, true);
          xrFaceGlowMesh.material.color.setHex(0x10b981);
          xrFaceGlowMesh.material.opacity = 0.45;
          executeWristAction(hoveredWristBtn.userData.wristAction, hoveredWristBtn);
          gazeDwellLatched = true;
        }
      } else {
        xrReticle.scale.set(1.5, 1.5, 1);
        xrReticle.material.color.setHex(0x10b981);
        pokeContactRing.material.color.setHex(0x10b981);
        pokeContactRing.scale.set(1.5, 1.5, 1);
        updateDwellProgressArc(1.0, true);
        xrFaceGlowMesh.material.color.setHex(0x10b981);
        xrFaceGlowMesh.material.opacity = 0.45;
      }
    } else {
      gazeDwellTarget = null;
      gazeDwellLatched = false;
      gazeDwellCompletedAt = 0;
      xrReticle.scale.set(1, 1, 1);
      xrReticle.material.color.setHex(0x38bdf8);
      xrDwellArcMesh.visible = false;
      xrFaceGlowMesh.visible = false;
      if (!pokeAnim.active) pokeContactRing.visible = false;
    }
  } else {
    xrDwellArcMesh.visible = false;
    xrFaceGlowMesh.visible = false;
    workbenchRig.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    hoveredWristBtn = findWristButtonAlongRay(raycaster.ray.origin, raycaster.ray.direction);
  }

  wristButtons3D.forEach((btn) => {
    const isHover = btn === hoveredWristBtn;
    const isChargingDwell = isHover && renderer.xr.isPresenting && !gazeDwellLatched;
    const isPoked = now < (btn.userData.activeUntil || 0);
    btn.scale.set(isHover || isPoked ? 1.16 : 1.0, isHover || isPoked ? 1.20 : 1.0, 1.0);
    // Prioritize amber face glow (#f59e0b) during dwell charging
    btn.material.color.setHex(
      isChargingDwell ? 0xf59e0b : isPoked ? 0x34d399 : isHover ? 0x6ee7b7 : 0xffffff
    );
  });

  const rpmSpeedScale = state.rpm / 1800;
  parts.forEach((part, idx) => {
    if (part === draggedPart) return;
    if (part.userData.quarantined) {
      const targetDeskPos = new THREE.Vector3(
        trayGroup.position.x,
        trayGroup.position.y + 0.03,
        trayGroup.position.z
      );
      part.position.lerp(targetDeskPos, dt * 7.0);
      part.rotation.x = THREE.MathUtils.lerp(part.rotation.x, -Math.PI / 2, dt * 6.0);
    } else {
      part.position.lerpVectors(
        part.userData.assembledPos,
        part.userData.explodedPos,
        state.explodeFactor
      );
      part.rotation.x = THREE.MathUtils.lerp(part.rotation.x, 0, dt * 6.0);
      if (part.userData.spinSpeed && state.explodeFactor < 0.25) {
        part.rotation.z += part.userData.spinSpeed * rpmSpeedScale * dt * (1.0 - state.explodeFactor * 3.0);
      }
    }

    const cLine = conduitLines[idx];
    if (cLine) {
      const positions = cLine.line.geometry.attributes.position.array;
      positions[3] = part.position.x;
      positions[4] = part.position.y;
      positions[5] = part.position.z;
      cLine.line.geometry.attributes.position.needsUpdate = true;
      cLine.line.material.opacity = part.userData.quarantined ? 0 : state.explodeFactor * 0.45;
    }
  });

  const activeTarget = state.selectedPart || faultyPlanetGear;
  if (state.caliperActive && activeTarget) {
    const gearWorldPos = new THREE.Vector3();
    activeTarget.getWorldPosition(gearWorldPos);
    const localGearPos = workbenchRig.worldToLocal(gearWorldPos);
    caliperGroup.position.copy(localGearPos).add(new THREE.Vector3(0.02, 0.065, 0.05));

    const activeCam = getActiveMonoCamera();
    const camWorldPos = new THREE.Vector3();
    activeCam.getWorldPosition(camWorldPos);
    caliperBadge.lookAt(camWorldPos);
  }

  orbCore.rotation.y += dt * 1.8;
  orbCore.rotation.x += dt * 1.1;
  agentOrbGroup.position.set(
    trayGroup.position.x,
    trayGroup.position.y + 0.285 + Math.sin(elapsed * 3.0) * 0.015,
    trayGroup.position.z
  );

  promptBillboard.visible = renderer.xr.isPresenting;

  if (!renderer.xr.isPresenting) {
    controls.update();
  }
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
