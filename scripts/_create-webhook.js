const https = require('https');
const key = process.env.STRIPE_KEY || process.env.STRIPE_SECRET_KEY || '';

function apiCall(method, path, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const req = https.request({
      hostname: 'api.stripe.com', path, method,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(key + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Creating Stripe webhook endpoint...');
  const params = new URLSearchParams();
  params.append('url', 'https://abackend-production.up.railway.app/billing/webhook');
  params.append('enabled_events[]', 'checkout.session.completed');
  params.append('enabled_events[]', 'customer.subscription.updated');
  params.append('enabled_events[]', 'customer.subscription.deleted');
  params.append('enabled_events[]', 'invoice.payment_failed');

  const body = params.toString();
  const webhook = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.stripe.com', path: '/v1/webhook_endpoints', method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(key + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (webhook.error) {
    console.error('Error:', webhook.error.message);
    return;
  }

  console.log('Webhook ID:', webhook.id);
  console.log('Webhook Secret:', webhook.secret);
  console.log('');
  console.log('Now run:');
  console.log(`npx @railway/cli variables set "STRIPE_WEBHOOK_SECRET=${webhook.secret}"`);
}
main();
