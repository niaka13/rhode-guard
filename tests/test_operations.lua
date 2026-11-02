--[[ Tests: RHODE.OPS (machine d'opérations + idempotence pure) — §23/§27/§28 ]]

T('ops: transitions valides du cycle nominal', function()
    assertEq(RHODE.OPS.CanTransition('REQUESTED', 'VALIDATED'), true)
    assertEq(RHODE.OPS.CanTransition('VALIDATED', 'IN_PROGRESS'), true)
    assertEq(RHODE.OPS.CanTransition('IN_PROGRESS', 'SUCCEEDED'), true)
end)

T('ops: rejet/échec accessibles aux bonnes étapes', function()
    assertEq(RHODE.OPS.CanTransition('REQUESTED', 'REJECTED'), true)
    assertEq(RHODE.OPS.CanTransition('VALIDATED', 'REJECTED'), true)
    assertEq(RHODE.OPS.CanTransition('VALIDATED', 'IN_PROGRESS'), true)
    assertEq(RHODE.OPS.CanTransition('IN_PROGRESS', 'FAILED'), true)
    assertEq(RHODE.OPS.CanTransition('IN_PROGRESS', 'COMPENSATION_REQUIRED'), true)
end)

T('ops: états terminaux sans sortie (refus par défaut)', function()
    for _, terminal in ipairs({ 'SUCCEEDED', 'REJECTED', 'FAILED' }) do
        for state in pairs(RHODE.OPS.STATES) do
            assertEq(RHODE.OPS.CanTransition(terminal, state), false, terminal .. ' → ' .. state)
        end
    end
end)

T('ops: le client ne peut pas sauter des étapes (REQUESTED → SUCCEEDED interdit)', function()
    assertEq(RHODE.OPS.CanTransition('REQUESTED', 'SUCCEEDED'), false)
    assertEq(RHODE.OPS.CanTransition('REQUESTED', 'IN_PROGRESS'), false)
    assertEq(RHODE.OPS.CanTransition('VALIDATED', 'SUCCEEDED'), false)
end)

T('ops: compensation peut aboutir ou échouer, pas rejeter', function()
    assertEq(RHODE.OPS.CanTransition('COMPENSATION_REQUIRED', 'SUCCEEDED'), true)
    assertEq(RHODE.OPS.CanTransition('COMPENSATION_REQUIRED', 'FAILED'), true)
    assertEq(RHODE.OPS.CanTransition('COMPENSATION_REQUIRED', 'REJECTED'), false)
end)

T('idempotence: première opération = new', function()
    local store = {}
    local v = RHODE.OPS.IdemBegin(store, 'k1', 'p1', 1000, 600)
    assertEq(v.action, 'new')
end)

T('idempotence: même clé + même contenu = replay du résultat (pas de recrédit)', function()
    local store = {}
    RHODE.OPS.IdemCommit(store, 'k1', 'p1', 'SUCCEEDED', { credited = 500 }, 1000, 600)
    local v = RHODE.OPS.IdemBegin(store, 'k1', 'p1', 1100, 600)
    assertEq(v.action, 'replay')
    assertEq(v.state, 'SUCCEEDED')
    assertEq(v.result.credited, 500)
end)

T('idempotence: même clé + contenu DIFFÉRENT = conflit (RG-ECO-002)', function()
    local store = {}
    RHODE.OPS.IdemCommit(store, 'k1', 'p1', 'SUCCEEDED', { credited = 500 }, 1000, 600)
    local v = RHODE.OPS.IdemBegin(store, 'k1', 'p2', 1100, 600)
    assertEq(v.action, 'conflict')
end)

T('idempotence: entrée expirée → purge puis new (TTL borné)', function()
    local store = {}
    RHODE.OPS.IdemCommit(store, 'k1', 'p1', 'SUCCEEDED', {}, 1000, 600)
    local v = RHODE.OPS.IdemBegin(store, 'k1', 'p1', 2000, 600) -- 1000s plus tard
    assertEq(v.action, 'expired')
    local v2 = RHODE.OPS.IdemBegin(store, 'k1', 'p1', 2000, 600)
    assertEq(v2.action, 'new')
end)

T('idempotence: purge bornée ne touche pas les entrées actives', function()
    local store = {}
    RHODE.OPS.IdemCommit(store, 'actif', 'p', 'SUCCEEDED', {}, 1000, 600)
    RHODE.OPS.IdemCommit(store, 'vieux', 'p', 'SUCCEEDED', {}, 100, 600)
    local purged = RHODE.OPS.IdemPurge(store, 1000)
    assertEq(purged, 1)
    assertEq(store['actif'] ~= nil, true)
    assertEq(store['vieux'] ~= nil, false)
end)

T('idempotence: une opération rejetée rejouée reste rejetée (retry inoffensif)', function()
    local store = {}
    RHODE.OPS.IdemCommit(store, 'k', 'p', 'REJECTED', { reason = 'stock' }, 1000, 600)
    local v = RHODE.OPS.IdemBegin(store, 'k', 'p', 1200, 600)
    assertEq(v.action, 'replay')
    assertEq(v.state, 'REJECTED')
end)

T('canonical: sérialisation stable (ordre des clés indépendant)', function()
    local a = RHODE.OPS.Canonical({ x = 1, y = { b = 2, a = 3 } })
    local b = RHODE.OPS.Canonical({ y = { a = 3, b = 2 }, x = 1 })
    assertEq(a, b, 'deux tables équivalentes → même canonical')
end)

T('canonical: contenu différent → canonical différent', function()
    local a = RHODE.OPS.Canonical({ amount = 100 })
    local b = RHODE.OPS.Canonical({ amount = 200 })
    assertEq(a ~= b, true)
end)
