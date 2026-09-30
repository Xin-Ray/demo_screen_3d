// Distance/position accuracy of the webcam eye tracker under realistic error sources.
const assert = require('node:assert/strict');
require('./concave-room-tracking.js');
const {run} = require('./tracking-accuracy.js');
const result = run();
console.log(`${'error in cm at distance →'.padEnd(34)}${result.distances.map(d => `${d}cm`.padStart(7)).join('')}`);
for (const [name, errors] of result.rows) console.log(`${name.padEnd(34)}${errors.map(e => e.toFixed(1).padStart(7)).join('')}`);
console.log(`iris is ${result.irisPx[250].toFixed(1)} px wide at 250 cm, ${result.irisPx[100].toFixed(1)} px at 100 cm`);
result.rows[0][1].forEach(e => assert.ok(e < .01, 'ideal reconstruction must be exact'));
const jitter = result.rows.find(r => r[0].includes('+1 px'))[1];
assert.ok(jitter[6] > jitter[3], 'a 1 px iris error hurts more at long range');
console.log('PASS: tracker is exact when settings are right; errors from FOV, tilt, slider and iris pixels are quantified above.');
