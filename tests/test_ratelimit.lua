--[[ Tests: RHODE.RateLimit (fenêtre glissante, horloge injectée) ]]

local function withClock(fn)
    RHODE.RateLimit._Reset()
    local t = 1000
    RHODE.RateLimit._Now = function() return t end
    local api = {
        advance = function(sec) t = t + sec end,
    }
    local ok, err = pcall(fn, api)
    RHODE.RateLimit._Now = nil
    if not ok then error(err, 0) end
end

T('ratelimit: sous la limite autorisé', function()
    withClock(function()
        for i = 1, 5 do
            local ok = RHODE.RateLimit.Check('k', 5, 60)
            assertEq(ok, true, ('appel %d doit passer'):format(i))
        end
    end)
end)

T('ratelimit: au-delà de la limite refusé', function()
    withClock(function()
        for _ = 1, 5 do RHODE.RateLimit.Check('k', 5, 60) end
        local ok = RHODE.RateLimit.Check('k', 5, 60)
        assertEq(ok, false, 'le 6e appel en fenêtre doit être refusé')
    end)
end)

T('ratelimit: fenêtre glissante — expire après windowSec', function()
    withClock(function(clock)
        for _ = 1, 5 do RHODE.RateLimit.Check('k', 5, 60) end
        clock.advance(61) -- la fenêtre expire
        local ok = RHODE.RateLimit.Check('k', 5, 60)
        assertEq(ok, true, 'après expiration de la fenêtre, un appel doit passer')
    end)
end)

T('ratelimit: clés indépendantes', function()
    withClock(function()
        for _ = 1, 5 do RHODE.RateLimit.Check('joueur:1', 5, 60) end
        local ok = RHODE.RateLimit.Check('joueur:2', 5, 60)
        assertEq(ok, true, 'une autre clé a son propre quota')
    end)
end)

T('ratelimit: Count lit sans consommer', function()
    withClock(function()
        for _ = 1, 3 do RHODE.RateLimit.Check('k', 10, 60) end
        local n = RHODE.RateLimit.Count('k', 60)
        assertEq(n, 3, 'compte = 3')
        local n2 = RHODE.RateLimit.Count('k', 60)
        assertEq(n2, 3, 'Count ne consomme pas')
    end)
end)

T('ratelimit: ClearPlayer purge les clés du joueur', function()
    withClock(function()
        RHODE.RateLimit.Check('player:7:evt:x', 10, 60)
        RHODE.RateLimit.Check('player:7:economy', 10, 60)
        RHODE.RateLimit.Check('player:8:economy', 10, 60)
        RHODE.RateLimit.ClearPlayer(7)
        local ok = RHODE.RateLimit.Check('player:7:evt:x', 1, 60)
        assertEq(ok, true, 'après purge, le quota du joueur repart de zéro')
    end)
end)

T('ratelimit: Cleanup évacue les buckets inactifs', function()
    withClock(function(clock)
        RHODE.RateLimit.Check('vieux', 10, 60)
        clock.advance(1200) -- 20 min d'inactivité
        RHODE.RateLimit.Cleanup(600)
        -- un nouveau cycle doit repartir de zéro (bucket purgé)
        local ok1 = RHODE.RateLimit.Check('vieux', 1, 60)
        local ok2 = RHODE.RateLimit.Check('vieux', 1, 60)
        assertEq(ok1, true, 'bucket purgé → premier appel OK')
        assertEq(ok2, false, 'deuxième appel refusé (quota 1)')
    end)
end)
