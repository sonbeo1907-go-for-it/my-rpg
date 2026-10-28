import { equipGear, unequipGear, gearOwner, gearLocation, equippedGear, equipmentSlots } from '../core/equipment.js';
import { gearSlotCapacity } from '../core/gear-slots.js';
import { ownsCharacter } from '../core/ownership.js';
import { resolveCharacter } from '../core/progression.js';
import { economyRules } from '../core/economy.js';

const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const number = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);

export function gearDescription(gear, content) {
  const names = economyRules(content).gearStats;
  return Object.entries(gear.stats).map(([key, value]) => `${names.find(item => item.stat === key).label} +${value}`).join(' · ');
}

export function gearName(gear, content) {
  return `${content.gearTypes[gear.typeId].name} · #${gear.id.slice(5)}`;
}

export function createInventoryMenu({ content, getCampaign, getCharacterId, commit, onChange, onChooseCharacter }) {
  const $ = id => document.getElementById(id);
  let selectedGearId = null;
  let selectedSlot = 0;
  let selectedCharacterId = null;
  const stats = economyRules(content).gearStats;
  for (const type of Object.values(content.gearTypes)) $('inventory-tier').append(new Option(type.name, type.id));
  for (const stat of stats) $('inventory-stat').append(new Option(stat.label, stat.stat));

  function transact(operation, message) {
    try { commit(operation()); onChange(message); }
    catch (error) { onChange(`Không thể đổi trang bị: ${error.message}`); }
  }

  function comparison(before, after) {
    const table = make('table', 'equipment-comparison');
    const head = make('thead');
    const row = make('tr');
    for (const title of ['Chỉ số', 'Hiện tại', 'Sau đổi', 'Chênh lệch']) row.append(make('th', '', title));
    head.append(row);
    const body = make('tbody');
    for (const { stat, label } of stats) {
      const delta = after.stats[stat] - before.stats[stat];
      const row = make('tr');
      row.append(make('th', '', label), make('td', '', number(before.stats[stat])), make('td', '', number(after.stats[stat])), make('td', delta > 0 ? 'stat-up' : delta < 0 ? 'stat-down' : '', `${delta > 0 ? '+' : ''}${number(delta)}`));
      body.append(row);
    }
    table.append(head, body);
    return table;
  }

  function renderDetails(campaign, characterId, gear) {
    const panel = $('inventory-details');
    const actor = resolveCharacter(content, campaign, characterId);
    const capacity = gearSlotCapacity(campaign, content, characterId);
    const slots = equipmentSlots(campaign, content, characterId);
    const current = campaign.gear.find(item => item.id === slots[selectedSlot]);
    const owned = ownsCharacter(campaign, characterId);
    const currentBlock = make('div', 'equipped-summary');
    currentBlock.append(make('h4', '', `${actor.name} · ${equippedGear(campaign, characterId).length}/${capacity} ô đang dùng`));
    const slotGrid = make('div', 'gear-slot-grid');
    const rules = economyRules(content);
    for (let index = 0; index < rules.maxGearSlots; index++) {
      const item = campaign.gear.find(entry => entry.id === slots[index]);
      const locked = index >= capacity;
      const button = make('button', 'gear-slot', locked ? `🔒 Ô ${index + 1} · Cần thêm ${index - capacity + 1} dupe` : `Ô ${index + 1} · ${item ? `${gearName(item, content)} · ${gearDescription(item, content)}` : 'Trống'}`);
      button.id = `gear-slot-${index}`;
      button.disabled = !owned || locked;
      button.setAttribute('aria-pressed', String(index === selectedSlot));
      button.addEventListener('click', () => { selectedSlot = index; render(); document.getElementById(`gear-slot-${index}`).focus({ preventScroll: true }); });
      slotGrid.append(button);
    }
    currentBlock.append(slotGrid, make('p', '', `Đang chọn ô ${selectedSlot + 1}: ${current ? `${gearName(current, content)} · ${gearDescription(current, content)}` : 'Trống'}`));
    const remove = make('button', '', `Tháo gear ô ${selectedSlot + 1}`);
    remove.id = 'unequip-gear';
    remove.disabled = !owned || !current;
    remove.addEventListener('click', () => transact(() => unequipGear(getCampaign(), content, characterId, selectedSlot), `Đã tháo gear ô ${selectedSlot + 1} của ${actor.name} và lưu. Áp dụng ở trận mới.`));
    currentBlock.append(remove);
    panel.replaceChildren(currentBlock);
    if (!owned) {
      panel.append(make('p', 'muted', 'Nhân vật chưa mở khóa. Bạn vẫn có thể xem gear; hãy chiêu mộ để trang bị.'));
      return;
    }
    if (!gear) {
      panel.append(make('p', 'muted', campaign.gear.length ? 'Chọn một món gear bên trái để so sánh chỉ số.' : 'Túi đồ đang trống. Gear nhận được từ Chiêu mộ sẽ xuất hiện tại đây.'));
      if (current) panel.append(make('p', 'comparison-label', 'Nếu tháo gear ở ô đã chọn'), comparison(actor, resolveCharacter(content, unequipGear(campaign, content, characterId, selectedSlot), characterId)));
      return;
    }
    const location = gearLocation(campaign, gear.id);
    const owner = location?.characterId;
    const alreadyEquipped = owner === characterId && location.slot === selectedSlot;
    panel.append(make('h4', '', gearName(gear, content)), make('p', 'gear-stats', gearDescription(gear, content)));
    if (owner && !alreadyEquipped) panel.append(make('p', 'transfer-note', `Đang ở ô ${location.slot + 1} của ${content.characters[owner].name}. Chuyển món này sẽ để trống ô cũ; gear tại ô ${selectedSlot + 1} của ${actor.name} trở lại túi đồ.`));
    const candidate = alreadyEquipped ? unequipGear(campaign, content, characterId, selectedSlot) : equipGear(campaign, content, characterId, gear.id, selectedSlot);
    panel.append(make('p', 'comparison-label', alreadyEquipped ? 'Nếu tháo gear này' : `Nếu trang bị vào ô ${selectedSlot + 1}`), comparison(actor, resolveCharacter(content, candidate, characterId)));
    const equip = make('button', 'primary', alreadyEquipped ? 'Đang trang bị ở ô này' : owner ? `Chuyển từ ${content.characters[owner].name} sang ${actor.name} · Ô ${selectedSlot + 1}` : `Trang bị cho ${actor.name} · Ô ${selectedSlot + 1}`);
    equip.id = 'equip-gear';
    equip.disabled = alreadyEquipped;
    equip.addEventListener('click', () => transact(() => equipGear(getCampaign(), content, characterId, gear.id, selectedSlot), `Đã trang bị ${gearName(gear, content)} vào ô ${selectedSlot + 1} của ${actor.name} và lưu. Áp dụng ở trận mới.`));
    panel.append(equip, make('p', 'preview-note', 'So sánh đã tính nội tại. Chỉ số gear được cộng trước nội tại và buff theo %. Thay đổi được tự lưu, áp dụng vào preview và trận mới.'));
  }

  function render() {
    const campaign = getCampaign();
    const characterId = getCharacterId();
    if (selectedCharacterId !== characterId || selectedSlot >= gearSlotCapacity(campaign, content, characterId)) selectedSlot = 0;
    selectedCharacterId = characterId;
    const tier = $('inventory-tier').value;
    const stat = $('inventory-stat').value;
    const status = $('inventory-status').value;
    const filtered = [...campaign.gear].reverse().filter(gear => (!tier || gear.typeId === tier)
      && (!stat || Object.hasOwn(gear.stats, stat))
      && (!status || Boolean(gearOwner(campaign, gear.id)) === (status === 'equipped')));
    // Never retain an invisible selection after filtering or loading another save.
    if (!filtered.some(gear => gear.id === selectedGearId)) selectedGearId = filtered[0]?.id ?? null;
    $('inventory-count').textContent = `${filtered.length} / ${campaign.gear.length} gear`;
    $('inventory-target').textContent = `Đang chuẩn bị cho ${content.characters[characterId].name}: ${gearSlotCapacity(campaign, content, characterId)}/${economyRules(content).maxGearSlots} ô gear đã mở. Chọn ô bên phải, rồi chọn gear để trang bị. Mỗi dupe mở thêm 1 ô cho chính nhân vật đó.`;
    $('inventory-empty').textContent = campaign.gear.length ? 'Không có gear phù hợp bộ lọc.' : 'Chưa có gear. Quay tại Chiêu mộ để nhận trang bị.';
    $('inventory-empty').hidden = filtered.length > 0;
    const grid = $('inventory-grid');
    const previousScroll = grid.scrollTop;
    grid.replaceChildren(...filtered.map(gear => {
      const owner = gearOwner(campaign, gear.id);
      const button = make('button', 'inventory-item');
      button.dataset.gearId = gear.id;
      button.setAttribute('aria-pressed', String(selectedGearId === gear.id));
      button.setAttribute('aria-controls', 'inventory-details');
      button.append(make('strong', '', gearName(gear, content)), make('span', 'gear-stats', gearDescription(gear, content)), make('small', '', owner ? `Đang dùng: ${content.characters[owner].name}` : 'Chưa trang bị'));
      button.addEventListener('click', () => {
        selectedGearId = gear.id;
        render();
        [...grid.children].find(item => item.dataset.gearId === gear.id)?.focus({ preventScroll: true });
      });
      return button;
    }));
    grid.scrollTop = previousScroll;
    renderDetails(campaign, characterId, filtered.find(gear => gear.id === selectedGearId));
  }
  for (const id of ['inventory-tier', 'inventory-stat', 'inventory-status']) $(id).addEventListener('change', render);
  $('inventory-change-character').addEventListener('click', () => onChooseCharacter());
  return { render };
}
