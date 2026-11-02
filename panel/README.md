# RHODE Guard — panneau d’administration

Code source du panneau web RHODE Guard, rangé dans `panel/`. Cette branche GitHub conserve le code et son historique. Elle ne déploie pas encore le panneau et ne le relie pas au serveur FiveM.

## GitHub et hébergement

- GitHub sert à versionner le code et peut lancer un déploiement automatisé avec GitHub Actions.
- GitHub Pages ne peut pas exécuter cette application Next.js et ses routes API.
- Il faut un hébergement qui exécute Node.js (ou le conteneur prévu par l’application) et un stockage de base de données persistant.
- Le schéma Prisma fourni est actuellement configuré pour SQLite. Un disque éphémère d’hébergement ferait perdre les données lors d’un redémarrage ou d’un nouveau déploiement.
- Ne pas réutiliser la base MySQL de jeu pour les comptes staff, sessions, dossiers ou journaux du panel. Le panel doit avoir sa propre base et des secrets distincts.

## Développement local

Prérequis : Bun compatible avec les versions déclarées dans `package.json`.

1. Installer les dépendances avec `bun install`.
2. Définir `DATABASE_URL` vers une base SQLite locale persistante, par exemple `file:./dev.db`.
3. Générer le client Prisma avec `bun run db:generate`.
4. Créer la base et appliquer le schéma selon les migrations disponibles. À ce commit, le dossier `prisma/migrations` n’est pas présent : l’initialisation de la base reste donc à préparer.
5. Démarrer avec `bun run dev`.

Le dépôt ne contient pas de compte staff initial ni de mot de passe par défaut. La route de gestion du staff exige déjà une session autorisée ; il faut ajouter une procédure de premier compte propriétaire sûre avant toute mise en service. Ne pas inventer ou publier des identifiants de démonstration.

## Raccordement FiveM

Les routes d’ingestion du panneau attendent une clé dans l’en-tête `X-API-Key`. La ressource `rhode_guard` doit utiliser la même clé côté serveur. Garder les clés dans des variables secrètes de l’hébergeur, jamais dans Git, le navigateur ou une capture d’écran. Avant activation, valider le format des événements, les permissions, les limites de débit et la persistance des preuves.

## État de cette branche

- Le code du panneau est une préparation versionnée, pas une installation en production.
- Aucun service de base persistante, domaine, pipeline GitHub Actions ou déploiement n’est configuré ici.
- Aucune clé API, URL webhook, donnée de joueur ou identifiant MySQL Epycore ne doit être ajouté à ce dépôt.
- Les tests et le build doivent être exécutés dans un environnement Bun configuré avant toute publication.
