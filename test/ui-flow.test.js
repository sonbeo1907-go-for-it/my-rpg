import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadContent } from '../scripts/load-content.mjs';
import { createCampaign } from '../src/core/progression.js';

// Small DOM adapter for interaction tests, not a browser/layout substitute.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {};
    this.dataset = {}; this.style = {}; this.disabled = false; this.hidden = false; this.scrollTop = 0;
    this._text = ''; this._value = undefined;
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  get value() { return this._value ?? (this.tagName === 'select' ? this.children[0]?.value ?? '' : ''); }
  set value(value) { this._value = String(value); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; this._text = ''; if (this.tagName === 'select') this._value = undefined; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, callback) { (this.listeners[name] ??= []).push(callback); }
  async dispatch(name) { if (this.disabled && name === 'click') return; for (const callback of this.listeners[name] ?? []) await callback({ target: this }); }
  focus() {}
  scrollIntoView() {}
}

test('UI migrates a legacy save, blocks locked assignment, switches screens and persists gacha atomically', async t => {
  const content = await loadContent();
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const elements = new Map();
  for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const node = new Element(match[1]); node.id = match[3];
    node.hidden = /\bhidden\b/.test(match[2]); node.disabled = /\bdisabled\b/.test(match[2]);
    elements.set(node.id, node);
  }
  for (const match of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    for (const option of match[2].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)) {
      const node = new Element('option'); node.value = option[1]; node.textContent = option[2];
      elements.get(match[1]).append(node);
    }
  }
  const find = (node, id) => node.id === id ? node : node.children.map(child => find(child, id)).find(Boolean);
  const $ = id => elements.get(id) ?? [...elements.values()].map(node => find(node, id)).find(Boolean);
  const legacy = { ...createCampaign(content), version: 1, victories: 20, party: ['freya'] };
  const storage = new Map([['northern-prisma.campaign.v1', JSON.stringify(legacy)]]);
  let failWrite = false;
  const originals = Object.fromEntries(['document', 'window', 'localStorage', 'Option', 'fetch'].map(key => [key, globalThis[key]]));
  const originalRandom = Math.random;
  t.after(() => { for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } Math.random = originalRandom; });
  globalThis.document = { hidden: true, getElementById: $, createElement: tag => new Element(tag), createTextNode: text => { const node = new Element(); node.textContent = text; return node; } };
  globalThis.window = { matchMedia: () => ({ matches: false }), scrollTo() {}, confirm: () => true };
  globalThis.Option = class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } };
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (failWrite) throw new Error('Storage quota'); storage.set(key, value); } };
  globalThis.fetch = async path => ({ ok: true, json: async () => JSON.parse(await readFile(new URL(`..${path}`, import.meta.url), 'utf8')) });
  await import(`../src/ui/main.js?flow-test`);
  for (let index = 0; index < 100 && $('gacha-nav').disabled; index++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal($('gacha-nav').disabled, false, $('notice').textContent);
  const saved = () => JSON.parse(storage.get('northern-prisma.campaign.v2'));
  assert.equal(saved().version, 2);
  assert.equal(saved().coins, 2000);
  assert.equal(saved().unlockedCharacterIds.length, 6);
  assert.deepEqual(saved().party, ['arthur', 'iris', 'elaine', 'garrek']);
  assert.equal(JSON.parse(storage.get('northern-prisma.campaign.v1')).version, 1);
  const aurora = $('roster-grid').children.find(node => node.dataset.previewId === 'aurora');
  await aurora.dispatch('click');
  assert.equal($('assign-character').disabled, true);
  assert.match($('preview-details').textContent, /Aurora/);
  $('roster-ownership').value = 'locked'; await $('roster-ownership').dispatch('change');
  assert.equal($('roster-grid').children.length, 10);
  await $('gacha-nav').dispatch('click');
  assert.equal($('gacha-screen').hidden, false);
  assert.equal($('preparation-screen').hidden, true);
  assert.equal($('battle-screen').hidden, true);
  Math.random = () => 0;
  await $('pull-ten').dispatch('click');
  assert.equal(saved().coins, 1000);
  assert.equal(saved().gear.length, 10);
  assert.equal($('gacha-results').children.length, 10);
  assert.equal($('pull-ten').disabled, false); // Exactly 1000 is sufficient.
  let randomIndex = 0; Math.random = () => [0.95, 0][randomIndex++ % 2];
  await $('pull-one').dispatch('click');
  assert.ok(saved().unlockedCharacterIds.includes('dain'));
  assert.equal(saved().coins, 900);
  await $('pull-one').dispatch('click');
  assert.equal(saved().recruitmentShards, 10);
  assert.match($('gacha-results').textContent, /Đã sở hữu/);
  const previous = storage.get('northern-prisma.campaign.v2');
  failWrite = true; await $('pull-one').dispatch('click'); failWrite = false;
  assert.equal(storage.get('northern-prisma.campaign.v2'), previous);
  assert.match($('coin-balance').textContent, /800/);
  assert.match($('notice').textContent, /Storage quota/);
  const redeemSave = saved(); redeemSave.recruitmentShards = 100;
  storage.set('northern-prisma.campaign.v2', JSON.stringify(redeemSave));
  await $('load').dispatch('click');
  assert.equal($('gacha-screen').hidden, true);
  await $('gacha-nav').dispatch('click');
  $('recruit-character').value = 'aurora';
  await $('recruit').dispatch('click');
  assert.ok(saved().unlockedCharacterIds.includes('aurora'));
  assert.equal(saved().recruitmentShards, 0);
  assert.equal($('recruit').disabled, true);
  await $('preparation-nav').dispatch('click');
  await $('start').dispatch('click');
  assert.equal($('battle-screen').hidden, false);
  for (let turn = 0; turn < 100 && !$('execute').disabled; turn++) await $('execute').dispatch('click');
  assert.match($('battle-result').textContent, /100 coin đã lưu/);
  assert.equal(saved().coins, 900);
  assert.equal(saved().victories, 21);
  await $('preparation-nav').dispatch('click'); await $('battle-nav').dispatch('click');
  assert.equal(saved().coins, 900); // Viewing the result again does not claim twice.
});
