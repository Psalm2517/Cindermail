import type { DeliveryResult, MailAdapter, OwnerRef, ParsedMail } from "./types.ts";

export interface Dispatcher {
  deliverMail(owner: OwnerRef, mail: ParsedMail): Promise<DeliveryResult>;
}

export function createDispatcher(adapters: MailAdapter[]): Dispatcher {
  const registry = new Map<string, MailAdapter>();
  for (const adapter of adapters) {
    registry.set(adapter.name, adapter);
  }

  return {
    async deliverMail(owner, mail) {
      const adapter = registry.get(owner.type);
      if (!adapter) {
        return { success: false, error: `no adapter registered for owner type "${owner.type}"` };
      }
      return adapter.deliver(owner, mail);
    },
  };
}
