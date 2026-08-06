"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Box = { minX: number; maxX: number; minZ: number; maxZ: number; height: number; active?: boolean };
type FireMode = "SEMI" | "BURST" | "AUTO";
type MenuPage = "HOME" | "LOADOUT" | "CHARACTER";
type GameMap = "TEST YARD" | "CITY BLOCK";
type KillFeedEntry = { id: number; victim: string; weapon: string; headshot: boolean };
type SightAttachment = "IRON SIGHTS" | "RED DOT" | "HOLOGRAPHIC" | "4X SCOPE";
type MuzzleAttachment = "STANDARD BARREL" | "SUPPRESSOR";
type TacticalAttachment = "NONE" | "RED LASER" | "WHITE LIGHT";
type MagazineAttachment = "STANDARD MAG" | "EXTENDED MAG" | "DRUM MAG";
type WeaponAttachments = { sight: SightAttachment; muzzle: MuzzleAttachment; tactical: TacticalAttachment; magazine: MagazineAttachment };

const attachmentMobilityPenalty = (attachments: WeaponAttachments) =>
  (attachments.muzzle === "SUPPRESSOR" ? 4 : 0) +
  (attachments.magazine === "EXTENDED MAG" ? 5 : attachments.magazine === "DRUM MAG" ? 14 : 0) +
  (attachments.tactical === "WHITE LIGHT" ? 3 : 0);

const attachmentItemPenalty = (attachment: string) =>
  attachment === "SUPPRESSOR" ? 4 : attachment === "EXTENDED MAG" ? 5 : attachment === "DRUM MAG" ? 14 : attachment === "WHITE LIGHT" ? 3 : 0;

const magazineCapacity = (capacity: number, magazine: MagazineAttachment) =>
  magazine === "DRUM MAG" ? capacity * 2 : magazine === "EXTENDED MAG" ? Math.ceil(capacity * 1.35) : capacity;

const WEAPON_STATS: Record<string, { damage: number; fireRate: number; capacity: number; reload: number; range: number; mobility: number; spread: number; pellets?: number }> = {
  "VXR-4 CARBINE": { damage: 16, fireRate: 72, capacity: 30, reload: 2.35, range: 74, mobility: 68, spread: 1.25 },
  "M12 SMG": { damage: 12, fireRate: 91, capacity: 36, reload: 1.85, range: 48, mobility: 90, spread: 2.1 },
  "BR-7 RIFLE": { damage: 29, fireRate: 43, capacity: 20, reload: 2.8, range: 94, mobility: 51, spread: 0.65 },
  "SNR-90 SNIPER": { damage: 50, fireRate: 10, capacity: 5, reload: 3.4, range: 100, mobility: 34, spread: 0.12 },
  "KSG-12 SHOTGUN": { damage: 9, fireRate: 22, capacity: 8, reload: 4.1, range: 30, mobility: 58, spread: 5.8, pellets: 8 },
  "HMG-6 LMG": { damage: 19, fireRate: 66, capacity: 60, reload: 5.2, range: 78, mobility: 27, spread: 1.75 },
  "AKR-47 ASSAULT": { damage: 22, fireRate: 61, capacity: 30, reload: 2.65, range: 76, mobility: 61, spread: 1.6 },
  "M8 BURST RIFLE": { damage: 17.5, fireRate: 78, capacity: 27, reload: 2.25, range: 72, mobility: 70, spread: 1.05 },
  "DMR-11 MARKSMAN": { damage: 33.5, fireRate: 34, capacity: 12, reload: 2.9, range: 96, mobility: 45, spread: 0.32 },
  "VX-9 PDW": { damage: 10.5, fireRate: 98, capacity: 42, reload: 2.05, range: 42, mobility: 93, spread: 2.35 },
  "P9 SIDEARM": { damage: 14, fireRate: 58, capacity: 15, reload: 1.45, range: 45, mobility: 94, spread: 1.55 },
  "R45 REVOLVER": { damage: 36, fireRate: 29, capacity: 6, reload: 3.1, range: 61, mobility: 76, spread: 0.9 },
  "G18 AUTO PISTOL": { damage: 9.5, fireRate: 95, capacity: 24, reload: 1.75, range: 35, mobility: 96, spread: 2.65 },
  "DB-2 SAWED-OFF": { damage: 11, fireRate: 18, capacity: 2, reload: 2.6, range: 20, mobility: 81, spread: 7.2, pellets: 6 },
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
  const [selectedMap, setSelectedMap] = useState<GameMap>("TEST YARD");
  const [doorPrompt, setDoorPrompt] = useState(false);
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
  const [thirdPerson, setThirdPerson] = useState(false);
  const [adsActive, setAdsActive] = useState(false);
  const [crouching, setCrouching] = useState(false);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [leanSide, setLeanSide] = useState<-1 | 0 | 1>(0);
  const [prone, setProne] = useState(false);
  const [characterSkin, setCharacterSkin] = useState("#a9795e");
  const [characterUniform, setCharacterUniform] = useState("#303a3b");
  const [characterArmor, setCharacterArmor] = useState("#20292b");
  const [characterHelmet, setCharacterHelmet] = useState<"TACTICAL" | "LIGHT" | "HEAVY">("TACTICAL");
  const [faceGear, setFaceGear] = useState<"NONE" | "GOGGLES" | "MASK">("GOGGLES");
  const [headAccessory, setHeadAccessory] = useState<"NONE" | "HEADSET" | "NVG">("HEADSET");
  const [chestRig, setChestRig] = useState<"LIGHT" | "PLATE CARRIER" | "HEAVY">("PLATE CARRIER");
  const [backpack, setBackpack] = useState<"NONE" | "ASSAULT PACK" | "RADIO PACK">("ASSAULT PACK");
  const [pantsColor, setPantsColor] = useState("#303a3b");
  const [gloveColor, setGloveColor] = useState("#20292b");
  const [bootColor, setBootColor] = useState("#151b1d");
  const [weaponSight, setWeaponSight] = useState<SightAttachment>("IRON SIGHTS");
  const [muzzleAttachment, setMuzzleAttachment] = useState<MuzzleAttachment>("STANDARD BARREL");
  const [tacticalAttachment, setTacticalAttachment] = useState<TacticalAttachment>("NONE");
  const [magazineAttachment, setMagazineAttachment] = useState<MagazineAttachment>("STANDARD MAG");
  const [secondarySight, setSecondarySight] = useState<SightAttachment>("IRON SIGHTS");
  const [secondaryMuzzle, setSecondaryMuzzle] = useState<MuzzleAttachment>("STANDARD BARREL");
  const [secondaryTactical, setSecondaryTactical] = useState<TacticalAttachment>("NONE");
  const [secondaryMagazine, setSecondaryMagazine] = useState<MagazineAttachment>("STANDARD MAG");

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

    const mapSize = selectedMap === "CITY BLOCK" ? 96 : 64;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(mapSize, mapSize), material(selectedMap === "CITY BLOCK" ? 0x252b2d : 0x364044));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(mapSize, selectedMap === "CITY BLOCK" ? 48 : 32, 0x516166, 0x465358);
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

    let medicalSupplyDrop = new THREE.Group(); medicalSupplyDrop.visible = false;
    let utilitySupplyDrop = new THREE.Group(); utilitySupplyDrop.visible = false;
    const doors: { pivot: THREE.Group; box: Box; target: number; open: boolean; swing: -1 | 1 }[] = [];

    if (selectedMap === "TEST YARD") {
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

    // Medical and utility resupply drops.
    const addSupplyDrop = (x: number, color: number, medicalDrop: boolean) => {
      const drop = new THREE.Group(); drop.position.set(x, .68, 23); drop.scale.setScalar(.48); drop.userData.floatPhase = medicalDrop ? 0 : Math.PI; scene.add(drop);
      const addDropPart = (geometry: THREE.BufferGeometry, partMaterial: THREE.Material, px: number, py: number, pz: number) => {
        const mesh = new THREE.Mesh(geometry, partMaterial); mesh.position.set(px, py, pz); mesh.castShadow = mesh.receiveShadow = true; mesh.raycast = () => {}; drop.add(mesh); return mesh;
      };
      addDropPart(new THREE.BoxGeometry(2.2, 1.1, 2.2), material(color), 0, .55, 0);
      addDropPart(new THREE.BoxGeometry(2.32, .16, 2.32), material(0x20292b), 0, 1.16, 0);
      const glow = new THREE.PointLight(color, 9, 6, 2); glow.position.set(0, 1.8, 0); drop.add(glow);
      if (medicalDrop) {
        addDropPart(new THREE.BoxGeometry(.72, .16, .035), material(0xe9f2ed), 0, .58, -1.12);
        addDropPart(new THREE.BoxGeometry(.16, .72, .035), material(0xe9f2ed), 0, .58, -1.14);
      } else {
        const utilityMark = new THREE.Mesh(new THREE.TorusGeometry(.34, .07, 8, 18), new THREE.MeshBasicMaterial({ color: 0xe9f2ed }));
        utilityMark.position.set(0, .58, -1.14); utilityMark.raycast = () => {}; drop.add(utilityMark);
      }
      return drop;
    };
    medicalSupplyDrop = addSupplyDrop(-25, 0x2c9b67, true);
    utilitySupplyDrop = addSupplyDrop(25, 0x397f9e, false);
    }

    // Human-shaped test dummies with separate head and body hit zones.
    const dummies: THREE.Group[] = [];
    const addDummy = (x: number, z: number, color: number, movement: "static" | "walk" | "sprint" = "static", targetable = true) => {
      const dummy = new THREE.Group(); dummy.position.set(x, 0, z);
      dummy.userData.health = 150; dummy.userData.maxHealth = 150;
      dummy.userData.movement = movement; dummy.userData.laneOrigin = z;
      dummy.userData.rig = [] as { kind: "arm" | "leg"; side: number; upper: THREE.Mesh; lower: THREE.Mesh; joint?: THREE.Mesh; end: THREE.Mesh }[];
      const dummyMat = material(targetable ? color : Number(`0x${characterSkin.slice(1)}`), 0.55, 0.15);
      const armorMat = material(targetable ? 0x20292b : Number(`0x${characterArmor.slice(1)}`), 0.7, 0.28);
      const fabricMat = material(targetable ? 0x303a3b : Number(`0x${characterUniform.slice(1)}`), 0.92, 0.02);
      const pantsMat = material(targetable ? 0x303a3b : Number(`0x${pantsColor.slice(1)}`), 0.92, 0.02);
      const gloveMat = material(targetable ? 0x20292b : Number(`0x${gloveColor.slice(1)}`), 0.72, 0.18);
      const bootMat = material(targetable ? 0x171d1f : Number(`0x${bootColor.slice(1)}`), 0.8, 0.12);
      const darkMat = material(0x111719, .62, .38);
      const visorMat = new THREE.MeshStandardMaterial({ color: 0x76b9c7, emissive: 0x173b43, emissiveIntensity: 0.8, metalness: 0.65, roughness: 0.18 });
      const addLimb = (geometry: THREE.BufferGeometry, px: number, py: number, pz: number, multiplier = 1, partMaterial: THREE.Material = dummyMat) => {
        const mesh = new THREE.Mesh(geometry, partMaterial); mesh.position.set(px, py, pz); mesh.castShadow = true;
        if (targetable) { mesh.userData.dummy = dummy; mesh.userData.damageMultiplier = multiplier; }
        else mesh.raycast = () => {};
        dummy.add(mesh); return mesh;
      };
      // Torso, plate carrier, pouches, belt and backpack.
      addLimb(new THREE.BoxGeometry(0.6, 0.78, 0.3), 0, 1.38, 0, 1, fabricMat);
      const chestWidth = !targetable && chestRig === "LIGHT" ? .56 : !targetable && chestRig === "HEAVY" ? .74 : .66;
      const chestDepth = !targetable && chestRig === "LIGHT" ? .11 : !targetable && chestRig === "HEAVY" ? .23 : .16;
      addLimb(new THREE.BoxGeometry(chestWidth, 0.56, chestDepth), 0, 1.48, -0.19, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.17, 0.14, 0.12), -0.2, 1.18, -0.25, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.17, 0.14, 0.12), 0, 1.18, -0.25, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.17, 0.14, 0.12), 0.2, 1.18, -0.25, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.56, 0.1, 0.34), 0, 0.98, 0, 1, armorMat);
      if (targetable || backpack !== "NONE") {
        const radioPack = !targetable && backpack === "RADIO PACK";
        addLimb(new THREE.BoxGeometry(radioPack ? .56 : .5, radioPack ? .68 : .58, radioPack ? .27 : .2), 0, 1.48, radioPack ? .28 : .24, 1, armorMat);
        if (radioPack) addLimb(new THREE.CylinderGeometry(.018, .018, .72, 7), .2, 1.98, .29, 1, armorMat).rotation.z = -.12;
      }
      // Connected head rig pivots from the neck for a natural weapon cheek weld.
      const headRig = new THREE.Group(); headRig.position.set(0, 1.78, 0); dummy.add(headRig); dummy.userData.headRig = headRig;
      const addHeadLimb = (geometry: THREE.BufferGeometry, px: number, py: number, pz: number, multiplier: number, partMaterial: THREE.Material) => {
        const mesh = new THREE.Mesh(geometry, partMaterial); mesh.position.set(px, py, pz); mesh.castShadow = true;
        if (targetable) { mesh.userData.dummy = dummy; mesh.userData.damageMultiplier = multiplier; } else mesh.raycast = () => {};
        headRig.add(mesh); return mesh;
      };
      addHeadLimb(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 10), 0, -.01, 0, 1.5, fabricMat);
      addHeadLimb(new THREE.SphereGeometry(0.235, 16, 11), 0, .25, 0, 2, dummyMat);
      const helmetScale = !targetable && characterHelmet === "LIGHT" ? 0.92 : !targetable && characterHelmet === "HEAVY" ? 1.1 : 1;
      const helmet = addHeadLimb(new THREE.SphereGeometry(0.265, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.54), 0, .34, .01, 2, armorMat);
      helmet.scale.set(helmetScale, !targetable && characterHelmet === "HEAVY" ? 1.08 : 1, helmetScale);
      if (targetable || faceGear === "GOGGLES") addHeadLimb(new THREE.BoxGeometry(0.34, 0.095, 0.04), 0, .26, -.222, 2, visorMat);
      if (!targetable && faceGear === "MASK") addHeadLimb(new THREE.BoxGeometry(.29, .2, .08), 0, .16, -.22, 2, fabricMat);
      if (targetable || headAccessory === "HEADSET") addHeadLimb(new THREE.BoxGeometry(0.055, 0.18, 0.08), -.255, .26, 0, 2, armorMat);
      if (!targetable && headAccessory === "NVG") {
        addHeadLimb(new THREE.BoxGeometry(.24, .07, .09), 0, .36, -.23, 2, armorMat);
        addHeadLimb(new THREE.CylinderGeometry(.045, .055, .16, 9), -.075, .31, -.31, 2, darkMat).rotation.x = Math.PI / 2;
        addHeadLimb(new THREE.CylinderGeometry(.045, .055, .16, 9), .075, .31, -.31, 2, darkMat).rotation.x = Math.PI / 2;
      }
      // Segmented arms, shoulder armor and gloves.
      [-1, 1].forEach((side) => {
        if (targetable || chestRig !== "LIGHT") addLimb(new THREE.SphereGeometry(0.17, 10, 8), side * 0.43, 1.65, 0, 1, armorMat);
        const upper = addLimb(new THREE.CylinderGeometry(0.105, 0.095, 0.44, 9), side * 0.45, 1.42, 0, 1, fabricMat); upper.rotation.z = side * -0.08;
        const forearm = addLimb(new THREE.CylinderGeometry(0.09, 0.075, 0.38, 9), side * 0.47, 1.04, -0.02, 1, fabricMat);
        const glove = addLimb(new THREE.BoxGeometry(0.17, 0.16, 0.18), side * 0.48, 0.8, -0.02, 1, gloveMat);
        dummy.userData.rig.push({ kind: "arm", side, upper, lower: forearm, end: glove });
      });
      // Thighs, knee pads, lower legs and boots.
      [-1, 1].forEach((side) => {
        const thigh = addLimb(new THREE.CylinderGeometry(0.13, 0.115, 0.46, 9), side * 0.19, 0.74, 0, 1, pantsMat);
        const knee = addLimb(new THREE.BoxGeometry(0.23, 0.18, 0.14), side * 0.19, 0.47, -0.1, 1, armorMat);
        const shin = addLimb(new THREE.CylinderGeometry(0.11, 0.09, 0.4, 9), side * 0.19, 0.25, 0, 1, pantsMat);
        const boot = addLimb(new THREE.BoxGeometry(0.24, 0.14, 0.38), side * 0.19, 0.08, -0.08, 1, bootMat);
        dummy.userData.rig.push({ kind: "leg", side, upper: thigh, lower: shin, joint: knee, end: boot });
      });
      if (targetable) {
        const healthBarRoot = new THREE.Group(); healthBarRoot.position.set(0, 2.48, 0); dummy.add(healthBarRoot);
        const barBack = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.09), new THREE.MeshBasicMaterial({ color: 0x151a1b, side: THREE.DoubleSide }));
        barBack.raycast = () => {}; healthBarRoot.add(barBack);
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.055), new THREE.MeshBasicMaterial({ color: 0x63e690, side: THREE.DoubleSide }));
        bar.position.z = .006; bar.raycast = () => {}; healthBarRoot.add(bar);
        dummy.userData.healthBarRoot = healthBarRoot; dummy.userData.healthBars = [bar];
      }
      scene.add(dummy); if (targetable) dummies.push(dummy); return dummy;
    };
    const namedDummy = (dummy: THREE.Group, callsign: string) => { dummy.userData.callsign = callsign; return dummy; };
    if (selectedMap === "TEST YARD") {
      namedDummy(addDummy(-7, -14, 0x4d7182), "TARGET ALPHA"); namedDummy(addDummy(0, -14, 0x706347), "TARGET BRAVO"); namedDummy(addDummy(7, -14, 0x754b4b), "TARGET CHARLIE");
      namedDummy(addDummy(15, -15, 0x38785d, "walk"), "WALKER ONE"); namedDummy(addDummy(26, -15, 0x804f32, "sprint"), "RUNNER ONE");
    }
    const spawnZ = selectedMap === "CITY BLOCK" ? 38 : 15;
    const localPlayer = addDummy(0, spawnZ, 0x435e70, "static", false);
    localPlayer.rotation.order = "YXZ";
    localPlayer.visible = false;

    if (selectedMap === "CITY BLOCK") {
      // Asphalt roads and raised sidewalks.
      addBox(0, .025, 0, 15, .05, 94, 0x171c1e, false);
      addBox(0, .03, 0, 94, .06, 15, 0x171c1e, false);
      [-9, 9].forEach((x) => addBox(x, .11, 0, 3, .22, 94, 0x596064, false));
      [-9, 9].forEach((z) => addBox(0, .11, z, 94, .22, 3, 0x596064, false));
      addBox(0, 3, -47.5, 96, 6, 1, 0x20282b); addBox(0, 3, 47.5, 96, 6, 1, 0x20282b);
      addBox(-47.5, 3, 0, 1, 6, 96, 0x20282b); addBox(47.5, 3, 0, 1, 6, 96, 0x20282b);

      const addDoor = (x: number, z: number, width: number, color: number, swing: -1 | 1) => {
        const pivot = new THREE.Group(); pivot.position.set(x - width / 2, 0, z); scene.add(pivot);
        const door = new THREE.Mesh(new THREE.BoxGeometry(width, 2.65, .16), material(color, .6, .3)); door.position.set(width / 2, 1.325, 0); door.castShadow = true; pivot.add(door);
        const handle = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 6), material(0xc4a465, .3, .7)); handle.position.set(width * .82, 1.3, -.12); pivot.add(handle);
        const box: Box = { minX: x - width / 2, maxX: x + width / 2, minZ: z - .18, maxZ: z + .18, height: 2.7, active: true };
        boxes.push(box); doors.push({ pivot, box, target: 0, open: false, swing });
      };
      const addBuilding = (cx: number, cz: number, w: number, d: number, h: number, color: number, frontSide: -1 | 1) => {
        const wall = .38, doorWidth = 1.35, doorHeight = 2.7;
        const frontZ = cz + frontSide * d / 2, rearZ = cz - frontSide * d / 2;
        addBox(cx - w / 2, h / 2, cz, wall, h, d, color); addBox(cx + w / 2, h / 2, cz, wall, h, d, color);
        [frontZ, rearZ].forEach((wallZ) => {
          const sideSegment = (w - doorWidth) / 2;
          addBox(cx - doorWidth / 2 - sideSegment / 2, h / 2, wallZ, sideSegment, h, wall, color);
          addBox(cx + doorWidth / 2 + sideSegment / 2, h / 2, wallZ, sideSegment, h, wall, color);
          addBox(cx, doorHeight + (h - doorHeight) / 2, wallZ, doorWidth, h - doorHeight, wall, color);
        });
        // Roof collision is visual-only; the simplified ground-up AABB system would otherwise fill the entire interior.
        addBox(cx, h - .12, cz, w, .24, d, 0x242b2d, false);
        addBox(cx, .08, cz, w - .5, .16, d - .5, 0x3b3d3b, false);
        addDoor(cx, frontZ + frontSide * .04, doorWidth, 0x49382e, frontSide === 1 ? -1 : 1);
        addDoor(cx, rearZ - frontSide * .04, doorWidth, 0x3c322c, frontSide === 1 ? 1 : -1);
        const windowMat = new THREE.MeshStandardMaterial({ color: 0x79a6b2, emissive: 0x142d35, emissiveIntensity: 1.1, metalness: .55, roughness: .18 });
        const floors = Math.max(3, Math.floor((h - 1.2) / 2.25));
        for (let row = 0; row < floors; row++) [-1, 1].forEach((side) => [frontZ, rearZ].forEach((wallZ) => {
          const pane = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.45, w * .22), .9, .04), windowMat);
          pane.position.set(cx + side * w * .27, 1.7 + row * 2.15, wallZ + Math.sign(wallZ - cz) * .21); pane.raycast = () => {}; scene.add(pane);
        }));
        // Floor bands and rooftop equipment make the taller skyline readable from street level.
        for (let level = 2.75; level < h - .8; level += 2.15) addBox(cx, level, frontZ + frontSide * .22, w * .94, .12, .12, 0x303638, false);
        addBox(cx + w * .2, h + .28, cz, Math.min(2.4, w * .3), .55, Math.min(2.2, d * .22), 0x353d3f, false);
        // Interior cover and room divisions keep buildings useful for combat.
        addBox(cx - w * .22, .55, cz - d * .12, 1.5, 1.1, .8, 0x4a4036);
        addBox(cx + w * .18, 1.25, cz - d * .18, .28, 2.5, d * .42, 0x5c6060);
      };
      // Paired buildings create dense blocks and narrow, playable side alleys.
      addBuilding(-24, -29, 14, 22, 12.4, 0x5e5550, 1);
      addBuilding(-38, -29, 10, 22, 16.2, 0x4c5254, 1);
      addBuilding(24, -29, 14, 22, 14.5, 0x4b585b, 1);
      addBuilding(38, -29, 10, 22, 10.8, 0x65584c, 1);
      addBuilding(-24, 29, 14, 22, 15.1, 0x665744, -1);
      addBuilding(-38, 29, 10, 22, 11.6, 0x50595b, -1);
      addBuilding(24, 29, 14, 22, 12.9, 0x4f5350, -1);
      addBuilding(38, 29, 10, 22, 16.8, 0x5d5048, -1);
      // Bombed-out corner lots fill the setbacks without closing their flanking routes.
      const addRuinedLot = (cx: number, cz: number, xSide: -1 | 1, zSide: -1 | 1, rubbleColor: number) => {
        const w = 5.2, d = 13.2, wallColor = xSide === zSide ? 0x665f58 : 0x555d5e;
        addBox(cx, .09, cz, w, .18, d, 0x3b3c39, false);
        // Jagged wall remnants leave a street-side breach into the ruined footprint.
        addBox(cx + xSide * (w / 2 - .18), 2.35, cz + zSide * 2.7, .36, 4.7, d * .55, wallColor);
        addBox(cx - xSide * 1.55, 1.75, cz - zSide * (d / 2 - .18), 2.1, 3.5, .36, wallColor);
        addBox(cx + xSide * .9, 1.1, cz - zSide * (d / 2 - .18), 1.15, 2.2, .36, wallColor);
        addBox(cx - xSide * (w / 2 - .18), .85, cz - zSide * 2.2, .36, 1.7, d * .28, wallColor);
        // A low collision core makes the large pile usable as cover; scattered chunks remain visual-only.
        addBox(cx + xSide * .25, .48, cz + zSide * 1.45, 3.3, .96, 3.5, rubbleColor);
        for (let piece = 0; piece < 13; piece++) {
          const px = cx + ((piece * 1.37) % 4.3) - 2.15;
          const pz = cz + zSide * 1.1 + ((piece * 1.91) % 5.3) - 2.65;
          const chunk = addBox(px, .55 + (piece % 4) * .16, pz, .55 + (piece % 3) * .3, .34 + (piece % 4) * .18, .5 + ((piece + 1) % 3) * .28, piece % 3 ? rubbleColor : 0x79726a, false);
          chunk.rotation.set((piece % 3 - 1) * .22, piece * .81, (piece % 2 ? 1 : -1) * .16);
        }
        // Exposed steel reinforces the silhouette of a partially collapsed structure.
        for (let rod = 0; rod < 3; rod++) {
          const rebar = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 2.4 + rod * .35, 6), material(0x392f2b, .7, .65));
          rebar.position.set(cx + xSide * (1.65 + rod * .18), 2.1 + rod * .18, cz - zSide * (3.8 + rod * .32));
          rebar.rotation.z = xSide * (.08 + rod * .04); rebar.raycast = () => {}; scene.add(rebar);
        }
      };
      addRuinedLot(-13.7, -29, -1, 1, 0x625a51);
      addRuinedLot(13.7, -29, 1, 1, 0x595c58);
      addRuinedLot(-13.7, 29, -1, -1, 0x6a5d4f);
      addRuinedLot(13.7, 29, 1, -1, 0x575c5d);
      // Abandoned vehicles, barriers, rubble, and street furniture.
      [[-3, -22, 0x70483c], [3, 20, 0x3f5962], [-21, 2, 0x56594d], [22, -2, 0x624b3f]].forEach(([x, z, color]) => {
        addBox(x, .65, z, 2.1, 1.05, 4.2, color); addBox(x, 1.3, z + .15, 1.75, .62, 2.15, 0x263438);
      });
      // Street fighting cover: barriers, sandbags, dumpsters, and offset roadblocks.
      const addRoadBarrier = (x: number, z: number, rotation = 0) => {
        const barrier = addBox(x, .48, z, 3.2, .82, .62, 0x777a76); barrier.rotation.y = rotation;
        const stripe = addBox(x, .62, z - .33, 2.35, .13, .035, 0xe78a35, false); stripe.rotation.y = rotation;
      };
      addRoadBarrier(-3.8, -10, .08); addRoadBarrier(4.1, 9, -.1); addRoadBarrier(-3.2, 31, .12); addRoadBarrier(3.5, -33, -.08);
      [[-12, -6], [13, 6], [-13, 18], [12, -19]].forEach(([x, z], groupIndex) => {
        for (let bag = 0; bag < 4; bag++) addBox(x + (bag - 1.5) * .65, .28, z, .72, .42, .48, groupIndex % 2 ? 0x716249 : 0x625946);
      });
      [[-8, -28], [8, 27], [-18, -9], [19, 10]].forEach(([x, z], index) => {
        addBox(x, .65, z, 1.7, 1.3, 1.05, index % 2 ? 0x315d60 : 0x3e5152);
        addBox(x, 1.34, z, 1.78, .12, 1.1, 0x1c2426, false);
      });
      // Offset concrete blocks break long sightlines without sealing the streets.
      addBox(-1.8, .85, -2, 1.15, 1.7, 1.15, 0x5c6262);
      addBox(2.1, .85, 2.5, 1.15, 1.7, 1.15, 0x5c6262);
      addBox(-5.7, .48, 15, 2.4, .96, .7, 0x686c69);
      addBox(5.8, .48, -15, 2.4, .96, .7, 0x686c69);
      for (let i = 0; i < 24; i++) {
        const side = i % 2 ? -1 : 1, x = side * (12 + (i % 5) * 2.2), z = -38 + ((i * 7) % 76);
        const rubble = addBox(x, .12 + (i % 3) * .06, z, .35 + (i % 4) * .2, .24, .28 + (i % 3) * .18, i % 2 ? 0x5c5650 : 0x77716a, false); rubble.rotation.y = i * .73; rubble.rotation.z = (i % 3 - 1) * .18;
      }
      [-36, -12, 12, 36].forEach((z) => [-7.2, 7.2].forEach((x) => {
        addBox(x, 2.4, z, .14, 4.8, .14, 0x252b2c, false);
        const lamp = new THREE.PointLight(0xffd49a, 10, 10, 2); lamp.position.set(x, 4.55, z); scene.add(lamp);
      }));
    }

    if (selectedMap === "TEST YARD") {
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
    }

    // Detailed procedural weapon view models. All sights share the same centerline for ADS.
    const gun = new THREE.Group();
    const weaponMaterial = (color: number, metalness = 0.72) => material(color, 0.34, metalness);
    const primaryAttachments: WeaponAttachments = { sight: weaponSight, muzzle: muzzleAttachment, tactical: tacticalAttachment, magazine: magazineAttachment };
    const secondaryAttachments: WeaponAttachments = { sight: secondarySight, muzzle: secondaryMuzzle, tactical: secondaryTactical, magazine: secondaryMagazine };
    const buildWeapon = (name: string, attachments: WeaponAttachments) => {
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
        if (isShotgun) addPart(0.16, 0.17, 0.34, x, -0.28, -1.48, 0x665044);
        if (isLmg) addPart(0.28, 0.05, 0.68, x, -0.13, -0.7, 0x525e50);
        if (isAkr) { magazine.rotation.x = -0.38; addPart(0.19, 0.12, 0.34, x, -0.23, -1.34, 0x76513a); }
        if (isBurst) addPart(0.2, 0.05, 0.45, x, -0.14, -0.75, 0x63717a);
      }

      // Selected optic, muzzle, and tactical attachments are shared by equipped firearms.
      if (name !== "COMBAT KNIFE") {
        if (attachments.sight === "IRON SIGHTS") {
          const rearSight = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 8, 18), weaponMaterial(0x101719));
          rearSight.position.set(x, -0.145, -0.46); model.add(rearSight);
          const frontLeft = addPart(0.012, 0.085, 0.025, x - 0.052, -0.18, muzzleZ + 0.16, 0x12191b);
          const frontRight = frontLeft.clone(); frontRight.position.x = x + 0.052; model.add(frontRight);
          addPart(0.012, 0.065, 0.02, x, -0.175, muzzleZ + 0.15, 0xff6b3c);
        } else if (attachments.sight === "RED DOT") {
          addPart(.18, .055, .24, x, -.135, -.65, 0x171e20);
          const lens = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .035, 16), new THREE.MeshStandardMaterial({ color: 0x7fb5b8, transparent: true, opacity: .38, metalness: .25, roughness: .12 }));
          lens.rotation.x = Math.PI / 2; lens.position.set(x, -.07, -.67); model.add(lens);
          const dot = new THREE.Mesh(new THREE.SphereGeometry(.009, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2018, depthTest: false })); dot.position.set(x, -.07, -.647); model.add(dot);
        } else if (attachments.sight === "HOLOGRAPHIC") {
          addPart(.24, .055, .27, x, -.135, -.68, 0x182124);
          addPart(.025, .22, .04, x - .11, -.04, -.68, 0x202a2d); addPart(.025, .22, .04, x + .11, -.04, -.68, 0x202a2d);
          const glass = addPart(.18, .15, .018, x, -.04, -.69, 0x618b91); (glass.material as THREE.MeshStandardMaterial).transparent = true; (glass.material as THREE.MeshStandardMaterial).opacity = .42;
          const holoRing = new THREE.Mesh(new THREE.TorusGeometry(.034, .004, 7, 20), new THREE.MeshBasicMaterial({ color: 0xff542d, depthTest: false })); holoRing.position.set(x, -.04, -.675); model.add(holoRing);
          const holoDot = new THREE.Mesh(new THREE.SphereGeometry(.007, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb047, depthTest: false })); holoDot.position.set(x, -.04, -.669); model.add(holoDot);
        } else {
          const scope = new THREE.Mesh(new THREE.CylinderGeometry(.09, .105, .58, 18, 1, true), weaponMaterial(0x111719));
          scope.rotation.x = Math.PI / 2; scope.position.set(x, -.08, -.74); model.add(scope);
          addPart(.16, .07, .08, x, -.14, -.55, 0x171e20); addPart(.16, .07, .08, x, -.14, -.94, 0x171e20);
          const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(.085, 24), new THREE.MeshBasicMaterial({ color: 0x42646a, transparent: true, opacity: .48 })); scopeLens.position.set(x, -.08, -.435); model.add(scopeLens);
          const scopeCross = new THREE.Group(); scopeCross.position.set(x, -.08, -.428);
          const crossMaterial = new THREE.MeshBasicMaterial({ color: 0xff7048, depthTest: false });
          const vertical = new THREE.Mesh(new THREE.BoxGeometry(.004, .12, .002), crossMaterial); const horizontal = new THREE.Mesh(new THREE.BoxGeometry(.12, .004, .002), crossMaterial); scopeCross.add(vertical, horizontal); model.add(scopeCross);
        }
        if (attachments.muzzle === "SUPPRESSOR") {
          const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, .48, 14), weaponMaterial(0x151b1d));
          suppressor.rotation.x = Math.PI / 2; suppressor.position.set(x, -.25, muzzleZ - .2); model.add(suppressor); muzzleZ -= .42;
        }
        if (attachments.tactical === "RED LASER") {
          addPart(.09, .09, .27, x + .13, -.34, -.9, 0x171d1f);
          const laserAnchor = new THREE.Object3D(); laserAnchor.name = "laserAnchor"; laserAnchor.position.set(x + .13, -.34, -1.05); model.add(laserAnchor);
          const lens = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2424 })); lens.position.copy(laserAnchor.position); model.add(lens);
        }
        if (attachments.tactical === "WHITE LIGHT") {
          addPart(.11, .11, .3, x + .14, -.34, -.9, 0x20282a);
          const flashlightAnchor = new THREE.Object3D(); flashlightAnchor.name = "flashlightAnchor"; flashlightAnchor.position.set(x + .14, -.34, -1.07); model.add(flashlightAnchor);
          const lens = new THREE.Mesh(new THREE.CircleGeometry(.04, 12), new THREE.MeshBasicMaterial({ color: 0xe8fbff })); lens.position.copy(flashlightAnchor.position); model.add(lens);
        }
        if (attachments.magazine === "EXTENDED MAG") addPart(.16, .54, .2, x, -.61, -.57, 0x111719);
        if (attachments.magazine === "DRUM MAG") {
          const drum = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .2, 16), weaponMaterial(0x111719));
          drum.rotation.z = Math.PI / 2; drum.position.set(x, -.55, -.59); model.add(drum);
        }
      }
      const muzzleAnchor = new THREE.Object3D(); muzzleAnchor.name = "muzzleAnchor"; muzzleAnchor.position.set(x, -0.25, muzzleZ); model.add(muzzleAnchor);
      // First-person geometry is visual only and must never intercept a weapon ray.
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) object.raycast = () => {};
      });
      return { model, muzzleAnchor };
    };
    const primaryWeapon = buildWeapon(primary, primaryAttachments);
    const secondaryWeapon = buildWeapon(secondary, secondaryAttachments);
    const buildEquipment = (name: string) => {
      const model = new THREE.Group();
      const visualOnly = (mesh: THREE.Mesh) => { mesh.castShadow = true; mesh.raycast = () => {}; model.add(mesh); return mesh; };
      const equipmentMat = (color: number, metalness = .12) => material(color, .66, metalness);
      const x = .3, y = -.35, z = -.58;
      if (name === "FIELD MEDKIT" || name === "TRAUMA KIT") {
        const trauma = name === "TRAUMA KIT";
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(trauma ? .52 : .4, trauma ? .42 : .32, .24), equipmentMat(trauma ? 0x5a4435 : 0x334c3e))).position.set(x, y, z);
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.16, .055, .012), equipmentMat(0xe5e8df))).position.set(x, y, z - .126);
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.055, .16, .012), equipmentMat(0xe5e8df))).position.set(x, y, z - .127);
        const handle = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(.12, .025, 8, 16, Math.PI), equipmentMat(0x171d1e))); handle.position.set(x, y + (trauma ? .27 : .22), z); handle.rotation.z = Math.PI;
      } else if (name === "STIM INJECTOR") {
        const syringe = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .48, 12), equipmentMat(0x9fe7dc, .3))); syringe.rotation.x = Math.PI / 2; syringe.position.set(x, y, z);
        const plunger = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .04, 12), equipmentMat(0x252f31))); plunger.rotation.x = Math.PI / 2; plunger.position.set(x, y, z + .26);
        const needle = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .2, 8), equipmentMat(0xc8d1d0, .8))); needle.rotation.x = Math.PI / 2; needle.position.set(x, y, z - .33);
      } else {
        const flash = name === "FLASHBANG", smoke = name === "SMOKE GRENADE";
        const body = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(flash ? .085 : .11, flash ? .085 : .1, flash ? .38 : .31, 12), equipmentMat(flash ? 0xb8c1c0 : smoke ? 0x7d8787 : 0x495b43, .35)));
        body.position.set(x, y, z); body.rotation.z = flash ? .08 : 0;
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.16, .07, .11), equipmentMat(0x202729, .5))).position.set(x, y + .19, z);
        const pin = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(.065, .012, 7, 14), equipmentMat(0x9da5a4, .75))); pin.position.set(x + .11, y + .2, z); pin.rotation.x = Math.PI / 2;
      }
      return model;
    };
    const medicalModel = buildEquipment(medical);
    const utilityModel = buildEquipment(utility);
    gun.add(primaryWeapon.model, secondaryWeapon.model, medicalModel, utilityModel);
    const worldPrimary = primaryWeapon.model.clone(true);
    const worldSecondary = secondaryWeapon.model.clone(true);
    const worldMedical = medicalModel.clone(true);
    const worldUtility = utilityModel.clone(true);
    [worldPrimary, worldSecondary].forEach((weapon) => {
      weapon.scale.setScalar(0.72);
      weapon.position.set(-0.055, 1.58, 0.03);
      weapon.rotation.x = -0.04;
      weapon.traverse((object) => { if (object instanceof THREE.Mesh) object.raycast = () => {}; });
      localPlayer.add(weapon);
    });
    [worldMedical, worldUtility].forEach((item) => {
      item.scale.setScalar(.78); item.position.set(-.045, 1.56, .03);
      item.traverse((object) => { if (object instanceof THREE.Mesh) object.raycast = () => {}; }); localPlayer.add(item);
    });
    const muzzle = new THREE.PointLight(0xff7b35, 0, 2.5, 2);
    muzzle.position.set(0.34, -0.2, -1.1);
    gun.add(muzzle);
    camera.add(gun);
    scene.add(camera);

    const trajectoryMaterial = new THREE.MeshBasicMaterial({ color: 0x91eaff, transparent: true, opacity: .58, depthWrite: false });
    const trajectory = new THREE.Mesh(new THREE.BufferGeometry(), trajectoryMaterial);
    trajectory.raycast = () => {};
    trajectory.visible = false;
    scene.add(trajectory);

    const keys = new Set<string>();
    let yaw = 0, pitch = 0, cameraYaw = 0, cameraPitch = 0.2, verticalVelocity = 0, grounded = true;
    const primaryStats = { ...WEAPON_STATS[primary], capacity: magazineCapacity(WEAPON_STATS[primary].capacity, magazineAttachment) };
    const secondaryIsMelee = secondary === "COMBAT KNIFE";
    const baseSecondaryStats = WEAPON_STATS[secondary] ?? { damage: 50, fireRate: 100, capacity: 1, reload: 0.6, range: 5, mobility: 100, spread: 0 };
    const secondaryStats = { ...baseSecondaryStats, capacity: magazineCapacity(baseSecondaryStats.capacity, secondaryMagazine) };
    const ammoCounts = [primaryStats.capacity, secondaryStats.capacity];
    setAmmo(primaryStats.capacity);
    let ammoCount = ammoCounts[0], recoil = 0, muzzleTimer = 0, aiming = false, sprinting = false, sliding = false, reloadEnd = 0, meleeSwing = 0, lastMelee = 0;
    let throwableAiming = false, grenadesLeft = 2, medicalCharges = 2;
    const projectiles: { mesh: THREE.Object3D; velocity: THREE.Vector3; age: number; type: string }[] = [];
    let currentFireMode: FireMode = "AUTO", triggerHeld = false, lastShot = 0, currentSlot = 1, movementSpread = 1;
    let nearbyDoor: typeof doors[number] | undefined;
    const activeAttachments = (): WeaponAttachments => currentSlot > 2 || (currentSlot === 2 && secondaryIsMelee)
      ? { sight: "IRON SIGHTS", muzzle: "STANDARD BARREL", tactical: "NONE", magazine: "STANDARD MAG" }
      : currentSlot === 1 ? primaryAttachments : secondaryAttachments;
    let playerHealth = 100, nextPadTick = 0, healEnd = 0;
    const playerPosition = new THREE.Vector3(0, PLAYER_HEIGHT, spawnZ);
    let isThirdPerson = false, orbiting = false, isCrouching = false, isProne = false, slideEnd = 0, stanceOffset = 0, crouchPoseAmount = 0, proneAmount = 0, leanDirection: -1 | 0 | 1 = 0, leanAmount = 0;
    const slideVelocity = new THREE.Vector2();
    respawnRef.current = () => {
      playerPosition.set(0, PLAYER_HEIGHT, spawnZ); camera.position.copy(playerPosition);
      yaw = 0; pitch = 0; verticalVelocity = 0; playerHealth = 100;
      isCrouching = false; isProne = false; sliding = false; slideEnd = 0; stanceOffset = 0; crouchPoseAmount = 0; proneAmount = 0; leanDirection = 0; leanAmount = 0; setCrouching(false); setProne(false); setLeanSide(0);
      keys.clear();
    };
    let last = performance.now();
    const clock = new THREE.Clock();

    const collides = (x: number, z: number) => boxes.some((b) => b.active !== false &&
      x + PLAYER_RADIUS > b.minX && x - PLAYER_RADIUS < b.maxX &&
      z + PLAYER_RADIUS > b.minZ && z - PLAYER_RADIUS < b.maxZ && b.height > 0.25
    );

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === "Tab" && !e.repeat) {
        e.preventDefault(); isThirdPerson = !isThirdPerson; setThirdPerson(isThirdPerson);
        aiming = false; setAdsActive(false);
        if (isThirdPerson) { cameraYaw = yaw; cameraPitch = isProne ? 0 : 0.2; }
        else { yaw = cameraYaw; pitch = 0; }
        localPlayer.visible = isThirdPerson;
      }
      if (e.code === "Space" && grounded) { isProne = false; isCrouching = false; setProne(false); setCrouching(false); verticalVelocity = 5.7; grounded = false; }
      if (e.code === "KeyC" && !e.repeat && grounded) {
        if (isProne) {
          isProne = false; isCrouching = true; setProne(false);
        } else if (sprinting) {
          isCrouching = true; sliding = true; slideEnd = performance.now() + 850;
          const movementYaw = isThirdPerson ? cameraYaw : yaw;
          const slideSpeed = 10.5 * (1 - attachmentMobilityPenalty(activeAttachments()) / 100);
          slideVelocity.set(-Math.sin(movementYaw) * slideSpeed, -Math.cos(movementYaw) * slideSpeed);
        } else {
          sliding = false; slideEnd = 0; isCrouching = !isCrouching;
        }
        aiming = false; setAdsActive(false); setCrouching(isCrouching);
      }
      if (e.code === "KeyX" && !e.repeat && grounded) {
        isProne = !isProne; isCrouching = false; sliding = false; slideEnd = 0;
        if (isProne && isThirdPerson) cameraPitch = 0;
        aiming = false; setAdsActive(false); setProne(isProne); setCrouching(false);
      }
      if ((e.code === "KeyQ" || e.code === "KeyE") && !e.repeat) {
        const requested = e.code === "KeyQ" ? -1 : 1;
        leanDirection = leanDirection === requested ? 0 : requested;
        setLeanSide(leanDirection);
      }
      if (e.code === "KeyF" && !e.repeat && nearbyDoor) {
        nearbyDoor.open = !nearbyDoor.open; nearbyDoor.target = nearbyDoor.open ? nearbyDoor.swing * Math.PI / 2 : 0;
        if (nearbyDoor.open) nearbyDoor.box.active = false;
      }
      if (e.code === "KeyR" && currentSlot <= 2 && !reloadEnd) {
        const stats = currentSlot === 1 ? primaryStats : secondaryStats;
        if (ammoCounts[currentSlot - 1] < stats.capacity) {
          reloadEnd = performance.now() + stats.reload * 1000;
          triggerHeld = false;
          aiming = false; setAdsActive(false);
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
        aiming = false; setAdsActive(false);
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
      if (isThirdPerson) {
        if (!orbiting) return;
        cameraYaw -= e.movementX * 0.0022;
        cameraPitch = Math.max(-0.28, Math.min(0.72, cameraPitch + e.movementY * 0.0022));
        return;
      }
      yaw -= e.movementX * 0.0022;
      pitch = Math.max(-1.48, Math.min(1.48, pitch - e.movementY * 0.0022));
    };
    const raycaster = new THREE.Raycaster();
    const getAimNdc = () => new THREE.Vector2(isThirdPerson ? 0.08 : 0, 0);
    const laserGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const laserLine = new THREE.Line(laserGeometry, new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: .72, depthWrite: false }));
    const laserDot = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3030, depthTest: false }));
    laserLine.raycast = () => {}; laserDot.raycast = () => {}; laserLine.visible = laserDot.visible = false; scene.add(laserLine, laserDot);
    const flashlight = new THREE.SpotLight(0xe5f7ff, 0, 28, Math.PI / 7, .45, 1.35);
    flashlight.castShadow = true; flashlight.shadow.mapSize.set(512, 512); flashlight.target.raycast = () => {}; scene.add(flashlight, flashlight.target);
    const impactGeometry = new THREE.SphereGeometry(0.045, 6, 6);
    const impactMaterial = new THREE.MeshBasicMaterial({ color: 0xff9a55 });
    const addKill = (dummy: THREE.Group, weapon: string, headshot: boolean) => {
      const entry = { id: Date.now() + Math.random(), victim: dummy.userData.callsign ?? "TRAINING TARGET", weapon, headshot };
      setKillFeed((current) => [...current.slice(-3), entry]);
      window.setTimeout(() => setKillFeed((current) => current.filter((item) => item.id !== entry.id)), 5000);
    };
    const damageDummyGroup = (dummy: THREE.Group | undefined, damage: number, weapon = "FRAG GRENADE", headshot = false) => {
      if (!dummy || !dummy.visible) return;
      dummy.userData.health = Math.max(0, dummy.userData.health - damage);
      const ratio = dummy.userData.health / dummy.userData.maxHealth;
      (dummy.userData.healthBars as THREE.Mesh[]).forEach((bar) => {
        bar.scale.x = Math.max(0.001, ratio);
        (bar.material as THREE.MeshBasicMaterial).color.set(ratio > .5 ? 0x63e690 : ratio > .2 ? 0xffb347 : 0xff4057);
      });
      if (dummy.userData.health <= 0) {
        addKill(dummy, weapon, headshot);
        dummy.visible = false;
        window.setTimeout(() => {
          dummy.userData.health = dummy.userData.maxHealth;
          (dummy.userData.healthBars as THREE.Mesh[]).forEach((bar) => { bar.scale.x = 1; (bar.material as THREE.MeshBasicMaterial).color.set(0x63e690); });
          dummy.visible = true;
        }, 3000);
      }
    };
    const damageDummy = (hit: THREE.Intersection, damage: number) => {
      const multiplier = hit.object.userData.damageMultiplier ?? 1;
      const weapon = currentSlot === 1 ? primary : secondary;
      damageDummyGroup(hit.object.userData.dummy as THREE.Group | undefined, damage * multiplier, weapon, multiplier >= 2);
    };
    const getThrow = () => {
      const direction = new THREE.Vector3(); camera.getWorldDirection(direction);
      const start = (isThirdPerson ? playerPosition : camera.position).clone().addScaledVector(direction, 0.65).add(new THREE.Vector3(0, -0.18, 0));
      const velocity = direction.multiplyScalar(13).add(new THREE.Vector3(0, 3.8, 0));
      return { start, velocity };
    };
    const throwUtility = () => {
      if (grenadesLeft <= 0) return;
      const { start, velocity } = getThrow();
      const flash = utility === "FLASHBANG", smoke = utility === "SMOKE GRENADE";
      const grenade = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(flash ? .085 : .11, flash ? .085 : .1, flash ? .38 : .31, 12), weaponMaterial(flash ? 0xb8c1c0 : smoke ? 0x7d8787 : 0x495b43, .35));
      body.castShadow = true; grenade.add(body);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(.16, .07, .11), weaponMaterial(0x202729, .5)); cap.position.y = .19; cap.castShadow = true; grenade.add(cap);
      const pin = new THREE.Mesh(new THREE.TorusGeometry(.065, .012, 7, 14), weaponMaterial(0x9da5a4, .75)); pin.position.set(.11, .2, 0); pin.rotation.x = Math.PI / 2; pin.castShadow = true; grenade.add(pin);
      grenade.traverse((object) => { if (object instanceof THREE.Mesh) object.raycast = () => {}; }); grenade.position.copy(start); scene.add(grenade);
      projectiles.push({ mesh: grenade, velocity, age: 0, type: utility });
      grenadesLeft -= 1; setUtilityCount(grenadesLeft);
    };
    const detonate = (projectile: { mesh: THREE.Object3D; type: string }) => {
      const position = projectile.mesh.position.clone();
      scene.remove(projectile.mesh);
      if (projectile.type === "SMOKE GRENADE") {
        const cloud = new THREE.Group(); cloud.position.copy(position); scene.add(cloud);
        for (let i = 0; i < 36; i++) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.9 + Math.random() * 0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7f898b, transparent: true, opacity: 0.38, depthWrite: false }));
          puff.raycast = () => {}; puff.position.set((Math.random() - .5) * 4.6, Math.random() * 2.8, (Math.random() - .5) * 4.6); cloud.add(puff);
        }
        window.setTimeout(() => scene.remove(cloud), 9000);
      } else {
        const blastColor = projectile.type === "FLASHBANG" ? 0xeaffff : 0xff6a32;
        const blast = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: blastColor, transparent: true, opacity: 0.85, wireframe: true }));
        blast.position.copy(position); scene.add(blast);
        let scale = 1;
        const expand = window.setInterval(() => { scale += 0.8; blast.scale.setScalar(scale); }, 20);
        window.setTimeout(() => { window.clearInterval(expand); scene.remove(blast); }, 260);
        if (projectile.type === "FLASHBANG" && playerPosition.distanceTo(position) < 13) {
          setFlashed(true); window.setTimeout(() => setFlashed(false), 1700);
        }
        if (projectile.type === "FRAG GRENADE") {
          const blastRadius = 7;
          dummies.forEach((dummy) => {
            const distance = dummy.position.distanceTo(position);
            if (distance < blastRadius) damageDummyGroup(dummy, Math.round(110 * (1 - distance / blastRadius)), "FRAG GRENADE");
          });
          const playerDistance = playerPosition.distanceTo(position);
          if (playerDistance < blastRadius) {
            playerHealth = Math.max(0, playerHealth - Math.round(110 * (1 - playerDistance / blastRadius)));
            setHealth(playerHealth);
            if (playerHealth <= 0) { setDead(true); document.exitPointerLock(); }
          }
        }
      }
    };
    const fireRound = () => {
      if (document.pointerLockElement !== renderer.domElement || sprinting || sliding || currentSlot > 2 || reloadEnd > 0) return;
      if (currentSlot === 2 && secondaryIsMelee) {
        const now = performance.now();
        if (now - lastMelee < 480) return;
        lastMelee = now;
        meleeSwing = 1;
        raycaster.setFromCamera(getAimNdc(), camera);
        const meleeHit = raycaster.intersectObjects(scene.children, true).find((result) => result.object !== camera && result.distance > 0.5 && result.distance <= 2.35);
        if (meleeHit) {
          damageDummy(meleeHit, 50);
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
      muzzle.intensity = activeAttachments().muzzle === "SUPPRESSOR" ? 5 : 35;
      muzzleTimer = 0.045;
      const shotStats = currentSlot === 1 ? primaryStats : secondaryStats;
      const tracerStart = new THREE.Vector3();
      const worldMuzzle = (currentSlot === 1 ? worldPrimary : worldSecondary).getObjectByName("muzzleAnchor");
      (isThirdPerson && worldMuzzle ? worldMuzzle : currentSlot === 1 ? primaryWeapon.muzzleAnchor : secondaryWeapon.muzzleAnchor).getWorldPosition(tracerStart);
      const pelletCount = shotStats.pellets ?? 1;
      const spreadDegrees = shotStats.spread * (aiming ? 0.42 : 1) * movementSpread;
      for (let pellet = 0; pellet < pelletCount; pellet++) {
        const spreadNdc = spreadDegrees / camera.fov;
        const aimNdc = getAimNdc();
        const offset = new THREE.Vector2(aimNdc.x + (Math.random() - 0.5) * spreadNdc * 2, (Math.random() - 0.5) * spreadNdc * 2);
        raycaster.setFromCamera(offset, camera);
        const aimDirection = raycaster.ray.direction.clone();
        const cameraToPlayer = isThirdPerson ? camera.position.distanceTo(new THREE.Vector3(playerPosition.x, playerPosition.y + .35 + stanceOffset, playerPosition.z)) : 0;
        const ballisticOrigin = isThirdPerson ? raycaster.ray.at(cameraToPlayer + .2, new THREE.Vector3()) : camera.position.clone();
        raycaster.set(ballisticOrigin, aimDirection);
        const hit = raycaster.intersectObjects(scene.children, true).find((result) => result.object !== camera && result.distance > .1 && result.distance <= shotStats.range);
        const tracerEnd = hit?.point.clone() ?? raycaster.ray.at(shotStats.range, new THREE.Vector3());
        const tracerMaterial = new THREE.LineBasicMaterial({ color: pelletCount > 1 ? 0xffd09a : 0xffb06b, transparent: true, opacity: 0.82 });
        const visualTracerStart = isThirdPerson ? ballisticOrigin : tracerStart;
        const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([visualTracerStart, tracerEnd]), tracerMaterial);
        tracer.raycast = () => {};
        scene.add(tracer);
        window.setTimeout(() => {
          scene.remove(tracer); tracer.geometry.dispose(); tracerMaterial.dispose();
        }, pelletCount > 1 ? 48 : 65);
        if (hit) {
          damageDummy(hit, shotStats.damage);
          const impact = new THREE.Mesh(impactGeometry, impactMaterial);
          impact.raycast = () => {};
          impact.position.copy(hit.point).addScaledVector(hit.face?.normal ?? new THREE.Vector3(0, 1, 0), 0.025);
          scene.add(impact); window.setTimeout(() => scene.remove(impact), 1800);
        }
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      if (e.button === 2) { if (isThirdPerson) orbiting = true; else { aiming = true; setAdsActive(true); } return; }
      if (e.button !== 0 || sprinting || sliding) return;
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
        if (!sprinting && !sliding) fireRound();
      }, delay));
      if (currentFireMode === "AUTO") { fireRound(); lastShot = performance.now(); }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        triggerHeld = false;
        if (throwableAiming) { throwableAiming = false; trajectory.visible = false; throwUtility(); }
      }
      if (e.button === 2) { aiming = false; orbiting = false; setAdsActive(false); }
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (!isLocked) { aiming = false; setAdsActive(false); orbiting = false; triggerHeld = false; throwableAiming = false; trajectory.visible = false; keys.clear(); }
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
      if (sliding && now >= slideEnd) { sliding = false; slideEnd = 0; }
      sprinting = !isCrouching && !isProne && !sliding && (keys.has("ShiftLeft") || keys.has("ShiftRight")) && input.y > 0 && input.lengthSq() > 0;
      if (sprinting || sliding) { aiming = false; setAdsActive(false); }
      const baseSpeed = isProne ? 1.55 : isCrouching ? 2.8 : sprinting ? 8.2 : aiming ? 3.8 : 5.2;
      const speed = baseSpeed * (1 - attachmentMobilityPenalty(activeAttachments()) / 100);
      const movementYaw = isThirdPerson ? cameraYaw : yaw;
      const sin = Math.sin(movementYaw), cos = Math.cos(movementYaw);
      const leanRightX = Math.cos(yaw), leanRightZ = -Math.sin(yaw);
      const leanClear = leanDirection === 0 || !collides(playerPosition.x + leanRightX * leanDirection * .48, playerPosition.z + leanRightZ * leanDirection * .48);
      const targetLean = leanClear && !sprinting && !sliding ? leanDirection : 0;
      leanAmount = THREE.MathUtils.lerp(leanAmount, targetLean, Math.min(1, dt * 9));
      let dx = (input.x * cos - input.y * sin) * speed * dt;
      let dz = (-input.x * sin - input.y * cos) * speed * dt;
      if (sliding) {
        dx = slideVelocity.x * dt; dz = slideVelocity.y * dt;
        slideVelocity.multiplyScalar(Math.max(0, 1 - dt * 2.15));
      }
      if (!collides(playerPosition.x + dx, playerPosition.z)) playerPosition.x += dx;
      if (!collides(playerPosition.x, playerPosition.z + dz)) playerPosition.z += dz;
      if (isThirdPerson && input.lengthSq() > 0) yaw = Math.atan2(-dx, -dz);

      if (selectedMap === "TEST YARD" && now >= nextPadTick) {
        nextPadTick = now + 250;
        const onPad = (x: number) => Math.abs(playerPosition.x - x) < 2 && Math.abs(playerPosition.z - 23) < 2;
        if (onPad(-8)) playerHealth = Math.max(0, playerHealth - 8);
        if (onPad(0)) playerHealth = 0;
        if (onPad(8)) playerHealth = Math.min(100, playerHealth + 12);
        const touchingSupply = (x: number) => Math.abs(playerPosition.x - x) < 1.65 && Math.abs(playerPosition.z - 23) < 1.65;
        if (medicalSupplyDrop.visible && touchingSupply(-25)) { medicalCharges += 2; setMedicalCount(medicalCharges); medicalSupplyDrop.visible = false; }
        if (utilitySupplyDrop.visible && touchingSupply(25)) { grenadesLeft += 2; setUtilityCount(grenadesLeft); utilitySupplyDrop.visible = false; }
        setHealth(playerHealth);
        if (playerHealth <= 0) {
          setDead(true); triggerHeld = false; healEnd = 0; setHealing(false); keys.clear();
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }

      verticalVelocity -= 14.5 * dt;
      playerPosition.y += verticalVelocity * dt;
      if (playerPosition.y <= PLAYER_HEIGHT) { playerPosition.y = PLAYER_HEIGHT; verticalVelocity = 0; grounded = true; }

      const moving = input.lengthSq() > 0 && grounded;
      movementSpread = input.lengthSq() > 0 ? 1.55 : 1;
      const t = clock.getElapsedTime();
      [medicalSupplyDrop, utilitySupplyDrop].forEach((drop) => {
        if (!drop.visible) return;
        drop.position.y = .68 + Math.sin(t * 2.2 + drop.userData.floatPhase) * .16;
        drop.rotation.y += dt * 1.55;
        drop.rotation.z = Math.sin(t * 1.1 + drop.userData.floatPhase) * .045;
      });
      doors.forEach((door) => {
        door.pivot.rotation.y = THREE.MathUtils.lerp(door.pivot.rotation.y, door.target, Math.min(1, dt * 8));
        if (!door.open && Math.abs(door.pivot.rotation.y) < .04) door.box.active = true;
      });
      nearbyDoor = doors.find((door) => Math.hypot(playerPosition.x - door.pivot.position.x, playerPosition.z - door.pivot.position.z) < 2.35);
      setDoorPrompt(Boolean(nearbyDoor));
      localPlayer.userData.movement = isProne ? "static" : sprinting || sliding ? "sprint" : moving ? "walk" : "static";
      [...dummies, localPlayer].forEach((dummy) => {
        const movement = dummy.userData.movement as "static" | "walk" | "sprint";
        const isLocal = dummy === localPlayer;
        const healthBarRoot = dummy.userData.healthBarRoot as THREE.Group | undefined;
        if (healthBarRoot) healthBarRoot.lookAt(camera.position);
        if (!dummy.visible || (movement === "static" && !isLocal)) return;
        const speed = movement === "sprint" ? 4.2 : 1.75;
        const travel = (t * speed) % 24;
        if (isLocal) {
          const crouchDrop = crouchPoseAmount * .38;
          dummy.position.set(playerPosition.x, playerPosition.y - PLAYER_HEIGHT - crouchDrop + proneAmount * .16, playerPosition.z);
          dummy.rotation.y = yaw;
          dummy.rotation.x = THREE.MathUtils.lerp(dummy.rotation.x, -proneAmount * 1.48, Math.min(1, dt * 10));
          dummy.rotation.z = THREE.MathUtils.lerp(dummy.rotation.z, -leanAmount * .14, Math.min(1, dt * 10));
        } else {
          dummy.position.z = dummy.userData.laneOrigin + (travel <= 12 ? -6 + travel : 18 - travel);
          dummy.rotation.y = travel <= 12 ? Math.PI : 0;
        }
        const stride = movement === "static" ? 0 : Math.sin(t * (movement === "sprint" ? 12 : 6.5));
        const amplitude = movement === "static" ? 0 : movement === "sprint" ? 0.92 : 0.5;
        if (!isLocal) dummy.position.y = Math.abs(Math.sin(t * (movement === "sprint" ? 12 : 6.5))) * (movement === "sprint" ? .075 : .035);
        const headRig = dummy.userData.headRig as THREE.Group;
        const holdingWeaponPose = isLocal && currentSlot <= 2 && aiming;
        const holdingLongWeaponPose = holdingWeaponPose && (currentSlot === 1 || secondary === "DB-2 SAWED-OFF");
        const aimingHeadPitch = holdingWeaponPose ? holdingLongWeaponPose ? -.13 : -.07 : 0;
        const proneHeadPitch = isLocal ? proneAmount * 1.2 : 0;
        headRig.rotation.x = THREE.MathUtils.lerp(headRig.rotation.x, proneHeadPitch + aimingHeadPitch, Math.min(1, dt * 10));
        headRig.rotation.z = THREE.MathUtils.lerp(headRig.rotation.z, holdingWeaponPose ? holdingLongWeaponPose ? -.15 : -.09 : 0, Math.min(1, dt * 10));
        headRig.position.x = THREE.MathUtils.lerp(headRig.position.x, holdingWeaponPose ? holdingLongWeaponPose ? .065 : .035 : 0, Math.min(1, dt * 10));
        const rig = dummy.userData.rig as { kind: "arm" | "leg"; side: number; upper: THREE.Mesh; lower: THREE.Mesh; joint?: THREE.Mesh; end: THREE.Mesh }[];
        rig.forEach((limb) => {
          if (limb.kind === "arm") {
            const holdingWeapon = isLocal && currentSlot <= 2;
            const holdingMedical = isLocal && currentSlot === 3 && medicalCharges > 0;
            const holdingUtility = isLocal && currentSlot === 4 && grenadesLeft > 0 && limb.side === 1;
            const holdingItem = holdingWeapon || holdingMedical || holdingUtility;
            const holdingLongGun = holdingWeapon && (currentSlot === 1 || secondary === "DB-2 SAWED-OFF");
            const isRightArm = limb.side === 1;
            const alignLimb = (mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) => {
              mesh.position.copy(start).add(end).multiplyScalar(.5);
              mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
            };
            if (holdingItem) {
              const shoulder = new THREE.Vector3(limb.side * .43, 1.65, 0);
              const sprintCarry = sprinting || sliding;
              const elbow = holdingMedical
                ? isRightArm ? new THREE.Vector3(.4, 1.38, -.16) : new THREE.Vector3(-.38, 1.38, -.16)
                : holdingUtility ? new THREE.Vector3(.46, 1.4, -.12)
                : sprintCarry
                ? isRightArm ? new THREE.Vector3(.46, 1.27, -.12) : new THREE.Vector3(-.2, 1.3, -.2)
                : isRightArm ? new THREE.Vector3(.48, 1.38, -.32)
                : holdingLongGun ? new THREE.Vector3(-.2, 1.35, -.33) : new THREE.Vector3(-.18, 1.37, -.2);
              const hand = holdingMedical
                ? new THREE.Vector3(isRightArm ? .25 : .02, 1.29, -.42)
                : holdingUtility ? new THREE.Vector3(.19, 1.29, -.42)
                : sprintCarry
                ? isRightArm ? new THREE.Vector3(.17, 1.05, -.2) : new THREE.Vector3(.1, 1.13, -.48)
                : isRightArm ? new THREE.Vector3(.19, 1.25, -.31)
                : holdingLongGun ? new THREE.Vector3(.1, 1.38, -.55) : new THREE.Vector3(.1, 1.24, -.32);
              if (holdingWeapon && leanAmount < 0) { elbow.x += leanAmount * .22; hand.x += leanAmount * .4; }
              alignLimb(limb.upper, shoulder, elbow);
              alignLimb(limb.lower, elbow, hand);
              limb.end.position.copy(hand); limb.end.quaternion.copy(limb.lower.quaternion);
              return;
            }
            const shoulder = new THREE.Vector3(limb.side * .43, 1.65, 0);
            const swingAngle = stride * amplitude * limb.side;
            const elbowFlex = movement === "sprint" ? .62 : movement === "walk" ? .38 : .18;
            const elbow = shoulder.clone().add(new THREE.Vector3(0, -Math.cos(swingAngle) * .44, -Math.sin(swingAngle) * .44));
            const forearmAngle = swingAngle + elbowFlex;
            const hand = elbow.clone().add(new THREE.Vector3(0, -Math.cos(forearmAngle) * .38, -Math.sin(forearmAngle) * .38));
            alignLimb(limb.upper, shoulder, elbow);
            alignLimb(limb.lower, elbow, hand);
            limb.end.position.copy(hand); limb.end.quaternion.copy(limb.lower.quaternion);
          } else {
            const phase = stride * -limb.side;
            const crouchAmount = isLocal ? crouchPoseAmount : 0;
            const walkThighAngle = phase * amplitude;
            const walkKneeBend = Math.max(0, phase) * (movement === "sprint" ? .95 : .55);
            const thighAngle = THREE.MathUtils.lerp(walkThighAngle, .75 + phase * .08, crouchAmount);
            const kneeBend = THREE.MathUtils.lerp(walkKneeBend, 1.88, crouchAmount);
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
          const hitsWall = boxes.some((box) => point.x > box.minX && point.x < box.maxX && point.z > box.minZ && point.z < box.maxZ && point.y > 0 && point.y < box.height);
          if (hitsWall) { points.push(point); break; }
          if (point.y < 0.08) { point.y = 0.08; points.push(point); break; }
          points.push(point);
        }
        trajectory.geometry.dispose();
        trajectory.geometry = points.length > 1
          ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(10, points.length * 3), .035, 7, false)
          : new THREE.BufferGeometry();
      }
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i]; projectile.age += dt;
        projectile.velocity.y -= 14.5 * dt;
        const previousPosition = projectile.mesh.position.clone();
        projectile.mesh.position.addScaledVector(projectile.velocity, dt);
        projectile.mesh.rotation.x += dt * 8; projectile.mesh.rotation.z += dt * 6;
        const wallHit = boxes.find((box) => projectile.mesh.position.x > box.minX && projectile.mesh.position.x < box.maxX && projectile.mesh.position.z > box.minZ && projectile.mesh.position.z < box.maxZ && projectile.mesh.position.y > 0 && projectile.mesh.position.y < box.height);
        if (wallHit) {
          const enteredOnX = previousPosition.x <= wallHit.minX || previousPosition.x >= wallHit.maxX;
          const landedOnTop = previousPosition.y >= wallHit.height;
          projectile.mesh.position.copy(previousPosition);
          if (landedOnTop) { projectile.mesh.position.y = wallHit.height + .12; projectile.velocity.y = Math.abs(projectile.velocity.y) * .42; projectile.velocity.x *= .82; projectile.velocity.z *= .82; }
          else { if (enteredOnX) projectile.velocity.x *= -.48; else projectile.velocity.z *= -.48; projectile.velocity.y *= .82; }
        }
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
      if (triggerHeld && currentFireMode === "AUTO" && !sprinting && !sliding && now - lastShot >= shotInterval) {
        fireRound();
        lastShot = now;
      }
      recoil = THREE.MathUtils.lerp(recoil, 0, Math.min(1, dt * 14));
      muzzleTimer -= dt;
      if (muzzleTimer <= 0) muzzle.intensity = 0;
      const bobY = moving ? Math.sin(t * (sprinting ? 13 : isProne ? 4 : isCrouching ? 6 : 9)) * (isProne ? .003 : isCrouching ? .006 : .012) : Math.sin(t * 2) * 0.003;
      const reloadPhase = reloadEnd ? 1 - Math.max(0, reloadEnd - now) / ((currentSlot === 1 ? primaryStats.reload : secondaryStats.reload) * 1000) : 0;
      const reloadDip = reloadEnd ? Math.sin(Math.min(1, reloadPhase) * Math.PI) : 0;
      const fastMovement = sprinting || sliding;
      const weaponProbeX = playerPosition.x - Math.sin(yaw) * .85 + leanRightX * leanAmount * .32;
      const weaponProbeZ = playerPosition.z - Math.cos(yaw) * .85 + leanRightZ * leanAmount * .32;
      const weaponNearWall = boxes.some((box) => weaponProbeX > box.minX && weaponProbeX < box.maxX && weaponProbeZ > box.minZ && weaponProbeZ < box.maxZ && box.height > .8);
      const targetX = (reloadEnd ? 0.16 : fastMovement ? -0.13 : aiming ? -0.34 : (moving ? Math.cos(t * 6.5) * 0.008 : 0)) + leanAmount * .13;
      const activeSight = activeAttachments().sight;
      const opticAimY = activeSight === "IRON SIGHTS" ? 0.145 : activeSight === "RED DOT" ? 0.07 : activeSight === "HOLOGRAPHIC" ? 0.04 : 0.08;
      const targetY = reloadEnd ? -0.52 * reloadDip : fastMovement ? -0.2 : aiming ? opticAimY : isProne ? .12 + bobY : bobY - recoil * 0.3;
      const targetZ = weaponNearWall ? .42 : reloadEnd ? 0.24 : fastMovement ? 0.16 : aiming ? 0.2 + recoil : isProne ? .1 : recoil;
      gun.position.x = THREE.MathUtils.lerp(gun.position.x, targetX, Math.min(1, dt * 12));
      gun.position.y = THREE.MathUtils.lerp(gun.position.y, targetY, Math.min(1, dt * 12));
      gun.position.z = THREE.MathUtils.lerp(gun.position.z, targetZ, Math.min(1, dt * 12));
      gun.rotation.x = THREE.MathUtils.lerp(gun.rotation.x, reloadEnd ? -0.45 : fastMovement ? -0.22 : recoil * 0.7, Math.min(1, dt * 12));
      gun.rotation.z = THREE.MathUtils.lerp(gun.rotation.z, (reloadEnd ? -0.35 : fastMovement ? 0.72 : 0) - leanAmount * .12, Math.min(1, dt * 12));
      const slashArc = secondaryIsMelee && currentSlot === 2 ? Math.sin(meleeSwing * Math.PI) : 0;
      gun.rotation.y = THREE.MathUtils.lerp(gun.rotation.y, -slashArc * 0.85, Math.min(1, dt * 22));
      if (secondaryIsMelee && currentSlot === 2) gun.position.x += slashArc * 0.18;
      gun.visible = !isThirdPerson;
      primaryWeapon.model.visible = currentSlot === 1;
      secondaryWeapon.model.visible = currentSlot === 2;
      medicalModel.visible = currentSlot === 3 && medicalCharges > 0;
      utilityModel.visible = currentSlot === 4 && grenadesLeft > 0;
      worldPrimary.visible = isThirdPerson && currentSlot === 1;
      worldSecondary.visible = isThirdPerson && currentSlot === 2;
      worldMedical.visible = isThirdPerson && currentSlot === 3 && medicalCharges > 0;
      worldUtility.visible = isThirdPerson && currentSlot === 4 && grenadesLeft > 0;
      [worldPrimary, worldSecondary].forEach((worldWeapon) => {
        const carryLow = sprinting || sliding;
        const shoulderSwapX = leanAmount < 0 ? leanAmount * .4 : 0;
        worldWeapon.position.x = THREE.MathUtils.lerp(worldWeapon.position.x, (carryLow ? -.07 : -.055) + shoulderSwapX, Math.min(1, dt * 12));
        worldWeapon.position.y = THREE.MathUtils.lerp(worldWeapon.position.y, isProne ? 1.42 : carryLow ? 1.25 : 1.58, Math.min(1, dt * 12));
        worldWeapon.position.z = THREE.MathUtils.lerp(worldWeapon.position.z, isProne ? .38 : weaponNearWall ? .38 : carryLow ? .02 : .03, Math.min(1, dt * 12));
        worldWeapon.rotation.x = THREE.MathUtils.lerp(worldWeapon.rotation.x, carryLow ? -.4 : -.04, Math.min(1, dt * 12));
        worldWeapon.rotation.z = THREE.MathUtils.lerp(worldWeapon.rotation.z, carryLow ? .1 : 0, Math.min(1, dt * 12));
      });
      camera.fov = THREE.MathUtils.lerp(camera.fov, aiming ? activeSight === "4X SCOPE" ? 20 : 58 : fastMovement ? 84 : 78, Math.min(1, dt * 10));
      camera.updateProjectionMatrix();
      stanceOffset = THREE.MathUtils.lerp(stanceOffset, isProne ? -1.18 : isCrouching ? -.65 : 0, Math.min(1, dt * 12));
      crouchPoseAmount = THREE.MathUtils.lerp(crouchPoseAmount, isCrouching ? 1 : 0, Math.min(1, dt * 10));
      proneAmount = THREE.MathUtils.lerp(proneAmount, isProne ? 1 : 0, Math.min(1, dt * 8));
      localPlayer.scale.set(1, 1, 1);
      if (isThirdPerson) {
        const orbitDistance = 4.2;
        const horizontalDistance = Math.cos(cameraPitch) * orbitDistance;
        const orbitRightX = Math.cos(cameraYaw), orbitRightZ = -Math.sin(cameraYaw);
        const orbitBaseLift = isProne ? .35 : .7;
        camera.position.set(
          playerPosition.x + Math.sin(cameraYaw) * horizontalDistance + orbitRightX * leanAmount * .55,
          playerPosition.y + orbitBaseLift + stanceOffset + Math.sin(cameraPitch) * orbitDistance,
          playerPosition.z + Math.cos(cameraYaw) * horizontalDistance + orbitRightZ * leanAmount * .55
        );
        camera.lookAt(playerPosition.x + orbitRightX * leanAmount * .2, playerPosition.y + 0.35 + stanceOffset, playerPosition.z + orbitRightZ * leanAmount * .2);
        camera.rotateZ(-leanAmount * .045);
      } else {
        camera.position.copy(playerPosition); camera.position.x += leanRightX * leanAmount * .42; camera.position.z += leanRightZ * leanAmount * .42; camera.position.y += stanceOffset;
        camera.rotation.z = -leanAmount * .13;
      }
      const laserEnabled = activeAttachments().tactical === "RED LASER" && currentSlot <= 2 && !(currentSlot === 2 && secondaryIsMelee);
      laserLine.visible = laserDot.visible = laserEnabled;
      if (laserEnabled) {
        const activeModel = isThirdPerson ? currentSlot === 1 ? worldPrimary : worldSecondary : currentSlot === 1 ? primaryWeapon.model : secondaryWeapon.model;
        const laserAnchor = activeModel.getObjectByName("laserAnchor");
        if (laserAnchor) {
          const laserStart = new THREE.Vector3(); laserAnchor.getWorldPosition(laserStart);
          raycaster.setFromCamera(getAimNdc(), camera);
          const laserHit = raycaster.intersectObjects(scene.children, true).find((result) => result.distance > .5 && result.object !== camera);
          const laserEnd = laserHit?.point.clone() ?? raycaster.ray.at(60, new THREE.Vector3());
          laserGeometry.setFromPoints([laserStart, laserEnd]); laserDot.position.copy(laserEnd);
        }
      }
      const flashlightEnabled = activeAttachments().tactical === "WHITE LIGHT" && currentSlot <= 2 && !(currentSlot === 2 && secondaryIsMelee);
      flashlight.intensity = flashlightEnabled ? 65 : 0;
      if (flashlightEnabled) {
        const activeModel = isThirdPerson ? currentSlot === 1 ? worldPrimary : worldSecondary : currentSlot === 1 ? primaryWeapon.model : secondaryWeapon.model;
        const flashlightAnchor = activeModel.getObjectByName("flashlightAnchor");
        if (flashlightAnchor) {
          flashlightAnchor.getWorldPosition(flashlight.position);
          raycaster.setFromCamera(getAimNdc(), camera);
          flashlight.target.position.copy(raycaster.ray.at(22, new THREE.Vector3()));
        }
      }
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
  }, [sessionId, selectedMap, primary, secondary, medical, utility, characterSkin, characterUniform, characterArmor, characterHelmet, faceGear, headAccessory, chestRig, backpack, pantsColor, gloveColor, bootColor, weaponSight, muzzleAttachment, tacticalAttachment, magazineAttachment, secondarySight, secondaryMuzzle, secondaryTactical, secondaryMagazine]);

  const equippedItems = [primary, secondary, medical, utility];
  const activeIsMelee = activeSlot === 2 && secondary === "COMBAT KNIFE";
  const activeSightAttachment = activeSlot === 1 ? weaponSight : secondarySight;
  const activeMaxMagazine = activeSlot === 1
    ? magazineCapacity(WEAPON_STATS[primary].capacity, magazineAttachment)
    : activeSlot === 2 && WEAPON_STATS[secondary] ? magazineCapacity(WEAPON_STATS[secondary].capacity, secondaryMagazine) : 0;

  return (
    <main className={`game-shell${!started ? " game-menu" : ""}`}>
      <div ref={mountRef} className="viewport" aria-label="3D first-person training arena" />
      <div className="vignette" />
      {adsActive && activeSightAttachment === "4X SCOPE" && !activeIsMelee && !thirdPerson && <div className="scope-overlay"><div className="scope-view"><i className="scope-line horizontal" /><i className="scope-line vertical" /><b /><span>4×</span></div></div>}
      <header className="topbar">
        <div className="brand"><span>STRIKE</span><b>YARD</b></div>
        <div className="mission"><small>{selectedMap}</small><strong>FREE ROAM</strong></div>
        <div className="status"><i /> SYSTEMS ONLINE</div>
      </header>
      <div className="kill-feed" aria-live="polite">
        {killFeed.map((entry) => <div key={entry.id}><b>YOU</b><span>{entry.weapon}</span>{entry.headshot && <i>HEADSHOT</i>}<strong>{entry.victim}</strong></div>)}
      </div>
      <div className="crosshair" style={{ left: thirdPerson ? leanSide < 0 ? "46%" : "54%" : "50%" }}><span /><span /></div>
      <div className="hud-left"><small>VITALS</small><strong>{health}</strong><div className="health"><i style={{ width: `${health}%` }} /></div></div>
      {(crouching || prone) && <div className="stance-status">{prone ? "PRONE" : "CROUCHED"} · <kbd>{prone ? "X" : "C"}</kbd> STAND</div>}
      {doorPrompt && <div className="door-prompt"><kbd>F</kbd> OPEN / CLOSE DOOR</div>}
      <div className="hud-right"><small>{equippedItems[activeSlot - 1]}{activeIsMelee ? " · MELEE" : activeSlot <= 2 ? ` · ${fireMode}` : " · READY"}</small><strong>{activeSlot === 4 ? utilityCount : activeSlot === 3 ? medicalCount : activeIsMelee ? "—" : ammo} <em>{activeSlot === 4 ? "THROWABLES" : activeSlot === 3 ? "MEDICAL" : activeIsMelee ? "" : `/ ${activeMaxMagazine}`}</em></strong></div>
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
      {selectedMap === "TEST YARD" && <div className="test-legend"><span className="damage-dot" /> DAMAGE PAD <span className="kill-dot" /> KILL PAD <span className="heal-dot" /> HEAL PAD <span className="medical-dot" /> MEDICAL DROP <span className="utility-dot" /> UTILITY DROP</div>}
      <div className="controls"><kbd>WASD</kbd> MOVE <kbd>SHIFT</kbd> SPRINT <kbd>C</kbd> CROUCH / SLIDE <kbd>X</kbd> PRONE <kbd>Q/E</kbd> LEAN <kbd>RMB</kbd> {thirdPerson ? "ORBIT CAMERA" : "AIM"} <kbd>LMB</kbd> FIRE <kbd>TAB</kbd> {thirdPerson ? "1ST PERSON" : "3RD PERSON"}</div>
      {dead && <div className="death-screen">
        <div className="death-code">KIA</div><h2>OPERATOR DOWN</h2><p>TEST CONDITION: FATAL DAMAGE</p>
        <button onClick={() => {
          respawnRef.current(); setHealth(100); setDead(false);
          mountRef.current?.querySelector("canvas")?.requestPointerLock();
        }}>RESPAWN AT TEST YARD</button>
      </div>}
      {!locked && !dead && <div className={`menu-screen${!started ? " main-menu-screen" : " pause-screen"}`}>
        <div className="menu-rule" />
        {!started && menuPage === "HOME" && <aside className="map-select"><small>TEMPORARY MAP SELECT</small><h2>DEPLOYMENT</h2>
          {(["TEST YARD", "CITY BLOCK"] as GameMap[]).map((map) => <button key={map} className={selectedMap === map ? "selected" : ""} onClick={() => setSelectedMap(map)}><i /> <span>{map}</span><b>{map === "CITY BLOCK" ? "URBAN · ENTERABLE BUILDINGS" : "SYSTEMS TESTING"}</b></button>)}
        </aside>}
        {!started && menuPage !== "LOADOUT" && <button className="character-preview" onClick={() => setMenuPage("CHARACTER")} aria-label="Customize character">
          <div className="preview-glow" />
          <OperatorPreview3D skin={characterSkin} uniform={characterUniform} armor={characterArmor} helmet={characterHelmet} faceGear={faceGear} headAccessory={headAccessory} chestRig={chestRig} backpack={backpack} pants={pantsColor} gloves={gloveColor} boots={bootColor} />
          <span>{menuPage === "CHARACTER" ? "OPERATOR PREVIEW" : "CLICK OPERATOR TO CUSTOMIZE"}</span>
        </button>}
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
            <button onClick={() => setMenuPage("CHARACTER")}><b>03</b><span>OPERATOR</span><small>CUSTOMIZE CHARACTER</small></button>
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
            <div className="attachments-panel">
              <div className="attachments-heading"><span>PRIMARY</span> ATTACHMENTS <small>{primary}</small></div>
              <div className="attachments-grid">
                <AttachmentOption label="OPTIC" value={weaponSight} options={["IRON SIGHTS", "RED DOT", "HOLOGRAPHIC", "4X SCOPE"]} onSelect={(value) => setWeaponSight(value as typeof weaponSight)} />
                <AttachmentOption label="MUZZLE" value={muzzleAttachment} options={["STANDARD BARREL", "SUPPRESSOR"]} onSelect={(value) => setMuzzleAttachment(value as typeof muzzleAttachment)} />
                <AttachmentOption label="MAGAZINE" value={magazineAttachment} options={["STANDARD MAG", "EXTENDED MAG", "DRUM MAG"]} onSelect={(value) => setMagazineAttachment(value as typeof magazineAttachment)} />
                <AttachmentOption label="TACTICAL" value={tacticalAttachment} options={["NONE", "RED LASER", "WHITE LIGHT"]} onSelect={(value) => setTacticalAttachment(value as typeof tacticalAttachment)} />
              </div>
              <div className="attachments-heading secondary"><span>SECONDARY</span> ATTACHMENTS <small>{secondary}</small></div>
              <div className="attachments-grid">
                <AttachmentOption label="OPTIC" value={secondarySight} options={["IRON SIGHTS", "RED DOT", "HOLOGRAPHIC", "4X SCOPE"]} onSelect={(value) => setSecondarySight(value as typeof secondarySight)} />
                <AttachmentOption label="MUZZLE" value={secondaryMuzzle} options={["STANDARD BARREL", "SUPPRESSOR"]} onSelect={(value) => setSecondaryMuzzle(value as typeof secondaryMuzzle)} />
                <AttachmentOption label="MAGAZINE" value={secondaryMagazine} options={["STANDARD MAG", "EXTENDED MAG", "DRUM MAG"]} onSelect={(value) => setSecondaryMagazine(value as typeof secondaryMagazine)} />
                <AttachmentOption label="TACTICAL" value={secondaryTactical} options={["NONE", "RED LASER", "WHITE LIGHT"]} onSelect={(value) => setSecondaryTactical(value as typeof secondaryTactical)} />
              </div>
            </div>
            <button className="confirm-loadout" onClick={() => setMenuPage("HOME")}>CONFIRM LOADOUT</button>
          </div>}
          {(!started && menuPage === "CHARACTER") && <div className="character-editor">
            <button className="back-button" onClick={() => setMenuPage("HOME")}>← MAIN MENU</button>
            <div className="loadout-heading"><div><span>OPERATOR</span> EDITOR</div><small>LIVE CHARACTER PREVIEW</small></div>
            <CharacterOption label="SKIN TONE" value={characterSkin} options={[
              ["#f1c7a5", "LIGHT"], ["#c58c68", "MEDIUM"], ["#8f5d43", "TAN"], ["#5c382b", "DEEP"]
            ]} onSelect={setCharacterSkin} />
            <CharacterOption label="UNIFORM" value={characterUniform} options={[
              ["#303a3b", "URBAN"], ["#394331", "FOREST"], ["#514839", "DESERT"], ["#26374a", "NAVY"]
            ]} onSelect={setCharacterUniform} />
            <CharacterOption label="PANTS" value={pantsColor} options={[
              ["#303a3b", "URBAN"], ["#35422e", "WOODLAND"], ["#665944", "DESERT"], ["#242c35", "BLACK"]
            ]} onSelect={setPantsColor} />
            <CharacterOption label="ARMOR" value={characterArmor} options={[
              ["#20292b", "BLACK"], ["#4b5143", "OLIVE"], ["#675747", "TAN"], ["#3c4653", "SLATE"]
            ]} onSelect={setCharacterArmor} />
            <CharacterOption label="GLOVES" value={gloveColor} options={[["#20292b", "BLACK"], ["#564a38", "TAN"], ["#46503d", "OLIVE"]]} onSelect={setGloveColor} />
            <CharacterOption label="BOOTS" value={bootColor} options={[["#151b1d", "BLACK"], ["#493d31", "BROWN"], ["#555142", "FIELD"]]} onSelect={setBootColor} />
            <div className="gear-editor-grid">
              <GearOption label="HELMET" value={characterHelmet} options={["LIGHT", "TACTICAL", "HEAVY"]} onSelect={(value) => setCharacterHelmet(value as typeof characterHelmet)} />
              <GearOption label="FACE GEAR" value={faceGear} options={["NONE", "GOGGLES", "MASK"]} onSelect={(value) => setFaceGear(value as typeof faceGear)} />
              <GearOption label="HEAD ACCESSORY" value={headAccessory} options={["NONE", "HEADSET", "NVG"]} onSelect={(value) => setHeadAccessory(value as typeof headAccessory)} />
              <GearOption label="CHEST RIG" value={chestRig} options={["LIGHT", "PLATE CARRIER", "HEAVY"]} onSelect={(value) => setChestRig(value as typeof chestRig)} />
              <GearOption label="BACKPACK" value={backpack} options={["NONE", "ASSAULT PACK", "RADIO PACK"]} onSelect={(value) => setBackpack(value as typeof backpack)} />
            </div>
            <button className="confirm-loadout" onClick={() => setMenuPage("HOME")}>SAVE OPERATOR</button>
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
              setThirdPerson(false);
              setAdsActive(false);
              setCrouching(false);
              setKillFeed([]);
              setLeanSide(0);
              setProne(false);
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

function OperatorPreview3D({ skin, uniform, armor, helmet, faceGear, headAccessory, chestRig, backpack, pants, gloves, boots }: { skin: string; uniform: string; armor: string; helmet: string; faceGear: string; headAccessory: string; chestRig: string; backpack: string; pants: string; gloves: string; boots: string }) {
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mount = previewRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, mount.clientWidth / mount.clientHeight, 0.1, 30);
    camera.position.set(0, 1.15, 6.8); camera.lookAt(0, 1.05, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xbfe4ef, 0x101719, 2.2));
    const key = new THREE.DirectionalLight(0xffc09b, 4.5); key.position.set(-3, 5, 4); key.castShadow = true; scene.add(key);
    const rim = new THREE.PointLight(0x54cce8, 14, 8); rim.position.set(3, 2.5, -2); scene.add(rim);
    const operator = new THREE.Group(); operator.position.y = -1.2; scene.add(operator);
    const mat = (color: string | number, roughness = .72, metalness = .08) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const skinMat = mat(skin, .62), uniformMat = mat(uniform, .9), armorMat = mat(armor, .55, .28), pantsMat = mat(pants, .9), gloveMat = mat(gloves, .7, .16), bootMat = mat(boots, .78, .14), darkMat = mat(0x111719, .65, .35);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; operator.add(mesh); return mesh;
    };
    add(new THREE.BoxGeometry(.72, .88, .38), uniformMat, 0, 1.65, 0);
    const previewChestWidth = chestRig === "LIGHT" ? .62 : chestRig === "HEAVY" ? .86 : .78;
    add(new THREE.BoxGeometry(previewChestWidth, .62, chestRig === "LIGHT" ? .14 : chestRig === "HEAVY" ? .28 : .22), armorMat, 0, 1.73, .24);
    if (backpack !== "NONE") add(new THREE.BoxGeometry(backpack === "RADIO PACK" ? .7 : .62, backpack === "RADIO PACK" ? .78 : .62, backpack === "RADIO PACK" ? .3 : .22), armorMat, 0, 1.7, -.27);
    [-.23, 0, .23].forEach((x) => add(new THREE.BoxGeometry(.18, .18, .14), armorMat, x, 1.38, .38));
    add(new THREE.BoxGeometry(.7, .12, .4), darkMat, 0, 1.16, 0);
    add(new THREE.CylinderGeometry(.15, .17, .18, 12), skinMat, 0, 2.17, 0);
    add(new THREE.SphereGeometry(.28, 20, 14), skinMat, 0, 2.46, 0);
    const helmetSize = helmet === "LIGHT" ? .29 : helmet === "HEAVY" ? .36 : .33;
    const helmetMesh = add(new THREE.SphereGeometry(helmetSize, 20, 10, 0, Math.PI * 2, 0, Math.PI * .55), armorMat, 0, 2.57, 0);
    if (helmet === "HEAVY") helmetMesh.scale.y = 1.08;
    if (faceGear === "GOGGLES") add(new THREE.BoxGeometry(helmet === "HEAVY" ? .48 : .4, .105, .055), mat(0x5ca8b5, .18, .65), 0, 2.48, .275);
    if (faceGear === "MASK") add(new THREE.BoxGeometry(.34, .22, .09), uniformMat, 0, 2.36, .265);
    if (headAccessory === "HEADSET") add(new THREE.BoxGeometry(.07, .22, .1), armorMat, -.3, 2.49, 0);
    if (headAccessory === "NVG") { add(new THREE.BoxGeometry(.28, .08, .1), armorMat, 0, 2.62, .25); add(new THREE.CylinderGeometry(.05, .06, .18, 9), darkMat, -.08, 2.55, .34).rotation.x = Math.PI / 2; add(new THREE.CylinderGeometry(.05, .06, .18, 9), darkMat, .08, 2.55, .34).rotation.x = Math.PI / 2; }
    [-1, 1].forEach((side) => {
      if (chestRig !== "LIGHT") add(new THREE.SphereGeometry(.19, 12, 9), armorMat, side * .49, 1.9, 0);
      const upper = add(new THREE.CylinderGeometry(.12, .105, .5, 10), uniformMat, side * .53, 1.62, 0); upper.rotation.z = side * -.07;
      add(new THREE.CylinderGeometry(.105, .085, .44, 10), uniformMat, side * .55, 1.18, .02);
      add(new THREE.BoxGeometry(.2, .2, .22), gloveMat, side * .56, .91, .03);
      add(new THREE.CylinderGeometry(.15, .13, .54, 10), pantsMat, side * .22, .86, 0);
      add(new THREE.BoxGeometry(.25, .2, .16), armorMat, side * .22, .58, .12);
      add(new THREE.CylinderGeometry(.13, .105, .52, 10), pantsMat, side * .22, .3, 0);
      add(new THREE.BoxGeometry(.27, .17, .43), bootMat, side * .22, .02, .08);
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.45, 40), new THREE.MeshStandardMaterial({ color: 0x17252a, roughness: .8, transparent: true, opacity: .82 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.19; floor.receiveShadow = true; scene.add(floor);
    let frame = 0;
    const clock = new THREE.Clock();
    const animate = () => { frame = requestAnimationFrame(animate); const t = clock.getElapsedTime(); operator.rotation.y = Math.sin(t * .42) * .22; operator.position.y = -1.2 + Math.sin(t * 1.5) * .012; renderer.render(scene, camera); };
    animate();
    const resize = () => { if (!mount.clientWidth || !mount.clientHeight) return; camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth, mount.clientHeight); };
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); renderer.dispose(); scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose()); else object.material.dispose(); } }); if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement); };
  }, [skin, uniform, armor, helmet, faceGear, headAccessory, chestRig, backpack, pants, gloves, boots]);
  return <div ref={previewRef} className="operator-preview-3d" />;
}

function CharacterOption({ label, value, options, onSelect }: { label: string; value: string; options: [string, string][]; onSelect: (value: string) => void }) {
  return <div className="character-option"><h2>{label}</h2><div className="swatch-options">
    {options.map(([color, name]) => <button key={color} className={value === color ? "selected" : ""} onClick={() => onSelect(color)}>
      <i style={{ background: color }} /><span>{name}</span>
    </button>)}
  </div></div>;
}

function GearOption({ label, value, options, onSelect }: { label: string; value: string; options: string[]; onSelect: (value: string) => void }) {
  return <div className="character-option gear-option"><h2>{label}</h2><div className="helmet-options">
    {options.map((option) => <button key={option} className={value === option ? "selected" : ""} onClick={() => onSelect(option)}>{option}</button>)}
  </div></div>;
}

function AttachmentOption({ label, value, options, onSelect }: { label: string; value: string; options: string[]; onSelect: (value: string) => void }) {
  return <section className="attachment-option"><h2>{label}</h2><div>
    {options.map((option) => { const penalty = attachmentItemPenalty(option); return <button key={option} className={value === option ? "selected" : ""} onClick={() => onSelect(option)}>
      <i /> <span>{option}</span><small>{value === option ? "EQUIPPED" : "SELECT"}{penalty > 0 && ` · −${penalty} MOBILITY`}</small>
    </button>; })}
  </div></section>;
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
