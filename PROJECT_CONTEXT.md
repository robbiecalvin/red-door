# Red Door — Project Context

## Purpose

Red Door is a location-based social platform centered around real-time discovery and communication between nearby users.

The platform emphasizes **Cruise Mode**, allowing users to discover nearby people, cruising spots, and events using a live map interface.

Additional modes:

- Cruise Mode (primary)
- Date Mode
- Hybrid Mode

The architecture supports these modes through server-side policy enforcement.

---

## Core Capabilities

### Identity

- Guest sessions
- Registered accounts
- Email verification
- Age verification
- Role system
- Ban enforcement

### Social Interaction

- Real-time messaging
- Chat threads
- Media sharing
- Read receipts

### Discovery

- Map-based user discovery
- Cruising spots
- Public events
- Promoted profiles

### Moderation

- User blocking
- Reporting
- Admin moderation tools

---

## Architecture

Frontend:

React 18  
TypeScript  
Vite  
MapLibre GL

Backend:

Node.js  
Express  
WebSocket (`ws`)

Data Layer:

In-memory runtime state  
JSON persistence fallback  
Optional PostgreSQL database

Media Storage:

Local filesystem fallback  
Optional S3-compatible storage

---

## Core Design Principles

1. Privacy-aware location sharing
2. Real-time social interaction
3. Server-side policy enforcement
4. Modular architecture
5. Static frontend hosting compatibility

---

## Key Constraints

Frontend must remain deployable on static hosting platforms (GitHub Pages).

Backend must operate as an independent Node.js service.

Location privacy must prevent precise coordinate exposure.

Mode rules must always be enforced server-side.