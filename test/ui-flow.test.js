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
  click() { return this.dispatch('click'); }
  remove() {}
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
  const legacyV2 = { ...createCampaign(content), version: 2, victories: 20, coins: 2000 };
  const storage = new Map([['northern-prisma.campaign.v1', JSON.stringify(legacy)], ['northern-prisma.campaign.v2', JSON.stringify(legacyV2)]]);
  let failWrite = false;
  const originals = Object.fromEntries(['document', 'window', 'localStorage', 'Option', 'fetch'].map(key => [key, globalThis[key]]));
  const originalRandom = Math.random;
  const originalCreateUrl = URL.createObjectURL, originalRevokeUrl = URL.revokeObjectURL;
  const downloads = [], blobs = new Map(), revoked = [];
  let allowConfirm = true;
  const confirmations = [];
  URL.createObjectURL = blob => { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; };
  URL.revokeObjectURL = url => revoked.push(url);
  t.after(() => { for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } Math.random = originalRandom; URL.createObjectURL = originalCreateUrl; URL.revokeObjectURL = originalRevokeUrl; });
  globalThis.document = { hidden: true, body: new Element('body'), getElementById: $, createElement: tag => {
    const node = new Element(tag);
    if (tag === 'a') node.click = () => downloads.push({ href: node.href, filename: node.download });
    return node;
  }, createTextNode: text => { const node = new Element(); node.textContent = text; return node; } };
  globalThis.window = { matchMedia: () => ({ matches: false }), scrollTo() {}, setTimeout: callback => callback(), confirm: message => { confirmations.push(message); return allowConfirm; } };
  globalThis.Option = class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } };
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (failWrite) throw new Error('Storage quota'); storage.set(key, value); } };
  globalThis.fetch = async path => ({ ok: true, json: async () => JSON.parse(await readFile(new URL(`..${path}`, import.meta.url), 'utf8')) });
  await import(`../src/ui/main.js?flow-test`);
  for (let index = 0; index < 100 && $('gacha-nav').disabled; index++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal($('gacha-nav').disabled, false, $('notice').textContent);
  const saved = () => JSON.parse(storage.get('northern-prisma.campaign.v3'));
  assert.equal(saved().version, 3);
  assert.equal(saved().coins, 2000);
  assert.equal(saved().unlockedCharacterIds.length, 6);
  assert.deepEqual(saved().party, ['arthur', 'iris', 'elaine', 'garrek']);
  assert.equal(JSON.parse(storage.get('northern-prisma.campaign.v1')).version, 1);
  assert.equal(JSON.parse(storage.get('northern-prisma.campaign.v2')).version, 2);
  assert.match($('notice').textContent, /save v2 sang v3/);
  const assertPage = name => {
    for (const page of ['preparation', 'inventory', 'battle', 'gacha']) {
      assert.equal($(`${page}-screen`).hidden, page !== name, `${page} visibility`);
      assert.equal($(`${page}-nav`).attributes['aria-current'], page === name ? 'page' : undefined);
    }
  };
  assertPage('preparation');
  assert.equal($('battle-nav').disabled, false); // Encounter selection is available before a battle exists.
  await $('inventory-nav').dispatch('click'); assertPage('inventory');
  assert.equal($('inventory-grid').children.length, 0);
  await $('inventory-change-character').dispatch('click'); assertPage('preparation');
  await $('battle-nav').dispatch('click'); assertPage('battle');
  assert.equal($('battle-session').hidden, true);
  assert.equal($('battle-placeholder').hidden, false);
  $('encounter').value = 'ogre_trial'; await $('encounter').dispatch('change');
  await $('preparation-nav').dispatch('click'); await $('battle-nav').dispatch('click');
  assert.equal($('encounter').value, 'ogre_trial');
  $('encounter').value = 'forest_patrol'; await $('encounter').dispatch('change');
  await $('preparation-nav').dispatch('click');
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
  await $('preparation-nav').dispatch('click');
  $('roster-ownership').value = ''; await $('roster-ownership').dispatch('change');
  const chooseHero = async id => {
    await $('preparation-nav').dispatch('click');
    await $('roster-grid').children.find(node => node.dataset.previewId === id).dispatch('click');
    await $('open-inventory').dispatch('click');
    assertPage('inventory');
    assert.match($('inventory-target').textContent, new RegExp(content.characters[id].name));
  };
  await chooseHero('arthur');
  assert.equal($('inventory-grid').children.length, 10);
  await $('equip-gear').dispatch('click');
  assert.deepEqual(saved().equipment, { arthur: ['gear_10', null, null] });
  assert.match($('preview-details').textContent, /HP 195/);
  assert.equal($('gear-slot-2').disabled, false);
  assert.equal($('gear-slot-3').disabled, true);
  await $('gear-slot-1').dispatch('click');
  await $('inventory-grid').children.find(node => node.dataset.gearId === 'gear_9').dispatch('click');
  await $('equip-gear').dispatch('click');
  assert.deepEqual(saved().equipment.arthur, ['gear_10', 'gear_9', null]);
  assert.match($('preview-details').textContent, /HP 200/);
  await $('unequip-gear').dispatch('click');
  assert.deepEqual(saved().equipment.arthur, ['gear_10', null, null]);
  await $('inventory-grid').children.find(node => node.dataset.gearId === 'gear_10').dispatch('click');
  await chooseHero('elaine');
  assert.match($('equip-gear').textContent, /Chuyển từ Arthur sang Elaine/);
  failWrite = true; await $('equip-gear').dispatch('click'); failWrite = false;
  assert.deepEqual(saved().equipment, { arthur: ['gear_10', null, null] });
  assert.match($('notice').textContent, /Storage quota/);
  await $('equip-gear').dispatch('click');
  assert.deepEqual(saved().equipment, { elaine: ['gear_10', null, null] });
  await $('inventory-grid').children.find(node => node.dataset.gearId === 'gear_9').dispatch('click');
  await $('equip-gear').dispatch('click');
  assert.deepEqual(saved().equipment, { elaine: ['gear_9', null, null] });
  $('inventory-status').value = 'free'; await $('inventory-status').dispatch('change');
  assert.equal($('inventory-grid').children.length, 9);
  await $('unequip-gear').dispatch('click');
  assert.deepEqual(saved().equipment, {});
  await $('equip-gear').dispatch('click');
  assert.deepEqual(saved().equipment, { elaine: ['gear_10', null, null] });
  assert.equal(saved().gear.length, 10);
  await $('preparation-nav').dispatch('click');
  await $('inventory-nav').dispatch('click'); assertPage('inventory');
  assert.equal($('inventory-status').value, 'free'); // Direct navigation preserves context and filters.
  await $('gacha-nav').dispatch('click');
  let randomIndex = 0; Math.random = () => [0.95, 0][randomIndex++ % 2];
  await $('pull-one').dispatch('click');
  assert.ok(saved().unlockedCharacterIds.includes('dain'));
  assert.equal(saved().coins, 900);
  await $('pull-one').dispatch('click');
  assert.equal(saved().recruitmentShards, 10);
  assert.deepEqual(saved().extraGearSlots, { dain: 1 });
  assert.match($('gacha-results').textContent, /Đã mở ô gear 4\/6/);
  await $('preparation-nav').dispatch('click'); await chooseHero('dain');
  assert.equal($('gear-slot-3').disabled, false);
  assert.equal($('gear-slot-4').disabled, true);
  await $('gear-slot-3').dispatch('click');
  await $('inventory-grid').children.find(node => node.dataset.gearId === 'gear_8').dispatch('click');
  await $('equip-gear').dispatch('click');
  assert.deepEqual(saved().equipment.dain, [null, null, null, 'gear_8']);
  await $('unequip-gear').dispatch('click');
  await $('gacha-nav').dispatch('click');
  assert.match($('gacha-results').textContent, /Đã sở hữu/);
  const previous = storage.get('northern-prisma.campaign.v3');
  failWrite = true; await $('pull-one').dispatch('click'); failWrite = false;
  assert.equal(storage.get('northern-prisma.campaign.v3'), previous);
  assert.match($('coin-balance').textContent, /800/);
  assert.match($('notice').textContent, /Storage quota/);
  const redeemSave = saved(); redeemSave.recruitmentShards = 100;
  storage.set('northern-prisma.campaign.v3', JSON.stringify(redeemSave));
  await $('load').dispatch('click');
  assert.equal($('gacha-screen').hidden, true);
  await $('gacha-nav').dispatch('click');
  $('recruit-character').value = 'aurora';
  await $('recruit').dispatch('click');
  assert.ok(saved().unlockedCharacterIds.includes('aurora'));
  assert.equal(saved().recruitmentShards, 0);
  assert.equal($('recruit').disabled, true);
  await $('preparation-nav').dispatch('click');
  await $('battle-nav').dispatch('click');
  await $('start').dispatch('click');
  assert.equal($('battle-screen').hidden, false);
  const elaineCard = () => $('allies').children.find(node => node.dataset.actorId === 'elaine');
  assert.match(elaineCard().textContent, /HP 150 \/ 150/);
  await $('preparation-nav').dispatch('click');
  await chooseHero('elaine');
  await $('unequip-gear').dispatch('click');
  assert.deepEqual(saved().equipment, {});
  assert.match($('preview-details').textContent, /HP 145/);
  await $('battle-nav').dispatch('click');
  assert.match(elaineCard().textContent, /HP 150 \/ 150/); // Existing battle snapshot stays equipped.
  for (let turn = 0; turn < 100 && !$('execute').disabled; turn++) await $('execute').dispatch('click');
  assert.match($('battle-result').textContent, /100 coin đã lưu/);
  assert.equal(saved().coins, 900);
  assert.equal(saved().victories, 21);
  await $('preparation-nav').dispatch('click'); await $('battle-nav').dispatch('click');
  assert.equal(saved().coins, 900); // Viewing the result again does not claim twice.
  await $('preparation-nav').dispatch('click');
  await $('export-save').dispatch('click');
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].filename, /northern-prisma-save-v3-.*\.json$/);
  const exportedText = await blobs.get(downloads[0].href).text();
  assert.deepEqual(JSON.parse(exportedText), saved());
  assert.deepEqual(revoked, [downloads[0].href]);
  // Keep an active battle to verify every rejected/cancelled import preserves it.
  await $('battle-nav').dispatch('click'); await $('start').dispatch('click'); await $('preparation-nav').dispatch('click');
  const beforeImport = storage.get('northern-prisma.campaign.v3');
  const currentBattleCards = $('allies').children;
  const importText = async text => {
    $('import-save-file').files = [{ size: new TextEncoder().encode(text).byteLength, text: async () => text }];
    await $('import-save-file').dispatch('change');
    assert.equal($('import-save-file').value, '');
    assert.equal($('preparation-screen').inert, false);
    assert.equal($('import-save').disabled, false);
  };
  const rejected = async text => {
    await importText(text);
    assert.equal(storage.get('northern-prisma.campaign.v3'), beforeImport);
    assert.equal($('allies').children, currentBattleCards);
    assert.equal($('battle-nav').disabled, false);
  };
  await rejected('{broken');
  assert.match($('notice').textContent, /Không nhập được save/);
  const incoming = { ...createCampaign(content), coins: 123 };
  allowConfirm = false; await rejected(JSON.stringify(incoming)); allowConfirm = true;
  assert.match($('notice').textContent, /Đã hủy/);
  failWrite = true; await rejected(JSON.stringify(incoming)); failWrite = false;
  assert.match($('notice').textContent, /Storage quota/);
  $('import-save-file').files = [{ size: 11 * 1024 * 1024, text: () => { throw new Error('Oversized file must not be read'); } }];
  await $('import-save-file').dispatch('change');
  assert.match($('notice').textContent, /10 MB/);
  assert.equal(storage.get('northern-prisma.campaign.v3'), beforeImport);
  await importText(JSON.stringify(incoming));
  assert.deepEqual(saved(), incoming); // Replace, never merge currencies/items/progression.
  assert.equal($('allies').children.length, 0);
  assert.equal($('battle-nav').disabled, false);
  await $('battle-nav').dispatch('click'); assertPage('battle');
  assert.equal($('battle-session').hidden, true);
  await $('preparation-nav').dispatch('click');
  assert.equal($('preparation-screen').hidden, false);
  assert.match(confirmations.at(-1), /123 coin/);
  assert.match($('coin-balance').textContent, /123/);
  assert.equal($('inventory-grid').children.length, 0);
  await importText(exportedText); // Restoring the exported file restores the complete previous campaign.
  assert.deepEqual(saved(), JSON.parse(exportedText));
});
