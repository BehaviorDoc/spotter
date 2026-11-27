// Run with: node tests/wod.test.js   (no dependencies)
// Loads the counter and WOD engine straight out of wod.html and checks the clock and scoring logic.
const fs = require("fs"), path = require("path"), assert = require("assert");
const html = fs.readFileSync(path.join(__dirname, "..", "wod.html"), "utf8");
const block = (a, b) => html.split(a)[1].split(b)[0].replace(/<\/?script>/g, "");
const mod = { exports: {} };
new Function("module", block("<!--COUNTER-START-->", "<!--COUNTER-END-->") + "\n" + block("<!--WOD-START-->", "<!--WOD-END-->"))(mod);
const { WodRun, parseWod, normalizeWod, PRESETS, RepCounter, EXERCISES, torsoUpright } = mod.exports;

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log("ok   " + name); } catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; } };
const S = 1000;
const types = evs => evs.map(e => e.type);

test("countdown beeps 3-2-1 then go", () => {
  const r = new WodRun(PRESETS[0]); r.start(0, 10);
  const evs = [];
  for (let t = 0; t <= 10 * S; t += 100) evs.push(...r.tick(t));
  assert.deepStrictEqual(evs.filter(e => e.type === "beep").map(e => e.n || e.kind), [3, 2, 1, "long"]);
  assert(types(evs).includes("go"));
  assert.strictEqual(r.phase, "running");
});

test("AMRAP counts rounds + reps and ends on time", () => {
  const r = new WodRun({ format: "amrap", minutes: 1, movements: [{ move: "pullup", reps: 2 }, { move: "pushup", reps: 3 }] });
  r.start(0, 0);
  r.addReps(1 * S, 2); r.addReps(2 * S, 3);  // round 1 done
  assert.strictEqual(r.round, 2);
  r.addReps(3 * S, 2); r.addReps(4 * S, 1);  // 2 pull-ups + 1 push-up
  assert.strictEqual(r.score().text, "1 + 3");
  const evs = []; for (let t = 5 * S; t <= 61 * S; t += 250) evs.push(...r.tick(t));
  assert(types(evs).includes("done"));
  assert.strictEqual(r.phase, "done");
  assert(evs.some(e => e.type === "say" && /30 seconds/.test(e.text)));
});

test("For Time with 21-15-9 ladder finishes with a time", () => {
  const r = new WodRun(PRESETS.find(p => p.name === "Fran"));
  r.start(0, 0);
  assert.strictEqual(r.current().target, 21);
  let t = 0;
  for (const n of [21, 15, 9]) { r.addReps(t += 30 * S, n); r.addReps(t += 30 * S, n); }
  assert.strictEqual(r.phase, "done");
  assert.strictEqual(r.reason, "finished");
  assert.strictEqual(r.score().text, "3:00");
  assert.strictEqual(r.splits.length, 3);
});

test("For Time hits the cap and reports reps", () => {
  const r = new WodRun({ format: "fortime", rounds: 3, cap: 1, movements: [{ move: "burpee", reps: 10 }] });
  r.start(0, 0); r.addReps(5 * S, 14);
  for (let t = 6 * S; t <= 61 * S; t += 500) r.tick(t);
  assert.strictEqual(r.reason, "cap");
  assert.strictEqual(r.score().text, "CAP + 14");
});

test("EMOM: done early rests, missed minutes are recorded", () => {
  const r = new WodRun({ format: "emom", minutes: 3, movements: [{ move: "burpee", reps: 5 }] });
  r.start(0, 0); r.tick(0);
  const e1 = r.addReps(20 * S, 5);
  assert(types(e1).includes("set-done"));
  assert.strictEqual(e1.find(e => e.type === "set-done").rest, 40);
  assert(types(r.addReps(21 * S, 1)).includes("resting"));
  const e2 = []; for (let t = 21 * S; t <= 61 * S; t += 250) e2.push(...r.tick(t));
  assert(e2.some(e => e.type === "minute" && e.n === 2));
  // minute 2: only 3 reps, minute 3: full
  r.addReps(70 * S, 3);
  for (let t = 61 * S; t <= 121 * S; t += 250) r.tick(t);
  r.addReps(130 * S, 5);
  for (let t = 121 * S; t <= 181 * S; t += 250) r.tick(t);
  assert.strictEqual(r.phase, "done");
  assert.strictEqual(r.score().text, "2/3");
  assert.deepStrictEqual(r.missed, [2]);
});

test("EMOM alternating switches movement each minute", () => {
  const r = new WodRun(PRESETS.find(p => p.emomEach === "alt"));
  r.start(0, 0); r.tick(0);
  assert.strictEqual(r.current().move, "kbswing");
  for (let t = 0; t <= 61 * S; t += 250) r.tick(t);
  assert.strictEqual(r.current().move, "airsquat");
});

test("EMOM 'do every movement' chains movements within a minute", () => {
  const r = new WodRun({ format: "emom", minutes: 2, emomEach: "all", movements: [{ move: "pullup", reps: 3 }, { move: "pushup", reps: 6 }] });
  r.start(0, 0); r.tick(0);
  r.addReps(5 * S, 3);
  assert.strictEqual(r.current().move, "pushup");
  assert(types(r.addReps(15 * S, 6)).includes("set-done"));
});

test("Tabata counts reps only during work and scores the lowest round", () => {
  const r = new WodRun({ format: "tabata", work: 20, rest: 10, sets: 3, movements: [{ move: "airsquat" }] });
  r.start(0, 0); r.tick(0);
  const reps = [12, 10, 11];
  for (let k = 0; k < 3; k++) {
    for (let t = k * 30 * S; t < k * 30 * S + 1 * S; t += 250) r.tick(t);
    r.addReps(k * 30 * S + 5 * S, reps[k]);
    assert.strictEqual(r.addReps(k * 30 * S + 25 * S, 1).length, 0, "rest reps ignored");
  }
  for (let t = 60 * S; t <= 81 * S; t += 250) r.tick(t);
  assert.strictEqual(r.phase, "done");
  assert.strictEqual(r.score().text, "10");
});

test("Run / row movements complete with one tap", () => {
  const r = new WodRun(PRESETS.find(p => p.name === "5 rounds"));
  r.start(0, 0);
  assert.strictEqual(r.current().unit, "m");
  r.completeMovement(60 * S);
  assert.strictEqual(r.current().move, "kbswing");
});

test("Pause stops the clock", () => {
  const r = new WodRun({ format: "amrap", minutes: 1, movements: [{ move: "burpee", reps: 5 }] });
  r.start(0, 0); r.pause(10 * S);
  for (let t = 10 * S; t <= 100 * S; t += 1000) r.tick(t);
  assert.strictEqual(r.phase, "running");
  r.resume(100 * S);
  assert.strictEqual(Math.round(r.elapsed(100 * S)), 10);
});

test("zero-rep movements can't stall a round", () => {
  const w = normalizeWod({ format: "amrap", minutes: 5, movements: [{ move: "burpee", reps: 0 }] });
  assert.strictEqual(w.movements[0].reps, 1);
});

test("parse an AMRAP from the whiteboard", () => {
  const { wod, unknown } = parseWod("AMRAP 12\n10 burpees\n15 wall balls 20/14 lb\n200 m run");
  assert.strictEqual(wod.format, "amrap"); assert.strictEqual(wod.minutes, 12);
  assert.deepStrictEqual(wod.movements.map(m => [m.move, m.reps]), [["burpee", 10], ["wallball", 15], ["run", 200]]);
  assert.strictEqual(wod.movements[1].note, "20/14lb");
  assert.deepStrictEqual(unknown, []);
});

test("parse a ladder with a cap", () => {
  const { wod } = parseWod("For time, 10 min cap\n21-15-9\nThrusters 95/65\nPull-ups");
  assert.strictEqual(wod.format, "fortime");
  assert.deepStrictEqual(wod.ladder, [21, 15, 9]);
  assert.strictEqual(wod.cap, 10);
  assert.deepStrictEqual(wod.movements.map(m => m.move), ["thruster", "pullup"]);
});

test("parse EMOM, rounds, toes-to-bar, row in meters, mile run", () => {
  let { wod } = parseWod("EMOM 16, alternating\nMin 1: 12 cal row\nMin 2: 10 toes to bar");
  assert.strictEqual(wod.format, "emom"); assert.strictEqual(wod.minutes, 16); assert.strictEqual(wod.emomEach, "alt");
  assert.deepStrictEqual(wod.movements.map(m => [m.move, m.reps]), [["row", 12], ["t2b", 10]]);
  ({ wod } = parseWod("5 rounds for time\n500m row\n20 KB swings\n1 mile run"));
  assert.strictEqual(wod.rounds, 5);
  assert.strictEqual(wod.movements[0].unit, "m"); assert.strictEqual(wod.movements[0].reps, 500);
  assert.strictEqual(wod.movements[2].reps, 1609);
});

// Rep counter: synthetic burpee using torso angle
function pose({ torso = 0, knee = 180 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
  const rad = torso * Math.PI / 180;
  for (const [sh, hip] of [[11, 23], [12, 24]]) { lm[hip] = { x: 0.5, y: 0.6, visibility: 0.99 }; lm[sh] = { x: 0.5 + 0.2 * Math.sin(rad), y: 0.6 - 0.2 * Math.cos(rad), visibility: 0.99 }; }
  return lm;
}
test("torso angle reads standing vs chest-down", () => {
  assert(Math.abs(torsoUpright(pose({ torso: 0 })) - 180) < 1);
  assert(Math.abs(torsoUpright(pose({ torso: 90 })) - 90) < 1);
});
test("burpee counter counts stand → floor → stand", () => {
  const c = new RepCounter("burpee", "normal"); let t = 0, reps = 0;
  const step = deg => { c.update(pose({ torso: deg }), t += 33); reps += c.events.filter(e => e.type === "rep").length; };
  for (let k = 0; k < 3; k++) { for (let d = 0; d <= 90; d += 5) step(d); for (let d = 90; d >= 0; d -= 5) step(d); for (let i = 0; i < 20; i++) step(0); }
  assert.strictEqual(reps, 3);
});
test("every camera move maps to a real exercise", () => {
  for (const [k, m] of Object.entries(mod.exports.MOVES)) if (m.ex) assert(EXERCISES[m.ex], k);
});

console.log(`\n${passed} passed`);
