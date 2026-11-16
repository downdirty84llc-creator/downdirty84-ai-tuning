import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FUEL_POLICY, currentFuelPolicy } from './fuel_policy.js';
test('legacy, unsupported and incomplete fuel policy provenance fails closed', () => {
  for (const v of [null, {}, {thresholdProfile:'NA_GAS'}, {fuelPolicy:FUEL_POLICY},
    {fuelPolicy:'old',thresholdProfile:'NA_GAS'},
    {fuelPolicy:FUEL_POLICY,thresholdProfile:'NA_E85'},
    {fuelPolicy:FUEL_POLICY,thresholdProfile:'BOOSTED_E85'},
    {fuelPolicy:FUEL_POLICY,thresholdProfile:null}]) assert.equal(currentFuelPolicy(v), false);
  for (const thresholdProfile of ['NA_GAS','BOOSTED_GAS'])
    assert.equal(currentFuelPolicy({fuelPolicy:FUEL_POLICY,thresholdProfile}), true);
});
