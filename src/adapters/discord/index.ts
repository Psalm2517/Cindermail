import type { DeliveryResult, MailAdapter, OwnerRef, ParsedMail } from "../../core/types";
import { createDM, DiscordApiError, sendMessage, type DiscordFile } from "./discord-rest";
import { htmlToText } from "./html-to-text";

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

        // The text/plain part (if any) is not trustworthy on its own — some senders
        // populate it with raw HTML or other markup instead of real plain text. When
        // an HTML part exists, always derive the readable body from it directly.
        const readableText = mail.html ? htmlToText(mail.html) : mail.text;
        let bodyText = readableText;

        if (readableText.length > INLINE_BODY_CAP) {
          const preview = readableText.slice(0, INLINE_BODY_CAP);
          bodyText = `${preview}…\n\n(full message attached)`;
          files.push({
            filename: "message.txt",
            contentType: "text/plain; charset=utf-8",
            content: new TextEncoder().encode(readableText).buffer as ArrayBuffer,
          });
        } else if (readableText.length === 0) {
          bodyText = "(no readable content)";
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
