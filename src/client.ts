import WebSocket from "ws";
import { ActionResponse, GameState, StateUpdate } from "./types.js";

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SpireBridgeClient {
  private url: string;
  private ws: WebSocket | null = null;
  private reqCounter = 0;
  private pending = new Map<string, PendingRequest>();
  private stateQueue: StateUpdate[] = [];
  private stateWaiters: Array<(update: StateUpdate) => void> = [];
  public lastState: GameState | null = null;

  constructor(url = "ws://127.0.0.1:38642") {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.once("open", () => resolve());
      this.ws.once("error", (err) => reject(err));

      this.ws.on("message", (raw: WebSocket.RawData) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg["type"] === "state_update") {
          const update: StateUpdate = {
            event: msg["event"] as string,
            seq: (msg["seq"] as number) ?? 0,
            state: msg["state"] as GameState,
          };
          this.lastState = update.state;
          this.stateQueue.push(update);
          for (const waiter of this.stateWaiters) {
            waiter(update);
          }
          this.stateWaiters = [];
        } else if (typeof msg["id"] === "string") {
          const rid = msg["id"];
          const pending = this.pending.get(rid);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(rid);
            pending.resolve(msg);
          }
        }
      });
    });
  }

  close(): void {
    // Reject all pending
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Connection closed"));
    }
    this.pending.clear();
    this.ws?.terminate();
    this.ws = null;
  }

  send(action: string, params: Record<string, unknown> = {}): Promise<ActionResponse> {
    return new Promise((resolve) => {
      if (!this.ws) {
        resolve({ id: "none", status: "error", error: "Not connected" });
        return;
      }

      this.reqCounter++;
      const rid = `req_${this.reqCounter}`;
      const payload = { action, id: rid, ...params };

      const timer = setTimeout(() => {
        this.pending.delete(rid);
        resolve({ id: rid, status: "error", error: "timeout" });
      }, 15000);

      this.pending.set(rid, {
        resolve: (msg) => {
          resolve({
            id: (msg["id"] as string) ?? rid,
            status: (msg["status"] as string) ?? "unknown",
            data: (msg["data"] as GameState) ?? null,
            error: msg["error"] as string | undefined,
            message: msg["message"] as string | undefined,
          });
        },
        reject: (err) => {
          resolve({ id: rid, status: "error", error: err.message });
        },
        timer,
      });

      this.ws.send(JSON.stringify(payload));
    });
  }

  async getState(): Promise<GameState> {
    const resp = await this.send("get_state");
    if (resp.data) {
      this.lastState = resp.data;
    }
    return this.lastState ?? { screen: "unknown" };
  }

  async waitForScreen(targets: string | Set<string>, timeout = 15000): Promise<GameState | null> {
    const targetSet = typeof targets === "string" ? new Set([targets]) : targets;

    if (this.lastState && targetSet.has(this.lastState.screen)) {
      return this.lastState;
    }

    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        const state = await this.getState();
        resolve(state);
      }, timeout);

      const check = (update: StateUpdate) => {
        if (targetSet.has(update.state.screen)) {
          clearTimeout(timer);
          resolve(update.state);
        } else {
          // Re-register waiter
          this.stateWaiters.push(check);
        }
      };

      this.stateWaiters.push(check);
    });
  }

  async drainUpdates(waitMs = 300): Promise<GameState | null> {
    await new Promise((r) => setTimeout(r, waitMs));
    while (this.stateQueue.length > 0) {
      const update = this.stateQueue.shift()!;
      this.lastState = update.state;
    }
    return this.lastState;
  }
}
