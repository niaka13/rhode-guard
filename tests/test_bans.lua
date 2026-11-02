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

T('ban: les preuves survivent à une reconnexion, expirent dans la fenêtre et appliquent le palier', function()
    local oldConfig = Config
    local oldTime = os.time
    local oldPlayerName = GetPlayerName
    local oldIdentifier = GetPlayerIdentifierByType
    local oldDropPlayer = DropPlayer
    local oldPrint = print
    local oldSql = RHODE.OxMySQL
    local oldBypass = RHODE.Permissions.IsBypassed

    local now = 1000
    local connected, issued, dropped = {}, {}, nil
    local ok, err = pcall(function()
        Config = {
            AutoBan = {
                enabled = true, windowMinutes = 10, threshold = 4,
                minModules = 2, minTypes = 2, minConfidence = 85,
                repeatedTeleportThreshold = 4, repeatedSpeedThreshold = 6,
                levels = {
                    { name = '24 h', durationHours = 24 },
                    { name = '7 j', durationHours = 168 },
                    { name = '30 j', durationHours = 720 },
                    { name = 'permanent', permanent = true },
                },
            },
            Messages = { banned = 'Sanction : %s' },
        }
        os.time = function() return now end
        GetPlayerName = function(src) return connected[src] and ('Joueur ' .. src) or nil end
        GetPlayerIdentifierByType = function(src, kind)
            return kind == 'license' and connected[src] or nil
        end
        DropPlayer = function(src) dropped = src end
        print = function() end
        RHODE.Permissions.IsBypassed = function() return false end
        RHODE.OxMySQL = {
            Available = function() return true end,
            GetBanCount = function(_, cb) cb(0, true) end,
            IssueBan = function(ban, cb)
                issued[#issued + 1] = ban
                cb(true)
            end,
        }

        local license = 'license:abc123'
        local function observe(src, module, eventType, severity)
            return RHODE.Bans.Observe({
                src = src, license = license, name = 'Testeur',
                module = module, type = eventType, severity = severity,
                confidence = 95, source = RHODE.SOURCES.SERVEUR,
                caseRef = 'TEST-BAN-LEVEL',
            })
        end

        connected[101] = license
        observe(101, 'teleport', 'TELEPORT', 'HIGH')
        observe(101, 'teleport', 'TELEPORT', 'HIGH')
        RHODE.Bans.ClearPlayer(101)
        connected[101] = nil
        connected[102] = license
        observe(102, 'economy', 'DUPLICATION', 'CRITICAL')
        observe(102, 'speed', 'SPEEDHACK', 'HIGH')

        assertEq(#issued, 1, 'les preuves recoupées après reconnexion déclenchent une sanction')
        assertEq(issued[1].banCount, 1, 'première sanction enregistrée au premier palier')
        assertEq(issued[1].expiresAt, now + 24 * 3600, 'premier palier configuré à 24 heures')
        assertEq(dropped, 102, 'la session actuellement liée à la licence est expulsée')

        local secondLicense = 'license:def456'
        connected[201] = secondLicense
        now = 2000
        RHODE.Bans.Observe({
            src = 201, license = secondLicense, module = 'teleport', type = 'TELEPORT',
            severity = 'HIGH', confidence = 95, source = RHODE.SOURCES.SERVEUR,
        })
        RHODE.Bans.ClearPlayer(201)
        connected[201] = nil
        connected[202] = secondLicense
        now = 2601 -- 601 secondes : la première preuve dépasse la fenêtre de 10 minutes.
        RHODE.Bans.Observe({
            src = 202, license = secondLicense, module = 'teleport', type = 'TELEPORT',
            severity = 'HIGH', confidence = 95, source = RHODE.SOURCES.SERVEUR,
        })
        RHODE.Bans.Observe({
            src = 202, license = secondLicense, module = 'economy', type = 'DUPLICATION',
            severity = 'CRITICAL', confidence = 95, source = RHODE.SOURCES.SERVEUR,
        })
        RHODE.Bans.Observe({
            src = 202, license = secondLicense, module = 'speed', type = 'SPEEDHACK',
            severity = 'HIGH', confidence = 95, source = RHODE.SOURCES.SERVEUR,
        })
        assertEq(#issued, 1, 'une preuve expirée ne contribue plus au seuil')
    end)

    Config = oldConfig
    os.time = oldTime
    GetPlayerName = oldPlayerName
    GetPlayerIdentifierByType = oldIdentifier
    DropPlayer = oldDropPlayer
    print = oldPrint
    RHODE.OxMySQL = oldSql
    RHODE.Permissions.IsBypassed = oldBypass
    if not ok then error(err) end
end)

T('ban: Evidence.Submit conserve la session uniquement pour expulser après écriture SQL', function()
    local oldEvidence = RHODE.Evidence
    local oldCase, oldPanel = RHODE.Case, RHODE.Panel
    local oldSql = RHODE.OxMySQL
    local oldConfig = Config
    local oldTime = os.time
    local oldHash = GetHashString
    local oldPlayerName = GetPlayerName
    local oldIdentifier = GetPlayerIdentifierByType
    local oldDropPlayer = DropPlayer
    local oldPrint = print
    local oldBypass = RHODE.Permissions.IsBypassed

    local now = 9000
    local license = 'license:evidence-session-integration'
    local issued, dropped = {}, nil
    local ok, err = pcall(function()
        local runnerDir = (arg and arg[0] or 'tests/run_tests.lua'):match('^(.*)[\\/]') or 'tests'
        local root = runnerDir .. '/..'
        GetHashString = function(value) return #value end
        RHODE.Evidence = {}
        dofile(root .. '/server/services/EvidenceService.lua')

        Config = {
            AutoBan = {
                enabled = true, windowMinutes = 10, threshold = 1,
                minModules = 1, minTypes = 1, minConfidence = 85,
                levels = { { name = '24 h', durationHours = 24 } },
            },
            Messages = { banned = 'Sanction : %s' },
        }
        os.time = function() return now end
        GetPlayerName = function(src) return src == 501 and 'Joueur de test' or nil end
        GetPlayerIdentifierByType = function(src, kind)
            return src == 501 and kind == 'license' and license or nil
        end
        DropPlayer = function(src) dropped = src end
        print = function() end
        RHODE.Case = nil
        RHODE.Panel = { IsConfigured = function() return false end }
        RHODE.Permissions.IsBypassed = function() return false end
        RHODE.OxMySQL = {
            Available = function() return true end,
            GetBanCount = function(_, cb) cb(0, true) end,
            IssueBan = function(ban, cb)
                issued[#issued + 1] = ban
                cb(true)
            end,
            StoreIncident = function() return true end,
        }

        RHODE.Evidence.Submit({
            src = 501, license = license, name = 'Joueur de test',
            module = 'economy', type = 'DUPLICATION', severity = 'CRITICAL',
            confidence = 99, source = RHODE.SOURCES.SERVEUR,
            facts = { transactionConflict = true },
        })

        assertEq(#issued, 1, 'la preuve créée atteint la décision et l’écriture du ban')
        assertEq(issued[1].expiresAt, now + 24 * 3600, 'le premier palier garde sa durée configurée')
        assertEq(dropped, 501, 'le joueur de la session fautive est expulsé après écriture SQL')
    end)

    RHODE.Evidence = oldEvidence
    RHODE.Case, RHODE.Panel = oldCase, oldPanel
    RHODE.OxMySQL = oldSql
    Config = oldConfig
    os.time = oldTime
    GetHashString = oldHash
    GetPlayerName = oldPlayerName
    GetPlayerIdentifierByType = oldIdentifier
    DropPlayer = oldDropPlayer
    print = oldPrint
    RHODE.Permissions.IsBypassed = oldBypass
    if not ok then error(err) end
end)
