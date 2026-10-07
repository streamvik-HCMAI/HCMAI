import { getApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  collection,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {
  deleteObject,
  getBlob,
  getStorage,
  ref,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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
    return getBlob(ref(storage, loop.audioPath));
  }
};

window.dispatchEvent(new CustomEvent('hcmai-cloud-loops-ready'));
