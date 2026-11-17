const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{},document:{readyState:'loading',addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../date-calendar.js'),'utf8'),context);
const {isoDate,displayDate,parseTypedDate,guideDateInput}=context.window.SKDateCalendar;

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

test('four digits use the current year and eight digits retain the explicit year',()=>{
 assert.equal(parseTypedDate('1711',2026),'2026-11-17');
 assert.equal(parseTypedDate('17112025',2026),'2025-11-17');
 assert.equal(parseTypedDate('0101',2027),'2027-01-01');
 assert.equal(parseTypedDate('3112',2026),'2026-12-31');
});
test('typed dates accept slashes and pasted ISO dates without swapping day and month',()=>{
 for(const value of ['17/11','17/11/2026','2026-11-17',' 1711 '])assert.equal(parseTypedDate(value,2026),'2026-11-17');
 assert.equal(parseTypedDate('1/2',2026),'2026-02-01');
 assert.equal(parseTypedDate('01022025',2026),'2025-02-01');
});
test('typed impossible and incomplete dates are rejected, including non-leap February',()=>{
 for(const value of ['3111','31042026','2902','0011','1700','1713','17','171','17112','171120','1711202','11/17','2026-11-17Tjunk','hola','17-11-2026'])assert.equal(parseTypedDate(value,2026),'',value);
 assert.equal(parseTypedDate('2902',2024),'2024-02-29');
 assert.equal(parseTypedDate('29022024',2026),'2024-02-29');
});

test('date guides appear after the day and month without prematurely adding a year',()=>{
 for(const [raw,expected] of [['1','1'],['17','17/'],['171','17/1'],['1711','17/11/'],['17112','17/11/2'],['17112025','17/11/2025'],['17/11','17/11/']]){
  const result=guideDateInput(raw);assert.equal(result.value,expected);assert.equal(result.caret,expected.length);
 }
 assert.equal(parseTypedDate('17/11/',2026),'2026-11-17');
 assert.equal(parseTypedDate('31/11/',2026),'');
 assert.equal(parseTypedDate('17/',2026),'');
});
test('date guides allow backspacing, editing the month and pasting other supported formats',()=>{
 assert.equal(guideDateInput('17',2,'deleteContentBackward').value,'17');
 assert.equal(guideDateInput('17/11',5,'deleteContentBackward').value,'17/11');
 for(const value of ['17/1/2026','17//2026','1/2/2026','2026-11-17','171120255','hola'])assert.equal(guideDateInput(value).value,value);
 const edited=guideDateInput('17/12/2026',5);assert.equal(edited.value,'17/12/2026');assert.equal(edited.caret,5);
 assert.equal(guideDateInput('17//').value,'17/');
 assert.equal(guideDateInput('17/11//').value,'17/11/');
});
