import { ownsCharacter } from './ownership.js';
import { validateGear } from './economy.js';
import { gearSlotCapacity, assertValidSlotUnlocks } from './gear-slots.js';

export function gearLocation(campaign, gearId) {
  for (const [characterId, slots] of Object.entries(campaign.equipment ?? {})) {
    const slot = slots.indexOf(gearId);
    if (slot >= 0) return { characterId, slot };
  }
  return null;
}

export function gearOwner(campaign, gearId) {
  return gearLocation(campaign, gearId)?.characterId ?? null;
}

export function equipmentSlots(campaign, content, characterId) {
  return Array.from({ length: gearSlotCapacity(campaign, content, characterId) }, (_, index) => campaign.equipment?.[characterId]?.[index] ?? null);
}

export function assertValidEquipment(campaign, content) {
  assertValidSlotUnlocks(campaign, content);
  const equipment = campaign.equipment ?? {};
  if (typeof equipment !== 'object' || Array.isArray(equipment) || campaign.equipment === null) throw new Error('Dữ liệu trang bị không hợp lệ.');
  const used = new Set();
  for (const [characterId, slots] of Object.entries(equipment)) {
    if (!Object.hasOwn(content.characters, characterId) || !ownsCharacter(campaign, characterId)) throw new Error('Trang bị thuộc nhân vật chưa mở khóa hoặc không tồn tại.');
    if (!Array.isArray(slots) || !slots.length || slots.length > gearSlotCapacity(campaign, content, characterId)) throw new Error('Số ô trang bị không hợp lệ.');
    for (const gearId of slots) {
      if (gearId === null) continue;
      const gear = campaign.gear.find(item => item.id === gearId);
      if (typeof gearId !== 'string' || !gear || !validateGear(gear, content)) throw new Error('Trang bị tham chiếu gear không hợp lệ.');
      if (used.has(gearId)) throw new Error('Một gear không thể xuất hiện trong hai ô trang bị.');
      used.add(gearId);
    }
  }
}

export function equippedGear(campaign, characterId) {
  return (campaign.equipment?.[characterId] ?? []).filter(Boolean).map(id => {
    const gear = campaign.gear.find(item => item.id === id);
    if (!gear) throw new Error('Không tìm thấy gear đã trang bị.');
    return gear;
  });
}

function requireSlot(campaign, content, characterId, slot) {
  if (!Object.hasOwn(content.characters, characterId) || !ownsCharacter(campaign, characterId)) throw new Error('Chỉ có thể trang bị cho nhân vật đã mở khóa.');
  assertValidEquipment(campaign, content);
  if (!Number.isInteger(slot) || slot < 0 || slot >= gearSlotCapacity(campaign, content, characterId)) throw new Error('Ô trang bị chưa mở hoặc không hợp lệ.');
}

function saveSlots(campaign, characterId, slots) {
  if (slots.some(Boolean)) campaign.equipment[characterId] = slots;
  else delete campaign.equipment[characterId];
}

// Transfers/moves release the source slot. Replacing returns the target piece to inventory.
export function equipGear(campaign, content, characterId, gearId, slot = 0) {
  requireSlot(campaign, content, characterId, slot);
  const gear = campaign.gear.find(item => item.id === gearId);
  if (!gear || !validateGear(gear, content)) throw new Error('Gear không tồn tại hoặc không hợp lệ.');
  const location = gearLocation(campaign, gearId);
  if (location?.characterId === characterId && location.slot === slot) return campaign;
  const next = structuredClone(campaign);
  next.equipment ??= {};
  if (location) {
    const source = equipmentSlots(next, content, location.characterId);
    source[location.slot] = null;
    saveSlots(next, location.characterId, source);
  }
  const target = equipmentSlots(next, content, characterId);
  target[slot] = gearId;
  saveSlots(next, characterId, target);
  return next;
}

export function unequipGear(campaign, content, characterId, slot = 0) {
  requireSlot(campaign, content, characterId, slot);
  const slots = equipmentSlots(campaign, content, characterId);
  if (!slots[slot]) return campaign;
  const next = structuredClone(campaign);
  slots[slot] = null;
  saveSlots(next, characterId, slots);
  return next;
}
