import { collection, getDocs, getFirestore, query, where } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const db = getFirestore();

export async function fetchAccessibleRaags(user) {
  const claims = user ? await user.getIdTokenResult() : null;
  const isAdmin = claims?.claims.admin === true;
  const raagQuery = isAdmin
    ? collection(db, 'raags')
    : query(collection(db, 'raags'), where('isPublished', '==', true));
  const snapshot = await getDocs(raagQuery);
  const raags = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  raags.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  return { raags, isAdmin };
}