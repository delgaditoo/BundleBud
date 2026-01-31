/**
 * @typedef {Object} HistoryOperation
 * @property {string} id
 * @property {number} ts
 * @property {"move"|"rename"|"create-folder"|"archive"|"restore"|"trash"|"test"} type
 * @property {string|null} beforePath
 * @property {string|null} afterPath
 * @property {Object} [meta]
 */
export {};
