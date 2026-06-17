---
trigger: always_on
---

# GITHUB_WORKFLOW_RULES.md

## Git Workflow Rules (Mandatory)

These rules apply to every development task, bug fix, refactor, feature implementation, documentation update, test update, and configuration change.

The AI agent is authorized to create commits but is NOT authorized to push to any remote repository. After every commit, the agent must provide the exact push command and wait for developer action.

---

## 1. Commit After Every Completed Task

After completing a task:

1. Verify implementation is complete.
2. Verify tests pass.
3. Verify no architecture violations exist.
4. Verify AGENT.md rules are satisfied.
5. Verify tenant isolation remains intact.
6. Verify TypeScript compilation succeeds.

Only then create a git commit.

Never leave completed work uncommitted.

---

## 2. Always Review Changes Before Commit

Before creating a commit:

Run:

```bash
git status
git diff
```

Review:

* Modified files
* Added files
* Deleted files
* Generated files
* Temporary files

Do not commit:

* node_modules
* .env files
* build artifacts
* temporary files
* debug files
* logs
* IDE-specific junk files

Only commit files related to the task.

---

## 3. Commit Messages Must Be Informative

Never use vague commit messages.

Forbidden examples:

```text
fix
update
changes
done
working version
final
latest
test
misc
wip
```

---

## 4. Commit Message Format

Use:

```text
<type>: <short summary>

- change 1
- change 2
- change 3
```

Examples:

```text
feat: implement LLMRouter provider abstraction

- added provider routing system
- integrated Groq provider
- integrated Gemini provider
- added OpenAI fallback stub
- added routing tests
```

```text
fix: enforce tenant isolation in repositories

- added tenant filters to queries
- fixed repository leakage issue
- updated tenant isolation tests
```

```text
refactor: simplify conversation gateway pipeline

- extracted session manager
- reduced orchestration complexity
- improved type safety
```

---

## 5. Allowed Commit Types

Use only:

```text
feat
fix
refactor
docs
test
perf
chore
security
```

Examples:

```text
feat: add SafetyEngine
fix: prevent cross tenant access
docs: update architecture notes
test: add safety engine coverage
security: enforce webhook validation
```

---

## 6. Commit Scope Must Match Work Done

A commit should represent one logical change.

Good:

```text
feat: implement SafetyEngine
```

Bad:

```text
feat: implement SafetyEngine, Shopify connector, dashboard API, analytics
```

Do not mix unrelated changes in one commit.

---

## 7. Verify Before Commit

Before every commit run:

```bash
npm test
npx tsc --noEmit
```

If either command fails:

DO NOT COMMIT.

Fix the issue first.

---

## 8. Never Push Automatically

The AI agent is strictly forbidden from pushing code.

Never run:

```bash
git push
git push origin main
git push origin master
git push --force
git push --tags
```

The agent must never perform a push operation.

---

## 9. Agent Must Stop After Commit

After a successful commit:

The agent must stop.

The agent must provide:

### Commit Hash

```bash
git rev-parse HEAD
```

### Commit Summary

```text
Commit Created Successfully

Commit:
<hash>

Message:
<commit message>
```

---

## 10. Provide Push Command Only

After commit creation, provide the exact push command for the developer.

Example:

```bash
git push origin main
```

or

```bash
git push origin develop
```

The agent must only display the command.

The agent must not execute it.

---

## 11. Force Push Protection

The agent must never recommend:

```bash
git push --force
git push -f
git reset --hard
git rebase --onto
```

unless explicitly requested by the developer.

---

## 12. Pull Request Preparation

When a feature is completed:

Provide:

### Changed Files

```bash
git diff --name-only HEAD~1 HEAD
```

### Commit Hash

```bash
git rev-parse HEAD
```

### Suggested Push Command

```bash
git push origin <current-branch>
```

Do not execute any of them.

---

## 13. End Of Task Workflow

For every completed task:

1. Run tests.
2. Verify architecture compliance.
3. Verify AGENT.md compliance.
4. Review git diff.
5. Create clean commit.
6. Show commit hash.
7. Show commit summary.
8. Show push command.
9. Stop.
10. Wait for developer approval.

Never push automatically.

Developer retains full control over all pushes.