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
}
