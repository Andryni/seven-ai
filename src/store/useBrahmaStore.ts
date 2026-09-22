/**
 * Compatibility re-export. The canonical store lives in `useSevenStore`.
 * Existing external imports of `useBrahmaStore` keep working.
 */
export {
  useSevenStore,
  useSevenStore as useBrahmaStore,
} from './useSevenStore';
