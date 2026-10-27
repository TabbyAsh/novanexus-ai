import {readFileSync} from 'fs';
import {join} from 'path';
import {
  SERVICE_INQUIRY_SERVICES,normalizeServiceInquiry,serviceInquiryPayloadHash,
  applyInquiryRequestHeader,parseInquiryQueueQuery,inquiryQueueCursor,receiveServiceInquiry,
  buildOperatorInquiryEmail,type NormalizedServiceInquiry,type ServiceInquiryDependencies,
} from '../service-inquiries';
import {persistServiceInquiry,type InquiryQuery} from '../service-inquiry-store';

const key='0e503fc2-94a5-4cc5-a57a-30229c54d12e';
const input=()=>({name:'Ada Buyer',email:'ada@example.org',business:'Fixture Studio',challenge:'We need a clear specification and supplier comparison for our next order.',serviceCode:'MERCHANDISE_SOURCING',requestId:key,details:{role:'buyer',product:'Grip socks',quantity:'200 pairs',destination:'Indianapolis, IN',deadline:'2026-12-01',budget:'USD 1000; unconfirmed',requirements:'Existing design; compare exact decoration and freight.'}});
const normalized=(body:any=input()):NormalizedServiceInquiry=>{const r=normalizeServiceInquiry(body);if(!r.ok)throw new Error(JSON.stringify(r));return (r as {ok:true;value:NormalizedServiceInquiry}).value;};
const deps=(overrides:Partial<ServiceInquiryDependencies>={}):ServiceInquiryDependencies=>({createReceiptId:()=> 'svc_abcdefghijklmnopqrstuvwx',persistInquiry:jest.fn(async()=>({kind:'created' as const})),deliverOperator:jest.fn(async()=>({status:'PROVIDER_ACCEPTED' as const})),deliverConfirmation:jest.fn(async()=>({status:'PROVIDER_ACCEPTED' as const})),persistDelivery:jest.fn(async()=>undefined),...overrides});

describe('general business intake contract',()=>{
  it.each(Object.keys(SERVICE_INQUIRY_SERVICES))('accepts bounded canonical category %s without scope or order acceptance',code=>{
    const result=normalizeServiceInquiry({...input(),serviceCode:code});expect(result).toMatchObject({ok:true,value:{serviceCode:code,serviceName:SERVICE_INQUIRY_SERVICES[code]}});
    expect((result as any).value).not.toHaveProperty('scopeAccepted');expect((result as any).value).not.toHaveProperty('paymentStatus');
  });
  it('keeps the legacy pilot default and requires stable IDs for general categories',()=>{
    const body=input();delete body.serviceCode;delete body.requestId;expect(normalized(body).serviceCode).toBe('BACK_OFFICE_OS_STARTER');
    const general=input();delete general.requestId;expect(normalizeServiceInquiry(general)).toMatchObject({ok:false,errors:{requestId:expect.any(String)}});
  });
  it('rejects unknown categories, mismatched labels and malformed request IDs',()=>{
    expect(normalizeServiceInquiry({...input(),serviceCode:'UNBOUNDED_SERVICE'})).toMatchObject({ok:false,errors:{service:expect.any(String)}});
    expect(normalizeServiceInquiry({...input(),service:'Workflow Setup Pilot'})).toMatchObject({ok:false,errors:{service:expect.any(String)}});
    for(const requestId of ['short','contains spaces and punctuation!',{token:'x'},'x'.repeat(101)])expect(normalizeServiceInquiry({...input(),requestId}).ok).toBe(false);
  });
  it.each(['constructor','toString','valueOf','__proto__'])('rejects inherited service alias %s before persistence',async service=>{
    expect(normalizeServiceInquiry({...input(),serviceCode:undefined,service})).toMatchObject({ok:false,errors:{service:expect.any(String)}});
    const d=deps();expect(await receiveServiceInquiry({...input(),serviceCode:undefined,service},d)).toMatchObject({kind:'invalid',errors:{service:expect.any(String)}});expect(d.persistInquiry).not.toHaveBeenCalled();expect(d.deliverOperator).not.toHaveBeenCalled();
  });
  it('rejects individually valid Unicode fields when combined serialized details exceed the database byte bound',async()=>{
    const details={requirements:'界'.repeat(2000),product:'界'.repeat(160),quantity:'界'.repeat(120),destination:'界'.repeat(240),deadline:'界'.repeat(80),budget:'界'.repeat(160),website:'https://example.org/'+'界'.repeat(470)};
    expect(Buffer.byteLength(JSON.stringify(details),'utf8')).toBeGreaterThan(8000);
    const result=normalizeServiceInquiry({...input(),details});expect(result).toMatchObject({ok:false,errors:{details:expect.stringContaining('UTF-8')}});
    const d=deps();expect(await receiveServiceInquiry({...input(),details},d)).toMatchObject({kind:'invalid'});expect(d.persistInquiry).not.toHaveBeenCalled();
  });
  it('strictly bounds untrusted details and rejects nested objects and credential URLs',()=>{
    for(const details of [[],null,{unexpected:'value'},{requirements:'x'.repeat(2001)},{product:{name:'Nested'}},{role:'administrator'},{website:'https://user:secret@example.org'},{website:'javascript:alert(1)'}])expect(normalizeServiceInquiry({...input(),details}).ok).toBe(false);
  });
  it('normalizes line breaks and escapes structured details in operator HTML',()=>{
    const inquiry=normalized({...input(),details:{requirements:'Need <script>danger()</script>\r\nand a clear price.',product:'R&D <socks>'}});
    expect(inquiry.details.requirements).toContain('\n');const html=buildOperatorInquiryEmail(inquiry,'svc_abcdefghijklmnopqrstuvwx');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('R&amp;D &lt;socks&gt;');
  });
  it('fingerprints normalized content independently of key or detail insertion order',()=>{
    const a=normalized(),b=normalized({...input(),email:' ADA@EXAMPLE.ORG ',requestId:'another-valid-request-id',details:Object.fromEntries(Object.entries(input().details).reverse())});
    expect(serviceInquiryPayloadHash(a)).toBe(serviceInquiryPayloadHash(b));expect(serviceInquiryPayloadHash(a)).not.toBe(serviceInquiryPayloadHash(normalized({...input(),challenge:'A different current buying requirement that needs a separate scope.'})));
  });
  it('requires header and body keys to match exactly',()=>{
    expect(applyInquiryRequestHeader(input(),key)).toMatchObject({ok:true,value:{requestId:key}});
    expect(applyInquiryRequestHeader(input(),'another-valid-request-id')).toMatchObject({ok:false});
    expect(applyInquiryRequestHeader(input(),['not','a','string'])).toMatchObject({ok:false});
    const body=input();delete body.requestId;expect(applyInquiryRequestHeader(body,key)).toMatchObject({ok:true,value:{requestId:key}});
  });
  it('reuses a durable replay receipt without another notification or delivery write',async()=>{
    const d=deps({persistInquiry:jest.fn(async()=>({kind:'replay' as const,receiptId:'svc_existingabcdefghijklmnop',operatorEmail:'PENDING' as const,confirmationEmail:'PENDING' as const,currentStatus:'IN_REVIEW'}))});
    const result=await receiveServiceInquiry(input(),d);expect(result).toMatchObject({kind:'received',replayed:true,receiptId:'svc_existingabcdefghijklmnop',currentStatus:'IN_REVIEW',delivery:{operatorEmail:'PENDING',state:'RECORDED_ONLY'}});
    expect(d.deliverOperator).not.toHaveBeenCalled();expect(d.deliverConfirmation).not.toHaveBeenCalled();expect(d.persistDelivery).not.toHaveBeenCalled();
  });
  it('reports a changed-payload idempotency conflict without notification',async()=>{
    const d=deps({persistInquiry:jest.fn(async()=>({kind:'conflict' as const}))});expect(await receiveServiceInquiry(input(),d)).toEqual({kind:'idempotency_conflict'});expect(d.deliverOperator).not.toHaveBeenCalled();expect(d.deliverConfirmation).not.toHaveBeenCalled();
  });
  it('parses bounded owner filters and stable keyset cursors',()=>{
    const cursor=inquiryQueueCursor({created_at:'2026-10-27T17:00:00Z',receipt_id:'svc_abcdefghijklmnopqrstuvwx'});
    expect(parseInquiryQueueQuery({status:'received',serviceCode:'wholesale_trade',limit:'1000',after:'2026-10-25T00:00:00Z',cursor})).toMatchObject({ok:true,value:{status:'RECEIVED',serviceCode:'WHOLESALE_TRADE',limit:100,before:'2026-10-27T17:00:00.000Z',receiptId:'svc_abcdefghijklmnopqrstuvwx'}});
    for(const query of [{status:'UNKNOWN'},{serviceCode:'UNKNOWN'},{after:'yesterday'},{cursor:'not-json'},{cursor:'x'.repeat(513)}])expect(parseInquiryQueueQuery(query).ok).toBe(false);
  });
});

describe('durable idempotency store',()=>{
  it('uses one atomic insert winner and replays the matching saved hash',async()=>{
    const inquiry=normalized();
    const query=jest.fn().mockResolvedValueOnce({rowCount:1,rows:[{receipt_id:'svc_abcdefghijklmnopqrstuvwx'}]});
    expect(await persistServiceInquiry(query,inquiry,'svc_abcdefghijklmnopqrstuvwx')).toEqual({kind:'created'});
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (service_code,request_key) WHERE request_key IS NOT NULL DO NOTHING');
    expect(query.mock.calls[0][1][7]).toBe(key);
    query.mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{receipt_id:'svc_abcdefghijklmnopqrstuvwx',idempotency_payload_hash:serviceInquiryPayloadHash(inquiry),operator_email_status:'PROVIDER_ACCEPTED',confirmation_email_status:'FAILED',status:'RECEIVED'}]});
    expect(await persistServiceInquiry(query,inquiry,'svc_newabcdefghijklmnopqrs')).toMatchObject({kind:'replay',receiptId:'svc_abcdefghijklmnopqrstuvwx',confirmationEmail:'FAILED'});
  });
  it('does not overwrite the saved row when the same key carries another payload',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{receipt_id:'svc_abcdefghijklmnopqrstuvwx',idempotency_payload_hash:'different'}]});
    expect(await persistServiceInquiry(query,normalized(),'svc_newabcdefghijklmnopqrs')).toEqual({kind:'conflict'});expect(query).toHaveBeenCalledTimes(2);expect(query.mock.calls.some(([sql])=>/UPDATE|DELETE/.test(sql))).toBe(false);
  });
  it('does not guess success when a conflicting receipt cannot be read',async()=>{
    const query=jest.fn().mockResolvedValue({rowCount:0,rows:[]});await expect(persistServiceInquiry(query,normalized(),'svc_newabcdefghijklmnopqrs')).rejects.toThrow('could not be confirmed');
  });
  it('keeps different categories separate while concurrent identical retries notify once',async()=>{
    const rows=new Map<string,any>();let sequence=0;
    const query:InquiryQuery=async(sql,values=[])=>{
      if(sql.trim().startsWith('INSERT')){const id=values[1]+':'+values[7];if(rows.has(id))return {rowCount:0,rows:[]};rows.set(id,{receipt_id:values[0],idempotency_payload_hash:values[8],operator_email_status:'PENDING',confirmation_email_status:'PENDING',status:'RECEIVED'});return {rowCount:1,rows:[{receipt_id:values[0]}]};}
      return {rowCount:1,rows:[rows.get(values[0]+':'+values[1])]};
    };
    const d=deps({createReceiptId:()=> 'svc_'+String(++sequence).padStart(24,'0'),persistInquiry:(inquiry,receipt)=>persistServiceInquiry(query,inquiry,receipt)});
    const results=await Promise.all([receiveServiceInquiry(input(),d),receiveServiceInquiry(input(),d),receiveServiceInquiry(input(),d)]);
    expect(new Set(results.map(r=>(r as any).receiptId)).size).toBe(1);expect(d.deliverOperator).toHaveBeenCalledTimes(1);expect(d.deliverConfirmation).toHaveBeenCalledTimes(1);
    await receiveServiceInquiry({...input(),serviceCode:'SUPPLIER_PARTNERSHIP'},d);expect(rows.size).toBe(2);expect(d.deliverOperator).toHaveBeenCalledTimes(2);
  });
  it('migration is additive and retains the existing receipt and payment records',()=>{
    const sql=readFileSync(join(__dirname,'../../../../infra/migrations/036_general_business_inquiries.sql'),'utf8');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS details JSONB');expect(sql).toContain('ON service_inquiries(service_code,request_key) WHERE request_key IS NOT NULL');expect(sql).toContain("'BACK_OFFICE_OS_STARTER'");expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE|UPDATE service_inquiries/i);
  });
});
