// Callable exports accumulate here as tasks land.
import { initializeApp } from 'firebase-admin/app';
initializeApp();
export { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby, setTimer } from './src/game.js';
