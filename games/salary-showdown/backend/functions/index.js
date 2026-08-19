// Callable exports accumulate here as tasks land.
import { initializeApp } from 'firebase-admin/app';
initializeApp();
export { createGame, createTeam, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby, setTimer, markDone, setRevealStep, renameTeam, releaseSeat } from './src/game.js';
