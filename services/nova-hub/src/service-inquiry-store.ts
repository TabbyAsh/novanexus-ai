import {type NormalizedServiceInquiry,type InquiryPersistenceResult,type EmailDeliveryStatus,serviceInquiryPayloadHash} from './service-inquiries';

export type InquiryQuery = (sql:string,values?:unknown[])=>Promise<{rows:any[];rowCount:number|null}>;

// The partial unique index is the concurrency authority. Notifications only run
// for the single insert winner; a replay never attempts delivery again.
export async function persistServiceInquiry(query:InquiryQuery,inquiry:NormalizedServiceInquiry,receiptId:string):Promise<InquiryPersistenceResult> {
  const hash=serviceInquiryPayloadHash(inquiry);
  const inserted=await query(
    `INSERT INTO service_inquiries
       (receipt_id,service_code,name,email,business,challenge,details,request_key,idempotency_payload_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
     ON CONFLICT (service_code,request_key) WHERE request_key IS NOT NULL DO NOTHING
     RETURNING receipt_id`,
    [receiptId,inquiry.serviceCode,inquiry.name,inquiry.email,inquiry.business,inquiry.challenge,JSON.stringify(inquiry.details||{}),inquiry.requestId||null,hash],
  );
  if(inserted.rowCount===1)return {kind:'created'};
  if(!inquiry.requestId)throw new Error('Inquiry insert did not persist one row.');
  const existing=await query(
    `SELECT receipt_id,idempotency_payload_hash,operator_email_status,confirmation_email_status,status
       FROM service_inquiries WHERE service_code=$1 AND request_key=$2`,
    [inquiry.serviceCode,inquiry.requestId],
  );
  const row=existing.rows[0];
  if(!row)throw new Error('Idempotent inquiry could not be confirmed.');
  if(row.idempotency_payload_hash!==hash)return {kind:'conflict'};
  return {kind:'replay',receiptId:row.receipt_id,operatorEmail:row.operator_email_status as EmailDeliveryStatus,confirmationEmail:row.confirmation_email_status as EmailDeliveryStatus,currentStatus:row.status};
}
