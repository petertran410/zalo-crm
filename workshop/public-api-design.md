# Workshop Check-in Public API v1

## Decisions

- Public contract is isolated under `/api/public/v1`; existing `/api/*` routes remain unchanged.
- Versioning uses a URL prefix because it is explicit, cache-friendly, and easy for integrators to discover.
- Authentication uses an `X-API-Key` header. Keys are stored as SHA-256 hashes and the plaintext is returned only once.
- Authorization uses per-key scopes. Admins manage keys from `/admin/cai-dat?tab=public-api`.
- Each key is limited to 120 requests per minute. Rate-limit state is stored in Redis.
- Public responses always use `{ data, meta, error }`. Collection responses include pagination metadata.
- Mutating endpoints accept `Idempotency-Key`; successful responses are cached for 24 hours per API key and path.
- Public projections do not expose guest notes, source provenance, creator identity, sync state, or internal errors.

## Scopes

| Scope | Capability |
| --- | --- |
| `workshops.read` | List and read workshops and landing data |
| `guests.read` | List, search, and read guests |
| `guests.write` | Create a guest through the self-registration flow |
| `checkin.read` | Read check-in logs |
| `checkin.manage` | Read guest QR data and perform check-in |
| `registration_forms.read` | Read a registration form by token |
| `registration_forms.write` | Submit a registration form |

## Compatibility

The public API wraps existing business services but uses independent schemas, authentication, rate limiting, and error handling. No internal frontend caller must adopt the public envelope.
