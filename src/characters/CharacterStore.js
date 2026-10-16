// ============================================
// CHARACTER STORE
//
// The one shared CharacterService for the app. It saves to the document
// folder (characters.json), using the same expo-file-system approach as the
// other local stores. Coins come from the existing balance in
// ProgressManager, so there is no second wallet.
// ============================================

import * as FileSystem from 'expo-file-system/legacy';

import progressManager from '../game/ProgressManager';
import { MODEL_SETS } from './CharacterModels';
import { CharacterService } from './CharacterService';

const CHARACTERS_PATH = () => `${FileSystem.documentDirectory}characters.json`;

const storage = {
  read: async () => {
    try {
      return await FileSystem.readAsStringAsync(CHARACTERS_PATH());
    } catch {
      // No saved file yet, or unreadable. The service starts with the default.
      return null;
    }
  },
  write: (text) => FileSystem.writeAsStringAsync(CHARACTERS_PATH(), text),
};

// The existing coin balance, as the character service sees it.
const wallet = {
  getBalance: () => progressManager.getBalance(),
  debit: (key, amount) => progressManager.debitOnce(key, amount),
  undebit: (key, amount) => progressManager.undebitOnce(key, amount),
  isSpent: (key) => progressManager.isSpent(key),
};

const characterService = new CharacterService({
  storage,
  wallet,
  modelSets: MODEL_SETS,
});

export default characterService;
