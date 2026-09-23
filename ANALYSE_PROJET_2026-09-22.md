# Analyse complète — SEVEN AI (v3.2.0)

Audit du 22/09/2026 : lecture intégrale du code (≈14 700 lignes app/src),
`tsc --noEmit`, `eslint .`, `npm test` (47 tests), build web (`expo start --web`),
et lecture de la doc interne (`README.md`, `AMELIORATIONS_SEVEN_AI.md`).

## ✅ Ce qui va bien (base saine)
- **0 erreur TypeScript, 0 erreur ESLint, 47/47 tests Jest** — le code est propre et discipliné.
- Architecture claire : `app/` (écrans Expo Router), `src/core` (agents), `src/services`
  (intégrations), `src/store` (Zustand + persistance fichier), `src/theme` (design system).
- Un vrai design system : 3 palettes × dark/light, typographie à 3 rôles nommés
  (Orbitron/Rajdhani/JetBrains Mono) au lieu du `monospace` générique.
- Le `README.md` est honnête (rare) : une "matrice honnêteté" liste précisément ce qui est
  réel vs simulé — bonne pratique à garder.
- Secrets sensibles (clé Gemini, Fish Audio, ElevenLabs) stockés via `expo-secure-store`,
  pas en clair dans le store JSON — correct.

## 🐞 Ce qui ne va pas

### 1. Dette technique / code mort
- **`src/core/gideonHeadScene.ts` (1024 lignes) + `src/components/GideonHead3D.tsx`** :
  une tête 3D WebGL entièrement développée, testée, mais **jamais branchée** dans l'app
  (abandonnée au profit de l'avatar SVG vectoriel). Ça alourdit le bundle, complique la
  maintenance et peut dérouter un futur contributeur. À supprimer ou déplacer dans une
  branche/archive si vous voulez la garder "au cas où".
- **`openRouterKey`** : champ présent dans le store, les types et l'écran Réglages, avec un
  badge "ACTIVE/OPTIONAL" dans `ConnectorCard`, mais **jamais lu par aucun agent**
  (`grep` sur `src/core` et `src/services` ne trouve aucun usage). Fonctionnalité fantôme :
  l'utilisateur peut saisir une clé qui ne sert à rien.
- **`useBrahmaStore.ts`** : ré-export de compatibilité vide, plus aucun import ailleurs —
  reliquat du rebranding Ultron/Brahma → Seven, à retirer.

### 2. Modèle Gemini mal référencé
- Le code appelle `getGenerativeModel({ model: 'gemini-3.6-flash' })` dans 5 fichiers
  (`sevenAgent.ts`, `daveAgent.ts` ×2, `selfHealing.ts`, `researchService.ts`).
  `gemini-3.6-flash` est un nom de modèle très récent (2026) — si la clé de l'utilisateur ou
  la version de l'API ne l'expose pas encore, **tout l'agent tombe en silence sur le fallback
  par mots‑clés** sans message d'erreur clair pour l'utilisateur. À sécuriser avec un
  fallback explicite de modèle (ex. essayer `gemini-2.5-flash` si le premier échoue) et un
  message diagnostiqué dans les logs/Terminal.
- Le SDK **`@google/generative-ai` est officiellement déprécié** par Google (fin de vie
  annoncée, remplacé par `@google/genai`). Le projet tourne encore dessus (v0.21, alors que
  0.24.1 est disponible) — migration à prévoir avant que l'API legacy ne casse.

### 3. Pas de rendu Markdown dans le chat
- `ChatBubble.tsx` affiche `message.text` en `<Text>` brut. Gemini répond très souvent en
  Markdown (`**gras**`, listes `- `, blocs de code ```` ``` ````). Aujourd'hui ces symboles
  s'affichent **littéralement** à l'utilisateur au lieu d'être stylés. C'est le genre de
  détail qui casse immédiatement l'illusion "assistant premium".

### 4. Performance liste
- Aucun `FlatList`/`SectionList` dans tout le projet : `chat.tsx`, `history.tsx`,
  `organizer.tsx` utilisent des `ScrollView` classiques pour des listes qui peuvent grandir
  (historique de conversation, fichiers organisés, sessions). Sans virtualisation, une
  conversation longue ou un gros dossier `Downloads` va ralentir le rendu, surtout sur
  Android bas de gamme (cible du projet).

### 5. Modèles gonflés / composants monolithiques
- `src/core/sevenAgent.ts` (1293 lignes), `daveAgent.ts` (1172), `GideonAvatar.tsx` (1410),
  `gideonHeadScene.ts` (1024, mort). Ce sont des fichiers très volumineux qui gagneraient à
  être découpés (ex : séparer les déclarations d'outils Gemini, l'exécution des outils, et
  le pipeline "Director" dans 3 modules).

### 6. Accessibilité quasi absente
- Seulement 15 occurrences de `accessibilityLabel/Role/accessible` dans tout le projet, et
  9 `hitSlop`/`activeOpacity` — pour une appli avec beaucoup d'icônes seules (lucide-react-native)
  sans texte, un lecteur d'écran (TalkBack) ne pourra quasiment rien annoncer. À corriger pour
  viser le Play Store sérieusement (accessibilité = critère de qualité Google Play).

### 7. Onboarding et "wizard" très longs
- `app/onboarding.tsx` fait 1186 lignes / 4 étapes obligatoires (nom, clé Gemini, voix, thème)
  avant de pouvoir toucher à l'app. Sans clé Gemini, l'utilisateur reste sur du fallback
  keyword-matching assez pauvre. Il n'y a pas de mode "essai rapide" sans configuration.

### 8. Dépendances vieillissantes
- `npm outdated` : `@google/generative-ai` (0.21→0.24, deprecated), `react-native` (0.86.3→0.87.1),
  `expo` reste figé sur SDK 57, `eslint` 8 (EOL, la 9/10 existe). Rien de critique aujourd'hui,
  mais à planifier — surtout la migration Gemini SDK avant qu'elle casse en prod.

### 9. Pas de CI/CD ni de garde-fous
- Aucun `.github/workflows` : personne ne fait tourner `tsc`/`eslint`/`jest` automatiquement
  sur les PR. Le projet est actuellement propre, mais rien n'empêche une régression silencieuse
  au prochain commit.

## 💡 Ce qui manque pour rendre le projet vraiment unique

### Fonctionnalités
1. **Rendu Markdown + coloration syntaxique** dans le chat (gras, listes, blocs de code avec
   bouton "copier le code") — gain visuel immédiat et gratuit.
2. **Vision multimodale réellement branchée dans le chat** : `expo-image-picker` est déjà une
   dépendance et `analyzeImage`/vision existent dans le type/agent, mais vérifiez que
   l'utilisateur peut *facilement* joindre une photo dans la conversation (bouton caméra
   visible) et obtenir une réponse Gemini Vision — c'est un argument de vente fort face aux
   assistants texte-only.
3. **Widgets dashboard connectés à de vraies données** : plusieurs modules (météo, batterie
   dans le "morning briefing") restent des placeholders honnêtement documentés — les rendre
   réels (API météo gratuite type Open-Meteo, pas de clé requise) rendrait le "briefing du
   matin" vraiment utile plutôt que décoratif.
4. **Recherche web plus robuste** : `webSearchService` dépend de l'API Instant Answer de
   DuckDuckGo, qui renvoie souvent des résultats pauvres/vides pour des requêtes factuelles
   normales (elle n'est pas faite pour du search général). Passer par le tool `search_web` de
   Gemini (grounding natif) ou une API de recherche dédiée (Brave Search API, gratuite jusqu'à
   un quota) donnerait des réponses beaucoup plus fiables.
5. **Widgets/raccourcis Android natifs** (App Widget / Quick Settings tile) pour incarner le
   côté "JARVIS toujours là" au-delà de l'app elle-même — actuellement tout est dans l'app.
6. **Export/partage plus riche** : le chat sait copier/partager du texte, mais pas exporter
   une conversation entière en PDF/Markdown comme le fait déjà le module Research — cohérence
   à étendre.
7. **Table de bord de télémétrie honnête → réelle** : CPU/RAM restent simulés faute d'API RN
   publique ; un module natif léger (`react-native-device-info` a des métriques réelles côté
   mémoire) rapprocherait la promesse JARVIS de la réalité, sinon garder le tag `[SIM]` est
   la bonne solution actuelle mais mérite d'être assumé dans le marketing.
8. **Mode "sans clé" plus généreux** : proposer un modèle local ou une clé Gemini gratuite
   d'essai fournie par l'app (avec quota) pour que le premier lancement montre tout de suite
   le potentiel réel, plutôt que de forcer l'utilisateur à créer un compte Google AI Studio
   avant de voir quoi que ce soit d'impressionnant.

### Design
1. **Animation de la tête Gideon très travaillée mais seule au monde** : l'avatar SVG est
   soigné (micro-expressions, visèmes, éclairage) — dommage qu'il reste cantonné au dashboard.
   L'amener en overlay pendant le chat vocal plein écran (mode "Iron Man call") renforcerait
   l'identité visuelle unique du produit.
2. **Densité d'icônes vs texte** : beaucoup de boutons sont icône seule sans libellé visible
   (voir accessibilité ci-dessus) — un mode "libellés visibles" activable dans les réglages
   aiderait à la fois la lisibilité et l'accessibilité.
3. **États de chargement uniformes** : `TypingDots`/`ScanBar` existent dans `ChatBubble` mais
   ne semblent pas réutilisés ailleurs (Organizer, Research, Dave) — un système de "loading
   states" unique renforcerait la cohérence "un seul OS" plutôt que "plusieurs écrans
   assemblés".
4. **Retour haptique et sonore déjà présents** (`hapticsService`, `soundFxService`) — bonne
   base ; pourrait être enrichie d'un retour sonore distinct par type d'outil exécuté (build
   site / organize / research) pour renforcer le côté "centre de contrôle".
5. **Écran Standby (HUD Dock)** est un très bon différenciateur (mode "bureau/chargeur")
   mais n'est accessible que depuis un widget du dashboard — le mettre en avant (ex : lien
   direct depuis les Réglages "activer automatiquement en charge") augmenterait son usage
   réel plutôt que d'être une fonctionnalité cachée.

## Priorités recommandées
1. Retirer le code mort (`GideonHead3D`, `gideonHeadScene`, `useBrahmaStore`, `openRouterKey`)
   ou finir de le brancher.
2. Sécuriser le nom du modèle Gemini avec un fallback + message d'erreur clair, planifier la
   migration `@google/generative-ai` → `@google/genai`.
3. Ajouter le rendu Markdown dans le chat (gain visuel énorme, effort faible).
4. Passer les listes potentiellement longues (chat, history, organizer) en `FlatList`.
5. Ajouter des `accessibilityLabel` sur les boutons icône-only, et un CI GitHub Actions qui
   lance `typecheck` + `lint` + `test` sur chaque PR.
