export interface OwnerRef {
  type: string;
  id: string;
}

export interface ParsedMailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: ArrayBuffer;
}

export interface ParsedMail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments: ParsedMailAttachment[];
}

export interface DeliveryResult {
  success: boolean;
  error?: string;
}

export interface MailAdapter {
  name: string;
  deliver(owner: OwnerRef, mail: ParsedMail): Promise<DeliveryResult>;
}

export interface AddressRow {
  address: string;
  owner_type: string;
  owner_id: string;
  created_at: number;
  expires_at: number;
  revoked: number;
  revoked_at: number | null;
  permanent: number;
  note: string | null;
  receiver_data: string | null;
}
