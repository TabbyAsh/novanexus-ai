import { createHash } from 'crypto';

export const SERVICE_INQUIRY_CODE = 'BACK_OFFICE_OS_STARTER' as const;
export const SERVICE_INQUIRY_NAME = 'Workflow Setup Pilot' as const;
export const SERVICE_INQUIRY_SUPPORT_EMAIL = 'hello@novanexus-ai.com' as const;
export const SERVICE_INQUIRY_SERVICES = {
  BACK_OFFICE_OS_STARTER: 'Workflow Setup Pilot',
  MERCHANDISE_SOURCING: 'Merchandise Sourcing',
  WHOLESALE_TRADE: 'Wholesale Trade',
  RETAIL_PRODUCT: 'Retail Product',
  SUPPLIER_PARTNERSHIP: 'Supplier Partnership',
  RESEARCH_SERVICE: 'Research Service',
  CATALOG_CLEANUP: 'Catalog Cleanup',
  SUPPORT_REQUEST: 'Support Request',
  GENERAL_INQUIRY: 'General Inquiry',
} as const;
export type ServiceInquiryCode = keyof typeof SERVICE_INQUIRY_SERVICES;
export const INQUIRY_DETAIL_LIMITS = {role:40,product:160,quantity:120,destination:240,deadline:80,budget:160,requirements:2000,website:500} as const;
export const INQUIRY_ROLES = ['buyer','supplier','partner','research-client','retail-customer'] as const;
export type ServiceInquiryDetails = Partial<Record<keyof typeof INQUIRY_DETAIL_LIMITS,string>>;

export const SERVICE_INQUIRY_LIMITS = {
  name: { min: 2, max: 100 },
  email: { min: 3, max: 254 },
  business: { min: 2, max: 160 },
  challenge: { min: 20, max: 2000 },
} as const;

export function canReadServiceInquiryQueue(scopes: readonly string[]): boolean {
  return scopes.includes('ops.admin');
}

export interface NormalizedServiceInquiry {
  serviceCode: ServiceInquiryCode;
  serviceName: typeof SERVICE_INQUIRY_SERVICES[ServiceInquiryCode];
  name: string;
  email: string;
  business: string;
  challenge: string;
  requestId?: string;
  details?: ServiceInquiryDetails;
}

export type ServiceInquiryValidation =
  | { ok: true; value: NormalizedServiceInquiry }
  | { ok: false; errors: Record<string, string> };

function singleLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function multiLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .split('\n')
    .map(line => line.replace(/[\t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function validEmail(email: string): boolean {
  if (email.length < SERVICE_INQUIRY_LIMITS.email.min || email.length > SERVICE_INQUIRY_LIMITS.email.max) {
    return false;
  }
  if (email.includes('..')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeServiceInquiry(input: unknown): ServiceInquiryValidation {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const name = singleLine(body.name);
  const email = singleLine(body.email).toLowerCase();
  const business = singleLine(body.business);
  const challenge = multiLine(body.challenge);
  const requestedService = singleLine(body.service);
  const requestedCode = singleLine(body.serviceCode).toUpperCase();
  const requestId = singleLine(body.requestId);
  const errors: Record<string, string> = {};
  const aliases:Record<string,ServiceInquiryCode>={
    'Back Office OS Starter Pilot':'BACK_OFFICE_OS_STARTER',
    'Back Office OS':'BACK_OFFICE_OS_STARTER',
    ...Object.fromEntries(Object.entries(SERVICE_INQUIRY_SERVICES).map(([code,name])=>[name,code])) as Record<string,ServiceInquiryCode>,
  };
  const requestedAlias=Object.hasOwn(aliases,requestedService)?aliases[requestedService]:undefined;
  const serviceCode:ServiceInquiryCode=Object.hasOwn(SERVICE_INQUIRY_SERVICES,requestedCode)?requestedCode as ServiceInquiryCode:requestedAlias||SERVICE_INQUIRY_CODE;

  if (name.length < SERVICE_INQUIRY_LIMITS.name.min || name.length > SERVICE_INQUIRY_LIMITS.name.max) {
    errors.name = `Name must be ${SERVICE_INQUIRY_LIMITS.name.min}-${SERVICE_INQUIRY_LIMITS.name.max} characters.`;
  }
  if (!validEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (business.length < SERVICE_INQUIRY_LIMITS.business.min || business.length > SERVICE_INQUIRY_LIMITS.business.max) {
    errors.business = `Business must be ${SERVICE_INQUIRY_LIMITS.business.min}-${SERVICE_INQUIRY_LIMITS.business.max} characters.`;
  }
  if (challenge.length < SERVICE_INQUIRY_LIMITS.challenge.min || challenge.length > SERVICE_INQUIRY_LIMITS.challenge.max) {
    errors.challenge = `Current need must be ${SERVICE_INQUIRY_LIMITS.challenge.min}-${SERVICE_INQUIRY_LIMITS.challenge.max} characters.`;
  }
  if ((requestedCode&&!Object.hasOwn(SERVICE_INQUIRY_SERVICES,requestedCode))||(requestedService&&(!requestedAlias||requestedAlias!==serviceCode))) {
    errors.service = 'Choose one of the supported inquiry categories.';
  }
  if((requestId&&!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))||(!requestId&&serviceCode!==SERVICE_INQUIRY_CODE))errors.requestId='A stable request ID of 16-100 letters, digits, underscores or hyphens is required.';
  if(body.requestId!==undefined&&typeof body.requestId!=='string')errors.requestId='A stable string request ID is required.';
  const details:ServiceInquiryDetails={};
  if(body.details!==undefined){
    if(!body.details||typeof body.details!=='object'||Array.isArray(body.details))errors.details='Inquiry details must be a bounded object.';
    else for(const [key,value] of Object.entries(body.details)){
      if(!Object.hasOwn(INQUIRY_DETAIL_LIMITS,key)){errors.details='An unsupported inquiry detail field was supplied.';continue;}
      if(typeof value!=='string'){errors['details.'+key]='Inquiry detail values must be text.';continue;}
      const normalized=key==='requirements'?multiLine(value):singleLine(value);
      if(normalized.length>INQUIRY_DETAIL_LIMITS[key]){errors['details.'+key]='This inquiry detail is too long.';continue;}
      if(key==='role'&&normalized&&!INQUIRY_ROLES.includes(normalized as typeof INQUIRY_ROLES[number])){errors['details.role']='Choose a supported inquiry role.';continue;}
      if(key==='website'&&normalized){try{const url=new URL(normalized);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid website');}catch{errors['details.website']='Website must use http or https without embedded credentials.';continue;}}
      if(normalized)details[key]=normalized;
    }
  }
  // PostgreSQL jsonb::text inserts separator spaces; reserve those bytes too so
  // accepted Unicode input cannot fail the database's 8,000-byte constraint.
  const serializedDetailBytes=Buffer.byteLength(JSON.stringify(details),'utf8');
  const jsonbSeparatorBytes=Math.max(0,Object.keys(details).length*2-1);
  if(serializedDetailBytes>8000||serializedDetailBytes+jsonbSeparatorBytes>8000)errors.details='Combined inquiry details must fit within 8,000 UTF-8 bytes.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      serviceCode,
      serviceName: SERVICE_INQUIRY_SERVICES[serviceCode],
      name,
      email,
      business,
      challenge,
      ...(requestId?{requestId}:{}),
      ...(Object.keys(details).length?{details}:{}),
    },
  };
}

export function serviceInquiryPayloadHash(inquiry:NormalizedServiceInquiry):string {
  const details=Object.fromEntries(Object.entries(inquiry.details||{}).sort(([a],[b])=>a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify({serviceCode:inquiry.serviceCode,name:inquiry.name,email:inquiry.email,business:inquiry.business,challenge:inquiry.challenge,details})).digest('hex');
}

export function applyInquiryRequestHeader(input:unknown,header:unknown):{ok:true;value:Record<string,unknown>}|{ok:false;errors:Record<string,string>} {
  const body=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
  if(header===undefined)return {ok:true,value:body};
  if(typeof header!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(header))return {ok:false,errors:{requestId:'Idempotency-Key must be 16-100 letters, digits, underscores or hyphens.'}};
  if(body.requestId!==undefined&&body.requestId!==header)return {ok:false,errors:{requestId:'Body requestId must exactly match Idempotency-Key.'}};
  return {ok:true,value:{...body,requestId:header}};
}

export function parseInquiryQueueQuery(input:Record<string,unknown>):{ok:true;value:{status:string;serviceCode:string;limit:number;after:string|null;before:string|null;receiptId:string}}|{ok:false;message:string} {
  const status=typeof input.status==='string'?input.status.toUpperCase():'';
  if(status&&!['RECEIVED','IN_REVIEW','SCOPE_ACCEPTED','IN_PROGRESS','DELIVERED','CANCELLED'].includes(status))return {ok:false,message:'Unknown inquiry status.'};
  const serviceCode=typeof input.serviceCode==='string'?input.serviceCode.toUpperCase():'';
  if(serviceCode&&!Object.hasOwn(SERVICE_INQUIRY_SERVICES,serviceCode))return {ok:false,message:'Unknown inquiry category.'};
  const requestedLimit=Number(input.limit||50);
  const limit=Number.isFinite(requestedLimit)?Math.min(100,Math.max(1,Math.floor(requestedLimit))):50;
  let after:string|null=null,before:string|null=null,receiptId='';
  if(input.after!==undefined){if(typeof input.after!=='string'||!Number.isFinite(Date.parse(input.after)))return {ok:false,message:'A valid after timestamp is required.'};after=new Date(input.after).toISOString();}
  if(input.cursor!==undefined){
    if(typeof input.cursor!=='string'||input.cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(input.cursor))return {ok:false,message:'Invalid inquiry cursor.'};
    try{const cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));if(typeof cursor.createdAt!=='string'||!Number.isFinite(Date.parse(cursor.createdAt))||!/^svc_[A-Za-z0-9_-]{20,36}$/.test(cursor.receiptId))throw new Error('Invalid cursor');before=new Date(cursor.createdAt).toISOString();receiptId=cursor.receiptId;}catch{return {ok:false,message:'Invalid inquiry cursor.'};}
  }
  return {ok:true,value:{status,serviceCode,limit,after,before,receiptId}};
}
export function inquiryQueueCursor(row:{created_at:string|Date;receipt_id:string}):string {
  return Buffer.from(JSON.stringify({createdAt:new Date(row.created_at).toISOString(),receiptId:row.receipt_id})).toString('base64url');
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function htmlText(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

export function buildOperatorInquiryEmail(inquiry: NormalizedServiceInquiry, receiptId: string): string {
  const details=Object.entries(inquiry.details||{}).map(([key,value])=>`<p><strong>${escapeHtml(key)}:</strong> ${htmlText(value)}</p>`).join('');
  return `<div style="font-family:system-ui;color:#111827;max-width:620px">
    <h2>New ${escapeHtml(inquiry.serviceName)} inquiry</h2>
    <p><strong>Receipt:</strong> ${escapeHtml(receiptId)}</p>
    <p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p>
    <p><strong>Business:</strong> ${escapeHtml(inquiry.business)}</p>
    <p><strong>Current need:</strong><br>${htmlText(inquiry.challenge)}</p>
    ${details}
    <p>This record is an inquiry only. Confirm scope before requesting payment or beginning work.</p>
  </div>`;
}

export function buildConfirmationInquiryEmail(inquiry: NormalizedServiceInquiry, receiptId: string): string {
  const firstName = inquiry.name.split(' ')[0] || inquiry.name;
  return `<div style="font-family:system-ui;color:#111827;max-width:620px">
    <h2>We recorded your inquiry.</h2>
    <p>Thanks, ${escapeHtml(firstName)}. Your receipt is <strong>${escapeHtml(receiptId)}</strong>.</p>
    <p>This is not scope acceptance and no work or payment has started. We will review the intake and contact you about fit and scope.</p>
    <p>If you need help, email <a href="mailto:${SERVICE_INQUIRY_SUPPORT_EMAIL}">${SERVICE_INQUIRY_SUPPORT_EMAIL}</a> and include your receipt.</p>
  </div>`;
}

export type EmailDeliveryStatus = 'PENDING' | 'PROVIDER_ACCEPTED' | 'FAILED' | 'NOT_CONFIGURED' | 'SKIPPED';

export interface EmailDeliveryOutcome {
  status: EmailDeliveryStatus;
  providerId?: string;
}

export interface InquiryDelivery {
  operatorEmail: EmailDeliveryStatus;
  confirmationEmail: EmailDeliveryStatus;
  state: 'PROVIDER_ACCEPTED_BOTH' | 'OPERATOR_PROVIDER_ACCEPTED' | 'RECORDED_ONLY';
}

export interface ServiceInquiryDependencies {
  createReceiptId(): string;
  persistInquiry(inquiry: NormalizedServiceInquiry, receiptId: string): Promise<void|InquiryPersistenceResult>;
  deliverOperator(inquiry: NormalizedServiceInquiry, receiptId: string): Promise<EmailDeliveryOutcome>;
  deliverConfirmation(inquiry: NormalizedServiceInquiry, receiptId: string): Promise<EmailDeliveryOutcome>;
  persistDelivery(receiptId: string, operator: EmailDeliveryOutcome, confirmation: EmailDeliveryOutcome): Promise<void>;
}

export type InquiryPersistenceResult =
  | {kind:'created'}
  | {kind:'conflict'}
  | {kind:'replay';receiptId:string;operatorEmail:EmailDeliveryStatus;confirmationEmail:EmailDeliveryStatus;currentStatus?:string};

export type ReceiveServiceInquiryResult =
  | { kind: 'invalid'; errors: Record<string, string> }
  | { kind: 'persistence_failed' }
  | { kind: 'idempotency_conflict' }
  | {
      kind: 'delivery_persistence_failed';
      receiptId: string;
      received: true;
      delivery: InquiryDelivery;
    }
  | {
      kind: 'received';
      receiptId: string;
      received: true;
      inquiryStatus: 'RECEIVED';
      delivery: InquiryDelivery;
      recovery: { supportEmail: string; message: string };
      replayed?: boolean;
      currentStatus?: string;
    };

function deliveryState(operator: EmailDeliveryOutcome, confirmation: EmailDeliveryOutcome): InquiryDelivery {
  const state = operator.status === 'PROVIDER_ACCEPTED'
    ? confirmation.status === 'PROVIDER_ACCEPTED' ? 'PROVIDER_ACCEPTED_BOTH' : 'OPERATOR_PROVIDER_ACCEPTED'
    : 'RECORDED_ONLY';
  return {
    operatorEmail: operator.status,
    confirmationEmail: confirmation.status,
    state,
  };
}

async function safelyDeliver(
  deliver: () => Promise<EmailDeliveryOutcome>,
): Promise<EmailDeliveryOutcome> {
  try {
    const outcome = await deliver();
    if (!['PROVIDER_ACCEPTED', 'FAILED', 'NOT_CONFIGURED', 'SKIPPED'].includes(outcome.status)) {
      return { status: 'FAILED' };
    }
    return {
      status: outcome.status,
      providerId: typeof outcome.providerId === 'string' ? outcome.providerId.slice(0, 255) : undefined,
    };
  } catch {
    return { status: 'FAILED' };
  }
}

export async function receiveServiceInquiry(
  input: unknown,
  dependencies: ServiceInquiryDependencies,
): Promise<ReceiveServiceInquiryResult> {
  const validation = normalizeServiceInquiry(input);
  if ('errors' in validation) return { kind: 'invalid', errors: validation.errors };

  const receiptId = dependencies.createReceiptId();
  let persistence:void|InquiryPersistenceResult;
  try {
    persistence=await dependencies.persistInquiry(validation.value, receiptId);
  } catch {
    return { kind: 'persistence_failed' };
  }
  if(persistence&&persistence.kind==='conflict')return {kind:'idempotency_conflict'};
  if(persistence&&persistence.kind==='replay')return {
    kind:'received',receiptId:persistence.receiptId,received:true,inquiryStatus:'RECEIVED',replayed:true,currentStatus:persistence.currentStatus,
    delivery:deliveryState({status:persistence.operatorEmail},{status:persistence.confirmationEmail}),
    recovery:{supportEmail:SERVICE_INQUIRY_SUPPORT_EMAIL,message:`Save this receipt. This inquiry was already recorded; no duplicate notification was sent. Contact ${SERVICE_INQUIRY_SUPPORT_EMAIL} with the receipt if needed.`},
  };

  const operator = await safelyDeliver(() => dependencies.deliverOperator(validation.value, receiptId));
  const confirmation = await safelyDeliver(() => dependencies.deliverConfirmation(validation.value, receiptId));
  const delivery = deliveryState(operator, confirmation);

  try {
    await dependencies.persistDelivery(receiptId, operator, confirmation);
  } catch {
    return { kind: 'delivery_persistence_failed', receiptId, received: true, delivery };
  }

  return {
    kind: 'received',
    receiptId,
    received: true,
    inquiryStatus: 'RECEIVED',
    delivery,
    recovery: {
      supportEmail: SERVICE_INQUIRY_SUPPORT_EMAIL,
      message: `Save this receipt. If you do not hear from us, email ${SERVICE_INQUIRY_SUPPORT_EMAIL} and include the receipt.`,
    },
  };
}
