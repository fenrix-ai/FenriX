#!/usr/bin/env node
// Quick game-state inspection: prints game.phase, players, teams.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'bakery-bash-54d12' });
const db = getFirestore();

const GAME_ID = process.argv[2] || 'v5-final';

(async () => {
  const g = await db.collection('games').doc(GAME_ID).get();
  if (!g.exists) { console.log(`Game ${GAME_ID} does not exist.`); return; }
  console.log(`Game ${GAME_ID}:`);
  console.log(`  joinCode      = ${g.get('joinCode')}`);
  console.log(`  phase         = ${g.get('phase')}`);
  console.log(`  currentRound  = ${g.get('currentRound')}`);
  console.log(`  paused        = ${g.get('paused')}`);
  console.log(`  professorUid  = ${g.get('professorUid') || g.get('professorId')}`);
  const players = await db.collection('games').doc(GAME_ID).collection('players').get();
  console.log(`\nPlayers (${players.size}):`);
  for (const p of players.docs) {
    console.log(`  ${p.id}: name="${p.get('displayName')}" team=${p.get('teamId')} role=${p.get('role')} chefs=${(p.get('specialtyChefs') || []).length} rosterCompleted=${p.get('rosterCompleted')}`);
  }
  const teams = await db.collection('games').doc(GAME_ID).collection('teams').get();
  console.log(`\nTeams (${teams.size}):`);
  for (const t of teams.docs) {
    console.log(`  ${t.id}: name="${t.get('name')}" roleAssignments=${JSON.stringify(t.get('roleAssignments'))}`);
  }
})();
