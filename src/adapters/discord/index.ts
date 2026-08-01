import type { DeliveryResult, MailAdapter, OwnerRef, ParsedMail } from "../../core/types";
import { createDM, DiscordApiError, sendMessage, type DiscordFile } from "./discord-rest";
import { htmlToText } from "./html-to-text";

const EMBED_DESCRIPTION_CAP = 4096;
const EMBED_TITLE_CAP = 256;
const DISCORD_PAYLOAD_CAP = 25 * 1024 * 1024;

export function createDiscordAdapter(botToken: string): MailAdapter {
  return {
    name: "discord",
    async deliver(owner: OwnerRef, mail: ParsedMail): Promise<DeliveryResult> {
      try {
        const channel = await createDM(botToken, owner.id);

        const files: DiscordFile[] = [];

        // The text/plain part (if any) is not trustworthy on its own — some senders
        // populate it with raw HTML or other markup instead of real plain text. When
        // an HTML part exists, always derive the readable body from it directly.
        // Masked [label](url) links only render as clickable in embeds, not in
        // plain message content, so this body always goes into an embed.
        const readableText = mail.html ? htmlToText(mail.html, "markdown") : mail.text;
        let description = readableText;

        if (readableText.length > EMBED_DESCRIPTION_CAP) {
          description = `${readableText.slice(0, EMBED_DESCRIPTION_CAP - 1)}…`;
          files.push({
            filename: "message.txt",
            contentType: "text/plain; charset=utf-8",
            content: new TextEncoder().encode(readableText).buffer as ArrayBuffer,
          });
        } else if (readableText.length === 0) {
          description = "*(no readable content)*";
        }

        let content = "";
        const attachmentsTotalSize = mail.attachments.reduce((sum, a) => sum + a.size, 0);
        if (attachmentsTotalSize < DISCORD_PAYLOAD_CAP) {
          for (const a of mail.attachments) {
            files.push({ filename: a.filename, contentType: a.contentType, content: a.content });
          }
        } else if (mail.attachments.length > 0) {
          content = "_attachment(s) too large, discarded_";
        }

        await sendMessage(botToken, channel.id, {
          content,
          embeds: [
            {
              title: mail.subject.slice(0, EMBED_TITLE_CAP) || "(no subject)",
              description,
              author: { name: mail.from },
              footer: { text: `To: ${mail.to}` },
            },
          ],
          files,
        });
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
