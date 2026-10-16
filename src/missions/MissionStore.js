// ============================================
// MISSION STORE
//
// The one shared MissionService for the app. Saves to the document folder
// (missions.json), using the same expo-file-system approach as the other
// local stores. Mission coin rewards go through ProgressManager, which is
// the existing coin balance.
// ============================================

import * as FileSystem from 'expo-file-system/legacy';

import progressManager from '../game/ProgressManager';
import { MissionService } from './MissionService';

const MISSIONS_PATH = () => `${FileSystem.documentDirectory}missions.json`;

const storage = {
  read: async () => {
    try {
      return await FileSystem.readAsStringAsync(MISSIONS_PATH());
    } catch {
      // No saved file yet, or unreadable. The service starts from defaults.
      return null;
    }
  },
  write: (text) => FileSystem.writeAsStringAsync(MISSIONS_PATH(), text),
};

const missionService = new MissionService({
  storage,
  credit: (claimKey, amount) => progressManager.creditOnce(claimKey, amount),
});

export default missionService;
