import "server-only";
import { onLogin } from "./session-hooks";
import { mergeGuestCart } from "./cart";

// Registered post-login hooks. Each phase adds its own here.
onLogin(mergeGuestCart);
