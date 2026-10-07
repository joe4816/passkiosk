import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../apps-script/PrintHubEndpoint.gs',import.meta.url),'utf8');
const context=vm.createContext({});vm.runInContext(source,context);
test('seven CUPS routes stamp the exact binding and paper',()=>{
 const expected=[['RECEIPT1','80MM_RECEIPT'],['RECEIPT2','80MM_RECEIPT'],['CAFE_TARDY','80MM_RECEIPT'],['AP_TARDY','80MM_RECEIPT'],['AP_COPIER','STATEMENT'],['MAIN_COPIER','STATEMENT'],['BACK_OFFICE','B6']];
 for(const [key,media] of expected){context.key=key;const fields=JSON.parse(vm.runInContext('JSON.stringify(printHubFieldsForPrinter_(key,"PK-TEST","REPRINT"))',context));assert.equal(fields['Binding Key'],key);assert.equal(fields['Media Profile ID'],media);assert.equal(fields['Copy Role'],'REPRINT');assert.equal(fields['Endpoint ID'],'PH-FRONT-RECEIPT-01');}
});
test('backward compatibility and readiness gating prevent old bridge copier claims',()=>{
 assert.match(source,/readyBindingKeys/);assert.match(source,/\['RECEIPT1'\]/);assert.match(source,/!readyKeys.has\(bindingKey\)/);assert.match(source,/route.mediaProfileId !== mediaProfileId/);
});
