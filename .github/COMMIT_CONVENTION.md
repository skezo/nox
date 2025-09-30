# Commit Message Convention

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification (KARMA format).

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Type

Must be one of the following:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (formatting, white-space, etc)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvement
- **test**: Adding or updating tests
- **build**: Changes to build system or dependencies
- **ci**: Changes to CI configuration
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverts a previous commit

## Scope (optional)

The scope could be anything specifying the place of the commit change:
- `popup`: Changes to the popup UI
- `content`: Changes to content script
- `storage`: Changes to storage utilities
- `styles`: CSS/styling changes
- `manifest`: Changes to manifest.json
- etc.

## Subject

The subject contains a succinct description of the change:
- Use imperative, present tense: "change" not "changed" nor "changes"
- Don't capitalize first letter
- No period (.) at the end

## Examples

### Good commits

```
feat(popup): add dark mode toggle
fix(content): resolve image inversion bug
docs: update installation instructions
style(popup): format code with prettier
refactor(storage): extract domain utilities
perf(content): optimize DOM observer
test(utils): add storage helper tests
build: update dependencies
```

### Bad commits

```
Added feature         # Missing type
fix: Fixed bug.       # Capitalized, has period
feat: stuff           # Too vague
update                # No type, too vague
```

## Validation

Commit messages are validated using [commitlint](https://commitlint.js.org/) with the conventional config. Invalid commits will be rejected automatically by the git hook.