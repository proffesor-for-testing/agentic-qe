#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dashboards = ['executive', 'developer', 'qa-leader'];
const basePath = path.join(__dirname);

console.log('🔍 Validating Grafana Dashboards...\n');

let allValid = true;

dashboards.forEach(name => {
  try {
    const filePath = path.join(basePath, `${name}.json`);
    const content = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(content);

    console.log(`✅ ${name}.json - Valid`);
    console.log(`   - Panels: ${json.panels.length}`);
    console.log(`   - UID: ${json.uid}`);
    console.log(`   - Title: ${json.title}`);
    console.log(`   - Refresh: ${json.refresh}`);
    console.log('');
  } catch (err) {
    console.error(`❌ ${name}.json - Invalid: ${err.message}`);
    allValid = false;
  }
});

if (allValid) {
  console.log('✅ All dashboards are valid JSON!');
  process.exit(0);
} else {
  console.error('❌ Some dashboards have errors');
  process.exit(1);
}
