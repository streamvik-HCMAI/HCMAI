const developmentConfig = {
  apiKey: 'AIzaSyAg-fwv_6hVjkCG1fovvDpMtNze7e8rIh4',
  authDomain: 'hcmai-dev.firebaseapp.com',
  projectId: 'hcmai-dev',
  storageBucket: 'hcmai-dev.firebasestorage.app',
  messagingSenderId: '257430405760',
  appId: '1:257430405760:web:0b40bf3ea569825d4fdc65'
};

const productionConfig = {
  apiKey: 'AIzaSyCmc-LFqeqBnuiGV0l3oPhpMIC8Qv0b3LU',
  authDomain: 'hcmai-v3e0h9.firebaseapp.com',
  projectId: 'hcmai-v3e0h9',
  storageBucket: 'hcmai-v3e0h9.firebasestorage.app',
  messagingSenderId: '885235463396'
};

const host = window.location.hostname;
const isDevelopmentHost = host === 'localhost'
  || host === '127.0.0.1'
  || host.endsWith('.local')
  || host === 'hcmai-dev.web.app'
  || host === 'hcmai-dev.firebaseapp.com';

export const firebaseEnvironment = isDevelopmentHost ? 'development' : 'production';
export const firebaseConfig = isDevelopmentHost ? developmentConfig : productionConfig;