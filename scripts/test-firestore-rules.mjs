import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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

  console.log('Firestore rules behavior OK');
} finally {
  await testEnv.cleanup();
}
