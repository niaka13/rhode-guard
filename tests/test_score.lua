--[[ Tests: RHODE.ComputeRisk (score de risque explicable) ]]

T('score: pondération par sévérité', function()
    local score, contribs = RHODE.ComputeRisk({
        { type = 'SPEEDHACK', severity = 'HIGH' },
        { type = 'SUPERJUMP', severity = 'MEDIUM' },
        { type = 'GODMODE', severity = 'CRITICAL' },
    })
    -- HIGH=4 + MEDIUM=2 + CRITICAL=6 = 12
    assertEq(score, 12, 'somme des pondérations')
    assertEq(#contribs, 3, 'chaque détection contribue explicitement')
end)

T('score: sévérité inconnue vaut 1 (défaut prudent)', function()
    local score = RHODE.ComputeRisk({ { type = 'X', severity = 'INCONNUE' } })
    assertEq(score, 1, 'poids par défaut = 1')
end)

T('score: liste vide → 0', function()
    local score = RHODE.ComputeRisk({})
    assertEq(score, 0, 'aucune détection → score nul')
end)

T('score: contributions traçables (type + poids)', function()
    local _, contribs = RHODE.ComputeRisk({ { type = 'TELEPORT', severity = 'HIGH' } })
    assertEq(contribs[1].type, 'TELEPORT', 'type tracé')
    assertEq(contribs[1].weight, 4, 'poids tracé')
    assertEq(contribs[1].severity, 'HIGH', 'sévérité tracée')
end)

T('mode: ENFORCE autorise les actions contraignantes, AUDIT non', function()
    assertEq(RHODE.ModeAllowsEnforce('ENFORCE'), true, 'ENFORCE → actions autorisées')
    assertEq(RHODE.ModeAllowsEnforce('AUDIT'), false, 'AUDIT → pas d\'action')
    assertEq(RHODE.ModeAllowsEnforce('OBSERVATION'), false, 'OBSERVATION → pas d\'action')
end)

T('round: arrondi stable', function()
    assertEq(RHODE.Round(12.345, 2), 12.35, 'arrondi 2 décimales')
    assertEq(RHODE.Round(12.5), 13, 'arrondi entier')
    assertEq(RHODE.Round(nil), 0, 'nil → 0 (pas de crash)')
end)
