# Public API Guide

Base path: `/api/public/v1`

Interactive documentation:

- Swagger UI: `/api/public/v1/docs`
- ReDoc: `/api/public/v1/redoc`
- OpenAPI JSON: `/api/public/v1/openapi.json`

## Create an API key

Open `/admin/cai-dat?tab=public-api`, enter an integration name, select scopes, and create the key. Copy the `wk_live_...` secret immediately; it is displayed only once.

## Authentication

```bash
curl -H "X-API-Key: wk_live_REPLACE_ME" \
  "https://your-host/api/public/v1/workshops?page=1&per_page=20"
```

## Response envelope

Successful collection:

```json
{
  "data": [],
  "meta": { "page": 1, "per_page": 20, "total": 0, "total_pages": 0 },
  "error": null
}
```

Successful resource:

```json
{ "data": { "id": "..." }, "meta": null, "error": null }
```

Error:

```json
{
  "data": null,
  "meta": null,
  "error": { "code": "UNAUTHORIZED", "message": "API key is required", "details": null }
}
```

## Pagination and rate limits

Collection endpoints accept `page` and `per_page`; `per_page` is capped at 100. Every authenticated response includes:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

When the 120 requests/minute limit is exceeded, the API returns `429` and `Retry-After`.

## Idempotent mutations

Use a unique `Idempotency-Key` for check-in and registration requests:

```bash
curl -X POST \
  -H "X-API-Key: wk_live_REPLACE_ME" \
  -H "Idempotency-Key: registration-2026-0001" \
  -H "Content-Type: application/json" \
  -d '{"workshop_id":"...","full_name":"Nguyen Van A","phone":"0909123456","party_size":1,"source":"Website"}' \
  "https://your-host/api/public/v1/registration-forms/FORM_TOKEN/submissions"
```

Repeating the same API key, path, and idempotency key within 24 hours returns the stored response.

## Main resources

- `GET /workshops`
- `GET /workshops/{id-or-slug}`
- `GET /workshops/{slug}/landing`
- `GET /workshops/{workshop_id}/guests`
- `POST /workshops/{workshop_id}/guests/self-register`
- `GET /guests/lookup`
- `GET /guests/{guest_id}`
- `GET /guests/{guest_id}/qr`
- `POST /checkins`
- `GET /checkins/logs`
- `GET /registration-forms/{token}`
- `POST /registration-forms/{token}/submissions`
