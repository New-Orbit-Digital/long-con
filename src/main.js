// Boots the game and starts the loop. Built in Unit 4.
import { TUNING } from './tuning.js';
import { createRun } from './sim.js';

export const state = createRun(Date.now() >>> 0, TUNING);
