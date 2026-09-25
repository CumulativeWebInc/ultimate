// Project Ultimate — Phase 0 contract tests (dependency-free).
// Run: node tests/contracts.test.js   (exit 0 = all green, non-zero = failures)
// Validates the seed registry + event/snapshot fixtures against the frozen
// JSON Schemas, the sim-compatibility invariants (envelope-v1 byte-identity,
// snapshot subschema drift guard vs the sim's own schema-v2.json), and the
// truth contract (sample/seed marking, protocol.md documents every type).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');           // backend/
const simRoot = join(root, '..', '..', 'ultimate-archipelago');              // sim sources
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

const eventSchema = load(join(root, 'contracts/event.schema.json'));
const agentSchema = load(join(root, 'contracts/agent.schema.json'));
const snapshotSchema = load(join(root, 'contracts/world-snapshot.schema.json'));
const agents = load(join(root, 'seed/agents.json'));
const protocolMd = readFileSync(join(root, 'contracts/protocol.md'), 'utf8');

// Sim's own sources (drift guards read these; the backend never modifies them)
const simSchemaV2 = load(join(simRoot, 'world/simulation/schema-v2.json'));
const simIslands = load(join(simRoot, 'world/islands.json'));
const simGenesis = load(join(simRoot, 'world/world.json'));

// --- minimal JSON-Schema validator (subset used by our schemas + schema-v2) ---
function jsType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}
function checkType(v, t) {
  if (Array.isArray(t)) return t.some((x) => checkType(v, x));
  switch (t) {
    case 'integer': return jsType(v) === 'integer';
    case 'number': return typeof v === 'number';
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: return typeof v === t;
  }
}
function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function validate(schema, value, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object') return errors;
  if (schema.not !== undefined && validate(schema.not, value, path, []).length === 0) {
    errors.push(`${path}: matched forbidden schema "not"`);
  }
  if (schema.type !== undefined && !checkType(value, schema.type)) {
    errors.push(`${path}: expected type ${JSON.stringify(schema.type)}, got ${jsType(value)}`);
    return errors;
  }
  if (schema.const !== undefined && !deepEq(value, schema.const)) {
    errors.push(`${path}: not equal to const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((e) => deepEq(e, value))) {
    errors.push(`${path}: value ${JSON.stringify(value)} not in enum`);
  }
  if (schema.anyOf && !schema.anyOf.some((s) => validate(s, value, path, []).length === 0)) {
    errors.push(`${path}: matched none of anyOf`);
  }
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${path}: does not match pattern ${schema.pattern}`);
  }
  if (schema.format === 'date-time' && typeof value === 'string' && Number.isNaN(Date.parse(value))) {
    errors.push(`${path}: not a valid date-time`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${path}: not above exclusiveMinimum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: fewer than minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: more than maxItems`);
    if (schema.items) value.forEach((it, i) => validate(schema.items, it, `${path}[${i}]`, errors));
  }
  if (checkType(value, 'object')) {
    for (const req of schema.required || []) {
      if (!(req in value)) errors.push(`${path}: missing required property "${req}"`);
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (k in value) validate(sub, value[k], `${path}.${k}`, errors);
    }
  }
  return errors;
}

// --- test harness ---
let pass = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`ok   - ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL - ${name}\n       ${String(e.message).split('\n').join('\n       ')}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const errs = (schema, v) => validate(schema, v);

// --- fixtures ---
const FROZEN_TYPES = [
  'world.genesis', 'world.tock', 'world.reseed', 'world.time_override', 'world.rejected_spawn',
  'agent.announced', 'agent.docking', 'agent.arrived', 'agent.admitted', 'agent.farewell',
  'agent.boarded', 'agent.departed', 'agent.trip_started', 'agent.trip_ended',
  'agent.activity_started', 'agent.activity_completed', 'agent.task_assigned',
  'agent.expression_changed', 'vessel.departed', 'vessel.docked',
];
// Payload shapes per contracts/protocol.md §2 (what engine.js emits today)
const PAYLOADS = {
  'world.genesis': { seed: 20260915, agents: 9, vessels: 3, islands_ref: 'world/islands.json', envelope: 'v1' },
  'world.tock': { residents: 9, vessels: 3 },
  'world.reseed': { old_seed: 20260915, new_seed: 987654321 },
  'world.time_override': { hour: 21.5 },
  'world.rejected_spawn': { id: 'mallory', reason: 'unknown-id-not-in-registry' },
  'agent.announced': { vessel: 'ferry-1', target_island: 'needle', kind: 'guest' },
  'agent.docking': { vessel: 'ferry-1', target_island: 'needle' },
  'agent.arrived': { island: 'needle' },
  'agent.admitted': { island: 'needle', home_island: 'needle', via: 'spawn-intent' },
  'agent.farewell': { island: 'needle' },
  'agent.boarded': { vessel: 'ferry-1', island: 'needle' },
  'agent.departed': { island: 'needle', contributions_kept: true },
  'agent.trip_started': { to: 'marquee', caused_by: 41 },
  'agent.trip_ended': { island: 'marquee', caused_by: 41 },
  'agent.activity_started': { verb: 'SCOUT', target: 'catalog', ends_tick: 500 },
  'agent.activity_completed': { verb: 'SCOUT', target: 'catalog', duration_ticks: 40, evidence_url: 'https://cumulativewebinc.github.io/cwi-learn/scout/' },
  'agent.task_assigned': { verb: 'TRAVEL', from: 'needle', to: 'marquee', reason: 'work-queue:SCOUT follow-up' },
  'agent.expression_changed': { from: 'working', to: 'celebrating', reason: 'activity_completed' },
  'vessel.departed': { vessel: 'ferry-1', from: 'ai-hub' },
  'vessel.docked': { vessel: 'ferry-1', at: 'needle' },
};
const ACTORS = {
  'world.genesis': null, 'world.tock': null, 'world.reseed': null,
  'world.time_override': null, 'world.rejected_spawn': null,
  'vessel.departed': null, 'vessel.docked': null,
};
let seq = 100;
const makeEvent = (type, over = {}) => {
  seq += 1;
  return {
    event_id: `evt_${String(seq).padStart(6, '0')}`,
    seq,
    tick: 720,
    ts: '2026-09-16T10:05:00.123Z',
    server_at: '2026-09-16T10:05:00.200Z',
    type,
    actor: type in ACTORS ? ACTORS[type] : 'needle',
    payload: PAYLOADS[type] || {},
    origin: type.startsWith('x.') ? 'adapter' : 'engine',
    sample: true,
    ...over,
  };
};

// --- schema documents ---
test('schemas parse as JSON with required keys', () => {
  for (const s of [eventSchema, agentSchema, snapshotSchema]) {
    assert(s.type === 'object' && s.title && s.properties && s.required, `bad schema: ${s.title}`);
    assert(typeof s.$id === 'string' && s.$id.startsWith('https://cumulativewebinc.github.io/ultimate/'), `$id wrong: ${s.$id}`);
  }
});

// --- seed registry ---
test('seed has exactly the 9 registry agents', () => {
  assert(Array.isArray(agents) && agents.length === 9, `expected 9 agents, got ${agents.length}`);
});

test('every seed agent validates against agent.schema.json', () => {
  for (const a of agents) {
    const e = errs(agentSchema, a);
    assert(e.length === 0, `${a.id || '?'}: ${e.join('; ')}`);
  }
});

test('seed: unique ids; kingcode chief claimed; 8 departments registered+unclaimed', () => {
  const ids = agents.map((a) => a.id);
  assert(new Set(ids).size === 9, 'duplicate id');
  const chief = agents.find((a) => a.id === 'kingcode');
  assert(chief && chief.kind === 'chief', 'kingcode must be kind=chief');
  assert(chief.home_island === 'ai-hub', 'kingcode home must be ai-hub');
  assert(chief.moltbook.registered === true && chief.moltbook.claimed === true, 'kingcode must be registered+claimed');
  const depts = agents.filter((a) => a.kind === 'department');
  assert(depts.length === 8, `expected 8 departments, got ${depts.length}`);
  assert(depts.every((a) => a.moltbook.registered === true && a.moltbook.claimed === false), 'departments: registered, unclaimed');
  assert(depts.every((a) => a.home_island === a.id), 'each department homes on its own island');
});

test('seed agent ids match the sim registry exactly (no translation layer)', () => {
  const simIndex = load(join(simRoot, 'agents/index.json'));
  const simIds = new Set([...simIndex.agents, simIndex.chief].filter(Boolean));
  const seedIds = new Set(agents.map((a) => a.id));
  assert(deepEq([...seedIds].sort(), [...simIds].sort()), `seed ${[...seedIds]} vs sim ${[...simIds]}`);
});

test('agent home_island enum matches the sim islands.json (drift guard)', () => {
  const simIslandIds = simIslands.islands.map((i) => i.id).sort();
  const enumIds = [...agentSchema.properties.home_island.enum].sort();
  assert(deepEq(enumIds, simIslandIds), `contract enum ${enumIds} vs sim ${simIslandIds}`);
});

test('seed capabilities are the home island work verbs', () => {
  const verbs = {};
  for (const i of simIslands.islands) verbs[i.id] = i.verbs;
  for (const a of agents) {
    assert(deepEq(a.capabilities, verbs[a.home_island]), `${a.id}: capabilities != island verbs`);
  }
});

// --- event schema ---
test('all 20 frozen engine event types validate (one fixture each)', () => {
  assert(FROZEN_TYPES.length === 20, `expected 20 frozen types, listed ${FROZEN_TYPES.length}`);
  for (const t of FROZEN_TYPES) {
    const e = errs(eventSchema, makeEvent(t));
    assert(e.length === 0, `${t}: ${e.join('; ')}`);
  }
});

test('event schema accepts extension types (x.* namespace)', () => {
  const e = errs(eventSchema, makeEvent('x.adapter.work_completed', {
    actor: 'ledger',
    payload: { work: 'playlist scan', evidence_url: 'https://example.com/scan' },
  }));
  assert(e.length === 0, e.join(';'));
});

test('event schema rejects: unknown type, bad seq, missing payload, bad origin, bad event_id', () => {
  const bad = (type, over) => errs(eventSchema, makeEvent(type, over)).length > 0;
  assert(bad('agent.danced'), 'unknown type accepted');
  assert(bad('X.adapter.work_completed'), 'uppercase x. accepted');
  assert(bad('world.tock', { seq: 0 }), 'seq 0 accepted');
  assert(bad('world.tock', { seq: -5 }), 'negative seq accepted');
  const noPayload = makeEvent('world.tock');
  delete noPayload.payload;
  assert(errs(eventSchema, noPayload).length > 0, 'missing payload accepted');
  assert(bad('world.tock', { origin: 'browser' }), 'bad origin accepted');
  assert(bad('world.tock', { event_id: 'nope' }), 'bad event_id accepted');
  assert(bad('world.tock', { ts: 'yesterday' }), 'bad ts accepted');
});

test('event type enum covers exactly the frozen 20 + x.* pattern (no extras, none missing)', () => {
  const anyOf = eventSchema.properties.type.anyOf;
  assert(Array.isArray(anyOf) && anyOf.length === 2, 'type must be anyOf [frozen enum, x.* pattern]');
  assert(deepEq([...anyOf[0].enum].sort(), [...FROZEN_TYPES].sort()), 'frozen enum drifted from FROZEN_TYPES');
  assert(new RegExp(anyOf[1].pattern).test('x.presence'), 'x.* pattern must accept x.presence');
  assert(!new RegExp(anyOf[1].pattern).test('agent.announced'), 'x.* pattern must not accept engine types');
});

// --- snapshot schema ---
test('snapshot wrapper fixture validates; wrapper requires mode/server_at/ledger_head/snapshot', () => {
  const good = {
    mode: 'live',
    server_at: '2026-09-16T10:05:00.200Z',
    ledger_head: 1042,
    snapshot: simGenesis,
  };
  assert(errs(snapshotSchema, good).length === 0, errs(snapshotSchema, good).join('; '));
  const badMode = { ...good, mode: 'live!' };
  assert(errs(snapshotSchema, badMode).length > 0, 'bad mode accepted');
  const noHead = { ...good };
  delete noHead.ledger_head;
  assert(errs(snapshotSchema, noHead).length > 0, 'missing ledger_head accepted');
});

test('snapshot subschema is deep-equal to the sim\u2019s own schema-v2.json (drift guard)', () => {
  const { description: _d, ...contractSnap } = snapshotSchema.properties.snapshot;
  const { $comment: _c, $id: _i, $schema: _s, ...simShape } = simSchemaV2;
  assert(deepEq(contractSnap, simShape), 'contract snapshot subschema drifted from the sim schema-v2.json');
});

test('committed genesis world.json validates against both the contract and the sim schema', () => {
  const e1 = validate(snapshotSchema.properties.snapshot, simGenesis);
  assert(e1.length === 0, `contract: ${e1.join('; ')}`);
  const e2 = validate(simSchemaV2, simGenesis);
  assert(e2.length === 0, `sim schema: ${e2.join('; ')}`);
  assert(simGenesis.schema_version === '2.0.0' && simGenesis.tick_hz === 2, 'genesis must be v2.0.0 @ 2Hz');
  assert(simGenesis.ledger_head === 1, 'genesis ledger_head must be 1 (seq 1 = world.genesis)');
  assert(!('ambient' in simGenesis), 'genesis must not carry ambient');
});

test('stripping the transport wrapper yields the sim document unchanged (byte-identity)', () => {
  const wrapped = { mode: 'sample', server_at: '2026-09-16T10:05:00.200Z', ledger_head: 1, snapshot: simGenesis };
  assert(errs(snapshotSchema, wrapped).length === 0, 'wrapped genesis must validate');
  assert(deepEq(wrapped.snapshot, simGenesis), 'snapshot must survive the wrapper untouched');
});

// --- sim envelope compatibility ---
test('backend event minus transport fields == sim envelope v1 {seq,tick,ts,type,actor,payload}', () => {
  const be = makeEvent('agent.activity_completed', { sample: false });
  assert(errs(eventSchema, be).length === 0, 'fixture must validate first');
  const { event_id: _e, server_at: _s, origin: _o, sample: _sa, ...envelope } = be;
  assert(deepEq(Object.keys(envelope).sort(), ['actor', 'payload', 'seq', 'tick', 'ts', 'type']),
    `envelope keys: ${Object.keys(envelope).sort()}`);
  // the sim's EventStore.append(tick, ts, type, actor, payload) path accepts exactly this shape
  assert(typeof envelope.seq === 'number' && envelope.seq >= 1, 'seq must be dense 1-based');
});

// --- truth contract ---
test('Phase-0 fixtures and seeds are marked sample/seed (never leak as live)', () => {
  assert(makeEvent('world.tock').sample === true, 'fixtures must be sample:true');
  assert(agents.every((a) => a.seed === true), 'all seed agents must carry seed:true');
});

test('protocol.md documents every frozen event type with its payload shape', () => {
  for (const t of FROZEN_TYPES) {
    assert(protocolMd.includes(`\`${t}\``), `protocol.md missing event type ${t}`);
  }
  for (const section of ['## 3. WebSocket frames', '## 8. Mode indicator', '## 5. Intents']) {
    assert(protocolMd.includes(section), `protocol.md missing ${section}`);
  }
});

// --- summary ---
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('FAILED:', failures.join(', '));
  process.exit(1);
}
