---
description: How Cursor implements plans and creates plan templates
alwaysApply: false
---

# Cursor Plan Implementation Template

## Overview

When a user requests a feature or change, Cursor follows a structured plan creation process. This document outlines the template and workflow Cursor uses.

## Plan Creation Workflow

### 1. Initial Assessment

- Analyze user request for scope and complexity
- Identify affected files/modules
- Determine if clarification is needed before proceeding

### 2. Research Phase

- Read relevant source files
- Search codebase for related implementations
- Check existing patterns and conventions
- Review dependencies and constraints

### 3. Plan Structure Template

```markdown
# Plan Name

## Overview

Brief description of what will be implemented

## Steps

1. [Action] - [File/Component] - [What changes]
2. [Action] - [File/Component] - [What changes]
   ...

## Implementation Details

- Specific code changes with file paths
- Dependencies to add/modify
- Configuration updates
- Testing considerations

## Notes

- Edge cases or considerations
- Breaking changes
- Migration steps if needed
```

### 4. Plan Components

**Plan Name**: Concise, action-oriented title (e.g., "Add session timeout handling")

**Overview**: 1-2 sentence summary of the change

**Steps**: Ordered list of actions

- Each step references specific files
- Includes what will change and why
- Cites code locations when referencing existing code

**Implementation Details**:

- File paths with line numbers for edits
- Code snippets showing before/after when relevant
- Dependencies (npm packages, configs)
- Test files to create/modify

**Notes**:

- Risks or trade-offs
- Alternative approaches considered
- Follow-up work if needed

### 5. When User "Vibe Codes"

When user provides vague/high-level feature request:

1. **Clarification Questions** (if needed):
    - Multiple choice options
    - Default assumption if user doesn't respond
    - Max 1-2 questions at a time

2. **Research**:
    - Read ≤5 files if quick context needed
    - Search codebase for similar patterns
    - Check existing implementations

3. **Plan Generation**:
    - Break feature into concrete steps
    - Map each step to specific files/functions
    - Include code references (startLine:endLine:filepath)
    - Specify exact changes, not high-level descriptions

4. **Validation**:
    - Ensure plan is actionable (no TODOs/placeholders)
    - Verify file paths exist
    - Check dependencies are available
    - Confirm plan aligns with codebase patterns

## Plan Execution

After user approves plan:

1. Create todos for each major step
2. Mark first todo as `in_progress`
3. Implement changes sequentially
4. Update todos as work progresses
5. Run tests/builds to verify changes
6. Mark todos complete when done

## Example Plan Flow

**User Request**: "Add retry logic for failed Soniox connections"

**Cursor Process**:

1. Reads `src/xxx/xxxx.ts` to understand connection flow
2. Searches for existing retry patterns in codebase
3. Creates plan with steps:
    - Add retry config to provider options
    - Implement exponential backoff in connection handler
    - Add retry counter to session state
    - Update error handling to trigger retries
    - Add tests for retry scenarios
4. Cites specific functions/lines that need changes
5. Lists exact code modifications needed

## Key Principles

- **Specificity**: Plans reference exact files, functions, line numbers
- **Actionability**: Each step is implementable without ambiguity
- **Completeness**: No placeholders or "figure out later" items
- **Traceability**: Code references link plan to actual implementation locations
- **Proportionality**: Plan complexity matches request complexity
