import { ownsCharacter } from './ownership.js';

export function isValidParty(party, characters) {
  if (!Array.isArray(party) || party.length < 1 || party.length > 4) return false;
  if (!party.every(id => id === null || (typeof id === 'string' && Object.hasOwn(characters, id)))) return false;
  const members = party.filter(id => id !== null);
  return members.length > 0 && new Set(members).size === members.length;
}

export function partySlots(party) {
  return Array.from({ length: 4 }, (_, index) => party[index] ?? null);
}

function requireSlot(index) {
  if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('Vị trí đội hình không hợp lệ.');
}

// Assigning an existing member swaps slots rather than duplicating the character.
export function assignPartySlot(party, index, characterId, campaign) {
  requireSlot(index);
  if (typeof characterId !== 'string' || !characterId) throw new Error('Nhân vật không hợp lệ.');
  if (campaign && !ownsCharacter(campaign, characterId)) throw new Error('Nhân vật chưa mở khóa.');
  const slots = partySlots(party);
  const previous = slots.indexOf(characterId);
  if (previous === index) return slots;
  if (previous >= 0) slots[previous] = slots[index];
  slots[index] = characterId;
  return slots;
}

export function removePartySlot(party, index) {
  requireSlot(index);
  const slots = partySlots(party);
  if (slots[index] && slots.filter(Boolean).length === 1) throw new Error('Đội hình cần ít nhất một nhân vật.');
  slots[index] = null;
  return slots;
}
