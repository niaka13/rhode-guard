# RHODE GUARD ULTIMATE — Flux métier de bout en bout (§27)

Chaque flux critique est décrit avec son diagramme de séquence, ses invariants et
la réponse à la question centrale : **qui est l'autorité ?** (toujours le serveur).

Limite structurelle documentée : les verrous et l'idempotence en mémoire sont
autoritaires **au sein du processus FXServer** (un seul par serveur de jeu). La
persistance oxmysql couvre la reprise après redémarrage. La coordination
multi-serveurs (plusieurs FXServer partageant une économie) exigerait des verrous
consultatifs en base — hors périmètre actuel, à confirmer avant un tel déploiement.

---

## 27.1 Achat en boutique

```
Client                    Serveur (autorité)                    ESX/ox_inventory
  │ 1. intention: {itemId, qté bornée} │                            │
  │───────────────────────────────────▶│                            │
  │                                    │ 2. résoudre produit (catalogue SERVEUR)
  │                                    │    zone? boutique active? vivant?
  │                                    │ 3. PRIX calculé serveur (jamais du client)
  │                                    │    stock? capacité? solde?
  │                                    │ 4. clé d'idempotence → RHODE.OPS.IdemBegin
  │                                    │    replay? → renvoyer le résultat précédent
  │                                    │    conflit?  → rejet + incident RG-ECO-002
  │                                    │ 5. verrous profils (LockManager, ordre trié)
  │                                    │ 6. appliquer: RemoveItem/AddItem/addMoney
  │                                    │───────────────────────────▶│
  │                                    │ 7. journal op SUCCEEDED (oxmysql async)
  │  ◀── confirmation SEULEMENT ici ───│    + événement de preuve (panel)
```

**Invariants** : le prix client est ignoré · même clé = même résultat sans recrédit ·
clé réutilisée avec un autre contenu = conflit audité · les opérations rejetées ne
changent NI solde NI inventaire · aucun succès client avant confirmation serveur.

**Modèle prêt à copier** : `docs/examples/shop_server.lua` (non chargé par le
manifeste — c'est un modèle documenté, pas un module actif).

## 27.2 Paiement de salaire / mission

- Les étapes de progression sont des **intentions** : le serveur détient l'état de
  mission (attribution, parcours, fenêtre de temps) et valide chaque étape.
- À la complétion : le serveur calcule le gain (config versionnée), puis
  `BeginEconomyOp(src, 'salaire_miner', { amount = gain }, 'job:miner:' .. missionId)`.
- **Atomicité au mieux** : `op:Succeed()` marque la réclamation; après un
  redémarrage, le journal recharge la clé → un retry **relit le résultat** au lieu
  de recréditer.
- Déconnexion/abandon/échec : le script métier appelle `op:Reject('abandon')` —
  l'opération reste tracée, sans effet.

## 27.3 Transfert d'objets / argent (J1 ↔ J2)

```lua
local ok, result = exports.rhode_guard:WithTransferLocks(fromSrc, toSrc, function()
    local op = exports.rhode_guard:BeginEconomyOp(fromSrc, 'transfert', { amount = m }, key)
    if not op or op.replay then return false end
    -- vérifier les deux sessions, la proximité (mesurée serveur), la capacité
    -- appliquer RemoveItem/AddItem des deux côtés en vérifiant les retours
    op:Succeed({ to = toLicense })
    return true
end)
```

**Invariants** : verrous pris en **ordre déterministe** (clés triées → pas
d'interblocage) · libération garantie même en erreur (`WithLocks` = pcall+release) ·
TTL 10 s (reprise après crash) · journal unique : acteur, bénéficiaire pseudonymisé,
montant, résultat, heure · aucune confirmation client ne suffit.

## 27.4 Enquête panel

- L'alerte est un **signal** : le dossier sépare faits (détections source
  serveur/croisée/client), interprétation (notes d'enquête) et décision (transition
  motivée).
- Machine à états (§28) : `OPEN → REVIEWING → ESCALATED → (CLOSED_FP |
  CLOSED_SANCTION | DISMISSED)`; réouverture uniquement vers REVIEWING avec motif.
- Chaque bouton d'action affiche ce qu'il fait; clôture/escalade/réouverture
  exigent un **motif**; la permission est **revérifiée côté serveur au moment du
  clic** (une permission retirée entre affichage et validation n'exécute rien).

---

## Machine à états — opérations économiques (§28)

```
REQUESTED → VALIDATED → IN_PROGRESS → SUCCEEDED
                │            │
                └──▶ REJECTED └──▶ FAILED
                                   └──▶ COMPENSATION_REQUIRED → SUCCEEDED | FAILED
```
Le client ne choisit **aucune** transition (testé : tests/test_operations.lua,
« le client ne peut pas sauter des étapes »).

## Scénarios de résilience (§23) — comment les rejouer en préproduction

| Scénario | Procédure de test sûre | Résultat attendu |
|---|---|---|
| Double-clic achat | appeler le handler protégé 2× avec la même clé | 1 seul débit, replay du résultat |
| Retry après coupure réseau | re-appeler avec la même clé après 30 s | même résultat, pas de recrédit |
| Redémarrage ressource | `restart rhode_guard` puis retry | clés rechargées du journal → replay |
| Réponse perdue après écriture | couper le flux NUI entre apply et notify | le journal montre SUCCEEDED; retry = replay |
| Transferts croisés simultanés | J1→J2 et J2→J1 en même temps (comptes de test) | l'un passe, l'autre échoue proprement (LOCK_CONTENTION), jamais d'interblocage |
| Base indisponible | `stop oxmysql` 5 min | gameplay non bloqué; journal en mémoire; reprise au redémarrage; alerte RG-SYS-001 si file saturée |
| Clé réutilisée avec autre montant | même idemKey, amount différent | rejet + incident DUPLICATION (CRITICAL) |

Ces scénarios utilisent des comptes de test en préproduction — jamais sur un
serveur public.
