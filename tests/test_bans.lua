-- Garde-fous purs pour le ban automatique. Aucun DropPlayer ni SQL n'est exécuté.
T('ban: rejette toute preuve provenant du client', function()
    assertEq(RHODE.Bans.IsQualifyingEvidence({
        source = RHODE.SOURCES.CLIENT, module = 'teleport', type = 'TELEPORT',
        severity = 'CRITICAL', confidence = 100,
    }), false, 'un signal client ne peut pas alimenter un ban')
end)

T('ban: rejette les combats client même si une ancienne version les marquait serveur', function()
    assertEq(RHODE.Bans.IsQualifyingEvidence({
        source = RHODE.SOURCES.SERVEUR, module = 'combat', type = 'AIMBOT',
        severity = 'CRITICAL', confidence = 100,
    }), false, 'le module combat n’est pas autoritaire')
end)

T('ban: accepte seulement un type allowlisté et mesuré serveur', function()
    assertEq(RHODE.Bans.IsQualifyingEvidence({
        source = RHODE.SOURCES.SERVEUR, module = 'teleport', type = 'TELEPORT',
        severity = 'HIGH', confidence = 92,
    }), true, 'le déplacement vient d’une mesure côté serveur')
end)

T('ban: une seule alerte ne satisfait jamais le seuil', function()
    local ok = RHODE.Bans.Assess({
        { module = 'economy', type = 'DUPLICATION', severity = 'CRITICAL' },
    }, { threshold = 4, minModules = 2, minTypes = 2 })
    assertEq(ok, false, 'un incident isolé ne bannit pas')
end)

T('ban: exige plusieurs preuves et plusieurs catégories', function()
    local rows = {
        { module = 'teleport', type = 'TELEPORT', severity = 'HIGH' },
        { module = 'teleport', type = 'TELEPORT', severity = 'HIGH' },
        { module = 'economy', type = 'DUPLICATION', severity = 'CRITICAL' },
        { module = 'economy', type = 'DUPLICATION', severity = 'CRITICAL' },
    }
    local ok = RHODE.Bans.Assess(rows, { threshold = 4, minModules = 2, minTypes = 2 })
    assertEq(ok, true, 'les preuves sévères recoupées atteignent le seuil')
end)

T('ban: plusieurs téléports répétés exigent aussi une autre catégorie', function()
    local rows = {
        { module = 'teleport', type = 'TELEPORT', severity = 'HIGH' },
        { module = 'teleport', type = 'TELEPORT', severity = 'HIGH' },
        { module = 'teleport', type = 'TELEPORT', severity = 'HIGH' },
        { module = 'teleport', type = 'TELEPORT', severity = 'HIGH' },
        { module = 'speed', type = 'SPEEDHACK', severity = 'MEDIUM' },
    }
    local ok = RHODE.Bans.Assess(rows, {
        threshold = 4, minModules = 2, minTypes = 2,
        repeatedTeleportThreshold = 4,
    })
    assertEq(ok, true, 'les téléports répétés sont recoupés par une autre mesure')
end)

T('ban: escalade configurée sur 24 h, 7 j, 30 j puis permanent', function()
    local cfg = { levels = {
        { name = '24 h', durationHours = 24 },
        { name = '7 j', durationHours = 168 },
        { name = '30 j', durationHours = 720 },
        { name = 'permanent', permanent = true },
    } }
    assertEq(RHODE.Bans.GetLevel(0, cfg).durationHours, 24, 'premier ban temporaire')
    assertEq(RHODE.Bans.GetLevel(1, cfg).durationHours, 168, 'récidive à 7 jours')
    assertEq(RHODE.Bans.GetLevel(2, cfg).durationHours, 720, 'récidive à 30 jours')
    assertEq(RHODE.Bans.GetLevel(3, cfg).permanent, true, 'quatrième sanction permanente')
    assertEq(RHODE.Bans.GetLevel(8, cfg).permanent, true, 'niveau maximal plafonné')
end)
