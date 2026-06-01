---
name: Architect includeGitDiff fails in code_execution sandbox
description: Why architect({includeGitDiff:true}) throws UNKNOWN_NOT_GIT and how to give the architect a diff instead
---

# Architect `includeGitDiff: true` fails when called from code_execution

Calling `await architect({ ..., includeGitDiff: true })` from the code_execution
tool fails with:
`Error in river service (git - agentGetCurrentDiff), code: UNKNOWN_NOT_GIT ...
{"command":"git diff --patch $(git hash-object -t tree /dev/null)", ...}`

**Why:** The code_execution notebook runs in a locked-down sandbox (mount
`/mnt/pid2/...`), separate from the workspace. It has no git work tree there —
`process.cwd` is even stubbed out and child_process/git access is unavailable.
The platform computes the `includeGitDiff` diff from inside that sandbox context,
so `git` reports the directory is not a repository (`UNKNOWN_NOT_GIT`). The
workspace repo itself is fine — this is purely a sandbox-context limitation. It
is more likely to surface right after the notebook has been auto-restarted.

**How to apply:** When you want the architect to review a diff, do NOT pass
`includeGitDiff: true`. Instead, generate the diff yourself with the bash tool
(which runs in the real workspace with normal git access), e.g.
`git --no-optional-locks diff` or `git --no-optional-locks show <range>`, and
embed the relevant diff text inline in the architect `task` string. The
`relevantFiles` list still works normally. Avoid `includeGitDiff` and
`relevantGitCommits` from the code_execution path entirely.
