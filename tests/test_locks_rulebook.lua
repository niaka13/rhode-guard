--[[ Tests: LockManager (verrous déterministes §27.3) + Rulebook (§17/§29) ]]

local function withClock(fn)
    RHODE.Locks._Reset()
    local t = 1000
    RHODE.Locks._Now = function() return t end
    local ok, err = pcall(fn, { advance = function(s) t = t + s end })
    RHODE.Locks._Now = nil
    if not ok then error(err, 0) end
end

T('locks: acquisition simple + libération', function()
    withClock(function()
        local token = RHODE.Locks.Acquire({ 'player:1' }, 't1')
        assertEq(token ~= nil, true, 'acquisition doit réussir')
        RHODE.Locks.Release(token, { 'player:1' })
        local token2 = RHODE.Locks.Acquire({ 'player:1' }, 't2')
        assertEq(token2 ~= nil, true, 'libérée → ré-acquérable')
    end)
end)

T('locks: contention entre détenteurs distincts', function()
    withClock(function()
        local t1 = RHODE.Locks.Acquire({ 'player:1' }, 'holder-a')
        assertEq(t1 ~= nil, true)
        local t2 = RHODE.Locks.Acquire({ 'player:1' }, 'holder-b')
        assertEq(t2, nil, 'un autre détenteur doit échouer')
    end)
end)

T('locks: ré-entrance pour le même détenteur logique', function()
    withClock(function()
        local t1 = RHODE.Locks.Acquire({ 'player:1' }, 'holder-a')
        local t1b = RHODE.Locks.Acquire({ 'player:1' }, 'holder-a')
        assertEq(t1b ~= nil, true, 'même détenteur → ré-entrant')
    end)
end)

T('locks: transferts concurrents A→B et B→A ne s\'entrebloquent pas', function()
    withClock(function()
        -- le détenteur A prend (1,2) trié; le détenteur B veut (2,1) trié → (1,2):
        -- l'un gagne, l'autre échoue proprement — jamais d'interblocage
        local ta = RHODE.Locks.Acquire({ 'player:2', 'player:1' }, 'transfer:1')
        assertEq(ta ~= nil, true)
        -- même détenteur logique: ré-entrant (compteur interne)
        local tb = RHODE.Locks.Acquire({ 'player:1', 'player:2' }, 'transfer:1')
        assertEq(tb ~= nil, true, 'même détenteur → ré-entrant')
        -- détenteur différent: contention immédiate, pas d'attente
        local tc = RHODE.Locks.Acquire({ 'player:1', 'player:2' }, 'transfer:2')
        assertEq(tc, nil, 'contention → échec immédiat')
        -- libération COMPLÈTE (une release par acquisition ré-entrante)
        RHODE.Locks.Release(ta, { 'player:1', 'player:2' })
        RHODE.Locks.Release(tb, { 'player:1', 'player:2' })
        local td = RHODE.Locks.Acquire({ 'player:1', 'player:2' }, 'transfer:2')
        assertEq(td ~= nil, true, 'après libération complète → ré-acquérable')
    end)
end)

T('locks: WithLocks libère TOUJOURS même en erreur (finally)', function()
    withClock(function()
        local ok, err = RHODE.Locks.WithLocks({ 'player:9' }, 'h', function()
            error('panne applicative')
        end)
        assertEq(ok, false)
        assertEq(tostring(err):find('panne applicative') ~= nil, true)
        -- le verrou doit être libéré malgré l'erreur
        local t2 = RHODE.Locks.Acquire({ 'player:9' }, 'h2')
        assertEq(t2 ~= nil, true, 'verrou libéré après erreur')
    end)
end)

T('locks: TTL prudent — verrou expiré ré-acquérable (compté)', function()
    withClock(function(clock)
        RHODE.Locks.Acquire({ 'k' }, 'slow-holder')
        clock.advance(11) -- dépasse le TTL de 10 s
        local t2 = RHODE.Locks.Acquire({ 'k' }, 'other')
        assertEq(t2 ~= nil, true, 'verrou expiré repris')
        assertEq(RHODE.Locks.Metrics().expired >= 1, true, 'expiration comptée')
    end)
end)

T('locks: échec partiel d\'un multi-verrou ne laisse rien acquis', function()
    withClock(function()
        RHODE.Locks.Acquire({ 'player:3' }, 'bloqueur') -- tient player:3
        local token = RHODE.Locks.Acquire({ 'player:4', 'player:3' }, 'victime')
        assertEq(token, nil, 'échec attendu sur player:3')
        -- player:4 ne doit PAS rester acquis
        local other = RHODE.Locks.Acquire({ 'player:4' }, 'autre')
        assertEq(other ~= nil, true, 'aucun verrou partiel résiduel')
    end)
end)

--[[ ==================== RULEBOOK ==================== ]]

T('rulebook: intégrité (IDs uniques, champs requis, types connus)', function()
    local errors = RHODE.RulebookCheck()
    assertEq(#errors, 0, table.concat(errors, ' | '))
end)

T('rulebook: 16 règles avec IDs RG-XXX-NNN stables', function()
    local n = 0
    for _ in pairs(RHODE.RULES) do n = n + 1 end
    assertEq(n >= 16, true, 'au moins 16 règles (obtenu: ' .. n .. ')')
    for _, rule in pairs(RHODE.RULES) do
        assertEq(rule.id:match('^RG%-[A-Z][A-Z][A-Z]%-%d%d%d$') ~= nil, true, 'format ID: ' .. rule.id)
    end
end)

T('rulebook: chaque règle documente ses faux positifs connus et son coût', function()
    for key, rule in pairs(RHODE.RULES) do
        assertEq(type(rule.fauxPositifs) == 'table' and #rule.fauxPositifs > 0, true, key .. ': faux positifs manquants')
        assertEq(rule.cout ~= nil, true, key .. ': coût manquant')
    end
end)

T('rulebook: recherche par module et par type', function()
    assertEq(RHODE.RuleFor('teleport').id, 'RG-MOV-001')
    assertEq(RHODE.RuleForType('DUPLICATION').id, 'RG-ECO-002')
    assertEq(RHODE.RuleFor('module_inexistant'), nil)
end)

T('rulebook: les règles purement client sont marquées (confiance bornée §29)', function()
    local fly = RHODE.RuleFor('fly')
    assertEq(fly.corroboration ~= nil, true, 'la corroboration doit être explicite')
    assertEq(fly.corroboration:find('client') ~= nil, true, 'fly = signal client déclaré comme tel')
end)
