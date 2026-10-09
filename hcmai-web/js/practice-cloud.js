import { getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  collection,
  query,
  where,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {
  deleteObject,
  getBlob,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
storage.maxOperationRetryTime = 20000;
storage.maxUploadRetryTime = 60000;

async function fetchStoredAudio(storageInstance, path) {
  try {
    return await getBlob(ref(storageInstance, path));
  } catch (sdkError) {
    console.warn('Storage SDK download failed; retrying with a direct request.', sdkError);
    const url = await getDownloadURL(ref(storageInstance, path));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Audio download failed (${response.status}).`);
    return response.blob();
  }
}

const requireUid = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to use saved loops.');
  return uid;
};

const loopCollection = (uid) => collection(db, 'users', uid, 'practiceLoops');
const audioPathFor = (uid, loopId) => `userLoops/${uid}/${loopId}.wav`;

window.hcmaiCloudLoops = {
  async featured() {
    await auth.authStateReady();
    const user = auth.currentUser;
    const isAdmin = Boolean(user && (await user.getIdTokenResult()).claims.admin === true);
    const entries = collection(db, 'featuredLoops');
    const snapshots = isAdmin
      ? [await getDocs(entries)]
      : await Promise.all((user ? ['public', 'signed-in'] : ['public']).map((level) =>
        getDocs(query(entries, where('isPublished', '==', true), where('accessLevel', '==', level)))));
    return { isAdmin, loops: snapshots.flatMap((snapshot) =>
      snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id })))
      .sort((left, right) => Number(left.id) - Number(right.id)) };
  },

  async setFeatured(slot, source, accessLevel, isPublished) {
    const uid = requireUid();
    if (!(await auth.currentUser.getIdTokenResult()).claims.admin) throw new Error('Administrator access is required.');
    if (!['1', '2', '3', '4', '5'].includes(slot) || !['public', 'signed-in'].includes(accessLevel)) {
      throw new Error('Choose a valid featured slot and access level.');
    }
    const target = doc(db, 'featuredLoops', slot);
    const previous = await getDoc(target);
    const data = {
      ...source, sourceType: source.sourceType === 'audio' ? 'audio' : 'youtube',
      sourceLoopId: source.id, createdBy: uid, accessLevel, isPublished
    };
    delete data.id;
    let uploadedPath = '';
    try {
      if (data.sourceType === 'audio') {
        const visibility = !isPublished ? 'private' : accessLevel === 'public' ? 'public' : 'signedin';
        uploadedPath = `featuredLoops/${visibility}/${slot}/${crypto.randomUUID()}.wav`;
        const blob = await fetchStoredAudio(storage, source.audioPath);
        await uploadBytes(ref(storage, uploadedPath), blob, { contentType: 'audio/wav' });
        data.audioPath = uploadedPath;
      }
      if (auth.currentUser?.uid !== uid) throw new Error('Your sign-in changed. Try again.');
      await setDoc(target, data);
    } catch (error) {
      if (uploadedPath) {
        try { await deleteObject(ref(storage, uploadedPath)); }
        catch (cleanupError) { console.error('Unable to clean up featured audio.', cleanupError); }
      }
      throw error;
    }
    const previousPath = previous.data()?.audioPath;
    if (previousPath && previousPath !== data.audioPath) {
      try { await deleteObject(ref(storage, previousPath)); }
      catch (error) {
        if (error.code !== 'storage/object-not-found') throw new Error(`Featured loop saved, but its previous audio could not be removed: ${error.message}`);
      }
    }
  },

  async removeFeatured(slot) {
    if (!(await auth.currentUser?.getIdTokenResult())?.claims.admin) throw new Error('Administrator access is required.');
    const target = doc(db, 'featuredLoops', slot);
    const snapshot = await getDoc(target);
    await deleteDoc(target);
    if (snapshot.data()?.audioPath) {
      try { await deleteObject(ref(storage, snapshot.data().audioPath)); }
      catch (error) {
        if (error.code !== 'storage/object-not-found') throw new Error(`Featured loop removed, but its audio could not be removed: ${error.message}`);
      }
    }
  },

  async list() {
    const uid = requireUid();
    const snapshot = await getDocs(loopCollection(uid));
    return snapshot.docs
      .map((loopDoc) => ({ ...loopDoc.data(), id: loopDoc.id }))
      .sort((left, right) => (right.lastPracticedAt || right.updatedAt || 0) - (left.lastPracticedAt || left.updatedAt || 0));
  },

  async save(loop, audioBlob = null) {
    const uid = requireUid();
    const data = { ...loop };
    if (audioBlob) {
      data.audioPath = audioPathFor(uid, loop.id);
      data.audioBytes = audioBlob.size;
      await uploadBytes(ref(storage, data.audioPath), audioBlob, { contentType: 'audio/wav' });
    }
    await setDoc(doc(loopCollection(uid), loop.id), data);
    return data;
  },

  async touch(loopId, lastPracticedAt) {
    await updateDoc(doc(loopCollection(requireUid()), loopId), { lastPracticedAt });
  },

  async remove(loop) {
    const uid = requireUid();
    if (loop.audioPath) {
      try {
        await deleteObject(ref(storage, loop.audioPath));
      } catch (error) {
        if (error?.code !== 'storage/object-not-found') throw error;
      }
    }
    await deleteDoc(doc(loopCollection(uid), loop.id));
  },

  getAudioBlob(loop) {
    return fetchStoredAudio(storage, loop.audioPath);
  },

  getAudioUrl(loop) {
    return getDownloadURL(ref(storage, loop.audioPath));
  },

  async getRaagLoop(raagId, loopId) {
    await auth.authStateReady();
    const snapshot = await getDoc(doc(db, 'raags', raagId, 'practiceLoops', loopId));
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
  }
};

window.dispatchEvent(new CustomEvent('hcmai-cloud-loops-ready'));
