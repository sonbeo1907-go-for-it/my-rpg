import { deserializeCampaign, serializeCampaign } from './progression.js';

export const MAX_SAVE_FILE_BYTES = 10 * 1024 * 1024;

function checkSize(text) {
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_FILE_BYTES) throw new Error('File save vượt giới hạn 10 MB.');
}

export function parseSaveImport(text, content) {
  if (typeof text !== 'string') throw new Error('Nội dung file save không hợp lệ.');
  checkSize(text);
  return deserializeCampaign(text.replace(/^\uFEFF/, ''), content);
}

export function createSaveExport(campaign, content, now = new Date()) {
  // Export only campaign fields, validated against current content. No battle/UI state.
  const normalized = deserializeCampaign(serializeCampaign(campaign), content);
  const text = JSON.stringify(JSON.parse(serializeCampaign(normalized)), null, 2);
  checkSize(text);
  return {
    filename: `northern-prisma-save-v${normalized.version}-${now.toISOString().replace(/[:.]/g, '-')}.json`,
    text
  };
}
