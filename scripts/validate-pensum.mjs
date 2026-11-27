#!/usr/bin/env node
// Checks the pensum data in data/pensums/*.json:
//  - every course/slot/group points to a known category
//  - each semester's items add up to its printed credits, and each route to the total
//  - every requirement code is a known course, group option or external requirement
//  - groups, emphases and slot kinds reference things that exist
//  - there are no prerequisite cycles
// Usage: node scripts/validate-pensum.mjs [file ...]
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCodes } from '../src/core/requirements.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'pensums');
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter(f => f.endsWith('.json')).map(f => join(dir, f));

let failures = 0;
for (const file of files) {
  const p = JSON.parse(readFileSync(file, 'utf8'));
  const errors = [], warnings = [];
  const cats = new Set(p.categories.map(c => c.id));
  const groups = p.groups || {};
  const courses = p.courses || {};
  const external = p.external || {};
  const groupOptions = new Set(Object.values(groups).flatMap(g => g.options));
  const known = code => code in courses || code in external || groupOptions.has(code);

  for (const [code, c] of Object.entries(courses)) {
    if (!/^[A-Z]{4}\d{4}$/.test(code)) errors.push(`course key ${code} is not a code like MATE1203`);
    if (!cats.has(c.cat)) errors.push(`${code}: unknown category ${c.cat}`);
    if (!(c.credits > 0)) errors.push(`${code}: credits must be > 0`);
    for (const k of ['req', 'coreq']) for (const ref of listCodes(c[k], groups)) {
      if (!known(ref) && !(ref in groups)) errors.push(`${code}.${k}: unknown code ${ref}`);
    }
  }
  for (const [id, g] of Object.entries(groups)) {
    for (const o of g.options) if (!(o in courses) && !(o in external)) warnings.push(`group ${id}: option ${o} has no name (it will show its code until sections load)`);
    for (const k of ['req', 'coreq']) for (const ref of listCodes(g[k], groups)) if (!known(ref)) errors.push(`group ${id}.${k}: unknown code ${ref}`);
  }
  for (const e of p.emphases || []) for (const code of [e.required, ...e.electives]) if (!(code in courses)) errors.push(`emphasis ${e.id}: unknown course ${code}`);

  for (const route of p.routes) {
    let total = 0;
    route.semesters.forEach((s, i) => {
      let sum = 0;
      for (const it of s.items) {
        if (typeof it === 'string') {
          if (!(it in courses)) errors.push(`${route.id} sem ${i + 1}: unknown course ${it}`);
          else sum += courses[it].credits;
        } else if (it.slot) {
          if (!p.slotKinds?.[it.slot]) errors.push(`${route.id} sem ${i + 1}: unknown slot kind ${it.slot}`);
          if (!cats.has(it.cat)) errors.push(`${route.id} sem ${i + 1}: slot "${it.label}" unknown category ${it.cat}`);
          for (const c of it.cats || []) if (!cats.has(c)) errors.push(`${route.id} sem ${i + 1}: slot "${it.label}" unknown category ${c}`);
          sum += it.credits;
        } else if (it.group) {
          if (!groups[it.group]) errors.push(`${route.id} sem ${i + 1}: unknown group ${it.group}`);
          if (!cats.has(it.cat)) errors.push(`${route.id} sem ${i + 1}: group ${it.group} unknown category ${it.cat}`);
          sum += it.credits;
        } else errors.push(`${route.id} sem ${i + 1}: item without code, slot or group`);
      }
      if (sum !== s.credits) errors.push(`${route.id} sem ${i + 1}: items add up to ${sum}, printed ${s.credits}`);
      total += s.credits;
    });
    if (total !== p.totalCredits) errors.push(`${route.id}: semesters add up to ${total}, total is ${p.totalCredits}`);
    for (const a of route.assumed || []) if (!known(a)) errors.push(`${route.id}: assumed ${a} is unknown`);
  }

  // Prerequisite cycles (corequisites may point at each other, so only `req`).
  const state = {};
  const visit = (code, path) => {
    if (state[code] === 2) return;
    if (state[code] === 1) { errors.push(`prerequisite cycle: ${[...path, code].join(' → ')}`); return; }
    state[code] = 1;
    for (const ref of listCodes(courses[code]?.req, groups)) if (ref in courses) visit(ref, [...path, code]);
    state[code] = 2;
  };
  Object.keys(courses).forEach(c => visit(c, []));

  const name = file.split('/').pop();
  if (errors.length) { failures++; console.log(`✗ ${name}`); errors.forEach(e => console.log(`   error: ${e}`)); }
  else console.log(`✓ ${name} — ${p.program} ${p.version}: ${p.routes.length} ruta(s), ${Object.keys(courses).length} cursos, ${p.totalCredits} créditos`);
  warnings.forEach(w => console.log(`   note: ${w}`));
}
process.exit(failures ? 1 : 0);
