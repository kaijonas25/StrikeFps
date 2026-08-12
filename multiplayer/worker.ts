import { DurableObject } from "cloudflare:workers";

type PlayerState = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  movement: "static" | "walk" | "sprint";
  crouching: boolean;
  prone: boolean;
  flying: boolean;
  slot: number;
  primary: string;
  secondary: string;
  equipment: "ARMOR PLATING" | "HEAT VISION GOGGLES" | "360 GOGGLES" | "SATELLITE GPS";
  playerClass: "RECRUIT" | "ASSAULT" | "SCOUT" | "MEDIC" | "HEAVY" | "MORTAR" | "AIRSTRIKE" | "DEMOLITION" | "ENGINEER" | "DRONE";
  skin: string;
  uniform: string;
  camo: string;
  accessories: string[];
  armor: string;
  helmet: string;
  faceGear: string;
  headAccessory: string;
  chestRig: string;
  backpack: string;
  pants: string;
  gloves: string;
  boots: string;
  kills: number;
  deaths: number;
  health: number;
  team: "ALPHA" | "BRAVO";
  objectiveScore: number;
  spawnProtectedUntil: number;
  callsign: string;
};

type MultiplayerMap = "CITY BLOCK" | "BLACKWOOD FOREST" | "FROSTLINE BASE" | "TIDEBREAK BEACH";
type GameMode = "FFA" | "TDM" | "KOTH" | "CTP";
type ObjectiveZone = { id: string; x: number; z: number; radius: number; owner: PlayerState["team"] | null; progress: number };
type AdminRole = "owner" | "junior" | null;
type SocketAttachment = { id: string; state: PlayerState; adminRole?: AdminRole; godMode?: boolean; damageMultiplier?: number; lastSeenAt?: number; votedMapPhase?: number; votedMap?: MultiplayerMap; votedModePhase?: number; votedMode?: GameMode; endGamePhase?: number; lastChatAt?: number };
type MatchMeta = { day: string; phase: "voting" | "playing" | "results"; phaseEndsAt: number; votes: number; mapVotes: Record<MultiplayerMap, number>; modeVotes: number; modeVoteCounts: Record<GameMode, number>; endVotes: number; map: MultiplayerMap; mode: GameMode; teamScores: Record<PlayerState["team"], number>; objectiveZones: ObjectiveZone[]; lastObjectiveTick: number; winnerId: string | null; winningTeam: PlayerState["team"] | null; winningKills: number };
const VOTE_DURATION = 30_000;
const MATCH_DURATION = 10 * 60_000;
const RESULTS_DURATION = 5_000;
const FINAL_VOTE_DISPLAY_DURATION = 1_500;
const EMPTY_ROOM_GRACE = 10_000;
const PLAYER_API_URL = "https://strikeyard-fps.kaijonasgarcia.chatgpt.site/api/player";
const safeString = (value: unknown, fallback: string, maxLength: number) =>
  typeof value === "string" ? value.slice(0, maxLength) : fallback;
const maxHealth = (player: Pick<PlayerState, "equipment" | "playerClass">) => (player.equipment === "ARMOR PLATING" ? 125 : 100) + (player.playerClass === "HEAVY" ? 25 : player.playerClass === "SCOUT" ? -15 : 0);

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
});

const verifiedAdminToken = async (idToken: unknown): Promise<AdminRole> => {
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 4096) return null;
  const response = await fetch(PLAYER_API_URL, { headers: { authorization: `Bearer ${idToken}` } });
  if (!response.ok) return null;
  const payload = await response.json() as { adminRole?: AdminRole };
  return payload.adminRole === "owner" || payload.adminRole === "junior" ? payload.adminRole : null;
};

const SPAWNS: Record<MultiplayerMap, { free: [number,number][]; ALPHA: [number,number][]; BRAVO: [number,number][] }> = {
  "CITY BLOCK": {
    free: [[-38,-6],[-38,18],[38,-18],[38,8],[-24,-5],[24,5],[-5,-30],[5,30],[-18,36],[18,-36]],
    ALPHA: [[-32,38],[-20,38],[-7,38],[7,38],[20,38],[32,38]],
    BRAVO: [[-32,-38],[-20,-38],[-7,-38],[7,-38],[20,-38],[32,-38]],
  },
  "BLACKWOOD FOREST": {
    free: [[-35,-22],[-34,14],[34,-18],[34,12],[-25,-32],[22,32],[-2,-34],[4,34],[-28,28],[28,-30]],
    ALPHA: [[-34,35],[-23,36],[-4,36],[10,35],[20,36],[34,35]],
    BRAVO: [[-34,-35],[-22,-36],[-4,-36],[10,-35],[22,-36],[34,-35]],
  },
  "FROSTLINE BASE": {
    free: [[-38,32],[-22,38],[0,38],[22,38],[38,28],[-35,5],[35,5],[-28,-18],[28,-18],[0,-34]],
    ALPHA: [[-38,34],[-24,38],[-8,39],[8,39],[24,38],[38,34]],
    BRAVO: [[-38,-26],[-24,-32],[-8,-38],[8,-38],[24,-32],[38,-26]],
  },
  "TIDEBREAK BEACH": {
    free: [[-45,81],[-15,80],[15,80],[45,81],[-46,62],[-14,61],[14,61],[46,62],[-43,42],[-14,41],[14,41],[43,42],[-43,23],[-9,22],[9,22],[43,24],[-39,1],[-20,2],[0,1],[20,1],[39,1],[-22,-14],[0,-13],[22,-15]],
    ALPHA: [[-47,78],[-28,81],[-9,79],[9,79],[28,81],[47,78]],
    BRAVO: [[-50,1],[-31,2],[-10,0],[10,0],[31,2],[50,1]],
  },
};

const chooseSpawn = (meta: MatchMeta, team: PlayerState["team"], players: PlayerState[]) => {
  const teamMode = meta.mode === "TDM" || meta.mode === "CTP";
  const base = SPAWNS[meta.map][teamMode ? team : "free"];
  const beachRocks:[number,number,number][]=[[-42,-8,4],[-31,-27,4.2],[-7,-20,3.5],[7,20,3.7],[24,-2,4],[41,-14,4.2],[-15,19,3.5],[16,-27,3.7]];
  const clearOfObjectives = base.filter(([x,z]) => meta.objectiveZones.every((zone) => Math.hypot(x-zone.x,z-zone.z) > zone.radius + 3) && (meta.map!=="TIDEBREAK BEACH" || beachRocks.every(([rockX,rockZ,radius])=>Math.hypot(x-rockX,z-rockZ)>radius+2.2)));
  const candidates = clearOfObjectives.length ? clearOfObjectives : base;
  const living = players.filter((player) => player.health > 0);
  return candidates.map(([x,z]) => {
    const allDistance = living.length ? Math.min(...living.map((player) => Math.hypot(x-player.x,z-player.z))) : 30;
    const enemies = teamMode ? living.filter((player) => player.team !== team) : living;
    const enemyDistance = enemies.length ? Math.min(...enemies.map((player) => Math.hypot(x-player.x,z-player.z))) : 35;
    return { x, z, score:allDistance + enemyDistance * 1.8 + Math.random() * 7 };
  }).sort((a,b) => b.score-a.score)[0];
};

export class GameRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/status") {
      const now = Date.now();
      const cleanupKey = "cleanup-operator-4204-v1";
      const removeNamedGhost = !(await this.ctx.storage.get<boolean>(cleanupKey));
      this.ctx.getWebSockets().forEach((socket) => {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null;
        if (!attachment) return;
        const stale = typeof attachment.lastSeenAt === "number" && now - attachment.lastSeenAt > 15_000;
        const namedGhost = removeNamedGhost && attachment.state.callsign.toUpperCase() === "OPERATOR 4204";
        if (!stale && !namedGhost) return;
        this.broadcast({ type: "left", id: attachment.id }, socket);
        try { socket.close(4001, namedGhost ? "Removed stale operator" : "Connection timed out"); } catch {}
      });
      if (removeNamedGhost) await this.ctx.storage.put(cleanupKey, true);
      const players = this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN).length;
      return json({ players });
    }
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "WebSocket upgrade required" }, 426);
    const meta = await this.currentMatch();
    // Cancel a pending empty-room reset when clients return after loading a map.
    await this.ctx.storage.delete("emptyResetAt");
    await this.ctx.storage.setAlarm(meta.phaseEndsAt);
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    const id = crypto.randomUUID();
    const existingPlayers = this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN).map((socket) => (socket.deserializeAttachment() as SocketAttachment).state);
    const playerNumber = existingPlayers.length;
    const team: PlayerState["team"] = playerNumber % 2 === 0 ? "ALPHA" : "BRAVO";
    const spawn = chooseSpawn(meta, team, existingPlayers);
    const spawnX = spawn.x, spawnZ = spawn.z;
    const initial: PlayerState = { id, x: spawnX, y: 1.7, z: spawnZ, yaw: spawnZ > 0 ? 0 : Math.PI, movement: "static", crouching: false, prone: false, flying: false, slot: 1, primary: "VXR-4 CARBINE", secondary: "P9 SIDEARM", equipment: "ARMOR PLATING", playerClass: "RECRUIT", skin: "#a9795e", uniform: "#303a3b", camo: "SOLID", accessories: ["GOGGLES", "HEADSET"], armor: "#20292b", helmet: "TACTICAL", faceGear: "GOGGLES", headAccessory: "HEADSET", chestRig: "PLATE CARRIER", backpack: "ASSAULT PACK", pants: "#303a3b", gloves: "#20292b", boots: "#151b1d", kills: 0, deaths: 0, health: 125, team, objectiveScore: 0, spawnProtectedUntil: Date.now() + 3000, callsign:`OPERATOR ${id.slice(0,4).toUpperCase()}` };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, state: initial, adminRole: null, godMode: false, damageMultiplier: 1, lastSeenAt: Date.now() } satisfies SocketAttachment);

    const players = existingPlayers;
    const joiningAttachment = server.deserializeAttachment() as SocketAttachment;
    server.send(JSON.stringify({ type: "welcome", id, player: initial, players, match: meta, yourMapVote: joiningAttachment.votedMapPhase === meta.phaseEndsAt ? joiningAttachment.votedMap : null, yourModeVote: joiningAttachment.votedModePhase === meta.phaseEndsAt ? joiningAttachment.votedMode : null }));
    this.broadcast({ type: "joined", player: initial }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 4096) return;
    let packet: Partial<PlayerState> & { type?: string; category?: "map" | "mode"; map?: MultiplayerMap; mode?: GameMode; targetId?: string; damage?: number; weapon?: string; headshot?: boolean; tracerEnds?: unknown; effect?: string; duration?: number; text?: string; utilityId?: string; utility?: string; position?: unknown; velocity?: unknown; idToken?: string; godMode?: boolean; damageMultiplier?: number; flying?: boolean };
    try { packet = JSON.parse(message); } catch { return; }
    const attachment = socket.deserializeAttachment() as SocketAttachment;
    attachment.lastSeenAt = Date.now();
    if (packet.type === "admin_auth") {
      attachment.adminRole = await verifiedAdminToken(packet.idToken);
      attachment.godMode = false;
      attachment.damageMultiplier = 1;
      socket.serializeAttachment(attachment);
      socket.send(JSON.stringify({ type: "admin_authenticated", authorized: attachment.adminRole !== null, role: attachment.adminRole }));
      return;
    }
    if (packet.type === "admin_config") {
      if (!attachment.adminRole) return;
      const allowedMultipliers = [1, 2, 5, 10, 100];
      attachment.godMode = attachment.adminRole === "owner" && Boolean(packet.godMode);
      attachment.damageMultiplier = attachment.adminRole === "owner" && allowedMultipliers.includes(packet.damageMultiplier ?? 1) ? packet.damageMultiplier : 1;
      attachment.state.flying = Boolean(packet.flying);
      socket.serializeAttachment(attachment);
      this.broadcast({ type: "state", player: attachment.state }, socket);
      return;
    }
    if (packet.type === "admin_kick") {
      if (attachment.adminRole !== "owner" || !packet.targetId || packet.targetId === attachment.id) return;
      const targetSocket = this.ctx.getWebSockets().find((candidate) => (candidate.deserializeAttachment() as SocketAttachment).id === packet.targetId);
      if (!targetSocket) return;
      const target = targetSocket.deserializeAttachment() as SocketAttachment;
      this.broadcast({ type: "left", id: target.id }, targetSocket);
      try { targetSocket.send(JSON.stringify({ type: "kicked", reason: "Removed by server administrator" })); } catch {}
      try { targetSocket.close(4001, "Kicked by admin"); } catch {}
      return;
    }
    if (packet.type === "chat") {
      const now = Date.now();
      const text = typeof packet.text === "string" ? packet.text.replace(/\s+/g, " ").trim().slice(0, 160) : "";
      if (!text || now - (attachment.lastChatAt ?? 0) < 750) return;
      attachment.lastChatAt = now;
      socket.serializeAttachment(attachment);
      this.broadcast({ type: "chat", id: crypto.randomUUID(), senderId: attachment.id, text, sentAt: now });
      return;
    }
    if (packet.type === "shot") {
      const meta = await this.currentMatch();
      if (meta.phase !== "playing" || !Array.isArray(packet.tracerEnds)) return;
      const tracerEnds = packet.tracerEnds.slice(0, 8).filter((point): point is number[] =>
        Array.isArray(point) && point.length === 3 && point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate) && Math.abs(coordinate) <= 200)
      );
      if (tracerEnds.length) this.broadcast({ type: "shot", id: attachment.id, tracerEnds }, socket);
      return;
    }
    if (packet.type === "utility_throw" || packet.type === "utility_detonate") {
      const meta = await this.currentMatch();
      const utilities = ["FRAG GRENADE", "FLASHBANG", "SMOKE GRENADE", "GAS BOMB", "C4 CHARGE", "LANDMINE"];
      const vector = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry) && Math.abs(entry) <= 200) ? value as number[] : null;
      const position = vector(packet.position), velocity = packet.type === "utility_throw" ? vector(packet.velocity) : null;
      if (meta.phase !== "playing" || !packet.utilityId || packet.utilityId.length > 64 || !utilities.includes(packet.utility ?? "") || !position || (packet.type === "utility_throw" && !velocity)) return;
      this.broadcast({ type: packet.type, id: attachment.id, utilityId: packet.utilityId, utility: packet.utility, position, ...(velocity ? { velocity } : {}) }, socket);
      return;
    }
    if (packet.type === "class_effect") {
      const effects = ["MORTAR", "AIRSTRIKE", "ROCKET LAUNCHER", "SENTRY", "ATTACK DRONE"];
      const position = Array.isArray(packet.position) && packet.position.length === 3 && packet.position.every((entry) => typeof entry === "number" && Number.isFinite(entry)) ? packet.position : null;
      if (effects.includes(packet.effect) && position) this.broadcast({ type: "class_effect", id: attachment.id, effect: packet.effect, position }, socket);
      return;
    }
    if (packet.type === "drone_state") {
      const vector = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry) && Math.abs(entry) <= 250) ? value as number[] : null;
      if (packet.active === false) { this.broadcast({type:"drone_state",id:attachment.id,active:false},socket); return; }
      const position=vector(packet.position),rotation=vector(packet.rotation);
      if(position&&rotation&&attachment.state.playerClass==="DRONE") this.broadcast({type:"drone_state",id:attachment.id,active:true,position,rotation},socket);
      return;
    }
    if (packet.type === "utility_effect") {
      const meta = await this.currentMatch();
      if (meta.phase !== "playing" || packet.effect !== "flash" || !packet.targetId || packet.targetId === attachment.id) return;
      const targetSocket = this.ctx.getWebSockets().find((candidate) => (candidate.deserializeAttachment() as SocketAttachment).id === packet.targetId);
      if (!targetSocket) return;
      const duration = Math.min(1700, Math.max(250, typeof packet.duration === "number" && Number.isFinite(packet.duration) ? packet.duration : 1000));
      targetSocket.send(JSON.stringify({ type: "utility_effect", effect: "flash", duration, attackerId: attachment.id }));
      return;
    }
    if (packet.type === "hit") {
      const meta = await this.currentMatch();
      if (meta.phase !== "playing" || !packet.targetId || packet.targetId === attachment.id) return;
      const targetSocket = this.ctx.getWebSockets().find((candidate) => (candidate.deserializeAttachment() as SocketAttachment).id === packet.targetId);
      if (!targetSocket) return;
      const target = targetSocket.deserializeAttachment() as SocketAttachment;
      if ((meta.mode === "TDM" || meta.mode === "CTP") && target.state.team === attachment.state.team) return;
      if ((target.state.spawnProtectedUntil ?? 0) > Date.now()) return;
      if (target.adminRole === "owner" && target.godMode) return;
      if (target.state.health <= 0) return;
      const baseDamage = Math.max(0, typeof packet.damage === "number" && Number.isFinite(packet.damage) ? packet.damage : 0);
      const attackerMultiplier = attachment.adminRole === "owner" ? attachment.damageMultiplier ?? 1 : 1;
      const damage = Math.min(100, baseDamage * attackerMultiplier);
      if (damage === 0) return;
      target.state.health = Math.max(0, target.state.health - damage);
      const killed = target.state.health === 0;
      if (killed) {
        attachment.state.kills += 1; target.state.deaths += 1;
        if (meta.mode === "TDM") { meta.teamScores[attachment.state.team] += 1; await this.ctx.storage.put("match", meta); }
      }
      socket.serializeAttachment(attachment); targetSocket.serializeAttachment(target);
      targetSocket.send(JSON.stringify({ type: "damage", health: target.state.health, attackerId: attachment.id }));
      this.broadcast({ type: killed ? "killed" : "player_health", id: target.state.id, health: target.state.health, attackerId: attachment.id, weapon: typeof packet.weapon === "string" ? packet.weapon.slice(0, 40) : "WEAPON", headshot: Boolean(packet.headshot) });
      if (killed) this.broadcast({ type: "state", player: attachment.state });
      if (killed && meta.mode === "TDM") this.broadcast({ type: "match", match: meta });
      return;
    }
    if (packet.type === "respawn") {
      const meta = await this.currentMatch();
      const otherPlayers = this.ctx.getWebSockets().filter((candidate) => candidate !== socket && candidate.readyState === WebSocket.OPEN).map((candidate) => (candidate.deserializeAttachment() as SocketAttachment).state);
      const spawn = chooseSpawn(meta, attachment.state.team, otherPlayers);
      attachment.state.health = maxHealth(attachment.state);
      attachment.state.spawnProtectedUntil = Date.now() + 3000;
      attachment.state.x = spawn.x;
      attachment.state.y = 1.7;
      attachment.state.z = spawn.z;
      socket.serializeAttachment(attachment);
      socket.send(JSON.stringify({ type: "respawned", player: attachment.state }));
      this.broadcast({ type: "state", player: attachment.state });
      return;
    }
    if (packet.type === "end_game") {
      const meta = await this.currentMatch();
      if (meta.phase !== "playing" || attachment.endGamePhase === meta.phaseEndsAt) return;
      attachment.endGamePhase = meta.phaseEndsAt; socket.serializeAttachment(attachment);
      meta.endVotes += 1; await this.ctx.storage.put("match", meta);
      const players = this.ctx.getWebSockets().filter((candidate) => candidate.readyState === WebSocket.OPEN);
      const unanimous = players.length > 0 && players.every((candidate) => (candidate.deserializeAttachment() as SocketAttachment).endGamePhase === meta.phaseEndsAt);
      if (unanimous) await this.advanceMatch(meta); else this.broadcast({ type: "match", match: meta });
      return;
    }
    if (packet.type === "vote") {
      const meta = await this.currentMatch();
      if (meta.phase !== "voting") return;
      if (packet.category === "mode") {
        if (attachment.votedModePhase === meta.phaseEndsAt) return;
        const mode: GameMode = packet.mode === "TDM" || packet.mode === "KOTH" || packet.mode === "CTP" ? packet.mode : "FFA";
        attachment.votedModePhase = meta.phaseEndsAt;
        attachment.votedMode = mode;
        meta.modeVotes += 1;
        meta.modeVoteCounts[mode] += 1;
      } else {
        if (attachment.votedMapPhase === meta.phaseEndsAt) return;
        const map: MultiplayerMap = packet.map === "BLACKWOOD FOREST" || packet.map === "FROSTLINE BASE" || packet.map === "TIDEBREAK BEACH" ? packet.map : "CITY BLOCK";
        attachment.votedMapPhase = meta.phaseEndsAt;
        attachment.votedMap = map;
        meta.votes += 1;
        meta.mapVotes[map] += 1;
      }
      socket.serializeAttachment(attachment);
      await this.ctx.storage.put("match", meta);
      const players = this.ctx.getWebSockets().filter((candidate) => candidate.readyState === WebSocket.OPEN);
      const everyoneFinished = players.length > 0 && players.every((candidate) => {
        const vote = candidate.deserializeAttachment() as SocketAttachment;
        return vote.votedMapPhase === meta.phaseEndsAt && vote.votedModePhase === meta.phaseEndsAt;
      });
      this.broadcast({ type: "match", match: meta });
      if (everyoneFinished) {
        // Let every client render the last player's vote before changing screens.
        await new Promise((resolve) => setTimeout(resolve, FINAL_VOTE_DISPLAY_DURATION));
        const latest = await this.currentMatch();
        if (latest.phase === "voting" && latest.phaseEndsAt === meta.phaseEndsAt) await this.advanceMatch(latest);
      }
      return;
    }
    if (packet.type !== "state") return;
    const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
    attachment.state = {
      ...attachment.state,
      x: finite(packet.x, attachment.state.x), y: finite(packet.y, attachment.state.y), z: finite(packet.z, attachment.state.z), yaw: finite(packet.yaw, attachment.state.yaw),
      movement: packet.movement === "walk" || packet.movement === "sprint" ? packet.movement : "static",
      crouching: Boolean(packet.crouching), prone: Boolean(packet.prone),
      slot: typeof packet.slot === "number" && packet.slot >= 1 && packet.slot <= 5 ? packet.slot : attachment.state.slot,
      primary: typeof packet.primary === "string" ? packet.primary.slice(0, 40) : attachment.state.primary,
      secondary: typeof packet.secondary === "string" ? packet.secondary.slice(0, 40) : attachment.state.secondary,
      equipment: packet.equipment === "HEAT VISION GOGGLES" || packet.equipment === "360 GOGGLES" || packet.equipment === "SATELLITE GPS" ? packet.equipment : "ARMOR PLATING",
      playerClass: (["ASSAULT", "SCOUT", "MEDIC", "HEAVY", "MORTAR", "AIRSTRIKE", "DEMOLITION", "ENGINEER", "DRONE"] as unknown[]).includes(packet.playerClass) ? packet.playerClass as PlayerState["playerClass"] : "RECRUIT",
      skin: safeString(packet.skin, attachment.state.skin, 16), uniform: safeString(packet.uniform, attachment.state.uniform, 16), camo: safeString(packet.camo, attachment.state.camo, 24),
      accessories: Array.isArray(packet.accessories) ? packet.accessories.filter((item): item is string => typeof item === "string" && ["GOGGLES", "MASK", "HEADSET", "NVG"].includes(item)).slice(0, 4) : attachment.state.accessories,
      armor: safeString(packet.armor, attachment.state.armor, 16),
      helmet: safeString(packet.helmet, attachment.state.helmet, 24), faceGear: safeString(packet.faceGear, attachment.state.faceGear, 24), headAccessory: safeString(packet.headAccessory, attachment.state.headAccessory, 24),
      chestRig: safeString(packet.chestRig, attachment.state.chestRig, 24), backpack: safeString(packet.backpack, attachment.state.backpack, 24),
      pants: safeString(packet.pants, attachment.state.pants, 16), gloves: safeString(packet.gloves, attachment.state.gloves, 16), boots: safeString(packet.boots, attachment.state.boots, 16),
      callsign: safeString(packet.callsign, attachment.state.callsign, 18).replace(/[^a-z0-9 _-]/gi, "").trim() || attachment.state.callsign,
    };
    attachment.state.health = Math.min(attachment.state.health, maxHealth(attachment.state));
    socket.serializeAttachment(attachment);
    this.broadcast({ type: "state", player: attachment.state }, socket);
    const meta = await this.currentMatch();
    if (meta.phase === "playing" && (meta.mode === "KOTH" || meta.mode === "CTP")) await this.updateObjectives(meta);
  }

  async alarm() {
    if (this.ctx.getWebSockets().length === 0) {
      const emptyResetAt = await this.ctx.storage.get<number>("emptyResetAt");
      if (emptyResetAt && emptyResetAt > Date.now()) {
        await this.ctx.storage.setAlarm(emptyResetAt);
        return;
      }
      await this.resetEmptyRoom();
      return;
    }
    await this.ctx.storage.delete("emptyResetAt");
    const meta = await this.currentMatch();
    if (meta.phaseEndsAt > Date.now()) { await this.ctx.storage.setAlarm(meta.phaseEndsAt); return; }
    await this.advanceMatch(meta);
  }

  async webSocketClose(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment) this.broadcast({ type: "left", id: attachment.id }, socket);
    const remainingPlayers = this.ctx.getWebSockets().filter((candidate) => candidate !== socket && candidate.readyState === WebSocket.OPEN);
    const meta = await this.currentMatch();
    if (attachment && meta.phase === "voting") {
      let revokedVote = false;
      if (attachment.votedMapPhase === meta.phaseEndsAt && attachment.votedMap) {
        meta.votes = Math.max(0, meta.votes - 1);
        meta.mapVotes[attachment.votedMap] = Math.max(0, meta.mapVotes[attachment.votedMap] - 1);
        revokedVote = true;
      }
      if (attachment.votedModePhase === meta.phaseEndsAt) {
        meta.modeVotes = Math.max(0, meta.modeVotes - 1);
        if (attachment.votedMode) meta.modeVoteCounts[attachment.votedMode] = Math.max(0, meta.modeVoteCounts[attachment.votedMode] - 1);
        revokedVote = true;
      }
      if (revokedVote) await this.ctx.storage.put("match", meta);
    }
    // Clients briefly reconnect when the winning map changes. Deleting match
    // state here restarted voting before those clients could load the winner.
    if (remainingPlayers.length === 0) {
      const emptyResetAt = Date.now() + EMPTY_ROOM_GRACE;
      await this.ctx.storage.put("emptyResetAt", emptyResetAt);
      await this.ctx.storage.setAlarm(emptyResetAt);
      return;
    }
    if (meta.phase === "voting" && remainingPlayers.every((candidate) => {
      const vote = candidate.deserializeAttachment() as SocketAttachment;
      return vote.votedMapPhase === meta.phaseEndsAt && vote.votedModePhase === meta.phaseEndsAt;
    })) await this.advanceMatch(meta);
    else if (meta.phase === "voting") this.broadcast({ type: "match", match: meta });
  }

  private broadcast(packet: unknown, except?: WebSocket) {
    const encoded = JSON.stringify(packet);
    const exceptId = except ? (except.deserializeAttachment() as SocketAttachment | null)?.id : undefined;
    this.ctx.getWebSockets().forEach((socket) => {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (socket.readyState !== WebSocket.OPEN || (exceptId && attachment?.id === exceptId)) return;
      try { socket.send(encoded); } catch {}
    });
  }

  private async updateObjectives(meta: MatchMeta) {
    const now = Date.now(), dt = Math.min(.3, (now - meta.lastObjectiveTick) / 1000);
    if (dt < .14) return;
    meta.lastObjectiveTick = now;
    const sockets = this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN);
    const living = sockets.map((socket) => ({ socket, attachment: socket.deserializeAttachment() as SocketAttachment })).filter(({ attachment }) => attachment.state.health > 0);
    if (meta.mode === "KOTH") {
      const hill = meta.objectiveZones[0];
      if (hill) living.forEach(({ socket, attachment }) => {
        if (Math.hypot(attachment.state.x - hill.x, attachment.state.z - hill.z) > hill.radius) return;
        attachment.state.objectiveScore += dt * 10; socket.serializeAttachment(attachment);
      });
    } else if (meta.mode === "CTP") {
      meta.objectiveZones.forEach((zone) => {
        const inside = living.filter(({ attachment }) => Math.hypot(attachment.state.x - zone.x, attachment.state.z - zone.z) <= zone.radius);
        const alpha = inside.some(({ attachment }) => attachment.state.team === "ALPHA"), bravo = inside.some(({ attachment }) => attachment.state.team === "BRAVO");
        if (alpha !== bravo) zone.progress = Math.max(-100, Math.min(100, zone.progress + (alpha ? 1 : -1) * 28 * dt));
        if (zone.progress >= 100) zone.owner = "ALPHA";
        if (zone.progress <= -100) zone.owner = "BRAVO";
        if (zone.owner) meta.teamScores[zone.owner] += dt * 2;
      });
    }
    await this.ctx.storage.put("match", meta);
    this.broadcast({ type: "match", match: meta });
    if (meta.mode === "KOTH") living.forEach(({ socket, attachment }) => { try { socket.send(JSON.stringify({ type:"objective_score", score:attachment.state.objectiveScore })); } catch {} });
  }

  private async resetEmptyRoom() {
    await this.ctx.storage.delete("match");
    await this.ctx.storage.delete("emptyResetAt");
    await this.ctx.storage.deleteAlarm();
  }

  private async currentMatch(): Promise<MatchMeta> {
    const day = new Date().toISOString().slice(0, 10);
    let meta = await this.ctx.storage.get<MatchMeta>("match");
    if (!meta || meta.day !== day) {
      meta = { day, phase: "voting", phaseEndsAt: Date.now() + VOTE_DURATION, votes: 0, mapVotes: { "CITY BLOCK": 0, "BLACKWOOD FOREST": 0, "FROSTLINE BASE": 0, "TIDEBREAK BEACH": 0 }, modeVotes: 0, modeVoteCounts: { FFA: 0, TDM: 0, KOTH: 0, CTP: 0 }, endVotes: 0, map: "CITY BLOCK", mode: "FFA", teamScores: { ALPHA: 0, BRAVO: 0 }, objectiveZones: [], lastObjectiveTick: Date.now(), winnerId: null, winningTeam: null, winningKills: 0 };
      await this.ctx.storage.put("match", meta); await this.ctx.storage.setAlarm(meta.phaseEndsAt);
    } else {
      meta.modeVotes ??= 0;
      meta.mapVotes ??= { "CITY BLOCK": meta.votes ?? 0, "BLACKWOOD FOREST": 0, "FROSTLINE BASE": 0, "TIDEBREAK BEACH": 0 };
      meta.mapVotes["FROSTLINE BASE"] ??= 0;
      meta.mapVotes["TIDEBREAK BEACH"] ??= 0;
      meta.modeVoteCounts ??= { FFA: meta.modeVotes ?? 0, TDM: 0, KOTH: 0, CTP: 0 };
      meta.modeVoteCounts.KOTH ??= 0; meta.modeVoteCounts.CTP ??= 0;
      meta.teamScores ??= { ALPHA: 0, BRAVO: 0 };
      meta.objectiveZones ??= []; meta.lastObjectiveTick ??= Date.now();
      meta.endVotes ??= 0;
      meta.winnerId ??= null;
      meta.winningTeam ??= null;
      meta.winningKills ??= 0;
      meta.mode ??= "FFA";
      if (meta.phaseEndsAt <= Date.now()) meta = await this.advanceMatch(meta);
    }
    return meta;
  }

  private async advanceMatch(meta: MatchMeta): Promise<MatchMeta> {
    let phase: MatchMeta["phase"], duration: number, winnerId: string | null = null, winningTeam: PlayerState["team"] | null = null, winningKills = 0;
    if (meta.phase === "voting") {
      phase = "playing"; duration = MATCH_DURATION;
      const maps: MultiplayerMap[] = ["CITY BLOCK", "BLACKWOOD FOREST", "FROSTLINE BASE", "TIDEBREAK BEACH"];
      const topMapVotes = Math.max(...maps.map((map) => meta.mapVotes[map]));
      const tiedMaps = maps.filter((map) => meta.mapVotes[map] === topMapVotes);
      meta.map = tiedMaps[Math.floor(Math.random() * tiedMaps.length)];
      const modes: GameMode[] = ["FFA", "TDM", "KOTH", "CTP"];
      const topModeVotes = Math.max(...modes.map((mode) => meta.modeVoteCounts[mode]));
      const tiedModes = modes.filter((mode) => meta.modeVoteCounts[mode] === topModeVotes);
      meta.mode = tiedModes[Math.floor(Math.random() * tiedModes.length)];
      meta.teamScores = { ALPHA: 0, BRAVO: 0 };
      const citySpots = [[0,0],[-24,0],[24,0],[0,-25],[0,25],[-18,-18],[18,18]];
      const forestSpots = [[5,0],[-25,-15],[22,15],[-26,24],[25,-24],[8,-23],[-18,10]];
      const frostSpots = [[0,22],[-28,18],[28,18],[-22,-5],[22,-5],[-12,-24],[12,-24]];
      const beachSpots = [[0,73],[-45,77],[45,77],[-31,57],[32,58],[0,43],[-43,35],[43,35],[-31,11],[32,10],[-47,-5],[47,-5],[-15,-27],[16,-29]];
      const spots = [...(meta.map === "CITY BLOCK" ? citySpots : meta.map === "BLACKWOOD FOREST" ? forestSpots : meta.map === "FROSTLINE BASE" ? frostSpots : beachSpots)].sort(() => Math.random() - .5);
      meta.objectiveZones = meta.mode === "KOTH" ? [{ id:"HILL", x:spots[0][0], z:spots[0][1], radius:7.5, owner:null, progress:0 }] : meta.mode === "CTP" ? spots.slice(0,3).map(([x,z], index) => ({ id:String.fromCharCode(65 + index), x, z, radius:4.25, owner:null, progress:0 })) : [];
      meta.lastObjectiveTick = Date.now();
      const roundSockets = this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN);
      const spawnedPlayers: PlayerState[] = [];
      roundSockets.forEach((socket, index) => {
        const attachment = socket.deserializeAttachment() as SocketAttachment;
        attachment.state.team = index % 2 === 0 ? "ALPHA" : "BRAVO";
        attachment.state.kills = 0; attachment.state.deaths = 0; attachment.state.health = maxHealth(attachment.state); attachment.state.objectiveScore = 0;
        attachment.state.spawnProtectedUntil = Date.now() + 3000;
        const spawn = chooseSpawn(meta, attachment.state.team, spawnedPlayers);
        attachment.state.x = spawn.x; attachment.state.z = spawn.z;
        attachment.state.y = 1.7; attachment.state.yaw = attachment.state.z > 0 ? 0 : Math.PI;
        socket.serializeAttachment(attachment); spawnedPlayers.push(attachment.state);
      });
    }
    else if (meta.phase === "playing") {
      phase = "results"; duration = RESULTS_DURATION;
      const scores = this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN).map((socket) => (socket.deserializeAttachment() as SocketAttachment).state);
      if (meta.mode === "TDM" || meta.mode === "CTP") {
        const alphaKills = meta.teamScores.ALPHA, bravoKills = meta.teamScores.BRAVO;
        winningKills = Math.floor(Math.max(alphaKills, bravoKills)); winningTeam = alphaKills === bravoKills ? null : alphaKills > bravoKills ? "ALPHA" : "BRAVO";
      } else {
        winningKills = scores.length ? Math.max(...scores.map((player) => player.kills)) : 0;
        const leaders = scores.filter((player) => player.kills === winningKills);
        winnerId = leaders.length === 1 ? leaders[0].id : null;
      }
    } else { phase = "voting"; duration = VOTE_DURATION; }
    if (meta.mode === "KOTH" && phase === "results") {
      const players = this.ctx.getWebSockets().map((socket) => (socket.deserializeAttachment() as SocketAttachment).state);
      winningKills = players.length ? Math.floor(Math.max(...players.map((player) => player.objectiveScore))) : 0;
      const leaders = players.filter((player) => Math.floor(player.objectiveScore) === winningKills); winnerId = leaders.length === 1 ? leaders[0].id : null;
    }
    const next: MatchMeta = { ...meta, phase, phaseEndsAt: Date.now() + duration, votes: 0, mapVotes: { "CITY BLOCK": 0, "BLACKWOOD FOREST": 0, "FROSTLINE BASE": 0, "TIDEBREAK BEACH": 0 }, modeVotes: 0, modeVoteCounts: { FFA: 0, TDM: 0, KOTH: 0, CTP: 0 }, endVotes: 0, winnerId, winningTeam, winningKills };
    await this.ctx.storage.put("match", next); await this.ctx.storage.setAlarm(next.phaseEndsAt); this.broadcast({ type: "match", match: next });
    if (phase === "playing") this.ctx.getWebSockets().forEach((socket) => {
      const attachment = socket.deserializeAttachment() as SocketAttachment;
      try { socket.send(JSON.stringify({ type: "round_start", map: next.map, player: attachment.state })); } catch {}
    });
    return next;
  }
}

interface Env { GAME_ROOMS: DurableObjectNamespace<GameRoom> }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ online: true });
    if (url.pathname === "/rooms") {
      const sectors = await Promise.all([1, 2, 3, 4].map(async (number) => {
        const sector = `sector-${number}`;
        const response = await env.GAME_ROOMS.getByName(sector).fetch("https://room.internal/status");
        const status = await response.json<{ players: number }>();
        return [sector, status.players] as const;
      }));
      return json({ sectors: Object.fromEntries(sectors) });
    }
    const match = url.pathname.match(/^\/room\/(sector-[1-4])$/);
    if (!match) return json({ error: "Unknown multiplayer room" }, 404);
    return env.GAME_ROOMS.getByName(match[1]).fetch(request);
  },
} satisfies ExportedHandler<Env>;
