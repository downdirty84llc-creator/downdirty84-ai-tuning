import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLogContent } from './pipeline.js';
import { parseLog } from './log/parser.js';
import { makeSyntheticLog } from './log/synthetic.js';
import { normaliseFuel, selectProfile } from '../../config/thresholds.profiles.js';
const clean = () => makeSyntheticLog({ mafErrorAt: () => 0.04, noise: 0.2 });
test('ambiguous blend and contradictory metadata never select a confirmed profile', () => {
  for (const fuel of ['FLEX', 'ETHANOL', 'E30', 'diesel']) {
    assert.equal(normaliseFuel(fuel), null);
    assert.equal(selectProfile({fuel, induction:'NA'}), null);
  }
  assert.equal(selectProfile({fuel:'GASOLINE', induction:'NA', service_type:'STAGE1_BOOST'}), null);
  assert.equal(selectProfile({fuel:'GASOLINE', induction:'FORCED', service_type:'STAGE1_NA'}), null);
  assert.equal(selectProfile({fuel:'GASOLINE', induction:'unclear', service_type:'STAGE1_NA'}), null);
});
test('E85 and unknown scale fail validation before rules and diff generation', () => {
  for (const profile of [null, 'NA_E85', 'BOOSTED_E85'] as const) {
    const out = analyzeLogContent(clean(), 'fuel-test', profile);
    assert.equal(out.ok, false);
    if (!out.ok) { assert.equal(out.stage, 'VALIDATE'); assert.equal(out.validation?.status, 'FAIL'); }
    assert.equal('rules' in out, false);
    assert.equal('diffgen' in out, false);
  }
});
test('even known gasoline rejects numerically inferred lambda and mixed samples', () => {
  for (const profile of ['NA_GAS','BOOSTED_GAS','NA_E85','BOOSTED_E85'] as const) {
    const out = analyzeLogContent(makeSyntheticLog({commandedAfr:1}), 'lambda', profile);
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.stage, 'PARSE');
  }
  const csv = clean().split('\n');
  const cells = csv[1].split(',');
  const idx = csv[0].split(',').findIndex(h => /AFR Cmd/i.test(h));
  assert.ok(idx >= 0);
  cells[idx] = '1.0'; csv[1] = cells.join(',');
  assert.throws(() => parseLog(csv.join('\n')), /ambiguous dimensionless/);
});
test('explicit lambda and equivalence ratio headers fail regardless of numeric range', () => {
  for (const label of ['Commanded Lambda','Commanded Equivalence Ratio','Eq Ratio Cmd']) {
    const csv = clean().split('\n');
    csv[0] = csv[0].split(',').map(h=>/AFR Cmd/i.test(h)?label:h).join(',');
    assert.throws(() => parseLog(csv.join('\n')), /unsupported or ambiguous/);
  }
});
test('explicit supported gasoline AFR regression still works without promoting other profiles', () => {
  assert.equal(analyzeLogContent(clean(), 'gas-afr', 'NA_GAS').ok, true);
});
test('unit-row lambda/equivalence semantics are rejected before normalization', () => {
  for (const unit of ['lambda', 'equivalence ratio']) {
    const lines = clean().split('\n');
    const header = lines[0].split(',');
    const units = header.map(h => /AFR Cmd/i.test(h) ? unit : 'unit');
    lines.splice(1, 0, units.join(','));
    assert.throws(() => parseLog(lines.join('\n')), /units row/);
  }
});
