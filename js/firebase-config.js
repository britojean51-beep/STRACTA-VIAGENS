/* ============================================================
   GP2T · Configuração do Firebase
   ------------------------------------------------------------
   Projeto: gp2t-gestaodefrota

   ⚠️ O LOGIN AINDA ESTÁ DESLIGADO (última linha = null).
   Motivo: as regras do Firestore só deixam um GESTOR criar usuários,
   e o primeiro gestor precisa ser criado à mão no painel do Firebase
   (Authentication → Users + coleção "usuarios" no Firestore).
   Ligar o login antes disso trancaria todo mundo para fora.

   PARA LIGAR quando o primeiro gestor existir, troque a última linha por:
       const FIREBASE_CONFIG = CONFIG_GP2T;

   Estes dados são públicos por natureza (todo site que usa Firebase os
   expõe). Quem protege são as REGRAS do Firestore e a senha de cada um.
   ============================================================ */
const CONFIG_GP2T = {
  apiKey: "AIzaSyCppDcUQSkDCOBZIs1BHA1WMEWoBeboFyc",
  authDomain: "gp2t-gestaodefrota.firebaseapp.com",
  projectId: "gp2t-gestaodefrota",
  storageBucket: "gp2t-gestaodefrota.firebasestorage.app",
  messagingSenderId: "694947636114",
  appId: "1:694947636114:web:fb3ad18214afdb22f3174b"
};

/* Troque para CONFIG_GP2T quando o primeiro gestor estiver criado. */
const FIREBASE_CONFIG = null;
