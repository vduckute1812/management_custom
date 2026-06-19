# Feature Implementation: Authentication, Security, & Role-Based Access Control (RBAC)

## 1. Authentication System
Implement a complete authentication workflow containing the following functions:
- **Sign Up (Registration):** Support for multi-channel registration (Email and SMS).
  - **Phase 1 Priority:** Implement Google Email (SMTP/OAuth) registration first. 
  - *Note:* Leave a placeholder/configuration block for the Email API Key; it will be provided later.
  - **Phase 2 (Future):** SMS integration.
- **Login:** Secure user authentication generating a secure Token (e.g., JWT).
- **Logout:** Session termination, client-side token destruction, and server-side invalidation.

## 2. Token Security & Validation Rules (Crucial)
Every incoming request to protected routes must undergo strict token security verification:
- **Signature Verification:** Ensure the token was signed with the server's private secret key and has not been tampered with.
- **Expiration Check:** Verify the token's expiration timestamp (`exp`). Reject expired tokens immediately with a `401 Unauthorized` status.
- **Payload Integrity:** Ensure the payload claims (such as `user_id` and `role`) match valid records and cannot be altered by the client.
- **Token Invalidation (Logout):** Implement a mechanism (e.g., a Redis-based token blacklist or short token lifetimes with refresh tokens) to ensure that once a user logs out, that token can no longer be used.

## 3. Hierarchical User Role System (RBAC)
Create a strict hierarchical role system enforced via security middleware:
- **Admin:** Superuser with elevated access rights.
- **Normal User:** Standard client access.

## 4. Data Visualization & Access Control Rules
Enforce the following data isolation and visualization rules:
- **Admin Dashboard:**
  - Ability to view comprehensive data for all individual users in the system.
  - Data must be represented visually using interactive charts (e.g., bar charts, line graphs showing user metrics/activity).
- **Normal User Dashboard:**
  - Strict data isolation.
  - Users must **only** be able to view and access their own personalized data and charts based on the `user_id` extracted securely from the validated token.

---

## Technical Tasks Checklist

- [ ] Setup User Model with `role` field (`admin`, `normal`).
- [ ] Implement Sign-Up API/Logic with Email verification placeholder (Google Mail).
- [ ] Implement Secure Login API issuing signed tokens (JWT).
- [ ] **Implement Security Token Validation Middleware (checks Signature, Expiration, and Integrity).**
- [ ] Implement Logout API (with token invalidation/blacklisting).
- [ ] Create Middleware/Decorators for Role-Based Access Control (RBAC).
- [ ] Build Admin Chart Dashboard API (aggregating user data, restricted to `admin` token).
- [ ] Build User Dashboard API (scoped strictly to the validated token's `user_id`).