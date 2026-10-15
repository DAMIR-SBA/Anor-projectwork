// Runs before first paint: applies the saved theme (cookie) or the OS preference.
const script = `(function(){try{var m=document.cookie.match(/(?:^|; )anor_theme=([^;]+)/);var t=m?m[1]:"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var c=document.documentElement.classList;d?c.add("dark"):c.remove("dark");}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
