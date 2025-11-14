# Contributing Guide

Thank you for your interest in contributing to this project! This guide will help you get started.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) (latest version)
- Node.js 18+ (for compatibility testing)
- Git

### Getting Started

1. **Fork and Clone**
   ```bash
   git clone https://github.com/angelxmoreno/my-bun-project.git
   cd my-bun-project
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Run the Development Server**
   ```bash
   bun run dev
   ```

## Development Workflow

### Code Quality

We use several tools to maintain code quality:

- **Biome** for linting and formatting
- **TypeScript** for type checking
- **Lefthook** for git hooks
- **Commitlint** for conventional commits

### Before Committing

Run the quality checks:

```bash
# Check TypeScript types and linting
bun run check

# Run tests
bun test

# Auto-fix formatting issues
bun run lint:fix
```

### Git Hooks

This project uses Lefthook to automatically run quality checks:

- **Pre-commit**: Runs linting and type checking
- **Commit-msg**: Validates commit message format

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `test`: Adding or updating tests
- `chore`: Changes to build process, dependencies, etc.

### Examples

```bash
git commit -m "feat: add user authentication"
git commit -m "fix: resolve memory leak in data processing"
git commit -m "docs: update installation instructions"
```

## Pull Request Process

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   - Write your code
   - Add tests if applicable
   - Update documentation

3. **Test Your Changes**
   ```bash
   bun run check
   bun test
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: your descriptive commit message"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

### PR Guidelines

- **Title**: Use conventional commit format
- **Description**: Explain what you changed and why
- **Testing**: Describe how you tested your changes
- **Documentation**: Update docs if needed

## Project Structure

```
.
├── src/                 # Source code
│   └── index.ts        # Main entry point
├── .github/            # GitHub templates and workflows
├── biome.json          # Biome configuration
├── tsconfig.json       # TypeScript configuration
├── lefthook.yml        # Git hooks configuration
├── package.json        # Dependencies and scripts
└── README.md           # Project documentation
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start development server with hot reload |
| `bun run build` | Build the project |
| `bun run test` | Run tests |
| `bun run typecheck` | Type check without emitting |
| `bun run lint` | Lint code |
| `bun run lint:fix` | Fix linting issues |
| `bun run check` | Run type check and linting |

## Need Help?

- 📝 Check existing [issues](https://github.com/angelxmoreno/my-bun-project/issues)
- 💬 Start a [discussion](https://github.com/angelxmoreno/my-bun-project/discussions)
- 📧 Contact maintainers: [angel@angelxmoreno.com](mailto:angel@angelxmoreno.com)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.