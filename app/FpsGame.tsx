"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

type Box = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; active?: boolean };
type PlayerStance = "standing" | "crouching" | "prone";
type FireMode = "SEMI" | "BURST" | "AUTO";
type GameMode = "FFA" | "TDM" | "KOTH" | "CTP" | "CTF";
type ObjectiveZone = { id: string; x: number; z: number; radius: number; owner: "ALPHA" | "BRAVO" | null; progress: number };
type FlagState = { team:"ALPHA"|"BRAVO"; homeX:number; homeZ:number; x:number; z:number; carrierId:string|null; dropped:boolean };
type MenuPage = "HOME" | "LOADOUT" | "CHARACTER" | "CLASSES" | "SETTINGS";
type GameMap = "TEST YARD" | "CITY BLOCK" | "BLACKWOOD FOREST" | "FROSTLINE BASE" | "TIDEBREAK BEACH" | "DUSTFALL DESERT";
type GameSector = "TRAINING SECTOR" | "SECTOR 1" | "SECTOR 2" | "SECTOR 3" | "SECTOR 4";
type MultiplayerSector = Exclude<GameSector, "TRAINING SECTOR">;
type KillFeedEntry = { id: number; killer: string; victim: string; weapon: string; headshot: boolean };
type NetworkPlayerSummary = { callsign: string; kills: number; deaths: number };
type ChatMessage = { id: string; senderId: string; text: string; sentAt: number };
type DamageNumber = { id: number; damage: number; x: number; y: number; headshot: boolean };
type RadarPing = { id: string; x: number; z: number; local: boolean };
type SightAttachment = "IRON SIGHTS" | "RED DOT" | "HOLOGRAPHIC" | "4X SCOPE";
type MuzzleAttachment = "STANDARD BARREL" | "SUPPRESSOR";
type TacticalAttachment = "NONE" | "RED LASER" | "WHITE LIGHT";
type MagazineAttachment = "STANDARD MAG" | "EXTENDED MAG" | "DRUM MAG";
type FireControlAttachment = "STANDARD TRIGGER" | "BURST TRIGGER";
type PassiveEquipment = "ARMOR PLATING" | "HEAT VISION GOGGLES" | "360 GOGGLES" | "SATELLITE GPS";
type CamoPattern = "SOLID" | "WOODLAND" | "MULTICAM" | "DIGITAL" | "URBAN CAMO";
type OperatorAccessory = "GOGGLES" | "MASK" | "HEADSET" | "NVG";
type PlayerClass = "RECRUIT" | "ASSAULT" | "SCOUT" | "MEDIC" | "HEAVY" | "MORTAR" | "AIRSTRIKE" | "DEMOLITION" | "ENGINEER" | "DRONE";
type WeaponAttachments = { sight: SightAttachment; muzzle: MuzzleAttachment; tactical: TacticalAttachment; magazine: MagazineAttachment; fireControl: FireControlAttachment };
type PlayerAppearance = { skin: string; uniform: string; camo: CamoPattern; accessories: OperatorAccessory[]; armor: string; helmet: string; faceGear: string; headAccessory: string; chestRig: string; backpack: string; pants: string; gloves: string; boots: string };
type SavedLoadout = { primary: string; secondary: string; medical: string; utility: string; equipment: PassiveEquipment; playerClass?: PlayerClass; weaponSight: SightAttachment; muzzleAttachment: MuzzleAttachment; tacticalAttachment: TacticalAttachment; magazineAttachment: MagazineAttachment; fireControlAttachment: FireControlAttachment; secondarySight: SightAttachment; secondaryMuzzle: MuzzleAttachment; secondaryTactical: TacticalAttachment; secondaryMagazine: MagazineAttachment; secondaryFireControl: FireControlAttachment };
type SavedOperator = { characterSkin: string; characterUniform: string; camoPattern?: CamoPattern; accessories?: OperatorAccessory[]; characterArmor: string; characterHelmet: "TACTICAL" | "LIGHT" | "HEAVY"; faceGear: "NONE" | "GOGGLES" | "MASK"; headAccessory: "NONE" | "HEADSET" | "NVG"; chestRig: "LIGHT" | "PLATE CARRIER" | "HEAVY"; backpack: "NONE" | "ASSAULT PACK" | "RADIO PACK"; pantsColor: string; gloveColor: string; bootColor: string };
type AdminCommand = "refill_ammo" | "refill_medical" | "refill_utility" | "restore_health" | "kill_targets";

const attachmentMobilityPenalty = (attachments: WeaponAttachments) =>
  (attachments.muzzle === "SUPPRESSOR" ? 4 : 0) +
  (attachments.magazine === "EXTENDED MAG" ? 5 : attachments.magazine === "DRUM MAG" ? 14 : 0) +
  (attachments.tactical === "WHITE LIGHT" ? 3 : 0) +
  (attachments.fireControl === "BURST TRIGGER" ? 25 : 0);

const attachmentItemPenalty = (attachment: string) =>
  attachment === "BURST TRIGGER" ? 25 : attachment === "SUPPRESSOR" ? 4 : attachment === "EXTENDED MAG" ? 5 : attachment === "DRUM MAG" ? 14 : attachment === "WHITE LIGHT" ? 3 : 0;

const createCamoTexture = (pattern: CamoPattern, baseColor: string) => {
  if (pattern === "SOLID" || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  let seed = [...`${pattern}${baseColor}`].reduce((value, letter) => Math.imul(value ^ letter.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const random = () => { seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0; seed = Math.imul(seed ^ (seed >>> 13), 3266489917) >>> 0; return (seed >>> 0) / 4294967296; };
  const base = new THREE.Color(baseColor);
  const baseHsl = { h: 0, s: 0, l: 0 }; base.getHSL(baseHsl);
  const shade = (lightnessOffset: number) => {
    const color = new THREE.Color().setHSL(baseHsl.h, baseHsl.s, THREE.MathUtils.clamp(baseHsl.l + lightnessOffset, .04, .92));
    return `#${color.getHexString()}`;
  };
  const palettes: Record<Exclude<CamoPattern, "SOLID">, string[]> = {
    WOODLAND: [shade(.08), shade(-.08), shade(.17), shade(-.17)],
    MULTICAM: [shade(.13), shade(.04), shade(-.06), shade(-.14), shade(.21), shade(-.2)],
    DIGITAL: [shade(.07), shade(-.07), shade(.16), shade(-.16)],
    "URBAN CAMO": [shade(.18), shade(.07), shade(-.08), shade(-.2)],
  };
  const palette = palettes[pattern];
  ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, 256, 256);
  const organicBlob = (x: number, y: number, radius: number, color: string, points = 11) => {
    const vertices = Array.from({ length: points }, (_, index) => {
      const angle = index / points * Math.PI * 2;
      const distance = radius * (.55 + random() * .65);
      return { x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance * (.5 + random() * .35) };
    });
    ctx.fillStyle = color; ctx.beginPath();
    vertices.forEach((point, index) => {
      const next = vertices[(index + 1) % vertices.length];
      const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
      if (index === 0) ctx.moveTo(midpoint.x, midpoint.y); else ctx.quadraticCurveTo(point.x, point.y, midpoint.x, midpoint.y);
    });
    ctx.closePath(); ctx.fill();
  };
  if (pattern === "DIGITAL" || pattern === "URBAN CAMO") {
    const pixel = pattern === "URBAN CAMO" ? 8 : 7;
    for (let cluster = 0; cluster < 48; cluster++) {
      const color = palette[1 + Math.floor(random() * (palette.length - 1))];
      const startX = Math.floor(random() * 36) * pixel - pixel, startY = Math.floor(random() * 36) * pixel - pixel;
      let cellX = 0, cellY = 0; ctx.fillStyle = color;
      for (let cell = 0; cell < 4 + Math.floor(random() * 10); cell++) {
        ctx.fillRect(startX + cellX * pixel, startY + cellY * pixel, pixel, pixel);
        if (random() > .48) cellX += random() > .5 ? 1 : -1; else cellY += random() > .5 ? 1 : -1;
      }
    }
  } else {
    const largeCount = pattern === "MULTICAM" ? 34 : 25;
    for (let i = 0; i < largeCount; i++) organicBlob(random() * 280 - 12, random() * 280 - 12, pattern === "MULTICAM" ? 29 + random() * 28 : 35 + random() * 34, palette[1 + i % (palette.length - 1)], pattern === "MULTICAM" ? 13 : 10);
    if (pattern === "MULTICAM") {
      for (let i = 0; i < 75; i++) organicBlob(random() * 256, random() * 256, 3 + random() * 8, palette[i % 2 ? 3 : 5], 7);
    } else {
      ctx.strokeStyle = palette[3]; ctx.lineWidth = 3;
      for (let i = 0; i < 18; i++) { ctx.beginPath(); const x = random() * 256, y = random() * 256; ctx.moveTo(x - 15, y + 9); ctx.quadraticCurveTo(x, y - 8, x + 18, y + 4); ctx.stroke(); }
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping; texture.repeat.set(1.55, 2.15);
  texture.anisotropy = 4; texture.magFilter = pattern === "DIGITAL" || pattern === "URBAN CAMO" ? THREE.NearestFilter : THREE.LinearFilter; return texture;
};

const magazineCapacity = (capacity: number, magazine: MagazineAttachment) =>
  magazine === "DRUM MAG" ? capacity * 2 : magazine === "EXTENDED MAG" ? Math.ceil(capacity * 1.35) : capacity;

const magazineReloadMultiplier = (magazine: MagazineAttachment) =>
  magazine === "DRUM MAG" ? 1.35 : magazine === "EXTENDED MAG" ? 1.15 : 1;

const reloadTimeWithMagazine = (seconds: number, magazine: MagazineAttachment) =>
  seconds * magazineReloadMultiplier(magazine);

const CLASS_STATS: Record<PlayerClass, { unlockKills: number; role: string; buffs: string[]; debuffs: string[]; damage: number; speed: number; healthBonus: number; reload: number; spread: number; healing: number; healTime: number }> = {
  RECRUIT: { unlockKills: 0, role: "BALANCED STARTER", buffs: ["NO SPECIALIZATION"], debuffs: ["NO CLASS BONUSES"], damage: 1, speed: 1, healthBonus: 0, reload: 1, spread: 1, healing: 1, healTime: 1 },
  ASSAULT: { unlockKills: 25, role: "FRONTLINE ATTACKER", buffs: ["+10% WEAPON DAMAGE", "+8% RELOAD SPEED"], debuffs: ["+12% WEAPON SPREAD"], damage: 1.1, speed: 1, healthBonus: 0, reload: .92, spread: 1.12, healing: 1, healTime: 1 },
  SCOUT: { unlockKills: 75, role: "FAST RECON", buffs: ["+15% MOVEMENT SPEED", "−12% WEAPON SPREAD"], debuffs: ["−15 MAX HEALTH", "−5% WEAPON DAMAGE"], damage: .95, speed: 1.15, healthBonus: -15, reload: 1, spread: .88, healing: 1, healTime: 1 },
  MEDIC: { unlockKills: 150, role: "COMBAT SUPPORT", buffs: ["+35% HEALING", "25% FASTER HEAL USE"], debuffs: ["−10% WEAPON DAMAGE"], damage: .9, speed: 1, healthBonus: 0, reload: 1, spread: 1, healing: 1.35, healTime: .75 },
  HEAVY: { unlockKills: 300, role: "ARMORED ANCHOR", buffs: ["+25 MAX HEALTH", "+5% WEAPON DAMAGE"], debuffs: ["−18% MOVEMENT SPEED", "20% SLOWER RELOAD"], damage: 1.05, speed: .82, healthBonus: 25, reload: 1.2, spread: 1, healing: 1, healTime: 1 },
  MORTAR: { unlockKills: 450, role: "INDIRECT FIRE", buffs: ["SLOT 5: AIMABLE MORTAR", "HIGH SPLASH DAMAGE"], debuffs: ["−12% MOVEMENT SPEED", "LONG ABILITY COOLDOWN"], damage: 1, speed: .88, healthBonus: 0, reload: 1, spread: 1, healing: 1, healTime: 1 },
  AIRSTRIKE: { unlockKills: 650, role: "AIR SUPPORT", buffs: ["SLOT 5: AIRSTRIKE TABLET", "MULTIPLE STRIKE IMPACTS"], debuffs: ["−10 MAX HEALTH", "LONG ABILITY COOLDOWN"], damage: 1, speed: 1, healthBonus: -10, reload: 1, spread: 1, healing: 1, healTime: 1 },
  DEMOLITION: { unlockKills: 850, role: "ANTI-ARMOR", buffs: ["SLOT 5: ROCKET LAUNCHER", "HEAVY EXPLOSIVE DAMAGE"], debuffs: ["−15% MOVEMENT SPEED", "+10% WEAPON SPREAD"], damage: 1, speed: .85, healthBonus: 0, reload: 1, spread: 1.1, healing: 1, healTime: 1 },
  ENGINEER: { unlockKills: 1100, role: "AREA DEFENSE", buffs: ["SLOT 5: BUILD SENTRY", "AUTOMATIC TARGETING"], debuffs: ["−8% WEAPON DAMAGE", "ONE SENTRY AT A TIME"], damage: .92, speed: 1, healthBonus: 0, reload: 1, spread: 1, healing: 1, healTime: 1 },
  DRONE: { unlockKills: 1400, role: "REMOTE ATTACK", buffs: ["SLOT 5: ARMED DRONE", "REMOTE AERIAL FIRE"], debuffs: ["−15 MAX HEALTH", "BODY IS EXPOSED"], damage: 1, speed: 1, healthBonus: -15, reload: 1, spread: 1, healing: 1, healTime: 1 },
};

const CLASS_ITEMS: Partial<Record<PlayerClass, string>> = { MORTAR: "MORTAR SYSTEM", AIRSTRIKE: "AIRSTRIKE TABLET", DEMOLITION: "ROCKET LAUNCHER", ENGINEER: "SENTRY KIT", DRONE: "ATTACK DRONE" };

const WEAPON_STATS: Record<string, { damage: number; fireRate: number; capacity: number; reload: number; range: number; mobility: number; spread: number; pellets?: number }> = {
  "VXR-4 CARBINE": { damage: 11, fireRate: 58, capacity: 30, reload: 2.7, range: 60, mobility: 60, spread: 2.1 },
  "M12 SMG": { damage: 12, fireRate: 91, capacity: 36, reload: 1.85, range: 48, mobility: 90, spread: 2.1 },
  "BR-7 RIFLE": { damage: 29, fireRate: 43, capacity: 20, reload: 2.8, range: 94, mobility: 51, spread: 0.65 },
  "SNR-90 SNIPER": { damage: 50, fireRate: 10, capacity: 1, reload: 3.4, range: 100, mobility: 34, spread: 0.12 },
  "KSG-12 SHOTGUN": { damage: 9, fireRate: 22, capacity: 8, reload: 4.1, range: 30, mobility: 58, spread: 5.8, pellets: 8 },
  "HMG-6 LMG": { damage: 19, fireRate: 66, capacity: 60, reload: 5.2, range: 78, mobility: 27, spread: 1.75 },
  "AKR-47 ASSAULT": { damage: 22, fireRate: 61, capacity: 30, reload: 2.65, range: 76, mobility: 61, spread: 1.6 },
  "M8 TACTICAL RIFLE": { damage: 17.5, fireRate: 78, capacity: 27, reload: 2.25, range: 72, mobility: 70, spread: 1.05 },
  "DMR-11 MARKSMAN": { damage: 33.5, fireRate: 34, capacity: 12, reload: 2.9, range: 96, mobility: 45, spread: 0.32 },
  "VX-9 PDW": { damage: 10.5, fireRate: 98, capacity: 42, reload: 2.05, range: 42, mobility: 93, spread: 2.35 },
  "P9 SIDEARM": { damage: 14, fireRate: 58, capacity: 15, reload: 1.45, range: 45, mobility: 94, spread: 1.55 },
  "R45 REVOLVER": { damage: 36, fireRate: 29, capacity: 6, reload: 3.1, range: 61, mobility: 76, spread: 0.9 },
  "G18 AUTO PISTOL": { damage: 9.5, fireRate: 95, capacity: 24, reload: 1.75, range: 35, mobility: 96, spread: 2.65 },
  "DB-2 SAWED-OFF": { damage: 11, fireRate: 18, capacity: 2, reload: 2.6, range: 20, mobility: 81, spread: 7.2, pellets: 6 },
  "M1911 SIDEARM": { damage: 22, fireRate: 46, capacity: 8, reload: 1.65, range: 48, mobility: 92, spread: 1.2 },
  "USP-45 TACTICAL": { damage: 19, fireRate: 52, capacity: 12, reload: 1.7, range: 52, mobility: 89, spread: 1.05 },
  "MP5K COMPACT": { damage: 10.5, fireRate: 88, capacity: 20, reload: 2.05, range: 34, mobility: 84, spread: 2.25 },
};
const MEDICAL_STATS: Record<string, { healing: number; duration: number }> = {
  "COMBAT BANDAGE": { healing: 25, duration: 0.8 },
  "EMERGENCY INJECTOR": { healing: 20, duration: 0.55 },
  "FIRST AID POUCH": { healing: 45, duration: 1.8 },
  "FIELD MEDKIT": { healing: 60, duration: 2.5 },
  "STIM INJECTOR": { healing: 35, duration: 1.15 },
  "BLOOD BAG": { healing: 80, duration: 3.2 },
  "TRAUMA KIT": { healing: 100, duration: 4.0 },
};

const PLAYER_HEIGHT = 1.7;
const STANCE_COLLIDERS: Record<PlayerStance, { radius: number; height: number; halfLength: number }> = {
  standing: { radius: .48, height: 1.82, halfLength: 0 },
  crouching: { radius: .44, height: 1.16, halfLength: 0 },
  // Three overlapping circles form an oriented capsule around the prone body.
  prone: { radius: .32, height: .62, halfLength: .55 },
};
const MULTIPLAYER_SERVER = "https://strikeyard-multiplayer.kaigarcia2510.workers.dev";
const HEAT_VISION_WALL_RANGE = 32;
const formatMatchTime = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function FpsGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const respawnRef = useRef<() => void>(() => {});
  const multiplayerSendRef = useRef<(packet: unknown) => void>(() => {});
  const multiplayerSocketRef = useRef<WebSocket | null>(null);
  const playerCallsignRef = useRef("OPERATOR");
  const playerSummariesRef = useRef<Record<string, NetworkPlayerSummary>>({});
  const recordedMatchesRef = useRef(new Set<string>());
  const mobileLookRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const mobileMoveRef = useRef<{ id: number; centerX: number; centerY: number } | null>(null);
  const previousHealthRef = useRef(100);
  const adminAuthorizedRef = useRef(false);
  const adminRoleRef = useRef<"owner" | "junior" | null>(null);
  const adminPanelOpenRef = useRef(false);
  const chatOpenRef = useRef(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const damageNumbersEnabledRef = useRef(true);
  const adminControlsRef = useRef({ flying: false, noclip: false, godMode: false, damageMultiplier: 1 });
  const firebaseTokenRef = useRef("");
  const adminCommandRef = useRef<(command: AdminCommand) => void>(() => {});
  const airstrikeTargetRef = useRef<(x: number, z: number) => void>(() => {});
  const droneExitRef = useRef<() => void>(() => {});
  const [locked, setLocked] = useState(false);
  const [airstrikeMapOpen, setAirstrikeMapOpen] = useState(false);
  const [dronePiloting, setDronePiloting] = useState(false);
  const [touchControls, setTouchControls] = useState(false);
  const [damageFlash, setDamageFlash] = useState(false);
  const [started, setStarted] = useState(false);
  const [ammo, setAmmo] = useState(30);
  const [fireMode, setFireMode] = useState<FireMode>("AUTO");
  const [sessionId, setSessionId] = useState(0);
  const [menuPage, setMenuPage] = useState<MenuPage>("HOME");
  const [controlsTutorialOpen, setControlsTutorialOpen] = useState(false);
  const [selectedMap, setSelectedMap] = useState<GameMap>("TEST YARD");
  const [selectedSector, setSelectedSector] = useState<GameSector>("SECTOR 1");
  const [serverBrowserOpen, setServerBrowserOpen] = useState(false);
  const [sectorPlayerCounts, setSectorPlayerCounts] = useState<Record<MultiplayerSector, number | null>>({ "SECTOR 1": null, "SECTOR 2": null, "SECTOR 3": null, "SECTOR 4": null });
  const [matchPhase, setMatchPhase] = useState<"connecting" | "voting" | "playing" | "results">("connecting");
  const [mapVotes, setMapVotes] = useState(0);
  const [cityMapVotes, setCityMapVotes] = useState(0);
  const [forestMapVotes, setForestMapVotes] = useState(0);
  const [frostMapVotes, setFrostMapVotes] = useState(0);
  const [beachMapVotes, setBeachMapVotes] = useState(0);
  const [desertMapVotes, setDesertMapVotes] = useState(0);
  const [selectedMapVote, setSelectedMapVote] = useState<Exclude<GameMap, "TEST YARD"> | null>(null);
  const [modeVotes, setModeVotes] = useState(0);
  const [ffaModeVotes, setFfaModeVotes] = useState(0);
  const [tdmModeVotes, setTdmModeVotes] = useState(0);
  const [kothModeVotes, setKothModeVotes] = useState(0);
  const [ctpModeVotes, setCtpModeVotes] = useState(0);
  const [ctfModeVotes, setCtfModeVotes] = useState(0);
  const [selectedModeVote, setSelectedModeVote] = useState<GameMode | null>(null);
  const [matchMode, setMatchMode] = useState<GameMode>("FFA");
  const [endGameVotes, setEndGameVotes] = useState(0);
  const [endGameRequested, setEndGameRequested] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [hasModeVoted, setHasModeVoted] = useState(false);
  const [matchEndsAt, setMatchEndsAt] = useState(0);
  const [matchTimeLeft, setMatchTimeLeft] = useState(0);
  const [localPlayerId, setLocalPlayerId] = useState("");
  const [accountCallsign, setAccountCallsign] = useState("OPERATOR");
  const [connectedPlayerIds, setConnectedPlayerIds] = useState<string[]>([]);
  const [playerSummaries, setPlayerSummaries] = useState<Record<string, NetworkPlayerSummary>>({});
  const [matchWinnerId, setMatchWinnerId] = useState<string | null>(null);
  const [winningKills, setWinningKills] = useState(0);
  const [winningTeam, setWinningTeam] = useState<"ALPHA" | "BRAVO" | null>(null);
  const [localTeam, setLocalTeam] = useState<"ALPHA" | "BRAVO">("ALPHA");
  const [teamScores, setTeamScores] = useState({ ALPHA: 0, BRAVO: 0 });
  const [objectiveZones, setObjectiveZones] = useState<ObjectiveZone[]>([]);
  const [flags, setFlags] = useState<FlagState[]>([]);
  const [localObjectiveScore, setLocalObjectiveScore] = useState(0);
  const [multiplayerStatus, setMultiplayerStatus] = useState<"OFFLINE" | "CONNECTING" | "ONLINE">("OFFLINE");
  const [doorPrompt, setDoorPrompt] = useState(false);
  const [primary, setPrimary] = useState("VXR-4 CARBINE");
  const [secondary, setSecondary] = useState("P9 SIDEARM");
  const [medical, setMedical] = useState("FIELD MEDKIT");
  const [utility, setUtility] = useState("FRAG GRENADE");
  const [equipment, setEquipment] = useState<PassiveEquipment>("ARMOR PLATING");
  const [playerClass, setPlayerClass] = useState<PlayerClass>("RECRUIT");
  const [careerKills, setCareerKills] = useState(0);
  const [classCooldown, setClassCooldown] = useState(0);
  const [activeSlot, setActiveSlot] = useState(1);
  const [reloading, setReloading] = useState(false);
  const [reloadDuration, setReloadDuration] = useState(0);
  const [utilityCount, setUtilityCount] = useState(2);
  const [flashed, setFlashed] = useState(false);
  const [health, setHealth] = useState(100);
  const [stamina, setStamina] = useState(100);
  const [dead, setDead] = useState(false);
  const [medicalCount, setMedicalCount] = useState(2);
  const [healingEffect, setHealingEffect] = useState(false);
  const [healing, setHealing] = useState(false);
  const [healDuration, setHealDuration] = useState(0);
  const [thirdPerson, setThirdPerson] = useState(false);
  const [adsActive, setAdsActive] = useState(false);
  const [crouching, setCrouching] = useState(false);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [damageNumbersEnabled, setDamageNumbersEnabled] = useState(() => typeof window === "undefined" || window.localStorage.getItem("strikeyard.damageNumbers") !== "false");
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([]);
  const [radarPings, setRadarPings] = useState<RadarPing[]>([]);
  const [leanSide, setLeanSide] = useState<-1 | 0 | 1>(0);
  const [prone, setProne] = useState(false);
  const [characterSkin, setCharacterSkin] = useState("#a9795e");
  const [characterUniform, setCharacterUniform] = useState("#303a3b");
  const [camoPattern, setCamoPattern] = useState<CamoPattern>("SOLID");
  const [characterArmor, setCharacterArmor] = useState("#20292b");
  const [characterHelmet, setCharacterHelmet] = useState<"TACTICAL" | "LIGHT" | "HEAVY">("TACTICAL");
  const [equippedAccessories, setEquippedAccessories] = useState<OperatorAccessory[]>(["GOGGLES", "HEADSET"]);
  const [chestRig, setChestRig] = useState<"LIGHT" | "PLATE CARRIER" | "HEAVY">("PLATE CARRIER");
  const [backpack, setBackpack] = useState<"NONE" | "ASSAULT PACK" | "RADIO PACK">("ASSAULT PACK");
  const [pantsColor, setPantsColor] = useState("#303a3b");
  const [gloveColor, setGloveColor] = useState("#20292b");
  const [bootColor, setBootColor] = useState("#151b1d");
  const [weaponSight, setWeaponSight] = useState<SightAttachment>("IRON SIGHTS");
  const [muzzleAttachment, setMuzzleAttachment] = useState<MuzzleAttachment>("STANDARD BARREL");
  const [tacticalAttachment, setTacticalAttachment] = useState<TacticalAttachment>("NONE");
  const [magazineAttachment, setMagazineAttachment] = useState<MagazineAttachment>("STANDARD MAG");
  const [fireControlAttachment, setFireControlAttachment] = useState<FireControlAttachment>("STANDARD TRIGGER");
  const [secondarySight, setSecondarySight] = useState<SightAttachment>("IRON SIGHTS");
  const [secondaryMuzzle, setSecondaryMuzzle] = useState<MuzzleAttachment>("STANDARD BARREL");
  const [secondaryTactical, setSecondaryTactical] = useState<TacticalAttachment>("NONE");
  const [secondaryMagazine, setSecondaryMagazine] = useState<MagazineAttachment>("STANDARD MAG");
  const [secondaryFireControl, setSecondaryFireControl] = useState<FireControlAttachment>("STANDARD TRIGGER");
  const [accountSaveStatus, setAccountSaveStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [adminRole, setAdminRole] = useState<"owner" | "junior" | null>(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminFlying, setAdminFlying] = useState(false);
  const [adminNoclip, setAdminNoclip] = useState(false);
  const [adminGodMode, setAdminGodMode] = useState(false);
  const [adminDamageMultiplier, setAdminDamageMultiplier] = useState(1);

  const updateAdminControls = (next: Partial<{ flying: boolean; noclip: boolean; godMode: boolean; damageMultiplier: number }>) => {
    adminControlsRef.current = { ...adminControlsRef.current, ...next };
    if (typeof next.flying === "boolean") setAdminFlying(next.flying);
    if (typeof next.noclip === "boolean") setAdminNoclip(next.noclip);
    if (typeof next.godMode === "boolean") setAdminGodMode(next.godMode);
    if (typeof next.damageMultiplier === "number") setAdminDamageMultiplier(next.damageMultiplier);
    multiplayerSendRef.current({ type: "admin_config", godMode: adminControlsRef.current.godMode, damageMultiplier: adminControlsRef.current.damageMultiplier, flying: adminControlsRef.current.flying });
  };

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) { firebaseTokenRef.current = ""; playerCallsignRef.current = "OPERATOR"; setAccountCallsign("OPERATOR"); setCareerKills(0); setPlayerClass("RECRUIT"); adminAuthorizedRef.current = false; adminRoleRef.current = null; setAdminAuthorized(false); setAdminRole(null); setAdminPanelOpen(false); setAccountSaveStatus("idle"); return; }
    try {
      const token = await user.getIdToken();
      firebaseTokenRef.current = token;
      const response = await fetch("/api/player", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Unable to load preferences");
      const data = await response.json() as { isAdmin?: boolean; adminRole?: "owner" | "junior" | null; player?: { callsign?: string; kills?: number; loadout?: Partial<SavedLoadout>; operator?: Partial<SavedOperator> } };
      playerCallsignRef.current = data.player?.callsign?.slice(0,18) || user.displayName?.slice(0,18).toUpperCase() || "OPERATOR";
      setCareerKills(data.player?.kills ?? 0);
      setAccountCallsign(playerCallsignRef.current);
      const resolvedAdminRole = data.adminRole ?? (data.isAdmin ? "owner" : null);
      adminRoleRef.current = resolvedAdminRole;
      adminAuthorizedRef.current = resolvedAdminRole !== null;
      setAdminRole(resolvedAdminRole);
      setAdminAuthorized(resolvedAdminRole !== null);
      const loadout = data.player?.loadout;
      if (loadout) {
        if (loadout.primary) setPrimary(loadout.primary); if (loadout.secondary) setSecondary(loadout.secondary);
        if (loadout.medical) setMedical(loadout.medical); if (loadout.utility) setUtility(loadout.utility);
        if (loadout.equipment) setEquipment(loadout.equipment);
        if (loadout.playerClass && CLASS_STATS[loadout.playerClass] && (data.player?.kills ?? 0) >= CLASS_STATS[loadout.playerClass].unlockKills) setPlayerClass(loadout.playerClass);
        if (loadout.weaponSight) setWeaponSight(loadout.weaponSight); if (loadout.muzzleAttachment) setMuzzleAttachment(loadout.muzzleAttachment);
        if (loadout.tacticalAttachment) setTacticalAttachment(loadout.tacticalAttachment); if (loadout.magazineAttachment) setMagazineAttachment(loadout.magazineAttachment);
        if (loadout.fireControlAttachment) setFireControlAttachment(loadout.fireControlAttachment); if (loadout.secondarySight) setSecondarySight(loadout.secondarySight);
        if (loadout.secondaryMuzzle) setSecondaryMuzzle(loadout.secondaryMuzzle); if (loadout.secondaryTactical) setSecondaryTactical(loadout.secondaryTactical);
        if (loadout.secondaryMagazine) setSecondaryMagazine(loadout.secondaryMagazine); if (loadout.secondaryFireControl) setSecondaryFireControl(loadout.secondaryFireControl);
      }
      const operator = data.player?.operator;
      if (operator) {
        if (operator.characterSkin) setCharacterSkin(operator.characterSkin); if (operator.characterUniform) setCharacterUniform(operator.characterUniform);
        if (operator.camoPattern) setCamoPattern(operator.camoPattern);
        if (operator.characterArmor) setCharacterArmor(operator.characterArmor); if (operator.characterHelmet) setCharacterHelmet(operator.characterHelmet);
        if (operator.accessories) setEquippedAccessories(operator.accessories);
        else setEquippedAccessories([operator.faceGear, operator.headAccessory].filter((item): item is OperatorAccessory => item && item !== "NONE"));
        if (operator.chestRig) setChestRig(operator.chestRig); if (operator.backpack) setBackpack(operator.backpack);
        if (operator.pantsColor) setPantsColor(operator.pantsColor); if (operator.gloveColor) setGloveColor(operator.gloveColor); if (operator.bootColor) setBootColor(operator.bootColor);
      }
      setAccountSaveStatus("saved");
    } catch { adminAuthorizedRef.current = false; adminRoleRef.current = null; setAdminAuthorized(false); setAdminRole(null); setAccountSaveStatus("error"); }
  }), []);

  useEffect(() => {
    if (!localPlayerId) return;
    const previous = playerSummariesRef.current[localPlayerId];
    if (previous?.callsign === accountCallsign) return;
    const next = { callsign: accountCallsign, kills: previous?.kills ?? 0, deaths: previous?.deaths ?? 0 };
    playerSummariesRef.current = { ...playerSummariesRef.current, [localPlayerId]: next };
    setPlayerSummaries(playerSummariesRef.current);
  }, [accountCallsign, localPlayerId]);

  useEffect(() => {
    adminPanelOpenRef.current = adminPanelOpen;
  }, [adminPanelOpen]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) window.setTimeout(() => chatInputRef.current?.focus(), 0);
  }, [chatOpen]);

  useEffect(() => {
    damageNumbersEnabledRef.current = damageNumbersEnabled;
    window.localStorage.setItem("strikeyard.damageNumbers", String(damageNumbersEnabled));
  }, [damageNumbersEnabled]);

  useEffect(() => {
    if (classCooldown <= 0) return;
    const timer = window.setInterval(() => setClassCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [classCooldown > 0]);

  useEffect(() => {
    if (health < previousHealthRef.current) {
      setDamageFlash(false);
      const start = window.setTimeout(() => setDamageFlash(true), 0);
      const stop = window.setTimeout(() => setDamageFlash(false), 480);
      previousHealthRef.current = health;
      return () => { window.clearTimeout(start); window.clearTimeout(stop); };
    }
    previousHealthRef.current = health;
  }, [health]);

  const saveAccountPreferences = async (kind: "loadout" | "operator") => {
    const user = auth.currentUser;
    if (!user) { setAccountSaveStatus("idle"); return; }
    setAccountSaveStatus("saving");
    const loadout: SavedLoadout = { primary, secondary, medical, utility, equipment, playerClass, weaponSight, muzzleAttachment, tacticalAttachment, magazineAttachment, fireControlAttachment, secondarySight, secondaryMuzzle, secondaryTactical, secondaryMagazine, secondaryFireControl };
    const savedFaceGear: SavedOperator["faceGear"] = equippedAccessories.includes("MASK") ? "MASK" : equippedAccessories.includes("GOGGLES") ? "GOGGLES" : "NONE";
    const savedHeadAccessory: SavedOperator["headAccessory"] = equippedAccessories.includes("NVG") ? "NVG" : equippedAccessories.includes("HEADSET") ? "HEADSET" : "NONE";
    const operator: SavedOperator = { characterSkin, characterUniform, camoPattern, accessories: equippedAccessories, characterArmor, characterHelmet, faceGear: savedFaceGear, headAccessory: savedHeadAccessory, chestRig, backpack, pantsColor, gloveColor, bootColor };
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/player", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(kind === "loadout" ? { loadout } : { operator }) });
      if (!response.ok) throw new Error("Save failed");
      setAccountSaveStatus("saved");
    } catch { setAccountSaveStatus("error"); }
  };

  useEffect(() => {
    const updateClock = () => setMatchTimeLeft(Math.max(0, matchEndsAt - Date.now()));
    updateClock();
    const timer = window.setInterval(updateClock, 250);
    return () => window.clearInterval(timer);
  }, [matchEndsAt]);

  useEffect(() => {
    if (!serverBrowserOpen) return;
    let active = true;
    const refreshCounts = async () => {
      try {
        const response = await fetch(`${MULTIPLAYER_SERVER}/rooms`);
        if (!response.ok) return;
        const data = await response.json() as { sectors: Record<string, number> };
        if (active) setSectorPlayerCounts({
          "SECTOR 1": data.sectors["sector-1"] ?? 0,
          "SECTOR 2": data.sectors["sector-2"] ?? 0,
          "SECTOR 3": data.sectors["sector-3"] ?? 0,
          "SECTOR 4": data.sectors["sector-4"] ?? 0,
        });
      } catch {}
    };
    void refreshCounts();
    const timer = window.setInterval(refreshCounts, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [serverBrowserOpen]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const isTouchInput = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    const mobileMove = new THREE.Vector2();
    setTouchControls(isTouchInput);
    if (isTouchInput && started) setLocked(true);

    const scene = new THREE.Scene();
    const forestMap = selectedMap === "BLACKWOOD FOREST";
    const snowyMap = selectedMap === "FROSTLINE BASE";
    const beachMap = selectedMap === "TIDEBREAK BEACH";
    const desertMap = selectedMap === "DUSTFALL DESERT";
    const terrainHeightAt = (x: number, z: number) => {
      if (snowyMap) {
        const climb = THREE.MathUtils.clamp((-z + 5) / 43, 0, 1);
        const ridge = .34 + .66 * THREE.MathUtils.clamp(1 - Math.abs(x) / 49, 0, 1);
        return Math.pow(climb, 1.12) * ridge * 13;
      }
      if (beachMap) {
        const depth=THREE.MathUtils.clamp((-z-7)/56,0,1);
        return -(depth*depth*(3-2*depth))*4;
      }
      return 0;
    };
    scene.background = new THREE.Color(snowyMap ? 0xb8cbd3 : beachMap ? 0x77c8df : desertMap ? 0xc98f55 : forestMap ? 0x18271f : 0x111b21);
    scene.fog = new THREE.Fog(snowyMap ? 0xb8cbd3 : beachMap ? 0xa8dae5 : desertMap ? 0xc79763 : forestMap ? 0x18271f : 0x111b21, snowyMap ? 24 : beachMap ? 48 : desertMap ? 34 : forestMap ? 18 : 25, snowyMap ? 92 : beachMap ? 155 : desertMap ? 108 : forestMap ? 68 : 72);

    const camera = new THREE.PerspectiveCamera(78, mount.clientWidth / mount.clientHeight, 0.05, beachMap ? 180 : 120);
    camera.position.set(0, PLAYER_HEIGHT, 15);
    const rearCamera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, beachMap ? 180 : 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(snowyMap ? 0xe9f7ff : beachMap ? 0xfff3cf : desertMap ? 0xffddb0 : forestMap ? 0xa8c5a5 : 0x9dc6d8, snowyMap ? 0x52616a : beachMap ? 0x477f88 : desertMap ? 0x765134 : forestMap ? 0x10180d : 0x162017, snowyMap ? 2.15 : beachMap ? 2.35 : desertMap ? 2.2 : forestMap ? 1.45 : 1.8));
    const sun = new THREE.DirectionalLight(0xffd6a0, 3.5);
    sun.position.set(-18, 28, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
    scene.add(sun);

    const boxes: Box[] = [];
    const placementSurfaces: THREE.Object3D[] = [];
    const material = (color: THREE.ColorRepresentation, roughness = 0.82, metalness = 0.05) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });

    const mapSize = beachMap ? 128 : selectedMap === "CITY BLOCK" || snowyMap || desertMap ? 96 : forestMap ? 88 : 64;
    const beachCenterZ=16,beachDepth=160;
    const floorGeometry = new THREE.PlaneGeometry(mapSize, beachMap ? beachDepth : mapSize, beachMap ? 80 : snowyMap ? 64 : 1, beachMap ? 100 : snowyMap ? 64 : 1);
    let snowParticles: THREE.Points | undefined;
    if (snowyMap || beachMap) {
      const positions = floorGeometry.attributes.position;
      for (let index = 0; index < positions.count; index++) positions.setZ(index, terrainHeightAt(positions.getX(index), -positions.getY(index)+(beachMap?beachCenterZ:0)));
      positions.needsUpdate = true; floorGeometry.computeVertexNormals();
    }
    const floor = new THREE.Mesh(floorGeometry, material(selectedMap === "CITY BLOCK" ? 0x252b2d : snowyMap ? 0xd8e5e8 : beachMap ? 0xd8bd79 : desertMap ? 0xc59052 : forestMap ? 0x263522 : 0x364044));
    floor.rotation.x = -Math.PI / 2;
    if(beachMap) floor.position.z=beachCenterZ;
    floor.receiveShadow = true;
    scene.add(floor);
    placementSurfaces.push(floor);

    const grid = new THREE.GridHelper(mapSize, selectedMap === "CITY BLOCK" ? 48 : 32, forestMap ? 0x33452f : 0x516166, forestMap ? 0x2b3b28 : 0x465358);
    grid.position.y = 0.008;
    if (!snowyMap && !beachMap && !desertMap) scene.add(grid);

    function addBox(x: number, y: number, z: number, w: number, h: number, d: number, color: number, collide = true) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      if (collide) { boxes.push({ minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 }); placementSurfaces.push(mesh); }
      return mesh;
    }

    const supplyDrops: { drop: THREE.Group; medical: boolean }[] = [];
    const doors: { pivot: THREE.Group; box: Box; target: number; open: boolean; swing: -1 | 1 }[] = [];

    // Shared floating resupply model used by both the training yard and live maps.
    const addSupplyDrop = (x: number, z: number, color: number, medicalDrop: boolean) => {
      const drop = new THREE.Group(); drop.position.set(x, terrainHeightAt(x,z)+.68, z); drop.scale.setScalar(.48); drop.userData.floatPhase = supplyDrops.length * 1.37; drop.userData.groundY=terrainHeightAt(x,z); scene.add(drop);
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
      supplyDrops.push({ drop, medical: medicalDrop });
      return drop;
    };
    const supplySpawnLocations: [number, number][] = selectedMap === "CITY BLOCK"
      ? [[-5, -14], [5, 14], [-5, 35], [5, -35], [-23, -14], [23, -14], [-23, 14], [23, 14], [-7, -40], [7, 40], [-40, -7], [40, 7]]
      : forestMap ? [[-31, -24], [29, -26], [-27, 21], [30, 24], [-8, -12], [12, 17], [2, -31], [-16, 32]]
      : snowyMap ? [[-35,30],[35,30],[-28,8],[28,8],[-22,-12],[22,-12],[-12,-30],[12,-30]]
      : beachMap ? [[-52,84],[52,82],[-38,70],[37,72],[-52,49],[52,48],[-37,31],[36,30],[-28,10],[27,12],[-20,-15],[22,-13],[-10,-39],[14,-42]]
      : desertMap ? [[-38,35],[38,35],[-28,16],[29,17],[-32,-8],[31,-9],[-20,-29],[21,-31]]
      : [[-25, 23], [25, 23], [-22, -18], [22, -18], [-14, 14], [14, 14]];
    const clearSupplyDrops = () => {
      supplyDrops.splice(0).forEach(({ drop }) => {
        scene.remove(drop);
        drop.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((entry) => entry.dispose()); else object.material.dispose();
        });
      });
    };
    const spawnSupplyWave = () => {
      clearSupplyDrops();
      const locations = [...supplySpawnLocations].sort(() => Math.random() - .5);
      locations.slice(0, selectedMap === "CITY BLOCK" || beachMap ? 6 : forestMap || snowyMap || desertMap ? 4 : 2).forEach(([x, z], index) => {
        const medicalDrop = index % 2 === 0;
        addSupplyDrop(x, z, medicalDrop ? 0x2c9b67 : 0x397f9e, medicalDrop);
      });
    };
    spawnSupplyWave();

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

    }

    // Human-shaped test dummies with separate head and body hit zones.
    const dummies: THREE.Group[] = [];
    const localFaceGear = equippedAccessories.includes("MASK") ? "MASK" : equippedAccessories.includes("GOGGLES") ? "GOGGLES" : "NONE";
    const localHeadAccessory = equippedAccessories.includes("NVG") ? "NVG" : equippedAccessories.includes("HEADSET") ? "HEADSET" : "NONE";
    const localAppearance: PlayerAppearance = { skin: characterSkin, uniform: characterUniform, camo: camoPattern, accessories: equippedAccessories, armor: characterArmor, helmet: characterHelmet, faceGear: localFaceGear, headAccessory: localHeadAccessory, chestRig, backpack, pants: pantsColor, gloves: gloveColor, boots: bootColor };
    const addDummy = (x: number, z: number, color: number, movement: "static" | "walk" | "sprint" = "static", targetable = true, appearance: PlayerAppearance = localAppearance) => {
      const dummy = new THREE.Group(); dummy.position.set(x, 0, z);
      dummy.userData.health = 150; dummy.userData.maxHealth = 150;
      dummy.userData.movement = movement; dummy.userData.laneOrigin = z;
      dummy.userData.rig = [] as { kind: "arm" | "leg"; side: number; upper: THREE.Mesh; lower: THREE.Mesh; joint?: THREE.Mesh; end: THREE.Mesh }[];
      const dummyMat = material(targetable ? color : new THREE.Color(appearance.skin), 0.55, 0.15);
      const armorMat = material(targetable ? 0x20292b : new THREE.Color(appearance.armor), 0.7, 0.28);
      const uniformCamo = !targetable ? createCamoTexture(appearance.camo, appearance.uniform) : null;
      const pantsCamo = !targetable ? createCamoTexture(appearance.camo, appearance.pants) : null;
      const fabricMat = new THREE.MeshStandardMaterial({ color: uniformCamo ? 0xffffff : targetable ? 0x303a3b : appearance.uniform, map: uniformCamo, roughness: .92, metalness: .02 });
      const pantsMat = new THREE.MeshStandardMaterial({ color: pantsCamo ? 0xffffff : targetable ? 0x303a3b : appearance.pants, map: pantsCamo, roughness: .92, metalness: .02 });
      const gloveMat = material(targetable ? 0x20292b : new THREE.Color(appearance.gloves), 0.72, 0.18);
      const bootMat = material(targetable ? 0x171d1f : new THREE.Color(appearance.boots), 0.8, 0.12);
      const darkMat = material(0x111719, .62, .38);
      const visorMat = new THREE.MeshStandardMaterial({ color: 0x76b9c7, emissive: 0x173b43, emissiveIntensity: 0.8, metalness: 0.65, roughness: 0.18 });
      const nvgLensMat = new THREE.MeshStandardMaterial({ color: 0x18221d, emissive: 0x4f8b62, emissiveIntensity: .65, metalness: .45, roughness: .16 });
      const addLimb = (geometry: THREE.BufferGeometry, px: number, py: number, pz: number, multiplier = 1, partMaterial: THREE.Material = dummyMat) => {
        const mesh = new THREE.Mesh(geometry, partMaterial); mesh.position.set(px, py, pz); mesh.castShadow = true;
        if (targetable) { mesh.userData.dummy = dummy; mesh.userData.damageMultiplier = multiplier; }
        else mesh.raycast = () => {};
        dummy.add(mesh); return mesh;
      };
      // Torso, plate carrier, pouches, belt and backpack.
      addLimb(new THREE.BoxGeometry(0.6, 0.78, 0.3), 0, 1.38, 0, 1, fabricMat);
      const chestWidth = !targetable && appearance.chestRig === "LIGHT" ? .56 : !targetable && appearance.chestRig === "HEAVY" ? .74 : .66;
      const chestDepth = !targetable && appearance.chestRig === "LIGHT" ? .11 : !targetable && appearance.chestRig === "HEAVY" ? .23 : .16;
      addLimb(new THREE.BoxGeometry(chestWidth, 0.56, chestDepth), 0, 1.48, -0.19, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.17, 0.14, 0.12), -0.2, 1.18, -0.25, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.17, 0.14, 0.12), 0, 1.18, -0.25, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.17, 0.14, 0.12), 0.2, 1.18, -0.25, 1, armorMat);
      addLimb(new THREE.BoxGeometry(0.56, 0.1, 0.34), 0, 0.98, 0, 1, armorMat);
      if (targetable || appearance.backpack !== "NONE") {
        const radioPack = !targetable && appearance.backpack === "RADIO PACK";
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
      const helmetScale = !targetable && appearance.helmet === "LIGHT" ? 0.92 : !targetable && appearance.helmet === "HEAVY" ? 1.1 : 1;
      const helmet = addHeadLimb(new THREE.SphereGeometry(0.265, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.54), 0, .34, .01, 2, armorMat);
      helmet.scale.set(helmetScale, !targetable && appearance.helmet === "HEAVY" ? 1.08 : 1, helmetScale);
      if (targetable || appearance.accessories.includes("GOGGLES")) {
        addHeadLimb(new THREE.BoxGeometry(.38, .115, .035), 0, .26, -.225, 2, darkMat);
        [-.1, .1].forEach((side) => addHeadLimb(new THREE.BoxGeometry(.16, .075, .018), side, .26, -.248, 2, visorMat));
      }
      if (!targetable && appearance.accessories.includes("MASK")) {
        const mask = addHeadLimb(new THREE.SphereGeometry(.244, 16, 10, 0, Math.PI * 2, Math.PI * .28, Math.PI * .54), 0, .24, 0, 2, fabricMat);
        mask.scale.set(1.02, 1.02, 1.05);
        addHeadLimb(new THREE.BoxGeometry(.3, .2, .045), 0, .15, -.235, 2, fabricMat);
        [-1, 1].forEach((side) => { const strap = addHeadLimb(new THREE.BoxGeometry(.025, .16, .37), side * .19, .2, -.02, 2, darkMat); strap.rotation.z = side * .08; });
      }
      if (targetable || appearance.accessories.includes("HEADSET")) {
        [-1, 1].forEach((side) => addHeadLimb(new THREE.BoxGeometry(.065, .18, .11), side * .255, .25, 0, 2, darkMat));
        const band = addHeadLimb(new THREE.TorusGeometry(.265, .018, 7, 18, Math.PI), 0, .32, 0, 2, darkMat); band.rotation.z = Math.PI;
        const mic = addHeadLimb(new THREE.CylinderGeometry(.012, .012, .24, 7), -.28, .16, -.08, 2, darkMat); mic.rotation.x = -.7;
        addHeadLimb(new THREE.SphereGeometry(.025, 8, 6), -.28, .08, -.16, 2, darkMat);
      }
      if (!targetable && appearance.accessories.includes("NVG")) {
        addHeadLimb(new THREE.BoxGeometry(.22, .075, .055), 0, .38, -.245, 2, armorMat);
        const hinge = addHeadLimb(new THREE.CylinderGeometry(.035, .035, .16, 10), 0, .34, -.29, 2, darkMat); hinge.rotation.z = Math.PI / 2;
        addHeadLimb(new THREE.BoxGeometry(.27, .055, .09), 0, .29, -.33, 2, darkMat);
        [-.115, .115].forEach((side) => {
          const tube = addHeadLimb(new THREE.CylinderGeometry(.052, .065, .2, 12), side, .27, -.405, 2, darkMat); tube.rotation.x = Math.PI / 2;
          const lens = addHeadLimb(new THREE.CylinderGeometry(.043, .043, .012, 12), side, .27, -.51, 2, nvgLensMat); lens.rotation.x = Math.PI / 2;
        });
      }
      // Segmented arms, shoulder armor and gloves.
      [-1, 1].forEach((side) => {
        if (targetable || appearance.chestRig !== "LIGHT") addLimb(new THREE.SphereGeometry(0.17, 10, 8), side * 0.43, 1.65, 0, 1, armorMat);
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
      if (equipment === "HEAT VISION GOGGLES") dummy.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
        object.material.emissive.set(targetable ? 0xff351f : 0xff8a36);
        object.material.emissiveIntensity = targetable ? 2.2 : 1.65;
        object.material.depthWrite = false;
        (dummy.userData.thermalMaterials ??= []).push(object.material);
      });
      scene.add(dummy); if (targetable) dummies.push(dummy); return dummy;
    };
    const namedDummy = (dummy: THREE.Group, callsign: string) => { dummy.userData.callsign = callsign; return dummy; };
    if (selectedMap === "TEST YARD") {
      namedDummy(addDummy(-7, -14, 0x4d7182), "TARGET ALPHA"); namedDummy(addDummy(0, -14, 0x706347), "TARGET BRAVO"); namedDummy(addDummy(7, -14, 0x754b4b), "TARGET CHARLIE");
      namedDummy(addDummy(15, -15, 0x38785d, "walk"), "WALKER ONE"); namedDummy(addDummy(26, -15, 0x804f32, "sprint"), "RUNNER ONE");
    }
    const spawnZ = beachMap ? 86 : selectedMap === "CITY BLOCK" || desertMap ? 38 : forestMap || snowyMap ? 36 : 15;
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
        const box: Box = { minX: x - width / 2, maxX: x + width / 2, minY: 0, maxY: 2.7, minZ: z - .18, maxZ: z + .18, active: true };
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
          // Overhead geometry must stay visual-only because Box collisions extend upward from ground level.
          addBox(cx, doorHeight + (h - doorHeight) / 2, wallZ, doorWidth, h - doorHeight, wall, color, false);
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
      // Major collapse zones occupy the four empty corners between the crossing streets.
      const addMajorCollapse = (cx: number, cz: number, xSide: -1 | 1, zSide: -1 | 1) => {
        const concrete = xSide === zSide ? 0x716a62 : 0x626868;
        // A broken multi-storey frame establishes that a full building once stood here.
        addBox(cx + xSide * 2.25, 3.6, cz + zSide * 1.5, .48, 7.2, 5.6, 0x55595a);
        addBox(cx - xSide * .8, 2.15, cz + zSide * 4.05, 5.6, 4.3, .45, 0x635d57);
        addBox(cx + xSide * .6, 5.25, cz + zSide * 2.35, 3.6, .34, 3.8, 0x505354, false).rotation.z = xSide * .13;
        addBox(cx - xSide * 1.45, 3.55, cz + zSide * 3.85, .42, 3.1, .5, 0x4d5152);
        // Dense central mound provides substantial cover, with slabs spilling toward the road.
        addBox(cx, .72, cz, 5.4, 1.44, 5.2, concrete);
        addBox(cx - xSide * 1.1, 1.35, cz + zSide * .8, 3.2, 1.15, 2.7, 0x5a5d5b, false).rotation.y = .31 * xSide;
        addBox(cx + xSide * .5, 1.7, cz - zSide * .6, 3.8, .42, 2.4, 0x79736b, false).rotation.set(.16 * zSide, -.24 * xSide, .11);
        for (let piece = 0; piece < 18; piece++) {
          const angle = piece * 2.17;
          const distance = 1.7 + (piece % 5) * .68;
          const chunk = addBox(cx + Math.cos(angle) * distance, .3 + (piece % 5) * .19, cz + Math.sin(angle) * distance,
            .65 + (piece % 4) * .34, .38 + (piece % 3) * .26, .55 + ((piece + 2) % 4) * .3, piece % 4 ? concrete : 0x464b4c, false);
          chunk.rotation.set((piece % 3 - 1) * .28, angle, (piece % 2 ? 1 : -1) * .22);
        }
        // Fallen structural beams point into the collapse and add readable silhouettes.
        for (let beam = 0; beam < 3; beam++) {
          const girder = addBox(cx - xSide * (2.6 - beam * .65), 1.2 + beam * .5, cz - zSide * (1.9 + beam * .55), .22, .22, 5.2, 0x493b35, false);
          girder.rotation.set(zSide * (.18 + beam * .06), xSide * (.32 + beam * .22), xSide * .08);
        }
      };
      addMajorCollapse(-14.2, -14.2, -1, -1);
      addMajorCollapse(14.2, -14.2, 1, -1);
      addMajorCollapse(-14.2, 14.2, -1, 1);
      addMajorCollapse(14.2, 14.2, 1, 1);
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

    if (forestMap) {
      // Natural perimeter: dense tree lines keep players inside while preserving the woodland silhouette.
      addBox(0, 2.5, -44, 88, 5, 1, 0x172319);
      addBox(0, 2.5, 44, 88, 5, 1, 0x172319);
      addBox(-44, 2.5, 0, 1, 5, 88, 0x172319);
      addBox(44, 2.5, 0, 1, 5, 88, 0x172319);

      const trunkMat = material(0x493629, .96, .01);
      const pineMat = material(0x24452c, .98, 0);
      const pineDarkMat = material(0x193721, .98, 0);
      const addPine = (x: number, z: number, scale = 1) => {
        // Keep every tree source—including perimeter planting—clear of the creek and its banks.
        if (Math.abs((x + 10) + z * .08) < 4.65 && Math.abs(z) < 43) return;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.34 * scale, .48 * scale, 5.6 * scale, 9), trunkMat);
        trunk.position.set(x, 2.8 * scale, z); trunk.castShadow = trunk.receiveShadow = true; scene.add(trunk);
        boxes.push({ minX: x - .45 * scale, maxX: x + .45 * scale, minY: 0, maxY: 5.6 * scale, minZ: z - .45 * scale, maxZ: z + .45 * scale });
        for (let tier = 0; tier < 3; tier++) {
          const crown = new THREE.Mesh(new THREE.ConeGeometry((2.35 - tier * .42) * scale, 3.8 * scale, 9), tier % 2 ? pineDarkMat : pineMat);
          crown.position.set(x, (5.2 + tier * 1.65) * scale, z); crown.castShadow = true; crown.raycast = () => {}; scene.add(crown);
        }
      };
      const treePositions: [number, number, number][] = [];
      for (let i = 0; i < 124; i++) {
        const x = -40 + ((i * 17.31 + (i % 7) * 2.13) % 80), z = -40 + ((i * 29.73 + (i % 5) * 3.41) % 80);
        // Preserve a winding central trail, creek crossing, spawn, and outpost clearing.
        if (Math.abs(x - Math.sin(z * .1) * 5) < 3.25 || (x > 19 && z > 17) || (Math.abs(x) < 5 && z > 31)) continue;
        // Broad size variation creates sapling clusters beneath mature canopy trees.
        const scale = i % 11 === 0 ? 1.32 : i % 5 === 0 ? .62 : .76 + (i % 8) * .07;
        treePositions.push([x, z, scale]);
      }
      treePositions.forEach(([x, z, scale]) => addPine(x, z, scale));
      [-41, 41].forEach((edge) => { for (let p = -38; p <= 38; p += 5.5) { addPine(edge, p, .72 + (Math.abs(p) % 5) * .1); addPine(p, edge, .68 + (Math.abs(p + 2) % 6) * .09); } });

      // A shallow creek and stepping-stone crossing cut across the combat lanes.
      const creek = new THREE.Mesh(new THREE.PlaneGeometry(7, 84), new THREE.MeshStandardMaterial({ color: 0x294d55, emissive: 0x0b2025, emissiveIntensity: .45, roughness: .25, metalness: .1, transparent: true, opacity: .86 }));
      creek.rotation.x = -Math.PI / 2; creek.rotation.z = -.08; creek.position.set(-10, .025, 0); creek.raycast = () => {}; scene.add(creek);
      for (let stone = -2; stone <= 2; stone++) addBox(-10 + stone * 1.35, .18, 2 + stone * .11, 1.05, .34, 1.4, stone % 2 ? 0x596057 : 0x687068, false);

      // Fallen logs and granite clusters provide low, readable cover.
      [[-19,-10,0.25],[13,-18,-0.35],[18,8,0.5],[-27,27,-0.2]].forEach(([x,z,r]) => {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(.48, .56, 6.2, 10), trunkMat); log.rotation.z = Math.PI / 2; log.rotation.y = r; log.position.set(x, .58, z); log.castShadow = true; scene.add(log);
        addBox(x, .55, z, Math.abs(Math.cos(r)) * 6 + 1, 1.1, Math.abs(Math.sin(r)) * 6 + 1, 0x493629);
      });
      [[-28,-2],[7,-26],[24,-6],[-19,17],[9,24]].forEach(([x,z], i) => {
        addBox(x, .75, z, 2.3 + (i % 2), 1.5, 2, i % 2 ? 0x596058 : 0x666b63);
        addBox(x + 1.1, .38, z + 1.2, 1.4, .76, 1.3, 0x4f554e);
      });

      // Extra cover closes the exposed lanes without blocking the main trail.
      [[-34,-17],[-31,10],[-21,-29],[-16,29],[-2,-23],[4,11],[15,-7],[20,20],[31,-25],[34,5]].forEach(([x,z], i) => {
        const width = 1.8 + (i % 3) * .55;
        addBox(x, .62, z, width, 1.24, 1.55 + (i % 2) * .5, i % 2 ? 0x565d55 : 0x656a61);
        addBox(x + (i % 2 ? -.9 : .9), .34, z + .75, 1.25, .68, 1.1, 0x484f49);
      });
      // Rough timber fighting positions provide directional cover near objectives.
      [[-25,-20,0],[6,-12,Math.PI/2],[17,29,0],[29,14,Math.PI/2],[-29,34,0]].forEach(([x,z,r]) => {
        const turned = r !== 0;
        addBox(x, .82, z, turned ? .5 : 4.4, 1.64, turned ? 4.4 : .5, 0x4b3526);
        for (let post = -1; post <= 1; post++) {
          addBox(x + (turned ? 0 : post * 1.65), .9, z + (turned ? post * 1.65 : 0), turned ? .72 : .26, 1.8, turned ? .26 : .72, 0x38271e, false);
        }
      });
      // Cut stumps add compact crouch cover around the creek approaches.
      [[-15,-15],[-6,-7],[-15,9],[-6,17],[-14,25]].forEach(([x,z], i) => {
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(.72 + i * .04, .9 + i * .04, 1.25, 10), trunkMat);
        stump.position.set(x, .625, z); stump.castShadow = stump.receiveShadow = true; scene.add(stump);
        boxes.push({ minX:x-.86, maxX:x+.86, minY:0, maxY:1.25, minZ:z-.86, maxZ:z+.86 });
      });

      // Ranger outpost landmark with an open front and a raised watch platform.
      addBox(27, 1.5, 28, 9, .3, 8, 0x553e2b, false);
      addBox(22.7, 2.2, 28, .4, 4.4, 8, 0x60442e); addBox(31.3, 2.2, 28, .4, 4.4, 8, 0x60442e);
      addBox(27, 2.2, 31.8, 9, 4.4, .4, 0x60442e);
      addBox(27, 4.55, 28, 9.8, .42, 8.8, 0x30271f, false);
      addBox(27, .65, 26.3, 3.2, 1.3, .9, 0x3d4a33);
      addBox(35, 2.5, 33, 3.8, .3, 3.8, 0x58422f, false);
      addBox(33.35, 1.25, 31.35, .28, 2.5, .28, 0x463326); addBox(36.65, 1.25, 31.35, .28, 2.5, .28, 0x463326);
      addBox(33.35, 1.25, 34.65, .28, 2.5, .28, 0x463326); addBox(36.65, 1.25, 34.65, .28, 2.5, .28, 0x463326);
      const campLight = new THREE.PointLight(0xffb45c, 18, 13, 2); campLight.position.set(27, 3.2, 28); scene.add(campLight);
    }

    if (snowyMap) {
      // Snowbanks define the playable base while the northern terrain rises into a climbable summit.
      addBox(0, 3, 47.5, 96, 6, 1, 0xa9bdc5); addBox(-47.5, 4.5, 0, 1, 9, 96, 0x8298a2); addBox(47.5, 4.5, 0, 1, 9, 96, 0x8298a2);
      // A high, jagged back ridge closes the summit view so the mountain continues into solid terrain.
      addBox(0,11,-47.5,96,22,1.6,0x667b85);
      for(let ridge=0;ridge<9;ridge++){
        const x=-42+ridge*10.5, height=14+((ridge*7)%9); addBox(x,height/2,-46.55,10.8,height,1.1,ridge%2?0x738791:0x607580,false);
        addBox(x,height+.22,-46.4,11,.44,1.35,0xd7e5e8,false);
      }
      [[-31,25,13],[0,31,16],[33,23,12]].forEach(([x,height,radius])=>{const distantPeak=new THREE.Mesh(new THREE.ConeGeometry(radius,height,7),material(0x8498a1,.95,0)); distantPeak.position.set(x,8+height/2,-67); distantPeak.raycast=()=>{}; scene.add(distantPeak); const cap=new THREE.Mesh(new THREE.ConeGeometry(radius*.48,height*.42,7),material(0xe1eaec,.98,0)); cap.position.set(x,8+height*.79,-67); cap.raycast=()=>{}; scene.add(cap);});
      const alpineRock = (x:number,z:number,w:number,h:number,d:number,color=0x71828a) => {
        const ground=terrainHeightAt(x,z), group=new THREE.Group(); group.position.set(x,ground,z); scene.add(group);
        const rockMat=material(color,.94,.03);
        const core=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),rockMat); core.scale.set(w*.5,h*.52,d*.5); core.position.y=h*.48; core.rotation.set((x+z)*.017,(x-z)*.041,.08*((Math.abs(x)%3)-1)); core.castShadow=core.receiveShadow=true; group.add(core);
        const shoulder=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),rockMat); shoulder.scale.set(w*.28,h*.34,d*.34); shoulder.position.set(w*.28,h*.3,-d*.12); shoulder.rotation.set(.2,-.45,.15); shoulder.castShadow=shoulder.receiveShadow=true; group.add(shoulder);
        boxes.push({minX:x-w*.48,maxX:x+w*.48,minY:ground,maxY:ground+h,minZ:z-d*.48,maxZ:z+d*.48});
        return group;
      };
      // Base camp: two open shelters, cargo, and defensive barriers.
      [[-28,31],[28,31]].forEach(([x,z], index) => {
        const y = terrainHeightAt(x,z);
        addBox(x,y+.12,z,13,.24,10,0x798b91,false); addBox(x-6.3,y+2.2,z,.4,4.4,10,0x60747c); addBox(x+6.3,y+2.2,z,.4,4.4,10,0x60747c); addBox(x,y+4.3,z,13.2,.35,10.2,0x52656d,false);
        addBox(x,y+.7,z-2.5,3.4,1.4,1.7,index ? 0x496c75 : 0x6d604c); addBox(x+3.6,y+.52,z+2.3,2.4,1.04,1.4,0x52636a);
      });
      [[-12,25],[0,22],[12,25],[-34,18],[34,18]].forEach(([x,z],i) => alpineRock(x,z,4.5,.9,1.1,i%2?0xaab8bb:0x87979c));
      // Layered base defenses break up the long approach without enclosing the spawn lane.
      [[-19,35,5.5],[-10,29,4.5],[11,30,4.5],[20,35,5.5],[-31,25,4.8],[31,25,4.8]].forEach(([x,z,w],i)=>{
        const y=terrainHeightAt(x,z); addBox(x,y+.7,z,w,1.4,.8,i%2?0x65757a:0x777465);
        addBox(x-w*.32,y+1.05,z-.15,.28,2.1,1.05,0x4a5151,false); addBox(x+w*.32,y+1.05,z-.15,.28,2.1,1.05,0x4a5151,false);
      });
      [[-23,29],[24,28],[-35,32],[35,34],[-15,20],[17,20]].forEach(([x,z],i)=>{
        const y=terrainHeightAt(x,z); addBox(x,y+.65,z,2.5,1.3,2.2,i%2?0x52646a:0x5f665d); addBox(x+(i%2?.7:-.7),y+1.65,z+.3,1.15,.7,1.1,0x46565c);
      });

      // Alpine boulders and ice outcrops create cover along multiple ascent routes.
      [[-38,5,4,2.4,3],[-24,9,5,2.8,3.5],[-8,5,3.5,2.1,3],[11,8,5,3.2,3.5],[30,4,4.2,2.5,3],[-32,-9,5,3.3,4],[-15,-11,4,2.7,3],[5,-9,5.5,3.4,4],[25,-12,4.5,2.8,3.5],[-27,-25,5,3.2,4],[-6,-24,4.2,2.6,3],[18,-27,5.4,3.5,4]].forEach(([x,z,w,h,d],i) => alpineRock(x,z,w,h,d,i%3===0?0x687d88:0x7f9199));
      // Dense rock shelves frame the outer slopes and create additional leapfrog cover.
      [[-43,18,5.8,3.7,4.4],[-39,10,3.8,2.2,3.1],[-42,-13,6.2,4.1,4.8],[-38,-29,5.1,3.4,4.2],[-30,-38,6.4,4.5,4.6],[42,20,5.5,3.5,4.1],[39,11,3.7,2.4,3],[43,-11,6,4,4.5],[39,-29,5.3,3.6,4.2],[30,-39,6.2,4.3,4.8]].forEach(([x,z,w,h,d],i)=>alpineRock(x,z,w,h,d,i%2?0x596f79:0x72868e));
      // Mid-sized clusters form natural pockets without obstructing the marked climbing route.
      [[-29,25,3.2,1.9,2.7],[-21,17,2.7,1.6,2.4],[24,20,3.5,2.1,2.8],[32,13,2.8,1.7,2.5],[-37,-1,3,1.8,2.6],[-22,-1,2.5,1.5,2.2],[22,-5,2.9,1.8,2.5],[34,-18,3.3,2,2.8],[-18,-19,2.8,1.7,2.5],[11,-20,3.1,1.9,2.7],[-20,-34,3.6,2.2,3],[25,-33,3.4,2.1,2.9]].forEach(([x,z,w,h,d],i)=>{
        alpineRock(x,z,w,h,d,i%3===1?0x8a9ba1:0x697e87);
        const side=i%2===0?1:-1; alpineRock(x+side*w*.55,z+d*.42,w*.48,h*.58,d*.52,0x627780);
      });
      // Low rock chains add texture and partial cover near the base camp flanks.
      [[-42,36],[-38,32],[-19,29],[18,29],[38,34],[43,29]].forEach(([x,z],i)=>{
        for(let stone=0;stone<3;stone++) alpineRock(x+(stone-1)*1.55,z+(stone%2)*.7,1.8+stone*.35,.75+(stone%2)*.35,1.5+(stone%3)*.28,i%2?0x85969b:0x70848c);
      });
      // Small fractured stones and translucent ice shards break up the snow surface.
      for(let shard=0;shard<28;shard++){
        const x=-40+((shard*17.7)%80),z=30-((shard*13.9)%67),ground=terrainHeightAt(x,z);
        const chip=new THREE.Mesh(new THREE.DodecahedronGeometry(.32+(shard%4)*.11,0),material(shard%5===0?0x9ec6d1:0x82949b,.82,shard%5===0?.18:.03)); chip.position.set(x,ground+.18,z); chip.scale.y=.45+(shard%3)*.18; chip.rotation.set(shard*.31,shard*.77,shard*.19); chip.castShadow=true; chip.raycast=()=>{}; scene.add(chip);
      }
      // Switchback barricades provide firing positions without sealing the climb.
      [[-28,14,7],[18,2,8],[-20,-8,7],[21,-18,8],[-10,-29,7]].forEach(([x,z,w],i) => {
        const y=terrainHeightAt(x,z); addBox(x,y+.72,z,w,1.44,.55,i%2?0x5c6e73:0x6c6658);
        for(let post=-1;post<=1;post++) addBox(x+post*(w/2-.45),y+.9,z,.26,1.8,.72,0x4c5353,false);
      });
      // Marked climbing route with rope lines, reflective stakes, and warning lamps.
      const route:[number,number][]=[[-6,33],[-16,22],[-7,10],[12,0],[2,-12],[17,-23],[6,-34]];
      [-1,1].forEach((side)=>{
        const ropePoints:THREE.Vector3[]=[];
        route.forEach(([x,z],index)=>{const px=x+side*4.2,ground=terrainHeightAt(px,z); addBox(px,ground+.8,z,.16,1.6,.16,0x39494f,false); const reflector=new THREE.Mesh(new THREE.BoxGeometry(.22,.16,.06),new THREE.MeshBasicMaterial({color:index%2?0xff6c42:0x73dfff})); reflector.position.set(px,ground+1.35,z); reflector.raycast=()=>{}; scene.add(reflector); ropePoints.push(new THREE.Vector3(px,ground+1.12,z)); if(index===2||index===5){const lamp=new THREE.PointLight(0xff9a54,13,9,2); lamp.position.set(px,ground+1.7,z); scene.add(lamp);}});
        const rope=new THREE.Line(new THREE.BufferGeometry().setFromPoints(ropePoints),new THREE.LineBasicMaterial({color:0x4a5557})); rope.raycast=()=>{}; scene.add(rope);
      });
      // Dense, varied alpine pines frame the routes while preserving the central ascent corridor.
      const alpineTrunk=material(0x4b4036,.95,.01), alpineNeedles=material(0x35545a,.98,0);
      [[-44,39,.7],[-40,34,.88],[-35,38,.62],[-42,27,1.02],[-35,22,.76],[-28,19,.68],[-43,13,.96],[-36,8,.64],[-40,-1,.8],[-34,-8,.72],[-42,-18,.9],[-35,-24,.66],[-40,-34,.78],[-31,-37,.65],[-24,-31,.72],[44,38,.76],[39,33,.92],[34,38,.64],[43,26,1.04],[36,21,.72],[29,18,.66],[44,12,.98],[36,7,.7],[41,-2,.82],[34,-10,.68],[43,-18,.92],[36,-25,.7],[41,-34,.8],[30,-37,.72],[23,-31,.68],[-22,28,.58],[22,25,.62],[-27,12,.7],[27,10,.68],[-25,-14,.62],[27,-16,.66],[-16,-31,.58],[16,-34,.62]].forEach(([x,z,s]) => {
        const ground=terrainHeightAt(x,z); const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.28*s,.4*s,4.5*s,8),alpineTrunk); trunk.position.set(x,ground+2.25*s,z); trunk.castShadow=true; scene.add(trunk); boxes.push({minX:x-.38*s,maxX:x+.38*s,minY:ground,maxY:ground+4.5*s,minZ:z-.38*s,maxZ:z+.38*s});
        for(let tier=0;tier<3;tier++){const crown=new THREE.Mesh(new THREE.ConeGeometry((1.8-tier*.3)*s,3*s,8),alpineNeedles); crown.position.set(x,ground+(4.2+tier*1.25)*s,z); crown.castShadow=true; crown.raycast=()=>{}; scene.add(crown);}
      });
      // Summit communications station rewards the climb with hard cover and a clear landmark.
      const summitY=terrainHeightAt(0,-40);
      addBox(0,summitY+.15,-40,14,.3,9,0x88999d,false); addBox(-6.6,summitY+1.5,-40,.4,3,9,0x65787e); addBox(6.6,summitY+1.5,-40,.4,3,9,0x65787e); addBox(0,summitY+1.5,-44.3,13.5,3,.4,0x65787e);
      const mast=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,8,10),material(0x4d5a5f,.45,.7)); mast.position.set(0,summitY+6,-40); mast.castShadow=true; scene.add(mast);
      const dish=new THREE.Mesh(new THREE.SphereGeometry(1.5,18,10,0,Math.PI*2,0,Math.PI*.42),material(0xd5e2e4,.35,.45)); dish.scale.z=.35; dish.rotation.x=.55; dish.position.set(0,summitY+9.4,-40); scene.add(dish);
      // Solar panels, equipment cases, and cable reels make the summit feel operational.
      [-1,1].forEach((side)=>{const panel=new THREE.Mesh(new THREE.BoxGeometry(3.2,.12,1.8),material(0x284b61,.24,.55)); panel.position.set(side*4.2,summitY+1.15,-37.4); panel.rotation.x=-.42; panel.castShadow=true; scene.add(panel); addBox(side*4.2,summitY+.55,-37.4,.18,1.1,.18,0x46575c,false);});
      addBox(-3.8,summitY+.45,-42.1,1.8,.9,1.1,0x4b5e64); addBox(3.8,summitY+.45,-42.1,1.8,.9,1.1,0x68705f);
      const reel=new THREE.Mesh(new THREE.TorusGeometry(.62,.13,10,20),material(0x3d494d,.55,.45)); reel.position.set(0,summitY+.72,-43); reel.rotation.y=Math.PI/2; reel.castShadow=true; scene.add(reel);
      const summitBeacon=new THREE.PointLight(0x77dfff,22,18,2); summitBeacon.position.set(0,summitY+8,-40); scene.add(summitBeacon);
      const flakes=new Float32Array(700*3); for(let i=0;i<700;i++){flakes[i*3]=-48+Math.random()*96; flakes[i*3+1]=3+Math.random()*28; flakes[i*3+2]=-48+Math.random()*96;}
      const snowGeometry=new THREE.BufferGeometry(); snowGeometry.setAttribute("position",new THREE.BufferAttribute(flakes,3)); snowParticles=new THREE.Points(snowGeometry,new THREE.PointsMaterial({color:0xffffff,size:.1,transparent:true,opacity:.8,depthWrite:false})); snowParticles.raycast=()=>{}; scene.add(snowParticles);
    }

    if (beachMap) {
      // The surf closes the northern edge while dunes and sea walls frame the combat space.
      addBox(0,2.5,95.5,128,5,1,0x8e805f); addBox(-63.5,0,16,1,10,160,0x7d7358); addBox(63.5,0,16,1,10,160,0x7d7358);
      addBox(0,-.04,-35.75,127,.08,55.5,0x269bb5,false); addBox(0,0,-8.7,127,.06,2.8,0x68c6cf,false);
      for(let wave=0;wave<8;wave++) addBox(-56+wave*16,.035,-8.7+(wave%2)*.3,8,.035,.42,0xe7fbf5,false);
      addBox(0,-1.5,-63.5,128,6,1.2,0x426f77);

      // Sandbag lines, driftwood barricades, and cargo give the open beach layered cover.
      [[-50,85,8],[-26,88,7],[0,84,9],[27,88,7],[51,84,8],[-55,70,7],[-34,72,8],[0,68,9],[35,73,8],[55,69,7],[-48,51,8],[-24,53,7],[0,49,9],[25,54,7],[49,50,8],[-51,34,7],[-31,31,7],[0,29,8],[31,32,7],[51,35,7],[-23,15,6],[20,16,7],[-49,13,7],[49,14,7],[-11,-2,6],[13,-6,6],[-27,-10,7],[28,-11,7]].forEach(([x,z,w],i)=>{
        addBox(x,.52,z,w,1.04,1.05,i%2?0x9b8b63:0xaa9468);
        addBox(x-w*.28,.9,z,.24,1.8,1.2,0x69543a,false); addBox(x+w*.28,.9,z,.24,1.8,1.2,0x69543a,false);
      });
      [[-56,88],[55,87],[-42,78],[42,79],[-18,86],[19,84],[-55,45],[54,44],[-42,54],[41,52],[-38,24],[37,22],[-18,28],[18,27],[-53,5],[52,6],[-35,3],[34,4],[-18,-9],[18,-10]].forEach(([x,z],i)=>{
        addBox(x,.65,z,2.8,1.3,2.3,i%3===0?0x3f6870:0x6f765e); addBox(x+(i%2?.7:-.7),1.62,z+.15,1.25,.65,1.15,0x59634f);
      });

      // Beach huts and a lifeguard tower create recognizable strongpoints.
      [[-34,11],[34,10]].forEach(([x,z],i)=>{
        addBox(x,.18,z,11,.36,8,0x8e714d,false); addBox(x-5.2,2.25,z,.35,4.5,8,0x765538); addBox(x+5.2,2.25,z,.35,4.5,8,0x765538); addBox(x,4.45,z,11,.35,8.4,i?0x4f7779:0xa95b45,false); addBox(x,2.2,z+3.8,10.5,4.4,.35,0x8a6845);
      });
      addBox(0,2.1,9,7,.35,6,0x8b6d47,false); [-3,3].forEach(x=>[-2.5,2.5].forEach(z=>addBox(x,1.05,9+z,.3,2.1,.3,0x72583b)));
      addBox(0,3.3,9,7.5,2.2,.35,0xe9d8a5); addBox(0,4.55,9,8,.3,6.5,0xd95d43,false);

      // A broken pier and grounded patrol boat make the shoreline tactically useful.
      [-5,5].forEach(x=>{for(let z=-10;z>=-45;z-=4)addBox(x,-.25,z,.35,3.1,.35,0x604936);});
      for(let z=-10;z>=-45;z-=2)addBox(0,1.25,z,11,.28,1.7,0x76583c,false);
      const dockRamp=new THREE.Mesh(new THREE.BoxGeometry(9.4,.28,6),material(0x806043)); dockRamp.position.set(0,.7,-7.2); dockRamp.rotation.x=.23; dockRamp.castShadow=dockRamp.receiveShadow=true; dockRamp.raycast=()=>{}; scene.add(dockRamp);
      [-4.25,4.25].forEach(x=>{addBox(x,.95,-7.2,.18,1.9,6.1,0x604936,false); addBox(x,1.78,-7.2,.16,.16,6.2,0xa48056,false);});
      const hull=new THREE.Mesh(new THREE.CylinderGeometry(2.1,3.5,10,8,1,false),material(0x3f5960)); hull.rotation.z=Math.PI/2; hull.scale.z=.55; hull.position.set(25,.2,-32); hull.rotation.y=-.18; hull.castShadow=true; scene.add(hull); boxes.push({minX:20,maxX:30,minY:-1.4,maxY:1.85,minZ:-35,maxZ:-29});
      addBox(25,1.8,-32,3.4,2.4,3,0xd8d2b6); addBox(25,3.25,-32,.18,3,.18,0x495559,false);

      // Dark volcanic rocks punctuate the sand and protect the shoreline approaches.
      [[-42,-8,5,3,4],[-31,-27,5.5,3.3,4.5],[-7,-20,4.2,2.5,3.5],[7,20,4.5,2.7,3.7],[24,-2,5,3.1,4],[41,-14,5.5,3.4,4.4],[-15,19,3.8,2.3,3.2],[16,-27,4,2.5,3.3]].forEach(([x,z,w,h,d],i)=>{
        const ground=terrainHeightAt(x,z),rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),material(i%2?0x4f5752:0x64665b)); rock.position.set(x,ground+h*.46,z); rock.scale.set(w*.5,h*.5,d*.5); rock.rotation.set(.1*i,.33*i,.06*(i%3)); rock.castShadow=rock.receiveShadow=true; scene.add(rock); boxes.push({minX:x-w*.45,maxX:x+w*.45,minY:ground,maxY:ground+h,minZ:z-d*.45,maxZ:z+d*.45});
      });

      // Tall coconut palms use curved slender trunks and feathered, naturally drooping fronds.
      const palmTrunks=[material(0x76695b),material(0x887665),material(0x685d52)];
      const palmLeaves=[new THREE.MeshStandardMaterial({color:0x34783f,roughness:.9,side:THREE.DoubleSide}),new THREE.MeshStandardMaterial({color:0x4b873f,roughness:.88,side:THREE.DoubleSide}),new THREE.MeshStandardMaterial({color:0x727b32,roughness:.92,side:THREE.DoubleSide})];
      [[-59,91,.86],[-51,87,1.03],[-42,93,.76],[-58,78,.92],[-48,70,.8],[-31,87,.78],[-20,74,.84],[-59,57,.82],[-52,52,1.02],[-43,55,.76],[-58,42,.9],[-53,31,.72],[-59,19,.96],[-54,7,.8],[-58,-5,.9],[-43,39,.8],[-38,34,1],[-44,27,.9],[-39,20,.75],[-44,10,1.05],[-39,1,.82],[-43,-10,.92],[-37,-12,.78],[-24,52,.8],[-24,38,.72],[-28,24,.85],[-29,5,.75],[-20,-7,.8],[-20,-12,.72],[59,91,.88],[51,87,1.05],[42,93,.78],[58,78,.94],[48,70,.82],[31,87,.8],[20,74,.86],[59,57,.84],[52,52,1.04],[43,55,.78],[58,42,.92],[53,31,.74],[59,19,.98],[54,7,.82],[58,-5,.92],[43,39,.82],[38,34,1.02],[44,27,.88],[39,19,.78],[44,9,1.04],[39,0,.84],[43,-10,.95],[37,-12,.76],[24,52,.82],[24,38,.7],[28,25,.86],[29,5,.74],[20,-8,.82],[20,-12,.7]].forEach(([x,z,s],i)=>{
        const ground=terrainHeightAt(x,z),height=s*(8+(i%4)*.65),leanX=s*((i*7)%5-2)*.58,leanZ=s*((i*11)%5-2)*.24,grove=new THREE.Group(); grove.position.set(x,ground,z); scene.add(grove);
        const trunkCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(leanX*.12,height*.34,leanZ*.1),new THREE.Vector3(leanX*.48,height*.7,leanZ*.45),new THREE.Vector3(leanX,height,leanZ)]);
        const trunk=new THREE.Mesh(new THREE.TubeGeometry(trunkCurve,10,.22*s,8,false),palmTrunks[i%palmTrunks.length]); trunk.castShadow=trunk.receiveShadow=true; grove.add(trunk);
        const baseCollar=new THREE.Mesh(new THREE.CylinderGeometry(.25*s,.4*s,.65*s,9),palmTrunks[(i+1)%palmTrunks.length]); baseCollar.position.y=.3*s; baseCollar.castShadow=true; grove.add(baseCollar);
        const crownX=leanX,crownY=height,crownZ=leanZ,frondCount=7+(i%3);
        for(let leaf=0;leaf<frondCount;leaf++){
          const angle=leaf*Math.PI*2/frondCount+(i%3)*.16,length=s*(3.6+(leaf%3)*.42),rise=leaf%4===0?.7*s:.22*s,droop=s*(.8+(leaf%3)*.3);
          const direction=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle)),start=new THREE.Vector3(crownX,crownY,crownZ);
          const frondCurve=new THREE.CatmullRomCurve3([start,start.clone().add(direction.clone().multiplyScalar(length*.3)).add(new THREE.Vector3(0,rise,0)),start.clone().add(direction.clone().multiplyScalar(length*.72)).add(new THREE.Vector3(0,rise*.35-droop*.2,0)),start.clone().add(direction.clone().multiplyScalar(length)).add(new THREE.Vector3(0,-droop,0))]);
          const stem=new THREE.Mesh(new THREE.TubeGeometry(frondCurve,7,.035*s,5,false),material(0x536832)); stem.raycast=()=>{}; grove.add(stem);
          const vertices:number[]=[];
          for(let leaflet=1;leaflet<=6;leaflet++){
            const t=leaflet/7,p=frondCurve.getPoint(t),tangent=frondCurve.getTangent(t).normalize(),side=new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle)),span=s*(.72-(leaflet%3)*.07)*(1-t*.22);
            [-1,1].forEach(sign=>{const tip=p.clone().add(side.clone().multiplyScalar(span*sign)).add(new THREE.Vector3(0,-.12*s-.12*s*t,0)),back=p.clone().sub(tangent.clone().multiplyScalar(.2*s)); vertices.push(p.x,p.y,p.z,tip.x,tip.y,tip.z,back.x,back.y,back.z);});
          }
          const leafletGeometry=new THREE.BufferGeometry(); leafletGeometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3)); leafletGeometry.computeVertexNormals();
          const leaflets=new THREE.Mesh(leafletGeometry,palmLeaves[(i+leaf)%palmLeaves.length]); leaflets.raycast=()=>{}; grove.add(leaflets);
        }
        for(let shoot=0;shoot<3;shoot++){const leaf=new THREE.Mesh(new THREE.ConeGeometry(.16*s,2.1*s,4),palmLeaves[(i+shoot)%palmLeaves.length]); leaf.position.set(crownX+(shoot-1)*.16*s,crownY+.9*s,crownZ); leaf.rotation.z=(shoot-1)*.22; leaf.raycast=()=>{}; grove.add(leaf);}
        if(i%3!==1) for(let coconut=0;coconut<2+(i%3);coconut++){const nut=new THREE.Mesh(new THREE.SphereGeometry(.2*s,8,6),material(0x5b3d27)); const angle=coconut*Math.PI*2/(2+i%3); nut.position.set(crownX+Math.cos(angle)*.38*s,crownY-.35*s,crownZ+Math.sin(angle)*.38*s); nut.castShadow=true; nut.raycast=()=>{}; grove.add(nut);}
        boxes.push({minX:x-.42*s,maxX:x+.42*s,minY:ground,maxY:ground+height,minZ:z-.42*s,maxZ:z+.42*s});
      });
    }

    if(desertMap){
      // Dustfall Desert: sandstone canyon walls, rolling dunes, ruins, and a central oasis.
      addBox(0,5,-47.5,96,10,1.2,0x805734);addBox(0,5,47.5,96,10,1.2,0x805734);addBox(-47.5,5,0,1.2,10,96,0x765033);addBox(47.5,5,0,1.2,10,96,0x765033);
      const duneMat=material(0xd3a15f,.98,0),rockMat=material(0x8a5735,.96,.01);
      [[-36,29,9,2.2,5],[-16,35,8,1.8,5],[18,32,10,2.4,6],[38,25,8,1.9,5],[-39,3,9,2.3,5],[36,5,10,2.2,6],[-36,-27,10,2.5,6],[-13,-34,8,1.8,5],[18,-33,9,2.2,5],[39,-25,8,2,5]].forEach(([x,z,w,h,d],i)=>{const dune=new THREE.Mesh(new THREE.SphereGeometry(1,18,10),duneMat);dune.position.set(x,-.2,z);dune.scale.set(w,h,d);dune.rotation.y=i*.47;dune.castShadow=dune.receiveShadow=true;dune.raycast=()=>{};scene.add(dune);});
      [[-41,17,6,4,5],[-26,22,4,3,4],[29,24,6,4,5],[41,12,5,3.5,4],[-42,-12,6,4.5,5],[-25,-19,5,3.5,4],[26,-17,6,4,5],[42,-8,5,3.7,4],[-8,14,4,2.8,4],[10,-15,5,3,4]].forEach(([x,z,w,h,d],i)=>{const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),rockMat);rock.position.set(x,h*.48,z);rock.scale.set(w*.5,h*.5,d*.5);rock.rotation.set(.08*i,.3*i,.05*(i%3));rock.castShadow=rock.receiveShadow=true;scene.add(rock);boxes.push({minX:x-w*.45,maxX:x+w*.45,minY:0,maxY:h,minZ:z-d*.45,maxZ:z+d*.45});});
      // Ruined trading post creates close-range lanes through the center.
      [[-18,4,12,7],[18,-3,13,8],[-2,-24,11,7]].forEach(([x,z,w,d],i)=>{addBox(x,1.9,z,w,3.8,.55,i%2?0xa47347:0x96633c);addBox(x-w/2,1.9,z,.55,3.8,d,0x875936);addBox(x+w/2,1.9,z,.55,3.8,d,0x875936);addBox(x+(i%2?2:-2),3.9,z,w*.42,.35,d*.75,0x68462f,false);});
      [[-30,34],[-10,28],[13,27],[32,34],[-32,-35],[-10,-28],[12,-29],[32,-34]].forEach(([x,z],i)=>{addBox(x,.65,z,3.2,1.3,2.4,i%2?0x756143:0x8b6944);addBox(x+(i%2?.8:-.8),1.62,z+.2,1.3,.65,1.1,0x66543a);});
      // Oasis landmark with palms and low stone cover.
      const oasis=new THREE.Mesh(new THREE.CircleGeometry(7,40),material(0x287f83,.32,.08));oasis.rotation.x=-Math.PI/2;oasis.position.y=.03;oasis.raycast=()=>{};scene.add(oasis);
      for(let stone=0;stone<12;stone++){const angle=stone*Math.PI/6;addBox(Math.cos(angle)*7,.32,Math.sin(angle)*7,1.7,.64,1.2,0x77634a,false);}
      const desertTrunk=material(0x735037),desertLeaf=material(0x4d713e);
      [[-6,5,.8],[6,4,.9],[-5,-5,.72],[6,-6,.82],[-43,37,.7],[43,38,.74],[-42,-37,.72],[42,-38,.76]].forEach(([x,z,s],i)=>{const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.34*s,6*s,8),desertTrunk);trunk.position.set(x,3*s,z);trunk.rotation.z=(i%3-1)*.08;trunk.castShadow=true;scene.add(trunk);boxes.push({minX:x-.35,maxX:x+.35,minY:0,maxY:6*s,minZ:z-.35,maxZ:z+.35});for(let leaf=0;leaf<7;leaf++){const frond=new THREE.Mesh(new THREE.ConeGeometry(.35*s,3.5*s,5),desertLeaf);frond.position.set(x+Math.cos(leaf*Math.PI*2/7)*1.1*s,6*s,z+Math.sin(leaf*Math.PI*2/7)*1.1*s);frond.rotation.set(Math.PI/2.4,-leaf*Math.PI*2/7,0);frond.raycast=()=>{};scene.add(frond);}});
      // Wind-blown dust softens the horizon.
      const dustPositions=new Float32Array(260*3);for(let i=0;i<260;i++){dustPositions[i*3]=-47+Math.random()*94;dustPositions[i*3+1]=.3+Math.random()*8;dustPositions[i*3+2]=-47+Math.random()*94;}const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute("position",new THREE.BufferAttribute(dustPositions,3));const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xe7bc7b,size:.1,transparent:true,opacity:.3,depthWrite:false}));dust.raycast=()=>{};scene.add(dust);
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
    const primaryAttachments: WeaponAttachments = { sight: weaponSight, muzzle: muzzleAttachment, tactical: tacticalAttachment, magazine: magazineAttachment, fireControl: fireControlAttachment };
    const secondaryAttachments: WeaponAttachments = { sight: secondarySight, muzzle: secondaryMuzzle, tactical: secondaryTactical, magazine: secondaryMagazine, fireControl: secondaryFireControl };
    const buildWeapon = (name: string, attachments: WeaponAttachments) => {
      const model = new THREE.Group();
      const addPart = (w: number, h: number, d: number, x: number, y: number, z: number, color = 0x20282b) => {
        const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), weaponMaterial(color));
        part.position.set(x, y, z); part.castShadow = true; model.add(part); return part;
      };
      const x = 0.34;
      let muzzleZ = -1.22;

      if (["P9 SIDEARM", "R45 REVOLVER", "G18 AUTO PISTOL", "DB-2 SAWED-OFF", "M1911 SIDEARM", "USP-45 TACTICAL", "MP5K COMPACT"].includes(name)) {
        const revolver = name === "R45 REVOLVER";
        const sawedOff = name === "DB-2 SAWED-OFF";
        const compact = name === "MP5K COMPACT";
        const autoPistol = name === "G18 AUTO PISTOL" || compact;
        const tactical45 = name === "USP-45 TACTICAL";
        addPart(sawedOff ? 0.28 : compact ? .22 : revolver ? 0.22 : 0.18, sawedOff ? 0.2 : compact ? .19 : 0.14, sawedOff ? 0.78 : compact ? .72 : revolver ? 0.48 : tactical45 ? .58 : 0.52, x, -0.25, sawedOff ? -0.75 : compact ? -.72 : -0.62, revolver ? 0x343638 : sawedOff ? 0x4b382d : tactical45 ? 0x3c443d : 0x1d2427);
        const grip = addPart(sawedOff ? 0.19 : 0.15, sawedOff ? 0.3 : 0.38, 0.2, x, -0.48, sawedOff ? -0.48 : -0.48, revolver || sawedOff ? 0x5b3727 : 0x252d2f);
        grip.rotation.x = -0.25;
        if (revolver) {
          const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 10), weaponMaterial(0x4b5051));
          cylinder.rotation.z = Math.PI / 2; cylinder.position.set(x, -0.27, -0.64); model.add(cylinder);
        } else if (!sawedOff) {
          const magazine = addPart(autoPistol ? 0.125 : 0.115, compact ? .5 : autoPistol ? 0.44 : 0.31, 0.14, x, compact ? -.63 : autoPistol ? -0.59 : -0.53, -0.48, 0x111719);
          magazine.rotation.x = -0.25;
          addPart(0.15, 0.025, 0.17, x, -0.7, -0.43, 0x343d3f);
        }
        if (autoPistol) addPart(compact ? .16 : 0.07, compact ? .14 : 0.08, compact ? .3 : 0.18, x, -0.17, compact ? -.78 : -0.7, 0x263437);
        if (sawedOff) {
          const secondBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10), weaponMaterial(0x171c1d));
          secondBarrel.rotation.x = Math.PI / 2; secondBarrel.position.set(x + 0.065, -0.24, -1.32); model.add(secondBarrel);
        }
        muzzleZ = sawedOff ? -1.58 : compact ? -1.12 : revolver ? -0.91 : tactical45 ? -1.01 : -0.93;
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
        const isBurst = name === "M8 TACTICAL RIFLE";
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
      if (name === "FIELD MEDKIT" || name === "TRAUMA KIT" || name === "FIRST AID POUCH") {
        const trauma = name === "TRAUMA KIT";
        const pouch = name === "FIRST AID POUCH";
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(trauma ? .52 : pouch ? .34 : .4, trauma ? .42 : pouch ? .27 : .32, pouch ? .18 : .24), equipmentMat(trauma ? 0x5a4435 : pouch ? 0x6d5b3d : 0x334c3e))).position.set(x, y, z);
        const crossZ = z - (pouch ? .096 : .126);
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.16, .055, .012), equipmentMat(0xe5e8df))).position.set(x, y, crossZ);
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.055, .16, .012), equipmentMat(0xe5e8df))).position.set(x, y, crossZ - .001);
        const handle = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(.12, .025, 8, 16, Math.PI), equipmentMat(0x171d1e))); handle.position.set(x, y + (trauma ? .27 : .22), z); handle.rotation.z = Math.PI;
      } else if (name === "STIM INJECTOR" || name === "EMERGENCY INJECTOR") {
        const emergency = name === "EMERGENCY INJECTOR";
        const syringe = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .48, 12), equipmentMat(emergency ? 0xf0a34b : 0x9fe7dc, .3))); syringe.rotation.x = Math.PI / 2; syringe.position.set(x, y, z);
        const plunger = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .04, 12), equipmentMat(0x252f31))); plunger.rotation.x = Math.PI / 2; plunger.position.set(x, y, z + .26);
        const needle = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .2, 8), equipmentMat(0xc8d1d0, .8))); needle.rotation.x = Math.PI / 2; needle.position.set(x, y, z - .33);
      } else if (name === "COMBAT BANDAGE") {
        const roll = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .2, 18), equipmentMat(0xd9d2bd))); roll.rotation.z = Math.PI / 2; roll.position.set(x, y, z);
        const center = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .205, 14), equipmentMat(0x8c7b61))); center.rotation.z = Math.PI / 2; center.position.set(x, y, z);
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.08, .22, .22), equipmentMat(0xb14d43))).position.set(x, y, z);
      } else if (name === "BLOOD BAG") {
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.34, .43, .075), equipmentMat(0x8f2932, .18))).position.set(x, y, z);
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.17, .08, .012), equipmentMat(0xe7e2d5))).position.set(x, y + .04, z - .044);
        const tube = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(.16, .012, 7, 20, Math.PI * 1.45), equipmentMat(0x6f2028, .15))); tube.position.set(x + .08, y - .23, z); tube.rotation.z = -.35;
      } else if (name === "MORTAR SYSTEM") {
        const tube = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.095, .145, .82, 18), equipmentMat(0x354238, .65))); tube.rotation.x = Math.PI / 2; tube.position.set(x, y, z - .08);
        const rim = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(.145, .025, 8, 18), equipmentMat(0x171d1f, .7))); rim.position.set(x, y, z - .49);
        const base = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .055, 18), equipmentMat(0x252f2c, .6))); base.rotation.x = Math.PI / 2; base.position.set(x, y, z + .36);
        [-1, 1].forEach((side) => { const leg = visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.055, .48, .055), equipmentMat(0x252f2c, .65))); leg.position.set(x + side * .16, y - .18, z + .2); leg.rotation.z = side * .5; });
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.16, .13, .08), equipmentMat(0x111719, .55))).position.set(x + .16, y + .12, z - .08);
      } else if (name === "AIRSTRIKE TABLET") {
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.5, .34, .055), equipmentMat(0x182225, .45))).position.set(x, y, z);
        visualOnly(new THREE.Mesh(new THREE.PlaneGeometry(.4, .25), new THREE.MeshBasicMaterial({ color: 0x65d3bb }))).position.set(x, y, z - .031);
      } else if (name === "ROCKET LAUNCHER") {
        const tube = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.135, .155, 1.28, 18), equipmentMat(0x3f4a3c, .55))); tube.rotation.x = Math.PI / 2; tube.position.set(x, y, z - .28);
        const rear = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.21, .16, .2, 18), equipmentMat(0x1b2422, .65))); rear.rotation.x = Math.PI / 2; rear.position.set(x, y, z + .43);
        const muzzle = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(.15, .025, 8, 18), equipmentMat(0x111719, .75))); muzzle.position.set(x, y, z - .93);
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.15, .34, .18), equipmentMat(0x171d1f, .6))).position.set(x, y - .2, z - .12);
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .32), equipmentMat(0x20282a, .55))).position.set(x + .17, y + .14, z - .2);
      } else if (name === "SENTRY KIT") {
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.5, .34, .23), equipmentMat(0x35433f, .45))).position.set(x, y, z);
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.34, .05, .26), equipmentMat(0x171d1f, .55))).position.set(x, y + .2, z);
      } else if (name === "ATTACK DRONE") {
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.36, .1, .24), equipmentMat(0x283438, .6))).position.set(x, y, z);
        [-.27, .27].forEach((dx) => [-.18, .18].forEach((dz) => { const rotor = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .025, 12), equipmentMat(0x111719, .7))); rotor.position.set(x + dx, y, z + dz); }));
      } else if (name === "C4 CHARGE") {
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.42, .3, .12), equipmentMat(0x5b6652))).position.set(x, y, z);
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.2, .13, .03), equipmentMat(0x20282a, .4))).position.set(x, y, z - .075);
        const wire = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(.13, .012, 7, 18, Math.PI), equipmentMat(0xd45b3e, .2))); wire.position.set(x, y + .12, z - .08); wire.rotation.z = Math.PI;
      } else if (name === "LANDMINE") {
        const mine = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.25, .28, .11, 16), equipmentMat(0x48513d, .45))); mine.position.set(x, y, z); mine.rotation.x = Math.PI / 2;
        visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .08, 10), equipmentMat(0x242b27, .5))).position.set(x, y, z - .08);
      } else {
        const gas = name === "GAS BOMB";
        const flash = name === "FLASHBANG", smoke = name === "SMOKE GRENADE";
        const body = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(flash ? .085 : .11, flash ? .085 : .1, flash ? .38 : .31, 12), equipmentMat(flash ? 0xb8c1c0 : gas ? 0x718b45 : smoke ? 0x7d8787 : 0x495b43, .35)));
        body.position.set(x, y, z); body.rotation.z = flash ? .08 : 0;
        visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.16, .07, .11), equipmentMat(0x202729, .5))).position.set(x, y + .19, z);
        const pin = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(.065, .012, 7, 14), equipmentMat(0x9da5a4, .75))); pin.position.set(x + .11, y + .2, z); pin.rotation.x = Math.PI / 2;
      }
      return model;
    };
    const medicalModel = buildEquipment(medical);
    const utilityModel = buildEquipment(utility);
    const classItemModel = buildEquipment(CLASS_ITEMS[playerClass] ?? "FRAG GRENADE");
    gun.add(primaryWeapon.model, secondaryWeapon.model, medicalModel, utilityModel, classItemModel);
    const worldPrimary = primaryWeapon.model.clone(true);
    const worldSecondary = secondaryWeapon.model.clone(true);
    const worldMedical = medicalModel.clone(true);
    const worldUtility = utilityModel.clone(true);
    const worldClassItem = classItemModel.clone(true);
    [worldPrimary, worldSecondary].forEach((weapon) => {
      weapon.scale.setScalar(0.72);
      weapon.position.set(-0.055, 1.58, 0.03);
      weapon.rotation.x = -0.04;
      weapon.traverse((object) => { if (object instanceof THREE.Mesh) object.raycast = () => {}; });
      localPlayer.add(weapon);
    });
    [worldMedical, worldUtility, worldClassItem].forEach((item) => {
      item.scale.setScalar(.78); item.position.set(-.045, 1.56, .03);
      item.traverse((object) => { if (object instanceof THREE.Mesh) object.raycast = () => {}; }); localPlayer.add(item);
    });
    type RemoteState = { id: string; x: number; y: number; z: number; yaw: number; movement: "static" | "walk" | "sprint"; crouching: boolean; prone: boolean; flying?: boolean; slot: number; primary?: string; secondary?: string; health?: number; kills?: number; deaths?: number; team?: "ALPHA" | "BRAVO"; callsign?: string } & Partial<PlayerAppearance>;
    const rememberPlayer = (player: RemoteState) => {
      const previous = playerSummariesRef.current[player.id];
      const callsign = (player.callsign || previous?.callsign || (player.id === localNetworkId ? playerCallsignRef.current : "OPERATOR")).slice(0, 18);
      const next = { callsign, kills: player.kills ?? previous?.kills ?? 0, deaths: player.deaths ?? previous?.deaths ?? 0 };
      playerSummariesRef.current = { ...playerSummariesRef.current, [player.id]: next };
      setPlayerSummaries(playerSummariesRef.current);
    };
    const objectiveMarkers: THREE.Group[] = [];
    const updateObjectiveMarkers = (zones: ObjectiveZone[], mode: GameMode) => {
      objectiveMarkers.splice(0).forEach((marker) => { scene.remove(marker); marker.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); if (Array.isArray(object.material)) object.material.forEach((entry) => entry.dispose()); else object.material.dispose(); } }); });
      zones.forEach((zone) => {
        const marker = new THREE.Group(); marker.position.set(zone.x, terrainHeightAt(zone.x,zone.z)+.075, zone.z);
        const color = zone.owner === "ALPHA" ? 0x55c9ff : zone.owner === "BRAVO" ? 0xff6559 : mode === "KOTH" ? 0xffb347 : 0xe8f3ef;
        const ring = new THREE.Mesh(new THREE.RingGeometry(zone.radius - .22, zone.radius, 64), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.72, side:THREE.DoubleSide, depthWrite:false })); ring.rotation.x = -Math.PI / 2; ring.raycast = () => {}; marker.add(ring);
        const fill = new THREE.Mesh(new THREE.CircleGeometry(zone.radius - .3, 64), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.08, side:THREE.DoubleSide, depthWrite:false })); fill.rotation.x = -Math.PI / 2; fill.raycast = () => {}; marker.add(fill);
        if (mode === "CTF") {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(.055,.07,2.7,10), material(0x2a3031,.72,.45)); pole.position.y = 1.35; pole.raycast = () => {}; marker.add(pole);
          const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.25,.72), new THREE.MeshBasicMaterial({ color, side:THREE.DoubleSide })); banner.position.set(.64,2.2,0); banner.raycast = () => {}; marker.add(banner);
        }
        const beacon = new THREE.PointLight(color, 12, zone.radius * 2.2, 2); beacon.position.y = 1; marker.add(beacon); scene.add(marker); objectiveMarkers.push(marker);
      });
    };
    const remotePlayers = new Map<string, THREE.Group>();
    const remoteDrones = new Map<string, THREE.Group>();
    const buildDroneVisual = () => {
      const drone = new THREE.Group();
      drone.add(new THREE.Mesh(new THREE.BoxGeometry(.75,.14,.48),material(0x263236,.45,.55)));
      [-1,1].forEach((sx)=>[-1,1].forEach((sz)=>{const arm=new THREE.Mesh(new THREE.BoxGeometry(.5,.045,.045),material(0x171d1f,.6,.5)); arm.position.set(sx*.28,0,sz*.2); arm.rotation.y=sx*sz*.65; drone.add(arm); const rotor=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.025,14),material(0x111719,.65,.5)); rotor.position.set(sx*.48,.04,sz*.34); drone.add(rotor);}));
      const gunBarrel=new THREE.Mesh(new THREE.BoxGeometry(.09,.09,.5),material(0x101719,.45,.7)); gunBarrel.position.set(0,-.12,-.35); drone.add(gunBarrel);
      drone.traverse((object)=>{if(object instanceof THREE.Mesh)object.raycast=()=>{};});
      return drone;
    };
    let localNetworkTeam: "ALPHA" | "BRAVO" = "ALPHA";
    let activeNetworkMode: GameMode = "FFA";
    const teamModeActive = () => activeNetworkMode === "TDM" || activeNetworkMode === "CTP" || activeNetworkMode === "CTF";
    const createTeammateMarker = (callsign: string) => {
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 96;
      const context = canvas.getContext("2d")!; context.fillStyle = "rgba(5,18,24,.82)"; context.strokeStyle = "rgba(99,211,255,.9)"; context.lineWidth = 4;
      context.beginPath(); context.roundRect(4,4,504,88,16); context.fill(); context.stroke();
      context.fillStyle = "#8fe4ff"; context.font = "700 34px monospace"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(callsign.slice(0,18).toUpperCase(),256,49);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map:texture, transparent:true, depthTest:false, depthWrite:false })); marker.position.set(0,2.85,0); marker.scale.set(2.7,.51,1); marker.raycast = () => {}; marker.userData.markerTexture = texture; return marker;
    };
    const refreshTeammateMarkers = () => remotePlayers.forEach((avatar) => { const marker = avatar.userData.teammateMarker as THREE.Sprite | undefined; if (marker) marker.visible = teamModeActive() && avatar.userData.remoteTeam === localNetworkTeam && avatar.visible; });
    const upsertRemotePlayer = (state: RemoteState) => {
      const legacyAccessories = [state.faceGear, state.headAccessory].filter((item): item is OperatorAccessory => item === "GOGGLES" || item === "MASK" || item === "HEADSET" || item === "NVG");
      const remoteAccessories = Array.isArray(state.accessories)
        ? state.accessories.filter((item): item is OperatorAccessory => item === "GOGGLES" || item === "MASK" || item === "HEADSET" || item === "NVG")
        : legacyAccessories.length ? legacyAccessories : localAppearance.accessories;
      const appearance: PlayerAppearance = { ...localAppearance, skin: state.skin ?? localAppearance.skin, uniform: state.uniform ?? localAppearance.uniform, camo: state.camo ?? localAppearance.camo, accessories: remoteAccessories, armor: state.armor ?? localAppearance.armor, helmet: state.helmet ?? localAppearance.helmet, faceGear: state.faceGear ?? localAppearance.faceGear, headAccessory: state.headAccessory ?? localAppearance.headAccessory, chestRig: state.chestRig ?? localAppearance.chestRig, backpack: state.backpack ?? localAppearance.backpack, pants: state.pants ?? localAppearance.pants, gloves: state.gloves ?? localAppearance.gloves, boots: state.boots ?? localAppearance.boots };
      const avatarSignature = JSON.stringify([appearance, state.primary ?? "VXR-4 CARBINE", state.secondary ?? "P9 SIDEARM", state.callsign ?? `OPERATOR ${state.id.slice(0,4).toUpperCase()}`]);
      let avatar = remotePlayers.get(state.id);
      if (avatar && avatar.userData.avatarSignature !== avatarSignature) {
        scene.remove(avatar); remotePlayers.delete(state.id); avatar = undefined;
      }
      if (!avatar) {
        avatar = addDummy(state.x, state.z, 0x435e70, "static", false, appearance);
        avatar.visible = true; avatar.userData.targetPosition = new THREE.Vector3(state.x, state.y - PLAYER_HEIGHT, state.z);
        const stockAttachments: WeaponAttachments = { sight: "IRON SIGHTS", muzzle: "STANDARD BARREL", tactical: "NONE", magazine: "STANDARD MAG", fireControl: "STANDARD TRIGGER" };
        const remotePrimary = buildWeapon(state.primary ?? "VXR-4 CARBINE", stockAttachments).model;
        const remoteSecondary = buildWeapon(state.secondary ?? "P9 SIDEARM", stockAttachments).model;
        [remotePrimary, remoteSecondary].forEach((weapon) => {
          weapon.scale.setScalar(.72); weapon.position.set(-.055, 1.58, .03); weapon.rotation.x = -.04;
          weapon.traverse((object) => { if (object instanceof THREE.Mesh) { object.raycast = () => {}; object.userData.remoteWeaponVisual = true; } });
          avatar!.add(weapon);
        });
        avatar.userData.remotePrimary = remotePrimary; avatar.userData.remoteSecondary = remoteSecondary;
        const teammateMarker = createTeammateMarker(state.callsign ?? `OPERATOR ${state.id.slice(0,4).toUpperCase()}`); avatar.add(teammateMarker); avatar.userData.teammateMarker = teammateMarker;
        avatar.userData.isRemotePlayer = true; avatar.userData.avatarSignature = avatarSignature;
        avatar.traverse((object) => {
          if (!(object instanceof THREE.Mesh) || object.userData.remoteWeaponVisual) return;
          object.raycast = THREE.Mesh.prototype.raycast;
          object.userData.remotePlayerId = state.id;
          object.userData.damageMultiplier = object.parent === avatar!.userData.headRig ? 2 : 1;
        });
        remotePlayers.set(state.id, avatar);
      }
      avatar.userData.targetPosition.set(state.x, state.y - PLAYER_HEIGHT - (state.crouching ? .42 : 0), state.z);
      if(beachMap&&!state.flying){
        const remoteOnRamp=Math.abs(state.x)<4.7&&state.z<=-4.2&&state.z>-10;
        const remoteOnPier=Math.abs(state.x)<5.5&&state.z<=-10&&state.z>-46;
        if(remoteOnRamp){const rampGround=THREE.MathUtils.lerp(terrainHeightAt(state.x,state.z),1.39,THREE.MathUtils.clamp((-state.z-4.2)/5.8,0,1)); avatar.userData.targetPosition.y=rampGround;}
        else if(remoteOnPier) avatar.userData.targetPosition.y=1.39;
        else if(state.z < -8.2) avatar.userData.targetPosition.y=THREE.MathUtils.clamp(state.y-PLAYER_HEIGHT,-1.78,-.88);
        else avatar.userData.targetPosition.y=terrainHeightAt(state.x,state.z)-(state.crouching?.42:0);
      }
      avatar.userData.targetYaw = state.yaw; avatar.userData.movement = state.prone ? "static" : state.movement;
      avatar.userData.remoteProne = state.prone; avatar.userData.remoteCrouching = state.crouching;
      avatar.userData.remoteFlying = Boolean(state.flying);
      avatar.userData.remoteTeam = state.team ?? "ALPHA";
      avatar.userData.remoteSlot = state.slot; avatar.userData.remoteSecondaryName = state.secondary ?? "P9 SIDEARM";
      if (avatar.userData.remotePrimary) avatar.userData.remotePrimary.visible = state.slot === 1;
      if (avatar.userData.remoteSecondary) avatar.userData.remoteSecondary.visible = state.slot === 2;
      avatar.visible = (state.health ?? 100) > 0;
      const teammateMarker = avatar.userData.teammateMarker as THREE.Sprite | undefined;
      if (teammateMarker) teammateMarker.visible = teamModeActive() && avatar.userData.remoteTeam === localNetworkTeam && avatar.visible;
    };
    const showRemoteTracers = (playerId: string, tracerEnds: number[][]) => {
      const avatar = remotePlayers.get(playerId);
      if (!avatar?.visible) return;
      const activeWeapon = avatar.userData.remoteSlot === 2 ? avatar.userData.remoteSecondary : avatar.userData.remotePrimary;
      const remoteMuzzle = (activeWeapon as THREE.Object3D | undefined)?.getObjectByName("muzzleAnchor");
      const tracerStart = new THREE.Vector3();
      if (remoteMuzzle) remoteMuzzle.getWorldPosition(tracerStart);
      else avatar.localToWorld(tracerStart.set(0, 1.42, -.55));
      tracerEnds.slice(0, 8).forEach((coordinates) => {
        if (coordinates.length !== 3 || coordinates.some((coordinate) => !Number.isFinite(coordinate))) return;
        const tracerMaterial = new THREE.LineBasicMaterial({ color: tracerEnds.length > 1 ? 0xffd09a : 0xffb06b, transparent: true, opacity: .9, depthWrite: false });
        const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([tracerStart, new THREE.Vector3(coordinates[0], coordinates[1], coordinates[2])]), tracerMaterial);
        tracer.raycast = () => {}; scene.add(tracer);
        window.setTimeout(() => { scene.remove(tracer); tracer.geometry.dispose(); tracerMaterial.dispose(); }, tracerEnds.length > 1 ? 70 : 95);
      });
    };
    let multiplayerSocket: WebSocket | undefined;
    let localNetworkId = "";
    let lastMultiplayerSend = 0;
    if (started && selectedSector !== "TRAINING SECTOR" && MULTIPLAYER_SERVER) {
      setMultiplayerStatus("CONNECTING");
      const serverUrl = MULTIPLAYER_SERVER.replace(/^http/, "ws").replace(/\/$/, "");
      multiplayerSocket = new WebSocket(`${serverUrl}/room/${selectedSector.toLowerCase().replace(" ", "-")}`);
      multiplayerSocketRef.current = multiplayerSocket;
      multiplayerSendRef.current = (packet) => { if (multiplayerSocket?.readyState === WebSocket.OPEN) multiplayerSocket.send(JSON.stringify(packet)); };
      multiplayerSocket.addEventListener("open", () => {
        if (multiplayerSocketRef.current !== multiplayerSocket) return;
        setMultiplayerStatus("ONLINE");
        if (firebaseTokenRef.current) multiplayerSocket?.send(JSON.stringify({ type: "admin_auth", idToken: firebaseTokenRef.current }));
      });
      multiplayerSocket.addEventListener("close", () => { if (multiplayerSocketRef.current === multiplayerSocket) setMultiplayerStatus("OFFLINE"); });
      multiplayerSocket.addEventListener("error", () => { if (multiplayerSocketRef.current === multiplayerSocket) setMultiplayerStatus("OFFLINE"); });
      let lastVotingPhase = 0;
      multiplayerSocket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        if (multiplayerSocketRef.current === multiplayerSocket) setMultiplayerStatus("ONLINE");
        try {
          const packet = JSON.parse(event.data) as { type: string; authorized?: boolean; reason?: string; player?: RemoteState; players?: RemoteState[]; id?: string; health?: number; score?: number; attackerId?: string; weapon?: string; headshot?: boolean; tracerEnds?: number[][]; effect?: string; duration?: number; utilityId?: string; utility?: string; position?: number[]; velocity?: number[]; rotation?: number[]; active?: boolean; yourMapVote?: Exclude<GameMap, "TEST YARD"> | null; yourModeVote?: GameMode | null; map?: Exclude<GameMap, "TEST YARD">; match?: { phase: "voting" | "playing" | "results"; phaseEndsAt: number; votes: number; mapVotes?: { "CITY BLOCK"?: number; "BLACKWOOD FOREST"?: number; "FROSTLINE BASE"?: number; "TIDEBREAK BEACH"?: number; "DUSTFALL DESERT"?:number }; map: Exclude<GameMap, "TEST YARD">; modeVotes: number; modeVoteCounts?: { FFA?: number; TDM?: number; KOTH?: number; CTP?: number; CTF?:number }; endVotes: number; mode: GameMode; teamScores?: { ALPHA: number; BRAVO: number }; objectiveZones?: ObjectiveZone[]; flags?:FlagState[]; winnerId: string | null; winningTeam?: "ALPHA" | "BRAVO" | null; winningKills: number } };
          const applyMatch = (match: NonNullable<typeof packet.match>, resetVotes = false) => {
            activeNetworkMode = match.mode ?? "FFA";
            setMatchPhase(match.phase); setMapVotes(match.votes); setCityMapVotes(match.mapVotes?.["CITY BLOCK"] ?? match.votes); setForestMapVotes(match.mapVotes?.["BLACKWOOD FOREST"] ?? 0); setFrostMapVotes(match.mapVotes?.["FROSTLINE BASE"] ?? 0); setBeachMapVotes(match.mapVotes?.["TIDEBREAK BEACH"] ?? 0);setDesertMapVotes(match.mapVotes?.["DUSTFALL DESERT"]??0); setModeVotes(match.modeVotes ?? 0); setFfaModeVotes(match.modeVoteCounts?.FFA ?? match.modeVotes); setTdmModeVotes(match.modeVoteCounts?.TDM ?? 0); setKothModeVotes(match.modeVoteCounts?.KOTH ?? 0); setCtpModeVotes(match.modeVoteCounts?.CTP ?? 0);setCtfModeVotes(match.modeVoteCounts?.CTF??0); setEndGameVotes(match.endVotes ?? 0); setMatchEndsAt(match.phaseEndsAt);
            setMatchMode(match.mode ?? "FFA"); setTeamScores(match.teamScores ?? { ALPHA: 0, BRAVO: 0 }); setObjectiveZones(match.objectiveZones ?? []);setFlags(match.flags??[]); updateObjectiveMarkers(match.mode==="CTF"?(match.flags??[]).map((flag)=>({id:`${flag.team} FLAG`,x:flag.x,z:flag.z,radius:2.1,owner:flag.team,progress:flag.carrierId?100:0})):(match.objectiveZones ?? []), match.mode ?? "FFA"); setMatchWinnerId(match.winnerId ?? null); setWinningTeam(match.winningTeam ?? null); setWinningKills(match.winningKills ?? 0);
            if (match.phase === "playing" && match.map !== selectedMap) setSelectedMap(match.map);
            if ((match.endVotes ?? 0) === 0) setEndGameRequested(false);
            if (match.phase === "voting" && match.phaseEndsAt !== lastVotingPhase) {
              lastVotingPhase = match.phaseEndsAt;
              setHasVoted(false); setHasModeVoted(false); setSelectedMapVote(null); setSelectedModeVote(null);
            } else if (resetVotes && match.phase !== "voting") { setHasVoted(false); setHasModeVoted(false); setSelectedMapVote(null); setSelectedModeVote(null); }
            if (match.phase === "voting" || match.phase === "results") document.exitPointerLock();
            refreshTeammateMarkers();
          };
          if (packet.type === "welcome") {
            const otherPlayers = (packet.players ?? []).filter((player) => player.id !== packet.id);
            if (packet.id) { localNetworkId = packet.id; setLocalPlayerId(packet.id); setConnectedPlayerIds([...new Set([packet.id, ...otherPlayers.map((player) => player.id)])]); }
            if (packet.player) { rememberPlayer(packet.player); playerPosition.set(packet.player.x, packet.player.y, packet.player.z); camera.position.copy(playerPosition); yaw = packet.player.yaw; if (packet.player.team) { localNetworkTeam = packet.player.team; setLocalTeam(packet.player.team); } }
            if (packet.match) {
              applyMatch(packet.match);
              if (packet.yourMapVote) { setSelectedMapVote(packet.yourMapVote); setHasVoted(true); }
              if (packet.yourModeVote) { setSelectedModeVote(packet.yourModeVote); setHasModeVoted(true); }
            }
            otherPlayers.forEach((player) => { rememberPlayer(player); upsertRemotePlayer(player); }); refreshTeammateMarkers();
          }
          else if (packet.type === "admin_authenticated" && packet.authorized) {
            multiplayerSendRef.current({ type: "admin_config", godMode: adminControlsRef.current.godMode, damageMultiplier: adminControlsRef.current.damageMultiplier, flying: adminControlsRef.current.flying });
          }
          else if (packet.type === "kicked") {
            window.alert(packet.reason ?? "You were removed by a server administrator.");
            setStarted(false); setLocked(false); setServerBrowserOpen(true);
            if (document.pointerLockElement) document.exitPointerLock();
          }
          else if ((packet.type === "joined" || packet.type === "state") && packet.player) {
            rememberPlayer(packet.player);
            if (packet.player.id === localNetworkId) return;
            upsertRemotePlayer(packet.player);
            if (packet.type === "joined") setConnectedPlayerIds((ids) => ids.includes(packet.player!.id) ? ids : [...ids, packet.player!.id]);
          }
          else if (packet.type === "left" && packet.id) {
            const avatar = remotePlayers.get(packet.id); if (avatar) scene.remove(avatar); remotePlayers.delete(packet.id);
            const drone = remoteDrones.get(packet.id); if (drone) scene.remove(drone); remoteDrones.delete(packet.id);
            setConnectedPlayerIds((ids) => ids.filter((id) => id !== packet.id));
            const next = { ...playerSummariesRef.current }; delete next[packet.id]; playerSummariesRef.current = next; setPlayerSummaries(next);
          }
          else if (packet.type === "damage" && typeof packet.health === "number") {
            playerHealth = packet.health; setHealth(playerHealth);
            if (playerHealth <= 0) { setDead(true); triggerHeld = false; keys.clear(); if (document.pointerLockElement) document.exitPointerLock(); }
          }
          else if (packet.type === "objective_score" && typeof packet.score === "number") setLocalObjectiveScore(packet.score);
          else if (packet.type === "chat") {
            const chatPacket = packet as typeof packet & { id?: string; senderId?: string; text?: string; sentAt?: number };
            if (chatPacket.id && chatPacket.senderId && chatPacket.text) setChatMessages((messages) => [
              ...messages.slice(-49),
              { id: chatPacket.id!, senderId: chatPacket.senderId!, text: chatPacket.text!, sentAt: chatPacket.sentAt ?? Date.now() },
            ]);
          }
          else if (packet.type === "shot" && packet.id && packet.tracerEnds) showRemoteTracers(packet.id, packet.tracerEnds);
          else if (packet.type === "utility_throw" && packet.utilityId && packet.utility && packet.position && packet.velocity) spawnRemoteUtility(packet.utilityId, packet.utility, packet.position, packet.velocity);
          else if (packet.type === "utility_detonate" && packet.utilityId && packet.utility && packet.position) showRemoteUtilityDetonation(packet.utilityId, packet.utility, packet.position);
          else if (packet.type === "class_effect" && packet.effect && packet.position) spawnExplosionVisual(new THREE.Vector3(packet.position[0], packet.position[1], packet.position[2]), packet.effect);
          else if (packet.type === "drone_state" && packet.id) {
            let drone=remoteDrones.get(packet.id);
            if(packet.active===false){if(drone)scene.remove(drone);remoteDrones.delete(packet.id);}
            else if(packet.position?.length===3){if(!drone){drone=buildDroneVisual();scene.add(drone);remoteDrones.set(packet.id,drone);}drone.position.set(packet.position[0],packet.position[1],packet.position[2]);if(packet.rotation?.length===3)drone.rotation.set(packet.rotation[0],packet.rotation[1],packet.rotation[2]);}
          }
          else if (packet.type === "utility_effect" && packet.effect === "flash") {
            setFlashed(true); window.setTimeout(() => setFlashed(false), Math.min(1700, Math.max(250, packet.duration ?? 1000)));
          }
          else if (packet.type === "killed" && packet.id) {
            const killerId = packet.attackerId ?? localNetworkId;
            const killer = playerSummariesRef.current[killerId]?.callsign ?? (killerId === localNetworkId ? playerCallsignRef.current : "OPERATOR");
            const victim = playerSummariesRef.current[packet.id]?.callsign ?? "OPERATOR";
            const entryId = Date.now() + Math.random();
            setKillFeed((entries) => [...entries.slice(-4), { id: entryId, killer, victim, weapon: packet.weapon ?? "WEAPON", headshot: Boolean(packet.headshot) }]);
            window.setTimeout(() => setKillFeed((entries) => entries.filter((entry) => entry.id !== entryId)), 5000);
            const victimSummary = playerSummariesRef.current[packet.id];
            if (victimSummary) {
              const next = { ...victimSummary, deaths: victimSummary.deaths + 1 };
              playerSummariesRef.current = { ...playerSummariesRef.current, [packet.id]: next };
              setPlayerSummaries(playerSummariesRef.current);
            }
            const avatar = remotePlayers.get(packet.id); if (avatar) avatar.visible = false;
          }
          else if (packet.type === "player_health" && packet.id && packet.health === 100) {
            const avatar = remotePlayers.get(packet.id); if (avatar) avatar.visible = true;
          }
          else if ((packet.type === "round_start" || packet.type === "respawned") && packet.player) {
            playerPosition.set(packet.player.x, packet.player.y, packet.player.z); camera.position.copy(playerPosition); lastClearPosition.copy(playerPosition);
            yaw = packet.player.yaw; playerHealth = maxPlayerHealth; setHealth(maxPlayerHealth); setDead(false); setHealing(false); keys.clear();
            if (packet.player.team) { localNetworkTeam = packet.player.team; setLocalTeam(packet.player.team); refreshTeammateMarkers(); }
            if (packet.map && packet.map !== selectedMap) setSelectedMap(packet.map);
          }
          else if (packet.type === "match" && packet.match) {
            applyMatch(packet.match, packet.match.votes === 0 && packet.match.modeVotes === 0);
            if (packet.match.phase === "results" && localNetworkId && auth.currentUser) {
              const matchId = `${selectedSector}:${packet.match.phaseEndsAt}`;
              if (!recordedMatchesRef.current.has(matchId)) {
                recordedMatchesRef.current.add(matchId);
                const summary = playerSummariesRef.current[localNetworkId] ?? { kills: 0, deaths: 0 };
                const won = packet.match.mode === "TDM" || packet.match.mode === "CTP" || packet.match.mode === "CTF" ? packet.match.winningTeam === localNetworkTeam : packet.match.winnerId === localNetworkId;
                void auth.currentUser.getIdToken().then((token) => fetch("/api/player", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ matchId, kills: summary.kills, deaths: summary.deaths, won }),
                })).then((response) => {
                  if (!response.ok) recordedMatchesRef.current.delete(matchId);
                  else setCareerKills((kills) => kills + summary.kills);
                }).catch(() => recordedMatchesRef.current.delete(matchId));
              }
            }
          }
        } catch {}
      });
    } else setMultiplayerStatus("OFFLINE");
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

    // Small overlapping pools keep automatic fire responsive without cutting off the previous shot.
    const makeShotPool = (source: string, volume: number) => Array.from({ length: 8 }, () => {
      const audio = new Audio(source); audio.preload = "auto"; audio.volume = volume; return audio;
    });
    const suppressedShotPool = makeShotPool("/audio/suppressed-shot.mp3", .18);
    const unsuppressedShotPool = makeShotPool("/audio/unsuppressed-shot.mp3", .68);
    let suppressedSoundIndex = 0, unsuppressedSoundIndex = 0;
    const playShotSound = (suppressed: boolean) => {
      const pool = suppressed ? suppressedShotPool : unsuppressedShotPool;
      const index = suppressed ? suppressedSoundIndex++ : unsuppressedSoundIndex++;
      const audio = pool[index % pool.length];
      audio.pause(); audio.currentTime = 0; audio.playbackRate = .96 + Math.random() * .08;
      void audio.play().catch(() => {});
    };

    const keys = new Set<string>();
    let yaw = 0, pitch = 0, cameraYaw = 0, cameraPitch = 0.2, verticalVelocity = 0, grounded = true;
    const classStats = CLASS_STATS[playerClass];
    const primaryStats = { ...WEAPON_STATS[primary], capacity: magazineCapacity(WEAPON_STATS[primary].capacity, magazineAttachment), reload: reloadTimeWithMagazine(WEAPON_STATS[primary].reload, magazineAttachment) * classStats.reload };
    const secondaryIsMelee = secondary === "COMBAT KNIFE";
    const baseSecondaryStats = WEAPON_STATS[secondary] ?? { damage: 50, fireRate: 100, capacity: 1, reload: 0.6, range: 5, mobility: 100, spread: 0 };
    const secondaryStats = { ...baseSecondaryStats, capacity: magazineCapacity(baseSecondaryStats.capacity, secondaryMagazine), reload: reloadTimeWithMagazine(baseSecondaryStats.reload, secondaryMagazine) * classStats.reload };
    const ammoCounts = [primaryStats.capacity, secondaryStats.capacity];
    setAmmo(primaryStats.capacity);
    let ammoCount = ammoCounts[0], recoil = 0, muzzleTimer = 0, aiming = false, toggleAim = false, holdAim = false, sprinting = false, sliding = false, reloadEnd = 0, meleeSwing = 0, lastMelee = 0;
    let playerStamina = 100, staminaExhausted = false, lastSprintAt = Number.NEGATIVE_INFINITY, lastStaminaUiUpdate = 0;
    setStamina(100);
    const syncAim = () => { aiming = toggleAim || holdAim; setAdsActive(aiming); };
    const clearAim = () => { toggleAim = false; holdAim = false; syncAim(); };
    let throwableAiming = false, grenadesLeft = 2, medicalCharges = 2;
    type UtilityProjectile = { mesh: THREE.Object3D; velocity: THREE.Vector3; age: number; type: string; networkId?: string };
    const projectiles: UtilityProjectile[] = [];
    const plantedC4: UtilityProjectile[] = [];
    const plantedMines: UtilityProjectile[] = [];
    const remoteUtilities = new Map<string, UtilityProjectile>();
    const placementMaterial = new THREE.MeshBasicMaterial({ color: 0x74e6b1, transparent: true, opacity: .48, depthWrite: false });
    const placementPreview = new THREE.Mesh(new THREE.BoxGeometry(.46, .12, .32), placementMaterial);
    placementPreview.raycast = () => {}; placementPreview.visible = false; scene.add(placementPreview);
    const classTargetMarker = new THREE.Mesh(new THREE.RingGeometry(.55, .72, 24), new THREE.MeshBasicMaterial({ color: 0xff6336, transparent: true, opacity: .72, side: THREE.DoubleSide, depthWrite: false }));
    classTargetMarker.rotation.x = -Math.PI / 2; classTargetMarker.raycast = () => {}; classTargetMarker.visible = false; scene.add(classTargetMarker);
    let placementAiming = false;
    let placementPoint: { point: THREE.Vector3; normal: THREE.Vector3 } | null = null;
    let currentFireMode: FireMode = "AUTO", triggerHeld = false, currentSlot = 1, movementSpread = 1;
    let classAbilityReadyAt = 0, classAiming = false, activeDrone: THREE.Group | null = null, droneYaw = yaw, dronePitch = 0, droneTrigger = false, nextDroneShot = 0, lastDroneNetworkSend = 0;
    const classDeployables: THREE.Object3D[] = [];
    const lastShotAt = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    let nearbyDoor: typeof doors[number] | undefined;
    const activeAttachments = (): WeaponAttachments => currentSlot > 2 || (currentSlot === 2 && secondaryIsMelee)
      ? { sight: "IRON SIGHTS", muzzle: "STANDARD BARREL", tactical: "NONE", magazine: "STANDARD MAG", fireControl: "STANDARD TRIGGER" }
      : currentSlot === 1 ? primaryAttachments : secondaryAttachments;
    const maxPlayerHealth = (equipment === "ARMOR PLATING" ? 125 : 100) + classStats.healthBonus;
    let playerHealth = maxPlayerHealth, nextPadTick = 0, healEnd = 0;
    const playerPosition = new THREE.Vector3(0, PLAYER_HEIGHT, spawnZ);
    const lastClearPosition = playerPosition.clone();
    let isThirdPerson = false, orbiting = false, isCrouching = false, isProne = false, slideEnd = 0, stanceOffset = 0, crouchPoseAmount = 0, proneAmount = 0, leanDirection: -1 | 0 | 1 = 0, leanAmount = 0;
    const slideVelocity = new THREE.Vector2();
    respawnRef.current = () => {
      playerPosition.set(0, PLAYER_HEIGHT, spawnZ); camera.position.copy(playerPosition);
      lastClearPosition.copy(playerPosition);
      yaw = 0; pitch = 0; verticalVelocity = 0; playerHealth = maxPlayerHealth;
      playerStamina = 100; staminaExhausted = false; setStamina(100);
      isCrouching = false; isProne = false; sliding = false; slideEnd = 0; stanceOffset = 0; crouchPoseAmount = 0; proneAmount = 0; leanDirection = 0; leanAmount = 0; setCrouching(false); setProne(false); setLeanSide(0);
      keys.clear();
    };
    let last = performance.now();
    let nextSupplyWave = last + 60_000;
    let nextSatelliteScan = last;
    let satelliteClearTimer = 0;
    const clock = new THREE.Clock();

    const currentStance = (): PlayerStance => isProne ? "prone" : isCrouching ? "crouching" : "standing";
    const boxCollides = (box: Box, x: number, z: number, stance: PlayerStance) => {
      const collider = STANCE_COLLIDERS[stance];
      const feetY = playerPosition.y - PLAYER_HEIGHT;
      const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
      const samples = collider.halfLength > 0 ? [-collider.halfLength, 0, collider.halfLength] : [0];
      if (box.active === false || feetY + collider.height <= box.minY || feetY >= box.maxY) return false;
      return samples.some((offset) => {
        const centerX = x + forwardX * offset, centerZ = z + forwardZ * offset;
        const closestX = THREE.MathUtils.clamp(centerX, box.minX, box.maxX);
        const closestZ = THREE.MathUtils.clamp(centerZ, box.minZ, box.maxZ);
        return (centerX - closestX) ** 2 + (centerZ - closestZ) ** 2 < collider.radius ** 2;
      });
    };
    const collides = (x: number, z: number, stance: PlayerStance = currentStance()) =>
      boxes.some((box) => boxCollides(box, x, z, stance));
    const fitStanceOutsideWalls = (stance: PlayerStance) => {
      const originX = playerPosition.x, originZ = playerPosition.z;
      const blockingBoxes = boxes.filter((box) => boxCollides(box, originX, originZ, stance));
      if (blockingBoxes.length === 0) { lastClearPosition.copy(playerPosition); return true; }

      // Bias the search toward the last collision-free side of every wall. This
      // prevents a stance change from choosing the nearer point across a thin wall.
      let pushX = 0, pushZ = 0;
      blockingBoxes.forEach((box) => {
        const closestX = THREE.MathUtils.clamp(lastClearPosition.x, box.minX, box.maxX);
        const closestZ = THREE.MathUtils.clamp(lastClearPosition.z, box.minZ, box.maxZ);
        pushX += lastClearPosition.x - closestX;
        pushZ += lastClearPosition.z - closestZ;
      });
      if (Math.hypot(pushX, pushZ) < .001) { pushX = lastClearPosition.x - originX; pushZ = lastClearPosition.z - originZ; }
      const preferredAngle = Math.atan2(pushZ, pushX);
      const angleOffsets = Array.from({ length: 32 }, (_, index) => {
        if (index === 0) return 0;
        const step = Math.ceil(index / 2) * Math.PI / 16;
        return index % 2 ? step : -step;
      });

      for (let distance = .04; distance <= 1.6; distance += .04) {
        for (const angleOffset of angleOffsets) {
          const candidateX = originX + Math.cos(preferredAngle + angleOffset) * distance;
          const candidateZ = originZ + Math.sin(preferredAngle + angleOffset) * distance;
          const staysOnOriginalSide = blockingBoxes.every((box) =>
            (lastClearPosition.x < box.minX ? candidateX < box.minX : lastClearPosition.x > box.maxX ? candidateX > box.maxX : true) &&
            (lastClearPosition.z < box.minZ ? candidateZ < box.minZ : lastClearPosition.z > box.maxZ ? candidateZ > box.maxZ : true)
          );
          if (staysOnOriginalSide && !collides(candidateX, candidateZ, stance)) {
            playerPosition.x = candidateX; playerPosition.z = candidateZ;
            lastClearPosition.copy(playerPosition);
            return true;
          }
        }
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Enter" && !e.repeat && started && selectedSector !== "TRAINING SECTOR" && !adminPanelOpenRef.current) {
        e.preventDefault();
        chatOpenRef.current = true; setChatOpen(true); keys.clear();
        if (document.pointerLockElement) document.exitPointerLock();
        return;
      }
      if (chatOpenRef.current) return;
      if (e.code === "Equal" && !e.repeat && adminAuthorizedRef.current && started) {
        e.preventDefault();
        setAdminPanelOpen((open) => {
          const next = !open; adminPanelOpenRef.current = next;
          if (next && document.pointerLockElement) document.exitPointerLock();
          return next;
        });
        keys.clear();
        return;
      }
      if (adminPanelOpenRef.current) return;
      keys.add(e.code);
      if (e.code === "Tab" && !e.repeat) {
        e.preventDefault(); isThirdPerson = !isThirdPerson; setThirdPerson(isThirdPerson);
        clearAim();
        if (isThirdPerson) { cameraYaw = yaw; cameraPitch = isProne ? 0 : 0.2; }
        else { yaw = cameraYaw; pitch = 0; }
        localPlayer.visible = isThirdPerson;
      }
      if (e.code === "KeyZ" && !e.repeat && !isThirdPerson && currentSlot <= 2 && !sprinting && !sliding && !reloadEnd) {
        toggleAim = !toggleAim;
        syncAim();
      }
      if (e.code === "Space" && grounded && !adminControlsRef.current.flying) {
        if ((isProne || isCrouching) && !fitStanceOutsideWalls("standing")) return;
        isProne = false; isCrouching = false; setProne(false); setCrouching(false); verticalVelocity = 5.7; grounded = false;
      }
      if (e.code === "KeyC" && !e.repeat && grounded) {
        if (isProne) {
          if (!fitStanceOutsideWalls("crouching")) return;
          isProne = false; isCrouching = true; setProne(false);
        } else if (sprinting) {
          isCrouching = true; sliding = true; slideEnd = performance.now() + 850;
          const movementYaw = isThirdPerson ? cameraYaw : yaw;
          const slideSpeed = 10.5 * (1 - attachmentMobilityPenalty(activeAttachments()) / 100);
          slideVelocity.set(-Math.sin(movementYaw) * slideSpeed, -Math.cos(movementYaw) * slideSpeed);
        } else {
          if (isCrouching && !fitStanceOutsideWalls("standing")) return;
          sliding = false; slideEnd = 0; isCrouching = !isCrouching;
        }
        clearAim(); setCrouching(isCrouching);
      }
      if (e.code === "KeyX" && !e.repeat && grounded) {
        if (!fitStanceOutsideWalls(isProne ? "standing" : "prone")) return;
        isProne = !isProne; isCrouching = false; sliding = false; slideEnd = 0;
        if (isProne && isThirdPerson) cameraPitch = 0;
        clearAim(); setProne(isProne); setCrouching(false);
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
          clearAim();
          setReloadDuration(stats.reload);
          setReloading(true);
        }
      }
      if (e.code === "KeyB" && !e.repeat) {
        const modes: FireMode[] = activeAttachments().fireControl === "BURST TRIGGER" ? ["SEMI", "BURST", "AUTO"] : ["SEMI", "AUTO"];
        currentFireMode = modes[(modes.indexOf(currentFireMode) + 1) % modes.length];
        setFireMode(currentFireMode);
      }
      if (["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].includes(e.code) && (e.code !== "Digit5" || CLASS_ITEMS[playerClass])) {
        currentSlot = Number(e.code.slice(-1));
        setActiveSlot(currentSlot);
        if (currentFireMode === "BURST" && activeAttachments().fireControl !== "BURST TRIGGER") {
          currentFireMode = "AUTO";
          setFireMode(currentFireMode);
        }
        if (currentSlot <= 2) { ammoCount = ammoCounts[currentSlot - 1]; setAmmo(ammoCount); }
        clearAim();
        triggerHeld = false;
        throwableAiming = false;
        trajectory.visible = false;
        placementAiming = false; placementPreview.visible = false; placementPoint = null;
        classAiming = false; classTargetMarker.visible = false;
        reloadEnd = 0;
        setReloading(false);
        if (currentSlot !== 3 && healEnd) { healEnd = 0; setHealing(false); }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const applyLook = (movementX: number, movementY: number) => {
      if (isThirdPerson) {
        cameraYaw -= movementX * 0.0022;
        cameraPitch = Math.max(-0.28, Math.min(0.72, cameraPitch + movementY * 0.0022));
        return;
      }
      yaw -= movementX * 0.0022;
      pitch = Math.max(-1.48, Math.min(1.48, pitch - movementY * 0.0022));
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      if (activeDrone) { droneYaw -= e.movementX * .0026; dronePitch = THREE.MathUtils.clamp(dronePitch - e.movementY * .0022, -.72, .62); return; }
      if (isThirdPerson && !orbiting) return;
      applyLook(e.movementX, e.movementY);
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
    const showDamageNumber = (point: THREE.Vector3, damage: number, headshot: boolean) => {
      if (!damageNumbersEnabledRef.current) return;
      const projected = point.clone().project(camera);
      if (projected.z < -1 || projected.z > 1) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const entry: DamageNumber = {
        id: Date.now() + Math.random(),
        damage: Math.round(damage),
        x: rect.left + (projected.x + 1) * rect.width / 2,
        y: rect.top + (1 - projected.y) * rect.height / 2,
        headshot,
      };
      setDamageNumbers((numbers) => [...numbers.slice(-11), entry]);
      window.setTimeout(() => setDamageNumbers((numbers) => numbers.filter((number) => number.id !== entry.id)), 850);
    };
    const addKill = (dummy: THREE.Group, weapon: string, headshot: boolean) => {
      const entry = { id: Date.now() + Math.random(), killer: playerCallsignRef.current, victim: dummy.userData.callsign ?? "TRAINING TARGET", weapon, headshot };
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
      const adminDamage = adminRoleRef.current === "owner" ? adminControlsRef.current.damageMultiplier : 1;
      const weapon = currentSlot === 1 ? primary : secondary;
      const remotePlayerId = hit.object.userData.remotePlayerId as string | undefined;
      if (remotePlayerId) {
        const dealtDamage = damage * multiplier * adminDamage;
        multiplayerSendRef.current({ type: "hit", targetId: remotePlayerId, damage: damage * multiplier, weapon, headshot: multiplier >= 2 });
        showDamageNumber(hit.point, dealtDamage, multiplier >= 2);
        return;
      }
      const dummy = hit.object.userData.dummy as THREE.Group | undefined;
      if (dummy?.visible) showDamageNumber(hit.point, damage * multiplier * adminDamage, multiplier >= 2);
      damageDummyGroup(dummy, damage * multiplier * adminDamage, weapon, multiplier >= 2);
    };
    adminCommandRef.current = (command) => {
      if (adminRoleRef.current !== "owner") return;
      if (command === "refill_ammo") {
        ammoCounts[0] = primaryStats.capacity; ammoCounts[1] = secondaryStats.capacity;
        ammoCount = ammoCounts[currentSlot - 1] ?? ammoCount; setAmmo(ammoCount);
      } else if (command === "refill_medical") {
        medicalCharges = 9; setMedicalCount(medicalCharges);
      } else if (command === "refill_utility") {
        grenadesLeft = 9; setUtilityCount(grenadesLeft);
      } else if (command === "restore_health") {
        playerHealth = maxPlayerHealth; setHealth(maxPlayerHealth); setDead(false);
      } else if (command === "kill_targets") {
        dummies.filter((dummy) => dummy.visible).forEach((dummy) => damageDummyGroup(dummy, dummy.userData.health, "ADMIN", false));
      }
    };
    const getThrow = () => {
      const direction = new THREE.Vector3(); camera.getWorldDirection(direction);
      const start = (isThirdPerson ? playerPosition : camera.position).clone().addScaledVector(direction, 0.65).add(new THREE.Vector3(0, -0.18, 0));
      const velocity = direction.multiplyScalar(13).add(new THREE.Vector3(0, 3.8, 0));
      return { start, velocity };
    };
    const createThrownUtilityMesh = (utilityType: string) => {
      const flash = utilityType === "FLASHBANG", smoke = utilityType === "SMOKE GRENADE", gas = utilityType === "GAS BOMB";
      const grenade = new THREE.Group();
      if (utilityType === "C4 CHARGE") {
        const charge = new THREE.Mesh(new THREE.BoxGeometry(.42, .3, .12), weaponMaterial(0x5b6652, .2)); charge.castShadow = true; grenade.add(charge);
      } else if (utilityType === "LANDMINE") {
        const mine = new THREE.Mesh(new THREE.CylinderGeometry(.25, .28, .11, 16), weaponMaterial(0x48513d, .45)); mine.castShadow = true; grenade.add(mine);
      } else {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(flash ? .085 : .11, flash ? .085 : .1, flash ? .38 : .31, 12), weaponMaterial(flash ? 0xb8c1c0 : gas ? 0x718b45 : smoke ? 0x7d8787 : 0x495b43, .35));
        body.castShadow = true; grenade.add(body);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(.16, .07, .11), weaponMaterial(0x202729, .5)); cap.position.y = .19; cap.castShadow = true; grenade.add(cap);
        const pin = new THREE.Mesh(new THREE.TorusGeometry(.065, .012, 7, 14), weaponMaterial(0x9da5a4, .75)); pin.position.set(.11, .2, 0); pin.rotation.x = Math.PI / 2; pin.castShadow = true; grenade.add(pin);
      }
      grenade.traverse((object) => { if (object instanceof THREE.Mesh) object.raycast = () => {}; });
      return grenade;
    };
    const spawnRemoteUtility = (utilityId: string, utilityType: string, position: number[], velocity: number[]) => {
      const existing = remoteUtilities.get(utilityId); if (existing) scene.remove(existing.mesh);
      const mesh = createThrownUtilityMesh(utilityType); mesh.position.fromArray(position); scene.add(mesh);
      remoteUtilities.set(utilityId, { mesh, velocity: new THREE.Vector3().fromArray(velocity), age: 0, type: utilityType, networkId: utilityId });
    };
    const spawnExplosionVisual = (position: THREE.Vector3, utilityType: string) => {
      const flashbang = utilityType === "FLASHBANG";
      const power = utilityType === "C4 CHARGE" ? 1.35 : utilityType === "LANDMINE" ? 1.08 : flashbang ? .82 : 1;
      const effect = new THREE.Group(); effect.position.copy(position); scene.add(effect);
      const noRaycast = (mesh: THREE.Object3D) => { mesh.raycast = () => {}; return mesh; };
      const additive = THREE.AdditiveBlending;

      const core = noRaycast(new THREE.Mesh(
        new THREE.IcosahedronGeometry(.48 * power, 2),
        new THREE.MeshBasicMaterial({ color: flashbang ? 0xffffff : 0xfff2b2, transparent: true, opacity: 1, blending: additive, depthWrite: false }),
      )) as THREE.Mesh;
      effect.add(core);
      const shell = noRaycast(new THREE.Mesh(
        new THREE.SphereGeometry(.62 * power, 18, 12),
        new THREE.MeshBasicMaterial({ color: flashbang ? 0xdffaff : 0xff6a18, transparent: true, opacity: .72, blending: additive, depthWrite: false, side: THREE.DoubleSide }),
      )) as THREE.Mesh;
      effect.add(shell);
      const shockwave = noRaycast(new THREE.Mesh(
        new THREE.TorusGeometry(.7 * power, .035 * power, 6, 40),
        new THREE.MeshBasicMaterial({ color: flashbang ? 0xeaffff : 0xffc06a, transparent: true, opacity: .82, blending: additive, depthWrite: false }),
      )) as THREE.Mesh;
      shockwave.rotation.x = Math.PI / 2; effect.add(shockwave);
      const light = new THREE.PointLight(flashbang ? 0xe8ffff : 0xff7b25, flashbang ? 150 : 105 * power, 14 * power, 2);
      light.position.y = .35; effect.add(light);

      const lobes: { mesh: THREE.Mesh; direction: THREE.Vector3; speed: number }[] = [];
      if (!flashbang) for (let i = 0; i < 9; i++) {
        const mesh = noRaycast(new THREE.Mesh(
          new THREE.IcosahedronGeometry((.22 + Math.random() * .24) * power, 1),
          new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffdc72 : 0xff5b16, transparent: true, opacity: .86, blending: additive, depthWrite: false }),
        )) as THREE.Mesh;
        const angle = (i / 9) * Math.PI * 2 + Math.random() * .45;
        const direction = new THREE.Vector3(Math.cos(angle), .25 + Math.random() * .8, Math.sin(angle)).normalize();
        effect.add(mesh); lobes.push({ mesh, direction, speed: (1.5 + Math.random() * 2.3) * power });
      }

      const sparkCount = flashbang ? 28 : Math.round(48 * power);
      const sparkPositions = new Float32Array(sparkCount * 3);
      const sparkVelocities: THREE.Vector3[] = [];
      for (let i = 0; i < sparkCount; i++) {
        const angle = Math.random() * Math.PI * 2, speed = (3.5 + Math.random() * 8) * power;
        sparkVelocities.push(new THREE.Vector3(Math.cos(angle) * speed, 2 + Math.random() * 7, Math.sin(angle) * speed));
      }
      const sparkGeometry = new THREE.BufferGeometry(); sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
      const sparkMaterial = new THREE.PointsMaterial({ color: flashbang ? 0xf2ffff : 0xffc05a, size: .09 * power, transparent: true, opacity: 1, blending: additive, depthWrite: false, sizeAttenuation: true });
      const sparks = noRaycast(new THREE.Points(sparkGeometry, sparkMaterial)) as THREE.Points; effect.add(sparks);

      const smokePuffs: THREE.Mesh[] = [];
      if (!flashbang) for (let i = 0; i < 7; i++) {
        const puff = noRaycast(new THREE.Mesh(
          new THREE.IcosahedronGeometry((.3 + Math.random() * .2) * power, 1),
          new THREE.MeshBasicMaterial({ color: i % 2 ? 0x333638 : 0x56514a, transparent: true, opacity: .42, depthWrite: false }),
        )) as THREE.Mesh;
        const angle = Math.random() * Math.PI * 2;
        puff.position.set(Math.cos(angle) * .25, .1 + Math.random() * .35, Math.sin(angle) * .25); effect.add(puff); smokePuffs.push(puff);
      }

      if (!flashbang) {
        const scorchMaterial = new THREE.MeshBasicMaterial({ color: 0x171411, transparent: true, opacity: .62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
        const scorch = noRaycast(new THREE.Mesh(new THREE.CircleGeometry(1.25 * power, 24), scorchMaterial)) as THREE.Mesh;
        scorch.rotation.x = -Math.PI / 2; scorch.position.set(position.x, terrainHeightAt(position.x, position.z) + .018, position.z); scene.add(scorch);
        window.setTimeout(() => { scene.remove(scorch); scorch.geometry.dispose(); scorchMaterial.dispose(); }, 7000);
      }

      const startedAt = performance.now(); let previous = startedAt;
      const animateExplosion = (now: number) => {
        const elapsed = (now - startedAt) / 1000, dt = Math.min(.04, (now - previous) / 1000); previous = now;
        const blastPhase = Math.min(1, elapsed / .28), fade = Math.max(0, 1 - elapsed / 1.45);
        core.scale.setScalar(.7 + blastPhase * 3.8); (core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - elapsed / .24);
        shell.scale.setScalar(.65 + blastPhase * 4.8); (shell.material as THREE.MeshBasicMaterial).opacity = Math.max(0, .72 * (1 - elapsed / .42));
        shockwave.scale.setScalar(1 + elapsed * 8.5); (shockwave.material as THREE.MeshBasicMaterial).opacity = Math.max(0, .82 * (1 - elapsed / .48));
        light.intensity = (flashbang ? 150 : 105 * power) * Math.max(0, 1 - elapsed / .32) ** 2;
        lobes.forEach(({ mesh, direction, speed }, index) => { mesh.position.addScaledVector(direction, speed * dt); mesh.position.y += dt * (.5 - elapsed * 1.3); mesh.scale.setScalar(1 + elapsed * (1.8 + index % 3 * .3)); (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, .86 * (1 - elapsed / .58)); });
        const positions = sparkGeometry.attributes.position as THREE.BufferAttribute;
        sparkVelocities.forEach((velocity, index) => { positions.setXYZ(index, positions.getX(index) + velocity.x * dt, positions.getY(index) + velocity.y * dt, positions.getZ(index) + velocity.z * dt); velocity.y -= 15 * dt; velocity.multiplyScalar(.985); });
        positions.needsUpdate = true; sparkMaterial.opacity = Math.max(0, 1 - elapsed / .9);
        smokePuffs.forEach((puff, index) => { puff.position.y += dt * (.7 + index * .05); puff.position.x += Math.sin(index * 2.1) * dt * .18; puff.scale.setScalar(1 + elapsed * (2.1 + index * .08)); (puff.material as THREE.MeshBasicMaterial).opacity = .42 * fade; });
        if (elapsed < 1.45) requestAnimationFrame(animateExplosion);
        else { scene.remove(effect); effect.traverse((object) => { if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return; object.geometry.dispose(); const mats = Array.isArray(object.material) ? object.material : [object.material]; mats.forEach((entry) => entry.dispose()); }); }
      };
      requestAnimationFrame(animateExplosion);
    };
    const showRemoteUtilityDetonation = (utilityId: string, utilityType: string, position: number[]) => {
      const remote = remoteUtilities.get(utilityId); if (remote) { scene.remove(remote.mesh); remoteUtilities.delete(utilityId); }
      const worldPosition = new THREE.Vector3().fromArray(position);
      if (utilityType === "SMOKE GRENADE" || utilityType === "GAS BOMB") {
        const cloud = new THREE.Group(); cloud.position.copy(worldPosition); scene.add(cloud);
        for (let i = 0; i < 36; i++) {
          const gas = utilityType === "GAS BOMB";
          const puff = new THREE.Mesh(new THREE.SphereGeometry(.9 + Math.random() * .7, 8, 6), new THREE.MeshBasicMaterial({ color: gas ? 0x789447 : 0x7f898b, transparent: true, opacity: gas ? .3 : .38, depthWrite: false }));
          puff.raycast = () => {}; puff.position.set((Math.random() - .5) * 4.6, Math.random() * 2.8, (Math.random() - .5) * 4.6); cloud.add(puff);
        }
        window.setTimeout(() => scene.remove(cloud), 9000);
      } else {
        spawnExplosionVisual(worldPosition, utilityType);
      }
    };
    const throwUtility = () => {
      if (grenadesLeft <= 0) return;
      const { start, velocity } = getThrow();
      const grenade = createThrownUtilityMesh(utility); grenade.position.copy(start); scene.add(grenade);
      const networkId = crypto.randomUUID();
      const projectile = { mesh: grenade, velocity, age: 0, type: utility, networkId };
      projectiles.push(projectile);
      if (utility === "C4 CHARGE") plantedC4.push(projectile);
      multiplayerSendRef.current({ type: "utility_throw", utilityId: networkId, utility, position: start.toArray(), velocity: velocity.toArray() });
      grenadesLeft -= 1; setUtilityCount(grenadesLeft);
    };
    const placeUtility = () => {
      if (!placementPoint || grenadesLeft <= 0 || (utility !== "C4 CHARGE" && utility !== "LANDMINE")) return;
      const mesh = utility === "C4 CHARGE"
        ? new THREE.Mesh(new THREE.BoxGeometry(.42, .12, .3), weaponMaterial(0x5b6652, .2))
        : new THREE.Mesh(new THREE.CylinderGeometry(.25, .28, .1, 16), weaponMaterial(0x48513d, .45));
      mesh.position.copy(placementPoint.point).addScaledVector(placementPoint.normal, .065);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), placementPoint.normal);
      mesh.castShadow = true; mesh.raycast = () => {}; scene.add(mesh);
      const networkId = crypto.randomUUID();
      const placed = { mesh, velocity: new THREE.Vector3(), age: 0, type: utility, networkId };
      if (utility === "C4 CHARGE") plantedC4.push(placed); else plantedMines.push(placed);
      multiplayerSendRef.current({ type: "utility_throw", utilityId: networkId, utility, position: mesh.position.toArray(), velocity: [0, 0, 0] });
      grenadesLeft -= 1; setUtilityCount(grenadesLeft);
    };
    const detonate = (projectile: { mesh: THREE.Object3D; type: string }) => {
      const position = projectile.mesh.position.clone();
      scene.remove(projectile.mesh);
      const networkId = (projectile as UtilityProjectile).networkId;
      if (networkId) multiplayerSendRef.current({ type: "utility_detonate", utilityId: networkId, utility: projectile.type, position: position.toArray() });
      const damageRemotePlayers = (radius: number, maxDamage: number, weapon: string, falloff = true) => {
        remotePlayers.forEach((avatar, targetId) => {
          if (!avatar.visible) return;
          const distance = avatar.position.distanceTo(position);
          if (distance >= radius) return;
          multiplayerSendRef.current({ type: "hit", targetId, damage: falloff ? Math.round(maxDamage * (1 - distance / radius)) : maxDamage, weapon, headshot: false });
        });
      };
      const applyExplosion = (radius: number, maxDamage: number, weapon: string) => {
        dummies.forEach((dummy) => { const distance = dummy.position.distanceTo(position); if (distance < radius) damageDummyGroup(dummy, Math.round(maxDamage * (1 - distance / radius)), weapon); });
        damageRemotePlayers(radius, maxDamage, weapon);
        const distance = playerPosition.distanceTo(position);
        if (distance < radius && !(adminRoleRef.current === "owner" && adminControlsRef.current.godMode)) { playerHealth = Math.max(0, playerHealth - Math.round(maxDamage * (1 - distance / radius))); setHealth(playerHealth); if (playerHealth <= 0) { setDead(true); document.exitPointerLock(); } }
      };
      if (projectile.type === "SMOKE GRENADE" || projectile.type === "GAS BOMB") {
        const gas = projectile.type === "GAS BOMB";
        const cloud = new THREE.Group(); cloud.position.copy(position); scene.add(cloud);
        for (let i = 0; i < 36; i++) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.9 + Math.random() * 0.7, 8, 6), new THREE.MeshBasicMaterial({ color: gas ? 0x789447 : 0x7f898b, transparent: true, opacity: gas ? .3 : 0.38, depthWrite: false }));
          puff.raycast = () => {}; puff.position.set((Math.random() - .5) * 4.6, Math.random() * 2.8, (Math.random() - .5) * 4.6); cloud.add(puff);
        }
        if (gas) {
          const gasTick = window.setInterval(() => {
            dummies.forEach((dummy) => { if (dummy.position.distanceTo(position) < 5) damageDummyGroup(dummy, 5, "GAS BOMB"); });
            damageRemotePlayers(5, 5, "GAS BOMB", false);
            if (playerPosition.distanceTo(position) < 5 && !(adminRoleRef.current === "owner" && adminControlsRef.current.godMode)) { playerHealth = Math.max(0, playerHealth - 4); setHealth(playerHealth); if (playerHealth <= 0) { setDead(true); document.exitPointerLock(); } }
          }, 500);
          window.setTimeout(() => window.clearInterval(gasTick), 9000);
        }
        window.setTimeout(() => scene.remove(cloud), 9000);
      } else {
        spawnExplosionVisual(position, projectile.type);
        if (projectile.type === "FLASHBANG" && playerPosition.distanceTo(position) < 13) {
          setFlashed(true); window.setTimeout(() => setFlashed(false), 1700);
        }
        if (projectile.type === "FLASHBANG") {
          remotePlayers.forEach((avatar, targetId) => {
            if (!avatar.visible) return;
            const distance = avatar.position.distanceTo(position);
            if (distance < 13) multiplayerSendRef.current({ type: "utility_effect", targetId, effect: "flash", duration: Math.round(1700 * (1 - distance / 13)) });
          });
        }
        if (projectile.type === "FRAG GRENADE") {
          applyExplosion(7, 110, "FRAG GRENADE");
        }
        if (projectile.type === "C4 CHARGE") applyExplosion(8, 145, "C4 CHARGE");
        if (projectile.type === "LANDMINE") applyExplosion(5.5, 125, "LANDMINE");
      }
    };
    const classTarget = () => {
      raycaster.setFromCamera(getAimNdc(), camera);
      const hit = raycaster.intersectObjects(scene.children, true).find((result) => result.distance > .5 && result.object !== camera);
      return hit?.point.clone() ?? raycaster.ray.at(38, new THREE.Vector3());
    };
    const classBlast = (position: THREE.Vector3, radius: number, damage: number, weapon: string) => {
      spawnExplosionVisual(position, weapon);
      dummies.forEach((dummy) => { const distance = dummy.position.distanceTo(position); if (distance < radius) damageDummyGroup(dummy, Math.round(damage * (1 - distance / radius)), weapon); });
      remotePlayers.forEach((avatar, targetId) => { const distance = avatar.position.distanceTo(position); if (avatar.visible && distance < radius) multiplayerSendRef.current({ type: "hit", targetId, damage: Math.round(damage * (1 - distance / radius)), weapon, headshot: false }); });
      multiplayerSendRef.current({ type: "class_effect", effect: weapon, position: position.toArray() });
    };
    const endDroneControl = () => {
      if (!activeDrone) return;
      multiplayerSendRef.current({ type:"drone_state", active:false });
      scene.remove(activeDrone); activeDrone = null; droneTrigger = false; setDronePiloting(false);
      camera.position.copy(playerPosition); renderer.domElement.requestPointerLock?.();
    };
    droneExitRef.current = endDroneControl;
    const callAirstrike = (x: number, z: number) => {
      const now = performance.now();
      if (now < classAbilityReadyAt) return;
      classAbilityReadyAt = now + 35_000; setClassCooldown(35); setAirstrikeMapOpen(false);
      const target = new THREE.Vector3(x, terrainHeightAt(x, z) + .05, z);
      [-8, -4, 0, 4, 8].forEach((offset, index) => window.setTimeout(() => classBlast(target.clone().add(new THREE.Vector3(offset, 0, index % 2 ? 2 : -2)), 7, 105, "AIRSTRIKE"), index * 420));
      renderer.domElement.requestPointerLock?.();
    };
    airstrikeTargetRef.current = callAirstrike;
    const useClassItem = () => {
      const now = performance.now();
      if (now < classAbilityReadyAt) return;
      const target = classTarget();
      if (playerClass === "MORTAR") {
        classAbilityReadyAt = now + 18_000; setClassCooldown(18);
        const shell = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), material(0x2f382d, .5, .5)); shell.position.copy(target).add(new THREE.Vector3(0, 32, 0)); scene.add(shell);
        const fall = window.setInterval(() => { shell.position.y -= 1.8; if (shell.position.y <= target.y + .15) { window.clearInterval(fall); scene.remove(shell); classBlast(target, 9, 150, "MORTAR"); } }, 16);
      } else if (playerClass === "AIRSTRIKE") {
        setRadarPings([{id:"local",x:playerPosition.x,z:playerPosition.z,local:true},...[...remotePlayers.entries()].filter(([,avatar])=>avatar.visible).map(([id,avatar])=>({id,x:avatar.position.x,z:avatar.position.z,local:false}))]);
        setAirstrikeMapOpen(true); classTargetMarker.visible = false; document.exitPointerLock();
      } else if (playerClass === "DEMOLITION") {
        classAbilityReadyAt = now + 8_000; setClassCooldown(8); classBlast(target, 8, 140, "ROCKET LAUNCHER");
      } else if (playerClass === "ENGINEER") {
        classAbilityReadyAt = now + 25_000; setClassCooldown(25); classDeployables.splice(0).forEach((item) => scene.remove(item));
        const sentry = new THREE.Group(); sentry.position.copy(target); const base = new THREE.Mesh(new THREE.BoxGeometry(.65, .45, .65), material(0x394744, .55, .4)); base.position.y=.28; const turret = new THREE.Mesh(new THREE.BoxGeometry(.28, .22, .72), material(0x171d1f, .45, .65)); turret.position.set(0,.66,-.28); sentry.add(base,turret); scene.add(sentry); classDeployables.push(sentry);
        const sentryFire = window.setInterval(() => { if (!sentry.parent) { window.clearInterval(sentryFire); return; } const remoteTargets=[...remotePlayers.entries()].filter(([,avatar])=>avatar.visible&&avatar.position.distanceTo(sentry.position)<32).map(([id,avatar])=>({id,avatar})); const dummyTargets=dummies.filter((dummy)=>dummy.visible&&dummy.position.distanceTo(sentry.position)<32).map((avatar)=>({id:"",avatar})); const nearest=[...remoteTargets,...dummyTargets].sort((a,b)=>a.avatar.position.distanceTo(sentry.position)-b.avatar.position.distanceTo(sentry.position))[0]; if(nearest){sentry.lookAt(nearest.avatar.position.clone().add(new THREE.Vector3(0,1.1,0))); if(nearest.id) multiplayerSendRef.current({type:"hit",targetId:nearest.id,damage:10,weapon:"SENTRY",headshot:false}); else damageDummyGroup(nearest.avatar,10,"SENTRY"); const start=sentry.position.clone().add(new THREE.Vector3(0,.66,0)); const end=nearest.avatar.position.clone().add(new THREE.Vector3(0,1.1,0)); const tracer=new THREE.Line(new THREE.BufferGeometry().setFromPoints([start,end]),new THREE.LineBasicMaterial({color:0xffb45f,transparent:true,opacity:.9})); tracer.raycast=()=>{}; scene.add(tracer); window.setTimeout(()=>scene.remove(tracer),70); } }, 420);
        window.setTimeout(() => { scene.remove(sentry); window.clearInterval(sentryFire); }, 30_000);
      } else if (playerClass === "DRONE") {
        classAbilityReadyAt = now + 30_000; setClassCooldown(30);
        if (activeDrone) endDroneControl();
        const drone = buildDroneVisual(); drone.position.copy(playerPosition).add(new THREE.Vector3(0, 3, 0)); scene.add(drone); classDeployables.push(drone); activeDrone=drone; droneYaw=yaw; dronePitch=0; setDronePiloting(true); multiplayerSendRef.current({type:"drone_state",active:true,position:drone.position.toArray(),rotation:[0,droneYaw,0]});
        window.setTimeout(() => { if (activeDrone === drone) endDroneControl(); else scene.remove(drone); }, 45_000);
      }
    };
    const fireRound = () => {
      if ((!isTouchInput && document.pointerLockElement !== renderer.domElement) || sprinting || sliding || currentSlot > 2 || reloadEnd > 0) return;
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
      const shotStats = currentSlot === 1 ? primaryStats : secondaryStats;
      const shotInterval = 60000 / (shotStats.fireRate * 10);
      const shotTime = performance.now();
      if (shotTime - lastShotAt[currentSlot - 1] < shotInterval) return;
      if (ammoCount <= 0) return;
      lastShotAt[currentSlot - 1] = shotTime;
      ammoCount -= 1;
      ammoCounts[currentSlot - 1] = ammoCount;
      setAmmo(ammoCount);
      playShotSound(activeAttachments().muzzle === "SUPPRESSOR");
      recoil = Math.min(recoil + 0.055, 0.11);
      muzzle.intensity = activeAttachments().muzzle === "SUPPRESSOR" ? 5 : 35;
      muzzleTimer = 0.045;
      const tracerStart = new THREE.Vector3();
      const worldMuzzle = (currentSlot === 1 ? worldPrimary : worldSecondary).getObjectByName("muzzleAnchor");
      (isThirdPerson && worldMuzzle ? worldMuzzle : currentSlot === 1 ? primaryWeapon.muzzleAnchor : secondaryWeapon.muzzleAnchor).getWorldPosition(tracerStart);
      const pelletCount = shotStats.pellets ?? 1;
      const networkTracerEnds: number[][] = [];
      const burstAccuracyPenalty = activeAttachments().fireControl === "BURST TRIGGER" ? 1.25 : 1;
      const spreadDegrees = shotStats.spread * classStats.spread * burstAccuracyPenalty * (aiming ? 0.42 : 1) * movementSpread;
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
        networkTracerEnds.push(tracerEnd.toArray());
        const tracerMaterial = new THREE.LineBasicMaterial({ color: pelletCount > 1 ? 0xffd09a : 0xffb06b, transparent: true, opacity: 0.82 });
        const visualTracerStart = isThirdPerson ? ballisticOrigin : tracerStart;
        const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([visualTracerStart, tracerEnd]), tracerMaterial);
        tracer.raycast = () => {};
        scene.add(tracer);
        window.setTimeout(() => {
          scene.remove(tracer); tracer.geometry.dispose(); tracerMaterial.dispose();
        }, pelletCount > 1 ? 48 : 65);
        if (hit) {
          damageDummy(hit, shotStats.damage * classStats.damage);
          const impact = new THREE.Mesh(impactGeometry, impactMaterial);
          impact.raycast = () => {};
          impact.position.copy(hit.point).addScaledVector(hit.face?.normal ?? new THREE.Vector3(0, 1, 0), 0.025);
          scene.add(impact); window.setTimeout(() => scene.remove(impact), 1800);
        }
      }
      multiplayerSendRef.current({ type: "shot", tracerEnds: networkTracerEnds });
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!isTouchInput && document.pointerLockElement !== renderer.domElement) return;
      if (e.button === 2) {
        if (activeDrone) { endDroneControl(); return; }
        if (currentSlot === 4 && utility === "C4 CHARGE") {
          plantedC4.splice(0).forEach((charge) => detonate(charge));
          return;
        }
        if (isThirdPerson) orbiting = true; else { holdAim = true; syncAim(); } return;
      }
      if (e.button !== 0 || sprinting || sliding) return;
      if (activeDrone) { droneTrigger = true; return; }
      if (currentSlot === 5) { classAiming = true; classTargetMarker.visible = true; return; }
      if (currentSlot === 3) {
        if (medicalCharges > 0 && playerHealth < maxPlayerHealth && !healEnd) {
          const medicalStats = MEDICAL_STATS[medical];
          const classHealDuration = medicalStats.duration * classStats.healTime;
          healEnd = performance.now() + classHealDuration * 1000;
          setHealDuration(classHealDuration); setHealing(true);
        }
        return;
      }
      if (currentSlot === 4) {
        if (utility === "C4 CHARGE" || utility === "LANDMINE") { placementAiming = grenadesLeft > 0; placementPreview.visible = placementAiming; return; }
        throwableAiming = grenadesLeft > 0; trajectory.visible = throwableAiming; return;
      }
      triggerHeld = true;
      if (currentFireMode === "SEMI") fireRound();
      if (currentFireMode === "BURST") {
        const burstSlot = currentSlot;
        const burstStats = burstSlot === 1 ? primaryStats : secondaryStats;
        const burstInterval = 60000 / (burstStats.fireRate * 10);
        [0, burstInterval, burstInterval * 2].forEach((delay) => window.setTimeout(() => {
          if (currentSlot === burstSlot && !sprinting && !sliding) fireRound();
        }, delay));
      }
      if (currentFireMode === "AUTO") fireRound();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        triggerHeld = false;
        droneTrigger = false;
        if (classAiming) { classAiming = false; classTargetMarker.visible = false; useClassItem(); }
        if (placementAiming) { placeUtility(); placementAiming = false; placementPreview.visible = false; placementPoint = null; }
        if (throwableAiming) { throwableAiming = false; trajectory.visible = false; throwUtility(); }
      }
      if (e.button === 2) { holdAim = false; orbiting = false; syncAim(); }
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onMobileLook = (event: Event) => {
      const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail;
      applyLook(x * 1.7, y * 1.7);
    };
    const onMobileMove = (event: Event) => {
      const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail;
      mobileMove.set(x, y);
    };
    const onMobileFireStart = () => onMouseDown({ button: 0 } as MouseEvent);
    const onMobileFireEnd = () => onMouseUp({ button: 0 } as MouseEvent);
    const onMobileAim = (event: Event) => {
      toggleAim = (event as CustomEvent<boolean>).detail;
      syncAim();
    };
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (!isLocked) { clearAim(); orbiting = false; triggerHeld = false; throwableAiming = false; trajectory.visible = false; placementAiming = false; placementPreview.visible = false; placementPoint = null; classAiming = false; classTargetMarker.visible = false; keys.clear(); }
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
    window.addEventListener("mobile-look", onMobileLook);
    window.addEventListener("mobile-move", onMobileMove);
    window.addEventListener("mobile-fire-start", onMobileFireStart);
    window.addEventListener("mobile-fire-end", onMobileFireEnd);
    window.addEventListener("mobile-aim", onMobileAim);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (equipment === "SATELLITE GPS" && now >= nextSatelliteScan) {
        nextSatelliteScan = now + 10_000;
        setRadarPings([
          { id: "local", x: playerPosition.x, z: playerPosition.z, local: true },
          ...[...remotePlayers.entries()].filter(([, avatar]) => avatar.visible).map(([id, avatar]) => ({ id, x: avatar.position.x, z: avatar.position.z, local: false })),
        ]);
        window.clearTimeout(satelliteClearTimer);
        satelliteClearTimer = window.setTimeout(() => setRadarPings([]), 2500);
      }
      if (equipment === "HEAT VISION GOGGLES") {
        [...dummies, ...remotePlayers.values()].forEach((actor) => {
          const throughWalls = actor.visible && actor.position.distanceTo(playerPosition) <= HEAT_VISION_WALL_RANGE;
          (actor.userData.thermalMaterials as THREE.MeshStandardMaterial[] | undefined)?.forEach((actorMaterial) => {
            if (actorMaterial.depthTest === !throughWalls) return;
            actorMaterial.depthTest = !throughWalls;
            actorMaterial.needsUpdate = true;
          });
          actor.renderOrder = throughWalls ? 20 : 0;
        });
      }
      if (now >= nextSupplyWave) { spawnSupplyWave(); nextSupplyWave = now + 60_000; }
      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch, yaw, 0);

      const input = isTouchInput ? mobileMove.clone() : new THREE.Vector2(
        Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
        Number(keys.has("KeyW")) - Number(keys.has("KeyS"))
      );
      if (input.lengthSq() > 0) input.normalize();
      if (activeDrone) {
        const forward = new THREE.Vector3(-Math.sin(droneYaw) * Math.cos(dronePitch), Math.sin(dronePitch), -Math.cos(droneYaw) * Math.cos(dronePitch));
        const right = new THREE.Vector3(Math.cos(droneYaw), 0, -Math.sin(droneYaw));
        activeDrone.position.add(forward.clone().multiplyScalar(input.y).addScaledVector(right, input.x).multiplyScalar(dt * (keys.has("ShiftLeft") ? 13 : 8)));
        activeDrone.position.y = THREE.MathUtils.clamp(activeDrone.position.y, terrainHeightAt(activeDrone.position.x, activeDrone.position.z) + 1.2, 22);
        activeDrone.rotation.set(dronePitch * .18, droneYaw, -input.x * .18);
        if (droneTrigger && now >= nextDroneShot) {
          nextDroneShot = now + 125;
          const origin = activeDrone.position.clone().addScaledVector(forward, .5);
          raycaster.set(origin, forward);
          const hit = raycaster.intersectObjects([...dummies, ...remotePlayers.values()], true).find((result) => result.distance < 70);
          const end = hit?.point.clone() ?? origin.clone().addScaledVector(forward, 70);
          const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, end]), new THREE.LineBasicMaterial({ color: 0xffb56e, transparent: true, opacity: .9 })); tracer.raycast = () => {}; scene.add(tracer); window.setTimeout(() => scene.remove(tracer), 65);
          if (hit) { let hitNode:THREE.Object3D|null=hit.object; let targetId:string|undefined; while(hitNode&&!targetId){targetId=hitNode.userData.remotePlayerId as string|undefined;hitNode=hitNode.parent;} if(targetId) multiplayerSendRef.current({ type: "hit", targetId, damage: 7, weapon: "ATTACK DRONE", headshot: false }); else damageDummy(hit, 7); }
          multiplayerSendRef.current({type:"shot",tracerEnds:[end.toArray()]});
        }
        if(multiplayerSocket?.readyState===WebSocket.OPEN&&now-lastDroneNetworkSend>=66){lastDroneNetworkSend=now;multiplayerSendRef.current({type:"drone_state",active:true,position:activeDrone.position.toArray(),rotation:[activeDrone.rotation.x,activeDrone.rotation.y,activeDrone.rotation.z]});}
        input.set(0, 0);
      }
      if (sliding && now >= slideEnd) { sliding = false; slideEnd = 0; }
      const onBeachDock = beachMap && Math.abs(playerPosition.x)<5.5 && playerPosition.z < -4.2 && playerPosition.z > -46;
      const inBeachWater = beachMap && playerPosition.z < -8.2 && !onBeachDock;
      const sprintRequested = ((isTouchInput && input.length() > .82 && input.y > .25) || keys.has("ShiftLeft") || keys.has("ShiftRight")) && input.y > 0 && input.lengthSq() > 0;
      if (staminaExhausted && playerStamina >= 25) staminaExhausted = false;
      sprinting = !staminaExhausted && playerStamina > 0 && !isCrouching && !isProne && !sliding && sprintRequested;
      if (inBeachWater) { sprinting = false; sliding = false; }
      if (sprinting) {
        playerStamina = Math.max(0, playerStamina - 18 * dt);
        lastSprintAt = now;
        if (playerStamina <= 0) { playerStamina = 0; staminaExhausted = true; sprinting = false; }
      } else if (now - lastSprintAt >= 800) {
        playerStamina = Math.min(100, playerStamina + 14 * dt);
      }
      if (now - lastStaminaUiUpdate >= 80) { lastStaminaUiUpdate = now; setStamina(Math.round(playerStamina)); }
      if (sprinting || sliding) clearAim();
      // The creek follows a slightly diagonal north/south channel through the forest.
      const inForestCreek = forestMap && Math.abs((playerPosition.x + 10) + playerPosition.z * .08) < 3.5 && Math.abs(playerPosition.z) < 42;
      const baseSpeed = isProne ? 1.55 : isCrouching ? 2.8 : sprinting ? 8.2 : aiming ? 3.8 : 5.2;
      const speed = baseSpeed * classStats.speed * (1 - attachmentMobilityPenalty(activeAttachments()) / 100) * (inForestCreek ? .52 : inBeachWater ? .58 : 1);
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
      if (inForestCreek) {
        // A steady downstream current carries players toward the southern boundary.
        const currentSpeed = 1.45;
        dz += currentSpeed * dt;
        dx -= currentSpeed * .08 * dt;
      }
      // Sweep movement in short steps so sprinting, sliding, or a slow frame
      // cannot tunnel the player through thin walls. Axis separation preserves
      // natural sliding along a wall when only one direction is blocked.
      const adminNoclipActive = adminAuthorizedRef.current && adminControlsRef.current.noclip;
      const movementSteps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / .1));
      const stepX = dx / movementSteps, stepZ = dz / movementSteps;
      for (let step = 0; step < movementSteps; step++) {
        if (adminNoclipActive || !collides(playerPosition.x + stepX, playerPosition.z)) playerPosition.x += stepX;
        if (adminNoclipActive || !collides(playerPosition.x, playerPosition.z + stepZ)) playerPosition.z += stepZ;
      }
      if (isThirdPerson && input.lengthSq() > 0) yaw = Math.atan2(-dx, -dz);
      if (!adminNoclipActive && !fitStanceOutsideWalls(currentStance())) {
        // A pathological fully enclosed position keeps its last valid location
        // instead of being pushed through geometry to the opposite side.
        playerPosition.x = lastClearPosition.x; playerPosition.z = lastClearPosition.z;
      }

      if (now >= nextPadTick) {
        nextPadTick = now + 250;
        if (selectedMap === "TEST YARD") {
          const onPad = (x: number) => Math.abs(playerPosition.x - x) < 2 && Math.abs(playerPosition.z - 23) < 2;
          const adminGodModeActive = adminRoleRef.current === "owner" && adminControlsRef.current.godMode;
          if (onPad(-8) && !adminGodModeActive) playerHealth = Math.max(0, playerHealth - 8);
          if (onPad(0) && !adminGodModeActive) playerHealth = 0;
          if (onPad(8)) playerHealth = Math.min(100, playerHealth + 12);
        }
        supplyDrops.forEach(({ drop, medical: medicalDrop }) => {
          if (!drop.visible || Math.abs(playerPosition.x - drop.position.x) >= 1.65 || Math.abs(playerPosition.z - drop.position.z) >= 1.65) return;
          if (medicalDrop) { medicalCharges += 2; setMedicalCount(medicalCharges); }
          else { grenadesLeft += 2; setUtilityCount(grenadesLeft); }
          drop.visible = false;
        });
        setHealth(playerHealth);
        if (playerHealth <= 0) {
          setDead(true); triggerHeld = false; healEnd = 0; setHealing(false); keys.clear();
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }

      const standingInCreek = forestMap && Math.abs((playerPosition.x + 10) + playerPosition.z * .08) < 3.5 && Math.abs(playerPosition.z) < 42;
      const onDockRamp=beachMap&&Math.abs(playerPosition.x)<4.7&&playerPosition.z<=-4.2&&playerPosition.z>-10;
      const onPier=beachMap&&Math.abs(playerPosition.x)<5.5&&playerPosition.z<=-10&&playerPosition.z>-46;
      const beachGround=onDockRamp?THREE.MathUtils.lerp(terrainHeightAt(playerPosition.x,playerPosition.z),1.39,THREE.MathUtils.clamp((-playerPosition.z-4.2)/5.8,0,1)):onPier?1.39:terrainHeightAt(playerPosition.x,playerPosition.z);
      const groundHeight = snowyMap || beachMap ? PLAYER_HEIGHT + beachGround : standingInCreek ? PLAYER_HEIGHT - .7 : PLAYER_HEIGHT;
      const adminFlyingActive = adminAuthorizedRef.current && adminControlsRef.current.flying;
      if (adminFlyingActive) {
        verticalVelocity = 0; grounded = false;
        const verticalInput = Number(keys.has("Space")) - Number(keys.has("KeyC"));
        playerPosition.y = Math.max(.35, playerPosition.y + verticalInput * 7.5 * dt);
      } else if (inBeachWater) {
        verticalVelocity = 0; grounded = false;
        if (isCrouching || isProne) { isCrouching=false; isProne=false; setCrouching(false); setProne(false); }
        const swimInput = Number(keys.has("Space")) - Number(keys.has("ControlLeft") || keys.has("ControlRight"));
        const swimHeight = .36 + swimInput * .42 + Math.sin(clock.getElapsedTime()*2.1)*.045;
        playerPosition.y = THREE.MathUtils.lerp(playerPosition.y,swimHeight,Math.min(1,dt*4.5));
      } else {
        verticalVelocity -= 14.5 * dt;
        playerPosition.y += verticalVelocity * dt;
        if (playerPosition.y <= groundHeight) { playerPosition.y = groundHeight; verticalVelocity = 0; grounded = true; }
      }

      const moving = input.lengthSq() > 0 && (grounded || inBeachWater);
      movementSpread = input.lengthSq() > 0 ? 1.55 : 1;
      const t = clock.getElapsedTime();
      if(snowParticles){const positions=snowParticles.geometry.attributes.position; for(let i=0;i<positions.count;i++){let y=positions.getY(i)-dt*(2.8+(i%7)*.22); const x=positions.getX(i),z=positions.getZ(i); if(y<terrainHeightAt(x,z)) y=terrainHeightAt(x,z)+18+(i%9); positions.setY(i,y);} positions.needsUpdate=true;}
      supplyDrops.forEach(({ drop }) => {
        if (!drop.visible) return;
        drop.position.y = (drop.userData.groundY ?? 0) + .68 + Math.sin(t * 2.2 + drop.userData.floatPhase) * .16;
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
      remotePlayers.forEach((avatar) => {
        const target = avatar.userData.targetPosition as THREE.Vector3 | undefined;
        if (target) avatar.position.lerp(target, Math.min(1, dt * 12));
        if (snowyMap && !avatar.userData.remoteFlying) {
          const stanceDrop = avatar.userData.remoteCrouching ? .42 : 0;
          avatar.position.y = Math.max(avatar.position.y, terrainHeightAt(avatar.position.x, avatar.position.z) - stanceDrop);
        }
        if(beachMap&&!avatar.userData.remoteFlying&&target) avatar.position.y=THREE.MathUtils.lerp(avatar.position.y,target.y,Math.min(1,dt*18));
        avatar.rotation.y = THREE.MathUtils.lerp(avatar.rotation.y, avatar.userData.targetYaw ?? avatar.rotation.y, Math.min(1, dt * 12));
        avatar.rotation.x = THREE.MathUtils.lerp(avatar.rotation.x, avatar.userData.remoteProne ? -Math.PI / 2 : 0, Math.min(1, dt * 9));
      });
      [...dummies, ...remotePlayers.values(), localPlayer].forEach((dummy) => {
        const movement = dummy.userData.movement as "static" | "walk" | "sprint";
        const isLocal = dummy === localPlayer;
        const healthBarRoot = dummy.userData.healthBarRoot as THREE.Group | undefined;
        if (healthBarRoot) healthBarRoot.lookAt(camera.position);
        if (!dummy.visible) return;
        const speed = movement === "sprint" ? 4.2 : 1.75;
        const travel = (t * speed) % 24;
        if (isLocal) {
          const crouchDrop = crouchPoseAmount * .38;
          dummy.position.set(playerPosition.x, playerPosition.y - PLAYER_HEIGHT - crouchDrop + proneAmount * .16, playerPosition.z);
          dummy.rotation.y = yaw;
          dummy.rotation.x = THREE.MathUtils.lerp(dummy.rotation.x, -proneAmount * 1.48, Math.min(1, dt * 10));
          dummy.rotation.z = THREE.MathUtils.lerp(dummy.rotation.z, -leanAmount * .14, Math.min(1, dt * 10));
        } else if (!dummy.userData.isRemotePlayer) {
          dummy.position.z = dummy.userData.laneOrigin + (travel <= 12 ? -6 + travel : 18 - travel);
          dummy.rotation.y = travel <= 12 ? Math.PI : 0;
        }
        const stride = movement === "static" ? 0 : Math.sin(t * (movement === "sprint" ? 12 : 6.5));
        const amplitude = movement === "static" ? 0 : movement === "sprint" ? 0.92 : 0.5;
        // Remote players already receive their terrain-relative elevation over
        // the network. Only lane dummies use an absolute ground-level bob;
        // overwriting a remote avatar's Y here made it phase through mountains.
        if (!isLocal && !dummy.userData.isRemotePlayer) dummy.position.y = Math.abs(Math.sin(t * (movement === "sprint" ? 12 : 6.5))) * (movement === "sprint" ? .075 : .035);
        const headRig = dummy.userData.headRig as THREE.Group;
        const actorSlot = isLocal ? currentSlot : (dummy.userData.remoteSlot ?? 1);
        const actorSecondary = isLocal ? secondary : (dummy.userData.remoteSecondaryName ?? "P9 SIDEARM");
        const holdingWeaponPose = actorSlot <= 2 && (isLocal ? aiming : true);
        const holdingLongWeaponPose = holdingWeaponPose && (actorSlot === 1 || actorSecondary === "DB-2 SAWED-OFF" || actorSecondary === "MP5K COMPACT");
        const aimingHeadPitch = holdingWeaponPose ? holdingLongWeaponPose ? -.13 : -.07 : 0;
        const proneHeadPitch = isLocal ? proneAmount * 1.2 : 0;
        headRig.rotation.x = THREE.MathUtils.lerp(headRig.rotation.x, proneHeadPitch + aimingHeadPitch, Math.min(1, dt * 10));
        headRig.rotation.z = THREE.MathUtils.lerp(headRig.rotation.z, holdingWeaponPose ? holdingLongWeaponPose ? -.15 : -.09 : 0, Math.min(1, dt * 10));
        headRig.position.x = THREE.MathUtils.lerp(headRig.position.x, holdingWeaponPose ? holdingLongWeaponPose ? .065 : .035 : 0, Math.min(1, dt * 10));
        const rig = dummy.userData.rig as { kind: "arm" | "leg"; side: number; upper: THREE.Mesh; lower: THREE.Mesh; joint?: THREE.Mesh; end: THREE.Mesh }[];
        rig.forEach((limb) => {
          if (limb.kind === "arm") {
            const holdingWeapon = actorSlot <= 2;
            const holdingMedical = isLocal && currentSlot === 3 && medicalCharges > 0;
            const holdingUtility = isLocal && currentSlot === 4 && grenadesLeft > 0 && limb.side === 1;
            const holdingClassItem = isLocal && currentSlot === 5 && Boolean(CLASS_ITEMS[playerClass]);
            const holdingItem = holdingWeapon || holdingMedical || holdingUtility || holdingClassItem;
            const holdingLongGun = (holdingWeapon && (actorSlot === 1 || actorSecondary === "DB-2 SAWED-OFF" || actorSecondary === "MP5K COMPACT")) || (holdingClassItem && (playerClass === "DEMOLITION" || playerClass === "MORTAR"));
            const isRightArm = limb.side === 1;
            const alignLimb = (mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) => {
              mesh.position.copy(start).add(end).multiplyScalar(.5);
              mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
            };
            if (holdingItem) {
              const shoulder = new THREE.Vector3(limb.side * .43, 1.65, 0);
              const sprintCarry = isLocal ? sprinting || sliding : movement === "sprint";
              const elbow = holdingClassItem
                ? isRightArm ? new THREE.Vector3(.46, 1.4, -.3) : new THREE.Vector3(-.18, 1.42, -.42)
                : holdingMedical
                ? isRightArm ? new THREE.Vector3(.4, 1.38, -.16) : new THREE.Vector3(-.38, 1.38, -.16)
                : holdingUtility ? new THREE.Vector3(.46, 1.4, -.12)
                : sprintCarry
                ? isRightArm ? new THREE.Vector3(.46, 1.27, -.12) : new THREE.Vector3(-.2, 1.3, -.2)
                : isRightArm ? new THREE.Vector3(.48, 1.38, -.32)
                : holdingLongGun ? new THREE.Vector3(-.2, 1.35, -.33) : new THREE.Vector3(-.18, 1.37, -.2);
              const hand = holdingClassItem
                ? isRightArm ? new THREE.Vector3(.17, 1.28, -.3) : new THREE.Vector3(.08, 1.4, -.72)
                : holdingMedical
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
        playerHealth = Math.min(maxPlayerHealth, playerHealth + MEDICAL_STATS[medical].healing * classStats.healing);
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
      if (placementAiming) {
        raycaster.setFromCamera(getAimNdc(), camera);
        const hit = raycaster.intersectObjects(placementSurfaces, true).find((result) => result.distance <= 4.5 && result.face);
        if (hit?.face) {
          const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
          const valid = utility === "C4 CHARGE" || normal.y > .72;
          placementPoint = valid ? { point: hit.point.clone(), normal } : null;
          placementPreview.visible = valid;
          placementMaterial.color.set(valid ? 0x74e6b1 : 0xff5544);
          if (valid) {
            placementPreview.geometry.dispose();
            placementPreview.geometry = utility === "C4 CHARGE" ? new THREE.BoxGeometry(.46, .12, .32) : new THREE.CylinderGeometry(.28, .3, .11, 16);
            placementPreview.position.copy(hit.point).addScaledVector(normal, .068);
            placementPreview.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
          }
        } else { placementPoint = null; placementPreview.visible = false; }
      }
      remoteUtilities.forEach((projectile) => {
        projectile.age += dt; projectile.velocity.y -= 14.5 * dt;
        projectile.mesh.position.addScaledVector(projectile.velocity, dt);
        projectile.mesh.rotation.x += dt * 8; projectile.mesh.rotation.z += dt * 6;
        const projectileGround = terrainHeightAt(projectile.mesh.position.x,projectile.mesh.position.z)+.12;
        if (projectile.mesh.position.y <= projectileGround) {
          projectile.mesh.position.y = projectileGround; projectile.velocity.y = Math.abs(projectile.velocity.y) * .42;
          projectile.velocity.x *= .82; projectile.velocity.z *= .82;
        }
        if ((projectile.type === "C4 CHARGE" || projectile.type === "LANDMINE") && projectile.age > .75) projectile.velocity.set(0, 0, 0);
      });
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
        const projectileGround = terrainHeightAt(projectile.mesh.position.x,projectile.mesh.position.z)+.12;
        if (projectile.mesh.position.y <= projectileGround) {
          projectile.mesh.position.y = projectileGround;
          projectile.velocity.y = Math.abs(projectile.velocity.y) * 0.42;
          projectile.velocity.x *= 0.82; projectile.velocity.z *= 0.82;
        }
        if ((projectile.type === "C4 CHARGE" || projectile.type === "LANDMINE") && projectile.age > .75) {
          projectile.velocity.set(0, 0, 0); projectile.mesh.position.y = projectileGround;
        }
        if (projectile.type === "LANDMINE" && projectile.age > 1.2 && [...dummies, ...remotePlayers.values()].some((target) => target.visible && target.position.distanceTo(projectile.mesh.position) < 2.1)) {
          detonate(projectile); projectiles.splice(i, 1); continue;
        }
        const fuse = projectile.type === "FRAG GRENADE" ? 2.5 : projectile.type === "SMOKE GRENADE" || projectile.type === "GAS BOMB" ? 1.5 : projectile.type === "FLASHBANG" ? 1.8 : Infinity;
        if (projectile.age >= fuse) { detonate(projectile); projectiles.splice(i, 1); }
      }
      for (let i = plantedMines.length - 1; i >= 0; i--) {
        const mine = plantedMines[i]; mine.age += dt;
        if (mine.age > 1.2 && [...dummies, ...remotePlayers.values()].some((target) => target.visible && target.position.distanceTo(mine.mesh.position) < 2.1)) {
          detonate(mine); plantedMines.splice(i, 1);
        }
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
      if (triggerHeld && currentFireMode === "AUTO" && !sprinting && !sliding) fireRound();
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
      classItemModel.visible = currentSlot === 5 && Boolean(CLASS_ITEMS[playerClass]);
      worldPrimary.visible = isThirdPerson && currentSlot === 1;
      worldSecondary.visible = isThirdPerson && currentSlot === 2;
      worldMedical.visible = isThirdPerson && currentSlot === 3 && medicalCharges > 0;
      worldUtility.visible = isThirdPerson && currentSlot === 4 && grenadesLeft > 0;
      worldClassItem.visible = isThirdPerson && currentSlot === 5 && Boolean(CLASS_ITEMS[playerClass]);
      if (classAiming) { const target = classTarget(); classTargetMarker.position.copy(target).add(new THREE.Vector3(0, .035, 0)); classTargetMarker.rotation.z += dt * 1.8; }
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
      localPlayer.visible = isThirdPerson || Boolean(activeDrone);
      if (multiplayerSocket?.readyState === WebSocket.OPEN && now - lastMultiplayerSend >= 66) {
        lastMultiplayerSend = now;
        multiplayerSocket.send(JSON.stringify({ type: "state", x: playerPosition.x, y: playerPosition.y, z: playerPosition.z, yaw, movement: localPlayer.userData.movement, crouching: isCrouching, prone: isProne, slot: currentSlot, primary, secondary, equipment, playerClass, skin: characterSkin, uniform: characterUniform, camo: camoPattern, accessories: equippedAccessories, armor: characterArmor, helmet: characterHelmet, faceGear: localFaceGear, headAccessory: localHeadAccessory, chestRig, backpack, pants: pantsColor, gloves: gloveColor, boots: bootColor, callsign:playerCallsignRef.current }));
      }
      if (activeDrone) {
        const droneForward = new THREE.Vector3(-Math.sin(droneYaw) * Math.cos(dronePitch), Math.sin(dronePitch), -Math.cos(droneYaw) * Math.cos(dronePitch));
        camera.position.copy(activeDrone.position).add(new THREE.Vector3(0, .28, 0)).addScaledVector(droneForward, -1.15);
        camera.lookAt(activeDrone.position.clone().addScaledVector(droneForward, 18));
      } else if (isThirdPerson) {
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
      if (equipment === "360 GOGGLES" && started) {
        const panelWidth = Math.min(260, Math.floor(mount.clientWidth * .28));
        const panelHeight = Math.floor(panelWidth * 9 / 16);
        const panelRight = 24, panelBottom = 185;
        rearCamera.position.copy(camera.position);
        rearCamera.quaternion.copy(camera.quaternion);
        rearCamera.rotateY(Math.PI);
        rearCamera.aspect = panelWidth / panelHeight;
        rearCamera.updateProjectionMatrix();
        renderer.setScissorTest(true);
        renderer.setViewport(mount.clientWidth - panelWidth - panelRight, panelBottom, panelWidth, panelHeight);
        renderer.setScissor(mount.clientWidth - panelWidth - panelRight, panelBottom, panelWidth, panelHeight);
        renderer.clearDepth();
        renderer.render(scene, rearCamera);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, mount.clientWidth, mount.clientHeight);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(satelliteClearTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerlockchange", onLockChange);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mobile-look", onMobileLook);
      window.removeEventListener("mobile-move", onMobileMove);
      window.removeEventListener("mobile-fire-start", onMobileFireStart);
      window.removeEventListener("mobile-fire-end", onMobileFireEnd);
      window.removeEventListener("mobile-aim", onMobileAim);
      [...suppressedShotPool, ...unsuppressedShotPool].forEach((audio) => { audio.pause(); audio.src = ""; });
      if (multiplayerSocketRef.current === multiplayerSocket) multiplayerSocketRef.current = null;
      multiplayerSocket?.close(1000, "leaving sector");
      adminCommandRef.current = () => {};
      multiplayerSendRef.current = () => {};
      airstrikeTargetRef.current = () => {};
      droneExitRef.current = () => {};
      setAirstrikeMapOpen(false); setDronePiloting(false);
      setMultiplayerStatus("OFFLINE");
      setConnectedPlayerIds([]); setLocalPlayerId("");
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [sessionId, started, selectedSector, selectedMap, primary, secondary, medical, utility, equipment, playerClass, characterSkin, characterUniform, camoPattern, equippedAccessories, characterArmor, characterHelmet, chestRig, backpack, pantsColor, gloveColor, bootColor, weaponSight, muzzleAttachment, tacticalAttachment, magazineAttachment, fireControlAttachment, secondarySight, secondaryMuzzle, secondaryTactical, secondaryMagazine, secondaryFireControl]);

  const equippedItems = [primary, secondary, medical, utility, CLASS_ITEMS[playerClass] ?? "NO CLASS ITEM"];
  const maximumHealth = (equipment === "ARMOR PLATING" ? 125 : 100) + CLASS_STATS[playerClass].healthBonus;
  const radarBounds = selectedMap === "TIDEBREAK BEACH" ? { minX: -60, maxX: 60, minZ: -50, maxZ: 96 } : selectedMap === "TEST YARD" ? { minX: -32, maxX: 32, minZ: -32, maxZ: 32 } : { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  const activeIsMelee = activeSlot === 2 && secondary === "COMBAT KNIFE";
  const activeSightAttachment = activeSlot === 1 ? weaponSight : secondarySight;
  const activeMaxMagazine = activeSlot === 1
    ? magazineCapacity(WEAPON_STATS[primary].capacity, magazineAttachment)
    : activeSlot === 2 && WEAPON_STATS[secondary] ? magazineCapacity(WEAPON_STATS[secondary].capacity, secondaryMagazine) : 0;
  const mobileKey = (code: string, pressed = true) =>
    window.dispatchEvent(new KeyboardEvent(pressed ? "keydown" : "keyup", { code, bubbles: true }));
  const mobileTap = (code: string) => {
    mobileKey(code, true);
    window.setTimeout(() => mobileKey(code, false), 40);
  };
  const updateMobileStick = (event: React.PointerEvent<HTMLDivElement>) => {
    const stick = mobileMoveRef.current;
    if (!stick || stick.id !== event.pointerId) return;
    const radius = Math.max(42, event.currentTarget.clientWidth * .34);
    let x = (event.clientX - stick.centerX) / radius;
    let y = (event.clientY - stick.centerY) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    event.currentTarget.style.setProperty("--stick-x", `${x * radius}px`);
    event.currentTarget.style.setProperty("--stick-y", `${y * radius}px`);
    window.dispatchEvent(new CustomEvent("mobile-move", { detail: { x, y: -y } }));
  };
  const releaseMobileStick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mobileMoveRef.current?.id !== event.pointerId) return;
    mobileMoveRef.current = null;
    event.currentTarget.style.setProperty("--stick-x", "0px");
    event.currentTarget.style.setProperty("--stick-y", "0px");
    window.dispatchEvent(new CustomEvent("mobile-move", { detail: { x: 0, y: 0 } }));
  };

  const closeChat = (restorePointer = true) => {
    chatOpenRef.current = false;
    setChatOpen(false);
    setChatDraft("");
    if (restorePointer && matchPhase === "playing" && !dead) mountRef.current?.querySelector("canvas")?.requestPointerLock();
  };
  const sendChat = () => {
    const text = chatDraft.replace(/\s+/g, " ").trim().slice(0, 160);
    if (text && multiplayerStatus === "ONLINE") multiplayerSendRef.current({ type: "chat", text });
    closeChat();
  };
  const chatSenderName = (senderId: string) => {
    if (senderId === localPlayerId) return playerSummaries[senderId]?.callsign || playerCallsignRef.current;
    if (playerSummaries[senderId]?.callsign) return playerSummaries[senderId].callsign;
    const index = connectedPlayerIds.indexOf(senderId);
    return index >= 0 ? `OPERATOR ${String(index + 1).padStart(2, "0")}` : "OPERATOR";
  };
  const toggleDamageNumbers = () => {
    const enabled = !damageNumbersEnabled;
    setDamageNumbersEnabled(enabled);
    if (!enabled) setDamageNumbers([]);
  };

  return (
    <main className={`game-shell${!started ? " game-menu" : ""}`}>
      <div ref={mountRef} className="viewport" aria-label="3D first-person training arena" />
      <div className="vignette" />
      {adsActive && activeSightAttachment === "4X SCOPE" && !activeIsMelee && !thirdPerson && <div className="scope-overlay"><div className="scope-view"><i className="scope-line horizontal" /><i className="scope-line vertical" /><b /><span>4×</span></div></div>}
      <header className="topbar">
        <div className="brand"><span>STRIKE</span><b>YARD</b></div>
        <div className="mission"><small>{selectedMap}</small><strong>{selectedSector}</strong></div>
        <div className="status"><i /> {started ? selectedSector === "TRAINING SECTOR" ? "TRAINING SECTOR · SINGLE PLAYER" : `${selectedSector} · ${multiplayerStatus}` : "SYSTEMS ONLINE"}</div>
      </header>
      <div className="kill-feed" aria-live="polite">
        {killFeed.map((entry) => <div key={entry.id}><b>{entry.killer}</b><span>{entry.weapon}</span>{entry.headshot && <i>HEADSHOT</i>}<strong>{entry.victim}</strong></div>)}
      </div>
      {started && selectedSector !== "TRAINING SECTOR" && <section className={`game-chat${chatOpen ? " open" : ""}`} aria-label="Match chat">
        <div className="chat-log" aria-live="polite">
          {!chatMessages.length && chatOpen && <p>NO COMMS YET</p>}
          {chatMessages.slice(-6).map((message) => <div key={message.id} className={message.senderId === localPlayerId ? "local" : ""}>
            <b>{chatSenderName(message.senderId)}</b><span>{message.text}</span>
          </div>)}
        </div>
        {chatOpen ? <form onSubmit={(event) => { event.preventDefault(); sendChat(); }}>
          <label htmlFor="match-chat-input">ALL</label>
          <input ref={chatInputRef} id="match-chat-input" value={chatDraft} maxLength={160} autoComplete="off" placeholder={multiplayerStatus === "ONLINE" ? "MESSAGE ALL PLAYERS" : "COMMS OFFLINE"} disabled={multiplayerStatus !== "ONLINE"} onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); closeChat(); } }} />
          <small>{chatDraft.length}/160 · ENTER SEND · ESC CANCEL</small>
        </form> : <button onClick={() => { chatOpenRef.current = true; setChatOpen(true); if (document.pointerLockElement) document.exitPointerLock(); }}><kbd>ENTER</kbd> MATCH CHAT</button>}
      </section>}
      {started && adminAuthorized && <div className="admin-game-badge"><kbd>=</kbd> {adminRole === "owner" ? "ADMIN" : "JUNIOR ADMIN"} PANEL</div>}
      {started && adminAuthorized && adminPanelOpen && <div className="game-admin-overlay" role="dialog" aria-modal="true" aria-label="In-game admin panel">
        <section className="game-admin-panel">
          <header><div><small>{adminRole === "owner" ? "OWNER ACCESS" : "LIMITED ACCESS"}</small><h2>{adminRole === "owner" ? "ADMIN" : "JUNIOR ADMIN"} <span>COMMAND</span></h2></div><button aria-label="Close admin panel" onClick={() => { adminPanelOpenRef.current = false; setAdminPanelOpen(false); mountRef.current?.querySelector("canvas")?.requestPointerLock(); }}>×</button></header>
          <div className="admin-game-grid">
            <article><h3>MOVEMENT</h3>
              <button className={adminFlying ? "active" : ""} onClick={() => updateAdminControls({ flying: !adminFlying })}><span>FLY MODE</span><b>{adminFlying ? "ON" : "OFF"}</b></button>
              <button className={adminNoclip ? "active" : ""} onClick={() => updateAdminControls({ noclip: !adminNoclip })}><span>NOCLIP</span><b>{adminNoclip ? "ON" : "OFF"}</b></button>
              <p>Fly with WASD · Space up · C down</p>
            </article>
            {adminRole === "owner" && <article><h3>COMBAT</h3>
              <label><span>DAMAGE MULTIPLIER</span><select value={adminDamageMultiplier} onChange={(event) => updateAdminControls({ damageMultiplier: Number(event.target.value) })}><option value={1}>1× NORMAL</option><option value={2}>2× DAMAGE</option><option value={5}>5× DAMAGE</option><option value={10}>10× DAMAGE</option><option value={100}>100× INSTANT</option></select></label>
              <button className={adminGodMode ? "active" : ""} onClick={() => updateAdminControls({ godMode: !adminGodMode })}><span>GOD MODE</span><b>{adminGodMode ? "ON" : "OFF"}</b></button>
              <button onClick={() => adminCommandRef.current("restore_health")}><span>RESTORE HEALTH</span><b>100 HP</b></button>
              <button onClick={() => adminCommandRef.current("refill_ammo")}><span>SPAWN AMMO</span><b>FULL</b></button>
            </article>}
            {adminRole === "owner" && <article><h3>ITEM SPAWNER</h3>
              <button onClick={() => adminCommandRef.current("refill_medical")}><span>{medical}</span><b>×9</b></button>
              <button onClick={() => adminCommandRef.current("refill_utility")}><span>{utility}</span><b>×9</b></button>
              <p>Items are added directly to your active loadout.</p>
            </article>}
            {adminRole === "owner" && <article className="admin-kill-panel"><h3>KILL PANEL</h3>
              <button className="danger" onClick={() => adminCommandRef.current("kill_targets")}><span>ALL TRAINING TARGETS</span><b>ELIMINATE</b></button>
              {connectedPlayerIds.filter((id) => id !== localPlayerId).map((id, index) => <div className="admin-player-actions" key={id}><span>{playerSummaries[id]?.callsign || `OPERATOR ${String(index + 1).padStart(2, "0")}`}</span><button className="danger" onClick={() => multiplayerSendRef.current({ type: "hit", targetId: id, damage: 100, weapon: "ADMIN", headshot: false })}>KILL</button><button className="danger" onClick={() => multiplayerSendRef.current({ type: "admin_kick", targetId: id })}>KICK</button></div>)}
              {!connectedPlayerIds.some((id) => id !== localPlayerId) && <p>NO REMOTE OPERATORS CONNECTED</p>}
            </article>}
          </div>
          <footer><span>{adminRole === "owner" ? "OWNER" : "JUNIOR ADMIN"} SESSION · {auth.currentUser?.email}</span><button onClick={() => { adminPanelOpenRef.current = false; setAdminPanelOpen(false); mountRef.current?.querySelector("canvas")?.requestPointerLock(); }}>RETURN TO GAME <kbd>=</kbd></button></footer>
        </section>
      </div>}
      {started && selectedSector !== "TRAINING SECTOR" && matchPhase === "playing" && (matchMode === "TDM" || matchMode === "CTP" || matchMode === "CTF") && <aside className="tdm-scoreboard">
        <div className={`tdm-team alpha${localTeam === "ALPHA" ? " local-team" : ""}`}><small>TEAM</small><span>ALPHA</span><strong>{Math.floor(teamScores.ALPHA)}</strong></div>
        <div className="tdm-clock"><small>{matchMode === "CTP" ? "CAPTURE POINTS" : matchMode === "CTF" ? "CAPTURE THE FLAG" : "TEAM DEATHMATCH"}</small><strong>{formatMatchTime(matchTimeLeft)}</strong><span>{matchMode === "CTP" ? objectiveZones.map((zone) => `${zone.id}:${zone.owner?.[0] ?? "—"}`).join(" · ") : matchMode === "CTF" ? flags.map((flag) => `${flag.team[0]}:${flag.carrierId ? "TAKEN" : flag.dropped ? "DROPPED" : "HOME"}`).join(" · ") : selectedMap}</span></div>
        <div className={`tdm-team bravo${localTeam === "BRAVO" ? " local-team" : ""}`}><strong>{Math.floor(teamScores.BRAVO)}</strong><span>BRAVO</span><small>TEAM</small></div>
        <button disabled={endGameRequested} onClick={() => { multiplayerSendRef.current({ type: "end_game" }); setEndGameRequested(true); }}>{endGameRequested ? `${endGameVotes}/${Math.max(1, connectedPlayerIds.length)}` : "END VOTE"}</button>
      </aside>}
      {started && matchPhase === "playing" && matchMode === "KOTH" && <aside className="objective-scoreboard"><small>KING OF THE HILL</small><strong>{Math.floor(localObjectiveScore)}</strong><span>HILL POINTS · {formatMatchTime(matchTimeLeft)}</span></aside>}
      {started && selectedSector !== "TRAINING SECTOR" && matchPhase === "playing" && matchMode === "FFA" && <aside className="leaderboard">
        <header><span>FREE FOR ALL</span><strong>{formatMatchTime(matchTimeLeft)}</strong></header>
        <div className="leaderboard-columns"><span>OPERATOR</span><i>K</i><i>D</i></div>
        {connectedPlayerIds.map((id, index) => <div className={id === localPlayerId ? "local" : ""} key={id}><span>{playerSummaries[id]?.callsign || (id === localPlayerId ? playerCallsignRef.current : `OPERATOR ${String(index + 1).padStart(2, "0")}`)}</span><i>{playerSummaries[id]?.kills ?? 0}</i><i>{playerSummaries[id]?.deaths ?? 0}</i></div>)}
        {!connectedPlayerIds.length && <div><span>CONNECTING…</span><i>—</i><i>—</i></div>}
        <button disabled={endGameRequested} onClick={() => { multiplayerSendRef.current({ type: "end_game" }); setEndGameRequested(true); }}>{endGameRequested ? `END VOTE SENT · ${endGameVotes}/${Math.max(1, connectedPlayerIds.length)}` : "VOTE TO END GAME"}</button>
      </aside>}
      <div className="damage-numbers" aria-live="off" aria-hidden="true">
        {damageNumbers.map((number) => <span key={number.id} className={number.headshot ? "headshot" : ""} style={{ left: number.x, top: number.y }}>-{number.damage}</span>)}
      </div>
      <div className="crosshair" style={{ left: thirdPerson ? leanSide < 0 ? "46%" : "54%" : "50%" }}><span /><span /></div>
      <div className="hud-left"><small>VITALS · {equipment}</small><strong>{health}</strong><div className="health"><i style={{ width: `${health / maximumHealth * 100}%` }} /></div><div className={`stamina${stamina <= 25 ? " low" : ""}`}><span>STAMINA</span><i><b style={{ width: `${stamina}%` }} /></i><em>{stamina}</em></div></div>
      {started && CLASS_ITEMS[playerClass] && <div className={`class-ability-status${classCooldown > 0 ? " cooling" : ""}`}><kbd>5</kbd><span><b>{CLASS_ITEMS[playerClass]}</b><small>{classCooldown > 0 ? `COOLDOWN · ${classCooldown} SEC` : "READY · EQUIP SLOT 5"}</small></span></div>}
      {started && dronePiloting && <div className="drone-control-hud"><b>ATTACK DRONE · REMOTE LINK</b><span><kbd>WASD</kbd> FLY · <kbd>SHIFT</kbd> BOOST · <kbd>LMB</kbd> FIRE · <kbd>RMB</kbd> EXIT</span></div>}
      {started && airstrikeMapOpen && <div className="airstrike-overlay" role="dialog" aria-modal="true" aria-label="Airstrike targeting map">
        <section className="airstrike-console">
          <header><div><small>TACTICAL UPLINK</small><h2>AIRSTRIKE TARGETING</h2></div><button onClick={() => { setAirstrikeMapOpen(false); requestAnimationFrame(() => mountRef.current?.querySelector("canvas")?.requestPointerLock()); }}>×</button></header>
          <div className="airstrike-map" onClick={(event) => { const rect=event.currentTarget.getBoundingClientRect(); const px=THREE.MathUtils.clamp((event.clientX-rect.left)/rect.width,0,1); const pz=THREE.MathUtils.clamp((event.clientY-rect.top)/rect.height,0,1); airstrikeTargetRef.current(radarBounds.minX+px*(radarBounds.maxX-radarBounds.minX),radarBounds.minZ+pz*(radarBounds.maxZ-radarBounds.minZ)); }}>
            <i className="airstrike-scanline" /><span className="airstrike-reticle">+</span><b>N</b>
            {radarPings.map((ping)=><i key={ping.id} className={`airstrike-contact ${ping.local?"local":"enemy"}`} style={{left:`${(ping.x-radarBounds.minX)/(radarBounds.maxX-radarBounds.minX)*100}%`,top:`${(ping.z-radarBounds.minZ)/(radarBounds.maxZ-radarBounds.minZ)*100}%`}} />)}
          </div>
          <footer>CLICK A POSITION TO CONFIRM THE STRIKE · FIVE IMPACT RUN</footer>
        </section>
      </div>}
      {started && equipment === "HEAT VISION GOGGLES" && <div className="heat-vision-overlay"><span>THERMAL OPTICS · WALL DETECTION {HEAT_VISION_WALL_RANGE}M</span></div>}
      {started && equipment === "360 GOGGLES" && <aside className="rear-view-panel"><header>REAR VIEW · 180°</header></aside>}
      {started && equipment === "SATELLITE GPS" && <aside className={`satellite-map${radarPings.length ? " scanning" : ""}`}>
        <header><span>SATELLITE GPS</span><b>{radarPings.length ? "CONTACTS" : "SCANNING"}</b></header>
        <div className="radar-grid">
          {radarPings.map((ping) => <i key={ping.id} className={ping.local ? "local" : "enemy"} style={{ left: `${(ping.x - radarBounds.minX) / (radarBounds.maxX - radarBounds.minX) * 100}%`, top: `${(ping.z - radarBounds.minZ) / (radarBounds.maxZ - radarBounds.minZ) * 100}%` }} />)}
        </div>
        <small>PLAYER LOCATIONS PULSE EVERY 10 SEC</small>
      </aside>}
      {(crouching || prone) && <div className="stance-status">{prone ? "PRONE" : "CROUCHED"} · <kbd>{prone ? "X" : "C"}</kbd> STAND</div>}
      {doorPrompt && <div className="door-prompt"><kbd>F</kbd> OPEN / CLOSE DOOR</div>}
      <div className="hud-right"><small>{equippedItems[activeSlot - 1]}{activeIsMelee ? " · MELEE" : activeSlot <= 2 ? ` · ${fireMode}` : " · READY"}</small><strong>{activeSlot === 5 ? classCooldown > 0 ? classCooldown : "READY" : activeSlot === 4 ? utilityCount : activeSlot === 3 ? medicalCount : activeIsMelee ? "—" : ammo} <em>{activeSlot === 5 ? classCooldown > 0 ? "SECONDS" : "CLASS ITEM" : activeSlot === 4 ? "THROWABLES" : activeSlot === 3 ? "MEDICAL" : activeIsMelee ? "" : `/ ${activeMaxMagazine}`}</em></strong></div>
      {reloading && <div className="reload-status"><span>RELOADING</span><i style={{ animationDuration: `${reloadDuration}s` }} /></div>}
      {healing && <div className="heal-status"><span>USING {medical}</span><small>SWITCH EQUIPMENT TO CANCEL</small><i style={{ animationDuration: `${healDuration}s` }} /></div>}
      <div className="quick-slots">
        {([
          [1, primary, "PRIMARY"], [2, secondary, "SECONDARY"], [3, medical, "MEDICAL"], [4, utility, "UTILITY"], ...(CLASS_ITEMS[playerClass] ? [[5, CLASS_ITEMS[playerClass], "CLASS ITEM"]] : [])
        ] as [number, string, string][]).map(([slot, item, label]) => <div key={slot} className={activeSlot === slot ? "active" : ""}>
          <kbd>{slot}</kbd><span><small>{label}</small><b>{item}</b></span>
        </div>)}
      </div>
      <div className={`flash-effect${flashed ? " active" : ""}`} />
      <div className={`heal-effect${healingEffect ? " active" : ""}`} />
      <div className={`damage-effect${damageFlash ? " active" : ""}`} aria-hidden="true" />
      {selectedMap === "TEST YARD" && <div className="test-legend"><span className="damage-dot" /> DAMAGE PAD <span className="kill-dot" /> KILL PAD <span className="heal-dot" /> HEAL PAD <span className="medical-dot" /> MEDICAL DROP <span className="utility-dot" /> UTILITY DROP</div>}
      <div className="controls"><kbd>WASD</kbd> MOVE <kbd>SHIFT</kbd> SPRINT <kbd>C</kbd> CROUCH / SLIDE <kbd>X</kbd> PRONE <kbd>Q/E</kbd> LEAN <kbd>RMB</kbd> {thirdPerson ? "ORBIT CAMERA" : "HOLD AIM"} <kbd>Z</kbd> TOGGLE AIM <kbd>LMB</kbd> FIRE <kbd>TAB</kbd> {thirdPerson ? "1ST PERSON" : "3RD PERSON"}{adminAuthorized && <><kbd>=</kbd> ADMIN</>}</div>
      {started && touchControls && locked && !dead && matchPhase === "playing" && <div className="mobile-controls" aria-label="Mobile game controls">
        <div className="mobile-move-pad" aria-label="Movement joystick. Push farther to sprint." onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); mobileMoveRef.current = { id: event.pointerId, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 }; updateMobileStick(event); }} onPointerMove={updateMobileStick} onPointerUp={releaseMobileStick} onPointerCancel={releaseMobileStick}><div className="mobile-stick"><span>RUN</span></div></div>
        <button className="mobile-sprint" aria-label="Hold to sprint" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); mobileKey("ShiftLeft", true); }} onPointerUp={(event) => { event.preventDefault(); mobileKey("ShiftLeft", false); }} onPointerCancel={() => mobileKey("ShiftLeft", false)}>SPRINT</button>
        <div className="mobile-look-pad" aria-label="Drag to look" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); mobileLookRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; }} onPointerMove={(event) => { const last = mobileLookRef.current; if (!last || last.id !== event.pointerId) return; window.dispatchEvent(new CustomEvent("mobile-look", { detail: { x: event.clientX - last.x, y: event.clientY - last.y } })); last.x = event.clientX; last.y = event.clientY; }} onPointerUp={() => { mobileLookRef.current = null; }} onPointerCancel={() => { mobileLookRef.current = null; }}><span>DRAG TO AIM</span></div>
        <div className="mobile-actions">
          <button onClick={() => mobileTap("Space")}>JUMP</button><button onClick={() => mobileTap("KeyC")}>CROUCH</button><button onClick={() => mobileTap("KeyR")}>RELOAD</button><button onClick={() => mobileTap("KeyF")}>USE</button>
          <button className="mobile-aim" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); window.dispatchEvent(new CustomEvent("mobile-aim", { detail: true })); }} onPointerUp={() => window.dispatchEvent(new CustomEvent("mobile-aim", { detail: false }))} onPointerCancel={() => window.dispatchEvent(new CustomEvent("mobile-aim", { detail: false }))}>ADS</button>
          <button className="mobile-fire" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); window.dispatchEvent(new Event("mobile-fire-start")); }} onPointerUp={() => window.dispatchEvent(new Event("mobile-fire-end"))} onPointerCancel={() => window.dispatchEvent(new Event("mobile-fire-end"))}>FIRE</button>
        </div>
        <div className="mobile-slots">{[1, 2, 3, 4].map((slot) => <button key={slot} className={activeSlot === slot ? "active" : ""} onClick={() => mobileTap(`Digit${slot}`)}>{slot}</button>)}</div>
      </div>}
      {started && matchPhase === "voting" && <div className="match-vote-overlay">
        <div className="match-vote-panel">
          <small>{selectedSector} · NEXT MATCH STARTS IN <b>{formatMatchTime(matchTimeLeft)}</b></small>
          <h2><span>MATCH</span> VOTING</h2>
          <p>CAST ONE BATTLEFIELD VOTE AND ONE RULESET VOTE</p>
          <div className="vote-columns">
          <section className="vote-section map-section"><header><i>01</i><span><b>BATTLEFIELD</b><small>CHOOSE WHERE YOU FIGHT</small></span><em>{mapVotes}/{connectedPlayerIds.length} CAST</em></header><div className="vote-grid">
          <div className="vote-option"><button className={selectedMapVote === "CITY BLOCK" ? "voted selected-vote" : hasVoted ? "voted" : ""} disabled={hasVoted || multiplayerStatus !== "ONLINE"} onClick={() => { multiplayerSendRef.current({ type: "vote", category: "map", map: "CITY BLOCK" }); setSelectedMapVote("CITY BLOCK"); setHasVoted(true); }}>
            <i>01</i><span><b>CITY BLOCK</b><small>URBAN WARFARE · ENTERABLE BUILDINGS · DEBRIS</small></span><em>{selectedMapVote === "CITY BLOCK" ? "YOUR VOTE" : hasVoted ? "LOCKED" : multiplayerStatus !== "ONLINE" ? "CONNECTING" : "VOTE"}</em>
          </button>
          <div className="vote-total"><i style={{ width: mapVotes ? `${cityMapVotes / mapVotes * 100}%` : "0%" }} /><span>{cityMapVotes} VOTE{cityMapVotes === 1 ? "" : "S"}</span></div></div>
          <div className="vote-option"><button className={selectedMapVote === "BLACKWOOD FOREST" ? "voted selected-vote" : hasVoted ? "voted" : ""} disabled={hasVoted || multiplayerStatus !== "ONLINE"} onClick={() => { multiplayerSendRef.current({ type: "vote", category: "map", map: "BLACKWOOD FOREST" }); setSelectedMapVote("BLACKWOOD FOREST"); setHasVoted(true); }}>
            <i>02</i><span><b>BLACKWOOD FOREST</b><small>WOODLAND COMBAT · CREEK CROSSING · RANGER OUTPOST</small></span><em>{selectedMapVote === "BLACKWOOD FOREST" ? "YOUR VOTE" : hasVoted ? "LOCKED" : multiplayerStatus !== "ONLINE" ? "CONNECTING" : "VOTE"}</em>
          </button>
          <div className="vote-total"><i style={{ width: mapVotes ? `${forestMapVotes / mapVotes * 100}%` : "0%" }} /><span>{forestMapVotes} VOTE{forestMapVotes === 1 ? "" : "S"}</span></div></div>
          <div className="vote-option"><button className={selectedMapVote === "FROSTLINE BASE" ? "voted selected-vote" : hasVoted ? "voted" : ""} disabled={hasVoted || multiplayerStatus !== "ONLINE"} onClick={() => { multiplayerSendRef.current({ type: "vote", category: "map", map: "FROSTLINE BASE" }); setSelectedMapVote("FROSTLINE BASE"); setHasVoted(true); }}>
            <i>03</i><span><b>FROSTLINE BASE</b><small>SNOWY MOUNTAIN · CLIMBABLE SUMMIT · HIGH-GROUND COMBAT</small></span><em>{selectedMapVote === "FROSTLINE BASE" ? "YOUR VOTE" : hasVoted ? "LOCKED" : multiplayerStatus !== "ONLINE" ? "CONNECTING" : "VOTE"}</em>
          </button>
          <div className="vote-total"><i style={{ width: mapVotes ? `${frostMapVotes / mapVotes * 100}%` : "0%" }} /><span>{frostMapVotes} VOTE{frostMapVotes === 1 ? "" : "S"}</span></div></div>
          <div className="vote-option"><button className={selectedMapVote === "TIDEBREAK BEACH" ? "voted selected-vote" : hasVoted ? "voted" : ""} disabled={hasVoted || multiplayerStatus !== "ONLINE"} onClick={() => { multiplayerSendRef.current({ type: "vote", category: "map", map: "TIDEBREAK BEACH" }); setSelectedMapVote("TIDEBREAK BEACH"); setHasVoted(true); }}>
            <i>04</i><span><b>TIDEBREAK BEACH</b><small>TROPICAL SHORE · PALM GROVES · HUTS · BROKEN PIER</small></span><em>{selectedMapVote === "TIDEBREAK BEACH" ? "YOUR VOTE" : hasVoted ? "LOCKED" : multiplayerStatus !== "ONLINE" ? "CONNECTING" : "VOTE"}</em>
          </button>
          <div className="vote-total"><i style={{ width: mapVotes ? `${beachMapVotes / mapVotes * 100}%` : "0%" }} /><span>{beachMapVotes} VOTE{beachMapVotes === 1 ? "" : "S"}</span></div></div>
          <div className="vote-option"><button className={selectedMapVote === "DUSTFALL DESERT" ? "voted selected-vote" : hasVoted ? "voted" : ""} disabled={hasVoted || multiplayerStatus !== "ONLINE"} onClick={() => { multiplayerSendRef.current({ type: "vote", category: "map", map: "DUSTFALL DESERT" }); setSelectedMapVote("DUSTFALL DESERT"); setHasVoted(true); }}>
            <i>05</i><span><b>DUSTFALL DESERT</b><small>SWEEPING DUNES · OASIS · RUINS · ROCKY COVER</small></span><em>{selectedMapVote === "DUSTFALL DESERT" ? "YOUR VOTE" : hasVoted ? "LOCKED" : multiplayerStatus !== "ONLINE" ? "CONNECTING" : "VOTE"}</em>
          </button>
          <div className="vote-total"><i style={{ width: mapVotes ? `${desertMapVotes / mapVotes * 100}%` : "0%" }} /><span>{desertMapVotes} VOTE{desertMapVotes === 1 ? "" : "S"}</span></div></div>
          </div></section>
          <section className="vote-section mode-section"><header><i>02</i><span><b>RULESET</b><small>CHOOSE HOW YOU FIGHT</small></span><em>{modeVotes}/{connectedPlayerIds.length} CAST</em></header><div className="vote-grid">
          <div className="vote-option"><button className={selectedModeVote === "FFA" ? "voted selected-vote" : hasModeVoted ? "voted" : ""} disabled={hasModeVoted || multiplayerStatus !== "ONLINE"} onClick={() => { multiplayerSendRef.current({ type: "vote", category: "mode", mode: "FFA" }); setSelectedModeVote("FFA"); setHasModeVoted(true); }}>
            <i>01</i><span><b>FREE FOR ALL</b><small>10 MINUTES · EVERY OPERATOR FOR THEMSELVES</small></span><em>{selectedModeVote === "FFA" ? "YOUR VOTE" : hasModeVoted ? "LOCKED" : "VOTE"}</em>
          </button>
          <div className="vote-total"><i style={{ width: modeVotes ? `${ffaModeVotes / modeVotes * 100}%` : "0%" }} /><span>{ffaModeVotes} VOTE{ffaModeVotes === 1 ? "" : "S"}</span></div></div>
          <div className="vote-option"><button className={selectedModeVote === "TDM" ? "voted selected-vote" : hasModeVoted ? "voted" : ""} disabled={hasModeVoted || multiplayerStatus !== "ONLINE"} onClick={() => { multiplayerSendRef.current({ type: "vote", category: "mode", mode: "TDM" }); setSelectedModeVote("TDM"); setHasModeVoted(true); }}>
            <i>02</i><span><b>TEAM DEATHMATCH</b><small>10 MINUTES · ALPHA VS BRAVO · NO FRIENDLY FIRE</small></span><em>{selectedModeVote === "TDM" ? "YOUR VOTE" : hasModeVoted ? "LOCKED" : "VOTE"}</em>
          </button>
          <div className="vote-total"><i style={{ width: modeVotes ? `${tdmModeVotes / modeVotes * 100}%` : "0%" }} /><span>{tdmModeVotes} VOTE{tdmModeVotes === 1 ? "" : "S"}</span></div></div>
          <div className="vote-option"><button className={selectedModeVote === "KOTH" ? "voted selected-vote" : hasModeVoted ? "voted" : ""} disabled={hasModeVoted || multiplayerStatus !== "ONLINE"} onClick={() => { multiplayerSendRef.current({ type: "vote", category: "mode", mode: "KOTH" }); setSelectedModeVote("KOTH"); setHasModeVoted(true); }}>
            <i>03</i><span><b>KING OF THE HILL</b><small>FFA · HOLD THE LARGE RANDOMIZED ZONE · EARN POINTS</small></span><em>{selectedModeVote === "KOTH" ? "YOUR VOTE" : hasModeVoted ? "LOCKED" : "VOTE"}</em>
          </button>
          <div className="vote-total"><i style={{ width: modeVotes ? `${kothModeVotes / modeVotes * 100}%` : "0%" }} /><span>{kothModeVotes} VOTE{kothModeVotes === 1 ? "" : "S"}</span></div></div>
          <div className="vote-option"><button className={selectedModeVote === "CTP" ? "voted selected-vote" : hasModeVoted ? "voted" : ""} disabled={hasModeVoted || multiplayerStatus !== "ONLINE"} onClick={() => { multiplayerSendRef.current({ type: "vote", category: "mode", mode: "CTP" }); setSelectedModeVote("CTP"); setHasModeVoted(true); }}>
            <i>04</i><span><b>CAPTURE POINTS</b><small>ALPHA VS BRAVO · CAPTURE AND HOLD THREE ZONES</small></span><em>{selectedModeVote === "CTP" ? "YOUR VOTE" : hasModeVoted ? "LOCKED" : "VOTE"}</em>
          </button>
          <div className="vote-total"><i style={{ width: modeVotes ? `${ctpModeVotes / modeVotes * 100}%` : "0%" }} /><span>{ctpModeVotes} VOTE{ctpModeVotes === 1 ? "" : "S"}</span></div></div>
          <div className="vote-option"><button className={selectedModeVote === "CTF" ? "voted selected-vote" : hasModeVoted ? "voted" : ""} disabled={hasModeVoted || multiplayerStatus !== "ONLINE"} onClick={() => { multiplayerSendRef.current({ type: "vote", category: "mode", mode: "CTF" }); setSelectedModeVote("CTF"); setHasModeVoted(true); }}>
            <i>05</i><span><b>CAPTURE THE FLAG</b><small>ALPHA VS BRAVO · STEAL THE ENEMY FLAG · RETURN IT HOME</small></span><em>{selectedModeVote === "CTF" ? "YOUR VOTE" : hasModeVoted ? "LOCKED" : "VOTE"}</em>
          </button>
          <div className="vote-total"><i style={{ width: modeVotes ? `${ctfModeVotes / modeVotes * 100}%` : "0%" }} /><span>{ctfModeVotes} VOTE{ctfModeVotes === 1 ? "" : "S"}</span></div></div>
          </div></section></div>
          <footer>{mapVotes}/{connectedPlayerIds.length} MAP VOTES · {modeVotes}/{connectedPlayerIds.length} MODE VOTES · ALL VOTES DISPLAY BEFORE MATCH START</footer>
        </div>
      </div>}
      {started && matchPhase === "results" && <div className="match-results-overlay">
        <div className="match-results-panel">
          <small>{selectedSector} · {matchMode === "TDM" ? "TEAM DEATHMATCH" : matchMode === "CTP" ? "CAPTURE POINTS" : matchMode === "CTF" ? "CAPTURE THE FLAG" : matchMode === "KOTH" ? "KING OF THE HILL" : "FREE FOR ALL"} COMPLETE</small>
          <h2>{matchMode === "TDM" || matchMode === "CTP" || matchMode === "CTF" ? winningTeam ? "VICTORY TEAM" : "MATCH DRAW" : matchWinnerId ? "MATCH WINNER" : "MATCH DRAW"}</h2>
          <strong>{matchMode === "TDM" || matchMode === "CTP" || matchMode === "CTF" ? winningTeam ? `TEAM ${winningTeam}` : "TEAMS TIED" : matchWinnerId ? playerSummaries[matchWinnerId]?.callsign || (matchWinnerId === localPlayerId ? playerCallsignRef.current : `OPERATOR ${matchWinnerId.slice(0, 4).toUpperCase()}`) : "NO SOLE WINNER"}</strong>
          <p>{winningKills} {matchMode === "CTF" ? `CAPTURE${winningKills === 1 ? "" : "S"}` : matchMode === "KOTH" || matchMode === "CTP" ? "POINTS" : `KILL${winningKills === 1 ? "" : "S"}`}</p>
          <footer>VOTING OPENS IN <b>{formatMatchTime(matchTimeLeft)}</b></footer>
        </div>
      </div>}
      {dead && <div className="death-screen">
        <div className="death-code">KIA</div><h2>OPERATOR DOWN</h2><p>TEST CONDITION: FATAL DAMAGE</p>
        <button onClick={() => {
          respawnRef.current(); setHealth(maximumHealth); setDead(false);
          multiplayerSendRef.current({ type: "respawn", x: 0, z: selectedMap === "TIDEBREAK BEACH" ? 86 : selectedMap === "CITY BLOCK" || selectedMap === "DUSTFALL DESERT" ? 38 : selectedMap === "BLACKWOOD FOREST" || selectedMap === "FROSTLINE BASE" ? 36 : 15 });
          mountRef.current?.querySelector("canvas")?.requestPointerLock();
        }}>RESPAWN AT TEST YARD</button>
      </div>}
      {!locked && !chatOpen && !dead && matchPhase !== "voting" && matchPhase !== "results" && <div className={`menu-screen${!started ? " main-menu-screen" : " pause-screen"}`}>
        <div className="menu-rule" />
        {!started && (menuPage === "HOME" || menuPage === "CHARACTER") && <button className="character-preview" onClick={() => setMenuPage("CHARACTER")} aria-label="Customize character">
          <div className="preview-glow" />
          <OperatorPreview3D skin={characterSkin} uniform={characterUniform} camo={camoPattern} accessories={equippedAccessories} armor={characterArmor} helmet={characterHelmet} chestRig={chestRig} backpack={backpack} pants={pantsColor} gloves={gloveColor} boots={bootColor} />
          <span>{menuPage === "CHARACTER" ? "OPERATOR PREVIEW" : "CLICK OPERATOR TO CUSTOMIZE"}</span>
        </button>}
        <section className="menu-card">
          <div className="menu-kicker">TACTICAL TRAINING SIMULATION</div>
          {(!started && menuPage === "HOME" && !serverBrowserOpen) && <>
          <h1><span>STRIKE</span>YARD</h1>
          <p>SECTOR 01 · COMBAT READINESS COURSE</p>
          <nav className="main-nav" aria-label="Main menu">
            <button className="nav-active" onClick={() => {
              setServerBrowserOpen(true);
            }}><b>01</b><span>PLAY</span><small>SELECT MULTIPLAYER SERVER</small></button>
            <button onClick={() => setMenuPage("LOADOUT")}><b>02</b><span>LOADOUT</span><small>EDIT EQUIPMENT</small></button>
            <button onClick={() => setMenuPage("CHARACTER")}><b>03</b><span>OPERATOR</span><small>CUSTOMIZE CHARACTER</small></button>
            <button onClick={() => setMenuPage("CLASSES")}><b>04</b><span>CLASSES</span><small>COMBAT ROLES & PROGRESSION</small></button>
            <a href="/login"><b>05</b><span>ACCOUNT</span><small>LOGIN OR CREATE PROFILE</small></a>
            <button onClick={() => setMenuPage("SETTINGS")}><b>06</b><span>SETTINGS</span><small>GAMEPLAY & HUD</small></button>
          </nav>
          <div className={`account-sync ${accountSaveStatus}`}>{accountSaveStatus === "saved" ? "● ACCOUNT LOADOUT SYNCED" : accountSaveStatus === "saving" ? "● SAVING ACCOUNT…" : accountSaveStatus === "error" ? "● ACCOUNT SAVE UNAVAILABLE" : accountSaveStatus === "loading" ? "● LOADING ACCOUNT…" : "○ SIGN IN TO SAVE LOADOUT & OPERATOR"}</div>
          </>}
          {(!started && menuPage === "HOME" && serverBrowserOpen) && <div className="server-browser">
            <button className="back-button" onClick={() => setServerBrowserOpen(false)}>← MAIN MENU</button>
            <div className="server-heading"><div><span>PLAY</span> SECTORS</div><small>SELECT A DESTINATION</small></div>
            <div className="server-list">
              <button onClick={() => {
                setSelectedSector("TRAINING SECTOR");
                setServerBrowserOpen(false);
                setSelectedMap("TEST YARD");
                setMatchPhase("playing");
                setMapVotes(0); setModeVotes(0); setHasVoted(false); setHasModeVoted(false); setMatchEndsAt(0);
                setHealth(maximumHealth);
                setStarted(true);
                setSessionId((id) => id + 1);
              }}>
                <i>TR</i><span><b>TRAINING SECTOR</b><small>SINGLE PLAYER · TEST YARD · NO MAP VOTING</small></span><em>TRAIN</em>
              </button>
              {(["SECTOR 1", "SECTOR 2", "SECTOR 3", "SECTOR 4"] as MultiplayerSector[]).map((sector, index) => <button key={sector} onClick={() => {
                setSelectedSector(sector);
                setServerBrowserOpen(false);
                setSelectedMap("CITY BLOCK");
                setMatchPhase("connecting");
                setMapVotes(0); setModeVotes(0); setHasVoted(false); setHasModeVoted(false); setMatchEndsAt(0);
                setHealth(maximumHealth);
                setStarted(true);
                setSessionId((id) => id + 1);
              }}>
                <i>{String(index + 1).padStart(2, "0")}</i><span><b>{sector}</b><small>{sectorPlayerCounts[sector] === null ? "CHECKING PLAYERS…" : `${sectorPlayerCounts[sector]} PLAYER${sectorPlayerCounts[sector] === 1 ? "" : "S"} ONLINE`} · MAP VOTE INSIDE</small></span><em>JOIN</em>
              </button>)}
            </div>
          </div>}
          {(!started && menuPage === "SETTINGS") && <div className="settings-panel">
            <button className="back-button" onClick={() => setMenuPage("HOME")}>← MAIN MENU</button>
            <div className="settings-title-row"><div className="loadout-heading"><div><span>GAME</span> SETTINGS</div><small>GAMEPLAY & HUD PREFERENCES</small></div><button className="tutorial-help-button" aria-label="Open game controls tutorial" title="Controls tutorial" onClick={() => setControlsTutorialOpen(true)}>?</button></div>
            <section className="settings-group">
              <header><small>HUD</small><h2>COMBAT FEEDBACK</h2></header>
              <button className={`settings-toggle${damageNumbersEnabled ? " enabled" : ""}`} role="switch" aria-checked={damageNumbersEnabled} onClick={toggleDamageNumbers}>
                <span><b>DAMAGE NUMBERS</b><small>SHOW DAMAGE VALUES AT THE POINT OF IMPACT</small></span>
                <i><em /></i><strong>{damageNumbersEnabled ? "ON" : "OFF"}</strong>
              </button>
              <div className="settings-preview" aria-hidden="true"><span>TARGET HIT</span><b className={damageNumbersEnabled ? "visible" : ""}>-32</b><small>{damageNumbersEnabled ? "DAMAGE NUMBERS ENABLED" : "DAMAGE NUMBERS HIDDEN"}</small></div>
            </section>
            <p className="settings-note">PREFERENCES ARE SAVED ON THIS DEVICE.</p>
          </div>}
          {(!started && menuPage === "SETTINGS" && controlsTutorialOpen) && <div className="controls-tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="controls-tutorial-title" onClick={() => setControlsTutorialOpen(false)}>
            <section className="controls-tutorial" onClick={(event) => event.stopPropagation()}>
              <header><div><small>FIELD MANUAL</small><h2 id="controls-tutorial-title">GAME <span>CONTROLS</span></h2></div><button aria-label="Close controls tutorial" onClick={() => setControlsTutorialOpen(false)}>×</button></header>
              <div className="tutorial-control-grid">
                <article><h3>MOVEMENT</h3><div><kbd>W A S D</kbd><span>MOVE</span></div><div><kbd>SHIFT</kbd><span>SPRINT</span></div><div><kbd>SPACE</kbd><span>JUMP</span></div><div><kbd>C</kbd><span>CROUCH / SLIDE</span></div><div><kbd>X</kbd><span>PRONE</span></div><div><kbd>Q / E</kbd><span>LEAN</span></div></article>
                <article><h3>COMBAT</h3><div><kbd>LMB</kbd><span>FIRE / USE ITEM</span></div><div><kbd>RMB</kbd><span>AIM</span></div><div><kbd>Z</kbd><span>TOGGLE AIM</span></div><div><kbd>R</kbd><span>RELOAD</span></div><div><kbd>B</kbd><span>FIRE MODE</span></div><div><kbd>1–5</kbd><span>SELECT EQUIPMENT / CLASS ITEM</span></div></article>
                <article><h3>INTERACTION</h3><div><kbd>F</kbd><span>USE / OPEN DOOR</span></div><div><kbd>TAB</kbd><span>CHANGE CAMERA</span></div><div><kbd>ENTER</kbd><span>MATCH CHAT</span></div><div><kbd>ESC</kbd><span>PAUSE MENU</span></div></article>
                <article className="tutorial-touch"><h3>TOUCH CONTROLS</h3><div><kbd>LEFT PAD</kbd><span>MOVE · PUSH FORWARD TO RUN</span></div><div><kbd>RIGHT PAD</kbd><span>LOOK AROUND</span></div><div><kbd>BUTTONS</kbd><span>FIRE · AIM · JUMP · CROUCH · RELOAD · USE</span></div></article>
              </div>
              <footer>TIP: TRY THE TRAINING SECTOR BEFORE JOINING A MULTIPLAYER MATCH.</footer>
            </section>
          </div>}
          {(!started && menuPage === "CLASSES") && <div className="classes-panel">
            <button className="back-button" onClick={() => setMenuPage("HOME")}>← MAIN MENU</button>
            <div className="loadout-heading"><div><span>COMBAT</span> CLASSES</div><small>{careerKills} CAREER KILLS · {playerClass} EQUIPPED</small></div>
            <div className="class-grid">
              {(Object.entries(CLASS_STATS) as [PlayerClass, typeof CLASS_STATS[PlayerClass]][]).map(([name, stats]) => {
                const unlocked = careerKills >= stats.unlockKills;
                return <button key={name} className={`${playerClass === name ? "selected " : ""}${unlocked ? "unlocked" : "locked"}`} disabled={!unlocked} onClick={() => setPlayerClass(name)}>
                  <header><span>{name}</span><small>{stats.role}</small></header>
                  <div className="class-requirement">{unlocked ? stats.unlockKills === 0 ? "AVAILABLE" : `UNLOCKED · ${stats.unlockKills} KILLS` : `LOCKED · ${stats.unlockKills} KILLS REQUIRED`}</div>
                  <section><b>BUFFS</b>{stats.buffs.map((buff) => <i key={buff}>+ {buff.replace(/^\+/, "")}</i>)}</section>
                  <section className="debuffs"><b>DEBUFFS</b>{stats.debuffs.map((debuff) => <i key={debuff}>− {debuff.replace(/^−/, "")}</i>)}</section>
                  <footer>{playerClass === name ? "EQUIPPED" : unlocked ? "SELECT CLASS" : `${Math.max(0, stats.unlockKills - careerKills)} KILLS TO GO`}</footer>
                </button>;
              })}
            </div>
            {!auth.currentUser && <p className="class-login-note">SIGN IN TO TRACK CAREER KILLS AND UNLOCK NEW CLASSES.</p>}
            <button className="confirm-loadout" onClick={() => { void saveAccountPreferences("loadout"); setMenuPage("HOME"); }}>CONFIRM CLASS</button>
          </div>}
          {(!started && menuPage === "LOADOUT") && <div className="loadout-panel">
            <button className="back-button" onClick={() => setMenuPage("HOME")}>← MAIN MENU</button>
            <div className="loadout-heading"><div><span>COMBAT</span> LOADOUT</div><small>SELECT ONE ITEM PER SLOT</small></div>
            <div className="loadout-grid">
              <LoadoutSlot label="PRIMARY WEAPON" selected={primary} options={[
                ["VXR-4 CARBINE", "BALANCED · AUTO"], ["M12 SMG", "MOBILE · CLOSE RANGE"], ["BR-7 RIFLE", "PRECISION · SEMI"],
                ["SNR-90 SNIPER", "EXTREME RANGE · BOLT ACTION"], ["KSG-12 SHOTGUN", "8 PELLETS · CLOSE RANGE"], ["HMG-6 LMG", "60 ROUNDS · SUPPRESSION"],
                ["AKR-47 ASSAULT", "HEAVY DAMAGE · HARD RECOIL"], ["M8 TACTICAL RIFLE", "CONTROLLED · 27 ROUNDS"], ["DMR-11 MARKSMAN", "SEMI AUTO · LONG RANGE"], ["VX-9 PDW", "EXTREME RATE · MOBILE"]
              ]} onSelect={setPrimary} magazine={magazineAttachment} />
              <LoadoutSlot label="SECONDARY" selected={secondary} options={[
                ["P9 SIDEARM", "RELIABLE · 15 ROUNDS"], ["R45 REVOLVER", "HEAVY · 6 ROUNDS"], ["G18 AUTO PISTOL", "24 ROUNDS · FULL AUTO"], ["DB-2 SAWED-OFF", "TWO SHELLS · 6 PELLETS"], ["M1911 SIDEARM", ".45 ACP · 8 ROUNDS"], ["USP-45 TACTICAL", "ACCURATE · 12 ROUNDS"], ["MP5K COMPACT", "FULL AUTO · 20 ROUNDS"], ["COMBAT KNIFE", "FAST · SILENT"]
              ]} onSelect={setSecondary} magazine={secondaryMagazine} />
              <LoadoutSlot label="MEDICAL" selected={medical} options={[
                ["COMBAT BANDAGE", "25 HEALTH · 0.80 SEC"], ["EMERGENCY INJECTOR", "20 HEALTH · 0.55 SEC"],
                ["FIRST AID POUCH", "45 HEALTH · 1.80 SEC"], ["STIM INJECTOR", "35 HEALTH · 1.15 SEC"],
                ["FIELD MEDKIT", "60 HEALTH · 2.50 SEC"], ["BLOOD BAG", "80 HEALTH · 3.20 SEC"], ["TRAUMA KIT", "100 HEALTH · 4.00 SEC"]
              ]} onSelect={setMedical} />
              <LoadoutSlot label="UTILITY" selected={utility} options={[
                ["FRAG GRENADE", "LETHAL EXPLOSIVE"], ["SMOKE GRENADE", "VISION COVER"], ["FLASHBANG", "DISORIENT TARGETS"], ["C4 CHARGE", "PLACE · FIRE AGAIN TO DETONATE"], ["LANDMINE", "PROXIMITY EXPLOSIVE"], ["GAS BOMB", "AREA DENIAL · DAMAGE OVER TIME"]
              ]} onSelect={setUtility} />
              <LoadoutSlot label="PASSIVE EQUIPMENT" selected={equipment} options={[
                ["ARMOR PLATING", "+25 MAX HEALTH"], ["HEAT VISION GOGGLES", "HIGHLIGHT COMBATANTS"], ["360 GOGGLES", "LIVE REAR-VIEW PANEL"], ["SATELLITE GPS", "PLAYER SCAN EVERY 10 SEC"]
              ]} onSelect={(value) => setEquipment(value as PassiveEquipment)} />
            </div>
            <div className="attachments-panel">
              <div className="attachments-heading"><span>PRIMARY</span> ATTACHMENTS <small>{primary}</small></div>
              <div className="attachments-grid">
                <AttachmentOption label="OPTIC" value={weaponSight} options={["IRON SIGHTS", "RED DOT", "HOLOGRAPHIC", "4X SCOPE"]} onSelect={(value) => setWeaponSight(value as typeof weaponSight)} />
                <AttachmentOption label="MUZZLE" value={muzzleAttachment} options={["STANDARD BARREL", "SUPPRESSOR"]} onSelect={(value) => setMuzzleAttachment(value as typeof muzzleAttachment)} />
                <AttachmentOption label="MAGAZINE" value={magazineAttachment} options={["STANDARD MAG", "EXTENDED MAG", "DRUM MAG"]} onSelect={(value) => setMagazineAttachment(value as typeof magazineAttachment)} />
                <AttachmentOption label="TACTICAL" value={tacticalAttachment} options={["NONE", "RED LASER", "WHITE LIGHT"]} onSelect={(value) => setTacticalAttachment(value as typeof tacticalAttachment)} />
                <AttachmentOption label="FIRE CONTROL" value={fireControlAttachment} options={["STANDARD TRIGGER", "BURST TRIGGER"]} onSelect={(value) => setFireControlAttachment(value as typeof fireControlAttachment)} />
              </div>
              <div className="attachments-heading secondary"><span>SECONDARY</span> ATTACHMENTS <small>{secondary}</small></div>
              <div className="attachments-grid">
                <AttachmentOption label="OPTIC" value={secondarySight} options={["IRON SIGHTS", "RED DOT", "HOLOGRAPHIC", "4X SCOPE"]} onSelect={(value) => setSecondarySight(value as typeof secondarySight)} />
                <AttachmentOption label="MUZZLE" value={secondaryMuzzle} options={["STANDARD BARREL", "SUPPRESSOR"]} onSelect={(value) => setSecondaryMuzzle(value as typeof secondaryMuzzle)} />
                <AttachmentOption label="MAGAZINE" value={secondaryMagazine} options={["STANDARD MAG", "EXTENDED MAG", "DRUM MAG"]} onSelect={(value) => setSecondaryMagazine(value as typeof secondaryMagazine)} />
                <AttachmentOption label="TACTICAL" value={secondaryTactical} options={["NONE", "RED LASER", "WHITE LIGHT"]} onSelect={(value) => setSecondaryTactical(value as typeof secondaryTactical)} />
                <AttachmentOption label="FIRE CONTROL" value={secondaryFireControl} options={["STANDARD TRIGGER", "BURST TRIGGER"]} onSelect={(value) => setSecondaryFireControl(value as typeof secondaryFireControl)} />
              </div>
            </div>
            <button className="confirm-loadout" onClick={() => { void saveAccountPreferences("loadout"); setMenuPage("HOME"); }}>CONFIRM LOADOUT</button>
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
            <GearOption label="CAMOUFLAGE PATTERN" value={camoPattern} options={["SOLID", "WOODLAND", "MULTICAM", "DIGITAL", "URBAN CAMO"]} onSelect={(value) => setCamoPattern(value as CamoPattern)} />
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
              <AccessoryOption value={equippedAccessories} onToggle={(accessory) => setEquippedAccessories((current) => current.includes(accessory) ? current.filter((item) => item !== accessory) : [...current, accessory])} />
              <GearOption label="CHEST RIG" value={chestRig} options={["LIGHT", "PLATE CARRIER", "HEAVY"]} onSelect={(value) => setChestRig(value as typeof chestRig)} />
              <GearOption label="BACKPACK" value={backpack} options={["NONE", "ASSAULT PACK", "RADIO PACK"]} onSelect={(value) => setBackpack(value as typeof backpack)} />
            </div>
            <button className="confirm-loadout" onClick={() => { void saveAccountPreferences("operator"); setMenuPage("HOME"); }}>SAVE OPERATOR</button>
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
            {selectedSector !== "TRAINING SECTOR" && matchPhase === "playing" && <button className="leave" disabled={endGameRequested} onClick={() => { multiplayerSendRef.current({ type: "end_game" }); setEndGameRequested(true); }}>
              <span>{endGameRequested ? "END VOTE SUBMITTED" : "VOTE TO END GAME"}</span>
              <small>{endGameVotes}/{Math.max(1, connectedPlayerIds.length)} PLAYERS AGREED</small>
            </button>}
            <button className="leave" onClick={() => {
              setStarted(false);
              setServerBrowserOpen(false);
              setMatchPhase("connecting");
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
            <div><kbd>Z</kbd><span>TOGGLE AIM</span></div>
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

function OperatorPreview3D({ skin, uniform, camo, accessories, armor, helmet, chestRig, backpack, pants, gloves, boots }: { skin: string; uniform: string; camo: CamoPattern; accessories: OperatorAccessory[]; armor: string; helmet: string; chestRig: string; backpack: string; pants: string; gloves: string; boots: string }) {
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
    const skinMat = mat(skin, .62);
    const previewUniformCamo = createCamoTexture(camo, uniform), previewPantsCamo = createCamoTexture(camo, pants);
    const uniformMat = new THREE.MeshStandardMaterial({ color: previewUniformCamo ? 0xffffff : uniform, map: previewUniformCamo, roughness: .9 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: previewPantsCamo ? 0xffffff : pants, map: previewPantsCamo, roughness: .9 });
    const armorMat = mat(armor, .55, .28), gloveMat = mat(gloves, .7, .16), bootMat = mat(boots, .78, .14), darkMat = mat(0x111719, .65, .35);
    const nvgLensMat = new THREE.MeshStandardMaterial({ color: 0x17251d, emissive: 0x65a775, emissiveIntensity: .85, roughness: .14, metalness: .5 });
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
    if (accessories.includes("GOGGLES")) {
      add(new THREE.BoxGeometry(helmet === "HEAVY" ? .5 : .43, .13, .045), darkMat, 0, 2.48, .276);
      [-.11, .11].forEach((side) => add(new THREE.BoxGeometry(.18, .085, .02), mat(0x5ca8b5, .18, .65), side, 2.48, .307));
    }
    if (accessories.includes("MASK")) {
      const mask = add(new THREE.SphereGeometry(.288, 20, 14, 0, Math.PI * 2, Math.PI * .28, Math.PI * .54), uniformMat, 0, 2.46, 0);
      mask.scale.set(1.02, 1.02, 1.06);
      add(new THREE.BoxGeometry(.35, .23, .05), uniformMat, 0, 2.35, .275);
      [-1, 1].forEach((side) => { const strap = add(new THREE.BoxGeometry(.03, .2, .43), darkMat, side * .225, 2.4, .01); strap.rotation.z = side * .08; });
    }
    if (accessories.includes("HEADSET")) {
      [-1, 1].forEach((side) => add(new THREE.BoxGeometry(.08, .24, .12), darkMat, side * .31, 2.48, 0));
      const band = add(new THREE.TorusGeometry(.32, .022, 8, 22, Math.PI), darkMat, 0, 2.57, 0); band.rotation.z = Math.PI;
      const mic = add(new THREE.CylinderGeometry(.014, .014, .3, 8), darkMat, -.34, 2.34, .13); mic.rotation.x = .85; mic.rotation.z = -.18;
      add(new THREE.SphereGeometry(.032, 9, 7), darkMat, -.34, 2.23, .23);
    }
    if (accessories.includes("NVG")) {
      add(new THREE.BoxGeometry(.25, .085, .065), armorMat, 0, 2.64, .285);
      const hinge = add(new THREE.CylinderGeometry(.04, .04, .18, 12), darkMat, 0, 2.6, .34); hinge.rotation.z = Math.PI / 2;
      add(new THREE.BoxGeometry(.31, .07, .1), darkMat, 0, 2.54, .39);
      [-.13, .13].forEach((side) => {
        const tube = add(new THREE.CylinderGeometry(.06, .075, .24, 14), darkMat, side, 2.5, .5); tube.rotation.x = Math.PI / 2;
        const lens = add(new THREE.CylinderGeometry(.052, .052, .016, 14), nvgLensMat, side, 2.5, .628); lens.rotation.x = Math.PI / 2;
      });
    }
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
  }, [skin, uniform, camo, accessories, armor, helmet, chestRig, backpack, pants, gloves, boots]);
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

function AccessoryOption({ value, onToggle }: { value: OperatorAccessory[]; onToggle: (accessory: OperatorAccessory) => void }) {
  const options: OperatorAccessory[] = ["GOGGLES", "MASK", "HEADSET", "NVG"];
  return <div className="character-option gear-option accessory-option"><h2>ACCESSORIES · SELECT ANY</h2><div className="helmet-options">
    {options.map((accessory) => <button key={accessory} className={value.includes(accessory) ? "selected" : ""} aria-pressed={value.includes(accessory)} onClick={() => onToggle(accessory)}>
      {accessory}<small>{value.includes(accessory) ? " EQUIPPED" : " OFF"}</small>
    </button>)}
  </div></div>;
}

function AttachmentOption({ label, value, options, onSelect }: { label: string; value: string; options: string[]; onSelect: (value: string) => void }) {
  return <section className="attachment-option"><h2>{label}</h2><div>
    {options.map((option) => { const penalty = attachmentItemPenalty(option); const reloadPenalty = option === "DRUM MAG" ? 35 : option === "EXTENDED MAG" ? 15 : 0; return <button key={option} className={value === option ? "selected" : ""} onClick={() => onSelect(option)}>
      <i /> <span>{option}</span><small>{value === option ? "EQUIPPED" : "SELECT"}{penalty > 0 && ` · −${penalty}% MOBILITY${option === "BURST TRIGGER" ? " · −25% ACCURACY" : ""}`}{reloadPenalty > 0 && ` · +${reloadPenalty}% RELOAD TIME`}</small>
    </button>; })}
  </div></section>;
}

function LoadoutSlot({ label, selected, options, onSelect, magazine }: {
  label: string;
  selected: string;
  options: [string, string][];
  onSelect: (value: string) => void;
  magazine?: MagazineAttachment;
}) {
  const baseStats = WEAPON_STATS[selected];
  const stats = baseStats && magazine
    ? { ...baseStats, capacity: magazineCapacity(baseStats.capacity, magazine), reload: reloadTimeWithMagazine(baseStats.reload, magazine) }
    : baseStats;
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
