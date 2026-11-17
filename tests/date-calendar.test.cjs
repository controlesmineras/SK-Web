const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{},document:{readyState:'loading',addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../date-calendar.js'),'utf8'),context);
const {isoDate,displayDate}=context.window.SKDateCalendar;

test('calendar accepts the existing ISO and Spanish field contracts',()=>{
 assert.equal(isoDate('2026-11-17'),'2026-11-17');
 assert.equal(isoDate('17/11/2026'),'2026-11-17');
 assert.equal(displayDate('2026-11-17'),'17/11/2026');
 assert.equal(displayDate('17/11/2026'),'17/11/2026');
});
test('calendar keeps local dates independent of time and timezone',()=>{
 assert.equal(isoDate('2026-11-17T00:05'),'2026-11-17');
 assert.equal(displayDate('2026-11-17T23:55'),'17/11/2026');
});
test('calendar rejects nonexistent dates rather than moving them to another month',()=>{
 for(const value of ['29/02/2026','31/04/2026','2026-13-01','2026-02-30','11/17/2026','0000-01-01'])assert.equal(isoDate(value),'',value);
 assert.equal(isoDate('29/02/2024'),'2024-02-29');
});
test('calendar preserves empty optional date filters',()=>{
 for(const value of ['',null,undefined,'   ']){assert.equal(isoDate(value),'');assert.equal(displayDate(value),'');}
});
