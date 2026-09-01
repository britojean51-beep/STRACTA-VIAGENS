/* ============================================================
   GP2T · Configuração do Firebase
   ------------------------------------------------------------
   Cole aqui o bloco que o Firebase mostra em:
   Configurações do projeto → Seus apps → App da Web → Configuração

   ENQUANTO ESTIVER VAZIO, o app funciona SEM login (como antes).
   Assim nada para de funcionar enquanto o projeto é criado.

   Exemplo de como fica preenchido:
   const FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "gp2t-gestaodefrota.firebaseapp.com",
     projectId: "gp2t-gestaodefrota",
     storageBucket: "gp2t-gestaodefrota.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };

   Observação: esses dados são públicos por natureza (todo site que usa
   Firebase os expõe). Quem protege os dados são as REGRAS do Firestore
   e o login — por isso as regras em firebase/regras-firestore.txt.
   ============================================================ */
const FIREBASE_CONFIG = null;
