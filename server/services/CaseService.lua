--[[
    RHODE GUARD ULTIMATE — CaseService (regroupement en dossiers)
    Regroupe les incidents d'un même joueur dans une fenêtre de 60 minutes.
    Le PANEL reste la source de vérité (il crée ses propres dossiers RG-AAAA-NNNN);
    ce service fournit une référence locale stable pour:
      - éviter le spam d'incidents décorrélés dans les logs serveur
      - garder une trace groupée en mode autonome (sans panel, via oxmysql)

    Statuts: OUVERT → EN REVUE → CLÔTURÉ (faux positif / sanction) ou REJETÉ.
    Une alerte seule ne bannit jamais — voir EvidenceService et le panel.
]]

RHODE = RHODE or {}
RHODE.Case = RHODE.Case or {}

local WINDOW_SEC = 3600 -- 60 minutes
local cases = {}        -- [license] = { ref, openedAt, types = {}, remoteRef, confirmed }

--- Attache un incident au dossier courant du joueur (ouvre un dossier si fenêtre expirée).
--- @return string caseRef
function RHODE.Case.Attach(license, module)
    local now = os.time()
    local c = cases[license]

    if not c or (now - c.openedAt) > WINDOW_SEC then
        c = {
            ref = ('RG-LOCAL-%d-%d'):format(now, math.random(1000, 9999)),
            openedAt = now,
            types = {},
            remoteRef = nil,
            confirmed = false,
        }
        cases[license] = c
    end

    c.types[module] = (c.types[module] or 0) + 1
    return c.remoteRef or c.ref
end

--- Le panel a créé/confirmé un dossier distant pour ce joueur → on adopte sa référence.
function RHODE.Case.ConfirmRemote(license, remoteRef)
    local c = cases[license]
    if c and remoteRef then
        c.remoteRef = remoteRef
        c.confirmed = true
    end
end

--- Résumé du dossier courant d'un joueur (types agrégés).
function RHODE.Case.Summary(license)
    local c = cases[license]
    if not c then return nil end
    local parts = {}
    for module, count in pairs(c.types) do
        parts[#parts + 1] = module .. ' x' .. count
    end
    table.sort(parts)
    return {
        ref = c.remoteRef or c.ref,
        openedAt = c.openedAt,
        summary = table.concat(parts, ', '),
        confirmed = c.confirmed,
    }
end

--- Clôture locale (après sanction humaine ou décision staff) — purge la fenêtre.
function RHODE.Case.Close(license)
    cases[license] = nil
end

--- Purge des dossiers expirés (périodique via main.lua) + stat debug.
function RHODE.Case.Cleanup()
    local now = os.time()
    for license, c in pairs(cases) do
        if (now - c.openedAt) > WINDOW_SEC * 2 then
            cases[license] = nil
        end
    end
end

function RHODE.Case.Count()
    local n = 0
    for _ in pairs(cases) do n = n + 1 end
    return n
end
