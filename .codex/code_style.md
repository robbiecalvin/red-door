# Code Style Guidelines

These guidelines define formatting and style expectations for code generated in this repository.

Consistency and readability are prioritized over personal preference.

---

# General Principles

Code should be:

- readable
- predictable
- consistent with existing repository patterns

Avoid clever or overly compact code.

Prefer clarity over brevity.

---

# Naming Conventions

Use descriptive names.

Avoid abbreviations unless they are widely understood.

Examples:

good:
userRepository
calculateInvoiceTotal
isSessionValid

bad:
usrRepo
calcInv
flag1

Names should reflect the purpose of the variable, function, or class.

---

# Function Design

Functions should:

- perform a single logical task
- have clear inputs and outputs
- avoid hidden side effects

Prefer small functions with clear responsibilities.

Avoid deeply nested logic.

---

# Control Flow

Prefer simple and explicit control flow.

Good:

if user is None:
    return error

process(user)

Avoid deeply nested conditions when early returns improve clarity.

---

# Error Handling

Errors must be handled explicitly.

Avoid silently ignoring failures.

Include useful diagnostic information when returning or raising errors.

---

# Comments

Comments should explain **why**, not **what**.

Avoid redundant comments that restate the code.

Good:

# Retry request because external API occasionally returns transient errors

Bad:

# increment i
i += 1

---

# Formatting

Follow the formatting conventions already present in the repository.

If none are present, use the following defaults.

---

# Python Style

Follow PEP 8 conventions.

Key expectations:

- snake_case for variables and functions
- PascalCase for classes
- 4-space indentation
- avoid lines longer than ~100 characters

Example:

def calculate_invoice_total(items: list[Item]) -> Decimal:
    total = Decimal("0")

    for item in items:
        total += item.price

    return total

---

# JavaScript Style

Use modern JavaScript syntax.

Prefer:

- const by default
- let only when reassignment is required
- arrow functions for short functions
- async/await over promise chains

Example:

async function fetchUser(userId) {
    const response = await apiClient.get(`/users/${userId}`)
    return response.data
}

Avoid deeply nested promise chains.

---

# PHP Style

Follow modern PHP conventions.

Prefer:

- strict types when possible
- typed parameters and return values
- PSR-style formatting

Example:

public function calculateTotal(array $items): float
{
    $total = 0.0;

    foreach ($items as $item) {
        $total += $item->price;
    }

    return $total;
}

---

# Duplication

Avoid duplicate implementations.

Before writing new logic, check whether an equivalent utility already exists.

Reuse existing functions whenever possible.

---

# Magic Values

Avoid hardcoded values when they represent meaningful constants.

Prefer named constants or configuration.

Example:

const MAX_RETRY_ATTEMPTS = 3

---

# Imports and Dependencies

Only import what is required.

Avoid unused imports.

Group imports clearly and follow existing repository patterns.

---

# Logging

Logs should be concise and useful for debugging.

Avoid logging:

- secrets
- credentials
- sensitive user data

Log meaningful events, errors, or state transitions.

---

# Test Code Style

Tests should be:

- readable
- deterministic
- focused on behavior

Prefer clear test names describing the scenario being validated.

Example:

test_user_login_fails_with_invalid_password