const API_BASE = "https://discord.com/api/v10";

export interface DiscordFile {
  filename: string;
  contentType: string;
  content: ArrayBuffer;
}

export interface SendMessagePayload {
  content?: string;
  files?: DiscordFile[];
}

class DiscordApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function discordFetch(botToken: string, path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${botToken}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new DiscordApiError(response.status, `Discord API ${path} failed: ${response.status} ${body}`);
  }

  return response;
}

export async function createDM(botToken: string, userId: string): Promise<{ id: string }> {
  const response = await discordFetch(botToken, "/users/@me/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: userId }),
  });
  return response.json();
}

export async function sendMessage(
  botToken: string,
  channelId: string,
  payload: SendMessagePayload
): Promise<void> {
  // Delivered mail is attacker-controlled text. Escaping handles markdown,
  // but @ mentions aren't escapable, so this tells Discord to resolve none of
  // them: an "@everyone" in an email body still shows as text and pings
  // nobody. Belt and braces, since the bot delivers to DMs where a mention
  // wouldn't notify anyone anyway.
  const base = { content: payload.content ?? "", allowed_mentions: { parse: [] as string[] } };

  if (!payload.files || payload.files.length === 0) {
    await discordFetch(botToken, `/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(base),
    });
    return;
  }

  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      ...base,
      attachments: payload.files.map((f, i) => ({ id: i, filename: f.filename })),
    })
  );
  payload.files.forEach((f, i) => {
    form.append(`files[${i}]`, new Blob([f.content], { type: f.contentType }), f.filename);
  });

  await discordFetch(botToken, `/channels/${channelId}/messages`, {
    method: "POST",
    body: form,
  });
}

export { DiscordApiError };
