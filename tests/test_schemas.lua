--[[ Tests: RHODE.Validate (schémas d'événements) ]]

T('schéma: payload valide accepté', function()
    local ok = RHODE.Validate('rhode_guard:report', {
        token = 'abc123',
        module = 'speedhack',
        payload = { vitesse = 42.5 },
    })
    assertEq(ok, true, 'payload conforme attendu')
end)

T('schéma: champ requis manquant rejeté', function()
    local ok = RHODE.Validate('rhode_guard:report', { module = 'speedhack' })
    assertEq(ok, false, 'token manquant doit être rejeté')
end)

T('schéma: type inattendu rejeté (module en number)', function()
    local ok = RHODE.Validate('rhode_guard:report', { token = 'x', module = 42, payload = {} })
    assertEq(ok, false, 'module number doit être rejeté')
end)

T('schéma: NaN rejeté (nombre corrompu)', function()
    local ok = RHODE.Validate('rhode_guard:vehicle', { token = 'x', model = 0 / 0 })
    assertEq(ok, false, 'NaN doit être rejeté')
end)

T('schéma: infini rejeté', function()
    local ok = RHODE.Validate('rhode_guard:vehicle', { token = 'x', model = math.huge })
    assertEq(ok, false, 'infini doit être rejeté')
end)

T('schéma: valeur hors bornes rejetée', function()
    local ok = RHODE.Validate('rhode_guard:vehicle', { token = 'x', model = -1 })
    assertEq(ok, false, 'model négatif doit être rejeté')
    local ok2 = RHODE.Validate('rhode_guard:vehicle', { token = 'x', model = 99999999999 })
    assertEq(ok2, false, 'model > 2^32-1 doit être rejeté')
end)

T('schéma: chaîne excessive rejetée', function()
    local ok = RHODE.Validate('rhode_guard:report', {
        token = string.rep('a', 300),
        module = 'speedhack',
        payload = {},
    })
    assertEq(ok, false, 'token de 300 caractères doit être rejeté')
end)

T('schéma: tableau excessif rejeté', function()
    local samples = {}
    for i = 1, 40 do samples[i] = { x = i } end
    local ok = RHODE.Validate('rhode_guard:telemetry', { token = 'x', samples = samples })
    assertEq(ok, false, '40 échantillons (max 32) doivent être rejetés')
end)

T('schéma: profondeur excessive rejetée', function()
    local deep = { a = { b = { c = { d = { e = 1 } } } } }
    local ok = RHODE.Validate('rhode_guard:report', { token = 'x', module = 'm', payload = deep })
    assertEq(ok, false, 'profondeur 5 (max 3) doit être rejetée')
end)

T('schéma: cycle ne provoque pas de boucle infinie', function()
    local cyclic = {}
    cyclic.self = cyclic
    local ok = RHODE.Validate('rhode_guard:report', { token = 'x', module = 'm', payload = cyclic })
    assertEq(ok, true, 'le cycle est borné par TableDepth (pas de crash)')
end)

T('schéma: schéma inconnu rejeté', function()
    local ok = RHODE.Validate('evenement:inconnu', {})
    assertEq(ok, false, 'schéma non enregistré doit être refusé')
end)

T('schéma: coercition nombre depuis chaîne', function()
    local data = { token = 'x', model = '12345' }
    local ok = RHODE.Validate('rhode_guard:vehicle', data)
    assertEq(ok, true, 'nombre en chaîne accepté et coercé')
    assertEq(data.model, 12345, 'coercition appliquée')
end)

T('schéma: payload non-table rejeté', function()
    local ok = RHODE.Validate('rhode_guard:report', 'pas une table')
    assertEq(ok, false, 'payload string doit être rejeté')
end)
