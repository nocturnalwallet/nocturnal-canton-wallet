export {
  localStore,
  setNetworkPrefix,
  setUserScope,
  hasUserScope,
  getStorageScope,
  ensureUserScope,
  runStorageInit,
  whenStorageReady,
  migrateUnprefixedData,
  migrateToUserScoped,
} from './local';
export { sessionStore } from './session';
export { networkStore } from './network';
export type { LocalStorageSchema } from './local';
export type { SessionStorageSchema } from './session';
export type * from './schemas';
