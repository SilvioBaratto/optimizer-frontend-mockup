# project-initializer

Angular single-page application scaffolded by [project-initializer](https://github.com/silviobaratto/project-initializer).

## Getting Started

```bash
cd frontend
npm install --legacy-peer-deps
ng serve                               # http://localhost:4200
```

> **Why `--legacy-peer-deps`?** `@angular/build` declares an optional peer dependency on
> `vitest@^4`, but the project pins `vitest@^3`. npm 7+ treats this mismatch as a hard
> `ERESOLVE` error and aborts `npm install`. `--legacy-peer-deps` skips npm's peer-dependency
> check and installs anyway. Safe here: `vitest` is a test-only devDependency and Angular's build
> only optionally peers it, so app build/serve are unaffected.

## License

MIT
