# Contributing to llmrix-page

Thank you for considering contributing to **llmrix-page**! We welcome contributions from the community. To ensure consistency, code quality, and maintainability across the project, we enforce standard Git workflows and development guidelines.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Git Standardization Guidelines](#git-standardization-guidelines)
  - [Branch Naming Conventions](#branch-naming-conventions)
  - [Commit Message Specification](#commit-message-specification)
  - [Pull Request Workflow](#pull-request-workflow)
- [Development & Testing](#development--testing)
- [Submitting Issues](#submitting-issues)
- [License](#license)

---

## Code of Conduct

Please maintain a respectful, inclusive, and professional environment when participating in issue discussions, pull requests, and project communications.

---

## Git Standardization Guidelines

To ensure clean history and easy navigation of changes, all contributors must follow our standardized Git rules.

### Branch Naming Conventions

All branch names must use lower-case letters and hyphen-separated words with a predefined prefix:

| Prefix | Description | Example |
| --- | --- | --- |
| `feat/` | A new feature or capability | `feat/rss-feed-export` |
| `fix/` | A bug fix | `fix/katex-inline-parser` |
| `docs/` | Documentation additions or updates | `docs/update-contributing-guide` |
| `refactor/` | Code refactoring without behavioral changes | `refactor/search-index-optimizer` |
| `perf/` | Performance improvement changes | `perf/lazy-load-mermaid` |
| `test/` | Adding or updating unit/integration tests | `test/markdown-frontmatter-parser` |
| `chore/` | Maintenance, dependencies, or build tool updates | `chore/upgrade-vite-6` |

> **Direct pushes to `main` are strictly prohibited.** All changes must be merged via Pull Requests.

---

### Commit Message Specification

Commit messages **must** adhere strictly to the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```text
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

#### Allowed Types

- `feat`: A new feature for the user or application.
- `fix`: A bug fix.
- `docs`: Documentation changes only.
- `style`: Changes that do not affect code logic (formatting, white-space, semi-colons).
- `refactor`: Code changes that neither fix a bug nor add a feature.
- `perf`: A code change that improves performance.
- `test`: Adding missing tests or correcting existing tests.
- `build`: Changes affecting the build system or external dependencies.
- `ci`: Changes to CI configuration scripts and workflows.
- `chore`: Other changes that don't modify `src` or test files.
- `revert`: Reverts a previous commit.

#### Commit Rules & Best Practices

1. **Imperative Mood**: Use imperative present tense in the summary line (e.g., `feat(ui): add dark mode toggle`, NOT `added dark mode toggle` or `adds dark mode`).
2. **First Line Limit**: Limit the first line (header) to **72 characters** or less.
3. **No Capitalization & Period**: Do not capitalize the first letter of the subject, and do not end the subject with a period.
4. **Scope (Optional)**: Specify the component or domain affected, such as `ui`, `parser`, `i18n`, `config`, or `search`.

#### Examples

- `feat(search): implement instant client-side full-text index`
- `fix(katex): prevent overflow on complex LaTeX block equations`
- `docs(readme): add git standardization section and contributing link`
- `chore(deps): bump vite from 6.1.0 to 6.2.0`

---

### Pull Request Workflow

Follow these steps to submit your work:

1. **Fork & Clone**: Fork the repository on GitHub and clone your fork locally.
2. **Create Branch**: Create a feature/fix branch following the naming convention:
   ```bash
   git checkout -b feat/add-table-of-contents
   ```
3. **Develop & Test**: Implement your changes and verify locally with `npm run dev` and `npm run lint`.
4. **Commit Standardized Messages**: Commit using Conventional Commit format:
   ```bash
   git commit -m "feat(toc): generate automatic table of contents for long articles"
   ```
5. **Rebase Main**: Keep your branch up to date with `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
6. **Push Branch**: Push to your fork:
   ```bash
   git push origin feat/add-table-of-contents
   ```
7. **Open PR**: Create a Pull Request against the `main` branch using our standard PR template. Provide a clear description of the changes and link related issues.

---

## Development & Testing

Before submitting a PR, verify that your code compiles cleanly without TypeScript errors:

```bash
# Typecheck TypeScript files
npm run lint

# Verify local development server
npm run dev

# Test production build bundle
npm run build
npm run preview
```

---

## Submitting Issues

When submitting a bug report or requesting a feature:

- **Check Existing Issues**: Search the repository issue tracker first to avoid duplicates.
- **Use Issue Templates**: Fill out all sections in the relevant GitHub Issue template (Bug Report or Feature Request).
- **Provide Reproducible Steps**: Include code samples, screenshots, OS version, and browser details for bug reports.

---

## License

By contributing to this project, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
