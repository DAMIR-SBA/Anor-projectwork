import "server-only";

type Hook = (userId: string) => Promise<void>;
const hooks: Hook[] = [];

/** Modules register post-login work (guest cart merge, streak checks...) without auth depending on them. */
export function onLogin(hook: Hook) {
  hooks.push(hook);
}

export async function afterLogin(userId: string) {
  // Import side-effect modules that register hooks.
  await import("./login-hooks");
  for (const h of hooks) {
    try {
      await h(userId);
    } catch {
      // Hooks are best-effort and must never block sign-in.
    }
  }
}
