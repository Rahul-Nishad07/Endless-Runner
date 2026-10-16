// ============================================
// DISTANCE MILESTONES
//
// Pure logic. index.tsx checks each frame's distance change and
// shows banners for milestones crossed in that step.
// ============================================

// Rewards are off by default. Turn this on to grant the reward coins
// listed below as each milestone is crossed.
export const MILESTONE_REWARDS_ENABLED = false;

// Thresholds are in meters and must be ascending.
export const MILESTONES = [
  { distance: 500, message: 'Great Start!', reward: 25 },
  { distance: 1000, message: 'Keep Running!', reward: 50 },
  { distance: 2000, message: 'Amazing Run!', reward: 75 },
  { distance: 3000, message: 'Expert Territory!', reward: 100 },
  { distance: 4000, message: 'Unstoppable!', reward: 150 },
];

export function createMilestoneTracker() {
  return { nextIndex: 0 };
}

/**
 * Returns the milestones crossed when distance moves from
 * previousDistance to currentDistance. Each milestone is returned
 * once per tracker, even if a single step passes several of them.
 */
export function collectCrossedMilestones(
  tracker,
  previousDistance,
  currentDistance
) {
  const crossed = [];

  while (
    tracker.nextIndex < MILESTONES.length &&
    currentDistance >= MILESTONES[tracker.nextIndex].distance
  ) {
    const milestone = MILESTONES[tracker.nextIndex];

    if (previousDistance < milestone.distance) {
      crossed.push(milestone);
    }

    tracker.nextIndex++;
  }

  return crossed;
}
