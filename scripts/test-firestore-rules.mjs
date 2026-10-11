import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const testEnv = await initializeTestEnvironment({
  projectId: 'otonei-rules-test',
  firestore: { rules },
});

const favoritePath = ['users', 'user-a', 'favorites', 'netease%3A1'];
const validFavorite = {
  id: '1',
  source: 'netease',
  name: 'Test song',
  artist: 'Test artist',
  album: 'Test album',
  pic_id: null,
  lyric_id: null,
  modifiedAt: Date.now(),
};

try {
  const unauthenticatedDb = testEnv.unauthenticatedContext().firestore();
  const userADb = testEnv.authenticatedContext('user-a').firestore();
  const userBDb = testEnv.authenticatedContext('user-b').firestore();
  const favoriteRef = doc(userADb, ...favoritePath);

  await assertFails(getDoc(doc(unauthenticatedDb, ...favoritePath)));
  await assertSucceeds(setDoc(favoriteRef, validFavorite));
  await assertSucceeds(getDoc(favoriteRef));
  await assertFails(getDoc(doc(userBDb, ...favoritePath)));
  await assertFails(setDoc(favoriteRef, { ...validFavorite, name: 'x'.repeat(301) }));

  const userPath = ['users', 'user-a'];
  const userRef = doc(userADb, ...userPath);
  const validUser = { email: 'a@example.test', displayName: 'User A', createdAt: Date.now() };
  await assertSucceeds(setDoc(userRef, validUser));
  await assertSucceeds(getDoc(userRef));
  await assertFails(getDoc(doc(unauthenticatedDb, ...userPath)));
  await assertFails(getDoc(doc(userBDb, ...userPath)));
  await assertFails(setDoc(doc(userBDb, ...userPath), validUser));
  await assertFails(setDoc(userRef, { ...validUser, role: 'admin' }));
  await assertFails(setDoc(userRef, { ...validUser, displayName: 'x'.repeat(201) }));
  await assertFails(setDoc(userRef, { ...validUser, history: Array(101).fill({}) }));
  await assertFails(setDoc(userRef, { ...validUser, favorites: Array(501).fill({}) }));

  const historyPath = ['users', 'user-a', 'history', 'entry-1'];
  const historyRef = doc(userADb, ...historyPath);
  const { modifiedAt: _modifiedAt, ...song } = validFavorite;
  const validHistory = { song, timestamp: Date.now() };
  await assertSucceeds(setDoc(historyRef, validHistory));
  await assertSucceeds(getDoc(historyRef));
  await assertFails(getDoc(doc(unauthenticatedDb, ...historyPath)));
  await assertFails(getDoc(doc(userBDb, ...historyPath)));
  await assertFails(setDoc(doc(userBDb, ...historyPath), validHistory));
  await assertFails(setDoc(historyRef, { ...validHistory, timestamp: 'today' }));
  await assertFails(setDoc(historyRef, { ...validHistory, song: { ...song, source: 'fake' } }));
  await assertFails(
    setDoc(historyRef, { ...validHistory, song: { ...song, token: 'unexpected' } })
  );
  await assertFails(setDoc(historyRef, { ...validHistory, token: 'unexpected' }));

  // The new revision metadata is optional for legacy clients, but server time
  // cannot be forged by a device with a clock far in the future.
  await assertSucceeds(
    setDoc(favoriteRef, {
      ...validFavorite,
      cloudRevision: 1,
      syncedAt: serverTimestamp(),
    })
  );
  await assertFails(setDoc(favoriteRef, validFavorite));
  await assertFails(
    setDoc(favoriteRef, {
      ...validFavorite,
      cloudRevision: 1,
      syncedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(
    setDoc(favoriteRef, {
      ...validFavorite,
      cloudRevision: 2,
      syncedAt: serverTimestamp(),
    })
  );
  await assertFails(setDoc(favoriteRef, { ...validFavorite, cloudRevision: 0 }));
  await assertFails(setDoc(favoriteRef, { ...validFavorite, syncedAt: new Date(0) }));
  await assertSucceeds(
    setDoc(historyRef, {
      ...validHistory,
      cloudRevision: 1,
      syncedAt: serverTimestamp(),
    })
  );
  await assertFails(setDoc(historyRef, validHistory));
  await assertSucceeds(
    setDoc(historyRef, {
      ...validHistory,
      cloudRevision: 2,
      syncedAt: serverTimestamp(),
    })
  );
  await assertFails(setDoc(historyRef, { ...validHistory, cloudRevision: '1' }));
  await assertFails(setDoc(historyRef, { ...validHistory, syncedAt: new Date(0) }));

  console.log('Firestore rules behavior OK');
} finally {
  await testEnv.cleanup();
}
