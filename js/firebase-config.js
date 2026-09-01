/* ============================================================
   GP2T · Configuração do Firebase
   ------------------------------------------------------------
   Projeto: gp2t-gestaodefrota

   Com esta configuração preenchida, o app EXIGE login.
   Para desligar o login numa emergência, apague o bloco abaixo e
   deixe apenas:  const FIREBASE_CONFIG = nulo;   (trocando "nulo"
   pela palavra null em inglês).

   Estes dados são públicos por natureza (todo site que usa Firebase
   os expõe). Quem protege é a REGRA do Firestore + a senha de cada um.
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCppDcUQSkDCOBZIs1BHA1WMEWoBeboFyc",
  authDomain: "gp2t-gestaodefrota.firebaseapp.com",
  projectId: "gp2t-gestaodefrota",
  storageBucket: "gp2t-gestaodefrota.firebasestorage.app",
  messagingSenderId: "694947636114",
  appId: "1:694947636114:web:fb3ad18214afdb22f3174b"
};
