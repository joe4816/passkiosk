import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';
const source = readFileSync(new URL('../apps-script/PrintHubEndpoint.gs', import.meta.url), 'utf8');
function backend(signature) {
  const context = createContext({
    serializeRecord_: tx => ({...tx}),
    readHelperConfig_: () => ({sources:{schoolName:'Sample School'}}),
    getActiveAdultByUsername_: () => ({displayName:'T. Adult', sig:'stored.png'}),
    signaturePayload_: () => signature
  });
  runInContext(source, context);
  return context;
}
test('worker includes the actual stored signature payload and configured adult name', () => {
  const signature = {mimeType:'image/png', base64:'synthetic-test-bytes'};
  const tx = backend(signature).printHubPrintableTransaction_({Workflow:'PASS', 'Session Username':'TEST'});
  assert.equal(tx['Issued By'], 'T. Adult');
  assert.equal(tx['Signature File'], 'stored.png');
  assert.equal(tx['Signature Payload'], signature);
  assert.equal(tx['School Name'], 'Sample School');
});
test('missing configured signature prevents a printable payload', () => {
  assert.throws(() => backend(null).printHubPrintableTransaction_({Workflow:'BUS',
    'Approved By Username':'TEST'}), /unavailable/);
});
test('transactions without an adult or stored signature do not invent a signature', () => {
  const tx = backend(null).printHubPrintableTransaction_({Workflow:'RQST'});
  assert.equal(tx['Signature Payload'], undefined);
});
