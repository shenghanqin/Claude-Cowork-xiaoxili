/**
 * Agent Host 核心逻辑
 * 复用 Electron 中的 runner、session-store 等逻辑
 */

import type { ClientEvent, ServerEvent } from "../electron/types.js";
import { runClaude, type RunnerHandle } from "../electron/libs/runner.js";
import { SessionStore, type Session } from "../electron/libs/session-store.js";
import { generateSessionTitle } from "../electron/libs/util.js";
// 不使用 electron/test.ts，直接实现
// import { getStaticData } from "../electron/test.js";
import osUtils from "os-utils";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

// 数据库路径
const dbDir = join(homedir(), ".claude-cowork");
try {
  mkdirSync(dbDir, { recursive: true });
} catch {
  // 目录可能已存在
}
const DB_PATH = join(dbDir, "sessions.db");

export class AgentHostCore {
  private sessions: SessionStore;
  private runnerHandles = new Map<string, RunnerHandle>();
  private broadcastFn: ((event: ServerEvent) => void) | null = null;

  constructor() {
    this.sessions = new SessionStore(DB_PATH);
  }

  /**
   * 设置广播函数（用于向客户端发送事件）
   */
  setBroadcast(broadcast: (event: ServerEvent) => void) {
    this.broadcastFn = broadcast;
  }

  /**
   * 内部事件发送
   */
  private emit(event: ServerEvent) {
    // 更新会话状态
    if (event.type === "session.status") {
      this.sessions.updateSession(event.payload.sessionId, {
        status: event.payload.status,
      });
    }
    // 记录消息
    if (event.type === "stream.message") {
      this.sessions.recordMessage(
        event.payload.sessionId,
        event.payload.message
      );
    }
    if (event.type === "stream.user_prompt") {
      this.sessions.recordMessage(event.payload.sessionId, {
        type: "user_prompt",
        prompt: event.payload.prompt,
      });
    }
    // 广播事件
    if (this.broadcastFn) {
      this.broadcastFn(event);
    }
  }

  /**
   * 处理客户端事件
   */
  handleClientEvent(event: ClientEvent) {
    if (event.type === "session.list") {
      this.emit({
        type: "session.list",
        payload: { sessions: this.sessions.listSessions() },
      });
      return;
    }

    if (event.type === "session.history") {
      const history = this.sessions.getSessionHistory(event.payload.sessionId);
      if (!history) {
        this.emit({
          type: "runner.error",
          payload: { message: "Unknown session" },
        });
        return;
      }
      this.emit({
        type: "session.history",
        payload: {
          sessionId: history.session.id,
          status: history.session.status,
          messages: history.messages,
        },
      });
      return;
    }

    if (event.type === "session.start") {
      const session = this.sessions.createSession({
        cwd: event.payload.cwd,
        title: event.payload.title,
        allowedTools: event.payload.allowedTools,
        prompt: event.payload.prompt,
      });

      this.sessions.updateSession(session.id, {
        status: "running",
        lastPrompt: event.payload.prompt,
      });
      this.emit({
        type: "session.status",
        payload: {
          sessionId: session.id,
          status: "running",
          title: session.title,
          cwd: session.cwd,
        },
      });

      this.emit({
        type: "stream.user_prompt",
        payload: { sessionId: session.id, prompt: event.payload.prompt },
      });

      runClaude({
        prompt: event.payload.prompt,
        session,
        resumeSessionId: session.claudeSessionId,
        onEvent: (e: ServerEvent) => this.emit(e),
        onSessionUpdate: (updates: Partial<Session>) => {
          this.sessions.updateSession(session.id, updates);
        },
      })
        .then((handle: RunnerHandle) => {
          this.runnerHandles.set(session.id, handle);
          this.sessions.setAbortController(session.id, undefined);
        })
        .catch((error: unknown) => {
          this.sessions.updateSession(session.id, { status: "error" });
          this.emit({
            type: "session.status",
            payload: {
              sessionId: session.id,
              status: "error",
              title: session.title,
              cwd: session.cwd,
              error: String(error),
            },
          });
        });

      return;
    }

    if (event.type === "session.continue") {
      const session = this.sessions.getSession(event.payload.sessionId);
      if (!session) {
        this.emit({
          type: "runner.error",
          payload: { message: "Unknown session" },
        });
        return;
      }

      if (!session.claudeSessionId) {
        this.emit({
          type: "runner.error",
          payload: {
            sessionId: session.id,
            message: "Session has no resume id yet.",
          },
        });
        return;
      }

      this.sessions.updateSession(session.id, {
        status: "running",
        lastPrompt: event.payload.prompt,
      });
      this.emit({
        type: "session.status",
        payload: {
          sessionId: session.id,
          status: "running",
          title: session.title,
          cwd: session.cwd,
        },
      });

      this.emit({
        type: "stream.user_prompt",
        payload: { sessionId: session.id, prompt: event.payload.prompt },
      });

      runClaude({
        prompt: event.payload.prompt,
        session,
        resumeSessionId: session.claudeSessionId,
        onEvent: (e: ServerEvent) => this.emit(e),
        onSessionUpdate: (updates: Partial<Session>) => {
          this.sessions.updateSession(session.id, updates);
        },
      })
        .then((handle: RunnerHandle) => {
          this.runnerHandles.set(session.id, handle);
        })
        .catch((error: unknown) => {
          this.sessions.updateSession(session.id, { status: "error" });
          this.emit({
            type: "session.status",
            payload: {
              sessionId: session.id,
              status: "error",
              title: session.title,
              cwd: session.cwd,
              error: String(error),
            },
          });
        });

      return;
    }

    if (event.type === "session.stop") {
      const session = this.sessions.getSession(event.payload.sessionId);
      if (!session) return;

      const handle = this.runnerHandles.get(session.id);
      if (handle) {
        handle.abort();
        this.runnerHandles.delete(session.id);
      }

      this.sessions.updateSession(session.id, { status: "idle" });
      this.emit({
        type: "session.status",
        payload: {
          sessionId: session.id,
          status: "idle",
          title: session.title,
          cwd: session.cwd,
        },
      });
      return;
    }

    if (event.type === "session.delete") {
      const sessionId = event.payload.sessionId;
      const handle = this.runnerHandles.get(sessionId);
      if (handle) {
        handle.abort();
        this.runnerHandles.delete(sessionId);
      }

      this.sessions.deleteSession(sessionId);
      this.emit({
        type: "session.deleted",
        payload: { sessionId },
      });
      return;
    }

    if (event.type === "permission.response") {
      const session = this.sessions.getSession(event.payload.sessionId);
      if (!session) return;

      const pending = session.pendingPermissions.get(event.payload.toolUseId);
      if (pending) {
        pending.resolve(event.payload.result);
      }
      return;
    }
  }

  /**
   * 生成会话标题
   */
  async generateSessionTitle(userInput: string | null): Promise<string> {
    return generateSessionTitle(userInput);
  }

  /**
   * 获取最近的工作目录
   */
  getRecentCwds(limit: number = 8): string[] {
    return this.sessions.listRecentCwds(limit);
  }

  /**
   * 获取系统静态数据
   */
  async getStaticData() {
    // 直接实现，不依赖 Electron 特定功能
    const os = await import("os");
    const fs = await import("fs");
    const osUtils = await import("os-utils");
    
    let totalStorage = 0;
    try {
      const stats = fs.statfsSync(process.platform === "win32" ? "C://" : "/");
      totalStorage = Math.floor((stats.bsize * stats.blocks) / 1_000_000_000);
    } catch {
      // 忽略错误
    }
    
    return {
      totalStorage,
      cpuModel: os.cpus()[0]?.model || "Unknown",
      totalMemoryGB: Math.floor(osUtils.totalmem() / 1024),
    };
  }

  /**
   * 获取系统统计信息
   */
  async getStatistics() {
    return new Promise<{ cpuUsage: number; ramUsage: number; storageData: number }>(
      (resolve) => {
        osUtils.cpuUsage((cpuUsage) => {
          const ramUsage = 1 - osUtils.freememPercentage();
          resolve({
            cpuUsage,
            ramUsage,
            storageData: 0, // 简化实现
          });
        });
      }
    );
  }
}
