import PostalMime from "postal-mime";
import { getAddress } from "./db";
import type { Dispatcher } from "./dispatch";
import type { OwnerRef, ParsedMail } from "./types";

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  db: D1Database,
  dispatcher: Dispatcher
): Promise<void> {
  const recipient = message.to.toLowerCase();
  const row = await getAddress(db, recipient);

  const now = Math.floor(Date.now() / 1000);
  if (!row || row.revoked !== 0 || row.expires_at <= now) {
    return;
  }

  const owner: OwnerRef = { type: row.owner_type, id: row.owner_id };

  const parsed = await PostalMime.parse(message.raw, { attachmentEncoding: "arraybuffer" });
  const mail: ParsedMail = {
    from: parsed.from?.address ?? message.from,
    to: row.address,
    subject: parsed.subject ?? "(no subject)",
    text: parsed.text ?? "",
    html: parsed.html,
    attachments: parsed.attachments.map((a) => ({
      filename: a.filename ?? "attachment",
      contentType: a.mimeType,
      size: a.content instanceof ArrayBuffer ? a.content.byteLength : 0,
      content: a.content as ArrayBuffer,
    })),
  };

  await dispatcher.deliverMail(owner, mail);
}
