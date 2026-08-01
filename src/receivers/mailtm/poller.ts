import { listActiveAddressesWithReceiverData } from "../../core/db.ts";
import type { Dispatcher } from "../../core/dispatch.ts";
import { handleInboundEmail } from "../../core/email.ts";
import type { SqlExecutor } from "../../core/storage.ts";
import { deleteMessage, fetchSource, getToken, listMessages } from "./client.ts";
import type { MailtmReceiverData } from "./address.ts";

function parseReceiverData(receiverData: string | null): MailtmReceiverData | null {
  if (!receiverData) {
    return null;
  }
  try {
    const parsed = JSON.parse(receiverData) as { provider?: string };
    return parsed.provider === "mailtm" ? (parsed as MailtmReceiverData) : null;
  } catch {
    return null;
  }
}

// mail.tm has no push mechanism worth relying on for a simple poller, so
// this just checks every mail.tm-backed address on an interval. There's no
// reliable seen= filter on their /messages endpoint (verified live: it
// accepts the query param but doesn't actually filter), so instead of
// tracking seen state, each message is deleted from mail.tm right after
// it's been handed to the core, keeping every future poll's list small and
// made only of genuinely unprocessed mail.
export async function pollOnce(db: SqlExecutor, dispatcher: Dispatcher): Promise<void> {
  const addresses = await listActiveAddressesWithReceiverData(db);

  for (const row of addresses) {
    const receiverData = parseReceiverData(row.receiver_data);
    if (!receiverData) {
      continue;
    }

    try {
      const token = await getToken(row.address, receiverData.password);
      const messages = await listMessages(token);

      for (const message of messages) {
        const raw = await fetchSource(token, message.sourceUrl);
        await handleInboundEmail({ to: row.address, from: "unknown", raw }, db, dispatcher);
        await deleteMessage(token, message.id);
      }
    } catch (err) {
      console.error(`mail.tm poll failed for ${row.address}:`, err instanceof Error ? err.message : err);
    }
  }
}

export function startMailtmPoller(db: SqlExecutor, dispatcher: Dispatcher, intervalMs: number) {
  const tick = () => {
    pollOnce(db, dispatcher).catch((err: unknown) =>
      console.error("mail.tm poll cycle failed:", err instanceof Error ? err.message : err)
    );
  };
  tick();
  return setInterval(tick, intervalMs);
}
