---
trigger: always_on
---

# TESTING_STRATEGY_RULES.md

## Development Mode (Default)

The AI agent must optimize for development speed.

During normal implementation:

DO NOT automatically run:

* npm test
* full integration tests
* full repository tests
* full validation suites

after every code change.

The agent should rely on:

* architecture compliance
* type-safe implementation
* code review
* reasoning

to continue development.

Only run targeted tests when:

* modifying database schema
* modifying repository logic
* modifying authentication
* modifying SafetyEngine
* modifying LLMRouter
* modifying shared types
* modifying tenant isolation logic

For all other development tasks:

Continue implementation without running the full test suite.

---

## Verification Mode

Verification Mode is triggered only when the developer explicitly says:

* END OF SESSION
* FULL VALIDATION
* TEST EVERYTHING
* PREPARE COMMIT
* RELEASE CHECK

When Verification Mode is activated:

Run:

```bash
npx tsc --noEmit
npm test
```

Run all:

* unit tests
* repository tests
* tenant isolation tests
* safety tests
* integration tests

Fix failures.

Repeat until all tests pass.

Only after all validations pass may a commit be created.

---

## Commit Rule

Before creating any commit:

Verification Mode is mandatory.

No commit may be created without:

```bash
npx tsc --noEmit
npm test
```

passing successfully.

---

## Emergency Override

If the developer explicitly says:

SKIP TESTS

The agent may create a commit without running validations.

The commit message must include:

```text
[chore] commit created without validation at developer request
```

This should only be used intentionally by the developer.
