import type { ServerResponse } from "node:http";

const sseClients = new Set<ServerResponse>();

export function registerSSEClient(res: ServerResponse): void {
  sseClients.add(res);
}

export function unregisterSSEClient(res: ServerResponse): void {
  sseClients.delete(res);
}

export function broadcastEvent(eventType: string, data: unknown): void {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}
