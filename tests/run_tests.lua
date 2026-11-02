--[[
    RHODE GUARD ULTIMATE — Runner de tests unitaires (Lua pur, sans FXServer)
    Exécution: lua54 tests/run_tests.lua   (ou lua5.3 / luajit)
    Couverture: schémas de validation, rate-limit, score de risque.

    Ces tests ne couvrent PAS les natives FiveM (voir docs/SECURITE.md,
    section validation — tests FXServer en préproduction obligatoires).
]]

local tests = {}
local failed = 0

function T(name, fn)
    tests[#tests + 1] = { name = name, fn = fn }
end

local function assertEq(a, b, msg)
    if a ~= b then
        error(('%s (attendu: %s, obtenu: %s)'):format(msg or 'égalité', tostring(b), tostring(a)), 2)
    end
end
_G.assertEq = assertEq

-- résolution du répertoire racine de la ressource
local scriptDir = (arg and arg[0] or 'tests/run_tests.lua'):match('^(.*)[\\/]') or '.'
local root = scriptDir .. '/..'

-- charge les modules PURS (aucune native FiveM)
dofile(root .. '/shared/protocol.lua')
dofile(root .. '/shared/schemas.lua')
dofile(root .. '/shared/rulebook.lua')
dofile(root .. '/shared/operations.lua')
dofile(root .. '/server/services/RateLimit.lua')
dofile(root .. '/server/services/LockManager.lua')
-- CombatGuard: aucune native n'est appelée au chargement (uniquement à l'exécution),
-- les mocks de test (Evidence, natives, Config) sont définis par test_combat.lua avant
-- que les fonctions de test ne s'exécutent.
dofile(root .. '/server/services/CombatGuard.lua')
RegisterCommand = RegisterCommand or function() end
dofile(root .. '/server/services/BanService.lua')

-- charge les suites
dofile(scriptDir .. '/test_schemas.lua')
dofile(scriptDir .. '/test_ratelimit.lua')
dofile(scriptDir .. '/test_score.lua')
dofile(scriptDir .. '/test_operations.lua')
dofile(scriptDir .. '/test_locks_rulebook.lua')
dofile(scriptDir .. '/test_combat.lua')
dofile(scriptDir .. '/test_bans.lua')
print('================================================')
print(' RHODE GUARD ULTIMATE v2.4 — tests unitaires (Lua pur)')
print('================================================')

for _, t in ipairs(tests) do
    local ok, err = pcall(t.fn)
    if ok then
        print(('  [OK]      %s'):format(t.name))
    else
        failed = failed + 1
        print(('  [ÉCHEC]   %s\n            → %s'):format(t.name, tostring(err)))
    end
end

print('------------------------------------------------')
print((' %d test(s), %d échec(s)'):format(#tests, failed))
print('================================================')

if failed > 0 and arg and arg[0] then
    os.exit(1)
end
