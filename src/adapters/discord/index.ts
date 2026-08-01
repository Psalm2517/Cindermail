import type { DeliveryResult, MailAdapter, OwnerRef, ParsedMail } from "../../core/types";
import { createDM, DiscordApiError, sendMessage, type DiscordFile } from "./discord-rest";

const DISCORD_MESSAGE_CAP = 2000;
const INLINE_BODY_CAP = 1500;
const DISCORD_PAYLOAD_CAP = 25 * 1024 * 1024;

export function createDiscordAdapter(botToken: string): MailAdapter {
  return {
    name: "discord",
    async deliver(owner: OwnerRef, mail: ParsedMail): Promise<DeliveryResult> {
      try {
        const channel = await createDM(botToken, owner.id);

        const header = `**From:** ${mail.from}\n**Subject:** ${mail.subject}\n`;
        const files: DiscordFile[] = [];

        const useFullBodyFile = Boolean(mail.html) || mail.text.length > INLINE_BODY_CAP;
        let bodyText = mail.text;

        if (useFullBodyFile) {
          const preview = mail.text.slice(0, INLINE_BODY_CAP);
          bodyText = `${preview}${mail.text.length > INLINE_BODY_CAP ? "…" : ""}\n\n(full message attached)`;
          if (mail.html) {
            files.push({
              filename: "message.html",
              contentType: "text/html; charset=utf-8",
              content: new TextEncoder().encode(mail.html).buffer as ArrayBuffer,
            });
          } else {
            files.push({
              filename: "message.txt",
              contentType: "text/plain; charset=utf-8",
              content: new TextEncoder().encode(mail.text).buffer as ArrayBuffer,
            });
          }
        }

        let content = `${header}\n${bodyText}`;
        if (content.length > DISCORD_MESSAGE_CAP) {
          content = content.slice(0, DISCORD_MESSAGE_CAP - 1) + "…";
        }

        const attachmentsTotalSize = mail.attachments.reduce((sum, a) => sum + a.size, 0);
        if (attachmentsTotalSize < DISCORD_PAYLOAD_CAP) {
          for (const a of mail.attachments) {
            files.push({ filename: a.filename, contentType: a.contentType, content: a.content });
          }
        } else if (mail.attachments.length > 0) {
          content += "\n\n_attachment(s) too large, discarded_";
        }

        await sendMessage(botToken, channel.id, { content, files });
        return { success: true };
      } catch (err) {
        if (err instanceof DiscordApiError) {
          return { success: false, error: err.message };
        }
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
