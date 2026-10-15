import type { Firestore } from "@google-cloud/firestore";
import type { FirestoreLike } from "./cache.js";
// Compile-time check: the real client must satisfy the cache's interface.
export const assertFirestoreCompat = (db: Firestore): FirestoreLike => db;
