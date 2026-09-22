# 🚀 SEVEN AI (v3.2.0) — Documentation Complète des Améliorations & Nouvelles Fonctionnalités

> **Projet** : SEVEN AI (anciennement Ultron / Brahma Echo)  
> **Framework & Moteur** : React Native & Expo **SDK 57** (Android / iOS / Web)  
> **Modèle IA** : Google Gemini 1.5 Flash (Multimodal & Function Calling)  
> **Synthèse Vocale** : Expo Speech (Offline) & ElevenLabs Neural HD  
> **Coût de fonctionnement** : **0 € (100% Gratuit)**

---

## 📑 Table des Matières
1. [Rebranding & Identité Futuriste](#1-rebranding--identité-futuriste)
2. [Système Vocal : Fish Audio (voix JARVIS), ElevenLabs HD & Assistant de Démarrage](#2-système-vocal-multilingue-fish-audio-hd-voix-jarvis--elevenlabs)
   - 2 bis [Assistant de Démarrage Animé](#2-bis-assistant-de-démarrage-animé-onboarding)
   - 2 ter [Briefing de Capacités au Démarrage](#2-ter-briefing-de-capacités-au-démarrage)
3. [Mode Mains-Libres Continu (Full Duplex)](#3-mode-mains-libres-continu-full-duplex)
4. [Détection du Mot de Réveil ("Hey Seven")](#4-détection-du-mot-de-réveil-hey-seven)
5. [Contrôle Matériel & Système Android Avancé](#5-contrôle-matériel--système-android-avancé)
6. [Vision Multimodale & Analyse Oculaire](#6-vision-multimodale--analyse-oculaire)
7. [Analyseur de Documents Locaux](#7-analyseur-de-documents-locaux)
8. [Mémoire Sémantique Locale (RAG Sans Frais)](#8-mémoire-sémantique-locale-rag-sans-frais)
9. [Bac à Sable d'Exécution de Code JavaScript](#9-bac-à-sable-dexécution-de-code-javascript)
10. [Avatar Gideon : Hologramme à Tête Projetée](#10-avatar-gideon--hologramme-à-tête-projetée)
11. [Physique & Gyroscope 3D Réactif](#11-physique--gyroscope-3d-réactif)
12. [Mode Standby / Desk Dock HUD Cyberpunk](#12-mode-standby--desk-dock-hud-cyberpunk)
13. [Recherche Web en Direct](#13-recherche-web-en-direct)
14. [Tableau de Bord Modulaire Déplaçable](#14-tableau-de-bord-modulaire-déplaçable)
15. [Vérifications Techniques & Qualité du Code](#15-vérifications-techniques--qualité-du-code)
16. [Restauration des Valeurs Sauvegardées](#16-restauration-des-valeurs-sauvegardées-dans-les-formulaires)
17. [Système Typographique](#17-bis-système-typographique-fin-du--monospace-partout-)
18. [Animations d'Entrée Partagées](#18-animations-dentrée-partagées)

---

## 1. Rebranding & Identité Futuriste
- **Nom du Projet** : Rebrandé officiellement de *Ultron* vers **SEVEN** et de *Brahma Echo* vers **Seven AI**.
- **Nettoyage Intégral** : Suppression totale de l'ancienne nomenclature Brahma dans les fichiers de configuration, invites système, logs de démarrage et messages.
- **Identité Visuelle** : 
  - Thème couleur par défaut : **Cyan Électrique SEVEN** (`#00E5FF`).
  - Système d'exploitation affiché : `SEVEN_OS // KERNEL v3.2`.
  - Appels système personnalisés : *Commander* par défaut pour l'utilisateur.

---

## 2. Système Vocal Multilingue, Fish Audio HD (voix JARVIS) & ElevenLabs
- **Moteur principal : Fish Audio** (`src/services/fishAudioService.ts`) — `POST https://api.fish.audio/v1/tts` avec le header `model: s2.1-pro-free` (palier développeur gratuit).
- **Voix JARVIS FR / EN** : deux modèles communautaires publics sont préconfigurés et **choisis automatiquement selon la langue parlée** — `612b878b113047d9a770c069c8b4fdfe` (JARVIS MCU, anglais) et `e9362f63a00c41209aec3851a8c30ea8` (JARVIS FR, grave et accent français). Remplaçables par n'importe quel `reference_id` dans les Réglages.
- **Chaîne de repli à trois moteurs** (`src/hooks/useVoice.ts`) : Fish Audio → ElevenLabs (clés existantes conservées) → voix système `expo-speech`. Une panne, une clé absente ou un quota épuisé ne coupe jamais la parole.
- **Limite honnête (CORS)** : Fish Audio ne renvoie pas d'en-tête CORS, donc **un navigateur ne peut pas appeler l'API du tout** — la requête meurt au preflight. Sur Android/iOS il n'y a aucune restriction. L'app et l'assistant de démarrage le disent explicitement (« Direct calls are blocked by the browser (CORS) ») au lieu d'accuser à tort une clé parfaitement valide.
- **Vérification de clé en direct** (`src/services/keyVerification.ts` + `verifyFishAudioKey`) : Gemini est validé par un listage de modèles (gratuit, sans consommer de tokens), Fish Audio par une synthèse d'un mot ; les codes 401/402/403/429 sont traduits en messages lisibles plutôt qu'en numéro HTTP.

---

## 2 bis. Assistant de Démarrage Animé (Onboarding)
- **Écran** : [app/onboarding.tsx](file:///c:/Users/ANDRY/Downloads/Compressed/Ultron%20V3/app/onboarding.tsx) — quatre étapes (IDENTITÉ → CŒUR NEURAL → VOIX → AURA) au lieu d'un long formulaire.
- **Ce qu'il demande** : nom de l'assistant et indicatif utilisateur, langue de l'interface, **clé API Gemini**, **clé API Fish Audio**, langue parlée, modèle de voix JARVIS (avec écoute d'un échantillon réel), thème d'aura, client ID Google optionnel.
- **Animations de vérification** : le bouton VÉRIFIER passe par un spinner, puis une coche ou une alerte avec le message exact ; l'avatar passe en `thinking` pendant la vérification et en `speaking` pendant l'échantillon vocal ; les étapes glissent en entrée (opacité + translation) ; la barre de progression coche chaque étape franchie.
- **Séquence d'allumage** : au lancement, une checklist affiche les étapes réelles (cœur neural, moteur vocal, coffre) avec leur résultat, puis route vers le dashboard. Une clé absente n'est pas une erreur : elle est signalée comme « synthèse hors ligne ».
- **Une clé modifiée n'est plus « vérifiée »** : le badge se réinitialise à la moindre frappe, sinon la coche verte mentirait dès la première correction de faute de frappe.

---

## 2 ter. Briefing de Capacités au Démarrage
- **Composant** : `src/components/CapabilityGreeting.tsx`, monté par le dashboard une fois par lancement (drapeau de module : il survit à la navigation, pas à un rechargement).
- **Ce qu'il fait** : Gideon se salue par le nom de l'utilisateur, énumère ce qu'il sait faire (briefing du matin, organisation de fichiers, synthèse web, recherche & PDF, boîte mail, auto-réparation) et le dit à voix haute.
- **Cohérence parole/visuel** : la phrase prononcée est **construite à partir de la liste affichée** — impossible de promettre une capacité que le dashboard ne montre pas.
- **Animation** : apparition en fondu + translation, révélation des lignes en cascade (130 ms), point pulsant en tête, et disparition automatique après lecture (ou au toucher), sans modale à fermer.

---

### 2 quater. Système Vocal Multilingue & ElevenLabs HD (hérité)
- **Détection Automatique de la Langue** :
  - Détection automatique et fluide du **Français** (`fr-FR`) et de l'**Anglais** (`en-US`) selon la langue parlée ou écrite.
- **Double Moteur Vocal** :
  - **Expo Speech (Système)** : Fonctionne 100% hors-ligne, zéro latence, gratuit et illimité.
  - **ElevenLabs Neural HD** : Synthèse vocale de qualité cinéma via API streaming avec lecture optimisée via `expo-av` et système de cache local (`.mp3`).
  - **Fallback Intelligent** : Si le quota ElevenLabs est atteint ou si le réseau est coupé, SEVEN bascule automatiquement sur la voix système sans interruption.
- **Configuration dans les Réglages** :
  - Sélecteur de moteur vocal (`EXPO SPEECH` vs `ELEVENLABS HD`).
  - Champs protégés pour la clé API ElevenLabs et le Voice ID (voix par défaut : *Rachel*).

---

## 3. Mode Mains-Libres Continu (Full Duplex)
- **Dialogue Naturel Sans Toucher l'Écran** :
  - Activation d'un simple clic sur le bouton Casque (`Headphones`) dans l'en-tête du chat.
  - Dès que SEVEN termine de formuler sa réponse vocale, le microphone se réarme automatiquement après un bip discret et une vibration haptique.
- **Commande Vocale d'Arrêt** :
  - Prononcer *"Stop"*, *"Pause"* ou *"Arrête-toi"* désactive instantanément le mode continu.

---

## 4. Détection du Mot de Réveil ("Hey Seven")
- **Veille Vocale Active** :
  - Un radar d'écoute d'arrière-plan à basse consommation sur le tableau de bord d'accueil.
  - Activé/Désactivé via le badge radio sous l'Avatar : `ENABLE "HEY SEVEN" WAKE WORD` / `WAKE WORD ARMED`.
- **Réveil Instantané** :
  - Dire **« Hey Seven »**, **« Dis Seven »** ou **« Salut Seven »** réveille l'IA avec un carillon de télémétrie et exécute automatiquement la commande qui suit sans interaction tactile.

---

## 5. Contrôle Matériel & Système Android Avancé
SEVEN dispose désormais d'outils matériels directs grâce au moteur d'appels de fonction Gemini (Function Calling) :
- **Télémétrie Batterie** :
  - Outil `get_battery_status` (`expo-battery`) : rapporte le pourcentage exact, si le smartphone est branché/en charge ou déchargé, et si le mode économie d'énergie est actif.
- **Gestion du Presse-Papier** :
  - `read_clipboard` : Lit le contenu textuel copié pour l'analyser, le traduire ou le résumer.
  - `copy_to_clipboard` : Permet à SEVEN d'envoyer directement du texte, des adresses ou du code dans le presse-papier du smartphone.
- **Intents Android Natifs** :
  - `make_phone_call` : Ouvre le composeur téléphonique avec le numéro demandé.
  - `send_sms` : Prépare et ouvre l'application SMS avec le numéro et le corps du message.
  - `open_whatsapp` : Ouvre WhatsApp avec un contact et un message prérempli.
  - `open_navigation` : Déclenche le guidage GPS / Google Maps vers une destination spécifique.

---

## 6. Vision Multimodale & Analyse Oculaire
- **Module Intégré** : `expo-image-picker` compatible SDK 57.
- **Interface Utilisateur** :
  - Boutons **Caméra** (prise de photo instantanée) et **Galerie** (choix d'image) dans la barre de saisie de chat.
  - Barre de prévisualisation de l'image sélectionnée avec bouton de suppression (`X`).
- **Analyse Multimodale** :
  - Encodage base64 et envoi direct comme `inlineData` au modèle multimodal Gemini.
  - Rendu d'une carte d'action dédiée dans le chat : `SEVEN VISION // MULTIMODAL OCULAR`.

---

## 7. Analyseur de Documents Locaux
- **Module Intégré** : `expo-document-picker` compatible SDK 57.
- **Service** : `src/services/documentAnalysisService.ts`.
- **Fonctionnalité** :
  - Bouton **Trombone** (`Paperclip`) dans la barre de saisie de chat.
  - Permet d'importer n'importe quel fichier présent sur le smartphone (**PDF**, **TXT**, **Markdown**, **JSON**, **CSV**, fichiers de code source).
  - Extraction automatique du texte et transmission au modèle Gemini pour un résumé exécutif ou des questions-réponses.

---

## 8. Mémoire Sémantique Locale (RAG Sans Frais)
- **Service** : `src/services/memoryService.ts`.
- **Zéro Abonnement / Zéro Cloud Payant** :
  - Base de données locale intégrée dans le stockage sandbox de l'appareil (`seven_memory_rag.json`).
  - Indexation et calcul de pertinence sémantique (token overlap & cosine-like ranking).
- **Outils Déclarés** :
  - `remember_fact` : Mémorisation permanente d'une préférence, habitude ou consigne de l'utilisateur.
  - `recall_memories` : Recherche contextuelle dans la mémoire pour enrichir les réponses futures.

---

## 9. Bac à Sable d'Exécution de Code JavaScript
- **Service** : `src/services/sandboxService.ts`.
- **Outil IA** : `execute_code_sandbox`.
- **Fonctionnement** :
  - Permet à SEVEN d'exécuter du code JavaScript directement sur le moteur de l'appareil dans un périmètre sécurisé.
  - Idéal pour résoudre des équations mathématiques exactes, manipuler de grands tableaux, ou tester des algorithmes avec mesure du temps d'exécution en millisecondes (`executionTimeMs`) et capture des logs console.

---

## 10. Avatar Gideon : Hologramme à Tête Projetée
- **Composant** : `src/components/GideonAvatar.tsx` (moteur unique, rendu par `OrbView` en mode `gideon`).
- **Identité** : Gideon, l'IA holographique de *The Flash* / *Legends of Tomorrow* — tête humaine bleue translucide projetée par une colonne de lumière.
- **Visage réaliste** (anatomie humaine, pas un masque stylisé) :
  - Crâne et mâchoire galbés, pommettes, tempes, **oreilles** (hélix, antihélix, lobe), **nez** avec arête, ailes et narines, arcades sourcilières, philtrum, pli nasogénien, sillon sous-labial, cou (sterno-cléido-mastoïdien) et clavicules.
  - **Yeux anatomiques** : fente palpébrale, iris, pupille, reflet cornéen, ombre de paupière, ligne de cils, paupières inférieures ; clignement réel et micro-dérive du regard.
  - **Micro-expressions liées à l'état** (`src/core/expression.ts`, pur et testé) : sourcils qui se plissent en réflexion (max en `thinking`) et se détendent quand la réponse tombe, paupières qui se plissent (`Duchenne`) et plis au coin de la bouche qui se creusent quand une action réussit, sourcils qui se relèvent et yeux qui s'ouvrent en grand sur un échec — un échec n'est jamais suivi d'un sourire. Un sourire automatique de 2,2 s est déclenché quand une tâche en cours (construction, organisation, auto-réparation, réflexion) retombe à `idle` : la fin d'une réponse, elle, ne mérite pas de sourire.
  - Modelé par dégradés (lumière clé en haut à gauche, creux des joues, orbites, tempes, menton) pour un rendu 3D, plus un carroyage de scan et des points de repère faciaux façon face-tracking (discrets : à fort agrandissement, des points trop marqués se lisaient comme des piercings).
  - **Chevelure** : masse posée sur le crâne avec une ligne de cheveux naturelle (tempes dégarnies, léger pic central) qui se dissout dans le front par dégradé — l'ancien croissant à bord dur faisait bandeau.
  - **Nez** en volume : arête éclairée, flancs ombrés asymétriquement, **ailes** (deux formes rondes qui encadrent les narines — sans elles, un nez n'est qu'une tige au-dessus de deux trous), narines réduites et pli alaire.
  - Lèvres à double courbe avec arc de Cupidon, gouttière médiane et reflet sur la lèvre inférieure ; halo sombre du pourtour discret, sinon la bouche devient un trou au milieu du visage.
  - **Couleur alignée sur le fond** : ombres et silhouette (teinte `deep`/`edge`) viennent de la famille du fond du thème, seul l'accent de statut porte la lumière — sinon la tête lit comme un autocollant collé sur la scène.
- **Synchro labiale par visèmes** (`src/core/visemes.ts`) :
  - Le texte réellement prononcé est converti en une chronologie de visèmes (A, E, I, O, U, MBP, FV, L, S, CH, T, K, R…).
  - Chaque visème pilote trois paramètres continus (ouverture, largeur, pulpe des lèvres) animés exactement sur sa durée, donc la bouche articule les mots au lieu de battre au rythme de l'amplitude micro.
  - Ponctuation = temps de silence réel (la bouche se ferme), digrammes FR/EN gérés (ou, oi, eau, ch, gn…), et si la synthèse vocale dépasse l'estimation, la bouche continue d'articuler.
  - L'amplitude micro ne sert plus qu'au halo/émission lumineuse.
- **Détails rendus** :
  - Balayages verticaux de reconstruction, dont la largeur suit la silhouette de la tête.
  - Colonne de projection, socle émissif, ondes sonores à la base quand il parle ou écoute.
  - Scintillement de projecteur, lévitation, léger balancement de tête, apparition « matérialisation » au montage.
- **Teinte par statut** : cyan (repos), violet (réflexion), vert émeraude (écoute), ambre/bleu (construction), rouge (auto-réparation).
- **Réglages** : l'ancien sélecteur `VECTOR HUD` / `3D WEBGL SHADER` est retiré ; les configurations sauvegardées sont migrées automatiquement vers Gideon.
- **Tête WebGL** (`src/core/gideonHeadScene.ts`, `src/components/GideonHead3D.tsx`) : une version maillée 3D a été développée puis écartée — côte à côte, le visage vectoriel lit comme le plus réaliste. Le code reste dans le dépôt, non branché, avec son test de non-régression (`__tests__/gideonHeadScene.test.ts`).

---

## 11. Physique & Gyroscope 3D Réactif
- **Module** : `expo-sensors` (Accéléromètre matériel échantillonné à 60 Hz).
- **Effet Visuel** :
  - L'inclinaison physique du smartphone vers la gauche, la droite ou le haut fait pivoter et bouger l'avatar avec une physique de ressort amortie (`Animated.spring`).
  - Donne l'impression visuelle d'un cœur holographique en lévitation à l'intérieur du téléphone.
  - Commutateur `GYROSCOPE 3D TILT DYNAMICS` présent dans les Réglages pour l'activer ou le désactiver à volonté.

---

## 12. Mode Standby / Desk Dock HUD Cyberpunk
- **Écran Dédié** : Accessible via la carte **HUD DOCK** sur le tableau de bord ([app/standby.tsx](file:///c:/Users/ANDRY/Downloads/Compressed/Ultron%20V3/app/standby.tsx)).
- **Utilisation** :
  - Conçu pour transformer le smartphone posé sur un bureau ou en charge en station de contrôle cyberpunk.
  - Horloge numérique géante à lueur néon cyan.
  - Réacteur central réactif au gyroscope et au son.
  - Affichage temps réel de la batterie, de l'état du blindage AST et du cœur neural.

---

## 13. Recherche Web en Direct
- **Service** : `src/services/webSearchService.ts`.
- **Outil** : `search_web`.
- **Fonctionnement** :
  - Interroge les API DuckDuckGo en direct sans aucune clé payante.
  - Fournit les actualités, faits récents et sources documentées directement dans le flux de conversation.

---

## 14. Tableau de Bord Modulaire Déplaçable
- **Composant** : `src/components/WidgetCanvas.tsx`, branché dans [app/index.tsx](file:///c:/Users/ANDRY/Downloads/Compressed/Ultron%20V3/app/index.tsx).
- **Canvas libre** : les six modules (Briefing du matin, Dave Agent, Storage, PDF Intel, Self-Heal, HUD Dock) ne sont plus des cartes figées dans une grille — ils flottent sur un canvas et se déplacent librement.
- **Mode ARRANGER** : un bouton dans l'en-tête `MODULES` déverrouille le deck. Les tuiles se mettent à osciller (chacune décalée dans le temps), passent en pointillés avec une ombre cyan et révèlent une poignée, puis se glissent au doigt (`PanResponder` + `Animated`). Le bouton devient `TERMINER` et un cadre indique la zone de pose.
- **Positions persistées** : elles sont stockées en **fractions** du débattement (0–1 par axe, dans `config.widgetLayout`), donc un agencement survit au rechargement, à une rotation et aux différences de largeur web/mobile ; des pixels, non.
- **Entrées décalées** : les tuiles se matérialisent en cascade (70 ms d'écart) au lieu d'apparaître d'un bloc.
- **Mode normal** : les tuiles redeviennent de simples boutons, sans poignée ni oscillation.

---

## 15. Vérifications Techniques & Qualité du Code
- **Expo SDK** : Compatible **Expo SDK 57**.
- **Vérification Statique TypeScript** :
  ```bash
  npm run typecheck
  # Résultat : 0 erreur
  ```
- **Lint** :
  ```bash
  npx eslint .
  # Résultat : 0 problème
  ```
- **Tests Unitaires (Jest)** :
  ```bash
  npm test
  # Résultat : 5 suites passées, 37/37 tests passés avec succès
  ```

---

## 16. Restauration des Valeurs Sauvegardées dans les Formulaires
- **Problème corrigé** : les champs des Réglages (clé Gemini, clé Fish Audio, identifiants ElevenLabs, nom, indicatif, note de mémoire) partaient d'un `useState(config.x)` alors que la configuration se charge **de façon asynchrone**. Le premier rendu capturait donc la valeur par défaut (vide) et ne se mettait plus jamais à jour : une clé parfaitement enregistrée apparaissait **effacée**, ce qui pousse à la ressaisir.
- **Correctif** : `src/hooks/useDraft.ts` — le champ ne stocke un brouillon qu'à partir de la première frappe ; sinon il affiche la valeur sauvegardée. Aucun effet ne vient écraser ce que l'utilisateur est en train de taper pendant l'hydratation.
- **Effet de bord utile** : le bouton **WIZARD** des Réglages rouvre l'assistant de démarrage avec les valeurs réellement sauvegardées, au lieu des valeurs par défaut.
- **Hygiène** : la clé Gemini est désormais masquée dans les Réglages, comme les autres secrets.

---

## 17 bis. Système Typographique (fin du « monospace partout »)
- **Problème** : 231 déclarations `fontFamily: 'monospace'` en dur dans 23 fichiers — une seule police pour une horloge, un bouton, une légende et une ligne de log, résolue en plus par le système d'exploitation (Courier, DejaVu…). C'est la principale raison du rendu « générique IA ».
- **Correctif** : `src/theme/typography.ts` — trois familles, trois rôles.
  - **Orbitron** (display) : titres, marque, horloge du dock. Géométrique et large ; jamais en corps de texte.
  - **Rajdhani** (ui) : libellés, boutons, prose, transcriptions. Condensée technique, x-height élevé, lisible à 10–12 px.
  - **JetBrains Mono** (mono) : télémétrie, journaux, identifiants. Chiffres à chasse fixe.
- **Livraison hybride** : sur web les familles sont injectées via Google Fonts (`preconnect` + `font-display: swap`, aucun poids dans le bundle) ; sur natif chaque rôle retombe sur la police système la plus proche, donc rien n'a l'air accidentel avant de lier des TTF.
- **Rôles nommés** : `TYPE.hero/title/section/label/body/caption/data/metric/micro` remplacent les tailles magiques ; `TABULAR` (chiffres à chasse fixe) sur l'horloge, les compteurs et les horodatages, pour qu'ils ne sautent pas en changeant.
- **Date localisée** : l'en-tête HUD utilise `Intl.DateTimeFormat` selon la langue de l'interface — un utilisateur francophone ne lit plus « SEPTEMBER ».

---

## 17 ter. Hiérarchie des Modules
- Les six modules du dashboard étaient six cartes entièrement colorées et de poids visuel égal — un dashboard ne doit pas dire « six priorités égales ». Chaque tuile garde sa couleur, mais sur une carte neutre filaire avec un **filet de 2 px en haut**, la couleur servant de repère et non de cadre.

---

## 18. Animations d'Entrée Partagées
- **Composant** : `src/components/ScreenReveal.tsx` — un fondu + translation par bloc, décalé de 90 ms par `index`, appliqué aux en-têtes et aux sections de Dashboard, Chat, History, Organizer, Research, Dave et Standby.
- **Pourquoi un composant** : chaque écran apparaissait d'un bloc, ce qui lit comme un changement de page plutôt qu'un système qui s'allume ; un seul composant donne le même tempo partout sans que chaque page réinvente ses durées.
- **Vérification visuelle réelle** : dashboard, mode vocal, mode ARRANGER (glisser + persistance après rechargement) et avatar zoomé contrôlés dans le navigateur sur `expo start --web`.
