const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function setup({ admin = true, signedIn = true } = {}) {
  const docs = new Map();
  const objects = new Map();
  const queries = [];
  const user = { uid: 'admin-user', getIdTokenResult: async () => ({ claims: { admin } }) };
  const auth = { currentUser: signedIn ? user : null, authStateReady: async () => {} };
  let failWrite = false;
  const snapshot = (key) => {
    const data = docs.get(key);
    return { data: () => data };
  };
  const context = {
    window: { dispatchEvent() {} },
    CustomEvent: class {},
    console,
    crypto: { randomUUID: () => 'new-audio' },
    getApp: () => ({}),
    getAuth: () => auth,
    getFirestore: () => ({}),
    getStorage: () => ({}),
    collection: (_, ...parts) => parts.join('/'),
    doc: (_, ...parts) => parts.join('/'),
    query: (key, ...filters) => ({ key, filters }),
    where: (field, op, value) => ({ field, op, value }),
    getDocs: async (target) => {
      queries.push(target);
      const key = target.key || target;
      const entries = [...docs.entries()].filter(([name, data]) => name.startsWith(`${key}/`)
        && (!target.filters || target.filters.every((filter) => data[filter.field] === filter.value)));
      return { docs: entries.map(([name, data]) => ({ id: name.split('/').pop(), data: () => data })) };
    },
    getDoc: async (key) => snapshot(key),
    setDoc: async (key, data) => {
      if (failWrite) throw new Error('Write failed');
      docs.set(key, data);
    },
    updateDoc: async () => {},
    deleteDoc: async (key) => docs.delete(key),
    ref: (_, key) => key,
    getBlob: async (key) => {
      if (!objects.has(key)) throw new Error('Missing source audio');
      return objects.get(key);
    },
    getDownloadURL: async () => { throw new Error('Unexpected fallback'); },
    uploadBytes: async (key, bytes, metadata) => {
      assert.equal(metadata.contentType, 'audio/wav');
      objects.set(key, bytes);
    },
    deleteObject: async (key) => objects.delete(key)
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'hcmai-web', 'js', 'practice-cloud.js'), 'utf8')
    .replace(/import[\s\S]*?from '[^']+';/g, '');
  vm.runInNewContext(source, context);
  return {
    api: context.window.hcmaiCloudLoops, docs, objects, queries, auth,
    failWrite: () => { failWrite = true; }
  };
}

const youtube = {
  id: 'personal-one', name: 'Yaman phrase', videoId: 'K28eMxSMg6Q',
  startSeconds: 10, endSeconds: 20
};

test('legacy YouTube source becomes an independent ordered featured copy', async () => {
  const { api, docs } = setup();
  await api.setFeatured('3', youtube, 'signed-in', true);
  const featured = docs.get('featuredLoops/3');
  assert.equal(featured.sourceType, 'youtube');
  assert.equal(featured.sourceLoopId, youtube.id);
  assert.equal(featured.id, undefined);
  assert.equal(featured.createdBy, 'admin-user');
  assert.equal(featured.accessLevel, 'signed-in');
  assert.equal(featured.isPublished, true);
  assert.equal(docs.has('users/admin-user/practiceLoops/personal-one'), false);
});

test('featured audio is copied to its visibility-specific path, never shared from personal storage', async () => {
  for (const [access, published, visibility] of [
    ['public', true, 'public'], ['signed-in', true, 'signedin'], ['public', false, 'private']
  ]) {
    const { api, docs, objects } = setup();
    const audio = { ...youtube, sourceType: 'audio', audioPath: 'userLoops/admin-user/source.wav' };
    objects.set(audio.audioPath, 'original-bytes');
    objects.set('featuredLoops/public/2/old.wav', 'old-bytes');
    docs.set('featuredLoops/2', { audioPath: 'featuredLoops/public/2/old.wav' });
    await api.setFeatured('2', audio, access, published);
    const dest = `featuredLoops/${visibility}/2/new-audio.wav`;
    assert.equal(docs.get('featuredLoops/2').audioPath, dest);
    assert.equal(objects.get(dest), 'original-bytes');
    assert.equal(objects.get(audio.audioPath), 'original-bytes');
    assert.equal(objects.has('featuredLoops/public/2/old.wav'), false);
  }
});

test('failed featured document write removes only the newly uploaded audio', async () => {
  const { api, docs, objects, failWrite } = setup();
  const audio = { ...youtube, sourceType: 'audio', audioPath: 'userLoops/admin-user/source.wav' };
  objects.set(audio.audioPath, 'original');
  docs.set('featuredLoops/1', { name: 'Existing' });
  failWrite();
  await assert.rejects(api.setFeatured('1', audio, 'public', true), /Write failed/);
  assert.equal(objects.has('featuredLoops/public/1/new-audio.wav'), false);
  assert.equal(objects.get(audio.audioPath), 'original');
  assert.equal(docs.get('featuredLoops/1').name, 'Existing');
});

test('nonadmins, invalid slots, and invalid access levels cannot manage featured loops', async () => {
  await assert.rejects(setup({ admin: false }).api.setFeatured('1', youtube, 'public', true), /Administrator/);
  await assert.rejects(setup({ admin: false }).api.removeFeatured('1'), /Administrator/);
  for (const slot of ['0', '6', 'anything']) {
    await assert.rejects(setup().api.setFeatured(slot, youtube, 'public', true), /valid/);
  }
  await assert.rejects(setup().api.setFeatured('1', youtube, 'private', true), /valid/);
});

test('sign-in changes before the write do not commit a featured entry', async () => {
  const { api, docs, auth } = setup();
  auth.currentUser.getIdTokenResult = async () => {
    auth.currentUser = null;
    return { claims: { admin: true } };
  };
  await assert.rejects(api.setFeatured('1', youtube, 'public', true), /sign-in changed/);
  assert.equal(docs.size, 0);
});

test('guest and learner queries request only published accessible entries; admins include drafts', async () => {
  for (const [admin, signedIn, expected] of [
    [false, false, ['1']], [false, true, ['1', '2']], [true, true, ['1', '2', '3']]
  ]) {
    const { api, docs } = setup({ admin, signedIn });
    docs.set('featuredLoops/1', { accessLevel: 'public', isPublished: true });
    docs.set('featuredLoops/2', { accessLevel: 'signed-in', isPublished: true });
    docs.set('featuredLoops/3', { accessLevel: 'public', isPublished: false });
    const result = await api.featured();
    assert.equal(result.isAdmin, admin);
    assert.deepEqual(Array.from(result.loops, (loop) => loop.id), expected);
  }
});

test('clearing a featured slot preserves the personal source and removes its featured audio', async () => {
  const { api, docs, objects } = setup();
  docs.set('featuredLoops/4', { audioPath: 'featuredLoops/private/4/copy.wav' });
  objects.set('featuredLoops/private/4/copy.wav', 'copy');
  objects.set('userLoops/admin-user/original.wav', 'original');
  await api.removeFeatured('4');
  assert.equal(docs.has('featuredLoops/4'), false);
  assert.equal(objects.has('featuredLoops/private/4/copy.wav'), false);
  assert.equal(objects.get('userLoops/admin-user/original.wav'), 'original');
});
