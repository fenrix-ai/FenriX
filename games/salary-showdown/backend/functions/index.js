// Callable exports accumulate here as tasks land.
import { initializeApp } from 'firebase-admin/app';
initializeApp();
export { createGame, joinGame, startSeason, advancePhase } from './src/game.js';
