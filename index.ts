import { readFileSync, existsSync } from "fs";
import { homedir } from "os";

interface SupChatConfig {
  baseUrl: string;
  authSessionPath: string;
  clientVersion?: string;
  sessionId?: string;
  pollInterval?: number;
  enabled?: boolean;
}

interface SupChatMessage {
  id: string;
  chatId: string;
  content: string;
  senderId: string;
  createdAt: string;
  mentions?: string[];
}

interface ChatContext {
  chatId: string;
  senderId: string;
  text: string;
  messageId?: string;
}

/**
 * Load auth_session cookie from filesystem
 */
function loadAuthSession(path: string): string {
  try {
    const expandedPath = path.replace(/^~/, homedir());
    if (!existsSync(expandedPath)) {
      throw new Error(`Auth session file not found: ${expandedPath}`);
    }
    const content = readFileSync(expandedPath, "utf-8").trim();
    if (!content) {
      throw new Error(`Auth session file is empty: ${expandedPath}`);
    }
    return content;
  } catch (error) {
    throw new Error(`Failed to load auth session: ${error.message}`);
  }
}

/**
 * Make authenticated API request
 */
async function makeSupRequest(
  config: SupChatConfig,
  authSession: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${config.baseUrl}${endpoint}`;
  const headers: Record<string, string> = {
    Cookie: `auth_session=${authSession}`,
    "Content-Type": "application/json",
    ...(config.clientVersion && { "x-sup-client-version": config.clientVersion }),
    ...(config.sessionId && { "x-sup-session-id": config.sessionId }),
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Send a chat message
 */
async function sendChatMessage(
  config: SupChatConfig,
  authSession: string,
  chatId: string,
  text: string,
  mentions: string[] = []
): Promise<void> {
  const optimisticId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const payload = {
    json: {
      optimisticId,
      chatId,
      content: text,
      contentData: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: text,
                marks: [],
              },
            ],
          },
        ],
      },
      mentions,
      attachments: [],
      isGenerated: true,
      isPostComment: false,
      visibility: "public",
    },
    meta: {
      values: {},
    },
  };

  await makeSupRequest(config, authSession, "/api/trpc/chatMessage.create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch chat panel data (for monitoring new messages)
 */
async function fetchChatPanelData(
  config: SupChatConfig,
  authSession: string
): Promise<any> {
  return makeSupRequest(config, authSession, "/api/trpc/loader.chatPanelData");
}

/**
 * Search for mentions/DMs
 */
async function searchUserData(
  config: SupChatConfig,
  authSession: string,
  query?: string
): Promise<any> {
  const params = query ? `?input=${encodeURIComponent(JSON.stringify({ query }))}` : "";
  return makeSupRequest(config, authSession, `/api/trpc/userData.searchAll${params}`);
}

/**
 * OpenClaw channel plugin
 */
export default function register(api: any) {
  const channel = {
    id: "sup-chat",
    meta: {
      id: "sup-chat",
      label: "Sup Chat",
      selectionLabel: "Sup Chat (sup.net API)",
      docsPath: "/channels/sup-chat",
      blurb: "Connect to sup.net chat API for monitoring mentions/DMs and responding.",
      aliases: ["sup"],
    },
    capabilities: {
      chatTypes: ["direct", "group"],
      supportsMedia: false,
      supportsThreads: false,
      supportsStreaming: false,
    },
    config: {
      listAccountIds: (cfg: any) => {
        // Single account mode for now
        return cfg.channels?.["sup-chat"]?.enabled ? ["default"] : [];
      },
      resolveAccount: (cfg: any, accountId: string) => {
        const channelConfig = cfg.channels?.["sup-chat"] ?? {};
        return {
          accountId: accountId ?? "default",
          ...channelConfig,
        };
      },
    },
    outbound: {
      deliveryMode: "direct" as const,
      sendText: async (ctx: ChatContext) => {
        try {
          const config = api.config.channels?.["sup-chat"] as SupChatConfig;
          if (!config) {
            return { ok: false, error: "Sup chat not configured" };
          }

          const authSession = loadAuthSession(config.authSessionPath);
          await sendChatMessage(config, authSession, ctx.chatId, ctx.text);

          api.logger.info(`[sup-chat] Sent message to chat ${ctx.chatId}`);
          return { ok: true };
        } catch (error) {
          api.logger.error(`[sup-chat] Failed to send message: ${error.message}`);
          return { ok: false, error: error.message };
        }
      },
    },
    gateway: {
      start: async () => {
        const config = api.config.channels?.["sup-chat"] as SupChatConfig;
        if (!config?.enabled) {
          api.logger.info("[sup-chat] Channel disabled, skipping start");
          return;
        }

        api.logger.info("[sup-chat] Starting channel gateway");

        try {
          const authSession = loadAuthSession(config.authSessionPath);
          const pollInterval = config.pollInterval ?? 5000;

          // Store last seen message IDs to avoid duplicates
          const seenMessageIds = new Set<string>();

          // Poll for new messages
          const poll = async () => {
            try {
              const data = await fetchChatPanelData(config, authSession);

              // Process chat panel data for new messages
              // This is a simplified implementation - you may need to adjust
              // based on the actual response structure
              if (data?.result?.data?.chats) {
                for (const chat of data.result.data.chats) {
                  if (chat.messages) {
                    for (const msg of chat.messages) {
                      if (!seenMessageIds.has(msg.id)) {
                        seenMessageIds.add(msg.id);

                        // Check if message mentions bot or is a DM
                        const isDM = chat.type === "direct";
                        const hasMention = msg.mentions?.includes(api.config.botUserId);

                        if (isDM || hasMention) {
                          // Emit incoming message event
                          api.emit("message", {
                            channel: "sup-chat",
                            chatId: chat.id,
                            messageId: msg.id,
                            senderId: msg.senderId,
                            text: msg.content,
                            isDM,
                            mentions: msg.mentions,
                          });
                        }
                      }
                    }
                  }
                }
              }
            } catch (error) {
              api.logger.error(`[sup-chat] Poll error: ${error.message}`);
            }
          };

          // Start polling
          const intervalId = setInterval(poll, pollInterval);

          // Initial poll
          await poll();

          // Store interval ID for cleanup
          api.context.set("sup-chat-poll-interval", intervalId);

          api.logger.info(`[sup-chat] Gateway started (polling every ${pollInterval}ms)`);
        } catch (error) {
          api.logger.error(`[sup-chat] Failed to start gateway: ${error.message}`);
          throw error;
        }
      },
      stop: async () => {
        const intervalId = api.context.get("sup-chat-poll-interval");
        if (intervalId) {
          clearInterval(intervalId);
          api.context.delete("sup-chat-poll-interval");
        }
        api.logger.info("[sup-chat] Gateway stopped");
      },
    },
  };

  api.registerChannel({ plugin: channel });
  api.logger.info("[sup-chat] Channel plugin registered");
}

export const id = "sup-chat";
