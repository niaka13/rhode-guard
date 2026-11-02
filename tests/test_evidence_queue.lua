T('preuves: la file attend l’acquittement panel et suspend sans perte', function()
    local oldEvidence, oldPanel = RHODE.Evidence, RHODE.Panel
    local oldSql, oldPrint = RHODE.OxMySQL, print
    local ok, err = pcall(function()
        RHODE.Evidence = {}
        RHODE.OxMySQL = nil
        print = function() end
        local root = ((arg and arg[0] or 'tests/run_tests.lua'):match('^(.*)[\\/]') or 'tests') .. '/..'
        dofile(root .. '/server/services/EvidenceService.lua')

        local requests = {}
        RHODE.Panel = {
            IsConfigured = function() return true end,
            Post = function(path, body, cb)
                requests[#requests + 1] = { path = path, body = body, cb = cb }
            end,
        }

        RHODE.Evidence.EnqueueLocal({ incidentId = 'RG-test-1', license = 'license:test', name = 'Test', type = 'A', severity = 'HIGH' })
        RHODE.Evidence.EnqueueLocal({ incidentId = 'RG-test-2', license = 'license:test', name = 'Test', type = 'B', severity = 'CRITICAL' })
        RHODE.Evidence.FlushQueue()
        assertEq(#requests, 1, 'un seul envoi est actif à la fois')
        RHODE.Evidence.FlushQueue()
        assertEq(#requests, 1, 'un rejeu concurrent ne duplique pas les requêtes')
        assertEq(RHODE.Evidence.QueueSize(), 2, 'la preuve reste en file tant que le panel ne répond pas')

        requests[1].cb(503, nil)
        assertEq(RHODE.Evidence.QueueSize(), 2, 'une erreur HTTP ne supprime aucune preuve')

        RHODE.Evidence.FlushQueue()
        assertEq(#requests, 2, 'un nouvel essai reprend la première preuve')
        requests[2].cb(200, nil)
        assertEq(#requests, 3, 'la suivante part après acquittement de la première')
        requests[3].cb(200, nil)
        assertEq(RHODE.Evidence.QueueSize(), 0, 'la file est vidée après les deux acquittements')
        assertEq(requests[1].body.details.incidentId, 'RG-test-1', 'ordre chronologique conservé')
        assertEq(requests[3].body.details.incidentId, 'RG-test-2', 'la preuve critique est aussi transmise')
    end)

    RHODE.Evidence, RHODE.Panel = oldEvidence, oldPanel
    RHODE.OxMySQL, print = oldSql, oldPrint
    if not ok then error(err) end
end)
