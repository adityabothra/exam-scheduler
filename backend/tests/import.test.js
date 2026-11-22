const test = require('node:test');
const assert = require('node:assert');
const { toDate, toTime, entityName, sheetsFromDemo, ORDER } = require('../services/importService');

test('dates: ISO, DD/MM/YYYY, Excel Date and serial number', () => {
  assert.strictEqual(toDate('2027-05-03'), '2027-05-03');
  assert.strictEqual(toDate('3/5/2027'), '2027-05-03');
  assert.strictEqual(toDate(new Date(Date.UTC(2027, 4, 3))), '2027-05-03');
  assert.strictEqual(toDate('46510'), '2027-05-03');
  assert.throws(() => toDate('31/02/2027x'));
  assert.throws(() => toDate(''));
});

test('times: 24h, 12h, Excel time cell and day fraction', () => {
  assert.strictEqual(toTime('9:00'), '09:00:00');
  assert.strictEqual(toTime('2:30 PM'), '14:30:00');
  assert.strictEqual(toTime('12:00 AM'), '00:00:00');
  assert.strictEqual(toTime(new Date(Date.UTC(1899, 11, 30, 13, 15))), '13:15:00');
  assert.strictEqual(toTime('0.5'), '12:00:00');
  assert.throws(() => toTime('25:00'));
});

test('sheet name aliases resolve to entities', () => {
  assert.strictEqual(entityName('Time Slots'), 'timeslots');
  assert.strictEqual(entityName('Classrooms'), 'rooms');
  assert.strictEqual(entityName('Exam Period'), 'period');
  assert.strictEqual(entityName('Notes'), null);
});

test('sample dataset covers every import sheet in order', () => {
  const d = sheetsFromDemo();
  for (const e of ORDER) assert.ok(e in d, `missing ${e}`);
  assert.strictEqual(d.students.length, 40);
});
