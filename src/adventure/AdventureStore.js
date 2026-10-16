// ============================================
// ADVENTURE STORE
//
// The one shared AdventureService for the app. Saves to the document folder
// (adventure.json), using the same expo-file-system approach as the other
// local stores. Level coin rewards go through ProgressManager, which is the
// existing coin balance.
// ============================================

import * as FileSystem from 'expo-file-system/legacy';

import progressManager from '../game/ProgressManager';
import { AdventureService } from './AdventureService';

// Each signed-in account has its own save file. Guest play uses the original
// adventure.json, so progress saved before accounts existed is kept.
let currentOwner = 'guest';

const ADVENTURE_PATH = () =>
  currentOwner === 'guest'
    ? `${FileSystem.documentDirectory}adventure.json`
    : `${FileSystem.documentDirectory}adventure_${currentOwner}.json`;

/**
 * Loads the progress for the signed-in Google user, or the guest profile
 * when nobody is signed in. Called whenever the sign-in state changes.
 */
export function setAdventureUser(userId) {
  const owner = userId ? String(userId).replace(/[^A-Za-z0-9_-]/g, '_') : 'guest';

  if (owner === currentOwner) return;

  currentOwner = owner;
  adventureService.reset(owner);
  adventureService.load();
}

const storage = {
  read: async () => {
    try {
      return await FileSystem.readAsStringAsync(ADVENTURE_PATH());
    } catch {
      // No saved file yet, or unreadable. The service starts from defaults.
      return null;
    }
  },
  write: (text) => FileSystem.writeAsStringAsync(ADVENTURE_PATH(), text),
};

const adventureService = new AdventureService({
  storage,
  credit: (key, amount) => progressManager.creditOnce(key, amount),
  isClaimed: (key) => progressManager.isClaimed(key),
});

export default adventureService;
