// Performance testing script using performance timing APIs
const https = require('https');
const { performance } = require('perf_hooks');

async function measurePerformance(url) {
  const start = performance.now();

  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (res) => {
      let data = '';
      let firstByteTime = 0;

      res.once('readable', () => {
        firstByteTime = performance.now() - start;
      });

      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const totalTime = performance.now() - start;
        resolve({
          ttfb: firstByteTime,
          totalTime,
          contentLength: data.length,
          statusCode: res.statusCode,
          headers: res.headers
        });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('Running performance tests...\n');

  const tests = [
    { name: 'Main Page', url: 'https://teatimewithtesters.com/' },
    { name: 'CSS Bundle', url: 'https://teatimewithtesters.com/wp-content/cache/tw_optimize/css/two_front_page_aggregated.min.css?date=1764492527' },
    { name: 'jQuery', url: 'https://teatimewithtesters.com/wp-includes/js/jquery/jquery.min.js?ver=3.7.1' }
  ];

  const results = [];
  for (const test of tests) {
    try {
      const result = await measurePerformance(test.url);
      results.push({ name: test.name, ...result });
      const ttfb = result.ttfb.toFixed(2);
      const total = result.totalTime.toFixed(2);
      const size = (result.contentLength / 1024).toFixed(2);
      console.log(`${test.name}:`);
      console.log(`  TTFB: ${ttfb}ms`);
      console.log(`  Total: ${total}ms`);
      console.log(`  Size: ${size}KB`);
      console.log(`  Compression: ${result.headers['content-encoding'] || 'none'}`);
      console.log(`  Cache: ${result.headers['x-cache'] || 'N/A'}\n`);
    } catch (err) {
      console.error(`Error testing ${test.name}:`, err.message);
    }
  }

  return results;
}

runTests().then(() => console.log('Tests complete'));
