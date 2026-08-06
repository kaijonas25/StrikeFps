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
};

type SocketAttachment = { id: string; state: PlayerState; votedPhase?: number };
type MatchMeta = { day: string; phase: "voting" | "playing"; phaseEndsAt: number; votes: number; map: "CITY BLOCK" };
const VOTE_DURATION = 15_000;
const MATCH_DURATION = 5 * 60_000;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
});

export class GameRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "WebSocket upgrade required" }, 426);
    const meta = await this.currentMatch();
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    const id = crypto.randomUUID();
    const initial: PlayerState = { id, x: 0, y: 1.7, z: 38, yaw: 0, movement: "static", crouching: false, prone: false, slot: 1, primary: "VXR-4 CARBINE", secondary: "P9 SIDEARM" };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, state: initial } satisfies SocketAttachment);

    const players = this.ctx.getWebSockets().filter((socket) => socket !== server).map((socket) => (socket.deserializeAttachment() as SocketAttachment).state);
    server.send(JSON.stringify({ type: "welcome", id, players, match: meta }));
    this.broadcast({ type: "joined", player: initial }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 4096) return;
    let packet: Partial<PlayerState> & { type?: string };
    try { packet = JSON.parse(message); } catch { return; }
    const attachment = socket.deserializeAttachment() as SocketAttachment;
    if (packet.type === "vote") {
      const meta = await this.currentMatch();
      if (meta.phase !== "voting" || attachment.votedPhase === meta.phaseEndsAt) return;
      attachment.votedPhase = meta.phaseEndsAt; socket.serializeAttachment(attachment);
      meta.votes += 1; await this.ctx.storage.put("match", meta); this.broadcast({ type: "match", match: meta });
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
    };
    socket.serializeAttachment(attachment);
    this.broadcast({ type: "state", player: attachment.state }, socket);
  }

  async alarm() {
    const meta = await this.currentMatch();
    if (meta.phaseEndsAt > Date.now()) { await this.ctx.storage.setAlarm(meta.phaseEndsAt); return; }
    await this.advanceMatch(meta);
  }

  webSocketClose(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment) this.broadcast({ type: "left", id: attachment.id }, socket);
  }

  private broadcast(packet: unknown, except?: WebSocket) {
    const encoded = JSON.stringify(packet);
    this.ctx.getWebSockets().forEach((socket) => { if (socket !== except) try { socket.send(encoded); } catch {} });
  }

  private async currentMatch(): Promise<MatchMeta> {
    const day = new Date().toISOString().slice(0, 10);
    let meta = await this.ctx.storage.get<MatchMeta>("match");
    if (!meta || meta.day !== day) {
      meta = { day, phase: "voting", phaseEndsAt: Date.now() + VOTE_DURATION, votes: 0, map: "CITY BLOCK" };
      await this.ctx.storage.put("match", meta); await this.ctx.storage.setAlarm(meta.phaseEndsAt);
    } else if (meta.phaseEndsAt <= Date.now()) meta = await this.advanceMatch(meta);
    return meta;
  }

  private async advanceMatch(meta: MatchMeta): Promise<MatchMeta> {
    const next: MatchMeta = { ...meta, phase: meta.phase === "voting" ? "playing" : "voting", phaseEndsAt: Date.now() + (meta.phase === "voting" ? MATCH_DURATION : VOTE_DURATION), votes: 0, map: "CITY BLOCK" };
    await this.ctx.storage.put("match", next); await this.ctx.storage.setAlarm(next.phaseEndsAt); this.broadcast({ type: "match", match: next }); return next;
  }
}

interface Env { GAME_ROOMS: DurableObjectNamespace<GameRoom> }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ online: true });
    const match = url.pathname.match(/^\/room\/(sector-[1-4])$/);
    if (!match) return json({ error: "Unknown multiplayer room" }, 404);
    return env.GAME_ROOMS.getByName(match[1]).fetch(request);
  },
} satisfies ExportedHandler<Env>;
