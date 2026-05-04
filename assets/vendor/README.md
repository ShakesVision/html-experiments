# Vendored Dependencies

Stable browser libraries and critical fonts should be copied here instead of being loaded from runtime CDNs.

Current policy:

- Localize dependencies when licensing and file size are reasonable.
- Keep live service SDKs or APIs remote only when the tool cannot function without that service.
- Pin remote URLs to exact versions where possible.
- Document every approved remote host in `scripts/audit-third-party.js`.

The first production pass adds the policy and CI audit. The existing tools still include approved remote exceptions that should be migrated gradually.
