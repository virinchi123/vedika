# Vedika API Reference

Vedika exposes `49` JSON endpoints: `1` health check, `5` auth routes, and `43` protected business routes.

## Shared Conventions

- Base URL: the app defaults to `http://localhost:3000`, but the port is configurable.
- Content type: request and response bodies are JSON unless an endpoint returns `204 No Content`.
- Error envelope:

```json
{
  "error": "Human-readable message"
}
```

- Protected endpoints require `Authorization: Bearer <accessToken>`.
- Missing or malformed bearer tokens return `401` with `Invalid or missing access token.`.
- Expired or invalid bearer tokens return `401` with `Invalid or expired access token.`.
- List endpoints sort by `createdAt` descending, then `id` descending.
- Cursor pagination:
  - Query params: `limit?: integer`, `cursor?: string`
  - Default `limit`: `20`
  - Max `limit`: `100`
  - `cursor` is opaque and should be treated as an unreadable string
- Date and time formats:
  - Datetimes use ISO-8601 UTC strings such as `2026-04-20T10:00:00.000Z`
  - `fromDate` and `toDate` filters use `YYYY-MM-DD`
  - `defaultStartTime` responses use `HH:mm:ss`
  - `defaultStartTime` updates accept `HH:mm` or `HH:mm:ss`
- `PUT` endpoints are full replacements, not partial updates.
- Blank optional strings are usually normalized to `null`.
- Omitted relationship arrays behave as empty arrays for:
  - `serviceProviderIds` on event-booking create
  - `eventBookingIds` on customer-interaction create and update
- `PUT /event-bookings/{id}` requires `serviceProviderIds`; send `[]` to clear all linked providers.

## Shared Shapes

### User

```json
{
  "id": "uuid",
  "emailAddress": "person@example.com",
  "phoneNumber": null,
  "createdAt": "2026-04-12T10:00:00.000Z",
  "updatedAt": "2026-04-12T10:00:00.000Z"
}
```

### PageInfo

```json
{
  "limit": 20,
  "hasNextPage": false,
  "nextCursor": null
}
```

## Enums

- `EventBookingMode`: `PHONE_IN`, `WALK_IN`
- `CustomerInteractionType`: `WALK_IN`, `PHONE_IN`, `MISSED_CALL`
- `FollowupType`: `BOOKING`, `SERVICE`
- `PaymentMode`: `CASH`, `BANK_TRANSFER`, `UPI`
- `CalendarEventType`: `event_booking`, `followup`

## Health

### GET /health

Returns a simple liveness payload with the current server timestamp.

- Auth: none
- Request: no path params, query params, or body
- Success `200`:

```json
{
  "status": "ok",
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

- Common errors: none expected during normal operation

## Auth

### POST /auth/register

Creates a new user account and immediately opens an authenticated session. The response includes both tokens plus the public user record.

- Auth: none
- Request body:

```json
{
  "emailAddress": "person@example.com",
  "password": "password123",
  "deviceName": "Pixel 9"
}
```

- Success `201`:

```json
{
  "accessToken": "jwt",
  "refreshToken": "opaque-refresh-token",
  "user": {
    "id": "uuid",
    "emailAddress": "person@example.com",
    "phoneNumber": null,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z"
  }
}
```

- Common errors:
  - `400` invalid email, password, or string field types
  - `409` duplicate email address
  - `429` too many authentication attempts

### POST /auth/login

Authenticates an existing user and creates a new session. The response shape matches registration.

- Auth: none
- Request body:

```json
{
  "emailAddress": "person@example.com",
  "password": "password123",
  "deviceName": "iPhone 16"
}
```

- Success `200`:

```json
{
  "accessToken": "jwt",
  "refreshToken": "opaque-refresh-token",
  "user": {
    "id": "uuid",
    "emailAddress": "person@example.com",
    "phoneNumber": null,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z"
  }
}
```

- Common errors:
  - `400` invalid email, password, or string field types
  - `401` invalid email or password
  - `429` too many authentication attempts

### POST /auth/refresh

Rotates a refresh token in place and returns a new access token plus a new refresh token for the same session.

- Auth: none
- Request body:

```json
{
  "refreshToken": "opaque-refresh-token",
  "deviceName": "Updated Device"
}
```

- Success `200`:

```json
{
  "accessToken": "jwt",
  "refreshToken": "new-opaque-refresh-token",
  "user": {
    "id": "uuid",
    "emailAddress": "person@example.com",
    "phoneNumber": null,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z"
  }
}
```

- Common errors:
  - `400` missing or invalid `refreshToken` type
  - `401` invalid refresh token
  - `429` too many authentication attempts

### POST /auth/logout

Revokes the session identified by the supplied refresh token. This route is idempotent and returns `204` even if the token does not match an active session.

- Auth: none
- Request body:

```json
{
  "refreshToken": "opaque-refresh-token"
}
```

- Success `204`: no response body
- Common errors:
  - `400` missing or invalid `refreshToken` type

### GET /auth/me

Returns the currently authenticated user derived from the bearer token. The response never exposes `sessionId`.

- Auth: bearer access token required
- Request: no query params or body
- Success `200`:

```json
{
  "user": {
    "id": "uuid",
    "emailAddress": "person@example.com",
    "phoneNumber": null,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z"
  }
}
```

- Common errors:
  - `401` missing, malformed, expired, or invalid bearer token

## Booking Statuses

### GET /booking-statuses

Lists booking statuses using cursor pagination.

- Auth: bearer access token required
- Query params:
  - `limit?: integer`
  - `cursor?: string`
- Success `200`:

```json
{
  "bookingStatuses": [
    {
      "id": "uuid",
      "name": "Confirmed",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z"
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

- Common errors:
  - `400` invalid `limit` or `cursor`
  - `401` missing or invalid bearer token

### POST /booking-statuses

Creates a booking status.

- Auth: bearer access token required
- Request body:

```json
{
  "name": "Confirmed"
}
```

- Success `201`:

```json
{
  "bookingStatus": {
    "id": "uuid",
    "name": "Confirmed",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z"
  }
}
```

- Common errors:
  - `400` invalid or missing `name`
  - `401` missing or invalid bearer token
  - `409` duplicate `name`

### DELETE /booking-statuses/{id}

Deletes a booking status by id.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `204`: no response body
- Common errors:
  - `401` missing or invalid bearer token
  - `404` booking status not found

## Event Statuses

### GET /event-statuses

Lists event statuses using cursor pagination.

- Auth: bearer access token required
- Query params:
  - `limit?: integer`
  - `cursor?: string`
- Success `200`:

```json
{
  "eventStatuses": [
    {
      "id": "uuid",
      "name": "Pending",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z"
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

- Common errors:
  - `400` invalid `limit` or `cursor`
  - `401` missing or invalid bearer token

### POST /event-statuses

Creates an event status.

- Auth: bearer access token required
- Request body:

```json
{
  "name": "Completed"
}
```

- Success `201`:

```json
{
  "eventStatus": {
    "id": "uuid",
    "name": "Completed",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z"
  }
}
```

- Common errors:
  - `400` invalid or missing `name`
  - `401` missing or invalid bearer token
  - `409` duplicate `name`

### PUT /event-statuses/{id}

Replaces an event status record. This is a full update, so `name` is always required.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Request body:

```json
{
  "name": "Completed"
}
```

- Success `200`:

```json
{
  "eventStatus": {
    "id": "uuid",
    "name": "Completed",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:05:00.000Z"
  }
}
```

- Common errors:
  - `400` invalid or missing `name`
  - `401` missing or invalid bearer token
  - `404` event status not found
  - `409` duplicate `name`

### DELETE /event-statuses/{id}

Deletes an event status by id.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `204`: no response body
- Common errors:
  - `401` missing or invalid bearer token
  - `404` event status not found

## Event Types

### GET /event-types

Lists event types using cursor pagination.

- Auth: bearer access token required
- Query params:
  - `limit?: integer`
  - `cursor?: string`
- Success `200`:

```json
{
  "eventTypes": [
    {
      "id": "uuid",
      "name": "Conference",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z"
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

- Common errors:
  - `400` invalid `limit` or `cursor`
  - `401` missing or invalid bearer token

### POST /event-types

Creates an event type. The server also creates a default booking configuration for the new event type, but the response only returns the event type.

- Auth: bearer access token required
- Request body:

```json
{
  "name": "Conference"
}
```

- Success `201`:

```json
{
  "eventType": {
    "id": "uuid",
    "name": "Conference",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z"
  }
}
```

- Common errors:
  - `400` invalid or missing `name`
  - `401` missing or invalid bearer token
  - `409` duplicate `name`

### PUT /event-types/{id}

Replaces an event type record. This is a full update, so `name` is always required.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Request body:

```json
{
  "name": "Workshop"
}
```

- Success `200`:

```json
{
  "eventType": {
    "id": "uuid",
    "name": "Workshop",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:05:00.000Z"
  }
}
```

- Common errors:
  - `400` invalid or missing `name`
  - `401` missing or invalid bearer token
  - `404` event type not found
  - `409` duplicate `name`

### DELETE /event-types/{id}

Deletes an event type by id. Its associated default booking configuration is also removed through the data model.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `204`: no response body
- Common errors:
  - `401` missing or invalid bearer token
  - `404` event type not found

## Service Providers

### GET /service-providers

Lists service providers using cursor pagination.

- Auth: bearer access token required
- Query params:
  - `limit?: integer`
  - `cursor?: string`
- Success `200`:

```json
{
  "serviceProviders": [
    {
      "id": "uuid",
      "name": "Acme Services",
      "phoneNumber": "+91 98765 43210",
      "email": "contact@acme.com",
      "commissionRate": 22.5,
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z"
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

- Common errors:
  - `400` invalid `limit` or `cursor`
  - `401` missing or invalid bearer token

### POST /service-providers

Creates a service provider. Email addresses are normalized to lowercase, blank optional strings become `null`, and `commissionRate` accepts any numeric percentage from `0` to `100` inclusive.

- Auth: bearer access token required
- Request body:

```json
{
  "name": "Acme Services",
  "phoneNumber": "+91 98765 43210",
  "email": "contact@acme.com",
  "commissionRate": 12.5
}
```

- Success `201`:

```json
{
  "serviceProvider": {
    "id": "uuid",
    "name": "Acme Services",
    "phoneNumber": "+91 98765 43210",
    "email": "contact@acme.com",
    "commissionRate": 12.5,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z"
  }
}
```

- Common errors:
  - `400` invalid `name`, `phoneNumber`, `email`, or `commissionRate`
  - `401` missing or invalid bearer token
  - `409` duplicate `name` or `email`

### PUT /service-providers/{id}

Replaces a service provider record. `name` and `commissionRate` are required; blank optional strings become `null`.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Request body:

```json
{
  "name": "Updated Services",
  "phoneNumber": null,
  "email": "new@example.com",
  "commissionRate": 17.5
}
```

- Success `200`:

```json
{
  "serviceProvider": {
    "id": "uuid",
    "name": "Updated Services",
    "phoneNumber": null,
    "email": "new@example.com",
    "commissionRate": 17.5,
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:05:00.000Z"
  }
}
```

- Common errors:
  - `400` invalid or missing `name`, invalid optional fields, or invalid/missing `commissionRate`
  - `401` missing or invalid bearer token
  - `404` service provider not found
  - `409` duplicate `name` or `email`

### DELETE /service-providers/{id}

Deletes a service provider by id. The request is rejected if any `Service` rows still reference the provider.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `204`: no response body
- Common errors:
  - `401` missing or invalid bearer token
  - `404` service provider not found
  - `409` `Cannot delete service provider while services reference it.`

## Call Records

### GET /call-records

Lists call records using cursor pagination. If `phoneNumber` is supplied, the API normalizes it to a canonical Indian 10-digit form and returns records whose `callerNumber` or `receiverNumber` matches.

- Auth: bearer access token required
- Query params:
  - `limit?: integer`
  - `cursor?: string`
  - `phoneNumber?: string`
- Success `200`:

```json
{
  "callRecords": [
    {
      "id": "uuid",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "callerNumber": "9876543210",
      "receiverNumber": "9123456780",
      "fileId": "uuid"
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

- Common errors:
  - `400` invalid `limit`, `cursor`, or `phoneNumber`
  - `401` missing or invalid bearer token

### GET /call-records/{id}

Returns a call record by id.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `200`:

```json
{
  "callRecord": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "callerNumber": "9876543210",
    "receiverNumber": "9123456780",
    "fileId": "uuid"
  }
}
```

- Common errors:
  - `401` missing or invalid bearer token
  - `404` call record not found

### POST /call-records

Creates a call record. `callerNumber` and `receiverNumber` are normalized to a canonical Indian 10-digit form. `fileId` is optional and must reference an existing file when provided.

- Auth: bearer access token required
- Request body:

```json
{
  "callerNumber": "+91 98765 43210",
  "receiverNumber": "09123456780",
  "fileId": "uuid"
}
```

- Success `201`:

```json
{
  "callRecord": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "callerNumber": "9876543210",
    "receiverNumber": "9123456780",
    "fileId": "uuid"
  }
}
```

- Common errors:
  - `400` invalid `callerNumber`, `receiverNumber`, or `fileId`
  - `401` missing or invalid bearer token
  - `404` referenced file not found

## Calendar Events

### GET /calendar-events

Lists merged calendar events for a bounded date range.

- Auth: bearer access token required
- Query params:
  - `fromDate: string` required, `YYYY-MM-DD`
  - `toDate: string` required, `YYYY-MM-DD`
  - `limit?: integer`
  - `cursor?: string`
- Success `200`:

```json
{
  "events": [
    {
      "date": "2026-04-11T09:30:00.000Z",
      "type": "event_booking",
      "objectId": "uuid"
    },
    {
      "date": "2026-04-12T10:00:00.000Z",
      "type": "followup",
      "objectId": "uuid"
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

- Common errors:
  - `400` missing or invalid `fromDate` / `toDate`, or `fromDate > toDate`
  - `401` missing or invalid bearer token

## Payments

### GET /payments

Lists payments using cursor pagination.

- Auth: bearer access token required
- Query params:
  - `limit?: integer`
  - `cursor?: string`
  - `serviceId?: string`
- Success `200`:

```json
{
  "payments": [
    {
      "id": "uuid",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "mode": "UPI",
      "amount": "1200.00",
      "date": "2026-04-12",
      "serviceId": "uuid",
      "paymentProofFileId": "uuid"
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

### POST /payments

Creates a payment linked to a service. `paymentProofFileId` is optional.

- Auth: bearer access token required
- Request body:

```json
{
  "mode": "BANK_TRANSFER",
  "amount": "1200.50",
  "date": "2026-04-12",
  "serviceId": "uuid",
  "paymentProofFileId": "uuid"
}
```

- Success `201`:

```json
{
  "payment": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "mode": "BANK_TRANSFER",
    "amount": "1200.50",
    "date": "2026-04-12",
    "serviceId": "uuid",
    "paymentProofFileId": "uuid"
  }
}
```

- Common errors:
  - `400` invalid mode, amount, date, or payload shape
  - `401` missing or invalid bearer token
  - `404` referenced service or file not found

### GET /payments/{id}

Returns a payment by id.

- Auth: bearer access token required
- Path params:
  - `id: string`

### PUT /payments/{id}

Replaces a payment using a full replacement payload.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Request body:

```json
{
  "mode": "CASH",
  "amount": "950.25",
  "date": "2026-04-15",
  "serviceId": "uuid",
  "paymentProofFileId": null
}
```

- Common errors:
  - `400` invalid mode, amount, date, or payload shape
  - `401` missing or invalid bearer token
  - `404` payment, service, or file not found

## Services

### GET /services/{id}

Returns a service record by id.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `200`:

```json
{
  "service": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:05:00.000Z",
    "serviceProviderId": "uuid",
    "eventBookingId": "uuid",
    "contractedAmount": "12000.00",
    "customerPaidAmount": "11800.00",
    "grossCommission": "1200.00",
    "deduction": "50.00",
    "commissionPaidAmount": "1150.00"
  }
}
```

- Common errors:
  - `401` missing or invalid bearer token
  - `404` service not found

### PATCH /services/{id}

Updates one or more editable financial fields on a service. Only `contractedAmount`, `customerPaidAmount`,
`grossCommission`, `deduction`, and `commissionPaidAmount` are accepted; omitted fields are left unchanged.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Request body:

```json
{
  "contractedAmount": "14000.00",
  "grossCommission": "1000.50",
  "commissionPaidAmount": "960.25"
}
```

- Success `200`:

```json
{
  "service": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:05:00.000Z",
    "serviceProviderId": "uuid",
    "eventBookingId": "uuid",
    "contractedAmount": "14000.00",
    "customerPaidAmount": "11800.00",
    "grossCommission": "1000.50",
    "deduction": "50.00",
    "commissionPaidAmount": "960.25"
  }
}
```

- Common errors:
  - `400` invalid decimal strings, negative amounts, empty patch payloads, or extra fields
  - `401` missing or invalid bearer token
  - `404` service not found

## Default Booking Configurations

### GET /default-booking-configurations

Lists default booking configurations using cursor pagination.

- Auth: bearer access token required
- Query params:
  - `limit?: integer`
  - `cursor?: string`
- Success `200`:

```json
{
  "defaultBookingConfigurations": [
    {
      "id": "uuid",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "eventTypeId": "uuid",
      "defaultStartTime": "08:00:00",
      "defaultDurationInMinutes": 240
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

- Common errors:
  - `400` invalid `limit` or `cursor`
  - `401` missing or invalid bearer token

### PUT /default-booking-configurations/{id}

Replaces a default booking configuration. `defaultStartTime` must be sent as `HH:mm` or `HH:mm:ss` and is always returned as `HH:mm:ss`.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Request body:

```json
{
  "eventTypeId": "uuid",
  "defaultStartTime": "09:30",
  "defaultDurationInMinutes": 150
}
```

- Success `200`:

```json
{
  "defaultBookingConfiguration": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:05:00.000Z",
    "eventTypeId": "uuid",
    "defaultStartTime": "09:30:00",
    "defaultDurationInMinutes": 150
  }
}
```

- Common errors:
  - `400` invalid or missing `eventTypeId`, `defaultStartTime`, or `defaultDurationInMinutes`
  - `401` missing or invalid bearer token
  - `404` configuration not found or referenced event type not found
  - `409` another configuration already exists for the same event type

## Event Bookings

### GET /event-bookings

Lists event bookings using cursor pagination. Filters can be combined, and date filtering uses overlap semantics rather than full containment.

- Auth: bearer access token required
- Query params:
  - `limit?: integer`
  - `cursor?: string`
  - `name?: string` case-insensitive customer name substring
  - `phoneNumber?: string` exact match against `phoneNumber1`, `phoneNumber2`, or `phoneNumber3`
  - `fromDate?: YYYY-MM-DD`
  - `toDate?: YYYY-MM-DD`
- Success `200`:

```json
{
  "eventBookings": [
    {
      "id": "uuid",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "mode": "PHONE_IN",
      "bookingStatusId": "uuid",
      "eventStatusId": "uuid",
      "eventTypeId": "uuid",
      "bookingStart": "2026-04-20T10:00:00.000Z",
      "bookingEnd": "2026-04-20T12:00:00.000Z",
      "muhurat": "2026-04-20T09:30:00.000Z",
      "customerName": "Priya Sharma",
      "phoneNumber1": "9876543210",
      "phoneNumber2": null,
      "phoneNumber3": null,
      "referredBy": "Cousin"
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

- Common errors:
  - `400` invalid `limit`, `cursor`, `fromDate`, `toDate`, or reversed date range
  - `401` missing or invalid bearer token

### GET /event-bookings/{id}

Returns one event booking by id, including linked `serviceProviderIds` and backing `services`.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `200`:

```json
{
  "eventBooking": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "mode": "PHONE_IN",
    "bookingStatusId": "uuid",
    "eventStatusId": "uuid",
    "eventTypeId": "uuid",
    "bookingStart": "2026-04-20T10:00:00.000Z",
    "bookingEnd": "2026-04-20T12:00:00.000Z",
    "muhurat": "2026-04-20T09:30:00.000Z",
    "customerName": "Priya Sharma",
    "phoneNumber1": "9876543210",
    "phoneNumber2": null,
    "phoneNumber3": null,
    "referredBy": "Cousin",
    "serviceProviderIds": [
      "uuid"
    ],
    "services": [
      {
        "id": "uuid",
        "serviceProviderId": "uuid",
        "contractedAmount": "12000.00",
        "customerPaidAmount": "11800.00",
        "grossCommission": "1200.00",
        "deduction": "50.00",
        "commissionPaidAmount": "1150.00"
      }
    ]
  }
}
```

- Common errors:
  - `401` missing or invalid bearer token
  - `404` event booking not found

### POST /event-bookings

Creates an event booking. `serviceProviderIds` can be supplied; each selected provider is linked to the booking and synced to a backing `Service` row. The response currently does not echo provider ids back.

- Auth: bearer access token required
- Request body:

```json
{
  "mode": "PHONE_IN",
  "bookingStatusId": "uuid",
  "eventStatusId": "uuid",
  "eventTypeId": "uuid",
  "bookingStart": "2026-04-20T10:00:00.000Z",
  "bookingEnd": "2026-04-20T12:00:00.000Z",
  "muhurat": "2026-04-20T09:30:00.000Z",
  "customerName": "Priya Sharma",
  "phoneNumber1": "9876543210",
  "phoneNumber2": null,
  "phoneNumber3": null,
  "referredBy": "Cousin",
  "serviceProviderIds": [
    "uuid"
  ]
}
```

- Success `201`:

```json
{
  "eventBooking": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "mode": "PHONE_IN",
    "bookingStatusId": "uuid",
    "eventStatusId": "uuid",
    "eventTypeId": "uuid",
    "bookingStart": "2026-04-20T10:00:00.000Z",
    "bookingEnd": "2026-04-20T12:00:00.000Z",
    "muhurat": "2026-04-20T09:30:00.000Z",
    "customerName": "Priya Sharma",
    "phoneNumber1": "9876543210",
    "phoneNumber2": null,
    "phoneNumber3": null,
    "referredBy": "Cousin"
  }
}
```

- Common errors:
  - `400` invalid enum values, invalid datetime strings, or missing required fields
  - `401` missing or invalid bearer token
  - `404` referenced booking status, event status, event type, or service provider not found

### PUT /event-bookings/{id}

Replaces an event booking. This is a full update, `serviceProviderIds` is required, and sending an empty array clears all linked providers. The final provider selection is also synced to backing `Service` rows: retained providers keep existing service rows, removed providers lose them, and newly added providers get new ones.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Request body:

```json
{
  "mode": "WALK_IN",
  "bookingStatusId": "uuid",
  "eventStatusId": "uuid",
  "eventTypeId": "uuid",
  "bookingStart": "2026-04-20T10:00:00.000Z",
  "bookingEnd": "2026-04-20T12:00:00.000Z",
  "muhurat": null,
  "customerName": "Ananya Rao",
  "phoneNumber1": "9876543210",
  "phoneNumber2": null,
  "phoneNumber3": null,
  "referredBy": null,
  "serviceProviderIds": [
    "uuid"
  ]
}
```

- Success `200`:

```json
{
  "eventBooking": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:05:00.000Z",
    "mode": "WALK_IN",
    "bookingStatusId": "uuid",
    "eventStatusId": "uuid",
    "eventTypeId": "uuid",
    "bookingStart": "2026-04-20T10:00:00.000Z",
    "bookingEnd": "2026-04-20T12:00:00.000Z",
    "muhurat": null,
    "customerName": "Ananya Rao",
    "phoneNumber1": "9876543210",
    "phoneNumber2": null,
    "phoneNumber3": null,
    "referredBy": null
  }
}
```

- Common errors:
  - `400` invalid enum values, invalid datetime strings, missing required fields, or missing `serviceProviderIds`
  - `401` missing or invalid bearer token
  - `404` event booking not found, or referenced related records not found

### DELETE /event-bookings/{id}

Deletes an event booking by id. Linked `Service` rows are deleted automatically.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `204`: no response body
- Common errors:
  - `401` missing or invalid bearer token
  - `404` event booking not found

## Customer Interactions

### GET /customer-interactions

Lists customer interactions using cursor pagination. You can filter by linked booking, ignored state, or only-unlinked records.

- Auth: bearer access token required
- Query params:
  - `limit?: integer`
  - `cursor?: string`
  - `eventBookingId?: string`
  - `ignored?: boolean`
  - `unlinkedOnly?: boolean`
- Success `200`:

```json
{
  "customerInteractions": [
    {
      "id": "uuid",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "interactionType": "PHONE_IN",
      "occurredAt": "2026-04-19T11:15:00.000Z",
      "ignored": false,
      "voiceNoteId": null,
      "eventBookingIds": [
        "uuid"
      ]
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

- Common errors:
  - `400` invalid `limit`, `cursor`, `ignored`, `unlinkedOnly`, or invalid combination of `eventBookingId` with `unlinkedOnly`
  - `401` missing or invalid bearer token
  - `404` referenced `eventBookingId` not found

### GET /customer-interactions/{id}

Returns one customer interaction by id.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `200`:

```json
{
  "customerInteraction": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "interactionType": "MISSED_CALL",
    "occurredAt": "2026-04-22T08:00:00.000Z",
    "ignored": false,
    "voiceNoteId": "uuid",
    "eventBookingIds": [
      "uuid"
    ]
  }
}
```

- Common errors:
  - `401` missing or invalid bearer token
  - `404` customer interaction not found

### POST /customer-interactions

Creates a customer interaction. Omitted `eventBookingIds` becomes an empty array, duplicate ids are deduplicated, and `voiceNote` is optional for `WALK_IN` interactions only.

- Auth: bearer access token required
- Request body:

```json
{
  "interactionType": "PHONE_IN",
  "occurredAt": "2026-04-19T11:15:00.000Z",
  "eventBookingIds": [
    "uuid"
  ]
}
```

- Success `201`:

```json
{
  "customerInteraction": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "interactionType": "PHONE_IN",
    "occurredAt": "2026-04-19T11:15:00.000Z",
    "ignored": false,
    "voiceNoteId": null,
    "eventBookingIds": [
      "uuid"
    ]
  }
}
```

- Common errors:
  - `400` invalid `interactionType`, invalid `occurredAt`, invalid `voiceNote`, or non-array `eventBookingIds`
  - `401` missing or invalid bearer token
  - `404` referenced event booking not found

### PUT /customer-interactions/{id}

Replaces a customer interaction. This route replaces the full `eventBookingIds` set instead of appending to it. `voiceNote` is only allowed for `WALK_IN`, omitting or sending `null` preserves the existing voice note, and `clearVoiceNote: true` removes it.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Request body:

```json
{
  "interactionType": "MISSED_CALL",
  "occurredAt": "2026-04-21T09:00:00.000Z",
  "eventBookingIds": [
    "uuid"
  ]
}
```

- Success `200`:

```json
{
  "customerInteraction": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:05:00.000Z",
    "interactionType": "MISSED_CALL",
    "occurredAt": "2026-04-21T09:00:00.000Z",
    "ignored": false,
    "voiceNoteId": null,
    "eventBookingIds": [
      "uuid"
    ]
  }
}
```

- Common errors:
  - `400` invalid `interactionType`, invalid `occurredAt`, invalid `voiceNote`, invalid `clearVoiceNote`, or non-array `eventBookingIds`
  - `401` missing or invalid bearer token
  - `404` customer interaction not found, or referenced event booking not found

### DELETE /customer-interactions/{id}

Deletes a customer interaction by id.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `204`: no response body
- Common errors:
  - `401` missing or invalid bearer token
  - `404` customer interaction not found

### PATCH /customer-interactions/{id}/event-bookings

Associates one or more event bookings with an existing interaction. Unlike `PUT`, this route appends links, preserves existing links, and deduplicates repeated ids.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Request body:

```json
{
  "eventBookingIds": [
    "uuid"
  ]
}
```

- Success `200`:

```json
{
  "customerInteraction": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:05:00.000Z",
    "interactionType": "PHONE_IN",
    "occurredAt": "2026-04-19T11:15:00.000Z",
    "ignored": false,
    "voiceNoteId": null,
    "eventBookingIds": [
      "uuid"
    ]
  }
}
```

- Common errors:
  - `400` missing, invalid, or non-array `eventBookingIds`
  - `401` missing or invalid bearer token
  - `404` customer interaction not found, or referenced event booking not found

### PATCH /customer-interactions/{id}/ignore

Toggles the ignored state on a customer interaction. This route only updates the `ignored` flag.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Request body:

```json
{
  "ignored": true
}
```

- Success `200`:

```json
{
  "customerInteraction": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:05:00.000Z",
    "interactionType": "PHONE_IN",
    "occurredAt": "2026-04-19T11:15:00.000Z",
    "ignored": true,
    "voiceNoteId": null,
    "eventBookingIds": []
  }
}
```

- Common errors:
  - `400` missing or non-boolean `ignored`
  - `401` missing or invalid bearer token
  - `404` customer interaction not found

## Followups

### GET /followups

Lists followups using cursor pagination. Filters support exact-match values only.

- Auth: bearer access token required
- Query params:
  - `limit?: integer`
  - `cursor?: string`
  - `dueDate?: ISO-8601 datetime`
  - `type?: BOOKING | SERVICE`
  - `eventBookingId?: string`
  - `serviceProviderId?: string`
- Success `200`:

```json
{
  "followups": [
    {
      "id": "uuid",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z",
      "dueDate": "2026-04-24T10:00:00.000Z",
      "type": "BOOKING",
      "description": "Call customer with update",
      "eventBookingId": "uuid",
      "serviceProviderId": null,
      "customerInteractionId": null
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

- Common errors:
  - `400` invalid `limit`, `cursor`, `dueDate`, or `type`
  - `401` missing or invalid bearer token

### GET /followups/{id}

Returns one followup by id.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `200`:

```json
{
  "followup": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "dueDate": "2026-04-24T10:00:00.000Z",
    "type": "BOOKING",
    "description": "Call customer with update",
    "eventBookingId": "uuid",
    "serviceProviderId": null,
    "customerInteractionId": null
  }
}
```

- Common errors:
  - `401` missing or invalid bearer token
  - `404` followup not found

### POST /followups

Creates a followup. `BOOKING` followups require `eventBookingId`; `SERVICE` followups require `serviceProviderId`. `customerInteractionId` is optional for both.

- Auth: bearer access token required
- Request body for `BOOKING`:

```json
{
  "dueDate": "2026-04-24T10:00:00.000Z",
  "type": "BOOKING",
  "description": "Call customer with update",
  "eventBookingId": "uuid",
  "customerInteractionId": "uuid"
}
```

- Request body for `SERVICE`:

```json
{
  "dueDate": "2026-04-24T10:00:00.000Z",
  "type": "SERVICE",
  "description": null,
  "serviceProviderId": "uuid",
  "customerInteractionId": null
}
```

- Success `201`:

```json
{
  "followup": {
    "id": "uuid",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z",
    "dueDate": "2026-04-24T10:00:00.000Z",
    "type": "BOOKING",
    "description": "Call customer with update",
    "eventBookingId": "uuid",
    "serviceProviderId": null,
    "customerInteractionId": "uuid"
  }
}
```

- Common errors:
  - `400` invalid `dueDate`, invalid `type`, or invalid conditional field combinations
  - `401` missing or invalid bearer token
  - `404` referenced event booking, service provider, or customer interaction not found

### DELETE /followups/{id}

Deletes a followup by id.

- Auth: bearer access token required
- Path params:
  - `id: string`
- Success `204`: no response body
- Common errors:
  - `401` missing or invalid bearer token
  - `404` followup not found
