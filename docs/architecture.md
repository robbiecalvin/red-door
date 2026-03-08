# Red Door Architecture

## Overview

Red Door uses a split architecture separating a static frontend application from a dynamic backend API.

Frontend: static React application  
Backend: Node.js service with REST API and WebSocket gateway

---

## System Layers

### Domain

Contains business logic.

Examples:

matchingService  
modeService  
presenceService  

Responsibilities:

- enforce platform rules
- manage user state
- determine interactions

---

### Infrastructure

Handles integrations.

Examples:

database repositories  
object storage  
email services

Responsibilities:

- external system communication
- persistence
- third-party integrations

---

### Interfaces

User interaction layer.

Examples:

HTTP API endpoints  
WebSocket gateway  
CLI utilities

Responsibilities:

- request handling
- input validation
- response formatting

---

### Utilities

Shared helper code used across the system.

Examples:

validation helpers  
formatters  
common constants

---

## Realtime System

WebSocket server provides:

- connection authentication
- heartbeat
- message broadcasting
- payload size limits
- presence updates

---

## Security

Server enforces:

- authentication
- age restrictions
- moderation rules
- location privacy