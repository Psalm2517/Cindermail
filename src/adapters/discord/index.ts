import type { DeliveryResult, MailAdapter, OwnerRef, ParsedMail } from "../../core/types";
import { createDM, DiscordApiError, sendMessage, type DiscordFile } from "./discord-rest";
import { htmlToText } from "./html-to-text";

const DISCORD_MESSAGE_CAP = 2000;
const INLINE_BODY_CAP = 1500;
const DISCORD_PAYLOAD_CAP = 25 * 1024 * 1024;

// If the extracted text is thin but the source HTML was substantial, the
// email is likely all-image content (a common marketing-email pattern) that
// htmlToText correctly has nothing to show for. Rather than leaving the
// user with an empty-looking message, fall back to attaching the raw HTML
// so it's still viewable (open it in a browser — the image URLs it
// references still resolve).
const SPARSE_TEXT_THRESHOLD = 200;
const SUBSTANTIAL_HTML_THRESHOLD = 1500;

// A hard character-count slice can land in the middle of a link's "label
// (url)" text, leaving a dangling fragment. Cut on whole-line boundaries
// instead — every link produced by htmlToText lives entirely within a
// single line, so this never splits one.
function truncateAtLineBoundary(text: string, maxLength: number): string {
  const lines = text.split("\n");
  let result = "";
  for (const line of lines) {
    const candidate = result ? `${result}\n${line}` : line;
    if (candidate.length > maxLength) {
      break;
    }
    result = candidate;
  }
  return result || text.slice(0, maxLength);
}

export function createDiscordAdapter(botToken: string): MailAdapter {
  return {
    name: "discord",
    async deliver(owner: OwnerRef, mail: ParsedMail): Promise<DeliveryResult> {
      try {
        const channel = await createDM(botToken, owner.id);

        const header = `**From:** ${mail.from}\n**To:** ${mail.to}\n**Subject:** ${mail.subject}\n`;
        const files: DiscordFile[] = [];

        // The text/plain part (if any) is not trustworthy on its own — some senders
        // populate it with raw HTML or other markup instead of real plain text. When
        // an HTML part exists, always derive the readable body from it directly.
        const readableText = mail.html ? htmlToText(mail.html) : mail.text;
        let bodyText = readableText;

        if (readableText.length > INLINE_BODY_CAP) {
          bodyText = `${truncateAtLineBoundary(readableText, INLINE_BODY_CAP - 1)}…\n\n(full message attached)`;
          files.push({
            filename: "message.txt",
            contentType: "text/plain; charset=utf-8",
            content: new TextEncoder().encode(readableText).buffer as ArrayBuffer,
          });
        } else if (readableText.length === 0) {
          bodyText = "(no readable content)";
        }

        if (mail.html && readableText.trim().length < SPARSE_TEXT_THRESHOLD && mail.html.length > SUBSTANTIAL_HTML_THRESHOLD) {
          bodyText += "\n\n_(mostly images — original HTML attached; open it in a browser to view)_";
          files.push({
            filename: "message.html",
            contentType: "text/html; charset=utf-8",
            content: new TextEncoder().encode(mail.html).buffer as ArrayBuffer,
          });
        }

        let content = `${header}\n${bodyText}`;
        if (content.length > DISCORD_MESSAGE_CAP) {
          content = truncateAtLineBoundary(content, DISCORD_MESSAGE_CAP - 1) + "…";
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
