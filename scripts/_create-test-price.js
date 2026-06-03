const https = require('https');
const key = process.env.STRIPE_TEST_KEY || process.env.STRIPE_SECRET_KEY || '';

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
  console.log('Creating Stripe test product + price...');
  const product = await apiCall('POST', '/v1/products', {
    name: 'Nova Hub Lite',
    description: 'Daily Brief + AI Screener + Paper Trading',
  });
  console.log('Product:', product.id);

  const price = await apiCall('POST', '/v1/prices', {
    product: product.id,
    unit_amount: '2900',
    currency: 'usd',
    'recurring[interval]': 'month',
  });
  console.log('Price ID:', price.id);
  console.log('');
  console.log('Now run:');
  console.log(`npx @railway/cli variables set "STRIPE_PRICE_MONTHLY=${price.id}"`);
}
main();
