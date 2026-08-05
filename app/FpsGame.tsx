"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Box = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };
type FireMode = "SEMI" | "BURST" | "AUTO";
type MenuPage = "HOME" | "LOADOUT";

const WEAPON_STATS: Record<string, { damage: number; fireRate: number; capacity: number; reload: number; range: number; mobility: number; spread: number; pellets?: number }> = {
  "VXR-4 CARBINE": { damage: 32, fireRate: 72, capacity: 30, reload: 2.35, range: 74, mobility: 68, spread: 1.25 },
  "M12 SMG": { damage: 24, fireRate: 91, capacity: 36, reload: 1.85, range: 48, mobility: 90, spread: 2.1 },
  "BR-7 RIFLE": { damage: 58, fireRate: 43, capacity: 20, reload: 2.8, range: 94, mobility: 51, spread: 0.65 },
  "SNR-90 SNIPER": { damage: 96, fireRate: 16, capacity: 5, reload: 3.4, range: 100, mobility: 34, spread: 0.12 },
  "KSG-12 SHOTGUN": { damage: 18, fireRate: 22, capacity: 8, reload: 4.1, range: 30, mobility: 58, spread: 5.8, pellets: 8 },
  "HMG-6 LMG": { damage: 38, fireRate: 66, capacity: 60, reload: 5.2, range: 78, mobility: 27, spread: 1.75 },
  "AKR-47 ASSAULT": { damage: 44, fireRate: 61, capacity: 30, reload: 2.65, range: 76, mobility: 61, spread: 1.6 },
  "M8 BURST RIFLE": { damage: 35, fireRate: 78, capacity: 27, reload: 2.25, range: 72, mobility: 70, spread: 1.05 },
  "DMR-11 MARKSMAN": { damage: 67, fireRate: 34, capacity: 12, reload: 2.9, range: 96, mobility: 45, spread: 0.32 },
  "VX-9 PDW": { damage: 21, fireRate: 98, capacity: 42, reload: 2.05, range: 42, mobility: 93, spread: 2.35 },
  "P9 SIDEARM": { damage: 28, fireRate: 58, capacity: 15, reload: 1.45, range: 45, mobility: 94, spread: 1.55 },
  "R45 REVOLVER": { damage: 72, fireRate: 29, capacity: 6, reload: 3.1, range: 61, mobility: 76, spread: 0.9 },
  "G18 AUTO PISTOL": { damage: 19, fireRate: 95, capacity: 24, reload: 1.75, range: 35, mobility: 96, spread: 2.65 },
  "DB-2 SAWED-OFF": { damage: 22, fireRate: 18, capacity: 2, reload: 2.6, range: 20, mobility: 81, spread: 7.2, pellets: 6 },
};
const MEDICAL_STATS: Record<string, { healing: number; duration: number }> = {
  "FIELD MEDKIT": { healing: 60, duration: 2.5 },
  "STIM INJECTOR": { healing: 35, duration: 1.15 },
  "TRAUMA KIT": { healing: 100, duration: 4.0 },
};

const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.38;

export function FpsGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const respawnRef = useRef<() => void>(() => {});
  const [locked, setLocked] = useState(false);
  const [started, setStarted] = useState(false);
  const [ammo, setAmmo] = useState(30);
  const [fireMode, setFireMode] = useState<FireMode>("AUTO");
  const [sessionId, setSessionId] = useState(0);
  const [menuPage, setMenuPage] = useState<MenuPage>("HOME");
  const [primary, setPrimary] = useState("VXR-4 CARBINE");
  const [secondary, setSecondary] = useState("P9 SIDEARM");
  const [medical, setMedical] = useState("FIELD MEDKIT");
  const [utility, setUtility] = useState("FRAG GRENADE");
  const [activeSlot, setActiveSlot] = useState(1);
  const [reloading, setReloading] = useState(false);
  const [reloadDuration, setReloadDuration] = useState(0);
  const [utilityCount, setUtilityCount] = useState(2);
  const [flashed, setFlashed] = useState(false);
  const [health, setHealth] = useState(100);
  const [dead, setDead] = useState(false);
  const [medicalCount, setMedicalCount] = useState(2);
  const [healingEffect, setHealingEffect] = useState(false);
  const [healing, setHealing] = useState(false);
  const [healDuration, setHealDuration] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111b21);
    scene.fog = new THREE.Fog(0x111b21, 25, 72);

    const camera = new THREE.PerspectiveCamera(78, mount.clientWidth / mount.clientHeight, 0.05, 120);
    camera.position.set(0, PLAYER_HEIGHT, 15);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x9dc6d8, 0x162017, 1.8));
    const sun = new THREE.DirectionalLight(0xffd6a0, 3.5);
    sun.position.set(-18, 28, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
    scene.add(sun);

    const boxes: Box[] = [];
    const material = (color: number, roughness = 0.82, metalness = 0.05) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), material(0x364044));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(64, 32, 0x516166, 0x465358);
    grid.position.y = 0.008;
    scene.add(grid);

    function addBox(x: number, y: number, z: number, w: number, h: number, d: number, color: number, collide = true) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      if (collide) boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: y + h / 2 });
      return mesh;
    }

    // Perimeter and cover
    addBox(0, 2.5, -31.5, 64, 5, 1, 0x263238);
    addBox(0, 2.5, 31.5, 64, 5, 1, 0x263238);
    addBox(-31.5, 2.5, 0, 1, 5, 64, 0x263238);
    addBox(31.5, 2.5, 0, 1, 5, 64, 0x263238);

    addBox(-10, 1.4, 5, 8, 2.8, 3.2, 0xb55232);
    addBox(-10, 4.25, 5, 8, 2.8, 3.2, 0x8d3c2a);
    addBox(11, 1.4, -7, 9, 2.8, 3.2, 0x2f6c76);
    addBox(4, 1.25, 8, 3, 2.5, 7, 0x5c6869);
    addBox(-4, 0.8, -7, 5, 1.6, 2, 0x8a784e);
    addBox(18, 1.1, 11, 4, 2.2, 4, 0x596467);
    addBox(-20, 1.1, -12, 4, 2.2, 4, 0x596467);
    addBox(0, 1.75, -21, 16, 3.5, 1.2, 0x424f52);

    // Collision test course
    addBox(-23, 1.5, 4, 1, 3, 13, 0x687477);
    addBox(-17, 1.5, -2, 11, 3, 1, 0x687477);
    addBox(-12, 1.5, 3, 1, 3, 9, 0x687477);
    addBox(-17, 0.65, 9, 5, 1.3, 1, 0x8d7650);

    // Player test pads: damage, instant death, and healing.
    const padMaterial = (color: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8, roughness: 0.5 });
    const addPad = (x: number, z: number, color: number) => {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 4), padMaterial(color));
      pad.position.set(x, 0.06, z); scene.add(pad);
    };
    addPad(-8, 23, 0xff8a24);
    addPad(0, 23, 0xff263f);
    addPad(8, 23, 0x37dc80);

    // Human-shaped test dummies with separate head and body hit zones.
    const dummies: THREE.Group[] = [];
    const addDummy = (x: number, z: number, color: number, movement: "static" | "walk" | "sprint" = "static") => {
      const dummy = new THREE.Group(); dummy.position.set(x, 0, z);
      dummy.userData.health = 150; dummy.userData.maxHealth = 150;
      dummy.userData.movement = movement; dummy.userData.laneOrigin = z;
      dummy.userData.rig = [] as { kind: "arm" | "leg"; side: number; upper: THREE.Mesh; lower: THREE.Mesh; joint?: THREE.Mesh; end: THREE.Mesh }[];
      const dummyMat = material(color, 0.55, 0.15);
      const armorMat = material(0x20292b, 0.7, 0.28);
      const fabricMat = material(0x303a3b, 0.92, 0.02);
      const visorMat = new THREE.MeshStandardMaterial({ color: 0x76b9c7, emissive: 0x173b43, emissiveIntensity: 0.8, metalness: 0.65, roughness: 0.18 });
      const addLimb = (geometry: THREE.BufferGeometry, px: number, py: number, pz: number, multiplier = 1, partMaterial: THREE.Material = dummyMat) => {
        const mesh = new THREE.Mesh(geometry, partMaterial); mesh.position.set(px, py, pz); mesh.castShadow = true;
        mesh.userData.dummy = dummy; mesh.userData.damageMultiplier = multiplier; dummy.add(mesh); return mesh;
      };
      // Torso, plate carrier, pouches, belt and backpack.
      addLimb(new THREE.BoxGeometry(0.6, 0.78, 0.3), 0, 1.38, 0, 1, fabricMat);
      addLimb(new THREE.BoxGeometry(0.66, 0.56, 0.16), 0, 1.48, -0.19, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.17, 0.14, 0.12), -0.2, 1.18, -0.25, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.17, 0.14, 0.12), 0, 1.18, -0.25, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.17, 0.14, 0.12), 0.2, 1.18, -0.25, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.56, 0.1, 0.34), 0, 0.98, 0, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.5, 0.58, 0.2), 0, 1.48, 0.24, 1, armorMat);
      // Helmet, face, visor, headset and neck.
      addLimb(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 10), 0, 1.77, 0, 1.5, fabricMat);
      addLimb(new THREE.SphereGeometry(0.235, 16, 11), 0, 2.03, 0, 1.75, dummyMat);
      addLimb(new THREE.SphereGeometry(0.265, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.54), 0, 2.12, 0.01, 1.75, armorMat);
      addLimb(new THREE.BoxGeometry(0.34, 0.095, 0.04), 0, 2.04, -0.222, 1.75, visorMat);
      addLimb(new THREE.BoxGeometry(0.055, 0.18, 0.08), -0.255, 2.04, 0, 1.75, armorMat);
      // Segmented arms, shoulder armor and gloves.
      [-1, 1].forEach((side) => {
        addLimb(new THREE.SphereGeometry(0.17, 10, 8), side * 0.43, 1.65, 0, 1, armorMat);
        const upper = addLimb(new THREE.CylinderGeometry(0.105, 0.095, 0.44, 9), side * 0.45, 1.42, 0, 1, fabricMat); upper.rotation.z = side * -0.08;
        const forearm = addLimb(new THREE.CylinderGeometry(0.09, 0.075, 0.38, 9), side * 0.47, 1.04, -0.02, 1, fabricMat);
        const glove = addLimb(new THREE.BoxGeometry(0.17, 0.16, 0.18), side * 0.48, 0.8, -0.02, 1, armorMat);
        dummy.userData.rig.push({ kind: "arm", side, upper, lower: forearm, end: glove });
      });
      // Thighs, knee pads, lower legs and boots.
      [-1, 1].forEach((side) => {
        const thigh = addLimb(new THREE.CylinderGeometry(0.13, 0.115, 0.46, 9), side * 0.19, 0.74, 0, 1, fabricMat);
        const knee = addLimb(new THREE.BoxGeometry(0.23, 0.18, 0.14), side * 0.19, 0.47, -0.1, 1, armorMat);
        const shin = addLimb(new THREE.CylinderGeometry(0.11, 0.09, 0.4, 9), side * 0.19, 0.25, 0, 1, fabricMat);
        const boot = addLimb(new THREE.BoxGeometry(0.24, 0.14, 0.38), side * 0.19, 0.08, -0.08, 1, armorMat);
        dummy.userData.rig.push({ kind: "leg", side, upper: thigh, lower: shin, joint: knee, end: boot });
      });
      const barBack = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.09), new THREE.MeshBasicMaterial({ color: 0x151a1b, side: THREE.DoubleSide }));
      barBack.position.set(0, 2.48, 0); barBack.raycast = () => {}; dummy.add(barBack);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.055), new THREE.MeshBasicMaterial({ color: 0x63e690, side: THREE.DoubleSide }));
      bar.position.set(0, 2.48, -0.006); bar.raycast = () => {}; dummy.add(bar); dummy.userData.healthBar = bar;
      scene.add(dummy); dummies.push(dummy);
    };
    addDummy(-7, -14, 0x4d7182); addDummy(0, -14, 0x706347); addDummy(7, -14, 0x754b4b);
    addDummy(15, -15, 0x38785d, "walk"); addDummy(26, -15, 0x804f32, "sprint");

    // Landmark tower and emissive arena lights
    addBox(22, 4, -20, 5, 8, 5, 0x343f43);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 4, 12), new THREE.MeshStandardMaterial({ color: 0xff6b35, emissive: 0xff4b18, emissiveIntensity: 4 }));
    beacon.position.set(22, 10, -20);
    scene.add(beacon);

    [-22, 0, 22].forEach((x) => {
      const lamp = new THREE.PointLight(0x74d9ff, 18, 13, 2);
      lamp.position.set(x, 4, 27);
      scene.add(lamp);
      addBox(x, 3.9, 30.8, 0.35, 0.35, 0.35, 0x9de8ff, false);
    });

    // Detailed procedural weapon view models. All sights share the same centerline for ADS.
    const gun = new THREE.Group();
    const weaponMaterial = (color: number, metalness = 0.72) => material(color, 0.34, metalness);
    const buildWeapon = (name: string) => {
      const model = new THREE.Group();
      const addPart = (w: number, h: number, d: number, x: number, y: number, z: number, color = 0x20282b) => {
        const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), weaponMaterial(color));
        part.position.set(x, y, z); part.castShadow = true; model.add(part); return part;
      };
      const x = 0.34;
      let muzzleZ = -1.22;

      if (["P9 SIDEARM", "R45 REVOLVER", "G18 AUTO PISTOL", "DB-2 SAWED-OFF"].includes(name)) {
        const revolver = name === "R45 REVOLVER";
        const sawedOff = name === "DB-2 SAWED-OFF";
        const autoPistol = name === "G18 AUTO PISTOL";
        addPart(sawedOff ? 0.28 : revolver ? 0.22 : 0.18, sawedOff ? 0.2 : 0.14, sawedOff ? 0.78 : revolver ? 0.48 : 0.52, x, -0.25, sawedOff ? -0.75 : -0.62, revolver ? 0x343638 : sawedOff ? 0x4b382d : 0x1d2427);
        const grip = addPart(sawedOff ? 0.19 : 0.15, sawedOff ? 0.3 : 0.38, 0.2, x, -0.48, sawedOff ? -0.48 : -0.48, revolver || sawedOff ? 0x5b3727 : 0x252d2f);
        grip.rotation.x = -0.25;
        if (revolver) {
          const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 10), weaponMaterial(0x4b5051));
          cylinder.rotation.z = Math.PI / 2; cylinder.position.set(x, -0.27, -0.64); model.add(cylinder);
        } else if (!sawedOff) {
          const magazine = addPart(autoPistol ? 0.125 : 0.115, autoPistol ? 0.44 : 0.31, 0.14, x, autoPistol ? -0.59 : -0.53, -0.48, 0x111719);
          magazine.rotation.x = -0.25;
          addPart(0.15, 0.025, 0.17, x, -0.7, -0.43, 0x343d3f);
        }
        if (autoPistol) addPart(0.07, 0.08, 0.18, x, -0.17, -0.7, 0x263437);
        if (sawedOff) {
          const secondBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10), weaponMaterial(0x171c1d));
          secondBarrel.rotation.x = Math.PI / 2; secondBarrel.position.set(x + 0.065, -0.24, -1.32); model.add(secondBarrel);
        }
        muzzleZ = sawedOff ? -1.58 : revolver ? -0.91 : -0.93;
      } else if (name === "COMBAT KNIFE") {
        addPart(0.12, 0.12, 0.42, x, -0.32, -0.46, 0x272f30);
        const blade = addPart(0.045, 0.15, 0.7, x, -0.25, -0.98, 0x9ca6a4);
        blade.rotation.z = 0.08; muzzleZ = -1.34;
      } else {
        const isSmg = name === "M12 SMG" || name === "VX-9 PDW";
        const isSniper = name === "SNR-90 SNIPER";
        const isShotgun = name === "KSG-12 SHOTGUN";
        const isLmg = name === "HMG-6 LMG";
        const isAkr = name === "AKR-47 ASSAULT";
        const isBurst = name === "M8 BURST RIFLE";
        const isRifle = name === "BR-7 RIFLE" || name === "DMR-11 MARKSMAN" || isSniper;
        const accent = isAkr ? 0x76513a : isBurst ? 0x4b555d : isSmg ? 0x2f4a4e : isRifle ? 0x584f3c : isShotgun ? 0x3f3430 : isLmg ? 0x384638 : 0x343e40;
        addPart(isSmg ? 0.21 : isLmg ? 0.3 : 0.23, isLmg ? 0.25 : 0.2, isRifle ? 0.72 : isShotgun ? 0.78 : 0.6, x, -0.28, -0.57, 0x1b2224);
        addPart(isSmg ? 0.19 : isShotgun ? 0.23 : 0.18, isShotgun ? 0.2 : 0.16, isRifle ? 0.62 : isShotgun ? 0.72 : 0.46, x, -0.27, isRifle ? -1.18 : isShotgun ? -1.24 : -1.04, accent);
        const stock = addPart(isSmg ? 0.08 : 0.2, isSmg ? 0.1 : 0.22, isSmg ? 0.38 : 0.5, x, -0.3, -0.08, 0x242c2e);
        stock.rotation.x = isSmg ? 0 : -0.08;
        const magazine = addPart(isLmg ? 0.42 : isSmg ? 0.13 : 0.145, isLmg ? 0.28 : isSmg ? 0.46 : isRifle ? 0.32 : 0.39, isLmg ? 0.32 : isSmg ? 0.14 : 0.19, x, isSmg ? -0.56 : -0.5, isLmg ? -0.62 : isSmg ? -0.72 : -0.58, 0x111719);
        magazine.rotation.x = isSmg ? 0.04 : -0.2;
        addPart((isSmg ? 0.15 : 0.165), 0.03, 0.21, x, isSmg ? -0.8 : -0.69, isSmg ? -0.72 : -0.51, 0x465154);
        const barrelLength = isSniper ? 0.76 : isShotgun ? 0.58 : isRifle ? 0.55 : 0.38;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(isShotgun ? 0.04 : 0.025, isShotgun ? 0.04 : 0.025, barrelLength, 10), weaponMaterial(0x111718));
        barrel.rotation.x = Math.PI / 2; barrel.position.set(x, -0.25, isSniper ? -1.82 : isRifle || isShotgun ? -1.73 : -1.43); model.add(barrel);
        muzzleZ = isSniper ? -2.21 : isRifle || isShotgun ? -2.02 : -1.64;
        if (isSniper) {
          const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.52, 12, 1, true), weaponMaterial(0x151b1d));
          scope.rotation.x = Math.PI / 2; scope.position.set(x, -0.105, -0.7); model.add(scope);
        }
        if (isShotgun) addPart(0.16, 0.17, 0.34, x, -0.28, -1.48, 0x665044);
        if (isLmg) addPart(0.28, 0.05, 0.68, x, -0.13, -0.7, 0x525e50);
        if (isAkr) { magazine.rotation.x = -0.38; addPart(0.19, 0.12, 0.34, x, -0.23, -1.34, 0x76513a); }
        if (isBurst) addPart(0.2, 0.05, 0.45, x, -0.14, -0.75, 0x63717a);
      }

      // Firearms get an open rear aperture and front post; melee weapons do not.
      if (name !== "COMBAT KNIFE") {
        const rearSight = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 8, 18), weaponMaterial(0x101719));
        rearSight.position.set(x, -0.145, -0.46); model.add(rearSight);
        const frontLeft = addPart(0.012, 0.085, 0.025, x - 0.052, -0.18, muzzleZ + 0.16, 0x12191b);
        const frontRight = frontLeft.clone(); frontRight.position.x = x + 0.052; model.add(frontRight);
        addPart(0.012, 0.065, 0.02, x, -0.175, muzzleZ + 0.15, 0xff6b3c);
      }
      const muzzleAnchor = new THREE.Object3D(); muzzleAnchor.position.set(x, -0.25, muzzleZ); model.add(muzzleAnchor);
      // First-person geometry is visual only and must never intercept a weapon ray.
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) object.raycast = () => {};
      });
      return { model, muzzleAnchor };
    };
    const primaryWeapon = buildWeapon(primary);
    const secondaryWeapon = buildWeapon(secondary);
    gun.add(primaryWeapon.model, secondaryWeapon.model);
    const muzzle = new THREE.PointLight(0xff7b35, 0, 2.5, 2);
    muzzle.position.set(0.34, -0.2, -1.1);
    gun.add(muzzle);
    camera.add(gun);
    scene.add(camera);

    const trajectoryMaterial = new THREE.LineBasicMaterial({ color: 0x8fe7ff, transparent: true, opacity: 0.8 });
    const trajectory = new THREE.Line(new THREE.BufferGeometry(), trajectoryMaterial);
    trajectory.visible = false;
    scene.add(trajectory);

    const keys = new Set<string>();
    let yaw = 0, pitch = 0, verticalVelocity = 0, grounded = true;
    const primaryStats = WEAPON_STATS[primary];
    const secondaryIsMelee = secondary === "COMBAT KNIFE";
    const secondaryStats = WEAPON_STATS[secondary] ?? { damage: 100, fireRate: 100, capacity: 1, reload: 0.6, range: 5, mobility: 100, spread: 0 };
    const ammoCounts = [primaryStats.capacity, secondaryStats.capacity];
    setAmmo(primaryStats.capacity);
    let ammoCount = ammoCounts[0], recoil = 0, muzzleTimer = 0, aiming = false, sprinting = false, reloadEnd = 0, meleeSwing = 0, lastMelee = 0;
    let throwableAiming = false, grenadesLeft = 2, medicalCharges = 2;
    const projectiles: { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number; type: string }[] = [];
    let currentFireMode: FireMode = "AUTO", triggerHeld = false, lastShot = 0, currentSlot = 1, movementSpread = 1;
    let playerHealth = 100, nextPadTick = 0, healEnd = 0;
    respawnRef.current = () => {
      camera.position.set(0, PLAYER_HEIGHT, 15);
      yaw = 0; pitch = 0; verticalVelocity = 0; playerHealth = 100;
      keys.clear();
    };
    let last = performance.now();
    const clock = new THREE.Clock();

    const collides = (x: number, z: number) => boxes.some((b) =>
      x + PLAYER_RADIUS > b.minX && x - PLAYER_RADIUS < b.maxX &&
      z + PLAYER_RADIUS > b.minZ && z - PLAYER_RADIUS < b.maxZ && b.height > 0.25
    );

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === "Space" && grounded) { verticalVelocity = 5.7; grounded = false; }
      if (e.code === "KeyR" && currentSlot <= 2 && !reloadEnd) {
        const stats = currentSlot === 1 ? primaryStats : secondaryStats;
        if (ammoCounts[currentSlot - 1] < stats.capacity) {
          reloadEnd = performance.now() + stats.reload * 1000;
          triggerHeld = false;
          aiming = false;
          setReloadDuration(stats.reload);
          setReloading(true);
        }
      }
      if (e.code === "KeyB" && !e.repeat) {
        const modes: FireMode[] = ["SEMI", "BURST", "AUTO"];
        currentFireMode = modes[(modes.indexOf(currentFireMode) + 1) % modes.length];
        setFireMode(currentFireMode);
      }
      if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code)) {
        currentSlot = Number(e.code.slice(-1));
        setActiveSlot(currentSlot);
        if (currentSlot <= 2) { ammoCount = ammoCounts[currentSlot - 1]; setAmmo(ammoCount); }
        aiming = false;
        triggerHeld = false;
        throwableAiming = false;
        trajectory.visible = false;
        reloadEnd = 0;
        setReloading(false);
        if (currentSlot !== 3 && healEnd) { healEnd = 0; setHealing(false); }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= e.movementX * 0.0022;
      pitch = Math.max(-1.48, Math.min(1.48, pitch - e.movementY * 0.0022));
    };
    const raycaster = new THREE.Raycaster();
    const impactGeometry = new THREE.SphereGeometry(0.045, 6, 6);
    const impactMaterial = new THREE.MeshBasicMaterial({ color: 0xff9a55 });
    const damageDummy = (hit: THREE.Intersection, damage: number) => {
      const dummy = hit.object.userData.dummy as THREE.Group | undefined;
      if (!dummy || !dummy.visible) return;
      dummy.userData.health = Math.max(0, dummy.userData.health - damage * (hit.object.userData.damageMultiplier ?? 1));
      const ratio = dummy.userData.health / dummy.userData.maxHealth;
      (dummy.userData.healthBar as THREE.Mesh).scale.x = Math.max(0.001, ratio);
      ((dummy.userData.healthBar as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(ratio > .5 ? 0x63e690 : ratio > .2 ? 0xffb347 : 0xff4057);
      if (dummy.userData.health <= 0) {
        dummy.visible = false;
        window.setTimeout(() => {
          dummy.userData.health = dummy.userData.maxHealth;
          (dummy.userData.healthBar as THREE.Mesh).scale.x = 1;
          ((dummy.userData.healthBar as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(0x63e690);
          dummy.visible = true;
        }, 3000);
      }
    };
    const getThrow = () => {
      const direction = new THREE.Vector3(); camera.getWorldDirection(direction);
      const start = camera.position.clone().addScaledVector(direction, 0.65).add(new THREE.Vector3(0, -0.18, 0));
      const velocity = direction.multiplyScalar(13).add(new THREE.Vector3(0, 3.8, 0));
      return { start, velocity };
    };
    const throwUtility = () => {
      if (grenadesLeft <= 0) return;
      const { start, velocity } = getThrow();
      const color = utility === "FRAG GRENADE" ? 0x53634d : utility === "SMOKE GRENADE" ? 0xa6afb0 : 0x617585;
      const grenade = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), weaponMaterial(color, 0.5));
      grenade.position.copy(start); grenade.castShadow = true; scene.add(grenade);
      projectiles.push({ mesh: grenade, velocity, age: 0, type: utility });
      grenadesLeft -= 1; setUtilityCount(grenadesLeft);
    };
    const detonate = (projectile: { mesh: THREE.Mesh; type: string }) => {
      const position = projectile.mesh.position.clone();
      scene.remove(projectile.mesh);
      if (projectile.type === "SMOKE GRENADE") {
        const cloud = new THREE.Group(); cloud.position.copy(position); scene.add(cloud);
        for (let i = 0; i < 18; i++) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.7 + Math.random() * 0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0x899597, transparent: true, opacity: 0.2, depthWrite: false }));
          puff.position.set((Math.random() - .5) * 4, Math.random() * 2, (Math.random() - .5) * 4); cloud.add(puff);
        }
        window.setTimeout(() => scene.remove(cloud), 9000);
      } else {
        const blastColor = projectile.type === "FLASHBANG" ? 0xeaffff : 0xff6a32;
        const blast = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: blastColor, transparent: true, opacity: 0.85, wireframe: true }));
        blast.position.copy(position); scene.add(blast);
        let scale = 1;
        const expand = window.setInterval(() => { scale += 0.8; blast.scale.setScalar(scale); }, 20);
        window.setTimeout(() => { window.clearInterval(expand); scene.remove(blast); }, 260);
        if (projectile.type === "FLASHBANG" && camera.position.distanceTo(position) < 13) {
          setFlashed(true); window.setTimeout(() => setFlashed(false), 1700);
        }
      }
    };
    const fireRound = () => {
      if (document.pointerLockElement !== renderer.domElement || sprinting || currentSlot > 2 || reloadEnd > 0) return;
      if (currentSlot === 2 && secondaryIsMelee) {
        const now = performance.now();
        if (now - lastMelee < 480) return;
        lastMelee = now;
        meleeSwing = 1;
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const meleeHit = raycaster.intersectObjects(scene.children, true).find((result) => result.object !== camera && result.distance > 0.5 && result.distance <= 2.35);
        if (meleeHit) {
          damageDummy(meleeHit, 100);
          const slash = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 6), new THREE.MeshBasicMaterial({ color: 0xe9f7f2 }));
          slash.position.copy(meleeHit.point);
          scene.add(slash);
          window.setTimeout(() => { scene.remove(slash); slash.geometry.dispose(); }, 110);
        }
        return;
      }
      if (ammoCount <= 0) return;
      ammoCount -= 1;
      ammoCounts[currentSlot - 1] = ammoCount;
      setAmmo(ammoCount);
      recoil = Math.min(recoil + 0.055, 0.11);
      muzzle.intensity = 35;
      muzzleTimer = 0.045;
      const shotStats = currentSlot === 1 ? primaryStats : secondaryStats;
      const tracerStart = new THREE.Vector3();
      (currentSlot === 1 ? primaryWeapon.muzzleAnchor : secondaryWeapon.muzzleAnchor).getWorldPosition(tracerStart);
      const pelletCount = shotStats.pellets ?? 1;
      const spreadDegrees = shotStats.spread * (aiming ? 0.42 : 1) * movementSpread;
      for (let pellet = 0; pellet < pelletCount; pellet++) {
        const spreadNdc = spreadDegrees / camera.fov;
        const offset = new THREE.Vector2((Math.random() - 0.5) * spreadNdc * 2, (Math.random() - 0.5) * spreadNdc * 2);
        raycaster.setFromCamera(offset, camera);
        const hit = raycaster.intersectObjects(scene.children, true).find((result) => result.object !== camera && result.distance > 1);
        const tracerEnd = hit?.point.clone() ?? raycaster.ray.at(shotStats.range, new THREE.Vector3());
        const tracerMaterial = new THREE.LineBasicMaterial({ color: pelletCount > 1 ? 0xffd09a : 0xffb06b, transparent: true, opacity: 0.82 });
        const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([tracerStart, tracerEnd]), tracerMaterial);
        scene.add(tracer);
        window.setTimeout(() => {
          scene.remove(tracer); tracer.geometry.dispose(); tracerMaterial.dispose();
        }, pelletCount > 1 ? 48 : 65);
        if (hit) {
          damageDummy(hit, shotStats.damage);
          const impact = new THREE.Mesh(impactGeometry, impactMaterial);
          impact.position.copy(hit.point).addScaledVector(hit.face?.normal ?? new THREE.Vector3(0, 1, 0), 0.025);
          scene.add(impact); window.setTimeout(() => scene.remove(impact), 1800);
        }
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      if (e.button === 2) { aiming = true; return; }
      if (e.button !== 0 || sprinting) return;
      if (currentSlot === 3) {
        if (medicalCharges > 0 && playerHealth < 100 && !healEnd) {
          const medicalStats = MEDICAL_STATS[medical];
          healEnd = performance.now() + medicalStats.duration * 1000;
          setHealDuration(medicalStats.duration); setHealing(true);
        }
        return;
      }
      if (currentSlot === 4) { throwableAiming = grenadesLeft > 0; trajectory.visible = throwableAiming; return; }
      triggerHeld = true;
      if (currentFireMode === "SEMI") fireRound();
      if (currentFireMode === "BURST") [0, 85, 170].forEach((delay) => window.setTimeout(() => {
        if (!sprinting) fireRound();
      }, delay));
      if (currentFireMode === "AUTO") { fireRound(); lastShot = performance.now(); }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        triggerHeld = false;
        if (throwableAiming) { throwableAiming = false; trajectory.visible = false; throwUtility(); }
      }
      if (e.button === 2) aiming = false;
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (!isLocked) { aiming = false; triggerHeld = false; throwableAiming = false; trajectory.visible = false; keys.clear(); }
    };
    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("resize", onResize);
    document.addEventListener("pointerlockchange", onLockChange);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch, yaw, 0);

      const input = new THREE.Vector2(
        Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
        Number(keys.has("KeyW")) - Number(keys.has("KeyS"))
      );
      if (input.lengthSq() > 0) input.normalize();
      sprinting = (keys.has("ShiftLeft") || keys.has("ShiftRight")) && input.y > 0 && input.lengthSq() > 0;
      if (sprinting) aiming = false;
      const speed = sprinting ? 8.2 : aiming ? 3.8 : 5.2;
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const dx = (input.x * cos - input.y * sin) * speed * dt;
      const dz = (-input.x * sin - input.y * cos) * speed * dt;
      if (!collides(camera.position.x + dx, camera.position.z)) camera.position.x += dx;
      if (!collides(camera.position.x, camera.position.z + dz)) camera.position.z += dz;

      if (now >= nextPadTick) {
        nextPadTick = now + 250;
        const onPad = (x: number) => Math.abs(camera.position.x - x) < 2 && Math.abs(camera.position.z - 23) < 2;
        if (onPad(-8)) playerHealth = Math.max(0, playerHealth - 8);
        if (onPad(0)) playerHealth = 0;
        if (onPad(8)) playerHealth = Math.min(100, playerHealth + 12);
        setHealth(playerHealth);
        if (playerHealth <= 0) {
          setDead(true); triggerHeld = false; healEnd = 0; setHealing(false); keys.clear();
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }

      verticalVelocity -= 14.5 * dt;
      camera.position.y += verticalVelocity * dt;
      if (camera.position.y <= PLAYER_HEIGHT) { camera.position.y = PLAYER_HEIGHT; verticalVelocity = 0; grounded = true; }

      const moving = input.lengthSq() > 0 && grounded;
      movementSpread = input.lengthSq() > 0 ? 1.55 : 1;
      const t = clock.getElapsedTime();
      dummies.forEach((dummy) => {
        const movement = dummy.userData.movement as "static" | "walk" | "sprint";
        if (movement === "static" || !dummy.visible) return;
        const speed = movement === "sprint" ? 4.2 : 1.75;
        const travel = (t * speed) % 24;
        dummy.position.z = dummy.userData.laneOrigin + (travel <= 12 ? -6 + travel : 18 - travel);
        dummy.rotation.y = travel <= 12 ? Math.PI : 0;
        const stride = Math.sin(t * (movement === "sprint" ? 12 : 6.5));
        const amplitude = movement === "sprint" ? 0.92 : 0.5;
        dummy.position.y = Math.abs(Math.sin(t * (movement === "sprint" ? 12 : 6.5))) * (movement === "sprint" ? .075 : .035);
        const rig = dummy.userData.rig as { kind: "arm" | "leg"; side: number; upper: THREE.Mesh; lower: THREE.Mesh; joint?: THREE.Mesh; end: THREE.Mesh }[];
        rig.forEach((limb) => {
          if (limb.kind === "arm") {
            const angle = stride * amplitude * limb.side;
            const elbowAngle = angle * .55 - (movement === "sprint" ? .3 : .12);
            const shoulderY = 1.62, upperLength = .44, lowerLength = .38;
            limb.upper.position.set(limb.side * .45, shoulderY - Math.cos(angle) * upperLength / 2, -Math.sin(angle) * upperLength / 2);
            limb.upper.rotation.x = angle;
            const elbowY = shoulderY - Math.cos(angle) * upperLength;
            const elbowZ = -Math.sin(angle) * upperLength;
            limb.lower.position.set(limb.side * .47, elbowY - Math.cos(elbowAngle) * lowerLength / 2, elbowZ - Math.sin(elbowAngle) * lowerLength / 2);
            limb.lower.rotation.x = elbowAngle;
            limb.end.position.set(limb.side * .48, elbowY - Math.cos(elbowAngle) * lowerLength, elbowZ - Math.sin(elbowAngle) * lowerLength);
          } else {
            const phase = stride * -limb.side;
            const thighAngle = phase * amplitude;
            const kneeBend = Math.max(0, phase) * (movement === "sprint" ? .95 : .55);
            const shinAngle = thighAngle - kneeBend;
            const hipY = .97, thighLength = .46, shinLength = .4;
            limb.upper.position.set(limb.side * .19, hipY - Math.cos(thighAngle) * thighLength / 2, -Math.sin(thighAngle) * thighLength / 2);
            limb.upper.rotation.x = thighAngle;
            const kneeY = hipY - Math.cos(thighAngle) * thighLength;
            const kneeZ = -Math.sin(thighAngle) * thighLength;
            if (limb.joint) { limb.joint.position.set(limb.side * .19, kneeY, kneeZ - .08); limb.joint.rotation.x = shinAngle; }
            limb.lower.position.set(limb.side * .19, kneeY - Math.cos(shinAngle) * shinLength / 2, kneeZ - Math.sin(shinAngle) * shinLength / 2);
            limb.lower.rotation.x = shinAngle;
            const footY = Math.max(.08, kneeY - Math.cos(shinAngle) * shinLength);
            const footZ = kneeZ - Math.sin(shinAngle) * shinLength - .08;
            limb.end.position.set(limb.side * .19, footY, footZ);
            limb.end.rotation.x = -shinAngle * .35;
          }
        });
      });
      if (healEnd && now >= healEnd) {
        playerHealth = Math.min(100, playerHealth + MEDICAL_STATS[medical].healing);
        medicalCharges -= 1; healEnd = 0;
        setHealth(playerHealth); setMedicalCount(medicalCharges); setHealing(false); setHealingEffect(true);
        window.setTimeout(() => setHealingEffect(false), 650);
      }
      if (throwableAiming) {
        const { start, velocity } = getThrow();
        const points: THREE.Vector3[] = [];
        for (let step = 0; step <= 18; step++) {
          const time = step * 0.09;
          const point = start.clone().addScaledVector(velocity, time);
          point.y -= 7.25 * time * time;
          if (point.y < 0.08) { point.y = 0.08; points.push(point); break; }
          points.push(point);
        }
        trajectory.geometry.dispose(); trajectory.geometry = new THREE.BufferGeometry().setFromPoints(points);
      }
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i]; projectile.age += dt;
        projectile.velocity.y -= 14.5 * dt;
        projectile.mesh.position.addScaledVector(projectile.velocity, dt);
        projectile.mesh.rotation.x += dt * 8; projectile.mesh.rotation.z += dt * 6;
        if (projectile.mesh.position.y <= 0.12) {
          projectile.mesh.position.y = 0.12;
          projectile.velocity.y = Math.abs(projectile.velocity.y) * 0.42;
          projectile.velocity.x *= 0.82; projectile.velocity.z *= 0.82;
        }
        const fuse = projectile.type === "FRAG GRENADE" ? 2.5 : projectile.type === "SMOKE GRENADE" ? 1.5 : 1.8;
        if (projectile.age >= fuse) { detonate(projectile); projectiles.splice(i, 1); }
      }
      meleeSwing = Math.max(0, meleeSwing - dt * 4.6);
      if (reloadEnd && now >= reloadEnd) {
        const stats = currentSlot === 1 ? primaryStats : secondaryStats;
        ammoCount = stats.capacity;
        ammoCounts[currentSlot - 1] = ammoCount;
        reloadEnd = 0;
        setAmmo(ammoCount);
        setReloading(false);
      }
      const activeStats = currentSlot === 1 ? primaryStats : secondaryStats;
      const shotInterval = 60000 / (activeStats.fireRate * 10);
      if (triggerHeld && currentFireMode === "AUTO" && !sprinting && now - lastShot >= shotInterval) {
        fireRound();
        lastShot = now;
      }
      recoil = THREE.MathUtils.lerp(recoil, 0, Math.min(1, dt * 14));
      muzzleTimer -= dt;
      if (muzzleTimer <= 0) muzzle.intensity = 0;
      const bobY = moving ? Math.sin(t * (sprinting ? 13 : 9)) * 0.012 : Math.sin(t * 2) * 0.003;
      const reloadPhase = reloadEnd ? 1 - Math.max(0, reloadEnd - now) / ((currentSlot === 1 ? primaryStats.reload : secondaryStats.reload) * 1000) : 0;
      const reloadDip = reloadEnd ? Math.sin(Math.min(1, reloadPhase) * Math.PI) : 0;
      const targetX = reloadEnd ? 0.16 : sprinting ? -0.13 : aiming ? -0.34 : (moving ? Math.cos(t * 6.5) * 0.008 : 0);
      const targetY = reloadEnd ? -0.52 * reloadDip : sprinting ? -0.2 : aiming ? 0.15 : bobY - recoil * 0.3;
      const targetZ = reloadEnd ? 0.24 : sprinting ? 0.16 : aiming ? 0.2 + recoil : recoil;
      gun.position.x = THREE.MathUtils.lerp(gun.position.x, targetX, Math.min(1, dt * 12));
      gun.position.y = THREE.MathUtils.lerp(gun.position.y, targetY, Math.min(1, dt * 12));
      gun.position.z = THREE.MathUtils.lerp(gun.position.z, targetZ, Math.min(1, dt * 12));
      gun.rotation.x = THREE.MathUtils.lerp(gun.rotation.x, reloadEnd ? -0.45 : sprinting ? -0.22 : recoil * 0.7, Math.min(1, dt * 12));
      gun.rotation.z = THREE.MathUtils.lerp(gun.rotation.z, reloadEnd ? -0.35 : sprinting ? 0.72 : 0, Math.min(1, dt * 12));
      const slashArc = secondaryIsMelee && currentSlot === 2 ? Math.sin(meleeSwing * Math.PI) : 0;
      gun.rotation.y = THREE.MathUtils.lerp(gun.rotation.y, -slashArc * 0.85, Math.min(1, dt * 22));
      if (secondaryIsMelee && currentSlot === 2) gun.position.x += slashArc * 0.18;
      gun.visible = currentSlot <= 2;
      primaryWeapon.model.visible = currentSlot === 1;
      secondaryWeapon.model.visible = currentSlot === 2;
      camera.fov = THREE.MathUtils.lerp(camera.fov, aiming ? 58 : sprinting ? 84 : 78, Math.min(1, dt * 10));
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerlockchange", onLockChange);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [sessionId, primary, secondary, medical, utility]);

  const equippedItems = [primary, secondary, medical, utility];
  const activeIsMelee = activeSlot === 2 && secondary === "COMBAT KNIFE";

  return (
    <main className={`game-shell${!started ? " game-menu" : ""}`}>
      <div ref={mountRef} className="viewport" aria-label="3D first-person training arena" />
      <div className="vignette" />
      <header className="topbar">
        <div className="brand"><span>STRIKE</span><b>YARD</b></div>
        <div className="mission"><small>TRAINING SECTOR 01</small><strong>FREE ROAM</strong></div>
        <div className="status"><i /> SYSTEMS ONLINE</div>
      </header>
      <div className="crosshair"><span /><span /></div>
      <div className="hud-left"><small>VITALS</small><strong>{health}</strong><div className="health"><i style={{ width: `${health}%` }} /></div></div>
      <div className="hud-right"><small>{equippedItems[activeSlot - 1]}{activeIsMelee ? " · MELEE" : activeSlot <= 2 ? ` · ${fireMode}` : " · READY"}</small><strong>{activeSlot === 4 ? utilityCount : activeSlot === 3 ? medicalCount : activeIsMelee ? "—" : ammo} <em>{activeSlot === 4 ? "THROWABLES" : activeSlot === 3 ? "MEDICAL" : activeIsMelee ? "" : "/ 120"}</em></strong></div>
      {reloading && <div className="reload-status"><span>RELOADING</span><i style={{ animationDuration: `${reloadDuration}s` }} /></div>}
      {healing && <div className="heal-status"><span>USING {medical}</span><small>SWITCH EQUIPMENT TO CANCEL</small><i style={{ animationDuration: `${healDuration}s` }} /></div>}
      <div className="quick-slots">
        {([
          [1, primary, "PRIMARY"], [2, secondary, "SECONDARY"], [3, medical, "MEDICAL"], [4, utility, "UTILITY"]
        ] as [number, string, string][]).map(([slot, item, label]) => <div key={slot} className={activeSlot === slot ? "active" : ""}>
          <kbd>{slot}</kbd><span><small>{label}</small><b>{item}</b></span>
        </div>)}
      </div>
      <div className={`flash-effect${flashed ? " active" : ""}`} />
      <div className={`heal-effect${healingEffect ? " active" : ""}`} />
      <div className="test-legend"><span className="damage-dot" /> DAMAGE PAD <span className="kill-dot" /> KILL PAD <span className="heal-dot" /> HEAL PAD</div>
      <div className="controls"><kbd>WASD</kbd> MOVE <kbd>SHIFT</kbd> SPRINT <kbd>RMB</kbd> AIM <kbd>LMB</kbd> FIRE <kbd>B</kbd> MODE <kbd>R</kbd> RELOAD</div>
      {dead && <div className="death-screen">
        <div className="death-code">KIA</div><h2>OPERATOR DOWN</h2><p>TEST CONDITION: FATAL DAMAGE</p>
        <button onClick={() => {
          respawnRef.current(); setHealth(100); setDead(false);
          mountRef.current?.querySelector("canvas")?.requestPointerLock();
        }}>RESPAWN AT TEST YARD</button>
      </div>}
      {!locked && !dead && <div className={`menu-screen${!started ? " main-menu-screen" : " pause-screen"}`}>
        <div className="menu-rule" />
        <section className="menu-card">
          <div className="menu-kicker">TACTICAL TRAINING SIMULATION</div>
          {(!started && menuPage === "HOME") && <>
          <h1><span>STRIKE</span>YARD</h1>
          <p>SECTOR 01 · COMBAT READINESS COURSE</p>
          <nav className="main-nav" aria-label="Main menu">
            <button className="nav-active" onClick={() => {
              mountRef.current?.querySelector("canvas")?.requestPointerLock();
              setStarted(true);
            }}><b>01</b><span>PLAY</span><small>ENTER TRAINING YARD</small></button>
            <button onClick={() => setMenuPage("LOADOUT")}><b>02</b><span>LOADOUT</span><small>EDIT EQUIPMENT</small></button>
            <button disabled><b>03</b><span>OPERATORS</span><small>COMING SOON</small></button>
            <button disabled><b>04</b><span>SETTINGS</span><small>COMING SOON</small></button>
          </nav></>}
          {(!started && menuPage === "LOADOUT") && <div className="loadout-panel">
            <button className="back-button" onClick={() => setMenuPage("HOME")}>← MAIN MENU</button>
            <div className="loadout-heading"><div><span>COMBAT</span> LOADOUT</div><small>SELECT ONE ITEM PER SLOT</small></div>
            <div className="loadout-grid">
              <LoadoutSlot label="PRIMARY WEAPON" selected={primary} options={[
                ["VXR-4 CARBINE", "BALANCED · AUTO"], ["M12 SMG", "MOBILE · CLOSE RANGE"], ["BR-7 RIFLE", "PRECISION · SEMI"],
                ["SNR-90 SNIPER", "EXTREME RANGE · BOLT ACTION"], ["KSG-12 SHOTGUN", "8 PELLETS · CLOSE RANGE"], ["HMG-6 LMG", "60 ROUNDS · SUPPRESSION"],
                ["AKR-47 ASSAULT", "HEAVY DAMAGE · HARD RECOIL"], ["M8 BURST RIFLE", "CONTROLLED · THREE ROUND"], ["DMR-11 MARKSMAN", "SEMI AUTO · LONG RANGE"], ["VX-9 PDW", "EXTREME RATE · MOBILE"]
              ]} onSelect={setPrimary} />
              <LoadoutSlot label="SECONDARY" selected={secondary} options={[
                ["P9 SIDEARM", "RELIABLE · 15 ROUNDS"], ["R45 REVOLVER", "HEAVY · 6 ROUNDS"], ["G18 AUTO PISTOL", "24 ROUNDS · FULL AUTO"], ["DB-2 SAWED-OFF", "TWO SHELLS · 6 PELLETS"], ["COMBAT KNIFE", "FAST · SILENT"]
              ]} onSelect={setSecondary} />
              <LoadoutSlot label="MEDICAL" selected={medical} options={[
                ["FIELD MEDKIT", "RESTORE 60 HEALTH"], ["STIM INJECTOR", "FAST HEAL + SPEED"], ["TRAUMA KIT", "FULL HEAL · SLOW"]
              ]} onSelect={setMedical} />
              <LoadoutSlot label="UTILITY" selected={utility} options={[
                ["FRAG GRENADE", "LETHAL EXPLOSIVE"], ["SMOKE GRENADE", "VISION COVER"], ["FLASHBANG", "DISORIENT TARGETS"]
              ]} onSelect={setUtility} />
            </div>
            <button className="confirm-loadout" onClick={() => setMenuPage("HOME")}>CONFIRM LOADOUT</button>
          </div>}
          {started && <>
          <h1><span>STRIKE</span>YARD</h1>
          <p>SIMULATION PAUSED</p>
          <div className="menu-actions">
            <button className="start" onClick={() => {
              mountRef.current?.querySelector("canvas")?.requestPointerLock();
            }}>
              <span>RESUME OPERATION</span>
              <small>CLICK TO LOCK CURSOR</small>
            </button>
            <button className="leave" onClick={() => {
              setStarted(false);
              setAmmo(30);
              setFireMode("AUTO");
              setActiveSlot(1);
              setReloading(false);
              setUtilityCount(2);
              setMedicalCount(2);
              setFlashed(false);
              setHealingEffect(false);
              setHealing(false);
              setHealth(100);
              setDead(false);
              setSessionId((current) => current + 1);
            }}>
              <span>LEAVE SERVER</span>
              <small>RETURN TO MAIN MENU</small>
            </button>
          </div>
          </>}
          <div className="menu-controls">
            <div><kbd>WASD</kbd><span>MOVE</span></div>
            <div><kbd>SHIFT</kbd><span>SPRINT</span></div>
            <div><kbd>RMB</kbd><span>AIM</span></div>
            <div><kbd>LMB</kbd><span>FIRE</span></div>
            <div><kbd>B</kbd><span>FIRE MODE</span></div>
            <div><kbd>R</kbd><span>RELOAD</span></div>
          </div>
        </section>
        <footer className="menu-footer">BUILD 0.3 · LIVE FIRE ENABLED <span>{started ? "PRESS ESC TO PAUSE" : "LOCAL TRAINING CLIENT"}</span></footer>
      </div>}
    </main>
  );
}

function LoadoutSlot({ label, selected, options, onSelect }: {
  label: string;
  selected: string;
  options: [string, string][];
  onSelect: (value: string) => void;
}) {
  const stats = WEAPON_STATS[selected];
  return <section className="loadout-slot">
    <h2>{label}</h2>
    {options.map(([name, detail]) => <button key={name} className={selected === name ? "selected" : ""} onClick={() => onSelect(name)}>
      <i />
      <span><b>{name}</b><small>{detail}</small></span>
      <em>{selected === name ? "EQUIPPED" : "SELECT"}</em>
    </button>)}
    {stats && <div className="weapon-stats">
      {[['DAMAGE', stats.damage], ['FIRE RATE', stats.fireRate], ['RANGE', stats.range], ['MOBILITY', stats.mobility], ['ACCURACY', Math.max(8, Math.round(100 - stats.spread * 11))]].map(([name, value]) => <div key={name}>
        <span>{name}</span><i><b style={{ width: `${value}%` }} /></i><em>{value}</em>
      </div>)}
      <footer><span>MAGAZINE <b>{stats.capacity}</b></span><span>SPREAD <b>{stats.spread.toFixed(2)}°</b></span><span>RELOAD <b>{stats.reload.toFixed(2)}s</b></span></footer>
    </div>}
  </section>;
}
