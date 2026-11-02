-- Vérifie que les ACE staff sont revérifiés à chaque action.
T('permissions: révocation ACE retire immédiatement le bypass', function()
    local granted = false
    IsPlayerAceAllowed = function(src, ace)
        return src == 501 and ace == 'rhode.bypass' and granted
    end

    assertEq(RHODE.Permissions.IsBypassed(501), false, 'sans ACE, le joueur est surveillé')
    granted = true
    assertEq(RHODE.Permissions.IsBypassed(501), true, 'ACE accorde le bypass')
    granted = false
    assertEq(RHODE.Permissions.IsBypassed(501), false, 'la révocation ACE est immédiate')
end)

T('permissions: le bypass n’accorde pas un passe-droit à la console', function()
    IsPlayerAceAllowed = function() return true end
    assertEq(RHODE.Permissions.IsBypassed(0), false, 'la console n’est pas un joueur bypassé')
end)

T('permissions: l’accès staff est évalué dynamiquement', function()
    local staff = false
    IsPlayerAceAllowed = function(src, ace)
        return src == 502 and ace == 'rhode.staff' and staff
    end

    assertEq(RHODE.Permissions.IsStaff(502), false, 'pas d’accès sans ACE')
    staff = true
    assertEq(RHODE.Permissions.IsStaff(502), true, 'accès autorisé par ACE')
    staff = false
    assertEq(RHODE.Permissions.IsStaff(502), false, 'révocation staff appliquée immédiatement')
end)

T('permissions: console et ACE déterminent les kicks', function()
    local canKick = false
    IsPlayerAceAllowed = function(src, ace)
        return src == 503 and ace == 'rhode.kick' and canKick
    end

    assertEq(RHODE.Permissions.CanKick(0), true, 'console autorisée')
    assertEq(RHODE.Permissions.CanKick(503), false, 'joueur sans ACE refusé')
    canKick = true
    assertEq(RHODE.Permissions.CanKick(503), true, 'joueur avec ACE autorisé')
end)
