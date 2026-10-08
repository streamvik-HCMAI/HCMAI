import { getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  collection,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {
  deleteObject,
  getBlob,
  getDownloadURL,
  getStorage,
  ref,
  setMaxDownloadRetryTime,
  setMaxOperationRetryTime,
  setMaxUploadRetryTime,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
setMaxDownloadRetryTime(storage, 20000);
setMaxUploadRetryTime(storage, 60000);
setMaxOperationRetryTime(storage, 20000);

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
