# Milestone 5: REST API Implementation Tasks

This document provides a detailed breakdown of the tasks required to implement the Hono-based REST API for the Gee Mailer application.

## Goal

To create a secure, efficient, and well-documented REST API that exposes the core functionalities of the application, such as accessing emails, contacts, and attachments.

## Core Dependencies

The following dependencies will be used for the API implementation:

-   **`hono`**: A small, simple, and ultrafast web framework for the foundation of the API.
-   **`zod`**: For schema declaration and validation of request and response data transfer objects (DTOs).

---

## Milestone 5.1: API Server Foundation

**Goal:** Establish the basic Hono server, including essential middleware for logging, authentication, and error handling.

### Task 5.1.1: Install Dependencies
-   **Action:** Add `hono` and `zod` to the project.
-   **Command:** `bun add hono zod`

### Task 5.1.2: Create Hono Application
-   **File:** `src/api/server.ts`
  -   **Action:**
    -   Initialize a new Hono application.
    -   Create a basic `health-check` endpoint (`/api/health`).    -   Export the app instance.

### Task 5.1.3: Implement Core Middleware
-   **File:** `src/api/server.ts`
  -   **Action:**
    -   Add `cors()` middleware to handle cross-origin requests.
    -   Add a request logging middleware that uses the `AppLogger` from the DI container to log incoming requests and their response times.    -   Implement a global error handler to catch exceptions and return structured JSON error responses.

### Task 5.1.4: Implement Authentication Middleware
-   **File:** `src/api/middleware/auth.ts`
  -   **Action:**
    -   Create a Hono middleware that will be used to protect authenticated routes.
    -   Inside the middleware, resolve the `CurrentUserService` from the DI container.
    -   Use `currentUserService.getCurrentUserWithValidToken()` to ensure there is an active and authenticated user with a valid token.
    -   If the user is not authenticated, the middleware should abort the request and return a `401 Unauthorized` response.    -   If the user is authenticated, the middleware should attach the user entity to the Hono context for use in downstream handlers.

### Task 5.1.5: Create API CLI Command
-   **File:** `src/cli/commands/serve.ts`
  -   **Action:**
    -   Create a new CLI command `serve` that imports the Hono app from `src/api/server.ts`.
    -   Use the `serve` function from `hono/bun` to start the server.
    -   Make the port configurable via an environment variable (`API_PORT`, default to `4000`).    -   Register the new `serve` command in the main CLI router (`src/cli/index.ts`).

**Acceptance Criteria:**
- [ ] `bun add hono zod` is run.
- [ ] `src/api/server.ts` is created and a basic Hono app is running.
- [ ] CORS, logging, and error handling middleware are in place.
- [ ] Authentication middleware can successfully protect a test route.
- [ ] `bun run cli serve` starts the API server.

---

## Milestone 5.2: Email Endpoints

**Goal:** Create endpoints for listing, viewing, and searching emails.

### Task 5.2.1: Define Email DTOs
-   **File:** `src/api/dtos/email.dto.ts`
  -   **Action:**
    -   Create a `EmailSummaryDto` Zod schema containing a subset of fields for list views (e.g., `id`, `subject`, `from`, `date`, `isRead`).    -   Create a `EmailDetailDto` Zod schema that includes all relevant fields for a single email view, including the body and attachments.

### Task 5.2.2: Implement Email Routes
-   **File:** `src/api/routes/emails.ts`
-   **Action:** Create a new Hono router for email-related endpoints and apply the authentication middleware to all routes in this file.

### Task 5.2.3: List Emails Endpoint
-   **Endpoint:** `GET /api/emails`
  -   **Action:**
    -   Implement pagination using `page` and `limit` query parameters.
    -   Implement filtering based on query parameters like `label` (by label name or ID), `isRead`, and `from` (sender email).
    -   Use `EmailMessagesRepository` to query the database.    -   Return a paginated response object: `{ data: EmailSummaryDto[], total: number, page: number, limit: number }`.

### Task 5.2.4: Get Single Email Endpoint
-   **Endpoint:** `GET /api/emails/:id`
  -   **Action:**
    -   Fetch a single email by its database ID.
    -   Return the full `EmailDetailDto`.
    -   Return a `404 Not Found` if the email doesn't exist or does not belong to the current user.
### Task 5.2.5: Get Email Thread Endpoint
-   **Endpoint:** `GET /api/emails/thread/:threadId`
  -   **Action:**
    -   Fetch all emails that share the same `threadId`.
    -   Return an array of `EmailSummaryDto`.
### Task 5.2.6: Search Emails Endpoint
-   **Endpoint:** `GET /api/emails/search`
  -   **Action:**
    -   Implement search functionality using a `q` query parameter.
    -   **Dependency:** This task is blocked until **Milestone 3.1: Meilisearch Service** is completed. The implementation will use the Meilisearch service to perform the search.
    -   Return a list of matching `EmailSummaryDto`.
**Acceptance Criteria:**
- [ ] Email DTOs are defined and used in all responses.
- [ ] Users can list and paginate through their emails.
- [ ] Users can retrieve a single email and all emails in a thread.
- [ ] Endpoint for search is created but marked as pending Meilisearch integration.
- [ ] All endpoints are protected by the authentication middleware.

---

## Milestone 5.3: Contact Endpoints

**Goal:** Expose contact information via the REST API.

### Task 5.3.1: Define Contact DTOs
-   **File:** `src/api/dtos/contact.dto.ts`
-   **Action:** Create a `ContactDto` Zod schema that includes fields like `id`, `name`, `email`, and interaction statistics.

### Task 5.3.2: Implement Contact Routes
-   **File:** `src/api/routes/contacts.ts`
-   **Action:** Create a new Hono router for contact endpoints and apply the authentication middleware.

### Task 5.3.3: List Contacts Endpoint
-   **Endpoint:** `GET /api/contacts`
  -   **Action:**
    -   Implement pagination.
    -   Use `EmailContactRepository` to query the database.
    -   Return a paginated response of `ContactDto`.
### Task 5.3.4: Get Single Contact Endpoint
-   **Endpoint:** `GET /api/contacts/:id`
  -   **Action:**
    -   Fetch a single contact by its database ID.
    -   Return the `ContactDto`.
**Acceptance Criteria:**
- [ ] Users can list and paginate through their contacts.
- [ ] Users can retrieve details for a single contact.
- [ ] All endpoints are protected by the authentication middleware.

---

## Milestone 5.4: Attachment Endpoints

**Goal:** Allow users to get information about and download attachments.

### Task 5.4.1: Define Attachment DTO
-   **File:** `src/api/dtos/attachment.dto.ts`
-   **Action:** Create an `AttachmentDto` Zod schema with metadata like `id`, `filename`, `mimeType`, and `size`.

### Task 5.4.2: Get Attachment Info Endpoint
-   **Endpoint:** `GET /api/attachments/:id/info`
  -   **Action:**
    -   Use `AttachmentRepository` to retrieve the attachment's metadata from the database.
    -   Return the `AttachmentDto`.
### Task 5.4.3: Download Attachment Endpoint
-   **Endpoint:** `GET /api/attachments/:id/download`
  -   **Action:**
    -   **Dependency:** This task is blocked until **Milestone 3.2: MinIO Service** is completed.
    -   The implementation will use the MinIO service to generate a presigned URL for the download or stream the file directly.
    -   The response should redirect the user to the presigned URL or stream the file with the correct `Content-Type` and `Content-Disposition` headers.
**Acceptance Criteria:**
- [ ] Users can retrieve attachment metadata.
- [ ] Endpoint for downloading attachments is created but marked as pending MinIO integration.
- [ ] All endpoints are protected by the authentication middleware.

---

## Milestone 5.5: Finalization and Documentation

**Goal:** Ensure the API is well-documented and tested.

### Task 5.5.1: API Documentation
-   **File:** `docs/api.md`
  -   **Action:**
    -   Create a comprehensive markdown document for the API.
    -   For each endpoint, document the URL, HTTP method, required authentication, query parameters, and example request/response bodies.
### Task 5.5.2: Integration Testing
-   **Directory:** `tests/integration/api/`
  -   **Action:**
    -   Write integration tests for the API endpoints.
    -   Use a test runner like `bun:test` to make `fetch` requests to the running API instance.
    -   Mock necessary services and repositories to isolate the API layer.
    -   Cover success cases, error cases (e.g., 404s), and authentication failures (401s).
**Acceptance Criteria:**
- [ ] `docs/api.md` is complete and accurate.
- [ ] All endpoints have corresponding integration tests.
- [ ] The test suite passes with `bun test`.
