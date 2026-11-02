"use client";

/** Installation: guide d'intégration de la ressource FiveM rhode_guard — copie en 1 clic */
import { Panel, CopyButton } from "../terminal-ui";
import { Download, Terminal, FileCode2, ListChecks, ShieldAlert, Clock } from "lucide-react";

function Cmd({ children, title }: { children: string; title?: string }) {
  return (
    <div className="relative group">
      {title && <p className="text-[0.62rem] text-dimmer uppercase tracking-[0.15em] mb-1">{title}</p>}
      <div className="absolute right-2 top-2 z-10">
        <CopyButton value={children} label="le bloc de code" />
      </div>
      <pre className="text-[0.72rem] text-[#7dffa8] bg-black/60 border border-[rgba(0,255,65,0.25)] p-3 pr-20 overflow-x-auto term-scroll">
        {children}
      </pre>
    </div>
  );
}

export function InstallView() {
  return (
    <div className="space-y-4 max-w-3xl">
      <Panel
        title="Installer la ressource FiveM"
        right={
          <span className="flex items-center gap-1.5 text-[0.68rem] text-dim">
            <Clock size={13} aria-hidden="true" /> ≈ 5 minutes
          </span>
        }
      >
        <ol className="space-y-5 list-none">
          <li className="space-y-2">
            <h3 className="flex items-center gap-2 text-[#7dffa8]"><Download size={16} aria-hidden="true" /> 1. Télécharger la ressource</h3>
            <p className="text-dim text-sm">
              Archive complète (guards, adapters ESX/ox_inventory/oxmysql, migrations, tests, docs) à déposer
              dans le dossier <code className="text-[#7ce8ff]">resources/</code> de ton serveur.
            </p>
            <a href="/rhode_guard.zip" download className="tbtn inline-flex items-center gap-2 px-4 h-11 font-display text-lg">
              <Download size={16} /> rhode_guard.zip
            </a>
          </li>

          <li className="space-y-2">
            <h3 className="flex items-center gap-2 text-[#7dffa8]"><Terminal size={16} aria-hidden="true" /> 2. Créer la clé API</h3>
            <p className="text-dim text-sm">
              Dans <b className="glow-soft">SERVEURS → + AJOUTER</b> (menu de gauche), enregistre ton serveur
              puis copie la clé générée avec le bouton <b className="glow-soft">copier</b>.
            </p>
          </li>

          <li className="space-y-2">
            <h3 className="flex items-center gap-2 text-[#7dffa8]"><FileCode2 size={16} aria-hidden="true" /> 3. Configurer config/server.lua</h3>
            <Cmd>{`Config.PanelURL = "https://ton-panel.example.com/api/v1"
Config.ApiKey  = "TA-CLE-API-COPIEE"`}</Cmd>
          </li>

          <li className="space-y-2">
            <h3 className="flex items-center gap-2 text-[#7dffa8]"><ListChecks size={16} aria-hidden="true" /> 4. Activer dans server.cfg</h3>
            <Cmd>{`# ordre recommandé (dépendances réelles)
ensure oxmysql
ensure es_extended
ensure ox_inventory
ensure rhode_guard

# permissions (bypass staff de confiance)
add_ace group.admin rhode.bypass allow
add_ace group.admin rhode.staff  allow
add_ace group.admin rhode.kick   allow`}</Cmd>
          </li>

          <li className="space-y-2">
            <h3 className="text-[#7dffa8]">5. Démarrer en mode AUDIT</h3>
            <p className="text-dim text-sm">
              Le mode par défaut est <b className="glow-amber">AUDIT</b> (journalise + dossiers, aucune sanction auto).
              Étalonne les seuils dans <b className="glow-soft">RÉGLAGES</b>, vérifie les faux positifs dans
              <b className="glow-soft"> DOSSIERS</b>, puis passe en ENFORCE seulement quand le taux de faux positifs est acceptable.
              Le heartbeat arrive sous 60 s dans <b className="glow-soft">SERVEURS</b>.
            </p>
          </li>
        </ol>
      </Panel>

      <Panel title="Architecture de la ressource">
        <Cmd>{`rhode_guard/
├── fxmanifest.lua
├── config/        shared.lua (seuils) · server.lua (panel, clés)
├── shared/        protocol.lua (types) · schemas.lua (validation)
├── client/        main.lua (signaux) · telemetry.lua (télémétrie)
├── server/
│   ├── main.lua   (bootstrap, ordre de démarrage)
│   └── services/  EventGuard · MovementGuard · CombatGuard
│                  VehicleGuard · EconomyGuard · InventoryGuard
│                  EvidenceService · CaseService · PermissionService
│                  RateLimit · Adapters/ (ESX · OxInventory · OxMySQL)
├── migrations/    001_init.sql (oxmysql, mode autonome)
├── tests/         test_schemas · test_ratelimit · test_score
└── docs/          installation · configuration · panel · sécurité · api`}</Cmd>
        <p className="text-[0.7rem] text-dimmer mt-2">
          Frontière de confiance: le client n&apos;est qu&apos;une source de signaux faibles. Le serveur
          recalcule positions, vitesses, montants et droits; le panel consomme l&apos;API authentifiée.
        </p>
      </Panel>

      <Panel title="API serveur (ressource → panel)">
        <div className="space-y-2 text-[0.75rem]">
          <p className="text-dim">Toutes les routes attendent l&apos;en-tête <code className="text-[#7ce8ff]">X-API-Key</code>.</p>
          <Cmd>{`POST /api/v1/ingest/detection   { license, name, type, severity, source, confidence, details, evidenceHash }
POST /api/v1/ingest/players     { event: "join"|"leave", license, name, identifiers, hwid }
POST /api/v1/ingest/heartbeat   { onlinePlayers, maxPlayers, version }
GET  /api/v1/config             → mode + seuils détecteurs (kill-switch live)
GET  /api/v1/bans/check?identifier=license:xxx&hwid=token`}</Cmd>
          <p className="text-dimmer">
            Types: SPEEDHACK, TELEPORT, FLY_NOCLIP, SUPERJUMP, GODMODE, INVISIBLE, COLLISION_OFF,
            WEAPON_CADENCE, BLACKLIST_WEAPON, ONE_HIT_KILL, VEHICLE_MODEL, VEHICLE_FLOOD,
            ECONOMY_ANOMALY, DUPLICATION, TELEMETRY_MISMATCH, EVENT_FLOOD, EVENT_INVALID —
            Sources: CLIENT (signal), SERVEUR (vérif. autoritaire), CROISEE (client vs serveur).
          </p>
        </div>
      </Panel>

      <Panel title="Exports pour ton gamemode">
        <Cmd>{`-- Autoriser un téléport légitime (garage, event, admin TP)
exports.rhode_guard:AuthorizeTeleport(source, "garage")

-- Protéger un événement sensible (schéma + rate-limit + validation)
exports.rhode_guard:RegisterProtectedNetEvent("monjob:pay", {
  amount = "number", missionId = "string"
}, function(src, data) ... end)

-- Valider une opération économique avant application
local ok, reason = exports.rhode_guard:ValidateEconomyOp(source, amount, "vente ferme")
if not ok then return end

-- Enregistrer un véhicule légitime créé par script
exports.rhode_guard:RegisterServerVehicle(netId, source)`}</Cmd>
      </Panel>

      <Panel title="Réglage & faux positifs">
        <ul className="space-y-2 text-sm text-dim list-disc pl-5">
          <li>Seuils par détecteur dans <b>RÉGLAGES</b> (kill-switch + valeurs) — propagés à la ressource sous 60 s, sans redémarrage.</li>
          <li>Périodes de grâce: spawn, mort, pause menu, collision en chargement, entrée/sortie véhicule, ragdoll, téléports autorisés.</li>
          <li>Si ton gamemode téléporte les joueurs, appelle <code className="text-[#7ce8ff]">AuthorizeTeleport</code> ou augmente les seuils en mode OBSERVATION d&apos;abord.</li>
          <li>Marque les faux positifs dans <b className="glow-soft">DÉTECTIONS</b> / conclus les dossiers en FAUX POSITIF — le score de risque en tient compte.</li>
          <li>Auto-sanction (ENFORCE uniquement): N détections HIGH+ en fenêtre glissante → ban temporaire configurable, toute action est auditée et appelable.</li>
        </ul>
      </Panel>

      <Panel title="Note de sécurité" className="border-[rgba(255,176,0,0.35)]">
        <div className="flex gap-3">
          <ShieldAlert className="text-[#ffb000] shrink-0" size={22} aria-hidden="true" />
          <div className="text-sm space-y-2 text-dim">
            <p>
              Comptes de démonstration fournis (owner/admin/modo/support) — change les mots de passe
              ou recrée tes comptes via STAFF avant une utilisation réelle.
            </p>
            <p>
              Aucun anti-cheat n&apos;est infaillible: un client compromis peut mentir, se taire ou falsifier
              ses signaux. RHODE GUARD compense par la vérification serveur autoritaire (positions, vitesses),
              la télémétrie croisée client/serveur, le token anti-spoof, le rate-limit, le watchdog de silence
              et la revue humaine via dossiers. Les limites exactes sont documentées dans docs/SECURITE.md.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
