---
name: Chat mobile layout
description: How the Bishal's Assistant chat page achieves full-bleed mobile layout without side gaps
---

## Rule
Use `fixed inset-x-0 top-14 bottom-0` on mobile (< sm breakpoint), then `sm:relative sm:inset-auto` to revert on desktop.

**Why:** The `-mx-4 -my-4` negative margin trick causes browser overflow artifacts (visible red edge lines in mobile), and the `-my-4` also shifts the input box slightly off the true viewport bottom. The `fixed` approach positions the chat independently of any parent padding, giving pixel-perfect edge-to-edge fill.

**How to apply:** Only for full-screen panels (chat, full-screen tools). Regular content pages use `p-2 sm:p-5 lg:p-8` padding from the route wrapper.

## Current class string
```
fixed inset-x-0 top-14 bottom-0 flex flex-col overflow-hidden bg-white
sm:relative sm:inset-auto sm:mx-auto sm:mt-0 sm:h-[calc(100vh-10rem)] sm:max-w-4xl sm:rounded-3xl sm:border sm:border-border sm:shadow-sm
```

`top-14` = 56px = height of the mobile sticky header (`h-14`).
