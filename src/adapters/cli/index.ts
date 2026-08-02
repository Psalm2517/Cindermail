import { htmlToText } from "../../core/html-to-text.ts";
import type { SqlExecutor } from "../../core/storage.ts";
import type { DeliveryResult, MailAdapter, OwnerRef, ParsedMail } from "../../core/types.ts";

// Same reasoning as the Discord adapter: email HTML is attacker-controlled,
// and htmlToText's tag matching scales quadratically with input size.
const MAX_HTML_LENGTH = 256 * 1024;

export function createCliAdapter(db: SqlExecutor): MailAdapter {
  return {
    name: "cli",
    async deliver(_owner: OwnerRef, mail: ParsedMail): Promise<DeliveryResult> {
      try {
        const html = mail.html && mail.html.length > MAX_HTML_LENGTH ? mail.html.slice(0, MAX_HTML_LENGTH) : mail.html;
        const readableText = html ? htmlToText(html) : mail.text;
        const notes: string[] = [];
        if (mail.attachments.length > 0) {
          notes.push(`(${mail.attachments.length} attachment${mail.attachments.length === 1 ? "" : "s"} not saved, cli delivery is text-only)`);
        }
        const body = notes.length > 0 ? `${readableText}\n\n${notes.join("\n")}` : readableText;

        await db.run(
          "INSERT INTO cli_messages (address, from_address, subject, body, received_at) VALUES (?, ?, ?, ?, ?)",
          mail.to,
          mail.from,
          mail.subject,
          body,
          Math.floor(Date.now() / 1000)
        );
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
