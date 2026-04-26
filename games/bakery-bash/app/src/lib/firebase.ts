import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "bakery-bash-54d12",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

let functionsInstance: Functions | null = null;

export function getFunctionsInstance(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app);
  }
  return functionsInstance;
}

export async function callJoinGame(joinCode: string, displayName: string) {
  const fn = httpsCallable(getFunctionsInstance(), "joinGame");
  return fn({ joinCode, displayName });
}

export async function callSubmitDecision(data: {
  gameId: string;
  menu: Record<string, boolean>;
  productPrices: Record<string, number>;
  quantities: Record<string, number>;
  staffCount: number;
  adSpend?: number;
  adType?: string;
  chefBid?: { skillLevel: number; amount: number };
}) {
  const fn = httpsCallable(getFunctionsInstance(), "submitDecision");
  return fn(data);
}

export async function callStartGame(gameId: string) {
  const fn = httpsCallable(getFunctionsInstance(), "startGame");
  return fn({ gameId });
}

export async function callAdvanceGamePhase(gameId: string) {
  const fn = httpsCallable(getFunctionsInstance(), "advanceGamePhase");
  return fn({ gameId });
}

export async function callGetTeamsInLobby(gameId: string) {
  const fn = httpsCallable(getFunctionsInstance(), "getTeamsInLobby");
  return fn({ gameId });
}

export async function callCreateTeam(data: {
  gameId: string;
  teamName: string;
  displayName: string;
}) {
  const fn = httpsCallable(getFunctionsInstance(), "createTeam");
  return fn(data);
}

export async function callSetTeamRole(data: {
  gameId: string;
  teamId: string;
  role: string;
}) {
  const fn = httpsCallable(getFunctionsInstance(), "setTeamRole");
  return fn(data);
}

export async function callLayoffChef(data: {
  gameId: string;
  chefId: string;
}) {
  const fn = httpsCallable(getFunctionsInstance(), "layoffChef");
  return fn(data);
}

export async function callContinueFromRoster(data: { gameId: string }) {
  const fn = httpsCallable(getFunctionsInstance(), "continueFromRoster");
  return fn(data);
}

export async function callGetConclusion(gameId: string) {
  const fn = httpsCallable(getFunctionsInstance(), "getConclusion");
  return fn({ gameId });
}
