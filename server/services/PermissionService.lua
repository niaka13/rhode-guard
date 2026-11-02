--[[
    RHODE GUARD ULTIMATE — PermissionService
    Aces granulaires (server.cfg), registre de bypass, commandes staff en jeu.
    Le serveur est la SEULE source de vérité des permissions (jamais le client).

    server.cfg recommandé:
      add_ace group.admin rhode.bypass allow   -- désactive les détecteurs pour le staff de confiance
      add_ace group.admin rhode.staff  allow   -- commandes staff
      add_ace group.modo   rhode.staff  allow
      add_ace group.admin rhode.kick   allow   -- /rgkick
]]

RHODE = RHODE or {}
RHODE.Permissions = RHODE.Permissions or {}

local bypassed = {} -- [src] = true

local ACE = {
    bypass = 'rhode.bypass',
    staff  = 'rhode.staff',
    kick   = 'rhode.kick',
}

--- Le joueur est-il en bypass (staff de confiance, développeurs) ?
function RHODE.Permissions.IsBypassed(src)
    if bypassed[src] then return true end
    if IsPlayerAceAllowed(src, ACE.bypass) then
        bypassed[src] = true
        return true
    end
    return false
end

--- Permission staff générique.
function RHODE.Permissions.IsStaff(src)
    if src == 0 then return true end -- console serveur
    return IsPlayerAceAllowed(src, ACE.staff)
end

--- Permission de kick.
function RHODE.Permissions.CanKick(src)
    if src == 0 then return true end
    return IsPlayerAceAllowed(src, ACE.kick) or IsPlayerAceAllowed(src, ACE.staff)
end

--- Nettoyage à la déconnexion.
function RHODE.Permissions.ClearPlayer(src)
    bypassed[src] = nil
end

--[[ ============ COMMANDES STAFF ============ ]]

-- État du système (lecture seule, aucune action distante arbitraire)
RegisterCommand('rgstatus', function(src)
    if src > 0 and not RHODE.Permissions.IsStaff(src) then return end
    local lines = {
        ('^2[RHODE GUARD] v%s — état du système^0'):format(RHODE.VERSION),
        ('Mode: ^3%s^0 | État: ^3%s^0'):format(RHODE.Runtime and RHODE.Runtime.mode or 'N/A', RHODE.Runtime and RHODE.Runtime.state or 'N/A'),
        ('Joueurs surveillés: %d'):format(#GetPlayers()),
        ('Panel: %s'):format(Config.PanelURL ~= '' and Config.PanelURL or 'mode autonome (oxmysql)'),
        ('Relay: %s'):format(RHODE.Panel and RHODE.Panel.IsHealthy() and '^2OK^0' or '^1INJOIGNABLE^0'),
    }
    -- détecteurs actifs
    local active, total = 0, 0
    if RHODE.Runtime and RHODE.Runtime.detectors then
        for _, d in pairs(RHODE.Runtime.detectors) do
            total = total + 1
            if d.enabled then active = active + 1 end
        end
    end
    lines[#lines + 1] = ('Détecteurs actifs: %d/%d'):format(active, total)
    print(table.concat(lines, '\n'))
end, false)

-- Kick avec trace (ace rhode.kick / rhode.staff)
RegisterCommand('rgkick', function(src, args)
    if src > 0 and not RHODE.Permissions.CanKick(src) then return end
    local target = tonumber(args[1])
    if not target or not GetPlayerName(target) then
        print('^1[RHODE GUARD] /rgkick <id> [motif]^0')
        return
    end
    local motif = table.concat(args, ' ', 2)
    DropPlayer(target, ('[RHODE GUARD] Kické par le staff. %s'):format(motif ~= '' and motif or ''))
    print(('[RHODE GUARD] kick manuel: %s (%s) par %s'):format(
        GetPlayerName(target), target, src == 0 and 'console' or GetPlayerName(src)))
    -- trace panel
    if RHODE.Evidence then
        RHODE.Evidence.SendStaffAction('MANUAL_KICK', {
            target = GetPlayerName(target),
            motif = motif,
            par = src == 0 and 'console' or GetPlayerName(src),
        })
    end
end, false)

-- Lecture du mode courant
RegisterCommand('rgmode', function(src)
    if src > 0 and not RHODE.Permissions.IsStaff(src) then return end
    print(('[RHODE GUARD] mode courant: %s — modifiable dans le panel (RÉGLAGES)'):format(
        RHODE.Runtime and RHODE.Runtime.mode or 'N/A'))
end, false)
