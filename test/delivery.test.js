import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { generateKeyPairSync, verify, createHash, randomUUID } from 'node:crypto';
import { Webhook } from 'svix';

// Isolated local storage and fake providers; no deployment credentials or outbound requests.
delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.VERCEL_ENV;
process.env.RESEND_API_KEY = 'test';
process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('test-only-webhook-secret-32-bytes!').toString('base64')}`;
const pair = generateKeyPairSync('ed25519');
const connection = { endpoint: 'https://webm8-platform.vercel.app/api/ingest/v1/leads', keyId: 'w8_test', privateKeyPem: pair.privateKey.export({ format:'pem',type:'pkcs8' }) };
process.env.WEBM8_LEAD_SETUP_FILE = `const config = ${JSON.stringify(connection, null, 2)};`;
const store = await import('../lib/store.js');
const { createDelivery, processDelivery, getDelivery, recordDeliveryEvent, attentionReason, deliverySummary } = await import('../lib/delivery.js');
const { POST: webhook } = await import('../api/webhooks/resend.js');
const { GET: health } = await import('../api/delivery-health.js');
const originalFetch = globalThis.fetch;
let emails, crmEvents, providerStatus, crmOffline;
beforeEach(() => {
  delete process.env.RESEND_FROM;
  globalThis.__qceMemory.clear(); emails = []; crmEvents = []; providerStatus = 200; crmOffline = false;
  globalThis.fetch = async (url, options) => {
    if (url === connection.endpoint) {
      if (crmOffline) throw new Error('Simulated CRM outage');
      const digest = createHash('sha256').update(options.body).digest('hex');
      const signed = `WEBM8v1\n${options.headers['x-webm8-timestamp']}\n${options.headers['x-webm8-event-id']}\n${digest}`;
      assert.equal(verify(null, Buffer.from(signed), pair.publicKey, Buffer.from(options.headers['x-webm8-signature'],'base64url')), true);
      crmEvents.push(JSON.parse(options.body));
      return Response.json({ success:true,leadId:'test-lead',duplicate:false });
    }
    if (url === 'https://api.resend.com/emails') {
      emails.push({body:options.body,key:options.headers['Idempotency-Key']});
      if (providerStatus instanceof Error) throw providerStatus;
      return Response.json(providerStatus === 200 ? {id:'test-email'} : {error:'simulated failure'}, { status:providerStatus });
    }
    throw new Error('Unexpected network request');
  };
});
after(() => { globalThis.fetch = originalFetch; });
async function fixture() {
  const record = { id:randomUUID(),ref:'QCE-TEST',at:new Date().toISOString(),name:'Synthetic Test',phone:'+447700900123',email:null,side:'buy',currency:'EUR',amount:100,date:'2026-11-18',estimate:117 };
  const email = {to:'test@example.invalid',subject:'Synthetic',html:'<p>Test</p>',text:'Test'};
  await createDelivery(record, email, 'dup:test');
  return record;
}
const event = (id, type, at = new Date().toISOString()) => ({type,created_at:at,data:{email_id:'test-email',tags:{reservation_id:id}}});

test('saves a correctly signed CRM lead, then accepts one email; accepted is not delivered', async () => {
  const record = await fixture();
  const item = await processDelivery(record.id);
  assert.equal(item.crmStatus,'saved'); assert.equal(item.status,'accepted'); assert.equal(item.providerId,'test-email');
  assert.equal(crmEvents[0].lead.externalLeadId,record.id);
  await processDelivery(record.id); assert.equal(emails.length,1);
  assert.equal(attentionReason(item,Date.now()+16*60000),'delivery_unconfirmed');
});
test('temporary provider failure stays saved and retry uses identical payload and idempotency key', async () => {
  const record = await fixture(); providerStatus=503;
  let item = await processDelivery(record.id);
  assert.equal(item.status,'retrying'); assert.equal(item.crmStatus,'saved');
  assert.equal(attentionReason(item),'send_retrying');
  process.env.RESEND_FROM = 'Changed Sender <changed@example.invalid>';
  providerStatus=200; await store.update(`delivery:${record.id}`,i=>({...i,nextAttemptAt:null}));
  item=await processDelivery(record.id); assert.equal(item.status,'accepted');
  assert.deepEqual(emails[0],emails[1]); assert.equal(crmEvents.length,1);
});
test('an uncertain send is never automatically repeated beyond the idempotency window', async () => {
  const record=await fixture(); providerStatus=new Error('Timeout'); await processDelivery(record.id);
  await store.update(`delivery:${record.id}`,i=>({...i,firstAttemptAt:new Date(Date.now()-24*3600000).toISOString(),nextAttemptAt:null}));
  assert.equal((await processDelivery(record.id)).status,'manual_review'); assert.equal(emails.length,1);
});
test('permanent provider rejection is flagged and not retried', async () => {
  const record=await fixture(); providerStatus=403;
  assert.equal((await processDelivery(record.id)).status,'failed');
  await processDelivery(record.id); assert.equal(emails.length,1);
});
test('CRM outage preserves the local request and independent shop email; recovery saves the same CRM ID', async () => {
  const record=await fixture(); crmOffline=true;
  let item=await processDelivery(record.id); assert.equal(item.crmStatus,'error');assert.equal(item.status,'accepted');
  crmOffline=false;item=await processDelivery(record.id);assert.equal(item.crmStatus,'saved');assert.equal(emails.length,1);
});
test('signed delivery webhook is durable, idempotent and cannot be downgraded by a late sent event', async () => {
  const record=await fixture();await processDelivery(record.id);
  const body=JSON.stringify(event(record.id,'email.delivered'));
  const id='msg_test';const date=new Date();const stamp=String(Math.floor(date.getTime()/1000));
  const signature=new Webhook(process.env.RESEND_WEBHOOK_SECRET).sign(id,date,body);
  const request=()=>new Request('https://quickcurrencyexchange.uk/api/webhooks/resend',{method:'POST',headers:{'svix-id':id,'svix-timestamp':stamp,'svix-signature':signature},body});
  assert.equal((await webhook(request())).status,200);assert.equal((await webhook(request())).status,200);
  await recordDeliveryEvent(event(record.id,'email.sent'),'msg_late_sent');
  const item=await getDelivery(record.id);assert.equal(item.status,'delivered');assert.equal(item.eventIds.filter(v=>v===id).length,1);
});
test('forged and expired webhook signatures cannot change a reservation', async () => {
  const record=await fixture();await processDelivery(record.id);const body=JSON.stringify(event(record.id,'email.delivered'));
  for(const age of [0,600000]) {
    const date=new Date(Date.now()-age);const signature=age?new Webhook(process.env.RESEND_WEBHOOK_SECRET).sign('msg_bad',date,body):'v1,forged';
    const result=await webhook(new Request('https://quickcurrencyexchange.uk/api/webhooks/resend',{method:'POST',headers:{'svix-id':'msg_bad','svix-timestamp':String(Math.floor(date.getTime()/1000)),'svix-signature':signature},body}));
    assert.equal(result.status,401);
  }
  assert.equal((await getDelivery(record.id)).status,'accepted');
});
test('webhook arriving before send acknowledgement is retained', async () => {
  const record=await fixture();await recordDeliveryEvent(event(record.id,'email.delivered'),'msg_early');
  assert.equal((await processDelivery(record.id)).status,'delivered');assert.equal(emails.length,0);
});
test('delayed then delivered recovers; bounced and complaints need attention', async () => {
  const record=await fixture();await processDelivery(record.id);
  await recordDeliveryEvent(event(record.id,'email.delivery_delayed'),'msg_delay');assert.equal(attentionReason(await getDelivery(record.id)),'delivery_delayed');
  await recordDeliveryEvent(event(record.id,'email.delivered'),'msg_deliver');assert.equal(attentionReason(await getDelivery(record.id)),null);
  await recordDeliveryEvent(event(record.id,'email.complained'),'msg_complaint');assert.equal(attentionReason(await getDelivery(record.id)),'email_failed');
});
test('public health never exposes customer details, payloads, counts or request identifiers', async () => {
  const record=await fixture();await processDelivery(record.id);
  const result=await health();const body=await result.text();
  for(const secret of [record.id,record.name,record.phone,'Synthetic','test-email','counts']) assert.equal(body.includes(secret),false);
  assert.equal((await deliverySummary()).counts.total,1);
});
test('atomic acceptance produces exactly one outbox and request for concurrent duplicates', async () => {
  const first=await fixture();const other={...first,id:randomUUID(),ref:'QCE-NEXT'};
  const result=await createDelivery(other,{},'dup:test');assert.equal(result.created,false);assert.equal(result.existing.id,first.id);
  assert.equal((await store.listRange('reservations',10)).length,1);assert.equal(await getDelivery(other.id),null);
});
