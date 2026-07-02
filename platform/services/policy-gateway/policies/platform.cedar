// Platform reference policy set for C1 (policy-gateway).
//
// Model (see platform.cedarschema): Agent in Team; Action "invoke" (per-call) and "list"
// (tool-list filtering); Tool tagged env/danger/read_only/owner_team, owned by a Team.
// Default is deny; a forbid always overrides a permit. Optional attributes are `has`-guarded
// so a tool missing an attribute fails safe (permit does not apply -> deny; forbid still
// fires only when its attributes are present).
//
// Validated by policies_test.go (cedar-go parse + decision battery). Tiers: @tier("N")
// where N is 0 auto · 1 notify · 2 single-approval · 3 two-person.

@id("sre_invoke")
@tier("2")
permit (
    principal in Team::"sre",
    action == Action::"invoke",
    resource in Team::"sre"
) when {
    (resource has read_only && resource.read_only == true) ||
    (resource has env && resource.env != "prod")
};

@id("sre_list")
permit (
    principal in Team::"sre",
    action == Action::"list",
    resource in Team::"sre"
);

@id("platform_invoke")
@tier("2")
permit (
    principal in Team::"platform",
    action == Action::"invoke",
    resource in Team::"platform"
) when {
    (resource has read_only && resource.read_only == true) ||
    (resource has env && resource.env != "prod")
};

@id("platform_list")
permit (
    principal in Team::"platform",
    action == Action::"list",
    resource in Team::"platform"
);

// Dangerous prod tools are never auto-invocable — the guard the gatekeeper relies on to
// force escalation / block.
@id("forbid_prod_danger")
forbid (
    principal,
    action == Action::"invoke",
    resource
) when {
    resource has danger && resource.danger == true &&
    resource has env && resource.env == "prod"
} unless {
    principal == Agent::"human-operator"
};

// Break-glass: the human operator has full authority (two-person tier), audited.
@id("break_glass")
@tier("3")
permit (
    principal == Agent::"human-operator",
    action,
    resource
);
