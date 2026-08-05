"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Box = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };
type FireMode = "SEMI" | "BURST" | "AUTO";
type MenuPage = "HOME" | "LOADOUT";

const WEAPON_STATS: Record<string, { damage: number; fireRate: number; capacity: number; reload: number; range: number; mobility: number }> = {
  "VXR-4 CARBINE": { damage: 32, fireRate: 72, capacity: 30, reload: 2.35, range: 74, mobility: 68 },
  "M12 SMG": { damage: 24, fireRate: 91, capacity: 36, reload: 1.85, range: 48, mobility: 90 },
  "BR-7 RIFLE": { damage: 58, fireRate: 43, capacity: 20, reload: 2.8, range: 94, mobility: 51 },
  "P9 SIDEARM": { damage: 28, fireRate: 58, capacity: 15, reload: 1.45, range: 45, mobility: 94 },
  "R45 REVOLVER": { damage: 72, fireRate: 29, capacity: 6, reload: 3.1, range: 61, mobility: 76 },
};

const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.38;

export function FpsGame() {
  const mountRef = useRef<HTMLDivElement>(null);
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

      if (name === "P9 SIDEARM" || name === "R45 REVOLVER") {
        const revolver = name === "R45 REVOLVER";
        addPart(revolver ? 0.22 : 0.18, 0.14, revolver ? 0.48 : 0.52, x, -0.25, -0.62, revolver ? 0x343638 : 0x1d2427);
        const grip = addPart(0.15, 0.38, 0.2, x, -0.48, -0.48, revolver ? 0x5b3727 : 0x252d2f);
        grip.rotation.x = -0.25;
        if (revolver) {
          const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 10), weaponMaterial(0x4b5051));
          cylinder.rotation.z = Math.PI / 2; cylinder.position.set(x, -0.27, -0.64); model.add(cylinder);
        } else {
          const magazine = addPart(0.115, 0.31, 0.14, x, -0.53, -0.48, 0x111719);
          magazine.rotation.x = -0.25;
          addPart(0.15, 0.025, 0.17, x, -0.7, -0.43, 0x343d3f);
        }
        muzzleZ = revolver ? -0.91 : -0.93;
      } else if (name === "COMBAT KNIFE") {
        addPart(0.12, 0.12, 0.42, x, -0.32, -0.46, 0x272f30);
        const blade = addPart(0.045, 0.15, 0.7, x, -0.25, -0.98, 0x9ca6a4);
        blade.rotation.z = 0.08; muzzleZ = -1.34;
      } else {
        const isSmg = name === "M12 SMG";
        const isRifle = name === "BR-7 RIFLE";
        const accent = isSmg ? 0x2f4a4e : isRifle ? 0x584f3c : 0x343e40;
        addPart(isSmg ? 0.21 : 0.23, 0.2, isRifle ? 0.72 : 0.6, x, -0.28, -0.57, 0x1b2224);
        addPart(isSmg ? 0.19 : 0.18, 0.16, isRifle ? 0.62 : 0.46, x, -0.27, isRifle ? -1.18 : -1.04, accent);
        const stock = addPart(isSmg ? 0.08 : 0.2, isSmg ? 0.1 : 0.22, isSmg ? 0.38 : 0.5, x, -0.3, -0.08, 0x242c2e);
        stock.rotation.x = isSmg ? 0 : -0.08;
        const magazine = addPart(isSmg ? 0.13 : 0.145, isSmg ? 0.46 : isRifle ? 0.32 : 0.39, isSmg ? 0.14 : 0.19, x, isSmg ? -0.56 : -0.5, isSmg ? -0.72 : -0.58, 0x111719);
        magazine.rotation.x = isSmg ? 0.04 : -0.2;
        addPart((isSmg ? 0.15 : 0.165), 0.03, 0.21, x, isSmg ? -0.8 : -0.69, isSmg ? -0.72 : -0.51, 0x465154);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, isRifle ? 0.55 : 0.38, 10), weaponMaterial(0x111718));
        barrel.rotation.x = Math.PI / 2; barrel.position.set(x, -0.25, isRifle ? -1.73 : -1.43); model.add(barrel);
        muzzleZ = isRifle ? -2.02 : -1.64;
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

    const keys = new Set<string>();
    let yaw = 0, pitch = 0, verticalVelocity = 0, grounded = true;
    const primaryStats = WEAPON_STATS[primary];
    const secondaryIsMelee = secondary === "COMBAT KNIFE";
    const secondaryStats = WEAPON_STATS[secondary] ?? { damage: 100, fireRate: 100, capacity: 1, reload: 0.6, range: 5, mobility: 100 };
    const ammoCounts = [primaryStats.capacity, secondaryStats.capacity];
    setAmmo(primaryStats.capacity);
    let ammoCount = ammoCounts[0], recoil = 0, muzzleTimer = 0, aiming = false, sprinting = false, reloadEnd = 0, meleeSwing = 0, lastMelee = 0;
    let currentFireMode: FireMode = "AUTO", triggerHeld = false, lastShot = 0, currentSlot = 1;
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
        reloadEnd = 0;
        setReloading(false);
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
    const fireRound = () => {
      if (document.pointerLockElement !== renderer.domElement || sprinting || currentSlot > 2 || reloadEnd > 0) return;
      if (currentSlot === 2 && secondaryIsMelee) {
        const now = performance.now();
        if (now - lastMelee < 480) return;
        lastMelee = now;
        meleeSwing = 1;
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const meleeHit = raycaster.intersectObjects(scene.children, false).find((result) => result.object !== camera && result.distance > 0.5 && result.distance <= 2.35);
        if (meleeHit) {
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
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hit = raycaster.intersectObjects(scene.children, false).find((result) => result.object !== camera && result.distance > 1);
      const tracerStart = new THREE.Vector3();
      (currentSlot === 1 ? primaryWeapon.muzzleAnchor : secondaryWeapon.muzzleAnchor).getWorldPosition(tracerStart);
      const tracerEnd = hit?.point.clone() ?? raycaster.ray.at(70, new THREE.Vector3());
      const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffb06b, transparent: true, opacity: 0.9 });
      const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([tracerStart, tracerEnd]), tracerMaterial);
      scene.add(tracer);
      window.setTimeout(() => {
        scene.remove(tracer);
        tracer.geometry.dispose();
        tracerMaterial.dispose();
      }, 65);
      if (hit) {
        const impact = new THREE.Mesh(impactGeometry, impactMaterial);
        impact.position.copy(hit.point).addScaledVector(hit.face?.normal ?? new THREE.Vector3(0, 1, 0), 0.025);
        scene.add(impact);
        window.setTimeout(() => scene.remove(impact), 1800);
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      if (e.button === 2) { aiming = true; return; }
      if (e.button !== 0 || sprinting) return;
      triggerHeld = true;
      if (currentFireMode === "SEMI") fireRound();
      if (currentFireMode === "BURST") [0, 85, 170].forEach((delay) => window.setTimeout(() => {
        if (!sprinting) fireRound();
      }, delay));
      if (currentFireMode === "AUTO") { fireRound(); lastShot = performance.now(); }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) triggerHeld = false;
      if (e.button === 2) aiming = false;
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (!isLocked) { aiming = false; triggerHeld = false; keys.clear(); }
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

      verticalVelocity -= 14.5 * dt;
      camera.position.y += verticalVelocity * dt;
      if (camera.position.y <= PLAYER_HEIGHT) { camera.position.y = PLAYER_HEIGHT; verticalVelocity = 0; grounded = true; }

      const moving = input.lengthSq() > 0 && grounded;
      const t = clock.getElapsedTime();
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
  }, [sessionId, primary, secondary]);

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
      <div className="hud-left"><small>VITALS</small><strong>100</strong><div className="health"><i /></div></div>
      <div className="hud-right"><small>{equippedItems[activeSlot - 1]}{activeIsMelee ? " · MELEE" : activeSlot <= 2 ? ` · ${fireMode}` : " · READY"}</small><strong>{activeIsMelee || activeSlot > 2 ? "—" : ammo} <em>{activeIsMelee || activeSlot > 2 ? "" : "/ 120"}</em></strong></div>
      {reloading && <div className="reload-status"><span>RELOADING</span><i style={{ animationDuration: `${reloadDuration}s` }} /></div>}
      <div className="quick-slots">
        {([
          [1, primary, "PRIMARY"], [2, secondary, "SECONDARY"], [3, medical, "MEDICAL"], [4, utility, "UTILITY"]
        ] as [number, string, string][]).map(([slot, item, label]) => <div key={slot} className={activeSlot === slot ? "active" : ""}>
          <kbd>{slot}</kbd><span><small>{label}</small><b>{item}</b></span>
        </div>)}
      </div>
      <div className="controls"><kbd>WASD</kbd> MOVE <kbd>SHIFT</kbd> SPRINT <kbd>RMB</kbd> AIM <kbd>LMB</kbd> FIRE <kbd>B</kbd> MODE <kbd>R</kbd> RELOAD</div>
      {!locked && <div className={`menu-screen${!started ? " main-menu-screen" : " pause-screen"}`}>
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
                ["VXR-4 CARBINE", "BALANCED · AUTO"], ["M12 SMG", "MOBILE · CLOSE RANGE"], ["BR-7 RIFLE", "PRECISION · SEMI"]
              ]} onSelect={setPrimary} />
              <LoadoutSlot label="SECONDARY" selected={secondary} options={[
                ["P9 SIDEARM", "RELIABLE · 15 ROUNDS"], ["R45 REVOLVER", "HEAVY · 6 ROUNDS"], ["COMBAT KNIFE", "FAST · SILENT"]
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
      {[['DAMAGE', stats.damage], ['FIRE RATE', stats.fireRate], ['RANGE', stats.range], ['MOBILITY', stats.mobility]].map(([name, value]) => <div key={name}>
        <span>{name}</span><i><b style={{ width: `${value}%` }} /></i><em>{value}</em>
      </div>)}
      <footer><span>MAGAZINE <b>{stats.capacity}</b></span><span>RELOAD <b>{stats.reload.toFixed(2)}s</b></span></footer>
    </div>}
  </section>;
}
