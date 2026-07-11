---
    name: ESM-only packages crash Vite on Replit
    description: Certain pure-ESM npm packages cause Vite's NAPI bundler to panic (SIGABRT) on this Replit setup
    ---

    ## Rule
    Do not install remark-math, rehype-katex, or katex in this project. They are pure-ESM modules that crash Vite's dependency optimizer with "expect Function, got: Object" NAPI panic.

    **Why:** Vite's pre-bundler uses a Rust/NAPI bridge; certain ESM-only packages trigger a panic in threadsafe_function.rs during the optimizeDeps bundling phase. Even adding them to optimizeDeps.exclude does not prevent the crash.

    **How to apply:** Use Unicode math symbols (x, ÷, sqrt, squared, pi, approx, etc.) for math rendering — the AI already outputs these. Do not attempt to add KaTeX rendering; it breaks the build.
    