"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Box = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };
type FireMode = "SEMI" | "BURST" | "AUTO";
type MenuPage = "HOME" | "LOADOUT";

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

    // Simple weapon view model
    const gun = new THREE.Group();
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.18, 0.62), material(0x22282a, 0.35, 0.65));
    gunBody.position.set(0.34, -0.28, -0.58);
    gun.add(gunBody);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.1), material(0xef5e2f, 0.5, 0.2));
    sight.position.set(0.34, -0.15, -0.72);
    gun.add(sight);
    const muzzle = new THREE.PointLight(0xff7b35, 0, 2.5, 2);
    muzzle.position.set(0.34, -0.2, -0.95);
    gun.add(muzzle);
    camera.add(gun);
    scene.add(camera);

    const keys = new Set<string>();
    let yaw = 0, pitch = 0, verticalVelocity = 0, grounded = true;
    let ammoCount = 30, recoil = 0, muzzleTimer = 0, aiming = false, sprinting = false;
    let currentFireMode: FireMode = "AUTO", triggerHeld = false, lastShot = 0;
    let last = performance.now();
    const clock = new THREE.Clock();

    const collides = (x: number, z: number) => boxes.some((b) =>
      x + PLAYER_RADIUS > b.minX && x - PLAYER_RADIUS < b.maxX &&
      z + PLAYER_RADIUS > b.minZ && z - PLAYER_RADIUS < b.maxZ && b.height > 0.25
    );

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === "Space" && grounded) { verticalVelocity = 5.7; grounded = false; }
      if (e.code === "KeyR") { ammoCount = 30; setAmmo(30); }
      if (e.code === "KeyB" && !e.repeat) {
        const modes: FireMode[] = ["SEMI", "BURST", "AUTO"];
        currentFireMode = modes[(modes.indexOf(currentFireMode) + 1) % modes.length];
        setFireMode(currentFireMode);
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
      if (document.pointerLockElement !== renderer.domElement || ammoCount <= 0 || sprinting) return;
      ammoCount -= 1;
      setAmmo(ammoCount);
      recoil = Math.min(recoil + 0.055, 0.11);
      muzzle.intensity = 35;
      muzzleTimer = 0.045;
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hit = raycaster.intersectObjects(scene.children, false).find((result) => result.object !== camera && result.distance > 1);
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
      if (triggerHeld && currentFireMode === "AUTO" && !sprinting && now - lastShot >= 95) {
        fireRound();
        lastShot = now;
      }
      recoil = THREE.MathUtils.lerp(recoil, 0, Math.min(1, dt * 14));
      muzzleTimer -= dt;
      if (muzzleTimer <= 0) muzzle.intensity = 0;
      const bobY = moving ? Math.sin(t * (sprinting ? 13 : 9)) * 0.012 : Math.sin(t * 2) * 0.003;
      const targetX = sprinting ? -0.13 : aiming ? -0.34 : (moving ? Math.cos(t * 6.5) * 0.008 : 0);
      const targetY = sprinting ? -0.2 : aiming ? 0.15 : bobY - recoil * 0.3;
      const targetZ = sprinting ? 0.16 : aiming ? 0.2 + recoil : recoil;
      gun.position.x = THREE.MathUtils.lerp(gun.position.x, targetX, Math.min(1, dt * 12));
      gun.position.y = THREE.MathUtils.lerp(gun.position.y, targetY, Math.min(1, dt * 12));
      gun.position.z = THREE.MathUtils.lerp(gun.position.z, targetZ, Math.min(1, dt * 12));
      gun.rotation.x = THREE.MathUtils.lerp(gun.rotation.x, sprinting ? -0.22 : recoil * 0.7, Math.min(1, dt * 12));
      gun.rotation.z = THREE.MathUtils.lerp(gun.rotation.z, sprinting ? 0.72 : 0, Math.min(1, dt * 12));
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
  }, [sessionId]);

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
      <div className="hud-right"><small>{primary} · {fireMode}</small><strong>{ammo} <em>/ 120</em></strong></div>
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
  return <section className="loadout-slot">
    <h2>{label}</h2>
    {options.map(([name, detail]) => <button key={name} className={selected === name ? "selected" : ""} onClick={() => onSelect(name)}>
      <i />
      <span><b>{name}</b><small>{detail}</small></span>
      <em>{selected === name ? "EQUIPPED" : "SELECT"}</em>
    </button>)}
  </section>;
}
