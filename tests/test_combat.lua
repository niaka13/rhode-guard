--[[
    RHODE GUARD ULTIMATE — Tests CombatGuard (RG-CMB-004..007)
    Teste les statistiques de visée pures et le guard complet via mocks
    des natives FiveM (aucune vraie native n'est appelée).
]]

-- ==== Mocks des dépendances natives/globales ====
local submitted = {}
RHODE.Evidence = {
    Submit = function(rec)
        submitted[#submitted + 1] = rec
    end,
}
_G.GetPlayerIdentifierByType = function(src, kind)
    if kind == 'license' then return 'license:test' .. src end
    return nil
end
_G.GetPlayerName = function(src) return 'Joueur' .. src end

-- Config de test (seuils volontairement bas pour les tests)
_G.Config = {
    Modules = {
        combat = {
            enabled = true,
            maxKillsPerMin = 20,
            maxDamagePerHit = 200,
            blacklistedWeapons = {},
            aimMinShots = 5,
            aimHeadshotRatio = 0.85,
            aimMinDistance = 10.0,
            recoilMinBurst = 4,
            recoilMaxPitchVar = 0.15,
            ammoMinShots = 10,
            maxExplosionsPerMin = 3,
        },
    },
}

-- Le runner dofile CombatGuard APRÈS ces mocks (voir run_tests.lua).

T('combat: AimStats pur — ratio et distance moyenne', function()
    local win = {
        { head = true, dist = 20 }, { head = true, dist = 30 },
        { head = true, dist = 25 }, { head = false, dist = 40 },
    }
    local s = RHODE.CombatGuard.AimStats(win)
    assertEq(s.n, 4, 'n')
    assertEq(s.headshots, 3, 'headshots')
    assertEq(s.ratio, 0.75, 'ratio')
    assertEq(s.distMoy, 28.75, 'distance moyenne')
end)

T('combat: AimStats pur — fenêtre vide ne divise pas par zéro', function()
    local s = RHODE.CombatGuard.AimStats({})
    assertEq(s.n, 0, 'n')
    assertEq(s.ratio, 0, 'ratio')
    assertEq(s.distMoy, 0, 'distance moyenne')
end)

T('combat: AIMBOT signalé quand ratio + distance soutenus', function()
    submitted = {}
    local events = {}
    for i = 1, 5 do
        events[#events + 1] = { victimIsPlayer = true, head = true, dist = 30, weapon = 0, fatal = false }
    end
    RHODE.CombatGuard.Ingest(101, events, { shots = 0, reloads = 0, pitchVar = 1, explosions = 0 })
    assertEq(#submitted, 1, 'une détection attendue')
    assertEq(submitted[1].type, RHODE.TYPES.AIMBOT, 'type AIMBOT')
    assertEq(submitted[1].severity, 'HIGH', 'sévérité HIGH')
end)

T('combat: PAS d\'AIMBOT sous le seuil de coups (échantillon trop faible)', function()
    submitted = {}
    local events = {
        { victimIsPlayer = true, head = true, dist = 30, weapon = 0, fatal = false },
        { victimIsPlayer = true, head = true, dist = 30, weapon = 0, fatal = false },
    }
    RHODE.CombatGuard.Ingest(102, events, { shots = 0, reloads = 0, pitchVar = 1, explosions = 0 })
    assertEq(#submitted, 0, 'aucune détection (2 coups < seuil 5)')
end)

T('combat: PAS d\'AIMBOT si ratio élevé mais distance faible (corps-à-corps)', function()
    submitted = {}
    local events = {}
    for i = 1, 5 do
        events[#events + 1] = { victimIsPlayer = true, head = true, dist = 3, weapon = 0, fatal = false }
    end
    RHODE.CombatGuard.Ingest(103, events, { shots = 0, reloads = 0, pitchVar = 1, explosions = 0 })
    assertEq(#submitted, 0, 'aucune détection (distance 3m < 10m)')
end)

T('combat: NO_RECOIL signalé — rafale sans variation de pitch', function()
    submitted = {}
    RHODE.CombatGuard.Ingest(104, {}, { shots = 6, reloads = 1, pitchVar = 0.02, explosions = 0 })
    assertEq(#submitted, 1, 'une détection attendue')
    assertEq(submitted[1].type, RHODE.TYPES.NO_RECOIL, 'type NO_RECOIL')
end)

T('combat: INFINITE_AMMO après 2 lots sans recharge', function()
    submitted = {}
    RHODE.CombatGuard.ClearPlayer(105)
    -- lot 1: 15 tirs sans recharge → strike 1 (pas encore de signalement)
    RHODE.CombatGuard.Ingest(105, {}, { shots = 15, reloads = 0, pitchVar = 1, explosions = 0 })
    assertEq(#submitted, 0, 'premier lot: signal retenu')
    -- lot 2: encore 15 tirs sans recharge → signalement
    RHODE.CombatGuard.Ingest(105, {}, { shots = 15, reloads = 0, pitchVar = 1, explosions = 0 })
    assertEq(#submitted, 1, 'deuxième lot: détection')
    assertEq(submitted[1].type, RHODE.TYPES.INFINITE_AMMO, 'type INFINITE_AMMO')
end)

T('combat: EXPLOSION_SPAM au-delà du quota', function()
    submitted = {}
    RHODE.CombatGuard.Ingest(106, {}, { shots = 0, reloads = 0, pitchVar = 1, explosions = 7 })
    assertEq(#submitted, 1, 'une détection attendue')
    assertEq(submitted[1].type, RHODE.TYPES.EXPLOSION_SPAM, 'type EXPLOSION_SPAM')
    assertEq(submitted[1].source, RHODE.SOURCES.CLIENT, 'source client déclarative')
end)

T('combat: ClearPlayer purge les fenêtres (pas de fuite mémoire)', function()
    submitted = {}
    RHODE.CombatGuard.ClearPlayer(101)
    RHODE.CombatGuard.ClearPlayer(105)
    RHODE.CombatGuard.ClearPlayer(106)
    -- ré-ingère après purge: le joueur 101 repart de zéro
    local events = {
        { victimIsPlayer = true, head = true, dist = 30, weapon = 0, fatal = false },
    }
    RHODE.CombatGuard.Ingest(101, events, { shots = 0, reloads = 0, pitchVar = 1, explosions = 0 })
    assertEq(#submitted, 0, 'fenêtre vidée: aucune conclusion hâtive')
end)

T('rulebook: 20 règles — les 4 nouvelles fiches combat sont présentes', function()
    local expected = {
        ['RG-CMB-004'] = 'AIMBOT',
        ['RG-CMB-005'] = 'NO_RECOIL',
        ['RG-CMB-006'] = 'INFINITE_AMMO',
        ['RG-CMB-007'] = 'EXPLOSION_SPAM',
    }
    local n = 0
    for _ in pairs(RHODE.RULES) do n = n + 1 end
    assertEq(n >= 20, true, 'au moins 20 règles (obtenu: ' .. n .. ')')
    local found = {}
    for _, rule in pairs(RHODE.RULES) do
        if expected[rule.id] then
            assertEq(rule.type, expected[rule.id], 'type de ' .. rule.id)
            found[rule.id] = true
        end
    end
    for id in pairs(expected) do
        assertEq(found[id], true, 'fiche ' .. id .. ' manquante')
    end
end)

T('protocol: les 4 nouveaux types sont enregistrés', function()
    assertEq(RHODE.TYPES.AIMBOT, 'AIMBOT', 'AIMBOT')
    assertEq(RHODE.TYPES.NO_RECOIL, 'NO_RECOIL', 'NO_RECOIL')
    assertEq(RHODE.TYPES.INFINITE_AMMO, 'INFINITE_AMMO', 'INFINITE_AMMO')
    assertEq(RHODE.TYPES.EXPLOSION_SPAM, 'EXPLOSION_SPAM', 'EXPLOSION_SPAM')
end)
