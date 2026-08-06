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

type SocketAttachment = { id: string; state: PlayerState };

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
});

export class GameRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "WebSocket upgrade required" }, 426);
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    const id = crypto.randomUUID();
    const initial: PlayerState = { id, x: 0, y: 1.7, z: 38, yaw: 0, movement: "static", crouching: false, prone: false, slot: 1, primary: "VXR-4 CARBINE", secondary: "P9 SIDEARM" };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, state: initial } satisfies SocketAttachment);

    const players = this.ctx.getWebSockets().filter((socket) => socket !== server).map((socket) => (socket.deserializeAttachment() as SocketAttachment).state);
    server.send(JSON.stringify({ type: "welcome", id, players }));
    this.broadcast({ type: "joined", player: initial }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 4096) return;
    let packet: Partial<PlayerState> & { type?: string };
    try { packet = JSON.parse(message); } catch { return; }
    if (packet.type !== "state") return;
    const attachment = socket.deserializeAttachment() as SocketAttachment;
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

  webSocketClose(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment) this.broadcast({ type: "left", id: attachment.id }, socket);
  }

  private broadcast(packet: unknown, except?: WebSocket) {
    const encoded = JSON.stringify(packet);
    this.ctx.getWebSockets().forEach((socket) => { if (socket !== except) try { socket.send(encoded); } catch {} });
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
