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
  slot: number;
  primary: string;
  secondary: string;
  skin: string;
  uniform: string;
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
};

type MultiplayerMap = "CITY BLOCK" | "BLACKWOOD FOREST";
type SocketAttachment = { id: string; state: PlayerState; votedMapPhase?: number; votedMap?: MultiplayerMap; votedModePhase?: number; endGamePhase?: number };
type MatchMeta = { day: string; phase: "voting" | "playing" | "results"; phaseEndsAt: number; votes: number; mapVotes: Record<MultiplayerMap, number>; modeVotes: number; endVotes: number; map: MultiplayerMap; mode: "FFA"; winnerId: string | null; winningKills: number };
const VOTE_DURATION = 30_000;
const MATCH_DURATION = 10 * 60_000;
const RESULTS_DURATION = 5_000;
const EMPTY_ROOM_GRACE = 10_000;
const safeString = (value: unknown, fallback: string, maxLength: number) =>
  typeof value === "string" ? value.slice(0, maxLength) : fallback;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
});

export class GameRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/status") {
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
    const playerNumber = this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN).length;
    const forest = meta.map === "BLACKWOOD FOREST";
    const spawnX = forest ? [-4, 4, -34, 34][playerNumber % 4] : [-6, 6, -6, 6][playerNumber % 4];
    const spawnZ = forest ? [36, -36, 4, -4][playerNumber % 4] : [38, -38, -38, 38][playerNumber % 4];
    const initial: PlayerState = { id, x: spawnX, y: 1.7, z: spawnZ, yaw: spawnZ > 0 ? 0 : Math.PI, movement: "static", crouching: false, prone: false, slot: 1, primary: "VXR-4 CARBINE", secondary: "P9 SIDEARM", skin: "#a9795e", uniform: "#303a3b", armor: "#20292b", helmet: "TACTICAL", faceGear: "GOGGLES", headAccessory: "HEADSET", chestRig: "PLATE CARRIER", backpack: "ASSAULT PACK", pants: "#303a3b", gloves: "#20292b", boots: "#151b1d", kills: 0, deaths: 0, health: 100 };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, state: initial } satisfies SocketAttachment);

    const players = this.ctx.getWebSockets()
      .filter((socket) => socket.readyState === WebSocket.OPEN && (socket.deserializeAttachment() as SocketAttachment).id !== id)
      .map((socket) => (socket.deserializeAttachment() as SocketAttachment).state);
    const joiningAttachment = server.deserializeAttachment() as SocketAttachment;
    server.send(JSON.stringify({ type: "welcome", id, player: initial, players, match: meta, yourMapVote: joiningAttachment.votedMapPhase === meta.phaseEndsAt ? joiningAttachment.votedMap : null, yourModeVote: joiningAttachment.votedModePhase === meta.phaseEndsAt }));
    this.broadcast({ type: "joined", player: initial }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 4096) return;
    let packet: Partial<PlayerState> & { type?: string; category?: "map" | "mode"; map?: MultiplayerMap; targetId?: string; damage?: number; weapon?: string; headshot?: boolean };
    try { packet = JSON.parse(message); } catch { return; }
    const attachment = socket.deserializeAttachment() as SocketAttachment;
    if (packet.type === "hit") {
      const meta = await this.currentMatch();
      if (meta.phase !== "playing" || !packet.targetId || packet.targetId === attachment.id) return;
      const targetSocket = this.ctx.getWebSockets().find((candidate) => (candidate.deserializeAttachment() as SocketAttachment).id === packet.targetId);
      if (!targetSocket) return;
      const target = targetSocket.deserializeAttachment() as SocketAttachment;
      if (target.state.health <= 0) return;
      const damage = Math.min(100, Math.max(0, typeof packet.damage === "number" && Number.isFinite(packet.damage) ? packet.damage : 0));
      if (damage === 0) return;
      target.state.health = Math.max(0, target.state.health - damage);
      const killed = target.state.health === 0;
      if (killed) { attachment.state.kills += 1; target.state.deaths += 1; }
      socket.serializeAttachment(attachment); targetSocket.serializeAttachment(target);
      targetSocket.send(JSON.stringify({ type: "damage", health: target.state.health, attackerId: attachment.id }));
      this.broadcast({ type: killed ? "killed" : "player_health", id: target.state.id, health: target.state.health, attackerId: attachment.id, weapon: typeof packet.weapon === "string" ? packet.weapon.slice(0, 40) : "WEAPON", headshot: Boolean(packet.headshot) });
      if (killed) this.broadcast({ type: "state", player: attachment.state });
      return;
    }
    if (packet.type === "respawn") {
      attachment.state.health = 100;
      attachment.state.x = typeof packet.x === "number" && Number.isFinite(packet.x) ? packet.x : attachment.state.x;
      attachment.state.y = 1.7;
      attachment.state.z = typeof packet.z === "number" && Number.isFinite(packet.z) ? packet.z : attachment.state.z;
      socket.serializeAttachment(attachment);
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
        attachment.votedModePhase = meta.phaseEndsAt;
        meta.modeVotes += 1;
      } else {
        if (attachment.votedMapPhase === meta.phaseEndsAt) return;
        const map: MultiplayerMap = packet.map === "BLACKWOOD FOREST" ? "BLACKWOOD FOREST" : "CITY BLOCK";
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
      if (everyoneFinished) await this.advanceMatch(meta);
      else this.broadcast({ type: "match", match: meta });
      return;
    }
    if (packet.type !== "state") return;
    const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
    attachment.state = {
      ...attachment.state,
      x: finite(packet.x, attachment.state.x), y: finite(packet.y, attachment.state.y), z: finite(packet.z, attachment.state.z), yaw: finite(packet.yaw, attachment.state.yaw),
      movement: packet.movement === "walk" || packet.movement === "sprint" ? packet.movement : "static",
      crouching: Boolean(packet.crouching), prone: Boolean(packet.prone),
      slot: typeof packet.slot === "number" && packet.slot >= 1 && packet.slot <= 4 ? packet.slot : attachment.state.slot,
      primary: typeof packet.primary === "string" ? packet.primary.slice(0, 40) : attachment.state.primary,
      secondary: typeof packet.secondary === "string" ? packet.secondary.slice(0, 40) : attachment.state.secondary,
      skin: safeString(packet.skin, attachment.state.skin, 16), uniform: safeString(packet.uniform, attachment.state.uniform, 16), armor: safeString(packet.armor, attachment.state.armor, 16),
      helmet: safeString(packet.helmet, attachment.state.helmet, 24), faceGear: safeString(packet.faceGear, attachment.state.faceGear, 24), headAccessory: safeString(packet.headAccessory, attachment.state.headAccessory, 24),
      chestRig: safeString(packet.chestRig, attachment.state.chestRig, 24), backpack: safeString(packet.backpack, attachment.state.backpack, 24),
      pants: safeString(packet.pants, attachment.state.pants, 16), gloves: safeString(packet.gloves, attachment.state.gloves, 16), boots: safeString(packet.boots, attachment.state.boots, 16),
    };
    socket.serializeAttachment(attachment);
    this.broadcast({ type: "state", player: attachment.state }, socket);
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
    // Clients briefly reconnect when the winning map changes. Deleting match
    // state here restarted voting before those clients could load the winner.
    if (remainingPlayers.length === 0) {
      const emptyResetAt = Date.now() + EMPTY_ROOM_GRACE;
      await this.ctx.storage.put("emptyResetAt", emptyResetAt);
      await this.ctx.storage.setAlarm(emptyResetAt);
      return;
    }
    const meta = await this.currentMatch();
    if (meta.phase === "voting" && remainingPlayers.every((candidate) => {
      const vote = candidate.deserializeAttachment() as SocketAttachment;
      return vote.votedMapPhase === meta.phaseEndsAt && vote.votedModePhase === meta.phaseEndsAt;
    })) await this.advanceMatch(meta);
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

  private async resetEmptyRoom() {
    await this.ctx.storage.delete("match");
    await this.ctx.storage.delete("emptyResetAt");
    await this.ctx.storage.deleteAlarm();
  }

  private async currentMatch(): Promise<MatchMeta> {
    const day = new Date().toISOString().slice(0, 10);
    let meta = await this.ctx.storage.get<MatchMeta>("match");
    if (!meta || meta.day !== day) {
      meta = { day, phase: "voting", phaseEndsAt: Date.now() + VOTE_DURATION, votes: 0, mapVotes: { "CITY BLOCK": 0, "BLACKWOOD FOREST": 0 }, modeVotes: 0, endVotes: 0, map: "CITY BLOCK", mode: "FFA", winnerId: null, winningKills: 0 };
      await this.ctx.storage.put("match", meta); await this.ctx.storage.setAlarm(meta.phaseEndsAt);
    } else {
      meta.modeVotes ??= 0;
      meta.mapVotes ??= { "CITY BLOCK": meta.votes ?? 0, "BLACKWOOD FOREST": 0 };
      meta.endVotes ??= 0;
      meta.winnerId ??= null;
      meta.winningKills ??= 0;
      meta.mode ??= "FFA";
      if (meta.phaseEndsAt <= Date.now()) meta = await this.advanceMatch(meta);
    }
    return meta;
  }

  private async advanceMatch(meta: MatchMeta): Promise<MatchMeta> {
    let phase: MatchMeta["phase"], duration: number, winnerId: string | null = null, winningKills = 0;
    if (meta.phase === "voting") {
      phase = "playing"; duration = MATCH_DURATION;
      const cityVotes = meta.mapVotes["CITY BLOCK"], forestVotes = meta.mapVotes["BLACKWOOD FOREST"];
      meta.map = forestVotes > cityVotes ? "BLACKWOOD FOREST" : cityVotes > forestVotes ? "CITY BLOCK" : Math.random() < .5 ? "CITY BLOCK" : "BLACKWOOD FOREST";
      this.ctx.getWebSockets().forEach((socket, index) => {
        const attachment = socket.deserializeAttachment() as SocketAttachment;
        const forest = meta.map === "BLACKWOOD FOREST";
        attachment.state.kills = 0; attachment.state.deaths = 0; attachment.state.health = 100;
        attachment.state.x = forest ? [-4, 4, -34, 34][index % 4] : [-6, 6, -6, 6][index % 4];
        attachment.state.z = forest ? [36, -36, 4, -4][index % 4] : [38, -38, -38, 38][index % 4];
        attachment.state.y = 1.7; attachment.state.yaw = attachment.state.z > 0 ? 0 : Math.PI;
        socket.serializeAttachment(attachment);
      });
    }
    else if (meta.phase === "playing") {
      phase = "results"; duration = RESULTS_DURATION;
      const scores = this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN).map((socket) => (socket.deserializeAttachment() as SocketAttachment).state);
      winningKills = scores.length ? Math.max(...scores.map((player) => player.kills)) : 0;
      const leaders = scores.filter((player) => player.kills === winningKills);
      winnerId = leaders.length === 1 ? leaders[0].id : null;
    } else { phase = "voting"; duration = VOTE_DURATION; }
    const next: MatchMeta = { ...meta, phase, phaseEndsAt: Date.now() + duration, votes: 0, mapVotes: { "CITY BLOCK": 0, "BLACKWOOD FOREST": 0 }, modeVotes: 0, endVotes: 0, mode: "FFA", winnerId, winningKills };
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
